import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { areas } from "./areas.js";
import { routes } from "./routes.js";
import { structures } from "./structures.js";
import { lights } from "./lights.js";
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
export function chartLayers(): {
  areas: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  return {
    areas: areas(),
    symbols: [...routes(), ...structures(), ...lights(), ...marks(), ...labels()],
  };
}
