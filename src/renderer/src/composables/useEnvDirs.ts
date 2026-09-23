import { ref } from 'vue'
import { ENV_INSTALL, ENV_SYSTEM, envDirName } from '@shared/envDir'
import type { EnvRootInfo } from '@shared/types'

/**
 * Shared state + display helpers for the two-choice 环境目录 rows, used by the SettingsPanel
 * env tab, AppManager and the PageManager config dialog. The concrete paths behind the two
 * choices can only be computed in main (install dir, os home), so every surface reads the same
 * cached EnvRootInfo; module scope keeps three components from tripling the IPC calls.
 */
const envRootInfo = ref<EnvRootInfo | null>(null)

/** Optional-call chain: a missing bridge method (tests / older shells) leaves the cache as-is. */
async function refreshEnvRoot(): Promise<void> {
  const res = await window.container.getEnvRoot?.().catch(() => null)
  if (res?.ok && res.data) envRootInfo.value = res.data as EnvRootInfo
}

/** Show a declared default with its templates resolved: {envRoot} and a leading `~`.
 *  Display-only, so on Windows (a `\` home) the declared `/` separators are normalised to
 *  `\` — otherwise `~/.dsh` would render as the mixed `C:\Users\me/.dsh`. */
function displayPath(p: string): string {
  if (!p) return ''
  const info = envRootInfo.value
  let out = info ? p.replace(/\{envRoot\}/g, info.envRoot) : p
  if (info && (out === '~' || /^~[/\\]/.test(out))) out = info.home + out.slice(1)
  if (out.includes('\\')) out = out.replace(/\//g, '\\')
  return out
}

/** Where the '@install' choice of one row lands — mirrors main's join(envRoot, envDirName).
 *  Display-only, so the separator follows the root's own style (a Windows `\env` root gets a
 *  `\` join, a POSIX root a `/`) instead of forcing a slash that would read as `env/.dsh`. */
function installPathFor(key: string, pageId: string): string {
  const root = envRootInfo.value?.envRoot
  if (!root) return ''
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[/\\]+$/, '')}${sep}${envDirName(key, pageId)}`
}

/** Normalize a persisted value to a card value. The install choice is the default, so only an
 *  explicit '@system' selects the system-common card; '' / '@install' / a legacy free path all
 *  read as install — mirroring how main resolves them. */
function choiceValue(stored: string | undefined): string {
  return (stored || '').trim() === ENV_SYSTEM ? ENV_SYSTEM : ENV_INSTALL
}

export function useEnvDirs(): {
  envRootInfo: typeof envRootInfo
  refreshEnvRoot: () => Promise<void>
  displayPath: (p: string) => string
  installPathFor: (key: string, pageId: string) => string
  choiceValue: (stored: string | undefined) => string
} {
  return { envRootInfo, refreshEnvRoot, displayPath, installPathFor, choiceValue }
}
