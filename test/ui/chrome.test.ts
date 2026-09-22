import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import App from '../../src/renderer/src/App.vue'
import { useSettingsStore } from '../../src/renderer/src/stores/settings'
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
    getEnvRoot: () => Promise.resolve(ok({ envRoot: '/env', installDir: '/', custom: false })),
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

async function mountApp(): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.id = 'app'
  document.body.appendChild(host)
  pinia = createPinia()
  const app = createApp(App)
  app.use(pinia).use(ElementPlus)
  app.mount(host)
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

beforeEach(() => {
  document.documentElement.className = ''
  document.body.innerHTML = ''
  persistedSettings.theme = 'auto'
  persistedSettings.locale = 'zh'
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

  it('row ⚙配置 dialog shows port + the env dirs this project declares', async () => {
    await mountApp()
    const sysTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('系统')
    )
    // 页面/设置 merged into 系统: trigger drops a list, the 页面 row opens the panel.
    await click(sysTrigger ?? null)
    const pagesRow = [...document.querySelectorAll('.drop-list .drop-item')].find((b) =>
      b.textContent?.includes('页面')
    )
    await click(pagesRow ?? null)
    await new Promise((r) => setTimeout(r, 60))
    expect(document.querySelector('.panel-card')).not.toBeNull()
    expect(document.querySelector('.installed')).not.toBeNull()
    // Row actions are glyphs only — the label lives in the tooltip, so English can't overflow the
    // fixed-width action column. Locate the entry point by that tooltip instead of by text.
    const cfgBtn = document.querySelector('.installed .el-button[title="配置"]')
    expect(cfgBtn).not.toBeNull()
    await click(cfgBtn ?? null)
    await new Promise((r) => setTimeout(r, 80))
    const dlgs = [...document.querySelectorAll('.el-dialog')]
    const dlg = dlgs.find((d) => d.textContent?.includes('· 配置'))
    expect(dlg).not.toBeNull()
    expect(dlg?.textContent).toContain('DSH (web) · 配置')
    // dynamic: the container.json-declared env var renders its own input
    expect(dlg?.textContent).toContain('DSH Home')
    expect(dlg?.textContent).toContain('profile 容器目录')
    expect(dlg?.querySelectorAll('input').length).toBeGreaterThanOrEqual(2)
  })

  it('list groups toggle a drop list; 系统 rows open the settings/pages panels', async () => {
    await mountApp()
    const findTrigger = (label: string): Element | undefined =>
      [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
        b.textContent?.includes(label)
      )
    // 视图 carries the app managers → always a drop list, never its own panel.
    const viewTrigger = findTrigger('视图')
    await click(viewTrigger ?? null)
    expect(document.querySelector('.dropdown.drop-list')).not.toBeNull()
    expect(document.querySelector('.panel-card')).toBeNull()
    expect(
      [...document.querySelectorAll('.drop-list .drop-item')].some((b) =>
        b.textContent?.includes('DSH 管理器')
      )
    ).toBe(true)
    await click(viewTrigger ?? null) // re-click → list toggles closed
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
    // 系统 merged 页面+设置: trigger drops a list, a row opens the panel.
    const sysTrigger = findTrigger('系统')
    await click(sysTrigger ?? null)
    const rows = [...document.querySelectorAll('.drop-list .drop-item')]
    expect(rows.some((b) => b.textContent?.includes('设置'))).toBe(true)
    expect(rows.some((b) => b.textContent?.includes('页面'))).toBe(true)
    const settingsRow = rows.find((b) => b.textContent?.includes('设置'))
    await click(settingsRow ?? null) // row click → closes list, opens the settings panel
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
    expect(document.querySelector('.panel-card')).not.toBeNull()
    // Parent trigger stays highlighted while its child panel is open.
    expect(findTrigger('系统')?.classList.contains('active')).toBe(true)
  })

  it('switching the language to English re-renders the menu chrome', async () => {
    await mountApp()
    const zhLabels = [...document.querySelectorAll('.menubar .group-trigger')].map((b) =>
      b.textContent?.trim()
    )
    expect(zhLabels.some((x) => x?.includes('视图'))).toBe(true)
    const store = useSettingsStore(pinia)
    await store.patch({ locale: 'en' })
    await nextTick()
    await new Promise((r) => setTimeout(r, 30))
    const enLabels = [...document.querySelectorAll('.menubar .group-trigger')].map((b) =>
      b.textContent?.trim()
    )
    expect(enLabels.some((x) => x?.includes('View'))).toBe(true)
    expect(enLabels.some((x) => x?.includes('视图'))).toBe(false)
  })

  it('系统 ▸ 页面 opens the manage panel; 视图 lists the app managers', async () => {
    persistedSettings.externalSites = [{ id: 's1', name: '示例站', url: 'https://example.com' }]
    await mountApp()
    const labels = [...document.querySelectorAll('.menubar .group-trigger')].map((b) =>
      b.textContent?.trim()
    )
    // 应用 was merged away: no separate trigger, and DSH/OpenClaw/外部地址 are no
    // longer top-level either — they live under 视图. 页面/设置 merged into 系统.
    expect(labels.some((t) => t?.includes('应用'))).toBe(false)
    expect(labels.some((t) => t === 'DSH' || t === 'OpenClaw' || t?.includes('外部地址'))).toBe(
      false
    )
    expect(labels.some((t) => t === '页面' || t === '设置')).toBe(false)
    const findTrigger = (label: string): Element | undefined =>
      [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
        b.textContent?.includes(label)
      )
    const sysTrigger = findTrigger('系统')
    await click(sysTrigger ?? null) // opens the drop list first, never the panel
    const rows = [...document.querySelectorAll('.drop-list .drop-item')]
    const pagesRow = rows.find((b) => b.textContent?.includes('页面'))
    expect(pagesRow).not.toBeNull()
    expect(document.querySelector('.panel-card')).toBeNull()
    await click(pagesRow ?? null) // row click → opens the manage-pages panel
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
    expect(document.querySelector('.panel-card')).not.toBeNull()
    // Built-in managers moved under 视图, which keeps a drop list.
    const viewTrigger = findTrigger('视图')
    await click(viewTrigger ?? null)
    const viewRows = [...document.querySelectorAll('.drop-list .drop-item')]
    expect(viewRows.some((b) => b.textContent?.includes('DSH 管理器'))).toBe(true)
    expect(viewRows.some((b) => b.textContent?.includes('OpenClaw 管理器'))).toBe(true)
    const extRow = viewRows.find((b) => b.textContent?.includes('外部地址'))
    expect(extRow).not.toBeNull()
    await click(extRow ?? null) // row click → closes list, opens that panel
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
    expect(document.querySelector('.panel-card')).not.toBeNull()
    expect(document.querySelector('.panel-body')?.textContent).toContain('示例站')
    persistedSettings.externalSites = []
  })

  it('external add dialog teleports out of the frosted panel card', async () => {
    await mountApp()
    const viewTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('视图')
    )
    await click(viewTrigger ?? null)
    const rows = [...document.querySelectorAll('.drop-list .drop-item')]
    const extRow = rows.find((b) => b.textContent?.includes('外部地址'))
    await click(extRow ?? null)
    const addBtn = [...document.querySelectorAll('.panel-card button')].find((b) =>
      b.textContent?.includes('新增')
    )
    await click(addBtn ?? null)
    // The panel card's backdrop-filter is a containing block for fixed descendants: an in-place
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

  it('manageAsApp pages get a 设置… row in 视图 that opens AppManager', async () => {
    await mountApp()
    const viewTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('视图')
    )
    await click(viewTrigger ?? null)
    const rows = [...document.querySelectorAll('.drop-list .drop-item')]
    const cfgRow = rows.find((b) => b.textContent?.includes('智能体应用 · 设置'))
    expect(cfgRow).not.toBeNull()
    await click(cfgRow ?? null)
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
    const body = document.querySelector('.panel-body')
    expect(body?.textContent).toContain('控制')
    expect(body?.textContent).toContain('配置')
    // declared envVars render as their own directory input
    expect(body?.textContent).toContain('AGI 数据目录')
    expect(body?.textContent).toContain('智能体状态与登录态存放处')
  })

  it('帮助 menu opens the merged about+updates panel from one row', async () => {
    await mountApp()
    const helpTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('帮助')
    )
    await click(helpTrigger ?? null)
    const helpRows = [...document.querySelectorAll('.drop-list .drop-item')]
    // 打开日志目录 / 调试 DevTools moved out of the menu — only the palette still offers them.
    expect(helpRows.some((b) => b.textContent?.includes('DevTools'))).toBe(false)
    expect(helpRows.some((b) => b.textContent?.includes('打开日志目录'))).toBe(false)
    const aboutRow = helpRows.find((b) => b.textContent?.includes('关于与更新'))
    expect(aboutRow).not.toBeNull()
    await click(aboutRow ?? null)
    const card = document.querySelector('.panel-card')
    expect(card).not.toBeNull()
    // One panel carrying both the about KVs and the updates table — no second entry.
    expect(document.querySelector('.panel-body')?.textContent).toContain('内置 Node')
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
