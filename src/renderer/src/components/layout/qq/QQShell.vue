<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MenuPanelContent from '@renderer/components/panels/MenuPanelContent.vue'
import { buildNav, type QQGroup } from './qqNav'
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
const props = withDefaults(
  defineProps<{
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
    /**
     * Where the rail docks (设置 ▸ 布局 ▸ 侧边栏位置, IM layout only):
     * 'left' (default) = edge column + bubble to its right (status quo); 'right' = edge column on
     * the right edge + bubble opening right→left; 'bottom' = floating pill centred on the bottom
     * edge (content keeps full width) + bubble centred above it.
     */
    sidebarPosition?: 'left' | 'right' | 'bottom'
  }>(),
  { sidebarPosition: 'left' }
)

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
// 帮助 / 设置 are part of the list now (buildNav tail), so the rail has no separate foot slot.
const groups = computed<QQGroup[]>(() => buildNav(props.pages))

function groupLabel(g: QQGroup): string {
  return parseAppPanel(g.group) ? g.leaves[0].labelKey : t(g.labelKey)
}

/** Tooltips open toward the content: the edge modes sit opposite, the bottom pill points up. */
const tooltipPlacement = computed(() =>
  props.sidebarPosition === 'bottom'
    ? 'top'
    : props.sidebarPosition === 'right'
      ? 'left'
      : 'right'
)

function onIconClick(g: QQGroup): void {
  emit('open-panel', props.current === g.group ? null : g.group)
}

const shellRef = ref<HTMLElement | null>(null)
const POP_MARGIN = 10
/**
 * Bottom dock geometry, mirrored by the CSS below. The strip is an in-flow hover row (13px — the
 * content gives up only its 4px home indicator) and the pill floats 3px clear of its top edge;
 * DOCK_FLOOR is the open pill's top measured from the window's bottom edge: the pill (38px icons +
 * 2×6 padding + 2 border) sits with its bottom 16px off the edge, and the card clears it by 10px —
 * so the bubble never covers the dock it was opened from.
 */
const DOCK_FLOOR = 78
const isBottom = computed(() => props.sidebarPosition === 'bottom')
/**
 * Bottom mode is an iOS-style dock: it rests as a bare home indicator on the bottom edge (a
 * transparent, in-flow row — the content keeps everything but those few pixels) and expands into
 * the icon pill while the pointer dwells on it. The dwell/leave delays below are the whole
 * interaction — hovering past the dock with a short pass must not flicker it open, and leaving
 * must not snap it shut mid-reach.
 */
const railCollapsed = ref(props.sidebarPosition === 'bottom')
/** Grace before expanding on hover: filters accidental fly-throughs of the bottom edge. */
const RAIL_EXPAND_DELAY = 120
/** Dwell after the pointer leaves before it collapses back to the indicator. */
const RAIL_COLLAPSE_DELAY = 700
let expandTimer: ReturnType<typeof setTimeout> | null = null
let collapseTimer: ReturnType<typeof setTimeout> | null = null
/** Is the pointer currently on the strip / inside the pill? Tracked so a retract scheduled the
 *  moment a bubble closes can't yank the dock out from under a hand that is still on it. */
let pointerOnRail = false
function clearRailTimers(): void {
  if (expandTimer) clearTimeout(expandTimer)
  if (collapseTimer) clearTimeout(collapseTimer)
  expandTimer = collapseTimer = null
}
function openRail(): void {
  clearRailTimers()
  railCollapsed.value = false
}
/**
 * Debounce for the retract. Several surfaces can request it for one real departure (leaving the
 * strip, leaving the bubble, a click-away, and Chromium's spurious leave when the pill
 * materialises under the cursor with its `visibility`/`pointer-events` flip). They all funnel
 * through here, so they coalesce into a single pending timer instead of arming one per event, and
 * a request whose pointer is still inside the shell is dropped as noise.
 */
