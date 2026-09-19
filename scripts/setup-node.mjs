import { mkdirSync, existsSync, createWriteStream, realpathSync } from 'node:fs'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'
import { join, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'node:url'

const NODE_VERSION = process.env.DSH_NODE_VERSION || '22.23.2'
const MIRRORS = [
  `https://registry.npmmirror.com/-/binary/node/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
  `https://cdn.npmmirror.com/binaries/node/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
  `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const destDir = join(projectRoot, 'resources', 'node')
const zipPath = join(destDir, `node-v${NODE_VERSION}-win-x64.zip`)

function download(url, target) {
  return new Promise((resolve, reject) => {
    const request = url.startsWith('https') ? httpsGet : httpGet
    const req = request(
      url,
      { headers: { 'user-agent': 'dsh-desktop-container' }, timeout: 30000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          resolve(download(res.headers.location, target))
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        pipeline(res, createWriteStream(target)).then(resolve).catch(reject)
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`timeout fetching ${url}`)))
  })
}

async function main() {
  const nodeExe = join(destDir, 'node.exe')
  if (existsSync(nodeExe)) {
    const out = execFileSync(nodeExe, ['--version']).toString().trim()
    console.log(`[setup-node] already present: ${out}`)
    return
  }
  mkdirSync(destDir, { recursive: true })
  let lastError = null
  for (const mirror of MIRRORS) {
    try {
      console.log(`[setup-node] downloading Node v${NODE_VERSION} win-x64 ...`)
      console.log(`  ${mirror}`)
      await download(mirror, zipPath)
      const size = existsSync(zipPath) ? (await import('node:fs')).statSync(zipPath).size : 0
      if (size < 10 * 1024 * 1024) throw new Error(`downloaded file too small (${size} bytes)`)
      console.log(`[setup-node] extracting with PowerShell Expand-Archive ...`)
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
        ],
        { stdio: 'inherit' }
      )
      // flatten node-v{ver}-win-x64/* into resources/node/
      const nested = join(destDir, `node-v${NODE_VERSION}-win-x64`)
      if (existsSync(nested)) {
        for (const entry of (await import('node:fs')).readdirSync(nested)) {
          const src = join(nested, entry)
          const dst = join(destDir, entry)
          if (!existsSync(dst)) (await import('node:fs')).renameSync(src, dst)
        }
        ;(await import('node:fs')).rmSync(nested, { recursive: true, force: true })
      }
      (await import('node:fs')).rmSync(zipPath, { force: true })
      if (!existsSync(nodeExe)) throw new Error('node.exe missing after extraction')
      const out = execFileSync(nodeExe, ['--version'], { cwd: realpathSync(destDir) }).toString().trim()
      console.log(`[setup-node] done: ${out} at ${nodeExe}`)
      return
    } catch (err) {
      lastError = err
      console.warn(`[setup-node] mirror failed: ${err.message}`)
    }
  }
  console.error('[setup-node] all mirrors failed:', lastError?.message)
  process.exit(1)
}

main()
