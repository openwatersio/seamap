import com.onthegomap.planetiler.reader.SourceFeature;
import java.util.*;
import org.locationtech.jts.geom.*;

/**
 * Turns a light's OSM sector tags into one point per sector and one per sector limit.
 *
 * <p>A sector arc is a symbol, not a measurement: it says the red sector lies over there, and its
 * distance from the light means nothing. S-52 and S-101 accordingly fix it to the display — 20 mm
 * radius, 25 mm for the legs and for the smaller of two overlapping sectors (PresLib 4.0.4,
 * `LIGHTS06`). A line drawn on the ground cannot hold a constant screen size, so the arcs are drawn
 * from sprites and what the tiles carry is the light's position plus the angles to rotate them to.
 */
public class Lights {

  public static class LightGeometry {
    public final Geometry geometry;
    public final Map<String, Object> attrs;

    private LightGeometry(Geometry geometry, Map<String, Object> attrs) {
      this.geometry = geometry;
      this.attrs = attrs;
    }

    /** A coloured sector, drawn as arc sprites rotated to its limits. */
    static LightGeometry sector(
        Point at,
        String color,
        String visibility,
        String range,
        double start,
        double end,
        boolean extended) {
      Map<String, Object> attrs = new HashMap<>();
      attrs.put("subtype", "sector");
      attrs.put("sector_start", start);
      attrs.put("sector_end", end);
      attrs.put("sector_width", width(start, end));
      // the smaller of two overlapping sectors reaches further out so the larger cannot bury it
      if (extended) attrs.put("extended", true);
      if (color != null) attrs.put("color", color);
      if (visibility != null) attrs.put("visibility", visibility);
      if (range != null) attrs.put("range", range);
      return new LightGeometry(at, attrs);
    }

    /** One radial leg, at a bearing where some sector begins or ends. */
    static LightGeometry leg(Point at, double bearing, String range) {
      Map<String, Object> attrs = new HashMap<>();
      attrs.put("subtype", "leg");
      attrs.put("bearing", bearing);
      if (range != null) attrs.put("range", range);
      return new LightGeometry(at, attrs);
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
      results.add(
          LightGeometry.sector(
              center,
              Seamark.resolveLightColor(segment.get("colour")),
              segment.get("visibility"),
              segment.get("range"),
              from,
              to,
              overlappedByWider(from, to, limits)));
    }

    // Adjacent sectors share a limit, and one leg per bearing is enough.
    Map<Double, String> legs = new HashMap<>();
    for (Map<String, String> segment : segments.values()) {
      Double from = parseDoubleOrNull(segment.get("sector_start"));
      Double to = parseDoubleOrNull(segment.get("sector_end"));
      if (from == null || to == null) continue;
      if (from.equals(to) || (from == 0 && to == 360)) continue;
      legs.put(from, segment.get("range"));
      legs.put(to, segment.get("range"));
    }
    for (Map.Entry<Double, String> leg : legs.entrySet()) {
      results.add(LightGeometry.leg(center, leg.getKey(), leg.getValue()));
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
      if (contains(other[0], other[1], from) || contains(from, to, other[0])) return true;
    }
    return false;
  }

  /** Whether a bearing falls inside a sector, going clockwise from its start. */
  private static boolean contains(double from, double to, double bearing) {
    double span = width(from, to);
    double offset = bearing - from;
    while (offset < 0) offset += 360;
    return offset > 0 && offset < span;
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
