<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
// `Help` (线框 ?)而非 `QuestionFilled`（实心圆盘）：tab rail 其余图标（Download/Connection/
// Document/Tickets/TrendCharts）都是轮廓风格，实心填充在 hover/active 的 accent 底色上格格不入。
import {
  Help,
  Download,
  Connection,
  Document,
  Tickets,
  TrendCharts,
  Monitor,
  Refresh,
  Position,
  Cpu,
  Bell,
  InfoFilled,
  FolderOpened,
  Warning,
  Odometer,
  Clock,
  Timer,
  ChatLineSquare,
  Grid,
  Coin,
  Box
} from '@element-plus/icons-vue'
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
import PortTable from '@renderer/components/monitor/PortTable.vue'
import { usePagesStore } from '@renderer/stores/pages'
import { useUpdatesStore } from '@renderer/stores/updates'
import { useTasksStore } from '@renderer/stores/tasks'
import { useStaleCache } from '@renderer/composables/useStaleCache'
import type {
  BuiltinKind,
  ContainerEvent,
  EventLevel,
  IpcResult,
  ListEventsArgs,
  NodeVersionInfo,
  PageKind,
  UpdateCheckResult,
  UpdateProgress,
  UpdateHistory,
  NetProbeResult,
  SnapshotResult,
  SystemInfo,
  NetworkStats,
  PageMetrics,
  PortRow
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
  /** 单栏（控制台）下请求宿主把左导航切到同面板的另一个 leaf（关于 ▸ 待更新跳转更新列表）。 */
  'pane-jump': [tab: string]
  close: []
}>()

const updates = useUpdatesStore()
const pagesStore = usePagesStore()
const tasks = useTasksStore()

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

/* ---- 指定版本 — every updatable row, built-in or imported ----
   The built-in runtimes have always offered an exact-version reinstall (the only way back once the
   channel moved on); an imported npm CLI capability (and a legacy in-page install being migrated
   onto the capability layout) is the very same `npm install -g <pkg>@<version>` shape, so both
   share one dialog. A rollback is just a version *behind* the installed one, which the plain 更新
   button can never offer (it only appears when a newer release exists). */
const versionDlg = reactive({
  visible: false,
  row: null as UpdateCheckResult | null,
  loading: false,
  error: '',
  versions: [] as string[],
  sel: '',
  /** the registry list came back empty (or there is none to list): type it in */
  manual: false,
  typed: ''
})

/** Rows an exact-version install makes sense for: built-in npm runtimes + npm-backed page rows. */
function versionRow(row: UpdateCheckResult): boolean {
  if (builtinKind(row)) return true
  if (row.source !== 'npm' || !row.packageName) return false
  return Boolean(row.capabilityId || (row.pageId && row.action === 'migrateCapability'))
}

/** The bundled MCP servers are a package *group*, so there is no single packument to list. */
function isMcpGroup(row: UpdateCheckResult | null): boolean {
  return row ? builtinKind(row) === 'mcp' : false
}

async function openVersionDlg(row: UpdateCheckResult): Promise<void> {
  versionDlg.row = row
  versionDlg.visible = true
  versionDlg.sel = ''
  versionDlg.typed = ''
  versionDlg.error = ''
  versionDlg.versions = []
  // MCP group: one version is applied to every bundled server, so it stays free-text.
  versionDlg.manual = isMcpGroup(row)
  if (!versionDlg.manual) await loadVersions()
}

/** Pull the published version list (newest first) for the dialog's row. */
async function loadVersions(): Promise<void> {
  const row = versionDlg.row
  if (!row?.packageName || versionDlg.loading || isMcpGroup(row)) return
  versionDlg.loading = true
  try {
    const res = (await window.container.listPackageVersions?.(row.packageName)) as IpcResult | null
    const list = res?.ok ? (res.data as string[]) || [] : []
    versionDlg.versions = list
    if (!list.length) {
      // Registry unreachable (or the bridge is an older preload): typing still works, so fall back
      // to the free-text field instead of stranding the dialog on an empty select.
      versionDlg.error = res?.error || t('panel.versionLoadFail')
      versionDlg.manual = true
    } else {
      const latest = row.latestVersion && list.includes(row.latestVersion) ? row.latestVersion : ''
      versionDlg.sel = latest || list[0]
    }
  } catch (err) {
    versionDlg.error = (err as Error).message
    versionDlg.manual = true
  } finally {
    versionDlg.loading = false
  }
}

/** '' is a legitimate choice: follow the channel latest (an empty version means "no pin"). */
async function confirmVersionInstall(): Promise<void> {
  const row = versionDlg.row
  if (!row || versionDlg.loading) return
  const v = (versionDlg.manual ? versionDlg.typed : versionDlg.sel).trim()
  versionDlg.visible = false
  const kind = builtinKind(row)
  if (kind) {
    // Built-in runtime / MCP group: re-provision the shared -g prefix at exactly this version.
    const out = await tasks.installBuiltin(kind, v || undefined)
    if (out) emit('check-updates')
    return
  }
  await updates.perform(row, v || undefined)
  emit('check-updates')
}

