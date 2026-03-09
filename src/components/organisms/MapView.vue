<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers, Mountain } from 'lucide-vue-next'
import { getLocalizaciones, getMunicipios, parseDescription, extractKm } from '../../services/api.js'
// ── THREE.JS DEMO (eliminar este bloque para revertir) ─────────────────────
import * as THREE from 'three'
// ──────────────────────────────────────────────────────────────────────────

const props = defineProps({
  filters: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['options-loaded', 'stats-loaded'])

const mapContainer = ref(null)
const activeBasemap = ref('ninguno')
let map = null

// Tooltip hover municipio
const hoverLabel = ref({ name: '', x: 0, y: 0, visible: false })

// Letreros verticales de filtro activo
const selectedSubregion = ref('')
const selectedMunicipio = ref('')

// Callout lines (nombre + km por circuito)
const callouts        = ref([])   // todos los circuitos cargados
const visibleCallouts = ref([])   // subconjunto visible según filtro activo

// ── THREE.JS DEMO: encuadre centrado en la ruta ────────────────────────────
const CENTER = [-75.5636, 6.2442]
const ZOOM   = 7
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
// ── Señal vertical "A Toda Máquina" al inicio de la ruta ──────────────────
let signRenderer = null

function createSignLayer() {
  let _camera, _scene

  return {
    id: 'sign-3d',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      _camera = new THREE.Camera()
      _scene  = new THREE.Scene()

      // ── Helper: crea un Shape hexagonal ──────────────────────────────────
      function hexShape(r) {
        const s = new THREE.Shape()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6   // pointy-top
          const x = r * Math.cos(a)
          const y = r * Math.sin(a)
          i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)
        }
        s.closePath()
        return s
      }

      const matPole  = new THREE.MeshPhongMaterial({ color: 0x1a202c })
      const matBorder = new THREE.MeshPhongMaterial({ color: 0x0b5640, side: THREE.DoubleSide })
      const matWhite  = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide })

      // Poste vertical
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 3.8, 8), matPole)
      pole.position.y = 1.9
      _scene.add(pole)

      // Base del poste
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 8), matPole)
      base.position.y = 0.06
      _scene.add(base)

      // Hexágono exterior (borde verde) — extruido para dar grosor
      const borderGeo = new THREE.ExtrudeGeometry(hexShape(0.85), { depth: 0.07, bevelEnabled: false })
      const border    = new THREE.Mesh(borderGeo, matBorder)
      border.position.set(0, 3.55, -0.035)
      _scene.add(border)

      // Hexágono interior blanco (fondo)
      const bgGeo = new THREE.ExtrudeGeometry(hexShape(0.74), { depth: 0.04, bevelEnabled: false })
      const bg    = new THREE.Mesh(bgGeo, matWhite)
      bg.position.set(0, 3.55, 0.02)
      _scene.add(bg)

      // Cara trasera del hexágono (borde + blanco para que se vea bien desde atrás)
      const borderBack = border.clone()
      borderBack.rotation.y = Math.PI
      borderBack.position.set(0, 3.55, 0.035)
      _scene.add(borderBack)
      const bgBack = bg.clone()
      bgBack.rotation.y = Math.PI
      bgBack.position.set(0, 3.55, -0.02)
      _scene.add(bgBack)

      // Logo centrado sobre el hexágono
      const hexTop  = 3.55 + 0.62   // top vertex of hexagon
      const hexBot  = 3.55 - 0.62
      const hexH    = hexTop - hexBot
      const signH   = hexH * 0.55
      const signW   = signH * (350 / 140)  // approx aspect ratio of logo

      const loader = new THREE.TextureLoader()
      loader.load('/A toda maquina.png', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), mat)
        sign.position.set(0, 3.55, 0.065)
        _scene.add(sign)
        const signBack = sign.clone()
        signBack.position.z = -0.065
        signBack.rotation.y = Math.PI
        _scene.add(signBack)
      })

      // Iluminación
      _scene.add(new THREE.AmbientLight(0xffffff, 1.1))
      const sun = new THREE.DirectionalLight(0xffffff, 1.4)
      sun.position.set(80, 150, 60)
      _scene.add(sun)

      signRenderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
      signRenderer.autoClear = false
    },

    render(_gl, args) {
      const pos   = CAR_ROUTE[0]
      const merc  = maplibregl.MercatorCoordinate.fromLngLat(pos, 0)
      const scale = 300 * merc.meterInMercatorCoordinateUnits()

      const l = new THREE.Matrix4()
        .makeTranslation(merc.x, merc.y, merc.z)
        .scale(new THREE.Vector3(scale, -scale, scale))

      const rawMatrix = args?.defaultProjectionData?.mainMatrix ?? args
      const m = new THREE.Matrix4().fromArray(rawMatrix)

      _camera.projectionMatrix = m.multiply(l)
      signRenderer.resetState()
      signRenderer.render(_scene, _camera)
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
        { id: 'base-layer', type: 'raster', source: 'base', minzoom: 0, maxzoom: 19, layout: { visibility: 'none' } }
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

  // ResizeObserver: llama map.resize() en cada frame de la transición CSS
  // para que el canvas no parpadee en negro al redimensionarse
  resizeObs = new ResizeObserver(() => { map?.resize() })
  resizeObs.observe(mapContainer.value)

  // ── THREE.JS DEMO ─────────────────────────────────────────────────────
  map.on('load', async () => {
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

    // Señal vertical "A Toda Máquina" al inicio de la ruta
    map.addLayer(createSignLayer())

    // ── Capas SIMEVA ──────────────────────────────────────────────────────
    await loadSimeva()
  })
  // ── END THREE.JS DEMO ─────────────────────────────────────────────────
})

