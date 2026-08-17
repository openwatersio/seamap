import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/**
 * The base-map preference: land context beyond what a chart carries — roads and railways,
 * minor streets, buildings, landcover, street names — for the crew going ashore. S-4 omits or
 * heavily restricts all of it (§B-354, §B-362, §B-365, §B-371), so when shown it must never
 * compete: subdued washes and light neutral lines, drawn below every piece of chart content.
 * style() includes these layers only when the `basemap` option (a mariner preference, on by
 * default) is set.
 *
 * Like topography.ts, these ride only inside style(), so fontstacks use the versatiles glyph
 * spelling directly.
 */

const SOURCE = "versatiles-shortbread";
const FONT = ["noto_sans_regular"];

const VEGETATION = [
  "forest",
  "grass",
  "grassland",
  "meadow",
  "wet_meadow",
  "park",
  "garden",
  "heath",
  "scrub",
];

const MINOR_STREETS = [
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
  "living_street",
  "pedestrian",
  "service",
  "busway",
];

const WAYS = ["footway", "path", "cycleway", "steps", "track"];

export function basemap(name: ExpressionSpecification): {
  fills: LayerSpecification[];
  lines: LayerSpecification[];
  labels: LayerSpecification[];
} {
  return {
    fills: [
      {
        id: "basemap-vegetation",
        type: "fill",
        source: SOURCE,
        "source-layer": "land",
        minzoom: 11,
        filter: ["in", ["get", "kind"], ["literal", VEGETATION]],
        paint: { "fill-color": colors.vegetation },
      },
      {
        // charts draw at most a dotted line for a beach (INT1 C6); this tint is
        // going-ashore context, which is why it lives behind the preference
        id: "basemap-sand",
        type: "fill",
        source: SOURCE,
        "source-layer": "land",
        minzoom: 11,
        filter: ["in", ["get", "kind"], ["literal", ["beach", "sand"]]],
        paint: { "fill-color": colors.sand },
      },
      {
        id: "basemap-building",
        type: "fill",
        source: SOURCE,
        "source-layer": "buildings",
        minzoom: 14,
        paint: { "fill-color": colors.building },
      },
    ],
    lines: [
      {
        id: "basemap-street-minor",
        type: "line",
        source: SOURCE,
        "source-layer": "streets",
        minzoom: 12,
        filter: [
          "all",
          ["in", ["get", "kind"], ["literal", MINOR_STREETS]],
          ["!=", ["get", "tunnel"], true],
        ],
        paint: {
          "line-color": colors.street,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.75, 16, 3],
        },
      },
      {
        id: "basemap-road-major",
        type: "line",
        source: SOURCE,
        "source-layer": "streets",
        minzoom: 8,
        // tunnels omitted: the Øresund road would otherwise cross the chart's water
        filter: [
          "all",
          ["in", ["get", "kind"], ["literal", ["motorway", "trunk", "primary"]]],
          ["!=", ["get", "tunnel"], true],
        ],
        paint: {
          "line-color": colors.landFeature,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2.5],
        },
      },
      {
        id: "basemap-rail",
        type: "line",
        source: SOURCE,
        "source-layer": "streets",
        minzoom: 11,
        filter: [
          "all",
          ["==", ["get", "kind"], "rail"],
          ["!", ["has", "service"]],
          ["!=", ["get", "tunnel"], true],
        ],
        paint: {
          "line-color": colors.landFeature,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 15, 1.4],
        },
      },
      {
        id: "basemap-way",
        type: "line",
        source: SOURCE,
        "source-layer": "streets",
        minzoom: 14,
        filter: [
          "all",
          ["in", ["get", "kind"], ["literal", WAYS]],
          ["!=", ["get", "tunnel"], true],
        ],
        paint: {
          "line-color": colors.street,
          "line-width": 0.7,
          "line-dasharray": [2, 1.5],
        },
      },
    ],
    labels: [
      {
        id: "basemap-street-label",
        type: "symbol",
        source: SOURCE,
        "source-layer": "street_labels",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": name,
          "text-font": FONT,
          "text-size": 10,
        },
        paint: {
          "text-color": colors.label,
          "text-halo-color": colors.halo,
          "text-halo-width": 1,
        },
      },
    ],
  };
}
