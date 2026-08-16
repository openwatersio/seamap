import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import { MARK, anchorOffsets, markOffsets } from "./placement.js";
import { RAMP_FROM, TOKEN, type Visibility } from "./visibility.js";

const halo = {
  "text-halo-color": colors.halo,
  "text-halo-width": 2,
  "text-halo-blur": 1,
};

/** A conspicuous landmark (CONVIS) draws bolder: it is the one worth steering by. */
const convis: ExpressionSpecification = [
  "==",
  ["get", "seamark:landmark:conspicuity"],
  "conspicuous",
];

/** The feature exhibits a light, so `lights-label` owns its text. */
const lit: ExpressionSpecification = [
  "any",
  ["has", "seamark:light:colour"],
  ["has", "seamark:light:1:colour"],
];

/**
 * Chart lettering slopes with the aid, not the kind of text: floating aids (buoys, light floats,
 * light vessels) letter sloping, fixed aids (beacons, landmarks, lighthouses) upright — S-4 B-450.
 */
const floating: ExpressionSpecification = [
  "any",
  ["in", "buoy", ["get", "type"]],
  ["in", ["get", "type"], ["literal", ["light_float", "light_vessel"]]],
];

/** Draws a hull/stake body standing on the point (marks.ts), unlike a centred light star. */
const bodied: ExpressionSpecification = [
  "any",
  ["in", "buoy", ["get", "type"]],
  ["in", "beacon", ["get", "type"]],
  ["in", ["get", "type"], ["literal", ["light_float", "light_vessel"]]],
];

/** Squat hull shapes, whose centre sits lower than a pillar's (MARK.squatLift). */
const squat: ExpressionSpecification = [
  "in",
  ["get", "shape"],
  ["literal", ["can", "conical", "spherical", "barrel", "super-buoy", "ice-buoy", "ice_buoy"]],
];

/** Side labels centre on the hull; a centred symbol (light star, hazard glyph) takes no lift. */
function bodyOffsets(textSize: number): ExpressionSpecification {
  return [
    "case",
    squat,
    markOffsets(textSize, MARK.squatLift),
    markOffsets(textSize, MARK.lift),
  ] as ExpressionSpecification;
}

/**
 * One label block per S-4 B-560.3: the name stacks over the light characteristic so the pair can
 * never straddle the mark, a touch larger so it reads first. Fresh objects on every call — the
 * font-renaming walker in index.ts mutates format sections in place.
 */
function lightBlock(named: boolean, sloping: boolean): ExpressionSpecification {
  const font = () =>
    sloping ? { "text-font": ["literal", ["Noto Sans Italic"]] as ["literal", string[]] } : {};
  return named
    ? [
        "format",
        ["get", "name"],
        { ...font(), "font-scale": 1.15 },
        "\n",
        {},
        ["get", "light"],
        font(),
      ]
    : ["format", ["get", "light"], font()];
}

/**
 * The scales the landmark artwork carries: the source icons are drawn 1.3x chart-symbol scale
 * and bin/sprites expands a 1.6x convis/ variant of each, so the style never sets icon-size
 * above 1 (which would upsample the raster and blur).
 */
const LMK_SCALE = 1.3;
const LMK_SCALE_CONVIS = 1.6;

/** Landmark category → icon; each has a convis/ variant in the sheet (bin/sprites). */
const LANDMARK_ICONS: Record<string, string> = {
  cairn: "cairn-lmk",
  chimney: "chimney",
  column: "column",
  cross: "cross-lmk",
  dish_aerial: "dish_aerial",
  dome: "dome",
  flagstaff: "flagstaff",
  flare_stack: "flare-stack",
  mast: "mast",
  monument: "monument",
  obelisk: "obelisk",
  radar_scanner: "radar_scanner",
  spire: "spire",
  statue: "statue",
  tower: "tower-lmk",
  windmill: "windmill",
  windmotor: "windmotor",
  windsock: "windsock",
};

function landmarkIcon(folder: "" | "convis/"): ExpressionSpecification {
  const match: unknown[] = ["match", ["get", "category"]];
  for (const [category, icon] of Object.entries(LANDMARK_ICONS)) {
    match.push(category, `freenauticalchart:${folder}${icon}`);
  }
  match.push(`freenauticalchart:${folder}monument`);
  const icon: unknown[] = [
    "case",
    ["in", ["get", "function"], ["literal", ["church", "chapel"]]],
    `freenauticalchart:${folder}church`,
    match,
  ];
  return icon as ExpressionSpecification;
}

