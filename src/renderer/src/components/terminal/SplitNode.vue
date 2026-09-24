<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SplitNode as SplitNodeType } from '@renderer/stores/terminal'
import { useTerminalStore } from '@renderer/stores/terminal'
import TerminalPane from './TerminalPane.vue'

/**
 * Recursively renders a group's split tree: a leaf becomes a {@link TerminalPane}, a split becomes a
 * flex row/column of its children with a draggable divider between each pair. Divider drag rewrites
 * the split's percentage sizes through the store, so the layout survives re-renders and persists.
 */
const props = defineProps<{ node: SplitNodeType; groupId: string }>()
const store = useTerminalStore()

const activeSessionId = computed(() => store.activeGroup?.activeSessionId ?? null)
const rootEl = ref<HTMLElement | null>(null)
const dragging = ref(false)

/** Smallest share a pane may be dragged down to (percent), so no pane collapses to nothing. */
const MIN_PCT = 12

function onDividerDown(e: PointerEvent, i: number): void {
  const node = props.node
  if (node.kind !== 'split') return
  const sizes = [...node.sizes]
  const horizontal = node.direction === 'h'
  const rect = rootEl.value?.getBoundingClientRect()
  const total = (horizontal ? rect?.width : rect?.height) || 0
  if (!total) return
  const startPos = horizontal ? e.clientX : e.clientY
  const a = sizes[i]
  const b = sizes[i + 1]
  const move = (ev: PointerEvent): void => {
    const pos = horizontal ? ev.clientX : ev.clientY
    const pct = ((pos - startPos) / total) * 100
    let na = a + pct
    let nb = b - pct
    if (na < MIN_PCT) {
      nb -= MIN_PCT - na
      na = MIN_PCT
    }
    if (nb < MIN_PCT) {
      na -= MIN_PCT - nb
      nb = MIN_PCT
    }
    const next = [...sizes]
    next[i] = na
    next[i + 1] = nb
    store.resizeSplit(props.groupId, node.id, next)
  }
  const up = (): void => {
    dragging.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  dragging.value = true
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <TerminalPane
    v-if="node.kind === 'leaf'"
    :key="node.sessionId"
    :session-id="node.sessionId"
    :active="node.sessionId === activeSessionId"
  />
  <div
    v-else
    ref="rootEl"
    class="split"
    :class="[node.direction, { dragging }]"
    :style="{ flexDirection: node.direction === 'h' ? 'row' : 'column' }"
  >
    <template v-for="(child, i) in node.children" :key="child.id">
      <div class="split-child" :style="{ flex: `${node.sizes[i] ?? 1} 1 0%` }">
        <SplitNode :node="child" :group-id="groupId" />
      </div>
      <div
        v-if="i < node.children.length - 1"
        class="split-divider"
        :class="node.direction"
        role="separator"
        @pointerdown="onDividerDown($event, i)"
      />
    </template>
  </div>
</template>

<style scoped>
.split {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.split-child {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.split-divider {
  flex: none;
  background: var(--border);
  opacity: 0.6;
  touch-action: none;
  transition: background 0.12s ease, opacity 0.12s ease;
}
.split-divider.h {
  width: 6px;
  cursor: col-resize;
}
.split-divider.v {
  height: 6px;
  cursor: row-resize;
}
.split-divider:hover,
.split.dragging .split-divider {
  background: var(--accent);
  opacity: 1;
}
.split.dragging {
  user-select: none;
}
</style>
