import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/**
 * Point hazards and seabed text. These draw with the symbols, above the land fills — a near-shore
 * rock or wreck must never be hidden by an imprecise OSM coastline (S-52 draws points over
 * coincident areas, §10.3.4.1).
 */
export function hazards(): LayerSpecification[] {
  return [
    {
      id: "rocks_outline",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "rock"],
      layout: {
        "icon-overlap": "always",
        "icon-image": "freenauticalchart:obstruction",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 12, 0.8],
      },
    },
    {
      id: "rocks",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "rock"],
      layout: {
        "icon-overlap": "always",
        // most OSM rocks carry no water_level, and `dry` has no icon: default to submerged, the
        // safe direction and the sprite author's own default
        "icon-image": [
          "match",
          [
            "coalesce",
            ["get", "seamark:rock:water_level"],
            ["get", "seamark:water_level"],
            ["get", "water_level"],
            "",
          ],
          "covers",
          "freenauticalchart:rock-covers",
          "awash",
          "freenauticalchart:rock-awash",
          "freenauticalchart:rock-submerged",
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 12, 1],
      },
    },
    {
      id: "obstructions",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: ["in", ["get", "type"], ["literal", ["wreck", "obstruction"]]],
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "type"], "obstruction"],
          "freenauticalchart:obstruction",
          ["in", ["get", "category"], ["literal", ["non-dangerous", "distributed_remains"]]],
          "freenauticalchart:wreck-non-dangerous",
          ["in", ["get", "category"], ["literal", ["dangerous", "mast_showing"]]],
          "freenauticalchart:wreck-dangerous",
          ["==", ["get", "category"], "hull_showing"],
          "freenauticalchart:wreck-hull_showing",
          "freenauticalchart:wreck-non-dangerous",
        ],
        "icon-overlap": "always",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 12, 1],
      },
    },
    {
      id: "seabed",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["has", "seamark:seabed_area:surface"],
      layout: {
        "text-field": ["get", "seamark:seabed_area:surface"],
        "text-font": ["Noto Sans Regular"],
        "text-letter-spacing": 0.1,
        "text-max-width": 5,
        "text-padding": 10,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 13, 11],
      },
      paint: {
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 2,
        "text-halo-blur": 1,
      },
    },
  ];
}
