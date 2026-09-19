<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Close, Cpu, Refresh, ArrowUp, ArrowDown, Rank } from '@element-plus/icons-vue'
import { useTerminalStore } from '../stores/terminal'

const store = useTerminalStore()
const winEl = ref<HTMLElement | null>(null)
const containerEl = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let disposeData: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

// Floating-window geometry (bottom-right anchored via left/top once dragged).
const pos = ref({ x: 0, y: 0 }) // 0 = unset → CSS anchors to bottom-right corner
const size = ref({ w: 720, h: 460 })
const minimized = ref(false)
const drag = ref<'move' | 'e' | 's' | 'se' | null>(null)
let startPointer = { x: 0, y: 0 }
let startPos = { x: 0, y: 0 }
let startSize = { w: 0, h: 0 }

const MIN_W = 380
const MIN_H = 200
/** Collapsed drawer keeps exactly the title bar on screen (bar padding + ~24px content). */
const BAR_H = 37

const winStyle = (): Record<string, string> => {
  if (store.docked) {
    // Full-width strip flush under the title bar; collapsing slides it back up so
    // only the tab bar peeks out (mirrors the floating window's bottom collapse).
    const s: Record<string, string> = {
      width: 'auto',
      left: '0',
      right: '0',
      top: '38px',
      bottom: 'auto',
      height: `${size.value.h}px`,
      transform: minimized.value ? `translateY(-${size.value.h - BAR_H}px)` : ''
    }
    return s
  }
  // Height stays at full size even when minimized: the collapse is done by moving
  // the window down so only the title bar peeks out. Animating height to 0 would
  // hide the bar (overflow:hidden) and leave no way to expand again.
  const s: Record<string, string> = {
    width: `${size.value.w}px`,
    height: `${size.value.h}px`,
    transform: minimized.value ? `translateY(calc(100% - ${BAR_H}px))` : ''
  }
  if (pos.value.x || pos.value.y) {
    s.left = `${pos.value.x}px`
    s.top = `${pos.value.y}px`
    s.right = 'auto'
    s.bottom = 'auto'
  }
  return s
}

// Switching dock modes invalidates any dragged position.
watch(
  () => store.docked,
  () => {
    pos.value = { x: 0, y: 0 }
  }
)

function clampPos(): void {
  const maxY = window.innerHeight - BAR_H // keep the title bar reachable
  pos.value.x = Math.max(0, Math.min(pos.value.x, window.innerWidth - size.value.w))
  pos.value.y = Math.max(0, Math.min(pos.value.y, maxY))
}

function onPointerDown(e: PointerEvent, mode: 'move' | 'e' | 's' | 'se'): void {
  if (store.docked && mode !== 's') return
  if (minimized.value && mode === 'move') {
    minimized.value = false
    return
  }
  if (mode === 'move' && (e.target as HTMLElement).closest('button')) return
  // Materialize current on-screen position so we can move freely from the corner anchor.
  const rect = winEl.value?.getBoundingClientRect()
  // getBoundingClientRect reflects the collapse transform; subtract it back to the
  // un-transformed origin that winStyle's top/left refers to.
  if (rect) pos.value = { x: rect.left, y: rect.top + (minimized.value ? size.value.h - BAR_H : 0) }
  startPointer = { x: e.clientX, y: e.clientY }
  startPos = { ...pos.value }
  startSize = { ...size.value }
  drag.value = mode
  ;(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent): void {
  if (!drag.value) return
  const dx = e.clientX - startPointer.x
  const dy = e.clientY - startPointer.y
  if (drag.value === 'move') {
    pos.value = { x: startPos.x + dx, y: startPos.y + dy }
    clampPos()
  } else {
    if (drag.value === 'e' || drag.value === 'se') size.value.w = Math.max(MIN_W, startSize.w + dx)
    if (drag.value === 's' || drag.value === 'se') size.value.h = Math.max(MIN_H, startSize.h + dy)
  }
}

function onPointerUp(): void {
  drag.value = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  fitActive()
}

function themeColors(): { bg: string; fg: string } {
  const light = document.documentElement.classList.contains('light')
  return light ? { bg: '#ffffff', fg: '#1f2328' } : { bg: '#0f1420', fg: '#e6edf3' }
}

function ensureTerm(): void {
  if (term || !containerEl.value) return
  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'Consolas, Menlo, "Cascadia Code", monospace',
    fontSize: 13,
    scrollback: 5000,
    theme: { background: '#0f1420', foreground: '#e6edf3' }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(containerEl.value)
  term.onData((data) => {
    if (store.activeId) window.container.ptyWrite(store.activeId, data).catch(() => undefined)
  })
  // Only forward the active session's bytes into the single shared terminal surface.
  disposeData = window.container.onPtyData(({ id, data }) => {
    if (id === store.activeId) term?.write(data)
  })
  resizeObserver = new ResizeObserver(() => fitActive())
  resizeObserver.observe(containerEl.value)
}

function fitActive(): void {
  if (!term || !fit || minimized.value) return
  try {
    fit.fit()
    if (store.activeId)
      window.container.ptyResize(store.activeId, term.cols, term.rows).catch(() => undefined)
  } catch {
    /* container not laid out yet */
  }
}

/** Wipe the visible buffer and re-print the freshly-started shell's prompt. */
function loadActive(): void {
  if (!term) return
  term.reset()
  fitActive()
  term.focus()
}

watch(
  () => store.activeId,
  async () => {
    if (!store.open) return
    await nextTick()
    ensureTerm()
    loadActive()
  }
)

watch(
  () => store.open,
  async (isOpen) => {
    if (!isOpen) return
    minimized.value = false
    await nextTick()
    ensureTerm()
    loadActive()
  }
)

watch(minimized, async (m) => {
  if (!m) {
    await nextTick()
    fitActive()
    term?.focus()
  }
})

// Re-apply colors when the shell chrome flips between light/dark.
watch(
  () => store.open,
  () => {
    if (!term) return
    const c = themeColors()
    term.options.theme = { ...term.options.theme, background: c.bg, foreground: c.fg }
  }
)

function onClose(id: string): void {
  store.close(id)
}

function relaunchActive(): void {
  const s = store.activeSession
  if (!s) return
  store.close(s.id)
  store.start(s.target, s.title).catch(() => undefined)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  disposeData?.()
  resizeObserver?.disconnect()
  term?.dispose()
  term = null
})
</script>

