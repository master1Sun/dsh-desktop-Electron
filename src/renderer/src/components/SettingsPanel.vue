<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Monitor,
  Operation,
  Download,
  FolderOpened,
  Connection,
  Lock,
  Bell
} from '@element-plus/icons-vue'
import { usePagesStore } from '../stores/pages'
import { useSettingsStore } from '../stores/settings'
import type { DefaultView } from '../stores/settings'
import type {
  EnvRootInfo,
  DownloadDirInfo,
  RegistryProbe,
  WebDataReport
} from '../../../shared/types'
import {
  GLASS_BLUR_MAX_PX,
  NPM_REGISTRY_DEFAULT,
  REGISTRY_CANDIDATES
} from '../../../shared/types'
import { t } from '../i18n'

const emit = defineEmits<{
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  'preview-site': [url: string]
}>()

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()

/** Which settings tab is open — one of view / behavior / alerts / download / network / env / privacy. */
const activeTab = ref('view')

/* ---- dynamic per-page directory env config ----
   Pages declare configurable "home" dirs in container.json `envVars`; render one input each. */
interface EnvRow {
  key: string
  label: string
  defaultPath?: string
  description?: string
}
interface EnvSection {
  pageId: string
  pageName: string
  vars: EnvRow[]
}

const envSections = computed<EnvSection[]>(() =>
  pagesStore.pages
    // Only pages the generic AppManager really renders must be skipped here (one entry
    // point per setting). dsh/openclaw default to manageAsApp but live in their own
    // panels WITHOUT env inputs — exclude them and their 环境目录 disappears entirely.
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
        defaultPath: v.defaultPath,
        description: v.description
      }))
    }))
)

const envDrafts = reactive<Record<string, string>>({})
const draftKey = (pageId: string, key: string): string => `${pageId}::${key}`

// Keep drafts synced to persisted values (panel mounts after settings load). The
// getter must not touch envDrafts: tracking them would reset the input on every
// keystroke (draft ≠ stored → watcher writes stored back mid-typing).
watch(
  () => [settingsStore.settings.pageEnvs, envSections.value] as const,
  () => {
    const stored = settingsStore.settings.pageEnvs || {}
    for (const section of envSections.value) {
      for (const row of section.vars) {
        const k = draftKey(section.pageId, row.key)
        const val = stored[section.pageId]?.[row.key] || ''
        if (envDrafts[k] !== val) envDrafts[k] = val
      }
    }
  },
  { immediate: true }
)

/* ---- 环境目录 root ----
   Every runtime's home dir defaults into <envRoot>/<runtime>; the root itself follows
   the install dir unless the user pins one here. */
const envRootInfo = ref<EnvRootInfo | null>(null)
const envRootDraft = ref('')

async function loadEnvRoot(): Promise<void> {
  // Optional-call: the whole `?.().catch` chain short-circuits to undefined when the bridge
  // method is absent (tests / older shells), so a missing IPC never becomes an unhandled rejection.
  const res = await window.container.getEnvRoot?.().catch(() => null)
  if (!res?.ok) return
  envRootInfo.value = res.data as EnvRootInfo
  envRootDraft.value = (envRootInfo.value?.custom ? envRootInfo.value.envRoot : '') || ''
}

/** Show `{envRoot}` placeholders resolved so the user sees where data actually lands. */
function displayPath(p: string): string {
  if (!p) return ''
  return p.replace(
    /\{envRoot\}/g,
    envRootInfo.value?.envRoot || envRootInfo.value?.installDir || t('settings.envDir')
  )
}

async function saveEnvRoot(value: string): Promise<void> {
  await patch({ envRoot: value.trim() }, t('settings.envSavedRestart'))
  await loadEnvRoot()
}

async function browseEnvRoot(): Promise<void> {
  const res = await window.container.chooseDirectory?.(t('settings.chooseEnvDir')).catch(() => null)
  if (!res?.ok || !res.data) return
  envRootDraft.value = String(res.data)
  await saveEnvRoot(envRootDraft.value)
}

onMounted(loadEnvRoot)

/* ---- 下载目录 ----
   Embedded-page / external-site downloads save straight here (no "Save As" prompt); empty
   follows the OS Downloads folder. Mirrors the env-root browse/save row above. */
const downloadDirInfo = ref<DownloadDirInfo | null>(null)
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

