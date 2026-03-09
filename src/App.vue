<script setup>
import { ref } from 'vue'
import AppHeader from './components/organisms/AppHeader.vue'
import MapView from './components/organisms/MapView.vue'
import StatsPanel from './components/organisms/StatsPanel.vue'

const activeFilters = ref({
  search: '',
  subregion: 'Todas las subregiones',
  municipio: 'Todos los municipios',
  circuito:  'Todos los circuitos',
})
const isPanelOpen = ref(true)

const filterOptions = ref({
  subregiones: ['Todas las subregiones'],
  municipios:  ['Todos los municipios'],
  circuitos:   ['Todos los circuitos'],
})

const mapStats = ref({
  viasIntervenidas: 0,
  longitudTotal:    0,
  municipios:       0,
  circuitos:        0,
})

const handleFilterChange  = (filters) => { activeFilters.value = filters }
const handleOptionsLoaded = (options) => { filterOptions.value = options }
const handleStatsLoaded   = (stats)   => { mapStats.value      = stats }
</script>

<template>
  <div id="app">
    <AppHeader
      @filter-change="handleFilterChange"
      :panel-open="isPanelOpen"
      @toggle-panel="isPanelOpen = !isPanelOpen"
      :subregion-options="filterOptions.subregiones"
      :municipio-options="filterOptions.municipios"
      :circuito-options="filterOptions.circuitos"
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
