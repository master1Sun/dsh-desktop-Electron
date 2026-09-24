<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import { ElIcon, ElMessage, ElMessageBox, ElTooltip } from 'element-plus'
import {
  Monitor,
  Operation,
  Download,
  Connection,
  Lock,
  Bell,
  Key,
  Coin,
  InfoFilled
} from '@element-plus/icons-vue'
import { usePagesStore } from '@renderer/stores/pages'
import { useSettingsStore } from '@renderer/stores/settings'
import type { DefaultView } from '@renderer/stores/settings'
import type {
  DiskReport,
  DiskScope,
  DownloadDirInfo,
  RegistryProbe,
  WebDataReport
} from '@shared/types'
import {
  GLASS_BLUR_MAX_PX,
  GLASS_FROST_MAX_PCT,
  NPM_REGISTRY_DEFAULT,
  REGISTRY_CANDIDATES,
  DEFAULT_KEYBINDINGS,
  KEYBINDING_ACTIONS,
  type KeybindingAction
} from '@shared/types'
import { acceleratorFromEvent, formatAccelerator, parseAccelerator } from '@shared/accel'
import { t } from '@renderer/i18n'
import { useStaleCache } from '@renderer/composables/useStaleCache'

const emit = defineEmits<{
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  'preview-site': [url: string]
}>()

/* Optional single-pane mode for the IM sidebar: when a host passes `pane`, the vertical tab rail is
 * hidden and that tab is shown on its own. Absent (classic) = full tabbed card, unchanged.
 * `tabPosition` flips the rail to a top strip for the IM popup; unset = classic vertical left. */
const props = defineProps<{
  pane?: string
  tabPosition?: 'left' | 'top'
  /** Deep-link tab from the command palette; applied only on change so free clicking still works. */
  initialTab?: string
}>()

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()

/**
 * A compact ⓘ that reveals a row's full description on hover. Settings rows used to render a
 * permanent `<div class="tip">` paragraph under every control, which made the panel tall and
 * noisy; the wording lives here instead so each row stays on one line.
 */
const InfoTip = defineComponent({
  name: 'InfoTip',
  props: { content: { type: String, required: true } },
  setup: (props) => () =>
    h(
      ElTooltip,
      {
        content: props.content,
        placement: 'top',
        showAfter: 120,
        popperClass: 'settings-tip-popper dsh-tip-popper'
      },
      {
        default: () =>
          h(
            ElIcon,
            {
              class: 'tip-icon',
              style: {
                fontSize: '14px',
                color: 'var(--text-dim)',
                marginLeft: '5px',
                verticalAlign: 'middle',
                cursor: 'help'
              }
            },
            { default: () => h(InfoFilled) }
          )
      }
    )
})

/** Which settings tab is open — one of view / behavior / alerts / keys / download / network / env / privacy / storage. */
const activeTab = ref(props.pane || props.initialTab || 'view')
watch(
  () => props.pane,
  (p) => {
    if (p) activeTab.value = p
  }
)
// #5: a palette deep link must still move the rail while the panel is already mounted, but only
// on an actual change (else every parent re-render would yank the user back to the linked tab).
watch(
  () => props.initialTab,
  (tab) => {
    if (tab) activeTab.value = tab
  }
)

/* 环境目录 moved out of 设置: per-page directory env is now configured in the Pages panel
   (PageManager → 环境目录 tab), so Settings no longer owns any env-var UI. */

/* ---- C1 editable shortcuts ----
   Only overrides live in settings: an absent key means "shipped default", an empty string means
   the user deliberately unbound it. Both are shown so 恢复默认 is never a surprise. */
const recording = ref<KeybindingAction | null>(null)

interface KeyRow {
  action: KeybindingAction
  name: string
  /** display form of the effective binding; '' when unbound */
  text: string
  /** the other action sharing this combination, when there is one */
  conflictWith: string
  custom: boolean
  defaultText: string
}

const keyRows = computed<KeyRow[]>(() => {
  const stored = settingsStore.settings.keybindings || {}
  const effective: Record<KeybindingAction, string> = { ...DEFAULT_KEYBINDINGS }
  for (const action of KEYBINDING_ACTIONS) {
    const v = stored[action]
    if (typeof v === 'string') effective[action] = v
  }
  // Two actions on one combination is a user error worth naming, not just a red box: the
  // matcher resolves it by table order, so the loser would look like an intermittent bug.
  const holders = new Map<string, KeybindingAction[]>()
  for (const action of KEYBINDING_ACTIONS) {
    const accel = effective[action]
    if (!accel) continue
    holders.set(accel, [...(holders.get(accel) || []), action])
  }
  return KEYBINDING_ACTIONS.map((action) => {
    const accel = effective[action]
    const others = (holders.get(accel) || []).filter((a) => a !== action)
    return {
      action,
      name: t(`kb.${action}`),
      text: formatAccelerator(accel),
      conflictWith: others.length ? t(`kb.${others[0]}`) : '',
      custom: stored[action] !== undefined && stored[action] !== DEFAULT_KEYBINDINGS[action],
      defaultText: t('settings.keysDefault', {
        key: formatAccelerator(DEFAULT_KEYBINDINGS[action])
      })
    }
  })
})

async function saveKeybinding(action: KeybindingAction, accel: string): Promise<void> {
  const next = { ...(settingsStore.settings.keybindings || {}), [action]: accel }
  await patch({ keybindings: next }, t('settings.keysSaved'))
}

/** Drop one row's override so it falls back to its built-in default — the row-level
    counterpart of the header's whole-table reset. Deleting the key (not writing '')
    matters: '' persists as "explicitly unbound". */
async function restoreKeybinding(action: KeybindingAction): Promise<void> {
  const next = { ...(settingsStore.settings.keybindings || {}) }
  delete next[action]
  await patch({ keybindings: next }, t('settings.keysResetDone'))
}

/**
 * Capture-mode keydown. The recorder owns the key, so both the global handler in App.vue and the
 * focused hosted page must be kept from also acting on it — hence preventDefault + stop.
 */
function onRecordKeydown(action: KeybindingAction, ev: KeyboardEvent): void {
  ev.preventDefault()
  ev.stopPropagation()
  if (ev.key === 'Escape') {
    recording.value = null // Esc means "cancel" here, even though it is a bindable key elsewhere
    return
  }
  const accel = acceleratorFromEvent({
    key: ev.key,
    code: ev.code,
    ctrl: ev.ctrlKey,
    shift: ev.shiftKey,
    alt: ev.altKey,
    meta: ev.metaKey
  })
  if (!accel) return // a bare modifier is a prefix, not a shortcut yet
  if (!parseAccelerator(accel)) {
    ElMessage.warning(t('settings.keysBad'))
    return
  }
  recording.value = null
  void saveKeybinding(action, accel)
}

/** A whole-settings write: main replaces the key outright, so `{}` really does restore the table. */
async function resetKeybindings(): Promise<void> {
  await patch({ keybindings: {} }, t('settings.keysResetDone'))
}

/* ---- 下载目录 ----
   Embedded-page / external-site downloads save straight here (no "Save As" prompt); empty
   follows the OS Downloads folder. Mirrors the env-root browse/save row above. */
const downloadDirInfo = useStaleCache<DownloadDirInfo | null>('settings.downloadDir', null)
const downloadDirDraft = ref('')

async function loadDownloadDir(): Promise<void> {
  const res = await window.container.getDownloadDir?.().catch(() => null)
  if (!res?.ok) return
  downloadDirInfo.value = res.data as DownloadDirInfo
  downloadDirDraft.value = downloadDirInfo.value?.custom
    ? settingsStore.settings.downloadDir || ''
    : ''
}

async function saveDownloadDir(value: string): Promise<void> {
  await patch({ downloadDir: value.trim() }, t('settings.downloadSaved'))
  await loadDownloadDir()
}

async function browseDownloadDir(): Promise<void> {
  const res = await window.container
    .chooseDirectory(t('settings.chooseDownloadDir'))
    .catch(() => null)
  if (!res?.ok || !res.data) return
  downloadDirDraft.value = String(res.data)
  await saveDownloadDir(downloadDirDraft.value)
}

onMounted(loadDownloadDir)

function decodeView(v: string): DefaultView {
  if (v.startsWith('page:')) return { kind: 'page', pageId: v.slice(5) }
  if (v.startsWith('ext:')) return { kind: 'external', url: v.slice(4) }
  return { kind: 'none' }
}

