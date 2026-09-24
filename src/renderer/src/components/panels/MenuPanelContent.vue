<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled, Download, Connection, Document, Tickets, TrendCharts } from '@element-plus/icons-vue'
import PageManager from '@renderer/components/panels/PageManager.vue'
import DshManager from '@renderer/components/panels/DshManager.vue'
import OpenclawManager from '@renderer/components/panels/OpenclawManager.vue'
import McpManager from '@renderer/components/panels/McpManager.vue'
import WorkspaceContext from '@renderer/components/panels/WorkspaceContext.vue'
import TaskBoard from '@renderer/components/panels/TaskBoard.vue'
import ExternalSitesManager from '@renderer/components/panels/ExternalSitesManager.vue'
import SettingsPanel from '@renderer/components/panels/SettingsPanel.vue'
import AppManager from '@renderer/components/panels/AppManager.vue'
import LogViewer from '@renderer/components/monitor/LogViewer.vue'
import ResourceTrend from '@renderer/components/monitor/ResourceTrend.vue'
import { usePagesStore } from '@renderer/stores/pages'
import { useUpdatesStore } from '@renderer/stores/updates'
import { useTasksStore } from '@renderer/stores/tasks'
import { useSettingsStore } from '@renderer/stores/settings'
import { useStaleCache } from '@renderer/composables/useStaleCache'
import type {
  BuiltinKind,
  ContainerEvent,
  EventLevel,
  IpcResult,
  ListEventsArgs,
  NodeVersionInfo,
  UpdateCheckResult,
  UpdateProgress,
  UpdateHistory,
  NetProbeResult,
  SnapshotResult,
  SystemInfo,
  NetworkStats,
  PageMetrics
} from '@shared/types'
import { DISPLAY_TIME_ZONE, DISPLAY_TIME_ZONE_LABEL, parseAppPanel } from '@shared/types'
import { t } from '@renderer/i18n'

const props = defineProps<{
  /** PanelKind or an `app:<id>` key (generic agent-app manager). */
  panel: string
  runtime: { version: string | null; ok: boolean; path: string; override?: boolean }
  runningCount: number
  totalCount: number
  /**
   * Vertical tab to open inside the help / settings panel. Lets a command-palette entry land on
   *「事件动态」directly; only ever applied when it changes, so the user can still click around.
   */
  initialTab?: string
  /**
   * IM sidebar single-pane mode: when set (and panel === 'help'), the help rail is hidden and only
   * this tab (about / updates / diagnose / events) shows on its own. Absent (classic) = full rail.
   */
  pane?: string
  /**
   * Tab rail orientation for the tabbed panels (settings / pages / dsh / help). Classic menu bar
   * leaves it unset (→ vertical left rail); the IM sidebar popup passes 'top' so the tabs sit across
   * the card header and the whole width is given to the pane below.
   */
  tabPosition?: 'left' | 'top'
}>()

const emit = defineEmits<{
  devtools: []
  'check-updates': []
  'preview-site': [url: string]
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  'open-page': [id: string]
  'open-terminal': [id: string]
  close: []
}>()

const updates = useUpdatesStore()
const pagesStore = usePagesStore()
const tasks = useTasksStore()
const settingsStore = useSettingsStore()

/* Built-in agent runtimes (DSH 本体 / OpenClaw) surface as reprovision rows. When one is
   *missing* the row reads "检测失败 / 未检测到已安装版本"; here we turn it into an install
   entry so the same 关于与更新 panel is the "随后安装" home the first-run gate points to. */
const DSH_PKG = '@deepseek-ai/dsh'
function builtinKind(row: UpdateCheckResult): BuiltinKind | null {
  if (row.source !== 'builtin' || !row.packageName) return null
  // The MCP group row carries a synthetic package name (see runtime/mcp-packages) — same
  // install-button flow as dsh/openclaw, just provisioning userData/mcp.
  if (row.packageName.startsWith('@modelcontextprotocol/')) return 'mcp'
  return row.packageName === DSH_PKG ? 'dsh' : 'openclaw'
}
function notInstalledBuiltin(row: UpdateCheckResult): boolean {
  return builtinKind(row) !== null && !row.currentVersion
}
async function installBuiltinRow(row: UpdateCheckResult): Promise<void> {
  const kind = builtinKind(row)
  if (!kind) return
  const out = await tasks.installBuiltin(kind)
  if (out) emit('check-updates')
}

/* B3 runtime rollback entry point: an upgrade that turns out worse can be re-provisioned at an
   exact version (`npm install -g <pkg>@<version>`) — the only way back once the channel moved on. */
async function provisionPinned(row: UpdateCheckResult): Promise<void> {
  const kind = builtinKind(row)
  if (!kind) return
  let version = ''
  try {
    const res = await ElMessageBox.prompt(
      t('panel.versionPrompt', { name: row.name }),
      t('panel.versionBtn'),
      {
        confirmButtonText: t('common.ok'),
        cancelButtonText: t('common.cancel'),
        inputPlaceholder: t('panel.versionPlaceholder'),
        inputValidator: (v: string) =>
          !v.trim() || /^[\w.+-]+$/.test(v.trim()) || t('panel.versionPlaceholder')
      }
    )
    version = String(res.value || '').trim()
  } catch {
    return // dismissed
  }
  const out = await tasks.installBuiltin(kind, version || undefined)
  if (out && !version) ElMessage.info(t('panel.versionLatest'))
  if (out) emit('check-updates')
}

/**
 * The container asar is already staged (updates/<commit>/app.asar + update-meta.json). Relaunching
 * hands the swap to a detached helper that replaces resources/app.asar the moment this process
 * exits and then brings the app back — so the only action left here is the restart.
 */
