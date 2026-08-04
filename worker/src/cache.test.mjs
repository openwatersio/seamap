// Run: node src/cache.test.mjs   (Node ≥22.18 strips the imported .ts)
import assert from "node:assert/strict";
import { contentEtag, CachedSource } from "./cache.ts";

// ── contentEtag: deterministic, content-derived, quoted ──────────────────────
const bytesA = new TextEncoder().encode("tile-bytes-a");
const bytesB = new TextEncoder().encode("tile-bytes-b");
const tagA = await contentEtag(bytesA);
assert.equal(tagA, await contentEtag(bytesA)); // same bytes → same validator
assert.notEqual(tagA, await contentEtag(bytesB)); // different bytes → different
assert.match(tagA, /^"[0-9a-f]{16}"$/); // quoted 64-bit hex, no prefix

// ── CachedSource: range reads hit the colo cache, not the inner source ───────
// Map-backed stub of caches.default (node has caches unset).
const store = new Map();
globalThis.caches = {
  default: {
    async match(key) {
      const v = store.get(key);
      return v ? new Response(v.slice(0)) : undefined;
    },
    async put(key, res) {
      store.set(key, await res.arrayBuffer());
    },
  },
};

let innerReads = 0;
const inner = {
  getKey: () => "seamap/2026-08-04.pmtiles",
  async getBytes(offset, length) {
    innerReads++;
    return { data: new Uint8Array([offset, length]).buffer };
  },
};
const src = new CachedSource(
  inner,
  "https://tiles.test/__pmtiles/seamap/2026-08-04.pmtiles",
);

const r1 = await src.getBytes(0, 16384);
assert.equal(innerReads, 1);
const r2 = await src.getBytes(0, 16384); // repeat range → served from cache
assert.equal(innerReads, 1);
assert.deepEqual(new Uint8Array(r2.data), new Uint8Array(r1.data));
await src.getBytes(500, 32); // distinct range → distinct key → inner read
assert.equal(innerReads, 2);
assert.equal(src.getKey(), "seamap/2026-08-04.pmtiles"); // identity passes through

console.log("cache.test.mjs: all assertions passed");
