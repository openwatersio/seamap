# Sprite provenance

The chart symbols are adapted from Adam Lucke's [quantenschaum/mapping], used with his permission.

## POI badges

The `poi-*` sprites are composed at build time by `bin/poi-badges` from four glyph sets, consumed as `@iconify-json/*` npm packages:

| Set                                                  | Licence |
| ---------------------------------------------------- | ------- |
| [Maki](https://github.com/mapbox/maki)               | CC0-1.0 |
| [Temaki](https://github.com/rapideditor/temaki)      | CC0-1.0 |
| [Pinhead](https://icon-sets.iconify.design/pinhead/) | CC0-1.0 |
| [Tabler](https://github.com/tabler/tabler-icons)     | MIT     |

Tabler is © Paweł Kuna; `LICENSE-MIT-tabler` ships beside the sheet. Each glyph is recoloured white, scaled to a 9-unit box and re-centred on its ink bounds; the halo and disc around it are generated geometry.

[quantenschaum/mapping]: https://github.com/quantenschaum/mapping
