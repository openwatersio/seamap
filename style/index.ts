/**
 * @openwaters/seamap — the Open Waters nautical chart as a MapLibre GL style:
 * a VersaTiles base map, Seascape bathymetry, and chart symbology (buoys,
 * beacons, lights, topmarks, landmarks, restricted areas) from layers/.
 *
 * Whole-style path — style() assembles everything, setup() registers the
 * runtime images the style depends on:
 *
 *   import { style, setup, attribution } from "@openwaters/seamap";
 *
 *   const map = new maplibregl.Map({
 *     style: style({ spriteBase }),
 *     attributionControl: { customAttribution: attribution },
 *   });
 *   setup(map);
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

/** Sprite artwork credit; sprites aren't a MapLibre source, so this can't ride along on one. */
export const attribution =
  'Chart symbols <a href="https://github.com/quantenschaum/mapping" target="_blank">© Adam Lucke</a> (GPL-3.0)';

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
   * Rename glyph fontstacks to match the consumer's glyph server. The chart
   * layers use "Noto Sans Regular"; e.g. VersaTiles wants
   * (f) => f.toLowerCase().replaceAll(" ", "_").
   */
  font?: (name: string) => string;
}

/**
 * The chart layers, referencing the `seamap` source from sources(). Split to
 * preserve draw order: `areas` (sea areas — rocks, obstructions, seabed,
 * restricted areas) belong below land fills, `symbols` (buoys, lights,
 * topmarks, landmarks, labels) on top of everything.
 */
export function layers({ font }: LayersOptions = {}): {
  areas: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  const { areas, symbols } = chartLayers();
  if (font) {
    for (const layer of [...areas, ...symbols]) {
      const layout = "layout" in layer ? (layer.layout as { "text-font"?: string[] }) : undefined;
      if (layout?.["text-font"]) layout["text-font"] = layout["text-font"].map(font);
    }
  }
  return { areas, symbols };
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

// versatiles glyph names are lowercase with underscores
const versatilesFont = (f: string) => f.toLowerCase().replaceAll(" ", "_");

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
  /** Water shading: raster relief or ENC depth bands (seascape). */
  shading?: Shading;
  /** Seascape source id overrides, applied to sources and layers together. */
  dem?: string;
  vector?: string;
  coverage?: string;
}

/**
 * The whole chart style: VersaTiles base map, Seascape bathymetry, and the
 * chart symbology, in nautical draw order. Async because the builder fetches
 * the VersaTiles elevation TileJSON for land hillshading. Pair with setup() on
 * the map, which registers the images the style references at runtime.
 */
export async function style({
  tiles,
  seascape = "https://tiles.openwaters.io/seascape",
  versatiles = "https://tiles.versatiles.org",
  language = "en",
  spriteBase = typeof document === "undefined"
    ? "sprites"
    : new URL("sprites", document.baseURI).href,
  hillshade = true,
  flavor,
  unit,
  safety,
  shading,
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
    // ESA WorldCover fills land/water below the zooms where OSM polygons appear
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
  if (seaHillshade?.layout) seaHillshade.layout.visibility = "visible"; // seascape defaults it off

  const { areas, symbols } = layers({ font: versatilesFont });

  // draw sea: replace versatiles' first two layers (background, water) with the
  // chart's own background, bathymetry, sea areas, and seamap land
  s.layers.splice(
    0,
    2,
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e9f7ff" },
    },
    ...bathymetry,
    ...areas,
    {
      id: "land_outline",
      source: "seamap",
      "source-layer": "land",
      type: "line",
      paint: {
        "line-color": "#3d3d3d",
        // thin at low zoom or world-view coastlines read as heavy black blobs
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 12, 3],
        "line-opacity": 0.8,
      },
    },
    {
      id: "land_area",
      source: "seamap",
      "source-layer": "land",
      type: "fill",
      paint: { "fill-color": "#fdf1d2" },
    },
  );

  // draw seamarks: buoys, lights, topmarks, landmarks, labels
  s.layers = s.layers.concat(symbols);

  // versatiles' opaque water-polygon fills (estuaries, rivers, docks) paint over
  // the bathymetry. Move them *below* it and restyle as a stipple, so they only
  // show through where there's no depth data — the chart cue for unsurveyed
  // water. setup() registers the stipple image.
  const waterFillIds = ["water-area", "water-area-river", "water-area-small"];
  const unsurveyed = s.layers.filter((l) => waterFillIds.includes(l.id));
  s.layers = s.layers.filter((l) => !waterFillIds.includes(l.id));
  unsurveyed.forEach((l) => ((l as { paint: unknown }).paint = { "fill-pattern": "unsurveyed" }));
  s.layers.splice(1, 0, ...unsurveyed); // index 1: just above `background`, below bathymetry

  return s;
}

/** Structural subset of maplibregl.Map, so maplibre-gl stays out of the dependency tree. */
export interface ChartMap {
  on(event: "styleimagemissing", listener: (e: { id: string }) => void): unknown;
  on(event: "load", listener: () => void): unknown;
  getImage(id: string): { data: unknown; pixelRatio?: number; sdf?: boolean } | null | undefined;
  addImage(id: string, image: unknown, options?: { pixelRatio?: number; sdf?: boolean }): unknown;
}

/**
 * Register the images a style() map depends on at runtime: the generic-icon
 * fallback for composed names, and the `unsurveyed` water stipple. Browser only.
 */
export function setup(map: ChartMap): void {
  handleMissingImages(map);
  // 'unsurveyed' stipple: faint blue base + one sparse dot, the chart cue for
  // water with no depth data
  map.on("load", () => {
    const px = 12,
      cv = document.createElement("canvas");
    cv.width = cv.height = px;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#d6ebfa";
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = "rgba(60,120,170,0.7)";
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, 1.1, 0, 7);
    ctx.fill();
    map.addImage("unsurveyed", ctx.getImageData(0, 0, px, px), { pixelRatio: 1 });
  });
}

/**
 * Buoy, topmark and light icon names are built from tag values, and the sprite
 * sheet carries only the colour combinations charts normally use. Substitute
 * the shape's generic icon for anything else, so an unusual colour on a real
 * mark never renders as nothing at all.
 */
export function handleMissingImages(map: ChartMap): void {
  map.on("styleimagemissing", ({ id }) => {
    const generic = id.replace(/^(freenauticalchart:[^/]+)\/.*/, "$1/generic");
    const fallback = generic === id ? null : map.getImage(generic);
    if (fallback) {
      map.addImage(id, fallback.data, {
        pixelRatio: fallback.pixelRatio,
        sdf: fallback.sdf,
      });
    }
  });
}
