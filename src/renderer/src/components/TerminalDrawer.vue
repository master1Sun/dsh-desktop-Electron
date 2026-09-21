<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Close, Cpu, Minus, Plus, Refresh } from '@element-plus/icons-vue'
import { useTerminalStore } from '../stores/terminal'
import { useSettingsStore } from '../stores/settings'
import { t } from '../i18n'

/**
 * 内嵌终端面板：默认停靠在窗口底部（拖上边缘可调高度，双击复位）；最小化后收成一个
 * 可拖动的小图标，松手时横向吸附到窗口右缘，点图标即展开回底部面板。
 */
const store = useTerminalStore()
const settingsStore = useSettingsStore()
const containerEl = ref<HTMLElement | null>(null)
const fabEl = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let disposeData: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

const minimized = ref(false)
/** 折叠面板高度（px）：与主进程 container-settings 的 terminalHeight 默认值保持一致。 */
const DEFAULT_H = 320
const MIN_H = 160
/** 顶部窗口控件条 + 一点余量：面板不能高到把窗口内容挤没。 */
const TOP_CHROME_H = 80
const size = ref({ h: DEFAULT_H })

/** 把高度夹在 [MIN_H, 窗口可用高度] 内，窗口变小后也要重新夹。 */
function clampH(h: number): number {
  const max = Math.max(MIN_H, window.innerHeight - TOP_CHROME_H)
  return Math.max(MIN_H, Math.min(Math.round(h), max))
}

/* ---- minimized FAB: draggable, snaps back to the right edge on release ---- */
const FAB_SIZE = 42
const fabY = ref(Math.round(window.innerHeight * 0.35))
const fabDragging = ref(false)
const fabDragPos = ref({ x: 0, y: 0 })
let fabStart = { px: 0, py: 0, x: 0, y: 0 }
let fabMoved = false

const fabStyle = computed<Record<string, string>>(() => {
  if (fabDragging.value)
    return { left: `${fabDragPos.value.x}px`, top: `${fabDragPos.value.y}px`, right: 'auto' }
  return { left: 'auto', top: `${fabY.value}px`, right: '12px' }
})

function onFabDown(e: PointerEvent): void {
  fabMoved = false
  const rect = fabEl.value?.getBoundingClientRect()
  fabStart = { px: e.clientX, py: e.clientY, x: rect?.left ?? 0, y: rect?.top ?? fabY.value }
  fabDragging.value = true
  fabEl.value?.setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onFabMove)
  window.addEventListener('pointerup', onFabUp)
}

function onFabMove(e: PointerEvent): void {
  const dx = e.clientX - fabStart.px
  const dy = e.clientY - fabStart.py
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fabMoved = true
  fabDragPos.value = {
    x: Math.max(0, Math.min(fabStart.x + dx, window.innerWidth - FAB_SIZE)),
    y: Math.max(46, Math.min(fabStart.y + dy, window.innerHeight - FAB_SIZE - 8))
  }
}

function onFabUp(): void {
  window.removeEventListener('pointermove', onFabMove)
  window.removeEventListener('pointerup', onFabUp)
  fabDragging.value = false
  if (!fabMoved) {
    // a click, not a drag → expand back to the bottom panel
    minimized.value = false
    return
  }
  // 吸附：横向回到右缘，纵向停在松手位置（已夹在窗口内）
  fabY.value = fabDragPos.value.y
}

/* ---- bottom-dock height resize via the panel's top edge ---- */
const resizing = ref(false)
let resizeStart = { py: 0, h: 0 }
/** 待执行的 fit 帧号，0 = 无待执行。 */
let fitRaf = 0

function onResizeDown(e: PointerEvent): void {
  resizing.value = true
  resizeStart = { py: e.clientY, h: size.value.h }
  ;(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeUp)
}

function onResizeMove(e: PointerEvent): void {
  if (!resizing.value) return
  // 向上拖（dy<0）增高，向下拖降低度
  size.value.h = clampH(resizeStart.h - (e.clientY - resizeStart.py))
}

function onResizeUp(): void {
  if (!resizing.value) return
  resizing.value = false
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
  fitActive()
  saveHeight()
}

/** 双击上边缘：回到默认高度。 */
function resetHeight(): void {
  size.value.h = clampH(DEFAULT_H)
  fitActive()
  saveHeight()
}

