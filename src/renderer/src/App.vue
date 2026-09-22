<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MenuBar, { type PanelKind } from './components/MenuBar.vue'
import { appPanelKey, GLASS_BLUR_MAX_PX } from '@shared/types'
import MenuPanelContent from './components/MenuPanelContent.vue'
import CommandPalette, { type Command } from './components/CommandPalette.vue'
import TerminalDrawer from './components/TerminalDrawer.vue'
import CliTerminalView from './components/CliTerminalView.vue'
import SetupGate from './components/SetupGate.vue'
import HomeView from './views/HomeView.vue'
import { usePagesStore, type PageState } from './stores/pages'
import { useSettingsStore, applyReduceMotion } from './stores/settings'
import { useTerminalStore } from './stores/terminal'
import { useUpdatesStore } from './stores/updates'
import { useRuntimesStore } from './stores/runtimes'
import { ElConfigProvider } from 'element-plus'
import { locale as i18nLocale, t, epLocale } from './i18n'

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const store = useTerminalStore()
const hasBridge = typeof window !== 'undefined' && !!window.container
const updatesStore = useUpdatesStore()
const runtimes = useRuntimesStore()

/** Panels float over the workbench instead of replacing it, so an embedded page never unmounts. */
const activePanel = ref<string | null>(null)

/* ---- Ctrl+K command palette ---- */
const paletteOpen = ref(false)

/** Stop a running page from the palette; failures surface as a toast. */
function stopPage(id: string): void {
  pagesStore.stop(id).catch((err) => ElMessage.error((err as Error).message))
}

const PANEL_COMMANDS: { kind: PanelKind; label: string }[] = [
  { kind: 'pages', label: t('palette.panelPages') },
  { kind: 'external', label: t('palette.panelExternal') },
  { kind: 'dsh', label: t('palette.panelDsh') },
  { kind: 'openclaw', label: t('palette.panelOpenclaw') },
  { kind: 'settings', label: t('palette.panelSettings') },
  { kind: 'help', label: t('palette.panelHelp') }
]

/**
 * Assembled reactively so page status/ports shown in the palette are always current.
 * Each command delegates to the same handlers the menu bar uses — no duplicated logic.
 */
const commands = computed<Command[]>(() => {
  const list: Command[] = []
  for (const p of pagesStore.pages) {
    if (p.external) {
      list.push({
        id: `open-ext-${p.id}`,
        title: t('palette.cmdExternalSite', { name: p.name }),
        group: t('palette.groupPages'),
        keywords: p.externalUrl,
        run: () => openPage(p.id)
      })
      continue
    }
    if (p.kind === 'terminal') {
      list.push({
        id: `term-${p.id}`,
        title: t('palette.cmdTerminalPage', { name: p.name }),
        group: t('palette.groupPages'),
        run: () => openPage(p.id)
      })
      continue
    }
    if (p.status === 'running') {
      list.push({
        id: `open-${p.id}`,
        title: t('palette.cmdOpenPage', { name: p.name }),
        hint: t('palette.hintPort', { port: p.containerPort || p.port }),
        group: t('palette.groupPages'),
        keywords: `${p.name} ${p.port}`,
        run: () => openPage(p.id)
      })
      list.push({
        id: `stop-${p.id}`,
        title: t('palette.cmdStopPage', { name: p.name }),
        group: t('palette.groupPages'),
        run: () => stopPage(p.id)
      })
    } else {
      list.push({
        id: `start-${p.id}`,
        title: t('palette.cmdStartPage', { name: p.name }),
        hint: p.status === 'error' ? t('menu.failed') : undefined,
        group: t('palette.groupPages'),
        run: () => void startPage(p.id)
      })
    }
  }
  for (const s of settingsStore.settings.externalSites) {
    list.push({
      id: `site-${s.id}`,
      title: t('palette.cmdExternalSite', { name: s.name }),
      hint: s.url,
      group: t('palette.groupPages'),
      keywords: s.url,
      run: () => previewExternalUrl(s.url, s.id)
    })
  }
  list.push(
    {
      id: 'act-reload',
      title: t('palette.actReload'),
      group: t('palette.groupActions'),
      run: () => reload()
    },
    {
      id: 'act-theme',
      title: t('palette.actTheme'),
      group: t('palette.groupActions'),
      run: () => quickThemeToggle()
    },
    {
      id: 'act-detach',
      title: t('palette.actDetach'),
      group: t('palette.groupActions'),
      run: () => detachCurrentPage()
    },
    {
      id: 'act-devtools',
      title: t('palette.actDevtools'),
      group: t('palette.groupActions'),
      keywords: 'F12',
      run: () => void toggleDevTools()
    },
    {
      id: 'act-updates',
      title: t('palette.actCheckUpdates'),
      group: t('palette.groupActions'),
      run: () => updatesStore.check(true)
    },
    {
      id: 'act-logs',
      title: t('menu.openLogsDir'),
      group: t('palette.groupActions'),
      keywords: 'log logs folder',
      run: openLogsDir
    }
  )
  // Generic agent-app settings entries — only for apps without a dedicated panel.
  for (const p of pagesStore.pages) {
    if (p.manageAsApp && p.kind !== 'dsh' && p.kind !== 'openclaw') {
      list.push({
        id: `appcfg-${p.id}`,
        title: t('palette.cmdAppSettings', { name: p.name }),
        group: t('palette.groupPanels'),
        keywords: p.name,
        run: () => (activePanel.value = appPanelKey(p.id))
      })
    }
  }
  for (const panel of PANEL_COMMANDS) {
    list.push({
      id: `panel-${panel.kind}`,
      title: panel.label,
      group: t('palette.groupPanels'),
      run: () => (activePanel.value = panel.kind)
    })
  }
  return list
})

