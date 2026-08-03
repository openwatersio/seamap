import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { layers, sources, sprite, style } from "./index.ts";
import chartStyle from "./freenauticalchart.style.json";

const { areas, symbols } = layers();

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

it("assembles a valid whole style", () => {
  const whole = style({
    spriteBase: "https://example.com/sprites",
    hillshading: { type: "raster-dem", tiles: ["dem://{z}/{x}/{y}"] },
    contours: { type: "vector", tiles: ["contour://{z}/{x}/{y}"] },
  });
  expect(validateStyleMin(whole)).toEqual([]);
  const ids = whole.layers.map((l) => l.id);
  for (const id of ["background", "buoys", "lights", "land_area", "hillshading", "contours"]) {
    expect(ids).toContain(id);
  }
  // chart symbols end the stack, sea areas sit below land
  expect(ids.indexOf("rocks")).toBeLessThan(ids.indexOf("land_area"));
  expect(ids.at(-1)).toBe("lights-label");
});

// Consumers splice these into their own stacks and key runtime tweaks off ids,
// so renames and reorders are breaking changes.
it("keeps layer ids and order stable", () => {
  expect(areas.map((l) => l.id)).toEqual([
    "rocks_outline", "rocks", "obstructions", "seabed",
    "restricted-areas", "restricted-areas-label", "restricted-areas-fill",
    "restricted-areas-fill-pattern", "allowed-areas", "allowed-areas-labels",
  ]);
  expect(symbols.map((l) => l.id)).toEqual([
    "cables-pipes", "TSS-separation-zone", "TSS-crossing-zone",
    "TSS-separation-lane-arrows", "TSS-separation-boundary",
    "TSS-separation-line", "traffic-lane", "ferry", "piles", "platforms",
    "radio_station", "lights", "light_ray", "light_arc", "light-minor",
    "light-major", "fogsignals", "radar-reflectors", "topmarks", "buoys",
    "landmarks", "navigation-lines", "navigation-tracks", "line_symbols",
    "seamark-line-label", "seamark-label", "harhours", "lights-label",
  ]);
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
// covered by each shape's /generic fallback (handleMissingImages).
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
  for (const layer of chartStyle.layers) {
    walk((layer as { layout?: { "icon-image"?: unknown } }).layout?.["icon-image"]);
    walk((layer as { paint?: { "fill-pattern"?: unknown } }).paint?.["fill-pattern"]);
  }

  it("contains every icon the style names literally", () => {
    expect(literals.size).toBeGreaterThan(0);
    expect([...literals].filter((name) => !icons.has(name))).toEqual([]);
  });
});
