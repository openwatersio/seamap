# Vendored viewer dependencies

## `maplibre-contour.mjs`

The `index.mjs` from [prozessor13/maplibre-contour] release v0.2.8. The upstream
npm package lacks the bathymetry polygon and spot-sounding options the depth
layers depend on, and the fork publishes no installable `dist`.

[prozessor13/maplibre-contour]: https://github.com/prozessor13/maplibre-contour

## `freenauticalchart.style.json`

`styles/freenauticalchart.json` from [signalk-seamap-plugin] — a chart-only
MapLibre style whose seamark and light layers this viewer draws. The style
declares CC0 in its own metadata. Its sprite sheet is built from source by
`bin/sprites` (GPL-3.0 artwork — see `../sprites/README.md`).

Sprite icon names are composed from tag values, so the sheet and the style have
to move together.

Fixes applied on top of upstream, to reapply when re-vendoring:

- `topmarks` built its icon name from `["has", "topmark_color_pattern"]`, putting
  the boolean into the name instead of the pattern. Now reads the value.
- `restricted-areas-fill-pattern` matched every restricted area but has patterns
  only for military and entry/anchoring restrictions, so nature reserves resolved
  to an empty image name. Its filter now matches what it can actually draw.
- `buoys` gets `icon-anchor: bottom` + `icon-offset: [0, 4]`, and `lights` gets
  `icon-anchor: top` + `icon-offset: [0, 2]`. The plugin's packed sheet baked
  these positions into padded canvases; our sheet is tight-cropped like the
  sprite source's own pipeline, which positions in the style exactly this way
  (quantenschaum/mapping `vector/styles/s57.json`).

[signalk-seamap-plugin]: https://github.com/prozessor13/signalk-seamap-plugin
