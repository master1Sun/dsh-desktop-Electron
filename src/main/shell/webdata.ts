import { app, session } from 'electron'
import { promises as fs, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type { WebDataClearArgs, WebDataReport } from '../../shared/types'

/**
 * #26: the embedded webviews' own footprint, surfaced in Settings ▸ 隐私数据.
 *
 * Every <webview> in this app runs without a `partition`, so they all share
 * `session.defaultSession` — one cookie jar, one HTTP cache, one storage area for every hosted
 * page and external site. That is what makes "log in once, stay logged in" work here, but it also
 * means a broken page can only be repaired by clearing data that other pages share. Hence this
 * panel: it reports what is there (and *which site* holds the cookies) before the user wipes it.
 *
 * Cache/storage sizes come from the on-disk directories rather than the storage-quota API, which
 * Electron only exposes to renderers and which reports per-origin *quotas*, not the bytes actually
 * spent. Walking `userData` measures the real disk cost.
 */

/** HTTP cache dirs under userData (Chromium splits these; all three are safe to delete). */
const CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'Shared Dictionary']
/** Leveldb / file-backed storage dirs (localStorage, IndexedDB, …). */
const STORAGE_DIRS = ['Local Storage', 'Session Storage', 'IndexedDB', 'FileSystem', 'WebStorage']

/** Recursive byte size of a directory; a missing/locked path counts as 0, never throws. */
async function dirBytes(path: string): Promise<number> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }
  let total = 0
  for (const ent of entries) {
    const child = join(path, ent.name)
    if (ent.isDirectory()) {
      total += await dirBytes(child)
      continue
    }
    if (!ent.isFile()) continue
    try {
      const st = await fs.stat(child)
      total += st.size
    } catch {
      /* raced with a deletion — skip it */
    }
  }
  return total
}

async function sumDirs(names: string[]): Promise<number> {
  const root = app.getPath('userData')
  const sizes = await Promise.all(names.map((n) => dirBytes(join(root, n))))
  return sizes.reduce((a, b) => a + b, 0)
}

/**
 * The webviews' current cache / storage / cookie state. Cookie domains are listed so a user can
 * see *who* is holding a session before clearing it — clearing globally would log every hosted
 * service out at once, which is exactly the surprise this panel exists to avoid.
 */
export async function getWebDataReport(): Promise<WebDataReport> {
  const [cacheBytes, storageBytes, cookies] = await Promise.all([
    sumDirs(CACHE_DIRS),
    sumDirs(STORAGE_DIRS),
    session.defaultSession.cookies.get({})
  ])
  const counts = new Map<string, number>()
  for (const c of cookies) {
    const domain = (c.domain || '').replace(/^\./, '') || '(unknown)'
    counts.set(domain, (counts.get(domain) || 0) + 1)
  }
  const cookieDomains = [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
  return { cacheBytes, storageBytes, cookieDomains, totalCookies: cookies.length }
}

/** Build the URL `cookies.remove()` needs to address one stored cookie. */
function cookieUrl(cookie: Electron.Cookie): string {
  const host = (cookie.domain || '').replace(/^\./, '')
  const scheme = cookie.secure ? 'https' : 'http'
  const path = cookie.path && cookie.path !== '/' ? cookie.path : ''
  return `${scheme}://${host}${path}`
}

/** Remove cookies, optionally narrowed to one domain (subdomains included via the suffix match). */
async function clearCookies(domain?: string): Promise<number> {
  const all = await session.defaultSession.cookies.get({})
  const targets = domain
    ? all.filter((c) => {
        const host = (c.domain || '').replace(/^\./, '')
        return host === domain || host.endsWith(`.${domain}`)
      })
    : all
  let removed = 0
  for (const c of targets) {
    try {
      await session.defaultSession.cookies.remove(cookieUrl(c), c.name)
      removed += 1
    } catch {
      /* a cookie whose host/path we can't reconstruct simply stays; the report refreshes anyway */
    }
  }
  return removed
}

/**
 * Wipe one class of webview data and report how much was touched. `clearStorageData` is also what
 * drops service workers, so a page that cached a broken bundle can be recovered from here without
 * devtools.
 *
 * Returns the cookie count for the cookie scopes (the byte sizes would be a lie — cookies are
 * tiny, their *count* is the meaningful blast radius).
 */
export async function clearWebData(
  args: WebDataClearArgs
): Promise<{ removedCookies: number; scope: WebDataClearArgs['scope'] }> {
  const scope = args.scope
  let removedCookies = 0
  if (scope === 'cache') {
    await session.defaultSession.clearCache()
  } else if (scope === 'cookies') {
    removedCookies = await clearCookies(args.domain)
  } else if (scope === 'storage') {
    await session.defaultSession.clearStorageData({
      storages: ['localstorage', 'indexdb', 'filesystem', 'serviceworkers', 'shadercache']
    })
  } else {
    removedCookies = await clearCookies(args.domain)
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearCache()
  }
  return { removedCookies, scope }
}
