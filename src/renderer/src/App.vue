<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MenuBar, { type PanelKind } from '@renderer/components/layout/classic/MenuBar.vue'
import {
  appPanelKey,
  DEFAULT_KEYBINDINGS,
  GLASS_FROST_MAX_BLUR_PX,
  GLASS_FROST_MIN_ALPHA_PCT,
  KEYBINDING_ACTIONS,
  type KeybindingAction
} from '@shared/types'
import { formatAccelerator, matchesAccelerator } from '@shared/accel'
import MenuPanelContent from '@renderer/components/panels/MenuPanelContent.vue'
import QQShell from '@renderer/components/layout/qq/QQShell.vue'
import CommandPalette, { type Command } from '@renderer/components/shell/CommandPalette.vue'
import TerminalDrawer from '@renderer/components/terminal/TerminalDrawer.vue'
import CliTerminalView from '@renderer/components/terminal/CliTerminalView.vue'
import SetupGate from '@renderer/components/shell/SetupGate.vue'
import HomeView from './views/HomeView.vue'
import { usePagesStore, type PageState } from './stores/pages'
import { useSettingsStore, applyReduceMotion } from './stores/settings'
import { useDualStore } from './stores/dual'
import { useTerminalStore } from './stores/terminal'
import { useUpdatesStore } from './stores/updates'
import { useRuntimesStore } from './stores/runtimes'
import { ElConfigProvider } from 'element-plus'
import { setLocale, t, epLocale } from './i18n'
import { askAiWith, registerAskAiJump, unregisterAskAiJump } from './askAi'
import { setToastSystemRouting } from './toast'

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const store = useTerminalStore()
const hasBridge = typeof window !== 'undefined' && !!window.container
const updatesStore = useUpdatesStore()
const runtimes = useRuntimesStore()
const dualStore = useDualStore()

/** Panels float over the workbench instead of replacing it, so an embedded page never unmounts. */
const activePanel = ref<string | null>(null)

/* ---- shell layout mode -------------------------------------------------------------
   'im' (default, 效率) uses a compact title bar and moves the panels into a QQ-like left rail +
   docked sidebar (QQShell); 'classic' keeps the top menu bar + centered floating panels. It is a
   layout switch only — the frosted surfaces, theme and aurora are untouched. Driven off the
   reactive settings so the 设置 ▸ 布局 radio and the Ctrl+K command flip it live; an unset
   (pre-setting) install defaults to 经典, and popout windows always render classic. */
const isIm = computed(
  () => !isPopout.value && (settingsStore.settings.layoutMode ?? 'classic') === 'im'
)

/**
 * Vertical tab a panel should open on, set by a palette command (「查看事件动态」→ help/events).
 * Cleared whenever the panel closes so the next ordinary menu click lands on its default tab.
 */
const panelTab = ref<string | null>(null)
watch(activePanel, (panel) => {
  // help + settings both honor a palette deep-link tab; every other panel clears it so the next
  // ordinary menu click lands on its default tab.
  if (panel !== 'help' && panel !== 'settings') panelTab.value = null
})

/* ---- C2: detached page window ----
   The main process opens `?popout=<pageId>` in its own BrowserWindow; this renderer instance then
   paints only a 28px caption bar over the page, with no menu / workbench / drawer. It shares the
   default session, so a page the user already signed into in the main window is signed in here. */
const popoutPageId = (() => {
  try {
    return new URLSearchParams(window.location.search).get('popout') || ''
  } catch {
    return ''
  }
})()
const isPopout = computed(() => Boolean(popoutPageId))
/**
 * What this detached window hosts. Normally a registry page, but a saved 外部站点 is not a page
 * (it lives in settings), so it is answered with a synthetic one: same name for the caption, and
 * `status: 'running'` because there is no process to wait for.
 */
const popoutPage = computed<PageState | null>(() => {
  const p = pagesStore.pages.find((x) => x.id === popoutPageId)
  if (p) return p
  const site = settingsStore.settings.externalSites.find((s) => s.id === popoutPageId)
  return site
    ? {
        id: site.id,
        name: site.name,
        dir: '',
        port: 0,
        startCommand: '',
        external: true,
        externalUrl: site.url,
        url: site.url,
        status: 'running'
      }
    : null
})

function closePopout(): void {
  window.container?.closeWindow?.().catch(() => undefined)
}

function minimizePopout(): void {
  window.container?.minimizeWindow?.().catch(() => undefined)
}

function toggleMaximizePopout(): void {
  window.container?.toggleMaximize?.().catch(() => undefined)
}

function startPopoutPage(): void {
  if (popoutPageId) void startPage(popoutPageId)
}

/* ---- Ctrl+K command palette ---- */
const paletteOpen = ref(false)

/** Stop a running page from the palette (or a CLI surface's idle auto-stop); failures toast. */
function stopPage(id: string): void {
  pagesStore.stop(id).catch((err) => ElMessage.error((err as Error).message))
}

/** Restart a page from the palette — the same store call the page manager row uses. */
function restartPage(id: string): void {
  pagesStore.restart(id).catch((err) => ElMessage.error((err as Error).message))
}

/**
 * Reveal the terminal drawer from the palette: focus the last session if one exists,
 * otherwise start a root shell (which itself opens the drawer). */
function openTerminalDrawer(): void {
  if (store.sessions.length) {
    store.open = true
    return
  }
  // Report a failed spawn: the drawer only opens once its shell exists, so swallowing the error
  // made a bad cwd (packaged builds used to root the shell inside app.asar) look like a palette
  // command that does nothing at all.
  void store
    .start('container', t('terminal.title'))
    .catch((err) => ElMessage.error((err as Error).message))
}

/* Store i18n KEYS, not resolved labels: `t()` here would run once at module load and freeze
   whichever language was active then (the palette's Chinese items under an English header).
   The label is resolved inside the `commands` computed so it tracks the reactive locale. */