function toggleVersionManual(): void {
  versionDlg.manual = !versionDlg.manual
  if (versionDlg.manual) versionDlg.typed = versionDlg.sel
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

/** 关于页的待更新读数：后台巡检（启动 + 每 30min）写入 updates.outdated，这里只读。 */
const pendingUpdateCount = computed(() => updates.outdated.length)
const pendingUpdatesText = computed(() =>
  pendingUpdateCount.value
    ? t('panel.aboutUpdatesCount', { n: pendingUpdateCount.value })
    : t('panel.aboutUpdatesNone')
)

/**
 * 关于 ▸ 待更新行跳转：整栏模式里直接切 help 自己的竖排 rail；单栏（控制台）里
 * rail 被隐藏，需要冒泡给父级同步左导航，否则内容切了、选中项还停在「关于」。
 */
async function goToUpdatesLeaf(): Promise<void> {
  if (!props.pane) {
    helpTab.value = 'updates'
    return
  }
  emit('pane-jump', 'updates')
  await nextTick()
  helpTab.value = 'updates'
}

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
// Stale-while-revalidate like the ports tab: the panel is behind a v-if and remounts on every open,
// so a plain ref would reset to [] and blank the list until listEvents lands. The cache paints the
// last snapshot the instant the tab appears; loadEvents then revalidates it in the background.
const events = useStaleCache<ContainerEvent[]>('panel.events', [])
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
    if (open && tab === 'ports') startPorts()
    else stopPorts()
  }
)
onBeforeUnmount(() => {
  stopEventStream()
  stopTrend()
  stopPorts()
})

/* ---- B1 resource trend (帮助 → 资源趋势) ----
   Same ring the Pages rows read: main pushes a snapshot every 5 s and hands over the retained
   history once on open. The panel owns the buffer (not a per-page config dialog now) so one tab
   shows any page's curve; it only subscribes while the tab is showing, mirroring the event stream. */
const TREND_CAP = 120
// Same stale cache as events/ports: a remount paints the last curve instead of blanking until
// getMetricsHistory re-lands. ref({}) deep-wraps the record, so per-page mutations stay reactive.
const trendHistory = useStaleCache<Record<string, PageMetrics[]>>('panel.trendHistory', {})
let offTrendMetrics: (() => void) | undefined

/** Pages with samples, ordered by the page list so the dropdown is stable, not insertion-order. */
const trendOptions = computed(() => {
  const withData = new Set(Object.keys(trendHistory.value))
  return pagesStore.pages.filter((p) => withData.has(p.id)).map((p) => ({ id: p.id, name: p.name }))
})
/** Every page that has a curve — the tab tiles them all at once (there is no per-page select). */
const trendPages = computed(() =>
  trendOptions.value
    .map((o) => ({ id: o.id, name: o.name, rows: trendHistory.value[o.id] ?? [] }))
    .filter((p) => p.rows.length > 1)
)

function mergeTrendSample(m: PageMetrics): void {
  const arr = trendHistory.value[m.pageId] ?? (trendHistory.value[m.pageId] = [])
  if (arr.length && arr[arr.length - 1].ts === m.ts) return
  arr.push(m)
  if (arr.length > TREND_CAP) arr.splice(0, arr.length - TREND_CAP)
}

function startTrend(): void {
  stopTrend()
  window.container
    .getMetricsHistory?.()
    .then((res) => {
      if (!res?.ok) return
      const map = (res.data as Record<string, PageMetrics[]>) ?? {}
      for (const [id, rows] of Object.entries(map)) trendHistory.value[id] = rows.slice(-TREND_CAP)
    })
    .catch(() => undefined)
  offTrendMetrics = window.container.onPageMetrics?.((list) => {
    const live = new Set((list as PageMetrics[]).map((m) => m.pageId))
    for (const id of Object.keys(trendHistory.value))
      if (!live.has(id)) delete trendHistory.value[id]
    for (const m of list as PageMetrics[]) mergeTrendSample(m)
  })
}
function stopTrend(): void {
  offTrendMetrics?.()
  offTrendMetrics = undefined
}

/* ---- port / process manager (帮助 → 端口与进程) ----
   A full LISTENing snapshot pulled on open and re-pulled every 10 s while the tab shows; it is a
   one-shot OS query (netstat / lsof), not a push stream, so a poll — like the diagnose tab — rather
   than a subscription. Stopped the same way the trend/event tabs are, so a hidden panel spawns none. */
const PORT_POLL_MS = 10_000
// Stale-while-revalidate, like the diagnose tabs: the panel is behind a v-if and remounts on every
// open, so a plain ref would reset to [] and leave the table blank while the one-shot netstat/lsof
// query lands. A module-scoped cache paints the previous snapshot the instant the tab appears, then
// the poll refreshes it.
const portRows = useStaleCache<PortRow[]>('panel.portRows', [])
const portsLoading = ref(false)
// The tab owns the filter state (mirrors how the events tab keeps its selects here); PortTable
// is a pure view that reads these and emits the row actions.
const portsOnlyIssues = ref(false)
const portsKeyword = ref('')
let portTimer: ReturnType<typeof setInterval> | undefined

