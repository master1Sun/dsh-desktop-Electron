<script setup lang="ts">
import { computed, markRaw, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, EditPen } from '@element-plus/icons-vue'
import { t } from '@renderer/i18n'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePagesStore } from '@renderer/stores/pages'
import { useStaleCache } from '@renderer/composables/useStaleCache'
import type { IpcResult, UsageSummary } from '@shared/types'

/**
 * The 用量 tab of the task board: a light-weight token ledger (main: runtime/diagnostics/usage.ts)
 * fed by three paths — parsed CLI usage lines, the container MCP `container_report_usage` tool and
 * manual backfills here. Costs are *estimates*: they only appear once a per-page (or default) price
 * per 1M tokens is set, and rows that only reported a combined total lean on the input side.
 */

interface Row {
  pageId: string
  name: string
  inputTokens: number
  outputTokens: number
  calls: number
  cost: number | null
}

const settingsStore = useSettingsStore()
const pagesStore = usePagesStore()

/* The summary lives in the stale cache so a remount paints the last snapshot instantly; the
   day-range select is component-local on purpose — cached rows are capped at 30 days and the
   window is re-resolved client-side, so switching 7↔30 needs no refetch. */
const summary = useStaleCache<UsageSummary | null>('panel.usage', null)
const rangeDays = ref(30)
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = (await window.container.getUsageSummary?.({})) as IpcResult<UsageSummary>
    if (res?.ok && res.data) summary.value = markRaw(res.data)
    else if (res?.error) ElMessage.error(res.error)
  } catch (err) {
    ElMessage.error((err as Error).message || t('usageMgr.msgLoadFail'))
  } finally {
    loading.value = false
  }
}

const pageName = (id: string): string => pagesStore.pages.find((p) => p.id === id)?.name || id

const pricing = computed(() => settingsStore.settings.usagePricing ?? {})

/** One price row's cost; null when neither an override nor the default covers the page. */
function costOf(pageId: string, inputTokens: number, outputTokens: number): number | null {
  const pr = pricing.value[pageId] ?? pricing.value.default
  if (!pr) return null
  return (inputTokens * pr.input + outputTokens * pr.output) / 1_000_000
}

const fmtTokens = (n: number): string => n.toLocaleString()
const fmtCost = (v: number): string =>
  v > 0 && v < 0.01 ? `<${(0.01).toFixed(2)}` : `$${v.toFixed(2)}`

const since = computed(() => Date.now() - rangeDays.value * 86_400_000)

const rows = computed<Row[]>(() =>
  (summary.value?.byPage ?? [])
    .filter((p) => {
      // byPage is summed over the fetched window; keep a page out if all its rows are older.
      const s = summary.value
      if (!s) return false
      return s.rows.some((r) => r.pageId === p.pageId && r.ts >= since.value)
    })
    .map((p) => ({
      pageId: p.pageId,
      name: pageName(p.pageId),
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      calls: p.calls,
      cost: costOf(p.pageId, p.inputTokens, p.outputTokens)
    }))
)

const totals = computed(() => {
  let input = 0
  let output = 0
  let cost = 0
  let costPartial = false
  for (const r of rows.value) {
    input += r.inputTokens
    output += r.outputTokens
    if (r.cost != null) cost += r.cost
    else costPartial = true
  }
  return { input, output, cost: costPartial && cost === 0 ? null : cost }
})

/* Per-day bars: re-aggregated client-side over the raw rows so the 7/30 switch is instant. */
const days = computed(() => {
  const s = summary.value
  if (!s) return []
  const byDay = new Map<string, { inputTokens: number; outputTokens: number }>()
  for (const r of s.rows) {
    if (r.ts < since.value) continue
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(r.ts)
    const d = byDay.get(day) ?? { inputTokens: 0, outputTokens: 0 }
    d.inputTokens += r.inputTokens || 0
    d.outputTokens += r.outputTokens || 0
    byDay.set(day, d)
  }
  const list = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, d]) => ({ day, ...d, total: d.inputTokens + d.outputTokens }))
  const max = Math.max(1, ...list.map((d) => d.total))
  return list.map((d) => ({ ...d, pct: (d.total / max) * 100 }))
})

/* ---- pricing editor ----
   A compact key/value grid over settings.usagePricing: `default` plus per-page overrides.
   Drafts are plain strings so a half-typed figure never patches the store; `change` commits. */