const PANEL_COMMANDS: { kind: PanelKind; key: string }[] = [
  { kind: 'pages', key: 'palette.panelPages' },
  { kind: 'external', key: 'palette.panelExternal' },
  { kind: 'dsh', key: 'palette.panelDsh' },
  { kind: 'openclaw', key: 'palette.panelOpenclaw' },
  { kind: 'mcp', key: 'palette.panelMcp' },
  { kind: 'workspace', key: 'palette.panelWorkspace' },
  { kind: 'board', key: 'palette.panelBoard' },
  { kind: 'settings', key: 'palette.panelSettings' },
  { kind: 'help', key: 'palette.panelHelp' }
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
      // A resident CLI is managed like an installed page: opening it auto-starts, so the only
      // extra entry a running one needs is the explicit stop.
      if (p.status === 'running') {
        list.push({
          id: `stop-${p.id}`,
          title: t('palette.cmdStopPage', { name: p.name }),
          group: t('palette.groupPages'),
          run: () => stopPage(p.id)
        })
      }
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
    // C1/C2: every hosted page is poppable into its own window and restartable in place.
    // The shortcut hint only shows for the page the global binding would pop out.
    list.push({
      id: `popout-${p.id}`,
      title: t('palette.cmdPopoutPage', { name: p.name }),
      hint: p.id === activePageId.value ? keyHint('popoutCurrent') : undefined,
      group: t('palette.groupPages'),
      run: () => void popoutPageIdAction(p.id)
    })
    list.push({
      id: `restart-${p.id}`,
      title: t('palette.cmdRestartPage', { name: p.name }),
      group: t('palette.groupPages'),
      run: () => restartPage(p.id)
    })
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
      id: 'act-layout',
      title: t('palette.actLayout'),
      hint: t('palette.actLayoutHint', {
        mode: isIm.value ? t('settings.layoutIm') : t('settings.layoutClassic')
      }),
      group: t('palette.groupActions'),
      keywords: 'layout 布局 侧边栏 sidebar im classic',
      run: () => toggleLayoutMode()
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
      hint: keyHint('devtools'),
      group: t('palette.groupActions'),
      keywords: 'F12',
      run: () => void toggleDevTools()
    },
    {
      id: 'act-updates',
      title: t('palette.actCheckUpdates'),
      group: t('palette.groupActions'),
      keywords: 'update updates check 更新',
      // Open the Help panel (where the update table lives) and force a fresh check,
      // instead of running a check the user can't see.
      run: () => {
        activePanel.value = 'help'
        updatesStore.check(true).catch(() => undefined)
      }
    },
    {
      id: 'act-logs',
      title: t('menu.openLogsDir'),
      group: t('palette.groupActions'),
      keywords: 'log logs folder',
      run: openLogsDir
    }
  )
  // Terminal drawer only mounts with the preload bridge (PTY IPC); skip it in plain-browser dev.
  if (hasBridge) {
    list.push({
      id: 'act-terminal',
      title: t('palette.actTerminal'),
      hint: keyHint('terminal'),
      group: t('palette.groupActions'),
      keywords: 'terminal shell cmd console 终端',
      run: () => openTerminalDrawer()
    })
  }
  // A1: the crash/activity timeline lives in the help panel — give it a direct entry.
  list.push({
    id: 'act-events',
    title: t('palette.cmdEvents'),
    hint: keyHint('eventsTimeline'),
    group: t('palette.groupActions'),
    keywords: 'event events timeline crash activity 事件 动态 时间线 崩溃',
    run: () => openHelpTab('events')
  })
  /* D2: agent entry points. Only offered when the page is actually hosted — a CLI-only
     openclaw install has no web UI to jump to, and the clipboard hand-off needs one. */
  const claw = agentPage('openclaw')
  if (claw && claw.kind !== 'terminal') {
    list.push({
      id: 'ai-ask',
      title: t('palette.cmdAskOpenclaw'),
      group: t('palette.groupAi'),
      keywords: 'ai ask openclaw claw question 提问 问',
      run: () => void askAgent('openclaw')
    })
    if (activePageId.value) {
      list.push({
        id: 'ai-ask-context',
        title: t('palette.cmdAskContext'),
        hint: currentTitle.value,
        group: t('palette.groupAi'),
        keywords: 'ai ask context logs clipboard openclaw 提问 上下文 日志',
        run: () => void askWithContext()
      })
    }
  }
  const dshPage = agentPage('dsh')
  if (dshPage) {
    list.push({
      id: 'ai-dsh-web',
      title: t('palette.cmdOpenDshWeb'),
      group: t('palette.groupAi'),
      keywords: 'ai dsh web 工作台',
      run: () => void openPage(dshPage.id)
    })
  }
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
      title: t(panel.key),
      group: t('palette.groupPanels'),
      run: () => (activePanel.value = panel.kind)
    })
  }
  return list
})

/** Open (or focus) the settings panel on a given vertical tab (a palette deep link). */
function openSettingsTab(tab: string): void {
  panelTab.value = tab
  activePanel.value = 'settings'
}

/* ---- #5: command-palette deep search -------------------------------------------
   The static `commands` list covers pages, panels, actions and app entries. This adds
   three lazy sources that are too costly (or too dynamic) to keep in that computed: a
   keyword-mapped settings index, the live MCP tool catalog, and a log-line grep. Each
   returns {@link Command}s the palette merges + scores alongside the static ones. */

