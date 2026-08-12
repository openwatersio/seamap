import static org.junit.jupiter.api.Assertions.assertEquals;
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
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;

class SeamapTest {

  private static final GeometryFactory GF = new GeometryFactory();

  private static List<FeatureCollector.Feature> seamarkFeatures(SimpleFeature sf) {
    FeatureCollector collector =
        new FeatureCollector.Factory(PlanetilerConfig.defaults(), Stats.inMemory()).get(sf);
    new Seamap().processFeature(sf, collector);
    List<FeatureCollector.Feature> out = new ArrayList<>();
    for (FeatureCollector.Feature f : collector) {
      if ("seamark".equals(f.getLayer())) out.add(f);
    }
    return out;
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
    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put("seamark", new ArrayList<>(List.of(features)));
    return new Seamap().postProcessTileFeatures(TileCoord.ofXYZ(0, 0, 12), layers);
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
    // deep rocks that are invisible, so they outrank on water level alone
    for (int i = 0; i < 8; i++) {
      crowd.add(
          seamark("deep " + i, 10, 10, "type", "rock", "water_level", "submerged", "depth", 20));
    }
    crowd.add(seamark("shoal", 10, 10, "type", "rock", "water_level", "covers", "depth", 1));
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
            "seamark", 1, VectorTile.encodeGeometry(GF.createPoint(new Coordinate(10, 10))), attrs);

    var arc = arcFor(42L, "buoy_lateral");
    // an arc wider than its tile leaves fragments in tiles that hold no trace of its light
    var fragment = arcFor(99L, "buoy_lateral");

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
    for (int i = 0; i < 9; i++) {
      Map<String, Object> attrs = new HashMap<>();
      attrs.put("name", "light " + i);
      attrs.put("type", "light_minor");
      attrs.put("osm_id", (long) i);
      attrs.put("light_range", 9 - i); // ranks 0..8 in reach order, so id 8 is the one capped
      attrs.put("family", SeamarkPriority.family(attrs));
      crowd.add(
          new VectorTile.Feature(
              "seamark",
              1,
              VectorTile.encodeGeometry(GF.createPoint(new Coordinate(10, 10))),
              attrs));
    }
    Map<String, List<VectorTile.Feature>> layers = new HashMap<>();
    layers.put("seamark", crowd);
    layers.put(
        "light", new ArrayList<>(List.of(arcFor(8L, "light_minor"), arcFor(99L, "light_minor"))));
    // z8: the cap is 8 per cell, so the ninth light is dropped from the tile
    var out = new Seamap().postProcessTileFeatures(TileCoord.ofXYZ(0, 0, 8), layers);

    var kept = out.get("light");
    assertEquals(1, kept.size(), "the capped light's arc must go with it: " + kept);
    assertEquals(99L, kept.get(0).tags().get("osm_id"), "the cross-tile fragment stays");
  }

  private static VectorTile.Feature arcFor(long osmId, String type) {
    Map<String, Object> attrs = new HashMap<>();
    attrs.put("osm_id", osmId);
    // light geometry carries its host's seamark type verbatim, and the join key relies on it
    attrs.put("type", type);
    attrs.put("subtype", "arc");
    var line = GF.createLineString(new Coordinate[] {new Coordinate(9, 9), new Coordinate(11, 11)});
    return new VectorTile.Feature("light", 1, VectorTile.encodeGeometry(line), attrs);
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
}
