import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import App from '../../src/renderer/src/App.vue'
import { DEFAULT_KEYBINDINGS, KEYBINDING_ACTIONS } from '../../src/shared/types'
import '../../src/renderer/src/assets/main.css'

/**
 * C1/C2 from the user's side: the palette's command inventory and the shortcut table that feeds
 * it. Both are assembled in App.vue from live store state, so these cases boot the real shell
 * against a preload stub and look at what actually rendered.
 */

const persistedSettings: Record<string, unknown> = {}

function makeContainerMock(): Record<string, unknown> {
  const ok = <T>(data: T): { ok: boolean; data: T } => ({ ok: true, data })
  return {
    getNodeInfo: () => Promise.resolve(ok({ path: '/node', version: 'v24.21.0', ok: true })),
    listPages: () =>
      Promise.resolve(
        ok([
          {
            id: 'dsh-web',
            name: 'DSH (web)',
            dir: '/pages/dsh-web',
            port: 8899,
            startCommand: '',
            kind: 'dsh',
            dshProfile: 'web',
            status: 'running',
            manageAsApp: true,
            launchUrl: 'http://127.0.0.1:8899/?token=abc'
          },
          {
            id: 'openclaw',
            name: 'OpenClaw',
            dir: '/pages/openclaw',
            port: 18789,
            startCommand: '',
            kind: 'openclaw',
            status: 'stopped',
            manageAsApp: true
          },
          {
            id: 'cli-app',
            name: 'CLI 应用',
            dir: '/pages/cli-app',
            port: 0,
            startCommand: 'node cli.js',
            kind: 'terminal',
            status: 'stopped'
          }
        ])
      ),
    getSettings: () => Promise.resolve(ok({ ...persistedSettings })),
    updateSettings: (partial: Record<string, unknown>) => {
      Object.assign(persistedSettings, partial)
      return Promise.resolve(ok({ ...persistedSettings }))
    },
    setPagePort: () => Promise.resolve(ok(true)),
    checkUpdates: () => Promise.resolve(ok([])),
    getEnvRoot: () => Promise.resolve(ok({ envRoot: '/env', installDir: '/', home: '/' })),
    getNativeTheme: () => Promise.resolve(ok(true)),
    setNativeTheme: () => Promise.resolve(ok(true)),
    onNativeTheme: () => () => undefined,
    minimizeWindow: () => Promise.resolve(ok(true)),
    toggleMaximize: () => Promise.resolve(ok(false)),
    closeWindow: () => Promise.resolve(ok(true)),
    getIsMaximized: () => Promise.resolve(ok(false)),
    onMaximizedChanged: () => () => undefined,
    onQuitConfirm: () => () => undefined,
    onStateChanged: () => () => undefined,
    onPageProgress: () => () => undefined,
    onOpenTerminalPage: () => () => undefined,
    onHotkey: () => () => undefined,
    toggleDevTools: () => Promise.resolve(ok({})),
    openExternal: () => Promise.resolve(ok(true)),
    openPageWindow: () => Promise.resolve(ok({ ok: true })),
    listEvents: () => Promise.resolve(ok([])),
    onEvent: () => () => undefined,
    getMetricsHistory: () => Promise.resolve(ok({})),
    onPageMetrics: () => () => undefined,
    ptyStart: () => Promise.resolve(ok(null)),
    pageRunSpec: () => Promise.resolve(ok(null)),
    dshStatus: () => Promise.resolve(ok({ installed: true })),
    dshListPlugins: () => Promise.resolve(ok([])),
    openclawStatus: () => Promise.resolve(ok({ installed: true, home: '~/.openclaw', port: 18789 })),
    openclawToken: () => Promise.resolve(ok(null)),
    getPageLogs: () => Promise.resolve(ok([])),
    removePage: () => Promise.resolve(ok(true))
  }
}

let pinia: ReturnType<typeof createPinia>
let app: VueApp | null = null

async function mountApp(): Promise<void> {
  const host = document.createElement('div')
  host.id = 'app'
  document.body.appendChild(host)
  pinia = createPinia()
  app = createApp(App)
  app.use(pinia).use(ElementPlus)
  app.mount(host)
  await flush()
}

const flush = async (ms = 80): Promise<void> => {
  await nextTick()
  await new Promise((r) => setTimeout(r, ms))
  await nextTick()
}

const click = async (el: Element | null): Promise<void> => {
  ;(el as HTMLElement | undefined)?.click()
  await flush(40)
}