/* ---- selected page + view toolbar live in the chrome so HomeView is content-only ---- */
const activePageId = ref<string | null>(null)
/** One mounted <webview> per opened page; switching only flips which one is visible, so a
    guest that is already up (openclaw's one-time bootstrap token, dsh terminals) is never
    reloaded by a page switch. */
const webviewSessions = ref<{ id: string; url: string }[]>([])
const activeSessionId = ref<string | null>(null)
/** URL of the session on screen; '' while the market / a CLI terminal owns the surface. */
const webviewSrc = computed(
  () => webviewSessions.value.find((s) => s.id === activeSessionId.value)?.url || ''
)
const webviewLoading = ref(false)
const homeRef = ref<InstanceType<typeof HomeView> | null>(null)
const cliTermRef = ref<{ restart: () => void } | null>(null)
/** Webview history availability, pushed up by HomeView, drives the top-bar back/forward buttons. */
const webNav = ref({ back: false, forward: false })
/** Whether the webview currently shows a loaded external address (keeps its nav in-view). */
const externalView = ref(false)

const pageUrl = (p: PageState): string => p.launchUrl || p.url || ''

/** CLI-only pages (kind=terminal) take over the whole content area with a terminal. */
const activeTerminalPage = computed(
  () => pagesStore.pages.find((p) => p.id === activePageId.value && p.kind === 'terminal') || null
)

/**
 * The webview must stay mounted while it has content — including when the user picks
 * 「工作台」to view the market page. Unmounting <webview> destroys the embedded page,
 * which wipes its right-sidebar terminal tabs and leaves the host-side session holding
 * ports that re-open then fails to start ("进程被占用").
 */
const webviewActive = computed(() => Boolean(webviewSrc.value) && !activeTerminalPage.value)

/* Switcher trigger label in the top bar — reflects the page currently shown in the webview. */
const currentTitle = computed(
  () =>
    pagesStore.pages.find((p) => p.id === activePageId.value)?.name ||
    settingsStore.settings.externalSites.find((s) => s.id === activePageId.value)?.name ||
    t('app.selectPage')
)

/** Page being started for the configured default view — drives the 启动中 overlay. */
const pendingPageId = ref<string | null>(null)

const startingText = computed(() => {
  if (!pendingPageId.value) return ''
  const p = pagesStore.pages.find((x) => x.id === pendingPageId.value)
  return t('app.starting', { name: p?.name || t('menu.pages') })
})

/* ---- boot overlay: live phase + log tail + elapsed, with a cancel escape hatch ---- */
const bootElapsed = ref(0)
let bootTimer: ReturnType<typeof setInterval> | null = null
/** Pages the user cancelled while booting — their late start() rejection must not toast. */
const cancelledIds = new Set<string>()

const pendingProgress = computed(() =>
  pendingPageId.value ? pagesStore.progress[pendingPageId.value] : undefined
)
const bootPhaseText = computed(() => {
  const p = pendingProgress.value
  if (!p || p.phase === 'ready') return ''
  return t(`boot.phase.${p.phase}`)
})
const bootLogs = computed(() => pendingProgress.value?.logs ?? [])
const bootElapsedText = computed(() =>
  t('boot.elapsed', { n: Math.floor(bootElapsed.value / 1000) })
)
/** Past this the overlay stops implying "any second now" and sets a first-boot expectation. */
const bootSlow = computed(() => bootElapsed.value > 15000)

function stopBootTimer(): void {
  if (bootTimer) {
    clearInterval(bootTimer)
    bootTimer = null
  }
}
watch(pendingPageId, (id) => {
  stopBootTimer()
  if (!id) return
  bootElapsed.value = 0
  bootTimer = setInterval(() => (bootElapsed.value += 500), 500)
})

