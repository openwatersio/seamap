# Contributing

> [!NOTE]
> This is a guide to contributing code for this project for humans and AI agents. If you want to improve the data on the chart, see [improving chart data](docs/OSM.md).

This project is:

- [./src](./src) - a [Planetiler](https://github.com/onthegomap/planetiler) profile that converts OpenStreetMap `seamark:*` data and other data relevant to marine navigation into PMTiles vector tiles.
- [./style](./style) - a MapLibre style, VersaTiles base map + Seascape bathymetry + chart symbology + sprite sheet, published as [@openwaters/seamap](https://www.npmjs.com/package/@openwaters/seamap) npm module
- [./viewer](./viewer/) - a MapLibre GL viewer for the style, deployed to [GitHub Pages](https://openwatersio.github.io/seamap/)
- [./worker](./worker/) - the Cloudflare Worker serving `tiles.openwaters.io/seamap/*` — TileJSON, style.json, tiles, sprites, the taginfo project file, and versioned archive downloads.

Planned work is tracked in [issues](https://github.com/openwatersio/seamap/issues).

How the chart looks is governed by the [design guidelines](docs/design/README.md). Any change to the style, zoom rules, symbol visibility, or portrayal must consult and adhere to them — the invariants settle symbol arguments, and every deliberate departure from the chart standards is recorded there so it doesn't get "fixed" back.

## Getting Started

Tool versions are pinned in `mise.toml`: Java 21 (Planetiler targets 21 and Gradle 8 won't run on newer JDKs), Gradle, Node, and `spreet` for sprite packing. Install [mise](https://mise.jdx.dev) and run:

```bash
mise install   # java, gradle, node, spreet — pinned in mise.toml
bin/setup      # npm install, sprite build, compile, test
```

CI provisions the same versions with `setup-java` and `mise-action`, and runs the same `bin/*` entrypoints described below — keep docs, `bin/`, and `.github/workflows/ci.yml` in sync when changing the build.

### Building the tiles

```bash
bin/run --area=monaco --force      # small build for a quick check
```

- Output is **always** `data/seamarks.pmtiles` — the profile hardcodes it (`overwriteOutput`), so the `--output` flag is ignored.
- Java sources stay in the default package (no `package` declarations) — keep new classes consistent or introduce a package deliberately.
- GeoTools (a planetiler-core dependency) is not on Maven Central — `build.gradle` adds the OSGeo repo. Don't remove it.
- The first run downloads the ~600MB global land polygon shapefile from `osmdata.openstreetmap.de`. The built-in downloader has no retry; if it flakes, fetch it yourself the way CI does (`curl --retry 5` + unzip into `data/`, see `ci.yml`).
- Rock/wreck depths need a bathymetry source: `--depth=` takes a Terrarium-encoded PMTiles file or a `{z}/{x}/{y}` tile URL template. Production uses Seascape's live tiles (see `bin/build-planet`).
- Bigger areas need more memory and disk-backed storage: `JAVA_OPTS=-Xmx20g bin/run --area=germany --storage=mmap --nodemap-type=array --force`.
- Full planet: `bin/build-planet` — about an hour on a 128GB-RAM NVMe box. You almost never run this by hand; the weekly workflow does it (see Releases).

## Planetiler profile

Key files (Java sources are in the default package, `src/main/java/`):

- `Seamap.java` — Planetiler `Profile`; `processFeature` (seamarks, land, water, sea areas, wetland, waterway) and `postProcessTileFeatures`, which cuts all water out of land so Seascape's bathymetry shows through (the `water` layer stays for names only).
- `Seamark.java` — OSM tag → seamark attribute extraction; IALA buoyage defaults; S-57 light abbreviation (`Fl(3).WRG.10s15m12M`).
- `Lights.java` — light-sector arc/ray geometry generation.
- `LandPolygons.java` — downloads + reads the global land shapefile.
- `DepthCalculator.java` — looks up depth for rocks/wrecks from a Terrarium DEM (`--depth=`); needs the `imageio-webp` runtime dep.
- `SeamarkZoomRules.java` — per-type min-zoom rules; derivation and recorded departures in [docs/design/zoom.md](docs/design/zoom.md).

Output layers: `seamark`, `land`, `water`, `sea_area`, `wetland`, `waterway`, `light`. **Bathymetry is NOT in these tiles** — depth shading, contours, and soundings come from the Seascape tiles via `@openwaters/seascape`. The style still pulls the base map and land elevation from third-party infra (VersaTiles). Label glyphs come from `https://tiles.openwaters.io/fonts`, built by [tile-fonts](https://github.com/openwatersio/tile-fonts).

### Documenting the tags it reads

The OSM tags the chart reads are published as a [taginfo project file](https://wiki.openstreetmap.org/wiki/Taginfo/Projects), so a mapper looking up `seamark:buoy_lateral:colour` or `leisure=slipway` sees that this chart renders it. The list is `worker/src/taginfo.ts`, served at `tiles.openwaters.io/seamap/taginfo.json` and registered in [taginfo/taginfo-projects](https://github.com/taginfo/taginfo-projects) — that URL lives in someone else's repo, so moving it costs an upstream PR.

Teach the profile a new tag, or filter on a raw OSM key in the style, and `npm test --workspace style` fails until it's described there. The check reads the profile's Java and walks the built style, but it only compares keys and values: it can't tell you a description has stopped matching what the chart draws, and it won't notice a tag the chart no longer reads.

It also can't see the keys composed at runtime — `seamark:<type>:colour` for a type known only from the data. Those show up in the published archive's metadata instead, which Planetiler fills with every attribute it wrote. `bin/audit-tags.ts` diffs that list against the documented one and ranks what's missing. It's a report rather than a check, and stays out of CI on purpose: the list moves when OSM data moves, so a mapper inventing a tag must never fail someone's PR.

## Local development

```bash
npm run dev --workspace viewer     # http://localhost:5173
```

One server: Vite serves the viewer and runs the tile Worker in-process (the [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) runs it in workerd), so the Worker's endpoints are same-origin under `/seamap/*` and Worker code edits hot-reload.

Sprites are generated, not committed — `bin/setup` builds them; re-run `bin/sprites` after changing sprite sources (how the sheet is built lives in [style/README.md](style/README.md#sprites)).

The dev viewer shows the _published_ production tiles. To preview a build you just made, seed it into the Worker's local R2 simulation and point the viewer at it:

```bash
bin/run --area=malta --force       # → data/seamarks.pmtiles
npm run seed --workspace worker    # copy that build into the local R2 sim (re-run after every rebuild; live on refresh)
npm run dev --workspace viewer
```

Then open `http://localhost:5173/?tiles=/seamap/tiles.json#12/35.90/14.45`. The `#zoom/lat/lon` hash matters in practice: the viewer centres on Aarhus, so a regional build without one looks like an empty failure. `#12/35.90/14.45` is Malta, `#12/45.07/13.64` Croatia.

Two debugging tools worth knowing: the viewer's inspect control (top right) shows every tile attribute of the feature under the cursor, and `http://localhost:5173/styleguide.html` browses the generated sprite sheet with a pixel-grid inspector.

## Checks

CI runs all of these on every push; run the relevant ones before pushing:

| Check                         | Command                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| Java compile + tests + format | `bin/setup`                                                       |
| Java format (fix)             | `./gradlew spotlessApply`                                         |
| JS/TS lint                    | `npm run lint`                                                    |
| JS/TS format (fix)            | `npm run format`                                                  |
| Style package tests           | `npm test --workspace style`                                      |
| Worker types + tests          | `npm run check --workspace worker && npm test --workspace worker` |
| Viewer builds                 | `npm run build --workspace viewer`                                |

## Releases

Three release tracks, all cheap:

### Tiles (weekly, automatic)

`.github/workflows/build-planet.yml` runs every Monday 03:00 UTC: boots an ephemeral Hetzner box, builds the planet, uploads an immutable `seamap/<date>.pmtiles` to R2, and flips the `seamap/latest` pointer the Worker reads. Live within ~2 minutes of the flip; the box is always destroyed.

- Out-of-cycle build: dispatch the workflow manually (an `area` input does a cheap smoke build that doesn't touch `latest`).
- Rollback: dispatch `.github/workflows/repoint-latest.yml` with a previous version — pointer flip only, no rebuild.

### Worker and viewer (ride the planet build)

The Worker (`deploy-worker.yml`) and the GitHub Pages viewer (`pages.yml`) deploy when a planet build publishes, not on push — so a style change that depends on a profile change ships together with the tiles that carry it. Merging to `main` stages changes; the next build (or a manual dispatch of either workflow, for a fix that can't wait) makes them live against the published tiles.

### Previews

Every PR — and every push to `main` — touching `worker/`, `viewer/`, or `style/` uploads preview versions to Cloudflare (`preview.yml`), so what's staged for the next planet build is always viewable. No production traffic. The run summary links a viewer preview (the branch's style against published tiles) and a Worker preview URL; the combined link (`?tiles=...`) exercises both. Previews serve the published `latest` tiles, so tile-schema changes aren't visible in them until a planet build runs.

### npm package + GitHub release (tag-driven)

When `@openwaters/seamap` has accumulated changes worth shipping:

1. Bump `version` in `style/package.json` per the [versioning policy](style/README.md#versioning) — layer ids and icon naming are the contract.
2. Commit, then `git tag v<version> && git push origin main --tags`.
3. `.github/workflows/release-style.yml` does the rest: verifies the tag matches the package version, runs the style tests, publishes to npm (sprites rebuilt via `prepublishOnly`, provenance via trusted publishing), and creates the GitHub release with generated notes — edit them afterwards if the commit list needs a consumer-facing summary.
