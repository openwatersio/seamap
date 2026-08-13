import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { RAMP_FROM, TOKEN, decoration, sizeRamp, withinBudget } from "./visibility.js";

/**
 * Y-offsets (sprite px, scaled by icon-size) that seat a bottom-anchored topmark on each body
 * shape. Bodies are bottom-anchored at +4; the topmark's base overlaps the body's top by a few
 * px and the body paints over it, so the topmark reads as mounted on the mark. Values tuned by
 * the sprite author (openwatersio/seamap#19).
 */
const TOPMARK_Y: [string[], number][] = [
  [["pillar", "spar", "stake", "pole", "perch", "post"], -22],
  [["buoyant", "lattice", "pile", "tower"], -20],
  [["cairn"], -22],
  [["conical"], -12],
  [["can"], -8],
  [["spherical", "barrel", "super-buoy"], -9],
];

/**
 * Reflectors clear a typical 12 px topmark on squat bodies; on tall thin bodies the reflector is
 * charted partway up the body itself, below the topmark.
 */
const REFLECTOR_Y: [string[], number][] = [
  [["pillar", "spar", "stake", "pole", "perch", "post"], -10],
  [["buoyant", "lattice", "pile", "tower"], -10],
  [["cairn"], -36],
  [["conical"], -30],
  [["can"], -28],
  [["spherical", "barrel", "super-buoy"], -26],
];

function shapeOffset(
  floatY: number,
  table: [string[], number][],
  fallbackY: number,
): ExpressionSpecification {
  const cases: unknown[] = [
    "case",
    // light floats/vessels rarely carry a shape tag; their hulls are squat
    ["in", ["get", "type"], ["literal", ["light_float", "light_vessel"]]],
    ["literal", [0, floatY]],
  ];
  for (const [shapes, y] of table) {
    cases.push(["in", ["get", "shape"], ["literal", shapes]], ["literal", [0, y]]);
  }
  cases.push(["literal", [0, fallbackY]]); // unknown shapes draw the tall generic body
  return cases as ExpressionSpecification;
}

const topmarkOffset = shapeOffset(-16, TOPMARK_Y, -26);
const reflectorOffset = shapeOffset(-30, REFLECTOR_Y, -40);

/** The sheet names buoyant bodies "pile" and pole/perch/post bodies "stake". */
const bodyShape: ExpressionSpecification = [
  "case",
  ["in", ["get", "shape"], ["literal", ["buoyant"]]],
  "pile",
  ["in", ["get", "shape"], ["literal", ["pole", "perch", "post"]]],
  "stake",
  // no dedicated ice-buoy art exists anywhere (S-52 only has a simplified-mode symbol);
  // the super-buoy silhouette is the accepted stand-in (OpenSeaMap-vector does the same)
  ["in", ["get", "shape"], ["literal", ["ice-buoy", "ice_buoy"]]],
  "super-buoy",
  [
    "all",
    ["!", ["has", "shape"]],
    ["in", ["get", "type"], ["literal", ["light_float", "light_vessel"]]],
  ],
  ["case", ["==", ["get", "type"], "light_float"], "light_float", "super-buoy"],
  ["get", "shape"],
];

/** Like bodyShape, but collapses lattice into pile — the pile family carries colour patterns. */
const patternBodyShape: ExpressionSpecification = [
  "case",
  ["==", ["get", "shape"], "lattice"],
  "pile",
  bodyShape,
];

/**
 * Floating and fixed marks: buoys and beacons, their topmarks and radar reflectors. Topmarks draw
 * before the bodies so the hull hides their overlapping base and they read as mounted on the
 * mark; reflectors draw last, charted over the mark. minzoom 6 defers to the tile pipeline,
 * which only carries cardinal/isolated-danger/safe-water marks below zoom 8 (SeamarkZoomRules).
 */
