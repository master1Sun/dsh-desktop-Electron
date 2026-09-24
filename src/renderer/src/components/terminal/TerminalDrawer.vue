<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { Terminal } from '@xterm/xterm'
import {
  Close,
  Cpu,
  DCaret,
  FullScreen,
  Minus,
  Operation,
  Plus,
  Search
} from '@element-plus/icons-vue'
import {
  useTerminalStore,
  type TerminalSession
} from '@renderer/stores/terminal'
import { useSettingsStore } from '@renderer/stores/settings'
import type { PtyShellInfo } from '@shared/types'
import SplitNode from './SplitNode.vue'
import TerminalSearchBar from './TerminalSearchBar.vue'
import { t } from '@renderer/i18n'

/**
 * 终端面板，两种展示模式（右上角全屏图标切换，持久化到 settings.terminalMode）：
 * - 内嵌（默认）：作为页面区的流子元素停靠在底部，拖上边缘调高度会顶起 webview；不提供最小化。
 * - 浮窗：fixed 到窗口底部的覆盖层，不顶起内容；可最小化成一个可拖动小图标，松手横向吸附右缘。
 * 顶部标签 = 终端分组，每个分组内部是一棵可嵌套的分屏树（SplitNode → TerminalPane）。
 */
const store = useTerminalStore()
const settingsStore = useSettingsStore()
const fabEl = ref<HTMLElement | null>(null)
const searchEl = ref<InstanceType<typeof TerminalSearchBar> | null>(null)

/* The search bar reaches whichever pane currently has keyboard focus; panes register their term
   through this injected setter (see TerminalPane). MUST be a shallowRef: a plain ref() would
   deep-wrap the xterm Terminal instance in a Vue reactive Proxy, and handing that Proxy to
   term.loadAddon()/addon internals breaks xterm (private fields / `this` binding) and stalls the
   whole drawer's re-render (add/delete stop taking effect). */
const activeTerm = shallowRef<Terminal | null>(null)
provide('term:setActive', (term: Terminal | null): void => {
  activeTerm.value = term
})
// Clear the reference only when it still points at the pane being torn down: a group switch that
// has already mounted the next pane must not get clobbered, and a disposed term is never left
// dangling as `activeTerm` (which would make the search bar call findNext on a dead terminal).
provide('term:clearActive', (term: Terminal): void => {
  if (activeTerm.value === term) activeTerm.value = null
})
// Explicit accessor (rather than an inline `() => activeTerm` in the template) so the search bar is
// guaranteed to receive the raw Terminal instance, never a Ref wrapper or a reactive Proxy.
function getActiveTerm(): Terminal | null {
  return activeTerm.value
}

/* ---- shell picker: candidate shells fetched once from the main process (default first) ---- */
const shells = ref<PtyShellInfo[]>([])
async function loadShells(): Promise<void> {
  try {
    const res = await window.container.ptyShells?.()
    if (res?.ok) shells.value = (res.data as PtyShellInfo[]) || []
  } catch {
    /* picker just shows the default action only */
  }
}

const minimized = ref(false)
/** 展示模式：false = 内嵌（占页面容器流空间，不可最小化）；true = 浮窗（fixed 覆盖层，可最小化）。
 *  真值源是 settingsStore.settings.terminalMode，这里只做响应式镜像（见下方 watch）。 */
const floating = ref(false)
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
  if (e.button !== 0) return // 右键交给 @contextmenu（菜单）处理，不启动拖拽
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
    // 点击而非拖拽 → 弹出「已最小化终端」小窗列表（华为小窗式）
    toggleList()
    return
  }
  // 吸附：横向回到右缘，纵向停在松手位置（已夹在窗口内）
  fabY.value = fabDragPos.value.y
}

/* ---- minimized FAB：左键小窗列表 + 右键菜单（华为小窗式） ---- */
const miniOpen = ref(false)
const menuOpen = ref(false)
const listEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)

/** 面板/菜单锚在 FAB 左侧；FAB 落在下半屏时改为贴底向上展开，避免超出窗口。 */
const anchorStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = { right: `${FAB_SIZE + 16}px` }
  const vh = window.innerHeight
  if (fabY.value > vh * 0.55) style.bottom = `${Math.max(12, vh - (fabY.value + FAB_SIZE))}px`
  else style.top = `${fabY.value}px`
  return style
})

/** 去掉 ANSI 转义/控制字符，取最后几行做只读预览（小窗缩略）。 */
/* eslint-disable no-control-regex -- ANSI/VT 序列与 C0 控制符在 PTY 输出里就是字面字节 */
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\r/g, '')
}
/* eslint-enable no-control-regex */
function previewText(s: TerminalSession, lines = 5): string {
  return stripAnsi(s.buffer)
    .split('\n')
    .filter((l) => l.trim())
    .slice(-lines)
    .join('\n')
}

