import com.onthegomap.planetiler.geo.GeoUtils;
import com.onthegomap.planetiler.reader.SourceFeature;
import java.util.*;
import org.locationtech.jts.geom.*;

/**
 * Creates light sector geometries (Arcs and Rays) from OSM Seamark data. - Light Arcs: Arcs for
 * each color sector - Light Rays: Rays at sector boundaries
 */
public class Lights {

  private static final GeometryFactory GEOMETRY_FACTORY = new GeometryFactory();
  // In Planetiler normalized coordinates: 1.0 = entire world width
  private static final double WORLD_WIDTH_METERS = 2.0 * Math.PI * 6378137.0; // ~40075017m
  // Radii in meters (derived from nautical miles * 1852). Legs extend just past the arc,
  // in S-52's proportion: a 20 mm arc with 25 mm legs (LIGHTS06), not far beyond it.
  private static final double MINOR_ARC_RADIUS = 0.4 * 1852; // ~741m
  private static final double MAJOR_ARC_RADIUS = 0.7 * 1852; // ~1296m
  private static final double MINOR_RAY_RADIUS = 0.5 * 1852; // ~926m
  private static final double MAJOR_RAY_RADIUS = 0.875 * 1852; // ~1620m
  // 1° puts vertices ~13-23m apart at these radii — well under a pixel at the zooms arcs draw
  private static final double ARC_STEP_DEGREES = 1.0;

  public static class LightGeometry {
    public final Geometry geometry;
    public final Map<String, Object> attrs;

    public LightGeometry(
        String subtype,
        String color,
        String visibility,
        String range,
        Double sectorStart,
        Double sectorEnd,
        Geometry geometry) {
      this.geometry = geometry;
      this.attrs = new HashMap<>();
      attrs.put("subtype", subtype);
      if (color != null) attrs.put("color", color);
      if (visibility != null) attrs.put("visibility", visibility);
      if (range != null) attrs.put("range", range);
      if (sectorStart != null) attrs.put("sector_start", sectorStart);
      if (sectorEnd != null) attrs.put("sector_end", sectorEnd);
    }
  }

  /**
   * Extracts all light geometries (Arcs + Rays) from OSM tags.
   *
   * @param sf SourceFeature containing OSM Tags
   * @param seamarkType The seamark:type (e.g. "light_minor" or "light_major")
   * @return List of LightGeometry objects (Arcs + Rays)
   */
  public static List<LightGeometry> extractLightGeometries(SourceFeature sf, String seamarkType) {
    List<LightGeometry> results = new ArrayList<>();
    Map<Integer, Map<String, String>> segments = parseLightSegments(sf.tags());
    if (segments.isEmpty()) return results;

    // The S-52 major-light test is a nominal range of 10 M (LIGHTS06), regardless of how the
    // host feature happens to be typed.
    double maxRange = 0;
    for (Map<String, String> segment : segments.values()) {
      double r = parseDoubleOrDefault(segment.get("range"), 0);
      if (r > maxRange) maxRange = r;
    }
    boolean isMajor = "light_major".equals(seamarkType) || maxRange >= 10;
    double arcRadius = isMajor ? MAJOR_ARC_RADIUS : MINOR_ARC_RADIUS;
    double rayRadius = isMajor ? MAJOR_RAY_RADIUS : MINOR_RAY_RADIUS;
    Point center;
    try {
      center = sf.worldGeometry().getCentroid();
    } catch (Exception e) {
      return results;
    }
    // One normalized world unit spans WORLD_WIDTH_METERS·cos(lat) ground meters, so an
    // uncorrected radius shrinks toward the poles — half size at 60°N, where sector lights
    // are densest.
    double lat = GeoUtils.getWorldLat(center.getY());
    double metersPerWorldUnit = WORLD_WIDTH_METERS * Math.cos(Math.toRadians(lat));

    // 1. Create Arc geometries for each sector that has real limits. A light without sector
    // limits — or spanning the full circle — is an all-round light: it gets a flare, never an
    // arc (S-52 LIGHTS06; S-101 prohibits encoding all-round lights as sectored).
    for (Map.Entry<Integer, Map<String, String>> entry : segments.entrySet()) {
      Map<String, String> segment = entry.getValue();
      Double sectorStart = parseDoubleOrNull(segment.get("sector_start"));
      Double sectorEnd = parseDoubleOrNull(segment.get("sector_end"));
      if (sectorStart == null || sectorEnd == null) continue;
      if (sectorStart.equals(sectorEnd) || (sectorStart == 0 && sectorEnd == 360)) continue;
      Geometry arc = createLightArc(center, sectorStart, sectorEnd, arcRadius, metersPerWorldUnit);
      results.add(
          new LightGeometry(
              "arc",
              Seamark.resolveLightColor(segment.get("colour")),
              segment.get("visibility"),
              segment.get("range"),
              sectorStart,
              sectorEnd,
              arc));
    }

    // 2. Create Ray geometries at explicitly-defined sector boundaries
    Map<Double, String> angleToRange = new HashMap<>();
    for (Map<String, String> segment : segments.values()) {
      Double sectorStart = parseDoubleOrNull(segment.get("sector_start"));
      Double sectorEnd = parseDoubleOrNull(segment.get("sector_end"));
      if (sectorStart == null || sectorEnd == null) continue;
      angleToRange.put(sectorStart, segment.get("range"));
      angleToRange.put(sectorEnd, segment.get("range"));
    }
    for (Map.Entry<Double, String> entry : angleToRange.entrySet()) {
      LineString ray = createLightRay(center, entry.getKey(), rayRadius, metersPerWorldUnit);
      results.add(new LightGeometry("ray", null, null, entry.getValue(), null, null, ray));
    }

    return results;
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

  private static LineString createLightArc(
      Point center, double from, double to, double radiusMeters, double metersPerWorldUnit) {
    while (to < from) to += 360;
    double radius = radiusMeters / metersPerWorldUnit;
    List<Coordinate> coords = new ArrayList<>();
    // sector bearings are seaward (from the vessel toward the light), hence the sign flip;
    // "fixing" the negative sin is the classic sector-rendering bug
    for (double d = from; d < to + ARC_STEP_DEGREES; d += ARC_STEP_DEGREES) {
      double rad = Math.toRadians(Math.min(d, to));
      double x = center.getX() - radius * Math.sin(rad);
      double y = center.getY() + radius * Math.cos(rad);
      coords.add(new Coordinate(x, y));
    }
    return GEOMETRY_FACTORY.createLineString(coords.toArray(new Coordinate[0]));
  }

  private static LineString createLightRay(
      Point center, double deg, double radiusMeters, double metersPerWorldUnit) {
    double rad = Math.toRadians(deg);
    double radius = radiusMeters / metersPerWorldUnit;
    double x = center.getX() - radius * Math.sin(rad);
    double y = center.getY() + radius * Math.cos(rad);
    Coordinate[] coords = new Coordinate[] {center.getCoordinate(), new Coordinate(x, y)};
    return GEOMETRY_FACTORY.createLineString(coords);
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