<template>
  <section v-show="store.open" ref="winEl" class="term-win" :style="winStyle()">
    <header class="term-bar" @pointerdown="onPointerDown($event, 'move')">
      <div class="tabs">
        <button
          v-for="s in store.sessions"
          :key="s.id"
          class="tab"
          :class="{ active: s.id === store.activeId, exited: s.status === 'exited' }"
          :title="s.cwd"
          @click="store.focus(s.id)"
        >
          <span class="dot" :class="s.status" />
          {{ s.title }}
          <el-icon class="tab-close" size="12" @click.stop="onClose(s.id)"><Close /></el-icon>
        </button>
      </div>
      <div class="bar-actions">
        <span class="cwd">{{ store.activeSession?.cwd }}</span>
        <el-button size="small" text title="重启当前终端" @click.stop="relaunchActive">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button
          size="small"
          text
          :title="store.docked ? '取消顶部停靠（恢复为浮动窗口）' : '停靠到顶部标题栏下方'"
          @click.stop="store.setDocked(!store.docked)"
        >
          <el-icon><Rank /></el-icon>
        </el-button>
        <el-button
          size="small"
          text
          :title="minimized ? '展开终端' : '折叠终端'"
          @click.stop="minimized = !minimized"
        >
          <el-icon><ArrowUp v-if="!minimized" /><ArrowDown v-else /></el-icon>
        </el-button>
        <el-button
          size="small"
          text
          title="关闭全部终端（结束进程）"
          @click.stop="store.closeAll()"
        >
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </header>

    <div v-show="!minimized" ref="containerEl" class="term-surface">
      <div v-if="!store.sessions.length" class="term-empty">
        <el-icon size="18"><Cpu /></el-icon> 点各面板的「终端」按钮在此打开内嵌 shell
      </div>
    </div>

    <!-- resize handles -->
    <div
      v-if="!store.docked"
      v-show="!minimized"
      class="rz rz-e"
      @pointerdown="onPointerDown($event, 'e')"
    />
    <div v-show="!minimized" class="rz rz-s" @pointerdown="onPointerDown($event, 's')" />
    <div
      v-if="!store.docked"
      v-show="!minimized"
      class="rz rz-se"
      @pointerdown="onPointerDown($event, 'se')"
    />
  </section>
</template>

<style scoped>
.term-win {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  transition: transform 0.15s ease;
}

.term-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex: none;
  cursor: move;
  user-select: none;
  touch-action: none;
}
.term-win.minimized .term-bar {
  border-bottom: none;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  min-width: 0;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.tab:hover {
  background: var(--surface);
  color: var(--text);
}
.tab.active {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
}
.tab.exited .dot {
  background: var(--err);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
  flex: none;
}

.tab-close {
  opacity: 0.6;
}
.tab-close:hover {
  opacity: 1;
  color: var(--err);
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.cwd {
  font-size: 11.5px;
  color: var(--text-dim);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 4px;
}

.term-surface {
  flex: 1;
  min-height: 0;
  position: relative;
  padding: 4px 6px;
}

.term-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 8px;
  grid-auto-flow: column;
  color: var(--text-dim);
  font-size: 13px;
}

.rz {
  position: absolute;
  z-index: 5;
  touch-action: none;
}
.rz-e {
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
}
.rz-s {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 6px;
  cursor: ns-resize;
}
.rz-se {
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}
</style>
