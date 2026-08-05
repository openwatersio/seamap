import java.util.*;
import java.nio.file.Path;
import com.onthegomap.planetiler.Planetiler;
import com.onthegomap.planetiler.Profile;
import com.onthegomap.planetiler.reader.SourceFeature;
import com.onthegomap.planetiler.reader.osm.OsmElement;
import com.onthegomap.planetiler.reader.osm.OsmSourceFeature;
import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.config.Arguments;
import com.onthegomap.planetiler.geo.TileCoord;
import com.onthegomap.planetiler.VectorTile;
import org.locationtech.jts.geom.*;

/**
 * Planetiler profile for the nautical chart. Emits the seamark, light, land, water, wetland and
 * waterway layers; {@link Seamark#extractSeamarkAttributes} owns the OSM tag mapping, including
 * the derivations that invent a seamark type from plain tags (leisure=marina, route=ferry, ...).
 *
 * Harbours, landmarks and lights additionally emit a label point, so their name still places once
 * the polygon itself is too small to hold one.
 */
public class Seamap implements Profile {

  /** Seamark types that stay linear even when mapped as a closed way. */
  private static final Set<String> ALWAYS_LINEAR = Set.of(
    "cable_overhead", "cable_submarine", "ferry_route", "navigation_line", "pipeline_overhead",
    "pipeline_submarine", "recommended_track", "separation_boundary", "separation_lane",
    "separation_line");

  /**
   * Nodes, ways and relations share one id space, so tag the element type into the high bits.
   * Without it node 123 and way 123 are the same feature to anything reading feature ids.
   * Convention from https://github.com/protomaps/basemaps (feature/FeatureId.java).
   */
  private static long featureId(SourceFeature sf) {
    if (sf instanceof OsmSourceFeature osm) {
      OsmElement element = osm.originalElement();
      long elementType = element instanceof OsmElement.Relation ? 3
        : element instanceof OsmElement.Way ? 2 : 1;
      return (elementType << 44) | element.id();
    }
    return sf.id();
  }

  public static void main(String[] args) throws Exception {
    var arguments = Arguments.fromArgsOrConfigFile(args).withDefault("download", true);
    String area = arguments.getString("area", "geofabrik area to download", "monaco");
    Path dataDir = Path.of("data");

    // Initialize depth calculator only if --depth parameter is provided
    String depthPath = arguments.getString("depth",
      "depth DEM: path to a Terrarium PMTiles file, or a {z}/{x}/{y} tile URL template", null);
    if (depthPath != null) {
      System.out.println("Loading depth data from: " + depthPath);
      Seamark.depthCalculator = depthPath.startsWith("http")
        ? new DepthCalculator(depthPath, 512)
        : new DepthCalculator(Path.of(depthPath));
      System.out.println("Depth data loaded successfully");
    }

    Seamap profile = new Seamap();

    Planetiler.create(arguments)
      .setProfile(profile)
      .addOsmSource("osm", dataDir.resolve(area + ".osm.pbf"), "geofabrik:" + area)
      .addShapefileSource("land", LandPolygons.ensureLandPolygons(dataDir))
      .overwriteOutput(dataDir.resolve("seamarks.pmtiles"))
      .run();
  }

  @Override
  public String name() {
    return "seamap";
  }

