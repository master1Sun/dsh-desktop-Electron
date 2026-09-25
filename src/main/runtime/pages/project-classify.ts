import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import type { PageKind } from './pages'

/**
 * The container's project-capability gate.
 *
 * An imported folder is only worth cloning/copying if the container can actually *run* it: the
 * supervisor spawns a bundled-Node process and waits on an HTTP port, so the whole feature rests
 * on "is there an inferable node entry, and are its dependencies installed". This module is the
 * single source of that verdict — the import pipeline, the generated `container.json`, and the
 * import UI's 项目类型 restriction all read from it so they can never disagree.
 *
 * It sorts every project into three tiers:
 *   - green  : a runnable node entry with no uninstalled dependencies → imports and starts as-is
 *   - yellow : a runnable node entry that still needs `npm install` first → import + install step
 *   - red    : not a node project the container can run (Rust/Go/Java/…, or a monorepo root with
 *              no runnable entry, e.g. openai/codex) → rejected with a reason before any download
 */
export type ProjectTier = 'green' | 'yellow' | 'red'

export interface NpmPackage {
  name?: string
  private?: boolean
  bin?: string | Record<string, string>
  scripts?: Record<string, string>
  workspaces?: unknown
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

/** Frameworks whose presence means “this project serves HTTP” → embed it as a `page`.
    A `bin`-only package without any of these is treated as a CLI (`terminal`). */
export const SERVER_DEP_MARKERS = [
  'express',
  'koa',
  'fastify',
  '@nestjs',
  'hapi',
  'restify',
  'egg',
  'midway',
  'next',
  'nuxt',
  'astro',
  'remix',
  'hono',
  'polka',
  'socket.io',
  'strapi',
  'adonis',
  'feathers',
  'micro',
  'http-server',
  'graphql-yoga',
  'body-parser'
]

/** Root files that identify a non-node stack the container cannot build or run. */
export const NON_NODE_MARKERS: { file: string; label: string }[] = [
  { file: 'Cargo.toml', label: 'Rust' },
  { file: 'go.mod', label: 'Go' },
  { file: 'pom.xml', label: 'Java (Maven)' },
  { file: 'build.gradle', label: 'Java (Gradle)' },
  { file: 'build.gradle.kts', label: 'Java (Gradle)' },
  { file: 'Gemfile', label: 'Ruby' },
  { file: 'requirements.txt', label: 'Python' },
  { file: 'pyproject.toml', label: 'Python' },
  { file: 'composer.json', label: 'PHP' }
]

/**
 * Well-known repos whose published npm CLI already runs inside this container (the bin
 * launcher wraps the native binary). When a red verdict rejects one of their clones, the
 * import form can offer the one-click npm route instead of a Rust/Go build.
 */
export const KNOWN_NPM_BY_REPO: Record<string, string> = {
  'openai/codex': '@openai/codex',
  codex: '@openai/codex',
  'anthropics/claude-code': '@anthropic-ai/claude-code',
  'claude-code': '@anthropic-ai/claude-code',
  'google-gemini/gemini-cli': '@google/gemini-cli',
  'gemini-cli': '@google/gemini-cli',
  'sst/opencode': 'opencode-ai'
}

/** Map a git URL / `owner/repo` short form / local folder path to a known published npm CLI. */
export function npmSuggestionFor(source: string): string | null {
  const s = (source || '').trim().replace(/\.git$/i, '').replace(/[/\\]+$/, '')
  if (!s) return null
  const segs = s.split(/[\\/:@]+/).filter((x) => x && x !== 'github.com' && !x.includes('.'))
  const tail = segs.slice(-2)
  if (tail.length === 2) {
    const ownerRepo = `${tail[0]}/${tail[1]}`.toLowerCase()
    if (KNOWN_NPM_BY_REPO[ownerRepo]) return KNOWN_NPM_BY_REPO[ownerRepo]
  }
  const repo = tail[tail.length - 1]?.toLowerCase()
  return repo ? (KNOWN_NPM_BY_REPO[repo] ?? null) : null
}

/** The verdict {@link classifyProject} returns; every consumer keys off `tier` then `kind`. */
export interface ProjectClass {
  tier: ProjectTier
  /** kind to seed when runnable; always undefined for a red verdict. */
  kind?: PageKind
  /** a `page`/`terminal` that declares runtime dependencies and so must be installed first. */
  needsInstall: boolean
  /** start command to seed for a `terminal` page; page kinds leave it unset and let readPageMeta infer it. */
  startCommand?: string
  /** `install.*` i18n key naming why a red project can't run (set only when `tier === 'red'`). */
  reason?: string
  /** interpolation params for `reason`. */
  reasonParams?: Record<string, string>
}

export function readPkgSafe(dir: string): NpmPackage | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as NpmPackage
  } catch {
    return null
  }
}