function scheduleRailClose(source?: Event | null): void {
  if (!isBottom.value) return
  // Leaving always calls off a scheduled expand first — that fly-through case is exactly what the
  // grace window is waiting on, and it has to be cancelled from whatever open state we're in.
  if (expandTimer) {
    clearTimeout(expandTimer)
    expandTimer = null
  }
  // An open bubble pins the dock: the card floats right above the pill, so a retract here would
  // leave the open panel with no visible owner and flicker the row for nothing.
  if (props.current || railCollapsed.value) return
  // Still inside the shell (the pill, the bubble): not a departure at all.
  const next = (source as PointerEvent | undefined | null)?.relatedTarget as Node | null
  if (next && shellRef.value?.contains(next)) return
  clearRailTimers()
  collapseTimer = setTimeout(() => {
    railCollapsed.value = true
    collapseTimer = null
  }, RAIL_COLLAPSE_DELAY)
}
function onRailEnter(): void {
  if (!isBottom.value) return
  pointerOnRail = true
  if (expandTimer || collapseTimer) clearRailTimers()
  else if (!railCollapsed.value) return // already dwelled open — nothing pending
  expandTimer = setTimeout(() => {
    expandTimer = null
    openRail()
  }, RAIL_EXPAND_DELAY)
}
function onRailLeave(e?: PointerEvent): void {
  // Only a departure that lands outside the rail itself counts; hopping into the pill doesn't.
  const next = e?.relatedTarget as Node | null
  const rail = shellRef.value?.querySelector<HTMLElement>('.qq-rail')
  if (!(next && rail?.contains(next))) pointerOnRail = false
  scheduleRailClose(e ?? null)
}
/** Indicator tap = same expand dwell, just without needing to hover-and-wait. */
function toggleRail(): void {
  if (!isBottom.value) return
  openRail()
}
// A bubble owns the dock: opening one (icon, palette, deep link) forces the pill out; closing it
// hands the dock back to the leave dwell — unless the pointer is still resting on it.
watch(
  () => [props.current, props.sidebarPosition] as const,
  ([cur, pos]) => {
    if (pos !== 'bottom') return
    if (cur) openRail()
    // Closed: back to the leave dwell — but never yank the pill out from under a pointer that is
    // still resting on it; its own pointerleave will do that.
    else if (!pointerOnRail) scheduleRailClose(null)
  },
  { immediate: true }
)
function onBubbleMouseEnter(): void {
  if (!isBottom.value) return
  openRail()
}
// A pointerdown inside the card counts as dwelling on the dock too (no hover on the webview).
function onBubblePointerDown(): void {
  onBubbleMouseEnter()
}
function onBubbleLeave(e?: MouseEvent): void {
  scheduleRailClose(e ?? null)
}
// Edge modes have no dock to retract; leaving bottom mode (or remounting) always shows the rail.
watch(
  () => props.sidebarPosition,
  (pos) => {
    clearRailTimers()
    railCollapsed.value = pos === 'bottom'
  }
)
/**
 * The bubble keeps a *fixed* height so it never re-flows as panel content loads — a content-sized
 * card that re-centres on every async render was the source of the jitter. Edge modes (left/right)
 * anchor it flush below the title bar with a caret that tracks the active icon; bottom mode
 * centres it above the floating pill instead (CSS + these constants, no per-icon math).
 */
const popHeight = ref(600)
const popTop = ref(0)
const caretTop = ref(0)

/**
 * Every group behaves like one bubble: rail-anchored with a caret, dismissed by re-clicking the
 * icon or clicking away. Bottom mode places the card via CSS (fixed, centred) so only the fixed
 * height flows through here.
 */
const wrapStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = { height: `${popHeight.value}px` }
  if (!isBottom.value) style.top = `${popTop.value}px`
  return style
})

/** The caret's inline top only applies to the edge modes; bottom mode positions it in CSS. */
const caretStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (!isBottom.value) style.top = `${caretTop.value}px`
  return style
})

