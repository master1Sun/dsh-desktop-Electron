<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useTasksStore } from '@renderer/stores/tasks'

/**
 * Window-level progress widget, docked on the right of the menu bar (just left of the window
 * chrome).
 *
 * It reads the app-lifetime {@link useTasksStore} roll-up, so a download/install keeps
 * counting even after the panel that started it is closed. Collapsed it shows only a
 * single slim bar — the aggregate progress across every in-flight task — so it never
 * competes with the menu items for space. Hovering reveals a detail card with one card
 * per task (label, own bar, live message), which is also how a lone task is presented.
 */
const tasks = useTasksStore()
const hover = ref(false)

/**
 * Aggregate percentage for the one collapsed bar: the mean of the determinate tasks, and
 * indeterminate (null) if any task is still spinning. Doubles as the single-task value.
 */
const aggPercent = computed<number | null>(() => {
  const list = tasks.list
  if (list.some((x) => x.percent === null)) return null
  if (!list.length) return 0
  return Math.floor(list.reduce((s, x) => s + (x.percent ?? 0), 0) / list.length)
})
</script>

<template>
  <div
    v-if="tasks.active"
    class="topbar-progress"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- Collapsed: just a slim aggregate bar in a chip, docked on the right. Hover for detail. -->
    <div class="tb-bar-wrap">
      <el-progress
        class="tb-bar"
        :percentage="aggPercent ?? 0"
        :stroke-width="6"
        :show-text="false"
        :indeterminate="aggPercent === null"
        :duration="1.6"
        striped
        :striped-flow="true"
      />
    </div>

    <!-- Hover detail: one card per in-flight task, centered under the bar. -->
    <div v-if="hover" class="tb-drop" role="list">
      <div v-for="task in tasks.list" :key="task.id" class="tb-card" role="listitem">
        <div class="tb-card-head">
          <span class="tb-card-name">{{ task.label }}</span>
          <span v-if="task.percent !== null" class="tb-pct">{{ task.percent }}%</span>
          <el-icon v-else class="tb-spin"><Loading /></el-icon>
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
        <div class="tb-card-msg">{{ task.message }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topbar-progress {
  /* Docked on the right of the menu row: it flows right after the flex spacer (see MenuBar),
     sitting just left of the terminal/双屏 controls and the window chrome. Kept in the flex
     flow (not absolute-centered) so it hugs the right edge as intended. */
  position: relative;
  flex: none;
  /* Docked on the draggable menu row: keep it hoverable/clickable. */
  -webkit-app-region: no-drag;
  width: 150px;
  font-size: 12px;
  color: var(--text-dim);
  z-index: 70;
}

/* The collapsed bar sits in a faint chip so it reads as an interactive control and
   matches the network pill; the border lifts to --accent on hover. */
.tb-bar-wrap {
  padding: 3px 8px;
  border-radius: 9999px;
  background: var(--glass-chip, var(--surface-2));
  border: 1px solid var(--border);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.topbar-progress:hover .tb-bar-wrap {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.tb-bar {
  width: 100%;
}

/* Hover detail card: frosted, anchored to the widget's right edge (it lives near the window's
   right side, so it expands leftward instead of overflowing), one bordered card per task. */
.tb-drop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 240px;
  max-width: 320px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: 12px;
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset;
  -webkit-backdrop-filter: blur(26px) saturate(140%);
  backdrop-filter: blur(26px) saturate(140%);
  padding: 8px;
  z-index: 90;
  animation: tb-reveal 0.22s ease both;
}
@keyframes tb-reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tb-card {
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--glass-chip, var(--surface-2));
  border: 1px solid var(--border);
}
.tb-card + .tb-card {
  margin-top: 6px;
}
.tb-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.tb-card-name {
  font-weight: 600;
  color: var(--text);
}
.tb-card-msg {
  margin-top: 5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-pct {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--text);
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
</style>
