<script setup>
import { ref, watch } from 'vue'
import { Route, CheckCircle2, Wrench, Clock } from 'lucide-vue-next'
import StatCard from '../atoms/StatCard.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: true },
})

const subregionesCoverage = [
  { name: 'Valle de Aburrá', pct: 84, color: '#0b5640' },
  { name: 'Oriente',         pct: 71, color: '#1d7a56' },
  { name: 'Occidente',       pct: 58, color: '#2e9e6c' },
  { name: 'Norte',           pct: 62, color: '#1d7a56' },
  { name: 'Nordeste',        pct: 43, color: '#f59e0b' },
  { name: 'Suroeste',        pct: 55, color: '#f59e0b' },
  { name: 'Bajo Cauca',      pct: 31, color: '#ef4444' },
  { name: 'Magdalena Medio', pct: 28, color: '#ef4444' },
  { name: 'Urabá',           pct: 37, color: '#ef4444' },
]

// Controls content visibility + bar widths
const showContent = ref(props.isOpen)
const barWidths   = ref(subregionesCoverage.map(s => props.isOpen ? s.pct : 0))

let openTimer = null
let barTimer  = null

watch(() => props.isOpen, (val) => {
  clearTimeout(openTimer)
  clearTimeout(barTimer)

  if (val) {
    // Small delay so panel width transition starts first
    openTimer = setTimeout(() => {
      showContent.value = true
      // Bars animate after cards appear
      barTimer = setTimeout(() => {
        barWidths.value = subregionesCoverage.map(s => s.pct)
      }, 250)
    }, 120)
  } else {
    barWidths.value = subregionesCoverage.map(() => 0)
    openTimer = setTimeout(() => { showContent.value = false }, 80)
  }
})
</script>

<template>
  <div class="stats-side" :class="{ open: props.isOpen }">
    <div class="panel-inner">

      <!-- 4 cards en una fila -->
      <div class="cards-row" :class="{ animate: showContent }">
        <StatCard title="Red Vial Total"  value="450" unit="km">
          <Route :size="20" />
        </StatCard>
        <StatCard title="Pavimentadas"    value="312" unit="km">
          <CheckCircle2 :size="20" />
        </StatCard>
        <StatCard title="En Ejecución"    value="18"  unit="km">
          <Wrench :size="20" />
        </StatCard>
        <StatCard title="Por Ejecutar"    value="120" unit="km">
          <Clock :size="20" />
        </StatCard>
      </div>

      <!-- subregiones -->
      <div class="section-title" :class="{ animate: showContent }">Cobertura por Subregión</div>
      <div class="subregionesList">
        <div
          v-for="(s, i) in subregionesCoverage"
          :key="s.name"
          class="subregion-row"
          :class="{ animate: showContent }"
          :style="{ '--row-i': i }"
        >
          <div class="sub-label">
            <span class="sub-name">{{ s.name }}</span>
            <span class="sub-pct" :style="{ color: s.color }">{{ s.pct }}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: barWidths[i] + '%', background: s.color }" />
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Panel shell ── */
.stats-side {
  position: relative;
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  width: 0;
  transition: width .38s cubic-bezier(.4,0,.2,1);
  overflow: hidden;
  background: #eaf4ed;
  border-left: 1px solid #c8dfd0;
}
.stats-side.open { width: 50%; }

/* ── Scrollable body ── */
.panel-inner {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* ── Keyframes ── */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0);    }
}

@keyframes fadeSlideRight {
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0);     }
}

/* ── Cards stagger ── */
.cards-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.cards-row > * {
  opacity: 0;
}
.cards-row.animate > *:nth-child(1) { animation: fadeSlideUp .4s cubic-bezier(.4,0,.2,1) 0ms   both; }
.cards-row.animate > *:nth-child(2) { animation: fadeSlideUp .4s cubic-bezier(.4,0,.2,1) 70ms  both; }
.cards-row.animate > *:nth-child(3) { animation: fadeSlideUp .4s cubic-bezier(.4,0,.2,1) 140ms both; }
.cards-row.animate > *:nth-child(4) { animation: fadeSlideUp .4s cubic-bezier(.4,0,.2,1) 210ms both; }

/* ── Section title ── */
.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: .5px;
  padding-top: 6px;
  border-top: 1px solid #c8dfd0;
  opacity: 0;
}
.section-title.animate {
  animation: fadeSlideUp .35s cubic-bezier(.4,0,.2,1) 260ms both;
}

/* ── Subregion rows stagger ── */
.subregionesList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.subregion-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  opacity: 0;
}
.subregion-row.animate {
  animation: fadeSlideRight .32s cubic-bezier(.4,0,.2,1) calc(300ms + var(--row-i) * 40ms) both;
}

.sub-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.sub-name {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}
.sub-pct {
  font-size: 12px;
  font-weight: 700;
}
.progress-track {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width .65s cubic-bezier(.4,0,.2,1);
}
</style>
