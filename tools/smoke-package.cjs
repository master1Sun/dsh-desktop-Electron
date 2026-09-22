/* eslint-disable */
// Smoke-test the runtimes AS PACKAGED in dist/win-unpacked/resources.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const res = path.resolve(__dirname, '..', 'dist', 'win-unpacked', 'resources')
const out = []
const p = (...a) => path.join(res, ...a)

const nodeExe = p('node', 'node.exe')
const nodeDir = p('node')
const env = {
  ...process.env,
  PATH: [nodeDir, p('codex'), p('dsh'), p('openclaw'), process.env.PATH || ''].join(';')
}

function run(label, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 90000, env, ...opts })
  const text = ((r.stdout || '') + (r.stderr || '')).trim().slice(0, 400)
  out.push(`${r.status === 0 ? 'OK  ' : 'FAIL'} ${label}  (status=${r.status}${r.error ? ', ' + r.error.message : ''})`)
  if (text) out.push('       ' + text.replace(/\r?\n/g, ' | '))
}

run('bundled node --version', nodeExe, ['--version'])
run('bundled npm --version', nodeExe, [p('node', 'node_modules', 'npm', 'bin', 'npm-cli.js'), '--version'])
run('codex --version (shim)', 'codex', ['--version'], { shell: true })
run('codex.js --version (direct)', nodeExe, [p('codex', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), '--version'])
run('openclaw.mjs --version', nodeExe, [p('openclaw', 'node_modules', 'openclaw', 'openclaw.mjs'), '--version'])
run('dsh lib/bin.js --version', nodeExe, [p('dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), '--version'])
run('bundled pnpm.cmd --version', 'pnpm', ['--version'], { shell: true })

out.push('')
out.push('--- packaged pages/codex/container.json ---')
try {
  out.push(fs.readFileSync(p('pages', 'codex', 'container.json'), 'utf8').trim())
} catch (e) {
  out.push('unreadable: ' + e.message)
}

const text = out.join('\n')
fs.writeFileSync(path.join(__dirname, 'smoke-package.out.txt'), text, 'utf8')
console.log(text)
