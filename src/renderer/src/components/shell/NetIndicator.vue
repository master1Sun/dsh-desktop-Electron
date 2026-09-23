<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Connection, Odometer, DataLine, Link } from '@element-plus/icons-vue'
import type { NetSample } from '@shared/types'
import { t } from '@renderer/i18n'

/**
 * Top-bar network widget: a signal-bar glyph whose lit steps and color encode link
 * quality derived from internet latency (green → red as latency climbs). It is the
 * only thing the bar shows; the actual ↓/↑ speeds live in the hover card. Fed by the
 * main process's shared 2s sample loop (network-bar.ts) over the OnNetSample
 * broadcast — one sampler serves every window, so popouts don't stack PowerShell probes.
 *
 * Hovering reveals a detail card: a quality badge with a large latency readout on top,
 * then icon-led rows for the local link, live speed, cumulative bytes, and the online
 * ports of running pages.
 */
const sample = ref<NetSample | null>(null)
const hover = ref(false)
let unsubscribe: (() => void) | undefined

onMounted(() => {
  // Optional-call chain like the other bridge consumers: an older preload without
  // onNetSample short-circuits to undefined and the indicator just stays empty.
  unsubscribe = window.container.onNetSample?.((s: NetSample) => {
    sample.value = s
  })
})
onBeforeUnmount(() => unsubscribe?.())

/* ---- formatting ---- */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
function fmtRate(bps: number): string {
  return `${fmtBytes(bps)}/s`
}

const has = computed(() => !!sample.value)

/* ---- link quality: latency → 4-step scale that drives color + signal bars ---- */
type Quality = 'good' | 'fair' | 'poor' | 'unknown'
const quality = computed<Quality>(() => {
  const ms = sample.value?.latencyMs
  if (ms == null) return 'unknown'
  if (ms <= 80) return 'good'
  if (ms <= 150) return 'fair'
  return 'poor'
})
const qualityClass = computed(() => `q-${quality.value}`)
/* Signal bars run a finer 4-step meter than the 3 quality colors, so the glyph
 * reads the latency gradient (a 2-bar tier now shows up in the poor band) instead of
 * jumping 3 → 1. Color stays good/fair/poor; only the lit-step count is finer. */
const barsLit = computed(() => {
  const ms = sample.value?.latencyMs
  if (ms == null) return 0 // probing: nothing lit
  if (ms <= 80) return 4
  if (ms <= 150) return 3
  if (ms <= 300) return 2
  return 1
})
const qualityLabel = computed(
  () =>
    ({
      good: t('panel.netBarQGood'),
      fair: t('panel.netBarQFair'),
      poor: t('panel.netBarQPoor'),
      unknown: t('panel.netBarLatencyProbing')
    })[quality.value]
)

const latencyText = computed(() => {
  const ms = sample.value?.latencyMs
  return ms != null ? `${ms}` : '—'
})

/* ---- detail-card rows (empty value = the row is dropped) ---- */
const localRow = computed(() => {
  const it = sample.value?.localInterface
  if (!it) return ''
  const parts: string[] = []
  // Lead with the coarse link type so "WiFi / 以太网" reads at a glance; 'other' adds no tag.
  if (it.kind === 'wifi') parts.push(t('panel.netBarKindWifi'))
  else if (it.kind === 'ethernet') parts.push(t('panel.netBarKindEthernet'))
  parts.push(it.name)
  parts.push(it.address || t('panel.netBarNoIp'))
  return parts.join(' · ')
})
const speedRow = computed(() =>
  has.value ? `↓ ${fmtRate(sample.value!.rxRateBps)}  ↑ ${fmtRate(sample.value!.txRateBps)}` : '—'
)
const totalRow = computed(() => {
  const c = sample.value?.counters
  return c ? `↓ ${fmtBytes(c.rxBytes)}  ↑ ${fmtBytes(c.txBytes)}` : ''
})
const portRows = computed(() => sample.value?.onlinePorts ?? [])
</script>

