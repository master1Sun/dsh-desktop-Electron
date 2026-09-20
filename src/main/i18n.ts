import type { Locale, LocalizableText } from '../shared/types'

/**
 * Main-process i18n.
 *
 * The renderer owns the full UI dictionary (`src/renderer/src/i18n`); the main process only
 * renders a small set of strings itself — window title, tray menu/tooltip, native dialogs,
 * the auto-generated `envVars` labels it hands to the Settings panel, and the error text it
 * returns over IPC. The two bundles cannot share a module, so this table is deliberately
 * maintained on its own and kept as small as possible.
 *
 * The active language always mirrors the persisted `settings.locale`; the source is injected
 * via `registerLocaleSource()` at boot so this module needs no import of the settings store
 * (which would create a cycle).
 *
 * NOTE — never end a translated string with the bare word `import` as its final token, right
 * before the closing quote. electron-vite's `vite:esm-shim` plugin locates where to inject its
 * CommonJS shim by running a loose regex (`ESMStaticImportRe`) over the *bundled* chunk and
 * taking the last thing that looks like a static import; a value ending that way reads as one.
 * The shim then lands inside the object literal and the bundle dies with "Unterminated string
 * literal" — which is exactly what the English `install.importedDesc` value used to do.
 * `test/i18n.test.ts` fails the suite if this pattern ever reappears anywhere under `src/`.
 */

type Dict = Record<string, string>