  @Override
  public void processFeature(SourceFeature sf, FeatureCollector features) {
    // Process land polygons from shapefile
    if (!sf.isPoint() && "land".equals(sf.getSource())) {
      LandPolygons.processLandFeature(sf, features);
      return;
    }

    // Extract large water bodies (lakes, reservoirs) from OSM
    if ("osm".equals(sf.getSource()) && !sf.isPoint()) {
      var tags = sf.tags();
      String natural = (String) tags.get("natural");
      String water = (String) tags.get("water");

      if ("water".equals(natural) && sf.canBePolygon()) {
        // Kept for names/type only — rendering water is Seascape's job, and
        // every water polygon is cut out of land in postProcessTileFeatures.
        FeatureCollector.Feature waterFeature = features.polygon("water");
        // Only set type if it's not "unknown"
        if (water != null) {
          waterFeature.setAttr("water", water);
        }
        if (tags.containsKey("name")) {
          waterFeature.setAttr("name", tags.get("name"));
        }
        // The land−water cut in postProcessTileFeatures can only subtract water
        // that's present in the tile, so water must exist at every zoom land
        // does — at z<4 the Great Lakes rendered as land. Planetiler's pixel-size
        // dropping prunes small lakes at low zooms on its own.
        waterFeature.setMinZoom(0);
      }

      // Extract wetland / intertidal areas relevant for navigation:
      // tidal flats ("Wattenmeer"), salt marshes, mud and shoals that fall
      // dry between high and low water. These lie in the intertidal zone
      // below the coastline, so they are rendered on top of water/bathymetry
      // and are NOT cut out of the land polygons.
      String wetland = (String) tags.get("wetland");
      boolean isWetland = "wetland".equals(natural) ||
        "mud".equals(natural) || "shoal".equals(natural);
      if (isWetland && sf.canBePolygon()) {
        FeatureCollector.Feature wetlandFeature = features.polygon("wetland");
        wetlandFeature.setAttr("type", "wetland");

        // category describes what kind of intertidal/wetland area it is
        // (e.g. "tidalflat", "saltmarsh", "mud", "shoal")
        String wetlandCategory = wetland != null ? wetland : natural;
        wetlandFeature.setAttr("category", wetlandCategory);

        if (tags.get("surface") != null) {
          wetlandFeature.setAttr("surface", tags.get("surface"));
        }
        if (tags.containsKey("name")) {
          wetlandFeature.setAttr("name", tags.get("name"));
        }
        wetlandFeature.setMinZoom(7).setBufferPixels(4);
      }

      // Extract waterways (canals, rivers, fairways, ...) as linestrings.
      // Navigable waterways are the most relevant; minor ditches/drains are
      // kept but only appear at higher zoom levels.
      String waterway = (String) tags.get("waterway");
      if (waterway != null && sf.canBeLine()) {
        FeatureCollector.Feature waterwayFeature = features.line("waterway");
        waterwayFeature.setAttr("type", "waterway");
        waterwayFeature.setAttr("category", waterway);
        if (tags.containsKey("name")) {
          waterwayFeature.setAttr("name", tags.get("name"));
        }

        // major navigable waterways appear earlier than minor ones
        int minZoom = switch (waterway) {
          case "river", "canal", "fairway" -> 8;
          case "stream", "tidal_channel", "lock", "dock" -> 11;
          default -> 13; // drain, ditch, etc.
        };
        waterwayFeature.setMinZoom(minZoom).setBufferPixels(4);
      }
    }

    // Process seamarks
    Map<String, Object> attrs = Seamark.extractSeamarkAttributes(sf);
    String type = (String) attrs.get("type");
    if (type != null) {
      // add seamark to vector tile
      attrs.put("osm_id", sf.id());
      // anyGeometry() makes a polygon of any closed way, which is wrong for the types that are
      // linear however they're drawn — a TSS lane or a cable loop is never an area.
      FeatureCollector.Feature feature = sf.canBeLine() && ALWAYS_LINEAR.contains(type)
        ? features.line("seamark")
        : features.anyGeometry("seamark");
      attrs.forEach((k, v) -> feature.setAttr(k, v));
      feature.setId(featureId(sf));
      feature.setMinZoom(SeamarkZoomRules.getMinZoom(attrs));

      // create label-grid for rocks, sorted by danger level; sampled depth
      // (--depth) breaks ties within a tier, shallower first
      if (type.equals("rock")) {
        String waterLevel = (String) attrs.get("water_level");
        int depth = attrs.get("depth") != null ? Math.round(((Number) attrs.get("depth")).floatValue()) : 0;
        int rank;
        if ("submerged".equals(waterLevel)) rank = 0; // Most dangerous: always underwater, invisible
        else if ("awash".equals(waterLevel)) rank = 10000; // Very dangerous: at wave height, barely visible
        else if ("covers".equals(waterLevel)) rank = 20000; // Dangerous: periodically submerged
        else if ("dry".equals(waterLevel) || "always_dry".equals(waterLevel)) rank = 40000; // always visible
        else rank = 30000; // Unknown: might be any of the above, so it outranks provably-dry
        feature.setSortKey(rank + depth).setPointLabelGridSizeAndLimit(12, 32, 4);
      }

      // create label-grid for wrecks, sorted by danger level
      if (type.equals("wreck")) {
        String wreckCategory = (String) attrs.get("category");
        int depth = attrs.get("depth") != null ? Math.round(((Number) attrs.get("depth")).floatValue()) : 0;
        int rank;
        if ("dangerous".equals(wreckCategory)) rank = 0; // Most dangerous: dangerous to surface navigation
        else if ("mast_showing".equals(wreckCategory)) rank = 10000; // Very dangerous: mast visible
        else if ("hull_showing".equals(wreckCategory)) rank = 20000; // Dangerous: hull or superstructure visible
        else if ("distributed_remains".equals(wreckCategory)) rank = 30000; // Moderately dangerous: foul ground
        else rank = 40000; // Least dangerous: non-dangerous or unspecified
        feature.setSortKey(rank + depth).setPointLabelGridSizeAndLimit(12, 16, 1);
      }

      // add labels for small polygons in low zoomlevels
      if ("harbour".equals(type) || "landmark".equals(type) || "light_major".equals(type) || "light_minor".equals(type)&& !sf.isPoint()) {
        FeatureCollector.Feature labelFeature = sf.canBePolygon()
          ? features.pointOnSurface("seamark")
          : features.centroid("seamark");
        attrs.forEach((k, v) -> labelFeature.setAttr(k, v));
        labelFeature.setAttr("osm_id", sf.id());
        labelFeature.setId(featureId(sf));
        labelFeature.setMinZoom(SeamarkZoomRules.getMinZoom(attrs));
      }

      // add sector-lights (Arcs und Rays) to vector tile
      if (sf.tags().containsKey("seamark:light:1:colour")) {
        try {
          List<Lights.LightGeometry> lightGeometries = Lights.extractLightGeometries(sf, type);
          for (Lights.LightGeometry lightGeom : lightGeometries) {
            FeatureCollector.Feature lightFeature = features.geometry("light", lightGeom.geometry);
            lightFeature.setAttr("osm_id", sf.id());
            lightFeature.setAttr("type", type);
            lightGeom.attrs.forEach((k, v) -> lightFeature.setAttr(k, v));
            lightFeature.setMinZoom(SeamarkZoomRules.getLightMinZoom(type));
          }
        } catch (Exception e) {
          System.err.println("Error generating light geometries for OSM ID " + sf.id() + ": " + e);
        }
      }
    }
  }