interface PriceRow {
  key: string
  input: string
  output: string
}
const priceRows = ref<PriceRow[]>([])
function rebuildPriceRows(): void {
  const p = pricing.value
  const keys = [...new Set(['default', ...Object.keys(p), ...rows.value.map((r) => r.pageId)])]
  priceRows.value = keys.map((key) => ({
    key,
    input: p[key]?.input != null ? String(p[key].input) : '',
    output: p[key]?.output != null ? String(p[key].output) : ''
  }))
}
/** Pages a price can still be added for (not already a row) — the 按页覆盖 picker's options. */
const pagesWithoutPrice = computed(() =>
  pagesStore.pages.filter((pg) => !priceRows.value.some((r) => r.key === pg.id))
)
const addPageId = ref('')

function numeric(v: string): number | undefined {
  if (!v.trim()) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

async function commitPrices(): Promise<void> {
  const next: Record<string, { input: number; output: number }> = {}
  for (const r of priceRows.value) {
    const input = numeric(r.input)
    const output = numeric(r.output)
    if (input === undefined && output === undefined) continue
    next[r.key] = { input: input ?? 0, output: output ?? 0 }
  }
  try {
    await settingsStore.patch({ usagePricing: next })
    ElMessage.success(t('usageMgr.msgPriceSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message || t('usageMgr.msgPriceFail'))
  }
}

function removePriceRow(key: string): void {
  priceRows.value = priceRows.value.filter((r) => r.key !== key)
  void commitPrices()
}

function addPriceRow(): void {
  const id = addPageId.value
  if (!id) return
  priceRows.value.push({ key: id, input: '', output: '' })
  addPageId.value = ''
}

/* ---- manual backfill ----
   The escape hatch for an agent whose CLI prints nothing parseable: one row, this page, now. */
const manual = reactive({ pageId: '', input: '', output: '' })
const manualSaving = ref(false)
async function submitManual(): Promise<void> {
  const input = Number(manual.input)
  const output = Number(manual.output)
  if (
    !manual.pageId ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  ) {
    ElMessage.warning(t('usageMgr.manualNeedFields'))
    return
  }
  manualSaving.value = true
  try {
    const res = (await window.container.reportUsage?.({
      pageId: manual.pageId,
      inputTokens: Math.round(input),
      outputTokens: Math.round(output),
      source: 'manual'
    })) as IpcResult<boolean>
    if (!res?.ok) throw new Error(res?.error || t('usageMgr.msgManualFail'))
    ElMessage.success(t('usageMgr.msgManualOk'))
    manual.input = ''
    manual.output = ''
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message || t('usageMgr.msgManualFail'))
  } finally {
    manualSaving.value = false
  }
}

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.load().catch(() => undefined)
  if (!pagesStore.pages.length) void pagesStore.refresh().catch(() => undefined)
  rebuildPriceRows()
  void load()
})
</script>