/** Abort a booting default/switched page: kill the child and tear the overlay down at once. */
function cancelStart(): void {
  const id = pendingPageId.value
  if (!id) return
  cancelledIds.add(id)
  pendingPageId.value = null
  webviewLoading.value = false
  stopBootTimer()
  pagesStore.cancel(id).catch(() => undefined)
}

/**
 * Show the configured default page on entry, starting it on demand.
 * Returns true once the page is (or is being) shown, false when there is nothing to do.
 */
async function restoreDefaultView(): Promise<boolean> {
  const dv = settingsStore.settings.defaultView
  if (activePageId.value || dv.kind === 'none') return false
  // A saved external address can be the default view too: point the webview straight at
  // its URL. `site?.id` keeps the page-switcher row highlighted; a since-deleted site just
  // loses the highlight (the view still restores).
  if (dv.kind === 'external') {
    if (!dv.url) return false
    const site = settingsStore.settings.externalSites.find((s) => s.url === dv.url)
    previewExternalUrl(dv.url, site?.id, true)
    return true
  }
  const page = pagesStore.pages.find((p) => p.id === dv.pageId)
  if (!page) return false
  // The default view can name a hosted page whose runtime the slim installer never shipped.
  // Without this the launch would spawn a doomed process and toast an error every single start
  // (the async runtimes probe isn't awaited here, so the store flags could still be stale) —
  // `runtimeBlocked` now reads the list-loaded verdict, so route straight to the install guide.
  if (runtimeBlocked(page)) {
    guideToInstall(page)
    return false
  }
  // A CLI page owns the surface as soon as it is activated — no port to wait for.
  if (page.kind === 'terminal') {
    showInWebview(page)
    return true
  }
  if (page.status === 'running') {
    showInWebview(page)
    return true
  }
  if (pendingPageId.value) return true // a start is already in flight
  pendingPageId.value = page.id
  webviewLoading.value = true
  try {
    await pagesStore.start(page.id)
  } catch (err) {
    pendingPageId.value = null
    webviewLoading.value = false
    if (!cancelledIds.delete(page.id)) {
      ElMessage.error(t('app.startFail', { name: page.name, err: (err as Error).message }))
    }
    return false
  }
  const fresh = pagesStore.pages.find((p) => p.id === page.id)
  if (fresh?.status === 'running') {
    pendingPageId.value = null
    showInWebview(fresh)
    return true
  }
  // still booting: keep the overlay, the status watcher below completes the switch
  return true
}

/** Start a page from the switcher; the row only becomes switchable once this succeeds. */
async function startPage(id: string): Promise<void> {
  const target = pagesStore.pages.find((x) => x.id === id)
  if (target && runtimeBlocked(target)) {
    guideToInstall(target)
    return
  }
  try {
    await pagesStore.start(id)
  } catch (err) {
    ElMessage.error((err as Error).message)
    return
  }
  const p = pagesStore.pages.find((x) => x.id === id)
  if (!p) return
  ElMessage.success(t('app.started', { name: p.name }))
  if (p.kind !== 'terminal') showInWebview(p)
}

/**
 * Mount (or re-point) one session without touching the others. Re-showing an unchanged
 * session must NOT navigate or flash the loading overlay — that is what keeps an openclaw
 * token / dsh terminal alive across switches.
 */
