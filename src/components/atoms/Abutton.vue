<script setup>
import { Search } from 'lucide-vue-next'
</script>

<template>
  <div>
    <h1>Dashboard Pavimentación Vial</h1>
    <button class="btn-icon">
      <Search :size="16" />
    </button>
  </div>
</template>

<style>
.btn-icon {
  padding: 8px 10px;
  background-color: #018d38;
  border: none;
  border-radius: 8px;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
  box-shadow: 0 2px 6px rgba(1, 141, 56, 0.25);
  font-family: 'Prompt', sans-serif;
  font-size: 13px;
  font-weight: 500;
}

.btn-icon:hover {
  background-color: #0b5640;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(1, 141, 56, 0.35);
}

.btn-icon:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(1, 141, 56, 0.25);
}

h1 {
  color: #0b5640;
  font-family: 'Prompt', sans-serif;
  margin-bottom: 20px;
}
</style>