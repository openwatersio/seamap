import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import { anchorOffsets } from "./placement.js";
import { TOKEN, sizeRamp, withinBudget } from "./visibility.js";

/**
 * Fixed shore and harbour works: piers and breakwaters, piles and dolphins, platforms, cranes,
 * and shore stations.
 */
const wallWaterLevel: ExpressionSpecification = [
  "coalesce",
  ["get", "seamark:shoreline_construction:water_level"],
  ["get", "seamark:water_level"],
  ["get", "water_level"],
  "",
];

export function structures(): LayerSpecification[] {
  // access values that mean "not open to the public" (OpenSeaMap-vector's PRIVATE_TAGS).
  // An untagged feature gets null, and `in` against null is false, so it reads as public.
  const restricted: ExpressionSpecification = [
    "in",
    ["get", "access"],
    ["literal", ["no", "private", "permit", "customers"]],
  ];

  return [
    {
      id: "shoreline-constructions",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: ["==", ["get", "type"], "shoreline_construction"],
      paint: {
        "line-color": colors.coastline,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.8],
        // a training wall or causeway that covers draws dashed (SLCONS04, WATLEV 3/4)
        "line-dasharray": [
          "match",
          wallWaterLevel,
          ["covers", "flooding", "awash"],
          ["literal", [2, 2]],
          ["literal", [1, 0]],
        ],
      },
    },
    {
      // floating docks (PONTON): same linework as piers — at chart scales a pontoon just
      // needs to not disappear, and the line outlines polygon geometries too
      id: "pontoons",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: ["==", ["get", "type"], "pontoon"],
      paint: {
        "line-color": colors.coastline,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.8],
      },
    },
    {
      // A hulk is a permanently moored vessel — a floating piece of ground, charted brown with a
      // coastline edge rather than as a wreck (S-52 HULKES, AC(CHBRN);LS(SOLD,2,CSTLN)). Extruded
      // so it stands up under pitch; looking straight down its roof is the brown fill S-52 asks
      // for. The outline is a separate layer because fill-extrusion has none.
      id: "hulks",
      type: "fill-extrusion",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: ["==", ["get", "type"], "hulk"],
      paint: {
        "fill-extrusion-color": colors.chartBrown,
        // building:height is rarely tagged and can hold a unit suffix, so 5 m stands in for a
        // plain vessel both when it is missing and when it won't parse
        "fill-extrusion-height": [
          "case",
          ["has", "building:height"],
          ["to-number", ["get", "building:height"], 5],
          5,
        ],
      },
    },
    {
      id: "hulk-outlines",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: ["==", ["get", "type"], "hulk"],
      paint: {
        "line-color": colors.coastline,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.8],
      },
    },
    {
      id: "piles",
      type: "circle",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["all", ["in", ["get", "type"], ["literal", ["pile", "mooring"]]], withinBudget],
      paint: { "circle-radius": 3 },
    },
    {
      id: "platforms",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: ["all", ["==", ["get", "type"], "platform"], withinBudget],
      layout: {
        "icon-image": "freenauticalchart:platform",
        "icon-overlap": "always",
        "icon-size": sizeRamp(TOKEN.detail, 10),
        // OFSPLF carries its name on the chart, once the zoom can carry decorations
        "text-field": ["step", ["zoom"], "", 12, ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-variable-anchor": ["left", "right", "bottom", "top"],
        "text-radial-offset": 1,
        "text-justify": "auto",
        "text-optional": true,
      },
      paint: {
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 2,
        "text-halo-blur": 1,
      },
    },
    {
      id: "cranes",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 14,
      filter: ["all", ["==", ["get", "type"], "crane"], withinBudget],
      layout: {
        "icon-image": "freenauticalchart:crane",
        "symbol-sort-key": ["coalesce", ["get", "cell_rank"], 0],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 16, 1],
      },
    },
    {
      id: "rescue-stations",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: ["all", ["==", ["get", "type"], "rescue_station"], withinBudget],
      layout: {
        "icon-image": "freenauticalchart:rescue",
        "symbol-sort-key": ["coalesce", ["get", "cell_rank"], 0],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 13, 1],
      },
    },
    {
      id: "radar-stations",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["all", ["==", ["get", "type"], "radar_station"], withinBudget],
      layout: {
        "icon-image": "freenauticalchart:radar_scanner",
        "symbol-sort-key": ["coalesce", ["get", "cell_rank"], 0],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 14, 1],
      },
    },
    {
      id: "radio_station",
      type: "circle",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: ["has", "radio_station"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 12, 40],
        "circle-opacity": 0,
        "circle-stroke-color": colors.magenta,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 12, 1.5],
      },
    },
    {
      // no icon-overlap: a harbour with 146 slipways declutters instead of becoming a wall of discs
      id: "small-craft-facilities",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 14,
      // Only show small craft facilities that are open to the public.
      filter: ["all", ["==", ["get", "type"], "small_craft_facility"], ["!", restricted]],
      layout: {
        "icon-image": [
          "match",
          ["get", "category"],
          "slipway",
          "freenauticalchart:poi-slipway",
          "fuel_station",
          "freenauticalchart:poi-fuel",
          ["water_tap", "drinking_water"],
          "freenauticalchart:poi-water",
          "pump-out",
          "freenauticalchart:poi-pumpout",
          ["visitor_berth", "visitors_mooring", "berth"],
          "freenauticalchart:poi-berth",
          "nautical_club",
          "freenauticalchart:poi-club",
          "boat_hoist",
          "freenauticalchart:poi-hoist",
          "boatyard",
          "freenauticalchart:poi-boatyard",
          "boat_storage",
          "freenauticalchart:poi-boat-storage",
          "toilets",
          "freenauticalchart:poi-toilets",
          "showers",
          "freenauticalchart:poi-showers",
          "laundrette",
          "freenauticalchart:poi-laundry",
          "provisions",
          "freenauticalchart:poi-provisions",
          "restaurant",
          "freenauticalchart:poi-restaurant",
          "chandler",
          "freenauticalchart:poi-chandler",
          "electricity",
          "freenauticalchart:poi-electricity",
          "access_point",
          "freenauticalchart:poi-kayak",
          "fish_cleaning",
          "freenauticalchart:poi-fish-cleaning",
          "fishing",
          "freenauticalchart:poi-fishing",
          "beach",
          "freenauticalchart:poi-beach",
          "freenauticalchart:poi-generic",
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.8, 17, 1],
        // which grades a dock sells decides whether it's worth the detour; the other badges say
        // all they need to with the icon
        "text-field": [
          "case",
          ["==", ["get", "category"], "fuel_station"],
          ["coalesce", ["get", "fuel"], ""],
          "",
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        // tracks icon-size to hold ~7.5px from the 32px badge edge to the glyph, as the
        // harbour labels do
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14,
          anchorOffsets(2.03),
          17,
          anchorOffsets(2.35),
        ],
        "text-justify": "auto",
        "text-optional": true,
      },
      paint: {
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 2,
        "text-halo-blur": 1,
      },
    },
    {
      id: "harhours",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        // without the type check this also catches small_craft_facility/fishing points
        ["==", ["get", "type"], "harbour"],
        ["in", ["get", "category"], ["literal", ["marina", "fishing"]]],
        withinBudget,
      ],
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "category"], "marina"],
          "freenauticalchart:poi-marina",
          ["==", ["get", "category"], "fishing"],
          "freenauticalchart:poi-fishing-harbour",
          "",
        ],
        "icon-size": sizeRamp(TOKEN.disc, 12),
        "icon-overlap": "always",
        "text-font": ["Noto Sans Regular"],
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 12, 12],
        // tracks icon-size to hold ~7.5px from icon edge to glyph, leaving ~5px clear of the halo.
        // Both sprites are square 32 display px at icon-size 1, so both axes match.
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          anchorOffsets(1.72),
          12,
          anchorOffsets(1.96),
        ],
        "text-justify": "auto",
        "text-optional": true,
      },
      paint: {
        "icon-opacity": ["case", restricted, 0.5, 1],
        "text-opacity": ["case", restricted, 0.5, 1],
        // magenta is reserved for AtoN and regulated areas; names read like every other label
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 2,
        "text-halo-blur": 1,
      },
    },
  ];
}
