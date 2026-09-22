import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ExternalSite, Locale } from '../../../shared/types'
import { t } from '../i18n'

export interface DefaultView {
  kind: 'none' | 'page' | 'external'
  pageId?: string
  url?: string
}

export interface Settings {
  defaultView: DefaultView
  openExternalIn: 'embedded' | 'system-browser'
  minimizeToTray: boolean
  /** start the container at OS login, then minimize to the tray */
  launchAtStartup: boolean
  /** health guard: auto-restart a page that crashes after it has started */
  crashAutoRestart: boolean
  /** OS notifications for guard give-up / OTA-ready events */
  systemNotifications: boolean
  autoStartPages: string[]
  /** pages the user pinned auto-start on by hand (sticky vs. the 默认打开 coupling) */
  autoStartManual?: string[]
  lastExternalUrls: string[]
  externalSites: ExternalSite[]
  theme: 'auto' | 'light' | 'dark'
  /** UI display language; 'zh' default, 'en' for English */
  locale: Locale
  /** root for every runtime's config dir; empty = follow the install dir */
  envRoot: string
  dshHome: string
  openclawHome: string
  /** where embedded-page downloads save; empty = the OS Downloads folder */
  downloadDir: string
  pageEnvs: Record<string, Record<string, string>>
  pagePorts: Record<string, number>
  /** #25: custom accent hex; '' = keep the theme's CSS default */
  accentColor?: string
  /** #25: glass blur strength in px; undefined = stylesheet default, applied value clamped to GLASS_BLUR_MAX_PX */
  glassBlur?: number
  /** #25: frosted-surface opacity (%); overrides --glass-tint-a live; undefined = coupled to blur */
  glassAlpha?: number
  /** #20: RSS (MB) over which a running page is flagged over-budget */
  memWarnMb?: number
  /** 内嵌终端面板被拖出的高度（px），下次启动恢复 */
  terminalHeight?: number
  /** #26: 记住并恢复窗口尺寸/位置/最大化状态 */
  rememberWindowBounds?: boolean
  /** #26: 'auto' 跟随系统减少动效偏好，'on'/'off' 仅对本应用强制 */
  reduceMotion?: 'auto' | 'on' | 'off'
  /** #26: 容器与其托管页面安装依赖走的 npm registry；空 = 内置镜像 */
  npmRegistry?: string
  /** #26: 托盘菜单列出页面的程度 */
  trayPageEntries?: 'all' | 'running' | 'off'
  /** #26: 允许点亮托盘角标的级别 */
  trayBadge?: 'all' | 'alert' | 'off'
}

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || t('common.unknownError'))
  return res.data as T
}

/* ---- #26: reduced motion -------------------------------------------------------------
   The tri-state setting and the OS hint collapse into ONE boolean, painted as `.reduce-motion` on
   <html>. That is deliberate: every damping rule used to sit inside
   `@media (prefers-reduced-motion: reduce)`, which a user can't turn back off from inside the app.
   `reduceMotion` is exported so JS-driven animations (the market's card tilt) can skip themselves
   the same way the CSS does. */
export const reduceMotion = ref(false)

/** What the OS itself asks for — the 'auto' leg of the setting. */
export function osPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Resolve setting + OS into the class + the exported flag. Undefined mode = 'auto'. */
export function applyReduceMotion(mode?: 'auto' | 'on' | 'off'): void {
  const on = mode !== 'off' && (mode === 'on' || osPrefersReducedMotion())
  reduceMotion.value = on
  document.documentElement.classList.toggle('reduce-motion', on)
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({
    defaultView: { kind: 'none' },
    openExternalIn: 'embedded',
    minimizeToTray: true,
    launchAtStartup: false,
    crashAutoRestart: true,
    systemNotifications: true,
    autoStartPages: [],
    lastExternalUrls: [],
    externalSites: [],
    theme: 'auto',
    locale: 'zh',
    envRoot: '',
    dshHome: '',
    openclawHome: '',
    downloadDir: '',
    pageEnvs: {},
    pagePorts: {},
    accentColor: '',
    glassBlur: 30,
    glassAlpha: 60,
    memWarnMb: 800,
    terminalHeight: 320,
    rememberWindowBounds: true,
    reduceMotion: 'auto',
    npmRegistry: '',
    trayPageEntries: 'all',
    trayBadge: 'all'
  })
  const loaded = ref(false)

  async function load(): Promise<void> {
    Object.assign(settings, await unwrap<Settings>(window.container.getSettings()))
    loaded.value = true
  }

  async function patch(partial: Partial<Settings>): Promise<void> {
    const next = await unwrap<Settings>(window.container.updateSettings(partial))
    Object.assign(settings, next)
  }

  return { settings, loaded, load, patch }
})
