<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { ElMessage } from 'element-plus'
import MenuBar, { type PanelKind } from './components/MenuBar.vue'
import MenuPanelContent from './components/MenuPanelContent.vue'
import TerminalDrawer from './components/TerminalDrawer.vue'
import CliTerminalView from './components/CliTerminalView.vue'
import HomeView from './views/HomeView.vue'
import { usePagesStore, type PageState } from './stores/pages'
import { useSettingsStore } from './stores/settings'
import { useUpdatesStore } from './stores/updates'

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const hasBridge = typeof window !== 'undefined' && !!window.container
const updatesStore = useUpdatesStore()

/** Panels float over the workbench instead of replacing it, so an embedded page never unmounts. */
const activePanel = ref<PanelKind | null>(null)

/* ---- selected page + view toolbar live in the chrome so HomeView is content-only ---- */
const activePageId = ref<string | null>(null)
const webviewSrc = ref('')
const webviewLoading = ref(false)
const homeRef = ref<InstanceType<typeof HomeView> | null>(null)
const cliTermRef = ref<{ restart: () => void } | null>(null)

const pageUrl = (p: PageState): string => p.launchUrl || p.url || ''

/** CLI-only pages (kind=terminal, e.g. codex) take over the whole content area with a terminal. */
const activeTerminalPage = computed(
  () => pagesStore.pages.find((p) => p.id === activePageId.value && p.kind === 'terminal') || null
)

/* Switcher trigger label in the top bar — reflects the page currently shown in the webview. */
const currentTitle = computed(
  () => pagesStore.pages.find((p) => p.id === activePageId.value)?.name || '选择页面'
)

function showInWebview(page: PageState): void {
  activePageId.value = page.id
  if (page.kind === 'terminal') {
    webviewSrc.value = ''
  } else {
    const url = pageUrl(page)
    // Same URL already shown: src is unchanged → no navigation → the loading overlay would
    // never get cleared by did-stop-loading / dom-ready. Reveal the current view instead.
    if (url && url === webviewSrc.value) webviewLoading.value = false
    else {
      webviewLoading.value = true
      webviewSrc.value = url
    }
  }
  const dv = settingsStore.settings.defaultView
  if (!(dv.kind === 'page' && dv.pageId === page.id)) {
    settingsStore.patch({ defaultView: { kind: 'page', pageId: page.id } }).catch(() => undefined)
  }
}

/** Leave the CLI terminal and return to the workbench (hero screen). */
function backToWorkbench(): void {
  activePageId.value = null
  webviewSrc.value = ''
  webviewLoading.value = false
}

/** Pick a page for the content area: CLI pages take it over with the terminal, web pages start on demand. */
async function openPage(id: string): Promise<void> {
  const page = pagesStore.pages.find((p) => p.id === id)
  if (!page) return
  if (page.external) {
    await window.container.openExternal(page.externalUrl || '').catch(() => undefined)
    return
  }
  // Terminal-kind pages run their own command in the full-surface terminal — no port to wait for.
  if (page.kind !== 'terminal' && page.status !== 'running') {
    ElMessage.info(`${page.name} 未运行，正在启动…`)
    try {
      await pagesStore.start(id)
    } catch (err) {
      ElMessage.error((err as Error).message)
      return
    }
  }
  showInWebview(pagesStore.pages.find((p) => p.id === id) || page)
}

/** Show a saved/typed external URL in the webview (or hand it to the OS browser per settings). */
function previewExternalUrl(url: string): void {
  if (!url) return
  if (settingsStore.settings.openExternalIn === 'system-browser') {
    window.container.openExternal(url).catch(() => undefined)
    return
  }
  activePageId.value = null
  // Same URL already shown: <webview> src is unchanged, so no navigation fires and
  // did-stop-loading / dom-ready would never clear the overlay — just reveal current view.
  if (webviewSrc.value === url) {
    webviewLoading.value = false
    return
  }
  webviewLoading.value = true
  webviewSrc.value = url
  settingsStore.patch({ defaultView: { kind: 'external', url } }).catch(() => undefined)
}

function previewSiteById(id: string): void {
  const site = settingsStore.settings.externalSites.find((s) => s.id === id)
  if (site) previewExternalUrl(site.url)
}

function reload(): void {
  if (!webviewSrc.value) return
  webviewLoading.value = true
  webviewSrc.value =
    webviewSrc.value.replace(/#container-reload=\d+/, '') + `#container-reload=${Date.now()}`
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
  } else if (ev.key === 'Escape' && activePanel.value) {
    activePanel.value = null
  }
}

