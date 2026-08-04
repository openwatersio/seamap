import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { style, setup, attribution } from '@openwaters/seamap'

// ?tiles=<url> points the chart at another TileJSON — a local `wrangler dev`
// worker, say — instead of the published tiles.
const tiles = new URLSearchParams(location.search).get('tiles') || undefined

// add the MapLibre GL RTL text plugin for proper rendering of right-to-left languages
maplibregl.setRTLTextPlugin('https://tiles.versatiles.org/assets/lib/mapbox-gl-rtl-text/mapbox-gl-rtl-text.js', true)

const map = new maplibregl.Map({
    hash: true,
    center: [10.2351, 56.16858],
    zoom: 13.4,
    container: 'map',
    style: await style({ tiles }),
    attributionControl: {
        compact: true, // collapsed to the ⓘ toggle by default
        // sprites aren't a source, so their credit can't ride along on one
        customAttribution: attribution
    }
})

// runtime images the style depends on: generic-icon fallback + unsurveyed stipple
setup(map)

window.map = map // console/devtools access
