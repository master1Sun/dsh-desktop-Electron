import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ExternalSite } from '../../../shared/types'

export interface DefaultView {
  kind: 'none' | 'page' | 'external'
  pageId?: string
  url?: string
}

export interface Settings {
  defaultView: DefaultView
  openExternalIn: 'embedded' | 'system-browser'
  minimizeToTray: boolean
  autoStartPages: string[]
  lastExternalUrls: string[]
  externalSites: ExternalSite[]
  theme: 'auto' | 'light' | 'dark'
  dshHome: string
  openclawHome: string
  pageEnvs: Record<string, Record<string, string>>
  pagePorts: Record<string, number>
}

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || '未知错误')
  return res.data as T
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({
    defaultView: { kind: 'none' },
    openExternalIn: 'embedded',
    minimizeToTray: true,
    autoStartPages: [],
    lastExternalUrls: [],
    externalSites: [],
    theme: 'auto',
    dshHome: '',
    openclawHome: '',
    pageEnvs: {},
    pagePorts: {}
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