<template>
  <div
    class="net-indicator"
    :class="qualityClass"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- Trigger: a single quality-colored signal-bar glyph. Hover for the full detail. -->
    <div class="net-pill">
      <svg
        class="net-bars"
        viewBox="0 0 18 14"
        width="18"
        height="15"
        aria-hidden="true"
        :aria-label="`${qualityLabel} · ${latencyText}ms`"
      >
        <rect
          class="bar b1"
          x="0"
          y="9"
          width="3.4"
          height="5"
          rx="1"
          :class="{ on: barsLit >= 1 }"
        />
        <rect
          class="bar b2"
          x="4.9"
          y="6"
          width="3.4"
          height="8"
          rx="1"
          :class="{ on: barsLit >= 2 }"
        />
        <rect
          class="bar b3"
          x="9.8"
          y="3"
          width="3.4"
          height="11"
          rx="1"
          :class="{ on: barsLit >= 3 }"
        />
        <rect
          class="bar b4"
          x="14.6"
          y="0"
          width="3.4"
          height="14"
          rx="1"
          :class="{ on: barsLit >= 4 }"
        />
      </svg>
    </div>

    <!-- Detail card: quality header (dot + label + big latency) then icon-led rows. -->
    <div v-if="hover && sample" class="net-drop" role="tooltip">
      <div class="net-head">
        <span class="net-head-left">
          <span class="net-dot" />
          <span class="net-head-title">{{ t('panel.netBarQuality') }}</span>
          <span class="net-q-label">{{ qualityLabel }}</span>
        </span>
        <span class="net-head-ms"
          ><b>{{ latencyText }}</b
          ><i>ms</i></span
        >
      </div>

      <div class="net-rows">
        <div v-if="localRow" class="net-row">
          <el-icon class="net-ic"><Connection /></el-icon>
          <span class="net-label">{{ t('panel.netBarLocal') }}</span>
          <span class="net-value">{{ localRow }}</span>
        </div>
        <div class="net-row">
          <el-icon class="net-ic"><Odometer /></el-icon>
          <span class="net-label">{{ t('panel.netBarSpeed') }}</span>
          <span class="net-value">{{ speedRow }}</span>
        </div>
        <div v-if="totalRow" class="net-row">
          <el-icon class="net-ic"><DataLine /></el-icon>
          <span class="net-label">{{ t('panel.netTotal') }}</span>
          <span class="net-value">{{ totalRow }}</span>
        </div>
        <div class="net-row net-row-ports">
          <el-icon class="net-ic"><Link /></el-icon>
          <span class="net-label">{{ t('panel.netBarPorts') }}</span>
          <span v-if="!portRows.length" class="net-value net-dim">{{
            t('panel.netBarNoPorts')
          }}</span>
          <span v-else class="net-ports">
            <span v-for="p in portRows" :key="p.id" class="net-port"
              >{{ p.name }}:{{ p.port }}</span
            >
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.net-indicator {
  position: relative;
  display: flex;
  align-items: center;
  flex: none;
  padding: 0 4px;
  /* Docked on the draggable menu row like the progress strip: interactive. */
  -webkit-app-region: no-drag;
  cursor: default;
}

/* Quality color is inherited by the bars, dot and the header latency number. */
.net-indicator.q-good {
  --q-color: var(--ok);
}
.net-indicator.q-fair {
  --q-color: var(--warn);
}
.net-indicator.q-poor {
  --q-color: var(--err);
}
.net-indicator.q-unknown {
  --q-color: var(--text-dim);
}

.net-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--glass-chip, var(--surface-2));
  border: 1px solid var(--border);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.net-indicator:hover .net-pill {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

/* Signal bars: unlit bars are a faint wash of the quality color; lit ones full. */
.net-bars {
  flex: none;
  color: var(--q-color);
}
.net-bars .bar {
  fill: currentColor;
  opacity: 0.22;
}
.net-bars .bar.on {
  opacity: 1;
}

/* ---- hover detail card ---- */
.net-drop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 248px;
  max-width: 340px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: 12px;
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset;
  -webkit-backdrop-filter: blur(26px) saturate(140%);
  backdrop-filter: blur(26px) saturate(140%);
  overflow: hidden;
  z-index: 80;
  font-size: 12px;
  animation: net-reveal 0.22s ease both;
}

@keyframes net-reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Quality header: a soft tinted band with the dot + label on the left, latency on the right. */
.net-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: color-mix(in srgb, var(--q-color) 12%, transparent);
  border-bottom: 1px solid var(--border);
}
.net-head-left {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.net-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--q-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--q-color) 22%, transparent);
  flex: none;
}
.net-head-title {
  color: var(--text-dim);
  font-size: 12px;
}
.net-q-label {
  color: var(--q-color);
  font-weight: 700;
}
.net-head-ms {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: var(--q-color);
  font-variant-numeric: tabular-nums;
}
.net-head-ms b {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}
.net-head-ms i {
  font-style: normal;
  font-size: 11px;
  opacity: 0.8;
}

.net-rows {
  padding: 8px 12px 10px;
}
.net-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.net-row + .net-row {
  margin-top: 6px;
}
.net-ic {
  color: var(--text-dim);
  font-size: 14px;
  flex: none;
  transform: translateY(2px);
}
.net-label {
  color: var(--text-dim);
  flex: none;
  min-width: 60px;
}
.net-value {
  color: var(--text);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.net-dim {
  color: var(--text-dim);
}

/* Online ports wrap as small chips so many running pages stay readable. */
.net-row-ports {
  align-items: flex-start;
}
.net-ports {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
  flex: 1;
}
.net-port {
  background: var(--glass-chip, var(--surface-2));
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 7px;
  line-height: 17px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
