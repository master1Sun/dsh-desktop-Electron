import type { Locale, LocalizableText } from '../../shared/types'

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
  'tray.quit': '退出控制台',
  'tray.quitConfirmTitle': '确认退出',
  'tray.quitConfirm': '确定要退出吗？',
  'tray.quitYes': '确定',
  'tray.quitNo': '取消',
  'tray.tooltip': '桌面控制台 · {n} 个 page 运行中',
  'tray.tooltipAlert': '桌面控制台 · 有页面异常退出，请打开面板排查',
  'dialog.title': 'DSH 容器',
  'dialog.chooseDir': '选择要托管的本地项目目录',
  'dialog.saveAs': '另存为',
  'err.nodeVersion': '内置 Node 版本异常：{version}（期望 v24.21.0）',
  'err.nodeMissing':
    '未找到内置 Node 运行时，请在“环境准备”引导中点击下载（开发者可运行 npm run setup:node）',
  'err.dualInstance':
    '未能重新获取单实例锁：可能有另一个实例仍在运行，请确认是否出现双实例并存后手动关闭多余实例',
  'err.fatal':
    '桌面控制台遇到致命错误（{err}），即将退出。若反复出现，请通过任务管理器结束残留进程后重新启动；仍无法恢复时请重新安装或回退最近的更新',

  'mcp.errNoId': '缺少服务 id',
  'mcp.errBadId': '服务 id “{id}” 不合法：仅允许字母/数字/下划线/短横线，且以字母或数字开头',
  'mcp.errNoCommand': '缺少启动命令（command）',
  'mcp.errBadEnvKey': '环境变量名 “{key}” 不合法',
  'mcp.errBadCwd': '工作目录（cwd）必须是字符串',
  'mcp.errUnknown': '未知的 MCP 服务：{id}',
  'mcp.errDisabled': 'MCP 服务 {id} 已停用，无法连接',
  'mcp.errNotConnected': 'MCP 服务 {id} 未连接，请先连接',
  'mcp.errHandshakeTimeout': 'MCP 握手超时：服务进程未响应 initialize',
  'mcp.errListToolsTimeout': 'MCP 获取工具列表超时',
  'mcp.errCallTimeout': 'MCP 工具调用超时',
  'mcp.errClosed': 'MCP 服务进程已退出（异常终止或被外部结束）',
  'mcp.errBuiltinEdit': '内置 MCP 服务不可修改',
  'mcp.errBuiltinRemove': '内置 MCP 服务不可删除',
  'mcp.errPkgMissing': '「{name}」的组件尚未下载，请点击行下方的下载按钮获取',
  'mcp.builtin.sequential-thinking.name': '分步推理 Sequential Thinking',
  'mcp.builtin.memory.name': '知识图谱记忆 Memory',
  'mcp.builtin.everything.name': '官方能力演示 Everything',
  'mcp.builtin.filesystem.name': '文件系统 Filesystem',
  'mcp.builtin.context7.name': '库文档检索 Context7',
  'mcp.builtin.playwright.name': '浏览器自动化 Playwright',
  'mcp.builtin.github.name': 'GitHub（需密钥）',
  'mcp.builtin.brave-search.name': 'Brave 搜索（需密钥）',
  'mcp.builtin.dsh-workspace.name': '共享上下文 Workspace',

  'download.doneTitle': '下载完成',
  'download.doneBody': '{name} 已保存到 {dir}',

  'ipc.portRange': '端口需为 1-65535 的整数',
  'ipc.notTerminal': '{id} 不是终端类项目',
  'ipc.unknownTarget': '未知的目标: {target}',
  'ipc.containerRoot': '容器根目录',
  'ipc.guestGone': '内嵌页面已不可用',
  'ipc.resetNotBuiltin': '只有容器内置页面可以重置',
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
  // container.json 轻校验：不致命，只作为「manifest 提示」展示
  'page.warnUnknownKey': '未知的 container.json 字段「{key}」，已忽略',
  'page.warnBadType': '字段「{key}」类型应为 {want}',
  'page.warnUnknownPermission': '未支持的权限声明「{key}」，容器当前只识别 notify/downloads/externalShell',
  'page.warnIconBig': '图标过大（{size}KB，上限 64KB），已忽略',
  'page.warnIconPath': '图标路径无法使用（需为页面目录内的 png/jpg/svg/ico）：{path}',
  'page.warnIconMissing': '未找到图标文件：{path}',
  'page.portNotReady': '端口 {port} 在 {sec}s 内未就绪',
  'page.containerDesc': '容器主程序（git 更新检测对象）',
  'page.unknown': '未知 page: {id}',
  'page.externalNoStart': '{name} 是外部地址项目，无需启动进程',
  'page.disabled': '{name} 已禁用，请在页面管理中重新启用后再试',
  'page.disableExternal': '外部地址项目请在外部地址管理中删除，不支持禁用',
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
  'page.healthFail': '端口已监听但健康检查未通过：{url}',
  'page.portOwner': '端口 {port} 已被进程 {name}（PID {pid}）占用，可结束它后重试，或改用其他端口',
  'page.depsCycle': '启动依赖存在循环：{chain}',
  'page.depsFail': '依赖页面 {dep} 启动失败：{err}',
  'page.logHealthKill': '[container] 健康检查连续 {n} 次失败，判定进程假死，正在重启…',
  'notify.giveUpTitle': '页面自动重启已放弃',
  'notify.giveUpBody': '{name} 连续异常退出 {max} 次，容器已停止自动重启，请在「页面」面板排查',
  'notify.updateReadyTitle': '更新已就绪',
  'notify.updateReadyBody': '桌面控制台 v{version} 已下载完成，重启后生效',
  'log.mainLabel': '主进程日志',
  'update.noRollback': '当前没有可回退的上一版本备份（仅在完成过一次在线更新后可用）',
  'update.rollbackFailed': '回退调度失败，请查看日志',
  'update.relaunchDev':
    '当前处于开发模式（npm run dev），自我重启会连带关闭开发服务器并留下黑屏窗口，已取消本次重启。主进程改动会由 electron-vite 自动重建并重启；如需完全重启，请手动停止并重新运行 npm run dev',
  'diag.exportTitle': '导出诊断报告',
  'page.logStopping': '[container] 正在停止…',
  'page.logRetryAfterReclaim': '[container] 检测到旧进程占用，已清理残留进程，正在重试启动…',
  'page.logCrashRestart':
    '[container] 进程异常退出（code={code}），{sec} 秒后自动重启（第 {n}/{max} 次）…',
  'page.crashGiveUp': '连续 {max} 次异常退出，已停止自动重启；请在「帮助 → 打开日志目录」排查',

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
  'dsh.homeLabel': 'DSH 配置目录',
  'dsh.homeDesc':
    '默认使用独立目录（容器独占，环境根目录下的 .dsh 子目录）；若未手动改动且 ~/.dsh 已有登录会自动沿用以免丢失；选系统通用目录则与终端共用同一套 profile（~/.dsh）',
  'dsh.profilePageDesc':
    '由容器管理的 @deepseek-ai/dsh profile「{profile}」，插件在本机 userData 的 profile 目录内管理',
  'dsh.invalidSpec': '非法包名/地址: {spec}',
  'dsh.gitNeedsUrl': 'git 更新需要提供仓库地址',
  'dsh.updatedTo': '已更新至 {spec}',
  'dsh.npmUpdated': '已通过 npm 更新 {spec}',
  'dsh.notADependency':
    '{name} 并非本 profile 的已安装依赖（已被卸载，或仅是 dsh 遗留的 bundle 层），无需卸载；插件列表已重新读取',
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
  'openclaw.homeDesc':
    '默认使用独立目录（容器独占，环境根目录下的 .openclaw 子目录）；若未手动改动且 ~/.openclaw 已有配置会自动沿用以免丢失；选系统通用目录则与终端共用同一套配置（~/.openclaw）',
  'openclaw.pageDesc':
    '由容器管理的 openclaw gateway（自带最新版），主界面内嵌打开 Control UI；配置目录默认 ~/.openclaw',
  'openclaw.configUnreadable': '无法解析 openclaw 配置（{path}），已中止以免覆盖：{err}',
  'openclaw.tokenWriteFail': '写入 Gateway 令牌失败：{err}',

  'node.notWin': '内置 Node 自动更新目前仅支持 Windows',
  'node.badVersion': '无效的 Node 版本号：{v}',
  'node.indexFail': '无法获取 Node 版本列表：{err}',
  'node.downloading': '正在下载 Node {v} …',
  'node.downloadingPct': '正在下载 Node {v}… {p}%（{mb} MB）',
  'node.extracting': '下载完成，正在解压校验…',
  'node.tooSmall': '下载文件过小（{n} 字节），已放弃',
  'node.downloadFail': '下载失败（已尝试全部镜像）：{err}',
  'node.extractFail': '解压失败：{err}',
  'node.verifyFail': '解压校验失败：未找到 node.exe 或版本不符',
  'node.locked': '旧运行时文件被占用，请先停止使用内置 Node 的页面/终端后重试：{err}',
  'node.done': '内置 Node 已更新为 {v}',

  'install.importedDesc': '导入时由容器生成',
  'install.repoUrlInvalid': '仓库地址需为 https 或 git@ 形式的 git URL',
  'install.dirNameNeeded': '无法推导目录名，请指定 name',
  'install.dirNameFail': '无法推导目录名',
  'install.rejectNonNode':
    '该项目基于 {stack}，容器只能托管 Node 项目，无法克隆或运行；如需接入请把已运行实例配为 external URL。',
  'install.rejectNoEntry':
    '未找到可运行的入口（server.js / index.js 或 package.json 的 start 脚本 / bin），容器无法启动该项目。',
  'install.rejectMonorepoRoot':
    '这是一个 monorepo 根目录（private 或含 workspaces），自身没有可运行入口；请改为导入具体的子包目录。',
  'install.npmMissing': '内置 npm 不可用，无法自动安装依赖；请先修复内置 Node 环境后重试。',
  'install.timeout': '命令超时（{cmd}），已中止。',
  'install.depsFail': '依赖安装失败（{cmd}）：{tail}',
  'install.npmSpecNeeded': '请输入要安装的 npm 包名',
  'install.npmSpecInvalid': '无效的 npm 包名：{spec}',
  'install.npmNoBin':
    'npm 包 {pkg} 未声明可执行的 bin，无法作为终端命令运行；如需托管它的 Web 服务，请改用 Git 导入源码仓库。',
  'install.importedNpmDesc': '导入时由容器生成（npm 包）',
  'install.srcMissing': '目录不存在: {dir}',
  'install.cannotRemoveContainer': '不能移除容器本身',
  'install.builtinUndeletable': '{id} 是容器内置页面，不可删除',
  'install.illegalPageId': '非法 page id',

  'git.notRepo': '不是 git 仓库（本地目录安装或已移除）',
  'git.asarDownloaded': '已下载 v{version}，重启应用后生效（启动异常会自动回滚）',
  'git.asarFetching': '正在从 release 分支下载更新…{percent}',
  'git.asarExtracting': '正在写入更新包：{percent}',
  'git.asarResuming': '从断点继续写入更新包：{percent}',
  'git.zipUnpacking': '下载完成，正在解压 app.asar 与原生模块…',
  'git.asarSizeUnknown': '无法确定更新包大小，下载已中止',
  'git.asarSizeMismatch': '更新包大小校验失败（应为 {want} 字节，实得 {got}），请重试',
  'git.asarExtractFailed': '解压后未找到有效的 app.asar，更新已中止',
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
  'upd.mcpName': 'MCP 内置组件',
  'upd.mcpMissingCount': '{n} 个待下载',
  'upd.mcpOutdatedPrefix': '可更新',
  'upd.mcpRootMissing': '未确定 MCP 组件目录',
  'upd.mcpReady': 'MCP 内置组件已就绪',
  'upd.mcpAlreadyReady': 'MCP 内置组件已是最新（{after}）',
  'upd.localNoAuto': '本地项目不支持自动更新，请在其仓库拉取新版后重装/复制',
  'upd.builtinFollowsContainer': '容器内置页面，随桌面控制台源码一起更新',
  'upd.unknownChannel': '未知的更新方式',

  // #15 配置快照 / 迁移包
  'snapshot.exportTitle': '导出迁移包',
  'snapshot.importTitle': '导入迁移包',
  'snapshot.zipFilter': '迁移包 (zip)',
  'snapshot.noPages': '没有可导出的页面清单，请先导入至少一个项目',
  'snapshot.exported': '迁移包已导出：{path}',
  'snapshot.exportFail': '导出迁移包失败：{err}',
  'snapshot.importFail': '导入迁移包失败：{err}',
  'snapshot.badArchive': '迁移包格式无效或缺少 manifest.json',
  'snapshot.restored': '已导入迁移包，恢复 {n} 个页面配置',
  // #18 崩溃守护分级退出码
  'page.logEngineMismatch':
    '[container] 依赖引擎版本不匹配（EBADENGINE），自动重启无意义，已停止重试',
  'page.logReclaimRetry':
    '[container] 退出码 78（资源被占用），已清理残留进程并立即重试，不计入崩溃预算',
  // #20 资源超限角标
  'tray.tooltipResource': '桌面控制台 · 有页面资源占用超限',
  // #21 网络诊断向导（步骤标签由渲染层按 step.id 本地化）
  'net.proxyNone': '未检测到代理环境变量',
  'net.reachable': '可达（{ms}ms）',
  'net.unreachable': '不可达：{err}'
}

