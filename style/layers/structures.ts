import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import { anchorOffsets } from "./placement.js";

/**
 * Fixed shore and harbour works: piers and breakwaters, piles and dolphins, platforms, cranes,
 * and shore stations.
 */
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
      id: "piles",
      type: "circle",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["in", ["get", "type"], ["literal", ["pile", "mooring"]]],
      paint: { "circle-radius": 3 },
    },
    {
      id: "platforms",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: ["==", ["get", "type"], "platform"],
      layout: {
        "icon-image": "freenauticalchart:platform",
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 10, 1],
      },
    },
    {
      id: "cranes",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 14,
      filter: ["==", ["get", "type"], "crane"],
      layout: {
        "icon-image": "freenauticalchart:crane",
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 16, 1],
      },
    },
    {
      id: "rescue-stations",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: ["==", ["get", "type"], "rescue_station"],
      layout: {
        "icon-image": "freenauticalchart:rescue",
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 13, 1],
      },
    },
    {
      id: "radar-stations",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["==", ["get", "type"], "radar_station"],
      layout: {
        "icon-image": "freenauticalchart:radar_scanner",
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 14, 1],
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
      ],
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "category"], "marina"],
          "freenauticalchart:marina",
          ["==", ["get", "category"], "fishing"],
          "freenauticalchart:fishingharbour",
          "",
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 12, 1],
        "icon-overlap": "always",
        "text-font": ["Noto Sans Regular"],
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 12, 12],
        // tracks icon-size to hold ~7.5px from icon edge to glyph, leaving ~5px clear of the halo.
        // The marina sprite is a square 32 display px at icon-size 1, so both axes match.
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          anchorOffsets(1.37),
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