function closePopups(): void {
  miniOpen.value = false
  menuOpen.value = false
}
function openList(): void {
  menuOpen.value = false
  miniOpen.value = true
}
function toggleList(): void {
  const was = miniOpen.value
  closePopups()
  if (!was) openList()
}
function onFabContext(e: MouseEvent): void {
  e.preventDefault()
  if (!store.sessions.length) return
  const was = menuOpen.value
  closePopups()
  if (!was) menuOpen.value = true
}

/** 恢复某个会话：切到底部抽屉并置顶显示。 */
function restore(id: string): void {
  store.focus(id)
  minimized.value = false
  closePopups()
}
/** 关闭单个会话；关到没有则收起 FAB。 */
function closeOne(id: string): void {
  store.close(id)
  if (!store.sessions.length) {
    closePopups()
    minimized.value = false
  }
}
/** 从列表新建终端：沿用当前会话目录，创建后直接展开显示。 */
async function newFromList(): Promise<void> {
  const target = store.activeSession?.target ?? 'container'
  const title = store.activeSession?.title ?? t('terminal.title')
  try {
    await store.start(target, title)
  } catch {
    return
  }
  minimized.value = false
  closePopups()
}
async function closeAllFromMenu(): Promise<void> {
  await closeAll()
  closePopups()
  if (!store.sessions.length) minimized.value = false
}

/** 打开列表/菜单时监听外部按下以关闭（捕获阶段，避开 FAB 自身 pointerdown 抢跑）。 */
function onDocDown(e: PointerEvent): void {
  const node = e.target as Node
  if (fabEl.value?.contains(node) || listEl.value?.contains(node) || menuEl.value?.contains(node))
    return
  closePopups()
}
watch([miniOpen, menuOpen], ([a, b]) => {
  if (a || b) document.addEventListener('pointerdown', onDocDown, true)
  else document.removeEventListener('pointerdown', onDocDown, true)
})

/* ---- bottom-dock height resize via the panel's top edge ---- */
const resizing = ref(false)
let resizeStart = { py: 0, h: 0 }

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
  saveHeight()
}

/** 双击上边缘：回到默认高度。 */
function resetHeight(): void {
  size.value.h = clampH(DEFAULT_H)
  saveHeight()
}

/** 拖完再落盘，避免拖动过程中刷屏 IPC；失败静默（下次启动回到已存值）。 */
function saveHeight(): void {
  settingsStore.patch({ terminalHeight: size.value.h }).catch(() => undefined)
}

// 高度与设置双向同步：启动时（设置是异步加载的）恢复上次高度，运行中在设置面板里改
// 也立即生效。拖动本身会写回同一个 key，所以回包时 next === 本地高度，不会自打循环；
// 拖动过程中忽略回包，免得把上一次保存的旧值盖到刚拖到一半的高度上。pane 自带 ResizeObserver，改高后自动重算。
watch(
  () => [settingsStore.loaded, settingsStore.settings.terminalHeight] as const,
  ([loaded, h]) => {
    if (!loaded || resizing.value) return
    const next = clampH(typeof h === 'number' && h > 0 ? h : DEFAULT_H)
    if (next !== size.value.h) size.value.h = next
  },
  { immediate: true }
)

/* ---- display mode: embedded (in-flow, no minimize) ⇄ floating (fixed overlay, minimizable) ----
   terminalMode is the single source of truth (persisted). Mirror it into `floating` so template can
   branch on a boolean; leaving floating back to embedded must drop any minimized state, else the
   dock would hide itself with no FAB to bring it back (the FAB only exists in floating mode). */
watch(
  () => settingsStore.settings.terminalMode,
  (mode) => {
    const f = mode === 'floating'
    if (f === floating.value) return
    floating.value = f
    if (!f) minimized.value = false
  },
  { immediate: true }
)
function toggleMode(): void {
  settingsStore
    .patch({ terminalMode: floating.value ? 'embedded' : 'floating' })
    .catch(() => undefined)
}

/** 窗口缩小/最大化时重新夹高度，别让面板超出可视区。 */
function onWindowResize(): void {
  const next = clampH(size.value.h)
  if (next !== size.value.h) size.value.h = next
}

/* ---- per-pane terminals live in <SplitNode>/<TerminalPane>; the drawer only tracks focus ---- */
watch(minimized, (m) => {
  if (!m) closePopups()
})