/** Pages and external URLs share one select, so the value carries its own kind. */
const viewValue = computed({
  get: () => {
    const dv = settingsStore.settings.defaultView
    if (dv.kind === 'page') return `page:${dv.pageId}`
    if (dv.kind === 'external') return `ext:${dv.url}`
    return 'none'
  },
  set: (v: string) => void patch({ defaultView: decodeView(v) }, t('settings.defaultViewSaved'))
})

const viewOptions = computed(() => {
  type Option = { value: string; label: string; disabled?: boolean }
  const dv = settingsStore.settings.defaultView
  const plain: Option[] = [
    { value: 'none', label: t('settings.nonePage') },
    // Not gated on `status === 'running'` anymore: the container now auto-starts the
    // configured default page on launch, so any page can be picked.
    // Disabled pages leave the picker entirely — except the one already saved as the
    // default, which stays as a greyed row so the select doesn't show a blank current
    // value; re-enabling the page hands the choice back untouched.
    ...pagesStore.pages
      .filter((p) => !p.disabled || (dv.kind === 'page' && dv.pageId === p.id))
      .map<Option>((p) => ({
        value: `page:${p.id}`,
        disabled: p.disabled || undefined,
        label: `${p.name}${p.disabled ? ` ${t('pageMgr.disabledTag')}` : p.external ? t('settings.tagExternal') : p.kind === 'dsh' ? t('settings.tagDsh') : p.kind === 'terminal' ? t('settings.tagTerminal') : p.containerPort || p.port ? ` :${p.containerPort || p.port}` : ''}`
      }))
  ]
  // Saved external addresses are default-view candidates too — one row per site, keyed by
  // its URL (the persisted DefaultView only carries the url, not the site id).
  const sites = settingsStore.settings.externalSites
  const extOptions: Option[] = sites.map((s) => ({ value: `ext:${s.url}`, label: s.name }))
  // A saved default whose site was since deleted still needs a matching option, or the
  // select would show a blank current value — keep the raw url as a fallback row.
  const orphanUrl = dv.kind === 'external' ? (dv.url || '').trim() : ''
  if (orphanUrl && !sites.some((s) => s.url === orphanUrl)) {
    extOptions.push({ value: `ext:${orphanUrl}`, label: orphanUrl })
  }
  const groups: { label: string; options: Option[] }[] = extOptions.length
    ? [{ label: t('settings.externalAddress'), options: extOptions }]
    : []
  return { plain, groups }
})