function layoutPop(): void {
  const shell = shellRef.value
  if (!shell) return
  // Bottom mode turns the shell into a short in-flow strip, so the bubble's box is measured
  // against the row it floats in (shell-body), not against the shell itself.
  const avail = shell.parentElement?.clientHeight || shell.clientHeight || window.innerHeight
  // Shorter fixed box than a full-height column: the panel scrolls inside it rather than growing
  // (a content-driven height was what made the anchored card jitter as async content landed).
  // Bottom mode only has to clear the strip + the open pill it rises above.
  const reserve = isBottom.value ? DOCK_FLOOR + POP_MARGIN : POP_MARGIN
  popHeight.value = Math.max(240, Math.min(420, avail - reserve - 14))
  if (!props.current || isBottom.value) return
  // Edge modes: one anchor — the bubble always sits flush below the title bar, so switching to
  // a tail row (帮助 / 设置) never re-seats the card. The caret tracks the active icon instead —
  // clamped into the bubble when the icon itself is below it.
  const btn = shell.querySelector<HTMLElement>('.rail-btn.active')
  if (!btn) return
  const shellRect = shell.getBoundingClientRect()
  const btnRect = btn.getBoundingClientRect()
  const center = btnRect.top - shellRect.top + btnRect.height / 2
  popTop.value = POP_MARGIN
  caretTop.value = Math.min(Math.max(center - popTop.value, 16), popHeight.value - 16)
}

watch(
  () => [props.current, props.sidebarPosition, groups.value.length],
  () => nextTick(layoutPop)
)

// Click-away dismiss: a bubble opened from the rail should close when the user clicks any blank
// surface outside it, matching the classic floating panels (the rail popup used to linger until
// its icon was clicked again). Rail buttons own their own toggle/switch and Element Plus teleports
// its dropdowns / dialogs / message boxes into <body> *outside* the card, so both are excluded — a
// click on them must never read as "clicked away". pointerdown (not click) so an in-card drag that
// ends outside (an el-slider thumb) doesn't dismiss it.
function onDocPointerDown(e: PointerEvent): void {
  const el = e.target as HTMLElement | null
  if (!el) return
  if (el.closest('.qq-pop, .qq-rail')) return
  if (el.closest('.el-popper, .el-overlay, .el-dialog, .el-message-box')) return
  emit('open-panel', null)
  // The watch on `current` owns the dock retract from here: it fires once the parent has actually
  // closed the bubble and drops the pin.
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
  clearRailTimers()
})
</script>

