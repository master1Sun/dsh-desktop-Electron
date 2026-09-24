import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import QQShell from '../../src/renderer/src/components/layout/qq/QQShell.vue'
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

function factory(current: string | null, attachTo?: HTMLElement): VueWrapper {
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
      isDark: true
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

// Static core + utility groups (pages/dsh/openclaw/external/workspace/mcp) + 1 dynamic app
// (agent-app; dsh-web is a built-in owning the dsh group, plain has none). 帮助 and 设置 are both
// pinned to the rail foot (帮助 above 设置), so neither is a scrolling `.rail-btn`.
const GROUP_COUNT = 7

describe('QQShell (IM layout)', () => {
  it('renders one icon per group + footer actions, and no bubble when closed', () => {
    const w = factory(null)
    expect(w.findAll('.rail-btn').length).toBe(GROUP_COUNT)
    expect(w.findAll('.foot-btn').length).toBe(2) // 帮助 + 设置 pinned in the foot
    expect(w.find('.qq-pop').exists()).toBe(false)
    // The 帮助 badge (pinned in the foot) surfaces the pending-update count.
    expect(w.find('.foot-badge').text()).toBe('3')
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

  it('centers the palette-only 看板 card with a ✕ header and no rail caret', async () => {
    const w = factory('board')
    const wrap = w.find('.qq-pop-wrap')
    expect(wrap.classes()).toContain('is-centered')
    // No inline top/height (the CSS centers it) and no caret pointing at a nonexistent icon.
    expect(wrap.attributes('style') ?? '').not.toContain('top:')
    expect(w.find('.qq-caret').exists()).toBe(false)
    // An explicit close button lives in the header (there is no active rail icon to re-click).
    expect(w.find('.qq-pop-head').exists()).toBe(true)
    expect(w.findComponent({ name: 'MenuPanelContent' }).props('panel')).toBe('board')
    await w.find('.qq-pop-close').trigger('click')
    expect(w.emitted('open-panel')?.at(-1)).toEqual([null])
  })

  it('a rail-anchored group stays non-centered with a caret and no header', () => {
    const w = factory('settings')
    expect(w.find('.qq-pop-wrap').classes()).not.toContain('is-centered')
    expect(w.find('.qq-caret').exists()).toBe(true)
    expect(w.find('.qq-pop-head').exists()).toBe(false)
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

  it('does NOT dismiss the 看板 card on a blank-area click (modal: ✕ / Esc only)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const w = factory('board', host)
    const away = (el: Element): void => {
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    }
    away(document.body)
    away(host)
    await w.vm.$nextTick()
    expect(w.emitted('open-panel')).toBeUndefined()
    // …but the explicit ✕ still closes it.
    await w.find('.qq-pop-close').trigger('click')
    expect(w.emitted('open-panel')?.at(-1)).toEqual([null])
    w.unmount()
    host.remove()
  })
})