async function patch(
  partial: Parameters<typeof settingsStore.patch>[0],
  msg = t('settings.saved')
): Promise<void> {
  try {
    await settingsStore.patch(partial)
    if (msg) ElMessage.success(msg)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

function onThemeChange(mode: 'auto' | 'light' | 'dark'): void {
  emit('apply-theme', mode)
  patch({ theme: mode }, t('settings.themeSwitched'))
}

/**
 * Switching language persists the choice; App.vue's watcher applies it reactively. No toast on
 * purpose: the whole panel re-renders immediately (self-evident feedback), and a toast raised
 * here would still carry the *previous* language's "saved" text.
 */
function onLocaleChange(next: 'zh' | 'en'): void {
  settingsStore.patch({ locale: next }).catch((err) => ElMessage.error((err as Error).message))
}

/* #25: a single "frosted glass" slider drives BOTH axes at once — blur strength
   (--glass-blur) and surface opacity (--glass-tint-a). frost 0 = solid (no blur, near-opaque),
   100 = heavy frost (max blur, most see-through). It still persists into the two existing
   settings (glassBlur / glassAlpha) so the main process, App.vue and the four frosted surfaces
   keep consuming them unchanged. Local draft + @input live preview; @change talks to main once. */
const FROST_BLUR_MAX_PX = GLASS_BLUR_MAX_PX // frost 100 → the shared blur ceiling (25px)
const FROST_ALPHA_TOP = 96 // frost 0 → 96% opaque (near-solid)
const FROST_ALPHA_BOTTOM = 8 // frost 100 → 8% opaque (very transparent)
/** UI cap: the slider tops out at 40 (of the 0-100 frost scale) ≈ 10px blur / 61% opaque —
    past that the frosting reads as a smudge, so the scale itself stops here. Shared with
    App.vue's render clamps so stale settings can't outlive the ceiling either. Anything the
    user drags or a stale setting carries above this level clamps on display. */
const FROST_MAX = GLASS_FROST_MAX_PCT
function blurFromFrost(f: number): number {
  return Math.round((f / 100) * FROST_BLUR_MAX_PX)
}
function alphaFromFrost(f: number): number {
  return Math.round(FROST_ALPHA_TOP - (f / 100) * (FROST_ALPHA_TOP - FROST_ALPHA_BOTTOM))
}
/** Derive the displayed frost level from the persisted blur (opacity is redundant now). */
function frostFromSettings(): number {
  const blur = settingsStore.settings.glassBlur ?? 30
  return Math.min(FROST_MAX, Math.max(0, Math.round((blur / FROST_BLUR_MAX_PX) * 100)))
}
const frostDraft = ref(frostFromSettings())
watch(
  () => settingsStore.settings.glassBlur,
  () => {
    const next = frostFromSettings()
    if (next !== frostDraft.value) frostDraft.value = next
  }
)
function previewFrost(f: number): void {
  const root = document.documentElement.style
  const blur = blurFromFrost(f)
  root.setProperty('--glass-blur', `${blur}px`)
  root.setProperty('--glass-blur-n', `${blur}`)
  root.setProperty('--glass-tint-a', (alphaFromFrost(f) / 100).toFixed(3))
}
function commitFrost(f: number): void {
  void patch({ glassBlur: blurFromFrost(f), glassAlpha: alphaFromFrost(f) }, '')
}

/* ---- #26: 内存告警阈值 -------------------------------------------------------------
   memWarnMb drives the gold tray badge and the over-budget row colour. (Terminal height is set by
   dragging the dock edge, not here — see TerminalDrawer.) */
const MEM_WARN_MIN_MB = 100
const MEM_WARN_MAX_MB = 8000
const memWarnDraft = ref(settingsStore.settings.memWarnMb ?? 800)
watch(
  () => settingsStore.settings.memWarnMb,
  (mem) => {
    const nextMem = mem ?? 800
    if (nextMem !== memWarnDraft.value) memWarnDraft.value = nextMem
  }
)

/* ---- #26: 网络镜像 ---------------------------------------------------------------
   One setting (npmRegistry) decides where every install the container drives goes. The panel can
   measure all candidate mirrors at once and jump to the fastest reachable one. An empty setting is
   *not* "no registry" — it means the built-in default, so the picker writes '' for that row. */
const registryProbes = useStaleCache<Record<string, RegistryProbe>>('settings.registryProbes', {})
const probing = ref(false)
const currentRegistry = computed(
  () => settingsStore.settings.npmRegistry?.trim() || NPM_REGISTRY_DEFAULT
)
const customRegistry = ref(settingsStore.settings.npmRegistry || '')
watch(
  () => settingsStore.settings.npmRegistry,
  () => {
    const next = settingsStore.settings.npmRegistry || ''
    if (next !== customRegistry.value) customRegistry.value = next
  }
)
function isCurrent(url: string): boolean {
  return url === currentRegistry.value
}
function labelOf(label: { zh: string; en: string }): string {
  return settingsStore.settings.locale === 'en' ? label.en : label.zh
}
function msText(id: string): string {
  const p = registryProbes.value[id]
  if (!p) return t('settings.registryNotProbed')
  return p.ok ? `${p.ms} ms` : t('settings.registryUnreachable')
}
function probeClass(id: string): string {
  const p = registryProbes.value[id]
  return p ? (p.ok ? 'ok' : 'bad') : ''
}
/** Fastest reachable candidate, or '' when nothing answered (never pick a dead mirror). */
const bestRegistry = computed<RegistryProbe | null>(() => {
  const ok = Object.values(registryProbes.value).filter((p) => p.ok && Number.isFinite(p.ms))
  if (!ok.length) return null
  return ok.reduce((a, b) => ((a.ms ?? 1e9) <= (b.ms ?? 1e9) ? a : b))
})
const bestName = computed(() => {
  const best = bestRegistry.value
  if (!best) return ''
  return labelOf(
    REGISTRY_CANDIDATES.find((c) => c.id === best.id)?.label ?? { zh: best.url, en: best.url }
  )
})
/** The 使用最快 mirror button only belongs on the row that actually won the probe. */
function rowHasBest(url: string): boolean {
  return !!bestRegistry.value && bestRegistry.value.url === url
}
async function probeAllRegistries(): Promise<void> {
  if (probing.value) return
  probing.value = true
  try {
    const res = await window.container.probeRegistries()
    if (!res?.ok) throw new Error(res?.error || t('common.unknownError'))
    const map: Record<string, RegistryProbe> = {}
    for (const p of (res.data ?? []) as RegistryProbe[]) map[p.id] = p
    registryProbes.value = map
    const best = bestRegistry.value
    if (best) ElMessage.success(t('settings.registryProbed', { ms: best.ms ?? 0 }))
    else ElMessage.warning(t('settings.registryProbeNone'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    probing.value = false
  }
}
async function useRegistry(url: string, msg = t('settings.registrySwitched')): Promise<void> {
  // Writing '' for the built-in mirror keeps the stored setting equal to a fresh install.
  const next = url === NPM_REGISTRY_DEFAULT ? '' : url
  customRegistry.value = next
  await patch({ npmRegistry: next }, msg)
}
async function saveCustomRegistry(value: string): Promise<void> {
  const url = value.trim().replace(/\/+$/, '')
  customRegistry.value = url
  if (!url) return void useRegistry(NPM_REGISTRY_DEFAULT)
  if (!/^https?:\/\//i.test(url)) {
    ElMessage.error(t('settings.registryBadUrl'))
    return
  }
  await useRegistry(url)
}

/* ---- #26: 隐私数据 ---------------------------------------------------------------
   Every <webview> shares one session, so this is deliberately explicit about scope: a per-domain
   cookie wipe is offered next to the global ones, and anything that logs the user out of
   *every* hosted service asks first. */
const webData = useStaleCache<WebDataReport | null>('settings.webData', null)
const webDataLoading = ref(false)
const webDataBusy = ref('')

function sizeText(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`
}

/** Cache + site data, shown once in the header row so each category row can keep its own size. */
const webDataTotal = computed(() =>
  sizeText((webData.value?.cacheBytes ?? 0) + (webData.value?.storageBytes ?? 0))
)

async function loadWebData(): Promise<void> {
  webDataLoading.value = true
  try {
    const res = await window.container.getWebData?.()
    if (res?.ok) webData.value = (res.data ?? null) as WebDataReport | null
  } catch {
    /* a failed read just leaves the previous report on screen */
  } finally {
    webDataLoading.value = false
  }
}

/** Clear one scope; `confirmKey` marks the destructive ones (they sign pages out). */
async function clearWeb(
  scope: 'cache' | 'cookies' | 'storage' | 'all',
  domain?: string,
  confirmKey = ''
): Promise<void> {
  if (confirmKey) {
    try {
      await ElMessageBox.confirm(t(confirmKey), t('settings.webDataClear'), {
        type: 'warning',
        confirmButtonText: t('common.ok'),
        cancelButtonText: t('common.cancel')
      })
    } catch {
      return
    }
  }
  webDataBusy.value = domain ? `${scope}:${domain}` : scope
  try {
    const res = await window.container.clearWebData({ scope, domain })
    if (!res?.ok) throw new Error(res?.error || t('common.unknownError'))
    const n = (res.data as { removedCookies: number }).removedCookies
    ElMessage.success(
      scope === 'cookies' && n
        ? t('settings.webDataCookiesGone', { n })
        : t('settings.webDataCleared')
    )
    await loadWebData()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    webDataBusy.value = ''
  }
}

onMounted(loadWebData)

/* ---- per-site cookie clear (select + button) ----
   One dropdown lists each site with its cookie count; picking only *selects* a target, and a
   清除 button on the right commits it. Splitting select from action avoids an accidental wipe
   (a mis-pick no longer clears instantly); the button stays disabled until a site is chosen, and
   the row resets once that site's cookies are gone. */
const siteClear = ref('')
async function clearSelectedSite(): Promise<void> {
  const domain = siteClear.value
  if (!domain) return
  await clearWeb('cookies', domain)
  siteClear.value = ''
}

/* ---- #8: 存储 (disk-usage dashboard) ----------------------------------------------
   A bounded recursive scan of everything the container owns on disk, so a user running out of
   room can see which bucket (imported pages / provisioned runtimes / logs / webview cache) is
   heavy before cleaning. Only `webcache` and `logs` are clearable from here — every other scope
   is real page/runtime data that has to go through its own manager. */
const disk = useStaleCache<DiskReport | null>('settings.disk', null)
const diskLoading = ref(false)
const diskBusy = ref('')
/** Rows with an explicit clear route in the main process; anything else has no wipe button. */
const CLEARABLE_SCOPES = new Set(['webcache', 'logs'])
/** The synthetic marker disk-usage appends when a scan cap was hit — never shown as a data row. */
const diskTruncated = computed(() => disk.value?.scopes.some((s) => s.id === '__truncated__') ?? false)
const diskScopes = computed(() => (disk.value?.scopes ?? []).filter((s) => s.id !== '__truncated__'))
/** Share of the scanned total, for the per-row proportion bar. */
function diskPct(bytes: number): number {
  const total = disk.value?.usedBytes ?? 0
  return total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0
}
/** Top-level scopes biggest-first: the heaviest bucket leads both the stacked bar and the rows,
 *  so "where did my disk go" is answerable from the top down without scanning every line. */
const sortedDiskScopes = computed(() => [...diskScopes.value].sort((a, b) => b.bytes - a.bytes))
/** Fixed palette so a bucket keeps the SAME colour in the stacked bar and its row dot. */
const DISK_PALETTE = [
  '#5b8cff',
  '#37c8a0',
  '#f2a341',
  '#e5636f',
  '#9b7bf0',
  '#3fb6d8',
  '#c9a227',
  '#6fbf5a',
  '#d76bb0'
]
function diskColorAt(i: number): string {
  return DISK_PALETTE[i % DISK_PALETTE.length]
}
/** Children biggest-first, and each child's bar weighed against ITS parent's total (a scope's
 *  bytes already include its children), so nested rows read as slices of that row, not the disk. */
function sortedChildren(s: DiskScope): DiskScope[] {
  return [...(s.children ?? [])].sort((a, b) => b.bytes - a.bytes)
}
function childPct(childBytes: number, parentBytes: number): number {
  return parentBytes > 0 ? Math.min(100, Math.round((childBytes / parentBytes) * 100)) : 0
}
/** Segments of the stacked overview bar (width = exact share, so the whole bar sums to 100%). */
const diskSegments = computed(() => {
  const total = disk.value?.usedBytes ?? 0
  if (total <= 0) return []
  return sortedDiskScopes.value
    .filter((s) => s.bytes > 0)
    .map((s) => ({
      id: s.id,
      name: s.label || t(s.labelKey),
      pct: (s.bytes / total) * 100,
      bytes: s.bytes
    }))
})
/** Volume usage percent for the header bar; falls back to the scanned total when statfs is mute. */
const diskVolumePct = computed(() => {
  const r = disk.value
  if (!r) return 0
  if (r.totalBytes && r.totalBytes > 0) {
    const used = r.totalBytes - (r.freeBytes ?? 0)
    return Math.min(100, Math.max(0, Math.round((used / r.totalBytes) * 100)))
  }
  return 0
})

async function loadDisk(): Promise<void> {
  diskLoading.value = true
  try {
    const res = await window.container.getDiskReport?.()
    if (res?.ok) disk.value = (res.data ?? null) as DiskReport | null
    else if (res?.error) ElMessage.error(res.error)
  } catch {
    /* a failed read leaves the previous report on screen */
  } finally {
    diskLoading.value = false
  }
}

async function clearScope(scope: DiskScope): Promise<void> {
  if (!CLEARABLE_SCOPES.has(scope.id)) return
  try {
    await ElMessageBox.confirm(t('settings.diskClearConfirm', { name: t(scope.labelKey) }), t('settings.diskClear'), {
      type: 'warning',
      confirmButtonText: t('common.ok'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }
  diskBusy.value = scope.id
  try {
    const res = await window.container.clearDiskScope?.(scope.id)
    if (!res?.ok) throw new Error(res?.error || t('common.unknownError'))
    disk.value = (res.data ?? null) as DiskReport | null
    ElMessage.success(t('settings.diskCleared'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    diskBusy.value = ''
  }
}

// Load lazily but never blank: the disk report persists across open/close, so switching to the tab
// paints the previous scan at once and this re-scans in the background (the scan is bounded, not
// free, hence only firing when the tab is shown and never while one is already running).
watch(
  activeTab,
  (tab) => {
    if (tab === 'storage' && !diskLoading.value) void loadDisk()
  },
  { immediate: true }
)

/* #11: the container's own MCP server. The switch is bound to the persisted setting, and `patch`
 * only updates that store on success — so if the main process fails to bind and reverts the flag,
 * the toggle visually snaps back on its own. `loading` covers the await window (a socket bind). */
const containerMcpBusy = ref(false)
async function toggleContainerMcp(value: boolean): Promise<void> {
  containerMcpBusy.value = true
  try {
    await patch(
      { containerMcpServer: value },
      value ? t('settings.containerMcpOn') : t('settings.containerMcpOff')
    )
  } finally {
    containerMcpBusy.value = false
  }
}

/* #1 autopilot: the 行为 tab mirrors the TaskBoard control so the dispatch policy (enable, which
 * CLI agent page runs tasks, how many at once, and the prompt handed to it) is discoverable in the
 * canonical settings surface too. Enabling a change kicks a dispatch pass in the main process. */
const autopilotTerminalPages = computed(() => pagesStore.pages.filter((p) => p.kind === 'terminal'))
const autopilotPromptDraft = ref(settingsStore.settings.autopilotPrompt ?? '')
watch(
  () => settingsStore.settings.autopilotPrompt,
  (v) => {
    autopilotPromptDraft.value = v ?? ''
  }
)
</script>

<template>
  <div class="settings-panel" :class="{ 'single-pane': !!pane }">
    <el-tabs v-model="activeTab" class="settings-tabs" :tab-position="props.tabPosition || 'left'">
      <el-tab-pane name="view">
        <template #label>
          <span class="tab-label"
            ><el-icon><Monitor /></el-icon>{{ t('settings.tabView') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item>
            <template #label
              >{{ t('settings.defaultPage') }}<InfoTip :content="t('settings.defaultPageTip')"
            /></template>
            <el-select v-model="viewValue" class="set-ctl">
              <el-option
                v-for="opt in viewOptions.plain"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
                :disabled="opt.disabled"
              />
              <el-option-group v-for="g in viewOptions.groups" :key="g.label" :label="g.label">
                <el-option
                  v-for="sub in g.options"
                  :key="sub.value"
                  :value="sub.value"
                  :label="sub.label"
                />
              </el-option-group>
            </el-select>
          </el-form-item>

          <el-form-item :label="t('settings.theme')">
            <el-radio-group
              :model-value="settingsStore.settings.theme"
              @update:model-value="onThemeChange($event as 'auto' | 'light' | 'dark')"
            >
              <el-radio-button value="auto">{{ t('settings.themeAuto') }}</el-radio-button>
              <el-radio-button value="light">{{ t('settings.themeLight') }}</el-radio-button>
              <el-radio-button value="dark">{{ t('settings.themeDark') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <!-- #25 theme customization: accent override + frosted-blur strength -->
          <el-form-item>
            <template #label
              >{{ t('settings.accentColor') }}<InfoTip :content="t('settings.accentTip')"
            /></template>
            <div class="accent-row">
              <el-color-picker
                :model-value="settingsStore.settings.accentColor || ''"
                @update:model-value="patch({ accentColor: ($event as string) || '' }, '')"
              />
              <el-button
                v-if="settingsStore.settings.accentColor"
                link
                type="primary"
                @click="patch({ accentColor: '' }, t('settings.saved'))"
              >
                {{ t('settings.accentReset') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.glassFx') }}<InfoTip :content="t('settings.glassFxTip')"
            /></template>
            <div class="blur-row">
              <el-slider
                v-model="frostDraft"
                :min="0"
                :max="FROST_MAX"
                :step="1"
                class="set-slider"
                @input="previewFrost"
                @change="commitFrost"
              />
              <span class="blur-val">{{ frostDraft }}%</span>
            </div>
          </el-form-item>

          <el-form-item :label="t('settings.language')">
            <el-radio-group
              :model-value="settingsStore.settings.locale"
              @update:model-value="onLocaleChange($event as 'zh' | 'en')"
            >
              <el-radio-button value="zh">{{ t('settings.langZh') }}</el-radio-button>
              <el-radio-button value="en">{{ t('settings.langEn') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.layoutMode')
              }}<InfoTip :content="t('settings.layoutModeTip')"
            /></template>
            <el-radio-group
              :model-value="settingsStore.settings.layoutMode ?? 'im'"
              @update:model-value="patch({ layoutMode: $event as 'classic' | 'im' })"
            >
              <el-radio-button value="classic">{{ t('settings.layoutClassic') }}</el-radio-button>
              <el-radio-button value="im">{{ t('settings.layoutIm') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="behavior">
        <template #label>
          <span class="tab-label"
            ><el-icon><Operation /></el-icon>{{ t('settings.tabBehavior') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item>
            <template #label
              >{{ t('settings.minimizeToTray') }}<InfoTip :content="t('settings.minimizeTip')"
            /></template>
            <el-switch
              :model-value="settingsStore.settings.minimizeToTray"
              @update:model-value="
                patch(
                  { minimizeToTray: $event as boolean },
                  $event ? t('settings.minimizeOn') : t('settings.minimizeOff')
                )
              "
            />
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.launchAtStartup')
              }}<InfoTip :content="t('settings.launchAtStartupTip')" />
            </template>
            <el-switch
              :model-value="settingsStore.settings.launchAtStartup"
              @update:model-value="patch({ launchAtStartup: $event as boolean })"
            />
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.crashAutoRestart')
              }}<InfoTip :content="t('settings.crashAutoRestartTip')" />
            </template>
            <el-switch
              :model-value="settingsStore.settings.crashAutoRestart"
              @update:model-value="patch({ crashAutoRestart: $event as boolean })"
            />
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.rememberWindow')
              }}<InfoTip :content="t('settings.rememberWindowTip')"
            /></template>
            <el-switch
              :model-value="settingsStore.settings.rememberWindowBounds !== false"
              @update:model-value="patch({ rememberWindowBounds: $event as boolean })"
            />
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.reduceMotion') }}<InfoTip :content="t('settings.reduceMotionTip')"
            /></template>
            <el-radio-group
              :model-value="settingsStore.settings.reduceMotion || 'auto'"
              @update:model-value="patch({ reduceMotion: $event as 'auto' | 'on' | 'off' })"
            >
              <el-radio-button value="auto">{{ t('settings.themeAuto') }}</el-radio-button>
              <el-radio-button value="on">{{ t('settings.alwaysOn') }}</el-radio-button>
              <el-radio-button value="off">{{ t('settings.alwaysOff') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.marqueeBorder')
              }}<InfoTip :content="t('settings.marqueeBorderTip')"
            /></template>
            <el-switch
              :model-value="settingsStore.settings.marqueeBorder !== false"
              @update:model-value="patch({ marqueeBorder: $event as boolean })"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 提醒告警：托盘、系统通知、内存阈值、外部地址去哪打开——都是“会主动打扰到人”的出口，从行为规范里拆出来。 -->
      <el-tab-pane name="alerts">
        <template #label>
          <span class="tab-label"
            ><el-icon><Bell /></el-icon>{{ t('settings.tabAlerts') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item>
            <template #label
              >{{ t('settings.systemNotifications')
              }}<InfoTip :content="t('settings.systemNotificationsTip')" />
            </template>
            <el-switch
              :model-value="settingsStore.settings.systemNotifications"
              @update:model-value="patch({ systemNotifications: $event as boolean })"
            />
          </el-form-item>

          <!-- #11: expose the container itself as an MCP server for external agents to drive. -->
          <el-form-item>
            <template #label
              >{{ t('settings.containerMcpServer')
              }}<InfoTip :content="t('settings.containerMcpServerTip')" />
            </template>
            <el-switch
              :model-value="settingsStore.settings.containerMcpServer"
              :loading="containerMcpBusy"
              @update:model-value="toggleContainerMcp"
            />
          </el-form-item>

          <!-- #1 autopilot:入队即把任务 headless 派发到选定的 CLI 智能体页。 -->
          <el-form-item>
            <template #label
              >{{ t('settings.autopilotEnabled')
              }}<InfoTip :content="t('settings.autopilotEnabledTip')" />
            </template>
            <el-switch
              :model-value="settingsStore.settings.autopilotEnabled"
              @update:model-value="patch({ autopilotEnabled: $event as boolean })"
            />
          </el-form-item>
          <el-form-item>
            <template #label
              >{{ t('settings.autopilotExecutor')
              }}<InfoTip :content="t('settings.autopilotExecutorTip')" />
            </template>
            <el-select
              :model-value="settingsStore.settings.autopilotExecutorPage ?? ''"
              class="set-ctl"
              :placeholder="t('settings.autopilotNoExecutor')"
              @update:model-value="patch({ autopilotExecutorPage: $event as string })"
            >
              <el-option
                v-for="p in autopilotTerminalPages"
                :key="p.id"
                :label="p.name"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <template #label
              >{{ t('settings.autopilotConcurrency')
              }}<InfoTip :content="t('settings.autopilotConcurrencyTip')" />
            </template>
            <el-input-number
              :model-value="settingsStore.settings.autopilotConcurrency ?? 1"
              :min="1"
              :max="4"
              controls-position="right"
              @update:model-value="patch({ autopilotConcurrency: Number($event) || 1 })"
            />
          </el-form-item>
          <el-form-item>
            <template #label
              >{{ t('settings.autopilotPrompt')
              }}<InfoTip :content="t('settings.autopilotPromptTip')" />
            </template>
            <el-input
              v-model="autopilotPromptDraft"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              :placeholder="t('settings.autopilotPromptPlaceholder')"
              @change="patch({ autopilotPrompt: autopilotPromptDraft })"
            />
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.memWarnMb') }}<InfoTip :content="t('settings.memWarnMbTip')"
            /></template>
            <div class="blur-row">
              <el-slider
                v-model="memWarnDraft"
                :min="MEM_WARN_MIN_MB"
                :max="MEM_WARN_MAX_MB"
                :step="50"
                class="set-slider"
                @change="patch({ memWarnMb: memWarnDraft }, '')"
              />
              <span class="blur-val">{{ memWarnDraft }} MB</span>
            </div>
          </el-form-item>

          <!-- B1: what the container does once a page sits over that budget for a while. -->
          <el-form-item>
            <template #label
              >{{ t('settings.memLimitAction')
              }}<InfoTip :content="t('settings.memLimitActionTip')"
            /></template>
            <el-radio-group
              :model-value="settingsStore.settings.memLimitAction || 'notify'"
              @update:model-value="patch({ memLimitAction: $event as 'notify' | 'restart' })"
            >
              <el-radio-button value="notify">{{ t('settings.memLimitNotify') }}</el-radio-button>
              <el-radio-button value="restart">{{ t('settings.memLimitRestart') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.trayPageEntries')
              }}<InfoTip :content="t('settings.trayPageEntriesTip')"
            /></template>
            <el-radio-group
              :model-value="settingsStore.settings.trayPageEntries || 'all'"
              @update:model-value="patch({ trayPageEntries: $event as 'all' | 'running' | 'off' })"
            >
              <el-radio-button value="all">{{ t('settings.trayAll') }}</el-radio-button>
              <el-radio-button value="running">{{ t('settings.trayRunning') }}</el-radio-button>
              <el-radio-button value="off">{{ t('settings.trayOff') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.trayBadge') }}<InfoTip :content="t('settings.trayBadgeTip')"
            /></template>
            <el-radio-group
              :model-value="settingsStore.settings.trayBadge || 'all'"
              @update:model-value="patch({ trayBadge: $event as 'all' | 'alert' | 'off' })"
            >
              <el-radio-button value="all">{{ t('settings.trayAll') }}</el-radio-button>
              <el-radio-button value="alert">{{ t('settings.trayAlertOnly') }}</el-radio-button>
              <el-radio-button value="off">{{ t('settings.trayOff') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.externalOpenMode')
              }}<InfoTip :content="t('settings.externalOpenModeTip')"
            /></template>
            <el-radio-group
              :model-value="settingsStore.settings.openExternalIn"
              @update:model-value="
                patch({ openExternalIn: $event as 'embedded' | 'system-browser' })
              "
            >
              <el-radio-button value="embedded">{{ t('settings.embedded') }}</el-radio-button>
              <el-radio-button value="system-browser">{{
                t('settings.systemBrowser')
              }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- C1: 快捷键 —— every action the shell binds, recorded straight into settings.keybindings. -->
      <el-tab-pane name="keys">
        <template #label>
          <span class="tab-label"
            ><el-icon><Key /></el-icon>{{ t('settings.tabKeys') }}</span
          >
        </template>
        <div class="keys-head">
          <span class="keys-title"
            >{{ t('settings.keysTitle') }}<InfoTip :content="t('settings.keysTip')"
          /></span>
          <el-button size="small" @click="resetKeybindings">{{
            t('settings.keysReset')
          }}</el-button>
        </div>
        <div v-for="row in keyRows" :key="row.action" class="key-row">
          <span class="key-name">{{ row.name }}</span>
          <el-input
            class="key-input"
            :class="{ 'key-conflict': row.conflictWith }"
            :model-value="row.text"
            :placeholder="
              recording === row.action ? t('settings.keysRecord') : t('settings.keysNone')
            "
            readonly
            @focus="recording = row.action"
            @blur="recording = null"
            @keydown="onRecordKeydown(row.action, $event)"
          />
          <!-- A customized row gets "restore default" back; a stock row keeps "clear"
               (unbind). The old clear-on-custom rows left the action unbound with no way
               back to its default short of the whole-table reset. -->
          <el-tooltip
            v-if="row.custom"
            :content="t('settings.keysReset')"
            placement="top"
            popper-class="dsh-tip-popper"
          >
            <el-button size="small" text type="primary" @click="restoreKeybinding(row.action)">
              {{ t('settings.keysReset') }}
            </el-button>
          </el-tooltip>
          <el-button
            v-else
            size="small"
            text
            :disabled="!row.text"
            @click="saveKeybinding(row.action, '')"
          >
            {{ t('settings.keysClear') }}
          </el-button>
          <span v-if="row.conflictWith" class="tip keys-err">{{
            t('settings.keysConflict', { other: row.conflictWith })
          }}</span>
          <span v-else-if="row.custom" class="tip">{{ row.defaultText }}</span>
        </div>
      </el-tab-pane>

      <el-tab-pane name="download">
        <template #label>
          <span class="tab-label"
            ><el-icon><Download /></el-icon>{{ t('settings.tabDownload') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item>
            <template #label
              >{{ t('settings.downloadDir')
              }}<InfoTip
                :content="
                  t('settings.downloadDirTip', {
                    dir: downloadDirInfo?.downloadDir || t('settings.envRootLoaded')
                  })
                "
            /></template>
            <div class="env-root-row">
              <el-input
                v-model="downloadDirDraft"
                :placeholder="
                  downloadDirInfo
                    ? `${t('settings.downloadDirFollow')}（${downloadDirInfo.defaultDir}）`
                    : t('settings.downloadDirFollow')
                "
                class="set-ctl"
                clearable
                @change="saveDownloadDir(String($event || ''))"
              />
              <el-button size="small" @click="browseDownloadDir">{{
                t('common.browse')
              }}</el-button>
              <div v-if="downloadDirInfo" class="row-status">
                {{ t('settings.currentDownloadDir') }}：{{ downloadDirInfo.downloadDir }}
                <span class="row-status-tag">
                  {{
                    downloadDirInfo.custom
                      ? t('settings.sourcePinned')
                      : t('settings.sourceFollowSystem')
                  }}
                </span>
              </div>
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- #26: 网络镜像。一个设置决定容器带动的所有安装去哪拉包。 -->
      <el-tab-pane name="network">
        <template #label>
          <span class="tab-label"
            ><el-icon><Connection /></el-icon>{{ t('settings.tabNetwork') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item>
            <template #label
              >{{ t('settings.registryPick') }}<InfoTip :content="t('settings.registryTip')"
            /></template>
            <div class="reg-list">
              <div
                v-for="c in REGISTRY_CANDIDATES"
                :key="c.id"
                class="reg-row"
                :class="{ on: isCurrent(c.url) }"
              >
                <span class="reg-name">{{ labelOf(c.label) }}</span>
                <span class="reg-url">{{ c.url }}</span>
                <span class="reg-ms" :class="probeClass(c.id)">{{ msText(c.id) }}</span>
                <el-button
                  v-if="rowHasBest(c.url) && !isCurrent(c.url)"
                  class="reg-act"
                  size="small"
                  type="primary"
                  plain
                  @click="useRegistry(c.url)"
                >
                  {{ t('settings.registryUse') }}
                </el-button>
                <el-button
                  class="reg-act"
                  size="small"
                  :disabled="isCurrent(c.url)"
                  @click="useRegistry(c.url)"
                >
                  {{ isCurrent(c.url) ? t('settings.registryCurrent') : t('settings.registryUse') }}
                </el-button>
              </div>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.registryProbe') }}<InfoTip :content="t('settings.registryProbeTip')"
            /></template>
            <div class="act-row act-end">
              <el-button size="small" :loading="probing" @click="probeAllRegistries">
                {{ t('settings.registryProbeBtn') }}
              </el-button>
              <el-button
                v-if="bestRegistry"
                size="small"
                type="primary"
                :disabled="isCurrent(bestRegistry.url)"
                @click="useRegistry(bestRegistry.url)"
              >
                {{ t('settings.registryUseBest', { name: bestName, ms: bestRegistry.ms ?? 0 }) }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.registryCustom')
              }}<InfoTip :content="t('settings.registryCustomTip')"
            /></template>
            <div class="act-row">
              <el-input
                v-model="customRegistry"
                :placeholder="NPM_REGISTRY_DEFAULT"
                clearable
                @change="saveCustomRegistry(String($event || ''))"
              />
              <el-button
                size="small"
                type="primary"
                plain
                :disabled="customRegistry.trim() === (settingsStore.settings.npmRegistry || '')"
                @click="saveCustomRegistry(customRegistry)"
              >
                {{ t('common.save') }}
              </el-button>
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- #26: 隐私数据。所有 <webview> 共用一个 session，所以这里说清楚每次清理的范围。 -->
      <el-tab-pane name="privacy">
        <template #label>
          <span class="tab-label"
            ><el-icon><Lock /></el-icon>{{ t('settings.tabPrivacy') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item class="section-item">
            <template #label
              ><span class="section-title">{{ t('settings.secSession') }}</span>
            </template>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.webDataTitle') }}<InfoTip :content="t('settings.webDataTip')"
            /></template>
            <div class="act-row">
              <span class="wd-size">
                {{ t('settings.webDataTotal', { size: webDataTotal }) }}
              </span>
              <el-button size="small" :loading="webDataLoading" @click="loadWebData">
                {{ t('common.refresh') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.webDataCache') }}<InfoTip :content="t('settings.webDataCacheTip')"
            /></template>
            <div class="act-row">
              <span class="wd-size">{{ sizeText(webData?.cacheBytes ?? 0) }}</span>
              <el-button size="small" :loading="webDataBusy === 'cache'" @click="clearWeb('cache')">
                {{ t('settings.webDataClear') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.webDataStorage')
              }}<InfoTip :content="t('settings.webDataStorageTip')"
            /></template>
            <div class="act-row">
              <span class="wd-size">{{ sizeText(webData?.storageBytes ?? 0) }}</span>
              <el-button
                size="small"
                :loading="webDataBusy === 'storage'"
                @click="clearWeb('storage', undefined, 'settings.webDataStorageConfirm')"
              >
                {{ t('settings.webDataClear') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.webDataCookies')
              }}<InfoTip :content="t('settings.webDataCookiesTip')"
            /></template>
            <div class="act-row">
              <span class="wd-size">
                {{ t('settings.webDataCookieCount', { n: webData?.totalCookies ?? 0 }) }}
              </span>
              <el-button
                size="small"
                :loading="webDataBusy === 'cookies'"
                :disabled="!webData?.totalCookies"
                @click="clearWeb('cookies', undefined, 'settings.webDataCookieConfirm')"
              >
                {{ t('settings.webDataClearAll') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.webDataPerSite')
              }}<InfoTip :content="t('settings.webDataPerSiteTip')"
            /></template>
            <div v-if="webData?.cookieDomains.length" class="site-clear-row">
              <el-select
                v-model="siteClear"
                class="site-clear"
                size="small"
                filterable
                :loading="webDataBusy.startsWith('cookies:')"
                :placeholder="t('settings.webDataPerSitePick')"
              >
                <el-option
                  v-for="d in webData.cookieDomains"
                  :key="d.domain"
                  :label="d.domain"
                  :value="d.domain"
                >
                  <div class="opt-row">
                    <span class="opt-site">{{ d.domain }}</span>
                    <span class="opt-count">
                      {{ t('settings.webDataCookieCount', { n: d.count }) }}
                    </span>
                  </div>
                </el-option>
              </el-select>
              <el-button
                size="small"
                type="danger"
                plain
                :disabled="!siteClear"
                :loading="webDataBusy.startsWith('cookies:')"
                @click="clearSelectedSite"
              >
                {{ t('settings.webDataClear') }}
              </el-button>
            </div>
            <div v-else class="env-empty">{{ t('settings.webDataNoCookies') }}</div>
          </el-form-item>

          <el-form-item>
            <template #label
              >{{ t('settings.webDataAll') }}<InfoTip :content="t('settings.webDataAllTip')"
            /></template>
            <div class="act-row act-end">
              <el-button
                size="small"
                type="danger"
                plain
                :loading="webDataBusy === 'all'"
                @click="clearWeb('all', undefined, 'settings.webDataAllConfirm')"
              >
                {{ t('settings.webDataAllBtn') }}
              </el-button>
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- #8: 存储。容器占用磁盘的分项仪表盘；只有 webcache / logs 两行可在此清理。 -->
      <el-tab-pane name="storage">
        <template #label>
          <span class="tab-label"
            ><el-icon><Coin /></el-icon>{{ t('settings.tabStorage') }}</span
          >
        </template>
        <div class="disk-wrap">
          <div class="disk-head">
            <span class="disk-title">
              {{ t('settings.diskUsed', { size: sizeText(disk?.usedBytes ?? 0) }) }}
            </span>
            <el-button size="small" :loading="diskLoading" @click="loadDisk">
              {{ t('common.refresh') }}
            </el-button>
          </div>

          <!-- The hosting volume's overall usage; hidden when statfs can't answer. -->
          <div v-if="disk && diskVolumePct > 0" class="disk-volume">
            <div class="disk-bar">
              <div class="disk-bar-fill" :style="{ width: diskVolumePct + '%' }"></div>
            </div>
            <span class="disk-volume-text">
              {{ t('settings.diskVolume', { pct: diskVolumePct, free: sizeText(disk.freeBytes ?? 0), total: disk.totalBytes ? sizeText(disk.totalBytes) : '—' }) }}
            </span>
          </div>

          <!-- Distribution at a glance: one stacked bar = the container total split by scope, then a
               legend that doubles as the ranking. Hover a segment for exact bytes / share. -->
          <div v-if="diskSegments.length" class="disk-dist">
            <div class="disk-stack">
              <el-tooltip
                v-for="(seg, i) in diskSegments"
                :key="seg.id"
                :content="`${seg.name} · ${sizeText(seg.bytes)} · ${seg.pct.toFixed(1)}%`"
                placement="top"
              >
                <div
                  class="disk-stack-seg"
                  :style="{ width: seg.pct + '%', background: diskColorAt(i) }"
                ></div>
              </el-tooltip>
            </div>
            <div class="disk-legend">
              <span v-for="(seg, i) in diskSegments" :key="seg.id" class="disk-lg-item">
                <i class="disk-dot" :style="{ background: diskColorAt(i) }"></i>
                <span class="disk-lg-name">{{ seg.name }}</span>
                <span class="disk-lg-pct">{{ Math.round(seg.pct) }}%</span>
              </span>
            </div>
          </div>

          <p v-if="diskTruncated" class="disk-note">{{ t('settings.diskTruncated') }}</p>
          <p v-if="!disk && !diskLoading" class="disk-empty">{{ t('settings.diskEmpty') }}</p>

          <div v-for="(s, i) in sortedDiskScopes" :key="s.id" class="disk-scope">
            <div class="disk-row">
              <i class="disk-dot" :style="{ background: diskColorAt(i) }"></i>
              <span class="disk-name">{{ s.label || t(s.labelKey) }}</span>
              <div class="disk-bar disk-bar-inline">
                <div
                  class="disk-bar-fill"
                  :style="{ width: diskPct(s.bytes) + '%', background: diskColorAt(i) }"
                ></div>
              </div>
              <span class="disk-pct">{{ diskPct(s.bytes) }}%</span>
              <span class="disk-size">{{ sizeText(s.bytes) }}</span>
              <el-button
                v-if="CLEARABLE_SCOPES.has(s.id)"
                size="small"
                type="danger"
                plain
                :loading="diskBusy === s.id"
                @click="clearScope(s)"
              >
                {{ t('settings.diskClear') }}
              </el-button>
              <span v-else class="disk-spacer"></span>
            </div>
            <div v-if="s.children && s.children.length" class="disk-children">
              <div v-for="c in sortedChildren(s)" :key="c.id" class="disk-child">
                <span class="disk-child-name">{{ c.label || t(c.labelKey) }}</span>
                <div class="disk-bar disk-child-bar">
                  <div
                    class="disk-bar-fill"
                    :style="{ width: childPct(c.bytes, s.bytes) + '%', background: diskColorAt(i) }"
                  ></div>
                </div>
                <span class="disk-child-size">{{ sizeText(c.bytes) }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
/* One label column shared by every form in this panel. Element Plus only computes
   `label-width="auto"` per <el-form> instance, and this panel has four of them, so
   `auto` would give each section a different width and break the cross-section
   alignment. The column is set here instead, once, as a custom property.

   The value is the old 126px + 40px: 126px was tuned to the Chinese labels, while
   English needs ~162px for the longest one ("External address open mode"); i.e. the
   label must fit on one line, or it would wrap out of its 24px box. */
.settings-panel {
  --settings-label-w: 166px;
  /* 内容列的固定高度上限：超过不再拉高面板，改为 tab 内部出滚动条。 */
  --settings-content-max-h: 520px;
  /* 内容列的地板。各 tab 行数差很多（下载 1 行 / 隐私 6 行 + 站点列表），没有封顶的话
     切换时面板一会儿高一会儿矮，看起来就像排版在跳。取一个低于大多数 tab 自然高度的值，
     只吃掉最抖的那段，又不会给内容多的 tab 凭空留白。 */
  --settings-content-min-h: 300px;
  /* 每一行的可用内容宽：.el-form-item 是 7px 8px 内衬 + 12px 下边距，标签列固定 166px。 */
  --settings-row-w: calc(100% - 16px);
  --settings-content-w: calc(var(--settings-row-w) - var(--settings-label-w));
  /* 独立控件（输入框 / 下拉）统一的轨宽：不再逐处写死 340px，装不下就随列收窄。 */
  --settings-control-w: min(var(--settings-content-w), 340px);
  /* 带尾随控件的行（滑条 + 读数 + 重置）：给尾部留出空间。下限只防窄窗口，
     正常宽度下仍是 260px 主导。 */
  --settings-slider-w: clamp(140px, calc(var(--settings-content-w) - 80px), 260px);
}

/* Vertical (left) tab rail: a compact icon+label column instead of a top strip. The active
   item gets a soft accent background; the hairline EP would draw between the nav and the
   content is removed so the two columns read as one card.
   The old `min-height` used `stretch`, which let tall tabs (环境目录 / 隐私数据) grow the
   whole panel; `flex-start` + a max-height on the content column caps it instead. */
.settings-tabs {
  display: flex;
  align-items: flex-start;
}
/* IM popup: tabs across the top. Flip the row-flex (built for the left rail) back to a column and
   drop the content max-height cap so wide/tall panes show in full instead of inner-scrolling. */
.settings-tabs.el-tabs--top {
  flex-direction: column;
  align-items: stretch;
}
.settings-tabs.el-tabs--top :deep(.el-tabs__header) {
  margin: 0 0 12px;
  display: flex;
  justify-content: center;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
}
/* Horizontal tabs: centred pills + uniform gap. EP's top nav is already a flex row, so spacing comes
   from `gap`; the rail's vertical `margin-top` is irrelevant once items sit in a row. */
.settings-tabs.el-tabs--top :deep(.el-tabs__item) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  padding: 8px 14px;
}
.settings-tabs.el-tabs--top :deep(.el-tabs__nav) {
  gap: 10px;
  /* Outer edges must match the inter-pill gap, else the first/last tab sits flush
     (2px base padding) while the rest are 10px apart. */
  padding: 2px 10px;
}
.settings-tabs.el-tabs--top :deep(.el-tabs__content) {
  /* Base rule caps this with `!important`; match the weight so the top variant truly lifts it. */
  max-height: none !important;
}
/* Single-pane (IM sidebar): drop the rail so the one shown tab fills the column. */
.settings-panel.single-pane :deep(.settings-tabs > .el-tabs__header) {
  display: none;
}
.settings-panel.single-pane :deep(.el-tabs__content) {
  max-height: none;
  min-height: 0;
  padding: 0;
}
.settings-tabs :deep(.el-tabs__header) {
  margin: 0 16px 0 0;
}
.settings-tabs :deep(.el-tabs__nav-wrap)::after {
  display: none;
}
.settings-tabs :deep(.el-tabs__nav) {
  padding: 2px;
}
/* EP 对竖排 tab 默认是 `justify-content:flex-end; text-align:right`（选择器
   `.el-tabs--left .el-tabs__item.is-left`，特异性 0,3,0），单类 :deep 规则压不过，
   这里再叠一个本组件类名把特异性抬到 0,4,0 确保图标+文字真正贴左。 */
.settings-tabs.settings-tabs :deep(.el-tabs__item.is-left) {
  justify-content: flex-start;
  text-align: left;
}
.settings-tabs :deep(.el-tabs__item) {
  height: auto;
  /* 上下 padding 加大，让侧栏条目更透气 */
  padding: 12px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--text-dim);
}
.settings-tabs:not(.el-tabs--top) :deep(.el-tabs__item + .el-tabs__item) {
  /* 仅竖排 rail：横排时它会错开首行 item */
  margin-top: 8px;
}
.settings-tabs :deep(.el-tabs__item:hover) {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  -webkit-backdrop-filter: blur(6px) saturate(125%);
  backdrop-filter: blur(6px) saturate(125%);
}
.settings-tabs :deep(.el-tabs__item.is-active) {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-weight: 600;
}
.settings-tabs :deep(.el-tabs__active-bar) {
  display: none;
}
.settings-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-width: 0;
  /* EP 会给这个盒子写行内 overflow/height（竖排时行内 height 为 auto），这里用 max-height
     给内容列封顶；`!important` 防御 animateHeight 未来写入行内高度把它覆盖。 */
  max-height: var(--settings-content-max-h) !important;
  min-height: var(--settings-content-min-h);
  overflow-y: auto !important;
  /* The column used to sit flush with the rail and the panel's own padding, so the row hover
     wash ran straight into both. A little air on all four sides keeps it off the edges. */
  padding: 6px 8px 8px 6px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.tab-label .el-icon {
  font-size: 15px;
}

/* ---- one control column, one rhythm ----
   Every standalone field used to carry its own inline pixel width (340px for selects and path
   inputs, 260px for sliders) while the list rows said 620px — a number wider than the column,
   so `.el-form-item__content` (flex-wrap: wrap) dropped their buttons onto a second line. That
   is the ragged right edge. Rows now derive their width from the column instead of fighting it. */
.set-ctl {
  width: var(--settings-control-w);
}
.set-slider {
  width: var(--settings-slider-w);
}
/* One control height across the panel: `size="small"` drew 24px boxes with 12px text, which is
   why the whole thing reads cramped. 28px is still compact but stops the 3-4 button rows from
   touching each other. EP stacks the size classes, so `.el-input--small` / `.el-select--small`
   need their own legs to lose to this one. */
.settings-panel :deep(.el-button),
.settings-panel :deep(.el-input--small .el-input__wrapper),
.settings-panel :deep(.el-select--small .el-select__wrapper) {
  min-height: 28px;
}
.settings-panel :deep(.el-radio-button--small .el-radio-button__inner) {
  height: 28px;
  padding: 0 12px;
  line-height: 27px;
}
/* Where a value actually resolves to, printed in the row that sets it: it fills the wide-but-empty
   single-row tabs (下载 / 环境目录) with the one fact the ⓘ tooltip hides. */
.row-status {
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
  word-break: break-all;
}
.row-status-tag {
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 11px;
}

.settings-panel :deep(.el-form-item__label) {
  width: var(--settings-label-w);
  /* `size="small"` pins the label box to 24px with `line-height:24px`; a longer label
     wraps and drops its second line *outside* that box, on top of the next row's label.
     Letting the box grow keeps such a label readable instead. `align-self` overrides
     Element Plus's default `stretch`, which would stretch the auto-height box to the
     whole row (and centre the text) whenever a multi-line tip makes the row tall. */
  align-self: flex-start;
  height: auto;
  min-height: 24px;
  align-items: center;
  /* A container.json label is user-authored and can be arbitrarily long, so it may still
     have to wrap inside the fixed column; wrapping (and growing the box, above) keeps it
     fully readable instead of letting it run under the input. */
  white-space: normal;
  word-break: break-word;
}

.settings-panel h3 {
  margin: 18px 0 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-dim);
  letter-spacing: 0.6px;
  text-transform: uppercase;
}

.settings-panel h3:first-child {
  margin-top: 0;
}
/* Section headers live in the label column of a `.section-item` row, so they align with every
   other setting name instead of floating above the list. */
.settings-panel .section-title {
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.6px;
  color: var(--text-dim);
}

.ext-inline {
  width: 100%;
  max-width: 460px;
}

.tip {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  width: 100%;
}

/* #25 theme customization rows: align the control and its inline value/reset. */
.accent-row,
.blur-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.blur-val {
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  font-size: 12px;
  min-width: 42px;
}

.tip code {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

.env-root-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: var(--settings-row-w);
}
/* Rows carry their own inner padding so the hover wash and its inset ring never hug the label
   or the control. The radius lives here (not just on :hover) because a bordered box only reads as
   one box when the corner is already rounded before it lights up — so the hairline stays visible
   at rest and only the tint/ring swap on hover, which is what makes the list read as stacked
   bands instead of one undifferentiated block of controls. */
.settings-panel :deep(.el-form-item) {
  padding: 7px 8px;
  margin-bottom: 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
/* Every settings form row (incl. the 系统 page bottom / env-section lists) reads on
   hover with a glassy accent wash instead of an opaque block. */
.settings-panel :deep(.el-form-item):hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: var(--border);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent) inset;
}
/* A section heading is not a row: it owns no control, so it must neither light up on hover nor
   sit a full gap above the rows it labels. Two adjacent `margin-bottom`s collapse, so taking this
   one's away pulls the whole section together while the gap above stays. */
.settings-panel :deep(.el-form-item.section-item) {
  margin-bottom: 0;
}
.settings-panel :deep(.el-form-item.section-item):hover {
  background: none;
  border-color: transparent;
  box-shadow: none;
}
.env-empty {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
}
.env-empty code {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

/* #26 网络镜像 / 隐私数据: one compact row list per tab, sharing the same hairline look as
   the frosted surfaces. `.on` marks the row the current setting points at. The old 620px cap was
   wider than the column, so every row wrapped its button onto a second line; the list now simply
   fills the column and the URL truncates instead of pushing the action out of view. */
.reg-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: var(--settings-row-w);
}
.reg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12.5px;
}
.reg-row.on {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.reg-name {
  min-width: 128px;
  font-weight: 650;
  color: var(--text);
}
.reg-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
}
.reg-ms {
  min-width: 64px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}
.reg-ms.ok {
  color: var(--ok);
}
.reg-ms.bad {
  color: var(--err);
}
/* Keep the action button at the row's right edge no matter how long the mirror URL got. */
.reg-act {
  flex: none;
}

/* Right-rail action rows (#26): the value keeps the left edge and every button lands on the same
   right edge of one column, so both tabs read as a table instead of a stack of controls of
   differing width. `.act-end` is for rows with nothing to say on the left (a bare wipe button). */
.act-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: var(--settings-row-w);
}
.act-row .el-input {
  flex: 1;
  min-width: 0;
}
.act-row.act-end {
  justify-content: flex-end;
}
.wd-size {
  flex: 1;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
/* Per-site cookie clear: one dropdown, so a long list of signed-in sites no longer stacks N
   rows. The option row splits the domain (left, ellipsized) and its cookie count (right, dim). */
.site-clear-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: var(--settings-row-w, 320px);
  max-width: 100%;
}
.site-clear {
  flex: 1;
  min-width: 0;
}
.opt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.opt-site {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.opt-count {
  flex-shrink: 0;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

/* ---- C1 shortcut recorder ----
   One four-track grid (name / binding / clear / status) so every row lines up with the panel's
   shared label column instead of drifting with the length of the action name. */
.settings-panel .keys-head {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 2px;
}
.settings-panel .keys-title {
  font-weight: 600;
  color: var(--text);
}
.settings-panel .key-row {
  /* Fixed tracks for name / binding / clear; the status column (conflict text or the shipped
     default) gets whatever is left, so the 清除 button lands on the same edge on every row
     instead of drifting with the length of the status text. */
  display: grid;
  grid-template-columns: var(--settings-label-w) 180px 56px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 4px 8px;
  margin: 0 0 12px;
  border-radius: 8px;
}
.settings-panel .key-row:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.settings-panel .key-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text);
}
.settings-panel .key-input {
  width: 180px;
  cursor: pointer;
}
.settings-panel .key-input :deep(.el-input__inner) {
  font-family: var(--mono, ui-monospace, monospace);
  text-align: center;
}
.settings-panel .key-conflict :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--err) inset;
}
.settings-panel .keys-err {
  margin-top: 0;
  color: var(--err);
}

/* ---- #8 存储 dashboard ----
   Shares the frosted hairline language of the 隐私数据 / 网络镜像 lists: one column, a proportion
   bar per row, the byte count right-aligned. The volume bar at top is the disk-wide view; each
   scope's inline bar is that scope's share of the scanned total (so they never sum to 100%). */
.disk-wrap {
  width: var(--settings-row-w);
  max-width: 640px;
}
.disk-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.disk-title {
  font-weight: 650;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.disk-volume {
  margin-bottom: 12px;
}
.disk-volume-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.disk-bar {
  height: 8px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 12%, var(--glass-chip));
  overflow: hidden;
}
.disk-bar-fill {
  height: 100%;
  border-radius: 5px;
  background: var(--accent);
  transition: width 0.2s ease;
}
.disk-note,
.disk-empty {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}
.disk-scope {
  margin-bottom: 12px;
}
.disk-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.disk-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent);
}
.disk-name {
  min-width: 84px;
  font-size: 12.5px;
  color: var(--text);
}
.disk-bar-inline {
  flex: 1;
  min-width: 0;
}
.disk-pct {
  flex: none;
  min-width: 34px;
  text-align: right;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.disk-size {
  min-width: 72px;
  text-align: right;
  font-size: 12.5px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.disk-spacer {
  /* keep clearable and non-clearable rows' byte columns aligned */
  width: 56px;
  flex: none;
}
.disk-children {
  margin: 5px 0 0 18px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
.disk-child {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text-dim);
}
.disk-child-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.disk-child-bar {
  flex: none;
  width: 120px;
  height: 5px;
}
.disk-child-size {
  flex: none;
  min-width: 72px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* ---- stacked distribution overview: the whole bar is the container total, each segment a scope.
   The legend underneath doubles as the ranking (biggest first) so the split reads without maths. */
.disk-dist {
  margin-bottom: 14px;
}
.disk-stack {
  display: flex;
  width: 100%;
  height: 16px;
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--accent) 10%, var(--glass-chip));
}
.disk-stack-seg {
  height: 100%;
  min-width: 2px;
  transition: width 0.2s ease;
}
.disk-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 8px;
}
.disk-lg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.disk-lg-item .disk-dot {
  width: 9px;
  height: 9px;
}
.disk-lg-name {
  color: var(--text);
}
.disk-lg-pct {
  font-variant-numeric: tabular-nums;
}
</style>

<style>
/* Rendered in a teleported popper, so it can't live in the scoped block above. */
.settings-tip-popper {
  max-width: 340px;
  line-height: 1.6;
}
</style>
