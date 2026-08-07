import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  createExpression,
  featureFilter,
  validateStyleMin,
} from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { layers, sources, sprite, style } from "./index.ts";

const { areas, symbols } = layers();
const all = [...areas, ...symbols];

it("produces a valid style", () => {
  const style: StyleSpecification = {
    version: 8,
    glyphs: "https://example.com/glyphs/{fontstack}/{range}.pbf",
    sprite: [sprite("https://example.com/sprites")],
    sources: sources(),
    layers: [...areas, ...symbols],
  };
  expect(validateStyleMin(style)).toEqual([]);
});

it("assembles a valid whole style", async () => {
  const whole = await style({
    spriteBase: "https://example.com/sprites",
    hillshade: false, // keeps the builder offline (no elevation TileJSON fetch)
    // seascape passthrough options
    unit: "ft",
    safety: 3,
    shading: "bands",
    flavor: { hazard: "#c00" },
  });
  expect(validateStyleMin(whole)).toEqual([]);
  expect(whole.name).toBe("Open Waters Seamap");
  expect(whole.metadata).toBeUndefined(); // versatiles' license claim must not leak through
  const ids = whole.layers.map((l) => l.id);
  for (const id of ["background", "buoys", "lights", "land_area"]) {
    expect(ids).toContain(id);
  }
  // sea-area fills sit below land; hazard points draw above it, and the coastline above its fill
  expect(ids.indexOf("restricted-areas")).toBeLessThan(ids.indexOf("land_area"));
  expect(ids.indexOf("rocks")).toBeGreaterThan(ids.indexOf("land_area"));
  expect(ids.indexOf("land_outline")).toBeGreaterThan(ids.indexOf("land_area"));
  expect(ids.at(-1)).toBe("lights-label");
});

it("carries both land and sea hillshade layers without id collisions", async () => {
  const tilejson = {
    tilejson: "3.0.0",
    tiles: ["dem://{z}/{x}/{y}"],
    minzoom: 0,
    maxzoom: 12,
    bounds: [-180, -85, 180, 85],
    attribution: "elevation",
    encoding: "terrarium",
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(tilejson))) as typeof fetch;
  try {
    const whole = await style({ spriteBase: "https://example.com/sprites" });
    expect(validateStyleMin(whole)).toEqual([]);
    const hillshades = whole.layers.filter((l) => l.type === "hillshade").map((l) => l.id);
    expect(hillshades).toContain("hillshade"); // land (versatiles elevation)
    expect(hillshades).toContain("depth-hillshade"); // sea (seascape bathymetry)
  } finally {
    globalThis.fetch = realFetch;
  }
});

// Consumers splice these into their own stacks and key runtime tweaks off ids,
// so renames and reorders are breaking changes.
it("keeps layer ids and order stable", () => {
  expect(areas.map((l) => l.id)).toEqual([
    // allowed before restricted: RESARE outranks ACHARE where they overlap
    "allowed-areas",
    "allowed-areas-labels",
    "restricted-areas",
    "restricted-areas-label",
    "restricted-areas-fill",
    "restricted-areas-fill-pattern",
  ]);
  expect(symbols.map((l) => l.id)).toEqual([
    // hazards — point symbols draw above land so the coastline never hides them
    "rocks_outline",
    "rocks",
    "obstructions",
    "seabed",
    // routes
    "cables-pipes",
    "TSS-separation-zone",
    "TSS-crossing-zone",
    "TSS-separation-lane-arrows",
    "TSS-separation-boundary",
    "TSS-separation-line",
    "ferry",
    "navigation-lines",
    "navigation-tracks",
    // structures
    "shoreline-constructions",
    "piles",
    "platforms",
    "cranes",
    "rescue-stations",
    "radar-stations",
    "radio_station",
    "small-craft-facilities",
    "harhours",
    // lights
    "lights",
    "light_ray",
    "light_arc_casing",
    "light_arc",
    "light_arc_obscured",
    "light-minor",
    "light-major",
    "fogsignals",
    // marks — bodies first, so a hull can never paint over its topmark or reflector
    "buoys",
    "topmarks",
    "radar-reflectors",
    // labels — last, so they win symbol collisions against the icons below
    "landmarks",
    "line_symbols",
    "seamark-line-label",
    "seamark-label",
    "lights-label",
  ]);
});

const PRIVATE = ["no", "private", "permit", "customers"];

describe("restricted access", () => {
  const layer = (id: string) =>
    all.find((l) => l.id === id) as { filter: never; paint: Record<string, unknown> };
  const point = (properties: Record<string, string>) => ({ type: 1, properties }) as never;

  const drawn = (id: string, properties: Record<string, string>) =>
    featureFilter(layer(id).filter).filter({ zoom: 16 }, point(properties), undefined as never);

  const slipway = { type: "small_craft_facility", category: "slipway" };

  it("hides small-craft facilities the public can't use", () => {
    for (const access of PRIVATE) {
      expect(drawn("small-craft-facilities", { ...slipway, access })).toBe(false);
    }
  });

  // ["get", "access"] on an untagged feature is null, and `in` against null is false
  it("keeps facilities that are untagged or openly accessible", () => {
    expect(drawn("small-craft-facilities", slipway)).toBe(true);
    expect(drawn("small-craft-facilities", { ...slipway, access: "yes" })).toBe(true);
  });

  // marinas and fishing harbours are landmarks either way, so they fade instead of vanishing
  it("fades restricted harbours instead of dropping them", () => {
    expect(drawn("harhours", { type: "harbour", category: "marina", access: "private" })).toBe(
      true,
    );
    // a fishing *facility* is not a fishing harbour; without the type check it drew in both layers
    expect(drawn("harhours", { type: "small_craft_facility", category: "fishing" })).toBe(false);

    for (const key of ["icon-opacity", "text-opacity"]) {
      const compiled = createExpression(layer("harhours").paint[key]);
      if (compiled.result !== "success") throw new Error(`${key} failed to compile`);
      const opacity = (access?: string) =>
        compiled.value.evaluate({ zoom: 12 }, point(access ? { access } : {}));
      for (const access of PRIVATE) expect(opacity(access)).toBe(0.5);
      expect(opacity()).toBe(1);
      expect(opacity("yes")).toBe(1);
    }
  });
});

