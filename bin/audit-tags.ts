#!/usr/bin/env -S npx tsx
// What the planet build actually saw, against what we document and draw.
//
//   bin/audit-tags.ts [tiles.json url]
//
// Planetiler records every attribute it wrote into the archive's metadata, so
// the published TileJSON carries the real planet-wide key list — no
// instrumentation needed. Two things fall out of comparing it to
// worker/src/taginfo.ts: seamark subkeys we never documented, and mark types
// missing from its hand-picked MARK_TYPES.
//
// This is a report, not a check, and deliberately not wired into CI: the list
// moves when OSM data moves, so a mapper inventing a tag must never fail a PR.
import { taginfo } from "../worker/src/taginfo.ts";

const url = process.argv[2] ?? "https://tiles.openwaters.io/seamap/tiles.json";

const res = await fetch(url);
if (!res.ok) throw new Error(`${url} → ${res.status}`);
const tilejson = (await res.json()) as {
  vector_layers: { id: string; fields: Record<string, string> }[];
};

const layer = tilejson.vector_layers.find((l) => l.id === "seamark");
if (!layer) throw new Error(`no seamark layer in ${url}`);
const observed = Object.keys(layer.fields).filter((k) => k.startsWith("seamark:"));

const documented = new Set(taginfo.tags.map((t) => t.key));
// A subkey counts as documented against any concrete type — seamark:light:range
// speaks for the whole family, the way the taginfo descriptions say it does.
const documentedSubkeys = new Set(
  [...documented].flatMap((k) => k.match(/^seamark:(?:.+:)?(.+)$/)?.[1] ?? []),
);

// seamark:<type>:<subkey>, skipping the numbered light sectors.
const bySubkey = new Map<string, Set<string>>();
for (const key of observed) {
  const m = key.match(/^seamark:([^:]+):(.+)$/);
  if (!m || /^\d+$/.test(m[1])) continue;
  bySubkey.set(m[2], (bySubkey.get(m[2]) ?? new Set()).add(m[1]));
}

console.log(`${observed.length} seamark:* keys observed in ${url}\n`);

const undocumented = [...bySubkey]
  .filter(([subkey]) => !documentedSubkeys.has(subkey))
  .sort((a, b) => b[1].size - a[1].size);

console.log("Undocumented subkeys, by how many feature types carry them:");
for (const [subkey, types] of undocumented.slice(0, 25)) {
  console.log(`  ${String(types.size).padStart(3)}  seamark:*:${subkey}`);
}
if (undocumented.length > 25) console.log(`  … and ${undocumented.length - 25} more`);

// Real data holds OSM typos (seamark:buoy_special_purposecolour), so this
// always needs an eyeball — it names candidates, it doesn't dictate.
const marks = [...new Set(observed.map((k) => k.split(":")[1]))]
  .filter((t) => /^(buoy|beacon)_/.test(t))
  .filter((t) => !documented.has(`seamark:${t}:colour`));

console.log(
  marks.length
    ? `\nMark types with no per-type keys in taginfo.ts:\n${marks.map((t) => `  ${t}`).join("\n")}`
    : "\nEvery observed mark type has per-type keys documented.",
);
