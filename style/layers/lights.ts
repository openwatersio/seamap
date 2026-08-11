import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import { TOKEN, decoration, sizeRamp, withinBudget } from "./visibility.js";

/** A sector where the light shows; obscured/faint sectors draw uncoloured (S-52 LIGHTS06). */
const visible: ExpressionSpecification = [
  "!",
  [
    "in",
    ["coalesce", ["get", "visibility"], ""],
    ["literal", ["obscured", "part_obscured", "partially_obscured", "faint"]],
  ],
];

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
        "symbol-sort-key": ["coalesce", ["get", "cell_rank"], 0],
        "icon-rotation-alignment": "viewport",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 14, 1],
      },
    },
    {
      // arcs and rays are fixed ground figures (0.4-0.7 NM) and sub-pixel below ~z11; showing
      // them before the flare that casts them reads as stray coloured specks
      id: "light_ray",
      type: "line",
      source: "seamap",
      "source-layer": "light",
      minzoom: 11,
      filter: ["all", ["==", ["get", "subtype"], "ray"], decoration("sector"), withinBudget],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.sectorLeg,
        "line-dasharray": [2, 3],
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 10, 1],
      },
    },
    {
      // S-52 cases every arc in a wide neutral stroke (LIGHTS06: 4-unit OUTLW under the
      // colour); it's what makes a yellow arc on pale water read as a chart feature
      id: "light_arc_casing",
      type: "line",
      source: "seamap",
      "source-layer": "light",
      minzoom: 11,
      filter: [
        "all",
        ["==", ["get", "subtype"], "arc"],
        visible,
        decoration("sector"),
        withinBudget,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.label,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 14, 5],
      },
    },
    {
      id: "light_arc",
      type: "line",
      source: "seamap",
      "source-layer": "light",
      minzoom: 11,
      filter: [
        "all",
        ["==", ["get", "subtype"], "arc"],
        visible,
        decoration("sector"),
        withinBudget,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        // same hexes as the flare sprites, so a light's arc and its own flare agree; orange
        // and amber cover older tiles' raw values, and anything the S-52 precedence can't
        // name falls through to magenta, never a fake colour
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
        "line-opacity": 1,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 14, 3],
      },
    },
    {
      // an obscured, partly-obscured or faint sector is where the light is NOT (fully)
      // visible: S-52 leaves the arc uncoloured, dashed like the legs
      id: "light_arc_obscured",
      type: "line",
      source: "seamap",
      "source-layer": "light",
      minzoom: 11,
      filter: [
        "all",
        ["==", ["get", "subtype"], "arc"],
        ["!", visible],
        decoration("sector"),
        withinBudget,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.sectorLeg,
        "line-dasharray": [2, 2],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 14, 2],
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
        "symbol-sort-key": ["coalesce", ["get", "cell_rank"], 0],
        "icon-rotate": 90,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 14, 1],
      },
    },
  ];
}
