import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const pagesDir = join(projectRoot, 'pages')

mkdirSync(pagesDir, { recursive: true })
writeFileSync(join(pagesDir, '.gitkeep'), '')

// Retired generated pages — the DSH 插件市场 is now a renderer built-in view
// (MarketView.vue) and the codex CLI page was removed; drop their dirs on upgrade.
for (const legacy of ['example-page', 'codex', 'dsh-plugin-market']) {
  const dir = join(pagesDir, legacy)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    console.log(`[ensure-pages] removed legacy pages/${legacy}`)
  }
}
