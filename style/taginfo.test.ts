// Keeps worker/src/taginfo.ts honest: a key the profile or the style reads but
// nobody documented is a tag page on taginfo that never learns this chart
// renders it. The list can't be generated — the profile passes every seamark:*
// key through and the style composes keys at render time — so it's written by
// hand and checked here.
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { layers } from "./index.ts";
import { taginfo } from "../worker/src/taginfo.ts";

// The whole profile, not just the seamark extraction: Seamap.java reads the
// tags behind the water, wetland and waterway layers.
const java = ["Seamark", "Seamap", "Lights"]
  .map((f) => readFileSync(new URL(`../src/main/java/${f}.java`, import.meta.url), "utf8"))
  .join("\n");

const keys = new Set(taginfo.tags.map((t) => t.key));
const pairs = new Set(taginfo.tags.filter((t) => t.value).map((t) => `${t.key}=${t.value}`));

/**
 * The literal body of a Java field declaration, e.g. TAG_WHITELIST's Set.of(...).
 * Asserts on the declaration itself: a renamed field would otherwise search from
 * index 0 and hand back whichever unrelated block matched first.
 */
function field(name: string, open: string, close: string): string {
  const decl = java.indexOf(`${name} =`);
  expect(decl, `${name} is not declared in the profile — did it get renamed?`).toBeGreaterThan(-1);
  const start = java.indexOf(open, decl);
  const end = java.indexOf(close, start);
  expect(end, `${name} has no closing ${close}`).toBeGreaterThan(start);
  return java.slice(start, end);
}

it("documents every tag the profile reads", () => {
  const whitelist = [...field("TAG_WHITELIST", "(", ");").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // {key, value, type, category} rows — the first two are the OSM tag.
  const plain = [...field("PLAIN_TAG_FEATURES", "{", "\n  };").matchAll(/\{"([^"]+)", "([^"]+)"/g)];
  // The else-if chain that maps ordinary tagging onto a seamark.
  const matched = [...java.matchAll(/"([\w:;-]+)"\.equals\(value\(tags, "([\w:]+)"\)\)/g)];
  // Every plain key the profile looks up, and every seamark:<a>:<b> it resolves.
  const read = [...java.matchAll(/\b(?:value\(tags, |tags\.(?:get|containsKey)\()"([\w:]+)"\)/g)];
  const sub = [...java.matchAll(/\bseamarkValue\(tags, "(\w+)", "(\w+)"\)/g)].map(
    (m) => `seamark:${m[1]}:${m[2]}`,
  );
  // Seamap.java reads a tag into a local before testing it, so bind the local
  // to the key it came from and the "value".equals(local) tests become pairs.
  const locals = new Map(
    [...java.matchAll(/String (\w+) = \(String\) tags\.get\("([\w:]+)"\)/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const viaLocal = [...java.matchAll(/"([\w:;-]+)"\.equals\((\w+)\)/g)]
    .filter((m) => locals.has(m[2]))
    .map((m) => [locals.get(m[2])!, m[1]]);

  // A refactor that outruns these patterns must fail loudly, not pass empty.
  expect(whitelist.length).toBeGreaterThan(25);
  expect(plain.length).toBeGreaterThan(15);
  expect(matched.length).toBeGreaterThan(15);
  expect(locals.size).toBeGreaterThan(2);

  expect([
    ...whitelist,
    ...sub,
    ...read.map((m) => m[1]),
    ...plain.map((m) => m[1]),
    ...matched.map((m) => m[2]),
    ...viaLocal.map(([key]) => key),
  ]).toSatisfyDocumented(keys);

  // A new plain-tag rule on an already-documented key (another leisure=* say)
  // is invisible unless the value is checked too.
  expect([
    ...plain.map((m) => `${m[1]}=${m[2]}`),
    ...matched.map((m) => `${m[2]}=${m[1]}`),
    ...viaLocal.map(([key, value]) => `${key}=${value}`),
  ]).toSatisfyDocumented(pairs);

  // seamarkValue(tags, type, "colour") resolves seamark:<type>:colour for a type
  // known only at runtime, so no key literal exists to check. Require instead
  // that each subkey is documented against at least one concrete type.
  const tails = new Set([...keys].flatMap((k) => k.match(/^seamark:(?:.+:)?(.+)$/)?.[1] ?? []));
  const dynamic = [...java.matchAll(/\bseamarkValue\(tags, \w+, "(\w+)"\)/g)].map((m) => m[1]);
  expect(dynamic.length).toBeGreaterThan(5);
  expect(dynamic).toSatisfyDocumented(tails);

  // Which types those subkeys get resolved against is equally invisible, so
  // require every mark the IALA defaults name to carry documented per-type keys.
  const marks = [...new Set([...java.matchAll(/"((?:buoy|beacon)_\w+)"/g)].map((m) => m[1]))];
  expect(marks.length).toBeGreaterThan(8);
  expect(marks.map((t) => `seamark:${t}:colour`)).toSatisfyDocumented(keys);
});

it("documents every OSM key the style filters on", () => {
  const { areas, symbols } = layers();
  const read = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      if ((node[0] === "get" || node[0] === "has") && typeof node[1] === "string")
        read.add(node[1]);
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk([...areas, ...symbols]);

  // Derived attributes the profile computes are bare words (type, color,
  // topmark_shape); a colon means it came straight off the OSM feature. The
  // unprefixed OSM keys the style reads — access, restriction, water_level —
  // are all in TAG_WHITELIST, so the profile check above already covers them.
  expect([...read].filter((k) => k.includes(":"))).toSatisfyDocumented(keys);
});

expect.extend({
  toSatisfyDocumented(found: string[], documented: Set<string>) {
    const missing = [...new Set(found)].filter((k) => !documented.has(k)).sort();
    return {
      pass: missing.length === 0,
      message: () => `undocumented in worker/src/taginfo.ts:\n  ${missing.join("\n  ")}`,
    };
  },
});

declare module "vitest" {
  interface Matchers<T = unknown> {
    toSatisfyDocumented(documented: Set<string>): T;
  }
}
