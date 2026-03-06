<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers, Mountain } from 'lucide-vue-next'
// ── THREE.JS DEMO (eliminar este bloque para revertir) ─────────────────────
import * as THREE from 'three'
// ──────────────────────────────────────────────────────────────────────────

const props = defineProps({
  filters: { type: Object, default: () => ({}) }
})

const mapContainer = ref(null)
const activeBasemap = ref('estandar')
let map = null

// ── THREE.JS DEMO: encuadre centrado en la ruta ────────────────────────────
const CENTER = [-75.5100, 6.1900]
const ZOOM   = 13
// ── ORIGINAL (restaurar al revertir): const CENTER = [-75.5636, 6.2442]; const ZOOM = 8

const BASEMAPS = [
  {
    id: 'estandar',
    label: 'Estándar',
    color: '#a8c5a0',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'claro',
    label: 'Claro',
    color: '#e8e8e8',
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  },
  {
    id: 'satelite',
    label: 'Satélite',
    color: '#3a5a3a',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '© <a href="https://www.esri.com/">Esri</a>',
  },
  {
    id: 'oscuro',
    label: 'Oscuro',
    color: '#2d2d2d',
    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  },
  {
    id: 'ninguno',
    label: 'Ninguno',
    color: null,
    tiles: [],
    attribution: '',
  },
]

const switcherOpen  = ref(false)
const terrainActive = ref(false)

const toggleTerrain = () => {
  if (!map) return
  terrainActive.value = !terrainActive.value
  if (terrainActive.value) {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
    if (!map.getLayer('sky')) {
      map.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 15,
        },
      })
    }
    map.easeTo({ pitch: 50, duration: 900 })
  } else {
    map.setTerrain(null)
    if (map.getLayer('sky')) map.removeLayer('sky')
    map.easeTo({ pitch: 0, duration: 900 })
  }
}

const switchBasemap = (basemap) => {
  if (!map || activeBasemap.value === basemap.id) return
  activeBasemap.value = basemap.id
  switcherOpen.value = false

  if (basemap.id === 'ninguno') {
    if (map.getLayer('base-layer')) map.setLayoutProperty('base-layer', 'visibility', 'none')
  } else {
    if (map.getLayer('base-layer')) map.setLayoutProperty('base-layer', 'visibility', 'visible')
    const source = map.getSource('base')
    if (source) source.setTiles(basemap.tiles)
  }
}

// ── THREE.JS DEMO ──────────────────────────────────────────────────────────
// Ruta aproximada: Medellín (El Poblado) → Aeropuerto Rionegro vía Las Palmas
const CAR_ROUTE = [
  [-75.5765, 6.2220],
  [-75.5580, 6.2100],
  [-75.5350, 6.1970],
  [-75.5100, 6.1840],
  [-75.4850, 6.1720],
  [-75.4600, 6.1650],
  [-75.4400, 6.1610],
  [-75.4275, 6.1580],
]

function lerpRoute(t) {
  const n    = CAR_ROUTE.length - 1
  const safe = ((t % 1) + 1) % 1
  const seg  = Math.min(Math.floor(safe * n), n - 1)
  const lt   = safe * n - seg
  const a    = CAR_ROUTE[seg]
  const b    = CAR_ROUTE[Math.min(seg + 1, n)]
  return [a[0] + (b[0] - a[0]) * lt, a[1] + (b[1] - a[1]) * lt]
}

