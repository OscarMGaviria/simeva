import { ref, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export const CENTER  = [-75.5636, 6.2442]
export const ZOOM    = 7
export const BASEMAPS = [
  {
    id: 'estandar', label: 'Estándar', color: '#a8c5a0',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'claro', label: 'Claro', color: '#e8e8e8',
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  },
  {
    id: 'satelite', label: 'Satélite', color: '#3a5a3a',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '© <a href="https://www.esri.com/">Esri</a>',
  },
  {
    id: 'oscuro', label: 'Oscuro', color: '#2d2d2d',
    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  },
  { id: 'ninguno', label: 'Ninguno', color: null, tiles: [], attribution: '' },
]

export function useMapInit(mapContainer, { onMapCreated, onLoad, createPavingLayer, createSignLayer, CAR_ROUTE } = {}) {
  const activeBasemap = ref('ninguno')
  const switcherOpen  = ref(false)
  const terrainActive = ref(false)
  let _map       = null
  let resizeObs  = null

  const getMap = () => _map

  const toggleTerrain = () => {
    if (!_map) return
    terrainActive.value = !terrainActive.value
    if (terrainActive.value) {
      _map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
      if (!_map.getLayer('sky')) {
        _map.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 15,
          },
        })
      }
      _map.easeTo({ pitch: 50, duration: 900 })
    } else {
      _map.setTerrain(null)
      if (_map.getLayer('sky')) _map.removeLayer('sky')
      _map.easeTo({ pitch: 0, duration: 900 })
    }
  }

  const switchBasemap = (basemap) => {
    if (!_map || activeBasemap.value === basemap.id) return
    activeBasemap.value = basemap.id
    switcherOpen.value  = false
    if (basemap.id === 'ninguno') {
      if (_map.getLayer('base-layer')) _map.setLayoutProperty('base-layer', 'visibility', 'none')
    } else {
      if (_map.getLayer('base-layer')) _map.setLayoutProperty('base-layer', 'visibility', 'visible')
      const source = _map.getSource('base')
      if (source) source.setTiles(basemap.tiles)
    }
  }

  onMounted(() => {
    const initial = BASEMAPS[0]

    _map = new maplibregl.Map({
      container: mapContainer.value,
      style: {
        version: 8,
        sources: {
          base: { type: 'raster', tiles: initial.tiles, tileSize: 256, attribution: initial.attribution },
        },
        layers: [
          { id: 'base-layer', type: 'raster', source: 'base', minzoom: 0, maxzoom: 19, layout: { visibility: 'none' } },
        ],
      },
      center: CENTER,
      zoom:   ZOOM,
    })

    onMapCreated?.(_map)

    _map.addControl(new maplibregl.NavigationControl(), 'top-right')
    _map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    _map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right')

    resizeObs = new ResizeObserver(() => { _map?.resize() })
    resizeObs.observe(mapContainer.value)

    _map.on('load', async () => {
      _map.addSource('terrain-dem', {
        type: 'raster-dem',
        url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
        tileSize: 256,
      })

      _map.addSource('car-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: CAR_ROUTE } },
      })
      _map.addLayer({
        id: 'car-route-line', type: 'line', source: 'car-route',
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': '#9ca3af', 'line-width': 7, 'line-opacity': 0.7, 'line-dasharray': [1.5, 1.5] },
      })

      _map.addSource('paved-trail', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [CAR_ROUTE[0], CAR_ROUTE[0]] } },
      })
      _map.addLayer({
        id: 'paved-trail-line', type: 'line', source: 'paved-trail',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#111827', 'line-width': 7, 'line-opacity': 0.95 },
      })

      if (createPavingLayer) _map.addLayer(createPavingLayer())
      if (createSignLayer)   _map.addLayer(createSignLayer())

      await onLoad?.()
    })
  })

  onUnmounted(() => {
    resizeObs?.disconnect()
    _map?.remove()
  })

  return { getMap, activeBasemap, switcherOpen, terrainActive, switchBasemap, toggleTerrain }
}