/** Settings rows reachable by keyword → the tab that hosts them + a match-only keyword set. */
const SETTINGS_SEARCH_INDEX: { tab: string; labelKey: string; kw: string }[] = [
  { tab: 'view', labelKey: 'settings.tabView', kw: 'theme 主题 language 语言 layout 布局 accent 配色' },
  { tab: 'behavior', labelKey: 'settings.tabBehavior', kw: 'startup 启动 autostart 自启 tray 托盘 crash 崩溃 terminal 终端' },
  { tab: 'alerts', labelKey: 'settings.tabAlerts', kw: 'notify 通知 memory 内存 warn 告警' },
  { tab: 'keys', labelKey: 'settings.tabKeys', kw: 'shortcut 快捷键 keybind 绑定' },
  { tab: 'download', labelKey: 'settings.tabDownload', kw: 'download 下载 dir 目录' },
  { tab: 'network', labelKey: 'settings.tabNetwork', kw: 'registry 镜像 npm network 网络' },
  { tab: 'privacy', labelKey: 'settings.tabPrivacy', kw: 'privacy 隐私 cookie 缓存 clear 清理' },
  { tab: 'storage', labelKey: 'settings.tabStorage', kw: 'disk 磁盘 storage 存储 space 占用 clean 清理' }
]

/** One fuzzy token match: does the query appear in the label text or the keyword bag? */
function matches(hay: string, q: string): boolean {
  return hay.toLowerCase().includes(q.toLowerCase())
}

async function deepSearch(q: string): Promise<Command[]> {
  const out: Command[] = []
  const query = q.trim()
  if (!query) return out

  // 1) settings index — synchronous, cheap.
  for (const row of SETTINGS_SEARCH_INDEX) {
    const label = t(row.labelKey)
    if (matches(label, query) || matches(row.kw, query)) {
      out.push({
        id: `set-${row.tab}`,
        title: t('palette.cmdSettingItem', { name: label }),
        group: t('palette.groupSettings'),
        keywords: row.kw,
        run: () => openSettingsTab(row.tab)
      })
    }
  }

  // 2) live MCP tool catalog (only connected servers report tools).
  try {
    const res = await window.container.mcpListTools?.()
    const tools = (res?.ok ? (res.data as { name: string; serverId: string; description?: string }[]) : []) || []
    for (const tool of tools) {
      if (!matches(`${tool.name} ${tool.description ?? ''}`, query)) continue
      out.push({
        id: `mcp-tool-${tool.serverId}-${tool.name}`,
        title: t('palette.cmdMcpTool', { tool: tool.name }),
        hint: tool.serverId,
        group: t('palette.groupTools'),
        keywords: tool.description,
        run: () => (activePanel.value = 'mcp')
      })
      if (out.length > 40) break
    }
  } catch {
    /* a catalog that won't answer just means no tool hits */
  }

  // 3) log-line grep across the readable files, capped so one keystroke stays cheap.
  try {
    const filesRes = await window.container.listLogFiles?.()
    const files = (filesRes?.ok ? (filesRes.data as { key: string; label: string }[]) : []) || []
    let hits = 0
    for (const file of files.slice(0, 8)) {
      const readRes = await window.container.readLogs?.({ key: file.key, tail: 200, filter: query })
      const lines = (readRes?.ok ? (readRes.data as { lines: string[] }).lines : []) || []
      for (const line of lines.slice(-3)) {
        const text = line.trim().slice(0, 90)
        if (!text) continue
        out.push({
          id: `log-${file.key}-${hits}`,
          title: t('palette.cmdLogHit', { file: file.label, line: text }),
          group: t('palette.groupLogs'),
          run: () => openHelpTab('logs')
        })
        hits++
        if (hits >= 12) break
      }
      if (hits >= 12) break
    }
  } catch {
    /* unreadable logs simply yield no rows */
  }

  return out.slice(0, 30)
}

/* ---- selected page + view toolbar live in the chrome so HomeView is content-only ---- */
const activePageId = ref<string | null>(null)
/** One mounted <webview> per opened page; switching only flips which one is visible, so a
    guest that is already up (openclaw's one-time bootstrap token, dsh terminals) is never
    reloaded by a page switch. `hosted` marks a container-managed page (vs an external preview),
    which the first-open repaint uses to scope its one-shot reload to pages that can black out. */
const webviewSessions = ref<{ id: string; url: string; hosted: boolean }[]>([])
const activeSessionId = ref<string | null>(null)
/** URL of the session on screen; '' while the market / a CLI terminal owns the surface. */
const webviewSrc = computed(
  () => webviewSessions.value.find((s) => s.id === activeSessionId.value)?.url || ''
)
const webviewLoading = ref(false)
const homeRef = ref<InstanceType<typeof HomeView> | null>(null)
/**
 * One kept-mounted CliTerminalView per CLI page opened this session (mirrors `webviewSessions`):
 * switching only flips `v-show`, so a running CLI's PTY is never reloaded by a page switch. A
 * session is dropped (unmount → its PTY is killed) only when its page is removed or disabled.
 */
const cliTermSessions = ref<string[]>([])
const cliTermRefs = new Map<string, InstanceType<typeof CliTerminalView>>()
function setCliTermRef(id: string, el: unknown): void {
  const inst = el as InstanceType<typeof CliTerminalView> | null
  if (inst) cliTermRefs.set(id, inst)
  else cliTermRefs.delete(id)
}
const isTerminalId = (id: string | null): boolean =>
  pagesStore.pages.find((p) => p.id === id)?.kind === 'terminal'
/** Restart the CLI on screen (top-bar restart). */
function restartActiveCli(): void {
  if (activePageId.value) cliTermRefs.get(activePageId.value)?.restart()
}
/** Stop the CLI on screen — the resident counterpart to opening/auto-starting it. */
function stopActiveCli(): void {
  if (activePageId.value) stopPage(activePageId.value)
}
// Opening a CLI page from any entry point (switcher, palette, launch auto-start, the main-process
// OpenTerminalPage event) registers its resident session; watching activePageId covers them all.
watch(
  activePageId,
  (id) => {
    if (id && isTerminalId(id) && !cliTermSessions.value.includes(id)) cliTermSessions.value.push(id)
  },
  { immediate: true }
)
// A removed or disabled page loses its surface: dropping the session unmounts the view, whose
// onBeforeUnmount kills the PTY. Enabled-but-stopped pages keep their (idle/exited) session.
watch(
  () => pagesStore.pages,
  () => {
    cliTermSessions.value = cliTermSessions.value.filter(
      (id) =>
        isTerminalId(id) && pagesStore.pages.find((p) => p.id === id)?.disabled !== true
    )
  }
)
/** Webview history availability, pushed up by HomeView, drives the top-bar back/forward buttons. */
const webNav = ref({ back: false, forward: false })
/** Whether the webview currently shows a loaded external address (keeps its nav in-view). */
const externalView = ref(false)

