import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { areas } from "./areas.js";
import { hazards } from "./hazards.js";
import { routes } from "./routes.js";
import { structures } from "./structures.js";
import { lights } from "./lights.js";
import { sectors } from "./sectors.js";
import { marks } from "./marks.js";
import { labels } from "./labels.js";

/**
 * The chart symbology, split around the consumer's land fills: `areas` are sea areas that a
 * coastline must cover, `symbols` go on top of everything.
 *
 * Draw order is this concatenation, and it is load-bearing twice over. Paint order is the obvious
 * half. The other is symbol collision: MapLibre places symbols in *reverse* draw order, so the
 * later a layer appears here the more likely its label survives a crowded harbour. Labels last is
 * deliberate.
 */
export function chartLayers({ safety, unit }: { safety?: number; unit?: "m" | "ft" | "fm" } = {}): {
  areas: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  return {
    areas: areas(),
    symbols: [
      ...hazards(safety, unit),
      ...routes(),
      ...structures(),
      ...lights(),
      ...sectors(),
      ...marks(),
      ...labels(),
    ],
  };
}
