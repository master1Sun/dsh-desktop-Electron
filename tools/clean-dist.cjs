/* eslint-disable */
// Native `rmdir /s /q` on the build output — Node's fs.rm hangs on large trees here
// (see skill win-node-build-hang-workarounds). Also reports the electron-builder cache.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const out = []

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [path.join(root, 'dist')]

for (const t of targets) {
  if (!fs.existsSync(t)) {
    out.push(`skip (absent): ${t}`)
    continue
  }
  const t0 = Date.now()
  const r = spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', t.replace(/\//g, '\\')], {
    timeout: 600000,
    encoding: 'utf8'
  })
  out.push(
    `rmdir ${t} -> status=${r.status} error=${r.error ? r.error.message : 'none'} existed_after=${fs.existsSync(t)} (${Date.now() - t0}ms)`
  )
  if (r.stderr) out.push('  stderr: ' + r.stderr.trim())
}

out.push('')
out.push('== electron-builder cache ==')
for (const c of [
  path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache'),
  path.join(os.homedir(), '.cache', 'electron-builder')
]) {
  out.push(`  ${c}: ${fs.existsSync(c) ? 'PRESENT' : 'missing'}`)
  if (fs.existsSync(c)) {
    for (const e of fs.readdirSync(c, { withFileTypes: true })) {
      const p = path.join(c, e.name)
      if (e.isDirectory()) {
        const sub = fs.readdirSync(p).slice(0, 6).join(', ')
        out.push(`    ${e.name}/ -> ${sub}`)
      } else out.push(`    ${e.name}`)
    }
  }
}

out.push('')
out.push('== electron cache (download) ==')
for (const c of [
  path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache'),
  path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'electron')
]) {
  out.push(`  ${c}: ${fs.existsSync(c) ? fs.readdirSync(c).slice(0, 8).join(', ') || '(empty)' : 'missing'}`)
}

const text = out.join('\n')
fs.writeFileSync(path.join(__dirname, 'clean.out.txt'), text, 'utf8')
console.log(text)