const stripReloadHash = (u: string): string => u.replace(/#container-reload=\d+/, '')
function upsertSession(id: string, url: string): void {
  const clean = stripReloadHash(url)
  const existing = webviewSessions.value.find((s) => s.id === id)
  if (existing) {
    if (existing.url === clean) {
      webviewLoading.value = false // already loaded: just reveal it
      return
    }
    if (stripReloadHash(existing.url) === clean) {
      // Only a leftover reload-hash differs: drop it as a fragment-only change (no full
      // navigation, no openclaw "switch gateway" prompt).
      existing.url = clean
      webviewLoading.value = false
      return
    }
    existing.url = clean // same page, new token-bearing URL: navigate in place
    webviewLoading.value = true
    return
  }
  webviewSessions.value.push({ id, url: clean })
  webviewLoading.value = true
}

function showInWebview(page: PageState): void {
  activePageId.value = page.id
  externalView.value = false
  if (page.kind === 'terminal') {
    activeSessionId.value = null
    return
  }
  upsertSession(page.id, pageUrl(page))
  activeSessionId.value = page.id
  // Switching a page deliberately does NOT touch the persisted 默认打开页面 setting —
  // that is only changed from 设置, and every launch loads exactly what is configured there.
}

/** Leave the CLI terminal / market view and return to the workbench (default market screen). */
function backToWorkbench(): void {
  // Keep webviewSrc: the market overlay covers the still-mounted page, so its
  // right-sidebar terminal sessions survive the switch.
  activePageId.value = null
  webviewLoading.value = false
}

/**
 * A hosted dsh/openclaw page cannot run until its runtime is installed — the slim installer
 * ships none, so they are provisioned on demand into userData. Clicking such a page before its
 * runtime exists would only spawn a doomed process; bounce the user to the setup guide instead.
 * The main process owns this verdict on `PageState.runtimeMissing` (a synchronous probe it re-runs
 * on every list, already reporting a running page as unblocked), so this guard is race-free against
 * the async install-status IPC the runtimes store still uses for the first-run guide.
 */
function runtimeBlocked(page: PageState | undefined): boolean {
  return page?.runtimeMissing === true
}

/** Route a blocked page interaction back to the first-run install guide. */
function guideToInstall(page: PageState): void {
  runtimes.requestGuide()
  ElMessage.warning(t('setup.runtimeMissingToast', { name: page.name }))
}

/** Pick a page for the content area: CLI pages take it over with the terminal, web pages start on demand. */
async function openPage(id: string): Promise<void> {
  const page = pagesStore.pages.find((p) => p.id === id)
  if (!page) {
    // Saved external sites live in settings, not the page registry: switching to one
    // from the page switcher just points the webview at its URL (highlighted via `id`).
    const site = settingsStore.settings.externalSites.find((s) => s.id === id)
    if (site) previewExternalUrl(site.url, id)
    return
  }
  if (runtimeBlocked(page)) {
    guideToInstall(page)
    return
  }
  if (page.external) {
    previewExternalUrl(page.externalUrl || '', id)
    return
  }
  // Terminal-kind pages run their own command in the full-surface terminal — no port to wait for.
  if (page.kind !== 'terminal' && page.status !== 'running') {
    // Route through the boot overlay (phase text + cancel), same as the default-view path,
    // so a slow first boot on a manual switch still visibly does something rather than hang.
    if (pendingPageId.value === id) return
    pendingPageId.value = id
    webviewLoading.value = true
    try {
      await pagesStore.start(id)
    } catch (err) {
      pendingPageId.value = null
      webviewLoading.value = false
      if (!cancelledIds.delete(id)) ElMessage.error((err as Error).message)
      return
    }
    const fresh = pagesStore.pages.find((p) => p.id === id)
    if (fresh?.status === 'running') {
      pendingPageId.value = null
      showInWebview(fresh)
    }
    return
  }
  showInWebview(page)
}

/**
 * Open a saved/typed external address. `siteId` keeps the switcher row highlighted.
 *
 * #26: 外部地址打开方式 (`openExternalIn`) is wired back in here — the setting had been retired to
 * a stored-only field, so the row in 设置 would have changed nothing. `embedOnly` overrides it for
 * the one caller that *is* the container's own view (the 默认打开 restore at boot): honouring
 * 'system-browser' there would leave the window showing nothing but a welcome page.
 */
function previewExternalUrl(url: string, siteId?: string, embedOnly = false): void {
  if (!url) return
  if (!embedOnly && settingsStore.settings.openExternalIn === 'system-browser') {
    void window.container.openExternal(url)
    ElMessage.info(t('app.openedExternally'))
    return
  }
  externalView.value = true
  activePageId.value = siteId ?? null
  const sid = siteId || `ext:${url}`
  upsertSession(sid, url)
  activeSessionId.value = sid
  // Displaying an external address is transient too — it never rewrites the default view.
}

function previewSiteById(id: string): void {
  const site = settingsStore.settings.externalSites.find((s) => s.id === id)
  if (site) previewExternalUrl(site.url)
}

function reload(): void {
  if (!webviewSrc.value) return
  // Refresh the guest in place via <webview>.reload(): mutating src (the old
  // `#container-reload=` hash trick) changed the address openclaw's Control UI compares
  // against its current gateway, popping the "switch gateway?" confirm on every refresh.
  if (!homeRef.value?.reload()) return
  webviewLoading.value = true
}

async function inspectWebview(): Promise<void> {
  const guestId = (
    homeRef.value?.webviewEl as { getWebContentsId?: () => number } | null
  )?.getWebContentsId?.()
  await window.container.toggleDevTools(guestId).catch(() => undefined)
}

/** Open the embedded page in the system browser — some features (popups, clipboard,
    native file dialogs) are limited inside <webview>. */
function detachCurrentPage(): void {
  if (webviewSrc.value) window.container.openExternal(webviewSrc.value).catch(() => undefined)
}

/** Keep the top-bar back/forward buttons in sync with the webview's history stack. */
function onNavState(state: { back: boolean; forward: boolean }): void {
  webNav.value = state
}
function webviewGoBack(): void {
  homeRef.value?.goBack()
}
function webviewGoForward(): void {
  homeRef.value?.goForward()
}

/** Restart the whole desktop container after an explicit confirmation. */
async function restartContainer(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('menu.restartAppConfirm'), t('menu.restartApp'), {
      type: 'warning',
      confirmButtonText: t('menu.restartApp'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return // user dismissed the prompt
  }
  window.container.relaunchApp().catch(() => undefined)
}

/** Reveal the main-process log folder (Help menu / palette action). */
function openLogsDir(): void {
  window.container.openLogsDir().catch(() => undefined)
}

const systemPrefersDark = ref(false)
/** Frameless title bar: keep the maximize/restore icon in sync with the OS window. */
const isMaximized = ref(false)
/** Which theme mode the user picked — the quick-toggle pins light/dark from here. */
const themeMode = ref<'auto' | 'light' | 'dark'>('auto')
// Derived, not mirrored: a ref written only inside applyTheme goes stale whenever an
// await before that call throws (plain-browser path), freezing the toggle's icon and
// making the first click a visual no-op.
const isDark = computed(
  () => !(themeMode.value === 'light' || (themeMode.value === 'auto' && !systemPrefersDark.value))
)

/** Set once the title-bar button pins a mode manually — keeps the async settings
    watchEffect (and its late load) from overwriting the user's explicit choice. */
let userPinnedTheme = false

function applyTheme(mode: 'auto' | 'light' | 'dark'): void {
  const light = mode === 'light' || (mode === 'auto' && !systemPrefersDark.value)
  // main.css defines the dark token block on html.dark — keep both classes in sync.
  document.documentElement.classList.toggle('light', light)
  document.documentElement.classList.toggle('dark', !light)
  if (mode !== themeMode.value) userPinnedTheme = false
  themeMode.value = mode
  // Drive the OS-level scheme: 'auto' lets nativeTheme track the OS again (so "跟随系统"
  // repaints live on an OS switch); 'light'/'dark' pin it. Already-loaded webviews follow.
  window.container.setNativeTheme(mode).catch(() => undefined)
}

// Wait for persisted settings before applying — otherwise the default 'auto' flashes the wrong theme.
watchEffect(() => {
  if (settingsStore.loaded && !userPinnedTheme) applyTheme(settingsStore.settings.theme)
})

/**
 * #25: runtime accent override. Empty keeps each theme's CSS-defined `--accent` (light and dark
 * differ); a hex is written onto the document element so it wins over both `:root` and
 * `html.dark`, and Element Plus's `--el-color-primary*` (derived via `color-mix(var(--accent))`)
 * follows automatically. `--accent-strong` is a darkened variant for hover/active states.
 */
function applyAccent(hex?: string): void {
  const root = document.documentElement
  if (!hex) {
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-strong')
    return
  }
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-strong', `color-mix(in srgb, ${hex} 82%, #000)`)
}

/** #25: frosted-blur strength — write the base token the glass surfaces scale off.
    Set the px token (used by blur()) and its unitless mirror --glass-blur-n (used by the
    tint/saturate ratios) together so they never drift.
    Clamped to the shared ceiling instead of rewritten: configs saved while the slider still
    went up to 60px keep their value on disk, they just never render past GLASS_BLUR_MAX_PX. */
function applyGlassBlur(px?: number): void {
  const root = document.documentElement
  if (typeof px !== 'number') {
    root.style.removeProperty('--glass-blur')
    root.style.removeProperty('--glass-blur-n')
    return
  }
  const clamped = Math.min(Math.max(Math.round(px), 0), GLASS_BLUR_MAX_PX)
  root.style.setProperty('--glass-blur', `${clamped}px`)
  root.style.setProperty('--glass-blur-n', `${clamped}`)
}

/** #25: background transparency — the frosted-surface opacity. A percentage (0–100, full
 range: 0 = fully transparent, 100 = fully opaque) is written onto --glass-tint-a, overriding
 the blur-coupled stylesheet default so blur and transparency are independent axes. Undefined
 removes the override and falls back to that coupling. */
function applyGlassAlpha(pct?: number): void {
  const root = document.documentElement
  if (typeof pct !== 'number') {
    root.style.removeProperty('--glass-tint-a')
    return
  }
  const alpha = Math.min(1, Math.max(0, pct / 100))
  root.style.setProperty('--glass-tint-a', alpha.toFixed(3))
}

watchEffect(() => {
  if (!settingsStore.loaded) return
  applyAccent(settingsStore.settings.accentColor)
  applyGlassBlur(settingsStore.settings.glassBlur)
  applyGlassAlpha(settingsStore.settings.glassAlpha)
})

// #26: reduced motion — one class resolves the tri-state setting and the OS hint; re-apply when
// the OS flips live (battery-saver / accessibility changes mid-session) so 'auto' stays honest.
watchEffect(() => {
  applyReduceMotion(settingsStore.settings.reduceMotion)
})
/** #26: the OS query whose change we follow while the setting is 'auto'; torn down with the view. */
let osMotionMq: MediaQueryList | null = null
function onOsMotionChange(): void {
  applyReduceMotion(settingsStore.settings.reduceMotion)
}
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  osMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  osMotionMq.addEventListener?.('change', onOsMotionChange)
})
onBeforeUnmount(() => {
  osMotionMq?.removeEventListener?.('change', onOsMotionChange)
  osMotionMq = null
})

