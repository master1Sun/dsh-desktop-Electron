<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MenuPanelContent from '@renderer/components/panels/MenuPanelContent.vue'
import { buildNav, HELP_GROUP, SETTINGS_GROUP, type QQGroup } from './qqNav'
import { parseAppPanel } from '@shared/types'
import type { PageState } from '@renderer/stores/pages'
import { t } from '@renderer/i18n'

/**
 * IM (QQ-like) shell — icon rail + a floating bubble panel.
 *
 * The left rail carries *only* group icons (no labels, no tab strip in the rail). Clicking an icon
 * opens the same classic floating card the menu bar uses (MenuPanelContent, with its own tabs) as a
 * bubble anchored beside the rail; clicking the active icon again closes it. App.vue still owns the
 * top-level group (`current`) so the compact MenuBar, the palette and Esc stay in sync — the rail
 * just drives `current`, and the popup reuses the classic panel verbatim.
 */
const props = defineProps<{
  pages: PageState[]
  /** Open top-level group (classic panel key) or null = no bubble. */
  current: string | null
  runtime: { version: string | null; ok: boolean; path: string; override?: boolean }
  runningCount: number
  totalCount: number
  /** Deep-link tab within the opened panel (help `diagnose`, settings `view`, ...). */
  initialTab?: string | null
  /** Pending-update count -> the 帮助 badge. */
  outdatedCount?: number
  isDark?: boolean
}>()

const emit = defineEmits<{
  'open-panel': [group: string | null]
  'toggle-theme': []
  'open-palette': []
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  'preview-site': [url: string]
  'check-updates': []
  'open-page': [id: string]
  'open-terminal': [id: string]
  close: []
}>()

// One icon per top-level group; sub-functions live inside the classic popup's tabs (not the rail).
const groups = computed<QQGroup[]>(() => buildNav(props.pages))

// Fixed bottom slot, top→bottom: 帮助 then 设置. Both are pulled out of the scrolling list so the
// two least-reached utilities stay pinned under a divider (帮助 above 设置).
const pinned = computed<QQGroup[]>(() => [HELP_GROUP, SETTINGS_GROUP])

function groupLabel(g: QQGroup): string {
  return parseAppPanel(g.group) ? g.leaves[0].labelKey : t(g.labelKey)
}

function onIconClick(g: QQGroup): void {
  emit('open-panel', props.current === g.group ? null : g.group)
}

const shellRef = ref<HTMLElement | null>(null)
const POP_MARGIN = 10
/**
 * The bubble keeps a *fixed* height and an anchored top so it never re-flows as panel content
 * loads — a content-sized card that re-centres on every async render was the source of the jitter.
 * Both are recomputed only when the group changes or the window resizes: vertical alignment is by
 * ROW (top-row groups pin the bubble to the top-left, bottom-row 帮助/设置 pin it to the bottom-left)
 * and a caret offset still points the bubble back at whichever icon is active.
 */
const popHeight = ref(600)
const popTop = ref(0)
const caretTop = ref(0)

/**
 * The 看板 page is palette-only (Ctrl+K) — it has no rail icon, so the rail-anchored bubble would
 * fall back to a stale top with a caret pointing at nothing. Center it as a modal-like card and
 * give it an explicit ✕ (there is no active icon to click again to dismiss it).
 */
const isBoard = computed(() => props.current === 'board')
const wrapStyle = computed<Record<string, string> | null>(() =>
  isBoard.value ? null : { top: `${popTop.value}px`, height: `${popHeight.value}px` }
)