/** Fire a key at the shell window exactly like the browser would (App.vue listens on `window`). */
async function press(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
): Promise<void> {
  const code = /^Key[A-Z]$/.test(key.toUpperCase()) && /^[a-zA-Z]$/.test(key)
    ? `Key${key.toUpperCase()}`
    : undefined
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      ...(code ? { code } : {}),
      ctrlKey: Boolean(mods.ctrl),
      shiftKey: Boolean(mods.shift),
      altKey: Boolean(mods.alt),
      bubbles: true
    })
  )
  await flush(40)
}

const paletteOpen = (): boolean => document.querySelector('.palette-overlay') !== null

/** Palette items currently rendered, in visual order. */
function itemTitles(): string[] {
  return [...document.querySelectorAll('.palette-item .item-title')].map((el) =>
    (el.textContent || '').trim()
  )
}

async function openPalette(): Promise<void> {
  await press('k', { ctrl: true })
}

beforeEach(() => {
  document.body.innerHTML = ''
  for (const key of Object.keys(persistedSettings)) delete persistedSettings[key]
  persistedSettings.defaultView = { kind: 'none' }
  persistedSettings.openExternalIn = 'embedded'
  persistedSettings.minimizeToTray = true
  persistedSettings.autoStartPages = []
  persistedSettings.lastExternalUrls = []
  persistedSettings.externalSites = []
  persistedSettings.theme = 'auto'
  persistedSettings.locale = 'zh'
  // Settings is reached through the classic top menu here, so pin classic (the shell defaults to IM).
  persistedSettings.layoutMode = 'classic'
  ;(window as unknown as { container: unknown }).container = makeContainerMock()
})

afterEach(() => {
  // These cases dispatch real keydowns, so a shell left mounted would keep answering them from
  // its own window listener and teleport a second palette into the next case.
  app?.unmount()
  app = null
  vi.restoreAllMocks()
})