// Apply the persisted UI language as soon as settings load, and keep the Element Plus
// locale in lockstep so its built-in component text (empty states, pagination…) matches.
const currentEpLocale = computed(() => epLocale())

/**
 * Global ElMessage defaults: every toast pops bottom-right (EP anchors + stacks them
 * upward there natively) and de-duplicates identical repeats. A stable reference so the
 * ConfigProvider watcher doesn't re-merge a fresh object on each App re-render. Sizes are
 * trimmed to a compact "small toast" via the `.el-message` overrides in glass.css, where a
 * long message also clips into a scrollable box; `showClose` gives every toast a manual dismiss.
 */
const messageConfig = { placement: 'bottom-right', offset: 16, grouping: true, showClose: true }
watchEffect(() => {
  if (settingsStore.loaded) i18nLocale.value = settingsStore.settings.locale || 'zh'
})

// Keep the OS window/taskbar caption in the active language (index.html holds the zh default
// so the very first paint before settings load is already Chinese).
watchEffect(() => {
  document.title = t('app.title')
})

// The title-bar button is a pure day/night switch: it pins the opposite of what
// is currently shown (including when in 'auto'), never cycling back to auto.
function quickThemeToggle(): void {
  const next = isDark.value ? 'light' : 'dark'
  userPinnedTheme = true
  applyTheme(next)
  settingsStore.patch({ theme: next }).catch(() => undefined)
}

