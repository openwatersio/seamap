import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SeamarkPriorityTest {

  private static Map<String, Object> attrs(Object... keyValues) {
    Map<String, Object> map = new HashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) map.put((String) keyValues[i], keyValues[i + 1]);
    return map;
  }

  private static int rank(Object... keyValues) {
    return SeamarkPriority.rank(attrs(keyValues));
  }

  private static int rock(String waterLevel, int depth) {
    return rank("type", "rock", "water_level", waterLevel, "depth", depth);
  }

  private static int wreck(String category) {
    return rank("type", "wreck", "category", category);
  }

  @Test
  void families() {
    assertEquals(SeamarkPriority.HAZARD, SeamarkPriority.family(attrs("type", "obstruction")));
    assertEquals(SeamarkPriority.MAJOR_AID, SeamarkPriority.family(attrs("type", "buoy_cardinal")));
    assertEquals(SeamarkPriority.MINOR_AID, SeamarkPriority.family(attrs("type", "buoy_lateral")));
    assertEquals(
        SeamarkPriority.MINOR_AID, SeamarkPriority.family(attrs("type", "beacon_lateral")));
    assertEquals(
        SeamarkPriority.HARBOUR,
        SeamarkPriority.family(attrs("type", "harbour", "category", "marina")));
    // a ferry berth or naval basin gets no badge, so it must not spend the harbour budget
    assertEquals(
        SeamarkPriority.STRUCTURE,
        SeamarkPriority.family(attrs("type", "harbour", "category", "ferry")));
    assertEquals(
        SeamarkPriority.FACILITY, SeamarkPriority.family(attrs("type", "small_craft_facility")));
    assertEquals(SeamarkPriority.STRUCTURE, SeamarkPriority.family(attrs("type", "landmark")));
    // an unrecognised type competes with piles, not with aids to navigation
    assertEquals(SeamarkPriority.STRUCTURE, SeamarkPriority.family(attrs("type", "not_a_seamark")));
    // an uncategorized harbour is common on the planet, and Set.of lookups reject null:
    // this threw and dropped every such feature from the first full build
    assertEquals(SeamarkPriority.STRUCTURE, SeamarkPriority.family(attrs("type", "harbour")));
    assertEquals(false, SeamarkPriority.neverCapped(attrs("name", "typeless")));
  }

  /** A light's reach outranks how its host happens to be typed, as SeamarkZoomRules also has it. */
  @Test
  void longRangeLightIsAMajorAid() {
    assertEquals(SeamarkPriority.MINOR_AID, SeamarkPriority.family(attrs("type", "light_minor")));
    assertEquals(
        SeamarkPriority.MAJOR_AID,
        SeamarkPriority.family(attrs("type", "light_minor", "light_range", 12)));
    assertEquals(
        SeamarkPriority.MAJOR_AID,
        SeamarkPriority.family(attrs("type", "landmark", "light_range", 15)));
    // below the S-52 major-light threshold it stays where its type puts it
    assertEquals(
        SeamarkPriority.STRUCTURE,
        SeamarkPriority.family(attrs("type", "landmark", "light_range", 6)));
  }

  @Test
  void tiersOrderTheFamilies() {
    assertTrue(rank("type", "buoy_safe_water") < rank("type", "rock"));
    assertTrue(rank("type", "rock") < rank("type", "harbour", "category", "marina"));
    assertTrue(rank("type", "harbour", "category", "marina") < rank("type", "buoy_lateral"));
    assertTrue(rank("type", "buoy_lateral") < rank("type", "small_craft_facility"));
    // a beacon holds its charted position; a buoy can drag off station
    assertTrue(rank("type", "beacon_lateral") < rank("type", "buoy_lateral"));
  }

  /** When a cell keeps one harbour it keeps the named marina, not the anonymous basin. */
  @Test
  void harboursRankByWhatASmallCraftWants() {
    int marina = rank("type", "harbour", "category", "marina", "name", "Greve");
    assertTrue(marina < rank("type", "harbour", "category", "marina"));
    assertTrue(marina < rank("type", "harbour", "category", "fishing", "name", "Havn"));
  }

  @Test
  void conspicuityPromotesALandmark() {
    int conspicuous = rank("type", "landmark", "seamark:landmark:conspicuity", "conspicuous");
    assertTrue(conspicuous < rank("type", "landmark"));
    assertTrue(conspicuous < rank("type", "pile"));
  }

  /** Longer reach ranks higher within a family. */
  @Test
  void lightsRankByRange() {
    assertTrue(rank("type", "light_major", "light_range", 20) < rank("type", "light_major"));
    assertTrue(
        rank("type", "buoy_lateral", "light_range", 5)
            < rank("type", "buoy_lateral", "light_range", 2));
  }

  /**
   * Depth decides first: an invisible rock in deep water cannot hurt a small craft, and a covering
   * rock at a metre can. Visibility only orders hazards that sit at comparable depths.
   */
  @Test
  void hazardsRankByDepthBeforeVisibility() {
    assertTrue(rock("covers", 1) < rock("submerged", 20));
    assertTrue(rock("dry", 1) < rock("submerged", 20));
    // and an undescribed depth outranks a depth known to be harmless
    assertTrue(rank("type", "rock") < rock("submerged", 40));
  }

  /** Within a depth band, what you cannot see is worse. */
  @Test
  void hazardsRankBySeverityThenDepth() {
    assertTrue(rock("submerged", 0) < rock("awash", 0));
    assertTrue(rock("awash", 0) < rock("covers", 0));
    // an undescribed rock might be any of the above, so it outranks a provably dry one
    assertTrue(rock("covers", 0) < rock(null, 0));
    assertTrue(rock(null, 0) < rock("dry", 0));
    assertTrue(rock("submerged", 1) < rock("submerged", 8));

    assertTrue(wreck("dangerous") < wreck("mast_showing"));
    assertTrue(wreck("mast_showing") < wreck("hull_showing"));
    assertTrue(wreck("hull_showing") < wreck("distributed_remains"));
    assertTrue(wreck("distributed_remains") < wreck(null));
    assertTrue(wreck(null) < wreck("non-dangerous"));
  }

  /** The invariant the whole scheme rests on: an instance modifier never reaches the next tier. */
  @Test
  void modifiersStayInsideTheirTier() {
    // deepest band, absurd depth, and a drying height on the other side of zero
    assertTrue(rock("dry", 99999) < 20000);
    assertTrue(rock("submerged", -50) >= 10000);
    assertTrue(wreck("non-dangerous") < 20000);
    // a range beyond anything charted still cannot climb out of tier 0
    assertTrue(rank("type", "light_major", "light_range", 9999) >= 0);
    assertTrue(rank("type", "light_major", "light_range", 0) < 10000);
  }
}
