import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePagePort, isValidPort, getSettings } from '../../shell/store'
import { logEvent } from '../../shell/events'
import { m as msg, resolveText } from '../../shell/i18n'
import { OPENCLAW_DEFAULT_PORT, type LocalizableText, type PageMeta } from '../../../shared/types'

/**
 * container.json land of the page runtime: the on-disk manifest shape, its validation and the
 * installed-page scan. Split out of pages.ts (the process registry) — pages.ts re-exports this
 * module wholesale, so every existing import from './pages' keeps working.
 */

/** Pages shipped with the container (repo `pages/`) — never removable. */
export const BUILTIN_PAGE_IDS = new Set(['dsh-web', 'openclaw'])

export interface PagesRoot {
  /** pages/ directory (installed projects) */
  pagesDir: string
  /** project root, used for the container self-entry */
  projectDir: string
}

export function defaultStartCommand(dir: string): string {
  if (existsSync(join(dir, 'server.js'))) return 'node server.js'
  if (existsSync(join(dir, 'index.js'))) return 'node index.js'
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    if (pkg.scripts?.start) return 'npm run start'
  } catch {
    /* no package.json */
  }
  throw new Error(msg('page.noEntryCommand'))
}

function startCommandInferable(dir: string): boolean {
  return (
    existsSync(join(dir, 'server.js')) ||
    existsSync(join(dir, 'index.js')) ||
    existsSync(join(dir, 'package.json'))
  )
}

/**
 * Resolve a page's effective dependency list, applying the container-side `pageDeps`
 * override over the project's own `dependsOn`. An override key (even an empty array) wins
 * outright; an absent key falls back to the declared list. Both paths drop blank entries and
 * self-references (which would deadlock ensureDeps behind an ancestry check).
 */
export function resolvePageDeps(id: string, declared: unknown): string[] | undefined {
  const override = getSettings().pageDeps?.[id]
  const source = Array.isArray(override) ? override : Array.isArray(declared) ? declared : null
  if (!source) return undefined
  const cleaned = source
    .filter((d): d is string => typeof d === 'string' && Boolean(d.trim()) && d.trim() !== id)
    .map((d) => d.trim())
  return cleaned.length ? cleaned : undefined
}

export type PageKind = 'page' | 'dsh' | 'openclaw' | 'terminal'

/** per-kind runtime config stored in container.json */
export interface DshConfig {
  profile?: string
  port?: number
}

export interface OpenclawConfig {
  port?: number
}

/**
 * The on-disk shape of a page's `container.json`, i.e. what a project author (or an import
 * seed) writes. Its text fields are {@link LocalizableText}: a plain string serves every
 * language, an object carries the per-language variants. Everything here is resolved into
 * plain strings by `readPageMeta` before it becomes a {@link PageMeta}, so no consumer —
 * the renderer, the tray, the update checker — has to deal with locales.
 */
export interface ContainerManifest {
  name?: LocalizableText
  description?: LocalizableText
  port?: number
  startCommand?: string
  external?: boolean
  externalUrl?: string
  kind?: PageKind
  dsh?: DshConfig
  openclaw?: OpenclawConfig
  /** opt this page into the top-bar 应用 menu + generic AppManager panel */
  manageAsApp?: boolean
  /** page ids that must be running before this one starts (see startWithDeps) */
  dependsOn?: string[]
  /** health endpoint: full URL or path against the page's port; `{port}` is substituted */
  healthUrl?: string
  envVars?: Array<{
    key: string
    label?: LocalizableText
    description?: LocalizableText
    defaultPath?: string
    legacyPath?: string
    type?: string
    defaultValue?: string
  }>
  /* ---- manifest v1 additions (all optional; see pages/container.schema.json) ---- */
  /** schema this file targets; recorded, never enforced (an older page needs no bump) */
  schemaVersion?: number
  author?: string
  version?: string
  /** `data:` URL or a path relative to the page directory (png/svg/jpg/webp/ico, ≤64 KB) */
  icon?: string
  /** declared capabilities; recorded and displayed, not gated on yet */
  permissions?: string[]
  /**
   * For an imported npm CLI capability (codex & friends): the real npm package whose version the
   * update checker tracks, and the absolute `userData/capabilities/<id>` dir its `node_modules`
   * lives in. Written by `installFromNpm`; a hand-authored page may set them too to opt a
   * globally-provisioned CLI into the same update flow.
   */
  npmPackage?: string
  capabilityDir?: string
}

