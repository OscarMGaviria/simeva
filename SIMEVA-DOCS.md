# SIMEVA — Documentación del Frontend

**Sistema de Información y Monitoreo de Estabilización Vial de Antioquia**
Frontend Vue.js — `feature/12856`

---

## Stack tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Vue 3 | ^3.5.25 | Framework UI (Composition API + `<script setup>`) |
| MapLibre GL | ^5.19.0 | Motor de mapas vectoriales/raster |
| Three.js | ^0.183.2 | Renderizado 3D personalizado sobre el mapa |
| Vite | ^7.3.1 | Bundler y servidor de desarrollo |
| Lucide Vue Next | — | Iconografía SVG |
| Fuente | Prompt (Google Fonts) | Tipografía corporativa |

---

## Arquitectura del proyecto

```
src/
├── main.js                          # Entry point — monta App.vue en #app
├── App.vue                          # Raíz: gestiona filtros activos + layout
├── style.css                        # Estilos globales y reset
└── components/
    ├── atoms/
    │   ├── Selector.vue             # Dropdown con búsqueda interna
    │   ├── StatCard.vue             # Tarjeta de métrica (icono + valor + unidad)
    │   └── Abutton.vue              # Botón reutilizable
    └── organisms/
        ├── AppHeader.vue            # Cabecera con logo, título y filtros
        ├── MapView.vue              # Mapa MapLibre + capa 3D Three.js
        └── StatsPanel.vue          # Panel lateral con KPIs y cobertura
```

---

## Flujo de datos de filtros

```
AppHeader.vue
  emite @filter-change { search, subregion, municipio, circuito }
         ↓
App.vue
  activeFilters (ref) — prop :filters → MapView.vue
                      — (StatsPanel se conectará en el futuro)
         ↓
MapView.vue
  watch(filters) → llamada al API → setData en fuente GeoJSON del mapa
```

### Filtros activos

| Clave | Tipo | Valor por defecto | Descripción |
|---|---|---|---|
| `search` | String | `''` | Búsqueda libre por nombre de vía |
| `subregion` | String | `'Todas las subregiones'` | Subregión de Antioquia |
| `municipio` | String | `'Todos los municipios'` | Municipio (opciones desde GeoJSON) |
| `circuito` | String | `'Todos los circuitos'` | Circuito vial (opciones desde GeoJSON) |

---

## Componentes

### `App.vue`
Raíz de la aplicación. Orquesta layout, estado de filtros y visibilidad del panel lateral.

**Estado:**
- `activeFilters` — objeto con las 4 claves de filtro actuales.
- `isPanelOpen` — controla la visibilidad del `StatsPanel`.

**Layout:** columna `flex` → `AppHeader` (fijo arriba) + `content-area` (mapa + panel en fila).

---

### `AppHeader.vue`
Cabecera fija con branding y controles de filtro.

**Props:**
| Prop | Tipo | Default |
|---|---|---|
| `title` | String | `'Dashboard de Pavimentación Vial'` |
| `subtitle` | String | `'Antioquia — Red vial departamental'` |
| `subregionOptions` | Array | 9 subregiones de Antioquia |
| `municipioOptions` | Array | `['Todos los municipios']` — se pobla desde GeoJSON |
| `circuitoOptions` | Array | `['Todos los circuitos']` — se pobla desde GeoJSON |
| `panelOpen` | Boolean | `true` |

**Emits:** `filter-change(filters)`, `toggle-panel`.

---

### `Selector.vue`
Dropdown personalizado con buscador interno. Reemplaza el `<select>` nativo.

**Props:** `options: Array`, `modelValue: String`
**Emits:** `update:modelValue`

Características:
- Cierra automáticamente al hacer clic fuera (`mousedown` global).
- Filtra opciones en tiempo real por el texto buscado.
- Resalta la opción seleccionada con ícono `Check`.
- Animación de apertura/cierre con transición CSS.

---

### `MapView.vue`
Componente central. Renderiza el mapa MapLibre e integra la capa 3D de Three.js.

**Props:** `filters: Object`

#### Mapas base disponibles

| ID | Label | Proveedor |
|---|---|---|
| `estandar` | Estándar | OpenStreetMap |
| `claro` | Claro | CartoCDN Light |
| `satelite` | Satélite | Esri World Imagery |
| `oscuro` | Oscuro | CartoCDN Dark |
| `ninguno` | Ninguno | Sin tiles |