let disposeNativeTheme: (() => void) | null = null
let disposeMaximized: (() => void) | null = null
let disposeOpenTerminal: (() => void) | null = null

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
  }
  await pagesStore.refresh().catch(() => undefined)
  // Auto-run terminal-kind auto-start pages (e.g. codex) at launch. Only the full-surface
  // CLI terminal (CliTerminalView) actually spawns their startCommand, so it must become the
  // active page; web/server pages are started by the main process and keep running in the
  // background. When several CLI pages are configured, the last one gets the surface.
  const cliPage = (settingsStore.settings.autoStartPages || [])
    .map((id) => pagesStore.pages.find((x) => x.id === id))
    .filter((p) => p?.kind === 'terminal')
    .at(-1)
  if (cliPage) {
    activePageId.value = cliPage.id
    webviewSrc.value = ''
  }
  updatesStore.check().catch(() => undefined)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  disposeNativeTheme?.()
  disposeMaximized?.()
  disposeOpenTerminal?.()
})

watch(activePanel, (panel) => {
  if (panel === 'pages' || panel === 'view') pagesStore.refresh().catch(() => undefined)
  if (panel === 'updates' && !updatesStore.results.length) {
    updatesStore.check().catch(() => undefined)
  }
})

// A dsh page only reports its token-bearing URL after it boots, so re-point the webview when it lands.
watch(
  () => pagesStore.pages.find((p) => p.id === activePageId.value)?.launchUrl,
  (url) => {
    if (url && url !== webviewSrc.value && !activeTerminalPage.value) webviewSrc.value = url
  }
)

watch(
  () => [pagesStore.pages.length, settingsStore.loaded] as const,
  () => {
    const dv = settingsStore.settings.defaultView
    if (activePageId.value || dv.kind !== 'page') return
    const page = pagesStore.pages.find((p) => p.id === dv.pageId)
    // Never auto-launch a CLI page's terminal — it should only appear on explicit pick.
    if (page?.kind !== 'terminal' && page?.status === 'running') showInWebview(page)
  },
  { immediate: true }
)

const runningCount = computed(() => pagesStore.runningPages.length)
/** The top-bar reload/devtools buttons act on the live webview; disable them on the hero screen
    and while a CLI page owns the content area (the terminal has its own restart button). */
const canOperate = computed(() => Boolean(webviewSrc.value) && !activeTerminalPage.value)
</script>

<template>
  <div class="shell">
    <MenuBar
      :current="activePanel"
      :running-count="runningCount"
      :total-count="pagesStore.pages.length"
      :outdated-count="updatesStore.outdated.length"
      :is-dark="isDark"
      :theme-mode="themeMode"
      :pages="pagesStore.pages"
      :active-page-id="activePageId"
      :switcher-title="currentTitle"
      :is-maximized="isMaximized"
      :can-operate="canOperate"
      :terminal-mode="Boolean(activeTerminalPage)"
      :external-sites="settingsStore.settings.externalSites"
      @open="activePanel = $event"
      @open-panel="(p: PanelKind) => (activePanel = p)"
      @toggle-theme="quickThemeToggle"
      @select-page="openPage"
      @open-terminal="(id: string) => openPage(id)"
      @preview-site="previewSiteById"
      @manage="activePanel = 'pages'"
      @reload="reload"
      @detach="detachCurrentPage"
      @inspect="inspectWebview"
      @restart-terminal="cliTermRef?.restart()"
    >
      <template #view>
        <MenuPanelContent
          v-if="activePanel === 'view'"
          panel="view"
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
      <template #updates>
        <MenuPanelContent
          v-if="activePanel === 'updates'"
          panel="updates"
          :runtime="pagesStore.nodeInfo"
          :running-count="runningCount"
          :total-count="pagesStore.pages.length"
          @check-updates="updatesStore.check(true)"
        />
      </template>
      <template #about>
        <MenuPanelContent
          v-if="activePanel === 'about'"
          panel="about"
          :runtime="pagesStore.nodeInfo"
          :running-count="runningCount"
          :total-count="pagesStore.pages.length"
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
        v-show="!activeTerminalPage"
        ref="homeRef"
        :url="webviewSrc"
        :loading="webviewLoading"
        @guest-stop-loading="webviewLoading = false"
        @install-pages="activePanel = 'pages'"
      />
    </main>

    <!-- Plain-browser dev (vite URL without the preload bridge) has no PTY IPC. -->
    <TerminalDrawer v-if="hasBridge" />
  </div>
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
}

/* The embedded page owns the whole content area — flush to every window edge. */
.content :deep(.workbench) {
  border-radius: 0;
  border: none;
  box-shadow: none;
}
</style>