/** 新开一个终端分组：沿用当前会话的目标目录，没有会话时退回容器根目录；标题统一叫「终端」。 */
function newTerminal(shellId?: string): void {
  const target = store.activeSession?.target ?? 'container'
  store.start(target, t('terminal.title'), shellId).catch(() => undefined)
}

/** 在活动分组里加一个 pane（向右 = 并排 h / 向下 = 堆叠 v）。 */
function splitActive(direction: 'h' | 'v'): void {
  const id = store.activeSession?.id
  if (id) store.split(id, direction).catch(() => undefined)
}

/**
 * 右侧列表的一行 = 一个终端 pane：分屏里的每个 pane 都单列一行（对齐 VSCode，拆分也算一个终端）。
 * 按分组顺序展开，组内第一个 pane 顶格、其余（拆分出来的）缩进，形成截图里的树形层级。
 */
interface TermRow {
  session: TerminalSession
  nested: boolean
}
const termRows = computed<TermRow[]>(() => {
  const rows: TermRow[] = []
  for (const g of store.groups) {
    store.collectLeaves(g.root).forEach((id, i) => {
      const s = store.sessionById(id)
      if (s) rows.push({ session: s, nested: i > 0 })
    })
  }
  return rows
})

/** 列表里对某个 pane 向右拆分。 */
function splitSession(id: string): void {
  store.split(id, 'h').catch(() => undefined)
}

/**
 * 右侧列表按终端类型展示名称：优先取该会话所选 shell 的 label（PowerShell / Git Bash /…）；
 * 未指定 shell 的（默认新建、Ctrl+K 唤起）归到主进程返回的默认 shell（listShells 首项）。
 * shell 列表尚未加载完时回退到会话标题 / 「终端」。
 */
function shellName(s: TerminalSession): string {
  const id = s.shell ?? shells.value[0]?.id
  return shells.value.find((x) => x.id === id)?.label || s.title || t('terminal.title')
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
  void loadShells()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
  window.removeEventListener('pointermove', onFabMove)
  window.removeEventListener('pointerup', onFabUp)
  document.removeEventListener('pointerdown', onDocDown, true)
})
</script>