const zh: Dict = {
  'app.title': '桌面控制台',
  'tray.show': '显示主界面',
  'tray.stop': '停止 {name}',
  'tray.start': '启动 {name}',
  'tray.quit': '退出容器（将停止所有 node 进程）',
  'tray.tooltip': '桌面控制台 · {n} 个 page 运行中',
  'dialog.title': 'DSH 容器',
  'dialog.chooseDir': '选择要托管的本地项目目录',
  'err.nodeVersion': '内置 Node 版本异常：{version}（期望 v24.21.0）',
  'err.nodeMissing': '未找到内置 Node 运行时，请先运行 npm run setup:node',

  'ipc.portRange': '端口需为 1-65535 的整数',
  'ipc.notTerminal': '{id} 不是终端类项目',
  'ipc.unknownTarget': '未知的目标: {target}',
  'ipc.containerRoot': '容器根目录',
  'ipc.guestGone': '内嵌页面已不可用',
  'pty.commandNotFound':
    '找不到命令 “{cmd}”：它不在 PATH 中，也不是可执行文件。请确认该 CLI 已安装或已在设置中提供完整路径。',

  'page.noEntryCommand':
    '无法推断启动命令：目录缺少 server.js / index.js / package.json(start script)',
  'page.metaParseFail': 'container.json 解析失败: {err}',
  'page.metaNoStart': 'container.json 缺少 startCommand（terminal 类型必填）',
  'page.metaNoPort':
    'container.json 缺少 port（或设置 external=true / kind=terminal，或项目自带可推断的启动入口）',
  'page.dirEnvLabel': '页面目录',
  'page.dirEnvDesc': '自动生成的应用安装目录，以环境变量注入该页面子进程。留空即用导入时的目录。',
  'page.metaInvalid': '{entry} (配置无效)',
  'page.portNotReady': '端口 {port} 在 {sec}s 内未就绪',
  'page.containerDesc': '容器主程序（git 更新检测对象）',
  'page.unknown': '未知 page: {id}',
  'page.externalNoStart': '{name} 是外部地址项目，无需启动进程',
  'page.invalidConfig': '{name} 配置无效，无法启动（请先设置端口）',
  'page.noStartCommand': '{name} 缺少启动命令，无法在终端中运行',
  'page.logStarting': '[container] 正在启动 {name}（端口 {port}）…',
  'page.dshStartFail': 'dsh 启动失败: {err}',
  'page.openclawStartFail': 'openclaw 启动失败: {err}',
  'page.cliNeedsTerminal': '{name} 是命令行项目，请点击「终端」在内置终端中运行',
  'page.spawnFail': 'spawn 失败: {err}',
  'page.processExited': '进程退出，code={code}',
  'page.logReady': '[container] 已就绪，监听端口 {port}',
  'page.dshProfileNotReady': 'dsh profile 在 {sec}s 内未就绪（端口 {port}）',
  'page.logStopping': '[container] 正在停止…',

  'dsh.pnpmMissing': '未找到 pnpm（dsh 的插件管理依赖 pnpm）。请先执行: npm install -g pnpm',
  'dsh.invalidProfile': '非法 profile 名: {profile}',
  'dsh.reservedProfile': 'profile 名 "desktop" 由 dsh 的 Electron 应用保留',
  'dsh.notInstalled':
    '未安装 @deepseek-ai/dsh（npm run setup:dsh 或 npm install @deepseek-ai/dsh）',
  'dsh.pkgNoManifest': 'dsh 包缺少 package.json',
  'dsh.pkgBroken': 'dsh 包损坏：{err}',
  'dsh.unavailable': 'dsh 不可用',
  'dsh.exitCode': 'dsh 退出码 {code}',
  'dsh.pageExists': 'pages/{id} 已存在',
  'dsh.profilePageDesc':
    '由容器管理的 @deepseek-ai/dsh profile「{profile}」，插件在本机 userData 的 profile 目录内管理',
  'dsh.invalidSpec': '非法包名/地址: {spec}',
  'dsh.gitNeedsUrl': 'git 更新需要提供仓库地址',
  'dsh.updatedTo': '已更新至 {spec}',
  'dsh.npmUpdated': '已通过 npm 更新 {spec}',
  'dsh.illegalRepoChars': '仓库地址包含非法字符',
  'dsh.lsRemoteFail': 'git ls-remote 失败',
  'dsh.remoteHeadFail': '无法解析远端 HEAD',
  'dsh.binMissing': '未找到 @deepseek-ai/dsh/lib/bin.js（先运行 npm run setup:dsh）',

  'openclaw.cliMissing':
    '未找到 openclaw CLI，请先运行 npm run setup:openclaw（或全局安装 openclaw@latest）',
  'openclaw.cliMissingShort': '未找到 openclaw CLI，请先运行 npm run setup:openclaw',
  'openclaw.versionFail': 'openclaw --version 退出码 {code}',
  'openclaw.unavailable': 'openclaw 不可用：{err}',
  'openclaw.homeLabel': 'OPENCLAW 配置目录',
  'openclaw.homeDesc': '留空即跟随环境目录（默认在安装目录下的 env/openclaw）',
  'openclaw.pageDesc':
    '由容器管理的 openclaw gateway（自带最新版），主界面内嵌打开 Control UI；配置目录跟随环境目录',

  'install.importedDesc': '导入时由容器生成',
  'install.repoUrlInvalid': '仓库地址需为 https 或 git@ 形式的 git URL',
  'install.dirNameNeeded': '无法推导目录名，请指定 name',
  'install.dirNameFail': '无法推导目录名',
  'install.clonedNoEntry':
    '克隆成功但缺少 container.json / 无法推断启动命令：{err}。请在设置页编辑该项目的 container.json。',
  'install.srcMissing': '目录不存在: {dir}',
  'install.cannotRemoveContainer': '不能移除容器本身',
  'install.builtinUndeletable': '{id} 是容器内置页面，不可删除',
  'install.illegalPageId': '非法 page id',

  'git.notRepo': '不是 git 仓库（本地目录安装或已移除）',
  'git.notRepoContainer': '尚未初始化，点击“更新”将从官方仓库获取源码',
  'git.initialized': '桌面控制台源码已就绪，重启应用后生效',
  'git.noOrigin': '无 origin 远端',
  'git.branchMissing': '远端没有分支 {branch}',
  'git.dirtySkipped': '工作区有未提交改动，已跳过（请手动处理）',

  'upd.registryUnreachable': '无法访问 npm registry',
  'upd.versionNotDetected': '未检测到已安装版本',
  'upd.dshName': 'DSH 本体',
  'upd.npmExitCode': 'npm 退出码 {code}',
  'upd.npmMissing': '缺少内置 npm（{npm}），请先运行 npm run setup:node',
  'upd.dshDirNotWritable':
    '（目录不可写：请检查用户数据目录权限，或手动运行 npm run setup:dsh --force）',
  'upd.dshUpgraded': 'DSH 已升级至 {after}，重启 dsh 页面后生效',
  'upd.dshUpToDate': 'DSH 已是最新（{after}）',
  'upd.openclawDirMissing': '未找到 openclaw 安装目录',
  'upd.openclawDirNotWritable':
    '（安装目录不可写：请以管理员身份重新构建，或手动运行 npm run setup:openclaw --force）',
  'upd.openclawUpgraded': 'OpenClaw 已升级至 {after}，重启该页面后生效',
  'upd.openclawUpToDate': 'OpenClaw 已是最新（{after}）',
  'upd.localNoAuto': '本地项目不支持自动更新，请在其仓库拉取新版后重装/复制',
  'upd.unknownChannel': '未知的更新方式'
}

