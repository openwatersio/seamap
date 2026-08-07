import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/** Restricted-area colouring: conservation green, everything else chart magenta (RESARE04). */
const restrictionColor: ExpressionSpecification = [
  "case",
  [
    "in",
    ["get", "category"],
    [
      "literal",
      [
        "nature_reserve",
        "bird_sanctuary",
        "game_reserve",
        "seal_sanctuary",
        "fish_sanctuary",
        "ecological_reserve",
        "essa",
        "pssa",
      ],
    ],
  ],
  colors.conservation,
  colors.magenta,
];

/** The restriction value, resolved across the type-specific key and its unprefixed fallbacks. */
const restriction: ExpressionSpecification = [
  "coalesce",
  ["get", ["concat", "seamark:", ["get", "type"], ":restriction"]],
  ["get", "seamark:restriction"],
  ["get", "restriction"],
  "",
];

/**
 * Sea area boundaries and fills. These draw *below* the land fills, so a restricted area sweeping
 * across a coastline stops at the shore. Allowed areas (anchorages, moorings) draw before
 * restricted areas — RESARE outranks ACHARE (S-52 priority 5 vs 3) where they overlap.
 */
export function areas(): LayerSpecification[] {
  return [
    {
      id: "allowed-areas",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: [
        "in",
        ["get", "type"],
        [
          "literal",
          ["anchorage", "anchor_berth", "mooring", "dredged_area", "marine_farm", "harbour"],
        ],
      ],
      paint: {
        "line-color": [
          "case",
          ["in", ["get", "type"], ["literal", ["anchorage", "anchor_berth", "mooring"]]],
          colors.magenta,
          "black",
        ],
        "line-dasharray": [4, 4],
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 1.5],
      },
    },
    {
      id: "allowed-areas-labels",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: [
        "in",
        ["get", "type"],
        ["literal", ["anchorage", "anchor_berth", "mooring", "marine_farm"]],
      ],
      layout: {
        "icon-image": [
          "case",
          ["in", ["get", "type"], ["literal", ["anchorage", "anchor_berth", "mooring"]]],
          "freenauticalchart:anchor",
          [
            "in",
            ["get", "category"],
            ["literal", ["crustaceans", "oysters_mussels", "pearl_culture"]],
          ],
          "freenauticalchart:shellfish",
          "freenauticalchart:marine-farm",
        ],
        "icon-overlap": "always",
        "symbol-placement": "line",
        "symbol-spacing": 90,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.2, 12, 0.8],
      },
      paint: { "icon-opacity": 0.8 },
    },
    {
      id: "restricted-areas",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: [
        "in",
        ["get", "type"],
        [
          "literal",
          [
            "restricted_area",
            "military_area",
            "production_area",
            "cable_area",
            "dumping_ground",
            "pipeline_area",
          ],
        ],
      ],
      paint: {
        "line-color": restrictionColor,
        "line-dasharray": [4, 2],
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 1.5],
      },
    },
    {
      id: "restricted-areas-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: [
        "in",
        ["get", "type"],
        ["literal", ["restricted_area", "military_area", "production_area"]],
      ],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
      },
      paint: {
        "text-color": restrictionColor,
        "text-halo-color": colors.halo,
        "text-halo-width": 2,
        "text-halo-blur": 1,
      },
    },
    {
      id: "restricted-areas-fill",
      type: "fill",
      source: "seamap",
      "source-layer": "seamark",
      filter: [
        "in",
        ["get", "type"],
        [
          "literal",
          [
            "restricted_area",
            "military_area",
            "production_area",
            "cable_area",
            "dumping_ground",
            "pipeline_area",
          ],
        ],
      ],
      paint: { "fill-color": restrictionColor, "fill-opacity": 0.04 },
    },
    {
      // only the restrictions with an actual pattern — anything else resolves to an empty
      // image name and draws nothing
      id: "restricted-areas-fill-pattern",
      type: "fill",
      source: "seamap",
      "source-layer": "seamark",
      filter: [
        "let",
        "restriction",
        restriction,
        [
          "any",
          ["==", ["get", "type"], "military_area"],
          ["==", ["get", "category"], "military"],
          ["in", "no_entry", ["var", "restriction"]],
          ["in", "restricted_entry", ["var", "restriction"]],
          ["in", "no_anchoring", ["var", "restriction"]],
        ],
      ],
      paint: {
        "fill-pattern": [
          "let",
          "restriction",
          restriction,
          [
            "case",
            ["==", ["get", "type"], "military_area"],
            "freenauticalchart:military",
            ["==", ["get", "category"], "military"],
            "freenauticalchart:military",
            ["in", "no_entry", ["var", "restriction"]],
            "freenauticalchart:no-entry",
            ["in", "restricted_entry", ["var", "restriction"]],
            "freenauticalchart:no-entry",
            ["in", "no_anchoring", ["var", "restriction"]],
            "freenauticalchart:no-anchor",
            "",
          ],
        ],
        "fill-opacity": [
          "case",
          ["==", ["get", "type"], "military_area"],
          0.1,
          ["==", ["get", "category"], "military"],
          0.1,
          0.4,
        ],
      },
    },
  ];
}