/**
 * Every key {@link readPageMeta} understands — anything else is reported, not silently dropped.
 * `$schema` is on the list without being read: it is the editor directive that points a
 * `container.json` at `pages/container.schema.json`, so flagging it would punish exactly the
 * authors we want to opt into the schema.
 * Exported because that schema file is a hand-written mirror of this set and a test keeps them
 * from drifting apart.
 */
export const MANIFEST_KEYS = new Set([
  '$schema',
  'name',
  'description',
  'port',
  'startCommand',
  'external',
  'externalUrl',
  'kind',
  'dsh',
  'openclaw',
  'manageAsApp',
  'dependsOn',
  'healthUrl',
  'envVars',
  'schemaVersion',
  'author',
  'version',
  'icon',
  'permissions',
  'npmPackage',
  'capabilityDir'
])

/** Capability ids the container knows about; unknown ones warn but are kept for display. */
const MANIFEST_PERMISSIONS = new Set(['notify', 'downloads', 'externalShell'])

/**
 * Cheap forward-compatibility check: an unknown key or a wrong-typed field means the author
 * typo'd or wrote for a newer container. Neither is fatal — the manifest keeps being read —
 * but both are surfaced in the page config dialog so the mistake is visible somewhere.
 */
function manifestWarnings(raw: ContainerManifest): string[] {
  const out: string[] = []
  for (const key of Object.keys(raw ?? {})) {
    if (!MANIFEST_KEYS.has(key)) out.push(msg('page.warnUnknownKey', { key }))
  }
  if (raw.port !== undefined && typeof raw.port !== 'number') {
    out.push(msg('page.warnBadType', { key: 'port', want: 'number' }))
  }
  if (raw.icon !== undefined && typeof raw.icon !== 'string') {
    out.push(msg('page.warnBadType', { key: 'icon', want: 'string' }))
  }
  if (raw.permissions !== undefined && !Array.isArray(raw.permissions)) {
    out.push(msg('page.warnBadType', { key: 'permissions', want: 'string[]' }))
  } else {
    for (const p of raw.permissions ?? []) {
      if (typeof p !== 'string' || !MANIFEST_PERMISSIONS.has(p)) {
        out.push(msg('page.warnUnknownPermission', { key: String(p) }))
      }
    }
  }
  if (Array.isArray(raw.envVars)) {
    for (const v of raw.envVars) {
      if (v?.type && v.type !== 'dir' && v.type !== 'text') {
        out.push(msg('page.warnBadType', { key: `envVars[${v.key}].type`, want: 'dir | text' }))
      }
    }
  }
  return out
}

/** Icon extensions we inline, mapped to the media type the `data:` URL needs. */
const ICON_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}
const ICON_MAX_BYTES = 64 * 1024

/**
 * Turn a manifest `icon` (data URL or file relative to the page dir) into something the renderer
 * can put straight in `src`. Inlining in the main process keeps the renderer free of `pages/`
 * path resolution; an oversized or missing file simply yields undefined (the UI falls back to
 * its letter glyph) with a warning so the author sees why.
 */
