/**
 * @openwaters/seamap — the Open Waters nautical chart as a MapLibre GL style:
 * a VersaTiles base map, Seascape bathymetry, and chart symbology (buoys,
 * beacons, lights, topmarks, landmarks, restricted areas) drawn from the
 * vendored freenauticalchart style (see README.md for provenance).
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
} from "@openwaters/seascape";
import chartStyle from "./freenauticalchart.style.json";

/** Sprite artwork credit; sprites aren't a MapLibre source, so this can't ride along on one. */
export const attribution =
  'Chart symbols <a href="https://github.com/quantenschaum/mapping" target="_blank">© Adam Lucke</a> (GPL-3.0)';

const DEFAULT_TILEJSON = "https://tiles.openwaters.io/seamap/latest.json";

/** The seamark vector source. `url` is a TileJSON manifest (pmtiles-backed). */
export function sources({
  url = DEFAULT_TILEJSON,
}: { url?: string } = {}): Record<string, SourceSpecification> {
  return { seamap: { type: "vector", url } };
}

export interface LayersOptions {
  /**
   * Rename glyph fontstacks to match the consumer's glyph server. The vendored
   * style uses "Noto Sans Regular" and "Noto Sans Bold"; e.g. VersaTiles wants
   * (f) => f.toLowerCase().replaceAll(" ", "_").
   */
  font?: (name: string) => string;
}

/**
 * The chart layers, referencing the `seamap` source from sources(). Split to
 * preserve upstream draw order: `areas` (sea areas — rocks, obstructions,
 * seabed, restricted areas) belong below land fills, `symbols` (buoys, lights,
 * topmarks, landmarks, labels) on top of everything.
 */
export function layers({ font }: LayersOptions = {}): {
  areas: LayerSpecification[];
  symbols: LayerSpecification[];
} {
  const all = chartStyle.layers as unknown as LayerSpecification[];
  const sourceLayer = (l: LayerSpecification) =>
    "source-layer" in l ? l["source-layer"] : undefined;
  const isSeamark = (l: LayerSpecification) =>
    ["seamark", "light"].includes(sourceLayer(l) ?? "");
  const landIndex = all.findIndex((l) => sourceLayer(l) === "land");
  const pick = (slice: LayerSpecification[]) =>
    slice.filter(isSeamark).map((l) => structuredClone(l));
  const areas = pick(all.slice(0, landIndex));
  const symbols = pick(all.slice(landIndex));
  if (font) {
    for (const layer of [...areas, ...symbols]) {
      const layout = "layout" in layer
        ? (layer.layout as { "text-font"?: string[] })
        : undefined;
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
  /** Seamark TileJSON manifest URL. */
  tiles?: string;
  /** Seascape bathymetry tiles base URL. */
  seascape?: string;
  /** VersaTiles server for the base map, glyphs, and base sprites. */
  versatiles?: string;
  /** Base map label language. */
  language?: string;
  /** URL of the directory serving this package's sprites/dist/ files. */
  spriteBase?: string;
  /** raster-dem source for land hillshading; omit to skip those layers. */
  hillshading?: SourceSpecification;
  /** Vector land-contour source (e.g. from maplibre-contour); omit to skip. */
  contours?: SourceSpecification;
}

/**
 * The whole chart style: VersaTiles base map, Seascape bathymetry, and the
 * chart symbology, in nautical draw order. Pair with setup() on the map, which
 * registers the images the style references at runtime.
 */
export function style({
  tiles,
  seascape = "https://tiles.openwaters.io/seascape",
  versatiles = "https://tiles.versatiles.org",
  language = "en",
  spriteBase = typeof document === "undefined"
    ? "sprites"
    : new URL("sprites", document.baseURI).href,
  hillshading,
  contours,
}: StyleOptions = {}): StyleSpecification {
  const s = colorful({
    baseUrl: versatiles,
    language,
    colors: { label: "#000" },
    recolor: { saturate: -0.3 },
  });
  (s.sprite as { id: string; url: string }[]).push(sprite(spriteBase));
  Object.assign(s.sources, sources({ url: tiles }));

  // Seascape bathymetry: depth shading, depth areas, contours, soundings.
  Object.assign(s.sources, seascapeSources({ tilesBase: seascape }));
  const bathymetry = seascapeLayers({ ...day, font: [versatilesFont(day.font[0])] });
  const hillshade = bathymetry.find((l) => l.id === "hillshade");
  if (hillshade?.layout) hillshade.layout.visibility = "visible"; // seascape defaults it off

  const { areas, symbols } = layers({ font: versatilesFont });

  // draw sea: replace versatiles' first two layers (background, water) with the
  // chart's own background, bathymetry, sea areas, and seamap land
  s.layers.splice(0, 2, {
    id: "background",
    type: "background",
    paint: { "background-color": "#e9f7ff" },
  }, ...bathymetry, ...areas, {
    id: "land_outline",
    source: "seamap",
    "source-layer": "land",
    type: "line",
    paint: { "line-color": "#3d3d3d", "line-width": 3, "line-opacity": 0.8 },
  }, {
    id: "land_area",
    source: "seamap",
    "source-layer": "land",
    type: "fill",
    paint: { "fill-color": "#fdf1d2" },
  });

  // land elevation, when the consumer wires up DEM-backed sources
  if (hillshading) {
    s.sources.hillshading = hillshading;
    s.layers.splice(s.layers.findIndex((l) => l.id == "land-wetland") + 1, 0, {
      id: "hillshading",
      type: "hillshade",
      source: "hillshading",
      paint: { "hillshade-exaggeration": 0.2, "hillshade-method": "combined" },
    });
  }
  if (contours) {
    s.sources.contours = contours;
    s.layers.splice(s.layers.findIndex((l) => l.id == "land-wetland") + 2, 0, {
      id: "contours",
      type: "line",
      source: "contours",
      "source-layer": "contours",
      filter: [">", ["get", "ele"], 0],
      paint: {
        "line-opacity": 0.3,
        "line-width": ["match", ["get", "level"], 1, 0.5, 0.2],
      },
    }, {
      id: "contour-label",
      type: "symbol",
      source: "contours",
      "source-layer": "contours",
      filter: [">", ["get", "ele"], 0],
      minzoom: 10,
      paint: {
        "text-halo-color": "white",
        "text-halo-width": 0.8,
        "text-opacity": 0.3,
      },
      layout: {
        "symbol-placement": "line",
        "text-size": 8,
        "text-field": ["number-format", ["get", "ele"], {}],
        "text-font": ["noto_sans_bold"],
      },
    });
  }

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
  getImage(id: string):
    | { data: unknown; pixelRatio?: number; sdf?: boolean }
    | null
    | undefined;
  addImage(
    id: string,
    image: unknown,
    options?: { pixelRatio?: number; sdf?: boolean },
  ): unknown;
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
    const px = 12, cv = document.createElement("canvas");
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
