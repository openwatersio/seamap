import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;
import org.junit.jupiter.api.Test;

class SeamarkTest {

  @Test
  void singleLight() {
    assertEquals(
        "Fl.W.5s10M",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:colour", "white",
                "seamark:light:character", "Fl",
                "seamark:light:period", "5",
                "seamark:light:range", "10")));
  }

  /** A group goes in brackets, and the colour follows it with no separator. */
  @Test
  void groupHeightAndRange() {
    assertEquals(
        "Fl(3)WRG.10s15m12M",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:colour", "white;red;green",
                "seamark:light:character", "Fl",
                "seamark:light:group", "3",
                "seamark:light:period", "10",
                "seamark:light:height", "15",
                "seamark:light:range", "12")));
  }

  /** Every sector colour survives, in sector order, and the range is the longest of them. */
  @Test
  void sectoredLight() {
    assertEquals(
        "Fl.WRG.10s12M",
        Seamark.seamarkLightAbbr(
            Map.ofEntries(
                Map.entry("seamark:light:1:colour", "white"),
                Map.entry("seamark:light:1:character", "Fl"),
                Map.entry("seamark:light:1:period", "10"),
                Map.entry("seamark:light:1:range", "12"),
                Map.entry("seamark:light:2:colour", "red"),
                Map.entry("seamark:light:2:range", "10"),
                Map.entry("seamark:light:3:colour", "green"),
                Map.entry("seamark:light:3:range", "10"))));
  }

  /** A colour repeated across sectors is named once. */
  @Test
  void sectoredLightNamesEachColourOnce() {
    assertEquals(
        "Fl.WR.10s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:1:colour", "white",
                "seamark:light:1:character", "Fl",
                "seamark:light:1:period", "10",
                "seamark:light:2:colour", "red",
                "seamark:light:3:colour", "white")));
  }

  /**
   * Two-letter abbreviations, an unmapped colour falling back to its initial, and no dangling
   * separators when the light carries nothing but a colour.
   */
  @Test
  void colourAbbreviations() {
    assertEquals(
        "BuOrP", Seamark.seamarkLightAbbr(Map.of("seamark:light:colour", "blue;orange;pink")));
  }

  @Test
  void noLight() {
    assertNull(Seamark.seamarkLightAbbr(Map.of("seamark:type", "buoy_lateral")));
  }
}
