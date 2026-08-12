import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.Planetiler;
import com.onthegomap.planetiler.Profile;
import com.onthegomap.planetiler.VectorTile;
import com.onthegomap.planetiler.config.Arguments;
import com.onthegomap.planetiler.geo.GeometryType;
import com.onthegomap.planetiler.geo.TileCoord;
import com.onthegomap.planetiler.reader.SourceFeature;
import com.onthegomap.planetiler.reader.osm.OsmElement;
import com.onthegomap.planetiler.reader.osm.OsmSourceFeature;
import java.nio.file.Path;
import java.util.*;
import org.locationtech.jts.geom.*;

/**
 * Planetiler profile for the nautical chart. Emits the seamark, light, land, water, wetland and
 * waterway layers; {@link Seamark#extractSeamarkAttributes} owns the OSM tag mapping, including the
 * derivations that invent a seamark type from plain tags (leisure=marina, route=ferry, ...).
 *
 * <p>Harbours, landmarks and lights additionally emit a label point, so their name still places
 * once the polygon itself is too small to hold one.
 */
public class Seamap implements Profile {

  /** Seamark types that stay linear even when mapped as a closed way. */
  private static final Set<String> ALWAYS_LINEAR =
      Set.of(
          "cable_overhead",
          "cable_submarine",
          "ferry_route",
          "navigation_line",
          "pipeline_overhead",
          "pipeline_submarine",
          "recommended_track",
          "separation_boundary",
          "separation_lane",
          "separation_line");

  /** Cell size for the per-family numbering, in tile pixels — a tile is 256 across. */
  private static final int CELL_PIXELS = 32;

  /**
   * Storage backstop: the most of one family kept in a cell, whatever the tile holds. This is not
   * the selection mechanism — the style's per-family budgets in `style/layers/visibility.ts` decide
   * what draws, and this only has to stay comfortably above the largest of them so retuning them
   * never needs a planet build. Raising it costs tile bytes; lowering it below a style budget
   * silently caps that budget.
   */
  private static int cellCap(int zoom) {
    if (zoom >= 13) return Integer.MAX_VALUE;
    return zoom >= 11 ? 16 : 8;
  }

  /**
   * Nodes, ways and relations share one id space, so tag the element type into the high bits.
   * Without it node 123 and way 123 are the same feature to anything reading feature ids.
   * Convention from https://github.com/protomaps/basemaps (feature/FeatureId.java).
   */
  private static long featureId(SourceFeature sf) {
    if (sf instanceof OsmSourceFeature osm) {
      OsmElement element = osm.originalElement();
      long elementType =
          element instanceof OsmElement.Relation ? 3 : element instanceof OsmElement.Way ? 2 : 1;
      return (elementType << 44) | element.id();
    }
    return sf.id();
  }