async function refreshPorts(): Promise<void> {
  portsLoading.value = true
  try {
    const res = await window.container.listListeningPorts?.()
    if (res?.ok) portRows.value = (res.data as { rows: PortRow[] })?.rows ?? []
  } catch {
    /* a failed poll keeps the last snapshot rather than blanking the table */
  } finally {
    portsLoading.value = false
  }
}

async function killPortProcess(row: PortRow): Promise<void> {
  try {
    const res = await window.container.killProcessTree?.(row.pid)
    if (res?.ok) await refreshPorts()
    else ElMessage.error((res as { error?: string })?.error || t('ports.killFailed'))
  } catch (err) {
    ElMessage.error((err as Error).message || t('ports.killFailed'))
  }
}

function startPorts(): void {
  stopPorts()
  void refreshPorts()
  portTimer = setInterval(() => void refreshPorts(), PORT_POLL_MS)
}
function stopPorts(): void {
  if (portTimer) clearInterval(portTimer)
  portTimer = undefined
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

/** Short provenance tag: a built-in row reads as its product name, an imported row as the runtime
    kind its own container.json declares (a CLI vs a web project). Routed through builtinKind
    (package-name based) instead of a name match: the MCP group row's bilingual name contains
    neither 'DSH' nor 'OpenClaw', and used to fall through to the OpenClaw tag. */
const BUILTIN_TAGS: Record<BuiltinKind, string> = {
  dsh: 'DeepSeek Harness',
  openclaw: 'OpenClaw',
  mcp: 'MCP'
}
/** PageKind → label key. `dsh` / `openclaw` kinds only ever arrive as built-in rows above. */
const KIND_TAGS: Partial<Record<PageKind, string>> = {
  terminal: 'panel.tagCli',
  page: 'panel.tagWeb'
}
const sourceTag = (r: UpdateCheckResult): { label: string; type: 'warning' | 'info' } | null => {
  if (r.source === 'builtin')
    return {
      label:
        r.action === 'none' ? t('panel.tagBuiltin') : BUILTIN_TAGS[builtinKind(r) ?? 'openclaw'],
      // amber = shipped by the container itself
      type: 'warning'
    }
  const key = r.pageKind ? KIND_TAGS[r.pageKind] : undefined
  return key ? { label: t(key), type: 'info' } : null
}

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
  // `tone` drives the timeline dot/label colour per role: 当前运行 / 待重启生效 / 可回退备份 / 上次回退自.
  const rows: {
    label: string
    version: string
    tone: 'running' | 'pending' | 'backup' | 'rollback'
  }[] = []
  rows.push({ label: t('panel.historyRunning'), version: h.running, tone: 'running' })
  if (h.current && h.current !== h.running)
    rows.push({ label: t('panel.historyPending'), version: h.current, tone: 'pending' })
  if (h.backup) rows.push({ label: t('panel.historyBackup'), version: h.backup, tone: 'backup' })
  if (h.rollbackFrom)
    rows.push({ label: t('panel.historyRollbackFrom'), version: h.rollbackFrom, tone: 'rollback' })
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
      :pane="pane"
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
      <PageManager :tab-position="tabPosition" :pane="pane" @close="emit('close')" />
    </section>

    <section v-else-if="props.panel === 'external'" class="sec">
      <ExternalSitesManager @preview="emit('preview-site', $event)" />
    </section>

    <section v-else-if="props.panel === 'dsh'" class="sec">
      <DshManager :tab-position="tabPosition" :pane="pane" />
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

    <!-- 看板: rail / 视图 row / palette page; TaskBoard owns the board / dependency-topology / call-feed tabs. -->
    <section v-else-if="props.panel === 'board'" class="sec">
      <TaskBoard :tab-position="tabPosition" :pane="pane" />
    </section>

    <!-- Help: 关于 + 更新 + 诊断 + 日志 merged into one panel, split by a vertical tab rail. -->
    <section v-else-if="props.panel === 'help'" class="sec help" :class="{ 'single-pane': !!pane }">
      <el-tabs v-model="helpTab" class="help-tabs v-tabs" :tab-position="tabPosition || 'left'">
        <el-tab-pane name="about" class="about-pane">
          <template #label>
            <span class="tab-label"
              ><el-icon><Help /></el-icon>{{ t('panel.tabAbout') }}</span
            >
          </template>
          <!-- 与控制台「设置」同一套卡片行语言：分组小标题 + 大圆角卡片，
               每行 = 图标 tile · 标题 + 灰色描述（左） · 值/控件（右），行间发丝虚线。 -->
          <div class="about-groups">
            <section class="about-group">
              <h3 class="about-caption">{{ t('panel.aboutGroupRuntime') }}</h3>
              <div class="about-card">
                <div class="setting-row setting-row--stack">
                  <span class="row-icon"
                    ><el-icon><Refresh /></el-icon
                  ></span>
                  <div class="row-label">
                    <span class="row-title">{{ t('panel.aboutNode') }}</span>
                    <span class="row-desc">
                      {{ t('panel.aboutNodeDesc') }}：
                      <strong :class="props.runtime.ok ? 'ok-text' : 'err-text'">
                        {{ props.runtime.version || t('panel.notDetected') }}
                      </strong>
                      <el-tag
                        v-if="props.runtime.override"
                        size="small"
                        effect="plain"
                        round
                        type="warning"
                      >
                        {{ t('panel.nodeTagUpdated') }}
                      </el-tag>
                    </span>
                  </div>
                  <div class="row-control node-update-ctl">
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
                  </div>
                </div>

                <div v-if="nodeError" class="node-load-err setting-row setting-row--stack">
                  <span class="row-icon"
                    ><el-icon><Warning /></el-icon
                  ></span>
                  <div class="row-label">
                    <span class="row-title err-text">{{ nodeError }}</span>
                  </div>
                  <div class="row-control">
                    <el-button size="small" text :loading="nodeLoading" @click="loadNodeVersions">
                      {{ t('panel.retry') }}
                    </el-button>
                  </div>
                </div>

                <div v-if="updates.nodeProgress" class="upd-progress node-prog setting-row">
                  <el-progress
                    class="node-prog-bar"
                    :percentage="
                      updates.nodeProgress.percent ?? progressPercent(updates.nodeProgress)
                    "
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

                <div class="setting-row setting-row--stack">
                  <span class="row-icon"
                    ><el-icon><FolderOpened /></el-icon
                  ></span>
                  <div class="row-label">
                    <span class="row-title">{{ t('panel.aboutRuntimePath') }}</span>
                  </div>
                  <div class="row-control">
                    <code class="path-value">{{ props.runtime.path || '-' }}</code>
                  </div>
                </div>
              </div>
            </section>

            <section class="about-group">
              <h3 class="about-caption">{{ t('panel.aboutGroupUpdates') }}</h3>
              <div class="about-card">
                <div class="setting-row">
                  <span class="row-icon"
                    ><el-icon><Bell /></el-icon
                  ></span>
                  <div class="row-label">
                    <span class="row-title">{{ t('panel.aboutUpdatesTitle') }}</span>
                    <span class="row-desc">{{ t('panel.aboutUpdatesDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <span class="row-value">{{ pendingUpdatesText }}</span>
                    <el-button
                      v-if="pendingUpdateCount"
                      size="small"
                      type="primary"
                      plain
                      @click="goToUpdatesLeaf"
                    >
                      {{ t('panel.aboutUpdatesView') }}
                    </el-button>
                  </div>
                </div>
              </div>
            </section>

            <section class="about-group">
              <h3 class="about-caption">
                {{ t('panel.sysTitle') }}
                <el-button size="small" text :loading="sysLoading" @click="loadSystemInfo">
                  {{ t('panel.sysRefresh') }}
                </el-button>
              </h3>
              <div class="about-card">
                <div class="setting-row">
                  <span class="row-icon"
                    ><el-icon><Position /></el-icon
                  ></span>
                  <div class="row-label">
                    <span class="row-title">{{ t('panel.aboutPages') }}</span>
                    <span class="row-desc">{{ t('panel.aboutPagesDesc') }}</span>
                  </div>
                  <div class="row-value">
                    {{
                      t('panel.aboutPagesRunning', {
                        running: props.runningCount,
                        total: props.totalCount
                      })
                    }}
                  </div>
                </div>
                <template v-if="sysInfo">
                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><InfoFilled /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysAppVersion') }}</span>
                    </div>
                    <div class="row-value">
                      {{ sysInfo.appVersion }}
                      <el-tag size="small" effect="plain" round>
                        {{ sysInfo.packaged ? t('panel.packagedYes') : t('panel.packagedNo') }}
                      </el-tag>
                    </div>
                  </div>

                  <div class="setting-row setting-row--stack">
                    <span class="row-icon"
                      ><el-icon><Cpu /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysRuntimes') }}</span>
                    </div>
                    <div class="row-value">
                      Electron {{ sysInfo.electron }} · Chrome {{ sysInfo.chrome }} · Node
                      {{ sysInfo.node }}
                    </div>
                  </div>

                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><Monitor /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysOs') }}</span>
                    </div>
                    <div class="row-value">
                      {{ sysInfo.osType }} {{ sysInfo.osRelease }} · {{ sysInfo.arch }}
                    </div>
                  </div>

                  <div class="setting-row setting-row--stack">
                    <span class="row-icon"
                      ><el-icon><Connection /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysHost') }}</span>
                    </div>
                    <div class="row-value">{{ sysInfo.hostname }}</div>
                  </div>

                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><Odometer /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysCpu') }}</span>
                    </div>
                    <div class="row-value">
                      {{ sysInfo.cpuModel || '?' }} ·
                      {{ t('panel.sysCpuCores', { n: sysInfo.cpuCores }) }}
                    </div>
                  </div>

                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><Coin /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysMem') }}</span>
                    </div>
                    <div class="row-value">
                      {{
                        t('panel.sysMemUsed', {
                          used: fmtBytes(sysInfo.totalMem - sysInfo.freeMem),
                          total: fmtBytes(sysInfo.totalMem)
                        })
                      }}
                    </div>
                  </div>

                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><Clock /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysUptime') }}</span>
                    </div>
                    <div class="row-value">{{ fmtDuration(sysInfo.osUptimeSec) }}</div>
                  </div>

                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><Timer /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysAppUptime') }}</span>
                    </div>
                    <div class="row-value">{{ fmtDuration(sysInfo.appUptimeSec) }}</div>
                  </div>

                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><ChatLineSquare /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysLocale') }}</span>
                    </div>
                    <div class="row-value">
                      {{ sysInfo.locale || '-' }} / {{ sysInfo.timezone || '-' }}
                    </div>
                  </div>

                  <div class="setting-row">
                    <span class="row-icon"
                      ><el-icon><Grid /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysInterfaces') }}</span>
                    </div>
                    <div class="row-value">{{ sysInfo.interfaceCount }}</div>
                  </div>

                  <div class="setting-row setting-row--stack">
                    <span class="row-icon"
                      ><el-icon><FolderOpened /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysUserData') }}</span>
                    </div>
                    <div class="row-value full">{{ sysInfo.userData }}</div>
                  </div>

                  <div class="setting-row setting-row--stack">
                    <span class="row-icon"
                      ><el-icon><Box /></el-icon
                    ></span>
                    <div class="row-label">
                      <span class="row-title">{{ t('panel.sysInstallDir') }}</span>
                    </div>
                    <div class="row-value full">{{ sysInfo.installDir }}</div>
                  </div>
                </template>
                <div v-else class="sys-empty">{{ t('panel.sysEmpty') }}</div>
              </div>
            </section>
          </div>

          <!-- 版权页脚在卡片流之外，系统快照未到（sysInfo 为空）时也能看到。 -->
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
          <el-table
            class="upd-table"
            :data="updates.results"
            size="small"
            :empty-text="t('panel.updatesEmpty')"
          >
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
                  :type="sourceTag(row)!.type"
                  style="margin-left: 8px"
                  >{{ sourceTag(row)!.label }}</el-tag
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
            <el-table-column :label="t('panel.colAction')" width="176" align="right">
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
                  <!-- B3: a built-in runtime can always be re-provisioned at an exact version, and
                       an imported npm page gets the same hatch off the registry version list (the
                       更新 button can never offer a rollback — it only appears once a *newer*
                       release exists). -->
                  <el-button
                    v-if="versionRow(row)"
                    size="small"
                    round
                    :disabled="
                      builtinKind(row)
                        ? tasks.busyBuiltin(builtinKind(row) || 'dsh')
                        : updates.updating === row.name
                    "
                    @click="openVersionDlg(row)"
                  >
                    {{ t('panel.versionBtn') }}
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <!-- #17 container OTA version history: one compact timeline well — dots on a joined spine
               read the rows as an update chain (当前 → 待生效 → 备份), colour carries the role. -->
          <template v-if="historyRows.length">
            <div class="line" />
            <div class="head">
              <span>{{ t('panel.historyTitle') }}</span>
            </div>
            <div class="history-grid">
              <div
                v-for="r in historyRows"
                :key="r.label"
                class="history-node"
                :class="`tone-${r.tone}`"
              >
                <span class="history-dot" aria-hidden="true" />
                <span class="history-label">{{ r.label }}</span>
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
            <span class="evt-count">{{ trendPages.length }}</span>
          </div>
          <div class="cell-sub evt-tip">{{ t('panel.trendTip') }}</div>
          <div v-if="!trendPages.length" class="evt-empty">{{ t('pageMgr.trendEmpty') }}</div>
          <div v-else class="trend-tile">
            <section v-for="p in trendPages" :key="p.id" class="trend-cell">
              <div class="trend-cell-name" :title="p.name">{{ p.name }}</div>
              <ResourceTrend :rows="p.rows" />
            </section>
          </div>
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

        <!-- Port / process manager: every LISTENing TCP socket on the host, annotated against the
             page registry (owner / orphan / conflict). Polls while this tab is showing. -->
        <el-tab-pane name="ports">
          <template #label>
            <span class="tab-label"
              ><el-icon><Monitor /></el-icon>{{ t('panel.tabPorts') }}</span
            >
          </template>
          <div class="head ports-head">
            <span>{{ t('ports.title') }}</span>
            <div class="head-ctl">
              <el-checkbox v-model="portsOnlyIssues" size="small">{{
                t('ports.onlyIssues')
              }}</el-checkbox>
              <el-input
                v-model="portsKeyword"
                size="small"
                :placeholder="t('ports.searchPlaceholder')"
                clearable
                class="ports-search"
              />
              <el-button size="small" :loading="portsLoading" @click="refreshPorts">
                {{ t('ports.refresh') }}
              </el-button>
            </div>
          </div>
          <div class="cell-sub evt-tip">{{ t('ports.tip') }}</div>
          <PortTable
            :rows="portRows"
            :only-issues="portsOnlyIssues"
            :keyword="portsKeyword"
            @kill="killPortProcess"
            @open-page="emit('open-page', $event)"
          />
        </el-tab-pane>
      </el-tabs>
    </section>

    <!-- 指定版本 picker for any updatable row: the registry's published versions, newest first
         (the bundled MCP servers are a package group, so that one stays free-text).
         Kept at the template root (append-to-body) so the tab pane's scroll box can't clip it. -->
    <el-dialog
      v-model="versionDlg.visible"
      :title="t('panel.versionTitle', { name: versionDlg.row?.name || '' })"
      width="360px"
      align-center
      append-to-body
    >
      <div class="ver-pick">
        <div class="ver-meta cell-sub">
          <span>{{ t('panel.versionCurrent', { v: versionDlg.row?.currentVersion || '?' }) }}</span>
          <span v-if="versionDlg.row?.latestVersion">
            · {{ t('panel.versionLatestVer', { v: versionDlg.row.latestVersion }) }}
          </span>
        </div>
        <!-- One typed version is installed for every bundled MCP server, so a release that only some
             of them publish fails the whole batch — say so rather than imply one package. -->
        <div v-if="isMcpGroup(versionDlg.row)" class="ver-meta cell-sub">
          {{ t('panel.versionAppliesAll') }}
        </div>
        <el-select
          v-if="!versionDlg.manual"
          v-model="versionDlg.sel"
          :loading="versionDlg.loading"
          filterable
          class="ver-field"
          :no-data-text="t('panel.versionLoading')"
        >
          <el-option :label="t('panel.versionFollowLatest')" value="" />
          <el-option
            v-for="v in versionDlg.versions"
            :key="v"
            :value="v"
            :label="
              v === versionDlg.row?.currentVersion ? `${v} · ${t('panel.versionIsCurrent')}` : v
            "
          />
        </el-select>
        <el-input
          v-else
          v-model="versionDlg.typed"
          :placeholder="t('panel.versionPlaceholder')"
          clearable
        />
        <div v-if="versionDlg.error" class="ver-err cell-sub">{{ versionDlg.error }}</div>
        <el-button size="small" text @click="toggleVersionManual">
          {{ versionDlg.manual ? t('panel.versionPickList') : t('panel.versionManual') }}
        </el-button>
      </div>
      <template #footer>
        <el-button @click="versionDlg.visible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          size="small"
          type="primary"
          :loading="versionDlg.loading"
          @click="confirmVersionInstall"
        >
          {{ t('panel.versionInstall') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sec {
  padding: 2px;
}
/* The help section sits inside a flex content column; without min-width:0 a wide child (the port
   table) can't shrink and instead stretches the card horizontally. */
.sec.help {
  min-width: 0;
}

/* Vertical (left) tab rail for the Help panel. The shared look (item sizing, accent wash,
   hairline removal, `.tab-label` glyph size) now comes from the global `.v-tabs` skin in
   glass.css — the el-tabs carries `class="help-tabs v-tabs"` — so this block only keeps
   what is genuinely help-specific: the IM top-tab variant, the single-pane rail hiding,
   and the doubled-class trick that beats EP's right-aligned `.el-tabs--left .is-left`. */
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
/* EP defaults vertical tabs to right-aligned (`.el-tabs--left .el-tabs__item.is-left`,
   specificity 0,3,0); stack a second component class to beat it so icon+label sit left. */
.help-tabs.help-tabs :deep(.el-tabs__item.is-left) {
  justify-content: flex-start;
  text-align: left;
}
.help-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-width: 0; /* let the content column shrink so a wide table (端口与进程) can't feed its
                  intrinsic width back and grow the card without bound */
  overflow: hidden;
}
/* 运行日志：和事件动态一样，把日志时间轴撑到接近整屏高再出滚动条（组件内默认 300/260px 太矮）。
   scoped to the help tab so a standalone LogViewer elsewhere keeps its own sizing. */
.help-tabs :deep(.lv-timeline),
.help-tabs :deep(.lv-pre) {
  max-height: calc(100vh - 280px);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 650;
  font-size: 13px;
}

/* Ports header: title stays on the left, the trailing controls gather into a right-aligned cluster
   (`.head` is space-between, so the cluster sits flush right) instead of scattering across the row. */
.head-ctl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ports-search {
  width: 170px;
}
/* Let the port table fill the console height before its own scrollbar appears, matching the
   events/logs wells ("occupy the screen, then scroll"). EP applies the max-height prop as a
   non-important inline style on the .el-table root, so an !important override here wins and the
   inner-wrapper flex layout stretches the body area to the new bound. */
.help-tabs :deep(.pt-table.el-table) {
  max-height: calc(100vh - 260px) !important;
}
/* 表格卡片化：更新表/端口表统一大圆角 + 淡面，表头与行分隔线随主题，与控制台
   其它卡片同一观感（el-table 默认直角 + 硬分隔线在卡片流里显得突兀）。 */
.help-tabs :deep(.el-table) {
  --el-table-border-color: color-mix(in srgb, var(--border) 70%, transparent);
  --el-table-header-bg-color: color-mix(in srgb, var(--text) 4%, transparent);
  --el-table-tr-bg-color: transparent;
  --el-table-bg-color: transparent;
  /* inner-wrapper 的底色挂在 --el-bg-color 上，不透明化会盖掉根上的卡片底色。 */
  --el-bg-color: transparent;
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text) 5%, var(--surface));
}
.help-tabs :deep(.el-table__header th) {
  font-weight: 600;
  color: var(--text-dim);
}
/* 更新表拉高到接近整屏再出内部滚动条（与端口表同一节奏）：默认按行数收缩，
   卡片下方留大片空白。min-height 让空表也占住高度，表头不会贴在卡片顶部孤零。 */
.help-tabs :deep(.upd-table.el-table) {
  width: 100%;
  max-height: calc(100vh - 260px) !important;
  min-height: 280px;
}

.tip {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  margin-top: 8px;
}

.tip code {
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

/* 指定版本 dialog: one stacked column — the installed/latest reading, the picker (or the
   free-text fallback), then the toggle between them. */
.ver-pick {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ver-field {
  width: 100%;
}
.ver-err {
  color: var(--el-color-danger);
}

.line {
  height: 1px;
  background: var(--border);
  margin: 10px 0;
}
/* Update-list rows (关于与更新) get a glassy accent wash on hover, like the other lists (shared token). */
.help :deep(.el-table__body tr:hover > td) {
  background: var(--dsh-wash-hover) !important;
  -webkit-backdrop-filter: blur(4px) saturate(125%);
  backdrop-filter: blur(4px) saturate(125%);
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

/* #17 version history: a compact timeline well (same dot-on-spine language as the log timeline).
   Per-row spine segments join into one continuous rail, capped at the first/last dot centres; the
   dot colour encodes the role and the version sits in a mono chip, so the chain scans at a glance. */
.history-grid {
  display: flex;
  flex-direction: column;
  padding: 4px 10px 6px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--glass-well);
  font-size: 12.5px;
  user-select: text;
}
.history-node {
  position: relative;
  display: grid;
  grid-template-columns: 14px 96px 1fr;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
}
/* Vertical rail; the dot column centre sits at x≈11px (node pad 4 + half the 14px column). */
.history-node::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 30%, var(--border));
}
/* Endpoint caps: single-line rows centre their dot at 50%, so start/stop the spine there. */
.history-node:first-child::before {
  top: 50%;
}
.history-node:last-child::before {
  top: auto;
  bottom: 50%;
}
.history-node:only-child::before {
  display: none;
}
.history-dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  justify-self: center;
  border-radius: 50%;
  background: var(--text-dim);
  /* opaque ring so the rail reads as passing *behind* the dot, not through it */
  box-shadow: 0 0 0 3px var(--surface-2);
}
.tone-running .history-dot {
  background: var(--accent);
  box-shadow:
    0 0 0 3px var(--surface-2),
    0 0 6px color-mix(in srgb, var(--accent) 55%, transparent);
}
.tone-pending .history-dot {
  background: var(--warn);
}
.tone-backup .history-dot {
  background: var(--ok);
}
.history-label {
  color: var(--text-dim);
}
.tone-running .history-label {
  color: var(--text);
  font-weight: 600;
}
.tone-pending .history-label {
  color: var(--warn);
}
.history-ver {
  justify-self: start;
  font-family: var(--font-mono, ui-monospace, monospace);
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--glass-chip);
  color: var(--text);
}
.tone-running .history-ver {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
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
  gap: 2px;
  margin-top: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--glass-well);
}
.net-summary {
  padding: 6px 0;
  font-size: 13px;
  font-weight: 600;
}
/* 诊断步骤：整行 + 发丝虚线分隔，状态点左、步骤名、耗时靠右、详情换行不推。 */
.net-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  font-size: 12.5px;
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
}
.net-step:last-of-type {
  border-bottom: none;
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
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 550;
  color: var(--text);
}
.net-ms {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}
.net-detail {
  flex: 1 1 100%;
  min-width: 0;
  padding-left: 18px;
}
.net-proxy {
  margin-top: 2px;
}

