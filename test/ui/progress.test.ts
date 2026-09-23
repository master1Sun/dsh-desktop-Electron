import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import App from '../../src/renderer/src/App.vue'
import type { InstallProgress, UpdateProgress } from '../../src/shared/types'
import '../../src/renderer/src/assets/main.css'

/** Captured progress listeners so a test can *push* an event like the main process would. */
type Cb<T> = (p: T) => void
const listeners: {
  node?: Cb<UpdateProgress>
  update?: Cb<UpdateProgress>
  install?: Cb<InstallProgress>
} = {}

function makeContainerMock(): Record<string, unknown> {
  const ok = <T>(data: T): { ok: boolean; data: T } => ({ ok: true, data })
  return {
    // Every built-in present → the first-run gate stays hidden and these tests only see the bar.
    getNodeInfo: () =>
      Promise.resolve(ok({ path: '/node', version: 'v24.21.0', ok: true, override: false })),
    listPages: () => Promise.resolve(ok([])),
    dshStatus: () => Promise.resolve(ok({ installed: true, version: '1' })),
    openclawStatus: () => Promise.resolve(ok({ installed: true, version: '1' })),
    nodeListVersions: () => Promise.resolve(ok([])),
    checkUpdates: () => Promise.resolve(ok([])),
    getSettings: () =>
      Promise.resolve(
        ok({
          defaultView: { kind: 'none' },
          openExternalIn: 'embedded',
          minimizeToTray: true,
          autoStartPages: [],
          lastExternalUrls: [],
          externalSites: [],
          theme: 'auto',
          locale: 'zh',
          dshHome: '',
          openclawHome: ''
        })
      ),
    updateSettings: (partial: Record<string, unknown>) => Promise.resolve(ok(partial)),
    getEnvRoot: () => Promise.resolve(ok({ envRoot: '/env', installDir: '/', home: '/' })),
    getNativeTheme: () => Promise.resolve(ok(false)),
    setNativeTheme: () => Promise.resolve(ok(true)),
    onNativeTheme: () => () => undefined,
    getIsMaximized: () => Promise.resolve(ok(false)),
    onMaximizedChanged: () => () => undefined,
    onQuitConfirm: () => () => undefined,
    onStateChanged: () => () => undefined,
    onOpenTerminalPage: () => () => undefined,
    onPageProgress: () => () => undefined,
    // The three sources the top bar aggregates — capture their callbacks.
    onNodeUpdateProgress: (cb: Cb<UpdateProgress>) => {
      listeners.node = cb
      return () => undefined
    },
    onUpdateProgress: (cb: Cb<UpdateProgress>) => {
      listeners.update = cb
      return () => undefined
    },
    onInstallProgress: (cb: Cb<InstallProgress>) => {
      listeners.install = cb
      return () => undefined
    }
  }
}

async function mountApp(): Promise<void> {
  const host = document.createElement('div')
  host.id = 'app'
  document.body.appendChild(host)
  const app = createApp(App)
  app.use(createPinia()).use(ElementPlus)
  app.mount(host)
  await nextTick()
  await new Promise((r) => setTimeout(r, 60))
  await nextTick()
}

const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  delete listeners.node
  delete listeners.update
  delete listeners.install
  ;(window as unknown as { container: unknown }).container = makeContainerMock()
})

describe('window-level top progress bar', () => {
  it('renders nothing while idle', async () => {
    await mountApp()
    expect(document.querySelector('.topbar-progress')).toBeNull()
  })

  it('shows a slim bar for a single task and its detail on hover', async () => {
    await mountApp()
    listeners.node?.({ name: 'Node', phase: 'fetch', percent: 40, message: 'downloading' })
    await settle()
    const bar = document.querySelector('.topbar-progress')
    expect(bar).not.toBeNull()
    // Collapsed: only the bar — no inline percentage text.
    expect(bar?.textContent).not.toContain('%')
    // The detail card is hover-only.
    expect(document.querySelector('.tb-drop')).toBeNull()
    bar?.dispatchEvent(new Event('mouseenter'))
    await settle()
    const card = document.querySelector('.tb-card')
    expect(card?.textContent).toContain('40%')
    expect(card?.textContent).toContain('Node')
    listeners.node?.({ name: 'Node', phase: 'done' })
    await settle()
    expect(document.querySelector('.topbar-progress')).toBeNull()
  })

  it('collapses multiple tasks into one bar with a hover card list', async () => {
    await mountApp()
    listeners.node?.({ name: 'Node', phase: 'fetch', percent: 30, message: 'node' })
    listeners.update?.({ name: '桌面控制台', phase: 'extract', percent: 60, message: 'asar' })
    listeners.install?.({ op: 'git', phase: 'receiving', percent: 50 })
    await settle()
    const bar = document.querySelector('.topbar-progress')
    expect(bar).not.toBeNull()
    // Collapsed: a single aggregate bar, no per-task text until hover.
    expect(bar?.textContent).not.toContain('%')
    expect(document.querySelector('.tb-drop')).toBeNull()
    bar?.dispatchEvent(new Event('mouseenter'))
    await settle()
    const drop = document.querySelector('.tb-drop')
    expect(drop).not.toBeNull()
    expect(drop?.querySelectorAll('.tb-card').length).toBe(3)
  })

  it('marks an indeterminate step (no percentage) with a flowing bar', async () => {
    await mountApp()
    listeners.install?.({ op: 'git', phase: 'preparing' })
    await settle()
    const bar = document.querySelector('.topbar-progress')
    expect(bar).not.toBeNull()
    expect(bar?.textContent).not.toContain('%')
  })
})