function calcRouteKm(route) {
  let total = 0
  for (let i = 0; i < route.length - 1; i++) {
    const [ln1, la1] = route[i], [ln2, la2] = route[i + 1]
    const dLat = (la2 - la1) * Math.PI / 180
    const dLng = (ln2 - ln1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    total += 2 * 6371 * Math.asin(Math.sqrt(a))
  }
  return total
}
const ROUTE_KM = calcRouteKm(CAR_ROUTE)

// Estado del letrero de progreso
const kmCovered = ref(0)
const labelLeft = ref(-999)
const labelTop  = ref(-999)

let carProgress   = 0
let trailFrame    = 0
let threeRenderer = null

function createPavingLayer() {
  let _camera, _scene

  return {
    id: 'car-3d',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      _camera = new THREE.Camera()
      _scene  = new THREE.Scene()

      // ── Materiales ──────────────────────────────────────────────────────
      const matY  = new THREE.MeshPhongMaterial({ color: 0xffc200 }) // amarillo CAT
      const matD  = new THREE.MeshPhongMaterial({ color: 0x2d3748 }) // gris oscuro
      const matM  = new THREE.MeshPhongMaterial({ color: 0x718096 }) // metal / screed
      const matT  = new THREE.MeshPhongMaterial({ color: 0x1a202c }) // orugas
      const matX  = new THREE.MeshPhongMaterial({ color: 0x4a5568 }) // escape
      const matG  = new THREE.MeshPhongMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.55 })

      const G = new THREE.Group()

      // ── CHASIS + SUBCHASIS ───────────────────────────────────────────────
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.40, 0.30, 1.05), matY)
      G.add(chassis)
      const subcar = new THREE.Mesh(new THREE.BoxGeometry(2.00, 0.12, 1.16), matD)
      subcar.position.y = -0.20
      G.add(subcar)

      // ── TOLVA DELANTERA (hopper en V) ────────────────────────────────────
      // Pared frontal vertical
      const hFront = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 1.14), matD)
      hFront.position.set(1.28, 0.51, 0)
      G.add(hFront)
      // Pared trasera
      const hBack = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.60, 0.82), matD)
      hBack.position.set(0.56, 0.48, 0)
      G.add(hBack)
      // Ala izquierda (inclinada formando la V)
      const hWingL = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.55), matD)
      hWingL.rotation.x = 0.50
      hWingL.position.set(0.92, 0.55, 0.36)
      G.add(hWingL)
      // Ala derecha
      const hWingR = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.55), matD)
      hWingR.rotation.x = -0.50
      hWingR.position.set(0.92, 0.55, -0.36)
      G.add(hWingR)
      // Marco superior de la tolva
      const hRim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 1.14), matD)
      hRim.position.set(0.92, 0.86, 0)
      G.add(hRim)

      // ── CAPÓ DEL MOTOR (engine hood) ─────────────────────────────────────
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.88), matY)
      hood.position.set(-0.08, 0.54, 0)
      G.add(hood)
      const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.82), matD)
      hoodTop.position.set(-0.08, 0.84, 0)
      G.add(hoodTop)
      // Rejilla frontal del capó
      const grill = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.76), matD)
      grill.position.set(0.30, 0.56, 0)
      G.add(grill)
      // Tubo de escape
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.52, 8), matX)
      exhaust.position.set(-0.24, 1.09, 0.24)
      G.add(exhaust)
      const exhaustCap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.06, 8), matX)
      exhaustCap.position.set(-0.24, 1.36, 0.24)
      G.add(exhaustCap)

      // ── PLATAFORMA Y CABINA DEL OPERADOR ─────────────────────────────────
      const opBase = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.62), matY)
      opBase.position.set(-0.62, 0.46, 0)
      G.add(opBase)
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.10, 0.26), matD)
      seat.position.set(-0.62, 0.60, 0)
      G.add(seat)
      const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.38), matD)
      console_.position.set(-0.42, 0.72, 0)
      G.add(console_)
      // Parabrisas
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.40), matG)
      windshield.position.set(-0.37, 0.76, 0)
      G.add(windshield)
      // Dosel (canopy)
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.66), matY)
      canopy.position.set(-0.62, 1.10, 0)
      G.add(canopy)
      // 4 pilares del dosel
      const pillarGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.60, 6)
      ;[[-0.34, 0.30], [-0.34, -0.30], [-0.90, 0.30], [-0.90, -0.30]].forEach(([px, pz]) => {
        const p = new THREE.Mesh(pillarGeo, matY)
        p.position.set(px, 0.82, pz)
        G.add(p)
      })

      // ── TORNILLO SINFÍN / AUGER (distribuye asfalto frente al screed) ─────
      const auger = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.52, 10), matD)
      auger.rotation.x = Math.PI / 2
      auger.position.set(-0.90, -0.08, 0)
      G.add(auger)
      // Aletas del sinfín (helicoidal simulado con discos inclinados)
      for (let i = 0; i < 6; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.22), matM)
        blade.rotation.z = (i / 6) * Math.PI
        blade.position.set(-0.90, -0.08, -0.58 + i * 0.22)
        G.add(blade)
      }

      // ── REGLA TRASERA (screed) ────────────────────────────────────────────
      const screedBody = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.20, 1.62), matM)
      screedBody.position.set(-1.26, -0.06, 0)
      G.add(screedBody)
      // Tapas laterales
      ;[0.88, -0.88].forEach(sz => {
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.08), matM)
        ep.position.set(-1.24, -0.04, sz)
        G.add(ep)
      })
      // Brazos de arrastre del screed (tow arms)
      ;[0.40, -0.40].forEach(az => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.06), matM)
        arm.position.set(-0.96, -0.02, az)
        G.add(arm)
      })

      // ── ORUGAS ────────────────────────────────────────────────────────────
      const trackGeo = new THREE.BoxGeometry(2.12, 0.18, 0.26)
      ;[0.55, -0.55].forEach(tz => {
        const tr = new THREE.Mesh(trackGeo, matT)
        tr.position.set(0, -0.27, tz)
        G.add(tr)
      })
      // Sprockets (ruedas dentadas en extremos de la oruga)
      const spGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.28, 10)
      ;[1.04, -1.06].forEach(sx => {
        ;[0.55, -0.55].forEach(sz => {
          const sp = new THREE.Mesh(spGeo, matT)
          sp.rotation.x = Math.PI / 2
          sp.position.set(sx, -0.19, sz)
          G.add(sp)
        })
      })
      // Rodillos de apoyo inferiores (5 por lado)
      const rolGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.30, 8)
      for (let i = 0; i < 5; i++) {
        ;[0.55, -0.55].forEach(rz => {
          const rol = new THREE.Mesh(rolGeo, matT)
          rol.rotation.x = Math.PI / 2
          rol.position.set(-0.80 + i * 0.40, -0.31, rz)
          G.add(rol)
        })
      }

      // ── RODILLOS FRONTALES (push rollers — empujan el camión) ─────────────
      const pushGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8)
      ;[0.36, -0.36].forEach(pz => {
        const push = new THREE.Mesh(pushGeo, matM)
        push.position.set(1.38, 0.06, pz)
        G.add(push)
      })
      // Barra de empuje (une los rodillos)
      const pushBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.80), matM)
      pushBar.position.set(1.38, 0.06, 0)
      G.add(pushBar)

      _scene.add(new THREE.AmbientLight(0xffffff, 0.48))
      const sun = new THREE.DirectionalLight(0xffffff, 1.65)
      sun.position.set(100, 160, 80)
      _scene.add(sun)
      const fill = new THREE.DirectionalLight(0xffffff, 0.32)
      fill.position.set(-80, 40, -60)
      _scene.add(fill)
      const side = new THREE.DirectionalLight(0xffffff, 0.18)
      side.position.set(0, 20, 120)
      _scene.add(side)
      _scene.add(G)

      threeRenderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      threeRenderer.autoClear = false
    },

    render(_gl, args) {
      carProgress = (carProgress + 0.0003) % 1

      // Actualizar rastro de asfalto cada 6 frames
      trailFrame = (trailFrame + 1) % 6
      if (trailFrame === 0 && carProgress > 0.001) {
        const steps = Math.max(2, Math.floor(carProgress * 80))
        const coords = []
        for (let i = 0; i <= steps; i++) {
          coords.push(lerpRoute((i / steps) * carProgress))
        }
        map.getSource('paved-trail')?.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
        })

        // Actualizar letrero: km ejecutados + posición en pantalla
        const [lngL, latL] = lerpRoute(carProgress)
        const sp = map.project([lngL, latL])
        const kmActual  = carProgress * ROUTE_KM
        const step      = 0.5
        const lastMark  = Math.floor(ROUTE_KM / step) * step  // último múltiplo de 0.5 antes del final
        const displayKm = kmActual >= lastMark ? kmActual : Math.floor(kmActual / step) * step
        kmCovered.value = +displayKm.toFixed(2)
        labelLeft.value = Math.round(sp.x)
        labelTop.value  = Math.round(sp.y)
      }

      const [lng,  lat]  = lerpRoute(carProgress)
      const [lng2, lat2] = lerpRoute(carProgress + 0.005)

      const merc  = maplibregl.MercatorCoordinate.fromLngLat([lng,  lat],  0)
      const merc2 = maplibregl.MercatorCoordinate.fromLngLat([lng2, lat2], 0)

      // 1 unidad Three.js = 300 metros en el mapa
      const scale = 300 * merc.meterInMercatorCoordinateUnits()

      // Heading: 0 = Este, PI/2 = Norte
      const dx      = merc2.x - merc.x
      const dy      = merc.y  - merc2.y   // invertido: Mercator Y crece hacia el sur
      const heading = Math.atan2(dy, dx)

      const rotX    = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2)
      const rotHead = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), heading)

      const l = new THREE.Matrix4()
        .makeTranslation(merc.x, merc.y, merc.z)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(rotX)
        .multiply(rotHead)

      // Matriz de proyección de MapLibre (compatible v3+)
      const rawMatrix = args?.defaultProjectionData?.mainMatrix ?? args
      const m = new THREE.Matrix4().fromArray(rawMatrix)

      _camera.projectionMatrix = m.multiply(l)
      threeRenderer.resetState()
      threeRenderer.render(_scene, _camera)
      map.triggerRepaint()
    },
  }
}
// ── END THREE.JS DEMO ──────────────────────────────────────────────────────