const pageUrl = (p: PageState): string => p.launchUrl || p.url || ''

/** The address a window should host for a page: an external page keeps it in `externalUrl`. */
const popoutUrl = (p: PageState): string => (p.external ? p.externalUrl || pageUrl(p) : pageUrl(p))

/**
 * Pages the dual-pane secondary screen can show: every running web page (with a live URL)
 * plus the configured external sites. CLI/terminal pages are excluded (they own the full
 * surface elsewhere). HomeView filters out the page already shown in the main pane.
 */
const secondaryChoices = computed<{ id: string; label: string; url: string }[]>(() => {
  const out: { id: string; label: string; url: string }[] = []
  for (const p of pagesStore.pages) {
    if (p.kind === 'terminal') continue
    const url = p.external ? p.externalUrl || pageUrl(p) : pageUrl(p)
    if (url) out.push({ id: `p-${p.id}`, label: p.name, url })
  }
  for (const s of settingsStore.settings.externalSites) {
    if (s.url) out.push({ id: `s-${s.id}`, label: s.name, url: s.url })
  }
  return out
})

/** A detached window can only offer 启动该页面 for a hosted page that is down and not booting. */
const popoutStartable = computed(() => {
  const p = popoutPage.value
  return (
    Boolean(p) &&
    !p?.external &&
    p?.kind !== 'terminal' &&
    p?.status !== 'running' &&
    p?.status !== 'starting'
  )
})

/** Caption-bar sub-line: why the page isn't on screen right now ('' when it is). */
const popoutSub = computed(() => {
  const p = popoutPage.value
  if (!p) return t('app.popoutLoadFail')
  // An external address has no process: it is either hostable or it isn't.
  if (p.external) return popoutUrl(p) ? '' : t('app.popoutLoadFail')
  if (p.status === 'running' && !pageUrl(p)) return t('app.popoutLoadFail')
  return p.status === 'running' ? '' : t('app.popoutStopped')
})

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
  // A detached window shows exactly one page and never the configured default view.
  if (isPopout.value) return false
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
  // A default view that names a since-disabled built-in rests on the workbench: the page left
  // the switcher, and silently re-enabling it here would contradict the user's switch.
  if (!page || page.disabled) return false
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
function upsertSession(id: string, url: string, hosted: boolean): void {
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
  webviewSessions.value.push({ id, url: clean, hosted })
  webviewLoading.value = true
}