async function toggleDevTools(): Promise<void> {
  await window.container.toggleDevTools().catch(() => undefined)
}

/** MenuBar peels its drop list on the same Esc keydown (document bubble, before us). */
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'F12') {
    ev.preventDefault()
    void toggleDevTools()
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault()
    paletteOpen.value = !paletteOpen.value
  } else if (ev.key === 'Escape' && activePanel.value && !paletteOpen.value) {
    activePanel.value = null
  }
}

let disposeNativeTheme: (() => void) | null = null
let disposeMaximized: (() => void) | null = null
let disposeOpenTerminal: (() => void) | null = null
let disposeQuitConfirm: (() => void) | null = null
let quitDialogOpen = false

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  if (window.container) {
    disposeOpenTerminal = window.container.onOpenTerminalPage((id) => void openPage(id))
    // Load persisted settings BEFORE probing the OS scheme: applyTheme('auto') needs
    // systemPrefersDark already known, and the reapply below must not run with stale settings.
    await settingsStore.load().catch(() => undefined)
    const themeRes = await window.container.getNativeTheme().catch(() => null)
    if (themeRes?.ok) {
      systemPrefersDark.value = Boolean(themeRes.data)
      // The initial applyTheme (watchEffect) ran before this probe resolved.
      if (settingsStore.loaded) applyTheme(settingsStore.settings.theme)
    }
    disposeNativeTheme = window.container.onNativeTheme((dark) => {
      systemPrefersDark.value = dark
      // 'auto' must repaint live on an OS switch; pinned modes ignore the push.
      if (themeMode.value === 'auto') applyTheme('auto')
    })
    const maxRes = await window.container.getIsMaximized().catch(() => null)
    if (maxRes?.ok) isMaximized.value = Boolean(maxRes.data)
    disposeMaximized = window.container.onMaximizedChanged((v) => {
      isMaximized.value = v
    })
    disposeQuitConfirm = window.container.onQuitConfirm(() => {
      if (quitDialogOpen) return
      quitDialogOpen = true
      ElMessageBox.confirm(t('app.quitConfirmMsg'), t('app.quitConfirmTitle'), {
        confirmButtonText: t('app.quitConfirmOk'),
        cancelButtonText: t('app.quitConfirmCancel')
      })
        .then(() => window.container?.quitApp())
        .catch(() => undefined)
        .finally(() => {
          quitDialogOpen = false
        })
    })
  }
  await pagesStore.refresh().catch(() => undefined)
  runtimes.refresh().catch(() => undefined)
  // The configured default page wins over the CLI auto-start surface: it is what the
  // user asked to see on entry and gets started on demand when it isn't running yet.
  const restored = await restoreDefaultView().catch(() => false)
  if (!restored) {
    // Auto-run terminal-kind auto-start pages at launch. Only the full-surface CLI
    // terminal (CliTerminalView) actually spawns their startCommand, so it must become
    // the active page; web/server pages are started by the main process and keep running
    // in the background. When several CLI pages are configured, the last one gets the surface.
    const cliPage = (settingsStore.settings.autoStartPages || [])
      .map((id) => pagesStore.pages.find((x) => x.id === id))
      .filter((p) => p?.kind === 'terminal')
      .at(-1)
    if (cliPage) {
      activePageId.value = cliPage.id
      activeSessionId.value = null
    }
  }
  updatesStore.check().catch(() => undefined)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopBootTimer()
  disposeNativeTheme?.()
  disposeMaximized?.()
  disposeOpenTerminal?.()
  disposeQuitConfirm?.()
})