onMounted(() => {
  const initial = BASEMAPS[0]

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: {
        base: {
          type: 'raster',
          tiles: initial.tiles,
          tileSize: 256,
          attribution: initial.attribution,
        }
      },
      layers: [
        { id: 'base-layer', type: 'raster', source: 'base', minzoom: 0, maxzoom: 19 }
      ]
    },
    center: CENTER,
    zoom: ZOOM,
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
  map.addControl(
    new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
    'top-right'
  )

  // ── THREE.JS DEMO ─────────────────────────────────────────────────────
  map.on('load', () => {
    // Fuente DEM para relieve 3D
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
      tileSize: 256,
    })

    // Línea de la ruta en verde
    map.addSource('car-route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: CAR_ROUTE },
      },
    })
    // Ruta sin pavimentar: línea gris punteada
    map.addLayer({
      id: 'car-route-line',
      type: 'line',
      source: 'car-route',
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': '#9ca3af',
        'line-width': 7,
        'line-opacity': 0.7,
        'line-dasharray': [1.5, 1.5],
      },
    })

    // Rastro de asfalto recién puesto (crece con la máquina)
    map.addSource('paved-trail', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [CAR_ROUTE[0], CAR_ROUTE[0]] },
      },
    })
    map.addLayer({
      id: 'paved-trail-line',
      type: 'line',
      source: 'paved-trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#111827',
        'line-width': 7,
        'line-opacity': 0.95,
      },
    })

    // Máquina pavimentadora 3D
    map.addLayer(createPavingLayer())
  })
  // ── END THREE.JS DEMO ─────────────────────────────────────────────────
})

