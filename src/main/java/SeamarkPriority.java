import java.util.Map;
import java.util.Set;

/**
 * Which features compete with each other for space, and which of them wins.
 *
 * <p>A presentation family is a budget. The chart spends its symbols family by family, so a harbour
 * is never displaced by the forty buoys around it — while a budget per raw {@code seamark:type}
 * would still spend dozens of marks in one cell. {@link #rank} orders features within a family,
 * ascending as importance falls, and feeds both Planetiler's geographic selection and MapLibre's
 * collision sort key.
 *
 * <p>Rank is static. Whether a hazard is critical depends on the mariner's safety depth, which only
 * the style knows; that decision stays there.
 */
public class SeamarkPriority {

  public static final String HAZARD = "hazard";
  public static final String MAJOR_AID = "major_aid";
  public static final String MINOR_AID = "minor_aid";
  public static final String HARBOUR = "harbour";
  public static final String STRUCTURE = "structure";
  public static final String FACILITY = "facility";

  /** Tier width. An instance modifier is 0..9999, so tiers never interleave. */
  private static final int TIER = 10000;

  /** Instance modifier for a feature with nothing to rank it by. */
  private static final int MIDDLE = 5000;

  private static final Set<String> HAZARD_TYPES = Set.of("rock", "wreck", "obstruction");

  /** The marks a chart keeps longest: they say where the safe water is. */
  private static final Set<String> MAJOR_AID_TYPES =
      Set.of(
          "light_major",
          "light_vessel",
          "light_float",
          "buoy_safe_water",
          "beacon_safe_water",
          "buoy_isolated_danger",
          "beacon_isolated_danger",
          "buoy_cardinal",
          "beacon_cardinal");

  /** The harbour categories `harhours` in the style actually draws a badge for. */
  private static final Set<String> BADGED_HARBOURS = Set.of("marina", "fishing");

  private static final Set<String> MINOR_AID_TYPES =
      Set.of("light_minor", "light", "daymark", "fog_signal", "notice");

  /**
   * S-52's major-light test (LIGHTS06), the same threshold {@link SeamarkZoomRules} promotes on.
   */
  private static final double MAJOR_LIGHT_RANGE = 10;

  /**
   * Hazard severity, most dangerous first. The empty band is the untagged case, and it sits above
   * the provably harmless one in both arrays: an undescribed hazard might be any of the bands over
   * it. Obstructions carry no water level and land in that band too.
   */
  private static final String[] ROCK_SEVERITY = {"submerged", "awash", "covers", "", "dry"};

  private static final String[] WRECK_SEVERITY = {
    "dangerous", "mast_showing", "hull_showing", "distributed_remains", "", "non-dangerous"
  };

  /**
   * Band spacing, wide enough for the severity tiebreak and narrow enough to stay inside a tier.
   */
  private static final int BAND = 1500;

  /**
   * Depth bands in metres, shallowest first. Depth decides a hazard's rank before anything else: an
   * invisible rock in 20 m cannot hurt a small craft, and a covering rock in 1 m can.
   */
  private static final int[] DEPTH_BANDS = {2, 5, 10, 20};

  /**
   * The deepest safety depth this chart supports. A hazard that could sit at or above a mariner's
   * safety depth is never dropped from a tile, because only the style knows what that depth is and
   * it cannot exempt a feature it was never sent. Raising this keeps more hazards in every tile.
   * The style clamps its safety option to the mirrored constant in `style/layers/visibility.ts`;
   * keep the two in step.
   */
  public static final int MAX_SAFETY_DEPTH = 30;

  /** Which budget this feature draws from. */
  public static String family(Map<String, Object> attrs) {
    String type = (String) attrs.get("type");
    if (type == null) return STRUCTURE;
    if (HAZARD_TYPES.contains(type)) return HAZARD;
    if (MAJOR_AID_TYPES.contains(type) || isMajorLight(attrs)) return MAJOR_AID;
    if (MINOR_AID_TYPES.contains(type) || type.startsWith("buoy_") || type.startsWith("beacon_"))
      return MINOR_AID;
    // Only a marina or a fishing harbour gets a badge. Ranking the ferry berths and naval basins
    // alongside them spends a budget on features nothing draws, and pushes the marinas out of it.
    // Set.of rejects null lookups, and an uncategorized harbour is common — guard before asking.
    if (type.equals("harbour")) {
      Object category = attrs.get("category");
      return category != null && BADGED_HARBOURS.contains(category) ? HARBOUR : STRUCTURE;
    }
    if (type.equals("small_craft_facility")) return FACILITY;
    // An unrecognised type competes with piles and cranes rather than with aids to navigation.
    // Safe because every hazard class is named above; revisit if a hazard type is ever added
    // without touching HAZARD_TYPES.
    return STRUCTURE;
  }

  /** Importance within the family, ascending as importance falls. */
  public static int rank(Map<String, Object> attrs) {
    String family = family(attrs);
    return tier(family, attrs) * TIER + modifier(family, attrs);
  }

