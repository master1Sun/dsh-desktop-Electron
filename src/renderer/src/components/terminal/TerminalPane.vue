<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useSettingsStore } from '@renderer/stores/settings'
import { useIsLight } from '@renderer/composables/useTheme'
import { TERMINAL_SCROLLBACK_DEFAULT, TERMINAL_SCROLLBACK_MAX } from '@shared/types'

/**
 * One xterm surface bound to a single session (one PTY). The drawer used to share a lone terminal
 * and repaint it per active tab; split panes need a real terminal each, so this owns the whole
 * xterm lifecycle for one `sessionId` and writes only its own stream.
 */
const props = defineProps<{ sessionId: string; active?: boolean }>()

const store = useTerminalStore()
const settingsStore = useSettingsStore()
const containerEl = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let disposeData: (() => void) | null = null
let lastCols = -1
let lastRows = -1
let replayed = false

function scrollbackLines(): number {
  const n = settingsStore.settings.terminalScrollback ?? TERMINAL_SCROLLBACK_DEFAULT
  return Math.max(
    1,
    Math.min(TERMINAL_SCROLLBACK_MAX, Math.round(n) || TERMINAL_SCROLLBACK_DEFAULT)
  )
}

const { isLight } = useIsLight()
/**
 * A full xterm theme per mode. Light mode can't just flip bg/fg: xterm's default 16-ANSI palette is
 * tuned for a dark screen, so its "white"/bright colors are near-invisible on white, and the default
 * cursor is too. We hand-pick a light palette (white-family mapped to dark grays) + a dark cursor so
 * input, output and the caret all read clearly on the white background.
 */
function terminalTheme(): Record<string, string> {
  return isLight.value
    ? {
        background: '#ffffff',
        foreground: '#1f2328',
        cursor: '#1f2328',
        cursorAccent: '#ffffff',
        selection: 'rgba(31, 35, 40, 0.2)',
        black: '#1f2328',
        red: '#c40202',
        green: '#0a7d33',
        yellow: '#9c6500',
        blue: '#0b53c4',
        magenta: '#9a1a8f',
        cyan: '#0f7a8a',
        white: '#5b6169',
        brightBlack: '#6e7781',
        brightRed: '#d43131',
        brightGreen: '#2f8f4f',
        brightYellow: '#b5842a',
        brightBlue: '#3b7ad6',
        brightMagenta: '#b1489f',
        brightCyan: '#3a97a8',
        brightWhite: '#1f2328'
      }
    : {
        background: '#000000',
        foreground: '#e8ecf3',
        cursor: '#e8ecf3',
        cursorAccent: '#000000',
        selection: 'rgba(255, 255, 255, 0.25)',
        black: '#000000',
        red: '#e05c5c',
        green: '#5fd787',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#d7dae0',
        brightBlack: '#6b7280',
        brightRed: '#ff7b72',
        brightGreen: '#7ee787',
        brightYellow: '#f0d69b',
        brightBlue: '#79b8ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#73d0dd',
        brightWhite: '#ffffff'
      }
}
function termBg(): string {
  return isLight.value ? '#ffffff' : '#000000'
}
// Paint the whole pane (incl. its padding and any strip below the last text row) with the terminal
// background, so a light theme never shows the dark dock through a partly-filled surface. Exposed
// as --term-bg so the deep rules below can also repaint xterm's own element (FitAddon leaves a
// sub-row gap at the bottom that otherwise shows xterm's default dark background).
const paneStyle = computed(() => ({ '--term-bg': termBg(), background: termBg() }))

/** The drawer injects these so its search bar can reach whichever pane is focused. */
const setActiveTerm = inject<(t: Terminal | null) => void>('term:setActive', () => undefined)
const clearActiveTerm = inject<(t: Terminal) => void>('term:clearActive', () => undefined)

function fitSurface(): void {
  if (!term || !fit) return
  // While the dock is hidden (minimized) or not laid out yet the container is 0x0; fitting then
  // would size the PTY to a degenerate grid and bake wrong wrapping in — skip until it has a box.
  const el = containerEl.value
  if (!el || el.clientWidth < 2 || el.clientHeight < 2) return
  try {
    fit.fit()
  } catch {
    return /* container not laid out yet */
  }
  // Only push a resize when the grid actually changed, and never a zero grid (a hairline pane).
  if (term.cols === lastCols && term.rows === lastRows) return
  if (term.cols <= 0 || term.rows <= 0) return
  lastCols = term.cols
  lastRows = term.rows
  window.container.ptyResize(props.sessionId, term.cols, term.rows).catch(() => undefined)
}

