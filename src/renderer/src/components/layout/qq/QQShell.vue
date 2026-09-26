<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MenuPanelContent from '@renderer/components/panels/MenuPanelContent.vue'
import { buildNav, type QQGroup } from './qqNav'
import { parseAppPanel } from '@shared/types'
import type { PageState } from '@renderer/stores/pages'
import { reduceMotion } from '@renderer/stores/settings'
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
  'dock-open': [open: boolean]
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
  props.sidebarPosition === 'bottom' ? 'top' : props.sidebarPosition === 'right' ? 'left' : 'right'
)

function onIconClick(g: QQGroup): void {
  emit('open-panel', props.current === g.group ? null : g.group)
}

const shellRef = ref<HTMLElement | null>(null)
const POP_MARGIN = 10
/**
 * Bottom dock geometry, mirrored by the CSS below. The strip floats over the content (13px tall,
 * hit-testing only on the handle itself) and the pill floats 3px clear of its top edge;
 * DOCK_FLOOR is the open pill's top measured from the window's bottom edge: the pill (38px icons +
 * 2×6 padding + 2 border) sits with its bottom 16px off the edge, and the card clears it by 10px —
 * so the bubble never covers the dock it was opened from.
 */
const DOCK_FLOOR = 78
const isBottom = computed(() => props.sidebarPosition === 'bottom')
/**
 * Bottom mode is an iOS-style dock: it rests as a bare home indicator floating over the bottom
 * edge (the strip reserves no layout space and passes pointer events through — only the handle is
 * live) and expands into the icon pill while the pointer dwells on the handle. The dwell/leave
 * delays below are the whole interaction — hovering past the dock with a short pass must not
 * flicker it open, and leaving must not snap it shut mid-reach.
 */
const railCollapsed = ref(props.sidebarPosition === 'bottom')
/** Grace before expanding on hover: filters accidental fly-throughs of the bottom edge. */
const RAIL_EXPAND_DELAY = 120
/** Dwell after the pointer leaves before it collapses back to the indicator. */
const RAIL_COLLAPSE_DELAY = 700
/** Rest time after which the bare indicator dims to a near-invisible state. It shouldn't fade
 *  on a mere pause — and once dim the flash loop below keeps re-revealing it anyway. */
const RAIL_DIM_DELAY = 3000
let expandTimer: ReturnType<typeof setTimeout> | null = null
let collapseTimer: ReturnType<typeof setTimeout> | null = null
/** The resting indicator dims away while untouched and repaints on hover (bottom mode only). */
const railDimmed = ref(props.sidebarPosition === 'bottom')
let dimTimer: ReturnType<typeof setTimeout> | null = null
function scheduleDim(): void {
  if (dimTimer) clearTimeout(dimTimer)
  dimTimer = setTimeout(() => {
    dimTimer = null
    railDimmed.value = true
    // Resting dimmed is not "finished": the bar pulses back to full strength every so often so
    // it keeps announcing itself — counted off each dim edge, so a paused/stale interval from an
    // earlier rest never fires out of phase.
    scheduleRailFlash()
  }, RAIL_DIM_DELAY)
}
function clearDim(): void {
  if (dimTimer) clearTimeout(dimTimer)
  dimTimer = null
  clearRailFlash()
  railDimmed.value = false
}
/** Pulse period off the last dim edge, and how long one pulse stays lit before it fades back. */
const RAIL_FLASH_PERIOD = 15000
const RAIL_FLASH_HOLD = 450
let flashTimer: ReturnType<typeof setInterval> | null = null
let flashReset: ReturnType<typeof setTimeout> | null = null
function pulseRailFlash(): void {
  if (!railDimmed.value) return
  railDimmed.value = false
  if (flashReset) clearTimeout(flashReset)
  flashReset = setTimeout(() => {
    flashReset = null
    railDimmed.value = true
  }, RAIL_FLASH_HOLD)
}
function scheduleRailFlash(): void {
  if (flashTimer) clearInterval(flashTimer)
  flashTimer = setInterval(pulseRailFlash, RAIL_FLASH_PERIOD)
  flashTimer.unref?.()
}
function clearRailFlash(): void {
  if (flashTimer) clearInterval(flashTimer)
  flashTimer = null
  if (flashReset) clearTimeout(flashReset)
  flashReset = null
}
/**
 * Last pointer position, captured document-wide. The dock's own enter/leave bookkeeping and
 * even `:hover` go stale at a guest webview's edge (the guest eats the boundary event, and the
 * host's hover chain lingers under the pointer), which left a dock that never retracted once
 * the pointer slid off it through the page. This tracker is the arbiter: a retract re-checks
 * the real coordinates against the rail/pill rects before hiding the dock.
 */
