/**
 * Shared vocabulary for the two-choice 环境目录 UI (Settings → 环境目录, AppManager,
 * the page config dialog). Directory rows no longer accept free-form paths: each
 * runtime's home lives either in a per-tool subfolder of the container env root
 * (`ENV_INSTALL`, the root being fixed at userData/env) or in the tool's own
 * system-common location (`ENV_SYSTEM` — the native `~/.dsh` / `~/.openclaw` / `~/.codex`
 * shared with the terminal). The sentinel persists verbatim in settings.dshHome /
 * openclawHome / pageEnvs. An empty value (never touched) and any legacy free-form path
 * both mean "the default": main resolves that to the independent `ENV_INSTALL` dir, EXCEPT
 * it keeps an already-populated system home in use so switching the default never strands
 * an existing login (which would break dsh/openclaw boot). Only an explicit '@install'
 * forces a fresh container dir, and only an explicit '@system' pins the system home.
 */

/** store value selecting <envRoot>/.<tool-name> as the directory — forces a fresh container dir */
export const ENV_INSTALL = '@install'
/** store value opting a row back into the tool's system-common home (shared with the CLI) */
export const ENV_SYSTEM = '@system'

/**
 * Per-tool subfolder name under the env root for the '@install' choice, derived from
 * the declared env var so main and every renderer surface agree on where data lands.
 * It carries the same leading dot as the tool's system home (DSH_HOME → .dsh,
 * CODEX_HOME → .codex; keys without a `*_HOME` suffix fall back to the page id), so the
 * install-choice dir mirrors the `~/.dsh` / `~/.openclaw` layout it is an alternative to.
 */
export function envDirName(key: string, pageId: string): string {
  const m = /^(.+?)_HOME$/i.exec((key || '').trim())
  return `.${(m?.[1] || pageId || 'page').toLowerCase()}`
}
