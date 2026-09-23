<script setup lang="ts">
import { computed } from 'vue'
import type { PageMetrics } from '@shared/types'
import { DISPLAY_TIME_ZONE, DISPLAY_TIME_ZONE_LABEL } from '@shared/types'
import { t } from '@renderer/i18n'

/**
 * A page's resource trend: the CPU / memory ring the main process keeps (≈10 min at a 5 s
 * cadence) drawn as two honestly-scaled stacked charts. Purely presentational — the caller owns
 * the sample buffer (it subscribes to the metrics broadcast), so this stays a single, reusable
 * view for both the Pages config dialog and the Help → 资源趋势 tab.
 */
const props = defineProps<{
  /** the retained samples for one page, oldest → newest; <2 renders nothing (caller shows empty) */
  rows: PageMetrics[]
  /** render the 资源趋势 heading row (the config dialog hides it, the Help tab shows it) */
  showTitle?: boolean
}>()

/* Chart geometry: a 520×96 viewBox, drawn with preserveAspectRatio="none" so only the box matters. */
const TREND_W = 520
const TREND_H = 96

function fmtCpu(v: number): string {
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1)
}

const cpuOf = (m: PageMetrics): number => m.cpu
const memOf = (m: PageMetrics): number => m.memMb

/**
 * polyline points for one series in a w×h box, y scaled to the series' own max. `floor` is the
 * smallest peak a flat line is measured against, so an idle page doesn't pin itself to the top.
 */
function seriesPoints(
  rows: PageMetrics[],
  pick: (m: PageMetrics) => number,
  w: number,
  h: number,
  floor: number
): string {
  if (rows.length < 2) return ''
  const max = Math.max(floor, ...rows.map(pick)) || 1
  const step = w / (rows.length - 1)
  return rows
    .map(
      (m, i) =>
        `${(i * step).toFixed(1)},${(h - 1 - (Math.max(0, pick(m)) / max) * (h - 2)).toFixed(1)}`
    )
    .join(' ')
}

/** Two stacked charts rather than one dual-axis overlay: each series keeps an honest y-scale. */
const series = computed(() => {
  const rows = props.rows
  if (rows.length < 2) return []
  const last = rows[rows.length - 1]
  return [
    {
      label: t('pageMgr.trendCpu'),
      unit: '%',
      color: 'var(--accent)',
      points: seriesPoints(rows, cpuOf, TREND_W, TREND_H, 10),
      peak: fmtCpu(Math.max(10, ...rows.map(cpuOf))),
      now: fmtCpu(last.cpu)
    },
    {
      label: t('pageMgr.trendMem'),
      unit: 'MB',
      color: 'var(--warn)',
      points: seriesPoints(rows, memOf, TREND_W, TREND_H, 100),
      peak: String(Math.round(Math.max(100, ...rows.map(memOf)))),
      now: String(Math.round(last.memMb))
    }
  ]
})

/** Shared x-axis: the span the samples actually cover, in the container's display timezone. */
const timeFmt = new Intl.DateTimeFormat(undefined, {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})
const range = computed(() => {
  const rows = props.rows
  const from = rows[0]?.ts
  const to = rows[rows.length - 1]?.ts
  if (!from || !to) return { from: '', to: '' }
  return { from: timeFmt.format(from), to: timeFmt.format(to) }
})
const minutes = computed(() => Math.max(1, Math.round((props.rows.length * 5) / 60)))
</script>

<template>
  <div v-if="series.length" class="trend">
    <div v-if="showTitle" class="trend-head">
      <span>{{ t('pageMgr.trendTitle') }}</span>
      <span class="cfg-hint">{{ t('pageMgr.trendTip', { n: minutes }) }}</span>
    </div>
    <div v-for="s in series" :key="s.label" class="trend-chart">
      <div class="tc-side">
        <span>{{ s.peak }}{{ s.unit }}</span>
        <span class="tc-name" :style="{ color: s.color }">{{ s.label }}</span>
        <span>{{ s.now }}{{ s.unit }}</span>
      </div>
      <svg class="tc-svg" :viewBox="`0 0 ${TREND_W} ${TREND_H}`" preserveAspectRatio="none">
        <line
          :x1="0"
          :y1="TREND_H / 2"
          :x2="TREND_W"
          :y2="TREND_H / 2"
          stroke="var(--border)"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          stroke-dasharray="3 4"
        />
        <polyline
          :points="s.points"
          fill="none"
          :stroke="s.color"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
    <div class="tc-time">
      <span>{{ range.from }}</span>
      <span>{{ DISPLAY_TIME_ZONE_LABEL }}</span>
      <span>{{ range.to }}</span>
    </div>
  </div>
</template>

<style scoped>
.trend {
  margin-top: 10px;
}
.trend .trend-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.trend .trend-head .cfg-hint {
  margin-top: 0;
  font-weight: 400;
}
.trend-chart {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.tc-side {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 74px;
  font-size: 11px;
  color: var(--text-dim);
}
.tc-side span:first-child {
  text-align: right;
}
.tc-side span:last-child {
  text-align: right;
  font-weight: 600;
  color: var(--text);
}
.tc-name {
  text-align: center;
  font-weight: 600;
}
.tc-svg {
  flex: 1;
  height: 76px;
  min-width: 0;
  background: var(--glass-well);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.trend .tc-time {
  display: flex;
  justify-content: space-between;
  padding-left: 82px;
  font-size: 11px;
  color: var(--text-dim);
}
.cfg-hint {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-dim);
}
</style>