// bin/sprites pads fill-pattern icons into a 32-unit repeat cell; one it doesn't know about
// renders as a solid mass instead of chart hatching. It can't read the layer modules, so it
// carries the list — keep the two in step.
it("pads every fill pattern the style uses", () => {
  const script = readFileSync("bin/sprites", "utf8");
  const patterns = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === "string" && node.startsWith("freenauticalchart:")) {
      patterns.add(node.split(":", 2)[1]);
    } else if (Array.isArray(node)) node.forEach(walk);
  };
  for (const layer of all)
    walk((layer as { paint?: { "fill-pattern"?: unknown } }).paint?.["fill-pattern"]);
  expect(patterns.size).toBeGreaterThan(0);
  expect([...patterns].filter((name) => !script.includes(`"${name}"`))).toEqual([]);
});

it("returns fresh copies", () => {
  const a = layers({ font: (f) => f.toLowerCase() });
  const b = layers();
  const fonts = (ls: typeof areas) =>
    ls.flatMap((l) => ("layout" in l && l.layout?.["text-font"]) || []);
  expect(fonts(a.symbols)).not.toEqual(fonts(b.symbols));
});

// Icon names are composed from tag values at render time; the ones written
// literally in the style must exist in the built sheet. Composed names are
// covered by each shape's /generic fallback (a coalesce of image expressions).
const spriteIndex = "sprites/dist/freenauticalchart.json";
describe.skipIf(!existsSync(spriteIndex))("sprite sheet", () => {
  const icons = new Set(Object.keys(JSON.parse(readFileSync(spriteIndex, "utf8"))));

  const literals = new Set<string>();
  const walk = (node: unknown): void => {
    // trailing "/", ":" or "-" means a concat fragment, not a complete name
    if (typeof node === "string" && /^freenauticalchart:.*[^/:-]$/.test(node)) {
      literals.add(node.split(":", 2)[1]);
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    }
  };
  for (const layer of all) {
    walk((layer as { layout?: { "icon-image"?: unknown } }).layout?.["icon-image"]);
    walk((layer as { paint?: { "fill-pattern"?: unknown } }).paint?.["fill-pattern"]);
  }

  it("contains every icon the style names literally", () => {
    expect(literals.size).toBeGreaterThan(0);
    expect([...literals].filter((name) => !icons.has(name))).toEqual([]);
  });

  // style() adds fill patterns the layers() walk above never sees (the unsurveyed
  // water stipple); check every chart-sheet pattern in the whole style resolves
  it("contains every fill pattern the whole style references", async () => {
    const whole = await style({ spriteBase: "https://example.com/sprites", hillshade: false });
    const patterns = new Set<string>();
    const collect = (node: unknown): void => {
      if (typeof node === "string" && node.startsWith("freenauticalchart:")) {
        patterns.add(node.split(":", 2)[1]);
      } else if (Array.isArray(node)) {
        node.forEach(collect);
      }
    };
    for (const layer of whole.layers) {
      collect((layer as { paint?: { "fill-pattern"?: unknown } }).paint?.["fill-pattern"]);
    }
    expect(patterns.has("unsurveyed")).toBe(true);
    expect([...patterns].filter((name) => !icons.has(name))).toEqual([]);
  });
});

// Charts never draw a centerline through navigable water (S-57 UOC §4.7.6),
// and OSM centerlines run through wide rivers too — so none survive.
it("drops waterway centerlines", async () => {
  const whole = await style({ spriteBase: "https://example.com/sprites", hillshade: false });
  const ids = whole.layers.map((l) => l.id);
  for (const id of ["water-river", "water-canal", "water-stream", "water-ditch"]) {
    expect(ids).not.toContain(id);
  }
});

// ["==", "type", "ferry_route"] compares two constants and is always false, but it is valid
// style-spec so nothing complains — the layer just silently draws nothing. Only the operands
// of == and != are checked: `in` legitimately takes a literal needle (["in", "buoy", …]).
it("never compares two constants", () => {
  const constant = (node: unknown) => typeof node === "string" || typeof node === "number";
  const offenders: string[] = [];
  const walk = (node: unknown, layerId: string): void => {
    if (!Array.isArray(node)) return;
    if ((node[0] === "==" || node[0] === "!=") && constant(node[1]) && constant(node[2])) {
      offenders.push(`${layerId}: ${JSON.stringify(node)}`);
    }
    node.forEach((child) => walk(child, layerId));
  };
  for (const layer of all) {
    for (const key of ["filter", "layout", "paint"] as const) {
      walk((layer as Record<string, unknown>)[key], layer.id);
    }
  }
  expect(offenders).toEqual([]);
});
