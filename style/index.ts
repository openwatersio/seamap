/**
 * @openwaters/seamap — the Open Waters nautical chart as a MapLibre GL style:
 * a VersaTiles base map, Seascape bathymetry, and chart symbology (buoys,
 * beacons, lights, topmarks, landmarks, restricted areas) from layers/.
 *
 * Whole-style path — style() assembles everything:
 *
 *   import { style } from "@openwaters/seamap";
 *
 *   const map = new maplibregl.Map({ style: style({ spriteBase }) });
 *
 * Composed path — sources() + layers() hand over just the chart symbology for
 * a style you assemble yourself:
 *
 *   const { areas, symbols } = layers();
 *   // areas go below land fills and labels, symbols on top of everything
 *   layers: [...myBaseLayers, ...areas, ...myLandLayers, ...symbols]
 *
 * The sprite sheet ships in the package at sprites/dist/ — serve it under a
 * stable path (MapLibre appends .json/.png/@2x itself) and point spriteBase /
 * sprite() at that base URL. Icon names are composed from tag values at render
 * time, so the style layers and the sprite sheet must always move together.
 */
import type {
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { colorful } from "@versatiles/style";
import {
  day,
  layers as seascapeLayers,
  sources as seascapeSources,
  type Flavor,
  type Shading,
  type Unit,
} from "@openwaters/seascape";
import { chartLayers } from "./layers/index.js";
import { colors } from "./layers/palette.js";

const DEFAULT_TILEJSON = "https://tiles.openwaters.io/seamap/tiles.json";

/** The seamark vector source. `url` is a TileJSON document. */
export function sources({ url = DEFAULT_TILEJSON }: { url?: string } = {}): Record<
  string,
  SourceSpecification
> {
  return { seamap: { type: "vector", url } };
}

export interface LayersOptions {
  /**
   * Rename glyph fontstacks to match the consumer's glyph server. The chart layers use
   * "Noto Sans Regular", plus "Noto Sans Italic" for hydrographic text — a stack Noto
   * doesn't actually have, so map it to whatever italic your server serves (the built-in
   * builder uses versatiles' open_sans_regular_italic).
   */
  font?: (name: string) => string;
  /**
   * Safety depth in metres for the isolated-danger highlight and hazard-area boundaries;
   * defaults to the 2 m small-craft value seascape's depth shading also defaults to. Values
   * above 30 m clamp: the tiles only retain hazard context to that depth, and a deeper setting
   * would highlight from data that is not there.
   */
  safety?: number;
  /** Depth unit for hazard depth numerals, matching seascape's soundings. */
  unit?: "m" | "ft" | "fm";
  /**
   * Strict S-52 portrayal, off by default: fixed symbol sizes, SCAMIN-derived visibility, and
   * light sectors as display-fixed arcs. The chart's own answers — density budgets, decoration
   * legibility floors, size ramps, ground-geometry sectors — are what it ships with.
   */
  standards?: boolean;
}

/**
 * The chart layers, referencing the `seamap` source from sources(). Split to
 * preserve draw order: `areas` (anchorage and restricted-area boundaries and
 * fills) belong below land fills, `symbols` (hazards, buoys, lights, topmarks,
 * landmarks, labels) on top of everything.
 */
export function layers({ font, safety, unit, standards }: LayersOptions = {}): {
  areas: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  const { areas, symbols } = chartLayers({ safety, unit, standards });
  if (font) {
    for (const layer of [...areas, ...symbols]) {
      const layout = "layout" in layer ? (layer.layout as { "text-font"?: string[] }) : undefined;
      if (layout?.["text-font"]) layout["text-font"] = layout["text-font"].map(font);
      // format expressions carry their own fontstacks in {"text-font": ["literal", [...]]}
      // section options, which the layout rename above never sees
      if (layout && "text-field" in layout) renameFormatFonts((layout as any)["text-field"], font);
    }
  }
  return { areas, symbols };
}

function renameFormatFonts(expr: unknown, font: (name: string) => string): void {
  if (!Array.isArray(expr)) return;
  for (const part of expr) {
    if (Array.isArray(part)) {
      renameFormatFonts(part, font);
    } else if (part && typeof part === "object" && "text-font" in part) {
      const tf = (part as { "text-font": unknown })["text-font"];
      if (Array.isArray(tf) && tf[0] === "literal" && Array.isArray(tf[1])) {
        tf[1] = (tf[1] as string[]).map(font);
      }
    }
  }
}

/**
 * The style.sprite entry for the chart symbols. `base` is the URL of the
 * directory serving this package's sprites/dist/ files.
 */
export function sprite(base: string): { id: string; url: string } {
  return {
    id: "freenauticalchart",
    url: `${base.replace(/\/+$/, "")}/freenauticalchart`,
  };
}

// versatiles glyph names are lowercase with underscores. Noto Sans has no italic cut
// anywhere, so the chart's italic hydrographic text maps to the closest humanist match
// versatiles serves.
const versatilesFont = (f: string) =>
  f === "Noto Sans Italic" ? "open_sans_regular_italic" : f.toLowerCase().replaceAll(" ", "_");

export interface StyleOptions {
  /** Seamark TileJSON URL. */
  tiles?: string;
  /** Seascape bathymetry tiles base URL. */
  seascape?: string;
  /** VersaTiles server for the base map, glyphs, and base sprites. */
  versatiles?: string;
  /** Base map label language. */
  language?: string;
  /** URL of the directory serving this package's sprites/dist/ files. */
  spriteBase?: string;
  /**
   * Bathymetric hillshading under the water, off by default: no chart standard
   * shades depth relief, and the commercial charts that offer it ship it as a
   * toggle, never baked in.
   */
  depthHillshade?: boolean;
  /**
   * Land hillshading from the VersaTiles elevation tiles, on by default;
   * false skips it, an object customizes the builder's hillshade paint.
   */
  hillshade?:
    | boolean
    | {
        exaggeration?: number;
        shadowColor?: string;
        highlightColor?: string;
        accentColor?: string;
        illuminationDirection?: number;
        illuminationAltitude?: number;
        illuminationAnchor?: "map" | "viewport";
      };
  /**
   * Seascape flavor overrides, merged over its `day` (the font defaults to the
   * versatiles glyph name; set your own to override).
   */
  flavor?: Partial<Flavor>;
  /** Depth unit for seascape contour labels and soundings. */
  unit?: Unit;
  /** Safety contour depth in metres, 0 = off (seascape). */
  safety?: number;
  /**
   * Strict S-52 portrayal of the chart symbology, off by default: fixed symbol sizes,
   * SCAMIN-derived visibility, and display-fixed light sector arcs.
   */
  standards?: boolean;
  /**
   * Water shading: ENC-style vector depth bands by default — their edges coincide with the
   * contour lines by construction, and they stay crisp under overzoom. "relief" selects the
   * raster DEM color-relief instead.
   */
  shading?: Shading;
  /** Seascape source id overrides, applied to sources and layers together. */
  dem?: string;
  vector?: string;
  coverage?: string;
}

/**
 * The whole chart style: VersaTiles base map, Seascape bathymetry, and the
 * chart symbology, in nautical draw order. Async because the builder fetches
 * the VersaTiles elevation TileJSON for land hillshading.
 */
export async function style({
  tiles,
  seascape = "https://tiles.openwaters.io/seascape",
  versatiles = "https://tiles.versatiles.org",
  language = "en",
  spriteBase = typeof document === "undefined"
    ? "sprites"
    : new URL("sprites", document.baseURI).href,
  depthHillshade = false,
  hillshade = true,
  flavor,
  unit,
  safety,
  standards,
  shading = "bands",
  dem,
  vector,
  coverage,
}: StyleOptions = {}): Promise<StyleSpecification> {
  const s = await colorful({
    baseUrl: versatiles,
    language,
    colors: { label: "#000" },
    // the base map is context, not content: desaturate and lighten it so the
    // chart symbology reads first
    recolor: { saturate: -0.3, blend: 0.2, blendColor: "#ffffff" },
    textScale: 0.9,
    iconScale: 0.8,
    // low-zoom landcover tint, and load-bearing for the water-area→unsurveyed restyle below:
    // without it versatiles adds an opacity ramp to water-area that turns inland lakes into
    // dark stipple blobs at low zoom
    experimental: { landcover: true },
    hillshade,
  });
  s.name = "Open Waters Seamap";
  delete s.metadata; // versatiles' CC0 claim covered only its own JSON, not this composite
  // drop-in default view for consumers that don't set one (the viewer overrides)
  s.center = [10.2351, 56.16858];
  s.zoom = 13.4;

  // the chart draws its own ferry routes and lighthouse symbols; drop the
  // base map's duplicates
  s.layers = s.layers.filter((l) => !l.id.startsWith("transport-ferry"));
  const poi = s.layers.find((l) => l.id === "poi-man_made") as { filter?: unknown } | undefined;
  if (poi?.filter) {
    poi.filter = ["all", poi.filter, ["!=", ["get", "man_made"], "lighthouse"]];
  }

  (s.sprite as { id: string; url: string }[]).push(sprite(spriteBase));
  Object.assign(s.sources, sources({ url: tiles }));

  // Seascape bathymetry: depth shading, depth areas, contours, soundings.
  Object.assign(s.sources, seascapeSources({ tilesBase: seascape, dem, vector, coverage }));
  const bathymetry = seascapeLayers(
    { ...day, font: [versatilesFont(day.font[0])], ...flavor },
    { dem, vector, coverage, unit, safety, shading },
  );
  const seaHillshade = bathymetry.find((l) => l.id === "depth-hillshade");
  // set both ways so the option holds even if seascape's shipped default changes
  if (seaHillshade?.layout) seaHillshade.layout.visibility = depthHillshade ? "visible" : "none";

  // seascape's depth fills are translucent to blend with a base map, but here the
  // water underpaint would leak through them over surveyed water; make them opaque
  const relief = bathymetry.find((l) => l.id === "depth-shading") as
    | { paint?: Record<string, unknown> }
    | undefined;
  if (relief?.paint) relief.paint["color-relief-opacity"] = 1;
  const depare = bathymetry.find((l) => l.id === "depth-areas") as
    | { paint?: Record<string, unknown> }
    | undefined;
  if (depare?.paint) depare.paint["fill-opacity"] = 1;

  // ENC DEPARE features without depth values are unsurveyed water; stipple them
  // (replacing seascape's flat provisional tint) — the chart cue for unsurveyed
  bathymetry.splice(bathymetry.findIndex((l) => l.id === "depth-areas") + 1, 0, {
    id: "unsurveyed",
    type: "fill",
    source: vector ?? "seascape-vector",
    "source-layer": "depare",
    filter: ["!", ["has", "drval1"]],
    paint: { "fill-pattern": "freenauticalchart:unsurveyed" },
  });

  const { areas, symbols } = layers({ font: versatilesFont, safety, unit, standards });

  // draw sea: replace versatiles' first two layers (background, water) with the
  // chart's own background, bathymetry, sea areas, and seamap land
  s.layers.splice(
    0,
    2,
    {
      id: "background",
      type: "background",
      paint: { "background-color": colors.background },
    },
    ...bathymetry,
    ...areas,
    {
      id: "land_area",
      source: "seamap",
      "source-layer": "land",
      type: "fill",
      paint: { "fill-color": colors.land },
    },
  );

  // the coastline draws above the base map's land fills, not just the chart's land fill —
  // otherwise landuse polygons reaching the shore eat its landward half and its weight varies
  // along the shore (S-52 gives the coastline priority 7-8, above all land detail). It still
  // sits below the base map's POIs and labels, which start at the first poi-/label- layer.
  const firstBaseSymbol = s.layers.findIndex((l) => /^(poi-|label-|marking-|symbol-)/.test(l.id));
  s.layers.splice(firstBaseSymbol === -1 ? s.layers.length : firstBaseSymbol, 0, {
    id: "land_outline",
    source: "seamap",
    "source-layer": "land",
    type: "line",
    paint: {
      "line-color": colors.coastline,
      // thin and faint at low zoom
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.1, 12, 1],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0, 12, 1],
    },
  });

  // draw seamarks: buoys, lights, topmarks, landmarks, labels
  s.layers = s.layers.concat(symbols);

  // versatiles' opaque water-polygon fills (estuaries, rivers, docks) paint over
  // the bathymetry. Move them *below* it and restyle as a stipple, so they only
  // show through where there's no depth data — the chart cue for unsurveyed
  // water.
  const waterFillIds = ["water-area", "water-area-river", "water-area-small"];
  const unsurveyed = s.layers.filter((l) => waterFillIds.includes(l.id));
  s.layers = s.layers.filter((l) => !waterFillIds.includes(l.id));
  unsurveyed.forEach(
    (l) => ((l as { paint: unknown }).paint = { "fill-pattern": "freenauticalchart:unsurveyed" }),
  );
  s.layers.splice(1, 0, ...unsurveyed); // index 1: just above `background`, below bathymetry

  // Charts never draw a centerline through navigable water (S-57 UOC §4.7.6)
  const waterwayLineIds = ["water-river", "water-canal", "water-stream", "water-ditch"];
  s.layers = s.layers.filter((l) => !waterwayLineIds.includes(l.id));

  return s;
}
