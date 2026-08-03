# freenauticalchart sprites — GPL-3.0

Chart symbols by Adam Lucke, from [quantenschaum/mapping] (the codebase behind
[freenauticalchart.net]). **GPL-3.0** — see `LICENSE` here, not the MIT at the
repo root. Credited in the viewer's attribution control.

We ship them as GPL-3.0 deliberately, as a stopgap, until a purpose-drawn set
replaces them.

## The chain

Upstream `icons/*.svg` are expanded by `scripts/genicons.py` into 11,107
generated SVGs, published on that repo's `icons` branch as paths like
`2_cones_up/horizontal/black_red.svg`. This sheet is that set rasterized to 64px:
7,958 of its 8,714 keys are those paths verbatim, and the remainder are
`TOPSHP/20/…` style names that upstream creates as symlinks
(`ln -sr TOPSHP/19 TOPSHP/20`), so a rasterizer following links emits them while
the git tree doesn't list them separately.

It reached us through [signalk-seamap-plugin], which added the packed sheet in
commit `2be1855` (2026-02-14) with no attribution under a repo-level MIT license
that could not grant rights to it. Upstream's own terms put only the *published
chart tiles* under CC0; the icons are inputs living in the code repository, so
they stay GPL-3.0.

That history also explains the shape of the sheet: 5,462 of the icons are keyed
by S-57 attribute codes (`BCNSHP/`, `BOYSHP/`, `TOPSHP/`, `CATLMK/`) for Adam's
ENC pipeline, and nothing in our OSM-tag style references them. Compass roses and
light-sector arcs are along for the ride too.

## Where Adam's own SVGs came from

The 83 seed SVGs (added 2023-06-11 as `icons/INT1/`, the second commit in that
repo) were not drawn from scratch: all 83 carry PDF-extraction artifacts —
sequential machine-numbered clipPaths, page-coordinate transforms, a shared clip
column of 195 × 749 pt, and residual `Helvetica LT` font references. That
geometry and toolchain (Acrobat Distiller lineage) point at a professionally
typeset chart-symbol publication; given the project renders BSH data, the BSH
*Karte 1 / INT 1* book is the likely source, and NOAA's *U.S. Chart No. 1* is
ruled out by page format. No prior copy exists on GitHub (path-data fingerprint
searches return nothing), so the extraction was Adam's own.

The set has since been substantially redrawn — 63 commits over 2.5 years, most
files last saved from Inkscape — but 77 of the 172 current sources still contain
the extracted structure. INT-1 symbols are IHO-standardized functional shapes,
so how much copyright the seed artwork carries is genuinely unclear; it is a
soft spot upstream of Adam's GPL grant that his license cannot repair. Worth
raising if we ever contact him about licensing.

## How we build it now

We vendor upstream's SVG sources and generator rather than a packed sheet, so the
GPL's corresponding source sits in the repo instead of a rasterized derivative.
See `README.md` here; `bin/sprites` copies this file and `LICENSE` next to the
sheet it generates.

[quantenschaum/mapping]: https://github.com/quantenschaum/mapping
[freenauticalchart.net]: https://freenauticalchart.net/
[signalk-seamap-plugin]: https://github.com/prozessor13/signalk-seamap-plugin
