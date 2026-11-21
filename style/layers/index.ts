import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { areas } from "./areas.js";
import { tidalFlats, marshes } from "./wetlands.js";
import { hazards } from "./hazards.js";
import { routes } from "./routes.js";
import { structures } from "./structures.js";
import { lights } from "./lights.js";
import { sectors } from "./sectors.js";
import { marks } from "./marks.js";
import { labels } from "./labels.js";
import { MAX_SAFETY_DEPTH } from "./visibility.js";

/**
 * The chart symbology, split by where each group sits in the consumer's stack: `flats` is the
 * opaque drying tint, over the depth fills and under the contours and soundings it must never
 * hide; `areas` are sea areas that a coastline must cover; `marsh` is the tuft overlay, on the
 * land fills and under the coastline and every label; `symbols` go on top of everything.
 *
 * Draw order is this concatenation, and it is load-bearing twice over. Paint order is the obvious
 * half. The other is symbol collision: MapLibre places symbols in *reverse* draw order, so the
 * later a layer appears here the more likely its label survives a crowded harbour. Labels last is
 * deliberate.
 */
export function chartLayers({ safety, unit }: { safety?: number; unit?: "m" | "ft" | "fm" } = {}): {
  flats: LayerSpecification[];
  areas: LayerSpecification[];
  marsh: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  // The tiles only retain hazard context down to MAX_SAFETY_DEPTH: past it the pipeline may
  // have thinned or excluded the hazard entirely, so a deeper setting would silently miss
  // hazards it appears to highlight. Clamp rather than honour a promise the data cannot keep.
  const clamped = Math.min(safety ?? 2, MAX_SAFETY_DEPTH);
  return {
    // Neither wetland fill fits the areas/symbols split: the drying tint is depth information
    // and belongs with the bathymetry, and marsh tufts at the bottom of symbols would cover the
    // coastline and land labels.
    flats: tidalFlats(),
    areas: areas(),
    marsh: marshes(),
    symbols: [
      ...hazards(clamped, unit),
      ...routes(),
      ...structures(),
      ...lights(),
      ...sectors(),
      ...marks(),
      ...labels(),
    ],
  };
}
