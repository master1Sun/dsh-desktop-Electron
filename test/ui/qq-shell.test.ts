import { describe, it, expect, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import QQShell from '../../src/renderer/src/components/layout/qq/QQShell.vue'
import { buildNav } from '../../src/renderer/src/components/layout/qq/qqNav'
import { reduceMotion } from '../../src/renderer/src/stores/settings'
import type { PageState } from '../../src/renderer/src/stores/pages'

/**
 * The IM (QQ-like) shell: an icon-only left rail + a floating bubble panel. The rail carries one icon
 * per top-level group (no labels, no tab strip); clicking an icon asks App to open that group, and
 * the classic MenuPanelContent card pops out beside the rail. App.vue owns `current`, so these cases
 * assert the rail ⇄ App contract: one icon per group (+ dynamic app rows, not plain pages), inactive
 * icon opens, active icon collapses, the 帮助 badge shows the pending-update count, and no bubble
 * renders while closed. MenuPanelContent (which pulls the whole panel store tree) is stubbed.
 */

const runtime = { version: 'v24.0.0', ok: true, path: '/node' }

const pages = [
  { id: 'dsh-web', name: 'DSH (web)', kind: 'dsh', manageAsApp: true, status: 'running' },
  { id: 'agent-app', name: '智能体应用', kind: 'page', manageAsApp: true, status: 'stopped' },
  { id: 'plain', name: '普通页', kind: 'page', status: 'stopped' }
] as unknown as PageState[]

function factory(current: string | null, attachTo?: HTMLElement, extra?: Record<string, unknown>): VueWrapper {
  return mount(QQShell, {
    ...(attachTo ? { attachTo } : {}),
    props: {
      pages,
      current,
      runtime,
      runningCount: 1,
      totalCount: 2,
      initialTab: null,
      outdatedCount: 3,
      isDark: true,
      ...(extra ?? {})
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        MenuPanelContent: {
          name: 'MenuPanelContent',
          props: ['panel'],
          template: '<div class="menu-panel-stub" />'
        }
      }
    }
  })
}

// Static core + utility groups (pages/dsh/openclaw/external/workspace/board/mcp) + 1 dynamic app
// (agent-app; dsh-web is a built-in owning the dsh group, plain has none) + the tail 帮助 / 设置
// rows, which now follow the same scrolling order instead of a pinned foot slot.
const GROUP_COUNT = 10

