<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  FolderOpened,
  Download,
  Menu,
  VideoPlay,
  VideoPause,
  Setting,
  CopyDocument,
  Monitor,
  Document,
  SuccessFilled,
  CircleCloseFilled,
  WarningFilled,
  Loading,
  Minus
} from '@element-plus/icons-vue'
import CustomEnvEditor from './CustomEnvEditor.vue'
import { usePagesStore, type PageState } from '../stores/pages'
import { useSettingsStore } from '../stores/settings'
import { useRuntimesStore } from '../stores/runtimes'
import { CONTAINER_REPO_URL, DISPLAY_TIME_ZONE, DISPLAY_TIME_ZONE_LABEL } from '@shared/types'
import type { PageMetrics, PortCheckResult } from '@shared/types'
import { t } from '../i18n'

/** Mirror of the main-process check: a filesystem path typed where a URL was expected. */
function looksLikeLocalPath(s: string): boolean {
  return (
    /^[a-z]:[\\/]/i.test(s) || s.startsWith('\\\\') || /^\.\.?[/\\]/.test(s) || s.startsWith('/')
  )
}

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const runtimes = useRuntimesStore()
const emit = defineEmits<{ close: [] }>()

/** 页面面板竖排分类 tab：git 导入 / 目录导入 / 已安装列表。 */
const activeTab = ref('git')

/**
 * A hosted dsh/openclaw row can't start without its CLI runtime (both are provisioned on demand
 * into userData, never shipped in the slim installer). The verdict comes from the main process on
 * `PageState.runtimeMissing` — a synchronous probe it re-runs on every list — so the badge can't
 * lag the async install-status IPC or flicker during its round trip, and needs no `loaded` guard.
 */
function runtimeMissing(row: PageState): boolean {
  return row.runtimeMissing === true
}

/** terminal-kind rows open a system console instead of spawning a server */
async function runRow(row: PageState): Promise<void> {
  if (row.kind === 'terminal') {
    const res = await window.container
      .openTerminalPage(row.id)
      .catch((e) => ({ ok: false, error: String(e) }))
    if (!res.ok) ElMessage.error(res.error || t('pageMgr.msgTerminalStartFail'))
    else emit('close')
    return
  }
  await pagesStore.start(row.id).catch((err) => ElMessage.error((err as Error).message))
}

/** Same bounce App uses for a blocked page: send the user to the install guide, don't spawn. */
function guideForMissing(row: PageState): void {
  runtimes.requestGuide()
  ElMessage.warning(t('setup.runtimeMissingToast', { name: row.name }))
}

/**
 * Port-conflict recovery: a failed start that timed out on its port names the foreign
 * LISTENING process on `portHolder` — offer killing it and starting again in one click.
 */
const killing = ref<string | null>(null)
async function killHolderAndRetry(row: PageState): Promise<void> {
  const port = row.containerPort || row.port
  if (!port || killing.value) return
  killing.value = row.id
  try {
    const res = await window.container.killPortHolder(port)
    if (!res?.ok) throw new Error(res?.error || t('pageMgr.msgKillFail'))
    ElMessage.success(
      res.data
        ? t('pageMgr.msgKilled', { pid: (res.data as { pid: number }).pid })
        : t('pageMgr.msgHolderGone')
    )
    await pagesStore.start(row.id)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    killing.value = null
  }
}

const gitForm = reactive({ url: '', name: '', port: '' })
const dirForm = reactive({ path: '', name: '', port: '' })
// The in-flight import lives in the store, not here, so closing/reopening the Pages panel
// while a clone or copy runs still shows the progress bar (component state would reset).
const installing = computed(() => pagesStore.installing)

/* Live import progress (git clone / local copy) streamed from the main process. The bar is
   indeterminate while a step has no computable percentage (connecting, validating). */
const installPct = computed(() => pagesStore.installProgress?.percent ?? 0)
const installIndeterminate = computed(
  () => !pagesStore.installProgress || pagesStore.installProgress.percent == null
)
const installPhaseText = computed(() => {
  const p = pagesStore.installProgress
  return p ? t(`pageMgr.installPhase.${p.phase}`) : t('pageMgr.installPhase.preparing')
})
const installDetail = computed(() => pagesStore.installProgress?.message || '')

/** Empty means "keep whatever the project declares"; anything else must be a real port. */
function parsePort(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const n = Number(s)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(t('pageMgr.msgPortRange'))
  return n
}

