# @openwaters/seamap

The [Open Waters](https://github.com/openwatersio/seamap) nautical chart as a MapLibre GL style: a chart-styled base map from the [VersaTiles](https://versatiles.org) shortbread tiles, [Seascape](https://github.com/openwatersio/seascape) bathymetry, and chart symbology (buoys, beacons, lights, topmarks, landmarks, restricted areas) with the sprite sheet that draws it.

## Whole style

`style()` assembles everything:

```js
import { style } from "@openwaters/seamap";

const map = new maplibregl.Map({
  container: "map",
  style: await style({ spriteBase: new URL("sprites", document.baseURI).href }),
});
```

Options: `tiles` (seamark TileJSON URL), `seascape`, `versatiles`, `language`, `spriteBase`, `basemap` (the base-map mariner preference — roads, railways, buildings, landcover, street names; on by default, `false` leaves only the chart and its topography), `hillshade` (on by default; `false` to skip, or an object to tune the shading), `depthHillshade`, and the seascape passthroughs — `flavor` (overrides merged over its `day`), `unit`, `safety`, `shading`, and the `dem`/`vector`/`coverage` source id overrides.

## Composed

`sources()` + `layers()` hand over just the chart symbology for a style you assemble yourself, following the same split as seascape:

```js
import { sources, layers, sprite } from "@openwaters/seamap";

const { areas, symbols } = layers();
const style = {
  version: 8,
  sources: { ...mySources, ...sources() },
  sprite: [mySprite, sprite(new URL("sprites", document.baseURI).href)],
  // areas go below land fills and labels; symbols on top of everything
  layers: [...myBaseLayers, ...areas, ...myLandLayers, ...symbols],
};

const map = new maplibregl.Map({ style /* ... */ });
```

- `sources({ url? })` — the `seamap` vector source (defaults to `https://tiles.openwaters.io/seamap/tiles.json`).
- `layers({ font? })` — the chart layers, split into `areas` and `symbols` to preserve draw order around your land layers. `font` renames glyph fontstacks (`"Noto Sans Regular"`) to match your glyph server.
- `sprite(base)` — the `style.sprite` entry pointing at wherever you serve the sheet.

When tags compose a colour combination the sheet doesn't carry, the layers fall back to the shape's `generic` icon in the style itself (a `coalesce` of `image` expressions), so unusual marks never render as nothing.

## Sprites

The built sheet ships in the package at `sprites/dist/` (`freenauticalchart.{json,png}`, `@2x` variants, the glyph licence, `PROVENANCE.md`). MapLibre loads sprites from a URL _prefix_ — it appends `.json`/`.png`/`@2x` itself — so the files must be served together under a stable path rather than imported through a bundler's asset pipeline. With Vite:

```js
import { viteStaticCopy } from "vite-plugin-static-copy";

viteStaticCopy({
  targets: [{ src: "node_modules/@openwaters/seamap/sprites/dist/*", dest: "sprites" }],
});
```

Icon names are composed from tag values at render time, so the style layers and the sprite sheet must always move together — always serve the sheet from this same package version.

In this repo the sheet is generated, not committed: `bin/sprites` (here in `style/`) expands the vendored SVG sources in [sprites/](sprites/) into `sprites/dist/`. Needs `spreet` (pinned in the repo's `mise.toml`) and Python 3. `npm publish` runs it via `prepublishOnly`; consumers of the published package never need the toolchain.

The same run composes the `poi-*` badges via `bin/poi-badges`, pulling glyphs from the `@iconify-json/*` dev dependencies (which sets, and their licences, are in [sprites/PROVENANCE.md](sprites/PROVENANCE.md)) and wrapping each in a halo and disc. Those packages have to be installed first, so `npm install` comes before `bin/sprites`, not after. To add an amenity symbol, map a sprite name to a glyph inside one of the groups in [sprites/poi-icons.json](sprites/poi-icons.json) — there is nothing to draw. The group decides the disc colour: colour says which question the badge answers (berthing, consumables, haul-out, ashore) and the glyph says which facility, because at 16 units the glyph alone does not resolve until you are already looking at it. Both scripts write into `sprites/icons/gen/`, which is gitignored, so no generated artwork is ever committed.

## Chart layers

The symbology lives in [layers/](layers/), grouped by what it draws. Each module exports one function returning its layers in draw order; [layers/index.ts](layers/index.ts) concatenates them and makes the `areas`/`symbols` split.

| module                                | draws                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [wetlands.ts](layers/wetlands.ts)     | tidal flats and marshes from the tiles' wetland layer                                                          |
| [areas.ts](layers/areas.ts)           | rocks, wrecks and obstructions, seabed quality, restricted and allowed areas                                   |
| [routes.ts](layers/routes.ts)         | traffic separation schemes, ferry routes, navigation lines and tracks, submarine cables and pipelines          |
| [structures.ts](layers/structures.ts) | piers and breakwaters, piles and dolphins, platforms, cranes, shore stations, harbours, small craft facilities |
| [lights.ts](layers/lights.ts)         | lit-mark flares, sector arcs and rays, major and minor lights, fog signals                                     |
| [marks.ts](layers/marks.ts)           | buoys and beacons, topmarks, radar reflectors                                                                  |
| [labels.ts](layers/labels.ts)         | landmarks and all name text, including the light characteristic                                                |

The order of that concatenation is load-bearing twice. Paint order is the obvious half. The other is symbol collision: MapLibre places symbols in _reverse_ draw order, so a layer listed later wins the anchor in a crowded harbour — which is why labels come last. `index.test.ts` asserts the full id order, so a reshuffle can't happen by accident.

The base map is authored the same way but stays outside the `layers()` export — it only rides inside `style()`. [topography.ts](layers/topography.ts) is chart topography from the VersaTiles shortbread tiles (urban extent, airports, boundaries, place and island names), always drawn; [basemap.ts](layers/basemap.ts) is the land context behind the `basemap` mariner preference (roads and railways, minor streets, buildings, landcover, street names), styled to sit below every piece of chart content.

Layer geometry comes from the `seamark` and `light` layers of the seamap tiles; the symbols come from the sprite sheet, and because icon names are composed from tag values the two must move together.

The symbology derives from `styles/freenauticalchart.json` in [signalk-seamap-plugin] (CC0), which in turn draws the sprite set from [quantenschaum/mapping]. Positioning conventions — tight-cropped icons anchored and offset in the style rather than padded in the sheet — follow that project's own `vector/styles/s57.json`.

[quantenschaum/mapping]: https://github.com/quantenschaum/mapping
[signalk-seamap-plugin]: https://github.com/prozessor13/signalk-seamap-plugin

## Versioning

Semver tracks the consumer-facing contract: renaming or reordering layer ids, changing the icon naming scheme, or removing icons is major; new layers or icons are minor; visual tweaks are patch.

## License

GPL-3.0. The chart symbols are adapted from [quantenschaum/mapping](https://github.com/quantenschaum/mapping) with permission, and the POI badges are built from permissively licensed glyph sets — see [sprites/PROVENANCE.md](sprites/PROVENANCE.md).