/* 关于页的系统行已全部走 .about-card 的 setting-row（与设置卡片同一行语言），
   旧的 sys-grid / sys-row 文本流样式因此删除；空位由 .sys-empty 占位行接手。 */

/* About ▸ copyright footer: a quiet, centered legal line under the last card. */
.about-copyright {
  padding: 10px 0 6px;
  text-align: center;
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.2px;
}

/* ---- About ▸ 卡片行语言（与控制台「设置」同一配方）----
   分组灰色小标题 + 淡面 16px 大圆角卡片；每行 = 36px 图标 tile · 标题 + 常驻灰色描述（左）
   · 值/控件（右），行间发丝虚线。之前关于页是 kv 文本流（无 tile、控件挤在标签行右侧），
   与设置卡片不同一套，现在统一。 */
.about-groups {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 2px 2px 6px;
}
.about-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.about-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding-left: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
}
.about-card {
  background: color-mix(in srgb, var(--text) 5%, var(--surface));
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}
.about-card .setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 20px 26px;
}
.about-card .setting-row + .setting-row {
  border-top: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
}
.about-card .row-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  font-size: 17px;
  color: var(--text-dim);
  background: color-mix(in srgb, var(--text) 6%, var(--surface));
  border: 1px solid var(--border);
}
.about-card .row-label {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.about-card .row-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.about-card .row-desc {
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-dim);
  max-width: 62ch;
  word-break: break-word;
}
.about-card .row-control {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
}
/* 只读值（系统信息 / 运行中页）：右贴齐，与设置行的控件列同一槽位。 */
.about-card .row-value {
  margin-left: auto;
  font-size: 13px;
  color: var(--text);
  text-align: right;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
/* 长值/控件簇换行到标签下方整行（路径、CPU 主频、Node 升级控件）。 */
.about-card .setting-row--stack {
  flex-wrap: wrap;
}
.about-card .setting-row--stack .row-control,
.about-card .setting-row--stack .row-value {
  flex: 1 1 100%;
  margin-left: 0;
  justify-content: flex-end;
  text-align: right;
}
.about-card .node-update-ctl {
  flex-wrap: wrap;
  row-gap: 8px;
}
.about-card .node-update-ctl .el-button,
.about-card .node-incompat-toggle {
  flex: none;
  white-space: nowrap;
}
.about-card .path-value {
  overflow-wrap: anywhere;
  word-break: break-all;
  text-align: right;
  font-size: 12.5px;
}
.about-card .row-value.full {
  overflow-wrap: anywhere;
  word-break: break-all;
}
/* 内置 Node 升级失败 / 进度：卡片行内展示，进度条占主导宽度。 */
.about-card .node-load-err .row-title {
  font-size: 13px;
  font-weight: 400;
}
.about-card .upd-progress.node-prog {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin-top: 0;
  min-width: 0;
}
.about-card .node-prog .el-progress {
  flex: 1 1 60%;
  min-width: 160px;
}
.about-card .node-prog .cell-sub {
  flex: 1 1 auto;
  white-space: normal;
}
/* 系统信息未拉到时的占位行（只有刷新按钮可用）。 */
.about-card .sys-empty {
  padding: 18px 22px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-dim);
}