const en: Dict = {
  'app.title': 'Desktop Console',
  'tray.show': 'Show main window',
  'tray.stop': 'Stop {name}',
  'tray.start': 'Start {name}',
  'tray.quit': 'Quit container',
  'tray.quitConfirmTitle': 'Confirm Exit',
  'tray.quitConfirm': 'Are you sure you want to quit?',
  'tray.quitYes': 'OK',
  'tray.quitNo': 'Cancel',
  'tray.tooltip': 'Desktop Console · {n} page(s) running',
  'tray.tooltipAlert': 'Desktop Console · a page exited abnormally — open the panel to investigate',
  'dialog.title': 'DSH Container',
  'dialog.chooseDir': 'Choose the local project folder to host',
  'dialog.saveAs': 'Save As',
  'err.nodeVersion': 'Unexpected built-in Node version: {version} (expected v24.21.0)',
  'err.nodeMissing':
    'Built-in Node runtime not found — download it from the setup guide (developers: run npm run setup:node)',
  'err.dualInstance':
    'Failed to re-acquire the single-instance lock: another instance may still be running — check for duplicate instances and close the extra one manually',
  'err.fatal':
    'The desktop container hit a fatal error ({err}) and will exit. If it keeps happening, kill leftover processes in Task Manager and restart; if it persists, reinstall or roll back the latest update',

  'mcp.errNoId': 'missing server id',
  'mcp.errBadId': 'invalid server id "{id}": use letters/digits/underscore/dash, starting with a letter or digit',
  'mcp.errNoCommand': 'missing command',
  'mcp.errBadEnvKey': 'invalid env var name "{key}"',
  'mcp.errBadCwd': 'cwd must be a string',
  'mcp.errUnknown': 'unknown MCP server: {id}',
  'mcp.errDisabled': 'MCP server {id} is disabled and cannot be connected',
  'mcp.errNotConnected': 'MCP server {id} is not connected — connect it first',
  'mcp.errHandshakeTimeout': 'MCP handshake timed out: the server never answered initialize',
  'mcp.errListToolsTimeout': 'MCP listTools timed out',
  'mcp.errCallTimeout': 'MCP tool call timed out',
  'mcp.errClosed': 'MCP server process exited (crashed or killed externally)',
  'mcp.errBuiltinEdit': 'built-in MCP servers cannot be modified',
  'mcp.errBuiltinRemove': 'built-in MCP servers cannot be removed',
  'mcp.errPkgMissing': "the component for '{name}' has not been downloaded yet — use the download button under the row to fetch it",
  'mcp.builtin.sequential-thinking.name': 'Sequential Thinking',
  'mcp.builtin.memory.name': 'Knowledge-graph Memory',
  'mcp.builtin.everything.name': 'Everything (official demo)',
  'mcp.builtin.filesystem.name': 'Filesystem',
  'mcp.builtin.context7.name': 'Context7 (library docs)',
  'mcp.builtin.playwright.name': 'Playwright (browser automation)',
  'mcp.builtin.github.name': 'GitHub (needs token)',
  'mcp.builtin.brave-search.name': 'Brave Search (needs key)',
  'mcp.builtin.dsh-workspace.name': 'Shared context (Workspace)',

  'download.doneTitle': 'Download complete',
  'download.doneBody': '{name} saved to {dir}',

  'ipc.portRange': 'Port must be an integer from 1 to 65535',
  'ipc.notTerminal': '{id} is not a terminal project',
  'ipc.unknownTarget': 'Unknown target: {target}',
  'ipc.containerRoot': 'Container root',
  'ipc.guestGone': 'The embedded page is no longer available',
  'ipc.resetNotBuiltin': 'Only container built-in pages can be reset',
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
  // container.json light validation: never fatal, surfaced as "manifest hints"
  'page.warnUnknownKey': 'Unknown container.json field "{key}" (ignored)',
  'page.warnBadType': 'Field "{key}" should be of type {want}',
  'page.warnUnknownPermission':
    'Unsupported permission declaration "{key}" — the container only knows notify/downloads/externalShell',
  'page.warnIconBig': 'Icon too large ({size}KB, 64KB cap); ignored',
  'page.warnIconPath':
    'Icon path is not usable (must be a png/jpg/svg/ico inside the page directory): {path}',
  'page.warnIconMissing': 'Icon file not found: {path}',
  'page.portNotReady': 'Port {port} was not ready within {sec}s',
  'page.containerDesc': 'Container main program (git update-check target)',
  'page.unknown': 'Unknown page: {id}',
  'page.externalNoStart': '{name} is an external address project; no process to start',
  'page.disabled': '{name} is disabled; re-enable it in the Pages panel first',
  'page.disableExternal': 'External address projects can be removed in the External Sites manager; they cannot be disabled',
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
  'page.healthFail': 'The port is listening but the health check failed: {url}',
  'page.portOwner':
    'Port {port} is already held by process {name} (PID {pid}) — kill it and retry, or pick another port',
  'page.depsCycle': 'Circular page startup dependency: {chain}',
  'page.depsFail': 'Dependency page {dep} failed to start: {err}',
  'page.logHealthKill':
    '[container] Health check failed {n} times in a row — treating the process as hung and restarting…',
  'notify.giveUpTitle': 'Page auto-restart gave up',
  'notify.giveUpBody':
    '{name} exited abnormally {max} times in a row; the container stopped restarting it — investigate in the Pages panel',
  'notify.updateReadyTitle': 'Update ready',
  'notify.updateReadyBody': 'Desktop container v{version} downloaded — restart to apply',
  'log.mainLabel': 'Main process log',
  'update.noRollback':
    'No previous-version backup is available to roll back to (only offered after one OTA update has completed)',
  'update.rollbackFailed': 'Failed to schedule the rollback — check the logs',
  'update.relaunchDev':
    'Running in dev mode (npm run dev): a self-relaunch would tear down the renderer dev server and leave a black window, so this relaunch was cancelled. electron-vite already rebuilds and restarts the app for main-process edits — to fully restart, stop and re-run npm run dev manually',
  'diag.exportTitle': 'Export diagnostic report',
  'page.logStopping': '[container] Stopping…',
  'page.logRetryAfterReclaim':
    '[container] A stale process was holding the resource; reclaimed it and retrying the start…',
  'page.logCrashRestart':
    '[container] Process died unexpectedly (code={code}); auto-restarting in {sec}s (attempt {n}/{max})…',
  'page.crashGiveUp':
    'Exited abnormally {max} times in a row; auto-restart stopped — open the log folder from Help to investigate',

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
  'dsh.homeLabel': 'DSH config directory',
  'dsh.homeDesc':
    'Uses a container-owned .dsh subfolder of the env root by default; until you change it, an existing ~/.dsh login is kept automatically so nothing is lost. Pick the system-common folder to share the CLI profile store (~/.dsh)',
  'dsh.profilePageDesc':
    'Container-managed @deepseek-ai/dsh profile "{profile}"; plugins are managed in this machine’s userData profile directory',
  'dsh.invalidSpec': 'Invalid package name / URL: {spec}',
  'dsh.gitNeedsUrl': 'A git update requires a repository URL',
  'dsh.updatedTo': 'Updated to {spec}',
  'dsh.npmUpdated': 'Updated {spec} via npm',
  'dsh.notADependency':
    '{name} is not an installed dependency of this profile (already removed, or just a leftover dsh bundle layer) — nothing to uninstall; the plugin list has been re-read',
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
    'Uses a container-owned .openclaw subfolder of the env root by default; until you change it, an existing ~/.openclaw config is kept automatically so nothing is lost. Pick the system-common folder to share the CLI config store (~/.openclaw)',
  'openclaw.pageDesc':
    'Container-managed openclaw gateway (bundled latest); the main window embeds its Control UI; the config dir defaults to ~/.openclaw',
  'openclaw.configUnreadable':
    'Could not parse the openclaw config ({path}); aborted to avoid overwriting it: {err}',
  'openclaw.tokenWriteFail': 'Failed to write the gateway token: {err}',

  'node.notWin': 'Bundled-Node auto-update currently supports Windows only',
  'node.badVersion': 'Invalid Node version: {v}',
  'node.indexFail': 'Cannot fetch the Node version list: {err}',
  'node.downloading': 'Downloading Node {v} …',
  'node.downloadingPct': 'Downloading Node {v}… {p}% ({mb} MB)',
  'node.extracting': 'Download complete; extracting and verifying…',
  'node.tooSmall': 'Downloaded file too small ({n} bytes), aborted',
  'node.downloadFail': 'Download failed on every mirror: {err}',
  'node.extractFail': 'Extraction failed: {err}',
  'node.verifyFail': 'Post-extract check failed: node.exe missing or version mismatch',
  'node.locked':
    'The previous runtime is still in use — stop pages/terminals using the bundled Node and retry: {err}',
  'node.done': 'Bundled Node updated to {v}',

  'install.importedDesc': 'Generated by the container when the project was imported',
  'install.repoUrlInvalid': 'The repository URL must be an https or git@ git URL',
  'install.dirNameNeeded': 'Could not infer a folder name; please specify name',
  'install.dirNameFail': 'Could not infer a folder name',
  'install.rejectNonNode':
    'This project is a {stack} codebase; the container can only host Node projects and cannot clone or run it. Point it at a running instance as an external URL instead.',
  'install.rejectNoEntry':
    'No runnable entry (server.js / index.js or a package.json start script / bin) was found, so the container cannot start this project.',
  'install.rejectMonorepoRoot':
    'This is a monorepo root (private or with workspaces) and has no runnable entry of its own; add a specific workspace folder instead.',
  'install.npmMissing':
    'The bundled npm is unavailable, so dependencies could not be installed automatically. Repair the bundled Node and retry.',
  'install.timeout': 'The command timed out ({cmd}) and was aborted.',
  'install.depsFail': 'Dependency installation failed ({cmd}): {tail}',
  'install.npmSpecNeeded': 'Enter the npm package to install',
  'install.npmSpecInvalid': 'Invalid npm package name: {spec}',
  'install.npmNoBin':
    'The npm package {pkg} declares no runnable bin, so it cannot run as a terminal command. To host its web server, add its source repository from Git instead.',
  'install.importedNpmDesc': 'Generated by the container when this npm package was installed',
  'install.srcMissing': 'Directory does not exist: {dir}',
  'install.cannotRemoveContainer': 'The container itself cannot be removed',
  'install.builtinUndeletable': '{id} is a built-in container page and cannot be removed',
  'install.illegalPageId': 'Illegal page id',

  'git.notRepo': 'Not a git repository (installed from a local folder, or removed)',
  'git.asarDownloaded':
    'v{version} downloaded; restart the app to apply (auto-rolls back if it fails to boot)',
  'git.asarFetching': 'Downloading update from the release branch…{percent}',
  'git.asarExtracting': 'Writing the update package: {percent}',
  'git.asarResuming': 'Resuming the update package write from the breakpoint: {percent}',
  'git.zipUnpacking': 'Download complete; unpacking app.asar and native modules…',
  'git.asarSizeUnknown': 'Could not determine the update package size; download aborted',
  'git.asarSizeMismatch':
    'Update package size check failed (expected {want} bytes, got {got}); please retry',
  'git.asarExtractFailed': 'No valid app.asar after extraction; update aborted',
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
  'upd.mcpName': 'MCP built-in components',
  'upd.mcpMissingCount': '{n} to download',
  'upd.mcpOutdatedPrefix': 'update available',
  'upd.mcpRootMissing': 'MCP components directory not resolved',
  'upd.mcpReady': 'MCP built-in components are ready',
  'upd.mcpAlreadyReady': 'MCP built-in components are up to date ({after})',
  'upd.localNoAuto':
    'Local projects do not support auto-update; pull the new version in their repo, then reinstall/copy',
  'upd.builtinFollowsContainer':
    'Built-in container page — updates with the desktop container source',
  'upd.unknownChannel': 'Unknown update channel',

  // #15 config snapshot / migration package
  'snapshot.exportTitle': 'Export migration package',
  'snapshot.importTitle': 'Import migration package',
  'snapshot.zipFilter': 'Migration package (zip)',
  'snapshot.noPages': 'No page manifest to export — import at least one project first',
  'snapshot.exported': 'Migration package exported: {path}',
  'snapshot.exportFail': 'Failed to export the migration package: {err}',
  'snapshot.importFail': 'Failed to import the migration package: {err}',
  'snapshot.badArchive': 'The migration package is invalid or missing manifest.json',
  'snapshot.restored': 'Migration package imported — restored {n} page configs',
  // #18 crash guard exit-code tiers
  'page.logEngineMismatch':
    '[container] Dependency engine version mismatch (EBADENGINE); restarting is pointless, retries stopped',
  'page.logReclaimRetry':
    '[container] Exit code 78 (resource busy); stale process reclaimed and retried immediately, without burning the crash budget',
  // #20 over-budget tray badge
  'tray.tooltipResource': 'Desktop Console · a page is over its resource budget',
  // #21 network diagnostic wizard (step labels localized by the renderer via step.id)
  'net.proxyNone': 'No proxy environment variables detected',
  'net.reachable': 'Reachable ({ms}ms)',
  'net.unreachable': 'Unreachable: {err}'
}

/** Exported so tests can assert the two languages stay key-for-key in sync. */
export const dictionaries: Record<Locale, Dict> = { zh, en }

/** Injected at boot from the settings store — avoids importing it here (cycle). */
let localeSource: () => Locale | undefined = () => 'zh'

export function registerLocaleSource(fn: () => Locale | undefined): void {
  localeSource = fn
  cachedLocale = null // a (re)registered source is only meaningful if re-read
}

let cachedLocale: Locale | null = null

/** Drop the memoized locale so the next read hits the injected source again. */
export function invalidateLocaleCache(): void {
  cachedLocale = null
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
  invalidateLocaleCache() // settings just moved — the next read must see the new locale
  for (const fn of localeListeners) fn()
}

/** The language currently in effect (unknown/empty settings always mean Chinese). */
export function currentLocale(): Locale {
  if (cachedLocale === null) cachedLocale = localeSource() === 'en' ? 'en' : 'zh'
  return cachedLocale
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
