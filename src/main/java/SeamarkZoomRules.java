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
   * room for it" — that one is answered per cell by {@code cell_rank} and the style's budgets. Once
   * density has its own answer a floor can be generous, so a wind farm reads as a few marks at z6
   * instead of vanishing below z8. It also has to be honest in the other direction: a fish-cleaning
   * table in a z8 tile is bytes nothing will ever draw.
   */
  private static final Map<String, Integer> FLOORS =
      Map.of(
          "landmark", 6,
          "small_craft_facility", 14);

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
    } else if (FLOORS.containsKey(type)) {
      base = FLOORS.get(type);
    } else if (isHighPriorityType(type)) {
      // High priority features visible from zoom 4
      base = 4;
    } else if (isMediumHighPriorityType(type, category)) {
      // Medium-high priority features visible from zoom 6
      base = 6;
    } else {
      base = 8;
    }

    // A conspicuous landmark is part of what a mariner steers by (CONVIS promotes to the
    // STANDARD display category in S-52): visible from z6 like the other promoted marks.
    if ("landmark".equals(type)
        && "conspicuous".equals(attrs.get("seamark:landmark:conspicuity"))) {
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
   * Get the minimum zoom level for light sectors/geometries. Sector arcs draw at a fixed ground
   * radius (0.4-0.7 NM), which is sub-pixel below ~z10 — carrying the geometry in lower-zoom tiles
   * is dead weight the style never draws.
   */
  public static int getLightMinZoom(String type) {
    return 10;
  }

  /** Check if a seamark type is high priority (visible from zoom 4). */
  private static boolean isHighPriorityType(String type) {
    return type.equals("light_major")
        || type.equals("light_minor")
        || type.startsWith("separation_")
        || type.equals("platform")
        || type.equals("fog_signal")
        || isRestrictedArea(type);
  }

  /** Check if a seamark type is medium-high priority (visible from zoom 6). */
  private static boolean isMediumHighPriorityType(String type, String category) {
    if (type.contains("_safe_water")
        || type.contains("_isolated_danger")
        || type.contains("_cardinal")) {
      return true;
    }

    // Dangerous wrecks
    if (type.equals("wreck") && isDangerousWreck(category)) {
      return true;
    }

    return false;
  }

  /** Check if a type represents a restricted area. */
  private static boolean isRestrictedArea(String type) {
    return Arrays.asList(
            "anchorage",
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