function showInWebview(page: PageState): void {
  activePageId.value = page.id
  externalView.value = false
  if (page.kind === 'terminal') {
    activeSessionId.value = null
    return
  }
  upsertSession(page.id, pageUrl(page), true)
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

// A page disabled from the Pages panel while it is on screen: pull the view back to the
// workbench. Its switcher row is gone, so leaving it up would strand the user on a surface
// they can no longer navigate away from (and the next default-view restore skips it anyway).
watch(
  () => pagesStore.pages.find((p) => p.id === activePageId.value)?.disabled,
  (off) => {
    if (off) backToWorkbench()
  }
)

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
  upsertSession(sid, url, false)
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

/** Reveal the main-process log folder (palette action; the 帮助 menu no longer carries it). */
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
    Clamped to the frost slider's ceiling instead of rewritten: configs saved while the
    slider still went to 100% (or 60px) keep their value on disk, they just never render
    past GLASS_FROST_MAX_BLUR_PX. */
function applyGlassBlur(px?: number): void {
  const root = document.documentElement
  if (typeof px !== 'number') {
    root.style.removeProperty('--glass-blur')
    root.style.removeProperty('--glass-blur-n')
    return
  }
  const clamped = Math.min(Math.max(Math.round(px), 0), GLASS_FROST_MAX_BLUR_PX)
  root.style.setProperty('--glass-blur', `${clamped}px`)
  root.style.setProperty('--glass-blur-n', `${clamped}`)
}

/** #25: background transparency — the frosted-surface opacity. A percentage (0–100, full
 range: 0 = fully transparent, 100 = fully opaque) is written onto --glass-tint-a, overriding
 the blur-coupled stylesheet default so blur and transparency are independent axes. Undefined
 removes the override and falls back to that coupling. Floored at the frost ceiling's opacity
 (GLASS_FROST_MIN_ALPHA_PCT): since the single 毛玻璃 slider merged both axes, a stale
 near-transparent value saved under the old 100% range must not outlive the cap either. */
function applyGlassAlpha(pct?: number): void {
  const root = document.documentElement
  if (typeof pct !== 'number') {
    root.style.removeProperty('--glass-tint-a')
    return
  }
  const alpha = Math.min(1, Math.max(Math.max(pct, GLASS_FROST_MIN_ALPHA_PCT) / 100, 0))
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

// The dark-mode flowing-light border (see glass.css `.win-edge` / popup ::after). Off paints a
// `.no-marquee` class on <html> that every ring's selector keys `:not(.no-marquee)` off of, so
// disabling it needs no JS touching the SVG — the CSS just stops matching. Default (undefined) is on.
watchEffect(() => {
  document.documentElement.classList.toggle('no-marquee', settingsStore.settings.marqueeBorder === false)
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
  // setLocale (not a bare locale.value write) so switching to en for the first time arms the
  // lazy dictionary load.
  if (settingsStore.loaded) setLocale(settingsStore.settings.locale || 'zh')
})

// Mirror the 系统通知 switch into the toast router (see toast.ts): on → every ElMessage is
// forwarded to the OS notification center instead of the corner toast. Held off until settings
// load so an early toast still renders in-app rather than vanishing into an unrouted forward.
watchEffect(() => {
  setToastSystemRouting(settingsStore.loaded && settingsStore.settings.systemNotifications !== false)
})

// Keep the OS window/taskbar caption in the active language (index.html holds the zh default
// so the very first paint before settings load is already Chinese). A detached window names the
// page it holds instead, since several of them can be open at once.
watchEffect(() => {
  document.title = isPopout.value ? popoutPage.value?.name || popoutPageId : t('app.title')
})

// The title-bar button is a pure day/night switch: it pins the opposite of what
// is currently shown (including when in 'auto'), never cycling back to auto.
function quickThemeToggle(): void {
  const next = isDark.value ? 'light' : 'dark'
  userPinnedTheme = true
  applyTheme(next)
  settingsStore.patch({ theme: next }).catch(() => undefined)
}

/** Flip the shell layout (classic ⇄ 效率) and persist it; the change is instant and reversible. */
function toggleLayoutMode(): void {
  const current = settingsStore.settings.layoutMode ?? 'classic'
  const next = current === 'im' ? 'classic' : 'im'
  activePanel.value = null
  settingsStore.patch({ layoutMode: next }).catch(() => undefined)
}

async function toggleDevTools(): Promise<void> {
  await window.container.toggleDevTools().catch(() => undefined)
}

/**
 * C1: the effective shortcut map — stored overrides over the shipped defaults. An action bound
 * to '' is deliberately unbound (the recorder clears a binding that way), so `??` not `||`.
 */
const keybindings = computed<Record<KeybindingAction, string>>(() => {
  const stored = settingsStore.settings.keybindings || {}
  const out = { ...DEFAULT_KEYBINDINGS }
  for (const action of KEYBINDING_ACTIONS) {
    const v = stored[action]
    if (typeof v === 'string') out[action] = v
  }
  return out
})

/**
 * Palette hint for a rebindable action: the *effective* shortcut, not the shipped one, so the
 * list stays truthful after the user edits 快捷键. '' means deliberately unbound → no hint.
 */
function keyHint(action: KeybindingAction): string | undefined {
  const text = formatAccelerator(keybindings.value[action])
  return text ? t('palette.hintKey', { key: text }) : undefined
}

/**
 * Run one shortcut action. Also the entry point for a key pressed *inside* a hosted page: the main
 * process matches the same bindings on the guest's before-input-event and forwards the action, so
 * both routes land here and behave identically.
 */
function runAction(action: KeybindingAction): void {
  // A detached page window has no palette, drawer or panels to close — only devtools carries over.
  if (isPopout.value && action !== 'devtools') return
  switch (action) {
    case 'palette':
      paletteOpen.value = !paletteOpen.value
      break
    case 'devtools':
      void toggleDevTools()
      break
    case 'terminal':
      openTerminalDrawer()
      break
    case 'closePanel':
      if (activePanel.value) activePanel.value = null
      break
    case 'popoutCurrent':
      void popoutCurrentPage()
      break
    case 'eventsTimeline':
      openHelpTab('events')
      break
  }
}

/** Open (or focus) the help panel on a given vertical tab. */
function openHelpTab(tab: string): void {
  panelTab.value = tab
  activePanel.value = 'help'
}

/**
 * C2: hand the page to the main process, which opens (or focuses) its own window. Every kind works
 * now: a hosted page keeps its URL, an external one (page or saved 外部站点) just hosts its
 * address, and a CLI page gets a second, independent run of its command.
 */
async function popoutPageIdAction(id: string): Promise<void> {
  // 双屏模式 owns the whole content area: pulling a page out of a layout the user just assembled
  // is not what the mode means, so the palette command and the shortcut refuse it here too (the
  // top-bar button is merely disabled up front). 页面管理 / 应用 panels are a separate context.
  if (dualStore.on) {
    ElMessage.warning(t('pageMgr.popoutInDual'))
    return
  }
  const page = pagesStore.pages.find((p) => p.id === id)
  // A saved site is not a page at all — the main process resolves it from settings, so only an id
  // that means nothing here (a site deleted since the list was drawn) is refused.
  const isSite = !page && settingsStore.settings.externalSites.some((s) => s.id === id)
  if (!page && !isSite) {
    ElMessage.warning(t('pageMgr.popoutDisabled'))
    return
  }
  try {
    const res = await window.container.openPageWindow?.(id)
    if (res && !res.ok) ElMessage.error(res.error || t('common.unknownError'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

function popoutCurrentPage(): Promise<void> {
  const id = activePageId.value
  if (!id) return Promise.resolve()
  return popoutPageIdAction(id)
}

/* ---- D2: AI assistant aggregation ---- */
/** First hosted page of a managed agent kind, started on demand by openPage(). */
function agentPage(kind: 'openclaw' | 'dsh'): PageState | undefined {
  return pagesStore.pages.find((p) => p.kind === kind && !p.external)
}

async function askAgent(kind: 'openclaw' | 'dsh'): Promise<void> {
  const page = agentPage(kind)
  if (!page) {
    ElMessage.warning(t('app.askAiNoTarget'))
    return
  }
  await openPage(page.id)
}

/** Copy the active page's identity + its last log lines, then jump to OpenClaw to paste. */
async function askWithContext(): Promise<void> {
  const id = activePageId.value
  const page = pagesStore.pages.find((p) => p.id === id)
  let tail: string[] = []
  if (page && !page.external) {
    tail = await pagesStore.logs(page.id).catch(() => [])
  }
  const text = t('app.askAiContext', {
    name: page?.name || id || t('app.selectPage'),
    url: (page ? pageUrl(page) : '') || '-',
    logs: tail.slice(-20).join('\n') || '-'
  })
  await askAiWith(text)
}

/** MenuBar peels its drop list on the same Esc keydown (document bubble, before us). */
function onKeydown(ev: KeyboardEvent): void {
  if (ev.repeat || (ev.ctrlKey && ev.altKey)) return
  const pressed = {
    key: ev.key,
    code: ev.code,
    ctrl: ev.ctrlKey,
    shift: ev.shiftKey,
    alt: ev.altKey,
    meta: ev.metaKey
  }
  const map = keybindings.value
  const hit = KEYBINDING_ACTIONS.find((action) => matchesAccelerator(map[action], pressed))
  if (!hit) return
  // Esc is the one binding the hosted page must keep when no panel is open, and the palette
  // owns its own Escape handling — both are the "nothing of ours to do" case.
  if (hit === 'closePanel' && (!activePanel.value || paletteOpen.value)) return
  ev.preventDefault()
  runAction(hit)
}

let disposeNativeTheme: (() => void) | null = null
let disposeMaximized: (() => void) | null = null
let disposeOpenTerminal: (() => void) | null = null
let disposeQuitConfirm: (() => void) | null = null
let disposeHotkey: (() => void) | null = null
let quitDialogOpen = false

/**
 * C2: point this window's single webview at the page it was detached for. Started on demand —
 * a pop-out for a page that is down shows the 启动该页面 affordance rather than an error.
 */
async function initPopout(): Promise<void> {
  const page = popoutPage.value
  if (!page) return
  activePageId.value = page.id
  // A CLI page: the full-surface terminal mounts off activePageId and starts its own session, so
  // a detached CLI window is a second, independent run of that command — the main window's keeps
  // running untouched.
  if (page.kind === 'terminal') return
  // External (a page declared so, or a saved 外部站点): aim the one webview at its address.
  // embedOnly because this window *is* the embedded view — 设置 ▸ 提醒告警 sending external
  // addresses to the system browser must not bounce a detached page window out of itself.
  if (page.external) {
    previewExternalUrl(popoutUrl(page), page.id, true)
    return
  }
  if (page.status !== 'running') return
  showInWebview(page)
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  if (window.container) {
    disposeOpenTerminal = window.container.onOpenTerminalPage((id) => void openPage(id))
    // A container shortcut pressed inside a hosted page: main matched it and says what to run.
    disposeHotkey = window.container.onHotkey?.((sig) => runAction(sig.action))
    // D2: every "复制并问 AI" entry point hands the jump-to-agent step to this window.
    registerAskAiJump(() => askAgent('openclaw'))
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
  // A detached window stops here: it has already loaded language/theme and resolved its one page,
  // and needs neither the runtime guide probe, the default view, nor the update survey.
  if (isPopout.value) {
    await initPopout()
    return
  }
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
  disposeHotkey?.()
  unregisterAskAiJump()
})

watch(activePanel, (panel) => {
  if (panel === 'pages' || panel === 'settings') pagesStore.refresh().catch(() => undefined)
  // Install status can change from these panels (provision / upgrade) — keep the guide's probe
  // fresh. The Pages list badge no longer needs this: it reads `PageState.runtimeMissing`, which
  // the `pagesStore.refresh()` above re-fetches, so we skip the expensive async status IPC here.
  if (panel === 'dsh' || panel === 'openclaw' || panel === 'help')
    runtimes.refresh().catch(() => undefined)
  if (panel === 'help' && !updatesStore.results.length && !updatesStore.checking) {
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
/** Badge denominator: every page container installed — disabled rows included (they are
    still the app's pages, just parked) — while external addresses don't count (no process
    to start). Numerator is how many of them are running: 已启动/容器总数. */
const pageContainerCount = computed(() => pagesStore.installablePages.length)
/** The top-bar reload/devtools buttons act on the live webview; disable them on the market
    screen and while a CLI page owns the content area (the terminal has its own restart). */
const canOperate = computed(() => Boolean(webviewSrc.value) && !activeTerminalPage.value)

/* ---- 双屏 × 顶部前进/后退 ----
   Which pane the nav buttons aim at is decided by the mouse: HomeView flips
   `dualStore.activePane` on pane hover / guest focus, and the nav-state HomeView pushes up
   already describes that pane. An external address must sit on THAT pane for the buttons to
   show — hosted pages keep their own in-page navigation and stay button-free. */
/** The picker ids: `s-<siteId>` is a saved external site, `p-<pageId>` a hosted page. */
const secondaryHostsExternal = computed(() => {
  if (isPopout.value || !dualStore.on || !dualStore.showSecondary) return false
  const id = dualStore.secId
  if (!id || !dualStore.secondaryUrl) return false
  if (id.startsWith('s-')) return true
  return Boolean(pagesStore.pages.find((p) => `p-${p.id}` === id)?.external)
})
const showNav = computed(() =>
  dualStore.activePane === 'secondary'
    ? secondaryHostsExternal.value
    : externalView.value && canOperate.value
)
</script>

<template>
  <el-config-provider :locale="currentEpLocale" :message="messageConfig">
    <div class="shell" :class="{ 'layout-im': isIm }">
      <!-- Ambient aurora: fixed, non-interactive; glass chrome bleeds it through. -->
      <div class="aurora" aria-hidden="true">
        <span class="blob b1" />
        <span class="blob b2" />
        <span class="blob b3" />
      </div>

      <!-- Window-edge flowing light: a full-perimeter base ring plus a bright comet that traces
           the whole viewport border at constant speed. SVG stroke-dash (not a conic sweep) so the
           short vertical edges are covered just as evenly as the long ones (see `.win-edge` in glass.css). -->
      <svg class="win-edge" aria-hidden="true">
        <rect class="we-base" />
        <rect class="we-comet" pathLength="100" />
      </svg>

      <MenuBar
        v-if="!isPopout"
        :current="activePanel"
        :im-mode="isIm"
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
        :show-nav="showNav"
        :terminal-mode="Boolean(activeTerminalPage)"
        :terminal-running="activeTerminalPage?.status === 'running'"
        :external-sites="settingsStore.settings.externalSites"
        @open="activePanel = $event"
        @open-panel="(p: string) => (activePanel = p)"
        @toggle-theme="quickThemeToggle"
        @select-page="openPage"
        @start-page="startPage"
        @open-terminal="(id: string) => openPage(id)"
        @popout-page="popoutPageIdAction"
        @preview-site="previewSiteById"
        @reload="reload"
        @go-back="webviewGoBack"
        @go-forward="webviewGoForward"
        @detach="detachCurrentPage"
        @restart-terminal="restartActiveCli"
        @stop-terminal="stopActiveCli"
        @restart-app="restartContainer"
      >
        <template #settings>
          <MenuPanelContent
            v-if="activePanel === 'settings'"
            panel="settings"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
            :initial-tab="panelTab ?? undefined"
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
            :total-count="pageContainerCount"
            @close="activePanel = null"
          />
        </template>
        <template #external>
          <MenuPanelContent
            v-if="activePanel === 'external'"
            panel="external"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
            @preview-site="previewExternalUrl"
          />
        </template>
        <template #dsh>
          <MenuPanelContent
            v-if="activePanel === 'dsh'"
            panel="dsh"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
          />
        </template>
        <template #openclaw>
          <MenuPanelContent
            v-if="activePanel === 'openclaw'"
            panel="openclaw"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
          />
        </template>
        <template #mcp>
          <MenuPanelContent
            v-if="activePanel === 'mcp'"
            panel="mcp"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
          />
        </template>
        <template #workspace>
          <MenuPanelContent
            v-if="activePanel === 'workspace'"
            panel="workspace"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
          />
        </template>
        <template #board>
          <MenuPanelContent
            v-if="activePanel === 'board'"
            panel="board"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
          />
        </template>
        <template #app="{ pageId }">
          <MenuPanelContent
            v-if="pageId && activePanel === appPanelKey(pageId)"
            :panel="appPanelKey(pageId)"
            :runtime="pagesStore.nodeInfo"
            :running-count="runningCount"
            :total-count="pageContainerCount"
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
            :total-count="pageContainerCount"
            :initial-tab="panelTab ?? undefined"
            @check-updates="updatesStore.check(true)"
          />
        </template>
      </MenuBar>

      <!-- C2: a detached window swaps the whole menu bar for a 28px caption strip. The strip is
           the drag region (the window is frameless); its controls opt back out of dragging. -->
      <div v-if="isPopout" class="popout-bar">
        <span class="popout-dot" :class="`s-${popoutPage?.status || 'stopped'}`" />
        <span class="popout-title">{{ popoutPage?.name || popoutPageId }}</span>
        <span v-if="popoutSub" class="popout-sub">{{ popoutSub }}</span>
        <span class="popout-spacer" />
        <button v-if="popoutStartable" class="popout-btn" @click="startPopoutPage">
          {{ t('app.popoutStart') }}
        </button>
        <!-- Right-end window controls: same frameless contract as the main shell's title bar. They
             hug the popout's right edge, so `bottom-end` grows each tip leftward instead of spilling
             past the viewport (which would raise a horizontal scrollbar). -->
        <div class="popout-win">
          <el-tooltip
            :content="t('app.popoutMinimize')"
            placement="bottom-end"
            popper-class="dsh-tip-popper"
          >
            <button class="popout-win-btn" :aria-label="t('app.popoutMinimize')" @click="minimizePopout">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>
          </el-tooltip>
          <el-tooltip
            :content="isMaximized ? t('app.popoutRestore') : t('app.popoutMaximize')"
            placement="bottom-end"
            popper-class="dsh-tip-popper"
          >
            <button
              class="popout-win-btn"
              :aria-label="isMaximized ? t('app.popoutRestore') : t('app.popoutMaximize')"
              @click="toggleMaximizePopout"
            >
              <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect
                  x="1.5"
                  y="1.5"
                  width="7"
                  height="7"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
              </svg>
              <svg v-else width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect
                  x="1"
                  y="3"
                  width="6"
                  height="6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
                <path d="M3 3 V1 H9 V7 H7" fill="none" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>
          </el-tooltip>
          <el-tooltip
            :content="t('app.popoutClose')"
            placement="bottom-end"
            popper-class="dsh-tip-popper"
          >
            <button
              class="popout-win-btn popout-win-close"
              :aria-label="t('app.popoutClose')"
              @click="closePopout"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>
          </el-tooltip>
        </div>
      </div>

      <div class="shell-body">
        <!-- IM layout: the left rail + docked sidebar replace the menu bar's group triggers and
             the centered floating panel. It shares `activePanel` with the compact title bar, so a
             rail click and the switcher stay in sync. Classic mode renders no rail. -->
        <QQShell
          v-if="isIm"
          :pages="pagesStore.pages"
          :current="activePanel"
          :runtime="pagesStore.nodeInfo"
          :running-count="runningCount"
          :total-count="pageContainerCount"
          :initial-tab="panelTab"
          :outdated-count="updatesStore.outdated.length"
          :is-dark="isDark"
          @open-panel="activePanel = $event"
          @toggle-theme="quickThemeToggle"
          @open-palette="paletteOpen = true"
          @apply-theme="applyTheme"
          @preview-site="previewExternalUrl"
          @check-updates="updatesStore.check(true)"
          @open-page="openPage"
          @open-terminal="openPage"
          @close="activePanel = null"
        />
        <main class="content">
          <div class="content-main">
            <!-- Workbench stays mounted for the whole session; only panels open and close above it. -->
            <!-- One resident CLI surface per opened page: v-show flips visibility so a running
                 CLI is never unmounted (and its PTY reloaded) by a page switch. -->
            <CliTerminalView
              v-for="id in cliTermSessions"
              :key="id"
              :ref="(el) => setCliTermRef(id, el)"
              v-show="id === activePageId"
              :page="pagesStore.pages.find((p) => p.id === id) || null"
              :active="id === activePageId"
              @exit="backToWorkbench"
              @idle-stop="stopPage"
            />
            <HomeView
              ref="homeRef"
              :sessions="webviewSessions"
              :active-id="activeSessionId"
              :loading="webviewLoading"
              :repaint-hosted-first="settingsStore.settings.persistentServices === true"
              :starting-text="startingText"
              :phase-text="bootPhaseText"
              :logs="bootLogs"
              :slow="bootSlow"
              :elapsed-text="bootElapsedText"
              :market-active="!isPopout && !webviewActive && !activeTerminalPage"
              :external-view="externalView"
              :secondary-choices="secondaryChoices"
              @nav-state="onNavState"
              @guest-stop-loading="webviewLoading = false"
              @install-pages="activePanel = 'pages'"
              @open-panel="(k: string) => (activePanel = k)"
              @cancel-start="cancelStart"
            />
            <!-- IM click-away catcher (see .qq-clickaway): a page is an out-of-process <webview>
                 that swallows host pointerdown, so once it fills the content area a click there
                 never reaches QQShell's document listener and the rail bubble lingers. This
                 transparent host layer, sitting above the webview but below the bubble, turns a
                 content click into a dismiss; it stops at .content-main so the rail, title bar
                 and window controls stay clickable. -->
            <div
              v-if="isIm && activePanel"
              class="qq-clickaway"
              @pointerdown="activePanel = null"
            />
          </div>
          <!-- Plain-browser dev (vite URL without the preload bridge) has no PTY IPC.
               v-show, not v-if: unmounting drops the global onPtyData subscription, which
               would silently kill output for every embedded shell terminal tab.
               Embedded in .content (a flow sibling of .content-main), NOT a window-wide fixed
               overlay: the terminal now shares the page container and pushes the webview up. -->
          <TerminalDrawer v-if="hasBridge && !isPopout" v-show="store.open" />
        </main>
      </div>

      <CommandPalette v-if="!isPopout" v-model="paletteOpen" :commands="commands" :async-search="deepSearch" />

      <!-- First-run dependency gate: a blocking overlay until the built-in Node is present. -->
      <SetupGate v-if="!isPopout" />
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
  /* Column stack: the page area (.content-main) fills, the embedded terminal dock sits
     under it as a real flow sibling — so opening the terminal shrinks the webview instead
     of floating over it. Previously the dock was a window-wide `position: fixed` overlay. */
  display: flex;
  flex-direction: column;
  /* CLI 终端页是 .content-main 内的绝对定位覆盖层；子层自带滚动，这里禁掉文档溢出，
     避免 workbench/终端叠加时出现窗口级滚动条。 */
  overflow: hidden;
  /* Lift the webview above the fixed aurora (z-index:0) so the ambient blobs never
     tint the embedded page; glass chrome (menubar / panels) still sits above it. */
  position: relative;
  z-index: 1;
}

/* The page region inside .content: the former full-height container, now sharing the
   column with the terminal dock. Holds the absolute CLI overlay + the workbench. */
.content-main {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* IM-mode click-away layer: transparent, above the webview / market / terminal layers (z ≤ 20)
   but below the floating bubble (.qq-pop-wrap z 70). It only fills .content-main, so a click on
   a full-bleed page still dismisses the rail bubble while the rail and window chrome stay live. */
.qq-clickaway {
  position: absolute;
  inset: 0;
  z-index: 40;
}

/* Body row under the title bar. Classic mode: only .content (fills width). IM mode: the QQShell
   rail + sidebar dock to the left and .content takes the rest, so the webview reflows narrower. */
.shell-body {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.shell-body > .content {
  min-width: 0;
}

/* The embedded page owns the whole content area — flush to every window edge. */
.content :deep(.workbench) {
  border-radius: 0;
  border: none;
  box-shadow: none;
}

/* ---- C2: detached page window caption ---- */
.popout-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 28px;
  padding: 0 6px 0 10px;
  font-size: 12px;
  color: var(--text-dim);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  /* The window is frameless, so this strip is its only drag handle. */
  -webkit-app-region: drag;
  user-select: none;
}

.popout-bar .popout-btn {
  -webkit-app-region: no-drag;
}

.popout-title {
  overflow: hidden;
  font-weight: 600;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popout-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popout-spacer {
  flex: 1;
}

.popout-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-dim);
}
.popout-dot.s-running {
  background: var(--ok);
}
.popout-dot.s-starting {
  background: var(--warn);
}
.popout-dot.s-error {
  background: var(--err);
}

.popout-btn {
  flex: none;
  padding: 2px 8px;
  font: inherit;
  color: var(--text-dim);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 9999px;
}
.popout-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

/* Window controls flush to the strip's right edge: flat square buttons, no border. */
.popout-win {
  display: flex;
  flex: none;
  align-items: stretch;
  height: 100%;
  margin-right: -6px;
}

.popout-win-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 100%;
  color: var(--text-dim);
  cursor: pointer;
  background: none;
  border: none;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  /* Inside the drag strip each control must opt back out of window dragging. */
  -webkit-app-region: no-drag;
}
/* Mirror WindowControls: the frosted bar made `--surface-2` an almost-invisible hover for
   minimize/maximize, so use a theme-adaptive `--text` overlay (close keeps its red below). */
.popout-win-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 14%, transparent);
}
.popout-win-close:hover {
  color: #fff;
  background: var(--err);
}
</style>
