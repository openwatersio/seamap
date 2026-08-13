import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SeamarkZoomRulesTest {

  private static Map<String, Object> attrs(Object... keyValues) {
    Map<String, Object> map = new HashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) map.put((String) keyValues[i], keyValues[i + 1]);
    return map;
  }

  /** A hazard clear of the shore, dangerous or of unknown depth, is selected for General scale. */
  @Test
  void offshoreHazardShowsEarly() {
    assertEquals(8, SeamarkZoomRules.getMinZoom(attrs("type", "rock")));
    assertEquals(8, SeamarkZoomRules.getMinZoom(attrs("type", "rock", "depth", 1.5)));
    assertEquals(8, SeamarkZoomRules.getMinZoom(attrs("type", "obstruction")));
  }

  /** Near the shore the shore itself is the danger; the symbol waits for Approach scale. */
  @Test
  void nearShoreHazardWaitsForApproach() {
    assertEquals(13, SeamarkZoomRules.getMinZoom(attrs("type", "rock", "near_shore", true)));
    assertEquals(
        13, SeamarkZoomRules.getMinZoom(attrs("type", "rock", "near_shore", true, "depth", 0.5)));
  }

  /** Only a hazard charted below every supported safety depth may wait for Coastal scale. */
  @Test
  void deepHazardIsCoastalDetail() {
    assertEquals(11, SeamarkZoomRules.getMinZoom(attrs("type", "wreck", "depth", 42.0)));
    // 25 m is within MAX_SAFETY_DEPTH: a 30 m safety setting still flags it, so it stays early
    assertEquals(8, SeamarkZoomRules.getMinZoom(attrs("type", "rock", "depth", 25.0)));
  }

  /** A wreck categorized as dangerous keeps its promotion, wherever it lies. */
  @Test
  void dangerousWreckKeepsItsPromotion() {
    assertEquals(
        6,
        SeamarkZoomRules.getMinZoom(
            attrs("type", "wreck", "category", "dangerous", "near_shore", true)));
  }

  /** Harbour-band furniture waits for the zooms where its channel reads. */
  @Test
  void shortRangeAidsWaitForTheirBand() {
    assertEquals(10, SeamarkZoomRules.getMinZoom(attrs("type", "buoy_lateral")));
    assertEquals(10, SeamarkZoomRules.getMinZoom(attrs("type", "beacon_special_purpose")));
    assertEquals(13, SeamarkZoomRules.getMinZoom(attrs("type", "mooring")));
    assertEquals(10, SeamarkZoomRules.getMinZoom(attrs("type", "fog_signal")));
    assertEquals(9, SeamarkZoomRules.getMinZoom(attrs("type", "anchorage")));
    // cardinals and the other danger-marking marks stay early
    assertEquals(6, SeamarkZoomRules.getMinZoom(attrs("type", "buoy_cardinal")));
  }

  /** A light's reach decides its floor, not how its host happens to be typed. */
  @Test
  void minorLightsEarnEarlinessByRange() {
    assertEquals(8, SeamarkZoomRules.getMinZoom(attrs("type", "light_minor")));
    assertEquals(6, SeamarkZoomRules.getMinZoom(attrs("type", "light_minor", "light_range", 10)));
    assertEquals(4, SeamarkZoomRules.getMinZoom(attrs("type", "light_minor", "light_range", 15)));
    assertEquals(4, SeamarkZoomRules.getMinZoom(attrs("type", "light_major")));
  }

  /** Sector geometry never precedes its mark: an early arc would render as an orphan. */
  @Test
  void lightGeometryWaitsForItsHost() {
    assertEquals(8, SeamarkZoomRules.getLightMinZoom(attrs("type", "light_minor")));
    assertEquals(13, SeamarkZoomRules.getLightMinZoom(attrs("type", "mooring")));
    assertEquals(13, SeamarkZoomRules.getLightMinZoom(attrs("type", "rock", "near_shore", true)));
  }

  /** A plain tower is Coastal detail; what a mariner steers by keeps the early floor. */
  @Test
  void landmarksSplitByConspicuity() {
    assertEquals(10, SeamarkZoomRules.getMinZoom(attrs("type", "landmark", "category", "tower")));
    assertEquals(
        6,
        SeamarkZoomRules.getMinZoom(
            attrs("type", "landmark", "seamark:landmark:conspicuity", "conspicuous")));
    assertEquals(
        6, SeamarkZoomRules.getMinZoom(attrs("type", "landmark", "category", "windmotor")));
    assertEquals(
        6,
        SeamarkZoomRules.getMinZoom(
            attrs("type", "landmark", "category", "tower", "light", "Fl.5s")));
  }
}