#### Controles del mapa
- `NavigationControl` — zoom y rotación (arriba derecha).
- `ScaleControl` — escala métrica (abajo izquierda).
- `GeolocateControl` — geolocalización del usuario (arriba derecha).
- `Basemap Switcher` — selector de mapa base personalizado (abajo derecha).
- `Terrain Toggle` — activa relieve 3D con exageración 1.5× (abajo derecha).

#### Demo Three.js (temporal — bloque marcado para eliminar)
Visualización de una **pavimentadora CAT** 3D que recorre la ruta Las Palmas
(Medellín El Poblado → Aeropuerto Rionegro) con:
- Rastro de asfalto animado que crece con la máquina.
- Letrero flotante con km pavimentados en tiempo real.
- Modelo detallado: chasis, tolva, capó, cabina, screed, auger, orugas.

**Fuentes GeoJSON del mapa (pendientes de conectar a API):**
- `vias-geojson` — vías de la red vial departamental (se actualizará con filtros).
- `car-route` — ruta demo de la pavimentadora.
- `paved-trail` — rastro dinámico del demo.

#### Conexión pendiente al API (watch vacío en `MapView.vue:491`)
```js
watch(() => props.filters, (_filters) => {
  // TODO: llamar al API Management con los filtros
  // y actualizar map.getSource('vias-geojson').setData(geojson)
}, { deep: true })
```

---

### `StatsPanel.vue`
Panel lateral deslizable con estadísticas de la red vial.

**Props:** `isOpen: Boolean`

**Contenido actual (datos estáticos de demostración):**
- 4 tarjetas `StatCard`: Red Vial Total, Pavimentadas, En Ejecución, Por Ejecutar.
- Barras de cobertura animadas por subregión (9 subregiones).

**Animaciones:**
- Apertura/cierre: transición CSS de `width` (`.38s cubic-bezier`).
- Cards: `fadeSlideUp` escalonado al aparecer.
- Barras: `fadeSlideRight` escalonado + transición de ancho al rellenar.

---

### `StatCard.vue`
Átomo reutilizable para mostrar una métrica con ícono, valor y unidad.

**Props:** `title: String`, `value: String|Number`, `unit: String`
**Slot:** ícono Lucide (cualquier componente de ícono).

---

## Infraestructura Azure (IaC — Bicep)

El frontend se despliega en un **Azure Static Web App** (Free tier) con CI/CD automático via GitHub Actions. El mapa de servicios completo:

```
Usuario (HTTPS)
    └─▶ Azure Front Door + CDN   (Standard)
           └─▶ Static Web App     (Vue.js — Free)
                  └─▶ API Management (Consumption — CORS habilitado, 10 req/seg)
                         └─▶ Function App (dotnet-isolated — GetGeoJSON)
                                └─▶ Blob Storage (Standard LRS — contenedor: geojson/)
```

| Recurso | Nombre prod | Tier |
|---|---|---|
| Static Web App | `stapp-simeva-prod` | Free |
| API Management | `apim-simeva-prod` | Consumption |
| Function App | `func-simeva-prod-getgeojson` | Consumption |
| Storage Account | `stsimevaprod` | Standard LRS |
| Front Door | `afd-simeva-prod` | Standard |
| Log Analytics | `log-simeva-prod` | PerGB2018 |
| App Insights | `appi-simeva-prod` | Web |

La Function App usa **Managed Identity** con rol `Storage Blob Data Reader` — sin connection strings en el código.

---

## Pendientes / Próximos pasos

- [ ] Recibir endpoint del API Management y conectarlo en `MapView.vue`.
- [ ] Poblar `municipioOptions` y `circuitoOptions` dinámicamente desde el GeoJSON inicial.
- [ ] Implementar el `watch` de filtros: fetch → `setData` en fuente `vias-geojson`.
- [ ] Conectar `StatsPanel` a datos reales (km por subregión desde la API).
- [ ] Eliminar el bloque demo de Three.js (pavimentadora) cuando se integren datos reales.
- [ ] Definir estilo de capas GeoJSON (colores por estado/circuito/subregión).
- [ ] Agregar popups al hacer clic en una vía del mapa.