  private static int tier(String family, Map<String, Object> attrs) {
    return switch (family) {
      case MAJOR_AID -> 0;
      case HAZARD -> 1;
      case HARBOUR -> 2;
      case FACILITY -> 4;
      // a beacon holds its charted position; a buoy can drag off station (S-4 B-455.3)
      case MINOR_AID -> ((String) attrs.get("type")).startsWith("buoy_") ? 3 : 2;
      // CONVIS is what a mariner steers by, and S-52 promotes it to the STANDARD display category
      default -> "conspicuous".equals(attrs.get("seamark:landmark:conspicuity")) ? 2 : 3;
    };
  }

  private static int modifier(String family, Map<String, Object> attrs) {
    return switch (family) {
      case HAZARD -> hazardSeverity(attrs);
      // structures rank by reach too: a lit mast outranks an unlit one, and the unlit
      // (no range) case already falls back to MIDDLE
      case MAJOR_AID, MINOR_AID, STRUCTURE -> lightReach(attrs);
      case HARBOUR -> harbourDraw(attrs);
      default -> MIDDLE;
    };
  }

  /**
   * Severity band first, then depth within it — shallower is worse. Drying heights arrive negative
   * and clamp to 0, which only ties them with a hazard at chart datum inside an already-dry band.
   */
  private static int hazardSeverity(Map<String, Object> attrs) {
    return depthBand(attrs) * BAND + severityBand(attrs) * 250;
  }

  /**
   * Shallowest first, with the unknown band above provably deep water — an undescribed hazard might
   * be any of the bands over it.
   */
  private static int depthBand(Map<String, Object> attrs) {
    if (coalesce(attrs, "depth", "seabed_depth") == null) return DEPTH_BANDS.length;
    int metres = depth(attrs);
    for (int i = 0; i < DEPTH_BANDS.length; i++) {
      if (metres <= DEPTH_BANDS[i]) return i;
    }
    return DEPTH_BANDS.length + 1;
  }

  /** How visible the hazard is at the depth it sits at: what you cannot see is worse. */
  private static int severityBand(Map<String, Object> attrs) {
    boolean isWreck = "wreck".equals(attrs.get("type"));
    String[] bands = isWreck ? WRECK_SEVERITY : ROCK_SEVERITY;
    Object value =
        isWreck
            ? attrs.get("category")
            : coalesce(attrs, "seamark:rock:water_level", "seamark:water_level", "water_level");
    String severity = value == null ? "" : value.toString();
    int band = 0;
    while (band < bands.length && !bands[band].equals(severity)) band++;
    return band == bands.length ? indexOf(bands, "") : band;
  }

  /**
   * A feature the tile must carry whatever its rank, because the style may still have to draw it.
   * Today that is any hazard shallow enough — or unsurveyed enough — to fall inside a supported
   * safety depth; {@code hazards()} in the style exempts exactly these from its budget.
   */
  public static boolean neverCapped(Map<String, Object> attrs) {
    Object type = attrs.get("type");
    if (type == null || !HAZARD_TYPES.contains(type)) return false;
    Object known = coalesce(attrs, "depth", "seabed_depth");
    return !(known instanceof Number n) || n.doubleValue() <= MAX_SAFETY_DEPTH;
  }

  private static int indexOf(String[] bands, String value) {
    for (int i = 0; i < bands.length; i++) {
      if (bands[i].equals(value)) return i;
    }
    return bands.length - 1;
  }

  /**
   * Longer reach ranks higher, and any known reach outranks none — an unlit mark has nothing to
   * rank it by, so it sits with the rest of the unranked at {@link #MIDDLE}.
   */
  private static int lightReach(Map<String, Object> attrs) {
    Object range = attrs.get("light_range");
    if (!(range instanceof Number n)) return MIDDLE;
    return MIDDLE - 1 - clamp((int) Math.round(n.doubleValue()), 0, 49) * 100;
  }

  /**
   * Which harbour a cell keeps when it can only keep one. A marina is what a small craft is looking
   * for, and a harbour nobody has named is the one worth losing.
   */
  private static int harbourDraw(Map<String, Object> attrs) {
    int rank = "marina".equals(attrs.get("category")) ? 0 : 2000;
    return rank + (attrs.get("name") == null ? 1000 : 0);
  }

  private static boolean isMajorLight(Map<String, Object> attrs) {
    return attrs.get("light_range") instanceof Number n && n.doubleValue() >= MAJOR_LIGHT_RANGE;
  }

  /** Surveyed depth when tagged, else the seabed sampled around the hazard. Never charted. */
  private static int depth(Map<String, Object> attrs) {
    Object value = coalesce(attrs, "depth", "seabed_depth");
    return value instanceof Number n ? Math.round(n.floatValue()) : 0;
  }

  private static int clamp(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }

  private static Object coalesce(Map<String, Object> attrs, String... keys) {
    for (String key : keys) {
      Object value = attrs.get(key);
      if (value != null) return value;
    }
    return null;
  }
}