async function relaunchNow(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('updates.relaunchConfirm'), t('updates.relaunchTitle'), {
      type: 'warning',
      confirmButtonText: t('updates.relaunchNow'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return // user deferred — the row keeps offering 立即重启 until they restart
  }
  await window.container.relaunchApp()
}

/**
 * OTA rollback: the last in-place update left app.asar.bak (+ natives backup) behind, so a
 * row reporting canRollback offers a way back to the version we replaced. Like relaunchNow,
 * a successful call ends the process — the detached helper swaps files and relaunches.
 */
async function rollbackNow(row: UpdateCheckResult): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('panel.rollbackConfirm', { version: row.rollbackVersion || '?' }),
      t('panel.rollbackTitle'),
      {
        type: 'warning',
        confirmButtonText: t('panel.rollbackBtn'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    const res = await window.container.rollbackAsar()
    if (!res?.ok) ElMessage.error(res?.error || t('panel.rollbackFailed'))
    // ok: app.exit fires a beat later — the window is already going away.
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/* ---- builtin page reset (dsh-web / openclaw) ----
   Users can break the writable copy under pages/<id> (bad container.json, deleted files).
   Resetting re-seeds it from the bundled originals; destructive, so a warning confirm gates it. */
const resetting = ref<string | null>(null)
async function resetBuiltinRow(row: UpdateCheckResult): Promise<void> {
  if (!row.pageId || resetting.value) return
  try {
    await ElMessageBox.confirm(t('panel.resetConfirm', { name: row.name }), t('panel.resetTitle'), {
      type: 'warning',
      confirmButtonText: t('panel.resetBtn'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return // user backed out
  }
  resetting.value = row.name
  try {
    const res = await window.container.resetBuiltinPage(row.pageId)
    if (!res.ok) throw new Error(res.error || t('common.unknownError'))
    ElMessage.success(t('panel.resetDone', { name: row.name }))
    // The page list (status/port/env declarations) and the table both describe the re-seeded
    // folder now — refresh both so no surface keeps showing the broken state.
    await pagesStore.refresh().catch(() => undefined)
    await updates.check(true).catch(() => undefined)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    resetting.value = null
  }
}

/* ---- bundled-Node runtime upgrade (关于与更新) ----
   Dropdown over the official dist index (main-process fetched); installing swaps
   in a userData override, so running pages keep the old exe until they restart. */
const nodeVersions = useStaleCache<NodeVersionInfo[]>('panel.nodeVersions', [])
const nodeSel = ref('')
/** Reveal releases outside the hosted runtimes' engines range (tagged `usable:false`), so a
    user can deliberately install an off-support Node; off by default to keep the common path safe. */
const showIncompatible = ref(false)
/** Distinct from `!nodeVersions.length`: the select's spinner + an explicit error caption,
    so a failed/empty fetch never masquerades as an endless loading state. */
const nodeLoading = ref(false)
const nodeError = ref('')

async function loadNodeVersions(): Promise<void> {
  if (nodeLoading.value) return
  nodeLoading.value = true
  nodeError.value = ''
  try {
    // Optional-call: older test mocks / non-Windows builds may not expose this at all.
    const res = (await window.container.nodeListVersions?.(
      showIncompatible.value
    )) as IpcResult | null
    if (res?.ok) {
      nodeVersions.value = (res.data as NodeVersionInfo[]) || []
      if (!nodeVersions.value.length) nodeError.value = t('panel.nodeVerEmpty')
    } else {
      // The main process fetches the index over raw node https (bypassing the system proxy),
      // so a proxy/offline/cert issue surfaces here — show it instead of an empty spinner.
      nodeError.value = res?.error || t('panel.nodeVerEmpty')
    }
  } catch (err) {
    nodeError.value = (err as Error).message
  } finally {
    nodeLoading.value = false
  }
}

/** Refetch after flipping the incompatible toggle — the widened list comes from main. */
function onToggleIncompatible(): void {
  void loadNodeVersions()
}

const nodeVersionLabel = (v: NodeVersionInfo): string => {
  const base = v.lts
    ? `${v.version} · LTS ${typeof v.lts === 'string' ? v.lts : ''}`.trim()
    : v.version
  return v.usable === false ? `${base} · ${t('panel.nodeVerIncompatible')}` : base
}

async function doNodeUpdate(): Promise<void> {
  if (!nodeSel.value || updates.nodeBusy) return
  const sel = nodeVersions.value.find((v) => v.version === nodeSel.value)
  // An out-of-range version would break page spawns, so gate it behind an explicit warning.
  if (sel?.usable === false) {
    try {
      await ElMessageBox.confirm(
        t('panel.nodeIncompatibleConfirm', { v: nodeSel.value }),
        t('panel.nodeIncompatibleTitle'),
        {
          type: 'warning',
          confirmButtonText: t('panel.nodeUpdateBtn'),
          cancelButtonText: t('common.cancel')
        }
      )
    } catch {
      return // user backed out
    }
  }
  try {
    await updates.updateNode(nodeSel.value)
    await pagesStore.refresh().catch(() => undefined)
    ElMessage.success(t('panel.nodeUpdated', { v: nodeSel.value }))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function doNodeRestore(): Promise<void> {
  try {
    await updates.restoreNode()
    await pagesStore.refresh().catch(() => undefined)
    ElMessage.success(t('panel.nodeRestored'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/** 帮助面板的竖排分类 tab：关于 / 更新 / 诊断 / 日志 / 事件（与 SettingsPanel 同构）。 */
const helpTab = ref(props.pane || props.initialTab || 'about')

// A deep link arriving while the panel is already mounted must still move the rail — but only on
// an actual change, otherwise it would yank the user back every time the parent re-renders.
watch(
  () => props.initialTab,
  (tab) => {
    if (tab) helpTab.value = tab
  }
)
watch(
  () => props.pane,
  (p) => {
    if (p) helpTab.value = p
  }
)

/* ---- A1 activity timeline (帮助 → 事件动态) ----
   Cold read through IPC on demand + one live subscription while the tab is showing (the same
   lifecycle the network poll uses, so a closed panel never holds work). `events.jsonl` is the
   history; the subscription is what makes a crash appear the second it happens. */
const events = ref<ContainerEvent[]>([])
const eventFilters = reactive<{ level: '' | EventLevel; pageId: string }>({
  level: '',
  pageId: ''
})
const EVENTS_LIMIT = 300
/** Sentinel for "events not tied to a page" (container boot, OTA, downloads). */
const EVENT_PAGE_OTHER = '__other__'
const eventsLoading = ref(false)
let offEventStream: (() => void) | undefined

async function loadEvents(): Promise<void> {
  eventsLoading.value = true
  try {
    const args: ListEventsArgs = { limit: EVENTS_LIMIT }
    if (eventFilters.level) args.level = eventFilters.level
    const res = await window.container.listEvents?.(args)
    events.value = res?.ok ? (res.data as ContainerEvent[]) || [] : []
  } catch {
    /* keep whatever is already on screen */
  } finally {
    eventsLoading.value = false
  }
}

/** The page filter is applied locally: the sentinel has no server-side spelling. */
const shownEvents = computed(() => {
  const id = eventFilters.pageId
  if (!id) return events.value
  if (id === EVENT_PAGE_OTHER) return events.value.filter((e) => !e.pageId)
  return events.value.filter((e) => e.pageId === id)
})

const eventPageOptions = computed(() => {
  const ids = new Set(events.value.map((e) => e.pageId).filter(Boolean) as string[])
  return [...ids]
    .sort()
    .map((id) => ({ id, name: pagesStore.pages.find((p) => p.id === id)?.name || id }))
})

function startEventStream(): void {
  stopEventStream()
  void loadEvents()
  offEventStream = window.container.onEvent?.((ev) => {
    // Newest-first, matching listEvents; drop the tail so the list stays bounded.
    events.value = [ev, ...events.value].slice(0, EVENTS_LIMIT)
  })
}
function stopEventStream(): void {
  offEventStream?.()
  offEventStream = undefined
}
watch(
  () => [props.panel, helpTab.value] as const,
  ([panel, tab]) => {
    const open = panel === 'help'
    if (open && tab === 'events') startEventStream()
    else stopEventStream()
    if (open && tab === 'trend') startTrend()
    else stopTrend()
  }
)
onBeforeUnmount(() => {
  stopEventStream()
  stopTrend()
})

/* ---- B1 resource trend (帮助 → 资源趋势) ----
   Same ring the Pages rows read: main pushes a snapshot every 5 s and hands over the retained
   history once on open. The panel owns the buffer (not a per-page config dialog now) so one tab
   shows any page's curve; it only subscribes while the tab is showing, mirroring the event stream. */
const TREND_CAP = 120
const trendHistory = reactive<Record<string, PageMetrics[]>>({})
const trendPageId = ref('')
let offTrendMetrics: (() => void) | undefined

/** Pages with samples, ordered by the page list so the dropdown is stable, not insertion-order. */
const trendOptions = computed(() => {
  const withData = new Set(Object.keys(trendHistory))
  return pagesStore.pages.filter((p) => withData.has(p.id)).map((p) => ({ id: p.id, name: p.name }))
})
const trendRows = computed(() => trendHistory[trendPageId.value] ?? [])

function mergeTrendSample(m: PageMetrics): void {
  const arr = trendHistory[m.pageId] ?? (trendHistory[m.pageId] = [])
  if (arr.length && arr[arr.length - 1].ts === m.ts) return
  arr.push(m)
  if (arr.length > TREND_CAP) arr.splice(0, arr.length - TREND_CAP)
}
/** Keep the selection pointed at a page that still has data (a stopped page drops out of the ring). */
function ensureTrendSelection(): void {
  const opts = trendOptions.value
  if (!opts.length) {
    trendPageId.value = ''
    return
  }
  if (!opts.some((o) => o.id === trendPageId.value)) trendPageId.value = opts[0].id
}

function startTrend(): void {
  stopTrend()
  window.container
    .getMetricsHistory?.()
    .then((res) => {
      if (!res?.ok) return
      const map = (res.data as Record<string, PageMetrics[]>) ?? {}
      for (const [id, rows] of Object.entries(map)) trendHistory[id] = rows.slice(-TREND_CAP)
      ensureTrendSelection()
    })
    .catch(() => undefined)
  offTrendMetrics = window.container.onPageMetrics?.((list) => {
    const live = new Set((list as PageMetrics[]).map((m) => m.pageId))
    for (const id of Object.keys(trendHistory)) if (!live.has(id)) delete trendHistory[id]
    for (const m of list as PageMetrics[]) mergeTrendSample(m)
    ensureTrendSelection()
  })
}
function stopTrend(): void {
  offTrendMetrics?.()
  offTrendMetrics = undefined
}

/* Each event kind interpolates from `evt.<kind>`; an unknown kind (a newer container wrote it)
   still reads as its raw id plus the technical detail rather than a bare key. */
function eventText(ev: ContainerEvent): string {
  const params: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(ev.meta || {})) params[k] = String(v)
  const sentence = t(`evt.${ev.kind}`, params)
  return sentence === `evt.${ev.kind}` ? ev.kind : sentence
}

function eventGroup(ev: ContainerEvent): string {
  const prefix = ev.kind.split('.')[0]
  const label = t(`evt.group.${prefix}`)
  return label === `evt.group.${prefix}` ? t('evt.group.unknown') : label
}

/* Timeline rows carry the wall-clock in the same zone every log stamp uses, so a row can be
   lined up against main.log by eye. */
const eventTimeFmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: DISPLAY_TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})
function eventTime(ev: ContainerEvent): string {
  return `${eventTimeFmt.format(new Date(ev.ts))} ${DISPLAY_TIME_ZONE_LABEL}`
}

const logFocus = ref<string>()

/** Mirror of the main-process page-log file naming (`logger.logPageLine`). */
const pageLogKey = (id: string): string => `pages/${id.replace(/[^\w.-]/g, '_')}.log`

/** Jump a timeline row to its log: the container-wide rows land on main.log. */
async function jumpToLog(ev: ContainerEvent): Promise<void> {
  const key = ev.pageId ? pageLogKey(ev.pageId) : 'main'
  // Clear first so re-clicking the same page still re-reads (the prop did not "change").
  logFocus.value = ''
  helpTab.value = 'logs'
  await nextTick()
  logFocus.value = key
}

function openLogDir(): void {
  void window.container.openLogsDir?.()
}

/* ---- A2 release channels ---- */
// Container OTA is fixed to the stable `release` branch (no UI switch); only DSH is selectable.
const dshChannel = computed(() => settingsStore.settings.dshChannel || 'alpha')

async function setChannel(value: string): Promise<void> {
  try {
    await settingsStore.patch({ dshChannel: value as 'alpha' | 'latest' })
    ElMessage.success(t('panel.channelSaved'))
    // The channel switch changes what the next probe should fetch *and* what "up to date"
    // means, so main re-surveys; force a check so the table reflects it at once.
    emit('check-updates')
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

onMounted(() => {
  if (props.panel !== 'help') return
  void loadNodeVersions()
  void loadHistory()
  void loadSystemInfo()
})

/** `app:<id>` → the page id for the generic AppManager, else null. */
const appId = computed(() => parseAppPanel(props.panel))

const statusLabel = (r: UpdateCheckResult): string =>
  notInstalledBuiltin(r)
    ? t('setup.missingTag')
    : r.pendingRestart
      ? t('panel.statusPendingRestart')
      : r.ok
        ? r.hasUpdate
          ? t('panel.statusHasUpdate')
          : t('panel.statusUpToDate')
        : r.error || t('panel.statusFailed')

const statusType = (r: { ok: boolean; hasUpdate?: boolean }): string =>
  !r.ok ? 'info' : r.hasUpdate ? 'warning' : 'success'

/** Short provenance tag for built-in rows so they read apart from git repos. Routed through
    builtinKind (package-name based) instead of a name match: the MCP group row's bilingual
    name contains neither 'DSH' nor 'OpenClaw', and used to fall through to the OpenClaw tag. */
const BUILTIN_TAGS: Record<BuiltinKind, string> = {
  dsh: 'DeepSeek Harness',
  openclaw: 'OpenClaw',
  mcp: 'MCP'
}
const sourceTag = (r: UpdateCheckResult): string | null =>
  r.source === 'builtin'
    ? r.action === 'none'
      ? t('panel.tagBuiltin')
      : BUILTIN_TAGS[builtinKind(r) ?? 'openclaw']
    : null

/** The middle column shows a branch for git rows, the registry latest for version rows. */
const refLabel = (r: { source?: string; branch?: string; latestVersion?: string }): string =>
  r.source && r.source !== 'git' ? r.latestVersion || '' : r.branch || ''

/**
 * Subtitle under the name: a labelled version pair as soon as a row carries any version —
 * npm/built-in rows always do, and so does the container's own OTA row, which downloads
 * the new app.asar from a git *release branch* and so used to fall through to its install
 * dir under the old git-vs-npm test. A plain local git checkout has no versions at all and
 * still reads as its folder.
 */
const subLabel = (r: {
  dir: string
  source?: string
  action?: string
  currentVersion?: string
  latestVersion?: string
}): string =>
  r.currentVersion || r.latestVersion || (r.source && r.source !== 'git' && r.action !== 'none')
    ? t('panel.verLocalLatest', {
        current: r.currentVersion || '?',
        latest: r.latestVersion || '?'
      })
    : r.dir

/** The container self-update streams a large app.asar: surface live download progress. */
const progressOf = (row: { name: string }): UpdateProgress | undefined =>
  updates.updating === row.name ? updates.progress[row.name] : undefined
const progressPercent = (p: UpdateProgress): number =>
  p.percent ?? (p.total && p.received ? Math.floor((p.received / p.total) * 100) : 0)
/** Indeterminate only while fetching release objects before the artifact size is known. */
const progressIndeterminate = (p: UpdateProgress): boolean =>
  p.phase === 'fetch' && p.percent === undefined

/* ---- #17 container OTA version history ----
   Small read-only table distilled from update-meta.json: what's running now, the
   staged (pending-restart) asar, the one-level rollback backup, and the last rollback. */
const history = useStaleCache<UpdateHistory | null>('panel.updateHistory', null)
async function loadHistory(): Promise<void> {
  try {
    const res = (await window.container.getUpdateHistory?.()) as IpcResult | null
    if (res?.ok) history.value = (res.data as UpdateHistory) ?? null
  } catch {
    history.value = null
  }
}
const historyRows = computed(() => {
  const h = history.value
  if (!h) return []
  const rows: { label: string; version: string; pending?: boolean }[] = []
  rows.push({ label: t('panel.historyRunning'), version: h.running })
  if (h.current && h.current !== h.running)
    rows.push({ label: t('panel.historyPending'), version: h.current, pending: true })
  if (h.backup) rows.push({ label: t('panel.historyBackup'), version: h.backup })
  if (h.rollbackFrom) rows.push({ label: t('panel.historyRollbackFrom'), version: h.rollbackFrom })
  return rows
})

/* ---- #21 network diagnostic wizard ----
   Runs the main-process probe (loopback / GitHub / npm / mirror / proxy) and lists
   each hop so the user sees exactly where the chain breaks. */
const netProbing = ref(false)
const netResult = useStaleCache<NetProbeResult | null>('panel.netProbe', null)
const netStepLabel = (id: string): string =>
  ({
    gateway: t('panel.netStepGateway'),
    github: t('panel.netStepGithub'),
    npm: t('panel.netStepNpm'),
    npmmirror: t('panel.netStepNpmmirror'),
    proxy: t('panel.netStepProxy')
  })[id] ?? id
async function runNetProbe(): Promise<void> {
  if (netProbing.value) return
  netProbing.value = true
  try {
    const res = (await window.container.runNetworkProbe?.()) as IpcResult | null
    if (res?.ok) netResult.value = (res.data as NetProbeResult) ?? null
    else ElMessage.error(res?.error || t('panel.netProbeTitle'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    netProbing.value = false
  }
}

/* ---- Help 关于与运行: system / runtime overview ----
   A one-shot snapshot pulled when the help panel mounts and re-fetched by its 刷新 button. */
const sysInfo = useStaleCache<SystemInfo | null>('panel.sysInfo', null)
const sysLoading = ref(false)
/* Copyright footer year — computed once so the About ▸ 版权 line never shows a stale year. */
const copyrightYear = new Date().getFullYear()
async function loadSystemInfo(): Promise<void> {
  if (sysLoading.value) return
  sysLoading.value = true
  try {
    // Optional-call chain: a missing/older bridge method short-circuits to null, never rejects.
    const res = (await window.container.getSystemInfo?.()) as IpcResult | null
    if (res?.ok) sysInfo.value = res.data as SystemInfo
  } catch {
    /* keep the last snapshot */
  } finally {
    sysLoading.value = false
  }
}

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
function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h ${m}m`
  if (h) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

/* ---- Help 网络与工具: live network interfaces + throughput ----
   Polled every 2s while the diagnose tab is open; the byte counters are cumulative since
   boot, so the rate is the delta between two samples over the elapsed wall-clock. The interface
   list and last rate persist across open/close, so re-opening paints the previous reading at once
   instead of an empty block until the first PowerShell sample returns. */
const netStats = useStaleCache<NetworkStats | null>('panel.netStats', null)
const netRxRate = useStaleCache<number>('panel.netRxRate', 0)
const netTxRate = useStaleCache<number>('panel.netTxRate', 0)
let netTimer: number | undefined
let netSampling = false
/** Baseline for the rate delta. Reset whenever the poll restarts so the first live tick re-baselines
 *  against a fresh sample instead of diffing an hours-old cached counter (which would smear the
 *  average over the whole gap); until then the cached rate stays on screen. */
let netPrev: NetworkStats | null = null
async function sampleNet(): Promise<void> {
  if (netSampling) return
  netSampling = true
  try {
    const res = (await window.container.getNetworkStats?.()) as IpcResult | null
    if (!res?.ok) return
    const cur = res.data as NetworkStats
    const prev = netPrev
    netPrev = cur
    netStats.value = cur
    if (prev?.counters && cur.counters) {
      const dt = (cur.sampleAt - prev.sampleAt) / 1000
      if (dt > 0) {
        netRxRate.value = Math.max(0, (cur.counters.rxBytes - prev.counters.rxBytes) / dt)
        netTxRate.value = Math.max(0, (cur.counters.txBytes - prev.counters.txBytes) / dt)
      }
    }
    // No prev yet (first tick after (re)start): keep the cached rate showing; the next tick sets it.
  } catch {
    /* a failed tick is skipped; the next one retries */
  } finally {
    netSampling = false
  }
}
function stopNetPoll(): void {
  if (netTimer) {
    clearInterval(netTimer)
    netTimer = undefined
  }
}
function startNetPoll(): void {
  stopNetPoll()
  netPrev = null
  void sampleNet()
  netTimer = window.setInterval(sampleNet, 2000)
}

// Drive the live poll only while the diagnose tab is actually showing, so we never keep
// spawning PowerShell for a hidden panel. Covers both tab switches and panel unmount.
watch(
  () => [props.panel, helpTab.value] as const,
  ([panel, tab]) => {
    if (panel === 'help' && tab === 'diagnose') startNetPoll()
    else stopNetPoll()
  }
)
onBeforeUnmount(stopNetPoll)

/* ---- #15 config snapshot / migration package ----
   Export bundles the page manifest + each container.json + relevant settings into a zip;
   import restores them onto a fresh machine. Both drive a native file dialog in main.
   The busy mode is spelled "restore" instead of the import keyword: a quote right after that
   word is what once made the bundler's CommonJS-shim splice land inside a string literal and
   fail the main-process build (guarded by test/i18n.test.ts). */
const snapshotBusy = ref<'export' | 'restore' | null>(null)
async function doExportSnapshot(): Promise<void> {
  if (snapshotBusy.value) return
  snapshotBusy.value = 'export'
  try {
    const res = (await window.container.exportSnapshot?.()) as IpcResult | null
    if (res?.ok) {
      const d = res.data as SnapshotResult | undefined
      ElMessage.success(t('panel.snapshotExported', { path: d?.path || '' }))
    } else if (res) {
      ElMessage.error(res.error || t('panel.snapshotExportFailed'))
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    snapshotBusy.value = null
  }
}
async function doImportSnapshot(): Promise<void> {
  if (snapshotBusy.value) return
  try {
    await ElMessageBox.confirm(t('panel.snapshotImportConfirm'), t('panel.importSnapshotBtn'), {
      type: 'warning',
      confirmButtonText: t('panel.importSnapshotBtn'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }
  snapshotBusy.value = 'restore'
  try {
    const res = (await window.container.importSnapshot?.()) as IpcResult | null
    if (res?.ok) {
      const d = res.data as SnapshotResult | undefined
      ElMessage.success(
        t('panel.snapshotImported', { n: d?.restoredPages?.length ?? d?.pageIds?.length ?? 0 })
      )
      await pagesStore.refresh().catch(() => undefined)
      await loadHistory()
    } else if (res) {
      ElMessage.error(res.error || t('panel.snapshotImportFailed'))
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    snapshotBusy.value = null
  }
}
</script>

<template>
  <div class="panel-content">
    <SettingsPanel
      v-if="props.panel === 'settings'"
      :tab-position="tabPosition"
      :initial-tab="props.initialTab"
      @apply-theme="emit('apply-theme', $event)"
      @preview-site="emit('preview-site', $event)"
    />

    <AppManager
      v-else-if="appId"
      :page-id="appId"
      @open-page="emit('open-page', $event)"
      @open-terminal="emit('open-terminal', $event)"
    />

    <section v-else-if="props.panel === 'pages'" class="sec">
      <PageManager :tab-position="tabPosition" @close="emit('close')" />
    </section>

    <section v-else-if="props.panel === 'external'" class="sec">
      <ExternalSitesManager @preview="emit('preview-site', $event)" />
    </section>

    <section v-else-if="props.panel === 'dsh'" class="sec">
      <DshManager :tab-position="tabPosition" />
    </section>

    <section v-else-if="props.panel === 'openclaw'" class="sec">
      <OpenclawManager />
    </section>

    <section v-else-if="props.panel === 'mcp'" class="sec">
      <McpManager />
    </section>

    <section v-else-if="props.panel === 'workspace'" class="sec">
      <WorkspaceContext />
    </section>

    <!-- 看板: palette-only page; TaskBoard owns the board / dependency-topology / call-feed tabs. -->
    <section v-else-if="props.panel === 'board'" class="sec">
      <TaskBoard :tab-position="tabPosition" />
    </section>

    <!-- Help: 关于 + 更新 + 诊断 + 日志 merged into one panel, split by a vertical tab rail. -->
    <section v-else-if="props.panel === 'help'" class="sec help" :class="{ 'single-pane': !!pane }">
      <el-tabs v-model="helpTab" class="help-tabs" :tab-position="tabPosition || 'left'">
        <el-tab-pane name="about">
          <template #label>
            <span class="tab-label"
              ><el-icon><QuestionFilled /></el-icon>{{ t('panel.tabAbout') }}</span
            >
          </template>
          <div class="kv">
            <span>{{ t('panel.aboutNode') }}</span>
            <strong :class="props.runtime.ok ? 'ok-text' : 'err-text'">
              {{ props.runtime.version || t('panel.notDetected') }}
            </strong>
            <el-tag v-if="props.runtime.override" size="small" effect="plain" round type="warning">
              {{ t('panel.nodeTagUpdated') }}
            </el-tag>
            <span class="node-update-ctl">
              <el-select
                v-model="nodeSel"
                size="small"
                filterable
                default-first-option
                :reserve-keyword="false"
                :placeholder="t('panel.nodeVersionPick')"
                :loading="nodeLoading"
                :disabled="updates.nodeBusy"
                style="width: 190px"
              >
                <el-option
                  v-for="v in nodeVersions"
                  :key="v.version"
                  :label="nodeVersionLabel(v)"
                  :value="v.version"
                  :disabled="v.version === props.runtime.version"
                />
              </el-select>
              <el-button
                size="small"
                type="primary"
                :disabled="!nodeSel || nodeSel === props.runtime.version"
                :loading="updates.nodeBusy"
                @click="doNodeUpdate"
              >
                {{ props.runtime.ok ? t('panel.nodeUpdateBtn') : t('panel.installBtn') }}
              </el-button>
              <el-tooltip
                v-if="props.runtime.override"
                :content="t('panel.nodeRestoreTip')"
                placement="top"
                popper-class="dsh-tip-popper"
              >
                <el-button
                  size="small"
                  text
                  :disabled="updates.nodeBusy"
                  @click="doNodeRestore"
                >
                  {{ t('panel.nodeRestoreBtn') }}
                </el-button>
              </el-tooltip>
              <label class="node-incompat-toggle" :title="t('panel.nodeShowIncompatibleTip')">
                <el-switch
                  v-model="showIncompatible"
                  size="small"
                  :disabled="updates.nodeBusy"
                  @change="onToggleIncompatible"
                />
                <span>{{ t('panel.nodeShowIncompatible') }}</span>
              </label>
            </span>
          </div>
          <div v-if="nodeError" class="node-load-err">
            <span class="cell-sub err-text">{{ nodeError }}</span>
            <el-button size="small" text :loading="nodeLoading" @click="loadNodeVersions">
              {{ t('panel.retry') }}
            </el-button>
          </div>
          <div v-if="updates.nodeProgress" class="upd-progress node-prog">
            <el-progress
              class="node-prog-bar"
              :percentage="updates.nodeProgress.percent ?? progressPercent(updates.nodeProgress)"
              :stroke-width="6"
              :indeterminate="
                updates.nodeProgress.phase === 'extract' ||
                (updates.nodeProgress.percent ?? progressPercent(updates.nodeProgress)) === 0
              "
              striped
              :striped-flow="updates.nodeProgress.phase === 'extract'"
            />
            <span class="cell-sub">{{ updates.nodeProgress.message }}</span>
          </div>
          <div class="kv">
            <span>{{ t('panel.aboutRuntimePath') }}</span>
            <code>{{ props.runtime.path || '-' }}</code>
          </div>
          <div class="kv">
            <span>Pages</span>
            <strong>{{
              t('panel.aboutPagesRunning', { running: props.runningCount, total: props.totalCount })
            }}</strong>
          </div>

          <!-- System / runtime overview -->
          <div class="line" />
          <div class="head">
            <span>{{ t('panel.sysTitle') }}</span>
            <el-button size="small" text :loading="sysLoading" @click="loadSystemInfo">
              {{ t('panel.sysRefresh') }}
            </el-button>
          </div>
          <div v-if="sysInfo" class="sys-grid">
            <div class="sys-row">
              <span>{{ t('panel.sysOs') }}</span>
              <code>{{ sysInfo.osType }} {{ sysInfo.osRelease }} · {{ sysInfo.arch }}</code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysHost') }}</span>
              <code>{{ sysInfo.hostname }}</code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysCpu') }}</span>
              <code>
                {{ sysInfo.cpuModel || '?' }} ·
                {{ t('panel.sysCpuCores', { n: sysInfo.cpuCores }) }}
              </code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysMem') }}</span>
              <code>{{
                t('panel.sysMemUsed', {
                  used: fmtBytes(sysInfo.totalMem - sysInfo.freeMem),
                  total: fmtBytes(sysInfo.totalMem)
                })
              }}</code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysUptime') }}</span>
              <code>{{ fmtDuration(sysInfo.osUptimeSec) }}</code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysAppUptime') }}</span>
              <code>{{ fmtDuration(sysInfo.appUptimeSec) }}</code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysLocale') }}</span>
              <code>{{ sysInfo.locale || '-' }} / {{ sysInfo.timezone || '-' }}</code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysAppVersion') }}</span>
              <code>
                {{ sysInfo.appVersion }}
                <el-tag size="small" effect="plain" round>
                  {{ sysInfo.packaged ? t('panel.packagedYes') : t('panel.packagedNo') }}
                </el-tag>
              </code>
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysRuntimes') }}</span>
              <code
                >Electron {{ sysInfo.electron }} · Chrome {{ sysInfo.chrome }} · Node
                {{ sysInfo.node }}</code
              >
            </div>
            <div class="sys-row">
              <span>{{ t('panel.sysInterfaces') }}</span>
              <code>{{ sysInfo.interfaceCount }}</code>
            </div>
            <div class="sys-row sys-wide">
              <span>{{ t('panel.sysUserData') }}</span>
              <code>{{ sysInfo.userData }}</code>
            </div>
            <div class="sys-row sys-wide">
              <span>{{ t('panel.sysInstallDir') }}</span>
              <code>{{ sysInfo.installDir }}</code>
            </div>
          </div>

          <!-- Copyright footer sits outside the v-if sys-grid so it shows even before the
               system snapshot has loaded. -->
          <div class="line" />
          <div class="about-copyright">
            {{ t('panel.copyright', { year: copyrightYear }) }}
          </div>
        </el-tab-pane>

        <el-tab-pane name="updates">
          <template #label>
            <span class="tab-label"
              ><el-icon><Download /></el-icon>{{ t('panel.tabUpdates') }}</span
            >
          </template>
          <div class="head neon">
            <span>{{ t('panel.updatesTitle') }}</span>
            <el-button size="small" :loading="updates.checking" @click="emit('check-updates')">
              {{ t('panel.checkUpdates') }}
            </el-button>
          </div>
          <!-- A2: only DSH exposes a channel switch; container OTA is locked to stable release. -->
          <div class="channel-row">
            <span class="channel-label">{{ t('panel.channelTitle') }}</span>
            <label class="channel-pick">
              {{ t('panel.channelDsh') }}
              <el-select
                size="small"
                style="width: 140px"
                :model-value="dshChannel"
                @update:model-value="(v: string) => setChannel(v)"
              >
                <el-option value="alpha" :label="t('panel.channelAlpha')" />
                <el-option value="latest" :label="t('panel.channelLatest')" />
              </el-select>
            </label>
          </div>
          <el-table :data="updates.results" size="small" :empty-text="t('panel.updatesEmpty')">
            <el-table-column :label="t('panel.colName')" min-width="200">
              <template #default="{ row }">
                <span>{{ row.name }}</span>
                <el-tag
                  v-if="row.isContainer"
                  size="small"
                  effect="plain"
                  round
                  style="margin-left: 8px"
                  >{{ t('panel.tagContainer') }}</el-tag
                >
                <el-tag
                  v-else-if="sourceTag(row)"
                  size="small"
                  effect="plain"
                  round
                  type="warning"
                  style="margin-left: 8px"
                  >{{ sourceTag(row) }}</el-tag
                >
                <div class="cell-sub">{{ subLabel(row) }}</div>
                <div v-if="progressOf(row)" class="upd-progress">
                  <el-progress
                    :percentage="progressPercent(progressOf(row)!)"
                    :stroke-width="6"
                    :show-text="false"
                    :indeterminate="progressIndeterminate(progressOf(row)!)"
                    striped
                    :striped-flow="progressIndeterminate(progressOf(row)!)"
                  />
                  <span class="cell-sub">{{ progressOf(row)?.message }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('panel.colBranch')" width="120">
              <template #default="{ row }">
                <code v-if="refLabel(row)">{{ refLabel(row) }}</code>
              </template>
            </el-table-column>
            <el-table-column :label="t('panel.colStatus')" width="120">
              <template #default="{ row }">
                <el-tag size="small" round :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('panel.colAction')" width="150" align="right">
              <template #default="{ row }">
                <div class="act-cell">
                  <el-button
                    v-if="row.pendingRestart"
                    size="small"
                    type="primary"
                    round
                    @click="relaunchNow"
                  >
                    {{ t('panel.restartNowBtn') }}
                  </el-button>
                  <el-button
                    v-else-if="notInstalledBuiltin(row)"
                    size="small"
                    type="primary"
                    round
                    :loading="tasks.busyBuiltin(builtinKind(row) || 'dsh')"
                    @click="installBuiltinRow(row)"
                  >
                    {{ t('panel.installBtn') }}
                  </el-button>
                  <el-button
                    v-else-if="row.hasUpdate && row.canAutoUpdate"
                    size="small"
                    type="primary"
                    round
                    :loading="updates.updating === row.name"
                    @click="updates.perform(row)"
                  >
                    {{ t('panel.updateBtn') }}
                  </el-button>
                  <el-button
                    v-else-if="row.isContainer && row.canRollback"
                    size="small"
                    round
                    type="warning"
                    plain
                    @click="rollbackNow(row)"
                  >
                    {{ t('panel.rollbackBtn') }}
                  </el-button>
                  <el-tooltip
                    v-else-if="row.hasUpdate"
                    :content="t('panel.manualTip')"
                    placement="top"
                  >
                    <el-button size="small" round disabled>{{ t('panel.manualBtn') }}</el-button>
                  </el-tooltip>
                  <el-button
                    v-else-if="row.pageId"
                    size="small"
                    round
                    :loading="resetting === row.name"
                    @click="resetBuiltinRow(row)"
                  >
                    {{ t('panel.resetBtn') }}
                  </el-button>
                  <!-- B3: a built-in runtime can always be re-provisioned at an exact version. -->
                  <el-button
                    v-if="builtinKind(row)"
                    size="small"
                    round
                    :disabled="tasks.busyBuiltin(builtinKind(row) || 'dsh')"
                    @click="provisionPinned(row)"
                  >
                    {{ t('panel.versionBtn') }}
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <!-- #17 container OTA version history -->
          <template v-if="historyRows.length">
            <div class="line" />
            <div class="head">
              <span>{{ t('panel.historyTitle') }}</span>
            </div>
            <div class="history-grid">
              <div v-for="r in historyRows" :key="r.label" class="history-row">
                <span class="history-label" :class="{ 'history-pending': r.pending }">{{
                  r.label
                }}</span>
                <code class="history-ver">{{ r.version }}</code>
              </div>
            </div>
          </template>
        </el-tab-pane>

        <el-tab-pane name="diagnose">
          <template #label>
            <span class="tab-label"
              ><el-icon><Connection /></el-icon>{{ t('panel.tabDiagnose') }}</span
            >
          </template>
          <!-- Live network: interfaces + real-time throughput (sampled every 2s while open) -->
          <div class="head">
            <span>{{ t('panel.netLiveTitle') }}</span>
            <el-button size="small" text :loading="!netStats" @click="sampleNet">
              {{ t('panel.netRefresh') }}
            </el-button>
          </div>
          <div v-if="netStats" class="net-live">
            <div class="net-rate">
              <span class="rate-down"
                >{{ t('panel.netRx') }} <b>{{ fmtRate(netRxRate) }}</b></span
              >
              <span class="rate-up"
                >{{ t('panel.netTx') }} <b>{{ fmtRate(netTxRate) }}</b></span
              >
              <span v-if="netStats.counters" class="rate-total cell-sub">
                {{ t('panel.netTotal') }} ↓{{ fmtBytes(netStats.counters.rxBytes) }} · ↑{{
                  fmtBytes(netStats.counters.txBytes)
                }}
              </span>
            </div>
            <div v-if="!netStats.counters" class="cell-sub">{{ t('panel.netNoCounter') }}</div>
            <div class="net-sub-label">{{ t('panel.netInterfaces') }}</div>
            <div v-if="netStats.interfaces.length" class="iface-list">
              <div
                v-for="it in netStats.interfaces"
                :key="it.name"
                class="iface-row"
                :class="{ 'iface-internal': it.internal }"
              >
                <span class="iface-name">{{ it.name }}</span>
                <code v-if="it.address" class="iface-addr">{{ it.address }}</code>
                <span v-if="it.mac" class="iface-mac cell-sub">{{ it.mac }}</span>
                <el-tag v-if="it.internal" size="small" effect="plain" round>{{
                  t('panel.netInternal')
                }}</el-tag>
              </div>
            </div>
            <div v-else class="cell-sub">{{ t('panel.netNoInterface') }}</div>
          </div>

          <div class="line" />
          <!-- #15 config snapshot / migration package -->
          <div class="head">
            <span>{{ t('panel.snapshotTitle') }}</span>
            <span class="tools-ctl">
              <el-button
                size="small"
                :loading="snapshotBusy === 'export'"
                @click="doExportSnapshot"
              >
                {{ t('panel.exportSnapshotBtn') }}
              </el-button>
              <el-button
                size="small"
                :loading="snapshotBusy === 'restore'"
                @click="doImportSnapshot"
              >
                {{ t('panel.importSnapshotBtn') }}
              </el-button>
            </span>
          </div>
          <!-- #21 network diagnostic wizard -->
          <div class="head" style="margin-top: 12px">
            <span>{{ t('panel.netProbeTitle') }}</span>
            <el-button size="small" type="primary" :loading="netProbing" @click="runNetProbe">
              {{ netResult ? t('panel.netRerun') : t('panel.netProbeBtn') }}
            </el-button>
          </div>
          <div v-if="netProbing && !netResult" class="cell-sub">{{ t('panel.netProbing') }}</div>
          <div v-if="netResult" class="net-result">
            <div class="net-summary" :class="netResult.healthy ? 'ok-text' : 'err-text'">
              {{ netResult.healthy ? t('panel.netHealthy') : t('panel.netUnhealthy') }}
            </div>
            <div v-for="s in netResult.steps" :key="s.id" class="net-step">
              <span class="net-dot" :class="s.ok ? 'net-ok' : 'net-fail'" />
              <span class="net-name">{{ netStepLabel(s.id) }}</span>
              <span v-if="s.ms != null" class="net-ms">{{ s.ms }}ms</span>
              <span v-if="s.detail" class="net-detail cell-sub">{{ s.detail }}</span>
            </div>
            <div v-if="netResult.proxy" class="net-proxy cell-sub">
              {{
                t('panel.netProxy', {
                  p:
                    [
                      netResult.proxy.https && `https=${netResult.proxy.https}`,
                      netResult.proxy.http && `http=${netResult.proxy.http}`
                    ]
                      .filter(Boolean)
                      .join(' ') ||
                    netResult.proxy.no ||
                    '-'
                })
              }}
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="logs">
          <template #label>
            <span class="tab-label"
              ><el-icon><Document /></el-icon>{{ t('panel.tabLogs') }}</span
            >
          </template>
          <div class="head">
            <span>{{ t('panel.logViewerTitle') }}</span>
          </div>
          <LogViewer :focus-key="logFocus" />
        </el-tab-pane>

        <!-- B1: the CPU / memory ring main keeps per page, relocated out of the page config dialog
             into its own tab so a running page's trend is one click away, no dialog needed. -->
        <el-tab-pane name="trend">
          <template #label>
            <span class="tab-label"
              ><el-icon><TrendCharts /></el-icon>{{ t('panel.tabTrend') }}</span
            >
          </template>
          <div class="head">
            <span>{{ t('pageMgr.trendTitle') }}</span>
            <el-select
              v-model="trendPageId"
              size="small"
              style="width: 170px"
              :empty-values="[null, undefined]"
              :placeholder="t('panel.trendNoPage')"
            >
              <el-option v-for="p in trendOptions" :key="p.id" :value="p.id" :label="p.name" />
            </el-select>
          </div>
          <div class="cell-sub evt-tip">{{ t('panel.trendTip') }}</div>
          <ResourceTrend v-if="trendRows.length > 1" :rows="trendRows" />
          <div v-else class="evt-empty">{{ t('pageMgr.trendEmpty') }}</div>
        </el-tab-pane>

        <!-- A1: the crash / lifecycle timeline. Rows deep-link into the log they describe. -->
        <el-tab-pane name="events">
          <template #label>
            <span class="tab-label"
              ><el-icon><Tickets /></el-icon>{{ t('panel.tabEvents') }}</span
            >
          </template>
          <div class="head">
            <span>{{ t('panel.tabEvents') }}</span>
            <el-select
              v-model="eventFilters.level"
              size="small"
              style="width: 110px"
              @change="loadEvents"
            >
              <el-option value="" :label="t('panel.eventsLevelAll')" />
              <el-option value="info" :label="t('panel.eventsLevelInfo')" />
              <el-option value="warn" :label="t('panel.eventsLevelWarn')" />
              <el-option value="error" :label="t('panel.eventsLevelError')" />
            </el-select>
            <el-select v-model="eventFilters.pageId" size="small" style="width: 150px">
              <el-option value="" :label="t('panel.eventsPageAll')" />
              <el-option :value="EVENT_PAGE_OTHER" :label="t('panel.eventsPageOther')" />
              <el-option v-for="p in eventPageOptions" :key="p.id" :value="p.id" :label="p.name" />
            </el-select>
            <el-button size="small" :loading="eventsLoading" @click="loadEvents">
              {{ t('panel.eventsReload') }}
            </el-button>
            <el-button size="small" @click="openLogDir">{{
              t('panel.eventsOpenLogDir')
            }}</el-button>
            <span class="evt-count">{{ t('panel.eventsCount', { n: shownEvents.length }) }}</span>
          </div>
          <div class="cell-sub evt-tip">{{ t('panel.eventsTip') }}</div>
          <div v-if="!shownEvents.length" class="evt-empty">{{ t('panel.eventsEmpty') }}</div>
          <div v-else class="evt-list">
            <div
              v-for="(ev, i) in shownEvents"
              :key="`${ev.ts}-${i}`"
              class="evt-row"
              :title="t('panel.eventsJumpLog')"
              @click="jumpToLog(ev)"
            >
              <span class="evt-dot" :class="`lv-${ev.level}`" />
              <span class="evt-time">{{ eventTime(ev) }}</span>
              <el-tag
                size="small"
                effect="plain"
                round
                :title="t('panel.eventsRawKind', { kind: ev.kind })"
              >
                {{ eventGroup(ev) }}
              </el-tag>
              <span class="evt-text">
                {{ eventText(ev) }}
                <span v-if="ev.pageId" class="evt-page">{{
                  pagesStore.pages.find((p) => p.id === ev.pageId)?.name || ev.pageId
                }}</span>
                <div v-if="ev.detail" class="evt-detail cell-sub">{{ ev.detail }}</div>
              </span>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<style scoped>
.sec {
  padding: 2px;
}

/* Vertical (left) tab rail for the Help panel, mirroring SettingsPanel: a compact
   icon+label column, active item gets a soft accent wash, the EP hairline between the
   nav and the content is dropped so the two columns read as one card. */
.help-tabs {
  display: flex;
  align-items: stretch;
  min-height: 240px;
}
/* IM popup: tabs run across the top instead of a left rail. The base block forces a row flex for
   the vertical rail, so flip to a column and move the header margin under the content. The
   `.is-left` alignment rule above is inert here (top items are `.is-top`). */
.help-tabs.el-tabs--top {
  flex-direction: column;
  align-items: stretch;
  min-height: 0;
}
.help-tabs.el-tabs--top :deep(.el-tabs__header) {
  margin: 0 0 12px;
  display: flex;
  justify-content: center;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
}
/* Horizontal tabs: centred pills + uniform gap. EP's top nav is already a flex row, so spacing comes
   from `gap`; the rail's vertical `margin-top` is irrelevant once items sit in a row. */
.help-tabs.el-tabs--top :deep(.el-tabs__item) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  padding: 8px 14px;
}
.help-tabs.el-tabs--top :deep(.el-tabs__nav) {
  gap: 10px;
  /* Outer edges must match the inter-pill gap, else the first/last tab sits flush
     (2px base padding) while the rest are 10px apart. */
  padding: 2px 10px;
}
/* Single-pane (IM sidebar): hide the help rail so the shown tab fills the column. */
.sec.help.single-pane :deep(.help-tabs > .el-tabs__header) {
  display: none;
}
.sec.help.single-pane .help-tabs {
  min-height: 0;
}
.help-tabs :deep(.el-tabs__header) {
  margin: 0 16px 0 0;
}
.help-tabs :deep(.el-tabs__nav-wrap)::after {
  display: none;
}
.help-tabs :deep(.el-tabs__nav) {
  padding: 2px;
}
/* EP defaults vertical tabs to right-aligned (`.el-tabs--left .el-tabs__item.is-left`,
   specificity 0,3,0); stack a second component class to beat it so icon+label sit left. */
.help-tabs.help-tabs :deep(.el-tabs__item.is-left) {
  justify-content: flex-start;
  text-align: left;
}
.help-tabs :deep(.el-tabs__item) {
  height: auto;
  padding: 12px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--text-dim);
}
.help-tabs:not(.el-tabs--top) :deep(.el-tabs__item + .el-tabs__item) {
  /* Vertical rail only: this stack spacing would stagger a horizontal row's first item. */
  margin-top: 8px;
}
.help-tabs :deep(.el-tabs__item:hover) {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.help-tabs :deep(.el-tabs__item.is-active) {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-weight: 600;
}
.help-tabs :deep(.el-tabs__active-bar) {
  display: none;
}
.help-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.tab-label .el-icon {
  font-size: 15px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 650;
  font-size: 13px;
}

.tip {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  margin-top: 8px;
}

.tip code,
.about code {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

.cell-sub {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Update-table action cell: the primary button and the 指定版本 text link share one
   right-aligned row (vertically centered against the status tag) instead of stacking —
   the old two-line layout left the link floating alone on rows without a button. */
.el-table :deep(.act-cell) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  white-space: nowrap;
}
.el-table :deep(.act-cell .el-button + .el-button) {
  margin-left: 0;
}

.upd-progress {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  min-width: 160px;
}

.about p {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
  margin: 8px 0;
}

.about kbd {
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 11px;
  color: var(--text);
  background: var(--glass-chip);
}

.line {
  height: 1px;
  background: var(--border);
  margin: 10px 0;
}

.kv {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  margin-bottom: 6px;
}
/* Update-list rows (关于与更新) get a glassy accent wash on hover, like the other lists. */
.help :deep(.el-table__body tr:hover > td) {
  background: color-mix(in srgb, var(--accent) 14%, transparent) !important;
  -webkit-backdrop-filter: blur(4px) saturate(125%);
  backdrop-filter: blur(4px) saturate(125%);
}

.kv span {
  color: var(--text-dim);
  flex: none;
  width: 78px;
}

/* Bundled-Node upgrade controls ride the right end of the 内置 Node row. */
.kv .node-update-ctl {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  width: auto;
  margin-left: auto;
  color: inherit;
}

/* Wrapping moves whole controls to the next line — their captions must never break mid-word. */
.node-update-ctl .el-button,
.node-incompat-toggle {
  flex: none;
  white-space: nowrap;
}

/* 「显示不兼容版本」switch sits after the action buttons, set off by a divider. */
.node-incompat-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  padding-left: 10px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  border-left: 1px solid var(--border);
}

.node-prog {
  margin: 0 0 8px;
}

/* Percentage text sits inline right of the 6px bar; keep it on one quiet line. */
.node-prog .node-prog-bar :deep(.el-progress__text) {
  font-size: 12px !important;
  color: var(--text-dim);
  min-width: 40px;
}

.ok-text {
  color: var(--ok);
}
.err-text {
  color: var(--err);
}

/* #17 version history mini-table */
.history-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.history-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
}
.history-label {
  color: var(--text-dim);
  width: 96px;
  flex: none;
}
.history-label.history-pending {
  color: var(--warn);
}
.history-ver {
  font-family: var(--font-mono, ui-monospace, monospace);
}

/* #21 network diagnostic results */
.tools-ctl {
  display: flex;
  align-items: center;
  gap: 6px;
}
.net-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}
.net-summary {
  font-size: 12.5px;
  font-weight: 600;
}
.net-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.net-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.net-dot.net-ok {
  background: var(--ok);
}
.net-dot.net-fail {
  background: var(--err);
}
.net-name {
  width: 96px;
  flex: none;
}
.net-ms {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.net-detail {
  max-width: 260px;
}
.net-proxy {
  margin-top: 2px;
}

/* 关于与运行 — system overview: a two-column label/value grid; `sys-wide` rows
   (paths) span the full width so long directories stay on one readable line. */
.sys-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 20px;
  font-size: 12.5px;
}
.sys-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.sys-row > span {
  color: var(--text-dim);
  flex: none;
  width: 84px;
}
.sys-row code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 6px;
}
.sys-row.sys-wide {
  grid-column: 1 / -1;
}
.sys-row.sys-wide code {
  white-space: normal;
  word-break: break-all;
}

/* About ▸ copyright footer: a quiet, centered legal line under the system grid. */
.about-copyright {
  padding: 2px 0 6px;
  text-align: center;
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.2px;
}

/* 网络与工具 — live throughput + interface list. */
.net-live {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
}
.net-rate {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 12.5px;
}
.net-rate .rate-down b {
  color: var(--ok);
}
.net-rate .rate-up b {
  color: var(--accent);
}
.net-rate .rate-total {
  margin-left: auto;
}
.net-sub-label {
  font-size: 11.5px;
  color: var(--text-dim);
  letter-spacing: 0.3px;
  margin-top: 2px;
}
.iface-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.iface-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}
.iface-row.iface-internal {
  opacity: 0.6;
}
.iface-name {
  flex: none;
  min-width: 96px;
  font-weight: 550;
}
.iface-addr {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 6px;
}
.iface-mac {
  max-width: none;
}

/* ---- A2 release-channel row ---- */
.channel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0 0 10px;
  font-size: 12.5px;
}
.channel-label {
  font-weight: 550;
}
.channel-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
}
.channel-row > .cell-sub {
  flex-basis: 100%;
}

/* ---- A1 activity timeline ---- */
.evt-tip {
  margin-bottom: 8px;
}
.evt-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-dim);
}
.evt-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-dim);
}
.evt-list {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--glass-well);
}
.evt-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
}
.evt-row:last-child {
  border-bottom: none;
}
.evt-row:hover {
  background: var(--surface);
}
.evt-dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.evt-dot.lv-warn {
  background: var(--warn);
}
.evt-dot.lv-error {
  background: var(--err);
}
.evt-time {
  flex: none;
  min-width: 150px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.evt-text {
  flex: 1;
  min-width: 0;
}
.evt-page {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-dim);
}
.evt-detail {
  word-break: break-all;
}
</style>