/**
 * Named features and the text that names them. These place last, and MapLibre collides symbols in
 * reverse draw order, so everything here outranks the icon layers below it.
 *
 * Order within the group matters for the same reason. A label that changes a decision — a light
 * characteristic, a Racon group — sits after one that only says what something is called, so it
 * places first and a name can never take its room.
 *
 * `landmarks` belongs with the labels rather than with the structures: it and `lights-label` share
 * an anchor point, and since `lights-label` places first a lit landmark would otherwise lose its
 * name entirely. Instead `landmarks` blanks its own name for lit features once `lights-label` is
 * drawing, and `lights-label` stacks name over characteristic. Keep the two together.
 */
export function labels({
  decoration,
  symbolSize,
  topOfCell,
  withinBudget,
}: Visibility): LayerSpecification[] {
  return [
    {
      id: "landmarks",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      // below z10 the tiles carry only the landmarks a mariner steers by — conspicuous, lit,
      // or wind turbines (SeamarkZoomRules)
      minzoom: 6,
      filter: [
        "all",
        ["==", ["get", "type"], "landmark"],
        withinBudget,
        // a bare "tower" with no name, colour or function is not worth a symbol
        [
          "any",
          ["!=", ["get", "category"], "tower"],
          ["has", "color"],
          ["has", "name"],
          [
            "in",
            ["get", "function"],
            ["literal", ["radio", "radar", "television", "light_support", "leading"]],
          ],
        ],
      ],
      layout: {
        "icon-image": ["case", convis, landmarkIcon("convis/"), landmarkIcon("")],
        // a landmark stands on its charted position: base of the artwork on the point, like the
        // paper-chart symbol. The art's base line sits 4px (at chart-symbol scale) above the
        // sprite edge, so push down that far to land it on the position.
        "icon-anchor": "bottom",
        "icon-offset": [
          "case",
          convis,
          ["literal", [0, 4 * LMK_SCALE_CONVIS]],
          ["literal", [0, 4 * LMK_SCALE]],
        ],
        "icon-overlap": "always",
        // A name is a decoration: below the decoration zoom the symbol stands alone, which also
        // keeps landmark labels — placed last, so they win — from taking the space a harbour
        // badge needs. From z12 lights-label draws the name for lit landmarks instead, stacked
        // over the characteristic.
        "text-field": [
          "step",
          ["zoom"],
          "",
          12,
          ["case", lit, "", ["!", topOfCell], "", ["get", "name"]],
        ],
        "text-size": 12,
        "text-padding": 8,
        "text-font": ["Noto Sans Regular"],
        // One monotone ramp from snug to full clearance, like lights-label: intermediate stops
        // read as the label jumping around its mark. The icon is bottom-anchored, so nearly all
        // of it stands above the point: `above` clears the full sprite height, `below` only the
        // base pad.
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          anchorOffsets(0.85, 1.3, 0.6),
          16,
          anchorOffsets(1.82, 3.3, 1.15),
        ],
        "text-justify": "auto",
        "text-optional": true,
        // Full size is 1: the sheet carries each variant's artwork at display size, with CONVIS
        // bolder in the convis/ art rather than an upscale. The artwork is the same artwork
        // though, so what it can survive shrinking to is the same on-screen floor for both —
        // hence the larger variant's smaller floor fraction.
        "icon-size": symbolSize(
          RAMP_FROM,
          ["case", convis, TOKEN.detail / LMK_SCALE_CONVIS, TOKEN.detail / LMK_SCALE],
          12,
          1,
        ),
      },
      paint: { "text-color": colors.label, ...halo },
    },
    {
      id: "line_symbols",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: ["all", ["has", "name"], ["in", ["get", "type"], ["literal", ["ferry_route"]]]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": symbolSize(10, 10, 16, 12),
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": ["case", ["==", ["get", "type"], "ferry_route"], colors.ferry, colors.label],
        ...halo,
      },
    },
    {
      id: "seamark-line-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 13,
      filter: [
        "all",
        ["==", ["geometry-type"], "LineString"],
        ["has", "name"],
        // ferry routes are named by line_symbols, in ferry colour and repeating along the line
        ["!", ["in", ["get", "type"], ["literal", ["landmark", "harbour", "ferry_route"]]]],
      ],
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-letter-spacing": 0.1,
        "text-line-height": 1.6,
        "text-max-width": 5,
        "text-offset": [0, -0.65],
        "text-pitch-alignment": "viewport",
        "text-size": symbolSize(13, 10, 16, 13),
      },
      paint: { "text-color": colors.label, ...halo },
    },
    {
      id: "seamark-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["has", "name"],
        ["!", ["in", ["get", "type"], ["literal", ["landmark", "harbour"]]]],
        // a lit mark's name rides with its characteristic in lights-label
        ["!", lit],
        withinBudget,
        topOfCell,
      ],
      layout: {
        // unlit floating aids still letter sloping (S-4 B-450)
        "text-field": [
          "case",
          floating,
          ["format", ["get", "name"], { "text-font": ["literal", ["Noto Sans Italic"]] }],
          ["get", "name"],
        ] as ExpressionSpecification,
        "text-font": ["Noto Sans Regular"],
        "text-justify": "auto",
        "text-size": symbolSize(12, 10, 16, 13),
        "text-padding": 8,
        // MARK's pixel clearances in this layer's ems per stop. Hazards are centred symbols
        // (and can wear the wide isolated-danger octagon), so they take even margins.
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          [
            "case",
            ["in", ["get", "type"], ["literal", ["rock", "wreck", "obstruction"]]],
            anchorOffsets(1.7),
            bodied,
            bodyOffsets(10),
            markOffsets(10),
          ],
          16,
          [
            "case",
            ["in", ["get", "type"], ["literal", ["rock", "wreck", "obstruction"]]],
            anchorOffsets(1.4),
            bodied,
            bodyOffsets(13),
            markOffsets(13),
          ],
        ],
      },
      paint: { "text-color": colors.label, ...halo },
    },
    {
      // an active radar beacon is charted by name with its Morse group, magenta (INT 1 S3.6)
      id: "racon-labels",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["all", ["has", "radar_transponder"], decoration("characteristic"), withinBudget],
      layout: {
        "text-field": [
          "case",
          ["has", "radar_transponder_group"],
          ["concat", "Racon(", ["get", "radar_transponder_group"], ")"],
          "Racon",
        ],
        "text-font": ["Noto Sans Italic"],
        "text-size": 10,
        "text-anchor": "top",
        // below its host like a subtitle, tracking the body ramp in from a snug start
        "text-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          ["literal", [0, 0.85]],
          16,
          ["literal", [0, 1.4]],
        ],
        "text-optional": true,
      },
      paint: { "text-color": colors.magenta, ...halo },
    },
    {
      id: "lights-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["all", lit, decoration("characteristic"), withinBudget],
      layout: {
        // The name joins the characteristic at the name-legibility zoom, top-of-cell only — a
        // name is a luxury, the characteristic is not.
        "text-field": [
          "step",
          ["zoom"],
          ["case", floating, lightBlock(false, true), lightBlock(false, false)],
          12,
          [
            "case",
            ["!", ["all", ["has", "name"], topOfCell]],
            ["case", floating, lightBlock(false, true), lightBlock(false, false)],
            floating,
            lightBlock(true, true),
            lightBlock(true, false),
          ],
        ],
        "text-font": ["Noto Sans Regular"],
        "text-justify": "auto",
        "text-size": symbolSize(12, 10, 16, 14),
        // tighter than the name layers: the block carries the characteristic, and padding that
        // makes it fail to place hides information a mariner steers by
        "text-padding": 4,
        // Matches the gap `landmarks` leaves off the same symbol, in ems of this layer's
        // text-size. The low stops track the body's size ramp (RAMP_FROM → full at 12): an
        // offset held at its full-size value while the star is still near its floor reads as a
        // label adrift between marks, not attached to one. Landmarks are bottom-anchored, so
        // their branch mirrors the `landmarks` layer's clearances (rescaled to this text-size).
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          [
            "case",
            ["==", ["get", "type"], "landmark"],
            anchorOffsets(1.0, 1.55, 0.7),
            // snug while the body rides its size ramp; MARK's pixel clearances from z12, where
            // the body is full and a lit mark matches an unlit one (seamark-label)
            bodied,
            anchorOffsets(0.3, 1.15, 1.15, 0.3),
            anchorOffsets(0.3, 1.15),
          ],
          12,
          [
            "case",
            ["==", ["get", "type"], "landmark"],
            anchorOffsets(1.24, 2.1, 0.83),
            bodied,
            bodyOffsets(10),
            markOffsets(10),
          ],
          16,
          [
            "case",
            ["==", ["get", "type"], "landmark"],
            anchorOffsets(1.56, 2.83, 1.0),
            bodied,
            bodyOffsets(14),
            markOffsets(14),
          ],
        ],
      },
      paint: { ...halo },
    },
  ];
}