describe('QQShell (IM layout)', () => {
  it('renders one icon per group, and no bubble when closed', () => {
    const w = factory(null)
    expect(w.findAll('.rail-btn').length).toBe(GROUP_COUNT)
    expect(w.findAll('.foot-btn').length).toBe(0) // no separate foot slot any more
    expect(w.find('.qq-pop').exists()).toBe(false)
    // The 帮助 badge (tail row of the scrolling list) surfaces the pending-update count.
    const helpBtn = w.findAll('.rail-btn').at(-2)
    expect(helpBtn?.find('.rail-badge').text()).toBe('3')
  })

  it('clicking an inactive icon asks App to open that group', async () => {
    const w = factory(null)
    await w.findAll('.rail-btn')[0].trigger('click') // pages
    expect(w.emitted('open-panel')?.at(-1)).toEqual(['pages'])
  })

  it('re-clicking the active icon collapses the bubble', async () => {
    const w = factory('pages')
    const pagesBtn = w.findAll('.rail-btn')[0]
    expect(pagesBtn.classes()).toContain('active')
    await pagesBtn.trigger('click')
    expect(w.emitted('open-panel')?.at(-1)).toEqual([null])
  })

  it('pops the classic panel as a floating bubble for the current group', () => {
    const w = factory('settings')
    expect(w.find('.qq-pop').exists()).toBe(true)
    expect(w.findComponent({ name: 'MenuPanelContent' }).props('panel')).toBe('settings')
  })

  it('maps sidebarPosition to the root placement class (default left, no reflow change)', () => {
    expect(factory(null).classes()).toContain('pos-left')
    expect(factory(null, undefined, { sidebarPosition: 'right' }).classes()).toContain('pos-right')
    expect(factory(null, undefined, { sidebarPosition: 'bottom' }).classes()).toContain(
      'pos-bottom'
    )
  })

  it('bottom dock: rests as a home indicator, edge modes have none', () => {
    expect(factory(null).find('.rail-handle').exists()).toBe(false)
    expect(
      factory(null, undefined, { sidebarPosition: 'right' }).find('.rail-handle').exists()
    ).toBe(false)
    const bottom = factory(null, undefined, { sidebarPosition: 'bottom' })
    expect(bottom.find('.rail-handle').exists()).toBe(true)
    // iOS-dock resting state: collapsed from the start (the icon row is CSS-collapsed, so it
    // stays mounted and can animate open); the edge modes never collapse.
    expect(bottom.classes()).toContain('rail-collapsed')
    expect(factory(null).classes()).not.toContain('rail-collapsed')
  })

  it('bottom dock: dwelling on the handle expands after the grace delay, leaving retracts it later', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const rail = w.find('.rail-handle')
      // A short fly-through cancels the pending expand before the grace elapses.
      await rail.trigger('pointerenter')
      vi.advanceTimersByTime(60)
      await rail.trigger('pointerleave')
      vi.advanceTimersByTime(2000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
      // Dwelling past the grace expands it…
      await rail.trigger('pointerenter')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // …and leaving retracts only after the longer dwell delay.
      await rail.trigger('pointerleave')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      vi.advanceTimersByTime(1000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: the strip outside the handle never triggers the dock', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      // Only the home indicator is a hover trigger; the empty row beside it (and the closed pill)
      // must leave the dock collapsed — the strip floats over the page and passes hover through.
      await w.find('.qq-rail').trigger('pointerenter')
      await w.find('.rail-scroll').trigger('pointerenter')
      vi.advanceTimersByTime(2000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: re-entering before the leave delay cancels the collapse', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const rail = w.find('.rail-handle')
      await rail.trigger('pointerenter')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      await rail.trigger('pointerleave')
      await rail.trigger('pointerenter') // reached back in time — stay open
      vi.advanceTimersByTime(2000)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: a pending retract never hides the dock while the pointer is still on it', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const rail = w.find('.rail-handle')
      // Dwell the dock open, with the pointer resting on the pill (jsdom rects are all-zero,
      // so (0,0) is inside every element box). Dispatch on the window itself: this mount is not
      // attached to the document, so an event on a component element never propagates to the
      // window where the tracker listens.
      await rail.trigger('pointerenter')
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true })
      )
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // The pointer steps off onto the page: a retract arms.
      const away = new Event('pointerleave') as PointerEvent
      Object.defineProperty(away, 'relatedTarget', { value: document.body })
      w.find('.qq-rail').element.dispatchEvent(away)
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // …but the hand reaches back onto the pill before the dwell elapses: a fresh host move
      // restores the coordinate and calls the retract off.
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true })
      )
      vi.advanceTimersByTime(3000)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: leaving the open pill into a guest webview still retracts it', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const rail = w.find('.rail-handle')
      await rail.trigger('pointerenter')
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true })
      )
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // The pointer crosses onto the <webview>: the host sees exactly one boundary leave and
      // then goes silent — the guest eats every later pointermove, so the tracked on-dock
      // coordinate is stale and must not veto the retract. The dock still has to collapse.
      const into = new Event('pointerleave') as PointerEvent
      Object.defineProperty(into, 'relatedTarget', { value: document.body })
      w.find('.qq-rail').element.dispatchEvent(into)
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      vi.advanceTimersByTime(1000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: collapseRail() dismisses at once for the page click-away scrim', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      // The scrim arms off `dock-open`: the collapsed mount publishes false up front.
      expect(w.emitted('dock-open')?.at(-1)).toEqual([false])
      const rail = w.find('.rail-handle')
      await rail.trigger('pointerenter')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      expect(w.emitted('dock-open')?.at(-1)).toEqual([true])
      // A page click reaches the scrim (the guest webview eats the host's own pointerdown) and
      // calls the exposed collapse: no dwell timers, the dock is shut immediately.
      ;(w.vm as unknown as { collapseRail: () => void }).collapseRail()
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
      expect(w.emitted('dock-open')?.at(-1)).toEqual([false])
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: the dimmed indicator pulses back on a period until touched', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const handle = w.find('.rail-handle')
      // Mounted at rest dimmed, the reveal loop armed from the first second: the first pulse
      // lights the bar exactly one period in…
      expect(handle.classes()).toContain('dimmed')
      vi.advanceTimersByTime(15000)
      await w.vm.$nextTick()
      expect(handle.classes()).not.toContain('dimmed')
      // …and only the short hold later it is dim again.
      vi.advanceTimersByTime(460)
      await w.vm.$nextTick()
      expect(handle.classes()).toContain('dimmed')
      // Second period: same bright moment.
      vi.advanceTimersByTime(14540)
      await w.vm.$nextTick()
      expect(handle.classes()).not.toContain('dimmed')
      // A real interaction ends the loop: dwelling the handle open kills the interval (the bar
      // itself is repainted too, hence not dimmed while the dock is up).
      await handle.trigger('pointerenter')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      expect(handle.classes()).not.toContain('dimmed')
      vi.advanceTimersByTime(20000)
      await w.vm.$nextTick()
      expect(handle.classes()).not.toContain('dimmed')
      // Step off (a tracked move away, then the boundary leave): the dock retracts, the bar
      // dims only after the full idle delay, and its reveal restarts on a fresh period —
      // nothing fires inside the dim window, proving the old interval really died.
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 400, clientY: 200, bubbles: true })
      )
      const finalLeave = new Event('pointerleave') as PointerEvent
      Object.defineProperty(finalLeave, 'relatedTarget', { value: document.body })
      w.find('.qq-rail').element.dispatchEvent(finalLeave)
      vi.advanceTimersByTime(1000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
      expect(handle.classes()).not.toContain('dimmed')
      // Past the dim edge (collapse 700 + idle 3000 = 3.7s): dark at 4s, and the fresh interval
      // armed off that edge — tick due at 18.7s, so at 4s it is still dark…
      vi.advanceTimersByTime(3000)
      await w.vm.$nextTick()
      expect(handle.classes()).toContain('dimmed')
      // …one tick short at 18.6s…
      vi.advanceTimersByTime(14600)
      await w.vm.$nextTick()
      expect(handle.classes()).toContain('dimmed')
      // …and lit inside the pulse window (450ms hold ends at 19.15s).
      vi.advanceTimersByTime(300)
      await w.vm.$nextTick()
      expect(handle.classes()).not.toContain('dimmed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: the pointer sliding off without a leave event still retracts it', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const rail = w.find('.rail-handle')
      await rail.trigger('pointerenter')
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true })
      )
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // The pointer leaves through a guest webview, which eats the boundary event: the dock saw
      // no pointerleave at all, so only the document-wide pointermove tracker can notice the
      // departure — after its dwell delay the dock must still retract.
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 400, clientY: 200, bubbles: true })
      )
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      vi.advanceTimersByTime(2000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: a lost leave event still spares the dock while it is hovered', async () => {
    vi.useFakeTimers()
    try {
      // An open bubble expanded the dock (no pointer involvement). Closing it releases the dock
      // to the leave dwell — the watch schedules a retract even though no leave event was seen.
      const w = factory('settings', undefined, { sidebarPosition: 'bottom' })
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // The rail never saw the pointer's enter/leave pair (a guest webview ate the boundary
      // event), but the tracker's coordinates say it is still on the dock, so the release path
      // must not hide it.
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true })
      )
      await w.setProps({ current: null })
      vi.advanceTimersByTime(3000)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: an element-hop pointerout keeps the tracked pointer position', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const rail = w.find('.rail-handle')
      await rail.trigger('pointerenter')
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true })
      )
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // A pointerout between two host elements still has a relatedTarget — the pointer is on the
      // dock, so the tracked position must survive and the retract must not fire. Only a
      // pointerout with no target (pointer left the window) may clear it.
      const hop = new Event('pointerout') as PointerEvent
      Object.defineProperty(hop, 'relatedTarget', { value: document.body })
      document.dispatchEvent(hop)
      await rail.trigger('pointerleave')
      vi.advanceTimersByTime(3000)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // Now a real window exit: the position is dropped and the dock retracts on its dwell.
      document.dispatchEvent(new Event('pointerout'))
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      vi.advanceTimersByTime(2000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: a leave that stays inside the shell is noise and never retracts', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const rail = w.find('.rail-handle')
      await rail.trigger('pointerenter')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // The spurious leave Chromium reports when the pill materialises under the cursor: its
      // relatedTarget is still inside the shell, so the retract must not even be scheduled.
      const noise = new Event('pointerleave') as PointerEvent
      Object.defineProperty(noise, 'relatedTarget', { value: w.find('.rail-btn').element })
      rail.element.dispatchEvent(noise)
      vi.advanceTimersByTime(3000)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: an open bubble pins it expanded, closing releases the retract', async () => {
    vi.useFakeTimers()
    try {
      const w = factory('settings', undefined, { sidebarPosition: 'bottom' })
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // Hovering away never retracts while the panel is open — the card floats right above it.
      await w.find('.rail-handle').trigger('pointerleave')
      await w.find('.qq-pop').trigger('mouseleave')
      vi.advanceTimersByTime(3000)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      // Closing it hands the dock back to the leave dwell.
      await w.setProps({ current: null })
      vi.advanceTimersByTime(100)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      vi.advanceTimersByTime(1000)
      await w.vm.$nextTick()
      expect(w.classes()).toContain('rail-collapsed')
      // Tapping the indicator dwells the dock open (no bubble toggle).
      await w.find('.rail-handle').trigger('click')
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      expect(w.emitted('open-panel')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the 看板 as a rail group and pops it as an anchored bubble', () => {
    const w = factory('board')
    // The board owns a rail icon now (任务看板 sits in the sidebar next to 共享上下文).
    expect(w.findAll('.rail-btn').length).toBe(GROUP_COUNT)
    expect(w.find('.qq-pop').exists()).toBe(true)
    expect(w.findComponent({ name: 'MenuPanelContent' }).props('panel')).toBe('board')
  })

  it('every group bubble is rail-anchored with a caret and no header (看板 included)', () => {
    for (const current of ['settings', 'board']) {
      const w = factory(current)
      expect(w.find('.qq-pop-wrap').attributes('style') ?? '').toContain('top:')
      expect(w.find('.qq-caret').exists()).toBe(true)
      expect(w.find('.qq-pop-head').exists()).toBe(false)
    }
  })

  it('dismisses on a blank-area click, but not on the card or a rail button', async () => {
    // attachTo so the document-level capture listener actually sits in the event path.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const w = factory('pages', host)
    const away = (el: Element): void => {
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    }
    // Inside the card → stays open.
    away(w.find('.qq-pop').element)
    await w.vm.$nextTick()
    expect(w.emitted('open-panel')).toBeUndefined()
    // A rail button owns its own toggle → click-away ignores it.
    away(w.findAll('.rail-btn')[1].element)
    await w.vm.$nextTick()
    expect(w.emitted('open-panel')).toBeUndefined()
    // A blank surface outside both → collapses.
    away(document.body)
    await w.vm.$nextTick()
    expect(w.emitted('open-panel')?.at(-1)).toEqual([null])
    w.unmount()
    host.remove()
  })

  it('dismisses the 看板 bubble on a blank-area click like any other group', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const w = factory('board', host)
    // Inside the card → stays open.
    w.find('.qq-pop').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.emitted('open-panel')).toBeUndefined()
    // A blank surface outside → collapses.
    host.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.emitted('open-panel')?.at(-1)).toEqual([null])
    w.unmount()
    host.remove()
  })

  it('bottom dock: magnifies the icons nearest the pointer along a proximity falloff', async () => {
    vi.useFakeTimers()
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const btns = w.findAll('.rail-btn')
      // jsdom reports a zero rect for every element; stage three tiles at known x-centres so the
      // gaussian has real distances to work against (tile 1 under the pointer, tile 2 mid, tile 3 far).
      const centres = [20, 100, 400]
      const rectAt = (cx: number): DOMRect =>
        ({
          left: cx - 19,
          right: cx + 19,
          top: 0,
          bottom: 38,
          x: cx - 19,
          y: 0,
          width: 38,
          height: 38,
          toJSON: () => ({})
        }) as DOMRect
      btns.slice(0, 3).forEach((b, i) => {
        b.element.getBoundingClientRect = () => rectAt(centres[i])
      })
      // Dwell the dock open, then slide the pointer across the pill at tile 1's centre.
      await w.find('.rail-handle').trigger('pointerenter')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      w.find('.rail-scroll').element.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 100, bubbles: true })
      )
      const magOf = (i: number): number =>
        parseFloat(btns[i].element.style.getPropertyValue('--mag') || '1')
      expect(magOf(1)).toBeCloseTo(1.45, 2) // peak: right under the pointer
      expect(magOf(0)).toBeGreaterThan(1.05) // 80px neighbour swells a little
      expect(magOf(0)).toBeLessThan(magOf(1)) // ...but less than the tile under the cursor
      expect(magOf(2)).toBeLessThan(1.05) // 300px away: effectively flat
      // Leaving the pill clears every inline scale (resting transform falls back to var default).
      w.find('.rail-scroll').element.dispatchEvent(new Event('pointerleave'))
      expect(btns[1].element.style.getPropertyValue('--mag')).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bottom dock: magnification is skipped entirely when 减少动效 is in effect', async () => {
    vi.useFakeTimers()
    reduceMotion.value = true
    try {
      const w = factory(null, undefined, { sidebarPosition: 'bottom' })
      const btns = w.findAll('.rail-btn')
      await w.find('.rail-handle').trigger('pointerenter')
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.classes()).not.toContain('rail-collapsed')
      w.find('.rail-scroll').element.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 100, bubbles: true })
      )
      // The tracker early-returns before touching any tile, so no scale is ever written.
      expect(btns[1].element.style.getPropertyValue('--mag')).toBe('')
    } finally {
      reduceMotion.value = false
      vi.useRealTimers()
    }
  })
})

describe('buildNav manager gating (DSH / OpenClaw)', () => {
  const navGroups = (pages: Partial<PageState>[]): string[] => buildNav(pages as PageState[]).map((g) => g.group)

  it('shows both managers when their pages are installed and enabled', () => {
    const g = navGroups([
      { id: 'dsh-web', kind: 'dsh', name: 'DSH' },
      { id: 'claw', kind: 'openclaw', name: 'OpenClaw' }
    ])
    expect(g).toContain('dsh')
    expect(g).toContain('openclaw')
  })

  it('drops the DSH manager when the page is disabled in the Pages panel', () => {
    const g = navGroups([{ id: 'dsh-web', kind: 'dsh', name: 'DSH', disabled: true }])
    expect(g).not.toContain('dsh')
  })

  it('drops the OpenClaw manager when its runtime is not installed (runtimeMissing)', () => {
    const g = navGroups([{ id: 'claw', kind: 'openclaw', name: 'OpenClaw', runtimeMissing: true }])
    expect(g).not.toContain('openclaw')
  })

  it('keeps the manager visible when no page row gates it (built-in always registered)', () => {
    expect(navGroups([])).toEqual(expect.arrayContaining(['dsh', 'openclaw']))
  })
})