<template>
  <!-- Bottom-docked terminal strip; embedded flow sibling by default, fixed overlay in floating mode. -->
  <section
    v-show="store.open && !minimized"
    class="term-dock"
    :class="{ resizing, 'is-floating': floating }"
    :style="{ height: `${size.h}px` }"
  >
    <header class="term-bar">
      <span class="term-bar__title">{{ t('terminal.title') }}</span>
      <el-tooltip
        :content="t('terminal.search')"
        placement="bottom"
        popper-class="dsh-tip-popper"
      >
        <el-button size="small" text @click.stop="searchEl?.toggle()">
          <el-icon><Search /></el-icon>
        </el-button>
      </el-tooltip>
      <TerminalSearchBar ref="searchEl" :get-term="getActiveTerm" class="term-bar__search" />
      <div class="bar-actions">
        <el-tooltip
          :content="t('terminal.newTab')"
          placement="bottom"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text @click.stop="newTerminal()">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
        <el-dropdown v-if="shells.length" trigger="click" @command="newTerminal">
          <el-button size="small" text :title="t('terminal.newWithShell')">
            <el-icon><DCaret /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="s in shells" :key="s.id" :command="s.id">
                {{ s.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="(d) => splitActive(d === 'v' ? 'v' : 'h')">
          <el-button size="small" text :title="t('terminal.split')">
            <el-icon><Operation /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="h">{{ t('terminal.splitRight') }}</el-dropdown-item>
              <el-dropdown-item command="v">{{ t('terminal.splitDown') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <!-- Right-edge cluster: the drawer sits flush to the window's right border, so a centered
             `bottom` tip would spill past the viewport and raise a horizontal scrollbar. `bottom-end`
             pins the bubble's right edge to the button and grows it leftward, keeping it on-screen. -->
        <el-tooltip
          :content="floating ? t('terminal.toEmbedded') : t('terminal.toFloating')"
          placement="bottom-end"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text @click.stop="toggleMode">
            <el-icon><FullScreen /></el-icon>
          </el-button>
        </el-tooltip>
        <!-- 最小化只在浮窗模式提供：内嵌模式下面板占实际布局空间，收起后无 FAB 可回。 -->
        <el-tooltip
          v-if="floating"
          :content="t('terminal.minimize')"
          placement="bottom-end"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text @click.stop="minimized = true">
            <el-icon><Minus /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          :content="t('terminal.closeAll')"
          placement="bottom-end"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text @click.stop="closeAll">
            <el-icon><Close /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </header>

    <div class="term-body">
      <div class="term-surface">
        <SplitNode
          v-if="store.activeGroup"
          :key="store.activeGroup.id"
          :node="store.activeGroup.root"
          :group-id="store.activeGroup.id"
        />
        <div v-else class="term-empty">
          <el-icon size="18"><Cpu /></el-icon> {{ t('terminal.emptyHint') }}
        </div>
      </div>
      <!-- VSCode-style right rail: one row per terminal pane (splits count too); shows once ≥2. -->
      <aside v-if="store.sessions.length > 1" class="term-side">
        <div
          v-for="row in termRows"
          :key="row.session.id"
          class="term-side__item"
          :class="{
            active: row.session.id === store.activeSession?.id,
            exited: row.session.status === 'exited',
            nested: row.nested
          }"
          :title="shellName(row.session)"
          @click="store.focusSession(row.session.id)"
        >
          <span class="dot" :class="row.session.status" />
          <span class="term-side__name">{{ shellName(row.session) }}</span>
          <el-icon
            class="term-side__act"
            :size="13"
            :title="t('terminal.split')"
            @click.stop="splitSession(row.session.id)"
            ><Operation
          /></el-icon>
          <el-icon
            class="term-side__act"
            :size="13"
            :title="t('terminal.close')"
            @click.stop="store.close(row.session.id)"
            ><Close
          /></el-icon>
        </div>
      </aside>
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

  <!-- Minimized: a draggable icon that hugs the right edge. Left-click → mini-window list,
       right-click → context menu. -->
  <el-tooltip
    v-if="store.open && minimized"
    :content="t('terminal.minimizedTitle')"
    placement="left"
    popper-class="dsh-tip-popper"
  >
    <button
      ref="fabEl"
      class="term-fab"
      :class="{ dragging: fabDragging }"
      :style="fabStyle"
      @pointerdown="onFabDown"
      @contextmenu.prevent="onFabContext"
    >
      <span class="term-glyph fab-glyph">&gt;_</span>
      <span v-if="store.sessions.length" class="fab-badge">{{ store.sessions.length }}</span>
    </button>
  </el-tooltip>

  <!-- Left-click: minimized-terminal mini-window list (Huawei-style floating windows). -->
  <div v-if="miniOpen && store.sessions.length" ref="listEl" class="term-mini" :style="anchorStyle">
    <div class="term-mini__title">{{ t('terminal.minimizedTitle') }}</div>
    <div class="term-mini__list">
      <div
        v-for="s in store.sessions"
        :key="s.id"
        class="term-card"
        :class="{ exited: s.status === 'exited' }"
      >
        <div class="term-card__head" :title="s.cwd" @click="restore(s.id)">
          <span class="term-glyph term-card__ico">&gt;_</span>
          <span class="term-card__name">{{ s.title }}</span>
          <el-icon
            class="term-card__x"
            :size="14"
            :title="t('terminal.close')"
            @click.stop="closeOne(s.id)"
            ><Close
          /></el-icon>
        </div>
        <pre class="term-card__body" :title="t('terminal.restoreTip')" @click="restore(s.id)">{{
          previewText(s)
        }}</pre>
      </div>
    </div>
    <button class="term-mini__new" @click="newFromList">
      <el-icon><Plus /></el-icon> {{ t('terminal.newTab') }}
    </button>
  </div>

  <!-- Right-click: compact context menu (show / close each, plus close-all). -->
  <div
    v-if="menuOpen && store.sessions.length"
    ref="menuEl"
    class="term-menu"
    :style="anchorStyle"
    @contextmenu.prevent
  >
    <el-tooltip
      v-for="s in store.sessions"
      :key="s.id"
      :content="t('terminal.restoreTip')"
      placement="left"
      popper-class="dsh-tip-popper"
    >
      <button class="term-menu__row" @click="restore(s.id)">
        <span class="term-glyph term-menu__ico">&gt;_</span>
        <span class="term-menu__name">{{ s.title }}</span>
        <el-icon
          class="term-menu__x"
          :size="14"
          :title="t('terminal.close')"
          @click.stop="closeOne(s.id)"
          ><Close
        /></el-icon>
      </button>
    </el-tooltip>
    <div class="term-menu__sep" />
    <button class="term-menu__row term-menu__row--danger" @click="closeAllFromMenu">
      <el-icon class="term-menu__ico"><Close /></el-icon>
      <span class="term-menu__name">{{ t('terminal.closeAllConfirmBtn') }}</span>
    </button>
  </div>
</template>

<style scoped>
.term-dock {
  /* Embedded flow sibling of the page area (see App.vue .content): it takes its dragged
     height and pushes the webview up, instead of the old window-wide `position: fixed` strip. */
  position: relative;
  flex: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  /* frosted dock so the page behind bleeds through; opacity follows --glass-tint-a */
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.85));
  border-top: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  box-shadow:
    0 -12px 40px rgba(0, 0, 0, 0.35),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset;
  overflow: hidden;
}

/* Floating mode: escape the page area and pin to the window bottom as an overlay (the dock is a
   child of .content, but no ancestor establishes a containing block for `position: fixed`, same as
   the FAB), so it floats over the webview instead of pushing it up — and can minimize to the FAB. */
.term-dock.is-floating {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: auto;
  z-index: 2000;
  border-radius: 10px 10px 0 0;
}

.term-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  /* Fixed height so the search pill appearing/disappearing never grows the bar (no title jitter). */
  min-height: 32px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex: none;
  user-select: none;
}

