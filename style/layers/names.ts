import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

const paint = {
  "text-color": colors.label,
  "text-halo-color": colors.halo,
  "text-halo-width": 2,
  "text-halo-blur": 1,
};

/** The base map's own place and water-body labels live in the VersaTiles Shortbread tiles. */
const SHORTBREAD = "versatiles-shortbread";

/** Bigger water bodies win the collision, so a sea name is never crowded out by a pond. */
const largestFirst = (area: string): ExpressionSpecification => [
  "-",
  ["to-number", ["get", area], 0],
];

export interface NamesOptions {
  /** Rename glyph fontstacks to match the consumer's glyph server, as in layers(). */
  font?: (name: string) => string;
  /** Base map label language, matching the one the base map itself was built with. */
  language?: string;
}

/**
 * Geographic names: islands and coastal localities from the base map's place labels, water
 * bodies from its water labels and from the seamap tiles' own bays, straits and seas.
 *
 * Land names stand upright and water names slope to the right (S-4 B-562.1). All of it is
 * background geographic information, which must never take the room a light or a buoy needs
 * (S-4 B-562.3) — so these draw before the chart symbology, which MapLibre then places first.
 *
 * Order within the group runs the same way, least important first: a locality yields to an
 * island, an island to a lake, and everything to a named sea area.
 */
export function names({
  font = (f) => f,
  language = "en",
}: NamesOptions = {}): LayerSpecification[] {
  const upright = [font("Noto Sans Regular")];
  const sloping = [font("Noto Sans Italic")];
  const label: ExpressionSpecification = ["coalesce", ["get", `name_${language}`], ["get", "name"]];

  return [
    {
      id: "label-place-locality",
      type: "symbol",
      source: SHORTBREAD,
      "source-layer": "place_labels",
      filter: ["==", ["get", "kind"], "locality"],
      // as dense as the base map's hamlets, and worth no more room than they get
      minzoom: 11,
      layout: {
        "text-field": label,
        "text-font": upright,
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 14, 11],
        "text-max-width": 8,
      },
      paint,
    },
    {
      id: "label-place-island",
      type: "symbol",
      source: SHORTBREAD,
      "source-layer": "place_labels",
      // the tiles carry islands from z8, already thinned by size
      filter: ["==", ["get", "kind"], "island"],
      layout: {
        "text-field": label,
        "text-font": upright,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 13],
        "text-max-width": 8,
      },
      paint,
    },
    {
      id: "label-water",
      type: "symbol",
      source: SHORTBREAD,
      "source-layer": "water_polygons_labels",
      layout: {
        "text-field": label,
        "text-font": sloping,
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 14, 13],
        "text-max-width": 8,
        "symbol-sort-key": largestFirst("way_area"),
      },
      paint,
    },
    {
      id: "sea-areas",
      type: "symbol",
      source: "seamap",
      "source-layer": "sea_area",
      layout: {
        "text-field": ["get", "name"],
        "text-font": sloping,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 10, 15],
        "text-max-width": 8,
        "text-letter-spacing": 0.1,
        "symbol-sort-key": largestFirst("area"),
      },
      paint,
    },
  ];
}