export function marks(): LayerSpecification[] {
  return [
    {
      id: "topmarks",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 6,
      filter: ["all", ["has", "topmark_shape"], decoration("topmark"), withinBudget],
      layout: {
        // colour combinations the sheet doesn't carry fall back to the shape's generic icon, then
        // to the bare shape name (besom topmarks ship uncoloured)
        "icon-image": [
          "coalesce",
          [
            "image",
            [
              "case",
              ["has", "topmark_color_pattern"],
              [
                "concat",
                "freenauticalchart:",
                ["get", "topmark_shape"],
                "/",
                ["get", "topmark_color_pattern"],
                "/",
                ["get", "topmark_color"],
              ],
              [
                "concat",
                "freenauticalchart:",
                ["get", "topmark_shape"],
                "/",
                ["get", "topmark_color"],
              ],
            ],
          ],
          ["image", ["concat", "freenauticalchart:", ["get", "topmark_shape"], "/generic"]],
          ["image", ["concat", "freenauticalchart:", ["get", "topmark_shape"]]],
        ],
        "icon-anchor": "bottom",
        // anchored to its body, so collision would always drop it; the filters do the thinning
        "icon-overlap": "always",
        "icon-offset": topmarkOffset,
        "icon-rotate": [
          "case",
          ["in", ["get", "shape"], ["literal", ["pillar", "barrel", "conical", "spar", "can"]]],
          15,
          0,
        ],
        // icon-offset is scaled by the icon's own icon-size, while the seat it aims for scales
        // with the hull ramp — this must stay a constant multiple of the body's ramp, or the
        // topmark rams into the body where the ratio shrinks and floats off where it grows
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          [
            "case",
            ["any", ["in", "buoy", ["get", "type"]], ["in", "beacon", ["get", "type"]]],
            TOKEN.hull,
            1.2 * TOKEN.hull,
          ],
          12,
          [
            "case",
            ["any", ["in", "buoy", ["get", "type"]], ["in", "beacon", ["get", "type"]]],
            1,
            1.2,
          ],
        ],
      },
    },
    {
      id: "buoys",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 6,
      filter: [
        "all",
        [
          "any",
          ["in", "buoy", ["get", "type"]],
          ["in", "beacon", ["get", "type"]],
          ["in", ["get", "type"], ["literal", ["light_float", "light_vessel"]]],
        ],
        withinBudget,
      ],
      layout: {
        // colour combinations the sheet doesn't carry fall back to the body's generic icon, and
        // an unknown body falls back to a generic pillar (buoy) or stake (beacon): a charted aid
        // to navigation must never disappear entirely
        "icon-image": [
          "coalesce",
          // a withy is a complete pre-composed symbol per hand (S-52 PRICKE03/04); it takes no
          // colour variants and no topmark
          [
            "image",
            [
              "case",
              ["all", ["==", ["get", "shape"], "withy"], ["==", ["get", "category"], "port"]],
              "freenauticalchart:withy-port",
              ["==", ["get", "shape"], "withy"],
              "freenauticalchart:withy-starboard",
              "",
            ],
          ],
          [
            "image",
            [
              "case",
              ["all", ["has", "color_pattern"], ["!", ["==", ["get", "color_pattern"], "no"]]],
              [
                "concat",
                "freenauticalchart:",
                patternBodyShape,
                "/",
                ["get", "color_pattern"],
                "/",
                ["get", "color"],
              ],
              [
                "concat",
                "freenauticalchart:",
                bodyShape,
                "/",
                ["coalesce", ["get", "color"], "generic"],
              ],
            ],
          ],
          ["image", ["concat", "freenauticalchart:", patternBodyShape, "/", ["get", "color"]]],
          ["image", ["concat", "freenauticalchart:", bodyShape, "/generic"]],
          [
            "image",
            [
              "case",
              ["in", "beacon", ["get", "type"]],
              "freenauticalchart:stake/generic",
              "freenauticalchart:pillar/generic",
            ],
          ],
        ],
        "icon-anchor": "bottom",
        "icon-offset": [0, 4],
        "icon-overlap": "always",
        "icon-size": sizeRamp(TOKEN.hull, 12),
      },
    },
    {
      id: "radar-reflectors",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: ["all", ["has", "radar_reflector"], decoration("reflector"), withinBudget],
      layout: {
        "icon-image": "freenauticalchart:radar-reflector",
        "icon-rotate": -60,
        "icon-anchor": "bottom",
        "icon-overlap": "always",
        "icon-offset": reflectorOffset,
        // constant multiple of the hull ramp, for the same reason as the topmark's icon-size
        "icon-size": sizeRamp(TOKEN.hull, 12),
      },
    },
  ];
}