const lastPointer = ref<{ x: number; y: number } | null>(null)
function onPointerTrack(e: PointerEvent): void {
  if (!isBottom.value) return
  lastPointer.value = { x: e.clientX, y: e.clientY }
  if (railCollapsed.value) {
    // The resting bar itself is a dock surface: pointer contact lifts its dim and holds the
    // countdown clock (dim + flash pulses) until it steps off again — the host gets no moves at
    // all while the pointer sits inside a guest webview, so this pauses cleanly.
    if (railHovered()) {
      if (railDimmed.value) clearDim()
    } else if (railDimmed.value && !expandTimer) {
      clearRailFlash()
      scheduleDim()
    }
    return
  }
  // Back over the dock: call off a pending retract (the dwell-open stays armed by its own
  // pointerenter; the pill never sits under the cursor without a pointer being on it).
  if (railHovered()) {
    clearRailFlash()
    if (collapseTimer) {
      clearTimeout(collapseTimer)
      collapseTimer = null
    }
    return
  }
  // An open dock the pointer just stepped off — even if the rail never saw a leave (a guest
  // webview ate the boundary event): schedule the normal dwell-delayed retract (a no-op while a
  // bubble pins it, see scheduleRailClose).
  if (!collapseTimer && !expandTimer) scheduleRailClose(null)
}
function onPointerGone(e: PointerEvent): void {
  // `pointerout` also bubbles on every element-to-element hop; only a null relatedTarget means
  // the pointer left the window entirely (no host surface under it to report a position).
  if (e.relatedTarget) return
  lastPointer.value = null
  // Gone is a departure like any other: hand the open dock back to its dwell-delayed retract
  // (no-op while collapsed or while a bubble pins it).
  scheduleRailClose(null)
}
/** Geometric point-in-rect test; `pad` bridges the few px gap between the strip and the pill.
 *  left/top/right/bottom are derived off x/y/width/height (with a fallback each way) so the
 *  test also works against a stubbed — or jsdom's sparse — DOMRect. */
function pointerInRect(x: number, y: number, el: Element | null, pad = 0): boolean {
  if (!el) return false
  const r = el.getBoundingClientRect()
  const left = r.left ?? r.x
  const top = r.top ?? r.y
  const right = r.right ?? left + r.width
  const bottom = r.bottom ?? top + r.height
  return x >= left - pad && x <= right + pad && y >= top - pad && y <= bottom + pad
}
function railHovered(): boolean {
  const shell = shellRef.value
  if (!shell) return false
  const p = lastPointer.value
  if (!p) return false
  // The pointer is on the dock only if it is over the strip or the open pill — the flag and
  // `:hover` may both be stale, so the coordinates alone decide it.
  const onRail = pointerInRect(p.x, p.y, shell.querySelector<HTMLElement>('.qq-rail'))
  const onPill = pointerInRect(p.x, p.y, shell.querySelector<HTMLElement>('.rail-scroll'), 8)
  return onRail || onPill
}
function clearRailTimers(): void {
  if (expandTimer) clearTimeout(expandTimer)
  if (collapseTimer) clearTimeout(collapseTimer)
  if (dimTimer) clearTimeout(dimTimer)
  expandTimer = collapseTimer = dimTimer = null
  clearRailFlash()
}
function openRail(): void {
  clearRailTimers()
  railDimmed.value = false
  railCollapsed.value = false
}
/**
 * Debounce for the retract. Several surfaces can request it for one real departure (leaving the
 * handle, leaving the bubble, a click-away, and Chromium's spurious leave when the pill
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
  // A leave that lands outside the shell is a confirmed departure onto page content — most often
  // an out-of-process <webview>, which eats every later host pointermove. Without this the tracked
  // coordinate would freeze at its last on-dock value and the callback's arbiter would veto the
  // retract forever. Drop it: if the pointer really comes back over the dock, the host sees the
  // next move and the tracker re-arms the dwell-open on its own.
  if (next) lastPointer.value = null
  clearRailTimers()
  collapseTimer = setTimeout(() => {
    collapseTimer = null
    // A pointer still resting on the rail (handle / open pill) owns the dock: drop this retract
    // — the pointermove tracker will schedule the next one the moment it steps off. Geometric
    // truth wins over the flag/`:hover`, both of which go stale at a webview's edge.
    if (railHovered()) return
    railCollapsed.value = true
    // Back at rest as a bare indicator: start its idle dim countdown.
    scheduleDim()
  }, RAIL_COLLAPSE_DELAY)
}
function onRailEnter(): void {
  if (!isBottom.value) return
  // The pointer found the handle: bring the indicator back to full strength.
  clearDim()
  if (expandTimer || collapseTimer) clearRailTimers()
  else if (!railCollapsed.value) return // already dwelled open — nothing pending
  expandTimer = setTimeout(() => {
    expandTimer = null
    openRail()
  }, RAIL_EXPAND_DELAY)
}
function onRailLeave(e?: PointerEvent): void {
  scheduleRailClose(e ?? null)
}
/** Indicator tap = same expand dwell, just without needing to hover-and-wait. */
function toggleRail(): void {
  if (!isBottom.value) return
  openRail()
}
/**
 * Immediate collapse for the click-away scrim (App.vue): a page click is a deliberate dismissal,
 * not an ambiguous hover exit, so it skips the dwell timer. Safe to call from anywhere — edge
 * modes have no retract, and an already-collapsed dock has nothing to do.
 */