onUnmounted(() => {
  threeRenderer?.dispose()   // ← THREE.JS DEMO (quitar al revertir)
  map?.remove()
})

watch(() => props.filters, () => {}, { deep: true })
</script>

<template>
  <div class="map-wrapper">
    <!-- Fondo menta cuando no hay mapa base -->
    <div class="map-container" :class="{ 'bg-mint': activeBasemap === 'ninguno' }" ref="mapContainer" />

    <!-- Letrero de km ejecutados sobre la máquina -->
    <div
      class="machine-label"
      :style="{ left: labelLeft + 'px', top: labelTop + 'px' }"
      v-show="labelLeft > 0"
    >
      <span class="ml-km">{{ kmCovered.toFixed(2) }} km</span>
      <span class="ml-sub">pavimentados</span>
    </div>

    <!-- Botón relieve 3D -->
    <button
      class="terrain-toggle"
      :class="{ 'is-active': terrainActive }"
      @click="toggleTerrain"
      title="Relieve 3D"
    >
      <Mountain :size="16" />
    </button>

    <!-- Selector de mapa base -->
    <div class="basemap-switcher">

      <!-- Panel colapsable (arriba del toggle) -->
      <Transition name="panel">
        <div v-if="switcherOpen" class="switcher-panel">
          <button
            v-for="bm in BASEMAPS"
            :key="bm.id"
            class="basemap-btn"
            :class="{ 'is-active': activeBasemap === bm.id }"
            @click="switchBasemap(bm)"
          >
            <span
              class="bm-swatch"
              :class="{ 'bm-swatch--none': bm.id === 'ninguno' }"
              :style="bm.color ? { background: bm.color } : {}"
            />
            <span class="bm-label">{{ bm.label }}</span>
          </button>
        </div>
      </Transition>

      <!-- Toggle (solo icono) — siempre abajo -->
      <button
        class="switcher-toggle"
        @click="switcherOpen = !switcherOpen"
        :class="{ 'is-open': switcherOpen }"
        title="Mapa base"
      >
        <Layers :size="16" />
      </button>

    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  flex: 1;
  min-width: 0;
  height: 100%;
  position: relative;
}

