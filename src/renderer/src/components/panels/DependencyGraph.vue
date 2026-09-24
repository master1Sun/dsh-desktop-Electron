<script setup lang="ts">
import { computed } from 'vue'
import EmptyState from '@renderer/components/base/EmptyState.vue'
import { t } from '@renderer/i18n'
import type { PageState } from '@renderer/stores/pages'

/**
 * #4: a read-only dependency topology over the installed pages. Nodes are laid out in layers
 * (a page sits one column to the right of everything it `dependsOn`), so edges always point
 * left and the boot order reads at a glance. Positions are computed on a fixed grid rather than
 * measured from the DOM, which keeps the SVG connectors deterministic and dependency-free.
 *
 * Cycles cannot appear here: the Pages panel rejects a dep set that would close a loop before
 * it is ever persisted, and `startWithDeps` cycle-checks at boot. A self/orphan dep is dropped.
 */
const props = defineProps<{ pages: PageState[] }>()

const NODE_W = 168
const NODE_H = 52
const GAP_X = 96
const GAP_Y = 22
const PAD = 16

interface GNode {
  id: string
  name: string
  status: PageState['status']
  layer: number
  x: number
  y: number
}
interface GEdge {
  from: string
  to: string
}

// Only installable, non-external pages take part; deps pointing elsewhere are ignored.
const graph = computed(() => {
  const nodes = props.pages.filter((p) => !p.external)
  const byId = new Map(nodes.map((p) => [p.id, p]))
  const depsOf = (id: string): string[] =>
    (byId.get(id)?.dependsOn ?? []).filter((d) => byId.has(d))

  // Longest-path layering memoized with a visiting guard; a back-edge (should one slip past
  // validation) resolves to layer 0 for that branch instead of recursing forever.
  const layer = new Map<string, number>()
  const visiting = new Set<string>()
  const computeLayer = (id: string): number => {
    const cached = layer.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    const deps = depsOf(id)
    const l = deps.length ? 1 + Math.max(...deps.map(computeLayer)) : 0
    visiting.delete(id)
    layer.set(id, l)
    return l
  }
  nodes.forEach((p) => computeLayer(p.id))

  const maxLayer = Math.max(0, ...[...layer.values()])
  const cols: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  // Insertion order (the store's page order) keeps a column stable across refreshes.
  nodes.forEach((p) => cols[layer.get(p.id) ?? 0].push(p.id))

  const gnodes: GNode[] = []
  cols.forEach((ids, col) => {
    ids.forEach((id, row) => {
      const p = byId.get(id)!
      gnodes.push({
        id,
        name: p.name,
        status: p.status,
        layer: col,
        x: PAD + col * (NODE_W + GAP_X),
        y: PAD + row * (NODE_H + GAP_Y)
      })
    })
  })
  const pos = new Map(gnodes.map((n) => [n.id, n]))

  const edges: GEdge[] = []
  for (const n of gnodes) for (const d of depsOf(n.id)) edges.push({ from: n.id, to: d })

  const tallest = Math.max(0, ...cols.map((c) => c.length))
  return {
    nodes: gnodes,
    edges,
    pos,
    width: PAD * 2 + (maxLayer + 1) * NODE_W + maxLayer * GAP_X,
    height: PAD * 2 + Math.max(1, tallest) * (NODE_H + GAP_Y) - GAP_Y
  }
})

const hasEdges = computed(() => graph.value.edges.length > 0)

function edgePath(e: GEdge): string {
  const a = graph.value.pos.get(e.from)
  const b = graph.value.pos.get(e.to)
  if (!a || !b) return ''
  // from = dependent (right), to = dep (left): leave the dependent's left edge, enter the
  // dep's right edge, with a horizontal-then-vertical elbow for a calm, grid-aligned look.
  const x1 = a.x
  const y1 = a.y + NODE_H / 2
  const x2 = b.x + NODE_W
  const y2 = b.y + NODE_H / 2
  const midX = x1 - (x1 - x2) / 2
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
}

function statusClass(s: PageState['status']): string {
  if (s === 'running') return 'st-running'
  if (s === 'error') return 'st-error'
  if (s === 'starting') return 'st-starting'
  return 'st-stopped'
}
</script>

<template>
  <div class="dep-graph">
    <div class="dg-hint">{{ t('depGraph.hint') }}</div>
    <EmptyState v-if="!graph.nodes.length" :description="t('depGraph.empty')" />
    <div
      v-else
      class="dg-canvas"
      :style="{ width: graph.width + 'px', height: graph.height + 'px' }"
    >
      <svg class="dg-edges" :width="graph.width" :height="graph.height">
        <defs>
          <marker id="dg-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" class="dg-arrow-head" />
          </marker>
        </defs>
        <path
          v-for="(e, i) in graph.edges"
          :key="i"
          :d="edgePath(e)"
          class="dg-edge"
          marker-end="url(#dg-arrow)"
        />
      </svg>
      <div
        v-for="n in graph.nodes"
        :key="n.id"
        class="dg-node glass-soft"
        :class="statusClass(n.status)"
        :style="{ left: n.x + 'px', top: n.y + 'px', width: NODE_W + 'px', height: NODE_H + 'px' }"
      >
        <span class="dg-dot" :class="statusClass(n.status)" />
        <span class="dg-name">{{ n.name }}</span>
        <span class="dg-layer">L{{ n.layer }}</span>
      </div>
    </div>
    <div v-if="graph.nodes.length && !hasEdges" class="dg-alone">
      {{ t('depGraph.noEdges') }}
    </div>
  </div>
</template>

<style scoped>
.dep-graph {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dg-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
}
.dg-canvas {
  position: relative;
  box-sizing: content-box;
  overflow: auto;
  max-width: 100%;
}
.dg-edges {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.dg-edge {
  fill: none;
  stroke: color-mix(in srgb, var(--accent) 45%, var(--border));
  stroke-width: 1.5;
}
.dg-arrow-head {
  fill: color-mix(in srgb, var(--accent) 60%, var(--text-dim));
}
.dg-node {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 12.5px;
  overflow: hidden;
}
.dg-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dg-layer {
  flex: none;
  font-size: 10px;
  color: var(--text-dim);
}
.dg-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
}
.dg-dot.st-running {
  background: var(--el-color-success);
}
.dg-dot.st-starting {
  background: var(--el-color-warning);
}
.dg-dot.st-error {
  background: var(--el-color-danger);
}
.dg-node.st-error {
  border-color: color-mix(in srgb, var(--el-color-danger) 45%, var(--border));
}
.dg-node.st-running {
  border-color: color-mix(in srgb, var(--el-color-success) 40%, var(--border));
}
.dg-alone {
  font-size: 11px;
  color: var(--text-dim);
}
</style>
