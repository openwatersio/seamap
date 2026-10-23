import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * The VersaTiles sprite sheet the base map draws from. @versatiles/style v5 still points its
 * layers at `basics`, a sheet tiles.versatiles.org no longer publishes, and MapLibre loads a
 * style's sprites all or nothing, so one dead sheet blanks the chart symbols too (#84).
 */
export const BASE_SPRITE = "base";

const base = (id: string) => `${BASE_SPRITE}:${id}`;

// v5 ids that `base` renamed or split, each mapped to the icon v6's own style draws for the
// same feature (SPRITES.md "Migrating sprite ids from v5" in @versatiles/style 6).
const RENAMED: Record<string, string | ExpressionSpecification> = {
  "icon-beer": "icon-pint_glass", // v5 draws only pub with it
  "icon-beergarden": "icon-beer_mug",
  "icon-chemist": "icon-tube_and_toothbrush",
  "icon-dog_park": "icon-dog",
  "icon-doityourself": "icon-do_it_yourself",
  "icon-drycleaning": "icon-dry_cleaning",
  "icon-garden_centre": "icon-garden_center",
  "icon-hairdresser": "icon-scissors_and_comb",
  "icon-huntingstand": "icon-hunting_stand",
  "icon-icerink": "icon-ice_rink",
  "icon-jewelry_store": "icon-ring",
  "icon-kiosk": "icon-newspaper",
  "icon-nursinghome": "icon-nursing_home",
  "icon-pharmacy": "icon-pill",
  "icon-playground": "icon-seesaw",
  "icon-police": "icon-police_officer",
  "icon-theatre": "icon-theater",
  "icon-toilet": "icon-restrooms",
  "icon-toys": "icon-rocking_horse",
  "icon-vendingmachine": "icon-vending_machine",
  "icon-waterpark": "icon-water_park",
  // v6 draws every station with the one rail icon
  "icon-rail_light": "icon-rail",
  "icon-rail_metro": "icon-rail",
  "marking-arrow": "marking-oneway",
  "pattern-warning": "pattern-hatched",
  "icon-place_of_worship": [
    "match",
    ["get", "religion"],
    "christian",
    base("icon-latin_cross"),
    "muslim",
    base("icon-star_and_crescent"),
    "jewish",
    base("icon-star_of_david"),
    "buddhist",
    base("icon-dharma_wheel"),
    "hindu",
    base("icon-om"),
    "sikh",
    base("icon-khanda"),
    "taoist",
    base("icon-yin_yang"),
    base("icon-person_kneeling_and_praying"),
  ],
};

function rename(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("basics:")) {
    const id = value.slice("basics:".length);
    const renamed = RENAMED[id] ?? id;
    return typeof renamed === "string" ? base(renamed) : structuredClone(renamed);
  }
  if (Array.isArray(value)) return value.map(rename);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rename(v)]));
  }
  return value;
}

/** Points the base map's icon and pattern references at the `base` sheet, in place. */
export function useBaseSprites(layers: LayerSpecification[]): void {
  for (const layer of layers as { layout?: unknown; paint?: unknown }[]) {
    if (layer.layout) layer.layout = rename(layer.layout);
    if (layer.paint) layer.paint = rename(layer.paint);
  }
}
