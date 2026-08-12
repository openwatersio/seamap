import com.onthegomap.planetiler.geo.GeoUtils;
import com.onthegomap.planetiler.reader.SourceFeature;
import java.util.*;
import org.locationtech.jts.geom.*;

/**
 * Turns a light's OSM sector tags into arc and leg lines on the ground.
 *
 * <p>S-52 fixes the arc to the display — 20 mm radius whatever the scale (PresLib 4.0.4,
 * `LIGHTS06`) — but on a chart the reader zooms, a display-fixed figure is the one thing moving
 * against everything else. So the arc is ordinary ground geometry at a nominal radius, scaling with
 * the chart like its neighbours, and the style stops drawing it at the zoom where the radius
 * outgrows the screen. The radius is a drawing size, not the light's range: nobody navigates by
 * being inside the arc, and the range is stated in the characteristic.
 */
public class Lights {

  // In Planetiler normalized coordinates: 1.0 = entire world width
  private static final double WORLD_WIDTH_METERS = 2.0 * Math.PI * 6378137.0; // ~40075017m
  // Nominal radii in metres (nautical miles × 1852): drawing sizes, chosen so an arc reads as
  // decoration on its light at the zooms sectors are used.
  private static final double MINOR_ARC_RADIUS = 0.4 * 1852; // ~741m
  private static final double MAJOR_ARC_RADIUS = 0.7 * 1852; // ~1296m
  // Legs run past the arc, and the smaller of two overlapping sectors reaches the same distance
  // so the wider cannot bury it — both in S-52's 25 mm to 20 mm proportion (`LIGHTS06`).
  private static final double EXTENDED_SCALE = 1.25;
  // 1° puts vertices ~13-23m apart at these radii — well under a pixel at the zooms arcs draw
  private static final double ARC_STEP_DEGREES = 1.0;

  private static final GeometryFactory GEOMETRY_FACTORY = new GeometryFactory();

  public static class LightGeometry {
    public final Geometry geometry;
    public final Map<String, Object> attrs;

    private LightGeometry(Geometry geometry, Map<String, Object> attrs) {
      this.geometry = geometry;
      this.attrs = attrs;
    }

    /** A coloured sector, drawn as an arc at the light's nominal radius. */
    static LightGeometry sector(
        Geometry arc, String color, String visibility, String range, boolean extended) {
      Map<String, Object> attrs = new HashMap<>();
      attrs.put("subtype", "sector");
      if (extended) attrs.put("extended", true);
      if (color != null) attrs.put("color", color);
      if (visibility != null) attrs.put("visibility", visibility);
      if (range != null) attrs.put("range", range);
      return new LightGeometry(arc, attrs);
    }

    /** One radial leg, at a bearing where some sector begins or ends. */
    static LightGeometry leg(Geometry line, String range) {
      Map<String, Object> attrs = new HashMap<>();
      attrs.put("subtype", "leg");
      if (range != null) attrs.put("range", range);
      return new LightGeometry(line, attrs);
    }
  }

  /** Sector width in degrees, going clockwise from start to end. */
  private static double width(double start, double end) {
    double w = end - start;
    while (w <= 0) w += 360;
    return w;
  }

  /**
   * Every sector of a light, plus the legs at its limits. A light with no sector limits — or one
   * spanning the full circle — is an all-round light: it gets a flare and never an arc (S-52
   * `LIGHTS06`; S-101 prohibits encoding an all-round light as sectored).
   */
  public static List<LightGeometry> extractLightGeometries(SourceFeature sf, String seamarkType) {
    List<LightGeometry> results = new ArrayList<>();
    Map<Integer, Map<String, String>> segments = parseLightSegments(sf.tags());
    if (segments.isEmpty()) return results;

    Point center;
    try {
      center = sf.worldGeometry().getCentroid();
    } catch (Exception e) {
      return results;
    }

    // The S-52 major-light test is a nominal range of 10 M (`LIGHTS06`), regardless of how the
    // host feature happens to be typed.
    double maxRange = 0;
    for (Map<String, String> segment : segments.values()) {
      maxRange = Math.max(maxRange, parseDoubleOrDefault(segment.get("range"), 0));
    }
    boolean isMajor = "light_major".equals(seamarkType) || maxRange >= 10;
    double arcRadius = isMajor ? MAJOR_ARC_RADIUS : MINOR_ARC_RADIUS;

    // One normalized world unit spans WORLD_WIDTH_METERS·cos(lat) ground meters, so an
    // uncorrected radius shrinks toward the poles — half size at 60°N, where sector lights
    // are densest.
    double lat = GeoUtils.getWorldLat(center.getY());
    double metersPerWorldUnit = WORLD_WIDTH_METERS * Math.cos(Math.toRadians(lat));

    List<double[]> limits = new ArrayList<>();
    for (Map<String, String> segment : segments.values()) {
      Double from = parseDoubleOrNull(segment.get("sector_start"));
      Double to = parseDoubleOrNull(segment.get("sector_end"));
      if (from == null || to == null) continue;
      if (from.equals(to) || (from == 0 && to == 360)) continue;
      limits.add(new double[] {from, to});
    }
    if (limits.isEmpty()) return results;

    for (Map<String, String> segment : segments.values()) {
      Double from = parseDoubleOrNull(segment.get("sector_start"));
      Double to = parseDoubleOrNull(segment.get("sector_end"));
      if (from == null || to == null) continue;
      if (from.equals(to) || (from == 0 && to == 360)) continue;
      boolean extended = overlappedByWider(from, to, limits);
      double radius = (extended ? EXTENDED_SCALE : 1) * arcRadius / metersPerWorldUnit;
      results.add(
          LightGeometry.sector(
              createArc(center, from, to, radius),
              Seamark.resolveLightColor(segment.get("colour")),
              segment.get("visibility"),
              segment.get("range"),
              extended));
    }

    // Adjacent sectors share a limit, and one leg per bearing is enough.
    Map<Double, String> legs = new HashMap<>();
    for (double[] limit : limits) {
      for (double bearing : limit) legs.putIfAbsent(bearing, null);
    }
    for (Map<String, String> segment : segments.values()) {
      Double from = parseDoubleOrNull(segment.get("sector_start"));
      Double to = parseDoubleOrNull(segment.get("sector_end"));
      if (from == null || to == null) continue;
      String range = segment.get("range");
      if (range == null) continue;
      legs.put(from, range);
      legs.put(to, range);
    }
    double legRadius = EXTENDED_SCALE * arcRadius / metersPerWorldUnit;
    for (Map.Entry<Double, String> leg : legs.entrySet()) {
      results.add(LightGeometry.leg(createLeg(center, leg.getKey(), legRadius), leg.getValue()));
    }

    return results;
  }

