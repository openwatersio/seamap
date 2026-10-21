import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.VectorTile;
import com.onthegomap.planetiler.config.PlanetilerConfig;
import com.onthegomap.planetiler.geo.TileCoord;
import com.onthegomap.planetiler.reader.SimpleFeature;
import com.onthegomap.planetiler.stats.Stats;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.algorithm.Orientation;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;

class SeamapTest {

  private static final GeometryFactory GF = new GeometryFactory();

  private static List<FeatureCollector.Feature> layerFeatures(SimpleFeature sf, String layer) {
    FeatureCollector collector =
        new FeatureCollector.Factory(PlanetilerConfig.defaults(), Stats.inMemory()).get(sf);
    new Seamap().processFeature(sf, collector);
    List<FeatureCollector.Feature> out = new ArrayList<>();
    for (FeatureCollector.Feature f : collector) {
      if (layer.equals(f.getLayer())) out.add(f);
    }
    return out;
  }

  private static List<FeatureCollector.Feature> seamarkFeatures(SimpleFeature sf) {
    return layerFeatures(sf, "seamark");
  }

  /** A degree square on the equator: ~12,300 km², a Chesapeake-sized bay. */
  private static Polygon degreeSquare() {
    return GF.createPolygon(
        new Coordinate[] {
          new Coordinate(0, 0),
          new Coordinate(1, 0),
          new Coordinate(1, 1),
          new Coordinate(0, 1),
          new Coordinate(0, 0)
        });
  }

  /** A bay's name appears at the zoom its water grows wide enough to hold it. */
  @Test
  void bayEmitsLabelPointSizedByArea() {
    SimpleFeature sf =
        SimpleFeature.create(
            degreeSquare(), Map.of("natural", "bay", "name", "Test Bay"), "osm", null, 1);
    List<FeatureCollector.Feature> out = layerFeatures(sf, "sea_area");
    assertEquals(1, out.size());
    assertEquals("Test Bay", out.get(0).getAttrsAtZoom(14).get("name"));
    assertEquals("bay", out.get(0).getAttrsAtZoom(14).get("category"));
    assertEquals(6, out.get(0).getMinZoom());
  }

  /** A lake is a water polygon, not a named sea area — one name, from one layer. */
  @Test
  void lakeIsNotASeaArea() {
    SimpleFeature sf =
        SimpleFeature.create(
            degreeSquare(), Map.of("natural", "water", "name", "Test Lake"), "osm", null, 1);
    assertEquals(0, layerFeatures(sf, "sea_area").size());
    assertEquals(1, layerFeatures(sf, "water").size());
  }

  /** A point source is already its own label; a second centroid would draw the name twice. */
  @Test
  void pointLandmarkEmitsOneFeature() {
    Point point = GF.createPoint(new Coordinate(-70.67, 41.42));
    SimpleFeature sf =
        SimpleFeature.create(
            point, Map.of("man_made", "tower", "name", "West Tisbury Fire Tower"), "osm", null, 1);
    assertEquals(1, seamarkFeatures(sf).size());
  }

  /** Polygon landmarks keep the extra pointOnSurface label alongside the polygon. */
  @Test
  void polygonLandmarkEmitsLabelPoint() {
    Polygon polygon =
        GF.createPolygon(
            new Coordinate[] {
              new Coordinate(0, 0),
              new Coordinate(0, 0.001),
              new Coordinate(0.001, 0.001),
              new Coordinate(0, 0)
            });
    SimpleFeature sf =
        SimpleFeature.create(
            polygon, Map.of("seamark:type", "landmark", "seamark:name", "Test"), "osm", null, 2);
    assertEquals(2, seamarkFeatures(sf).size());
  }

  /** A seamark point at tile-pixel x/y, classified the way processFeature classifies it. */
  private static VectorTile.Feature seamark(String name, double x, double y, Object... keyValues) {
    Map<String, Object> attrs = new HashMap<>();
    attrs.put("name", name);
    for (int i = 0; i < keyValues.length; i += 2)
      attrs.put((String) keyValues[i], keyValues[i + 1]);
    attrs.put("family", SeamarkPriority.family(attrs));
    Point point = GF.createPoint(new Coordinate(x, y));
    return new VectorTile.Feature("seamark", 1, VectorTile.encodeGeometry(point), attrs);
  }

