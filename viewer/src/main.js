import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MaplibreInspect from "@maplibre/maplibre-gl-inspect";
import "@maplibre/maplibre-gl-inspect/dist/maplibre-gl-inspect.css";
import { style } from "@openwaters/seamap";

// The ⚙ panel (index.html) exposes the style() options; each opt-<name> input
// mirrors a same-named URL param (only set when it differs from the default),
// so any state here is shareable, e.g. ?tiles=<url> points the chart at the
// dev server's local worker instead of the published tiles.
const params = new URLSearchParams(location.search);
// legacy: bare ?hillshade meant the bathymetric hillshade before the panel's
// option-named params
if (params.get("hillshade") === "") {
  params.delete("hillshade");
  params.set("depthHillshade", "1");
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
}

const inputs = [...document.querySelectorAll("[id^='opt-']")];
const serialize = (el) => (el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value.trim());
const defaults = new Map(inputs.map((el) => [el, serialize(el)]));
for (const el of inputs) {
  const name = el.id.slice(4);
  if (!params.has(name)) continue;
  if (el.type === "checkbox") el.checked = params.get(name) !== "0";
  else el.value = params.get(name);
}

// don't hide a non-default option behind the collapsed Advanced toggle
const advanced = document.getElementById("advanced");
advanced.open = [...advanced.querySelectorAll("[id^='opt-']")].some(
  (el) => serialize(el) !== defaults.get(el),
);

// only non-default inputs become options — style() fills in its own defaults
// for the rest
function styleOptions() {
  const o = {};
  for (const el of inputs) {
    if (serialize(el) === defaults.get(el)) continue;
    const name = el.id.slice(4);
    if (el.type === "checkbox") o[name] = el.checked;
    else o[name] = el.type === "number" ? Number(el.value) : el.value.trim();
  }
  return o;
}

// add the MapLibre GL RTL text plugin for proper rendering of right-to-left languages
maplibregl.setRTLTextPlugin(
  "https://tiles.versatiles.org/assets/lib/mapbox-gl-rtl-text/mapbox-gl-rtl-text.js",
  true,
);

const map = new maplibregl.Map({
  hash: true,
  center: [10.2351, 56.16858],
  zoom: 13.4,
  container: "map",
  style: await style(styleOptions()),
  dragRotate: false,
  touchPitch: false,
  maxPitch: 0,
  attributionControl: {
    compact: true, // collapsed to the ⓘ toggle by default
  },
});

map.touchZoomRotate.disableRotation(); // pinch still zooms, just never rotates

// Toggles a debug view of the vector tiles: every layer recoloured, with the
// feature's tags on hover. The tiles carry the OSM tags verbatim, so this is
// how you find out what a feature actually holds before styling it.
map.addControl(
  new MaplibreInspect({
    popup: new maplibregl.Popup({ closeButton: false, closeOnClick: false }),
  }),
);

// Panel changes: sync the URL, rebuild the style (setStyle diffs, so the map
// only reloads what changed). Token guards a slow build landing out of order.
let styleToken = 0;
async function applyOptions() {
  const p = new URLSearchParams(location.search);
  for (const el of inputs) {
    const name = el.id.slice(4);
    const cur = serialize(el);
    if (cur !== defaults.get(el)) p.set(name, cur);
    else p.delete(name);
  }
  const query = p.size ? `?${p}` : "";
  history.replaceState(null, "", `${location.pathname}${query}${location.hash}`);
  const token = ++styleToken;
  const s = await style(styleOptions());
  if (token === styleToken) map.setStyle(s);
}
for (const el of inputs) el.addEventListener("change", applyOptions);

map.addControl({
  onAdd: () => document.getElementById("controls"),
  onRemove: () => {},
});

window.map = map; // console/devtools access
