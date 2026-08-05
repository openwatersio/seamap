import java.util.*;
import com.onthegomap.planetiler.util.Parse;
import com.onthegomap.planetiler.reader.SourceFeature;
import org.locationtech.jts.geom.Coordinate;

public class Seamark {

  public static DepthCalculator depthCalculator = null;

  /** Import provenance: S-57 long names and source strings. Nothing renders them. */
  private static final Set<String> TAG_DENYLIST = Set.of("seamark:lnam", "seamark:source");

  /** Key prefixes copied verbatim: every seamark attribute, localized names, fuel offerings. */
  private static final String[] TAG_PREFIXES = {"seamark:", "name:", "fuel:"};

  /**
   * Plain OSM keys worth carrying. `name` is deliberately absent — the derived `name` attribute
   * already coalesces it with the seamark-specific variants.
   */
  private static final Set<String> TAG_WHITELIST = Set.of(
    // water_level and restriction are the unprefixed fallbacks the style resolves against
    "water_level", "restriction",
    "ref", "description", "note", "access", "fee", "charge", "toll", "opening_hours",
    "operator", "operator:wikidata", "wikidata", "wikipedia", "vhf", "direction", "distance",
    "maxspeed", "maxstay", "maxdraft", "maxlength", "maxwidth", "maxheight", "maxweight",
    "vessel", "vessel:mmsi", "wreck:type", "wreck:date_sunk", "building:height", "highway");

  /**
   * Plain OSM tags that stand in for a seamark, as {key, value, type, category}. Checked only
   * after the seamark:* extraction above, so explicit seamark tagging always wins.
   */
  private static final String[][] PLAIN_TAG_FEATURES = {
    {"waterway", "fuel", "small_craft_facility", "fuel_station"},
    {"waterway", "water_point", "small_craft_facility", "water_tap"},
    {"waterway", "sanitary_dump_station", "small_craft_facility", "pump-out"},
    {"waterway", "boatyard", "small_craft_facility", "boatyard"},
    {"waterway", "boat_lift", "small_craft_facility", "boat_hoist"},
    {"waterway", "access_point", "small_craft_facility", "access_point"},
    {"amenity", "boat_storage", "small_craft_facility", "boat_storage"},
    {"amenity", "fish_cleaning", "small_craft_facility", "fish_cleaning"},
    {"industrial", "shipyard", "small_craft_facility", "boatyard"},
    {"leisure", "fishing", "small_craft_facility", "fishing"},
    {"natural", "beach", "small_craft_facility", "beach"},
    {"club", "sailing", "small_craft_facility", "nautical_club"},
    {"club", "yachting", "small_craft_facility", "nautical_club"},
    {"club", "boat", "small_craft_facility", "nautical_club"},
    {"scout", "sea", "small_craft_facility", "nautical_club"},
    // Paddlers launch from a bank, not a ramp; the seamark vocabulary has no word for it.
    {"canoe", "put_in", "small_craft_facility", "access_point"},
    {"canoe", "egress", "small_craft_facility", "access_point"},
    {"canoe", "put_in;egress", "small_craft_facility", "access_point"},
    {"emergency", "water_rescue", "rescue_station", null},
  };