<template>
  <div
    ref="shellRef"
    class="qq-shell"
    :class="[
      `pos-${sidebarPosition}`,
      { 'rail-collapsed': railCollapsed, 'rail-open': !railCollapsed && isBottom }
    ]"
  >
    <nav
      class="qq-rail"
      aria-label="IM navigation"
      @pointerenter="onRailEnter"
      @pointerleave="onRailLeave"
    >
      <div class="rail-scroll">
        <el-tooltip
          v-for="g in groups"
          :key="g.group"
          :content="groupLabel(g)"
          :placement="tooltipPlacement"
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
      <!-- Bottom dock's resting affordance: an iOS home-indicator bar. It stays mounted in both
           states so the swap is one continuous animation — collapsed it is a slim centred bar,
           expanded it shrinks away as the icon row grows out of it. Tapping it dwells the dock
           open for anyone who can't hover the exact bottom edge. -->
      <el-tooltip
        v-if="isBottom"
        :content="t('menu.railExpand')"
        placement="top"
        popper-class="dsh-tip-popper"
      >
        <button
          class="rail-handle"
          type="button"
          :aria-label="t('menu.railExpand')"
          :aria-expanded="!railCollapsed"
          @click="toggleRail"
        />
      </el-tooltip>
    </nav>

    <div v-if="current" class="qq-pop-wrap" :style="wrapStyle">
      <section
        class="qq-pop glass"
        role="dialog"
        aria-modal="false"
        @mouseenter="onBubbleMouseEnter"
        @pointerdown="onBubblePointerDown"
        @mouseleave="onBubbleLeave"
      >
        <span class="qq-caret" :style="caretStyle" aria-hidden="true" />
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
  /* Must be lifted out of the normal flow's paint phase: `.aurora` is `position: fixed; z-index: 0`,
     and a *static* element's background paints before positioned z-index:0 siblings — so without
     this the ambient blobs were drawn ON TOP of the rail, and the rail's own `backdrop-filter` could
     only sample the bare window behind them (nothing to frost). That is why the top bar — which has
     `position: relative; z-index: 60` — frosted the aurora properly while the rail read as a flat,
     blob-tinted strip. Same level as the top bar now; `.content` gets its own lift in App.vue.
     Bottom mode overrides this with its own `position: relative; z-index: 69`. */
  position: relative;
  z-index: 60;
  /* One frosted edge-chrome recipe with the classic top bar (`.menubar`) and every `.glass` panel:
     full tint, full blur radius, the same saturate curve. The dock used to sit on the lighter
     `.glass-soft` numbers, which made the two bars frost differently at the same 毛玻璃 setting. */
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.82));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  border-right: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  /* The bottom dock fades its chrome between the resting handle and the hovered card. */
  transition:
    background 0.28s ease,
    border-color 0.28s ease;
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
  background: var(--dsh-wash-hover);
  -webkit-backdrop-filter: var(--dsh-wash-frost);
  backdrop-filter: var(--dsh-wash-frost);
}
.rail-btn.active {
  /* Active = same resting wash as every other selected surface (tab rail / dropdown), told
     apart by the accent foreground rather than a heavier block. */
  color: var(--accent);
  background: var(--dsh-wash);
}
.rail-ico {
  font-size: 19px;
  /* Pinned so the sliding dock clips icons out of view instead of squashing the glyphs. */
  flex-shrink: 0;
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
.qq-pop-body:has(.el-tabs) :deep(.task-board),
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
/* DSH 插件管理 pane: the bubble has a JS-fixed height, so the table's viewport-relative cap
   (classic) overshot the pane and grew a second scrollbar next to the table's own. Take the pane
   out of flow (inset:0 filling `.el-tabs__content`, which EP already gives a bounded flex height
   under the top tab header), make it a bounded flex column and let the table — capped at
   max-height:100% by DshManager in this mode — shrink into the leftover space: the install card +
   toolbar stay pinned and ONLY the table body scrolls (verified in headless Chromium against the
   real EP css: pane 342 / table 160 / wrap 1086 scrollable, no pane or content scrollbar). Note
   the pane is a child of `.el-tabs__content`, NOT of `.el-tabs--top` — writing the parent as
   `.el-tabs--top` silently matches nothing, which left the content clipped with no way to scroll.
   The pane keeps `overflow:auto` as a floor: on a very short bubble the pinned card + toolbar can
   exceed it, and then the pane itself scrolls instead of hiding rows. Siblings are pinned with
   flex-shrink:0 so the shrinking lands on the table, not on the card. */
.qq-pop-body:has(.dsh-manager) :deep(.el-tabs__content .dsh-plugins-pane) {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.qq-pop-body:has(.dsh-manager) :deep(.dsh-plugins-pane .install-card),
.qq-pop-body:has(.dsh-manager) :deep(.dsh-plugins-pane .plugin-tools),
.qq-pop-body:has(.dsh-manager) :deep(.dsh-plugins-pane .op-progress) {
  flex-shrink: 0;
}
.qq-pop-body:has(.dsh-manager) :deep(.dsh-plugins-pane .el-table) {
  flex: 1 1 auto;
  min-height: 0;
}
/* 页面管理「顶栏显示」pane: the same JS-fixed-height-bubble problem as the DSH plugin table — a
   viewport-relative cap overshoots the pane, so the table's own scrollbar and the pane's appear
   together. Pin the heading / tip banner / 全部显示 row at the top and let the table (capped at
   max-height:100% by PageManager in this mode) eat the leftover, so ONLY the rows scroll and only
   one scrollbar shows. `.switcher-wrap` needs a definite height (`height: 100%`) or the table's
   100% cap resolves against an auto-sized parent and bounds nothing. The pane stays absolute
   inset:0 inside `.el-tabs__content` (panes are children of the content box, NOT of
   `.el-tabs--top` — that parent silently matches nothing) and keeps `overflow: auto` as a floor:
   on a very short bubble the pinned rows can exceed it, and then the pane scrolls instead of
   hiding entries. */
.qq-pop-body:has(.page-manager) :deep(.el-tabs__content .pm-switcher-pane) {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.qq-pop-body:has(.page-manager) :deep(.pm-switcher-pane .switcher-wrap) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.qq-pop-body:has(.page-manager) :deep(.switcher-wrap > .hint),
.qq-pop-body:has(.page-manager) :deep(.switcher-wrap > .switcher-tip),
.qq-pop-body:has(.page-manager) :deep(.switcher-wrap > .switcher-actions) {
  flex: none;
}
.qq-pop-body:has(.page-manager) :deep(.switcher-wrap > .el-table) {
  flex: 1 1 auto;
  min-height: 0;
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

/* ---- rail docking modes (设置 ▸ 布局 ▸ 侧边栏位置; 'left' is every base rule above) ---- */

/* Right: the shell is the last flex item of .shell-body (order), so the column hugs the right
   edge and the divider moves to its content-facing side. */
.qq-shell.pos-right {
  order: 2;
}
.qq-shell.pos-right .qq-rail {
  border-right: none;
  border-left: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
}
/* The bubble opens right→left: anchored to the rail's left side, caret on the card's right edge
   (the diamond shows its NE/SE faces), entry slide mirrored to come from the right. */
.qq-shell.pos-right .qq-pop-wrap {
  left: auto;
  right: 48px;
}
.qq-shell.pos-right .qq-pop {
  margin-left: 0;
  margin-right: 10px;
  animation-name: qq-pop-in-right;
}
@keyframes qq-pop-in-right {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
.qq-shell.pos-right .qq-caret {
  left: auto;
  right: -7px;
  border-left: none;
  border-top: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  border-right: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
}

/* Bottom: an in-flow strip across the window's bottom edge (13px; DOCK_FLOOR in the script mirrors
   the rest of the geometry) — it reserves its own height instead of floating over the page. The row
   behind the indicator is a themed plate on the same opacity curve as the classic top bar
   (`--glass-tint-a`, so the 毛玻璃 slider moves both together), fading out at *both* edges. The
   bottom fade is not decoration: dark theme paints a window-edge marquee ring (`.win-edge`, fixed,
   `z-index: 9999`, 1px inset / 2px stroke) straight through this row and the plate can never
   out-stack the frame — starting the colour above that line keeps the ring reading as the window
   frame instead of being sliced by the dock. The plate deliberately carries no `backdrop-filter`:
   it sits on `.qq-shell`, which is the containing block of the pill and the bubble, and a
   `backdrop-filter` here would turn that into a backdrop root and clip *their* frosting to this
   13px band. The iOS home indicator inside it is the accent graded across, and both follow the
   runtime theme with no JS. The icon rail is a pill that rises out of the strip on hover, so
   opening it never reflows the content. */
.qq-shell.pos-bottom {
  width: 100%;
  height: auto;
  flex: none;
  background: linear-gradient(
    to top,
    transparent 20%,
    rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.82)) 45%,
    transparent
  );
}
.qq-shell.pos-bottom .qq-rail {
  position: relative;
  left: auto;
  bottom: auto;
  transform: none;
  z-index: 69;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 13px;
  padding: 0;
  border: none;
  background: transparent;
  /* The rail's frosting is for the edge columns only. A `backdrop-filter` blurs whatever is behind
     the element regardless of its own background, so leaving it on here would smudge a 13px band
     across the transparent strip; the plate above it owns the bottom-mode surface instead. */
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  box-shadow: none;
  /* The strip is window chrome at the bottom edge, not a drag handle. */
  -webkit-app-region: no-drag;
}
.qq-shell.pos-bottom .rail-scroll {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 3px);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  /* max-content, not auto: an absolutely positioned box with only `left` set shrink-wraps against
     the space remaining to the container's right edge — i.e. half the window — which squeezed the
     row into a wide band. The cap still keeps a long list inside the viewport. */
  width: max-content;
  max-width: calc(100vw - 32px);
  height: auto;
  padding: 6px 8px;
  overflow-x: auto;
  overflow-y: hidden;
  /* The row can outgrow the cap once many app panels are registered. Scroll it, but never show a
     bar: the pill is 52px tall, so a classic scrollbar would eat half of it and flash in and out
     as the row opens. `contain` stops a trackpad swipe from chaining onto the window. */
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 14px;
  /* Same material as the bubble card it belongs to (`.glass` in glass.css): full tint, full blur
     radius, one saturate curve — an earlier × 0.7 blur made the dock read lighter than the panel
     floating right above it. */
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.82));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset;
}
.qq-shell.pos-bottom .qq-pop-wrap {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  /* DOCK_FLOOR (78px from the window's bottom edge) minus the 13px strip this is measured from:
     the card starts above the open pill instead of burying it. */
  bottom: calc(100% + 65px);
  top: auto;
}
.qq-shell.pos-bottom .qq-pop {
  margin-left: 0;
  animation-name: qq-pop-in-bottom;
}
@keyframes qq-pop-in-bottom {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* The caret hangs off the card's bottom edge pointing down at the dock (SE/SW diamond faces). */
.qq-shell.pos-bottom .qq-caret {
  left: 50%;
  top: auto;
  bottom: -7px;
  transform: translate(-50%, 50%) rotate(45deg);
  border-left: none;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  border-right: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
}

/* ---- bottom dock: iOS home indicator + rising icon pill ---- */
/* The indicator is the strip's only resting content; edge modes have no strip at all (v-if gates it
   on isBottom, this rule makes the CSS agree). */
.qq-shell:not(.pos-bottom) .rail-handle {
  display: none;
}
/* The bar itself: no card, no glyph — a slim pill centred on the bottom edge, exactly like iOS's
   home indicator, graded across the accent (dim at both ends so it tapers into the strip instead of
   ending in a hard chip). Hovering saturates it and adds a glow as feedback that it is live. Both
   states read off `--accent` / `--accent-strong`, so a theme or accent change repaints it with no
   JS. */
.rail-handle {
  width: 100px;
  height: 4px;
  flex: none;
  border: none;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 28%, transparent),
    var(--accent) 32%,
    var(--accent-strong) 68%,
    color-mix(in srgb, var(--accent) 28%, transparent)
  );
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background 0.18s linear,
    box-shadow 0.18s linear,
    opacity 0.18s linear;
}
.rail-handle:hover {
  background: linear-gradient(
    90deg,
    var(--accent),
    var(--accent) 38%,
    var(--accent-strong) 62%,
    var(--accent)
  );
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent);
}
/* The pill's open/closed travel is one pure `translateY` + `opacity` pair — both interpolate on
   the compositor, so the slide reads as a single linear lift instead of stepping. Two things that
   used to live here caused the jitter: a `scaleY` (rescaling a backdrop-filtered box is recomputed
   per frame and looks like it wobbles), and a per-icon fade+lift on its own delay curve, which
   made ten tiles drift independently inside the moving pill. Both are gone; `will-change` keeps
   the pill on its own layer so the blur underneath isn't re-rasterised as a layout pass.
   `translateX(-50%)` rides along in both states because a transform transition replaces the whole
   property, centring included. Visibility is discrete, so it is switched with a delay on the way
   out (keeps the slide painted) and immediately on the way in. */
.qq-shell.pos-bottom .rail-scroll {
  opacity: 0;
  visibility: hidden;
  transform: translate3d(-50%, 14px, 0);
  pointer-events: none;
  will-change: transform, opacity;
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s linear,
    visibility 0s linear 0.3s;
}
.qq-shell.pos-bottom:not(.rail-collapsed) .rail-scroll {
  opacity: 1;
  visibility: visible;
  transform: translate3d(-50%, 0, 0);
  pointer-events: auto;
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.16s linear,
    visibility 0s;
}
/* Chromium still needs the pseudo-element rule; `scrollbar-width` alone leaves a 0-height bar
   that can still be dragged into view on some zoom levels. */
.qq-shell.pos-bottom .rail-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
</style>