  private static Map<String, List<VectorTile.Feature>> numbered(VectorTile.Feature... features) {
    // the North Sea, where a z12 pixel is about 23 metres
    return numberedAt(TileCoord.ofXYZ(2100, 1350, 12), features);
  }

  private static Map<String, List<VectorTile.Feature>> numberedAt(
      TileCoord tile, VectorTile.Feature... features) {
    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put("seamark", new ArrayList<>(List.of(features)));
    return new Seamap().postProcessTileFeatures(tile, layers);
  }

  private static Object tag(Map<String, List<VectorTile.Feature>> layers, String name, String key) {
    for (VectorTile.Feature feature : layers.get("seamark")) {
      if (name.equals(feature.tags().get("name"))) return feature.tags().get(key);
    }
    throw new AssertionError("no seamark named " + name);
  }

  private static Object cellRank(Map<String, List<VectorTile.Feature>> layers, String name) {
    for (VectorTile.Feature feature : layers.get("seamark")) {
      if (name.equals(feature.tags().get("name"))) return feature.tags().get("cell_rank");
    }
    throw new AssertionError("no seamark named " + name);
  }

  /** Within a cell, the dangerous hazard is numbered before the harmless one. */
  @Test
  void pointsNumberByRankWithinACell() {
    var layers =
        numbered(
            seamark("dry", 20, 20, "type", "rock", "water_level", "dry"),
            seamark("submerged", 10, 10, "type", "rock", "water_level", "submerged"));
    assertEquals(0, cellRank(layers, "submerged"));
    assertEquals(1, cellRank(layers, "dry"));
  }

  /** Each family spends its own budget, so a harbour is never displaced by the buoys around it. */
  @Test
  void familiesAreNumberedSeparately() {
    var layers =
        numbered(
            seamark("rock", 10, 10, "type", "rock"),
            seamark("marina", 12, 12, "type", "harbour", "category", "marina"),
            seamark("buoy", 14, 14, "type", "buoy_lateral"),
            seamark("other buoy", 16, 16, "type", "buoy_lateral"));
    assertEquals(0, cellRank(layers, "rock"));
    assertEquals(0, cellRank(layers, "marina"));
    assertEquals(0, cellRank(layers, "buoy"));
    assertEquals(1, cellRank(layers, "other buoy"));
  }

  /** A lit aid standing on a turbine lends it its reach, so lit corners win the budget. */
  @Test
  void colocatedLightPromotesItsStructure() {
    // two turbines in one cell; a light node stands 12 metres from the higher-id one
    var litTurbine = seamark("lit corner", 20, 20, "type", "landmark", "category", "windmotor");
    var plainTurbine = seamark("mid field", 10, 10, "type", "landmark", "category", "windmotor");
    var light =
        seamark("corner light", 20.5, 20, "type", "light_minor", "light_range", 5, "osm_id", 7L);
    var layers = numbered(plainTurbine, litTurbine, light);
    assertEquals(0, cellRank(layers, "lit corner"));
    assertEquals(1, cellRank(layers, "mid field"));
  }

  /** Tile pixels per kilometre on the ground at the centre of a tile. */
  private static double pxPerKm(TileCoord tile) {
    double n = 1 << tile.z();
    return 256 * n * Math.cosh(Math.PI * (1 - 2 * (tile.y() + 0.5) / n)) / 40_075.017;
  }

  private static Object adopted(TileCoord tile, double dx, double dy, double x, double y) {
    var turbine = seamark("turbine", x, y, "type", "landmark", "category", "windmotor");
    var light = seamark("light", x + dx, y + dy, "type", "light_minor", "light_range", 5);
    return tag(numberedAt(tile, turbine, light), "turbine", "light_range");
  }