/** Any server framework in dependencies/devDependencies marks the project as a web program. */
export function hasServerDependency(pkg: NpmPackage | null): boolean {
  if (!pkg) return false
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  return Object.keys(all).some((n) => {
    const k = n.toLowerCase()
    return SERVER_DEP_MARKERS.some((mk) => k === mk || k.startsWith(`${mk}/`) || k.includes(mk))
  })
}

/**
 * Runtime payload a freshly copied/cloned tree still needs installed: declared dependencies
 * plus optionalDependencies — CLI distributions (codex & friends) ship their platform
 * binaries as optional packages, so a copy without node_modules cannot run. devDependencies
 * stay excluded: the container never builds from source.
 */
export function runtimeDepCount(pkg: NpmPackage | null): number {
  if (!pkg) return 0
  return (
    Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.optionalDependencies || {}).length
  )
}

/** A runnable command for a CLI project in the embedded terminal: prefer a `start` script,
    else invoke the declared `bin` entry directly. Returns null when neither is present. */
export function cliStartCommand(dir: string, pkg: NpmPackage | null): string | null {
  if (pkg?.scripts?.start) return 'npm run start'
  const bin = pkg?.bin
  let rel: string | null = null
  if (typeof bin === 'string') rel = bin
  else if (bin && typeof bin === 'object') rel = Object.values(bin)[0] ?? null
  if (rel) {
    const clean = rel.replace(/^\.\//, '')
    if (existsSync(join(dir, clean))) return `node ${clean}`
  }
  return null
}

/** The first non-node stack marker present at the project root, or null for a plain node repo. */
export function detectNonNodeStack(dir: string): string | null {
  for (const mk of NON_NODE_MARKERS) if (existsSync(join(dir, mk.file))) return mk.label
  try {
    for (const e of readdirSync(dir)) {
      if (/\.(csproj|fsproj|vbproj|sln|vcxproj)$/i.test(e)) return '.NET / C++'
    }
  } catch {
    /* unreadable dir: no stack inferred */
  }
  return null
}

/**
 * Decide the tier / kind of an already-on-disk project directory.
 *
 * `page-viable` means exactly what `readPageMeta`'s `defaultStartCommand` will accept (a
 * `server.js` / `index.js` file or a package `start` script) — so a green/yellow verdict here can
 * never be rejected downstream by the entry check, and a red one is surfaced with a reason instead
 * of cloning a huge repo first and only then failing. `terminal-viable` mirrors the historical
 * bin-without-server-framework rule and captures the concrete CLI command to seed.
 */
export function classifyProject(dir: string): ProjectClass {
  const pkg = readPkgSafe(dir)
  const hasPkg = pkg !== null
  const nonNode = detectNonNodeStack(dir)

  const pageViable =
    existsSync(join(dir, 'server.js')) ||
    existsSync(join(dir, 'index.js')) ||
    Boolean(pkg?.scripts?.start)
  const binOnlyCli = Boolean(pkg?.bin) && !hasServerDependency(pkg)
  const terminalStart = binOnlyCli ? cliStartCommand(dir, pkg) : null
  const terminalViable = Boolean(terminalStart)

  const deps = runtimeDepCount(pkg)
  const needsInstall = hasPkg && deps > 0

  // Runnable → keep the historical kind/startCommand semantics untouched.
  if (terminalViable) {
    return {
      tier: needsInstall ? 'yellow' : 'green',
      kind: 'terminal',
      needsInstall,
      startCommand: terminalStart!
    }
  }
  if (pageViable) {
    return { tier: needsInstall ? 'yellow' : 'green', kind: 'page', needsInstall }
  }

  // Not runnable as far as the container is concerned.
  if (nonNode) {
    return {
      tier: 'red',
      needsInstall: false,
      reason: 'install.rejectNonNode',
      reasonParams: { stack: nonNode }
    }
  }
  if (hasPkg && (pkg?.private || pkg?.workspaces)) {
    return { tier: 'red', needsInstall: false, reason: 'install.rejectMonorepoRoot' }
  }
  return { tier: 'red', needsInstall: false, reason: 'install.rejectNoEntry' }
}

/* ------------------------------------------------------------------ *
 * Remote pre-flight: reject a red repo *before* downloading it.
 * ------------------------------------------------------------------ */

/** GitHub's raw endpoint resolves `HEAD` to the repo's default branch — no API call needed. */
function githubRawBase(url: string): string | null {
  const https = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i)
  if (https) return `https://raw.githubusercontent.com/${https[1]}/${https[2]}/HEAD`
  const ssh = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (ssh) return `https://raw.githubusercontent.com/${ssh[1]}/${ssh[2]}/HEAD`
  return null
}

