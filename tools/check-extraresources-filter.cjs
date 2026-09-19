/* eslint-disable */
// Replicates app-builder-lib's createFilter (out/util/filter.js) to prove which
// extraResources form keeps a source's root node_modules.
const path = require('node:path')
const { Minimatch } = require(path.resolve(__dirname, '..', 'node_modules', 'minimatch'))
const opt = { dot: true }
const pats = [new Minimatch('**/*', opt)]
function minimatchAll(p, isDir) {
  let m = false
  for (const pat of pats) {
    if (m !== pat.negate) continue
    m = pat.match(p, isDir && !pat.negate)
  }
  return m
}
function createFilter(src) {
  const s = src.endsWith(path.sep) ? src : src + path.sep
  return (file, isDir) => {
    if (src === file) return true
    let rel = file.substring(s.length)
    if (path.sep === '\\') {
      if (rel.startsWith('\\')) rel = rel.substring(1)
      rel = rel.replace(/\\/g, '/')
    }
    if (rel === 'node_modules') return false
    else if (rel.endsWith('/node_modules')) rel += '/'
    return minimatchAll(rel, isDir)
  }
}

const fNew = createFilter(path.resolve(__dirname, '..', 'resources'))
const fOld = createFilter(path.resolve(__dirname, '..', 'resources', 'dsh'))

const dirNew = new Set(['dsh', 'dsh/node_modules', 'dsh/node_modules/@deepseek-ai'])
console.log('--- from: resources   to: .  (proposed) ---')
for (const p of [
  'dsh',
  'dsh/node_modules',
  'dsh/node_modules/@deepseek-ai',
  'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js',
  'dsh/pnpm.cmd',
  'codex/node_modules/@openai/codex/bin/codex.js',
  'node/node_modules/npm/bin/npm-cli.js'
]) {
  const abs = path.resolve(__dirname, '..', 'resources', p)
  console.log(`  ${fNew(abs, dirNew.has(p)) ? 'KEEP' : 'DROP'}  ${p}`)
}

const dirOld = new Set(['node_modules', 'node_modules/@deepseek-ai'])
console.log('--- from: resources/dsh  to: dsh  (current, broken) ---')
for (const p of ['node_modules', 'node_modules/@deepseek-ai', 'node_modules/@deepseek-ai/dsh/lib/bin.js', 'pnpm.cmd']) {
  const abs = path.resolve(__dirname, '..', 'resources', 'dsh', p)
  console.log(`  ${fOld(abs, dirOld.has(p)) ? 'KEEP' : 'DROP'}  ${p}`)
}
