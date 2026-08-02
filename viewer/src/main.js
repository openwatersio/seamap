import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { colorful } from '@versatiles/style'
import { Protocol } from 'pmtiles'
import { day, sources, layers } from '@openwaters/seascape'
import mlcontour from '../vendor/maplibre-contour.mjs'
import chartStyle from '../vendor/freenauticalchart.style.json'

// Self-hosted seamap tiles: register the pmtiles protocol; the source `url` is a
// TileJSON manifest MapLibre fetches directly. ?tiles=<url> previews a build.
maplibregl.addProtocol('pmtiles', new Protocol().tile)
const tilesUrl = new URLSearchParams(location.search).get('tiles')
    || 'https://tiles.openwaters.io/seamap/latest.json'

const style = colorful({
    baseUrl: 'https://tiles.versatiles.org',
    language: 'en',
    colors: { label: '#000' },
    recolor: { saturate: -0.3 },
});
// chart symbols, served from the viewer alongside the style that names them
style.sprite.push({
    id: 'freenauticalchart',
    url: new URL('sprites/freenauticalchart', document.baseURI).href
});
// self-hosted seamap vector tiles (TileJSON manifest → pmtiles)
style.sources.seamap = {
    type: 'vector',
    url: tilesUrl,
};
// add mapterhorn hillshading & contour sources
var demSource = new mlcontour.DemSource({
    url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
    attribution: '<a href="https://mapterhorn.com/attribution" target="_blank">© Mapterhorn</a>',
    encoding: "terrarium",
    maxzoom: 12,
    cacheSize: 100,
});
demSource.setupMaplibre(maplibregl);
style.sources.hillshading = {
    type: 'raster-dem',
    tiles: [demSource.sharedDemProtocolUrl],
    encoding: "terrarium",
    tileSize: 512,
    maxzoom: 12
};
style.sources.contours = {
    type: 'vector',
    tiles: [ demSource.contourProtocolUrl({
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
    maxzoom: 15
};

// Seascape bathymetry: depth shading, depth areas, contours, soundings.
// Sources + layer groups come from @openwaters/seascape; unit/safety changes
// at runtime go through its applyState().
Object.assign(style.sources, sources({ tilesBase: 'https://tiles.openwaters.io/seascape' }))
const bathymetry = layers({ ...day, font: ['noto_sans_regular'] }) // versatiles glyph names are lowercase
bathymetry.find(l => l.id === 'hillshade').layout.visibility = 'visible' // library defaults it off

// Chart symbology comes from the vendored freenauticalchart style; take only its
// seamark and light layers, since land and bathymetry are drawn from VersaTiles
// and Seascape here. Upstream puts sea areas below its land layers and all the
// symbology above, so split on those to preserve the intended draw order.
const isSeamark = l => ['seamark', 'light'].includes(l['source-layer'])
const chartLandIndex = chartStyle.layers.findIndex(l => l['source-layer'] === 'land')
const chartAreas = chartStyle.layers.slice(0, chartLandIndex).filter(isSeamark)
const chartSymbols = chartStyle.layers.slice(chartLandIndex).filter(isSeamark)
for (const { layout } of [...chartAreas, ...chartSymbols]) {
    const font = layout?.['text-font']
    if (font) layout['text-font'] = font.map(f => f.toLowerCase().replaceAll(' ', '_')) // versatiles glyph names
}

// draw sea
style.layers.splice(0, 2, {
    "id": "background",
    "type": "background",
    "paint": {"background-color": "#e9f7ff"}
}, ...bathymetry, ...chartAreas, {
    "id": "land_outline",
    "source": "seamap",
    "source-layer": "land",
    "type": "line",
    "paint": {"line-color": "#3d3d3d", "line-width": 3, "line-opacity": 0.8}
}, {
    "id": "land_area",
    "source": "seamap",
    "source-layer": "land",
    "type": "fill",
    "paint": {"fill-color": "#fdf1d2"}
});

// draw hillshading
style.layers.splice(style.layers.findIndex(l => l.id == 'land-wetland') + 1, 0, {
    "id": 'hillshading',
    "type": 'hillshade',
    "source": 'hillshading',
    "paint": {
        'hillshade-exaggeration': 0.2,
        'hillshade-method': 'combined'
    }
}, {
    "id": 'contours',
    "type": 'line',
    "source": 'contours',
    'source-layer': 'contours',
    "filter": [ '>', ['get', 'ele'], 0],
    "paint": {
        'line-opacity': 0.3,
        'line-width': ['match', ['get', 'level'], 1, 0.5, 0.2]
    }
}, {
    "id": 'contour-label',
    "type": 'symbol',
    "source": 'contours',
    'source-layer': 'contours',
    "filter": ['>', ['get', 'ele'], 0],
    "minzoom": 10,
    "paint": {
        'text-halo-color': 'white',
        'text-halo-width': 0.8,
        'text-opacity': 0.3,
    },
    "layout": {
        'symbol-placement': 'line',
        'text-size': 8,
        'text-field': ['number-format', ['get', 'ele'], {}],
        'text-font': ['noto_sans_bold']
    }
});

// draw seamarks: buoys, lights, topmarks, landmarks, labels
style.layers = style.layers.concat(...chartSymbols);

// versatiles' opaque water-polygon fills (estuaries, rivers, docks) paint over the
// bathymetry. Move them *below* it and restyle as a stipple, so they only show
// through where there's no depth data — the chart cue for unsurveyed water.
const waterFillIds = ['water-area', 'water-area-river', 'water-area-small'];
const unsurveyed = style.layers.filter(l => waterFillIds.includes(l.id));
style.layers = style.layers.filter(l => !waterFillIds.includes(l.id));
unsurveyed.forEach(l => l.paint = { 'fill-pattern': 'unsurveyed' });
style.layers.splice(1, 0, ...unsurveyed); // index 1: just above `background`, below bathymetry

// add the MapLibre GL RTL text plugin for proper rendering of right-to-left languages
maplibregl.setRTLTextPlugin('https://tiles.versatiles.org/assets/lib/mapbox-gl-rtl-text/mapbox-gl-rtl-text.js', true);

// start the map with the generated VersaTiles style
var map = new maplibregl.Map({
    hash: true,
    center: [10.2351, 56.16858],
    zoom: 13.4,
    container: 'map',
    style,
    attributionControl: {
        compact: true, // collapsed to the ⓘ toggle by default
        // sprites aren't a source, so their credit can't ride along on one
        customAttribution: 'Chart symbols <a href="https://github.com/quantenschaum/mapping" target="_blank">© Adam Lucke</a> (GPL-3.0)'
    }
});

// Buoy, topmark and light icon names are built from tag values, and the sprite
// sheet carries only the colour combinations charts normally use. Substitute the
// shape's generic icon for anything else, so an unusual colour on a real mark
// never renders as nothing at all.
map.on('styleimagemissing', ({ id }) => {
    const generic = id.replace(/^(freenauticalchart:[^/]+)\/.*/, '$1/generic');
    const fallback = generic === id ? null : map.getImage(generic);
    if (fallback) map.addImage(id, fallback.data, { pixelRatio: fallback.pixelRatio, sdf: fallback.sdf });
});

// register the 'unsurveyed' stipple: faint blue base + one sparse dot,
// the chart cue for water with no depth data
map.on('load', () => {
    const px = 12, cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#d6ebfa';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = 'rgba(60,120,170,0.7)';
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, 1.1, 0, 7);
    ctx.fill();
    map.addImage('unsurveyed', ctx.getImageData(0, 0, px, px), { pixelRatio: 1 });
});
