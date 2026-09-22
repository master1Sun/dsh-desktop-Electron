/**
 * Shared import-source recognition: one smart field instead of three forms. The renderer
 * classifies what the user typed (Git URL, local folder, or npm package spec) to route the
 * install and to pick the right pre-flight; the rules are pure string grammar, so they run
 * on either side of the IPC boundary and are unit-testable without Electron.
 */

export type SourceKind = 'git' | 'dir' | 'npm'

/** A local filesystem path (Windows drive, UNC, or POSIX-style relative/absolute). */
export function looksLikeLocalPath(s: string): boolean {
  return (
    /^[a-z]:[\\/]/i.test(s) ||
    s.startsWith('\\\\') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('.\\') ||
    s.startsWith('..\\') ||
    s.startsWith('/')
  )
}

/** `owner/repo` (no protocol, exactly two safe path segments) — a GitHub shorthand. */
export function isGitHubShort(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && !s.includes('@')
}

const GIT_URL = /^(https?:\/\/|git@|ssh:\/\/)/i
// npm name grammar (+ optional @version / dist-tag), mirrors main's parseNpmSpec.
const NPM_SPEC = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/[a-z0-9-._~]+|[a-z0-9-._~]+)(?:@[\w.+-]+)?$/i

/**
 * What did the user paste? Order matters: an explicit scheme wins over everything, then a
 * filesystem path, then `owner/repo`, then an npm spec. Anything else is unrecognised (null)
 * and the import button stays disabled rather than guessing.
 */
export function detectSourceKind(raw: string): SourceKind | null {
  const s = (raw || '').trim()
  if (!s) return null
  if (GIT_URL.test(s) || s.endsWith('.git')) return 'git'
  // Paths go before the whitespace ban — "C:\Program Files\app" is a legitimate folder.
  if (looksLikeLocalPath(s)) return 'dir'
  if (/\s/.test(s)) return null
  if (isGitHubShort(s)) return 'git'
  if (NPM_SPEC.test(s)) return 'npm'
  return null
}

/** Expand the `owner/repo` shorthand to a cloneable GitHub URL; anything else passes through. */
export function expandGitSource(raw: string): string {
  const s = (raw || '').trim()
  return isGitHubShort(s) ? `https://github.com/${s}.git` : s
}
