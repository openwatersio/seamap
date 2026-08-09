import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;
import org.junit.jupiter.api.Test;

class FuelTest {

  /** Diesel first, grades by octane, `no` never counts. */
  @Test
  void label() {
    assertNull(Fuel.label(Map.of()));
    assertNull(Fuel.label(Map.of("fuel:diesel", "no")));
    assertEquals("91", Fuel.label(Map.of("fuel:octane_91", "yes", "fuel:octane_95", "no")));
    assertEquals(
        "D · 95 · 98 · 100 · LPG",
        Fuel.label(
            Map.of(
                "fuel:octane_100", "yes",
                "fuel:octane_98", "yes",
                "fuel:octane_95", "yes",
                "fuel:diesel", "yes",
                "fuel:lpg", "yes")));
    assertEquals(
        "D · 89 · E0",
        Fuel.label(Map.of("fuel:diesel", "yes", "fuel:octane_89", "yes", "fuel:e0", "yes")));
    // an uncommon fuel spells out rather than becoming an opaque initial
    assertEquals(
        "P · 95 · Kerosene",
        Fuel.label(Map.of("fuel:kerosene", "yes", "fuel:octane_95", "yes", "fuel:petrol", "yes")));
    assertEquals(
        "D · 1:50 · Taxfree diesel",
        Fuel.label(Map.of("fuel:1_50", "yes", "fuel:taxfree_diesel", "yes", "fuel:diesel", "yes")));
  }
}