function collapseRail(): void {
  if (!isBottom.value || railCollapsed.value) return
  clearRailTimers()
  railCollapsed.value = true
  scheduleDim()
}
// ---- macOS-style dock magnification (bottom mode) -------------------------------------------
// The pill's signature interaction: as the pointer travels along it, the icons nearest the cursor
// swell on a gaussian falloff (peak `MAG_PEAK` right under the pointer, easing back to 1 further
// out) and rise out of the dock base, exactly like the macOS Dock. It has to be JS because the
// curve depends on the live pointer x against every tile's centre. transform-origin: bottom center
// (see the CSS) anchors the growth so tiles pop upward, not sideways. 减少动效 skips it whole.
const MAG_PEAK = 0.45
const MAG_SIGMA = 46
function pillBtns(): HTMLElement[] {
  const pill = shellRef.value?.querySelector<HTMLElement>('.rail-scroll')
  return pill ? Array.from(pill.querySelectorAll<HTMLElement>('.rail-btn')) : []
}
function resetMagnify(): void {
  for (const b of pillBtns()) b.style.removeProperty('--mag')
}
function onPillMove(e: PointerEvent): void {
  if (!isBottom.value || railCollapsed.value || reduceMotion.value) return
  const x = e.clientX
  for (const b of pillBtns()) {
    const r = b.getBoundingClientRect()
    const d = x - (r.left + r.width / 2)
    const s = 1 + MAG_PEAK * Math.exp(-(d * d) / (2 * MAG_SIGMA * MAG_SIGMA))
    b.style.setProperty('--mag', s.toFixed(3))
  }
}
function onPillLeave(): void {
  resetMagnify()
}