function layoutPop(): void {
  const shell = shellRef.value
  if (!shell) return
  const avail = shell.clientHeight || window.innerHeight
  // Shorter fixed box than a full-height column: the panel scrolls inside it rather than growing
  // (a content-driven height was what made the anchored card jitter as async content landed).
  popHeight.value = Math.max(240, Math.min(420, avail - 24))
  if (!props.current) return
  // Vertical alignment is by ROW, not by icon: a top-row group icon pins its bubble to the
  // top-left, a bottom-row pinned icon (帮助/设置) pins theirs to the bottom-left. The caret still
  // points back at whichever icon is active.
  const footBtn = shell.querySelector<HTMLElement>('.foot-btn.active')
  const btn = footBtn || shell.querySelector<HTMLElement>('.rail-btn.active')
  if (!btn) return
  const shellRect = shell.getBoundingClientRect()
  const btnRect = btn.getBoundingClientRect()
  const center = btnRect.top - shellRect.top + btnRect.height / 2
  const maxTop = Math.max(POP_MARGIN, shellRect.height - popHeight.value - POP_MARGIN)
  popTop.value = footBtn ? maxTop : POP_MARGIN
  caretTop.value = Math.min(Math.max(center - popTop.value, 16), popHeight.value - 16)
}

watch(
  () => [props.current, groups.value.length],
  () => nextTick(layoutPop)
)

// Click-away dismiss: a bubble opened from the rail should close when the user clicks any blank
// surface outside it, matching the classic floating panels (the rail popup used to linger until
// its icon was clicked again). Rail buttons own their own toggle/switch and Element Plus teleports
// its dropdowns / dialogs / message boxes into <body> *outside* the card, so both are excluded — a
// click on them must never read as "clicked away". pointerdown (not click) so an in-card drag that
// ends outside (an el-slider thumb) doesn't dismiss it.
function onDocPointerDown(e: PointerEvent): void {
  // The 看板 page is a deliberate, palette-only modal: a stray blank-area click must NOT dismiss
  // it (there is no rail icon to re-click either). Only its ✕ / Esc close it.
  if (isBoard.value) return
  const el = e.target as HTMLElement | null
  if (!el) return
  if (el.closest('.qq-pop, .qq-rail')) return
  if (el.closest('.el-popper, .el-overlay, .el-dialog, .el-message-box')) return
  emit('open-panel', null)
}

watch(
  () => props.current,
  (cur) => {
    if (cur) document.addEventListener('pointerdown', onDocPointerDown, true)
    else document.removeEventListener('pointerdown', onDocPointerDown, true)
  }
)
onMounted(() => {
  layoutPop()
  window.addEventListener('resize', layoutPop)
  if (props.current) document.addEventListener('pointerdown', onDocPointerDown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', layoutPop)
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
</script>

<template>
  <div ref="shellRef" class="qq-shell">
    <nav class="qq-rail" aria-label="IM navigation">
      <div class="rail-scroll">
        <el-tooltip
          v-for="g in groups"
          :key="g.group"
          :content="groupLabel(g)"
          placement="right"
          popper-class="dsh-tip-popper"
        >
          <button
            class="rail-btn"
            :class="{ active: current === g.group }"
            type="button"
            :aria-label="groupLabel(g)"
            :aria-pressed="current === g.group"
            @click="onIconClick(g)"
          >
            <el-icon class="rail-ico"><component :is="g.icon" /></el-icon>
            <span v-if="g.badgeFromOutdated && outdatedCount" class="rail-badge">{{
              outdatedCount
            }}</span>
          </button>
        </el-tooltip>
      </div>

      <div class="rail-foot">
        <el-tooltip
          v-for="g in pinned"
          :key="g.group"
          :content="t(g.labelKey)"
          placement="right"
          popper-class="dsh-tip-popper"
        >
          <button
            class="foot-btn"
            :class="{ active: current === g.group }"
            type="button"
            :aria-label="t(g.labelKey)"
            :aria-pressed="current === g.group"
            @click="onIconClick(g)"
          >
            <el-icon><component :is="g.icon" /></el-icon>
            <span v-if="g.badgeFromOutdated && outdatedCount" class="foot-badge">{{
              outdatedCount
            }}</span>
          </button>
        </el-tooltip>
      </div>
    </nav>

    <!-- Floating bubble panel: the classic MenuPanelContent card, anchored beside the rail. -->
    <div
      v-if="current"
      class="qq-pop-wrap"
      :class="{ 'is-centered': isBoard }"
      :style="wrapStyle"
    >
      <section class="qq-pop glass" role="dialog" aria-modal="false">
        <span v-if="!isBoard" class="qq-caret" :style="{ top: caretTop + 'px' }" aria-hidden="true" />
        <header v-if="isBoard" class="qq-pop-head">
          <span class="qq-pop-title">{{ t('menu.board') }}</span>
          <el-tooltip
            :content="t('menu.closeEsc')"
            placement="bottom"
            popper-class="dsh-tip-popper"
          >
            <button
              type="button"
              class="qq-pop-close"
              :aria-label="t('menu.closeEsc')"
              @click="emit('open-panel', null)"
            >
              ✕
            </button>
          </el-tooltip>
        </header>
        <div class="qq-pop-body">
          <MenuPanelContent
            :panel="current"
            tab-position="top"
            :runtime="runtime"
            :running-count="runningCount"
            :total-count="totalCount"
            :initial-tab="initialTab ?? undefined"
            @apply-theme="(m) => emit('apply-theme', m)"
            @preview-site="(u) => emit('preview-site', u)"
            @check-updates="emit('check-updates')"
            @open-page="(id) => emit('open-page', id)"
            @open-terminal="(id) => emit('open-terminal', id)"
            @close="emit('open-panel', null)"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.qq-shell {
  position: relative;
  display: flex;
  align-items: stretch;
  height: 100%;
  min-height: 0;
  flex: none;
}

/* Icon-only rail: a narrow vertical strip of group icons (no text, no tab strip). */
.qq-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  flex: none;
  min-height: 0;
  padding: 8px 0 6px;
  -webkit-app-region: drag;
  background: rgb(var(--glass-tint-rgb) / calc(var(--glass-tint-a, 0.82) * 0.6));
  border-right: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
}
.rail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  -webkit-app-region: no-drag;
}
.rail-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.rail-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.rail-btn.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.rail-ico {
  font-size: 19px;
}
.rail-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--warn);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.rail-foot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
  -webkit-app-region: no-drag;
}
.foot-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-dim);
  font-size: 16px;
  cursor: pointer;
}
.foot-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.foot-btn.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
/* Pending-update count on the pinned 帮助 button (mirrors the rail badge, scaled to the
   smaller foot button). */
