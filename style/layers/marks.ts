import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * How far above a mark's position its topmark and radar reflector sit, by body shape. The sprite
 * sheet is tight-cropped (like the sprite source's own pipeline), so these offsets live here
 * rather than being baked into padded canvases.
 */
const topmarkOffset: ExpressionSpecification = ["case",
  ["in", ["get", "shape"], ["literal", ["buoyant", "lattice", "pile", "tower"]]], ["literal", [0, -20]],
  ["in", ["get", "shape"], ["literal", ["stake", "pole"]]], ["literal", [0, -19]],
  ["==", ["get", "shape"], "conical"], ["literal", [0, -12]],
  ["==", ["get", "shape"], "can"], ["literal", [0, -8]],
  ["==", ["get", "shape"], "spherical"], ["literal", [0, -9]],
  ["==", ["get", "shape"], "barrel"], ["literal", [0, -9]],
  ["literal", [0, -22]],
];

/** Same shapes, shifted higher so the reflector clears any topmark below it. */
const reflectorOffset: ExpressionSpecification = ["case",
  ["in", ["get", "shape"], ["literal", ["buoyant", "lattice", "pile", "tower"]]], ["literal", [0, -28]],
  ["in", ["get", "shape"], ["literal", ["stake", "pole"]]], ["literal", [0, -27]],
  ["==", ["get", "shape"], "conical"], ["literal", [0, -20]],
  ["==", ["get", "shape"], "can"], ["literal", [0, -16]],
  ["in", ["get", "shape"], ["literal", ["spherical", "barrel"]]], ["literal", [0, -17]],
  ["literal", [0, -30]],
];

/** The sheet names lattice/buoyant bodies "pile" and pole/perch/post bodies "stake". */
const bodyShape: ExpressionSpecification = ["case",
  ["in", ["get", "shape"], ["literal", ["buoyant", "lattice"]]], "pile",
  ["in", ["get", "shape"], ["literal", ["pole", "perch", "post"]]], "stake",
  ["get", "shape"],
];

/** Floating and fixed marks: buoys and beacons, their topmarks and radar reflectors. */
export function marks(): LayerSpecification[] {
  return [
    {
      id: "radar-reflectors", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 10,
      filter: ["has", "radar_reflector"],
      layout: {
        "icon-image": "freenauticalchart:radar-reflector", "icon-rotate": -60, "icon-overlap": "always",
        "icon-offset": reflectorOffset,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 12, 1],
      },
    },
    {
      id: "topmarks", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 8,
      filter: ["has", "topmark_shape"],
      layout: {
        "icon-image": ["case",
          ["has", "topmark_color_pattern"], ["concat", "freenauticalchart:", ["get", "topmark_shape"], "/", ["get", "topmark_color_pattern"], "/", ["get", "topmark_color"]],
          ["concat", "freenauticalchart:", ["get", "topmark_shape"], "/", ["get", "topmark_color"]]],
        "icon-overlap": "always",
        "icon-offset": topmarkOffset,
        "icon-rotate": ["case", ["in", ["get", "shape"], ["literal", ["pillar", "barrel", "conical", "spar", "can"]]], 15, 0],
        "icon-size": ["interpolate", ["linear"], ["zoom"],
          8, ["case", ["any", ["in", "buoy", ["get", "type"]], ["in", "beacon", ["get", "type"]]], 0.3, 0.4],
          12, ["case", ["any", ["in", "buoy", ["get", "type"]], ["in", "beacon", ["get", "type"]]], 1, 1.2]],
      },
    },
    {
      id: "buoys", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 8,
      filter: ["any", ["in", "buoy", ["get", "type"]], ["in", "beacon", ["get", "type"]]],
      layout: {
        "icon-image": ["case",
          ["all", ["has", "color_pattern"], ["!", ["==", ["get", "color_pattern"], "no"]]],
          ["concat", "freenauticalchart:", bodyShape, "/", ["get", "color_pattern"], "/", ["get", "color"]],
          ["concat", "freenauticalchart:", bodyShape, "/", ["coalesce", ["get", "color"], "generic"]]],
        "icon-anchor": "bottom",
        "icon-offset": [0, 4],
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 12, 1],
      },
    },
  ];
}
