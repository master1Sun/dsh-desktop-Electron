import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import App from '../../src/renderer/src/App.vue'
import { useSettingsStore } from '../../src/renderer/src/stores/settings'
import { localeDictReady } from '../../src/renderer/src/i18n'
import '../../src/renderer/src/assets/main.css'

/** Minimal stand-in for the preload bridge so the real stores/App can boot in jsdom. */
const persistedSettings: Record<string, unknown> = {
  defaultView: { kind: 'none' },
  openExternalIn: 'embedded',
  minimizeToTray: true,
  autoStartPages: [],
  lastExternalUrls: [],
  externalSites: [],
  theme: 'auto',
  // This suite exercises the classic shell: the top menu bar collapses to a single 「控制台」
  // entry that opens the unified console (left grouped nav + right content).
  dshHome: '',
  openclawHome: ''
}

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
            launchUrl: 'http://127.0.0.1:8899/?token=abc',
            envVars: [
              {
                key: 'DSH_HOME',
                label: 'DSH Home',
                defaultPath: '~/.dsh',
                description: 'profile 容器目录'
              }
            ]
          },
          {
            id: 'agent-app',
            name: '智能体应用',
            dir: '/pages/agent-app',
            port: 3301,
            startCommand: 'node server.js',
            kind: 'page',
            status: 'stopped',
            manageAsApp: true,
            envVars: [
              {
                key: 'AGENT_HOME',
                label: 'AGI 数据目录',
                defaultPath: '/env/agent',
                description: '智能体状态与登录态存放处'
              }
            ]
          }
        ])
      ),
    setPagePort: (id: string, port?: number) => {
      persistedSettings.pagePorts = { ...(persistedSettings.pagePorts as object), [id]: port }
      return Promise.resolve(ok(true))
    },
    getSettings: () => Promise.resolve(ok({ ...persistedSettings })),
    updateSettings: (partial: Record<string, unknown>) => {
      Object.assign(persistedSettings, partial)
      return Promise.resolve(ok({ ...persistedSettings }))
    },
    checkUpdates: () => Promise.resolve(ok([])),
    getEnvRoot: () => Promise.resolve(ok({ envRoot: '/env', installDir: '/', home: '/' })),
    getNativeTheme: () => Promise.resolve(ok(true)), // pretend OS is dark
    setNativeTheme: () => Promise.resolve(ok(true)),
    onNativeTheme: () => () => undefined,
    minimizeWindow: () => Promise.resolve(ok(true)),
    toggleMaximize: () => Promise.resolve(ok(false)),
    closeWindow: () => Promise.resolve(ok(true)),
    getIsMaximized: () => Promise.resolve(ok(false)),
    onMaximizedChanged: () => () => undefined,
    onQuitConfirm: () => () => undefined,
    onStateChanged: () => () => undefined,
    onOpenTerminalPage: () => () => undefined,
    toggleDevTools: () => Promise.resolve(ok({})),
    openExternal: () => Promise.resolve(ok(true)),
    ptyStart: (target: string) =>
      Promise.resolve(ok({ id: `pty-${target}`, title: target, cwd: '/tmp' })),
    pageRunSpec: () => Promise.resolve(ok(null)),
    ptyWrite: () => Promise.resolve(ok(true)),
    ptyResize: () => Promise.resolve(ok(true)),
    ptyKill: () => Promise.resolve(ok(true)),
    onPtyData: () => () => undefined,
    onPtyExit: () => () => undefined,
    dshStatus: () => Promise.resolve(ok({ installed: true })),
    dshListPlugins: () => Promise.resolve(ok([])),
    openclawStatus: () =>
      Promise.resolve(ok({ installed: false, home: '~/.openclaw', port: 18789 })),
    openclawToken: () => Promise.resolve(ok(null)),
    removePage: () => Promise.resolve(ok(true))
  }
}

let pinia: ReturnType<typeof createPinia>
let currentApp: ReturnType<typeof createApp> | null = null

