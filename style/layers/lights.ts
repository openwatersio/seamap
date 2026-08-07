import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/** Sprite folder for the flare icon: floodlights have their own artwork. */
const lightPrefix: ExpressionSpecification = [
  "case",
  [
    "==",
    ["coalesce", ["get", "seamark:light:category"], ["get", "seamark:light:1:category"], ""],
    "floodlight",
  ],
  "floodlight/",
  "light/",
];

/**
 * Lit marks: the flare on a lit feature, the sector arcs and rays from the `light` layer, the
 * standalone light symbols, and fog signals. The light *characteristic* label lives in
 * labels.ts, where it shares an anchor with the name labels it has to cooperate with.
 */
export function lights(): LayerSpecification[] {
  return [
    {
      id: "lights",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: ["any", ["has", "seamark:light:colour"], ["has", "seamark:light:1:colour"]],
      layout: {
        // colour combinations the sheet doesn't carry fall back to the generic flare
        "icon-image": [
          "coalesce",
          [
            "image",
            [
              "concat",
              "freenauticalchart:",
              lightPrefix,
              ["coalesce", ["get", "seamark:light:colour"], ["get", "seamark:light:1:colour"]],
            ],
          ],
          ["image", ["concat", "freenauticalchart:", lightPrefix, "generic"]],
        ],
        "icon-anchor": "top",
        "icon-offset": [0, 2],
        "icon-rotate": -45,
        "icon-overlap": "always",
        "icon-rotation-alignment": "viewport",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 12, 1],
      },
    },
    {
      id: "light_ray",
      type: "line",
      source: "seamap",
      "source-layer": "light",
      minzoom: 5,
      filter: ["==", ["get", "subtype"], "ray"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.sectorLeg,
        "line-dasharray": [2, 3],
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 10, 1],
      },
    },
    {
      id: "light_arc",
      type: "line",
      source: "seamap",
      "source-layer": "light",
      minzoom: 5,
      filter: ["==", ["get", "subtype"], "arc"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        // same hexes as the flare sprites, so a light's arc and its own flare agree
        "line-color": [
          "case",
          ["==", ["get", "color"], "green"],
          colors.lightGreen,
          ["==", ["get", "color"], "red"],
          colors.lightRed,
          colors.lightYellow,
        ],
        "line-opacity": 1,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 14, 3],
      },
    },
    {
      id: "light-minor",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: ["==", ["get", "type"], "light_minor"],
      layout: {
        "icon-image": "freenauticalchart:light-minor",
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 1.2],
      },
    },
    {
      id: "light-major",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 6,
      filter: ["==", ["get", "type"], "light_major"],
      layout: {
        "icon-image": "freenauticalchart:light-major",
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 1.2],
      },
    },
    {
      id: "fogsignals",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: ["has", "seamark:fog_signal:category"],
      layout: {
        "icon-image": "freenauticalchart:fogsignal",
        "icon-overlap": "always",
        "icon-rotate": 90,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 12, 1],
      },
    },
  ];
}
