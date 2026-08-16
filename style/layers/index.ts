import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { areas } from "./areas.js";
import { hazards } from "./hazards.js";
import { routes } from "./routes.js";
import { structures } from "./structures.js";
import { lights } from "./lights.js";
import { sectors } from "./sectors.js";
import { marks } from "./marks.js";
import { labels } from "./labels.js";
import { MAX_SAFETY_DEPTH, visibility } from "./visibility.js";

/**
 * The strict scale floor S-52 reads off SCAMIN, carried per feature by the tiles
 * (`SeamarkZoomRules.java`). Coalesced to 0 so a chart built against older tiles still draws.
 */
const withinScale: ExpressionSpecification = [
  ">=",
  ["zoom"],
  ["coalesce", ["get", "std_minzoom"], 0],
];

function atStandardScale(layer: LayerSpecification): LayerSpecification {
  if (!("source" in layer) || layer.source !== "seamap") return layer;
  const own = "filter" in layer ? layer.filter : undefined;
  const filter = (own ? ["all", own, withinScale] : withinScale) as FilterSpecification;
  return { ...layer, filter } as LayerSpecification;
}

/**
 * The chart symbology, split around the consumer's land fills: `areas` are sea areas that a
 * coastline must cover, `symbols` go on top of everything.
 *
 * Draw order is this concatenation, and it is load-bearing twice over. Paint order is the obvious
 * half. The other is symbol collision: MapLibre places symbols in *reverse* draw order, so the
 * later a layer appears here the more likely its label survives a crowded harbour. Labels last is
 * deliberate.
 *
 * `standards` swaps the chart's own portrayal for a strict S-52 one: fixed symbol sizes,
 * SCAMIN-derived visibility, and light sectors as display-fixed arcs.
 */
export function chartLayers({
  safety,
  unit,
  standards = false,
}: { safety?: number; unit?: "m" | "ft" | "fm"; standards?: boolean } = {}): {
  areas: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  // The tiles only retain hazard context down to MAX_SAFETY_DEPTH: past it the pipeline may
  // have thinned or excluded the hazard entirely, so a deeper setting would silently miss
  // hazards it appears to highlight. Clamp rather than honour a promise the data cannot keep.
  const clamped = Math.min(safety ?? 2, MAX_SAFETY_DEPTH);
  const v = visibility(standards);
  const built = {
    areas: areas(v),
    symbols: [
      ...hazards(v, clamped, unit),
      ...routes(v),
      ...structures(v),
      ...lights(v),
      ...sectors(v),
      ...marks(v),
      ...labels(v),
    ],
  };
  if (!standards) return built;
  // one pass rather than a clause in every module: SCAMIN governs every seamark the same way
  return {
    areas: built.areas.map(atStandardScale),
    symbols: built.symbols.map(atStandardScale),
  };
}
