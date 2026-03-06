<script setup>
import { ref } from 'vue'
import AppHeader from './components/organisms/AppHeader.vue'
import MapView from './components/organisms/MapView.vue'
import StatsPanel from './components/organisms/StatsPanel.vue'

const activeFilters = ref({
  search: '',
  filter1: 'Todas las subregiones',
  filter2: 'Todos los estados',
  filter3: 'Todos los años',
})
const isPanelOpen = ref(true)

const handleFilterChange = (filters) => { activeFilters.value = filters }
</script>

<template>
  <div id="app">
    <AppHeader
      @filter-change="handleFilterChange"
      :panel-open="isPanelOpen"
      @toggle-panel="isPanelOpen = !isPanelOpen"
    />
    <div class="content-area">
      <MapView :filters="activeFilters" />
      <StatsPanel :is-open="isPanelOpen" />
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