/**
 * Replay the session's buffered bytes exactly once, but only after the surface has a real
 * laid-out size (fit already applied). Writing the raw PTY stream at xterm's default 80 cols and
 * resizing afterwards leaves the shell's own line breaks baked in at the wrong width, which shows
 * up as wrapped / garbled content after a group re-mount or a minimize→restore. When the pane
 * mounts while the dock is still hidden, this defers to the ResizeObserver so the replay always
 * lands at the fitted width.
 */
function paintReplay(): void {
  if (replayed || !term) return
  const el = containerEl.value
  if (!el || el.clientWidth < 2 || el.clientHeight < 2) return
  replayed = true
  const s = store.sessionById(props.sessionId)
  if (s?.buffer) term.write(s.buffer)
}

function focusPane(): void {
  store.focusSession(props.sessionId)
  setActiveTerm(term)
  term?.focus()
}

function ensureTerm(): void {
  if (term || !containerEl.value) return
  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'Consolas, Menlo, "Cascadia Code", monospace',
    fontSize: 13,
    scrollback: scrollbackLines(),
    // SearchAddon's `decorations` (required for onDidChangeResults / match counts in 0.16) rely on
    // xterm's proposed marker/decoration API; without this flag findNext throws
    // "You must set the allowProposedApi option to true to use proposed API" and search shows 0.
    allowProposedApi: true,
    theme: terminalTheme()
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(containerEl.value)
  term.onData((data) => {
    window.container.ptyWrite(props.sessionId, data).catch(() => undefined)
  })
  // This pane paints only its own stream; the store buffers every stream globally.
  disposeData = window.container.onPtyData(({ id, data }) => {
    if (id === props.sessionId) term?.write(data)
  })
  resizeObserver = new ResizeObserver(() => {
    fitSurface()
    paintReplay()
  })
  resizeObserver.observe(containerEl.value)
  // Fit to the real laid-out size BEFORE replaying buffered bytes (see paintReplay); if the dock is
  // hidden at mount time both no-op here and the ResizeObserver re-runs them once it becomes visible.
  fitSurface()
  paintReplay()
  if (props.active) {
    term.focus()
    setActiveTerm(term)
  }
}

onMounted(() => {
  void nextTick(ensureTerm)
})

onBeforeUnmount(() => {
  // Only drop the search bar's reference if it still points at THIS term, so a disposed terminal is
  // never left as `activeTerm` (which would crash search) and a freshly-mounted next pane isn't wiped.
  if (term) clearActiveTerm(term)
  disposeData?.()
  resizeObserver?.disconnect()
  term?.dispose()
  term = null
})

// Becoming the focused pane: hand the search bar our term and grab keyboard focus.
watch(
  () => props.active,
  (a) => {
    if (!a || !term) return
    setActiveTerm(term)
    term.focus()
  }
)

// Re-apply colors when the shell chrome flips between light/dark.
watch(isLight, () => {
  if (!term) return
  term.options.theme = terminalTheme()
})

defineExpose({ getTerm: () => term })
</script>

<template>
  <div class="term-pane" :class="{ active }" :style="paneStyle" @pointerdown="focusPane">
    <div ref="containerEl" class="term-pane-surface" />
  </div>
</template>

<style scoped>
.term-pane {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 2px 4px;
  box-sizing: border-box;
  overflow: hidden;
}
/* A thin accent ring marks the focused pane so splits read clearly. */
.term-pane.active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: 4px;
}
.term-pane-surface {
  width: 100%;
  height: 100%;
}
.term-pane :deep(.xterm),
.term-pane :deep(.xterm-screen),
.term-pane :deep(.xterm-viewport) {
  height: 100%;
}
/* FitAddon can't fill a fractional last row: repaint xterm's own element + screen + viewport with
   the theme bg so no dark strip peeks out under the grid in light mode. */
.term-pane :deep(.xterm),
.term-pane :deep(.xterm-viewport),
.term-pane :deep(.xterm-screen) {
  background-color: var(--term-bg, transparent);
}
</style>
