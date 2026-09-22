/* eslint-disable */
// Hang-vs-working probe: sample the electron-builder node process CPU twice, and
// the output tree's file count / byte size twice. ~0 delta on both => hung.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const LOG = path.join(root, 'tools', 'econf.log')
const TARGET = path.join(root, 'dist')

function psList() {
  const ps = [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress"
  ]
  try {
    const out = execFileSync('powershell', ps, { encoding: 'utf8', timeout: 60000 })
    return JSON.parse(out)
  } catch (e) {
    return { error: e.message }
  }
}

function cpuOf(pids) {
  const ps = [
    '-NoProfile',
    '-Command',
    `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,CPU,WorkingSet64 | ConvertTo-Json -Compress`
  ]
  try {
    const out = execFileSync('powershell', ps, { encoding: 'utf8', timeout: 60000 })
    const j = JSON.parse(out)
    return Array.isArray(j) ? j : [j]
  } catch (e) {
    return []
  }
}

function treeStats(dir) {
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

const procs = psList()
let eb = []
if (Array.isArray(procs)) {
  eb = procs.filter((p) => (p.CommandLine || '').includes('electron-builder'))
  console.log('electron-builder processes:')
  for (const p of eb) console.log(`  pid=${p.ProcessId} ppid=${p.ParentProcessId}`)
} else {
  console.log('ps error:', procs.error)
}

const pids = eb.map((p) => p.ProcessId)
const c1 = pids.length ? cpuOf(pids) : []
const s1 = treeStats(TARGET)
const log1 = fs.statSync(LOG)

// precise, CPU-free sleep
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25000)

const c2 = pids.length ? cpuOf(pids) : []
const s2 = treeStats(TARGET)
const log2 = fs.statSync(LOG)

console.log('')
console.log('--- PID / CPU (before -> after 25s) ---')
for (const p of c1) {
  const q = c2.find((x) => x.Id === p.Id)
  console.log(
    `  pid=${p.Id} cpu ${p.CPU}s -> ${q ? q.CPU + 's' : 'gone'}  ws=${Math.round((p.WorkingSet64 || 0) / 1048576)}MB`
  )
}
console.log('')
console.log('--- dist tree ---')
console.log(`  files ${s1.files} -> ${s2.files}   bytes ${s1.bytes} -> ${s2.bytes}`)
console.log('--- log ---')
console.log(`  len ${log1.size} -> ${log2.size}   mtime ${log1.mtime.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false })} -> ${log2.mtime.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false })}`)
console.log('')
console.log(s2.files === s1.files && log1.size === log2.size ? 'VERDICT: no progress (hang?)' : 'VERDICT: progressing')
