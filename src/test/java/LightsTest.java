import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.onthegomap.planetiler.reader.SimpleFeature;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;

class LightsTest {

  private static final GeometryFactory GF = new GeometryFactory();

  private static List<Lights.LightGeometry> sectorsOf(Map<String, Object> tags) {
    var sf = SimpleFeature.create(GF.createPoint(new Coordinate(11.0, 55.0)), tags, "osm", null, 1);
    return Lights.extractLightGeometries(sf, "light_major");
  }

  private static Map<String, Object> light(String... keyValues) {
    Map<String, Object> tags = new HashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) tags.put(keyValues[i], keyValues[i + 1]);
    return tags;
  }

  private static List<Lights.LightGeometry> of(List<Lights.LightGeometry> all, String subtype) {
    return all.stream().filter(g -> subtype.equals(g.attrs.get("subtype"))).toList();
  }

  /** Each sector is an arc line on the ground, coloured like its light. */
  @Test
  void emitsOneArcPerSector() {
    var all =
        sectorsOf(
            light(
                "seamark:light:1:colour", "red",
                "seamark:light:1:sector_start", "10",
                "seamark:light:1:sector_end", "70",
                "seamark:light:2:colour", "green",
                "seamark:light:2:sector_start", "70",
                "seamark:light:2:sector_end", "180"));
    var sectors = of(all, "sector");
    assertEquals(2, sectors.size());
    for (var sector : sectors) {
      assertEquals("LineString", sector.geometry.getGeometryType());
    }
    assertTrue(sectors.stream().anyMatch(g -> "red".equals(g.attrs.get("color"))));
    assertTrue(sectors.stream().anyMatch(g -> "green".equals(g.attrs.get("color"))));
  }

  /** Adjacent sectors share a limit, and one leg per bearing is enough. */
  @Test
  void emitsOneLegPerLimit() {
    var all =
        sectorsOf(
            light(
                "seamark:light:1:sector_start", "10",
                "seamark:light:1:sector_end", "70",
                "seamark:light:2:sector_start", "70",
                "seamark:light:2:sector_end", "180"));
    assertEquals(3, of(all, "leg").size(), "10, 70 and 180 — not 70 twice");
  }

  /** The arc wraps through north rather than going the long way round backwards. */
  @Test
  void arcWrapsThroughNorth() {
    var all =
        sectorsOf(light("seamark:light:1:sector_start", "350", "seamark:light:1:sector_end", "20"));
    // 1° steps over a 30° sector: anything near 330 points means it went the wrong way
    assertEquals(31, of(all, "sector").get(0).geometry.getNumPoints());
  }

  /** The smaller of an overlapping pair reaches further out, so the wider cannot bury it. */
  @Test
  void marksTheSmallerOfTwoOverlappingSectors() throws Exception {
    var tags =
        light(
            "seamark:light:1:sector_start", "0",
            "seamark:light:1:sector_end", "180",
            "seamark:light:2:sector_start", "80",
            "seamark:light:2:sector_end", "100");
    var sf = SimpleFeature.create(GF.createPoint(new Coordinate(11.0, 55.0)), tags, "osm", null, 1);
    var center = sf.worldGeometry().getCentroid().getCoordinate();
    var sectors = of(Lights.extractLightGeometries(sf, "light_major"), "sector");
    var wide = sectors.stream().filter(g -> !g.attrs.containsKey("extended")).findFirst().get();
    var narrow = sectors.stream().filter(g -> g.attrs.containsKey("extended")).findFirst().get();
    assertEquals(181, wide.geometry.getNumPoints());
    assertEquals(21, narrow.geometry.getNumPoints());
    double wideRadius = wide.geometry.getCoordinates()[0].distance(center);
    double narrowRadius = narrow.geometry.getCoordinates()[0].distance(center);
    assertTrue(narrowRadius > wideRadius, "extended sector reaches past the one that overlaps it");
  }

  /** An all-round light gets a flare, never an arc. */
  @Test
  void skipsLightsWithNoRealSector() {
    assertTrue(sectorsOf(light("seamark:light:1:colour", "white")).isEmpty());
    assertTrue(
        sectorsOf(
                light(
                    "seamark:light:1:sector_start", "0",
                    "seamark:light:1:sector_end", "360"))
            .isEmpty());
  }
}
