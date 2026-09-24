import { ref, shallowRef } from 'vue'
import type { Locale } from '../../../shared/types'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import enLocale from 'element-plus/es/locale/lang/en'
import zh from './locales/zh'

/**
 * Lightweight i18n: a reactive `locale` ref + a `t()` lookup with `{param}` interpolation.
 * Chinese is the source/canonical language (it mirrors the original UI strings); English is
 * the translation. Kept dependency-free on purpose — the only external piece is the Element
 * Plus locale for its built-in components (`el-config-provider`).
 *
 * The English dictionary is lazy-loaded on the first switch to `en` (see setLocale): it never
 * enters the default zh chunk. `t()` falls back to zh while the load is in flight, and reads
 * the `enDict` shallowRef so every consumer that already depends on `t()` re-renders once the
 * dictionary lands — no second locale flip needed.
 */

export const locale = ref<Locale>('zh')

/** Loaded English dictionary, or null while it has never been requested / is in flight. */
const enDict = shallowRef<Record<string, unknown> | null>(null)
let enLoading: Promise<void> | null = null

/** Look up a dotted key (e.g. `menu.view`) in the active dictionary, with `{name}` interpolation. */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = locale.value === 'en' ? (enDict.value ?? zh) : zh
  const raw = getDeep(dict, key) ?? getDeep(zh, key)
  if (typeof raw !== 'string') return key
  let str = raw
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

function getDeep(dict: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, dict)
}

export function setLocale(next: Locale): void {
  locale.value = next
  if (next === 'en' && !enDict.value && !enLoading) {
    enLoading = import('./locales/en')
      .then((mod) => {
        enDict.value = mod.default
      })
      .catch(() => {
        enLoading = null // keep `locale` on en (zh fallback) but allow a retry next switch
      })
  }
}

/**
 * Resolves once the active locale's dictionary is fully in place — immediately for zh, or
 * after the lazy `en` chunk lands when the locale is en. Consumers that must SEE the new
 * language right away (tests, one-shot re-renders) can await this after `setLocale`.
 */
export function localeDictReady(): Promise<void> {
  return locale.value === 'en' && enLoading ? enLoading : Promise.resolve()
}

/** Locale object for Element Plus' built-in components, matching the active language. */
export function epLocale(): typeof zhCn | typeof enLocale {
  return locale.value === 'en' ? enLocale : zhCn
}
