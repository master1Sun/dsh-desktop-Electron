<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  FolderOpened,
  Download,
  Box,
  Promotion,
  Menu,
  VideoPlay,
  VideoPause,
  Setting,
  Share,
  Monitor,
  Document,
  SuccessFilled,
  CircleCloseFilled,
  CircleCheck,
  InfoFilled,
  WarningFilled,
  Loading,
  Minus
} from '@element-plus/icons-vue'
import CustomEnvEditor from '@renderer/components/env/CustomEnvEditor.vue'
import EnvDirChoice from '@renderer/components/env/EnvDirChoice.vue'
import LogTimeline from '@renderer/components/monitor/LogTimeline.vue'
import { askAiWith } from '@renderer/askAi'
import { usePagesStore, type PageState } from '@renderer/stores/pages'
import { useSettingsStore } from '@renderer/stores/settings'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { useEnvDirs } from '@renderer/composables/useEnvDirs'
import { CONTAINER_REPO_URL, DISPLAY_TIME_ZONE, DISPLAY_TIME_ZONE_LABEL } from '@shared/types'
import { detectSourceKind, expandGitSource, type SourceKind } from '@shared/smartSource'
import type { PageMetrics, PortCheckResult } from '@shared/types'
import { t } from '@renderer/i18n'

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const runtimes = useRuntimesStore()
const emit = defineEmits<{ close: [] }>()

/* Optional single-pane mode for the IM sidebar: `pane` = 'install' | 'installed' shows just that tab
 * with the rail hidden. Absent (classic) = full two-tab card, unchanged. */
const props = defineProps<{ pane?: string; tabPosition?: 'left' | 'top' }>()

/** 页面面板竖排分类 tab：智能导入 / 已安装列表。 */
const activeTab = ref(props.pane || 'install')
watch(
  () => props.pane,
  (p) => {
    if (p) activeTab.value = p
  }
)

/**
 * A hosted dsh/openclaw row can't start without its CLI runtime (both are provisioned on demand
 * into userData, never shipped in the slim installer). The verdict comes from the main process on
 * `PageState.runtimeMissing` — a synchronous probe it re-runs on every list — so the badge can't
 * lag the async install-status IPC or flicker during its round trip, and needs no `loaded` guard.
 */
function runtimeMissing(row: PageState): boolean {
  return row.runtimeMissing === true
}

/** The disable switch is for the built-in dsh/openclaw rows only — an imported page is
    removed outright, there's no reason to park it (and no imported row can ever be
    disabled in the first place). */
function canToggleDisable(row: PageState): boolean {
  return row.builtin === true
}