.foot-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--warn);
  color: #fff;
  font-size: 9px;
  line-height: 14px;
  text-align: center;
}

/* Floating bubble: a wide frosted card anchored beside the rail at the active icon's height. Its
   top + height come from the inline style (fixed), so the card itself just fills that box. */
.qq-pop-wrap {
  position: absolute;
  left: 48px;
  display: flex;
  align-items: stretch;
  z-index: 70;
  pointer-events: none;
}
.qq-pop {
  position: relative;
  pointer-events: auto;
  margin-left: 10px;
  /* Every popup shares one fixed width in sidebar mode. Fitting the card to each panel's content
     made it resize on every tab switch and let wide rows (MCP tool lists, long event details) drag
     the card to full-bleed — a single constant width keeps the rail-anchored card stable; anything
     wider than the box scrolls inside its body/pane rather than re-fitting the card. */
  width: min(760px, calc(100vw - 64px));
  min-width: 0;
  max-width: calc(100vw - 64px);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent) inset,
    0 18px 60px color-mix(in srgb, var(--accent) 16%, transparent);
  animation: qq-pop-in 0.24s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
/* Scroll host. Panels WITHOUT tabs scroll the body. Panels WITH tabs instead fill the body and let
   only the tab pane scroll (see the `:has(.el-tabs)` block) — so the vertical tab rail stays put and
   never slides with the content, which is what the whole-body scroll did before. */