/* 网络与工具 — live throughput + interface list. */
.net-live {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 4px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--glass-well);
}
/* 实时速率：胶囊徽章化，箭头着色，读数加粗等宽数字。 */
.net-rate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.net-rate > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12.5px;
  color: var(--text-dim);
}
.net-rate b {
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.net-rate .rate-down b {
  color: var(--ok);
}
.net-rate .rate-up b {
  color: var(--accent);
}
.net-rate .rate-total {
  border-style: dashed;
}
.net-sub-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  letter-spacing: 0.3px;
  margin-top: 4px;
}
/* 网卡列表：整行行式 + 发丝虚线分隔，与控制台其它行列表同一节奏。 */
.iface-list {
  display: flex;
  flex-direction: column;
}
.iface-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 2px;
  font-size: 12.5px;
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
}
.iface-row:last-child {
  border-bottom: none;
}
.iface-row:hover {
  background: var(--dsh-wash-soft);
}
.iface-row.iface-internal {
  opacity: 0.6;
}
.iface-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text);
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

/* ---- A1 activity timeline ---- */
.evt-tip {
  margin-bottom: 8px;
}

/* 资源趋势平铺：每个页面占满整行（百分百自适应），曲线随控制台宽度拉伸；
   窄窗口下也不会被 300px 网格挤成两列。 */
.trend-tile {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.trend-cell {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--glass-well);
}
.trend-cell-name {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* ResourceTrend carries a 10px top margin meant for a standalone block; inside a labelled cell it
   should sit tight under the caption. */
.trend-cell :deep(.trend) {
  margin-top: 2px;
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
  /* Fill the console height before the inner scrollbar appears (was a fixed 320px that cut long
     timelines off well short of the viewport). console-body is the outer scroller, so sizing this
     to the viewport minus the surrounding chrome gives “occupy the screen, then scroll”. */
  max-height: calc(100vh - 260px);
  overflow: auto;
  /* 与控制台大卡片同圆角体系（14px），与表格/趋势格子同一家族。 */
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--glass-well);
  scrollbar-gutter: stable;
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