.term-bar__title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  letter-spacing: 0.3px;
  user-select: none;
}

/* Search pill sits right after the title; it is the only thing that moves when search toggles. */
.term-bar__search {
  flex: none;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
  flex: none;
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  margin-left: auto;
}

/* Body row: the split surface fills the width, with an optional VSCode-style tab rail on the right. */
.term-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.term-surface {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  padding: 4px 6px;
}

/* ---- right tab rail (VSCode `terminal.integrated.tabs.location: right`) ---- */
.term-side {
  flex: none;
  width: 168px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  overflow-y: auto;
  border-left: 1px solid var(--border);
  background: var(--surface-2);
}
.term-side__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.term-side__item:hover {
  background: var(--surface);
  color: var(--text);
}
.term-side__item.active {
  background: var(--surface);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  color: var(--text);
}
/* Split panes indent one level under their group's first terminal (VSCode tree look). */
.term-side__item.nested {
  margin-left: 14px;
}
.term-side__item.exited .dot {
  background: var(--err);
}
.term-side__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.term-side__act {
  flex: none;
  color: var(--text-dim);
  opacity: 0;
  cursor: pointer;
}
.term-side__item:hover .term-side__act,
.term-side__item.active .term-side__act {
  opacity: 1;
}
.term-side__act:hover {
  color: var(--accent);
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
/* `>_` terminal glyph shared by the FAB, cards and menu rows (matches the reference mock). */
.term-glyph {
  display: inline-flex;
  flex: none;
  align-items: center;
  font-family: Consolas, Menlo, 'Cascadia Code', monospace;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -1px;
}
.fab-glyph {
  font-size: 16px;
}
.term-fab {
  position: fixed;
  right: 12px;
  z-index: 2000;
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: 12px;
  background: var(--surface);
  color: var(--accent);
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

/* ---- minimized mini-window list (left-click) ---- */
.term-mini {
  position: fixed;
  z-index: 2100;
  width: 300px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: 12px;
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.92));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.45);
}
.term-mini__title {
  flex: none;
  font-size: 12px;
  color: var(--text-dim);
}
.term-mini__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.term-card {
  flex: none;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 26%, transparent);
}
.term-card.exited {
  border-color: color-mix(in srgb, var(--err) 45%, var(--border));
}
.term-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--surface-2);
  cursor: pointer;
  user-select: none;
}
.term-card__head:hover .term-card__name {
  color: var(--accent);
}
.term-card__ico {
  flex: none;
  font-size: 13px;
  color: var(--accent);
}
.term-card__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.term-card__x {
  flex: none;
  color: var(--text-dim);
  cursor: pointer;
}
.term-card__x:hover {
  color: var(--err);
}
.term-card__body {
  max-height: 76px;
  margin: 0;
  padding: 6px 8px;
  overflow: hidden;
  font-family: Consolas, Menlo, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-dim);
  white-space: pre-wrap;
  word-break: break-all;
  cursor: pointer;
}
.term-mini__new {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.term-mini__new:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ---- minimized context menu (right-click) ---- */
.term-menu {
  position: fixed;
  z-index: 2100;
  min-width: 210px;
  max-height: 70vh;
  padding: 5px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: 10px;
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.94));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  backdrop-filter: blur(var(--glass-blur, 30px)) saturate(135%);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.45);
}
.term-menu__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.term-menu__row:hover {
  background: var(--surface-2);
}
.term-menu__ico {
  flex: none;
  font-size: 13px;
  color: var(--accent);
}
.term-menu__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.term-menu__x {
  flex: none;
  color: var(--text-dim);
}
.term-menu__x:hover {
  color: var(--err);
}
.term-menu__row--danger .term-menu__ico,
.term-menu__row--danger .term-menu__name {
  color: var(--err);
}
.term-menu__sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--border);
}
</style>
