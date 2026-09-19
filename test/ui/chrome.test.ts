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
            launchUrl: 'http://127.0.0.1:8899/?token=abc',
            envVars: [
              {
                key: 'DSH_HOME',
                label: 'DSH Home',
                defaultPath: '~/.dsh',
                description: 'profile 容器目录'
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
    getNativeTheme: () => Promise.resolve(ok(true)), // pretend OS is dark
    setNativeTheme: () => Promise.resolve(ok(true)),
    onNativeTheme: () => () => undefined,
    minimizeWindow: () => Promise.resolve(ok(true)),
    toggleMaximize: () => Promise.resolve(ok(false)),
    closeWindow: () => Promise.resolve(ok(true)),
    getIsMaximized: () => Promise.resolve(ok(false)),
    onMaximizedChanged: () => () => undefined,
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
    const pagesTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('页面')
    )
    await click(pagesTrigger ?? null) // plain panel group: one click opens the panel
    await new Promise((r) => setTimeout(r, 60))
    expect(document.querySelector('.installed')).not.toBeNull()
    const cfgBtn = [...document.querySelectorAll('.installed .el-button')].find((b) =>
      b.textContent?.includes('配置')
    )
    expect(cfgBtn).not.toBeNull()
    await click(cfgBtn ?? null)
    await new Promise((r) => setTimeout(r, 80))
    const dlgs = [...document.querySelectorAll('.el-dialog')]
    const dlg = dlgs.find((d) => d.textContent?.includes('· 配置'))
    expect(dlg?.textContent).toContain('DSH (web) · 配置')
    // dynamic: the container.json-declared env var renders its own input
    expect(dlg?.textContent).toContain('DSH Home')
    expect(dlg?.textContent).toContain('profile 容器目录')
    expect(dlg?.querySelectorAll('input').length).toBeGreaterThanOrEqual(2)
  })

  it('clicking a group trigger never shows panel and drop list together', async () => {
    await mountApp()
    const viewTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('视图')
    )
    await click(viewTrigger ?? null) // first click → panel opens, no list
    expect(document.querySelector('.panel-card')).not.toBeNull()
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
    await click(viewTrigger ?? null) // re-click → list appears, panel retracts
    expect(document.querySelector('.dropdown.drop-list')).not.toBeNull()
    expect(document.querySelector('.panel-card')).toBeNull()
    await click(viewTrigger ?? null) // third click → panel back, list gone
    expect(document.querySelector('.panel-card')).not.toBeNull()
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
  })

  it('the merged 应用 group lists external/dsh/openclaw and opens panels from rows', async () => {
    persistedSettings.externalSites = [{ id: 's1', name: '示例站', url: 'https://example.com' }]
    await mountApp()
    const labels = [...document.querySelectorAll('.menubar .group-trigger')].map((b) =>
      b.textContent?.trim()
    )
    expect(labels.some((t) => t?.includes('应用'))).toBe(true)
    expect(labels.some((t) => t === 'DSH' || t === 'OpenClaw' || t?.includes('外部地址'))).toBe(
      false
    )
    const appsTrigger = [...document.querySelectorAll('.menubar .group-trigger')].find((b) =>
      b.textContent?.includes('应用')
    )
    await click(appsTrigger ?? null) // click → drop list only, never a panel
    expect(document.querySelector('.dropdown.drop-list')).not.toBeNull()
    expect(document.querySelector('.panel-card')).toBeNull()
    const extRow = [...document.querySelectorAll('.drop-list .drop-item')].find((b) =>
      b.textContent?.includes('外部地址')
    )
    expect(extRow).not.toBeNull()
    await click(extRow ?? null) // row click → closes list, opens that panel
    expect(document.querySelector('.dropdown.drop-list')).toBeNull()
    expect(document.querySelector('.panel-card')).not.toBeNull()
    expect(document.querySelector('.panel-body')?.textContent).toContain('示例站')
    persistedSettings.externalSites = []
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
