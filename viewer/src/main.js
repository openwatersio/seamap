import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MaplibreInspect from "@maplibre/maplibre-gl-inspect";
import "@maplibre/maplibre-gl-inspect/dist/maplibre-gl-inspect.css";
import { style } from "@openwaters/seamap";

// ?tiles=<url> points the chart at another TileJSON — the dev server's local
// worker, say — instead of the published tiles. ?hillshade turns on the
// bathymetric hillshading the style ships off; ?shading=relief swaps the
// vector depth bands for the raster DEM color-relief; ?standards draws the
// symbology strictly per S-52 instead of the chart's own portrayal.
const params = new URLSearchParams(location.search);
const tiles = params.get("tiles") || undefined;
const depthHillshade = params.has("hillshade");
const standards = params.has("standards");
// anything but the known raster opt-in falls back to the style's default
const shading = params.get("shading") === "relief" ? "relief" : undefined;

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
  style: await style({ tiles, depthHillshade, shading, standards }),
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

window.map = map; // console/devtools access
