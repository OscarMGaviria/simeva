<script setup>
import { ref, watch } from 'vue'
import { Search, X, PanelRightClose, PanelRightOpen } from 'lucide-vue-next'
import Selector from '../atoms/Selector.vue'

const props = defineProps({
  title: { type: String, default: 'Pavimentación Vial' },
  subtitle: { type: String, default: 'SIMEVA — Sistema de Información y Monitoreo de vias' },
  subregionOptions: {
    type: Array,
    default: () => [
      'Todas las subregiones',
      'Valle de Aburrá', 'Urabá', 'Norte', 'Oriente',
      'Occidente', 'Suroeste', 'Magdalena Medio', 'Nordeste', 'Bajo Cauca',
    ],
  },
  municipioOptions: {
    type: Array,
    default: () => ['Todos los municipios'],
  },
  circuitoOptions: {
    type: Array,
    default: () => ['Todos los circuitos'],
  },
  panelOpen:      { type: Boolean, default: true },
  initialFilters: { type: Object,  default: null  },
})

const emit = defineEmits(['filter-change', 'toggle-panel'])

const searchText   = ref(props.initialFilters?.search    ?? '')
const subregionVal = ref(props.initialFilters?.subregion ?? props.subregionOptions[0])
const municipioVal = ref(props.initialFilters?.municipio ?? props.municipioOptions[0])
const circuitoVal  = ref(props.initialFilters?.circuito  ?? props.circuitoOptions[0])

// Resetear municipio al cambiar subregión y re-emitir
watch(subregionVal, () => {
  municipioVal.value = props.municipioOptions[0]
  emitFilters()
})

const emitFilters = () => {
  emit('filter-change', {
    search:    searchText.value,
    subregion: subregionVal.value,
    municipio: municipioVal.value,
    circuito:  circuitoVal.value,
  })
}

const clearFilters = () => {
  searchText.value   = ''
  subregionVal.value = props.subregionOptions[0]
  circuitoVal.value  = props.circuitoOptions[0]
  // municipioVal se resetea automáticamente por el watcher de subregionVal
  emitFilters()
}
</script>

<template>
  <header class="app-header">

    <!-- LEFT: logo + branding -->
    <div class="header-brand">
      <div class="header-logo">
        <img src="/Escudo de armas.png" alt="Gobernación de Antioquia" class="header-logo-img" />
      </div>
      <div class="header-titles">
        <h1 class="header-title">{{ title }}</h1>
        <p class="header-subtitle">{{ subtitle }}</p>
      </div>
    </div>

    <div class="header-divider"></div>

    <!-- RIGHT: filters -->
    <div class="header-filters">

      <!-- Search -->
      <div class="search-wrapper">
        <Search :size="14" class="search-icon" />
        <input
          v-model="searchText"
          type="text"
          placeholder="Buscar vía..."
          class="search-input"
          @input="emitFilters"
        />
      </div>

      <!-- Subregión -->
      <Selector
        v-model="subregionVal"
        :options="subregionOptions"
        @update:modelValue="emitFilters"
      />

      <!-- Municipio -->
      <Selector
        v-model="municipioVal"
        :options="municipioOptions"
        @update:modelValue="emitFilters"
      />

      <!-- Circuito -->
      <Selector
        v-model="circuitoVal"
        :options="circuitoOptions"
        @update:modelValue="emitFilters"
      />

      <!-- Clear -->
      <div class="btn-clear-wrapper">
        <button class="btn-clear" @click="clearFilters" aria-label="Borrar filtros">
          <X :size="14" />
        </button>
        <span class="btn-tooltip">Borrar filtros</span>
      </div>

      <div class="header-sep"></div>

      <!-- Panel toggle -->
      <div class="btn-clear-wrapper">
        <button class="btn-panel" @click="emit('toggle-panel')" :aria-label="panelOpen ? 'Colapsar panel' : 'Expandir panel'">
          <PanelRightClose v-if="panelOpen" :size="15" />
          <PanelRightOpen  v-else            :size="15" />
        </button>
        <span class="btn-tooltip">{{ panelOpen ? 'Colapsar panel' : 'Expandir panel' }}</span>
      </div>

    </div>
  </header>
</template>

<style scoped>
/* ── Header ── */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 28px;
  width: 100%;
  box-sizing: border-box;
  background: linear-gradient(135deg, #0b5640 0%, #0d6b4e 60%, #0a4d38 100%);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
  position: relative;
}

/* Shine sutil sobre el header */
.app-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 60%);
  pointer-events: none;
}

/* ── Brand ── */
.header-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  position: relative;
}

.header-logo {
  flex-shrink: 0;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.25));
}

.header-logo-img {
  height: 60px;
  width: auto;
  display: block;
  object-fit: contain;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  font-family: 'Prompt', sans-serif;
  line-height: 1.2;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.header-subtitle {
  margin: 0;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.58);
  font-family: 'Prompt', sans-serif;
  font-weight: 400;
  letter-spacing: 0.03em;
}

/* ── Divider ── */
.header-divider {
  width: 1px;
  height: 34px;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,0.2) 40%, rgba(255,255,255,0.2) 60%, transparent);
  flex-shrink: 0;
}

/* ── Filters ── */
.header-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
}

/* ── Glass base (compartido) ── */
.search-input {
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
}

/* ── Search ── */
.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-wrapper:hover {
  transform: translateY(-1px);
}

.search-icon {
  position: absolute;
  left: 10px;
  color: rgba(255, 255, 255, 0.45);
  pointer-events: none;
  transition: color 0.2s;
  z-index: 1;
}

.search-wrapper:hover .search-icon,
.search-wrapper:focus-within .search-icon {
  color: rgba(255, 255, 255, 0.85);
}

.search-input {
  padding: 7.5px 12px 7.5px 32px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  font-size: 13px;
  font-family: 'Prompt', sans-serif;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  width: 162px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 4px 16px rgba(0, 0, 0, 0.12);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.search-input:hover {
  background: rgba(255, 255, 255, 0.13);
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 6px 20px rgba(0, 0, 0, 0.15);
}

.search-input:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 0 0 3px rgba(255, 255, 255, 0.1),
    0 6px 20px rgba(0, 0, 0, 0.15);
}

/* los estilos del trigger los maneja Selector.vue */

/* ── Clear button ── */
.btn-clear-wrapper {
  position: relative;
  display: inline-flex;
}

.btn-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  outline: none;
}

.btn-clear:hover {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(248, 113, 113, 0.5);
  color: #fca5a5;
}

.btn-clear:active {
  background: rgba(239, 68, 68, 0.28);
  border-color: rgba(248, 113, 113, 0.7);
}

/* ── Panel toggle ── */
.header-sep {
  width: 1px;
  height: 22px;
  background: rgba(255,255,255,0.18);
  flex-shrink: 0;
}

.btn-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  outline: none;
}

.btn-panel:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.4);
  color: #ffffff;
}

.btn-panel:active {
  background: rgba(255, 255, 255, 0.2);
}

/* Tooltip */
.btn-tooltip {
  position: absolute;
  top: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  background: #1f2937;
  color: #f9fafb;
  font-size: 11.5px;
  font-family: 'Prompt', sans-serif;
  white-space: nowrap;
  padding: 4px 9px;
  border-radius: 5px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 300;
}

.btn-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-bottom-color: #1f2937;
}

.btn-clear-wrapper:hover .btn-tooltip {
  opacity: 1;
}
</style>