/** One tiny GET with a hard timeout; status-only probe of a raw file (200 body vs. 404). */
function fetchRaw(
  url: string,
  timeoutMs = 5000
): Promise<{ ok: boolean; body: string }> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: { ok: boolean; body: string }): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    try {
      const lib = url.startsWith('https') ? httpsGet : httpGet
      const req = lib(url, { timeout: timeoutMs }, (res) => {
        if ((res.statusCode ?? 0) !== 200) {
          res.resume()
          return done({ ok: false, body: '' })
        }
        let body = ''
        res.setEncoding('utf-8')
        res.on('data', (d) => (body += d))
        res.on('end', () => done({ ok: true, body }))
        res.on('error', () => done({ ok: false, body: '' }))
      })
      req.on('error', () => done({ ok: false, body: '' }))
      req.on('timeout', () => {
        req.destroy()
        done({ ok: false, body: '' })
      })
    } catch {
      done({ ok: false, body: '' })
    }
  })
}

/**
 * Best-effort "is this GitHub repo definitely a red (non-node) project?" check, done without
 * cloning: it fetches only `package.json` plus HEADs of a handful of marker/entry files (a few KB)
 * and returns a *conclusive* red verdict when the repo has no node entry point and carries a
 * non-node stack file (this is exactly openai/codex: a `private` maintainer package.json with no
 * `start`/`bin`, no `server.js`, plus a root `Cargo.toml`). Anything ambiguous — a non-GitHub
 * host, a private repo (raw 404s), a project with a real node entry, or a network hiccup — returns
 * null so the caller falls back to cloning and running the authoritative {@link classifyProject}.
 *
 * Deliberately conservative: it only ever produces a `red` verdict or `null`, never green/yellow,
 * so a false "allow" is impossible and a false "block" needs positive evidence of a non-node stack.
 */
export async function probeRemoteTier(repoUrl: string): Promise<ProjectClass | null> {
  const base = githubRawBase(repoUrl)
  if (!base) return null
  // Fetch package.json plus HEAD-style probes of the entry files and the two common stack markers.
  const [pkgRes, serverRes, indexRes, cargoRes, gomodRes] = await Promise.all([
    fetchRaw(`${base}/package.json`),
    fetchRaw(`${base}/server.js`),
    fetchRaw(`${base}/index.js`),
    fetchRaw(`${base}/Cargo.toml`),
    fetchRaw(`${base}/go.mod`)
  ])
  const nonNodeLabel = (): string | null => {
    if (cargoRes.ok) return 'Rust'
    if (gomodRes.ok) return 'Go'
    return null
  }
  let pkg: NpmPackage | null = null
  if (pkgRes.ok) {
    try {
      pkg = JSON.parse(pkgRes.body) as NpmPackage
    } catch {
      return null // an unreadable/JSON5 package.json is inconclusive, not red
    }
  } else {
    // No readable package.json (private repo 404s here too): only call it red on positive
    // evidence of a non-node stack AND no node entry file.
    const stack = nonNodeLabel()
    if (stack && !serverRes.ok && !indexRes.ok) {
      return {
        tier: 'red',
        needsInstall: false,
        reason: 'install.rejectNonNode',
        reasonParams: { stack }
      }
    }
    return null
  }
  // package.json readable: any node entry the container could run → let the clone decide properly.
  const pageViable = serverRes.ok || indexRes.ok || Boolean(pkg?.scripts?.start)
  if (pageViable || Boolean(pkg?.bin)) return null
  const stack = nonNodeLabel()
  if (stack) {
    return {
      tier: 'red',
      needsInstall: false,
      reason: 'install.rejectNonNode',
      reasonParams: { stack }
    }
  }
  if (pkg?.private || pkg?.workspaces) {
    return { tier: 'red', needsInstall: false, reason: 'install.rejectMonorepoRoot' }
  }
  return null
}
