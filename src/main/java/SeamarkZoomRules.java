import java.util.*;

/**
 * Defines at which zoom levels different types of seamarks should be visible. This centralizes all
 * zoom-related logic for seamarks.
 */
public class SeamarkZoomRules {

  /**
   * Floors that the three priority tiers get wrong in opposite directions.
   *
   * <p>A floor answers "may this ever appear here", which is a different question from "is there
   * room for it" — that one is answered per cell by {@code cell_rank} and the style's budgets. It
   * has to be honest in both directions: a fish-cleaning table in a z8 tile is bytes nothing will
   * ever draw, and a channel buoy at z4 is Harbour-band furniture on an Overview chart.
   *
   * <p>The short-range aids sit deliberately ahead of the navigational-purpose derivation (z12–14
   * from their band plus SCAMIN steps, see
   * drafts/zoom-rules-ignore-the-navigational-purpose-bands.md): a channel's presence is worth
   * reading at z10. Landmarks are the reverse split — a plain tower is Coastal detail, while
   * conspicuity, a light, or being a wind turbine is what a mariner steers by and earns z6 through
   * the promotions below.
   */
  private static final Map<String, Integer> FLOORS =
      Map.ofEntries(
          Map.entry("landmark", 10),
          Map.entry("small_craft_facility", 14),
          Map.entry("buoy_lateral", 10),
          Map.entry("beacon_lateral", 10),
          Map.entry("buoy_special_purpose", 10),
          Map.entry("beacon_special_purpose", 10),
          Map.entry("mooring", 13),
          Map.entry("fog_signal", 10),
          Map.entry("anchorage", 9));

  /**
   * Get the minimum zoom level for a given seamark based on its type and attributes.
   *
   * @param attrs Map containing seamark attributes (type, category, etc.)
   * @return minimum zoom level (0-14)
   */
  public static int getMinZoom(Map<String, Object> attrs) {
    String type = (String) attrs.get("type");
    String category = (String) attrs.get("category");

    int base;
    if (type == null) {
      base = 8; // default
    } else if (isHazard(type)) {
      base = hazardMinZoom(type, category, attrs);
    } else if (FLOORS.containsKey(type)) {
      base = FLOORS.get(type);
    } else if (isHighPriorityType(type)) {
      // High priority features visible from zoom 4
      base = 4;
    } else if (isMediumHighPriorityType(type)) {
      // Medium-high priority features visible from zoom 6
      base = 6;
    } else {
      base = 8;
    }

    // A conspicuous landmark is part of what a mariner steers by (CONVIS promotes to the
    // STANDARD display category in S-52), a lit one is an aid in its own right (LNDMRK carrying
    // a light takes no SCAMIN), and wind turbines are conspicuous by what they are — the tag is
    // rarely present, and without this a wind farm is empty sea below z10.
    if ("landmark".equals(type)
        && ("conspicuous".equals(attrs.get("seamark:landmark:conspicuity"))
            || attrs.get("light") != null
            || "windmotor".equals(category)
            || "windmill".equals(category))) {
      base = Math.min(base, 6);
    }

    // A light's reach outranks how its host happens to be typed: plenty of real lighthouses are
    // tagged light_minor or sit on plain beacons. The S-52 major-light test is 10 M nominal
    // range (LIGHTS06); 15 M is landfall class. Range only ever promotes, never demotes.
    Object range = attrs.get("light_range");
    if (range instanceof Number n) {
      if (n.doubleValue() >= 15) return Math.min(base, 4);
      if (n.doubleValue() >= 10) return Math.min(base, 6);
    }
    return base;
  }

  /**
   * Floor for a light's sector arcs and legs. The zoom a sector actually draws at is a style
   * threshold — keep this below it so that threshold can move without a planet build.
   */
  public static int getLightMinZoom(String type) {
    return 8;
  }

  private static boolean isHazard(String type) {
    return type.equals("rock") || type.equals("wreck") || type.equals("obstruction");
  }

  /**
   * A hazard's floor comes from its context, not its type. The standards decide this twice over:
   * ECDIS promotes a hazard past every scale threshold only when it contradicts navigable water
   * around it (S-52 UDWHAZ), and S-4 omits near-shore dangers from small-scale charts entirely,
   * because inshore of the natural line the shore itself is the danger (B-404). A rock twenty
   * metres off a coast at overview scale sits inside the coastline's own line weight.
   *
   * <p>Depths unknown are assumed dangerous — S-52 makes the same assumption — so an uncharted
   * offshore hazard keeps the early floor. The style's safety-depth exemption and the cap retention
   * ({@code SeamarkPriority.neverCapped}) still govern what happens above these floors.
   */
  private static int hazardMinZoom(String type, String category, Map<String, Object> attrs) {
    // a wreck someone bothered to categorize as dangerous is chart-worthy at General scale
    if ("wreck".equals(type) && isDangerousWreck(category)) return 6;
    // the shore carries the warning until Approach scale (sampled in Seamark)
    if (Boolean.TRUE.equals(attrs.get("near_shore"))) return 13;
    // Charted below every safety depth the style supports: Coastal detail. A minzoom is a hard
    // floor — no exemption can recover an excluded feature — so this threshold must clear the
    // deepest supported setting, never a smaller "typical" one. The UOC draws the same line:
    // UWTROC loses its all-scales default at VALSOU > 30.
    if (attrs.get("depth") instanceof Number n
        && n.doubleValue() > SeamarkPriority.MAX_SAFETY_DEPTH) return 11;
    // dangerous (or uncharted, assumed so) and clear of the shore: selected for General
    return 8;
  }

  /**
   * Check if a seamark type is high priority (visible from zoom 4). Not light_minor: an unranged
   * minor light is Approach-band furniture, and the range promotion below already lifts the real
   * lighthouses that hide behind that tag.
   */
  private static boolean isHighPriorityType(String type) {
    return type.equals("light_major")
        || type.startsWith("separation_")
        || type.equals("platform")
        || isRestrictedArea(type);
  }

  /** Check if a seamark type is medium-high priority (visible from zoom 6). */
  private static boolean isMediumHighPriorityType(String type) {
    return type.contains("_safe_water")
        || type.contains("_isolated_danger")
        || type.contains("_cardinal");
  }

  /** Check if a type represents a restricted area. */
  private static boolean isRestrictedArea(String type) {
    return Arrays.asList(
            "cable_area",
            "fairway",
            "inshore_traffic_zone",
            "marine_farm",
            "military_area",
            "protected_area",
            "restricted_area",
            "production_area",
            "pipeline_area",
            "precautionary_area",
            "seaplane_landing_area",
            "submarine_transit_lane")
        .contains(type);
  }

  /** Check if a wreck category is considered dangerous. */
  private static boolean isDangerousWreck(String category) {
    return Arrays.asList("dangerous", "mast_showing").contains(category);
  }
}