watch(activePanel, (panel) => {
  if (panel === 'pages' || panel === 'settings') pagesStore.refresh().catch(() => undefined)
  // Install status can change from these panels (provision / upgrade) — keep the guide's probe
  // fresh. The Pages list badge no longer needs this: it reads `PageState.runtimeMissing`, which
  // the `pagesStore.refresh()` above re-fetches, so we skip the expensive async status IPC here.
  if (panel === 'dsh' || panel === 'openclaw' || panel === 'help')
    runtimes.refresh().catch(() => undefined)
  if (panel === 'help' && !updatesStore.results.length) {
    updatesStore.check().catch(() => undefined)
  }
})

// A dsh page only reports its token-bearing URL after it boots, so re-point that session
// (in place, never a remount) when the announcement lands.
watch(
  () => pagesStore.pages.find((p) => p.id === activePageId.value)?.launchUrl,
  (url) => {
    if (!url || activeTerminalPage.value) return
    // A restart clears the boot-time launchUrl, so main hands back the bare
    // `http://127.0.0.1:<port>` until the new token-bearing one is announced. Pointing a
    // still-mounted openclaw guest at that bare URL lands the user on the gateway's token
    // screen, so only follow a URL while the page is actually up.
    const page = pagesStore.pages.find((p) => p.id === activePageId.value)
    if (page && page.status !== 'running') return
    const s = webviewSessions.value.find((x) => x.id === activePageId.value)
    if (s && s.url !== url) {
      s.url = url
      webviewLoading.value = true
    }
  }
)

// Re-evaluate the default view whenever pages or settings arrive — the panel can mount
// before either is loaded.
watch(
  () => [pagesStore.pages.length, settingsStore.loaded] as const,
  () => void restoreDefaultView().catch(() => false),
  { immediate: true }
)

// A default page that was still booting when start() resolved is switched in here once
// its port answers (or reported back as failed).
watch(
  () => pagesStore.pages.find((p) => p.id === pendingPageId.value)?.status,
  (status) => {
    const id = pendingPageId.value
    if (!id || !status) return
    if (status === 'running') {
      pendingPageId.value = null
      const p = pagesStore.pages.find((x) => x.id === id)
      if (p) showInWebview(p)
      return
    }
    if (status === 'error' || status === 'stopped') {
      pendingPageId.value = null
      webviewLoading.value = false
      if (!cancelledIds.delete(id)) {
        ElMessage.error(
          t('app.pageStartFail', {
            name: pagesStore.pages.find((x) => x.id === id)?.name || t('menu.pages')
          })
        )
      }
    }
  }
)

const runningCount = computed(() => pagesStore.runningPages.length)
/** The top-bar reload/devtools buttons act on the live webview; disable them on the market
    screen and while a CLI page owns the content area (the terminal has its own restart). */
const canOperate = computed(() => Boolean(webviewSrc.value) && !activeTerminalPage.value)
</script>