  /**
   * Co-location is a distance on the ground. At z6 over the Netherlands a pixel is about 1.5 km, so
   * a windmill 2 km from a lighthouse sits barely a pixel away yet must not inherit its reach; a
   * light a few metres off its structure adopts at every zoom.
   */
  @Test
  void colocationIsMeasuredInMetres() {
    var z6 = TileCoord.ofXYZ(33, 21, 6);
    var windmill = seamark("windmill", 20, 20, "type", "landmark", "category", "windmotor");
    var lighthouse =
        seamark("lighthouse", 20 + 2 * pxPerKm(z6), 20, "type", "light_major", "light_range", 28);
    assertNull(tag(numberedAt(z6, windmill, lighthouse), "windmill", "light_range"));
    assertNull(adopted(z6, 0.5 * pxPerKm(z6), 0, 20, 20));

    for (int z = 6; z <= 14; z++) {
      int scale = 1 << (z - 6);
      var tile = TileCoord.ofXYZ(33 * scale, 21 * scale, z);
      assertEquals(5, adopted(tile, 0.005 * pxPerKm(tile), 0, 20, 20), "z" + z);
    }

    var z14 = TileCoord.ofXYZ(33 << 8, 21 << 8, 14);
    assertEquals(5, adopted(z14, 0.015 * pxPerKm(z14), 0, 20, 20));
    assertNull(adopted(z14, 0.03 * pxPerKm(z14), 0, 20, 20));
  }

  /**
   * Tile coordinates arrive rounded to 1/16 px, which can push a pair just inside the radius a
   * diagonal step apart: 19.5 m at the equator at z10 rounds to 0.18 px against 0.13 px.
   */
  @Test
  void colocationAllowsForCoordinateRounding() {
    assertEquals(5, adopted(TileCoord.ofXYZ(512, 512, 10), 0.09, 0.09, 20.03, 20.03));
    assertEquals(5, adopted(TileCoord.ofXYZ(33, 21, 6), 0.0625, 0.0625, 20, 20));
  }

  /** A structure between two lights takes the reach of the one standing on it. */
  @Test
  void structureAdoptsTheNearestLight() {
    var tile = TileCoord.ofXYZ(33 << 8, 21 << 8, 14);
    double tenMetres = 0.01 * pxPerKm(tile);
    var turbine = seamark("turbine", 20, 20, "type", "landmark", "category", "windmotor");
    var far = seamark("far", 20 + 1.5 * tenMetres, 20, "type", "light_major", "light_range", 20);
    var near = seamark("near", 20, 20 + 0.2 * tenMetres, "type", "light_minor", "light_range", 5);
    assertEquals(5, tag(numberedAt(tile, turbine, far, near), "turbine", "light_range"));
  }

  /** Equal ranks break ties on the stable feature id, not planetiler's input order. */
  @Test
  void equalRanksTieBreakOnFeatureId() {
    Map<String, Object> attrs = new HashMap<>();
    attrs.put("type", "landmark");
    attrs.put("category", "windmotor");
    attrs.put("family", SeamarkPriority.family(attrs));
    var later =
        new VectorTile.Feature(
            "seamark", 7, VectorTile.encodeGeometry(GF.createPoint(new Coordinate(10, 10))), attrs);
    var earlier =
        new VectorTile.Feature(
            "seamark", 3, VectorTile.encodeGeometry(GF.createPoint(new Coordinate(12, 12))), attrs);
    // insertion order says `later` first; the id says otherwise
    var layers = numbered(later, earlier);
    for (VectorTile.Feature f : layers.get("seamark")) {
      assertEquals(f.id() == 3 ? 0 : 1, f.tags().get("cell_rank"));
    }
  }

  /** Numbering is per cell: a neighbour two cells away competes for nothing. */
  @Test
  void cellsAreNumberedIndependently() {
    var layers =
        numbered(
            seamark("here", 10, 10, "type", "rock"), seamark("there", 100, 100, "type", "rock"));
    assertEquals(0, cellRank(layers, "here"));
    assertEquals(0, cellRank(layers, "there"));
  }

  /**
   * A floor answers whether a class may ever appear at a zoom, which density cannot. Wind turbines
   * reach z6 so a wind farm reads as a few marks rather than nothing; a plain tower is Coastal
   * detail; facilities wait for z14 because no style layer draws them earlier.
   */
  @Test
  void classFloorsBoundWhatReachesATile() {
    assertEquals(
        6, SeamarkZoomRules.getMinZoom(Map.of("type", "landmark", "category", "windmotor")));
    assertEquals(10, SeamarkZoomRules.getMinZoom(Map.of("type", "landmark")));
    assertEquals(14, SeamarkZoomRules.getMinZoom(Map.of("type", "small_craft_facility")));
  }

