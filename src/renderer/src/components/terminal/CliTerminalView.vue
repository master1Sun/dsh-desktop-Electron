<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { PageState } from '@renderer/stores/pages'
import { useSettingsStore } from '@renderer/stores/settings'
import { useIsLight } from '@renderer/composables/useTheme'
import {
  TERMINAL_SCROLLBACK_DEFAULT,
  TERMINAL_SCROLLBACK_MAX,
  CLI_IDLE_STOP_DEFAULT_MINUTES
} from '@shared/types'
import TerminalSearchBar from './TerminalSearchBar.vue'
import { useTerminalClipboard } from './clipboard'
import { t } from '@renderer/i18n'

/**
 * `active` marks the surface currently on screen. App keeps one instance per opened CLI page
 * mounted (v-show flips visibility), so a running CLI must survive a page switch untouched — the
 * watch below distinguishes “revealed while still running” (refit + focus only) from “revealed
 * after it stopped/exited” (auto-start on switch), which is what makes the terminal resident.
 */
const props = defineProps<{ page: PageState | null; active?: boolean }>()
const emit = defineEmits<{ exit: []; idleStop: [id: string] }>()
const settingsStore = useSettingsStore()

/** Clamp the persisted scrollback setting into the range xterm may safely hold. */
function scrollbackLines(): number {
  const n = settingsStore.settings.terminalScrollback ?? TERMINAL_SCROLLBACK_DEFAULT
  return Math.max(1, Math.min(TERMINAL_SCROLLBACK_MAX, Math.round(n) || TERMINAL_SCROLLBACK_DEFAULT))
}
/** The user's full scrollback budget, captured once: while hidden the surface runs a trimmed one. */
const userScrollback = scrollbackLines()

const containerEl = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let disposeData: (() => void) | null = null
let disposeExit: (() => void) | null = null
/** Last grid size pushed to the PTY — see fitActive(). */
let lastCols = -1
let lastRows = -1

const ptyId = ref<string | null>(null)
const state = ref<'idle' | 'starting' | 'running' | 'exited'>('idle')
const exitCode = ref<number | null>(null)
const errorText = ref('')

/** Overlay copy for the `exited` state: an explicit error wins, else the localized exit notice. */
const exitedText = computed(() => {
  if (errorText.value) return errorText.value
  const name = props.page?.name || t('cliView.process')
  const code = exitCode.value
  return t('cliView.exited', { name }) + (code !== null ? t('cliView.exitCode', { code }) : '')
})

/** Bytes waiting to be painted. A full-screen TUI repaints in many small chunks;
    writing each one synchronously makes xterm re-render dozens of times per frame,
    which shows up as flicker and eventually wedges the renderer. Batch them into one
    write per animation frame instead. */
let pendingWrite = ''
let writeScheduled = false

function flushWrite(): void {
  writeScheduled = false
  if (!pendingWrite || !term) return
  const data = pendingWrite
  pendingWrite = ''
  term.write(data)
}

function queueWrite(data: string): void {
  if (!term) return
  pendingWrite += data
  // A v-show-hidden surface never gets an intersection, so rAF callbacks are suppressed there —
  // scheduling one would leak every byte into pendingWrite forever. Background sessions instead
  // trim their own backlog (the full stream still lands in the main-process page log), and the
  // next visible chunk reschedules the flush.
  if (hidden) {
    if (pendingWrite.length > HIDDEN_WRITE_MAX)
      pendingWrite = pendingWrite.slice(-Math.floor(HIDDEN_WRITE_MAX / 2))
    return
  }
  if (writeScheduled) return
  writeScheduled = true
  requestAnimationFrame(flushWrite)
}

/** 终端配色跟随应用白天/黑夜主题（与内嵌终端抽屉一致）。isLight 是 html.light 类的
    响应式镜像：直接 watch DOM 属性永远不会触发，主题切换靠它驱动下面的 watch。
    必须显式给 cursor/cursorAccent：xterm 默认光标是浅色，在白底上几乎看不见。 */
const { isLight } = useIsLight()
function themeColors(): {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selection: string
} {
  return isLight.value
    ? {
        background: '#ffffff',
        foreground: '#1f2328',
        cursor: '#1f2328',
        cursorAccent: '#ffffff',
        selection: 'rgba(31, 35, 40, 0.2)'
      }
    : {
        background: '#000000',
        foreground: '#e8ecf3',
        cursor: '#e8ecf3',
        cursorAccent: '#000000',
        selection: 'rgba(255, 255, 255, 0.25)'
      }
}

