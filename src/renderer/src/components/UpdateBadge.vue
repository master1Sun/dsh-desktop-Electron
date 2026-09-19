<script setup lang="ts">
import { computed } from 'vue'
import { Bell, Refresh } from '@element-plus/icons-vue'
import { useUpdatesStore } from '../stores/updates'

const updates = useUpdatesStore()
const count = computed(() => updates.outdated.length)
</script>

<template>
  <div class="update-badge" :class="{ hot: count > 0 }" :title="`上次检测：${updates.lastCheckedAt ? new Date(updates.lastCheckedAt).toLocaleString() : '从未'}`">
    <el-icon v-if="updates.checking" class="spin"><Refresh /></el-icon>
    <el-icon v-else><Bell /></el-icon>
    <span v-if="count > 0">{{ count }} 个更新可用</span>
    <span v-else-if="!updates.checking && updates.results.length" class="muted">已是最新</span>
    <span v-else-if="!updates.checking" class="muted">未检测</span>
  </div>
</template>

<style scoped>
.update-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  background: var(--surface-2);
  padding: 6px 12px;
  border-radius: 999px;
}
.update-badge.hot {
  color: #b45309;
  border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
  background: color-mix(in srgb, var(--warn) 12%, var(--surface));
}
html.dark .update-badge.hot {
  color: var(--warn);
}
.muted {
  opacity: 0.8;
}
.spin {
  animation: rot 1s linear infinite;
}
@keyframes rot {
  to {
    transform: rotate(360deg);
  }
}
</style>
