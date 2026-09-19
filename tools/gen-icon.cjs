const path = require('node:path')

// usage: node tools/gen-icon.cjs "🐳" 512 out.png
const [emoji, sizeArg, outPath] = process.argv.slice(2)
if (!emoji || !outPath) {
  console.error('usage: node gen-icon.cjs <text> <size> <out.png>')
  process.exit(1)
}
const size = Number(sizeArg || 512)
const script = path.join(__dirname, 'render-icon.ps1')
const { execFileSync } = require('node:child_process')
execFileSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', script, '-Emoji', emoji, '-Size', String(size), '-Out', path.resolve(outPath)],
  { stdio: 'inherit' }
)
