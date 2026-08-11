import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { decoration, withinBudget } from "./visibility.js";

/**
 * Light sectors, drawn at a fixed size on the display rather than on the ground.
 *
 * A sector arc is a symbol, not a measurement: it says the red sector lies over there, and the
 * distance it is drawn at means nothing. S-52 fixes it to the display accordingly — a 20 mm
 * radius, 25 mm where the smaller of two overlapping sectors has to clear the larger, and 25 mm
 * radial legs (PresLib 4.0.4, `LIGHTS06`). Drawn on the ground instead, an arc is a tenth of its
 * intended size at z10 and several times too large at z16.
 *
 * A line layer cannot hold a constant screen size, so the arcs are sprites. Each `arc-N` spans a
 * fixed angle and three copies — rotated to the sector's start, its middle and its end — cover any
 * width without spilling past its limits. The tiles carry one point per sector with the angles
 * (`Lights.java`); nothing here is geometry.
 */

/** Angular span of each `arc-N` sprite, stepping by a factor of three. */
const SPRITE_SPAN = [1.48, 4.44, 13.33, 40, 120];

/** Sprite radius in the sheet, which the sheet rasterizes at twice the source size. */
const SPRITE_RADIUS = 98;
/** Length of `line-dashed` in the sheet. */
const LEG_LENGTH = 512;
/** CSS pixels per millimetre at 96 dpi, for turning the standard's millimetres into icon-size. */
const PX_PER_MM = 1 / 0.2646;

const mm = (target: number, spriteSize: number) =>
  Number(((target * PX_PER_MM) / spriteSize).toFixed(3));

/** Which sprite covers this sector: the largest whose three copies still fit inside it. */
const spriteIndex: ExpressionSpecification = [
  "step",
  ["get", "sector_width"],
  0,
  SPRITE_SPAN[1],
  1,
  SPRITE_SPAN[2],
  2,
  SPRITE_SPAN[3],
  3,
  SPRITE_SPAN[4],
  4,
];

const span: ExpressionSpecification = [
  "step",
  ["get", "sector_width"],
  ...SPRITE_SPAN.flatMap((s, i) => (i === 0 ? [s] : [SPRITE_SPAN[i], s])),
] as unknown as ExpressionSpecification;

/**
 * Two reversals that cancel, which is why the rotations below look like they are missing a
 * conversion. Sector limits are bearings **from seaward** — the direction a vessel looks along to
 * see the light — so drawing one outward from the light means adding 180°. S-52 warns about
 * exactly this ("Do not forget to reverse the sector values (+/- 180 degrees) since the values are
 * given from seaward"), and it is the classic sector-rendering bug. The arc sprite meanwhile
 * begins at the bottom of its own image and sweeps clockwise, so its leading edge sits at 180°
 * before any rotation. Reciprocal plus sprite origin is a full turn: rotate by the limit itself.
 */

/** Sector colour, on the same tokens the flare uses so a light and its arc agree. */
const colourSuffix: ExpressionSpecification = [
  "match",
  ["get", "color"],
  "green",
  "G",
  "red",
  "R",
  ["white", "yellow", "orange", "amber"],
  "Y",
  "Y",
];

/** An obscured, part-obscured or faint sector is where the light is not (fully) seen. */
const visible: ExpressionSpecification = [
  "!",
  [
    "in",
    ["coalesce", ["get", "visibility"], ""],
    ["literal", ["obscured", "part_obscured", "partially_obscured", "faint"]],
  ],
];

const isSector: ExpressionSpecification = ["==", ["get", "subtype"], "sector"];

function arcLayer(id: string, rotate: ExpressionSpecification): LayerSpecification {
  return {
    id,
    type: "symbol",
    source: "seamap",
    "source-layer": "light",
    minzoom: 8,
    filter: ["all", isSector, visible, decoration("sector"), withinBudget],
    layout: {
      "icon-image": [
        "concat",
        "freenauticalchart:arc-",
        ["to-string", spriteIndex],
        "-",
        colourSuffix,
      ],
      // the arc is a bearing, so it turns with the map and never with the screen
      "icon-rotation-alignment": "map",
      "icon-rotate": rotate,
      "icon-overlap": "always",
      // the smaller of an overlapping pair reaches 25 mm so the larger cannot bury it
      "icon-size": ["case", ["has", "extended"], mm(25, SPRITE_RADIUS), mm(20, SPRITE_RADIUS)],
    },
  };
}

export function sectors(): LayerSpecification[] {
  const start: ExpressionSpecification = ["get", "sector_start"];
  const end: ExpressionSpecification = ["-", ["get", "sector_end"], span];
  const middle: ExpressionSpecification = [
    "-",
    ["+", ["get", "sector_start"], ["/", ["get", "sector_width"], 2]],
    ["/", span, 2],
  ];

  return [
    {
      // radial legs at every limit, one per bearing (`Lights.java` dedupes shared ones)
      id: "sector-legs",
      type: "symbol",
      source: "seamap",
      "source-layer": "light",
      minzoom: 8,
      filter: ["all", ["==", ["get", "subtype"], "leg"], decoration("sector"), withinBudget],
      layout: {
        "icon-image": "freenauticalchart:line-dashed",
        // anchored at its foot, so the line runs outward from the light along the bearing
        "icon-anchor": "bottom",
        "icon-rotation-alignment": "map",
        // anchored at its foot the leg runs to image north, so the seaward
        // reciprocal is the whole correction here
        "icon-rotate": ["+", ["get", "bearing"], 180],
        "icon-overlap": "always",
        "icon-size": mm(25, LEG_LENGTH),
      },
      paint: { "icon-opacity": 0.8 },
    },
    arcLayer("sector-arc-start", start),
    arcLayer("sector-arc-middle", middle),
    arcLayer("sector-arc-end", end),
    {
      // an obscured sector keeps the legs' uncoloured dashed style (S-52 LIGHTS06 Continuation)
      id: "sector-arc-obscured",
      type: "symbol",
      source: "seamap",
      "source-layer": "light",
      minzoom: 8,
      filter: ["all", isSector, ["!", visible], decoration("sector"), withinBudget],
      layout: {
        "icon-image": ["concat", "freenauticalchart:arc-", ["to-string", spriteIndex], "-obscured"],
        "icon-rotation-alignment": "map",
        "icon-rotate": middle,
        "icon-overlap": "always",
        "icon-size": mm(20, SPRITE_RADIUS),
      },
      paint: { "icon-opacity": 0.9 },
    },
  ];
}