<template>
  <el-config-provider :locale="currentEpLocale" :message="messageConfig">
    <div class="shell">
      <!-- Ambient aurora: fixed, non-interactive; glass chrome bleeds it through. -->
      <div class="aurora" aria-hidden="true">
        <span class="blob b1" />
        <span class="blob b2" />
        <span class="blob b3" />
      </div>

      <MenuBar
        :current="activePanel"
        :running-count="runningCount"
        :total-count="pagesStore.pages.length"
        :outdated-count="updatesStore.outdated.length"
        :is-dark="isDark"
        :theme-mode="themeMode"
        :pages="pagesStore.pages"
        :active-page-id="activePageId"
        :busy-pages="pagesStore.busy"
        :switcher-title="currentTitle"
        :is-maximized="isMaximized"
        :can-operate="canOperate"
        :can-go-back="webNav.back"
        :can-go-forward="webNav.forward"
        :show-nav="externalView && canOperate"
        :terminal-mode="Boolean(activeTerminalPage)"
        :external-sites="settingsStore.settings.externalSites"
        @open="activePanel = $event"
        @open-panel="(p: string) => (activePanel = p)"
        @toggle-theme="quickThemeToggle"
        @select-page="openPage"
        @start-page="startPage"
        @open-terminal="(id: string) => openPage(id)"
        @preview-site="previewSiteById"
        @reload="reload"
        @go-back="webviewGoBack"
        @go-forward="webviewGoForward"
        @detach="detachCurrentPage"
        @inspect="inspectWebview"
        @restart-terminal="cliTermRef?.restart()"
        @restart-app="restartContainer"
        @open-logs="openLogsDir"
      >
        <template #settings>
          <MenuPanelContent
            v-if="activePanel === 'settings'"
            panel="settings"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pagesStore.pages.length"
            @apply-theme="applyTheme"
            @preview-site="previewExternalUrl"
          />
        </template>
        <template #pages>
          <MenuPanelContent
            v-if="activePanel === 'pages'"
            panel="pages"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pagesStore.pages.length"
            @close="activePanel = null"
          />
        </template>
        <template #external>
          <MenuPanelContent
            v-if="activePanel === 'external'"
            panel="external"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pagesStore.pages.length"
            @preview-site="previewExternalUrl"
          />
        </template>
        <template #dsh>
          <MenuPanelContent
            v-if="activePanel === 'dsh'"
            panel="dsh"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pagesStore.pages.length"
          />
        </template>
        <template #openclaw>
          <MenuPanelContent
            v-if="activePanel === 'openclaw'"
            panel="openclaw"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pagesStore.pages.length"
          />
        </template>
        <template #app="{ pageId }">
          <MenuPanelContent
            v-if="pageId && activePanel === appPanelKey(pageId)"
            :panel="appPanelKey(pageId)"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pagesStore.pages.length"
            @open-page="openPage"
            @open-terminal="openPage"
          />
        </template>
        <template #help>
          <MenuPanelContent
            v-if="activePanel === 'help'"
            panel="help"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pagesStore.pages.length"
            @check-updates="updatesStore.check(true)"
          />
        </template>
      </MenuBar>

      <main class="content">
        <!-- Workbench stays mounted for the whole session; only panels open and close above it. -->
        <CliTerminalView
          v-if="activeTerminalPage"
          ref="cliTermRef"
          :page="activeTerminalPage"
          @exit="backToWorkbench"
        />
        <HomeView
          ref="homeRef"
          :sessions="webviewSessions"
          :active-id="activeSessionId"
          :loading="webviewLoading"
          :starting-text="startingText"
          :phase-text="bootPhaseText"
          :logs="bootLogs"
          :slow="bootSlow"
          :elapsed-text="bootElapsedText"
          :market-active="!webviewActive && !activeTerminalPage"
          :external-view="externalView"
          @nav-state="onNavState"
          @guest-stop-loading="webviewLoading = false"
          @install-pages="activePanel = 'pages'"
          @open-panel="(k: string) => (activePanel = k)"
          @cancel-start="cancelStart"
        />
      </main>

      <!-- Plain-browser dev (vite URL without the preload bridge) has no PTY IPC.
         v-show, not v-if: unmounting drops the global onPtyData subscription, which
         would silently kill output for every embedded shell terminal tab. -->
      <TerminalDrawer v-if="hasBridge" v-show="store.open" />

      <CommandPalette v-model="paletteOpen" :commands="commands" />

      <!-- First-run dependency gate: a blocking overlay until the built-in Node is present. -->
      <SetupGate />
    </div>
  </el-config-provider>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* The menu bar spans full width and sits flush against the top edge, so it
   reads as one docked header instead of a floating card. */
.shell > :deep(.menubar) {
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}

.content {
  flex: 1;
  min-height: 0;
  /* Lift the webview above the fixed aurora (z-index:0) so the ambient blobs never
     tint the embedded page; glass chrome (menubar / panels) still sits above it. */
  position: relative;
  z-index: 1;
}

/* The embedded page owns the whole content area — flush to every window edge. */
.content :deep(.workbench) {
  border-radius: 0;
  border: none;
  box-shadow: none;
}
</style>