  @Override
  public Map<String, List<VectorTile.Feature>> postProcessTileFeatures(TileCoord tileCoord, Map<String, List<VectorTile.Feature>> layers) {
    List<VectorTile.Feature> landFeatures = layers.get("land");
    List<VectorTile.Feature> waterFeatures = layers.get("water");

    if (landFeatures != null && !landFeatures.isEmpty()) {
      try {
        // Cut every water polygon out of land. Seascape treats all OSM water as
        // water (unknown depth where unsurveyed), so whatever it renders shows
        // through the hole with the OSM shoreline as the edge.
        Geometry allLand = unionGeometries(landFeatures);
        Geometry allWater = waterFeatures == null ? null : unionGeometries(waterFeatures);

        if (allLand != null && allWater != null) {
          allLand = allLand.difference(allWater);
        }

        // Replace land layer with the cut result. If the result is empty
        // (water fully covers land in this tile), drop the layer so the
        // bathymetry beneath shows through.
        if (allLand == null || allLand.isEmpty()) {
          layers.remove("land");
        } else {
          Map<String, Object> attrs = new HashMap<>();
          VectorTile.Feature newLandFeature = new VectorTile.Feature("land", 1, VectorTile.encodeGeometry(allLand), attrs);
          layers.put("land", List.of(newLandFeature));
        }
      } catch (Exception e) {
        System.err.println("Error cutting water from land for tile " + tileCoord + ": " + e.getMessage());
      }
    }

    return layers;
  }

  private static Geometry unionGeometries(List<VectorTile.Feature> features)
      throws com.onthegomap.planetiler.geo.GeometryException {
    // Cascaded union: low-zoom tiles hold tens of thousands of land grid
    // cells, and pairwise union is O(n²) over them.
    List<Geometry> geoms = new ArrayList<>();
    for (VectorTile.Feature f : features) {
      geoms.add(f.geometry().decode());
    }
    if (geoms.isEmpty()) return null;
    return org.locationtech.jts.operation.union.UnaryUnionOp.union(geoms);
  }

}
