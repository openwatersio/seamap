import com.onthegomap.planetiler.util.Parse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * The fuels a dock sells, as one label. MapLibre can only ask about keys named in advance, so the
 * scatter of `fuel:*=yes` has to become a single string at build time. Adapted from
 * OpenSeaMap-vector (CC0):
 * https://github.com/k-yle/OpenSeaMap-vector/blob/main/data/planetiler/Fuel.java
 */
public class Fuel {

  /**
   * Print order; anything else follows, alphabetically. Petrol grades sort by octane after petrol.
   */
  private static final List<String> ORDER =
      List.of("diesel", "biodiesel", "petrol", "lpg", "cng", "electricity");

  /** Abbreviations for the fuels common enough to read as initials. The rest spell out. */
  private static final Map<String, String> LABELS =
      Map.of(
          "diesel", "D",
          "biodiesel", "BD",
          "petrol", "P",
          "lpg", "LPG",
          "cng", "CNG",
          "electricity", "EV");

  /**
   * `fuel:diesel=yes` + `fuel:octane_95=yes` reads "D · 95". Only `yes` counts — `fuel:lpg=no` says
   * the dock has none. Null when the feature sells nothing.
   */
  public static String label(Map<String, Object> tags) {
    List<String> types = new ArrayList<>();
    for (Map.Entry<String, Object> e : tags.entrySet()) {
      if (e.getKey().startsWith("fuel:") && "yes".equals(e.getValue())) {
        types.add(e.getKey().substring("fuel:".length()));
      }
    }
    if (types.isEmpty()) return null;
    types.sort(
        Comparator.comparingInt(Fuel::rank)
            .thenComparingInt(Fuel::octaneNumber)
            .thenComparing(Comparator.naturalOrder()));

    StringBuilder sb = new StringBuilder();
    for (String t : types) {
      if (sb.length() > 0) sb.append(" · ");
      sb.append(name(t));
    }
    return sb.toString();
  }

  private static int rank(String type) {
    int i = ORDER.indexOf(isOctane(type) ? "petrol" : type);
    return i < 0 ? ORDER.size() : i;
  }

  private static int octaneNumber(String type) {
    Double n = isOctane(type) ? Parse.parseDoubleOrNull(type.substring("octane_".length())) : null;
    return n == null ? 0 : n.intValue();
  }

  private static boolean isOctane(String type) {
    return type.startsWith("octane_");
  }

  private static String name(String type) {
    // the octane_ prefix is noise beside a fuel badge: "95" already reads as a grade
    if (isOctane(type)) return type.substring("octane_".length());
    // two-stroke mixes are tagged as ratios, fuel:1_50 for 1:50
    if (type.matches("\\d+_\\d+")) return type.replace('_', ':');
    String label = LABELS.get(type);
    if (label != null) return label;
    // ponytail: capitalize in place of i18n; swap for a lookup when the chart gets translations
    return type.substring(0, 1).toUpperCase() + type.substring(1).replace('_', ' ');
  }
}