// The scrim lives in App.vue (the guest page does too — the dock can't cover it itself), so the
// shell publishes its expanded state and App arms the click-away catcher on it.
watch(
  railCollapsed,
  (v) => {
    if (!isBottom.value) return
    emit('dock-open', !v)
    if (v) resetMagnify() // collapsed pill has nothing to un-magnify; clear stale inline scales
  },
  { immediate: true }
)
defineExpose({ collapseRail })
// A bubble owns the dock: opening one (icon, palette, deep link) forces the pill out; closing it
// hands the dock back to the leave dwell — unless the pointer is still resting on it.
watch(
  () => [props.current, props.sidebarPosition] as const,
  ([cur, pos]) => {
    if (pos !== 'bottom') return
    if (cur) openRail()
    // Closed: back to the leave dwell — but never yank the pill out from under a pointer that is
    // still resting on it; the coordinate check (not the flag) decides.
    else if (!railHovered()) scheduleRailClose(null)
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
    railDimmed.value = pos === 'bottom'
    // Entering bottom at rest: the bar is dimmed straight away, so start its periodic reveal
    // now (the initial mount does the same in onMounted).
    if (pos === 'bottom') scheduleRailFlash()
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
  // Bottom mode: the shell is a zero-height overlay pinned to the row's bottom edge, so the
  // bubble's box is measured against the row it floats over (shell-body).
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
  // Capture-phase pointer tracking for the dock's coordinate arbiter: capture sees the move even
  // when a host surface (or its own handler) would stop it, and a `pointerout` with no target
  // means the pointer physically left the window — no last position to trust anymore.
  window.addEventListener('pointermove', onPointerTrack, true)
  document.addEventListener('pointerout', onPointerGone)
  // A fresh bottom-mode bar is born dimmed at rest: arm its periodic reveal so it keeps
  // announcing itself until the pointer finds it.
  if (props.sidebarPosition === 'bottom') scheduleRailFlash()
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerTrack, true)
  document.removeEventListener('pointerout', onPointerGone)
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
    <!-- The leave is tracked on the whole dock, not the handle: once open, the pointer rests on
         the pill, and a child-level leave (which doesn't bubble) would never reach the handle.
         `pointerleave` fires only when the pointer exits the entire subtree, so pill↔handle hops
         stay silent. -->
    <nav class="qq-rail" aria-label="IM navigation" @pointerleave="onRailLeave">
      <div class="rail-scroll" @pointermove="onPillMove" @pointerleave="onPillLeave">
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
           expanded it shrinks away as the icon row grows out of it. It is also the strip's only
           hover trigger: dwelling on the bar (not the empty row beside it) expands the dock, and
           tapping does the same for anyone who can't hover the exact bottom edge. -->
      <el-tooltip
        v-if="isBottom"
        :content="t('menu.railExpand')"
        placement="top"
        popper-class="dsh-tip-popper"
      >
        <button
          class="rail-handle"
          :class="{ dimmed: railDimmed }"
          type="button"
          :aria-label="t('menu.railExpand')"
          :aria-expanded="!railCollapsed"
          @pointerenter="onRailEnter"
          @pointerleave="onRailLeave"
          @click="toggleRail"
        />
      </el-tooltip>
    </nav>

    <Transition name="qqpop">
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
    </Transition>
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
  /* background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.82)); */
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  /* backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80)); */
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
  /* Open/close is a Vue <Transition name="qqpop"> on the wrap, but it transforms THIS card (which
     carries no base transform of its own), so it never fights the wrap's centring / top placement.
     The card grows out of whichever edge it is anchored to — origin below, per dock mode. */
  transform-origin: left center;
}
.qqpop-enter-active .qq-pop {
  transition:
    opacity 0.16s ease,
    transform 0.3s cubic-bezier(0.34, 1.42, 0.5, 1);
}
.qqpop-leave-active .qq-pop {
  transition:
    opacity 0.13s ease,
    transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.qqpop-enter-from .qq-pop,
.qqpop-leave-to .qq-pop {
  opacity: 0;
  transform: scale(0.96);
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
  transform-origin: right center;
}
.qq-shell.pos-right .qq-caret {
  left: auto;
  right: -7px;
  border-left: none;
  border-top: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  border-right: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
}

/* Bottom: a hover strip floating over the window's bottom edge (13px; DOCK_FLOOR in the script
   mirrors the rest of the geometry) — it reserves no layout space, so the page keeps the full
   height and the 13px band belongs to the content. The strip is fully transparent at rest: the
   home indicator (and, once open, the icon pill) are its only paint, so nothing but the bar
   itself ever covers the page. The iOS home indicator is the accent graded across and follows the
   runtime theme with no JS. The icon rail is a pill that rises out of the strip on hover, so
   opening it never reflows the content. */
.qq-shell.pos-bottom {
  width: 100%;
  height: auto;
  flex: none;
}
.qq-shell.pos-bottom .qq-rail {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  transform: none;
  z-index: 69;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 13px;
  padding: 0;
  border: none;
  /* Fully transparent at rest — the handle and the open pill are the strip's only paint. */
  background: transparent;
  /* The strip is chrome floating over the page, not a drag handle — and it must not eat the page's
     hover either: only the handle and the open pill are hit-test targets, so the empty row beside
     the indicator passes the pointer through to the content below. */
  -webkit-app-region: no-drag;
  pointer-events: none;
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
  /* The tiles magnify on pointer proximity (see onPillMove) and, like the macOS Dock, swell UP out
     of the pill — so it cannot clip them. `overflow: visible` (was overflow-x:auto/hidden) is the
     one change that lets a tile pop above the glass; the trade is that a pathologically long list
     of registered app panels no longer scrolls inside the pill. With the usual ~10 groups it fits
     the max-width cap untouched, so this only bites in extreme configurations. */
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 14px;
  /* Same material as the bubble card it belongs to (`.glass` in glass.css): full tint, full blur
     radius, one saturate curve — an earlier × 0.7 blur made the dock read lighter than the panel
     floating right above it. */
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.82));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  backdrop-filter: blur(var(--glass-blur, 30px)) saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset;
}
.qq-shell.pos-bottom .qq-pop-wrap {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  /* Measured off the shell's bottom-anchored zero-height edge now (the strip is no longer in
     flow): DOCK_FLOOR (78px from the window's bottom edge) plus the 13px strip band the pill
     floats above, minus the 10px gap the card keeps under it — so the card never covers the dock. */
  bottom: 81px;
  top: auto;
}
.qq-shell.pos-bottom .qq-pop {
  margin-left: 0;
  transform-origin: bottom center;
}
/* macOS dock magnification: the JS (onPillMove) writes a per-tile `--mag` from the gaussian of the
   pointer distance; here it grows ONLY the glyph (transform-origin bottom center so it swells UP out
   of the pill), NOT the whole button. Scaling the button had ballooned its hover/active wash tile
   into an oversized "highlight box" at peak; the icon carries the swell while the tile keeps its
   normal footprint. The custom property inherits from the button down to the icon. */