const en: Dict = {
  'app.title': 'Desktop Console',
  'tray.show': 'Show main window',
  'tray.stop': 'Stop {name}',
  'tray.start': 'Start {name}',
  'tray.quit': 'Quit container (stops all node processes)',
  'tray.tooltip': 'Desktop Console · {n} page(s) running',
  'dialog.title': 'DSH Container',
  'dialog.chooseDir': 'Choose the local project folder to host',
  'err.nodeVersion': 'Unexpected built-in Node version: {version} (expected v24.21.0)',
  'err.nodeMissing': 'Built-in Node runtime not found — run npm run setup:node first',

  'ipc.portRange': 'Port must be an integer from 1 to 65535',
  'ipc.notTerminal': '{id} is not a terminal project',
  'ipc.unknownTarget': 'Unknown target: {target}',
  'ipc.containerRoot': 'Container root',
  'ipc.guestGone': 'The embedded page is no longer available',
  'pty.commandNotFound':
    'Command not found: “{cmd}” — it is neither on PATH nor an executable file. Make sure the CLI is installed, or set its full path in the settings.',

  'page.noEntryCommand':
    'Cannot infer a start command: the folder has no server.js / index.js / package.json(start script)',
  'page.metaParseFail': 'Failed to parse container.json: {err}',
  'page.metaNoStart': 'container.json is missing startCommand (required for kind=terminal)',
  'page.metaNoPort':
    'container.json is missing port (or set external=true / kind=terminal, or provide an inferable entry point)',
  'page.dirEnvLabel': 'Page directory',
  'page.dirEnvDesc':
    'Auto-generated app install directory, injected into this page’s subprocess as an env var. Empty uses the imported directory.',
  'page.metaInvalid': '{entry} (invalid config)',
  'page.portNotReady': 'Port {port} was not ready within {sec}s',
  'page.containerDesc': 'Container main program (git update-check target)',
  'page.unknown': 'Unknown page: {id}',
  'page.externalNoStart': '{name} is an external address project; no process to start',
  'page.invalidConfig': '{name} has an invalid config and cannot start (set a port first)',
  'page.noStartCommand': '{name} has no start command and cannot run in a terminal',
  'page.logStarting': '[container] Starting {name} (port {port})…',
  'page.dshStartFail': 'dsh failed to start: {err}',
  'page.openclawStartFail': 'openclaw failed to start: {err}',
  'page.cliNeedsTerminal':
    '{name} is a CLI project — click "Terminal" to run it in the built-in terminal',
  'page.spawnFail': 'spawn failed: {err}',
  'page.processExited': 'Process exited, code={code}',
  'page.logReady': '[container] Ready, listening on port {port}',
  'page.dshProfileNotReady': 'dsh profile was not ready within {sec}s (port {port})',
  'page.logStopping': '[container] Stopping…',

  'dsh.pnpmMissing': 'pnpm not found (dsh manages plugins with pnpm). Run: npm install -g pnpm',
  'dsh.invalidProfile': 'Invalid profile name: {profile}',
  'dsh.reservedProfile': 'The profile name "desktop" is reserved by dsh’s Electron app',
  'dsh.notInstalled':
    '@deepseek-ai/dsh is not installed (npm run setup:dsh or npm install @deepseek-ai/dsh)',
  'dsh.pkgNoManifest': 'The dsh package is missing package.json',
  'dsh.pkgBroken': 'The dsh package is broken: {err}',
  'dsh.unavailable': 'dsh is unavailable',
  'dsh.exitCode': 'dsh exited with code {code}',
  'dsh.pageExists': 'pages/{id} already exists',
  'dsh.profilePageDesc':
    'Container-managed @deepseek-ai/dsh profile "{profile}"; plugins are managed in this machine’s userData profile directory',
  'dsh.invalidSpec': 'Invalid package name / URL: {spec}',
  'dsh.gitNeedsUrl': 'A git update requires a repository URL',
  'dsh.updatedTo': 'Updated to {spec}',
  'dsh.npmUpdated': 'Updated {spec} via npm',
  'dsh.illegalRepoChars': 'The repository URL contains illegal characters',
  'dsh.lsRemoteFail': 'git ls-remote failed',
  'dsh.remoteHeadFail': 'Could not resolve the remote HEAD',
  'dsh.binMissing': '@deepseek-ai/dsh/lib/bin.js not found (run npm run setup:dsh first)',

  'openclaw.cliMissing':
    'openclaw CLI not found — run npm run setup:openclaw (or install openclaw@latest globally)',
  'openclaw.cliMissingShort': 'openclaw CLI not found — run npm run setup:openclaw first',
  'openclaw.versionFail': 'openclaw --version exited with code {code}',
  'openclaw.unavailable': 'openclaw is unavailable: {err}',
  'openclaw.homeLabel': 'OPENCLAW config dir',
  'openclaw.homeDesc':
    'Empty follows the environment directory (env/openclaw under the install dir by default)',
  'openclaw.pageDesc':
    'Container-managed openclaw gateway (bundled latest); the main window embeds its Control UI; the config dir follows the environment directory',

  'install.importedDesc': 'Generated by the container when the project was imported',
  'install.repoUrlInvalid': 'The repository URL must be an https or git@ git URL',
  'install.dirNameNeeded': 'Could not infer a folder name; please specify name',
  'install.dirNameFail': 'Could not infer a folder name',
  'install.clonedNoEntry':
    'Cloned successfully but container.json is missing / no start command could be inferred: {err}. Edit that project’s container.json on the Settings page.',
  'install.srcMissing': 'Directory does not exist: {dir}',
  'install.cannotRemoveContainer': 'The container itself cannot be removed',
  'install.builtinUndeletable': '{id} is a built-in container page and cannot be removed',
  'install.illegalPageId': 'Illegal page id',

  'git.notRepo': 'Not a git repository (installed from a local folder, or removed)',
  'git.notRepoContainer': 'Not initialized yet — click Update to fetch the source from the official repo',
  'git.initialized': 'Desktop container source is ready; restart the app to apply',
  'git.noOrigin': 'No origin remote',
  'git.branchMissing': 'The remote has no branch {branch}',
  'git.dirtySkipped': 'The working tree has uncommitted changes; skipped (handle manually)',

  'upd.registryUnreachable': 'Cannot reach the npm registry',
  'upd.versionNotDetected': 'No installed version detected',
  'upd.dshName': 'DSH core',
  'upd.npmExitCode': 'npm exited with code {code}',
  'upd.npmMissing': 'Built-in npm is missing ({npm}); run npm run setup:node first',
  'upd.dshDirNotWritable':
    ' (directory not writable: check user-data directory permissions, or run npm run setup:dsh --force manually)',
  'upd.dshUpgraded': 'DSH upgraded to {after}; restart the dsh page to apply',
  'upd.dshUpToDate': 'DSH is up to date ({after})',
  'upd.openclawDirMissing': 'openclaw install directory not found',
  'upd.openclawDirNotWritable':
    ' (install directory not writable: rebuild as administrator, or run npm run setup:openclaw --force manually)',
  'upd.openclawUpgraded': 'OpenClaw upgraded to {after}; restart that page to apply',
  'upd.openclawUpToDate': 'OpenClaw is up to date ({after})',
  'upd.localNoAuto':
    'Local projects do not support auto-update; pull the new version in their repo, then reinstall/copy',
  'upd.unknownChannel': 'Unknown update channel'
}