async function mountApp(): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.id = 'app'
  document.body.appendChild(host)
  pinia = createPinia()
  const app = createApp(App)
  app.use(pinia).use(ElementPlus)
  app.mount(host)
  currentApp = app
  await nextTick()
  await new Promise((r) => setTimeout(r, 60))
  await nextTick()
  return host
}

const click = async (el: Element | null): Promise<void> => {
  ;(el as HTMLElement)?.click()
  await nextTick()
  await new Promise((r) => setTimeout(r, 30))
  await nextTick()
}

/** Open the unified console from the single top-bar 「设置」 entry. */
async function openConsole(): Promise<void> {
  const trigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
    b.textContent?.includes('设置')
  )
  await click(trigger ?? null)
  await new Promise((r) => setTimeout(r, 60))
  await nextTick()
}

/** Select a console left-nav leaf by its (partial) label; renders that function on the right. */
async function gotoLeaf(label: string): Promise<void> {
  const item = [...document.querySelectorAll('.console .nav-item')].find((b) =>
    b.textContent?.includes(label)
  )
  await click(item ?? null)
  await new Promise((r) => setTimeout(r, 60))
  await nextTick()
}

beforeEach(() => {
  // Tear down the previous app before each test: the terminal drawer mounts el-dropdowns whose
  // teleported poppers / document-level listeners survive a bare `body.innerHTML = ''`. Unmounting
  // releases them so no leftover surface can interfere with the next test's menu clicks.
  currentApp?.unmount()
  currentApp = null
  document.documentElement.className = ''
  document.body.innerHTML = ''
  persistedSettings.theme = 'auto'
  persistedSettings.locale = 'zh'
  persistedSettings.externalSites = []
  ;(window as unknown as { container: unknown }).container = makeContainerMock()
})