.qq-shell.pos-bottom .rail-ico {
  transform: scale(var(--mag, 1));
  transform-origin: bottom center;
  transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
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
   JS. It is also the dock's only hover trigger, so its hit box grows past the visible 4px bar —
   the full 13px strip height, centred — while the drawn bar stays slim. */
.rail-handle {
  width: 100px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0;
  border: none;
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
  pointer-events: auto;
}
.rail-handle::after {
  content: '';
  width: 100px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 28%, transparent),
    var(--accent) 32%,
    var(--accent-strong) 68%,
    color-mix(in srgb, var(--accent) 28%, transparent)
  );
  transition:
    background 0.18s linear,
    box-shadow 0.18s linear,
    opacity 0.18s linear;
}
/* Untouched for a few seconds the bar dims to a near-invisible state so it stops nagging the
   page; the pointer finding it (or the dock opening) paints it back at full strength. */
.rail-handle.dimmed::after {
  opacity: 0.15;
}
.rail-handle:hover::after {
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
   the compositor, so the slide reads as a single lift instead of stepping. Two things that used to
   live here caused the jitter: a `scaleY` on the pill box itself (rescaling a backdrop-filtered box
   is recomputed per frame and wobbles), and a per-icon fade+lift on its own delay curve (ten tiles
   drifting independently inside the moving pill). Both are gone — the per-tile scaling now happens
   only on pointer PROXIMITY (see .rail-btn / onPillMove), never during the slide. `will-change`
   keeps the pill on its own layer so the blur underneath isn't re-rasterised as a layout pass.
   `translateX(-50%)` rides along in both states because a transform transition replaces the whole
   property, centring included. The open uses an overshoot (back-out) curve so the pill pops past its
   resting line and settles — the macOS dock spring; the close is a plain ease-in, no bounce out.
   Visibility is discrete, so it is switched with a delay on the way out (keeps the slide painted)
   and immediately on the way in. */
.qq-shell.pos-bottom .rail-scroll {
  opacity: 0;
  visibility: hidden;
  transform: translate3d(-50%, 16px, 0);
  pointer-events: none;
  will-change: transform, opacity;
  transition:
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.18s linear,
    visibility 0s linear 0.24s;
}
.qq-shell.pos-bottom:not(.rail-collapsed) .rail-scroll {
  opacity: 1;
  visibility: visible;
  transform: translate3d(-50%, 0, 0);
  /* The strip itself passes the pointer through (see `.qq-rail`); an open pill must take it back. */
  pointer-events: auto;
  transition:
    transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1),
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
/* Damped when 减少动效 is in effect (see stores/settings.applyReduceMotion): the pill and the
   bubble simply appear/disappear with no travel or scale, and magnification is pinned off (JS
   onPillMove also early-returns, so no `--mag` is ever written). NOTE the pill is centred with
   `left: 50%` + a `translateX(-50%)` baked into its travel transform — so damping must KEEP the
   -50% (translate3d(-50%,0,0)), never `transform: none`, or the open dock shifts half its width
   off-centre. `transition: none` (not an asymmetric visibility-delayed fade) so expand and
   collapse read identically — no reversed open/close feel. */
html.reduce-motion .qqpop-enter-active .qq-pop,
html.reduce-motion .qqpop-leave-active .qq-pop {
  transition: none;
}
html.reduce-motion .qqpop-enter-from .qq-pop,
html.reduce-motion .qqpop-leave-to .qq-pop {
  opacity: 1;
  transform: none;
}
html.reduce-motion .qq-shell.pos-bottom .rail-scroll,
html.reduce-motion .qq-shell.pos-bottom:not(.rail-collapsed) .rail-scroll {
  transform: translate3d(-50%, 0, 0);
  transition: none;
}
html.reduce-motion .qq-shell.pos-bottom .rail-ico {
  transform: none;
  will-change: auto;
}
</style>
