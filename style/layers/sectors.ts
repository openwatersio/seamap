import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import type { Visibility } from "./visibility.js";

/**
 * Light sectors: decoration on a mark, in either of the two portrayals the tiles carry.
 *
 * S-52 fixes the arc to the display — 20 mm radius whatever the scale (PresLib 4.0.4, `LIGHTS06`)
 * — but on a chart the reader zooms, a display-fixed figure is the one thing moving against
 * everything else. So the chart draws the arc as an ordinary line at a nominal radius
 * (`Lights.java`), scaling with the chart like its neighbours; only the stroke widths live here.
 * Standards mode takes the millimetres literally and draws sprites at the light instead.
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

export function sectors(v: Visibility): LayerSpecification[] {
  return v.standards ? displaySectors(v) : groundSectors(v);
}

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

/**
 * Arcs and legs as ground geometry, inside a zoom window. Below ~z10 the radius is a smudge; past
 * ~z15 the arc starts outgrowing the screen and reads as an unexplained curve with its light
 * nowhere in view — the arc never was a claim about reach, so it fades out over z15–17 rather than
 * growing into one.
 */
function groundSectors({ decoration, withinBudget }: Visibility): LayerSpecification[] {
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

/** Angular span of each `arc-N` sprite, stepping by a factor of three. */
const SPRITE_SPAN = [1.48, 4.44, 13.33, 40, 120];

/** Sprite radius in the sheet, which the sheet rasterizes at twice the source size. */
const SPRITE_RADIUS = 98;
/** Length of `sector-leg` in the sheet, which is drawn for exactly this use. */
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

/** How much of the sector that sprite covers, which the middle and end copies rotate back by. */
const span: ExpressionSpecification = [
  "step",
  ["get", "sector_width"],
  SPRITE_SPAN[0],
  SPRITE_SPAN[1],
  SPRITE_SPAN[1],
  SPRITE_SPAN[2],
  SPRITE_SPAN[2],
  SPRITE_SPAN[3],
  SPRITE_SPAN[3],
  SPRITE_SPAN[4],
  SPRITE_SPAN[4],
];

/**
 * Sector colour, on the same tokens the flare uses so a light and its arc agree. Orange and amber
 * cover raw tag values; a combination the S-52 precedence can't name falls through to magenta,
 * never a fake colour.
 */
const colourSuffix: ExpressionSpecification = [
  "match",
  ["get", "color"],
  "green",
  "G",
  "red",
  "R",
  ["white", "yellow", "orange", "amber"],
  "Y",
  "M",
];

const isSectorPoint: ExpressionSpecification = ["==", ["get", "subtype"], "sector_point"];

/**
 * A sector figure draws wherever its light draws, and never reserves room: an arc quad is many
 * times the size of the symbols around it, and MapLibre places in reverse layer order, so an arc
 * in the collision index would suppress the marks and labels drawn after it.
 */
const guaranteed = {
  "icon-overlap": "always",
  "icon-ignore-placement": true,
} as const;

/** Which sprite family a copy belongs to, and so its filter, suffix and opacity. */
type Family = "casing" | "colour" | "obscured";

/**
 * Arcs at the 20 mm S-52 fixes them to, drawn as sprites: a line layer cannot hold a constant
 * screen size. Each `arc-N` spans a fixed angle, and three copies — rotated to the sector's start,
 * its middle and its end — cover any width. A sector narrower than the smallest sprite overdraws
 * past its limits by the difference, a fraction of a degree at the radius the arc is drawn at. The
 * tiles carry one point per sector and one per limit with the angles (`Lights.java`); nothing here
 * is geometry.
 */
function displaySectors({ decoration, withinBudget }: Visibility): LayerSpecification[] {
  /**
   * Two reversals that cancel, which is why the rotations below look like they are missing a
   * conversion. Sector limits are bearings **from seaward** — the direction a vessel looks along
   * to see the light — so drawing one outward from the light means adding 180°. S-52 warns about
   * exactly this ("Do not forget to reverse the sector values (+/- 180 degrees) since the values
   * are given from seaward"), and it is the classic sector-rendering bug. The arc sprite meanwhile
   * begins at the bottom of its own image and sweeps clockwise, so its leading edge sits at 180°
   * before any rotation. Reciprocal plus sprite origin is a full turn: rotate by the limit itself.
   */
  const start: ExpressionSpecification = ["get", "sector_start"];
  const end: ExpressionSpecification = ["-", ["get", "sector_end"], span];
  const middle: ExpressionSpecification = [
    "-",
    ["+", ["get", "sector_start"], ["/", ["get", "sector_width"], 2]],
    ["/", span, 2],
  ];

  /**
   * @param family `casing` is the wide neutral stroke S-52 puts under the colour ("First symbolize
   *   the Arc with a solid line, 4 units wide, COLOUR OUTLW; then symbolize the Arc with the
   *   COLOUR") — without it a yellow sector on pale water is barely there, so legibility rather
   *   than decoration. `obscured` is the uncoloured dashed style an obscured, part-obscured or
   *   faint sector takes instead (LIGHTS06 Continuation).
   */
  const arcLayer = (
    id: string,
    rotate: ExpressionSpecification,
    family: Family,
  ): LayerSpecification => ({
    id,
    type: "symbol",
    source: "seamap",
    "source-layer": "light",
    minzoom: 8,
    filter: [
      "all",
      isSectorPoint,
      family === "obscured" ? ["!", visible] : visible,
      decoration("sector"),
      withinBudget,
    ],
    layout: {
      "icon-image": [
        "concat",
        "freenauticalchart:arc-",
        ["to-string", spriteIndex],
        "-",
        family === "colour" ? colourSuffix : family,
      ],
      // the arc is a bearing, so it turns with the map and never with the screen
      "icon-rotation-alignment": "map",
      "icon-rotate": rotate,
      ...guaranteed,
      // the smaller of an overlapping pair reaches 25 mm so the larger cannot bury it
      "icon-size": ["case", ["has", "extended"], mm(25, SPRITE_RADIUS), mm(20, SPRITE_RADIUS)],
    },
    ...(family === "obscured" ? { paint: { "icon-opacity": 0.9 } } : {}),
  });

  return [
    {
      // radial legs at every limit, one per bearing (`Lights.java` dedupes shared ones)
      id: "sector-legs",
      type: "symbol",
      source: "seamap",
      "source-layer": "light",
      minzoom: 8,
      filter: ["all", ["==", ["get", "subtype"], "limit"], decoration("sector"), withinBudget],
      layout: {
        "icon-image": "freenauticalchart:sector-leg",
        // anchored at its foot, so the line runs outward from the light along the bearing
        "icon-anchor": "bottom",
        "icon-rotation-alignment": "map",
        // anchored at its foot the leg runs to image north, so the seaward
        // reciprocal is the whole correction here
        "icon-rotate": ["+", ["get", "bearing"], 180],
        ...guaranteed,
        "icon-size": mm(25, LEG_LENGTH),
      },
    },
    // casings first, so every colour stroke lands on its own neutral backing
    arcLayer("sector-arc-start-casing", start, "casing"),
    arcLayer("sector-arc-middle-casing", middle, "casing"),
    arcLayer("sector-arc-end-casing", end, "casing"),
    arcLayer("sector-arc-start", start, "colour"),
    arcLayer("sector-arc-middle", middle, "colour"),
    arcLayer("sector-arc-end", end, "colour"),
    // an obscured sector takes the same three copies: one alone covers only the sprite's own span
    arcLayer("sector-arc-start-obscured", start, "obscured"),
    arcLayer("sector-arc-middle-obscured", middle, "obscured"),
    arcLayer("sector-arc-end-obscured", end, "obscured"),
  ];
}
