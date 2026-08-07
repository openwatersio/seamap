import static org.junit.jupiter.api.Assertions.assertEquals;

import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.config.PlanetilerConfig;
import com.onthegomap.planetiler.reader.SimpleFeature;
import com.onthegomap.planetiler.stats.Stats;
import java.util.ArrayList;
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
}
