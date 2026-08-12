import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/**
 * Things vessels follow or must stay clear of, drawn as lines: traffic separation schemes, ferry
 * routes, navigation lines and tracks, and the submarine cables and pipelines below them.
 */
export function routes(): LayerSpecification[] {
  return [
    {
      id: "cables-pipes",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["in", ["get", "type"], ["literal", ["cable_submarine", "pipeline_submarine"]]],
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "type"], "pipeline_submarine"],
          "freenauticalchart:pipeline",
          "freenauticalchart:cable",
        ],
        "icon-overlap": "always",
        "symbol-placement": "line",
        "symbol-spacing": 1,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 1],
      },
      paint: { "icon-opacity": 0.5 },
    },
    {
      id: "TSS-separation-zone",
      type: "fill",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "separation_zone"],
      paint: { "fill-color": colors.magenta, "fill-opacity": 0.15 },
    },
    {
      // routeing is magenta with no exceptions (S-4 §B-435j); fainter than the zone fill
      id: "TSS-crossing-zone",
      type: "fill",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "separation_crossing"],
      paint: { "fill-color": colors.magenta, "fill-opacity": 0.1 },
    },
    {
      id: "TSS-separation-lane-arrows",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "separation_lane"],
      layout: {
        "icon-image": "freenauticalchart:TSS-arrow",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.1, 14, 0.6],
        "symbol-placement": "line",
        "icon-padding": 0,
        // grows with icon-size so the gap between arrows stays open as they scale up
        "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 6, 40, 14, 180],
        "icon-rotate": 90,
        "icon-overlap": "always",
      },
      paint: { "icon-opacity": 0.4 },
    },
    {
      id: "TSS-separation-boundary",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "separation_boundary"],
      paint: {
        // the boundary is the dominant TSS line (TRFCD); the separation line stays faint (TRFCF)
        "line-color": colors.magenta,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 2],
        "line-dasharray": [4, 4],
        "line-opacity": 0.8,
      },
    },
    {
      id: "TSS-separation-line",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "separation_line"],
      paint: {
        "line-color": colors.magenta,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 2],
        "line-opacity": 0.4,
      },
    },
    {
      id: "ferry",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "ferry_route"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": colors.ferry,
        "line-dasharray": [2, 2],
        "line-opacity": 0.6,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 14, 2],
      },
    },
    {
      id: "navigation-lines",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "navigation_line"],
      paint: {
        "line-color": colors.navigationLine,
        "line-width": 0.8,
        "line-dasharray": [4, 2],
      },
    },
    {
      id: "navigation-tracks",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["==", ["get", "type"], "recommended_track"],
      // RECTRC is dashed chart-grey (LS(DASH,1,CHGRD)), matching navigation-lines above
      paint: {
        "line-color": colors.recommendedTrack,
        "line-width": 1,
        "line-dasharray": [4, 2],
      },
    },
  ];
}