.qq-pop-body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 10px 12px 12px;
}
/* Tabbed panel: pin the card (no body scroll) and stretch the chain down to the scrollable pane. */
.qq-pop-body:has(.el-tabs) {
  overflow: hidden;
}
.qq-pop-body:has(.el-tabs) :deep(.panel-content),
.qq-pop-body:has(.el-tabs) :deep(.sec),
.qq-pop-body:has(.el-tabs) :deep(.settings-panel),
.qq-pop-body:has(.el-tabs) :deep(.page-manager),
.qq-pop-body:has(.el-tabs) :deep(.dsh-manager) {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.qq-pop-body :deep(.panel-content) {
  min-width: 0;
}
.qq-pop-body :deep(.el-tabs) {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
/* Only the content column to the right of the rail scrolls. */
.qq-pop-body :deep(.el-tabs__content) {
  overflow: auto;
  min-width: 0;
}

/* ---- per-panel popup fixes ---- */
/* MCP hub: only the card list scrolls; the title row + bridge hint stay fixed above it.
   The chain runs body → .panel-content → .sec → .mcp-manager → .server-list, so every link
   must be a bounded flex column (min-height:0) or .server-list never gets a scroll height. */
.qq-pop-body:has(.mcp-manager) {
  overflow: hidden;
}
.qq-pop-body:has(.mcp-manager) :deep(.panel-content),
.qq-pop-body:has(.mcp-manager) :deep(.sec),
.qq-pop-body:has(.mcp-manager) :deep(.mcp-manager) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.qq-pop-body:has(.mcp-manager) :deep(.server-list) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}
/* Shared workspace: pin the title + 工作区目录 line (`.ws-top`) and scroll only the task/note
   cards below (`.ws-body`). The component wraps those two regions, so the popup just flexes the
   chain and scrolls `.ws-body` — no fragile sticky-on-variable-height header. In classic mode the
   wrappers are unstyled divs, so the panel flows exactly as before. */
.qq-pop-body:has(.ws-manager) {
  overflow: hidden;
}
.qq-pop-body:has(.ws-manager) :deep(.panel-content),
.qq-pop-body:has(.ws-manager) :deep(.sec),
.qq-pop-body:has(.ws-manager) :deep(.ws-manager) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.qq-pop-body:has(.ws-manager) :deep(.ws-manager) {
  overflow: hidden;
}
.qq-pop-body:has(.ws-manager) :deep(.ws-top) {
  flex: none;
}
.qq-pop-body:has(.ws-manager) :deep(.ws-body) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
/* Run-log timeline + raw <pre> + events list: drop the nested max-height so each grows inside the
   help pane and only the pane itself scrolls (one scrollbar, not a box inside a box). */
.qq-pop-body :deep(.lv-timeline),
.qq-pop-body :deep(.lv-pre),
.qq-pop-body :deep(.evt-list) {
  max-height: none;
}
/* Events timeline: a long single-line detail used to drag the whole card to its max-content
   width; let it wrap inside the capped pane instead. */
.qq-pop-body :deep(.evt-text),
.qq-pop-body :deep(.evt-detail) {
  overflow-wrap: anywhere;
  word-break: break-word;
}
/* A small caret pointing back at the rail so the card reads as a bubble. */
.qq-caret {
  position: absolute;
  left: -7px;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translateY(-50%) rotate(45deg);
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.72));
  border-left: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
}
@keyframes qq-pop-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* ---- centered 看板 card, positioned like the classic floating panel (top-center) ---- */
/* The classic card drops in at `top:100%` of the menu bar with `margin:4px auto` — i.e. horizontally
   centred across the window, hugging the top under the bar. `.qq-shell` already starts below the
   title bar, so `top:4px` there reproduces that offset; but the shell is only the 48px rail wide,
   so we span `width:100vw` (its left edge is the window's) and top-align + centre to mirror classic
   rather than floating the card in the vertical middle. */
.qq-pop-wrap.is-centered {
  position: absolute;
  top: 4px;
  bottom: 8px;
  left: 0;
  width: 100vw;
  align-items: flex-start;
  justify-content: center;
}
.qq-pop-wrap.is-centered .qq-pop {
  margin-left: 0;
  height: auto;
  max-height: 100%;
  width: min(860px, calc(100vw - 24px));
  animation: qq-pop-center-in 0.24s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.qq-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
}
.qq-pop-title {
  font-size: 14px;
  font-weight: 600;
}
.qq-pop-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.qq-pop-close:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
@keyframes qq-pop-center-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
