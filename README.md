# Seamap — open nautical charts

Free nautical charts for the whole planet, built from [OpenStreetMap](https://www.openstreetmap.org) seamark data and rebuilt weekly. Part of [Open Waters](https://openwaters.io).

**[View the chart →](https://openwatersio.github.io/seamap/)**

![Chart of the German Bight](sh.png)

The chart shows what you'd expect from a paper chart, drawn live from open data: buoys and beacons with IALA colours and topmarks, lights with sector arcs and characteristics (`Fl(3)WRG.10s`), depth shading, contours and spot soundings, rocks, wrecks and obstructions, traffic separation schemes, anchorages and restricted areas, marinas, slipways and shore facilities.

## Use the tiles

Everything is served from `tiles.openwaters.io` and free to use with OSM attribution:

- **TileJSON:** `https://tiles.openwaters.io/seamap/tiles.json` — vector tiles, zoom 0–14.
- **Ready-made style:** `https://tiles.openwaters.io/seamap/style.json` — the complete chart (base map, bathymetry, symbology) for any MapLibre GL client.
- **npm package:** [`@openwaters/seamap`](style/README.md) — the style as a library, composable with your own layers.
- **Whole-planet download:** each build is a dated, immutable archive at `https://tiles.openwaters.io/seamap/<YYYY-MM-DD>.pmtiles` for offline use.

Bathymetry (depth shading, contours, soundings) comes from the companion [Seascape](https://github.com/openwatersio/seascape) project, which mosaics GEBCO with higher-resolution regional surveys (NOAA, EMODnet, and more).

## Contributing

- To improve the chart data (add a missing buoy, fix a mislabeled harbour), see [improving chart data](docs/OSM.md).
- To improve how data is displayed on the chart (symbology, rendering, tooling), see [CONTRIBUTING.md](CONTRIBUTING.md).

## Data sources

| Source                                                            | Used for                       | License                 |
| ----------------------------------------------------------------- | ------------------------------ | ----------------------- |
| [OpenStreetMap](https://www.openstreetmap.org/copyright)          | seamarks, coastline, waterways | ODbL                    |
| [Seascape](https://github.com/openwatersio/seascape)              | bathymetry                     | per-source, see project |
| [VersaTiles](https://versatiles.org)                              | base map, glyphs               | ODbL data, free tiles   |
| [quantenschaum/mapping](https://github.com/quantenschaum/mapping) | chart symbol artwork           | GPL-3.0 © Adam Lucke    |

## License

Code is [MIT](LICENSE.md). The sprite artwork is GPL-3.0 (see `style/sprites/PROVENANCE.md`). Chart data is not included in this repo; each source above carries its own license and attribution requirements.

This project is a fork of [prozessor13/seamap](https://github.com/prozessor13/seamap), whose profile and style it grew from.
