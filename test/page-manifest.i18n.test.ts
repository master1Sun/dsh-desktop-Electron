import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerLocaleSource, resolveText } from '../src/main/i18n'
import type { LocalizableText } from '../src/shared/types'

/**
 * `container.json` text fields accept either a plain string (language-neutral) or a
 * `{ zh, en }` pair. The main process flattens them when it reads the manifest, so these
 * tests cover the resolution rules and then check that the shipped manifests really do
 * carry both languages — the migration is otherwise invisible until someone flips the UI
 * language on a packaged build.
 */

let lang: 'zh' | 'en' = 'zh'

beforeEach(() => {
  lang = 'zh'
  registerLocaleSource(() => lang)
})

const manifestPath = (id: string): string =>
  fileURLToPath(new URL(`../pages/${id}/container.json`, import.meta.url))

const readManifest = (id: string): RawManifest =>
  JSON.parse(readFileSync(manifestPath(id), 'utf-8')) as RawManifest

/** The subset of a manifest this test inspects, typed loosely on purpose: it is raw JSON. */
interface RawManifest {
  name?: unknown
  description?: unknown
  envVars?: Array<{ key?: string; label?: unknown; description?: unknown }>
}

/** Every localizable field in a manifest, flattened to [path, raw value] pairs. */
function textFields(manifest: RawManifest): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = []
  if (manifest.name !== undefined) out.push(['name', manifest.name])
  if (manifest.description !== undefined) out.push(['description', manifest.description])
  for (const spec of manifest.envVars ?? []) {
    if (spec.label !== undefined) out.push([`envVars.${spec.key}.label`, spec.label])
    if (spec.description !== undefined)
      out.push([`envVars.${spec.key}.description`, spec.description])
  }
  return out
}

describe('resolveText', () => {
  it('leaves a plain string alone in either language', () => {
    for (const l of ['zh', 'en'] as const) {
      lang = l
      expect(resolveText('DSH (web)')).toBe('DSH (web)')
    }
  })

  it('picks the variant matching the active language', () => {
    const value: LocalizableText = { zh: '配置目录', en: 'config directory' }
    lang = 'zh'
    expect(resolveText(value)).toBe('配置目录')
    lang = 'en'
    expect(resolveText(value)).toBe('config directory')
  })

  it('falls back to the other variant instead of going blank', () => {
    lang = 'en'
    expect(resolveText({ zh: '仅中文' })).toBe('仅中文')
    lang = 'zh'
    expect(resolveText({ en: 'English only' })).toBe('English only')
  })

  it('treats a missing or blank value as unset', () => {
    lang = 'en'
    expect(resolveText({ zh: '有中文', en: '' })).toBe('有中文')
    expect(resolveText('', 'fallback')).toBe('fallback')
    expect(resolveText(undefined, 'fallback')).toBe('fallback')
    expect(resolveText({}, 'fallback')).toBe('fallback')
  })
})

describe('shipped page manifests', () => {
  for (const id of ['dsh-web', 'openclaw']) {
    // A plain-string `name` is legitimate — "DSH (web)" / "OpenClaw Gateway" are product names
    // that read the same everywhere. What must hold is that every field yields text in *both*
    // languages, so neither UI can end up with a blank label or description.
    it(`pages/${id}/container.json reads in both languages`, () => {
      const fields = textFields(readManifest(id))
      expect(fields.length).toBeGreaterThan(0)
      for (const l of ['zh', 'en'] as const) {
        lang = l
        for (const [path, value] of fields) {
          expect(resolveText(value as LocalizableText | undefined), `${path} [${l}]`).toBeTruthy()
        }
      }
    })

    it(`pages/${id}/container.json is really translated`, () => {
      const fields = textFields(readManifest(id))
      const read = (l: 'zh' | 'en'): string[] => {
        lang = l
        return fields.map(([, value]) => resolveText(value as LocalizableText | undefined))
      }
      // Not just structural: at least one field has to differ, or the file only *looks* localized.
      expect(read('zh')).not.toEqual(read('en'))
    })
  }

  it('resolves to different text per language', () => {
    const manifest = readManifest('openclaw')
    const label = manifest.envVars?.[0]?.label as LocalizableText | undefined
    lang = 'zh'
    expect(resolveText(manifest.name as LocalizableText | undefined)).toBe('OpenClaw Gateway')
    expect(resolveText(label)).toBe('OPENCLAW 配置目录')
    lang = 'en'
    expect(resolveText(label)).toBe('OPENCLAW config directory')
  })
})