  /**
   * Whether some other sector of the same light overlaps this one and is wider. S-52 gives the
   * smaller of an overlapping pair the extended radius so the wider one cannot hide it (`LIGHTS06`,
   * Figure 9).
   */
  private static boolean overlappedByWider(double from, double to, List<double[]> limits) {
    double own = width(from, to);
    for (double[] other : limits) {
      if (other[0] == from && other[1] == to) continue;
      if (width(other[0], other[1]) <= own) continue;
      if (overlaps(from, to, other[0], other[1])) return true;
    }
    return false;
  }

  /**
   * Whether two sectors' interiors intersect on the circle. A nested pair sharing a start or end
   * bearing overlaps — testing only for a limit strictly inside the other sector misses exactly
   * that case — while merely adjacent sectors, meeting at a limit with no shared arc, do not.
   */
  private static boolean overlaps(double aFrom, double aTo, double bFrom, double bTo) {
    return offset(bFrom, aFrom) < width(aFrom, aTo) || offset(aFrom, bFrom) < width(bFrom, bTo);
  }

  /** Degrees from one bearing clockwise to another, in [0, 360). */
  private static double offset(double bearing, double origin) {
    double d = bearing - origin;
    while (d < 0) d += 360;
    while (d >= 360) d -= 360;
    return d;
  }

  // Sector bearings are seaward — from the vessel toward the light — hence the sign flip in both
  // helpers; "fixing" the negative sin is the classic sector-rendering bug (S-52: "Do not forget
  // to reverse the sector values (+/- 180 degrees) since the values are given from seaward").

  private static LineString createArc(Point center, double from, double to, double radius) {
    double end = from + width(from, to);
    List<Coordinate> coords = new ArrayList<>();
    for (double d = from; d < end + ARC_STEP_DEGREES; d += ARC_STEP_DEGREES) {
      double rad = Math.toRadians(Math.min(d, end));
      double x = center.getX() - radius * Math.sin(rad);
      double y = center.getY() + radius * Math.cos(rad);
      coords.add(new Coordinate(x, y));
    }
    return GEOMETRY_FACTORY.createLineString(coords.toArray(new Coordinate[0]));
  }

  private static LineString createLeg(Point center, double bearing, double radius) {
    double rad = Math.toRadians(bearing);
    double x = center.getX() - radius * Math.sin(rad);
    double y = center.getY() + radius * Math.cos(rad);
    return GEOMETRY_FACTORY.createLineString(
        new Coordinate[] {center.getCoordinate(), new Coordinate(x, y)});
  }

  private static Map<Integer, Map<String, String>> parseLightSegments(Map<String, Object> tags) {
    Map<Integer, Map<String, String>> segments = new HashMap<>();
    for (Map.Entry<String, Object> entry : tags.entrySet()) {
      String key = entry.getKey();
      if (!key.startsWith("seamark:light:")) continue;
      String[] parts = key.substring("seamark:light:".length()).split(":", 2);
      if (parts.length != 2) continue;
      try {
        int segmentNum = Integer.parseInt(parts[0]);
        String attrName = parts[1];
        String attrValue = entry.getValue() != null ? entry.getValue().toString() : null;
        segments.computeIfAbsent(segmentNum, k -> new HashMap<>()).put(attrName, attrValue);
      } catch (NumberFormatException ignored) {
        System.err.println(
            "Warning: Could not parse light segment number from tag: "
                + key
                + " = "
                + entry.getValue());
      }
    }

    return segments;
  }

  private static double parseDoubleOrDefault(String str, double defaultValue) {
    Double v = parseDoubleOrNull(str);
    return v != null ? v : defaultValue;
  }

  private static Double parseDoubleOrNull(String str) {
    try {
      return Double.parseDouble(str);
    } catch (Exception e) {
      return null;
    }
  }
}
