import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

  /** A sector is a point at the light with the angles to rotate its symbols to. */
  @Test
  void emitsOnePointPerSector() {
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
      assertEquals("Point", sector.geometry.getGeometryType());
    }
    var first = sectors.stream().filter(g -> "red".equals(g.attrs.get("color"))).findFirst().get();
    assertEquals(10.0, first.attrs.get("sector_start"));
    assertEquals(60.0, first.attrs.get("sector_width"));
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

  /** Width wraps through north rather than going negative. */
  @Test
  void widthWrapsThroughNorth() {
    var all =
        sectorsOf(light("seamark:light:1:sector_start", "350", "seamark:light:1:sector_end", "20"));
    assertEquals(30.0, of(all, "sector").get(0).attrs.get("sector_width"));
  }

  /** The smaller of an overlapping pair reaches further out, so the wider cannot bury it. */
  @Test
  void marksTheSmallerOfTwoOverlappingSectors() {
    var all =
        sectorsOf(
            light(
                "seamark:light:1:sector_start", "0",
                "seamark:light:1:sector_end", "180",
                "seamark:light:2:sector_start", "80",
                "seamark:light:2:sector_end", "100"));
    var wide = of(all, "sector").stream().filter(g -> g.attrs.get("sector_width").equals(180.0));
    var narrow = of(all, "sector").stream().filter(g -> g.attrs.get("sector_width").equals(20.0));
    assertFalse(wide.findFirst().get().attrs.containsKey("extended"));
    assertTrue((Boolean) narrow.findFirst().get().attrs.get("extended"));
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
