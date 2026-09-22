import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { dictionaries, m, registerLocaleSource } from '../src/main/i18n'

const SRC = resolve(__dirname, '..', 'src')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|vue|mts|cts)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('main-process i18n', () => {
  let lang: 'zh' | 'en' = 'zh'
  beforeEach(() => {
    lang = 'zh'
    registerLocaleSource(() => lang)
  })

  it('defines the same keys in both languages', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.zh).sort())
  })

  it('interpolates {params}', () => {
    expect(m('tray.stop', { name: 'dsh-web' })).toBe('停止 dsh-web')
    lang = 'en'
    expect(m('tray.stop', { name: 'dsh-web' })).toBe('Stop dsh-web')
  })

  it('treats anything other than "en" as Chinese', () => {
    registerLocaleSource(() => undefined)
    expect(m('app.title')).toBe('桌面控制台')
  })

  it('falls back to the key itself for an unknown key', () => {
    expect(m('nope.missing')).toBe('nope.missing')
  })
})

/**
 * Regression guard for a non-obvious build failure.
 *
 * electron-vite's `vite:esm-shim` plugin decides where to splice its CommonJS shim by
 * regex-scanning the *bundled* chunk for static imports and taking the last match. A
 * translated string whose final token is the bare word `import` (immediately followed by its
 * closing quote) satisfies that loose pattern, so the shim gets injected into the middle of
 * the dictionary object and esbuild then fails with "Unterminated string literal".
 *
 * That is not hypothetical: the English `install.importedDesc` value ("… on import") broke
 * the main-process build. Genuine import statements never put a quote straight after the
 * keyword, so this pattern must never appear at all.
 */
describe('translation sources', () => {
  it('never puts a quote straight after the word "import"', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const hit of text.matchAll(/import["']/g)) {
        const line = text.slice(0, hit.index).split(/\r\n|\n|\r/).length
        offenders.push(`${file.slice(SRC.length + 1)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
