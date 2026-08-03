# @openwaters/seamap

The [Open Waters](https://github.com/openwatersio/seamap) nautical chart as a MapLibre GL style: a [VersaTiles](https://versatiles.org) base map, [Seascape](https://github.com/openwatersio/seascape) bathymetry, and chart symbology (buoys, beacons, lights, topmarks, landmarks, restricted areas) with the sprite sheet that draws it.

## Whole style

`style()` assembles everything; `setup()` registers the runtime images the style depends on (the generic-icon fallback and the "unsurveyed water" stipple):

```js
import { style, setup, attribution } from "@openwaters/seamap";

const map = new maplibregl.Map({
  container: "map",
  style: style({ spriteBase: new URL("sprites", document.baseURI).href }),
  attributionControl: { customAttribution: attribution },
});
setup(map);
```

Options: `tiles` (seamark TileJSON URL), `seascape`, `versatiles`, `language`, `spriteBase`, and optional `hillshading`/`contours` source specs for land elevation (see the viewer's `main.js` for wiring them from maplibre-contour — they need runtime protocol registration, so they can't live here).

## Composed

`sources()` + `layers()` hand over just the chart symbology for a style you assemble yourself, following the same split as seascape:

```js
import { sources, layers, sprite, handleMissingImages, attribution } from "@openwaters/seamap";

const { areas, symbols } = layers();
const style = {
  version: 8,
  sources: { ...mySources, ...sources() },
  sprite: [mySprite, sprite(new URL("sprites", document.baseURI).href)],
  // areas go below land fills and labels; symbols on top of everything
  layers: [...myBaseLayers, ...areas, ...myLandLayers, ...symbols],
};

const map = new maplibregl.Map({ style, /* ... */ });
handleMissingImages(map);
```

- `sources({ url? })` — the `seamap` vector source (defaults to `https://tiles.openwaters.io/seamap/latest.json`).
- `layers({ font? })` — the chart layers, split into `areas` and `symbols` to preserve draw order around your land layers. `font` renames glyph fontstacks (`"Noto Sans Regular"`, `"Noto Sans Bold"`) to match your glyph server.
- `sprite(base)` — the `style.sprite` entry pointing at wherever you serve the sheet.
- `handleMissingImages(map)` — falls back to each shape's `generic` icon when tags compose a colour combination the sheet doesn't carry. Without it, unusual marks render as nothing.
- `attribution` — the sprite artwork credit; sprites aren't a MapLibre source, so pass it as `customAttribution`.

## Sprites

The built sheet ships in the package at `sprites/dist/` (`freenauticalchart.{json,png}`, `@2x` variants, `LICENSE`, `PROVENANCE.md`). MapLibre loads sprites from a URL *prefix* — it appends `.json`/`.png`/`@2x` itself — so the files must be served together under a stable path rather than imported through a bundler's asset pipeline. With Vite:

```js
import { viteStaticCopy } from "vite-plugin-static-copy";

viteStaticCopy({
  targets: [{ src: "node_modules/@openwaters/seamap/sprites/dist/*", dest: "sprites" }],
})
```

Icon names are composed from tag values at render time, so the style layers and the sprite sheet must always move together — always serve the sheet from this same package version.

In this repo the sheet is generated, not committed: `bin/sprites` (here in `style/`) expands the vendored SVG sources in [sprites/](sprites/) into `sprites/dist/`. Needs `spreet` (pinned in the repo's `mise.toml`) and Python 3. `npm publish` runs it via `prepublishOnly`; consumers of the published package never need the toolchain.

## Vendored style

[freenauticalchart.style.json](freenauticalchart.style.json) is `styles/freenauticalchart.json` from [signalk-seamap-plugin] — a chart-only MapLibre style whose seamark and light layers `layers()` extracts. The style declares CC0 in its own metadata.

Fixes applied on top of upstream, to reapply when re-vendoring:

- `topmarks` built its icon name from `["has", "topmark_color_pattern"]`, putting the boolean into the name instead of the pattern. Now reads the value.
- `restricted-areas-fill-pattern` matched every restricted area but has patterns only for military and entry/anchoring restrictions, so nature reserves resolved to an empty image name. Its filter now matches what it can actually draw.
- `buoys` gets `icon-anchor: bottom` + `icon-offset: [0, 4]`, and `lights` gets `icon-anchor: top` + `icon-offset: [0, 2]`. The plugin's packed sheet baked these positions into padded canvases; our sheet is tight-cropped like the sprite source's own pipeline, which positions in the style exactly this way (quantenschaum/mapping `vector/styles/s57.json`).
- `rocks` concatenated `rock-` + `water_level` with no fallback, but most OSM rocks carry no `water_level` (invisible symbol) and `dry` has no icon in the sheet. Now a `match`: `covers` and `awash` keep their icons, everything else draws `rock-submerged` — the same default the sprite author's own s57.json uses, and the safe direction when the level is unknown.

[signalk-seamap-plugin]: https://github.com/prozessor13/signalk-seamap-plugin

## Versioning

Semver tracks the consumer-facing contract: renaming or reordering layer ids, changing the icon naming scheme, or removing icons is major; new layers or icons are minor; visual tweaks are patch.

## License

GPL-3.0. The sprite artwork is GPL-3.0 from [quantenschaum/mapping](https://github.com/quantenschaum/mapping) (see [sprites/PROVENANCE.md](sprites/PROVENANCE.md)), which carries the package as a whole; the vendored style JSON is CC0.