  /** The storage backstop: a tile never carries more of one family in a cell than the cap. */
  @Test
  void cellsAreCappedForStorage() {
    VectorTile.Feature[] crowd = new VectorTile.Feature[20];
    for (int i = 0; i < crowd.length; i++) {
      crowd[i] = seamark("mast " + i, 10, 10, "type", "landmark", "light_range", 9 - i % 9);
    }
    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put("seamark", new ArrayList<>(List.of(crowd)));
    var capped = new Seamap().postProcessTileFeatures(TileCoord.ofXYZ(0, 0, 8), layers);
    assertEquals(8, capped.get("seamark").size());
    // and it keeps the ones that carry furthest, not the first eight it happened to see
    assertEquals(0, cellRank(capped, "mast 0"));
  }

  /**
   * The cap and the style's safety-depth exemption have to compose. A hazard the mariner could set
   * a safety depth around must reach the tile whatever its rank, because the style is the only
   * thing that knows the depth and it cannot exempt a feature that was never sent.
   */
  @Test
  void theCapNeverRemovesAHazardTheStyleCouldExempt() {
    List<VectorTile.Feature> crowd = new ArrayList<>();
    // the same depth band and a more severe water level, so the shoal genuinely ranks ninth
    // and only the retention rule can carry it past the cap of eight
    for (int i = 0; i < 8; i++) {
      crowd.add(
          seamark("peer " + i, 10, 10, "type", "rock", "water_level", "submerged", "depth", 1));
    }
    crowd.add(seamark("shoal", 10, 10, "type", "rock", "water_level", "covers", "depth", 1.5));
    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put("seamark", crowd);
    var kept = new Seamap().postProcessTileFeatures(TileCoord.ofXYZ(0, 0, 8), layers);
    var names = kept.get("seamark").stream().map(f -> f.tags().get("name")).toList();
    assertTrue(names.contains("shoal"), "1 m rock dropped by the cap: " + names);
  }

  /** Generated sector geometry inherits its host's budget; fragments without a host survive. */
  @Test
  void sectorGeometryFollowsItsHost() {
    Map<String, Object> attrs = new HashMap<>();
    attrs.put("name", "lit buoy");
    attrs.put("type", "buoy_lateral");
    attrs.put("osm_id", 42L);
    attrs.put("family", SeamarkPriority.family(attrs));
    var host =
        new VectorTile.Feature(
            "seamark",
            42,
            VectorTile.encodeGeometry(GF.createPoint(new Coordinate(10, 10))),
            attrs);

    var arc = arcFor(42L);
    // an arc wider than its tile leaves fragments in tiles that hold no trace of its light
    var fragment = arcFor(99L);

    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put("seamark", new ArrayList<>(List.of(host)));
    layers.put("light", new ArrayList<>(List.of(arc, fragment)));
    var out = new Seamap().postProcessTileFeatures(TileCoord.ofXYZ(0, 0, 12), layers);

    var kept = out.get("light");
    assertEquals(2, kept.size(), "a fragment from a neighbouring tile's light must not be dropped");
    var joined = kept.stream().filter(f -> f.tags().get("osm_id").equals(42L)).findFirst().get();
    assertEquals(0, joined.tags().get("cell_rank"));
    assertEquals("minor_aid", joined.tags().get("family"));
    var kept99 = kept.stream().filter(f -> f.tags().get("osm_id").equals(99L)).findFirst().get();
    assertEquals(null, kept99.tags().get("cell_rank"), "a fragment carries no rank of its own");
  }

  /**
   * A hostless join is ambiguous: light in a neighbouring tile, or capped out of this one? A capped
   * host takes its geometry with it — otherwise the arc draws without its light at one zoom and
   * flickers back at the next, when the re-tiled cell gives the host a rank again.
   */
  @Test
  void aCappedHostTakesItsSectorGeometryWithIt() {
    List<VectorTile.Feature> crowd = new ArrayList<>();
    for (int id = 1; id <= 9; id++) {
      Map<String, Object> attrs = new HashMap<>();
      attrs.put("name", "light " + id);
      attrs.put("type", "light_minor");
      attrs.put("osm_id", (long) id);
      attrs.put("light_range", 10 - id); // ranks in reach order, so id 9 is the one capped
      attrs.put("family", SeamarkPriority.family(attrs));
      crowd.add(
          new VectorTile.Feature(
              "seamark",
              id,
              VectorTile.encodeGeometry(GF.createPoint(new Coordinate(10, 10))),
              attrs));
    }
    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put("seamark", crowd);
    layers.put("light", new ArrayList<>(List.of(arcFor(9L), arcFor(99L))));
    // z8: the cap is 8 per cell, so the ninth light is dropped from the tile
    var out = new Seamap().postProcessTileFeatures(TileCoord.ofXYZ(0, 0, 8), layers);

    var kept = out.get("light");
    assertEquals(1, kept.size(), "the capped light's arc must go with it: " + kept);
    assertEquals(99L, kept.get(0).id(), "the cross-tile fragment stays");
  }