async function savePageEnv(pageId: string, key: string, value: string): Promise<void> {
  const next: Record<string, Record<string, string>> = JSON.parse(
    JSON.stringify(settingsStore.settings.pageEnvs || {})
  )
  next[pageId] = { ...(next[pageId] || {}), [key]: value.trim() }
  await patch({ pageEnvs: next }, t('settings.pageEnvSaved'))
}

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
  const plain: Option[] = [
    { value: 'none', label: t('settings.nonePage') },
    // Not gated on `status === 'running'` anymore: the container now auto-starts the
    // configured default page on launch, so any page can be picked.
    ...pagesStore.pages.map<Option>((p) => ({
      value: `page:${p.id}`,
      label: `${p.name}${p.external ? t('settings.tagExternal') : p.kind === 'dsh' ? t('settings.tagDsh') : p.kind === 'terminal' ? t('settings.tagTerminal') : p.containerPort || p.port ? ` :${p.containerPort || p.port}` : ''}`
    }))
  ]
  // Saved external addresses are default-view candidates too — one row per site, keyed by
  // its URL (the persisted DefaultView only carries the url, not the site id).
  const sites = settingsStore.settings.externalSites
  const extOptions: Option[] = sites.map((s) => ({ value: `ext:${s.url}`, label: s.name }))
  // A saved default whose site was since deleted still needs a matching option, or the
  // select would show a blank current value — keep the raw url as a fallback row.
  const dv = settingsStore.settings.defaultView
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
function blurFromFrost(f: number): number {
  return Math.round((f / 100) * FROST_BLUR_MAX_PX)
}
function alphaFromFrost(f: number): number {
  return Math.round(FROST_ALPHA_TOP - (f / 100) * (FROST_ALPHA_TOP - FROST_ALPHA_BOTTOM))
}
/** Derive the displayed frost level from the persisted blur (opacity is redundant now). */
function frostFromSettings(): number {
  const blur = settingsStore.settings.glassBlur ?? 30
  return Math.min(100, Math.max(0, Math.round((blur / FROST_BLUR_MAX_PX) * 100)))
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

/* ---- #26: 内存告警阈值 / 终端面板高度 ----------------------------------------------
   Both were stored-and-used-but-never-editable: memWarnMb drives the gold tray badge and the
   over-budget row colour, terminalHeight is what the drawer restores after a drag. Sliders here
   write the same keys, so nothing downstream changes. */
const MEM_WARN_MIN_MB = 100
const MEM_WARN_MAX_MB = 8000
const TERMINAL_MIN_H = 160
const TERMINAL_MAX_H = 2000
/** Mirrors TerminalDrawer's DEFAULT_H; kept literal so resetting doesn't need an import cycle. */
const TERMINAL_DEFAULT_H = 320
const memWarnDraft = ref(settingsStore.settings.memWarnMb ?? 800)
const termHeightDraft = ref(settingsStore.settings.terminalHeight ?? TERMINAL_DEFAULT_H)
watch(
  () => [settingsStore.settings.memWarnMb, settingsStore.settings.terminalHeight] as const,
  ([mem, th]) => {
    const nextMem = mem ?? 800
    if (nextMem !== memWarnDraft.value) memWarnDraft.value = nextMem
    const nextTh = th ?? TERMINAL_DEFAULT_H
    if (nextTh !== termHeightDraft.value) termHeightDraft.value = nextTh
  }
)
async function resetTerminalHeight(): Promise<void> {
  termHeightDraft.value = TERMINAL_DEFAULT_H
  await patch({ terminalHeight: TERMINAL_DEFAULT_H }, t('settings.saved'))
}

/* ---- #26: 网络镜像 ---------------------------------------------------------------
   One setting (npmRegistry) decides where every install the container drives goes. The panel can
   measure all candidate mirrors at once and jump to the fastest reachable one. An empty setting is
   *not* "no registry" — it means the built-in default, so the picker writes '' for that row. */
const registryProbes = ref<Record<string, RegistryProbe>>({})
const probing = ref(false)
const currentRegistry = computed(() => settingsStore.settings.npmRegistry?.trim() || NPM_REGISTRY_DEFAULT)
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
  return labelOf(REGISTRY_CANDIDATES.find((c) => c.id === best.id)?.label ?? { zh: best.url, en: best.url })
})
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
const webData = ref<WebDataReport | null>(null)
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
async function clearWeb(scope: 'cache' | 'cookies' | 'storage' | 'all', domain?: string, confirmKey = ''): Promise<void> {
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
</script>

<template>
  <div class="settings-panel">
    <el-tabs v-model="activeTab" class="settings-tabs" tab-position="left">
      <el-tab-pane name="view">
        <template #label>
          <span class="tab-label"
            ><el-icon><Monitor /></el-icon>{{ t('settings.tabView') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item :label="t('settings.defaultPage')">
            <el-select v-model="viewValue" style="width: 340px">
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
            <div class="tip">{{ t('settings.defaultPageTip') }}</div>
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
          <el-form-item :label="t('settings.accentColor')">
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
            <div class="tip">{{ t('settings.accentTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.glassFx')">
            <div class="blur-row">
              <el-slider
                v-model="frostDraft"
                :min="0"
                :max="100"
                :step="1"
                style="width: 260px"
                @input="previewFrost"
                @change="commitFrost"
              />
              <span class="blur-val">{{ frostDraft }}%</span>
            </div>
            <div class="tip">{{ t('settings.glassFxTip') }}</div>
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
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="behavior">
        <template #label>
          <span class="tab-label"
            ><el-icon><Operation /></el-icon>{{ t('settings.tabBehavior') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item :label="t('settings.minimizeToTray')">
            <el-switch
              :model-value="settingsStore.settings.minimizeToTray"
              @update:model-value="
                patch(
                  { minimizeToTray: $event as boolean },
                  $event ? t('settings.minimizeOn') : t('settings.minimizeOff')
                )
              "
            />
            <div class="tip">{{ t('settings.minimizeTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.launchAtStartup')">
            <el-switch
              :model-value="settingsStore.settings.launchAtStartup"
              @update:model-value="patch({ launchAtStartup: $event as boolean })"
            />
            <div class="tip">{{ t('settings.launchAtStartupTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.crashAutoRestart')">
            <el-switch
              :model-value="settingsStore.settings.crashAutoRestart"
              @update:model-value="patch({ crashAutoRestart: $event as boolean })"
            />
            <div class="tip">{{ t('settings.crashAutoRestartTip') }}</div>
          </el-form-item>

          <!-- #26: terminal height (stored-only until now) plus the window/motion memory. -->
          <el-form-item :label="t('settings.terminalHeight')">
            <div class="blur-row">
              <el-slider
                v-model="termHeightDraft"
                :min="TERMINAL_MIN_H"
                :max="TERMINAL_MAX_H"
                :step="20"
                style="width: 260px"
                @change="patch({ terminalHeight: termHeightDraft }, '')"
              />
              <span class="blur-val">{{ termHeightDraft }} px</span>
              <el-button
                v-if="termHeightDraft !== TERMINAL_DEFAULT_H"
                link
                type="primary"
                @click="resetTerminalHeight"
              >
                {{ t('settings.accentReset') }}
              </el-button>
            </div>
            <div class="tip">{{ t('settings.terminalHeightTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.rememberWindow')">
            <el-switch
              :model-value="settingsStore.settings.rememberWindowBounds !== false"
              @update:model-value="patch({ rememberWindowBounds: $event as boolean })"
            />
            <div class="tip">{{ t('settings.rememberWindowTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.reduceMotion')">
            <el-radio-group
              :model-value="settingsStore.settings.reduceMotion || 'auto'"
              @update:model-value="patch({ reduceMotion: $event as 'auto' | 'on' | 'off' })"
            >
              <el-radio-button value="auto">{{ t('settings.themeAuto') }}</el-radio-button>
              <el-radio-button value="on">{{ t('settings.alwaysOn') }}</el-radio-button>
              <el-radio-button value="off">{{ t('settings.alwaysOff') }}</el-radio-button>
            </el-radio-group>
            <div class="tip">{{ t('settings.reduceMotionTip') }}</div>
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
          <el-form-item :label="t('settings.systemNotifications')">
            <el-switch
              :model-value="settingsStore.settings.systemNotifications"
              @update:model-value="patch({ systemNotifications: $event as boolean })"
            />
            <div class="tip">{{ t('settings.systemNotificationsTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.memWarnMb')">
            <div class="blur-row">
              <el-slider
                v-model="memWarnDraft"
                :min="MEM_WARN_MIN_MB"
                :max="MEM_WARN_MAX_MB"
                :step="50"
                style="width: 260px"
                @change="patch({ memWarnMb: memWarnDraft }, '')"
              />
              <span class="blur-val">{{ memWarnDraft }} MB</span>
            </div>
            <div class="tip">{{ t('settings.memWarnMbTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.trayPageEntries')">
            <el-radio-group
              :model-value="settingsStore.settings.trayPageEntries || 'all'"
              @update:model-value="
                patch({ trayPageEntries: $event as 'all' | 'running' | 'off' })
              "
            >
              <el-radio-button value="all">{{ t('settings.trayAll') }}</el-radio-button>
              <el-radio-button value="running">{{ t('settings.trayRunning') }}</el-radio-button>
              <el-radio-button value="off">{{ t('settings.trayOff') }}</el-radio-button>
            </el-radio-group>
            <div class="tip">{{ t('settings.trayPageEntriesTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.trayBadge')">
            <el-radio-group
              :model-value="settingsStore.settings.trayBadge || 'all'"
              @update:model-value="patch({ trayBadge: $event as 'all' | 'alert' | 'off' })"
            >
              <el-radio-button value="all">{{ t('settings.trayAll') }}</el-radio-button>
              <el-radio-button value="alert">{{ t('settings.trayAlertOnly') }}</el-radio-button>
              <el-radio-button value="off">{{ t('settings.trayOff') }}</el-radio-button>
            </el-radio-group>
            <div class="tip">{{ t('settings.trayBadgeTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.externalOpenMode')">
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
            <div class="tip">{{ t('settings.externalOpenModeTip') }}</div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="download">
        <template #label>
          <span class="tab-label"
            ><el-icon><Download /></el-icon>{{ t('settings.tabDownload') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item :label="t('settings.downloadDir')">
            <div class="env-root-row">
              <el-input
                v-model="downloadDirDraft"
                :placeholder="
                  downloadDirInfo
                    ? `${t('settings.downloadDirFollow')}（${downloadDirInfo.defaultDir}）`
                    : t('settings.downloadDirFollow')
                "
                style="width: 340px"
                clearable
                @change="saveDownloadDir(String($event || ''))"
              />
              <el-button size="small" @click="browseDownloadDir">{{
                t('common.browse')
              }}</el-button>
            </div>
            <div class="tip">
              {{
                t('settings.downloadDirTip', {
                  dir: downloadDirInfo?.downloadDir || t('settings.envRootLoaded')
                })
              }}
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
          <el-form-item :label="t('settings.registryPick')">
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
                  class="reg-act"
                  size="small"
                  :disabled="isCurrent(c.url)"
                  @click="useRegistry(c.url)"
                >
                  {{ isCurrent(c.url) ? t('settings.registryCurrent') : t('settings.registryUse') }}
                </el-button>
              </div>
            </div>
            <div class="tip">{{ t('settings.registryTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.registryProbe')">
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
            <div class="tip">{{ t('settings.registryProbeTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.registryCustom')">
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
            <div class="tip">{{ t('settings.registryCustomTip') }}</div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane name="env">
        <template #label>
          <span class="tab-label"
            ><el-icon><FolderOpened /></el-icon>{{ t('settings.tabEnv') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item :label="t('settings.envRoot')">
            <div class="env-root-row">
              <el-input
                v-model="envRootDraft"
                :placeholder="
                  envRootInfo
                    ? `${t('settings.envRootFollow')}（${envRootInfo.installDir}/env）`
                    : t('settings.envRootFollow')
                "
                style="width: 340px"
                clearable
                @change="saveEnvRoot(String($event || ''))"
              />
              <el-button size="small" @click="browseEnvRoot">{{ t('common.browse') }}</el-button>
            </div>
            <div class="tip">
              {{
                t('settings.envRootTip', {
                  root: envRootInfo?.envRoot || t('settings.envRootLoaded'),
                  envRoot: '{envRoot}'
                })
              }}
            </div>
          </el-form-item>
        </el-form>

        <template v-if="envSections.length">
          <div v-for="section in envSections" :key="section.pageId" class="env-section">
            <div class="env-page-name neon">{{ section.pageName }}</div>
            <el-form label-position="left" size="small">
              <el-form-item v-for="row in section.vars" :key="row.key" :label="row.label">
                <el-input
                  :model-value="envDrafts[draftKey(section.pageId, row.key)] || ''"
                  :placeholder="
                    row.defaultPath
                      ? t('settings.envInputPlaceholderDefault', {
                          path: displayPath(row.defaultPath)
                        })
                      : t('settings.envInputPlaceholderEmpty')
                  "
                  style="width: 340px"
                  clearable
                  @update:model-value="
                    envDrafts[draftKey(section.pageId, row.key)] = String($event)
                  "
                  @change="savePageEnv(section.pageId, row.key, String($event))"
                />
                <div class="tip">
                  <template v-if="row.description">{{ row.description }}</template>
                  <template v-else>
                    {{ t('settings.envInjectPrefix') }} <code>{{ row.key }}</code>
                    {{
                      t('settings.envInjectSuffix', {
                        def: row.defaultPath
                          ? t('settings.envInjectDefault', { path: row.defaultPath })
                          : ''
                      })
                    }}
                  </template>
                </div>
              </el-form-item>
            </el-form>
          </div>
        </template>
        <div v-else class="env-empty">{{ t('settings.envSectionEmpty') }}</div>
      </el-tab-pane>

      <!-- #26: 隐私数据。所有 <webview> 共用一个 session，所以这里说清楚每次清理的范围。 -->
      <el-tab-pane name="privacy">
        <template #label>
          <span class="tab-label"
            ><el-icon><Lock /></el-icon>{{ t('settings.tabPrivacy') }}</span
          >
        </template>
        <el-form label-position="left" size="small">
          <el-form-item :label="t('settings.webDataTitle')">
            <div class="act-row">
              <span class="wd-size">
                {{ t('settings.webDataTotal', { size: webDataTotal }) }}
              </span>
              <el-button size="small" :loading="webDataLoading" @click="loadWebData">
                {{ t('common.refresh') }}
              </el-button>
            </div>
            <div class="tip">{{ t('settings.webDataTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.webDataCache')">
            <div class="act-row">
              <span class="wd-size">{{ sizeText(webData?.cacheBytes ?? 0) }}</span>
              <el-button size="small" :loading="webDataBusy === 'cache'" @click="clearWeb('cache')">
                {{ t('settings.webDataClear') }}
              </el-button>
            </div>
            <div class="tip">{{ t('settings.webDataCacheTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.webDataStorage')">
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
            <div class="tip">{{ t('settings.webDataStorageTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.webDataCookies')">
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
            <div class="tip">{{ t('settings.webDataCookiesTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.webDataPerSite')">
            <div v-if="webData?.cookieDomains.length" class="reg-list scroll">
              <div v-for="d in webData.cookieDomains" :key="d.domain" class="reg-row">
                <span class="wd-site">{{ d.domain }}</span>
                <span class="reg-ms">{{ t('settings.webDataCookieCount', { n: d.count }) }}</span>
                <el-button
                  class="reg-act"
                  size="small"
                  :loading="webDataBusy === `cookies:${d.domain}`"
                  @click="clearWeb('cookies', d.domain)"
                >
                  {{ t('settings.webDataClear') }}
                </el-button>
              </div>
            </div>
            <div v-else class="env-empty">{{ t('settings.webDataNoCookies') }}</div>
            <div class="tip">{{ t('settings.webDataPerSiteTip') }}</div>
          </el-form-item>

          <el-form-item :label="t('settings.webDataAll')">
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
            <div class="tip">{{ t('settings.webDataAllTip') }}</div>
          </el-form-item>
        </el-form>
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
}

/* Vertical (left) tab rail: a compact icon+label column instead of a top strip. The active
   item gets a soft accent background; the hairline EP would draw between the nav and the
   content is removed so the two columns read as one card. */
.settings-tabs {
  display: flex;
  align-items: stretch;
  min-height: 240px;
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
.settings-tabs :deep(.el-tabs__item + .el-tabs__item) {
  /* 条目之间的额外间距 */
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
  overflow: hidden;
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
  margin: 16px 0 10px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-dim);
  letter-spacing: 0.3px;
}

.settings-panel h3:first-child {
  margin-top: 0;
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
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

.env-section {
  margin-bottom: 6px;
}
.env-root-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.env-page-name {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text);
  margin: 4px 0 8px;
}
/* Rows carry their own inner padding so the hover wash and its inset ring never hug the label
   or the control; `margin-bottom` shrinks by the same amount the padding grows, so the list
   doesn't get taller overall. The radius lives here (not just on :hover) because a bordered
   box only reads as one box when the corner is already rounded before it lights up. */
.settings-panel :deep(.el-form-item) {
  padding: 3px 8px;
  margin-bottom: 7px;
  border-radius: 8px;
}
/* Every settings form row (incl. the 系统 page bottom / env-section lists) reads on
   hover with a glassy accent wash instead of an opaque block. */
.settings-panel :deep(.el-form-item):hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent) inset;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.env-empty {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
}
.env-empty code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

/* #26 网络镜像 / 隐私数据: one compact row list per tab, sharing the same hairline look as
   the frosted surfaces. `.on` marks the row the current setting points at. */
.reg-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 620px;
}
.reg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
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
  color: var(--text-dim);
  word-break: break-all;
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
   right edge of one 620px column, so both tabs read as a table instead of a stack of controls of
   differing width. `.act-end` is for rows with nothing to say on the left (a bare wipe button). */
.act-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 620px;
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
/* A cookie-domain name is arbitrary text: clip it rather than let it push the button off-column. */
.wd-site {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
/* Signed-in sites can pile up; the list scrolls instead of stretching the panel forever. */
.reg-list.scroll {
  max-height: 240px;
  overflow-y: auto;
}
</style>
