import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { style, setup, attribution } from '@openwaters/seamap'
import mlcontour from '../vendor/maplibre-contour.mjs'

// Self-hosted seamap tiles: register the pmtiles protocol; the source `url` is a
// TileJSON manifest MapLibre fetches directly. ?tiles=<url> previews a build.
maplibregl.addProtocol('pmtiles', new Protocol().tile)
const tiles = new URLSearchParams(location.search).get('tiles') || undefined

// mapterhorn land elevation: the DemSource registers maplibre protocols at
// runtime, so its sources are wired up here and handed to style()
const demSource = new mlcontour.DemSource({
    url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
    attribution: '<a href="https://mapterhorn.com/attribution" target="_blank">© Mapterhorn</a>',
    encoding: 'terrarium',
    maxzoom: 12,
    cacheSize: 100,
})
demSource.setupMaplibre(maplibregl)

// add the MapLibre GL RTL text plugin for proper rendering of right-to-left languages
maplibregl.setRTLTextPlugin('https://tiles.versatiles.org/assets/lib/mapbox-gl-rtl-text/mapbox-gl-rtl-text.js', true)

const map = new maplibregl.Map({
    hash: true,
    center: [10.2351, 56.16858],
    zoom: 13.4,
    container: 'map',
    style: style({
        tiles,
        hillshading: {
            type: 'raster-dem',
            tiles: [demSource.sharedDemProtocolUrl],
            encoding: 'terrarium',
            tileSize: 512,
            maxzoom: 12,
        },
        contours: {
            type: 'vector',
            tiles: [demSource.contourProtocolUrl({
                overzoom: 1,
                thresholds: {
                    7: [200, 1000],
                    8: [100, 500],
                    9: [100, 500],
                    10: [50, 200],
                    11: [20, 100],
                    12: [10, 50]
                },
                elevationKey: 'ele',
                levelKey: 'level',
                contourLayer: 'contours'
            })],
            maxzoom: 15,
        },
    }),
    attributionControl: {
        compact: true, // collapsed to the ⓘ toggle by default
        // sprites aren't a source, so their credit can't ride along on one
        customAttribution: attribution
    }
})

// runtime images the style depends on: generic-icon fallback + unsurveyed stipple
setup(map)
