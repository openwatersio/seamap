import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.onthegomap.planetiler.reader.SimpleFeature;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;

class SeamarkTest {

  private static final GeometryFactory GF = new GeometryFactory();

  private static Map<String, Object> attrs(Map<String, Object> tags) {
    return Seamark.extractSeamarkAttributes(
        SimpleFeature.create(GF.createPoint(new Coordinate(10.2, 56.1)), tags));
  }

  /** Every quadrant gets its own colours and cones, not North's (IALA R1001 2.2.4). */
  @Test
  void cardinalQuadrantDefaults() {
    var north =
        attrs(Map.of("seamark:type", "buoy_cardinal", "seamark:buoy_cardinal:category", "north"));
    assertEquals("black_yellow", north.get("color"));
    assertEquals("2_cones_up", north.get("topmark_shape"));

    var east =
        attrs(Map.of("seamark:type", "buoy_cardinal", "seamark:buoy_cardinal:category", "east"));
    assertEquals("black_yellow_black", east.get("color"));
    assertEquals("2_cones_base_together", east.get("topmark_shape"));

    var south =
        attrs(Map.of("seamark:type", "buoy_cardinal", "seamark:buoy_cardinal:category", "south"));
    assertEquals("yellow_black", south.get("color"));
    assertEquals("2_cones_down", south.get("topmark_shape"));

    var west =
        attrs(
            Map.of("seamark:type", "beacon_cardinal", "seamark:beacon_cardinal:category", "west"));
    assertEquals("yellow_black_yellow", west.get("color"));
    assertEquals("2_cones_point_together", west.get("topmark_shape"));
  }

  /** A cardinal with no quadrant gets no colour guess: a wrong quadrant inverts safe water. */
  @Test
  void cardinalWithoutQuadrantGetsNoColourDefault() {
    var unknown = attrs(Map.of("seamark:type", "buoy_cardinal"));
    assertNull(unknown.get("color"));
    assertNull(unknown.get("topmark_shape"));
    assertEquals("pillar", unknown.get("shape"));
  }

  /** Isolated danger is black with red bands (BRB), not the inverse (R1001 2.3.2.2). */
  @Test
  void isolatedDangerDefaults() {
    var buoy = attrs(Map.of("seamark:type", "buoy_isolated_danger"));
    assertEquals("black_red_black", buoy.get("color"));
    assertEquals("2_spheres", buoy.get("topmark_shape"));
  }

  /** An explicitly tagged pile beacon stays a pile instead of being rewritten to buoyant. */
  @Test
  void explicitPileShapeSurvives() {
    var pile =
        attrs(Map.of("seamark:type", "beacon_lateral", "seamark:beacon_lateral:shape", "pile"));
    assertEquals("pile", pile.get("shape"));
  }

  /**
   * A lone W is not charted: only sector and alternating lights name white (Chart No. 1 P-11.1).
   */
  @Test
  void singleLight() {
    assertEquals(
        "Fl.5s10M",
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

  /** A sectored light keeps its W even when white is the only colour. */
  @Test
  void sectoredWhiteKeepsW() {
    assertEquals(
        "Iso.W.4s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:1:colour", "white",
                "seamark:light:1:character", "Iso",
                "seamark:light:1:period", "4")));
  }