describe('command palette contents', () => {
  it('lists the page, panel and global actions the shell offers', async () => {
    await mountApp()
    await openPalette()
    expect(paletteOpen()).toBe(true)
    const titles = itemTitles()
    // A running page gets open/stop; a stopped one gets start — plus pop-out and restart for both.
    expect(titles).toContain('打开：DSH (web)')
    expect(titles).toContain('停止：DSH (web)')
    expect(titles).toContain('独立窗口打开：DSH (web)')
    expect(titles).toContain('重启：DSH (web)')
    expect(titles).toContain('启动：OpenClaw')
    // A CLI page has no window to pop out and no web UI, so it only gets the terminal entry.
    expect(titles).toContain('在终端打开：CLI 应用')
    expect(titles.some((x) => x.includes('独立窗口打开：CLI'))).toBe(false)
    // A1 + A2 + D2 global entries.
    expect(titles).toContain('查看事件动态')
    expect(titles).toContain('检查更新')
    expect(titles).toContain('打开终端')
    expect(titles).toContain('问 OpenClaw（打开页面）')
    expect(titles).toContain('打开 DSH (web)')
    // Groups are rendered as headers, so the new AI bucket has to be visible too.
    const groups = [...document.querySelectorAll('.group-label')].map((el) => el.textContent?.trim())
    expect(groups).toContain('AI 助手')
  })

  it('filters on the fuzzy query and keeps the group order', async () => {
    await mountApp()
    await openPalette()
    const input = document.querySelector('.palette-input') as HTMLInputElement
    input.value = '事件'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush(40)
    const titles = itemTitles()
    expect(titles).toContain('查看事件动态')
    expect(titles.some((x) => x.includes('停止：'))).toBe(false)
  })

  it('closes on Escape', async () => {
    await mountApp()
    await openPalette()
    const input = document.querySelector('.palette-input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush(40)
    expect(paletteOpen()).toBe(false)
  })

  it('fires a Ctrl+letter quick-open for a 操作/页面 row while the palette is open', async () => {
    await mountApp()
    await openPalette()
    // The first row that carries a quick-open badge; its letter is assigned deterministically.
    const badge = document.querySelector('.palette-item .item-key') as HTMLElement | null
    expect(badge).not.toBeNull()
    const text = (badge?.textContent || '').trim()
    expect(text).toMatch(/^Ctrl\+[a-z]$/)
    const letter = text.replace('Ctrl+', '')
    // The combo must be handled by the palette itself, so fire it from inside the input.
    const input = document.querySelector('.palette-input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: letter, ctrlKey: true, bubbles: true }))
    await flush(40)
    // run() closes the palette before dispatching the command, so closing proves the quick-open fired.
    expect(paletteOpen()).toBe(false)
  })

  it('also gives a 面板 entry a Ctrl+letter quick-open badge', async () => {
    await mountApp()
    await openPalette()
    const panelsSec = [...document.querySelectorAll('.palette-group')].find(
      (g) => (g.querySelector('.group-label')?.textContent || '').trim() === '面板'
    )
    expect(panelsSec).toBeTruthy()
    // The first panel row must carry a badge; firing its combo closes the palette (run() ran it).
    const badge = panelsSec!.querySelector('.item-key') as HTMLElement | null
    expect(badge).not.toBeNull()
    const letter = (badge?.textContent || '').trim().replace('Ctrl+', '')
    const input = document.querySelector('.palette-input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: letter, ctrlKey: true, bubbles: true }))
    await flush(40)
    expect(paletteOpen()).toBe(false)
  })

  it('leaves a reserved Ctrl+letter (select-all) to the input instead of quick-opening', async () => {
    await mountApp()
    await openPalette()
    const input = document.querySelector('.palette-input') as HTMLInputElement
    // 'a' is reserved for editing and never takes a quick-open slot.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }))
    await flush(40)
    expect(paletteOpen()).toBe(true)
  })
})

describe('customizable shortcuts', () => {
  it('opens on the shipped Ctrl+K', async () => {
    await mountApp()
    expect(DEFAULT_KEYBINDINGS.palette).toBe('Ctrl+K')
    await press('k', { ctrl: true })
    expect(paletteOpen()).toBe(true)
  })

  it('follows a rebinded combination instead of the shipped one', async () => {
    persistedSettings.keybindings = { palette: 'Ctrl+Shift+P' }
    await mountApp()
    await press('k', { ctrl: true })
    expect(paletteOpen()).toBe(false)
    await press('P', { ctrl: true, shift: true })
    expect(paletteOpen()).toBe(true)
  })

  it('honours a deliberate unbind', async () => {
    // An empty string is a stored choice, not a missing value: the default must not creep back.
    persistedSettings.keybindings = { palette: '' }
    await mountApp()
    await press('k', { ctrl: true })
    expect(paletteOpen()).toBe(false)
  })

  it('records a new combination from the 快捷键 tab and stores only the override', async () => {
    await mountApp()
    const sysTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('系统')
    )
    await click(sysTrigger ?? null)
    const settingsRow = [...document.querySelectorAll('.drop-list .drop-item')].find((b) =>
      b.textContent?.includes('设置')
    )
    await click(settingsRow ?? null)
    const keysTab = [...document.querySelectorAll('.el-tabs__item')].find((b) =>
      b.textContent?.includes('快捷键')
    )
    expect(keysTab).not.toBeNull()
    await click(keysTab ?? null)
    // One editable row per bindable action — the table is derived from the shared contract.
    expect(document.querySelectorAll('.key-row')).toHaveLength(KEYBINDING_ACTIONS.length)

    const firstInput = document.querySelector('.key-row .key-input input') as HTMLInputElement
    firstInput.focus()
    firstInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', ctrlKey: true, altKey: true, bubbles: true })
    )
    await flush(60)
    const stored = persistedSettings.keybindings as Record<string, string>
    // The first row is `palette`; only the touched action is written to settings. A single-letter
    // key is stored lowercase (the matcher normalizes both sides), so a display casing here
    // would never match a later keydown.
    expect(stored.palette).toBe('Ctrl+Alt+j')
    expect(Object.keys(stored)).toEqual(['palette'])

    // 恢复默认 drops the whole override map, so the shipped table comes back. The button's
    // wrapper class is a refactor magnet inside SettingsPanel — match on its text instead.
    const resetBtn = [...document.querySelectorAll('.settings-panel button')].find((b) =>
      b.textContent?.includes('恢复默认')
    )
    expect(resetBtn).not.toBeNull()
    await click(resetBtn ?? null)
    expect(persistedSettings.keybindings).toEqual({})
  })

  it('names the other action when one combination is bound twice', async () => {
    persistedSettings.keybindings = { palette: 'Ctrl+G', devtools: 'Ctrl+G' }
    await mountApp()
    const sysTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('系统')
    )
    await click(sysTrigger ?? null)
    const settingsRow = [...document.querySelectorAll('.drop-list .drop-item')].find((b) =>
      b.textContent?.includes('设置')
    )
    await click(settingsRow ?? null)
    await click(
      [...document.querySelectorAll('.el-tabs__item')].find((b) => b.textContent?.includes('快捷键')) ?? null
    )
    const conflicted = [...document.querySelectorAll('.key-row .key-conflict')]
    expect(conflicted).toHaveLength(2)
    const errs = [...document.querySelectorAll('.keys-err')].map((el) => el.textContent || '')
    expect(errs.join('\n')).toContain('开发者工具')
  })
})