/** 拖完再落盘，避免拖动过程中刷屏 IPC；失败静默（下次启动回到已存值）。 */
function saveHeight(): void {
  settingsStore.patch({ terminalHeight: size.value.h }).catch(() => undefined)
}

// 启动时从设置里恢复上次高度（设置是异步加载的，loaded 之前先用默认值）。只恢复一次，
// 之后高度归拖拽管，避免 save 回包反过来覆盖用户刚拖出的新高度。
let restored = false
watch(
  () => settingsStore.loaded,
  (loaded) => {
    if (!loaded || restored) return
    restored = true
    const h = settingsStore.settings.terminalHeight
    size.value.h = clampH(typeof h === 'number' && h > 0 ? h : DEFAULT_H)
    fitActive()
  },
  { immediate: true }
)

/** 窗口缩小/最大化时重新夹高度，别让面板超出可视区。 */
function onWindowResize(): void {
  const next = clampH(size.value.h)
  if (next !== size.value.h) {
    size.value.h = next
    fitActive()
  }
}

function themeColors(): { bg: string; fg: string } {
  const light = document.documentElement.classList.contains('light')
  return light ? { bg: '#ffffff', fg: '#1f2328' } : { bg: '#000000', fg: '#e8ecf3' }
}

function ensureTerm(): void {
  if (term || !containerEl.value) return
  const c = themeColors()
  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'Consolas, Menlo, "Cascadia Code", monospace',
    fontSize: 13,
    scrollback: 5000,
    theme: { background: c.bg, foreground: c.fg }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(containerEl.value)
  term.onData((data) => {
    if (store.activeId) window.container.ptyWrite(store.activeId, data).catch(() => undefined)
  })
  // Only forward the active session's bytes into the single shared terminal surface.
  disposeData = window.container.onPtyData(({ id, data }) => {
    store.feed(id, data)
    if (id === store.activeId) term?.write(data)
  })
  resizeObserver = new ResizeObserver(() => scheduleFit())
  resizeObserver.observe(containerEl.value)
}

/**
 * 重算 xterm 尺寸（fit）+ 同步给 PTY，用 rAF 合并同一帧内的多次尺寸变化：
 * 拖动中每帧 fit 一次保证内容区跟手，而 ptyResize（IPC + shell 重排）留到松手再发。
 */
function fitSurface(): void {
  fitRaf = 0
  if (!term || !fit || minimized.value) return
  try {
    fit.fit()
  } catch {
    return /* container not laid out yet */
  }
  if (!resizing.value) syncPtySize()
}

function syncPtySize(): void {
  if (!term || !fit || minimized.value) return
  if (store.activeId)
    window.container.ptyResize(store.activeId, term.cols, term.rows).catch(() => undefined)
}

/** 尺寸变化统一入口：交给下一帧的 fitSurface，避免 ResizeObserver 回调风暴。 */
function scheduleFit(): void {
  if (fitRaf) return
  fitRaf = requestAnimationFrame(fitSurface)
}

/** 不等下一帧，立刻重算尺寸并同步 PTY（fitSurface 内含同步）：切页 / 展开 / 松手 / 复位时用。 */
function fitActive(): void {
  if (fitRaf) {
    cancelAnimationFrame(fitRaf)
    fitRaf = 0
  }
  fitSurface()
}

/** Repaint the shared surface with the active tab's buffered scrollback. */
function loadActive(): void {
  if (!term) return
  term.reset()
  fitActive()
  const s = store.activeId ? store.sessionById(store.activeId) : null
  if (s?.buffer) term.write(s.buffer)
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
  () => document.documentElement.className,
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

/** 新开一个终端 Tab：沿用当前会话的目标目录，没有会话时退回容器根目录。 */
function newTerminal(): void {
  const target = store.activeSession?.target ?? 'container'
  store.start(target, store.activeSession?.title ?? t('terminal.rootTitle')).catch(() => undefined)
}

/**
 * 关闭全部会话会 kill 所有还在运行的 shell，属破坏性操作 → 多个会话时二次确认。
 * 只剩一个会话时它就等价于点当前 Tab 的 ×（本来就不提示），所以直接关，不弹窗。
 */
async function closeAll(): Promise<void> {
  if (store.sessions.length > 1) {
    try {
      await ElMessageBox.confirm(t('terminal.closeAllConfirm'), t('terminal.closeAllTitle'), {
        type: 'warning',
        confirmButtonText: t('terminal.closeAllConfirmBtn'),
        cancelButtonText: t('common.cancel')
      })
    } catch {
      return
    }
  }
  store.closeAll()
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  if (fitRaf) cancelAnimationFrame(fitRaf)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
  window.removeEventListener('pointermove', onFabMove)
  window.removeEventListener('pointerup', onFabUp)
  disposeData?.()
  resizeObserver?.disconnect()
  term?.dispose()
  term = null
})
</script>