  public static void main(String[] args) throws Exception {
    var arguments = Arguments.fromArgsOrConfigFile(args).withDefault("download", true);
    String area = arguments.getString("area", "geofabrik area to download", "monaco");
    Path dataDir = Path.of("data");

    // Initialize depth calculator only if --depth parameter is provided
    String depthPath =
        arguments.getString(
            "depth",
            "depth DEM: path to a Terrarium PMTiles file, or a {z}/{x}/{y} tile URL template",
            null);
    if (depthPath != null) {
      System.out.println("Loading depth data from: " + depthPath);
      Seamark.depthCalculator =
          depthPath.startsWith("http")
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

  // Baked into the archive metadata for direct .pmtiles consumers. Byte-identical
  // to the Worker's ATTRIBUTION (worker/src/index.ts) — matching bytes are what
  // let MapLibre's attribution control dedupe across sources.
  @Override
  public String attribution() {
    return "© <a href=\"https://openwaters.io/charts/seamap\">Open Waters: Seamap</a> "
        + "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";
  }

  /**
   * Planetiler logs a per-feature exception and moves on, which turns a systematic bug into hours
   * of silent data loss followed by an automatic publish — an uncategorized harbour once NPE'd its
   * way out of an entire planet build feature by feature. The tolerance is zero on evidence, not
   * principle: five consecutive production planet builds threw on nothing at all, so anything
   * escaping here is a bug, and an Error — which planetiler's per-feature catch (Exception) does
   * not swallow — fails the build at the first one instead of after the millionth.
   */
  @Override
  public void processFeature(SourceFeature sf, FeatureCollector features) {
    try {
      doProcessFeature(sf, features);
    } catch (RuntimeException e) {
      throw new AssertionError(
          "feature processing threw on " + sf.id() + " — failing the build", e);
    }
  }

  private void doProcessFeature(SourceFeature sf, FeatureCollector features) {
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
      boolean isWetland =
          "wetland".equals(natural) || "mud".equals(natural) || "shoal".equals(natural);
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
        int minZoom =
            switch (waterway) {
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
      FeatureCollector.Feature feature =
          sf.canBeLine() && ALWAYS_LINEAR.contains(type)
              ? features.line("seamark")
              : features.anyGeometry("seamark");
      attrs.forEach((k, v) -> feature.setAttr(k, v));
      feature.setId(featureId(sf));
      feature.setMinZoom(SeamarkZoomRules.getMinZoom(attrs));

      // Which budget the feature draws from. Rank itself stays in the pipeline —
      // postProcessTileFeatures recomputes it from these same attributes and emits only the
      // per-cell position the style thresholds on.
      int rank = SeamarkPriority.rank(attrs);
      feature.setAttr("family", SeamarkPriority.family(attrs));
      feature.setSortKey(rank);

      // add labels for small polygons in low zoomlevels; point sources are already
      // points — a second centroid would duplicate them
      if (!sf.isPoint()
          && ("harbour".equals(type)
              || "landmark".equals(type)
              || "light_major".equals(type)
              || "light_minor".equals(type))) {
        FeatureCollector.Feature labelFeature =
            sf.canBePolygon() ? features.pointOnSurface("seamark") : features.centroid("seamark");
        attrs.forEach((k, v) -> labelFeature.setAttr(k, v));
        labelFeature.setAttr("osm_id", sf.id());
        labelFeature.setAttr("family", SeamarkPriority.family(attrs));
        labelFeature.setId(featureId(sf));
        labelFeature.setSortKey(rank);
        labelFeature.setMinZoom(SeamarkZoomRules.getMinZoom(attrs));
      }

      // add sector-lights (Arcs und Rays) to vector tile
      if (sf.tags().containsKey("seamark:light:1:colour")) {
        try {
          List<Lights.LightGeometry> lightGeometries = Lights.extractLightGeometries(sf, type);
          for (Lights.LightGeometry lightGeom : lightGeometries) {
            FeatureCollector.Feature lightFeature = features.geometry("light", lightGeom.geometry);
            // the namespaced id is what followHost joins on; osm_id stays for inspection
            lightFeature.setId(featureId(sf));
            lightFeature.setAttr("osm_id", sf.id());
            lightFeature.setAttr("type", type);
            lightGeom.attrs.forEach((k, v) -> lightFeature.setAttr(k, v));
            lightFeature.setMinZoom(SeamarkZoomRules.getLightMinZoom(attrs));
          }
        } catch (Exception e) {
          System.err.println("Error generating light geometries for OSM ID " + sf.id() + ": " + e);
        }
      }
    }
  }

  @Override
  public Map<String, List<VectorTile.Feature>> postProcessTileFeatures(
      TileCoord tileCoord, Map<String, List<VectorTile.Feature>> layers) {
    List<VectorTile.Feature> seamarks = layers.get("seamark");
    if (seamarks != null && !seamarks.isEmpty()) {
      List<VectorTile.Feature> numbered =
          numberPerCell(adoptColocatedLights(seamarks), tileCoord.z());
      layers.put("seamark", numbered);
      List<VectorTile.Feature> lights = layers.get("light");
      if (lights != null && !lights.isEmpty()) {
        layers.put("light", followHost(lights, numbered, seamarks));
      }
    }

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
          VectorTile.Feature newLandFeature =
              new VectorTile.Feature("land", 1, VectorTile.encodeGeometry(allLand), attrs);
          layers.put("land", List.of(newLandFeature));
        }
      } catch (Exception e) {
        System.err.println(
            "Error cutting water from land for tile " + tileCoord + ": " + e.getMessage());
      }
    }

