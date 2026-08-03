# Chart symbol sources

`bin/sprites` (in this package, also reachable as the repo's `bin/sprites`)
turns these into `dist/` here (generated, gitignored). Run it after changing
anything here; the viewer's vite build only copies what's already built, and
`npm publish` runs it via `prepublishOnly`.

    bin/sprites

Needs `spreet`, pinned in `mise.toml` — `mise install`. The generator is Python
stdlib only.

## What's vendored

From [quantenschaum/mapping] at `96b1104`, **GPL-3.0** — see `LICENSE` and
`PROVENANCE.md`, which the build copies next to the sheet it produces:

- `icons/*.svg` — 172 maintained symbols (seeded from a chart-symbol
  publication and progressively redrawn — see `PROVENANCE.md`)
- `genicons.py`, `s57.py` — expand each symbol over every colour and pattern
  combination, ~12,700 SVGs into `icons/gen/`

The packing recipe is upstream's own (`vector/makefile` there): spreet at
`--ratio 2`/`--ratio 4` with the index's `pixelRatio` relabelled one step down,
so symbols draw at twice their source units — the scale the style's `icon-size`
values are written against. Two departures from upstream:

- The S-57-keyed icons (`BCNSHP/`, `BOYSHP/`, `TOPSHP/`, `CATLMK/`) are dropped;
  they address ENC attribute codes our OSM tiles don't carry.
- Icons the style uses as a fill pattern are padded into a 32-unit repeat cell
  first. MapLibre tiles pattern images edge to edge, so tight-cropped hatch
  marks read as a solid mass; upstream never hits this because its own style
  doesn't hatch restricted areas.

Positioning is the style's job, not the sheet's: buoy/beacon artwork keeps its
charted position 2 source units above the artwork bottom (the `basepoint`
circle in the sources), which the style meets with `icon-anchor: bottom` +
`icon-offset: [0, 4]`, and light flares hang from `icon-anchor: top` — the same
convention as upstream's `vector/styles/s57.json`.

## Re-vendoring

Copy `icons/` and the two scripts from a newer upstream revision, note the commit
above, run `bin/sprites`, and check a busy area in the viewer — upstream redraws
symbols, and their proportions are what the style is tuned against.

[quantenschaum/mapping]: https://github.com/quantenschaum/mapping
