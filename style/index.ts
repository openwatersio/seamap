/**
 * @openwaters/seamap — the Open Waters nautical chart as a MapLibre GL style:
 * a chart-styled base map from the VersaTiles shortbread tiles, Seascape
 * bathymetry, and chart symbology (buoys, beacons, lights, topmarks,
 * landmarks, restricted areas) from layers/.
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
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
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
import { topography } from "./layers/topography.js";
import { basemap as basemapLayers } from "./layers/basemap.js";

const DEFAULT_TILEJSON = "https://tiles.openwaters.io/seamap/tiles.json";

// Byte-identical to the OSM atom the seamap TileJSON emits (worker/src/index.ts),
// so MapLibre's attribution control dedupes the two.
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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
}

/**
 * The chart layers, referencing the `seamap` source from sources(). Split to
 * preserve draw order: `areas` (anchorage and restricted-area boundaries and
 * fills) belong below land fills, `symbols` (hazards, buoys, lights, topmarks,
 * landmarks, labels) on top of everything.
 */
export function layers({ font, safety, unit }: LayersOptions = {}): {
  areas: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  const { areas, symbols } = chartLayers({ safety, unit });
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
  /** VersaTiles server for the base-map tiles, glyphs, and elevation. */
  versatiles?: string;
  /** Base map label language. */
  language?: string;
  /** URL of the directory serving this package's sprites/dist/ files. */
  spriteBase?: string;
  /**
   * The base-map mariner preference: land context beyond what a chart carries (roads,
   * railways, buildings, landcover, street names). On by default; false leaves only the
   * chart and its topography.
   */
  basemap?: boolean;
  /**
   * Bathymetric hillshading under the water, off by default: no chart standard
   * shades depth relief, and the commercial charts that offer it ship it as a
   * toggle, never baked in.
   */
  depthHillshade?: boolean;
  /**
   * Land hillshading from the VersaTiles elevation tiles, on by default;
   * false skips it, an object customizes the hillshade paint.
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
 * The whole chart style: chart symbology and Seascape bathymetry over a
 * chart-styled base map, in nautical draw order. Async as API contract — the
 * document assembles without any fetches (MapLibre resolves TileJSON URLs
 * itself), but the signature stays a Promise so the builder is free to need
 * one again.
 */
export async function style({
  tiles,
  seascape = "https://tiles.openwaters.io/seascape",
  versatiles = "https://tiles.versatiles.org",
  language = "en",
  spriteBase = typeof document === "undefined"
    ? "sprites"
    : new URL("sprites", document.baseURI).href,
  basemap = true,
  depthHillshade = false,
  hillshade = true,
  flavor,
  unit,
  safety,
  shading = "bands",
  dem,
  vector,
  coverage,
}: StyleOptions = {}): Promise<StyleSpecification> {
  // shortbread carries name, name_en, and name_de; fall back to the local name
  const name: ExpressionSpecification = language
    ? ["coalesce", ["get", `name_${language}`], ["get", "name"]]
    : ["get", "name"];

  const topo = topography(name);
  const base = basemapLayers(name);

  // Seascape bathymetry: depth shading, depth areas, contours, soundings.
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

  // ENC DEPARE features without depth values take the S-52 partly-surveyed portrayal —
  // NODTA grey with sparse PRTSUR01 dashes (replacing seascape's flat provisional tint).
  // Flat fill and dash pattern are separate layers: fixed-size pattern glyphs read as
  // noise at small scales, so the dashes fade in only once the chart can carry them.
  const noDepth = ["!", ["has", "drval1"]] as ExpressionSpecification;
  bathymetry.splice(
    bathymetry.findIndex((l) => l.id === "depth-areas") + 1,
    0,
    {
      id: "partly-surveyed",
      type: "fill",
      source: vector ?? "seascape-vector",
      "source-layer": "depare",
      filter: noDepth,
      // antialias off: the fill must reach the tile edge, or the fade leaks the layers
      // below as a hairline seam at every tile boundary
      paint: { "fill-color": colors.noData, "fill-antialias": false },
    },
    {
      id: "partly-surveyed-pattern",
      type: "fill",
      source: vector ?? "seascape-vector",
      "source-layer": "depare",
      minzoom: 6,
      filter: noDepth,
      paint: {
        "fill-pattern": "freenauticalchart:partly-surveyed",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 1],
        "fill-antialias": false,
      },
    },
  );

  const { areas, symbols } = layers({ font: versatilesFont, safety, unit });

  const h = typeof hillshade === "object" ? hillshade : {};
  const landHillshade: LayerSpecification[] = hillshade
    ? [
        {
          id: "hillshade",
          type: "hillshade",
          source: "elevation",
          paint: {
            "hillshade-exaggeration": h.exaggeration ?? 0.1,
            "hillshade-shadow-color": h.shadowColor ?? "#000000",
            "hillshade-highlight-color": h.highlightColor ?? "#ffffff",
            "hillshade-accent-color": h.accentColor ?? "#000000",
            "hillshade-illumination-direction": h.illuminationDirection ?? 315,
            "hillshade-illumination-altitude": h.illuminationAltitude ?? 45,
            "hillshade-illumination-anchor": h.illuminationAnchor ?? "map",
          },
        },
      ]
    : [];

  return {
    version: 8,
    name: "Open Waters Seamap",
    // drop-in default view for consumers that don't set one (the viewer overrides)
    center: [10.2351, 56.16858],
    zoom: 13.4,
    glyphs: `${versatiles}/assets/glyphs/{fontstack}/{range}.pbf`,
    sprite: [sprite(spriteBase)],
    sources: {
      "versatiles-shortbread": {
        type: "vector",
        tiles: [`${versatiles}/tiles/osm/{z}/{x}/{y}`],
        maxzoom: 14,
        attribution: OSM_ATTRIBUTION,
      },
      ...(hillshade
        ? {
            elevation: {
              type: "raster-dem",
              tiles: [`${versatiles}/tiles/elevation/{z}/{x}/{y}`],
              tileSize: 512,
              maxzoom: 12,
              encoding: "terrarium",
              attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
            } as SourceSpecification,
          }
        : {}),
      ...sources({ url: tiles }),
      ...seascapeSources({ tilesBase: seascape, dem, vector, coverage }),
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": colors.background },
      },
      ...bathymetry,
      // sea areas below land, so a boundary sweeping the coast stops at the shore
      ...areas,
      {
        id: "land_area",
        source: "seamap",
        "source-layer": "land",
        type: "fill",
        paint: { "fill-color": colors.land },
      },
      ...topo.fills,
      ...(basemap ? base.fills : []),
      ...landHillshade,
      ...(basemap ? base.lines : []),
      ...topo.lines,
      // the coastline draws above all land detail, not just the land fill — otherwise landuse
      // and streets reaching the shore eat its landward half and its weight varies along the
      // shore (S-52 gives the coastline priority 7-8, above all land detail)
      {
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
      },
      topo.bridge,
      // base-map labels before the chart's, so chart labels win every collision
      ...(basemap ? base.labels : []),
      ...topo.labels,
      // seamarks: buoys, lights, topmarks, landmarks, labels
      ...symbols,
    ],
  };
}
