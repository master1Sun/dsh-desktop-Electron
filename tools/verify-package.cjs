/* eslint-disable */
// Verify the packaged Windows artifact: installer header, unpacked layout,
// bundled runtimes, and the extraResources duplication fix.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const out = []

function size(p) {
  try {
    return fs.statSync(p).size
  } catch {
    return -1
  }
}
function mb(n) {
  return (n / 1048576).toFixed(1) + ' MB'
}
function dirStats(dir) {
  let files = 0
  let bytes = 0
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else {
        files++
        try {
          bytes += fs.statSync(p).size
        } catch {}
      }
    }
  }
  return { files, bytes }
}

out.push('===== dist/ artifacts =====')
const dist = path.join(root, 'dist')
for (const f of fs.existsSync(dist) ? fs.readdirSync(dist) : []) {
  const p = path.join(dist, f)
  const st = fs.statSync(p)
  out.push(`  ${f.padEnd(52)} ${st.isDirectory() ? 'DIR' : mb(st.size)}  ${st.mtime.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false })}`)
}

// pick the newest installer exe in dist/ instead of a hardcoded name+version
// (artifact is DesktopContainer-<version>.exe per electron-builder.yml; .blockmap excluded)
const setups = (fs.existsSync(dist) ? fs.readdirSync(dist) : [])
  .filter((f) => f.endsWith('.exe'))
  .map((f) => path.join(dist, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
const setup = setups[0] || ''
out.push('')
out.push('===== installer sanity =====')
if (size(setup) > 0) {
  const fd = fs.openSync(setup, 'r')
  const b = Buffer.alloc(2)
  fs.readSync(fd, b, 0, 2, 0)
  fs.closeSync(fd)
  out.push(`  ${path.basename(setup)}: ${mb(size(setup))}, header="${b.toString('latin1')}" (${b.toString('latin1') === 'MZ' ? 'OK' : 'NOT MZ'})`)
} else out.push('  MISSING')

out.push('')
out.push('===== win-unpacked/resources =====')
const res = path.join(dist, 'win-unpacked', 'resources')
if (fs.existsSync(res)) {
  for (const e of fs.readdirSync(res, { withFileTypes: true })) {
    const p = path.join(res, e.name)
    if (e.isDirectory()) {
      const { files, bytes } = dirStats(p)
      out.push(`  ${e.name.padEnd(22)} ${String(files).padStart(6)} files  ${mb(bytes)}`)
    } else out.push(`  ${e.name.padEnd(22)} ${mb(fs.statSync(p).size)}`)
  }
  const total = dirStats(res)
  out.push(`  ${'TOTAL'.padEnd(22)} ${String(total.files).padStart(6)} files  ${mb(total.bytes)}`)
} else out.push('  MISSING')

out.push('')
out.push('===== bundled runtime entry points in the package =====')
const checks = [
  'resources/node/node.exe',
  'resources/node/node_modules/npm/bin/npm-cli.js',
  'resources/openclaw/node_modules/openclaw/openclaw.mjs',
  'resources/openclaw/openclaw.cmd',
  'resources/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js',
  'resources/dsh/pnpm.cmd',
  'resources/codex/codex.cmd',
  'resources/codex/node_modules/@openai/codex/bin/codex.js',
  'resources/codex/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
  'resources/pages/codex/container.json',
  'resources/pages/dsh-web/container.json',
  'resources/pages/dsh-plugin-market/container.json',
  'resources/pages/openclaw/container.json',
  'resources/app.asar'
]
for (const c of checks) {
  const p = path.join(dist, 'win-unpacked', c)
  const s = size(p)
  out.push(`  ${s >= 0 ? 'OK  ' : 'MISS'} ${c}${s >= 0 ? '  ' + mb(s) : ''}`)
}

out.push('')
out.push('===== app.asar packed top-level (resources/ must be absent) =====')
const asar = path.join(res, 'app.asar')
if (fs.existsSync(asar)) {
  try {
    const buf = fs.readFileSync(asar)
    const headerSize = buf.readUInt32LE(12)
    const header = JSON.parse(buf.subarray(16, 16 + headerSize).toString('utf8'))
    out.push(
      '  ' +
        Object.keys(header.files || {})
          .map((k) => `${k}${header.files[k].files ? '/' : ''}`)
          .join(', ')
    )
  } catch (e) {
    out.push('  header unreadable: ' + e.message)
  }
}

const text = out.join('\n')
fs.writeFileSync(path.join(__dirname, 'verify-package.out.txt'), text, 'utf8')
console.log(text)