async function installGit(): Promise<void> {
  const url = gitForm.url.trim()
  if (!url) {
    ElMessage.warning(t('pageMgr.msgEnterRepo'))
    return
  }
  try {
    // A local folder pasted into the URL field: import it as a copy. Only the container
    // repo itself gets adopted for git updates — a blind origin would mislead the pull.
    if (looksLikeLocalPath(url)) {
      const isContainerRepo = /[/\\]DesktopContainer(\/|$)/i.test(url)
      const id = await pagesStore.installDir(
        url,
        gitForm.name.trim() || undefined,
        parsePort(gitForm.port),
        isContainerRepo ? CONTAINER_REPO_URL : undefined
      )
      ElMessage.success(t('pageMgr.msgCopiedDir', { id }))
    } else {
      const id = await pagesStore.installGit(
        url,
        gitForm.name.trim() || undefined,
        parsePort(gitForm.port)
      )
      ElMessage.success(t('pageMgr.msgInstalledGit', { id }))
    }
    gitForm.url = ''
    gitForm.name = ''
    gitForm.port = ''
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function installDir(): Promise<void> {
  if (!dirForm.path.trim()) {
    ElMessage.warning(t('pageMgr.msgEnterLocalPath'))
    return
  }
  try {
    const id = await pagesStore.installDir(
      dirForm.path.trim(),
      dirForm.name.trim() || undefined,
      parsePort(dirForm.port)
    )
    ElMessage.success(t('pageMgr.msgCopiedDir', { id }))
    dirForm.path = ''
    dirForm.name = ''
    dirForm.port = ''
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/** Open the OS folder picker and drop the chosen absolute path into the install field. */
async function chooseDir(): Promise<void> {
  try {
    const res = await window.container.chooseDirectory()
    if (!res.ok) throw new Error(res.error || t('pageMgr.msgChooseDirFail'))
    if (res.data) dirForm.path = String(res.data)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function remove(page: PageState): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('pageMgr.msgRemoveConfirm', { id: page.id }),
      t('pageMgr.msgRemoveTitle', { name: page.name }),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    await pagesStore.remove(page.id)
    ElMessage.success(t('pageMgr.msgRemoved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

const logFor = ref<{ id: string; name: string; lines: string[] } | null>(null)
const logsVisible = ref(false)

/* ---- per-page config dialog: port override + the env dirs THIS project declares ---- */
const configFor = ref<PageState | null>(null)
const configVisible = ref(false)
const configDraft = reactive({ port: '', envs: {} as Record<string, string>, autoStart: false })
const configSaving = ref(false)

const configEnvVars = computed(() => configFor.value?.envVars ?? [])

/* ---- B2: free-form env vars, independent of the manifest's directory vars ----
   The row table itself is shared with AppManager (CustomEnvEditor); the dialog only needs a handle
   to validate and read the draft when it commits port + dirs + custom vars in one write. */
const customEnvRef = ref<InstanceType<typeof CustomEnvEditor> | null>(null)
/** Bumped per open so the editor remounts and re-seeds: a Cancel must not leave rows behind. */
const configSeq = ref(0)

/* ---- B3: port pre-flight ----
   Checking on blur turns "start failed, port taken" into a warning before the user hits 保存.
   Deliberately read-only: killing a third-party process from a config dialog is too easy to get
   wrong, and the start-failure path still offers the one-click kill + retry. */
const portProbe = ref<PortCheckResult | null>(null)

/** One line for the dialog: fail-open (probe error) reads differently from a real conflict. */
const portProbeText = computed(() => {
  const p = portProbe.value
  if (!p) return ''
  if (p.probeError) return t('pageMgr.portProbeFail')
  if (p.free) return t('pageMgr.portFreeOk', { port: p.port })
  return t('pageMgr.portBusyWarn', {
    port: p.port,
    name: p.holder?.name ?? '?',
    pid: p.holder?.pid ?? '?'
  })
})

async function probePort(): Promise<void> {
  portProbe.value = null
  let n: number | undefined
  try {
    n = parsePort(configDraft.port)
  } catch {
    return // out of range — saveConfig reports that, no point probing nonsense
  }
  if (!n) return
  try {
    const res = await window.container.checkPortFree?.(n, configFor.value?.id)
    if (res?.ok) portProbe.value = (res.data as PortCheckResult) ?? null
  } catch {
    portProbe.value = null
  }
}

function openConfig(page: PageState): void {
  configFor.value = page
  configDraft.port = String(page.containerPort || page.port || '')
  configDraft.autoStart = (settingsStore.settings.autoStartPages || []).includes(page.id)
  const stored = settingsStore.settings.pageEnvs?.[page.id] || {}
  configDraft.envs = {}
  for (const v of page.envVars ?? []) configDraft.envs[v.key] = stored[v.key] || ''
  configSeq.value += 1
  portProbe.value = null
  configVisible.value = true
}

async function saveConfig(): Promise<void> {
  const page = configFor.value
  if (!page) return
  let port: number | undefined
  const raw = configDraft.port.trim()
  if (raw) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      ElMessage.error(t('pageMgr.msgPortRange'))
      return
    }
    // 0/unset semantics: clearing the field reverts to the declared port
    port = n
  }
  // The editor is only absent when the dialog never opened, in which case there is nothing to save.
  const draft = customEnvRef.value?.collect()
  if (draft && !draft.ok) {
    ElMessage.error(draft.message)
    return
  }
  configSaving.value = true
  try {
    if (port !== (page.containerPort || undefined)) await pagesStore.setPort(page.id, port || 0)
    const next: Record<string, Record<string, string>> = JSON.parse(
      JSON.stringify(settingsStore.settings.pageEnvs || {})
    )
    const vars: Record<string, string> = {}
    for (const [k, v] of Object.entries(configDraft.envs)) vars[k] = String(v).trim()
    if (Object.keys(vars).length) next[page.id] = vars
    else delete next[page.id]
    // B2: an emptied value row deletes that variable — the only affordance that survives a
    // round trip through the settings store (an explicit `KEY: ''` would inject an empty var).
    const nextCustom: Record<string, Record<string, string>> = JSON.parse(
      JSON.stringify(settingsStore.settings.pageCustomEnvs || {})
    )
    if (draft) {
      if (Object.keys(draft.envs).length) nextCustom[page.id] = draft.envs
      else delete nextCustom[page.id]
    }
    await settingsStore.patch({ pageEnvs: next, pageCustomEnvs: nextCustom })
    // Auto-start toggle: only write when it changed, so a plain port/env edit doesn't
    // churn the sticky-pin diff. Flipping it here is an explicit user action, so main
    // records it in autoStartManual — a later 默认打开 change won't silently undo it.
    const curAuto = settingsStore.settings.autoStartPages || []
    if (configDraft.autoStart !== curAuto.includes(page.id)) {
      const nextAuto = configDraft.autoStart
        ? [...curAuto, page.id]
        : curAuto.filter((x) => x !== page.id)
      await settingsStore.patch({ autoStartPages: nextAuto })
    }
    ElMessage.success(t('pageMgr.msgConfigSaved'))
    configVisible.value = false
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    configSaving.value = false
  }
}

async function openTerminal(page: PageState): Promise<void> {
  try {
    await pagesStore.openTerminal(page.id, page.name)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function showLogs(page: PageState): Promise<void> {
  const lines = await pagesStore.logs(page.id)
  logFor.value = { id: page.id, name: page.name, lines }
  logsVisible.value = true
}

function refreshLogs(): void {
  if (logFor.value) pagesStore.logs(logFor.value.id).then((l) => (logFor.value!.lines = l))
}

/** the page state backing the open log dialog — exposes status / exitCode / lastError for the detail header */
const logPage = computed(() => pagesStore.pages.find((p) => p.id === logFor.value?.id))

let logTimer: number | undefined
watch(logsVisible, (open) => {
  window.clearInterval(logTimer)
  if (open) logTimer = window.setInterval(refreshLogs, 1500)
})
onBeforeUnmount(() => window.clearInterval(logTimer))

function statusText(s?: string): string {
  return (
    {
      running: t('pageMgr.statusRunning'),
      starting: t('pageMgr.statusStarting'),
      error: t('pageMgr.statusError'),
      stopped: t('pageMgr.statusStopped')
    }[s ?? ''] ??
    s ??
    t('pageMgr.unknown')
  )
}

function statusColor(s?: string): string {
  return (
    {
      running: 'var(--ok)',
      starting: 'var(--warn)',
      error: 'var(--err)',
      stopped: 'var(--text-dim)'
    }[s ?? ''] ?? 'var(--text-dim)'
  )
}

function formatTime(ms: number): string {
  try {
    // Render in the shared display zone (not the OS timezone) and append its label so a
    // user in another region can't misread a bare wall-clock as their local time.
    const text = new Date(ms).toLocaleString(undefined, { timeZone: DISPLAY_TIME_ZONE })
    return `${text} (${DISPLAY_TIME_ZONE_LABEL})`
  } catch {
    return String(ms)
  }
}

/* ---- #20 resource badges ----
   The main process polls every running page's CPU/RSS and pushes the snapshot here;
   we keep a local map keyed by pageId so rows refresh without a store round trip. */
const metricsMap = reactive<Record<string, PageMetrics>>({})
let offMetrics: (() => void) | undefined

/* ---- B1 resource trend ----
   Main keeps a 120-sample ring per page (≈10 min at its 5 s cadence) and hands it over once on
   mount; each broadcast then appends locally, so the curve advances without a second round trip
   per tick. History for a page that drops out of the snapshot is discarded, matching main. */
const HISTORY_CAP = 120
const historyMap = reactive<Record<string, PageMetrics[]>>({})

function appendHistory(list: PageMetrics[]): void {
  const live = new Set(list.map((m) => m.pageId))
  for (const id of Object.keys(historyMap)) if (!live.has(id)) delete historyMap[id]
  for (const m of list) {
    const arr = historyMap[m.pageId] ?? (historyMap[m.pageId] = [])
    if (arr.length && arr[arr.length - 1].ts === m.ts) continue // a fetch can repeat the newest tick
    arr.push(m)
    if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP)
  }
}

onMounted(() => {
  offMetrics = window.container.onPageMetrics?.((list) => {
    for (const id of Object.keys(metricsMap)) delete metricsMap[id]
    for (const m of list) metricsMap[m.pageId] = m
    appendHistory(list)
  })
  window.container
    .getPageMetrics?.()
    .then((res) => {
      if (res?.ok) for (const m of (res.data as PageMetrics[]) ?? []) metricsMap[m.pageId] = m
    })
    .catch(() => undefined)
  // The trend needs the samples that piled up before this panel was ever opened.
  window.container
    .getMetricsHistory?.()
    .then((res) => {
      if (!res?.ok) return
      const map = (res.data as Record<string, PageMetrics[]>) ?? {}
      for (const [id, rows] of Object.entries(map)) historyMap[id] = rows.slice(-HISTORY_CAP)
    })
    .catch(() => undefined)
})
onBeforeUnmount(() => offMetrics?.())

function fmtCpu(v: number): string {
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1)
}

/* Sparkline geometry: a 78×18 strip inside the row badge, a 520×96 chart in the config dialog.
   Both are drawn with `preserveAspectRatio="none"`, so only the viewBox matters. */
const SPARK_W = 78
const SPARK_H = 18
const TREND_W = 520
const TREND_H = 96

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

const configHistory = computed(() =>
  configFor.value ? (historyMap[configFor.value.id] ?? []) : []
)

/** Two stacked charts rather than one dual-axis overlay: each series keeps an honest y-scale. */
const trendSeries = computed(() => {
  const rows = configHistory.value
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
const trendTimeFmt = new Intl.DateTimeFormat(undefined, {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})
const trendRange = computed(() => {
  const rows = configHistory.value
  const from = rows[0]?.ts
  const to = rows[rows.length - 1]?.ts
  if (!from || !to) return { from: '', to: '' }
  return { from: trendTimeFmt.format(from), to: trendTimeFmt.format(to) }
})
const trendMinutes = computed(() => Math.max(1, Math.round((configHistory.value.length * 5) / 60)))

/** C2: hand the row to the main process, which opens (or focuses) its own window for it. */
function canPopout(row: PageState): boolean {
  return !row.external && row.kind !== 'terminal'
}

async function popoutRow(row: PageState): Promise<void> {
  try {
    const res = await window.container.openPageWindow?.(row.id)
    if (res && !res.ok) ElMessage.error(res.error || t('common.unknownError'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/* ---- #16 health + dependency visualization ----
   `health` is pushed on PageState by the main-process health monitor while running. */
function healthLabel(row: PageState): string {
  const h = row.health
  if (!h || h.status === 'unknown') return t('pageMgr.healthUnknown')
  if (h.status === 'ok') return t('pageMgr.healthOk')
  return h.fails > 1 ? t('pageMgr.healthFails', { n: h.fails }) : t('pageMgr.healthFail')
}
function healthClass(row: PageState): string {
  const h = row.health
  if (!h || h.status === 'unknown') return 'health-unknown'
  return h.status === 'ok' ? 'health-ok' : 'health-fail'
}
interface DepView {
  id: string
  name: string
  running: boolean
}
function depsOf(row: PageState): DepView[] {
  const ids = row.dependsOn ?? []
  return ids.map((id) => {
    const p = pagesStore.pages.find((x) => x.id === id)
    return { id, name: p?.name ?? id, running: p?.status === 'running' }
  })
}
function hasDownDep(row: PageState): boolean {
  return depsOf(row).some((d) => !d.running)
}
</script>

<template>
  <div class="page-manager">
    <el-tabs v-model="activeTab" class="v-tabs" tab-position="left">
      <el-tab-pane name="git">
        <template #label>
          <span class="tab-label"
            ><el-icon><Download /></el-icon>{{ t('pageMgr.tabGit') }}</span
          >
        </template>
        <p class="hint">{{ t('pageMgr.hintGit') }}</p>
        <el-form label-position="top" @submit.prevent="installGit">
          <el-form-item :label="t('pageMgr.labelRepo')">
            <el-input
              v-model="gitForm.url"
              placeholder="https://github.com/owner/deepseek-harness.git"
              clearable
            />
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelCustomDir')">
            <el-input
              v-model="gitForm.name"
              :placeholder="t('pageMgr.placeholderDirName')"
              clearable
            />
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelPort')">
            <el-input
              v-model="gitForm.port"
              :placeholder="t('pageMgr.placeholderPort')"
              clearable
            />
          </el-form-item>
          <el-button type="primary" :loading="installing === 'git'" @click="installGit">
            {{ t('pageMgr.btnClone') }}
          </el-button>
          <div v-if="installing" class="install-progress">
            <el-progress
              :percentage="installPct"
              :indeterminate="installIndeterminate"
              :duration="1.4"
              striped
              :show-text="!installIndeterminate"
              :stroke-width="12"
            />
            <div class="ip-line">
              <span>{{ installPhaseText }}</span>
              <span v-if="installDetail" class="ip-raw">{{ installDetail }}</span>
            </div>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="dir">
        <template #label>
          <span class="tab-label"
            ><el-icon><FolderOpened /></el-icon>{{ t('pageMgr.tabDir') }}</span
          >
        </template>
        <p class="hint">{{ t('pageMgr.hintDir') }}</p>
        <el-form label-position="top" @submit.prevent="installDir">
          <el-form-item :label="t('pageMgr.labelLocalPath')">
            <el-input
              v-model="dirForm.path"
              :placeholder="t('pageMgr.placeholderLocalPath')"
              clearable
            >
              <template #prefix>
                <el-icon class="pick-dir" :title="t('common.browse')" @click="chooseDir"
                  ><FolderOpened
                /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelTargetDir')">
            <el-input
              v-model="dirForm.name"
              :placeholder="t('pageMgr.placeholderTargetDir')"
              clearable
            />
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelPort')">
            <el-input
              v-model="dirForm.port"
              :placeholder="t('pageMgr.placeholderPort')"
              clearable
            />
          </el-form-item>
          <el-button type="primary" :loading="installing === 'dir'" @click="installDir">
            {{ t('pageMgr.btnCopy') }}
          </el-button>
          <div v-if="installing" class="install-progress">
            <el-progress
              :percentage="installPct"
              :indeterminate="installIndeterminate"
              :duration="1.4"
              striped
              :show-text="!installIndeterminate"
              :stroke-width="12"
            />
            <div class="ip-line">
              <span>{{ installPhaseText }}</span>
              <span v-if="installDetail" class="ip-raw">{{ installDetail }}</span>
            </div>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="installed">
        <template #label>
          <span class="tab-label"
            ><el-icon><Menu /></el-icon>{{ t('pageMgr.tabInstalled') }}</span
          >
        </template>
        <div class="installed">
          <div class="installed-head neon">
            <span>{{ t('pageMgr.installed', { n: pagesStore.pages.length }) }}</span>
            <el-button size="small" text @click="pagesStore.refresh()">{{
              t('common.refresh')
            }}</el-button>
          </div>
          <el-table :data="pagesStore.pages" size="small" :empty-text="t('pageMgr.msgEmpty')">
            <el-table-column
              prop="name"
              :label="t('pageMgr.colName')"
              min-width="120"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                <div class="cell-name">
                  <!-- A missing runtime never "starts": keep the dot grey instead of implying
                   progress (the amber 启动中 dot used to spin forever on these rows). -->
                  <span class="status-dot" :class="runtimeMissing(row) ? 'stopped' : row.status" />
                  <!-- D1: a manifest-shipped icon when the page provides one; the plain name
                       remains the fallback (no letter glyph to fight the status dot with). -->
                  <img v-if="row.iconUrl" class="cell-icon" :src="row.iconUrl" alt="" />
                  {{ row.name }}
                </div>
                <div class="cell-sub">{{ row.description || row.dir }}</div>
                <!-- #16 health + dependency / #20 resource badges (running rows only) -->
                <div
                  v-if="
                    row.status === 'running' &&
                    (row.health || metricsMap[row.id] || row.dependsOn?.length)
                  "
                  class="cell-badges"
                >
                  <span v-if="row.health" class="health-badge" :class="healthClass(row)">
                    {{ healthLabel(row) }}
                  </span>
                  <span
                    v-if="row.dependsOn?.length"
                    class="dep-badge"
                    :class="{ 'dep-down': hasDownDep(row) }"
                    :title="
                      t('pageMgr.dependsOn', {
                        deps: depsOf(row)
                          .map((d) => d.name)
                          .join('、')
                      })
                    "
                  >
                    {{
                      t('pageMgr.dependsOn', {
                        deps: depsOf(row)
                          .map((d) => d.name)
                          .join('、')
                      })
                    }}
                  </span>
                  <span
                    v-if="metricsMap[row.id]"
                    class="metric-badge"
                    :class="{ 'metric-over': metricsMap[row.id].overLimit }"
                  >
                    <span class="mb-item">
                      {{ t('pageMgr.metricsCpu', { v: fmtCpu(metricsMap[row.id].cpu) }) }}
                      <!-- B1: the ring's shape, not just its latest value — a leak and a spike
                           look identical in a single number. -->
                      <svg
                        v-if="(historyMap[row.id]?.length ?? 0) > 1"
                        class="mb-spark"
                        :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
                        preserveAspectRatio="none"
                      >
                        <polyline
                          :points="seriesPoints(historyMap[row.id], cpuOf, SPARK_W, SPARK_H, 10)"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          vector-effect="non-scaling-stroke"
                        />
                      </svg>
                    </span>
                    ·
                    <span class="mb-item">
                      {{ t('pageMgr.metricsMem', { v: Math.round(metricsMap[row.id].memMb) }) }}
                      <svg
                        v-if="(historyMap[row.id]?.length ?? 0) > 1"
                        class="mb-spark"
                        :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
                        preserveAspectRatio="none"
                      >
                        <polyline
                          :points="seriesPoints(historyMap[row.id], memOf, SPARK_W, SPARK_H, 100)"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          vector-effect="non-scaling-stroke"
                        />
                      </svg>
                    </span>
                    <em v-if="metricsMap[row.id].overLimit">{{ t('pageMgr.metricsOver') }}</em>
                  </span>
                </div>
                <div v-if="runtimeMissing(row)" class="runtime-missing">
                  <el-button
                    size="small"
                    text
                    type="warning"
                    :title="t('setup.runtimeMissingTag')"
                    @click="guideForMissing(row)"
                  >
                    {{ t('pageMgr.installRuntime') }}
                  </el-button>
                </div>
                <div
                  v-if="row.lastError"
                  class="cell-sub err-text"
                  style="cursor: pointer"
                  :title="t('pageMgr.viewLogs')"
                  @click="showLogs(row)"
                >
                  {{ row.lastError }}
                </div>
                <el-button
                  v-if="row.portHolder && !row.external"
                  size="small"
                  type="warning"
                  plain
                  round
                  :loading="killing === row.id"
                  :title="
                    t('pageMgr.killPort', { name: row.portHolder.name, pid: row.portHolder.pid })
                  "
                  @click="killHolderAndRetry(row)"
                >
                  {{ t('pageMgr.killPortShort') }}
                </el-button>
              </template>
            </el-table-column>
            <el-table-column :label="t('pageMgr.colPort')" width="88" show-overflow-tooltip>
              <template #default="{ row }">
                <template v-if="row.external">
                  <span class="cell-sub">{{ t('pageMgr.external') }}</span>
                </template>
                <template v-else-if="row.kind === 'terminal'">
                  <span class="cell-sub">{{ t('pageMgr.terminalRunning') }}</span>
                </template>
                <template v-else-if="row.containerPort || row.port">
                  <code>:{{ row.containerPort || row.port }}</code>
                  <span v-if="row.containerPort && row.containerPort !== row.port" class="cell-sub">
                    {{ t('pageMgr.custom') }}
                  </span>
                </template>
                <span v-else class="err-text">{{ t('pageMgr.notSet') }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('pageMgr.colStatus')" width="52" align="center">
              <template #default="{ row }">
                <!-- Traffic-light status: a single colored glyph, no tag border/background.
                     Color carries the state (green/amber/red/grey), the tooltip keeps the wording. -->
                <el-icon
                  class="status-icon"
                  :class="{ 'is-spin': !runtimeMissing(row) && row.status === 'starting' }"
                  :style="{ color: runtimeMissing(row) ? 'var(--warn)' : statusColor(row.status) }"
                  :title="runtimeMissing(row) ? t('setup.missingTag') : statusText(row.status)"
                >
                  <WarningFilled v-if="runtimeMissing(row)" />
                  <SuccessFilled v-else-if="row.status === 'running'" />
                  <Loading v-else-if="row.status === 'starting'" />
                  <CircleCloseFilled v-else-if="row.status === 'error'" />
                  <Minus v-else />
                </el-icon>
              </template>
            </el-table-column>
            <el-table-column
              :label="t('pageMgr.colAction')"
              width="190"
              align="right"
              class-name="col-actions"
            >
              <template #default="{ row }">
                <!-- Icon-only actions (with tooltips): English labels used to overflow the fixed
                     360px column and clip, so the text buttons became glyphs. -->
                <el-button
                  v-if="!row.external && (row.kind === 'terminal' || row.containerPort || row.port)"
                  size="small"
                  text
                  :title="
                    row.status === 'running' ? t('pageMgr.actionStop') : t('pageMgr.actionStart')
                  "
                  :loading="pagesStore.busy[row.id]"
                  @click="
                    row.status === 'running'
                      ? pagesStore.stop(row.id)
                      : runtimeMissing(row)
                        ? guideForMissing(row)
                        : runRow(row)
                  "
                >
                  <el-icon>
                    <VideoPause v-if="row.status === 'running'" />
                    <VideoPlay v-else />
                  </el-icon>
                </el-button>
                <el-button
                  v-if="!row.external"
                  size="small"
                  text
                  :title="t('pageMgr.actionConfig')"
                  @click="openConfig(row)"
                >
                  <el-icon><Setting /></el-icon>
                </el-button>
                <!-- C2: a hosted http page only; a CLI page owns a full-surface terminal and an
                     external site has no page state to detach. -->
                <el-button
                  v-if="canPopout(row)"
                  size="small"
                  text
                  :title="t('pageMgr.popoutTip')"
                  @click="popoutRow(row)"
                >
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
                <el-button
                  size="small"
                  text
                  :title="t('pageMgr.actionTerminal')"
                  @click="openTerminal(row)"
                >
                  <el-icon><Monitor /></el-icon>
                </el-button>
                <el-button
                  size="small"
                  text
                  :title="t('pageMgr.actionLogs')"
                  @click="showLogs(row)"
                >
                  <el-icon><Document /></el-icon>
                </el-button>
                <!-- Built-in pages can't be removed: keep the slot as a dimmed icon + tooltip so
                     the row width matches the removable rows in either language. -->
                <span v-if="row.builtin" class="builtin-tag" :title="t('pageMgr.builtinTip')">
                  <el-icon><Delete /></el-icon>
                </span>
                <el-button
                  v-else
                  size="small"
                  text
                  type="danger"
                  :title="t('common.delete')"
                  @click="remove(row)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="logsVisible"
      :title="t('pageMgr.logTitle', { name: logFor?.name ?? '' })"
      width="720px"
      top="6vh"
      append-to-body
    >
      <div class="log-meta">
        <span
          >{{ t('pageMgr.logStatus') }}<b>{{ statusText(logPage?.status) }}</b></span
        >
        <span v-if="logPage?.exitCode != null"
          >{{ t('pageMgr.logExitCode') }}{{ logPage.exitCode }}</span
        >
        <span v-if="logPage?.startedAt"
          >{{ t('pageMgr.logStarted') }}{{ formatTime(logPage.startedAt) }}</span
        >
        <span v-if="logPage?.lastError" class="log-err"
          >{{ t('pageMgr.logError') }}{{ logPage.lastError }}</span
        >
      </div>
      <pre class="log-box">{{ logFor?.lines.join('\n') || t('pageMgr.logEmpty') }}</pre>
      <template #footer>
        <el-button @click="refreshLogs">{{ t('pageMgr.logRefresh') }}</el-button>
        <el-button type="primary" @click="logsVisible = false">{{
          t('pageMgr.logClose')
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="configVisible"
      :title="t('pageMgr.configTitle', { name: configFor?.name ?? '' })"
      width="560px"
      top="8vh"
      append-to-body
    >
      <el-form label-position="top" @submit.prevent="saveConfig">
        <!-- D1: manifest provenance + the non-fatal problems found while reading it. -->
        <div v-if="configFor" class="cfg-meta">
          <span v-if="configFor.version"
            >{{ t('pageMgr.manifestVersion') }} {{ configFor.version }}</span
          >
          <span v-if="configFor.author"
            >{{ t('pageMgr.manifestAuthor') }} {{ configFor.author }}</span
          >
          <span v-if="configFor.schemaVersion"
            >{{ t('pageMgr.manifestSchema') }} {{ configFor.schemaVersion }}</span
          >
          <span v-if="configFor.permissions?.length"
            >{{ t('pageMgr.manifestPerms') }} {{ configFor.permissions.join('、') }}</span
          >
        </div>
        <el-collapse v-if="configFor?.manifestWarnings?.length" class="cfg-notes">
          <el-collapse-item :title="t('pageMgr.manifestTitle')" name="manifest">
            <ul class="notes-list">
              <li v-for="w in configFor.manifestWarnings" :key="w">{{ w }}</li>
            </ul>
          </el-collapse-item>
        </el-collapse>
        <el-form-item
          v-if="configFor && configFor.kind !== 'terminal'"
          :label="t('pageMgr.configPortLabel')"
        >
          <el-input
            v-model="configDraft.port"
            :placeholder="t('pageMgr.configPortPlaceholder')"
            clearable
            @blur="probePort"
          />
          <span v-if="configFor?.port" class="cfg-hint">
            {{ t('pageMgr.configDeclaredPort', { port: configFor.port }) }}
            <template v-if="configFor.containerPort && configFor.containerPort !== configFor.port">
              {{ t('pageMgr.configPortOverride', { port: configFor.containerPort }) }}</template
            >
          </span>
          <!-- B3: a live probe of the typed port. Occupied is reported, never auto-killed —
               the destructive path stays on the failed-start row where the holder is named. -->
          <span
            v-if="portProbe"
            class="cfg-hint"
            :class="portProbe.free || portProbe.probeError ? 'ok-text' : 'err-text'"
          >
            {{ portProbeText }}
          </span>
        </el-form-item>
        <el-form-item :label="t('appmgr.autoStart')">
          <el-switch v-model="configDraft.autoStart" size="small" />
          <span class="cfg-hint">{{ t('pageMgr.configAutoStartTip') }}</span>
        </el-form-item>
        <el-form-item v-for="v in configEnvVars" :key="v.key" :label="v.label || v.key">
          <el-input
            v-model="configDraft.envs[v.key]"
            :placeholder="
              v.type === 'text'
                ? v.defaultValue
                  ? t('pageMgr.envTextDefault', { v: v.defaultValue })
                  : t('pageMgr.envTextPlaceholder')
                : v.defaultPath
                  ? t('pageMgr.configEnvPlaceholder', { path: v.defaultPath })
                  : t('pageMgr.configEnvInputPlaceholder')
            "
            clearable
          />
          <span v-if="v.description" class="cfg-hint">{{ v.description }}</span>
        </el-form-item>
        <p v-if="configFor && !configEnvVars.length" class="cfg-hint">
          {{ t('pageMgr.configNoEnv') }}
        </p>

        <!-- B2: arbitrary KEY=VALUE for this page, kept wholly separate from the declared dirs. -->
        <CustomEnvEditor
          v-if="configFor"
          :key="configSeq"
          ref="customEnvRef"
          :page-id="configFor.id"
        />

        <!-- B1: the ring main keeps for this page, drawn as two honestly-scaled stacked charts. -->
        <div v-if="trendSeries.length" class="trend">
          <div class="trend-head">
            <span>{{ t('pageMgr.trendTitle') }}</span>
            <span class="cfg-hint">{{ t('pageMgr.trendTip', { n: trendMinutes }) }}</span>
          </div>
          <div v-for="s in trendSeries" :key="s.label" class="trend-chart">
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
            <span>{{ trendRange.from }}</span>
            <span>{{ DISPLAY_TIME_ZONE_LABEL }}</span>
            <span>{{ trendRange.to }}</span>
          </div>
        </div>
        <p v-else-if="configFor" class="cfg-hint">{{ t('pageMgr.trendEmpty') }}</p>
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">{{ t('pageMgr.configCancel') }}</el-button>
        <el-button type="primary" :loading="configSaving" @click="saveConfig">{{
          t('pageMgr.configSave')
        }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* Built-in page's disabled delete glyph: a span, not an el-button, so match the sibling
   icon buttons' height + middle alignment to keep the action row on one line. */
.builtin-tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  vertical-align: middle;
  color: var(--text-dim);
  cursor: not-allowed;
  margin-left: 6px;
}
.hint {
  color: var(--text-dim);
  font-size: 13px;
  margin: 4px 0 14px;
}
.hint code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 12px;
}
.pick-dir {
  cursor: pointer;
  color: var(--text-dim);
}
.pick-dir:hover {
  color: var(--accent-strong);
}
.install-progress {
  margin-top: 12px;
  max-width: 480px;
}
.install-progress .ip-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.install-progress .ip-raw {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
  font-family: var(--mono, ui-monospace, monospace);
}
/* The panel card is ~860px wide and `label-position="top"` lets the fields stretch the whole
   way across, which reads as a broken layout. Cap the install fields to a normal form width.
   (The ⚙ config dialog is a 560px teleport rendered on <body>, so scoped styles cannot — and
   should not — reach it.) */
.page-manager :deep(.el-form-item .el-input) {
  max-width: 440px;
}
.installed {
  min-width: 0;
}
.installed-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 8px;
}
.cell-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 550;
}
.cell-sub {
  font-size: 12px;
  color: var(--text-dim);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* #16 / #20 inline badges under a running row: health, deps, CPU/RAM. */
.cell-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
}
.health-badge,
.dep-badge,
.metric-badge {
  font-size: 11px;
  line-height: 1.5;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  white-space: nowrap;
}
.health-ok {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 45%, var(--border));
}
.health-fail {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 45%, var(--border));
}
.health-unknown {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
}
.dep-badge.dep-down {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
}
.metric-badge {
  font-variant-numeric: tabular-nums;
}
.metric-badge em {
  font-style: normal;
  margin-left: 4px;
  color: var(--warn);
  font-weight: 600;
}
/* The 运行环境未安装 shortcut sits under the row name; keep it off .cell-sub's single-line
   ellipsis clipping so the button stays clickable across its full width. */
.runtime-missing {
  margin-top: 2px;
}
.runtime-missing :deep(.el-button) {
  height: auto;
  padding: 0;
  font-size: 12px;
}
.err-text {
  color: var(--err);
  font-size: 12px;
}
.cfg-hint {
  display: block;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
}
.cfg-hint code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 11.5px;
}
/* Icon-only action column: the glyphs sit on one line and keep a tight, even rhythm.
   The 6 buttons overflow the cell without an explicit clip, which el-table otherwise
   renders as a trailing "…" — so free the cell from ellipsis handling here. */
.installed :deep(.col-actions .cell) {
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
}
/* Trim icon-only buttons so all six fit without the ellipsis trigger. */
.installed :deep(.col-actions .el-button.is-text) {
  padding: 4px;
}
/* The 启动中 status glyph reads as in-progress only if it turns (standalone el-icon has no
   built-in animation, unlike el-button's loading slot). */
.is-spin {
  animation: status-spin 1s linear infinite;
}
/* Bare traffic-light glyph in the status column: sized up so the color reads at a glance. */
.status-icon {
  font-size: 18px;
  vertical-align: middle;
}
@keyframes status-spin {
  to {
    transform: rotate(360deg);
  }
}
.installed :deep(.el-table .el-button.is-text + .el-button.is-text) {
  margin-left: 2px;
}
.log-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12.5px;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.log-meta b {
  color: var(--text);
}
.log-meta .log-err {
  color: var(--err);
  font-weight: 600;
}
.log-box {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  max-height: 56vh;
  overflow: auto;
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

/* ---- D1 icon in the row name ---- */
.cell-icon {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  object-fit: contain;
}

/* ---- B1 inline sparkline in the resource badge ---- */
.metric-badge .mb-item {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.mb-spark {
  width: 34px;
  height: 11px;
  opacity: 0.85;
}

/* ---- config dialog: manifest meta, custom vars, trend ----
   Plain class selectors only — the dialog teleports to <body>, so nothing may depend on an
   ancestor inside this component. */
.ok-text {
  color: var(--ok);
  font-size: 12px;
}
.cfg-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-dim);
}
.cfg-notes {
  margin-bottom: 10px;
  border-top: none;
}
.notes-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--warn);
}
/* The custom-var table styles itself (CustomEnvEditor's own scope). */
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
  background: var(--surface-2);
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
</style>

<style>
/* ElMessageBox renders on body, so scoped styles cannot reach it. */
.port-prompt .el-input__wrapper {
  background: var(--surface-2);
  box-shadow: 0 0 0 1px var(--border) inset;
}
.port-prompt .el-input__inner {
  color: var(--text);
}
</style>
