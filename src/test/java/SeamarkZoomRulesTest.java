import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.List;
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

  /** TSS linework guides passage planning; its fills wait until they read as a scheme. */
  @Test
  void trafficLineworkPrecedesItsFills() {
    assertEquals(2, SeamarkZoomRules.getMinZoom(attrs("type", "separation_lane")));
    assertEquals(2, SeamarkZoomRules.getMinZoom(attrs("type", "separation_line")));
    assertEquals(2, SeamarkZoomRules.getMinZoom(attrs("type", "separation_boundary")));
    assertEquals(4, SeamarkZoomRules.getMinZoom(attrs("type", "separation_zone")));
    assertEquals(4, SeamarkZoomRules.getMinZoom(attrs("type", "separation_crossing")));
    assertEquals(4, SeamarkZoomRules.getMinZoom(attrs("type", "separation_roundabout")));
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

  /** Band plus SCAMIN, with the classes the chart draws early held to their derived floor. */
  @Test
  void standardFloorsFollowTheDerivation() {
    assertEquals(11, SeamarkZoomRules.getStandardMinZoom(attrs("type", "light_minor")));
    assertEquals(12, SeamarkZoomRules.getStandardMinZoom(attrs("type", "buoy_lateral")));
    assertEquals(12, SeamarkZoomRules.getStandardMinZoom(attrs("type", "beacon_special_purpose")));
    assertEquals(12, SeamarkZoomRules.getStandardMinZoom(attrs("type", "fog_signal")));
    assertEquals(12, SeamarkZoomRules.getStandardMinZoom(attrs("type", "anchorage")));
    assertEquals(14, SeamarkZoomRules.getStandardMinZoom(attrs("type", "mooring")));
    assertEquals(15, SeamarkZoomRules.getStandardMinZoom(attrs("type", "small_craft_facility")));
    assertEquals(11, SeamarkZoomRules.getStandardMinZoom(attrs("type", "harbour")));
    assertEquals(9, SeamarkZoomRules.getStandardMinZoom(attrs("type", "buoy_cardinal")));
    assertEquals(9, SeamarkZoomRules.getStandardMinZoom(attrs("type", "beacon_isolated_danger")));
    assertEquals(5, SeamarkZoomRules.getStandardMinZoom(attrs("type", "platform")));
    assertEquals(6, SeamarkZoomRules.getStandardMinZoom(attrs("type", "restricted_area")));
    // the area classes the restricted-area list would otherwise sweep up carry two SCAMIN steps
    assertEquals(10, SeamarkZoomRules.getStandardMinZoom(attrs("type", "cable_area")));
    assertEquals(10, SeamarkZoomRules.getStandardMinZoom(attrs("type", "marine_farm")));
  }

  /** SCAMIN NOT SET is every scale, linework and fills alike. */
  @Test
  void tssCarriesNoScamin() {
    assertEquals(0, SeamarkZoomRules.getStandardMinZoom(attrs("type", "separation_lane")));
    assertEquals(0, SeamarkZoomRules.getStandardMinZoom(attrs("type", "separation_boundary")));
    assertEquals(0, SeamarkZoomRules.getStandardMinZoom(attrs("type", "separation_zone")));
    assertEquals(0, SeamarkZoomRules.getStandardMinZoom(attrs("type", "separation_roundabout")));
  }

  /** A light's reach promotes it under the standards too, one band later than the chart's. */
  @Test
  void standardFloorsPromoteByRange() {
    assertEquals(5, SeamarkZoomRules.getStandardMinZoom(attrs("type", "light_major")));
    assertEquals(
        5, SeamarkZoomRules.getStandardMinZoom(attrs("type", "light_minor", "light_range", 15)));
    assertEquals(
        6, SeamarkZoomRules.getStandardMinZoom(attrs("type", "light_minor", "light_range", 10)));
    assertEquals(
        11, SeamarkZoomRules.getStandardMinZoom(attrs("type", "light_minor", "light_range", 5)));
  }

  /** The contextual hazard derivation is the standard, so both floors agree. */
  @Test
  void hazardFloorsAreAlreadyTheStandard() {
    assertEquals(8, SeamarkZoomRules.getStandardMinZoom(attrs("type", "rock")));
    assertEquals(
        13, SeamarkZoomRules.getStandardMinZoom(attrs("type", "rock", "near_shore", true)));
    assertEquals(11, SeamarkZoomRules.getStandardMinZoom(attrs("type", "wreck", "depth", 42.0)));
    assertEquals(
        6, SeamarkZoomRules.getStandardMinZoom(attrs("type", "wreck", "category", "dangerous")));
  }

  /** Conspicuity or a light takes a landmark's SCAMIN away; being a turbine does not. */
  @Test
  void standardLandmarksSplitByConspicuityAlone() {
    assertEquals(
        11, SeamarkZoomRules.getStandardMinZoom(attrs("type", "landmark", "category", "tower")));
    assertEquals(
        0,
        SeamarkZoomRules.getStandardMinZoom(
            attrs("type", "landmark", "seamark:landmark:conspicuity", "conspicuous")));
    assertEquals(
        0,
        SeamarkZoomRules.getStandardMinZoom(
            attrs("type", "landmark", "category", "tower", "light", "Fl.5s")));
    assertEquals(
        11,
        SeamarkZoomRules.getStandardMinZoom(attrs("type", "landmark", "category", "windmotor")));
  }

  /**
   * Wherever SCAMIN sets a floor at all, the feature reaches the tile by then — a style filtering
   * on the standard floor never asks for something the tile doesn't carry. The all-scales classes
   * are the exception by construction: they arrive at their own floor, since no tile exists below
   * z0.
   */
  @Test
  void theChartFloorNeverTrailsTheStandardFloor() {
    for (String type :
        List.of(
            "light_major",
            "light_minor",
            "fog_signal",
            "platform",
            "anchorage",
            "cable_area",
            "restricted_area",
            "buoy_lateral",
            "buoy_cardinal",
            "mooring",
            "harbour",
            "landmark",
            "small_craft_facility",
            "separation_lane",
            "rock",
            "wreck")) {
      Map<String, Object> attrs = attrs("type", type);
      int standard = SeamarkZoomRules.getStandardMinZoom(attrs);
      if (standard == 0) continue;
      assertTrue(
          SeamarkZoomRules.getMinZoom(attrs) <= standard,
          type + " arrives after the standards would draw it");
    }
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
