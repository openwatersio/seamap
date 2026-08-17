import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";

/**
 * Intertidal wetlands from the seamap tiles' `wetland` layer (natural=wetland/mud/shoal,
 * categorised by the wetland tag). Two portrayals, following the S-52 model:
 *
 * - Tidal flats are depth information: a DEPIT drying-tint fill over the bathymetry,
 *   covering drying areas OSM knows about and the ENC data misses (S-4 §B-413).
 * - Marsh is an overlay: the MARSHES1-style symbol pattern with no fill and no boundary,
 *   drawn above the land fill so the Group-1 surface underneath decides land vs water
 *   (S-4 §B-312.2, INT1 C33 — marsh "may be shown either side of the coastline").
 *
 * Bog and fen are omitted at every scale (S-4 §B-354). Mangrove rides the marsh pattern
 * until it earns its own VEGATN04 sprite.
 */

/** Below the land fill: drying flats over the depth tints. */
export function tidalFlats(): LayerSpecification[] {
  return [
    {
      id: "tidal-flats",
      type: "fill",
      source: "seamap",
      "source-layer": "wetland",
      minzoom: 7,
      filter: ["in", ["get", "category"], ["literal", ["tidalflat", "mud", "shoal"]]],
      paint: { "fill-color": colors.intertidal },
    },
  ];
}

/** Above the land fill: the marsh symbol pattern, ground colour showing through. */
export function marshes(): LayerSpecification[] {
  return [
    {
      id: "marshes",
      type: "fill",
      source: "seamap",
      "source-layer": "wetland",
      minzoom: 9,
      filter: [
        "in",
        ["get", "category"],
        ["literal", ["saltmarsh", "marsh", "swamp", "reedbed", "mangrove", "wetland"]],
      ],
      paint: { "fill-pattern": "freenauticalchart:marsh" },
    },
  ];
}