/** Flip the settings-backed disabled flag; main stops a running page as it disables it. */
async function toggleDisabled(row: PageState): Promise<void> {
  const next = !row.disabled
  try {
    await pagesStore.setDisabled(row.id, next)
    ElMessage.success(next ? t('pageMgr.msgDisabled') : t('pageMgr.msgEnabled'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
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

/* ── 智能导入：一个来源框，自动识别 Git / 本地目录 / npm 包（shared/smartSource 语法嗅探）。
   三个表单合并成一个：粘贴地址、选择目录或输入包名，表单自适应类型；预检（main:
   project-classify）在任何下载之前给出档位结论，红档的知名仓库（codex 等）附一键改走
   npm CLI。目录名 / 端口等少用旋钮折进「高级选项」，默认无需触碰。 */
const source = ref('')
const adv = reactive({ name: '', port: '' })
const kindOverride = ref<'auto' | SourceKind>('auto')
const advancedOpen = ref<string[]>([])
const kind = computed<SourceKind | null>(() =>
  kindOverride.value === 'auto' ? detectSourceKind(source.value) : kindOverride.value
)
const kindLabel = computed(() => (kind.value ? t(`pageMgr.kindTag.${kind.value}`) : t('pageMgr.kindTag.none')))
const kindTagType = computed(() =>
  kind.value === 'git'
    ? 'primary'
    : kind.value === 'dir'
      ? 'warning'
      : kind.value === 'npm'
        ? 'success'
        : 'info'
)
const kindHint = computed(() =>
  kind.value === 'git'
    ? t('pageMgr.hintGit')
    : kind.value === 'dir'
      ? t('pageMgr.hintDir')
      : kind.value === 'npm'
        ? t('pageMgr.hintNpm')
        : t('pageMgr.hintSmart')
)
const kindIcon = computed(() =>
  kind.value === 'git'
    ? Download
    : kind.value === 'dir'
      ? FolderOpened
      : kind.value === 'npm'
        ? Box
        : Promotion
)
/** `autoInstall` rides along as ImportOptions so a yellow project gets its `npm install`. */
const autoInstall = ref(true)
interface PreflightView {
  checking: boolean
  tier: 'green' | 'yellow' | 'red' | null
  kind?: string
  reason?: string
  suggestNpm?: string
}
const pre = reactive<PreflightView>({ checking: false, tier: null })
let preflightSeq = 0

async function runPreflight(): Promise<void> {
  const s = source.value.trim()
  const k = kind.value
  preflightSeq++
  const seq = preflightSeq
  pre.checking = false
  pre.tier = null
  pre.kind = undefined
  pre.reason = undefined
  pre.suggestNpm = undefined
  // Only Git/folder sources get classified (remote probe / local stat); an npm spec is gated
  // by the bin check inside the install itself, so there is nothing to pre-flight.
  if (!s || !k || k === 'npm') return
  pre.checking = true
  try {
    const res = await window.container.preflightImport(k === 'git' ? expandGitSource(s) : s, k === 'dir')
    if (seq !== preflightSeq) return
    if (res?.ok && res.data) {
      pre.tier = res.data.tier
      pre.kind = res.data.kind
      pre.reason = res.data.reason
      pre.suggestNpm = res.data.suggestNpm
    }
  } catch {
    /* best-effort: the authoritative gate still runs inside the import itself */
  } finally {
    if (seq === preflightSeq) pre.checking = false
  }
}

// Re-judge shortly after typing (a paste lands here too); blur is the explicit fallback.
let preflightTimer: number | undefined
watch([source, kindOverride], () => {
  window.clearTimeout(preflightTimer)
  preflightTimer = window.setTimeout(runPreflight, 450)
})
onBeforeUnmount(() => window.clearTimeout(preflightTimer))
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

async function install(): Promise<void> {
  const s = source.value.trim()
  if (!s) {
    ElMessage.warning(t('pageMgr.msgEnterSource'))
    return
  }
  const k = kind.value
  if (!k) {
    ElMessage.warning(t('pageMgr.msgUnknownKind'))
    return
  }
  try {
    if (k === 'npm') {
      await npmInstall(s)
    } else if (k === 'dir') {
      // Only the container repo itself gets adopted for git updates — a blind origin would mislead the pull.
      const isContainerRepo = /[/\\]DesktopContainer(\/|$)/i.test(s)
      const id = await pagesStore.installDir(
        s,
        adv.name.trim() || undefined,
        parsePort(adv.port),
        isContainerRepo ? CONTAINER_REPO_URL : undefined,
        { autoInstall: autoInstall.value }
      )
      ElMessage.success(t('pageMgr.msgCopiedDir', { id }))
    } else {
      const id = await pagesStore.installGit(
        expandGitSource(s),
        adv.name.trim() || undefined,
        parsePort(adv.port),
        { autoInstall: autoInstall.value }
      )
      ElMessage.success(t('pageMgr.msgInstalledGit', { id }))
    }
    resetImportForm()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/** Install a published npm CLI package as a terminal page (main resolves/validates its bin). */
async function npmInstall(spec: string): Promise<string> {
  const id = await pagesStore.installNpm(spec, adv.name.trim() || undefined)
  ElMessage.success(t('pageMgr.msgInstalledNpm', { id }))
  return id
}

/** Red-tier one-click rescue: a rejected well-known repo ships an npm CLI — install that. */
async function installSuggestedNpm(): Promise<void> {
  const pkg = pre.suggestNpm
  if (!pkg) return
  try {
    await npmInstall(pkg)
    resetImportForm()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

function resetImportForm(): void {
  source.value = ''
  adv.name = ''
  adv.port = ''
  kindOverride.value = 'auto'
  pre.checking = false
  pre.tier = null
  pre.kind = undefined
  pre.reason = undefined
  pre.suggestNpm = undefined
}

/** Open the OS folder picker; the chosen absolute path auto-detects as a dir source. */
async function chooseDir(): Promise<void> {
  try {
    const res = await window.container.chooseDirectory()
    if (!res.ok) throw new Error(res.error || t('pageMgr.msgChooseDirFail'))
    if (res.data) source.value = String(res.data) // the source watch re-runs the pre-flight
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

/* ---- per-page config dialog: port override + auto-start (env dirs moved to the 环境目录 tab) ---- */
const configFor = ref<PageState | null>(null)
const configVisible = ref(false)
const configDraft = reactive({ port: '', autoStart: false })
const configSaving = ref(false)

/* ---- directory vars: the click-to-toggle two-choice pill the aggregated 环境目录 tab and
   AppManager show (system-common vs <envRoot>/<name>); text vars keep the free input ---- */
const { refreshEnvRoot, displayPath, installPathFor, choiceValue } = useEnvDirs()

/* ---- aggregated 环境目录 tab (moved out of 设置) ----
   The centralized per-page directory list the Settings “环境目录” tab used to own now lives
   beside the pages it configures. Same EnvDirChoice toggle, same filter as before (regular
   pages + dsh/openclaw; the manage-as-app rows already have their own AppManager inputs), so
   the visible set is unchanged — only the host moved. Drafts are keyed pageId::key and commit
   straight to settings.pageEnvs on change. */
interface EnvRow {
  key: string
  label: string
  description?: string
  /** 'text' rows are free-form values, not directories — no `~` expansion, own placeholder. */
  type?: 'dir' | 'text'
  /** empty-input fallback: the declared dir for path vars, the literal value for text ones. */
  fallback?: string
}
interface EnvSection {
  pageId: string
  pageName: string
  vars: EnvRow[]
}
const envSections = computed<EnvSection[]>(() =>
  pagesStore.pages
    .filter(
      (p) =>
        !p.external &&
        p.envVars?.length &&
        (!p.manageAsApp || p.kind === 'dsh' || p.kind === 'openclaw')
    )
    .map((p) => ({
      pageId: p.id,
      pageName: p.name,
      vars: (p.envVars ?? []).map((v) => ({
        key: v.key,
        label: v.label || v.key,
        description: v.description,
        type: v.type,
        fallback: v.type === 'text' ? v.defaultValue : v.defaultPath
      }))
    }))
)
const envDrafts = reactive<Record<string, string>>({})
const envDraftKey = (pageId: string, key: string): string => `${pageId}::${key}`

/** The per-row help: dir rows lead with the manifest's own note (container.json `description`,
 *  which used to be the visible label in the ⚙ dialog) before the shared two-choice explainer;
 *  text rows keep the manifest note / generic KEY=VALUE hint. */
function envRowTip(row: EnvRow): string {
  if (row.type !== 'text') {
    const generic = t('settings.envDirChoiceTip')
    return row.description ? `${row.description}：${generic}` : generic
  }
  if (row.description) return row.description
  const def = row.fallback ? t('settings.envInjectDefault', { path: row.fallback }) : ''
  return `${t('settings.envInjectPrefix')}${row.key}${t('settings.envInjectSuffix', { def })}`
}
/** System-common side path for a row (the resolved defaultPath), or '' when none. */
function envSystemPath(row: EnvRow): string {
  return row.fallback ? displayPath(row.fallback) : ''
}

// Seed drafts from persisted values; the getter must not touch envDrafts (tracking them would
// reset a half-typed free-form row on every keystroke). Re-seeds whenever the set/值 changes.
watch(
  () => [settingsStore.settings.pageEnvs, envSections.value] as const,
  () => {
    const stored = settingsStore.settings.pageEnvs || {}
    for (const section of envSections.value) {
      for (const row of section.vars) {
        const k = envDraftKey(section.pageId, row.key)
        const raw = stored[section.pageId]?.[row.key] || ''
        const val = row.type === 'text' ? raw : choiceValue(raw)
        if (envDrafts[k] !== val) envDrafts[k] = val
      }
    }
  },
  { immediate: true }
)

async function savePageEnv(pageId: string, key: string, value: string): Promise<void> {
  const next: Record<string, Record<string, string>> = JSON.parse(
    JSON.stringify(settingsStore.settings.pageEnvs || {})
  )
  next[pageId] = { ...(next[pageId] || {}), [key]: value.trim() }
  try {
    await settingsStore.patch({ pageEnvs: next })
    ElMessage.success(t('settings.pageEnvSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

// The pill prints resolved <envRoot>/<name> paths; refresh so they're truthful on first open of
// the tab even when the user never opened a config dialog (which also refreshes it).
onMounted(() => void refreshEnvRoot())

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
    // B2: an emptied value row deletes that variable — the only affordance that survives a
    // round trip through the settings store (an explicit `KEY: ''` would inject an empty var).
    // Declared env dirs are no longer edited here (they live in the 环境目录 tab), so this
    // patch commits only custom KEY=VALUE vars and never touches pageEnvs.
    const nextCustom: Record<string, Record<string, string>> = JSON.parse(
      JSON.stringify(settingsStore.settings.pageCustomEnvs || {})
    )
    if (draft) {
      if (Object.keys(draft.envs).length) nextCustom[page.id] = draft.envs
      else delete nextCustom[page.id]
    }
    await settingsStore.patch({ pageCustomEnvs: nextCustom })
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

/** Ask the AI about one error line from the page log — same affordance as the shared LogTimeline. */
async function askAboutLog(line: string): Promise<void> {
  const text = (line || '').trim()
  if (!text) return
  await askAiWith(`[${logFor.value?.name ?? 'page'}] ${text}`)
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

/* Sparkline geometry: a 78×18 strip inside the row badge, drawn with `preserveAspectRatio="none"`
   so only the viewBox matters. The full trend charts live in the reusable ResourceTrend view. */
const SPARK_W = 78
const SPARK_H = 18

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

/**
 * C2: hand the row to the main process, which opens (or focuses) its own window for it. Every kind
 * has a use now: an external page hosts its own URL, a CLI page runs a second, independent session.
 */
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
  <div class="page-manager" :class="{ 'single-pane': !!pane }">
    <el-tabs v-model="activeTab" class="v-tabs" :tab-position="props.tabPosition || 'left'">
      <el-tab-pane name="install">
        <template #label>
          <span class="tab-label"
            ><el-icon><Promotion /></el-icon>{{ t('pageMgr.tabImport') }}</span
          >
        </template>
        <div class="import-wrap">
          <p class="hint">{{ kindHint }}</p>
          <div class="src-row">
            <el-input
              v-model="source"
              size="large"
              clearable
              :placeholder="t('pageMgr.placeholderSmart')"
              @blur="runPreflight"
              @keyup.enter="install"
            >
              <template #prefix>
                <el-icon class="src-icon"><component :is="kindIcon" /></el-icon>
              </template>
            </el-input>
            <el-button
              size="large"
              :icon="FolderOpened"
              :title="t('pageMgr.btnBrowseDir')"
              @click="chooseDir"
            />
          </div>
          <div class="kind-row">
            <el-radio-group v-model="kindOverride" size="small">
              <el-radio-button value="auto">{{ t('pageMgr.seg.auto') }}</el-radio-button>
              <el-radio-button value="git">{{ t('pageMgr.seg.git') }}</el-radio-button>
              <el-radio-button value="dir">{{ t('pageMgr.seg.dir') }}</el-radio-button>
              <el-radio-button value="npm">{{ t('pageMgr.seg.npm') }}</el-radio-button>
            </el-radio-group>
            <el-tag size="small" effect="plain" :type="kindTagType">{{ kindLabel }}</el-tag>
            <span v-if="pre.checking" class="preflight-line">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>{{ t('pageMgr.pre.checking') }}</span>
            </span>
          </div>
          <el-alert
            v-if="pre.tier === 'red'"
            class="preflight-alert"
            type="error"
            show-icon
            :closable="false"
            :title="t('pageMgr.pre.red')"
          >
            <div class="pre-reason">{{ pre.reason }}</div>
            <el-button
              v-if="pre.suggestNpm"
              type="primary"
              size="small"
              class="via-npm"
              :loading="installing === 'npm'"
              @click="installSuggestedNpm"
            >
              {{ t('pageMgr.installViaNpm', { pkg: pre.suggestNpm }) }}
            </el-button>
          </el-alert>
          <el-alert
            v-else-if="pre.tier === 'yellow' || pre.tier === 'green'"
            class="preflight-alert"
            :type="pre.tier === 'yellow' ? 'warning' : 'success'"
            show-icon
            :closable="false"
            :title="
              t(pre.tier === 'yellow' ? 'pageMgr.pre.yellow' : 'pageMgr.pre.green', {
                kind: pre.kind || ''
              })
            "
          />
          <el-collapse v-model="advancedOpen" class="adv-collapse">
            <el-collapse-item name="adv" :title="t('pageMgr.advanced')">
              <div class="adv-grid">
                <div class="adv-item">
                  <div class="adv-label">{{ t('pageMgr.labelCustomDir') }}</div>
                  <el-input
                    v-model="adv.name"
                    :placeholder="t('pageMgr.placeholderDirName')"
                    clearable
                  />
                </div>
                <div v-if="kind !== 'npm'" class="adv-item">
                  <div class="adv-label">{{ t('pageMgr.labelPort') }}</div>
                  <el-input
                    v-model="adv.port"
                    :placeholder="t('pageMgr.placeholderPort')"
                    clearable
                  />
                </div>
                <el-checkbox v-if="kind !== 'npm'" v-model="autoInstall">{{
                  t('pageMgr.autoInstall')
                }}</el-checkbox>
              </div>
            </el-collapse-item>
          </el-collapse>
          <el-button
            type="primary"
            size="large"
            class="install-btn"
            :loading="!!installing"
            :disabled="!kind || pre.tier === 'red'"
            @click="install"
          >
            {{ t('pageMgr.btnImport') }}
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
        </div>
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
          <!-- Cell overflow tooltips share the themed glass bubble (dsh-tip-popper in glass.css
               tracks --glass/--accent, so light/dark both follow the theme + frosted slider);
               the object form is merged into the underlying ElTooltip props by EP. -->
          <el-table
            :data="pagesStore.pages"
            size="small"
            :empty-text="t('pageMgr.msgEmpty')"
            :show-overflow-tooltip="{ popperClass: 'dsh-tip-popper dsh-cell-tip' }"
          >
            <el-table-column prop="name" :label="t('pageMgr.colName')" min-width="120">
              <template #default="{ row }">
                <div class="cell-name">
                  <!-- A missing runtime never "starts": keep the dot grey instead of implying
                   progress (the amber 启动中 dot used to spin forever on these rows). A disabled
                   page is stopped by definition — its dot must not echo a stale status. -->
                  <span
                    class="status-dot"
                    :class="
                      row.disabled || runtimeMissing(row) ? 'stopped' : row.status
                    "
                  />
                  <!-- D1: a manifest-shipped icon when the page provides one; the plain name
                       remains the fallback (no letter glyph to fight the status dot with). -->
                  <img v-if="row.iconUrl" class="cell-icon" :src="row.iconUrl" alt="" />
                  {{ row.name }}
                  <span v-if="row.disabled" class="disabled-tag">
                    {{ t('pageMgr.disabledTag') }}
                  </span>
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
            <el-table-column :label="t('pageMgr.colPort')" width="88">
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
              width="248"
              align="right"
              class-name="col-actions"
            >
              <template #default="{ row }">
                <!-- Icon-only actions (with tooltips), color-coded so each glyph reads at a
                     glance: green=start / amber=stop / blue=config & popout / red=remove.
                     No `:loading` here — it used to swap the glyph for a spinner and lock the
                     row; a booting service is now stoppable straight from this button. -->
                <el-button
                  v-if="
                    !row.external &&
                    !row.disabled &&
                    (row.kind === 'terminal' || row.containerPort || row.port)
                  "
                  size="small"
                  text
                  :type="
                    row.status === 'running' || row.status === 'starting'
                      ? 'warning'
                      : 'success'
                  "
                  :title="
                    row.status === 'running' || row.status === 'starting'
                      ? t('pageMgr.actionStop')
                      : t('pageMgr.actionStart')
                  "
                  @click="
                    row.status === 'running'
                      ? pagesStore.stop(row.id)
                      : row.status === 'starting'
                        ? pagesStore.cancel(row.id)
                        : runtimeMissing(row)
                          ? guideForMissing(row)
                          : runRow(row)
                  "
                >
                  <el-icon>
                    <VideoPause v-if="row.status === 'running' || row.status === 'starting'" />
                    <VideoPlay v-else />
                  </el-icon>
                </el-button>
                <el-button
                  v-if="!row.external"
                  size="small"
                  text
                  type="primary"
                  :title="t('pageMgr.actionConfig')"
                  @click="openConfig(row)"
                >
                  <el-icon><Setting /></el-icon>
                </el-button>
                <!-- C2: every row is detachable — see popoutRow() for what each kind shows there.
                     Share (box + outgoing arrow) instead of CopyDocument: the old glyph read as
                     "copy", not "detach into its own window". -->
                <el-button
                  v-if="!row.disabled"
                  size="small"
                  text
                  type="primary"
                  :title="t('pageMgr.popoutTip')"
                  @click="popoutRow(row)"
                >
                  <el-icon><Share /></el-icon>
                </el-button>
                <el-button
                  size="small"
                  text
                  type="primary"
                  :title="t('pageMgr.actionTerminal')"
                  @click="openTerminal(row)"
                >
                  <el-icon><Monitor /></el-icon>
                </el-button>
                <el-button
                  size="small"
                  text
                  type="primary"
                  :title="t('pageMgr.actionLogs')"
                  @click="showLogs(row)"
                >
                  <el-icon><Document /></el-icon>
                </el-button>
                <!-- The built-in's removal substitute: switch it off (hidden from the switcher,
                     never started) instead — reversible, and the files/entry stay intact.
                     Filled ⊗ (CircleCloseFilled) reads as the standard "forbidden" mark; the
                     outline variant looked like a plain close button. -->
                <el-button
                  v-if="canToggleDisable(row)"
                  size="small"
                  text
                  :type="row.disabled ? 'success' : 'warning'"
                  :title="row.disabled ? t('pageMgr.enableTip') : t('pageMgr.disableTip')"
                  @click="toggleDisabled(row)"
                >
                  <el-icon>
                    <CircleCheck v-if="row.disabled" />
                    <CircleCloseFilled v-else />
                  </el-icon>
                </el-button>
                <el-button
                  v-if="!row.builtin"
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

      <!-- 环境目录：从「设置」搬来的集中式每页目录开关，与齿轮里的配置同源（写 pageEnvs）。 -->
      <el-tab-pane name="env">
        <template #label>
          <span class="tab-label"
            ><el-icon><FolderOpened /></el-icon>{{ t('settings.tabEnv') }}</span
          >
        </template>
        <div v-if="envSections.length" class="env-list">
          <div v-for="section in envSections" :key="section.pageId" class="env-section glass-soft">
            <div class="env-page-name neon">{{ section.pageName }}</div>
            <!-- Top labels so every row's control shares one left edge (对齐) and the two
                 directory cards get full width instead of fighting a variable label column. -->
            <el-form label-position="top" size="small">
              <el-form-item v-for="row in section.vars" :key="row.key">
                <template #label>
                  {{ row.label }}
                  <el-tooltip
                    :content="envRowTip(row)"
                    placement="top"
                    popper-class="dsh-tip-popper"
                  >
                    <el-icon class="env-info"><InfoFilled /></el-icon>
                  </el-tooltip>
                  <!-- The manifest's own note stays visible too (it was the label text in the old
                       ⚙ dialog); the tooltip carries the fuller two-choice explanation. -->
                  <span v-if="row.description" class="env-desc">{{ row.description }}</span>
                </template>
                <EnvDirChoice
                  v-if="row.type !== 'text'"
                  :model-value="envDrafts[envDraftKey(section.pageId, row.key)] || ''"
                  :system-path="envSystemPath(row)"
                  :install-path="installPathFor(row.key, section.pageId)"
                  @update:model-value="savePageEnv(section.pageId, row.key, String($event))"
                />
                <el-input
                  v-else
                  :model-value="envDrafts[envDraftKey(section.pageId, row.key)] || ''"
                  :placeholder="
                    row.fallback
                      ? t('settings.envTextPlaceholder', { v: row.fallback })
                      : t('settings.envInputPlaceholderEmpty')
                  "
                  class="env-free"
                  clearable
                  @update:model-value="
                    envDrafts[envDraftKey(section.pageId, row.key)] = String($event)
                  "
                  @change="savePageEnv(section.pageId, row.key, String($event))"
                />
              </el-form-item>
            </el-form>
          </div>
        </div>
        <div v-else class="env-empty">{{ t('settings.envSectionEmpty') }}</div>
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
      <LogTimeline
        v-if="logFor?.lines.length"
        :lines="logFor.lines"
        newest-first
        max-height="56vh"
        @ask="askAboutLog"
      />
      <pre v-else class="log-box">{{ t('pageMgr.logEmpty') }}</pre>
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

        <!-- B2: arbitrary KEY=VALUE for this page. Declared env dirs are configured in the
             环境目录 tab now, so they no longer appear here. -->
        <CustomEnvEditor
          v-if="configFor"
          :key="configSeq"
          ref="customEnvRef"
          :page-id="configFor.id"
        />
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
/* Single-pane (IM sidebar): hide the tab rail so the shown pane fills the column. */
.page-manager.single-pane :deep(.v-tabs > .el-tabs__header) {
  display: none;
}
/* Next to a disabled built-in's name: the same quiet pill language as the switcher's
   未安装 tag, so a switched-off row reads as "deliberately off", not "broken". */
.disabled-tag {
  flex: none;
  margin-left: 6px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
  border-radius: 8px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  background: var(--glass-chip);
}
.hint {
  color: var(--text-dim);
  font-size: 13px;
  margin: 4px 0 14px;
}
.hint code {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 12px;
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
/* Pre-flight verdict under the source field: a slim banner naming the tier + reason. */
.preflight-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.preflight-alert {
  margin-top: 8px;
  max-width: 480px;
}
/* Smart import: one source row + browse button, kind chips under it, action at the bottom. */
.import-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 620px;
}
.import-wrap .hint {
  margin: 0;
}
.src-row {
  display: flex;
  gap: 8px;
}
.src-row .el-input {
  flex: 1;
}
.src-icon {
  color: var(--text-dim);
}
.kind-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: -6px;
}
.pre-reason {
  font-size: 12px;
  line-height: 1.6;
}
.via-npm {
  margin-top: 8px;
}
.adv-collapse {
  max-width: 480px;
  margin-top: -2px;
}
.adv-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.adv-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
}
.install-btn {
  align-self: flex-start;
  min-width: 180px;
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
  background: var(--glass-chip);
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 11.5px;
}
/* Icon-only action column: lay the buttons out on one flex line with an even rhythm.
   The cell keeps `overflow: visible` so the enlarged glyphs never trip el-table's
   trailing "…" ellipsis handling. */
.installed :deep(.col-actions .cell) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
}
/* The flex gap owns the rhythm, so drop Element Plus's fixed sibling margin. */
.installed :deep(.col-actions .el-button + .el-button) {
  margin-left: 0;
}
/* Roomier hit area + bigger glyphs: the actions used to render as faint 14px marks
   that were hard to tell apart at a glance. Padding stays tight — a built-in row packs
   seven slots, and the chips + glow must fit the fixed column without clipping. */
.installed :deep(.col-actions .el-button.is-text) {
  padding: 4px 5px;
  height: auto;
}
/* Highlight chip: every action sits on a soft tile tinted with its own semantic color
   (currentColor mixes down to a pale wash), so start/stop/remove/disable read as
   highlighted buttons instead of bare glyphs — and the hover state deepens the tile.
   The neon glow used to come only from glass.css's `.el-button--primary` shadow, so
   success/warning/danger rows looked flat next to the primary ones — cast it from
   currentColor instead and every semantic type glows in its own hue. */
.installed :deep(.col-actions .el-button.is-text) {
  background: color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 8px;
  box-shadow: 0 4px 14px color-mix(in srgb, currentColor 35%, transparent);
}
.installed :deep(.col-actions .el-button.is-text:hover) {
  background: color-mix(in srgb, currentColor 26%, transparent);
  box-shadow: 0 6px 18px color-mix(in srgb, currentColor 55%, transparent);
}
.installed :deep(.col-actions .el-icon) {
  font-size: 18px;
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
  background: var(--glass-well);
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

/* ---- aggregated 环境目录 tab (moved out of 设置) ----
   Each page is a frosted `.glass-soft` card (毛玻璃) with an accent-barred neon heading
   (高亮 + 层次感); inside, top-labelled rows share one left edge (对齐) and light up with an
   accent wash on hover. EnvDirChoice already tints its selected card with --accent, so the
   directory pick keeps reading as highlighted. */
.env-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 2px 6px;
}
.env-section {
  padding: 12px 14px 2px;
}
.env-page-name {
  position: relative;
  padding-left: 11px;
  margin: 2px 0 12px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text);
}
.env-page-name::before {
  content: '';
  position: absolute;
  left: 0;
  top: 1px;
  bottom: 1px;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 55%, transparent);
}
.env-info {
  color: var(--text-dim);
  cursor: help;
  vertical-align: -2px;
  margin-left: 3px;
}
/* Manifest note on its own quiet line under 标签 + ⓘ (el-form's top label is a flex row, so
   width:100% forces the wrap) — keeps the per-directory hint from container.json visible. */
.env-desc {
  width: 100%;
  font-size: 11.5px;
  line-height: 1.4;
  font-weight: 400;
  color: var(--text-dim);
}
.env-free {
  width: 100%;
}
/* Rows read as stacked bands inside the card: a transparent hairline at rest that only the
   accent wash lights up on hover, so the frosted card stays the primary surface. */
.env-list :deep(.el-form-item) {
  padding: 8px 10px;
  margin-bottom: 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.env-list :deep(.el-form-item):hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent) inset;
}
.env-list :deep(.el-form-item__label) {
  color: var(--text);
  font-weight: 600;
  padding-bottom: 4px;
}
.env-empty {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
  padding: 8px 2px;
}
</style>

<style>
/* ElMessageBox renders on body, so scoped styles cannot reach it. */
.port-prompt .el-input__wrapper {
  background: var(--glass-well);
  box-shadow: 0 0 0 1px var(--border) inset;
}
.port-prompt .el-input__inner {
  color: var(--text);
}
</style>