function resolveIconUrl(dir: string, icon: unknown, warnings: string[]): string | undefined {
  const value = typeof icon === 'string' ? icon.trim() : ''
  if (!value) return undefined
  if (value.startsWith('data:')) {
    if (value.length > ICON_MAX_BYTES * 2) {
      warnings.push(msg('page.warnIconBig', { size: Math.round(value.length / 1024) }))
      return undefined
    }
    return value
  }
  const ext = value.toLowerCase().match(/\.[a-z]+$/)?.[0] || ''
  const mime = ICON_MIME[ext]
  if (!mime || value.includes('..') || /^[a-zA-Z]:[\\/]|^[\\/]/.test(value)) {
    warnings.push(msg('page.warnIconPath', { path: value }))
    return undefined
  }
  try {
    const buf = readFileSync(join(dir, value))
    if (buf.byteLength > ICON_MAX_BYTES) {
      warnings.push(msg('page.warnIconBig', { size: Math.round(buf.byteLength / 1024) }))
      return undefined
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    // Unreadable (missing, locked, a directory): the warning names the path, the reason adds nothing.
    warnings.push(msg('page.warnIconMissing', { path: value }))
    return undefined
  }
}

/** Env var automatically exposed (and injected) for every plain imported page so its
    install directory is configurable from Settings without declaring container.json envVars. */
export const PAGE_DIR_ENV_KEY = 'APP_DIR'

export function readPageMeta(pagesDir: string, id: string): PageMeta {
  const dir = join(pagesDir, id)
  let raw: ContainerManifest = {}
  const metaFile = join(dir, 'container.json')
  if (existsSync(metaFile)) {
    try {
      raw = JSON.parse(readFileSync(metaFile, 'utf-8'))
    } catch (err) {
      throw new Error(msg('page.metaParseFail', { err: (err as Error).message }))
    }
  }
  const kind: PageKind =
    raw.kind === 'dsh'
      ? 'dsh'
      : raw.kind === 'openclaw'
        ? 'openclaw'
        : raw.kind === 'terminal'
          ? 'terminal'
          : 'page'
  const external = Boolean(raw.external)
  // A user port override (Settings / import form) stands in for a missing declared port,
  // so importing a project without editing its own container.json can succeed.
  const override = getSettings().pagePorts?.[id]
  let port = Number(raw.port ?? 0) || (isValidPort(override) ? Number(override) : 0)
  let startCommand = raw.startCommand || ''
  if (kind === 'dsh') {
    port = Number(raw.dsh?.port ?? raw.port ?? 5173)
    startCommand = `dsh --profile ${raw.dsh?.profile || 'web'}`
  } else if (kind === 'openclaw') {
    port = Number(raw.openclaw?.port ?? raw.port ?? OPENCLAW_DEFAULT_PORT)
    startCommand = `openclaw gateway run --force --allow-unconfigured --port ${port}`
  } else if (kind === 'terminal') {
    // CLI-only project: no HTTP port; it runs inside the embedded terminal.
    if (!startCommand) throw new Error(msg('page.metaNoStart'))
  } else if (!external && !port && !startCommand) {
    // No declared port is fine when the project has an inferable entry point —
    // the listener picks its own port then. Only a dead end (neither) is rejected.
    if (startCommandInferable(dir)) startCommand = defaultStartCommand(dir)
    else throw new Error(msg('page.metaNoPort'))
  }
  if (kind === 'page' && !external && !startCommand) startCommand = defaultStartCommand(dir)
  const declared = Array.isArray(raw.envVars) ? raw.envVars : []
  // Non-fatal container.json problems (typos, fields from a newer schema) are collected once
  // here and travel with the meta so the config dialog can show them.
  const warnings = manifestWarnings(raw)
  // Flatten the per-language fields right here: every consumer downstream of this point
  // (Settings panel, env injection, the renderer's page list) deals in plain strings only.
  const declaredSpecs = declared
    .filter((v) => Boolean(v?.key))
    .map((v) => {
      const { label, description, type, ...rest } = v
      return {
        ...rest,
        label: resolveText(label) || undefined,
        description: resolveText(description) || undefined,
        // Only the two known editor kinds survive (anything else was already warned about),
        // so the panel never renders an input for a type it doesn't implement.
        ...(type === 'text' ? { type: 'text' as const } : type === 'dir' ? { type: 'dir' as const } : {})
      }
    })
  // Auto-expose the install directory for plain pages so importing alone yields a
  // configurable env var in Settings — no container.json envVars declaration needed.
  let envVars: PageMeta['envVars'] = declaredSpecs.length ? declaredSpecs : undefined
  if (kind === 'page' && !external && !declaredSpecs.some((v) => v.key === PAGE_DIR_ENV_KEY)) {
    envVars = [
      {
        key: PAGE_DIR_ENV_KEY,
        label: msg('page.dirEnvLabel'),
        defaultPath: dir,
        description: msg('page.dirEnvDesc')
      },
      ...declaredSpecs
    ]
  }
  return {
    id,
    name: resolveText(raw.name, id),
    dir,
    port,
    containerPort: resolvePagePort(id, port),
    startCommand,
    description: resolveText(raw.description) || undefined,
    external,
    externalUrl: raw.externalUrl,
    kind,
    builtin: BUILTIN_PAGE_IDS.has(id),
    dshProfile: raw.dsh?.profile || 'web',
    // Agent runtimes live in the 应用 menu by default; imported pages opt in via
    // container.json "manageAsApp": true.
    manageAsApp: raw.manageAsApp ?? (kind === 'dsh' || kind === 'openclaw'),
    // Deps keep only non-empty strings that aren't the page itself — self-imports would
    // deadlock ensureDeps behind an ancestry check that legitimately allows siblings.
    // A container-side `pageDeps` override (editable in the Pages panel) fully shadows the
    // project's own declaration — including an empty array, the explicit "no deps" case — so
    // wiring never requires rewriting a third-party container.json.
    dependsOn: resolvePageDeps(id, raw.dependsOn),
    healthUrl:
      !external && typeof raw.healthUrl === 'string' && raw.healthUrl.trim()
        ? raw.healthUrl.trim()
        : undefined,
    schemaVersion: Number.isFinite(Number(raw.schemaVersion)) ? Number(raw.schemaVersion) : undefined,
    author: typeof raw.author === 'string' ? raw.author.trim() || undefined : undefined,
    version: typeof raw.version === 'string' ? raw.version.trim() || undefined : undefined,
    iconUrl: resolveIconUrl(dir, raw.icon, warnings),
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.filter((p): p is string => typeof p === 'string')
      : undefined,
    npmPackage: typeof raw.npmPackage === 'string' && raw.npmPackage.trim() ? raw.npmPackage.trim() : undefined,
    capabilityDir:
      typeof raw.capabilityDir === 'string' && raw.capabilityDir.trim() ? raw.capabilityDir.trim() : undefined,
    manifestWarnings: warnings.length ? warnings : undefined,
    envVars
  }
}

/**
 * Manifest warnings already reported per page, keyed by their joined text. `scanInstalledPages`
 * runs on every refresh of the page list, so without this a single typo'd field would bury the
 * timeline; re-reporting only when the set actually changes keeps one row per real problem.
 */
const reportedManifestWarnings = new Map<string, string>()

export function scanInstalledPages(pagesDir: string): PageMeta[] {
  if (!existsSync(pagesDir)) return []
  const out: PageMeta[] = []
  for (const entry of readdirSync(pagesDir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    const full = join(pagesDir, entry)
    try {
      if (!statSync(full).isDirectory()) continue
      const meta = readPageMeta(pagesDir, entry)
      const warnings = meta.manifestWarnings ?? []
      const signature = warnings.join('\n')
      if (reportedManifestWarnings.get(entry) !== signature) {
        // Only a change (including a fix, which clears the row) is worth a timeline entry.
        if (warnings.length) {
          reportedManifestWarnings.set(entry, signature)
          logEvent({
            level: 'warn',
            kind: 'manifest.invalid',
            pageId: entry,
            detail: signature,
            meta: { count: warnings.length }
          })
        } else {
          reportedManifestWarnings.delete(entry)
        }
      }
      out.push(meta)
    } catch (err) {
      out.push({
        id: entry,
        name: msg('page.metaInvalid', { entry }),
        dir: full,
        port: 0,
        containerPort: resolvePagePort(entry, 0),
        startCommand: '',
        description: String((err as Error).message),
        external: false
      })
    }
  }
  return out
}