    return layers;
  }

  /**
   * Numbers each point by its position among its own presentation family within a grid cell, most
   * important first, and writes that back as {@code cell_rank}. The style decides how many of a
   * family survive at a given zoom by thresholding this, so retuning that number costs a page
   * reload rather than a planet build.
   *
   * <p>This runs once per output tile and therefore once per zoom, which is what makes the
   * numbering scale-aware: the same 32-pixel cell holds one buoy at z14 and forty at z8. A cell
   * straddling a tile boundary is split, so a feature can number differently on either side of a
   * seam — the same artefact the label grids already have, and tolerable at this cell size.
   */
  /**
   * A lit aid standing on a structure lends the structure its reach. Mappers chart a lit corner
   * turbine as two co-located nodes — the turbine landmark and a light — which land in different
   * families and thin independently: the light survived while its turbine lost the structure budget
   * to unlit mid-field peers, exactly inverting the selection a farm needs. Within two pixels is
   * "standing on" through the zooms where budgets bite; beyond z13 everything draws.
   */
  private static List<VectorTile.Feature> adoptColocatedLights(List<VectorTile.Feature> features) {
    List<CoordinateXY> lights = new ArrayList<>();
    List<Object> reaches = new ArrayList<>();
    for (VectorTile.Feature feature : features) {
      if (feature.geometry().geomType() != GeometryType.POINT) continue;
      Object family = feature.tags().get("family");
      if (!SeamarkPriority.MINOR_AID.equals(family) && !SeamarkPriority.MAJOR_AID.equals(family))
        continue;
      Object range = feature.tags().get("light_range");
      if (range == null) continue;
      lights.add(feature.geometry().firstCoordinate());
      reaches.add(range);
    }
    if (lights.isEmpty()) return features;
    List<VectorTile.Feature> out = new ArrayList<>(features.size());
    for (VectorTile.Feature feature : features) {
      if (feature.geometry().geomType() == GeometryType.POINT
          && SeamarkPriority.STRUCTURE.equals(feature.tags().get("family"))
          && feature.tags().get("light_range") == null) {
        CoordinateXY at = feature.geometry().firstCoordinate();
        for (int i = 0; i < lights.size(); i++) {
          CoordinateXY light = lights.get(i);
          if (Math.hypot(at.x - light.x, at.y - light.y) <= 2.0) {
            feature = feature.copyWithExtraAttrs(Map.of("light_range", reaches.get(i)));
            break;
          }
        }
      }
      out.add(feature);
    }
    return out;
  }

  private static List<VectorTile.Feature> numberPerCell(
      List<VectorTile.Feature> features, int zoom) {
    Map<String, List<VectorTile.Feature>> cells = new LinkedHashMap<>();
    List<VectorTile.Feature> out = new ArrayList<>(features.size());
    for (VectorTile.Feature feature : features) {
      if (feature.geometry().geomType() != GeometryType.POINT) {
        out.add(feature);
        continue;
      }
      CoordinateXY at = feature.geometry().firstCoordinate();
      String cell =
          feature.tags().get("family")
              + "/"
              + Math.floorDiv((int) at.x, CELL_PIXELS)
              + "/"
              + Math.floorDiv((int) at.y, CELL_PIXELS);
      cells.computeIfAbsent(cell, key -> new ArrayList<>()).add(feature);
    }
    int cap = cellCap(zoom);
    for (List<VectorTile.Feature> cell : cells.values()) {
      // the id tiebreak makes equal ranks deterministic — a wind farm's turbines all tie, and
      // without it the survivors follow whatever input order planetiler happened to supply,
      // reshuffling the representative set between builds
      cell.sort(
          Comparator.<VectorTile.Feature>comparingInt(
                  feature -> SeamarkPriority.rank(feature.tags()))
              .thenComparingLong(VectorTile.Feature::id));
      for (int i = 0; i < cell.size(); i++) {
        VectorTile.Feature feature = cell.get(i);
        // The cap is a storage backstop, and it must not decide a safety question the style owns:
        // a hazard the mariner could set a safety depth around keeps its true cell_rank and rides
        // past the cap, for the style's exemption to find.
        if (i >= cap && !SeamarkPriority.neverCapped(feature.tags())) continue;
        out.add(feature.copyWithExtraAttrs(Map.of("cell_rank", i)));
      }
    }
    return out;
  }

  /**
   * Sector arcs and legs are generated geometry in their own layer, so they carry no position in a
   * cell of their own and would otherwise outlive the light that casts them — a thinned buoy
   * leaving its sectors drawn over empty water. Join each on `osm_id` to the mark it belongs to and
   * inherit that mark's budget.
   *
   * <p>An arc is wider than the tiles it is cut into, so a tile can hold a fragment of a ring whose
   * light it does not: a hostless join is ambiguous between "the light lies in a neighbouring tile"
   * and "the light was capped out of this one". The original seamark list disambiguates. A capped
   * host takes its geometry with it — an arc without its light drew, then flickered back in a zoom
   * later when the re-tiled cell gave the host a rank again. A true cross-tile fragment is kept
   * as-is, because amputating every ring at a tile edge is worse.
   */
  private static List<VectorTile.Feature> followHost(
      List<VectorTile.Feature> lights,
      List<VectorTile.Feature> hosts,
      List<VectorTile.Feature> beforeCap) {
    // The join key is the mvt feature id, which processFeature sets to the namespaced
    // featureId() on hosts and light geometry alike — raw OSM ids collide across the
    // node/way/relation namespaces and must not be joined on.
    Map<Long, VectorTile.Feature> byId = new HashMap<>();
    for (VectorTile.Feature host : hosts) {
      // a polygon host carries no cell_rank; its label point does, and shares the id
      if (host.id() > 0 && host.tags().get("cell_rank") != null) byId.putIfAbsent(host.id(), host);
    }
    Set<Long> inTile = new HashSet<>();
    for (VectorTile.Feature seamark : beforeCap) {
      if (seamark.id() > 0) inTile.add(seamark.id());
    }
    List<VectorTile.Feature> out = new ArrayList<>(lights.size());
    for (VectorTile.Feature light : lights) {
      VectorTile.Feature host = byId.get(light.id());
      if (host == null) {
        if (!inTile.contains(light.id())) out.add(light);
        continue;
      }
      Map<String, Object> inherited = new HashMap<>();
      inherited.put("cell_rank", host.tags().get("cell_rank"));
      Object family = host.tags().get("family");
      if (family != null) inherited.put("family", family);
      out.add(light.copyWithExtraAttrs(inherited));
    }
    return out;
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
