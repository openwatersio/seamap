import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { TOKEN, decoration, sizeRamp, withinBudget } from "./visibility.js";

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
      filter: [
        "all",
        ["any", ["has", "seamark:light:colour"], ["has", "seamark:light:1:colour"]],
        decoration("flare"),
        withinBudget,
      ],
      layout: {
        // light_color is the S-52 LIGHTS06 precedence resolved in the tiles; older tiles
        // without it fall back to the raw colour value, then to the generic flare
        "icon-image": [
          "coalesce",
          ["image", ["concat", "freenauticalchart:", lightPrefix, ["get", "light_color"]]],
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
        // a decoration anchored to its body always collides with that body, so it must keep
        // guaranteed placement; the budget and legibility filters above do the thinning
        "icon-overlap": "always",
        "icon-rotation-alignment": "viewport",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 14, 1],
      },
    },
    {
      id: "light-minor",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: ["all", ["==", ["get", "type"], "light_minor"], withinBudget],
      layout: {
        "icon-image": "freenauticalchart:light-minor",
        "icon-overlap": "always",
        "icon-size": sizeRamp(TOKEN.star, 12, 1.2),
      },
    },
    {
      id: "light-major",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 6,
      filter: ["all", ["==", ["get", "type"], "light_major"], withinBudget],
      layout: {
        "icon-image": "freenauticalchart:light-major",
        "icon-overlap": "always",
        "icon-size": sizeRamp(TOKEN.star, 11, 1.2),
      },
    },
    {
      id: "fogsignals",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: [
        "all",
        ["has", "seamark:fog_signal:category"],
        decoration("fogSignal"),
        withinBudget,
      ],
      layout: {
        "icon-image": "freenauticalchart:fogsignal",
        "icon-overlap": "always",
        "icon-rotate": 90,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 14, 1],
      },
    },
  ];
}