// ── Carga capas SIMEVA desde los endpoints mock ─────────────────────────────
let popup          = null
let cachedMunicipios = null
let cachedVias       = null

async function loadSimeva() {
  if (!map) return
  const [resMunicipios, resVias] = await Promise.allSettled([getMunicipios(), getLocalizaciones()])

  cachedMunicipios = resMunicipios.status === 'fulfilled' ? resMunicipios.value : null
  cachedVias       = resVias.status       === 'fulfilled' ? resVias.value       : null

  const geoMunicipios = cachedMunicipios
  const geoVias       = cachedVias

  if (resMunicipios.status === 'rejected') console.warn('[SIMEVA] Municipios:', resMunicipios.reason)
  if (resVias.status       === 'rejected') console.warn('[SIMEVA] Vías:', resVias.reason)

  // ── Emitir opciones reales para los filtros ──────────────────────────────
  const subregiones = geoMunicipios
    ? [...new Set(geoMunicipios.features.map(f => sentenceCase(f.properties.subregion)).filter(Boolean))].sort()
    : []
  const municipioOpts = geoMunicipios
    ? [...new Set(geoMunicipios.features.map(f => sentenceCase(f.properties.mpio_nombr)).filter(Boolean))].sort()
    : []
  const circuitos = geoVias
    ? geoVias.features.map(f => f.properties.name).filter(Boolean).sort()
    : []

  emit('options-loaded', {
    subregiones: ['Todas las subregiones', ...subregiones],
    municipios:  ['Todos los municipios',  ...municipioOpts],
    circuitos:   ['Todos los circuitos',   ...circuitos],
  })

  // ── Stats reales del GeoJSON ─────────────────────────────────────────────
  const totalCircuitos   = geoVias?.features.length ?? 0
  const uniqueMunicipios = geoMunicipios
    ? new Set(geoMunicipios.features.map(f => f.properties.mpio_nombr)).size : 0
  let longitudTotal = 0
  if (geoVias) {
    for (const f of geoVias.features) {
      const km = extractKm(parseDescription(f.properties.description ?? ''))
      if (km) longitudTotal += km
    }
  }
  emit('stats-loaded', {
    viasIntervenidas: totalCircuitos,
    longitudTotal:    Math.round(longitudTotal * 100) / 100,
    municipios:       uniqueMunicipios,
    circuitos:        totalCircuitos,
  })

  // ── Municipios: polígonos de fondo ────────────────────────────────────
  if (geoMunicipios) {
    try {
      map.addSource('municipios', { type: 'geojson', data: geoMunicipios, generateId: true })
      map.addLayer({
        id: 'municipios-fill',
        type: 'fill',
        source: 'municipios',
        paint: {
          'fill-color': '#2d8653',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.22, 0.07],
        },
      })
      map.addLayer({
        id: 'municipios-outline',
        type: 'line',
        source: 'municipios',
        paint: { 'line-color': '#2d8653', 'line-width': 0.8, 'line-opacity': 0.5 },
      })

      // Capa de labels de municipios (oculta hasta que se active un filtro)
      map.addLayer({
        id: 'municipios-labels',
        type: 'symbol',
        source: 'municipios',
        layout: {
          'text-field': ['get', 'mpio_nombr'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 9, 10, 13],
          'text-anchor': 'center',
          'text-max-width': 8,
          'text-allow-overlap': false,
          'visibility': 'none',
        },
        paint: {
          'text-color': '#0b5640',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })

      // Hover: highlight + tooltip con nombre
      let hoveredMpio = null
      map.on('mousemove', 'municipios-fill', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        if (hoveredMpio !== null)
          map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: false })
        hoveredMpio = e.features[0].id
        map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: true })

        const name = e.features[0].properties.mpio_nombr ?? ''
        const point = e.point
        hoverLabel.value = { name: capitalize(name), x: point.x, y: point.y, visible: true }
      })
      map.on('mouseleave', 'municipios-fill', () => {
        map.getCanvas().style.cursor = ''
        if (hoveredMpio !== null)
          map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: false })
        hoveredMpio = null
        hoverLabel.value = { ...hoverLabel.value, visible: false }
      })
    } catch (err) {
      console.error('[SIMEVA] Error cargando municipios:', err)
    }
  }

  // ── Vías / Localizaciones ──────────────────────────────────────────────
  if (geoVias) {
    try {
      map.addSource('vias', { type: 'geojson', data: geoVias })
      map.addLayer({
        id: 'vias-casing',
        type: 'line',
        source: 'vias',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['coalesce', ['get', 'stroke-width'], 5],
          'line-opacity': 0.4,
        },
      })
      map.addLayer({
        id: 'vias-line',
        type: 'line',
        source: 'vias',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color':   ['coalesce', ['get', 'stroke'],         '#ffaa00'],
          'line-width':   ['coalesce', ['get', 'stroke-width'],   5],
          'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 1],
        },
      })

      popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'simeva-popup' })
      map.on('click', 'vias-line', (e) => {
        const p    = e.features[0].properties
        const info = parseDescription(p.description)
        const rows = Object.entries(info)
          .map(([k, v]) => `<tr><td class="sp-key">${k}</td><td class="sp-val">${v}</td></tr>`)
          .join('')
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<div class="sp-header">${p.name ?? 'Vía'}</div>${rows ? `<table class="sp-table">${rows}</table>` : ''}`)
          .addTo(map)
      })
      map.on('mouseenter', 'vias-line', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'vias-line', () => { map.getCanvas().style.cursor = '' })

      // Callouts: construir y mantener actualizadas al mover/hacer zoom
      buildCallouts(geoVias.features)
      map.on('move',   updateCalloutPositions)
      map.on('resize', updateCalloutPositions)
    } catch (err) {
      console.error('[SIMEVA] Error cargando vías:', err)
    }
  }
}

// ── Filtros: actualiza capas y vuela al feature seleccionado ─────────────────
function applyFilters(filters) {
  if (!map) return

  const sub      = filters.subregion ?? ''
  const mpio     = filters.municipio ?? ''
  const circuito = filters.circuito  ?? ''
  const search   = (filters.search   ?? '').toLowerCase()

  // Actualizar letreros verticales
  selectedSubregion.value = (sub  && sub  !== 'Todas las subregiones') ? sub  : ''
  selectedMunicipio.value = (mpio && mpio !== 'Todos los municipios')  ? mpio : ''

  // ── Municipios ──────────────────────────────────────────────────────────
  if (map.getLayer('municipios-fill')) {
    const mpioFilter = ['all']
    if (sub  && sub  !== 'Todas las subregiones')
      mpioFilter.push(['==', ['upcase', ['get', 'subregion']], sub.toUpperCase()])
    if (mpio && mpio !== 'Todos los municipios')
      mpioFilter.push(['==', ['upcase', ['get', 'mpio_nombr']], mpio.toUpperCase()])
    const f = mpioFilter.length > 1 ? mpioFilter : null
    map.setFilter('municipios-fill',    f)
    map.setFilter('municipios-outline', f)
    if (map.getLayer('municipios-labels')) {
      map.setFilter('municipios-labels', f)
      // Mostrar labels cuando hay un filtro de subregión o municipio activo
      const hasGeoFilter = sub !== 'Todas las subregiones' || mpio !== 'Todos los municipios'
      map.setLayoutProperty('municipios-labels', 'visibility', hasGeoFilter ? 'visible' : 'none')
    }
  }

  // ── Vías ────────────────────────────────────────────────────────────────
  if (map.getLayer('vias-line')) {
    let viasFilter = null
    if (circuito && circuito !== 'Todos los circuitos') {
      viasFilter = ['==', ['get', 'name'], circuito]
    } else if (search) {
      viasFilter = ['>', ['index-of', search, ['downcase', ['coalesce', ['get', 'name'], '']]], -1]
    }
    map.setFilter('vias-line',   viasFilter)
    map.setFilter('vias-casing', viasFilter)
  }

  // ── Zoom al feature seleccionado ────────────────────────────────────────
  // Prioridad: municipio > subregión > circuito
  if (mpio && mpio !== 'Todos los municipios' && cachedMunicipios) {
    const feat = cachedMunicipios.features.find(
      f => f.properties.mpio_nombr?.toUpperCase() === mpio.toUpperCase()
    )
    if (feat) flyToGeometry(feat.geometry, { padding: 80 })

  } else if (sub && sub !== 'Todas las subregiones' && cachedMunicipios) {
    const feats = cachedMunicipios.features.filter(
      f => f.properties.subregion?.toUpperCase() === sub.toUpperCase()
    )
    if (feats.length) flyToGeometries(feats.map(f => f.geometry), { padding: 60 })

  } else if (circuito && circuito !== 'Todos los circuitos' && cachedVias) {
    const feat = cachedVias.features.find(f => f.properties.name === circuito)
    if (feat) flyToGeometry(feat.geometry, { padding: 80 })
  } else {
    // Sin filtro activo: volver a la vista de Antioquia
    map.flyTo({ center: CENTER, zoom: ZOOM, duration: 900 })
  }

  // Actualizar callouts visibles según filtro
  refreshVisibleCallouts(filters)
}

// ── Helpers de bounding box ──────────────────────────────────────────────────
function coordsBounds(coords, bounds) {
  if (typeof coords[0] === 'number') { bounds.extend(coords) }
  else coords.forEach(c => coordsBounds(c, bounds))
}

function flyToGeometry(geometry, opts = {}) {
  const bounds = new maplibregl.LngLatBounds()
  coordsBounds(geometry.coordinates, bounds)
  if (!bounds.isEmpty()) map.fitBounds(bounds, { ...opts, duration: 900 })
}

function flyToGeometries(geometries, opts = {}) {
  const bounds = new maplibregl.LngLatBounds()
  geometries.forEach(g => coordsBounds(g.coordinates, bounds))
  if (!bounds.isEmpty()) map.fitBounds(bounds, { ...opts, duration: 900 })
}

// ── Sentence case: solo primera letra en mayúscula ───────────────────────────
function sentenceCase(str) {
  if (!str) return str
  const lower = str.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// capitalize sigue disponible para uso interno
function capitalize(str) {
  if (!str) return str
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// ── Callout lines ─────────────────────────────────────────────────────────────
function collectCoords(coords, out) {
  if (typeof coords[0] === 'number') out.push(coords)
  else coords.forEach(c => collectCoords(c, out))
}

function geoCentroid(geometry) {
  const pts = []
  collectCoords(geometry.coordinates, pts)
  if (!pts.length) return [0, 0]
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ]
}

function buildCallouts(features) {
  callouts.value = features.map(f => {
    const desc      = parseDescription(f.properties.description ?? '')
    const km        = extractKm(desc)
    // Extraer subregión de la descripción para poder filtrar luego
    const subKey    = Object.keys(desc).find(k => /subregi/i.test(k))
    const subregion = subKey ? String(desc[subKey]).toUpperCase() : ''
    return {
      name:     f.properties.name ?? 'Vía',
      km,
      subregion,
      centroid: geoCentroid(f.geometry),
      screenX: 0, screenY: 0,
      labelX:  0, labelY:  0,
      lineEndX: 0, lineEndY: 0,
    }
  })
  visibleCallouts.value = []   // ocultos hasta que haya filtro
  updateCalloutPositions()
}

function computeCalloutLayout(c) {
  if (!map) return c
  const canvas = map.getCanvas()
  const W  = canvas.offsetWidth
  const H  = canvas.offsetHeight
  const cx = W / 2
  const cy = H / 2
  const PUSH = 160
  const LW   = 170
  const LH   = 52
  const PAD  = { t: 50, r: 12, b: 12, l: 12 }

  const screen = map.project(c.centroid)
  const sx = screen.x
  const sy = screen.y

  let dx = sx - cx
  let dy = sy - cy
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  dx /= len; dy /= len

  let lx = sx + dx * PUSH
  let ly = sy + dy * PUSH

  lx = Math.max(PAD.l + LW / 2, Math.min(W - PAD.r - LW / 2, lx))
  ly = Math.max(PAD.t + LH / 2, Math.min(H - PAD.b - LH / 2, ly))

  const edX = sx - lx
  const edY = sy - ly
  const edL = Math.sqrt(edX * edX + edY * edY) || 1

  return {
    ...c,
    screenX: sx, screenY: sy,
    labelX: lx, labelY: ly,
    lineEndX: lx + (edX / edL) * (LW / 2),
    lineEndY: ly + (edY / edL) * (LH / 2),
  }
}

function updateCalloutPositions() {
  if (!map) return
  callouts.value       = callouts.value.map(computeCalloutLayout)
  // Re-sincronizar posiciones en los visibles
  const visNames       = new Set(visibleCallouts.value.map(c => c.name))
  if (visNames.size)
    visibleCallouts.value = callouts.value.filter(c => visNames.has(c.name))
}

function refreshVisibleCallouts(filters) {
  const sub      = filters.subregion ?? ''
  const mpio     = filters.municipio ?? ''
  const circuito = filters.circuito  ?? ''

  const hasFilter =
    (sub      && sub      !== 'Todas las subregiones') ||
    (mpio     && mpio     !== 'Todos los municipios')  ||
    (circuito && circuito !== 'Todos los circuitos')

  if (!hasFilter) {
    visibleCallouts.value = []
    return
  }

  let filtered = callouts.value

  if (circuito && circuito !== 'Todos los circuitos') {
    // Mostrar solo el circuito seleccionado
    filtered = filtered.filter(c => c.name === circuito)
  } else if (sub && sub !== 'Todas las subregiones') {
    // Filtrar por subregión si tenemos ese dato en la descripción del circuito
    const subUp = sub.toUpperCase()
    const bySub = filtered.filter(c => c.subregion && c.subregion === subUp)
    if (bySub.length) filtered = bySub
    // Si no hay datos de subregión en la descripción, mostramos todos
  }
  // Para municipio sin circuito específico: mostramos todos los circuitos visibles
  // (no tenemos join directo circuito↔municipio en el GeoJSON)

  visibleCallouts.value = filtered.map(computeCalloutLayout)
}

// ── ResizeObserver: mantiene el canvas sincronizado durante la transición ─────
let resizeObs = null

onUnmounted(() => {
  resizeObs?.disconnect()
  popup?.remove()
  threeRenderer?.dispose()
  signRenderer?.dispose()
  map?.remove()
})

watch(() => props.filters, (filters) => { applyFilters(filters) }, { deep: true })
</script>

<template>
  <div class="map-wrapper">
    <!-- Fondo menta cuando no hay mapa base -->
    <div class="map-container" :class="{ 'bg-mint': activeBasemap === 'ninguno' }" ref="mapContainer" />

    <!-- ── Callout overlay: líneas + labels por circuito (solo con filtro activo) ── -->
    <svg v-if="visibleCallouts.length" class="callout-svg" aria-hidden="true">
      <g v-for="c in visibleCallouts" :key="c.name + '-line'">
        <line
          :x1="c.lineEndX" :y1="c.lineEndY"
          :x2="c.screenX"  :y2="c.screenY"
          class="co-line"
        />
        <circle :cx="c.screenX" :cy="c.screenY" r="5" class="co-dot" />
        <circle :cx="c.screenX" :cy="c.screenY" r="3" class="co-dot-inner" />
      </g>
    </svg>

    <template v-if="visibleCallouts.length">
      <div
        v-for="c in visibleCallouts"
        :key="c.name + '-label'"
        class="callout-label"
        :style="{ left: c.labelX + 'px', top: c.labelY + 'px' }"
      >
        <div class="co-name">{{ c.name }}</div>
        <div class="co-km">
          <span class="co-km-val">{{ c.km != null ? c.km.toLocaleString('es-CO') : '—' }}</span>
          <span class="co-km-unit"> Km</span>
        </div>
      </div>
    </template>

    <!-- Letreros verticales (izquierda): subregión + municipio juntos -->
    <div v-if="selectedSubregion || selectedMunicipio" class="subreg-group">
      <Transition name="subreg">
        <span v-if="selectedSubregion" class="subreg-text" :key="'sub-' + selectedSubregion">
          {{ selectedSubregion }}
        </span>
      </Transition>
      <Transition name="subreg">
        <span v-if="selectedMunicipio" class="subreg-text subreg-text--sm" :key="'mun-' + selectedMunicipio">
          {{ selectedMunicipio.charAt(0).toUpperCase() + selectedMunicipio.slice(1).toLowerCase() }}
        </span>
      </Transition>
    </div>

    <!-- Logo A Toda Máquina -->
    <div class="atm-logo">
      <img src="/A toda maquina.png" alt="A Toda Máquina" />
    </div>

    <!-- Tooltip hover municipio -->
    <Transition name="tooltip">
      <div
        v-if="hoverLabel.visible"
        class="mpio-tooltip"
        :style="{ left: hoverLabel.x + 'px', top: hoverLabel.y + 'px' }"
      >{{ hoverLabel.name }}</div>
    </Transition>

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
  min-height: 0;
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

/* ── Popup SIMEVA ── */
:deep(.simeva-popup .maplibregl-popup-content) {
  border-radius: 10px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  font-family: 'Prompt', sans-serif;
  min-width: 200px;
}
:deep(.sp-header) {
  background: #0b5640;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  padding: 9px 14px;
  line-height: 1.3;
}
:deep(.sp-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
:deep(.sp-key) {
  color: #6b7280;
  padding: 5px 10px 5px 14px;
  white-space: nowrap;
  vertical-align: top;
  font-weight: 500;
}
:deep(.sp-val) {
  color: #111827;
  padding: 5px 14px 5px 6px;
  font-weight: 600;
}
:deep(.sp-table tr:nth-child(even)) {
  background: #f9fafb;
}

/* ── Callout overlay ── */
.callout-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 15;
  overflow: visible;
}
.co-line {
  stroke: #0b5640;
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  opacity: 0.75;
}
.co-dot {
  fill: #ffffff;
  stroke: #0b5640;
  stroke-width: 2;
}
.co-dot-inner { fill: #0b5640; }

.callout-label {
  position: absolute;
  z-index: 16;
  pointer-events: none;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 120px;
  max-width: 175px;
}
.co-name {
  font-family: 'Prompt', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #1a3c2d;
  line-height: 1.25;
}
.co-km {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  background: #0b5640;
  border-radius: 6px;
  padding: 2px 10px 2px 8px;
}
.co-km-val {
  font-family: 'Prompt', sans-serif;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1;
}
.co-km-unit {
  font-family: 'Prompt', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
}

/* ── Tooltip hover municipio ── */
.mpio-tooltip {
  position: absolute;
  z-index: 30;
  pointer-events: none;
  transform: translate(-50%, calc(-100% - 10px));
  background: #0b5640;
  color: #fff;
  font-family: 'Prompt', sans-serif;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}
.mpio-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #0b5640;
}
.tooltip-enter-active, .tooltip-leave-active {
  transition: opacity .12s ease, transform .12s ease;
}
.tooltip-enter-from, .tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 6px));
}

/* ── Letreros verticales ── */
.subreg-group {
  position: absolute;
  top: 24px;
  left: 18px;
  z-index: 20;
  pointer-events: none;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 6px;
}

.subreg-text {
  display: inline-block;
  writing-mode: vertical-lr;
  text-orientation: mixed;
  transform: rotate(180deg);
  font-family: 'Prompt', sans-serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #0b5640;
  text-shadow: 0 2px 8px rgba(255,255,255,0.7);
  line-height: 1;
  padding: 4px 0;
}

.subreg-text--sm {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: .08em;
  color: #1a5c3a;
  text-shadow: 0 2px 6px rgba(255,255,255,0.65);
}

/* Animación: sube desde abajo */
@keyframes subregIn {
  from { opacity: 0; transform: rotate(180deg) translateY(-30px); }
  to   { opacity: 1; transform: rotate(180deg) translateY(0);      }
}
@keyframes subregOut {
  from { opacity: 1; transform: rotate(180deg) translateY(0);      }
  to   { opacity: 0; transform: rotate(180deg) translateY(-20px);  }
}

.subreg-enter-active .subreg-text {
  animation: subregIn .42s cubic-bezier(.34,1.10,.64,1) both;
}
.subreg-leave-active .subreg-text {
  animation: subregOut .22s ease-in both;
}

/* ── Logo A Toda Máquina ── */
.atm-logo {
  position: absolute;
  bottom: 28px;
  left: 12px;
  z-index: 20;
  pointer-events: none;
}
.atm-logo img {
  height: 112px;
  width: auto;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.22));
}
</style>
