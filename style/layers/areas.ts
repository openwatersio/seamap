import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/** Conservation categories draw green; everything else chart magenta (a recorded departure). */
const isConservation: ExpressionSpecification = [
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
];

/** Restricted-area colouring: conservation green, everything else chart magenta (RESARE04). */
const restrictionColor: ExpressionSpecification = [
  "case",
  isConservation,
  colors.conservation,
  colors.magenta,
];

const RESTRICTED_TYPES = [
  "restricted_area",
  "military_area",
  "production_area",
  "cable_area",
  "dumping_ground",
  "pipeline_area",
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
 * The repeat-cell glyph for a restriction. Always the half-size `-sm` variant
 * (style/bin/sprites): S-52 tiles no restriction glyph at all — a centred symbol and the
 * boundary carry it — so the tiled glyph this chart keeps for pannability stays small and
 * faint, whispering the kind of restriction rather than papering the area with it.
 */
const restrictionPattern: ExpressionSpecification = [
  "let",
  "restriction",
  restriction,
  [
    "case",
    ["==", ["get", "type"], "military_area"],
    "freenauticalchart:military-sm",
    ["==", ["get", "category"], "military"],
    "freenauticalchart:military-sm",
    ["in", "no_entry", ["var", "restriction"]],
    "freenauticalchart:no-entry-sm",
    ["in", "restricted_entry", ["var", "restriction"]],
    "freenauticalchart:no-entry-sm",
    ["in", "no_anchoring", ["var", "restriction"]],
    "freenauticalchart:no-anchor-sm",
    "",
  ],
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
      filter: ["in", ["get", "type"], ["literal", RESTRICTED_TYPES]],
      paint: {
        "line-color": restrictionColor,
        "line-dasharray": [4, 2],
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 1.5],
      },
    },
    {
      // The paper T-dash (S-4 B-439.2, S-52 ENTRES51): short stubs on the inward side of
      // the limit, riding beside the dashed line above. MVT v2 winds exterior rings
      // clockwise in screen space, so the interior lies to the right of travel: a positive
      // line-offset pushes the stub band inward, and holes wind the other way, flipping
      // offset and tick together so stubs still point into the restricted water. A pattern
      // cannot be recoloured at runtime, so the sprite ships per boundary colour.
      id: "restricted-areas-stubs",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 9,
      filter: ["in", ["get", "type"], ["literal", RESTRICTED_TYPES]],
      paint: {
        "line-pattern": [
          "case",
          isConservation,
          "freenauticalchart:t-stub-green",
          "freenauticalchart:t-stub-magenta",
        ],
        // the image scales with line-width (aspect preserved), so the ticks grow in and
        // tighten with the boundary's own ramp
        // native at width 7: S-52's 1.6 mm ticks every 7.7 mm land at 6 px every 29 px
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 7],
        "line-offset": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 3.5],
        "line-opacity": 0.8,
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
        "fill-pattern": restrictionPattern,
        // faint, like every standards area screen (S-52's one sanctioned screen is 75%
        // transparent); the tint and boundary localize the area, the glyph only names it
        "fill-opacity": [
          "case",
          ["==", ["get", "type"], "military_area"],
          0.1,
          ["==", ["get", "category"], "military"],
          0.1,
          0.2,
        ],
      },
    },
  ];
}
