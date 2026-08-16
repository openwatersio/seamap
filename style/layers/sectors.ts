import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import { decoration, withinBudget } from "./visibility.js";

/**
 * Light sectors: decoration on a mark, drawn as ground geometry.
 *
 * S-52 fixes the arc to the display — 20 mm radius whatever the scale (PresLib 4.0.4, `LIGHTS06`)
 * — but on a chart the reader zooms, a display-fixed figure is the one thing moving against
 * everything else. So the tiles carry the arc as an ordinary line at a nominal radius
 * (`Lights.java`), scaling with the chart like its neighbours; only the stroke widths live here.
 *
 * The zoom window is where that stops working. Below ~z10 the radius is a smudge; past ~z15 the
 * arc starts outgrowing the screen and reads as an unexplained curve with its light nowhere in
 * view — the arc never was a claim about reach, so it fades out over z15–17 rather than growing
 * into one.
 */

/** A sector where the light shows; obscured/faint sectors draw uncoloured (S-52 LIGHTS06). */
const visible: ExpressionSpecification = [
  "!",
  [
    "in",
    ["coalesce", ["get", "visibility"], ""],
    ["literal", ["obscured", "part_obscured", "partially_obscured", "faint"]],
  ],
];

const isSector: ExpressionSpecification = ["==", ["get", "subtype"], "sector"];

const common = {
  type: "line",
  source: "seamap",
  "source-layer": "light",
  minzoom: 10,
  maxzoom: 17,
  // butt caps: an arc ends exactly at its sector bearing (a round cap overshoots the limit)
  layout: { "line-cap": "butt", "line-join": "round" },
} as const;

/** The bow-out: full strength through z15, gone by z17 (scaled by each layer's base opacity). */
const fade = (opacity: number): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  15,
  opacity,
  17,
  0,
];

export function sectors(): LayerSpecification[] {
  return [
    {
      // radial legs at every limit, one per bearing (`Lights.java` dedupes shared ones)
      ...common,
      id: "sector-legs",
      filter: ["all", ["==", ["get", "subtype"], "leg"], decoration("sector"), withinBudget],
      paint: {
        "line-color": colors.sectorLeg,
        "line-dasharray": [2, 3],
        "line-opacity": fade(0.8),
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 1.2],
      },
    },
    {
      // S-52 cases every arc in a wide neutral stroke (LIGHTS06: 4-unit OUTLW under the
      // colour); it's what makes a yellow arc on pale water read as a chart feature
      ...common,
      id: "sector-arc-casing",
      filter: ["all", isSector, visible, decoration("sector"), withinBudget],
      paint: {
        "line-color": colors.label,
        "line-opacity": fade(1),
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 5],
      },
    },
    {
      ...common,
      id: "sector-arc",
      filter: ["all", isSector, visible, decoration("sector"), withinBudget],
      paint: {
        // same hexes as the flare sprites, so a light's arc and its own flare agree; orange
        // and amber cover raw tag values, and anything the S-52 precedence can't name falls
        // through to magenta, never a fake colour
        "line-color": [
          "match",
          ["get", "color"],
          "green",
          colors.lightGreen,
          "red",
          colors.lightRed,
          ["white", "yellow", "orange", "amber"],
          colors.lightYellow,
          colors.magenta,
        ],
        "line-opacity": fade(1),
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3],
      },
    },
    {
      // an obscured, partly-obscured or faint sector is where the light is NOT (fully)
      // visible: S-52 leaves the arc uncoloured, dashed like the legs
      ...common,
      id: "sector-arc-obscured",
      filter: ["all", isSector, ["!", visible], decoration("sector"), withinBudget],
      paint: {
        "line-color": colors.sectorLeg,
        "line-dasharray": [2, 2],
        "line-opacity": fade(1),
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2],
      },
    },
  ];
}
