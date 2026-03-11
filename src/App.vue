<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import AppHeader from './components/organisms/AppHeader.vue'
import MapView from './components/organisms/MapView.vue'
import StatsPanel from './components/organisms/StatsPanel.vue'

// ── Leer filtros iniciales desde URL ────────────────────────────────────────
function readFiltersFromURL() {
  const p = new URLSearchParams(window.location.search)
  return {
    search:    p.get('search')    ?? '',
    subregion: p.get('subregion') ?? 'Todas las subregiones',
    municipio: p.get('municipio') ?? 'Todos los municipios',
    circuito:  p.get('circuito')  ?? 'Todos los circuitos',
  }
}

const activeFilters = ref(readFiltersFromURL())
const isPanelOpen   = ref(true)

const filterOptions = ref({
  subregiones:           ['Todas las subregiones'],
  municipios:            ['Todos los municipios'],
  circuitos:             ['Todos los circuitos'],
  municipiosPorSubregion: {},
})

const mapStats = ref({
  viasIntervenidas: 0,
  longitudTotal:    0,
  municipios:       0,
  circuitos:        0,
  subregiones:      [],
})

// ── Filtrado en cascada: municipios según subregión activa ───────────────────
const filteredMunicipioOptions = computed(() => {
  const sub = activeFilters.value.subregion
  if (!sub || sub === 'Todas las subregiones') {
    return filterOptions.value.municipios
  }
  const lista = filterOptions.value.municipiosPorSubregion[sub] ?? []
  return ['Todos los municipios', ...lista]
})

// ── Sincronizar URL al cambiar filtros ───────────────────────────────────────
watch(activeFilters, (f) => {
  const p = new URLSearchParams()
  if (f.search)    p.set('search',    f.search)
  if (f.subregion && f.subregion !== 'Todas las subregiones') p.set('subregion', f.subregion)
  if (f.municipio && f.municipio !== 'Todos los municipios')  p.set('municipio', f.municipio)
  if (f.circuito  && f.circuito  !== 'Todos los circuitos')   p.set('circuito',  f.circuito)
  const qs = p.toString()
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
}, { deep: true })

// ── Handlers ─────────────────────────────────────────────────────────────────
const handleFilterChange = (filters) => {
  // Si cambia subregión, resetear municipio
  if (filters.subregion !== activeFilters.value.subregion) {
    filters.municipio = 'Todos los municipios'
  }
  activeFilters.value = filters
}

const handleOptionsLoaded = (options) => {
  filterOptions.value = options
  // Validar que los filtros leídos de URL existan en las opciones cargadas
  const sub  = activeFilters.value.subregion
  const mpio = activeFilters.value.municipio
  const cir  = activeFilters.value.circuito
  if (sub  && !options.subregiones.includes(sub))  activeFilters.value.subregion = 'Todas las subregiones'
  if (mpio && !options.municipios.includes(mpio))   activeFilters.value.municipio = 'Todos los municipios'
  if (cir  && !options.circuitos.includes(cir))     activeFilters.value.circuito  = 'Todos los circuitos'
}

const handleStatsLoaded = (stats) => { mapStats.value = stats }
</script>

<template>
  <div id="app">
    <AppHeader
      @filter-change="handleFilterChange"
      :panel-open="isPanelOpen"
      @toggle-panel="isPanelOpen = !isPanelOpen"
      :subregion-options="filterOptions.subregiones"
      :municipio-options="filteredMunicipioOptions"
      :circuito-options="filterOptions.circuitos"
      :initial-filters="activeFilters"
    />
    <div class="content-area">
      <MapView
        :filters="activeFilters"
        @options-loaded="handleOptionsLoaded"
        @stats-loaded="handleStatsLoaded"
      />
      <StatsPanel
        :is-open="isPanelOpen"
        :vias-intervenidas="mapStats.viasIntervenidas"
        :longitud-total="mapStats.longitudTotal"
        :municipios="mapStats.municipios"
        :circuitos="mapStats.circuitos"
        :subregiones="mapStats.subregiones"
      />
    </div>
  </div>
</template>

<style scoped>
#app {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.content-area {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
}
</style>
