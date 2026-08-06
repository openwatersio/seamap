# Improving chart data

The chart is drawn entirely from [OpenStreetMap](https://www.openstreetmap.org), so the way to fix the chart is to fix the map: edit in [iD](https://www.openstreetmap.org/edit) or JOSM, and your changes appear with the next weekly build.

The chart renders `seamark:*` tags plus many ordinary OSM tags (`leisure=marina`, `waterway=fuel`, `leisure=slipway`, `natural=beach`, …), so a facility mapped with everyday tagging shows up without any seamark-specific work.

## References

- [Seamark objects](https://wiki.openstreetmap.org/wiki/Seamarks/Seamark_Objects) — the tagging reference for buoys, beacons, lights, and everything else charted.
- [OpenSeaMap editing handbook](https://wiki.openstreetmap.org/wiki/OpenSeaMap) — background on mapping for nautical charts.

## Checking what the chart sees

Not sure whether something is tagged right? The [viewer](https://openwatersio.github.io/seamap/)'s inspect control (top right) toggles a debug view that shows every attribute of the feature under your cursor — the tiles carry the OSM tags verbatim.

Something tagged correctly but drawn wrong, or not drawn at all? That's a bug here, not in OSM — [open an issue](https://github.com/openwatersio/seamap/issues) with a permalink to the spot.
