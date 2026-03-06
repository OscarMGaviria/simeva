<script setup>
defineProps({
  title: { type: String, required: true },
  value: { type: [String, Number], required: true },
  unit:  { type: String, default: '' },
})
</script>

<template>
  <div class="stat-card">
    <div class="icon-wrap">
      <slot />
    </div>
    <div class="card-metric">
      <span class="card-value">{{ value }}</span>
      <span v-if="unit" class="card-unit">{{ unit }}</span>
    </div>
    <div class="card-title">{{ title }}</div>
  </div>
</template>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 14px;
  padding: 12px 10px 10px;
  box-shadow: 0 2px 12px rgba(45, 134, 83, 0.1), 0 1px 3px rgba(0,0,0,.06);
  text-align: center;
  min-width: 0;
  cursor: pointer;
  transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
}
.stat-card:hover {
  transform: translateY(-3px);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 6px 20px rgba(45, 134, 83, 0.18), 0 2px 6px rgba(0,0,0,.08);
}
.icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: rgba(212, 234, 216, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2d8653;
  margin-bottom: 1px;
}
.card-metric {
  display: flex;
  align-items: baseline;
  gap: 3px;
  line-height: 1;
}
.card-value {
  font-size: 34px;
  font-weight: 800;
  color: #2d8653;
  line-height: 1;
}
.card-unit {
  font-size: 15px;
  font-weight: 700;
  color: #2d8653;
}
.card-title {
  font-size: 10px;
  font-weight: 700;
  color: #7a8f99;
  text-transform: uppercase;
  letter-spacing: .7px;
  line-height: 1.2;
}
</style>
