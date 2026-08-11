import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { TOKEN, decoration, sizeRamp, withinBudget } from "./visibility.js";

/**
 * Body heights by shape, expressed as the y-offset (sprite px, scaled by icon-size) that puts a
 * bottom-anchored icon's base just clear of the hull. The bodies are bottom-anchored at +4, so a
 * shape of height h has its top at 4 − h; −2 more leaves the clear gap IALA R1001 asks for
 * between a topmark and the mark below it.
 */
const BODY_TOP: [string[], number][] = [
  [["pillar", "spar", "stake", "pole", "perch", "post"], -26],
  [["buoyant", "lattice", "pile", "tower"], -24],
  [["cairn"], -22],
  [["conical"], -16],
  [["can"], -14],
  [["spherical", "barrel", "super-buoy"], -12],
];

/** Offset that floats an icon `lift` px above the body's top edge (0 = resting just clear). */
function aboveBody(lift: number): ExpressionSpecification {
  const cases: unknown[] = [
    "case",
    // light floats/vessels rarely carry a shape tag; their hulls are squat
    ["in", ["get", "type"], ["literal", ["light_float", "light_vessel"]]],
    ["literal", [0, -16 + lift]],
  ];
  for (const [shapes, y] of BODY_TOP) {
    cases.push(["in", ["get", "shape"], ["literal", shapes]], ["literal", [0, y + lift]]);
  }
  cases.push(["literal", [0, -26 + lift]]); // unknown shapes draw the tall generic body
  return cases as ExpressionSpecification;
}

const topmarkOffset = aboveBody(0);
// clears a typical 12 px topmark; without one the reflector floats a little, which reads fine
const reflectorOffset = aboveBody(-14);

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
 * Floating and fixed marks: buoys and beacons, their topmarks and radar reflectors. Topmarks and
 * reflectors draw after the bodies so a hull can never paint over them. minzoom 6 defers to the
 * tile pipeline, which only carries cardinal/isolated-danger/safe-water marks below zoom 8
 * (SeamarkZoomRules).
 */
export function marks(): LayerSpecification[] {
  return [
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
        "symbol-sort-key": ["coalesce", ["get", "cell_rank"], 0],
        "icon-offset": topmarkOffset,
        "icon-rotate": [
          "case",
          ["in", ["get", "shape"], ["literal", ["pillar", "barrel", "conical", "spar", "can"]]],
          15,
          0,
        ],
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          [
            "case",
            ["any", ["in", "buoy", ["get", "type"]], ["in", "beacon", ["get", "type"]]],
            0.7,
            0.8,
          ],
          14,
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
        "symbol-sort-key": ["coalesce", ["get", "cell_rank"], 0],
        "icon-offset": reflectorOffset,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 14, 1],
      },
    },
  ];
}