/** Exported so tests can assert the two languages stay key-for-key in sync. */
export const dictionaries: Record<Locale, Dict> = { zh, en }

/** Injected at boot from the settings store — avoids importing it here (cycle). */
let localeSource: () => Locale | undefined = () => 'zh'

export function registerLocaleSource(fn: () => Locale | undefined): void {
  localeSource = fn
}

/**
 * Language-change fan-out. The surfaces that cache translated text (tray menu, window
 * caption) subscribe here instead of being imported by the IPC layer, which would close an
 * `index → ipc → index` import cycle.
 */
const localeListeners = new Set<() => void>()

export function onLocaleChanged(fn: () => void): void {
  localeListeners.add(fn)
}

export function notifyLocaleChanged(): void {
  for (const fn of localeListeners) fn()
}

/** The language currently in effect (unknown/empty settings always mean Chinese). */
export function currentLocale(): Locale {
  return localeSource() === 'en' ? 'en' : 'zh'
}

/** Translate in an explicitly chosen language — used when a value has to be written out in
 *both* languages at once (e.g. seeding a `container.json` that must serve either locale). */
export function msgIn(lang: Locale, key: string, params?: Record<string, string | number>): string {
  const l: Locale = lang === 'en' ? 'en' : 'zh'
  let str = dictionaries[l][key] ?? zh[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

/** Translate for the active language; unknown keys fall back to Chinese, then to the key itself. */
export function m(key: string, params?: Record<string, string | number>): string {
  return msgIn(currentLocale(), key, params)
}

/**
 * Resolve a `container.json` text field (see `LocalizableText`) for the active language.
 *
 * A plain string is language-neutral and wins as-is, so every manifest written before this
 * existed keeps its exact meaning. An unlisted language falls back to the other variant
 * rather than going blank — a half-translated manifest still reads as *something*. A blank
 * string counts as "not set" (a stray `""` should not shadow a real fallback).
 */
export function resolveText(value: LocalizableText | undefined, fallback = ''): string {
  if (typeof value === 'string') return value.trim() ? value : fallback
  if (!value) return fallback
  const loc = currentLocale()
  const other: Locale = loc === 'zh' ? 'en' : 'zh'
  const pick = (v?: string): string => (typeof v === 'string' && v.trim() ? v : '')
  return pick(value[loc]) || pick(value[other]) || fallback
}
