import com.onthegomap.planetiler.reader.SourceFeature;
import com.onthegomap.planetiler.util.Parse;
import java.util.*;
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
  private static final Set<String> TAG_WHITELIST =
      Set.of(
          // water_level and restriction are the unprefixed fallbacks the style resolves against
          "water_level",
          "restriction",
          "ref",
          "description",
          "note",
          "access",
          "fee",
          "charge",
          "toll",
          "opening_hours",
          "operator",
          "operator:wikidata",
          "wikidata",
          "wikipedia",
          "vhf",
          "direction",
          "distance",
          "maxspeed",
          "maxstay",
          "maxdraft",
          "maxlength",
          "maxwidth",
          "maxheight",
          "maxweight",
          "vessel",
          "vessel:mmsi",
          "wreck:type",
          "wreck:date_sunk",
          "building:height",
          "highway");

  /**
   * Plain OSM tags that stand in for a seamark, as {key, value, type, category}. Checked only after
   * the seamark:* extraction above, so explicit seamark tagging always wins.
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
      attrs.put(
          "name",
          coalesce(
              seamarkValue(tags, type, "name"), value(tags, "seamark:name"), value(tags, "name")));
      attrs.put("category", getSeamarkCategory(tags, type));
      attrs.put(
          "function",
          coalesce(
              seamarkValue(tags, type, "function"),
              value(tags, "seamark:function"),
              value(tags, "function")));
      attrs.put("shape", seamarkValue(tags, type, "shape"));
      attrs.put("color", replaceSemiWithUnderscore(seamarkValue(tags, type, "colour")));
      attrs.put("color_pattern", seamarkValue(tags, type, "colour_pattern"));
      attrs.put("radar_reflector", radarReflector(tags, type));
      attrs.put("radio_station", collectTags(tags, "radio_station"));
      attrs.put("light", seamarkLightAbbr(tags));
      LightInfo light = lightInfo(tags);
      if (light.present()) {
        attrs.put("light_color", resolveLightColor(new LinkedHashSet<>(light.colours())));
        // 9 M is the S-52 default nominal range when none is tagged; drives zoom and the
        // major-light geometry split, never printed (S-52 LIGHTS06)
        attrs.put("light_range", light.range() != null ? light.range() : 9.0);
      }
      attrs.put(
          "topmark_color",
          replaceSemiWithUnderscore(
              coalesce(
                  seamarkValue(tags, "topmark", "colour"),
                  seamarkValue(tags, "daymark", "colour"))));
      attrs.put(
          "topmark_color_pattern",
          replaceSemiWithUnderscore(coalesce(seamarkValue(tags, "topmark", "colour_pattern"))));
      attrs.put(
          "topmark_shape",
          sanitizeTopmarkShape(
              coalesce(
                  seamarkValue(tags, "topmark", "shape"), seamarkValue(tags, "daymark", "shape"))));
      attrs.put(
          "depth",
          Parse.parseDoubleOrNull(
              coalesce(
                  seamarkValue(tags, type, "depth"),
                  value(tags, "seamark:depth"),
                  value(tags, "depth"))));

      // create seamarks from normal OSM tags:
    } else if ("ferry".equals(value(tags, "route")) && sf.canBeLine()) {
      attrs.put("type", "ferry_route");
      attrs.put("name", value(tags, "name"));
    } else if ("anchor".equals(value(tags, "waterway:sign"))) {
      attrs.put("type", "anchorage");
      attrs.put("name", value(tags, "name"));
    } else if ("cable".equals(value(tags, "power"))
        && "underwater".equals(value(tags, "location"))
        && sf.canBeLine()) {
      attrs.put("type", "cable_submarine");
      attrs.put("category", "power");
      attrs.put("name", value(tags, "name"));
    } else if ("pipeline".equals(value(tags, "man_made"))
        && "underwater".equals(value(tags, "location"))
        && sf.canBeLine()) {
      attrs.put("type", "pipeline_submarine");
      attrs.put("category", value(tags, "substance"));
      attrs.put("name", value(tags, "name"));
    } else if ("offshore_platform".equals(value(tags, "man_made"))) {
      attrs.put("type", "platform");
      attrs.put("category", "offshore_platform");
      attrs.put("name", value(tags, "name"));
    } else if ("pier".equals(value(tags, "man_made"))) {
      attrs.put("type", "shoreline_construction");
      attrs.put("category", "pier");
      attrs.put("name", value(tags, "name"));
    } else if ("groyne".equals(value(tags, "man_made"))) {
      attrs.put("type", "shoreline_construction");
      attrs.put("category", "groyne");
      attrs.put("name", value(tags, "name"));
    } else if ("breakwater".equals(value(tags, "man_made"))) {
      attrs.put("type", "shoreline_construction");
      attrs.put("category", "breakwater");
      attrs.put("name", value(tags, "name"));
    } else if ("water_tap".equals(value(tags, "man_made"))) {
      attrs.put("type", "small_craft_facility");
      attrs.put("category", "drinking_water");
      attrs.put("name", value(tags, "name"));
    } else if ("slipway".equals(value(tags, "leisure"))) {
      attrs.put("type", "small_craft_facility");
      attrs.put("category", "slipway");
      attrs.put("name", value(tags, "name"));
    } else if ("wreck".equals(value(tags, "historic"))) {
      attrs.put("type", "wreck");
      attrs.put("name", value(tags, "name"));
    } else if ("marina".equals(value(tags, "leisure")) && (sf.canBeLine() || sf.canBePolygon())) {
      attrs.put("type", "harbour");
      attrs.put("category", "marina");
      attrs.put("name", value(tags, "name"));
    } else if (("swimming_area".equals(value(tags, "leisure"))
            || "nature_reserve".equals(value(tags, "leisure")))
        && (sf.canBeLine() || sf.canBePolygon())) {
      attrs.put("type", "restricted_area");
      attrs.put("category", value(tags, "leisure"));
      attrs.put("name", value(tags, "name"));
    } else if (sf.isPoint()
        && ("tower".equals(value(tags, "man_made"))
            || "windmill".equals(value(tags, "man_made"))
            || "gasometer".equals(value(tags, "man_made")))) {
      attrs.put("type", "landmark");
      attrs.put("category", value(tags, "man_made"));
      attrs.put("function", value(tags, value(tags, "man_made") + ":type"));
      attrs.put("name", value(tags, "name"));
    }

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

    // set defaults for color, patterns, topmarks (shape defaults follow below, by buoy/beacon)
    if ("buoy_cardinal".equals(type) || "beacon_cardinal".equals(type)) {
      // CATCAM quadrant -> colour + topmark (IALA R1001 2.2.4 Tables 5-6). A cardinal with no
      // quadrant gets no guess: a wrong quadrant inverts which side is safe water.
      String[] cardinal =
          switch (category == null ? "" : category) {
            case "north" -> new String[] {"black_yellow", "2_cones_up"};
            case "east" -> new String[] {"black_yellow_black", "2_cones_base_together"};
            case "south" -> new String[] {"yellow_black", "2_cones_down"};
            case "west" -> new String[] {"yellow_black_yellow", "2_cones_point_together"};
            default -> null;
          };
      if (cardinal != null) {
        attrs.put("color", coalesceObj(attrs.get("color"), cardinal[0]));
        attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));
        attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), cardinal[1]));
        attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "black"));
      }
    } else if ("buoy_isolated_danger".equals(type) || "beacon_isolated_danger".equals(type)) {
      // black with red bands (BRB), IALA R1001 2.3.2.2 Table 7
      attrs.put("color", coalesceObj(attrs.get("color"), "black_red_black"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "2_spheres"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "black"));
    } else if ("buoy_safe_water".equals(type) || "beacon_safe_water".equals(type)) {
      attrs.put("color", coalesceObj(attrs.get("color"), "red_white"));
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "vertical"));
      attrs.put("topmark_shape", coalesceObj(attrs.get("topmark_shape"), "sphere"));
      attrs.put("topmark_color", coalesceObj(attrs.get("topmark_color"), "red"));
    } else if ("buoy_lateral".equals(type) || "beacon_lateral".equals(type)) {
      // Colour flips by IALA region (A: port red, B: port green); the hull shape does not
      // (R1001 2.1.3-2.1.4). No topmark default: R1001 fits topmarks only where the shape
      // doesn't already say the side, and OSM tags them where they exist.
      String side = category;
      if ("port".equals(side) || "starboard".equals(side)) {
        boolean b = isIalaRegionB(sf);
        boolean port = "port".equals(side);
        attrs.put("color", coalesceObj(attrs.get("color"), (port ^ b) ? "red" : "green"));
        if ("buoy_lateral".equals(type)) {
          attrs.put("shape", coalesceObj(attrs.get("shape"), port ? "can" : "conical"));
        }
      }
    } else if ("buoy_special_purpose".equals(type) || "beacon_special_purpose".equals(type)) {
      attrs.put("color", coalesceObj(attrs.get("color"), "yellow"));
    }
    if (type != null && type.startsWith("beacon_"))
      attrs.put("shape", coalesceObj(attrs.get("shape"), "pile"));
    if (type != null && type.startsWith("buoy_"))
      attrs.put("shape", coalesceObj(attrs.get("shape"), "pillar"));
    if (attrs.get("color") != null && attrs.get("color").toString().contains("_"))
      attrs.put("color_pattern", coalesceObj(attrs.get("color_pattern"), "horizontal"));

    // rocks/wrecks: fill missing depth values
    if (("wreck".equals(type) || "rock".equals(type)) && attrs.get("depth") == null) {
      try {
        org.locationtech.jts.geom.Point centroid = (org.locationtech.jts.geom.Point) sf.centroid();
        if (depthCalculator != null && centroid != null) {
          Coordinate coord = centroid.getCoordinate();
          attrs.put("depth", depthCalculator.getDepthAtLocation(coord));
        }
      } catch (Exception e) {
      }
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
    for (String v : vals) {
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

  private static String radarReflector(Map<String, Object> tags, String type) {
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

  private static String collectTags(Map<String, Object> tags, String group) {
    StringBuilder sb = new StringBuilder();
    String prefix = "seamark:" + group + ":";
    for (Map.Entry<String, Object> e : tags.entrySet()) {
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

  /**
   * IALA Region B is the Americas plus Japan, South Korea, Taiwan, and the Philippines; everything
   * else is Region A (US Chart No. 1 Q-130; per-country table in the standards library's
   * iala-regions.csv). Coarse geographic boxes, accurate to the country level with known fringe
   * tolerances: Kinmen sits 2 km off the Chinese coast and reads as A, and the DMZ-adjacent Korean
   * islands straddle the latitude cut.
   */
  static boolean isIalaRegionB(double lon, double lat) {
    // the Americas without Greenland, plus the Aleutian tail across the dateline
    if (lon >= -170 && lon <= -32 && lat >= -60 && lat <= 75 && !(lat > 59 && lon > -67)) {
      return true;
    }
    // western Aleutians only: Attu starts at 172.4E, and Russia's Commander Islands end at
    // 168.2E, so the cut at 170 keeps Region A east of it
    if (lon >= 170 && lon <= 180 && lat >= 50 && lat <= 56) return true;
    if (lon >= -180 && lon <= -165 && lat >= 50 && lat <= 56) return true;
    if (lon >= 116.9 && lon <= 127 && lat >= 4.5 && lat <= 21) return true; // Philippines
    if (lon >= 119.3 && lon <= 122.1 && lat >= 21.7 && lat <= 25.4) return true; // Taiwan
    if (lon >= 124.5 && lon <= 130 && lat >= 33 && lat <= 38.2) return true; // South Korea
    if (lon >= 128.5 && lon <= 147 && lat >= 30 && lat <= 37) return true; // Kyushu, Shikoku
    if (lon >= 132 && lon <= 146.5 && lat >= 37 && lat <= 45.8) return true; // Honshu, Hokkaido
    if (lon >= 122.9 && lon <= 132 && lat >= 24 && lat <= 30) return true; // Ryukyu Islands
    return false;
  }

  private static boolean isIalaRegionB(SourceFeature sf) {
    try {
      Coordinate c = sf.centroid().getCoordinate();
      return isIalaRegionB(
          com.onthegomap.planetiler.geo.GeoUtils.getWorldLon(c.x),
          com.onthegomap.planetiler.geo.GeoUtils.getWorldLat(c.y));
    } catch (Exception e) {
      return false; // Region A covers most of the world's coastline
    }
  }

  /** S-57 colour abbreviations; anything unlisted falls back to its capitalised initial. */
  private static final Map<String, String> LIGHT_COLOUR_ABBR =
      Map.ofEntries(
          Map.entry("white", "W"),
          Map.entry("red", "R"),
          Map.entry("green", "G"),
          Map.entry("blue", "Bu"),
          Map.entry("violet", "Vi"),
          Map.entry("yellow", "Y"),
          Map.entry("orange", "Or"),
          Map.entry("amber", "Am"),
          Map.entry("magenta", "M"));

  /** Splits a `;`-separated colour list into lowercase tokens, preserving order. */
  private static void addColours(Collection<String> into, String value) {
    if (value == null) return;
    for (String colour : value.split(";")) {
      String token = colour.trim().toLowerCase();
      if (!token.isEmpty()) into.add(token);
    }
  }

  /** Everything the chart needs to know about a feature's light, gathered once. */
  record LightInfo(
      List<String> colours,
      String character,
      String group,
      String period,
      String height,
      Double range,
      String category,
      String multiple,
      boolean sectored) {
    boolean present() {
      return !colours.isEmpty() || character != null;
    }
  }

  static LightInfo lightInfo(Map<String, Object> tags) {
    List<String> colours = new ArrayList<>();
    String character = null, group = null, period = null, height = null;
    String category = null, multiple = null;
    Double range = null;
    boolean sectored = false;

    // Sectored light. Sectors are numbered from 1, so walk them in order rather than in tag
    // order, and name each distinct colour once — Fl.WRG.10s, not Fl.WRGW.10s.
    if (tags.containsKey("seamark:light:1:colour")) {
      sectored = true;
      // dedupe across sectors — Fl.WRG.10s, not Fl.WRGW.10s — but keep sector order
      Set<String> sectorColours = new LinkedHashSet<>();
      for (int i = 1; tags.containsKey("seamark:light:" + i + ":colour"); i++) {
        addColours(sectorColours, seamarkValue(tags, "light", i + ":colour"));
        Double sectorRange = Parse.parseDoubleOrNull(seamarkValue(tags, "light", i + ":range"));
        if (sectorRange != null && (range == null || sectorRange > range)) range = sectorRange;
      }
      colours.addAll(sectorColours);
      // Character, group, period, height and disposition describe the light as a whole.
      character = seamarkValue(tags, "light", "1:character");
      group = seamarkValue(tags, "light", "1:group");
      period = seamarkValue(tags, "light", "1:period");
      height = seamarkValue(tags, "light", "1:height");
      category = seamarkValue(tags, "light", "1:category");
      multiple = seamarkValue(tags, "light", "1:multiple");
    } else if (tags.containsKey("seamark:light:colour")
        || seamarkValue(tags, "light", "character") != null) {
      addColours(colours, seamarkValue(tags, "light", "colour"));
      character = seamarkValue(tags, "light", "character");
      group = seamarkValue(tags, "light", "group");
      period = seamarkValue(tags, "light", "period");
      height = seamarkValue(tags, "light", "height");
      category = seamarkValue(tags, "light", "category");
      multiple = seamarkValue(tags, "light", "multiple");
      range = Parse.parseDoubleOrNull(seamarkValue(tags, "light", "range"));
    }
    return new LightInfo(
        colours, character, group, period, height, range, category, multiple, sectored);
  }

  /**
   * One colour for the flare and each arc, by the S-52 LIGHTS06 precedence: red and green win their
   * combinations with white, orange and amber collapse to yellow, a plain white light keeps its
   * white flare, and anything else is undescribed.
   */
  static String resolveLightColor(Set<String> colours) {
    if (colours.isEmpty()) return null;
    if (colours.contains("red") && (colours.contains("white") || colours.size() == 1)) return "red";
    if (colours.contains("green") && (colours.contains("white") || colours.size() == 1)) {
      return "green";
    }
    if (colours.contains("yellow") || colours.contains("orange") || colours.contains("amber")) {
      return "yellow";
    }
    if (colours.contains("white")) return "white";
    return "generic";
  }

  /** resolveLightColor over a raw `;`-separated tag value. */
  static String resolveLightColor(String value) {
    Set<String> colours = new LinkedHashSet<>();
    addColours(colours, value);
    return resolveLightColor(colours);
  }

  /** A tag number the chart can print: 5 for "5.0", but 1.5 keeps its decimals. */
  private static String formatTagNumber(String raw) {
    Double v = Parse.parseDoubleOrNull(raw);
    return v != null ? formatNumber(v) : raw;
  }

  /** Trims a numeric value for the chart: 12 not 12.0, but 0.1 keeps its decimals. */
  private static String formatNumber(double v) {
    return v == Math.floor(v) ? String.valueOf((long) v) : String.valueOf(v);
  }

  /**
   * The light description printed beside a lit mark, in S-4 paper-chart conventions: dot-separated,
   * sector colours merged into one string (`Fl(3)WRG.10s15m12M`), with the chart's omissions — a
   * lone W (charted only on sector and alternating lights, US Chart No. 1 §P-11.1), a trivial (1)
   * signal group (S-52 §10.6.3), and the elevation and range of minor lights (S-4 §B-471.6/.7). A
   * fog signal joins on its own line.
   */
  static String seamarkLightAbbr(Map<String, Object> tags) {
    LightInfo light = lightInfo(tags);
    String lightStr = light.present() ? lightAbbr(light, tags) : null;
    String fogStr = fogSignalAbbr(tags);
    if (lightStr == null) return fogStr;
    return fogStr == null ? lightStr : lightStr + "\n" + fogStr;
  }

  private static String lightAbbr(LightInfo l, Map<String, Object> tags) {
    StringBuilder sb = new StringBuilder();
    if ("directional".equals(l.category())) sb.append("Dir");
    if ("aero".equals(l.category()) || "air_obstruction".equals(l.category())) sb.append("Aero");
    if (l.multiple() != null) sb.append(l.multiple());

    // a signal group of (1) on a simple character is not charted (S-52 §10.6.3); inside a
    // composite character like Q(1)+LFl it is structural and stays
    String group = l.group();
    boolean composite = l.character() != null && l.character().contains("+");
    if (group != null && !composite && ("1".equals(group) || group.isEmpty())) group = null;

    if (composite && group != null) {
      // the group belongs to the first element: UQ(1)+LFl, never UQ+LFl(1)
      String[] parts = l.character().split("\\+", 2);
      sb.append(parts[0]).append("(").append(group).append(")+").append(parts[1]);
    } else if (l.character() != null) {
      sb.append(l.character());
      if (group != null) sb.append("(").append(group).append(")");
    } else if (group != null) {
      sb.append("(").append(group).append(")");
    }

    boolean loneWhite =
        l.colours().size() == 1
            && l.colours().contains("white")
            && !l.sectored()
            && (l.character() == null || !l.character().startsWith("Al"));
    if (!l.colours().isEmpty() && !loneWhite) {
      if (sb.length() > 0 && sb.charAt(sb.length() - 1) != ')') sb.append(".");
      for (String colour : l.colours()) {
        String abbr = LIGHT_COLOUR_ABBR.get(colour);
        sb.append(abbr != null ? abbr : colour.substring(0, 1).toUpperCase());
      }
    }

    StringBuilder tail = new StringBuilder();
    if (l.period() != null) tail.append(formatTagNumber(l.period())).append("s");
    // the major-light test is a nominal range of 10 M (S-52 LIGHTS06)
    boolean major =
        "light_major".equals(value(tags, "seamark:type")) || (l.range() != null && l.range() >= 10);
    if (major) {
      if (l.height() != null) tail.append(formatTagNumber(l.height())).append("m");
      if (l.range() != null) tail.append(formatNumber(l.range())).append("M");
    }
    if (tail.length() > 0) {
      if (sb.length() > 0 && sb.charAt(sb.length() - 1) != ')') sb.append(".");
      sb.append(tail);
    }

    switch (l.category() == null ? "" : l.category()) {
      case "vertical" -> sb.append("(vert)");
      case "horizontal" -> sb.append("(hor)");
      case "front" -> sb.append("(Front)");
      case "rear" -> sb.append("(Rear)");
      case "upper" -> sb.append("(Upper)");
      case "lower" -> sb.append("(Lower)");
      default -> {}
    }

    while (sb.length() > 0 && sb.charAt(0) == '.') sb.deleteCharAt(0);
    while (sb.length() > 0 && sb.charAt(sb.length() - 1) == '.') sb.setLength(sb.length() - 1);
    return sb.length() == 0 ? null : sb.toString();
  }

  /** `Horn(2)8s` — category, signal group, period. Fog-signal ranges are not charted. */
  private static String fogSignalAbbr(Map<String, Object> tags) {
    String category = seamarkValue(tags, "fog_signal", "category");
    if (category == null || category.isEmpty()) return null;
    StringBuilder sb = new StringBuilder();
    sb.append(Character.toUpperCase(category.charAt(0)))
        .append(category.substring(1).replace('_', ' '));
    String group = seamarkValue(tags, "fog_signal", "group");
    if (group != null && !group.isEmpty() && !"1".equals(group)) {
      sb.append("(").append(group).append(")");
    }
    String period = seamarkValue(tags, "fog_signal", "period");
    if (period != null && !period.isEmpty()) {
      if (sb.charAt(sb.length() - 1) != ')') sb.append(".");
      sb.append(formatTagNumber(period)).append("s");
    }
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
        if ("submerged".equals(waterLevel)
            || "awash".equals(waterLevel)
            || "covers".equals(waterLevel)) {
          category = "dangerous";
        } else if ("always_dry".equals(waterLevel) || "dry".equals(waterLevel)) {
          category = "hull_showing";
        }
      }
      return category;
    } else if ("pipeline_submarine".equals(type)) {
      return coalesce(
          seamarkValue(tags, "pipeline_submarine", "category"),
          seamarkValue(tags, "pipeline_submarine", "product"));
    } else {
      return coalesce(
          seamarkValue(tags, type, "category"),
          value(tags, "seamark:category"),
          value(tags, "category"));
    }
  }
}