<template>
  <div v-loading="loading && !summary" class="usage-stats">
    <div class="us-head">
      <span class="us-title">{{ t('usageMgr.title') }}</span>
      <el-radio-group v-model="rangeDays" size="small">
        <el-radio-button :value="7">{{ t('usageMgr.range7') }}</el-radio-button>
        <el-radio-button :value="30">{{ t('usageMgr.range30') }}</el-radio-button>
      </el-radio-group>
      <el-button size="small" text :icon="EditPen" @click="load">{{
        t('common.refresh')
      }}</el-button>
    </div>
    <div class="us-hint">{{ t('usageMgr.hint') }}</div>

    <el-table v-if="rows.length" :data="rows" size="small" class="us-table">
      <el-table-column
        :prop="'name'"
        :label="t('usageMgr.colPage')"
        min-width="120"
        show-overflow-tooltip
      />
      <el-table-column :label="t('usageMgr.colInput')" width="120" align="right">
        <template #default="{ row }">{{ fmtTokens(row.inputTokens) }}</template>
      </el-table-column>
      <el-table-column :label="t('usageMgr.colOutput')" width="120" align="right">
        <template #default="{ row }">{{ fmtTokens(row.outputTokens) }}</template>
      </el-table-column>
      <el-table-column :label="t('usageMgr.colCalls')" width="80" align="right" prop="calls" />
      <el-table-column :label="t('usageMgr.colCost')" width="100" align="right">
        <template #default="{ row }">{{ row.cost == null ? '-' : fmtCost(row.cost) }}</template>
      </el-table-column>
    </el-table>
    <div v-else class="us-empty">{{ t('usageMgr.empty') }}</div>

    <div v-if="rows.length" class="us-total">
      {{ t('usageMgr.total', { in: fmtTokens(totals.input), out: fmtTokens(totals.output) }) }}
      <span v-if="totals.cost != null"> · {{ fmtCost(totals.cost) }} USD</span>
      <span v-else> · {{ t('usageMgr.noPricing') }}</span>
    </div>

    <!-- Per-day bars: the same well/border skin as the resource trend charts. -->
    <div v-if="days.length" class="us-chart glass-soft">
      <div class="us-chart-title">{{ t('usageMgr.byDay') }}</div>
      <div class="us-bars">
        <el-tooltip
          v-for="d in days"
          :key="d.day"
          :content="`${d.day} · ${t('usageMgr.colInput')} ${fmtTokens(d.inputTokens)} / ${t('usageMgr.colOutput')} ${fmtTokens(d.outputTokens)}`"
          placement="top"
          :show-after="120"
          popper-class="dsh-tip-popper"
        >
          <div class="us-bar-slot">
            <div class="us-bar" :style="{ height: Math.max(2, d.pct) + '%' }" />
            <div class="us-bar-day">{{ d.day.slice(5) }}</div>
          </div>
        </el-tooltip>
      </div>
    </div>

    <!-- Pricing + manual backfill: the ledger stays honest without them, but costs need prices. -->
    <section class="us-block glass-soft">
      <div class="us-block-title">{{ t('usageMgr.pricingTitle') }}</div>
      <div class="us-hint">{{ t('usageMgr.pricingHint') }}</div>
      <div v-for="r in priceRows" :key="r.key" class="us-price-row">
        <span class="us-price-key">{{
          r.key === 'default' ? t('usageMgr.priceDefault') : pageName(r.key)
        }}</span>
        <el-input
          v-model="r.input"
          size="small"
          class="us-price-in"
          :placeholder="t('usageMgr.priceInput')"
          @change="commitPrices"
        />
        <el-input
          v-model="r.output"
          size="small"
          class="us-price-in"
          :placeholder="t('usageMgr.priceOutput')"
          @change="commitPrices"
        />
        <el-button
          v-if="r.key !== 'default'"
          size="small"
          text
          type="danger"
          :icon="Delete"
          :aria-label="t('usageMgr.priceRemove')"
          @click="removePriceRow(r.key)"
        />
      </div>
      <div class="us-price-add">
        <el-select
          v-model="addPageId"
          size="small"
          class="us-price-pick"
          :placeholder="t('usageMgr.priceAddPage')"
          filterable
        >
          <el-option v-for="p in pagesWithoutPrice" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-button size="small" :icon="Plus" @click="addPriceRow">{{
          t('usageMgr.priceAdd')
        }}</el-button>
      </div>
    </section>

    <section class="us-block glass-soft">
      <div class="us-block-title">{{ t('usageMgr.manualTitle') }}</div>
      <div class="us-hint">{{ t('usageMgr.manualHint') }}</div>
      <div class="us-manual-row">
        <el-select
          v-model="manual.pageId"
          size="small"
          class="us-price-pick"
          :placeholder="t('usageMgr.manualPage')"
          filterable
        >
          <el-option v-for="p in pagesStore.pages" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-input
          v-model="manual.input"
          size="small"
          class="us-price-in"
          :placeholder="t('usageMgr.colInput')"
        />
        <el-input
          v-model="manual.output"
          size="small"
          class="us-price-in"
          :placeholder="t('usageMgr.colOutput')"
        />
        <el-button size="small" type="primary" :loading="manualSaving" @click="submitManual">
          {{ t('usageMgr.manualAdd') }}
        </el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.usage-stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.us-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.us-title {
  font-size: 13px;
  font-weight: 600;
}
.us-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
}
.us-empty {
  font-size: 12px;
  color: var(--text-dim);
  padding: 14px 0;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: 8px;
}
.us-table {
  font-size: 12px;
}
.us-total {
  font-size: 12px;
  color: var(--text-dim);
}
.us-chart {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.us-chart-title,
.us-block-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}
.us-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 96px;
  background: var(--glass-well);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px 0;
  overflow-x: auto;
}
.us-bar-slot {
  display: flex;
  flex: 1;
  min-width: 20px;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.us-bar {
  width: 70%;
  max-width: 26px;
  border-radius: 3px 3px 0 0;
  background: color-mix(in srgb, var(--accent) 70%, transparent);
}
.us-bar:hover {
  background: var(--accent);
}
.us-bar-day {
  font-size: 9.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.us-block {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.us-price-row,
.us-manual-row,
.us-price-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.us-price-key {
  width: 120px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.us-price-in {
  width: 140px;
}
.us-price-pick {
  width: 180px;
}
</style>
