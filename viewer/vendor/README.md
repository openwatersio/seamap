# Vendored viewer dependencies

## `maplibre-contour.mjs`

The `index.mjs` from [prozessor13/maplibre-contour] release v0.2.8. The upstream
npm package lacks the bathymetry polygon and spot-sounding options the depth
layers depend on, and the fork publishes no installable `dist`.

[prozessor13/maplibre-contour]: https://github.com/prozessor13/maplibre-contour

Chart symbology (style layers + sprites) lives in the `@openwaters/seamap`
package — see `../../style/README.md`.