  /** An alternating white light keeps its W (Chart No. 1 P-11.1). */
  @Test
  void alternatingWhiteKeepsW() {
    assertEquals(
        "Al.Fl.W.5s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:colour", "white",
                "seamark:light:character", "Al.Fl",
                "seamark:light:period", "5")));
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

  // Cases adapted from k-yle/light-characteristics' corpus (src/__tests__/sampleData.ts,
  // MIT), reshaped to this chart's conventions: merged sector colours, minor lights without
  // elevation/range (S-4 B-471.6/.7), no trivial (1) group on simple characters.

  /** A light with a character but no colour still prints its character. */
  @Test
  void characterOnly() {
    assertEquals("FlLFl", Seamark.seamarkLightAbbr(Map.of("seamark:light:character", "FlLFl")));
  }

  /** Aero prefix; a minor light's elevation is omitted (S-4 B-471.6). */
  @Test
  void aeroLight() {
    assertEquals(
        "AeroF.RY",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "F",
                "seamark:light:category", "aero",
                "seamark:light:colour", "red;yellow",
                "seamark:light:height", "5")));
  }

  /** The group of a composite character goes inside the plus: UQ(1)+LFl, never UQ+LFl(1). */
  @Test
  void compositeCharacterGroup() {
    assertEquals(
        "UQ(1)+LFl.MBu",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "UQ+LFl",
                "seamark:light:group", "1",
                "seamark:light:colour", "magenta;blue")));
  }

  /** multiple prefixes the character: 2 Oc lights read 2Oc. */
  @Test
  void multipleLights() {
    assertEquals(
        "2Oc.2s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "Oc",
                "seamark:light:multiple", "2",
                "seamark:light:period", "2",
                "seamark:light:height", "4",
                "seamark:light:range", "0.1")));
  }

  /** A major light keeps decimal height and range: no rounding 39.4m to 39m. */
  @Test
  void decimalHeightAndRange() {
    assertEquals(
        "Fl(3)R.8s39.4m10.5M",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "Fl",
                "seamark:light:group", "3",
                "seamark:light:colour", "red",
                "seamark:light:period", "8",
                "seamark:light:height", "39.4",
                "seamark:light:range", "10.5")));
  }

  /** Dir prefix for a directional light (the Saint Leonards case from the corpus). */
  @Test
  void directionalLight() {
    assertEquals(
        "DirAl.Fl.WRG.23m21M",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "Al.Fl",
                "seamark:light:category", "directional",
                "seamark:light:colour", "white;red;green",
                "seamark:light:height", "23",
                "seamark:light:range", "21")));
  }

  /** Disposition suffix; a minor light's elevation is omitted. */
  @Test
  void verticalDisposition() {
    assertEquals(
        "F.YGR(vert)",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "F",
                "seamark:light:category", "vertical",
                "seamark:light:colour", "yellow;green;red",
                "seamark:light:height", "49")));
  }

  /** A composite group like (2+1) survives intact. */
  @Test
  void compositeGroup() {
    assertEquals(
        "VQ(2+1)G.6s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "VQ",
                "seamark:light:group", "2+1",
                "seamark:light:colour", "green",
                "seamark:light:period", "6",
                "seamark:light:height", "5",
                "seamark:light:range", "3")));
  }

  /** A light_major keeps elevation and range regardless of its nominal range. */
  @Test
  void majorTypeKeepsHeightAndRange() {
    assertEquals(
        "Fl.5s12m3M",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:type", "light_major",
                "seamark:light:colour", "white",
                "seamark:light:character", "Fl",
                "seamark:light:period", "5",
                "seamark:light:height", "12",
                "seamark:light:range", "3")));
  }

  /** A fog signal prints on its own line below the light. */
  @Test
  void lightWithFogSignal() {
    assertEquals(
        "Fl.R.5s\nHorn(2)30s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:colour", "red",
                "seamark:light:character", "Fl",
                "seamark:light:period", "5",
                "seamark:fog_signal:category", "horn",
                "seamark:fog_signal:group", "2",
                "seamark:fog_signal:period", "30")));
  }

  /** A fog signal alone still describes itself; a (1) group is trivial and dropped. */
  @Test
  void fogSignalAlone() {
    assertEquals(
        "Bell.8s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:fog_signal:category", "bell",
                "seamark:fog_signal:group", "1",
                "seamark:fog_signal:period", "8")));
  }

  /** Duplicate colours within one light are disposition (three lamps G/W/G) and survive. */
  @Test
  void duplicateColoursWithinOneLight() {
    assertEquals(
        "F.GWG",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "F",
                "seamark:light:colour", "green;white;green")));
  }

  /** A period tagged 5.0 prints as 5s; real decimals like 1.5 survive. */
  @Test
  void numericPeriodNormalization() {
    assertEquals(
        "Fl.G.5s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "Fl",
                "seamark:light:colour", "green",
                "seamark:light:period", "5.0")));
    assertEquals(
        "Fl.G.1.5s",
        Seamark.seamarkLightAbbr(
            Map.of(
                "seamark:light:character", "Fl",
                "seamark:light:colour", "green",
                "seamark:light:period", "1.5")));
  }

  // The S-52 LIGHTS06 colour precedence for the flare and arcs.

  @Test
  void lightColorPrecedence() {
    assertEquals("red", Seamark.resolveLightColor(Set.of("white", "red")));
    assertEquals("red", Seamark.resolveLightColor(Set.of("red")));
    assertEquals("red", Seamark.resolveLightColor(Set.of("white", "red", "green")));
    assertEquals("green", Seamark.resolveLightColor(Set.of("white", "green")));
    assertEquals("green", Seamark.resolveLightColor(Set.of("green")));
    assertEquals("yellow", Seamark.resolveLightColor(Set.of("yellow")));
    assertEquals("yellow", Seamark.resolveLightColor(Set.of("orange")));
    assertEquals("yellow", Seamark.resolveLightColor(Set.of("amber", "blue")));
    assertEquals("white", Seamark.resolveLightColor(Set.of("white")));
    assertEquals("generic", Seamark.resolveLightColor(Set.of("blue")));
    assertNull(Seamark.resolveLightColor(Set.of()));
    assertEquals("red", Seamark.resolveLightColor("white;red;green"));
  }
}