/* Copy / paste + right-click menu, shared with the split-pane terminal (see clipboard.ts). */
const {
  onTerminalKey,
  menu,
  menuHasSel,
  openMenu,
  closeMenu,
  menuCopy,
  menuPaste,
  menuSelectAll
} = useTerminalClipboard(() => term)

function ensureTerm(): void {
  if (term || !containerEl.value) return
  term = new Terminal({
    // Full-screen TUIs position the cursor themselves. Translating every bare \n
    // into \r\n makes each repaint land one line lower, so the screen scrolls/
    // flickers continuously until the renderer stalls.
    convertEol: false,
    cursorBlink: true,
    fontFamily: 'Consolas, Menlo, "Cascadia Code", monospace',
    fontSize: 13,
    scrollback: scrollbackLines(),
    theme: themeColors()
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(containerEl.value)
  // Own the copy/paste chords before xterm/PTY turn Ctrl+C into SIGINT (see clipboard.ts).
  term.attachCustomKeyEventHandler(onTerminalKey)
  term.onData((data) => {
    if (ptyId.value) window.container.ptyWrite(ptyId.value, data).catch(() => undefined)
  })
  resizeObserver = new ResizeObserver(() => fitActive())
  resizeObserver.observe(containerEl.value)
}

function fitActive(): void {
  if (!term || !fit || !ptyId.value) return
  try {
    fit.fit()
    // Only push a resize when the grid actually changed: a TUI repaints on every
    // SIGWINCH, so redundant resizes turn into an endless repaint loop.
    if (term.cols === lastCols && term.rows === lastRows) return
    lastCols = term.cols
    lastRows = term.rows
    window.container.ptyResize(ptyId.value, term.cols, term.rows).catch(() => undefined)
  } catch {
    /* container not laid out yet */
  }
}

/** Guards against overlapping runs: a page refresh while one is starting would
    otherwise spawn a second PTY and reset the surface mid-paint (flicker). */
let runInFlight = false

async function run(page: PageState): Promise<void> {
  if (runInFlight) return
  runInFlight = true
  try {
    stopPty()
    state.value = 'starting'
    errorText.value = ''
    exitCode.value = null
    await nextTick()
    ensureTerm()
    term?.reset()
    lastCols = -1
    lastRows = -1
    const res = await window.container.pageRunSpec(page.id)
    if (!res.ok) throw new Error(res.error || t('cliView.noConfig'))
    const spec = res.data as { command: string; env?: Record<string, string> } | null
    if (!spec?.command) throw new Error(t('cliView.missingCommand', { name: page.name }))
    const start = await window.container.ptyStart(page.id, spec)
    if (!start.ok) throw new Error(start.error || t('common.terminalStartFail'))
    const info = start.data as { id: string }
    ptyId.value = info.id
    state.value = 'running'
    markActivity()
    if (hidden) armIdle()
    disposeData = window.container.onPtyData(({ id, data }) => {
      if (id !== ptyId.value) return
      markActivity()
      queueWrite(data)
    })
    disposeExit = window.container.onPtyExit(({ id, code }) => {
      if (id !== ptyId.value) return
      // Paint whatever arrived with the exit before covering the surface.
      flushWrite()
      state.value = 'exited'
      exitCode.value = code
      cleanupListeners()
    })
    fitActive()
    term?.focus()
  } catch (err) {
    state.value = 'exited'
    errorText.value = (err as Error).message
  } finally {
    runInFlight = false
  }
}

function cleanupListeners(): void {
  disposeData?.()
  disposeExit?.()
  disposeData = null
  disposeExit = null
  disarmIdle()
}

function stopPty(): void {
  cleanupListeners()
  pendingWrite = ''
  if (ptyId.value) window.container.ptyKill(ptyId.value).catch(() => undefined)
  ptyId.value = null
}

/* ---- hidden-session upkeep: idle auto-stop + trimmed buffers --------------------------------
   A resident CLI nobody looks at keeps its PTY (and its TUI repaint loop) alive forever. Two
   guards bound the cost: while off-screen the xterm scrollback runs trimmed (restored on reveal),
   and a session with no output for cliIdleStopMinutes asks App to stop the page — the same
   explicit-stop path the switcher uses, so the registry's traffic light stays in sync. Only
   PTY output and local keystrokes count as activity: a “stuck” agent idling into a stop is the
   accepted trade-off (switching back auto-starts a fresh run); 0 disables the guard. */
const IDLE_TICK_MS = 5_000
/** Hard ceiling on bytes a hidden surface may queue before its backlog is trimmed. */
const HIDDEN_WRITE_MAX = 128 * 1024
let hidden = false
let lastActivityAt = Date.now()
let idleTimer: ReturnType<typeof setInterval> | null = null

function markActivity(): void {
  lastActivityAt = Date.now()
}

/** 0 = the guard is off (setting 0 / unset fallback). */
function idleBudgetMs(): number {
  const min = settingsStore.settings.cliIdleStopMinutes ?? CLI_IDLE_STOP_DEFAULT_MINUTES
  return Math.max(0, Math.round(min) || 0) * 60_000
}

function disarmIdle(): void {
  if (idleTimer !== null) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}

function armIdle(): void {
  disarmIdle()
  if (idleBudgetMs() <= 0) return
  idleTimer = setInterval(onIdleTick, IDLE_TICK_MS)
}

function onIdleTick(): void {
  if (!hidden || state.value !== 'running' || !props.page) return disarmIdle()
  if (Date.now() - lastActivityAt >= idleBudgetMs()) emit('idleStop', props.page.id)
}

/** Cap the surface's retained history to `cap` lines. xterm only re-reads the scrollback option
    (and trims the existing backlog) inside resize(), so lower it then force a same-grid resize to
    actually reclaim the memory; a full-screen TUI on the alt buffer has no scrollback to trim and
    is a no-op. Wrapped defensively so a pending-layout/alt-screen miss just retains memory. */
function applyBufferCap(cap: number): void {
  if (!term) return
  try {
    term.options.scrollback = Math.max(1, cap)
    term.resize(term.cols, term.rows)
  } catch {
    /* buffer not laid out yet — the reveal path restores the full budget regardless */
  }
}

watch(
  () => props.active,
  (on) => {
    hidden = on === false
    if (hidden) {
      // The idle budget restarts from the moment the surface leaves the screen.
      markActivity()
      armIdle()
      if (state.value === 'running' || state.value === 'starting')
        applyBufferCap(Math.min(500, Math.floor(userScrollback / 8)))
      return
    }
    if (on) {
      disarmIdle()
      applyBufferCap(userScrollback)
      // The queue a hidden surface kept now paints in one batch. rAF may never have fired while
      // hidden, so flush synchronously instead of trusting the scheduled callback.
      if (pendingWrite) flushWrite()
    }
  },
  { immediate: true }
)

onBeforeUnmount(disarmIdle)

/**
 * Leave the CLI terminal and give the user back the normal workbench. This only hides the surface
 * (App flips `active` off): the CLI keeps running as a resident session, so an explicit stop from
 * the switcher / palette / toolbar is the only thing that ends the process.
 */
function leave(): void {
  emit('exit')
}

defineExpose({ restart: () => props.page && run(props.page) })

watch(
  () => props.page?.id,
  (id) => {
    if (id && props.page) run(props.page)
    else stopPty()
  },
  { immediate: true }
)

/* Revealed again after being hidden: keep a live PTY exactly as it was (just re-fit and focus),
   but auto-start one whose process already ended — a page switch back to a stopped CLI starts it. */
watch(
  () => props.active,
  (on) => {
    if (!on) return
    if (state.value === 'running' || state.value === 'starting') {
      nextTick(() => {
        fitActive()
        term?.focus()
      })
      return
    }
    if (props.page) void run(props.page)
  }
)

watch(
  isLight,
  () => {
    if (!term) return
    term.options.theme = { ...term.options.theme, ...themeColors() }
  }
)

onBeforeUnmount(stopPty)
</script>

<template>
  <div class="cli-term" @contextmenu="openMenu">
    <div ref="containerEl" class="cli-term-surface" />
    <TerminalSearchBar :get-term="() => term" />
    <div v-if="state === 'starting'" class="cli-term-overlay">
      <span class="status-dot starting" />
      <span class="neon">{{ t('cliView.launching', { name: props.page?.name || t('cliView.process') }) }}</span>
    </div>
    <div v-else-if="state === 'exited'" class="cli-term-overlay">
      <div class="cli-term-exited">
        <p>{{ exitedText }}</p>
        <div class="cli-term-actions">
          <el-button
            type="primary"
            round
            :disabled="!props.page"
            @click="props.page && run(props.page)"
          >
            {{ t('cliView.rerun') }}
          </el-button>
          <el-button round @click="leave">{{ t('cliView.backToWorkbench') }}</el-button>
        </div>
      </div>
    </div>
    <!-- Electron has no native context menu; right-click opens our own copy/paste/select-all.
         Teleported to <body> so the card's overflow:hidden can't clip it. -->
    <Teleport to="body">
      <template v-if="menu">
        <div class="cli-term-menu-backdrop" @pointerdown="closeMenu" @contextmenu.prevent />
        <div class="cli-term-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
          <button class="ctm-row" :disabled="!menuHasSel" @click="menuCopy">
            <span>{{ t('terminal.copy') }}</span
            ><span class="ctm-hint">{{ t('terminal.copyHint') }}</span>
          </button>
          <button class="ctm-row" @click="menuPaste">
            <span>{{ t('terminal.paste') }}</span
            ><span class="ctm-hint">{{ t('terminal.pasteHint') }}</span>
          </button>
          <div class="ctm-sep"></div>
          <button class="ctm-row" @click="menuSelectAll">
            <span>{{ t('terminal.selectAll') }}</span>
          </button>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<style scoped>
.cli-term {
  /* 覆盖层而非流内块：.content 里 HomeView(.workbench, 100% 高) 常驻挂载，
     若终端也走文档流会与其上下堆叠成 200%，出现滚动条、下拉露出内置页面。
     绝对定位铺满内容区，z-index 压过 market-layer(10)；webview 保持挂载不销毁。 */
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  /* 卡片四周的留白层：暗色下 #121212，与卡片内的 xterm 黑(#000) 拉开对比，
     间距才能被看见。 */
  padding: 12px;
  background: var(--surface-2);
}

.cli-term-surface {
  flex: 1;
  min-width: 0;
  min-height: 0;
  /* 终端本体是一张带边框 + 圆角的卡片：fit() 按父元素 content-box（已扣除
     padding/border）排行数，所以卡片内边距与边框都成为内容与边缘的间距，
     底部最后一行不再紧贴窗口底边。 */
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  /* 卡片底色跟 xterm 主题底同色（themeColors：light=#fff / dark=#000），
     否则内边距那一圈会和终端白底/黑底对不上。 */
  background: #fff;
}

html.dark .cli-term-surface {
  background: #000;
}

/* xterm 的 .xterm-viewport 用原生 overflow-y: scroll，默认那条又宽又亮、
   还会压在卡片圆角上。收成细、半透明的悬浮式滞条，颜色沿用全局 thumb，
   与主题一致；轨道透明，不遮挡终端内容。 */
.cli-term-surface :deep(.xterm-viewport) {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--text-dim) 40%, transparent) transparent;
}
.cli-term-surface :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 8px;
}
.cli-term-surface :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: transparent;
}
.cli-term-surface :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: color-mix(in srgb, var(--text-dim) 35%, transparent);
  border: 2px solid transparent;
  border-radius: 8px;
  background-clip: content-box;
}
.cli-term-surface :deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: color-mix(in srgb, var(--text-dim) 60%, transparent);
  background-clip: content-box;
}