.map-container {
  width: 100%;
  height: 100%;
  transition: background-color 0.4s ease;
}

.map-container.bg-mint {
  background-color: #e8f4ed;
}

/* ── Letrero de progreso de pavimentación ── */
.machine-label {
  position: absolute;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  background: #ffffff;
  border: 2px solid #0b5640;
  border-radius: 10px;
  padding: 5px 12px 4px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.18);
  transform: translate(-50%, calc(-100% - 18px));
}

/* Triángulo apuntando hacia la máquina */
.machine-label::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 7px solid transparent;
  border-top-color: #0b5640;
}
.machine-label::before {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-2px);
  border: 6px solid transparent;
  border-top-color: #ffffff;
  z-index: 1;
}

.ml-km {
  font-family: 'Prompt', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #0b5640;
  line-height: 1.1;
}

.ml-sub {
  font-family: 'Prompt', sans-serif;
  font-size: 10px;
  font-weight: 400;
  color: #6b7280;
  line-height: 1;
}

/* ── Terrain toggle ── */
.terrain-toggle {
  position: absolute;
  bottom: 80px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  color: #6b7280;
  outline: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.terrain-toggle:hover {
  background: #f3f4f6;
  border-color: #cbd5e1;
  color: #374151;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
}

.terrain-toggle.is-active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

/* ── Basemap switcher ── */
.basemap-switcher {
  position: absolute;
  bottom: 36px;
  right: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.switcher-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  padding: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  color: #6b7280;
  outline: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.switcher-toggle:hover {
  background: #f3f4f6;
  border-color: #cbd5e1;
  color: #374151;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
}

.switcher-toggle.is-open {
  border-color: #16a34a;
  background: #f0fdf4;
  color: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
}

.switcher-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.14),
    0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 6px;
  min-width: 148px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transform-origin: bottom right;
}

.basemap-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 1.5px solid transparent;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  width: 100%;
  text-align: left;
  outline: none;
}

.basemap-btn:hover { background: #f3f4f6; }

.basemap-btn.is-active {
  background: #f0fdf4;
  border-color: #16a34a;
}

.bm-swatch {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.bm-swatch--none {
  background:
    repeating-conic-gradient(#d1d5db 0% 25%, #ffffff 0% 50%)
    0 0 / 8px 8px;
}

.bm-label {
  font-size: 13px;
  font-family: 'Prompt', sans-serif;
  color: #374151;
}

.basemap-btn.is-active .bm-label {
  color: #166534;
  font-weight: 500;
}

/* ── Animación: abre hacia arriba con spring ── */
.panel-enter-active {
  transition:
    opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.panel-leave-active {
  transition:
    opacity 0.18s cubic-bezier(0.4, 0, 1, 1),
    transform 0.18s cubic-bezier(0.4, 0, 1, 1);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.88);
}

/* ── Controles MapLibre ── */
:deep(.maplibregl-ctrl-group) {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

:deep(.maplibregl-ctrl-group button) {
  background: #ffffff;
  border: none;
  border-radius: 0;
  padding: 0;
  transition: background 0.15s;
  outline: none;
}

:deep(.maplibregl-ctrl-group button:hover) {
  background: #f3f4f6;
}

:deep(.maplibregl-ctrl-attrib) {
  font-size: 10px;
  font-family: 'Prompt', sans-serif;
}

:deep(.maplibregl-ctrl-scale) {
  border-color: #0b5640;
  color: #0b5640;
  font-family: 'Prompt', sans-serif;
  font-size: 10px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 3px;
  padding: 1px 4px;
}
</style>