<template>
  <!-- Bottom-docked full-width terminal strip; height follows the dragged size. -->
  <section
    v-show="store.open && !minimized"
    class="term-dock"
    :class="{ resizing }"
    :style="{ height: `${size.h}px` }"
  >
    <header class="term-bar">
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
        <button class="tab tab-new" :title="t('terminal.newTab')" @click.stop="newTerminal">
          <el-icon size="12"><Plus /></el-icon>
        </button>
      </div>
      <div class="bar-actions">
        <span class="cwd">{{ store.activeSession?.cwd }}</span>
        <el-button size="small" text :title="t('terminal.restart')" @click.stop="relaunchActive">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button
          size="small"
          text
          :title="t('terminal.minimize')"
          @click.stop="minimized = true"
        >
          <el-icon><Minus /></el-icon>
        </el-button>
        <el-button
          size="small"
          text
          :title="t('terminal.closeAll')"
          @click.stop="closeAll"
        >
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </header>

    <div ref="containerEl" class="term-surface">
      <div v-if="!store.sessions.length" class="term-empty">
        <el-icon size="18"><Cpu /></el-icon> {{ t('terminal.emptyHint') }}
      </div>
    </div>

    <!-- top-edge resize handle: 拖动改高度，双击复位 -->
    <div
      class="rz rz-n"
      :class="{ active: resizing }"
      role="separator"
      aria-orientation="horizontal"
      :aria-valuenow="size.h"
      :aria-valuemin="MIN_H"
      :title="t('terminal.resize')"
      @pointerdown="onResizeDown"
      @dblclick="resetHeight"
    >
      <span class="rz-grip" />
    </div>
  </section>

  <!-- Minimized: a draggable icon that hugs the right edge. -->
  <button
    v-if="store.open && minimized"
    ref="fabEl"
    class="term-fab"
    :class="{ dragging: fabDragging }"
    :style="fabStyle"
    :title="t('terminal.collapsed')"
    @pointerdown="onFabDown"
  >
    <el-icon :size="18"><Cpu /></el-icon>
    <span v-if="store.sessions.length" class="fab-badge">{{ store.sessions.length }}</span>
  </button>
</template>

<style scoped>
.term-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  /* frosted dock so the page behind bleeds through; opacity follows --glass-tint-a */
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.85));
  border-top: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  border-radius: 10px 10px 0 0;
  box-shadow:
    0 -12px 40px rgba(0, 0, 0, 0.35),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset;
  overflow: hidden;
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
  user-select: none;
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

.rz-n {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* 拖拽命中区：比可见分隔线厚一点，又不至于挡到 tab 点击 */
  height: 8px;
  cursor: ns-resize;
  touch-action: none;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 可见把手：居中短横条，悬停 / 拖动时高亮，提示此处可上下拖 */
.rz-grip {
  width: 46px;
  height: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-dim) 35%, transparent);
  opacity: 0.5;
  pointer-events: none;
  transition:
    background 0.15s ease,
    opacity 0.15s ease,
    width 0.15s ease;
}

.rz-n:hover .rz-grip,
.rz-n.active .rz-grip {
  background: var(--accent);
  opacity: 1;
  width: 64px;
}

/* 拖动时不要圈选文本 / 面板内容 */
.term-dock.resizing {
  user-select: none;
}
.term-dock.resizing .term-surface {
  cursor: ns-resize;
}

/* ---- minimized floating icon ---- */
.term-fab {
  position: fixed;
  right: 12px;
  z-index: 2000;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.term-fab:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.term-fab.dragging {
  cursor: grabbing;
}

.fab-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  text-align: center;
}
</style>
