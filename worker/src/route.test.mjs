// Run: node src/route.test.mjs   (Node ≥22.18 strips the imported .ts)
import assert from "node:assert/strict";
import { mountPath, styleQuery } from "./route.ts";

// ── mountPath: the route prefix is present in prod, absent under wrangler dev ─
assert.deepEqual(mountPath("/seamap/tiles.json", "/seamap"), {
  rel: "/tiles.json",
  mount: "/seamap",
});
assert.deepEqual(mountPath("/seamap/12/2/3.pbf", "/seamap"), {
  rel: "/12/2/3.pbf",
  mount: "/seamap",
});
assert.deepEqual(mountPath("/tiles.json", "/seamap"), {
  rel: "/tiles.json",
  mount: "",
});
// A path that merely starts with the same letters is not mounted.
assert.deepEqual(mountPath("/seamaps/x", "/seamap"), {
  rel: "/seamaps/x",
  mount: "",
});
// Trailing slashes on the base, and the bare mount point itself.
assert.deepEqual(mountPath("/seamap/tiles.json", "/seamap/"), {
  rel: "/tiles.json",
  mount: "/seamap",
});
assert.deepEqual(mountPath("/seamap", "/seamap"), { rel: "", mount: "/seamap" });
// Serving at the root: nothing to strip.
assert.deepEqual(mountPath("/tiles.json", ""), { rel: "/tiles.json", mount: "" });

// ── styleQuery: valid params become options, invalid ones become 400 text ────
const q = (s) => styleQuery(new URLSearchParams(s));
assert.deepEqual(q(""), {});
assert.deepEqual(q("unit=ft&safety=3.5&shading=bands&language=de"), {
  unit: "ft",
  safety: 3.5,
  shading: "bands",
  language: "de",
});
assert.deepEqual(q("safety=0"), { safety: 0 }); // 0 = off, not "absent"
assert.equal(typeof q("unit=fathoms"), "string");
assert.equal(typeof q("safety=-1"), "string");
assert.equal(typeof q("safety=deep"), "string");
assert.equal(typeof q("safety="), "string");
assert.equal(typeof q("shading=hillshade"), "string");

console.log("route.ts ok — mount stripping, style param validation");