.cli-term-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 12px;
  color: var(--text-dim);
  /* Kept translucent: when a CLI aborts (bad config, missing dir) its own error is
     the only clue, and it is printed on the terminal underneath this overlay. */
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  z-index: 5;
}

.cli-term-exited {
  display: grid;
  justify-items: center;
  gap: 6px;
  text-align: center;
  font-size: 14px;
  padding: 18px 22px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  -webkit-backdrop-filter: blur(20px) saturate(130%);
  backdrop-filter: blur(20px) saturate(130%);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 14px;
  box-shadow: var(--shadow), 0 0 18px color-mix(in srgb, var(--accent) 22%, transparent);
}

.cli-term-exited p {
  margin: 0;
  color: var(--text);
  text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 22%, transparent);
}

.cli-term-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
/* Right-click copy/paste menu (teleported to <body>, so fixed to the viewport). */
.cli-term-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
}
.cli-term-menu {
  position: fixed;
  z-index: 3001;
  min-width: 168px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 10px;
  box-shadow: var(--shadow), 0 6px 22px rgba(0, 0, 0, 0.18);
  -webkit-backdrop-filter: blur(14px) saturate(130%);
  backdrop-filter: blur(14px) saturate(130%);
  user-select: none;
}
.ctm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
}
.ctm-row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.ctm-row:disabled {
  color: var(--text-dim);
  opacity: 0.55;
  cursor: default;
}
.ctm-hint {
  font-size: 11px;
  color: var(--text-dim);
}
.ctm-sep {
  height: 1px;
  margin: 3px 6px;
  background: var(--border);
}
</style>
