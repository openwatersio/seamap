import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/**
 * Chart topography from the VersaTiles shortbread tiles: land detail that belongs on the chart
 * whether or not the base-map preference is on. Selection follows S-4 §B-300 — land features
 * earn their place by being useful for a visual or radar fix from seaward: urban extent (lit
 * areas matter for identifying lights at night, §B-360.2), airports (§B-366), bridges over
 * navigable water (§B-381, mandatory), glaciers (§B-353.8), boundaries, and place names.
 * Roads and railways stay behind the base-map preference: "a nautical chart is not intended
 * to serve as a road map" (§B-365), and shortbread can't limit them to the coastal strip
 * S-4 would keep. Unsurveyed water is not drawn from these tiles — that portrayal rides
 * seascape's depare polygons (the partly-surveyed layer), whose tile edges then never seam
 * against a second water fill.
 *
 * These layers only ever ride inside style() — they are not part of the layers() export, so the
 * fontstacks are written in the versatiles glyph spelling directly.
 */

const SOURCE = "versatiles-shortbread";
const FONT = ["noto_sans_regular"];

/** One flat tint for all built-up kinds — S-4 §B-370 draws urban extent, never urban land use. */
const URBAN = ["residential", "garages", "commercial", "retail", "industrial", "quarry", "railway"];

/** An upright place label (S-4 §B-133: land names upright, water names sloping). */
function place(
  kind: string,
  name: ExpressionSpecification,
  minzoom: number,
  size: unknown,
  overrides: { layout?: Record<string, unknown>; paint?: Record<string, unknown> } = {},
): LayerSpecification {
  return {
    id: `topo-place-${kind}`,
    type: "symbol",
    source: SOURCE,
    "source-layer": "place_labels",
    minzoom,
    filter: ["==", ["get", "kind"], kind],
    layout: {
      "text-field": name,
      "text-font": FONT,
      "text-size": size,
      ...overrides.layout,
    },
    paint: {
      "text-color": colors.label,
      "text-halo-color": colors.halo,
      "text-halo-width": 1,
      ...overrides.paint,
    },
  } as LayerSpecification;
}

export function topography(name: ExpressionSpecification): {
  fills: LayerSpecification[];
  lines: LayerSpecification[];
  labels: LayerSpecification[];
  /** Above the coastline: S-52 gives bridges display priority 8, the highest landward feature. */
  bridge: LayerSpecification;
} {
  return {
    bridge: {
      id: "topo-bridge",
      type: "fill",
      source: SOURCE,
      "source-layer": "bridges",
      minzoom: 10,
      paint: { "fill-color": colors.bridge },
    },
    fills: [
      {
        id: "topo-glacier",
        type: "fill",
        source: SOURCE,
        // shortbread files glaciers under water_polygons; the chart draws them as
        // white with scattered blue strokes, never as water
        "source-layer": "water_polygons",
        filter: ["==", ["get", "kind"], "glacier"],
        paint: { "fill-color": colors.glacier },
      },
      {
        // strokes fade in where fixed-size pattern glyphs stop reading as noise
        id: "topo-glacier-pattern",
        type: "fill",
        source: SOURCE,
        "source-layer": "water_polygons",
        minzoom: 6,
        filter: ["==", ["get", "kind"], "glacier"],
        paint: {
          "fill-pattern": "freenauticalchart:glacier",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 1],
        },
      },
      {
        id: "topo-urban",
        type: "fill",
        source: SOURCE,
        "source-layer": "land",
        minzoom: 9,
        filter: ["in", ["get", "kind"], ["literal", URBAN]],
        paint: { "fill-color": colors.urban },
      },
      {
        id: "topo-airport-area",
        type: "fill",
        source: SOURCE,
        "source-layer": "street_polygons",
        minzoom: 11,
        filter: ["in", ["get", "kind"], ["literal", ["runway", "taxiway"]]],
        paint: { "fill-color": colors.building },
      },
    ],
    lines: [
      {
        id: "topo-runway",
        type: "line",
        source: SOURCE,
        "source-layer": "streets",
        minzoom: 10,
        filter: ["==", ["get", "kind"], "runway"],
        paint: {
          "line-color": colors.landFeature,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 4],
        },
      },
      {
        id: "topo-boundary-country",
        type: "line",
        source: SOURCE,
        "source-layer": "boundaries",
        filter: [
          "all",
          ["==", ["get", "admin_level"], 2],
          ["!=", ["get", "maritime"], true],
          ["!=", ["get", "coastline"], true],
        ],
        paint: {
          "line-color": colors.chartGrey,
          "line-width": 1,
          "line-dasharray": [4, 2],
        },
      },
      {
        id: "topo-boundary-state",
        type: "line",
        source: SOURCE,
        "source-layer": "boundaries",
        minzoom: 6,
        filter: [
          "all",
          ["==", ["get", "admin_level"], 4],
          ["!=", ["get", "maritime"], true],
          ["!=", ["get", "coastline"], true],
        ],
        paint: {
          "line-color": colors.chartGrey,
          "line-width": 0.7,
          "line-dasharray": [2, 2],
          "line-opacity": 0.6,
        },
      },
    ],
    // weakest first: MapLibre places symbols in reverse draw order, so each layer here yields
    // its anchor to the ones after it — a city name always beats a hamlet's
    labels: [
      // named bays, points, and other unpopulated spots that matter from the water
      place("locality", name, 12, 10, { paint: { "text-color": colors.chartGrey } }),
      place("hamlet", name, 13, {
        stops: [
          [10, 11],
          [12, 14],
        ],
      }),
      place("village", name, 11, {
        stops: [
          [9, 11],
          [12, 14],
        ],
      }),
      place("island", name, 10, {
        stops: [
          [10, 10],
          [13, 12],
        ],
      }),
      place("town", name, 9, {
        stops: [
          [8, 11],
          [12, 14],
        ],
      }),
      place("city", name, 7, {
        stops: [
          [7, 11],
          [10, 14],
        ],
      }),
    ],
  };
}
