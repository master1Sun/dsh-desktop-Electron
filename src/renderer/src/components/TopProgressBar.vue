<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useTasksStore } from '../stores/tasks'
import { t } from '../i18n'

/**
 * Window-level progress strip docked just under the menu bar.
 *
 * It reads the app-lifetime {@link useTasksStore} roll-up, so a download/install keeps
 * counting even after the panel that started it is closed. One task renders inline; several
 * collapse to a summary row whose per-task bars appear in a hover dropdown (the requested
 * "多个鼠标移上去下拉展示").
 */
const tasks = useTasksStore()
const hover = ref(false)

const single = computed(() => (tasks.list.length === 1 ? tasks.list[0] : null))
/** Aggregate percentage for the multi row: the mean of the computable ones; indeterminate if any task is. */
const multiPercent = computed<number | null>(() => {
  const list = tasks.list
  if (list.some((x) => x.percent === null)) return null
  if (!list.length) return 0
  return Math.floor(list.reduce((s, x) => s + (x.percent ?? 0), 0) / list.length)
})
const singlePercent = computed(() => single.value?.percent ?? null)
</script>

<template>
  <div
    v-if="tasks.active"
    class="topbar-progress"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- Single task: label + determinate/indeterminate bar + live message inline. -->
    <div v-if="single" class="tb-row" :title="single.message">
      <span class="tb-label">{{ single.label }}</span>
      <el-progress
        class="tb-bar"
        :percentage="singlePercent ?? 0"
        :stroke-width="6"
        :show-text="false"
        :indeterminate="singlePercent === null"
        :duration="1.6"
        striped
        :striped-flow="true"
      />
      <span v-if="singlePercent !== null" class="tb-pct">{{ singlePercent }}%</span>
      <span class="tb-msg">{{ single.message }}</span>
    </div>

    <!-- Multiple tasks: a compact summary; the full per-task list lives in the hover dropdown. -->
    <div v-else class="tb-row" :title="t('topbar.hoverDetail')">
      <el-icon class="tb-spin"><Loading /></el-icon>
      <span class="tb-label">{{ t('topbar.multi', { n: tasks.list.length }) }}</span>
      <el-progress
        class="tb-bar"
        :percentage="multiPercent ?? 0"
        :stroke-width="6"
        :show-text="false"
        :indeterminate="multiPercent === null"
        :duration="1.6"
        striped
        :striped-flow="true"
      />
      <span v-if="multiPercent !== null" class="tb-pct">{{ multiPercent }}%</span>
    </div>

    <div v-if="hover && tasks.list.length > 1" class="tb-drop" role="list">
      <div v-for="task in tasks.list" :key="task.id" class="tb-item" role="listitem">
        <div class="tb-item-head">
          <span class="tb-item-name">{{ task.label }}</span>
          <span v-if="task.percent !== null" class="tb-pct">{{ task.percent }}%</span>
        </div>
        <el-progress
          :percentage="task.percent ?? 0"
          :stroke-width="5"
          :show-text="false"
          :indeterminate="task.percent === null"
          :duration="1.6"
          striped
          :striped-flow="true"
        />
        <div class="tb-item-msg">{{ task.message }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topbar-progress {
  position: relative;
  /* Docked inline on the draggable menu row: keep it clickable and the hover dropdown openable. */
  -webkit-app-region: no-drag;
  /* Width-capped to roughly a quarter of the top bar so it stays a compact strip. */
  width: clamp(150px, 25%, 320px);
  flex: none;
  font-size: 12px;
  color: var(--text-dim);
}

.tb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
}

.tb-spin {
  animation: tb-rotate 1s linear infinite;
  color: var(--accent);
}
@keyframes tb-rotate {
  to {
    transform: rotate(360deg);
  }
}

.tb-label {
  flex: none;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}

.tb-bar {
  flex: 1;
  min-width: 56px;
}

.tb-pct {
  flex: none;
  width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.tb-msg {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Hover dropdown: one row per in-flight task with its own bar + message. Left-aligned and
   the same width as the bar above it (the bar is the containing block), so it reads as one
   continuous strip rather than a wider floating card. */
.tb-drop {
  position: absolute;
  top: 100%;
  left: 0;
  right: auto;
  width: 100%;
  box-sizing: border-box;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 6px;
  z-index: 90;
}

.tb-item {
  padding: 6px 8px;
  border-radius: 7px;
  transition: background 0.15s ease, color 0.15s ease;
}
.tb-item + .tb-item {
  margin-top: 2px;
}
.tb-item:hover {
  /* Translucent accent wash + frosted glass: visible in dark mode, no opaque block. */
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  -webkit-backdrop-filter: blur(8px) saturate(125%);
  backdrop-filter: blur(8px) saturate(125%);
  color: var(--accent);
}
.tb-item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.tb-item-name {
  font-weight: 600;
  color: var(--text);
}
.tb-item-msg {
  margin-top: 3px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
