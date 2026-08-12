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
}