  private static VectorTile.Feature arcFor(long id) {
    Map<String, Object> attrs = new HashMap<>();
    attrs.put("osm_id", id);
    attrs.put("subtype", "arc");
    var line = GF.createLineString(new Coordinate[] {new Coordinate(9, 9), new Coordinate(11, 11)});
    // the join key is the mvt feature id, matching processFeature's featureId()
    return new VectorTile.Feature("light", id, VectorTile.encodeGeometry(line), attrs);
  }

  /** Lines and polygons carry no position in a cell, and keep the attributes they arrived with. */
  @Test
  void nonPointsPassThroughUnnumbered() {
    Map<String, Object> attrs = new HashMap<>();
    attrs.put("name", "fairway");
    attrs.put("type", "separation_lane");
    attrs.put("family", SeamarkPriority.family(attrs));
    var line = GF.createLineString(new Coordinate[] {new Coordinate(0, 0), new Coordinate(50, 50)});
    var layers =
        numbered(new VectorTile.Feature("seamark", 1, VectorTile.encodeGeometry(line), attrs));
    assertNull(cellRank(layers, "fairway"));
  }

  private static Polygon square(double x, double y, double size) {
    return GF.createPolygon(
        new Coordinate[] {
          new Coordinate(x, y),
          new Coordinate(x + size, y),
          new Coordinate(x + size, y + size),
          new Coordinate(x, y + size),
          new Coordinate(x, y)
        });
  }

  private static VectorTile.Feature tileFeature(String layer, Polygon polygon) {
    return new VectorTile.Feature(layer, 1, VectorTile.encodeGeometry(polygon), Map.of());
  }

  /**
   * A mainland reaching the buffer edge, cut by a visible lake and a sub-pixel pond, with a
   * sub-pixel islet offshore and a sub-pixel piece of a bigger island clipped at the buffer edge.
   */
  private static Geometry cutLand(Seamap profile, int zoom) {
    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put(
        "land",
        List.of(
            tileFeature("land", square(-4, -4, 104)),
            tileFeature("land", square(200, 200, 0.5)),
            tileFeature("land", square(-4, 150, 0.5))));
    layers.put(
        "water",
        List.of(
            tileFeature("water", square(10, 10, 20)), tileFeature("water", square(60, 60, 0.5))));
    try {
      return profile
          .postProcessTileFeatures(TileCoord.ofXYZ(0, 0, zoom), layers)
          .get("land")
          .get(0)
          .geometry()
          .decode();
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }

  private static int rings(Geometry geometry) {
    int rings = 0;
    for (int i = 0; i < geometry.getNumGeometries(); i++)
      rings += 1 + ((Polygon) geometry.getGeometryN(i)).getNumInteriorRing();
    return rings;
  }

  @Test
  void landDropsSpecksBelowTopZoomButKeepsClippedRings() {
    // mainland, lake and the clipped island stay; the free pond and islet go
    assertEquals(3, rings(cutLand(new Seamap(), 4)));
    assertEquals(5, rings(cutLand(new Seamap(), 14)));
    // a regional build's top zoom keeps everything too
    assertEquals(5, rings(cutLand(new Seamap(12), 12)));
  }

  /** MVT wants exterior rings clockwise in y-down tile space: positive shoelace area. */
  @Test
  void landRingsWindTheWayMvtExpects() {
    for (int zoom : new int[] {4, 14}) {
      Polygon land = (Polygon) cutLand(new Seamap(), zoom).getGeometryN(0);
      assertTrue(Orientation.isCCW(land.getExteriorRing().getCoordinates()), "z" + zoom);
      assertFalse(Orientation.isCCW(land.getInteriorRingN(0).getCoordinates()), "z" + zoom);
    }
  }
}