describe('shell chrome theme + layout', () => {
  it('light setting forces the light class even when OS is dark', async () => {
    await mountApp()
    // applyTheme runs through watchEffect; with theme=auto and OS dark it should NOT be light.
    expect(document.documentElement.classList.contains('light')).toBe(false)
    const store = useSettingsStore(pinia)
    await store.patch({ theme: 'light' })
    await nextTick()
    await new Promise((r) => setTimeout(r, 20))
    expect(document.documentElement.classList.contains('light')).toBe(true)
    await store.patch({ theme: 'dark' })
    await nextTick()
    await new Promise((r) => setTimeout(r, 20))
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('the title bar button toggles only day/night, never back to auto', async () => {
    await mountApp()
    const btn = document.querySelector('.menubar .theme-toggle')
    expect(btn).not.toBeNull()
    // start: theme=auto with a dark OS mock → dark shown
    expect(document.documentElement.classList.contains('light')).toBe(false)
    await click(btn) // dark shown → pin light
    await new Promise((r) => setTimeout(r, 30))
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(persistedSettings.theme).toBe('light')
    await click(btn) // light shown → pin dark (must NOT return to auto)
    await new Promise((r) => setTimeout(r, 30))
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(persistedSettings.theme).toBe('dark')
  })

  it('docks the menu bar flush at the top with no persistent page bar', async () => {
    await mountApp()
    const menubar = document.querySelector('.menubar')
    expect(menubar).not.toBeNull()
    expect((menubar as HTMLElement).getBoundingClientRect().top).toBe(0)
    // PageTabs was replaced by an in-webview floating toolbar; no full-width bar remains.
    expect(document.querySelector('.pagetabs')).toBeNull()
  })

  it('collapses the top bar to a single console entry that opens the unified panel', async () => {
    await mountApp()
    const triggers = [...document.querySelectorAll('.menubar .group-trigger')]
    // The ten scattered panels folded into one surface: exactly one trigger, labelled 设置.
    expect(triggers.length).toBe(1)
    expect(triggers[0].textContent).toContain('设置')
    await openConsole()
    // A wider console card whose left rail carries the grouped nav.
    expect(document.querySelector('.panel-card.is-console')).not.toBeNull()
    expect(document.querySelector('.console')).not.toBeNull()
    const groups = [...document.querySelectorAll('.console .nav-group-title')].map((e) =>
      e.textContent?.trim()
    )
    expect(groups).toContain('页面与应用')
    expect(groups).toContain('运行环境')
    expect(groups).toContain('帮助与诊断')
  })

  it('console ▸ 已安装页面 shows the list; the ⚙配置 dialog shows the port', async () => {
    await mountApp()
    await openConsole()
    await gotoLeaf('已安装页面')
    expect(document.querySelector('.installed')).not.toBeNull()
    // Row actions are glyphs only — the label lives in the themed tooltip + aria-label, so
    // English can't overflow the fixed-width action column. Locate by accessible name.
    const cfgBtn = document.querySelector('.installed .el-button[aria-label="配置"]')
    expect(cfgBtn).not.toBeNull()
    await click(cfgBtn ?? null)
    await new Promise((r) => setTimeout(r, 80))
    const dlgs = [...document.querySelectorAll('.el-dialog')]
    const dlg = dlgs.find((d) => d.textContent?.includes('· 配置'))
    expect(dlg).not.toBeNull()
    expect(dlg?.textContent).toContain('DSH (web) · 配置')
    // The ⚙ dialog keeps only the generic knobs: port + 自动启动 + free KEY=VALUE.
    expect(dlg?.textContent).toContain('端口（留空 = 项目声明端口）')
    expect(dlg?.textContent).toContain('项目声明端口 :8899')
  })

  it('console ▸ 环境目录 aggregates declared env dirs into two-choice cards', async () => {
    await mountApp()
    await openConsole()
    // Declared env dirs live in their own nav leaf (moved out of the ⚙ dialog).
    await gotoLeaf('环境目录')
    await new Promise((r) => setTimeout(r, 80))
    const section = [...document.querySelectorAll('.env-section')].find((s) =>
      s.textContent?.includes('DSH Home')
    )
    expect(section).not.toBeNull()
    expect(section?.textContent).toContain('DSH (web)')
    expect(section?.textContent).toContain('独立目录')
    expect(section?.textContent).toContain('系统通用目录')
    // the manifest description survives as the row's visible note under the label
    expect(section?.querySelector('.env-desc')?.textContent).toContain('profile 容器目录')
  })

  it('console ▸ 外部地址 lists saved sites; the 新增 dialog teleports out of the card', async () => {
    persistedSettings.externalSites = [{ id: 's1', name: '示例站', url: 'https://example.com' }]
    await mountApp()
    await openConsole()
    await gotoLeaf('外部地址')
    await new Promise((r) => setTimeout(r, 60))
    expect(document.querySelector('.console-content')?.textContent).toContain('示例站')
    const addBtn = [...document.querySelectorAll('.panel-card button')].find((b) =>
      b.textContent?.includes('新增')
    )
    await click(addBtn ?? null)
    // The console card's backdrop-filter is a containing block for fixed descendants: an in-place
    // overlay would render (and clip) inside the card. append-to-body must put it on <body>.
    expect(document.querySelector('.panel-card .el-overlay')).toBeNull()
    expect(document.querySelector('body > .el-overlay')).not.toBeNull()
    expect(document.querySelector('.el-dialog')?.textContent).toContain('新增外部地址')
    const cancel = [...document.querySelectorAll('.el-dialog__footer button')].find((b) =>
      b.textContent?.includes('取消')
    )
    await click(cancel ?? null)
    // display:none lands only when the dialog's leave transition ends (rAF-driven);
    // the click helper's 30 ms budget is tight under full-suite load — give it room.
    await new Promise((r) => setTimeout(r, 150))
    await nextTick()
    expect((document.querySelector('.el-overlay') as HTMLElement | null)?.style.display).toBe(
      'none'
    )
  })

  it('console ▸ a manageAsApp agent leaf opens AppManager with its declared env dir', async () => {
    await mountApp()
    await openConsole()
    // The dynamic agent-app leaf is labelled with the page name itself.
    await gotoLeaf('智能体应用')
    await new Promise((r) => setTimeout(r, 60))
    const body = document.querySelector('.console-content')
    expect(body?.textContent).toContain('控制')
    expect(body?.textContent).toContain('配置')
    // declared envVars render as their own directory input
    expect(body?.textContent).toContain('AGI 数据目录')
    expect(body?.textContent).toContain('智能体状态与登录态存放处')
  })

  it('console ▸ 关于与运行 shows the merged about + updates content', async () => {
    await mountApp()
    await openConsole()
    await gotoLeaf('关于与运行')
    await new Promise((r) => setTimeout(r, 60))
    // One pane carrying the about KVs (the updates table shares the help panel's other leaves).
    expect(document.querySelector('.console-content')?.textContent).toContain('内置 Node')
  })

  it('the console dismisses on click-away but not on its own surface', async () => {
    await mountApp()
    /**
     * The dismiss path is a capture-phase *mousedown* (matching how a desktop menu behaves and
     * so a press that starts a text selection already counts). `el.click()` synthesises none,
     * hence the explicit dispatch.
     */
    const press = async (el: Element | null): Promise<void> => {
      el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await nextTick()
      await new Promise((r) => setTimeout(r, 30))
      await nextTick()
    }
    await openConsole()
    expect(document.querySelector('.panel-card')).not.toBeNull()

    // A press inside the console is the user working in it, not blank space.
    await press(document.querySelector('.console-content'))
    expect(document.querySelector('.panel-card')).not.toBeNull()
    // A second-level dialog teleports to <body>; its overlay is still the panel's own surface, so
    // closing the console under a half-filled form is wrong.
    const overlay = document.createElement('div')
    overlay.className = 'el-overlay'
    document.body.appendChild(overlay)
    await press(overlay)
    expect(document.querySelector('.panel-card')).not.toBeNull()
    overlay.remove()
    // Blank content area → dismiss.
    await press(document.querySelector('.content-main'))
    expect(document.querySelector('.panel-card')).toBeNull()
  })

  it('switching the language to English re-renders the console chrome', async () => {
    await mountApp()
    await openConsole()
    const zhLabel = [...document.querySelectorAll('.menubar .group-trigger')]
      .map((b) => b.textContent?.trim())
      .join('|')
    expect(zhLabel).toContain('设置')
    const zhGroups = [...document.querySelectorAll('.console .nav-group-title')].map((e) =>
      e.textContent?.trim()
    )
    expect(zhGroups).toContain('页面与应用')
    const store = useSettingsStore(pinia)
    await store.patch({ locale: 'en' })
    await nextTick() // let the settings watch call setLocale (arms the lazy import)
    await localeDictReady() // the en dictionary is lazy-loaded on first switch
    await nextTick()
    const enLabel = [...document.querySelectorAll('.menubar .group-trigger')]
      .map((b) => b.textContent?.trim())
      .join('|')
    expect(enLabel).toContain('Settings')
    expect(enLabel).not.toContain('设置')
    const enGroups = [...document.querySelectorAll('.console .nav-group-title')].map((e) =>
      e.textContent?.trim()
    )
    expect(enGroups).toContain('Pages & apps')
  })

  it('delete confirm renders a styled message box carrying the page id', async () => {
    await mountApp()
    let resolved = 'pending'
    void ElMessageBox.confirm(
      '将删除 pages/openclaw 目录（进程会先停止）。此操作不可恢复。',
      '移除 OpenClaw',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    ).then(
      () => (resolved = 'confirm'),
      () => (resolved = 'cancel')
    )
    await new Promise((r) => setTimeout(r, 50))
    const box = document.querySelector('.el-message-box')
    expect(box).not.toBeNull()
    expect(box?.textContent).toContain('pages/openclaw')
    // click 删除 to resolve
    const confirmBtn = [...document.querySelectorAll('.el-message-box__btns button')].find((b) =>
      b.textContent?.includes('删除')
    )
    await click(confirmBtn ?? null)
    await new Promise((r) => setTimeout(r, 20))
    expect(resolved).toBe('confirm')
  })
})
