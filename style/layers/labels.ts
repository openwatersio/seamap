import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";

const halo = { "text-halo-color": "rgba(255,255,255,0.8)", "text-halo-width": 2, "text-halo-blur": 1 };

/**
 * Named features and the text that names them. These place last, and MapLibre collides symbols in
 * reverse draw order, so everything here outranks the icon layers below it.
 *
 * `landmarks` belongs with the labels rather than with the structures: it and `lights-label` share
 * an anchor point, and since `lights-label` places first a lit landmark would otherwise lose its
 * name entirely. Instead `landmarks` blanks its own name for lit features once `lights-label` is
 * drawing, and `lights-label` stacks name over characteristic. Keep the two together.
 */
export function labels(): LayerSpecification[] {
  return [
    {
      id: "landmarks", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 8,
      filter: ["all",
        ["==", ["get", "type"], "landmark"],
        // a bare "tower" with no name, colour or function is not worth a symbol
        ["any",
          ["!=", ["get", "category"], "tower"],
          ["has", "color"],
          ["has", "name"],
          ["in", ["get", "function"], ["literal", ["radio", "radar", "television", "light_support", "leading"]]],
        ],
      ],
      layout: {
        "icon-image": ["case",
          ["in", ["get", "function"], ["literal", ["church", "chapel"]]], "freenauticalchart:church",
          ["==", ["get", "category"], "cairn"], "freenauticalchart:cairn-lmk",
          ["==", ["get", "category"], "chimney"], "freenauticalchart:chimney",
          ["==", ["get", "category"], "column"], "freenauticalchart:column",
          ["==", ["get", "category"], "cross"], "freenauticalchart:cross-lmk",
          ["==", ["get", "category"], "dish_aerial"], "freenauticalchart:dish_aerial",
          ["==", ["get", "category"], "dome"], "freenauticalchart:dome",
          ["==", ["get", "category"], "flagstaff"], "freenauticalchart:flagstaff",
          ["==", ["get", "category"], "flare_stack"], "freenauticalchart:flare-stack",
          ["==", ["get", "category"], "mast"], "freenauticalchart:mast",
          ["==", ["get", "category"], "monument"], "freenauticalchart:monument",
          ["==", ["get", "category"], "obelisk"], "freenauticalchart:obelisk",
          ["==", ["get", "category"], "radar_scanner"], "freenauticalchart:radar_scanner",
          ["==", ["get", "category"], "spire"], "freenauticalchart:spire",
          ["==", ["get", "category"], "statue"], "freenauticalchart:statue",
          ["==", ["get", "category"], "tower"], "freenauticalchart:tower-lmk",
          ["==", ["get", "category"], "windmill"], "freenauticalchart:windmill",
          ["==", ["get", "category"], "windmotor"], "freenauticalchart:windmotor",
          ["==", ["get", "category"], "windsock"], "freenauticalchart:windsock",
          "freenauticalchart:monument"],
        "icon-overlap": "always",
        // from z11 lights-label draws the name for lit landmarks, stacked over the characteristic
        "text-field": ["step", ["zoom"],
          ["get", "name"],
          11, ["case", ["any", ["has", "seamark:light:colour"], ["has", "seamark:light:1:colour"]], "", ["get", "name"]]],
        "text-size": 12, "text-font": ["Noto Sans Regular"],
        "text-anchor": "left", "text-offset": [1, -0.5], "text-optional": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 1.3],
      },
      paint: { "text-color": "#333", ...halo },
    },
    {
      id: "line_symbols", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 10,
      filter: ["all", ["has", "name"], ["in", ["get", "type"], ["literal", ["ferry_route"]]]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, 12],
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": ["case", ["==", ["get", "type"], "ferry_route"], "#7c8af6", "#333"],
        ...halo,
      },
    },
    {
      id: "seamark-line-label", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 13,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["has", "name"], ["!", ["in", ["get", "type"], ["literal", ["landmark", "harbour"]]]]],
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-letter-spacing": 0.1, "text-line-height": 1.6, "text-max-width": 5,
        "text-offset": [0, -0.65], "text-pitch-alignment": "viewport",
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 13],
      },
      paint: { "text-color": "#333", ...halo },
    },
    {
      id: "seamark-label", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 12,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"], ["!", ["in", ["get", "type"], ["literal", ["landmark", "harbour"]]]]],
      layout: {
        "text-anchor": "right", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"],
        "text-offset": [-1.3, -0.3],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
      },
      paint: { "text-color": "#333", ...halo },
    },
    {
      id: "lights-label", type: "symbol", source: "seamap", "source-layer": "seamark", minzoom: 11,
      filter: ["any", ["has", "seamark:light:colour"], ["has", "seamark:light:1:colour"]],
      layout: {
        "text-anchor": "left",
        "text-field": ["case",
          ["all", ["==", ["get", "type"], "landmark"], ["has", "name"]],
          ["concat", ["get", "name"], "\n", ["get", "light"]],
          ["get", "light"]],
        "text-font": ["Noto Sans Regular"], "text-justify": "left",
        "text-offset": [1.2, 0.2],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 14],
      },
      paint: { ...halo },
    },
  ];
}