  /**
   * Extracts the attributes a seamark feature carries into the tiles: the derived values a style
   * expression cannot compute (resolved across type-specific keys, sanitized, IALA defaults, the
   * light abbreviation, sampled depth) plus the source tags verbatim.
   *
   * @param sf SourceFeature containing OSM Tags
   * @return attribute map, empty when the feature is not a seamark
   */
  public static Map<String, Object> extractSeamarkAttributes(SourceFeature sf) {
    var tags = sf.tags();
    Map<String, Object> attrs = new LinkedHashMap<>();

    // handle correct tagged seamark objects:
    if (value(tags, "seamark:type") != null) {
      String type = value(tags, "seamark:type");
      attrs.put("type", type);
      attrs.put("name", coalesce(seamarkValue(tags, type, "name"), value(tags, "seamark:name"), value(tags, "name")));
      attrs.put("category", getSeamarkCategory(tags, type));
      attrs.put("function", coalesce(seamarkValue(tags, type, "function"), value(tags, "seamark:function"), value(tags, "function")));
      attrs.put("shape", seamarkValue(tags, type, "shape"));
      attrs.put("color", replaceSemiWithUnderscore(seamarkValue(tags, type, "colour")));
      attrs.put("color_pattern", seamarkValue(tags, type, "colour_pattern"));
      attrs.put("radar_reflector", radarReflector(tags, type));
      attrs.put("radio_station", collectTags(tags, "radio_station"));
      attrs.put("light", seamarkLightAbbr(tags));
      attrs.put("topmark_color", replaceSemiWithUnderscore(coalesce(seamarkValue(tags, "topmark", "colour"), seamarkValue(tags, "daymark", "colour"))));
      attrs.put("topmark_color_pattern", replaceSemiWithUnderscore(coalesce(seamarkValue(tags, "topmark", "colour_pattern"))));
      attrs.put("topmark_shape", sanitizeTopmarkShape(coalesce(seamarkValue(tags, "topmark", "shape"), seamarkValue(tags, "daymark", "shape"))));
      attrs.put("depth", Parse.parseDoubleOrNull(coalesce(seamarkValue(tags, type, "depth"), value(tags, "seamark:depth"), value(tags, "depth"))));

    // create semarks from normal OSM tags:
    } else if ("ferry".equals(value(tags, "route")) && sf.canBeLine()) {
      attrs.put("type", "ferry_route");
      attrs.put("name", value(tags, "name"));    } else if ("anchor".equals(value(tags, "waterway:sign"))) {
      attrs.put("type", "anchorage");
      attrs.put("name", value(tags, "name"));    } else if ("cable".equals(value(tags, "power")) && "underwater".equals(value(tags, "location")) && sf.canBeLine()) {
      attrs.put("type", "cable_submarine");
      attrs.put("category", "power");
      attrs.put("name", value(tags, "name"));    } else if ("pipeline".equals(value(tags, "man_made")) && "underwater".equals(value(tags, "location")) && sf.canBeLine()) {
      attrs.put("type", "pipeline_submarine");
      attrs.put("category", value(tags, "substance"));
      attrs.put("name", value(tags, "name"));    } else if ("offshore_platform".equals(value(tags, "man_made"))) {
      attrs.put("type", "platform");
      attrs.put("category", "offshore_platform");
      attrs.put("name", value(tags, "name"));    } else if ("pier".equals(value(tags, "man_made"))) {
      attrs.put("type", "shoreline_construction");
      attrs.put("category", "pier");
      attrs.put("name", value(tags, "name"));    } else if ("groyne".equals(value(tags, "man_made"))) {
      attrs.put("type", "shoreline_construction");
      attrs.put("category", "groyne");
      attrs.put("name", value(tags, "name"));    } else if ("breakwater".equals(value(tags, "man_made"))) {
      attrs.put("type", "shoreline_construction");
      attrs.put("category", "breakwater");
      attrs.put("name", value(tags, "name"));    } else if ("water_tap".equals(value(tags, "man_made"))) {
      attrs.put("type", "small_craft_facility");
      attrs.put("category", "drinking_water");
      attrs.put("name", value(tags, "name"));    } else if ("slipway".equals(value(tags, "leisure"))) {
      attrs.put("type", "small_craft_facility");
      attrs.put("category", "slipway");
      attrs.put("name", value(tags, "name"));    } else if ("wreck".equals(value(tags, "historic"))) {
      attrs.put("type", "wreck");
      attrs.put("name", value(tags, "name"));    } else if ("marina".equals(value(tags, "leisure")) && (sf.canBeLine() || sf.canBePolygon())) {
      attrs.put("type", "harbour");
      attrs.put("category", "marina");
      attrs.put("name", value(tags, "name"));    } else if (("swimming_area".equals(value(tags, "leisure")) || "nature_reserve".equals(value(tags, "leisure"))) && (sf.canBeLine() || sf.canBePolygon())) {
      attrs.put("type", "restricted_area");
      attrs.put("category", value(tags, "leisure"));
      attrs.put("name", value(tags, "name"));    } else if (sf.isPoint() && ("tower".equals(value(tags, "man_made")) || "windmill".equals(value(tags, "man_made")) || "gasometer".equals(value(tags, "man_made")))) {
      attrs.put("type", "landmark");
      attrs.put("category", value(tags, "man_made"));
      attrs.put("function", value(tags, value(tags, "man_made") + ":type"));
      attrs.put("name", value(tags, "name"));    }

    // Facilities are mapped with ordinary OSM tags far more often than with the
    // duplicate seamark:* ones, so a chart that waits for seamark tagging shows
    // almost none of them.
    if (attrs.get("type") == null) {
      for (String[] rule : PLAIN_TAG_FEATURES) {
        if (rule[1].equals(value(tags, rule[0]))) {
          attrs.put("type", rule[2]);
          if (rule[3] != null) attrs.put("category", rule[3]);
          attrs.put("name", value(tags, "name"));
          break;
        }
      }
    }

    // derive convenient helpers from attrs for the defaults logic
    String type = attrs.get("type") != null ? attrs.get("type").toString() : null;
    String category = attrs.get("category") != null ? attrs.get("category").toString() : null;

    // set defaults for shape, color, patterns, topmarks
    if ("buoy_cardinal".equals(type) || ("beacon_cardinal".equals(type) && "north".equals(category))) {
      attrs.put("shape", coalesceObj(attrs.get("shape"), "buoy_cardinal".equals(type) ? "pillar" : "pile"));
      attrs.put("color", coalesceObj(attrs.get("color"), "black_yellow"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "2_cones_up"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "black"));
    } else if ("buoy_cardinal".equals(type) || ("beacon_cardinal".equals(type) && "east".equals(category))) {
      attrs.put("shape", coalesceObj(attrs.get("shape"), "buoy_cardinal".equals(type) ? "pillar" : "pile"));
      attrs.put("color", coalesceObj(attrs.get("color"), "black_yellow_black"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "2_cones_base_together"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "black"));
    } else if ("buoy_cardinal".equals(type) || ("beacon_cardinal".equals(type) && "south".equals(category))) {
      attrs.put("shape", coalesceObj(attrs.get("shape"), "buoy_cardinal".equals(type) ? "pillar" : "pile"));
      attrs.put("color", coalesceObj(attrs.get("color"), "yellow_black"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "2_cones_down"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "black"));
    } else if ("buoy_cardinal".equals(type) || ("beacon_cardinal".equals(type) && "west".equals(category))) {
      attrs.put("shape", coalesceObj(attrs.get("shape"), "buoy_cardinal".equals(type) ? "pillar" : "pile"));
      attrs.put("color", coalesceObj(attrs.get("color"), "yellow_black_yellow"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "2_cones_point_together"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "black"));
    } else if ("buoy_isolated_danger".equals(type) || "beacon_isolated_danger".equals(type)) {
      attrs.put("shape", coalesceObj(attrs.get("shape"), "buoy_isolated_danger".equals(type) ? "pillar" : "pile"));
      attrs.put("color", coalesceObj(attrs.get("color"), "red_black_red"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "2_spheres"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "black"));
    } else if ("buoy_safe_water".equals(type) || "beacon_safe_water".equals(type)) {
      attrs.put("shape", coalesceObj(attrs.get("shape"), "buoy_safe_water".equals(type) ? "pillar" : "pile"));
      attrs.put("color", coalesceObj(attrs.get("color"), "red_white"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "vertical"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "sphere"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "red"));
    } else if ("buoy_special_purpose".equals(type) || "beacon_special_purpose".equals(type)) {
      attrs.put("shape", coalesceObj(attrs.get("shape"), "buoy_special_purpose".equals(type) ? "pillar" : "pile"));
      attrs.put("color", coalesceObj(attrs.get("color"), "yellow"));
    }
    if (type != null && type.startsWith("beacon_")) attrs.put("shape", coalesceObj(attrs.get("shape"), "pile"));
    if (type != null && type.startsWith("buoy_")) attrs.put("shape", coalesceObj(attrs.get("shape"), "pillar"));
    if (attrs.get("shape") != null && "pile".equals(attrs.get("shape").toString())) attrs.put("shape", "buoyant");
    if (attrs.get("color") != null && attrs.get("color").toString().contains("_")) attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));

    // rocks/wrecks: fill missing depth values
    if (("wreck".equals(type) || "rock".equals(type)) && attrs.get("depth") == null) {
      try {
        org.locationtech.jts.geom.Point centroid = (org.locationtech.jts.geom.Point) sf.centroid();
        if (depthCalculator != null && centroid != null) {
          Coordinate coord = centroid.getCoordinate();
          attrs.put("depth", depthCalculator.getDepthAtLocation(coord));
        }
      } catch(Exception e) {}
    }

    // Carry the source tags alongside the derived ones, so styling an attribute we don't read
    // yet is a style change rather than a planet rebuild. type == null means this isn't a
    // seamark and the map is discarded.
    if (type != null) {
      passThroughTags(tags, attrs);
    }

    return attrs;
  }

  /** Copies whitelisted source tags onto the feature, never overwriting a derived attribute. */
  private static void passThroughTags(Map<String, Object> tags, Map<String, Object> attrs) {
    for (Map.Entry<String, Object> e : tags.entrySet()) {
      String key = e.getKey();
      if (e.getValue() == null || TAG_DENYLIST.contains(key)) continue;
      boolean keep = TAG_WHITELIST.contains(key);
      for (int i = 0; !keep && i < TAG_PREFIXES.length; i++) {
        keep = key.startsWith(TAG_PREFIXES[i]);
      }
      if (keep) attrs.putIfAbsent(key, e.getValue());
    }
  }

  private static String value(Map<String, Object> tags, String key) {
    Object val = tags.get(key);
    if (val == null) return null;
    String valStr = val.toString();
    if (valStr.isEmpty()) return null;
    return valStr;
  }

  private static String seamarkValue(Map<String, Object> tags, String type, String subtype) {
    return value(tags, "seamark:" + type + ":" + subtype);
  }

  private static String coalesce(String... vals) {
    for (String v: vals) {
      if (v != null && !v.isEmpty()) return v;
    }
    return null;
  }

  private static String coalesceObj(Object... vals) {
    for (Object o : vals) {
      if (o == null) continue;
      String s = o instanceof String ? (String) o : o.toString();
      if (s != null && !s.isEmpty()) return s;
    }
    return null;
  }

  private static String replaceSemiWithUnderscore(String v) {
    if (v == null) return null;
    return v.replace(";", "_");
  }

  private static String sanitizeTopmarkShape(String v) {
    if (v == null) return null;
    String out = v.replace(",", "");
    out = out.replace(" ", "_");
    return out;
  }

  private static String radarReflector(Map<String,Object> tags, String type) {
    String reflector = value(tags, "seamark:radar_reflector");
    String reflectivity = seamarkValue(tags, type, "reflectivity");
    String transponder = seamarkValue(tags, "radar_transponder", "category");
    if ("yes".equals(reflector)) {
      return "yes";
    } else if ("conspicuous".equals(reflectivity) || "reflector".equals(reflectivity)) {
      return reflectivity;
    } else if (transponder != null) {
      return transponder;
    } else {
      return null;
    }
  }

  private static String collectTags(Map<String,Object> tags, String group) {
    StringBuilder sb = new StringBuilder();
    String prefix = "seamark:" + group + ":";
    for (Map.Entry<String,Object> e : tags.entrySet()) {
      if (e.getKey().startsWith(prefix) && e.getValue() != null) {
        String attr = e.getKey().substring(prefix.length());
        String val = e.getValue().toString();
        if (!val.isEmpty()) {
          sb.append(attr).append(":").append(val).append(",");
        }
      }
    }
    return sb.length() > 0 ? sb.toString() : null;
  }

  /** S-57 colour abbreviations; anything unlisted falls back to its capitalised initial. */
  private static final Map<String, String> LIGHT_COLOUR_ABBR = Map.ofEntries(
    Map.entry("white", "W"), Map.entry("red", "R"), Map.entry("green", "G"),
    Map.entry("blue", "Bu"), Map.entry("violet", "Vi"), Map.entry("yellow", "Y"),
    Map.entry("orange", "Or"), Map.entry("amber", "Am"), Map.entry("magenta", "M"));

  /** Splits a `;`-separated colour list into lowercase tokens, preserving order. */
  private static void addColours(Set<String> into, String value) {
    if (value == null) return;
    for (String colour : value.split(";")) {
      String token = colour.trim().toLowerCase();
      if (!token.isEmpty()) into.add(token);
    }
  }

  static String seamarkLightAbbr(Map<String,Object> tags) {
    Set<String> colours = new LinkedHashSet<>();
    String group = null;
    String character = null;
    Double range = 0.0;
    String period = null;
    String height = null;

    // Single light definition
    if (tags.containsKey("seamark:light:colour")) {
      addColours(colours, seamarkValue(tags, "light", "colour"));
      group = seamarkValue(tags, "light", "group");
      character = seamarkValue(tags, "light", "character");
      range = Parse.parseDoubleOrNull(seamarkValue(tags, "light", "range"));
      period = seamarkValue(tags, "light", "period");
      height = seamarkValue(tags, "light", "height");

    // Sectored light. Sectors are numbered from 1, so walk them in order rather than in tag
    // order, and name each distinct colour once — Fl.WRG.10s, not Fl.WRGW.10s.
    } else if (tags.containsKey("seamark:light:1:colour")) {
      for (int i = 1; tags.containsKey("seamark:light:" + i + ":colour"); i++) {
        addColours(colours, seamarkValue(tags, "light", i + ":colour"));
        Double sectorRange = Parse.parseDoubleOrNull(seamarkValue(tags, "light", i + ":range"));
        if (sectorRange != null && sectorRange > range) range = sectorRange;
      }
      // Character, period and height describe the light as a whole, not the sector.
      group = seamarkValue(tags, "light", "1:group");
      character = seamarkValue(tags, "light", "1:character");
      period = seamarkValue(tags, "light", "1:period");
      height = seamarkValue(tags, "light", "1:height");
    }

    // Build abbreviation
    if (colours.isEmpty()) return null;
    StringBuilder sb = new StringBuilder();
    if (character != null) sb.append(character);
    if (group != null) sb.append("(").append(group).append(")");
    else sb.append(".");
    for (String colour : colours) {
      String abbr = LIGHT_COLOUR_ABBR.get(colour);
      sb.append(abbr != null ? abbr : colour.substring(0, 1).toUpperCase());
    }
    sb.append(".");
    if (period != null) sb.append(period).append("s");
    if (height != null) sb.append(height).append("m");
    if (range != null && range > 0) sb.append(Math.round(range)).append("M");

    // A light tagged with no character, or none of period/height/range, would otherwise carry a
    // dangling separator onto the chart.
    while (sb.length() > 0 && sb.charAt(0) == '.') sb.deleteCharAt(0);
    while (sb.length() > 0 && sb.charAt(sb.length() - 1) == '.') sb.setLength(sb.length() - 1);
    return sb.toString();
  }

  // Based on https://wiki.openstreetmap.org/wiki/Seamarks/Seamark_Objects
  private static String getSeamarkCategory(Map<String, Object> tags, String type) {
    if ("seabed_area".equals(type)) {
      return seamarkValue(tags, type, "surface");
    } else if ("wreck".equals(type)) {
      String category = seamarkValue(tags, type, "category");
      if (category == null) { // Fallback: derive category from water_level if category is not set
        String waterLevel = seamarkValue(tags, "wreck", "water_level");
        if ("submerged".equals(waterLevel) || "awash".equals(waterLevel) || "covers".equals(waterLevel)) {
          category = "dangerous";
        } else if ("always_dry".equals(waterLevel) || "dry".equals(waterLevel)) {
          category = "hull_showing";
        }
      }
      return category;
    } else if ("pipeline_submarine".equals(type)) {
      return coalesce(
        seamarkValue(tags, "pipeline_submarine", "category"),
        seamarkValue(tags, "pipeline_submarine", "product")
      );
    } else {
      return coalesce(seamarkValue(tags, type, "category"), value(tags, "seamark:category"), value(tags, "category"));
    }
  }

}
