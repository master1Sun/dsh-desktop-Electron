# DSH Desktop Container

桌面端 Node 容器：内置 **Node v24.21.0**，托管 `pages/` 下的 web 项目（deepseek-harness、openclaw 等任意 node http 服务），主界面内嵌展示页面，支持配置持久化、任务栏常驻与 git 更新检测。

## 特性

- **自带运行时**：不依赖系统 node；`resources/node/` 内的 v24.21.0 由 `npm run setup:node` 从 npmmirror 下载。启动时自动校验版本。选 24.x 是为同时满足 openclaw（需 Node ≥24.16 <25）与 dsh（无 engines 上界）。
- **Page 生命周期**：每个 page 是一个内置 node 子进程（PATH 前置注入，page 内 `node/npm` 均走内置版本）；端口就绪探测、stdout/stderr 日志、托盘一键启停。
- **默认视图下拉**：设置页可选运行中的 page / 外部地址（含最近使用历史），主界面 `<webview>` 内嵌展示；外部地址可选"系统浏览器打开"。
- **配置持久化**：electron-store（userData/container-settings.json）。
- **最小化到任务栏**：点 ✕ 隐藏到托盘继续运行；托盘菜单可恢复窗口、启停各 page、彻底退出（退出前优雅终止全部 node 子进程，Windows 下 taskkill /T 杀进程树）。
- **git 更新检测**：容器自身 + pages 下各项目统一检测（ls-remote vs 本地 HEAD，5min 缓存），一键 `git pull --ff-only`，脏仓库自动跳过。
- **DSH 插件管理**：内置 `@deepseek-ai/dsh` CLI，可在设置页对某个 dsh profile 安装 / 卸载 / 更新插件（npm 或 git 通道），并把 profile 注册成一个可启停的页面在主界面内嵌打开。详见下文。
- **OpenClaw Gateway 托管**：随包自带最新版 `openclaw`（npm 全局安装到 `resources/openclaw/`），把它的 gateway 注册成一个可启停页面，运行后主界面内嵌打开 Control UI；配置目录默认跟随环境目录（安装目录下的 `env/openclaw`）。详见下文。
- **打开系统终端**：页面切换器、DSH 面板与「页面」面板都有「终端」按钮，点一下即在对应项目目录拉起一个真实控制台，PATH 已前置内置 node（和 pnpm），不再叠加容器自己的弹窗。
- **纯 CLI 项目整屏终端**：`kind: "terminal"` 的页面被选中时直接占满主区跑其启动命令，退出即返回，详见「Page 约定」。
- **内置插件市场工作台**：默认工作台就是渲染层内置的 DSH 插件市场静态页（`MarketView.vue`，顶部为工作台描述）——不注册 page、不占端口、不随启动运行，从「页面」面板安装插件项目。
- **启动即运行二件套**：新装实例的 `autoStartPages` 默认 `['openclaw','dsh-web']`（`src/main/store.ts` 的 DEFAULTS）。主进程 `PageRegistry.autoStart()` 启动 openclaw gateway 与 dsh-web；`autoStart()` 会跳过 `kind:"terminal"` 的页（由渲染层在 `App.vue` 挂载后交给 `CliTerminalView` 执行）。已装实例沿用自己持久化的设置，不会被覆盖。
- **内置页面随包分发**：`pages/` 经 extraResources 打进 `resources/pages`，首启由 `ensureBuiltinPages()`（仅 `app.isPackaged`）拷贝 dsh-web 到 userData/pages（openclaw 由 `ensureDefaultOpenclawPage()` 运行时生成），升级安装不丢；升级时还会自动清理已退役的 `pages/codex` 与 `pages/dsh-plugin-market` 目录及其设置残留。
- **顶部细菜单栏（单行）**：`视图 / Pages / 应用 / 关于 / 更新` 收进一条 ~38px 的菜单，点击弹出居中的浮层面板，不占用布局——内容区始终满高展示页面，内嵌 `<webview>` 不会因打开面板而卸载。页面切换器（下拉：状态点 + 端口 + 启停 ▶）与窗口控制按钮（重载 / 主题 / 分离 / 最小化 / 最大化 / 关闭）都在这一条里，分别拆为 `components/PageSwitcher.vue` 与 `components/WindowControls.vue`，`MenuBar.vue` 只保留分组与浮层协调。任意时刻只允许一个浮层 surface（下拉列表 / 面板 / 命令面板互斥）。详见下文。
- **崩溃自动恢复 + page 健康守护**：node 子进程在「已跑起来后」异常退出（非手动停止、非优雅退出）时，`PageRegistry` 按 2s / 5s / 15s 指数退避自动重启；一旦稳定运行 5 分钟则清零崩溃计数，超过退避上限则放弃并标红。手动 `stop()` 或从未启动成功的页不会被守护循环拉起（避免坏配置死循环）。状态经 `PageState.crashes` / `nextRestartAt` 上报，页面切换器的状态点 tooltip 会显示「已崩溃 N 次 / 正在自动重启」。可在设置页 `crashAutoRestart` 关闭。
- **定时静默更新检查**：主进程启动后 45s 做一次、之后每 30min 静默 `checkUpdates()`，结果经 `IPC.OnUpdateResults` 广播给各窗口刷新更新角标——只更新计数、不弹窗打扰；用户仍可在「更新」面板手动「立即检查」。
- **全局命令面板（Ctrl+K / Cmd+K）**：一个可模糊搜索的统一入口，聚合「切页 / 启停 / 打开终端 / 打开外部站点 / 进入各面板 / 重载 / 切主题 / 分离 / 开发者工具 / 检查更新」。方向键导航、Enter 执行、Esc 关闭；每个命令都复用顶栏同款处理函数，不重复逻辑。见 `components/CommandPalette.vue`。
- **打包后日志落盘**：无新依赖的 file logger（`src/main/logger.ts`）把主进程 console 镜像到 `userData/logs/main.log`（5MB 轮转），各 page 子进程输出写 `userData/logs/pages/<id>.log`；设置页可一键「打开日志目录」，弥补打包后无控制台的可观测性。
- **主题**：`auto / light / dark` 三态，容器界面跟随选择即时切换（`auto` 监听系统 `prefers-color-scheme`）；顶栏右侧图标一键在亮暗间循环。内嵌 page 的主题由该页面自身决定，不受容器影响。
- **开发者模式（F12）**：`F12` 开关容器界面自身的 DevTools（分离窗口）；顶栏上的调试按钮则针对当前内嵌页面，便于调试 page 的前端。

## 快速开始

```bash
npm install          # .npmrc 已配 npmmirror（含 electron 二进制镜像）
npm run setup:node   # 下载内置 Node v24.21.0 → resources/node/
npm run ensure:pages # 清理退役 page 目录（codex / dsh-plugin-market / example-page）并准备 pages/
npm run dev          # 开发模式
```

DSH 插件市场是**渲染层内置静态页**（`src/renderer/src/views/MarketView.vue`，默认工作台直接展示它），不再生成 `pages/dsh-plugin-market` node 服务页，也就不占 8889 端口；`ensure:pages` 仅负责清理旧版本遗留的生成页目录。

## Page 约定

在 `pages/<id>/container.json` 声明：

```json
{
  "name": "My Page",
  "description": { "zh": "我的页面", "en": "My page" },
  "port": 3000,
  "startCommand": "node server.js"
}
```

- **文案可双语**：`name` / `description` / `envVars[].label` / `envVars[].description` 都接受两种写法——**纯字符串**（对所有语言生效，老清单原样可用）或 **`{ "zh": "…", "en": "…" }`** 对象。主进程 `readPageMeta()` 在**过 IPC 之前**就用 `resolveText()` 按当前语言拍平成纯字符串，所以渲染层、托盘、更新检测拿到的永远是 `string`，下游无需知道 locale 的存在；对象里缺当前语言时回退到另一种语言，再回退到调用方给的默认值，空串按「未设置」处理。
- `startCommand` 缺省时按 `server.js` → `index.js` → `package.json#scripts.start` 推断。
- 纯外链项目设 `"external": true, "externalUrl": "https://..."`（不拉进程，直接内嵌/外开）。
- **纯 CLI 项目（终端型）**：`container.json` 设 `"kind": "terminal"` 并给出 `startCommand`（没有 HTTP 页面的 CLI 项目）。此类项目**不需要 port**，选中它时主区整屏变成一个内嵌终端，直接跑该启动命令（PATH 已前置内置 node/pnpm，envVars 照常注入）；顶栏在终端态把「重载/调试」换成「重新运行」按钮，进程退出后浮层也提供「重新运行 / 返回工作台」。
- 安装方式：设置页「Pages 管理」→ git URL 克隆 / 本地目录复制。
- **端口自定义**：导入表单可填端口（留空则沿用项目 `container.json` 声明值），已安装项目在列表点「改端口」随时调整（填 `0` 恢复项目声明值）。覆盖值存在容器设置 `pagePorts`（按 pageId 索引），**不改写项目自己的 `container.json`**，因此更新/重克隆项目不会丢配置；注入子进程的 `PORT` 与就绪探测都用覆盖后的端口，改动在下次启动生效。dsh / openclaw 项目同样适用。

## DSH 插件管理

容器随包安装了 `@deepseek-ai/dsh`（DeepSeek Harness CLI），设置页「DSH 插件管理」卡片直接驱动它的 `dsh plugin` 子命令：

```bash
node node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --host 127.0.0.1 --port 8899 --no-open
node node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile web add @someorg/dsh-some-plugin
```

- **profile 模型**：一个 profile 是 `<DSH Home>/profiles/<name>` 目录，内含 `package.json`（out-of-tree 插件依赖 + `dsh.profile.bundles` 层栈）。dsh 自带 `web / acp / headless / sdk` 模板，首次使用时由 dsh 自身初始化——容器不会伪造这些目录。
- **DSH Home（容器）**：默认使用 dsh CLI 自己的 `~/.dsh`，与终端里的 dsh 共用同一套 profile。设置页「环境目录 → DSH 配置目录」可切换到任意独立目录（`~` 会展开）。
- **安装 / 卸载 / 更新**：npm 通道走 `pnpm add|remove|update`；git 通道先 `git ls-remote <url> HEAD` 取远端 sha，再以 `<url>#<sha>` 重装，因此"更新到最新提交"是可复现的。
- **pnpm 随包托管**：`dsh plugin` 转发给 PATH 上的 `pnpm`。`npm run setup:dsh` 会把 pnpm（latest）与 dsh 装进同一个 prefix（`resources/dsh/`），容器探测该目录并前置进 PATH，因此零宿主前置条件。**Windows 陷阱**：pnpm v12 包内 `pnpm/pn/pnpx/pnx`（无扩展名）只是 Node shebang 占位文件，原生 `pnpm.exe` 由其 preinstall 从可选依赖 `@pnpm/exe.win32-x64` 硬链过来——而 `--ignore-scripts` 跳过了这一步，npm 生成的根 `pnpm.cmd` 直接 exec 占位文件时 CreateProcess 无法解析 → "不是内部或外部命令"。修复分两层：setup-dsh.mjs 与运行时自升级（`repairPnpmCmd`）先重链原生 exe 覆盖占位文件；若主机缺该可选包，则兜底把 `pnpm.cmd` 重写为「node 直跑 `bin/pnpm.mjs`」。系统全局 pnpm 仍作兜底探测（`npm prefix -g`）。
- **在容器中打开 web UI**：点「把当前 profile 加入我的页面」会在 `pages/dsh-<profile>/container.json` 写入 `{"kind":"dsh","dsh":{"profile":"web","port":5173}}`（只写清单，不复制 profile）。启动后容器解析 dsh 打印的就绪行 `dsh web: http://127.0.0.1:<port>/?token=…`，把这个带 token 的 URL 交给 `<webview>` —— 裸端口会 401。

> ⚠️ `@deepseek-ai/dsh@0.1.6-alpha.1` 无法运行：它声明 `@deepseek-ai/dsh-app-boot: ^0.1.6-alpha.1`，该范围会解析到 alpha.2，而 alpha.2 移除了 `watchUserPatches` 导出，CLI 一启动即抛 `SyntaxError`。本项目固定使用 registry 的 `alpha` 标签版本（当前 `0.1.6-alpha.2`）。

## OpenClaw Gateway

openclaw 是多渠道 AI 网关，npm 包 `openclaw`（本项目自带 latest）。它按 dsh 的同款方式**完整托管**：注册为一个 page、可启停、开终端、内嵌 Control UI。

- **自带安装**：`npm run setup:openclaw` 用内置 node 跑 `npm install -g openclaw@latest --ignore-scripts`，`npm_config_prefix` 指向 `resources/openclaw`，实际入口是 `resources/openclaw/node_modules/openclaw/openclaw.mjs`，随安装包一起分发（`electron-builder.yml` 的 extraResources）。openclaw 有 postinstall 生命周期脚本，故强制 `--ignore-scripts`。**构建期自动 provision**：`npm run build` 经 `prebuild` 钩子触发本脚本，且幂等——已存在入口即跳过（`--force` 或 `DSH_OPENCLAW_FORCE=1` 强制刷新以拉新版），因此这棵 ~537MB 目录与 `resources/node/` 一样列入 `.gitignore`、不进版本库，只在打包时现取。
- **运行时要求**：openclaw 声明 `engines >=24.16.0 <25 || >=26.1.0`，dsh 无上限。这是把内置 Node 升到 `v24.21.0` 的直接原因——一个版本同时满足两者。启动时容器始终用**内置 node** 直接跑 `.mjs` 入口，而不是 npm 的 `.cmd` shim（后者会回退到 PATH 上第一个 `node.exe`，可能是更旧的系统 node），因此不依赖 shell、路径含空格也安全。
- **配置 home**：默认使用 openclaw CLI 自己的 `~/.openclaw`（JSON5 的 `openclaw.json`），与终端里的 openclaw 共用同一套配置。设置页「环境目录 → OPENCLAW 配置目录」可改；主进程把 `OPENCLAW_STATE_DIR` 注入 spawn 环境。
- **page 形态**：`pages/openclaw/container.json` 写入 `{"kind":"openclaw","openclaw":{"port":18789}}`。启动命令是 `<内置node> openclaw.mjs gateway run --force --port <p>`——`gateway` 是命令组，裸跑只打印帮助、永不监听，必须用前台子命令 `gateway run`；`--force` 清掉端口上的残留进程以便重启即起。就绪后 Control UI 在 `http://127.0.0.1:<port>`，端口轮询沿用非 dsh 路径，但 openclaw 首次启动会自装 provider 插件并跑状态迁移（约 30s+ 才 LISTEN），故其就绪超时放宽到 ~120s（`DSH_OPENCLAW_READY_TIMEOUT_MS`）。
- **免交互启动**：openclaw 在无配置时会拒绝起网关（提示 `Run openclaw setup or set gateway.mode=local`）。容器在首次启动前，若 `~/.openclaw/openclaw.json` 不存在则写入一份最小 `{gateway:{mode:"local"}}`（绝不覆盖用户已有文件），从而开箱即用。
- **认证说明**：网关默认开启 auth，但无 token 时会自动生成一个运行时 token 并**配对本地 CLI 设备**，实测 Control UI 根路径 `/` 与 `/health` 直接返回 200，无需手动换 token。频道/模型仍需用户自行 `openclaw onboard` 配置；面板已放了对应提示。

## 环境目录

内置运行时的配置目录默认各自独立，自定义 page 的数据目录则统一挂在「环境根目录」下：

| 运行时   | 默认目录       |
| -------- | -------------- |
| dsh      | `~/.dsh`       |
| openclaw | `~/.openclaw`  |

- **dsh / openclaw**：默认直接用 CLI 自己的 home（与终端共用同一套 profile / 配置）；设置页「环境目录 → DSH / OPENCLAW 配置目录」可单独改到任意路径（`~` 会展开）。
- **环境根目录**：未显式配置时 = `<安装目录>/env`；安装目录不可写（如 `C:\Program Files`）时回退到 `userData/env`。container.json 的 `envVars.defaultPath` 里的 `{envRoot}` 占位符指向它，因此它只影响声明了 `{envRoot}` 的自定义 page，不影响 dsh / openclaw 的默认 home。

## 内置终端

`container:open-terminal` 接受四种目标：page id、`container`（容器自身项目目录）、`dsh:<profile>`（该 profile 在 DSH Home 下的目录）、`openclaw`（OpenClaw Home，默认 `~/.openclaw`）。主进程解析出绝对路径后开一个系统控制台（Windows `powershell.exe -NoExit`，Linux 依次尝试 gnome-terminal / konsole / xfce4-terminal / xterm），执行两行环境准备：`cd <dir>` 与把内置 node 目录（以及 pnpm 目录）前置到 PATH。

- **为什么走 `-EncodedCommand`**：项目路径由用户安装决定，可能含引号或空格。启动脚本被 base64(UTF-16LE) 后交给 PowerShell，而不是拼进命令行，因此路径无法截断 `cd` 语句形成命令注入。
- **直接开系统终端，不再弹窗**：点「终端」即拉起一个真实控制台并停在目标目录、PATH 已就绪，容器不再叠加自己的「终端环境」对话框（此前那层弹窗只是把同样两行命令再展示一遍，属冗余）。目录尚不存在时会跳过 `cd`。
- **nodeDir 来自运行时发现**：与 page 启停共用 `getNodeExePath()`，避免把系统 node 当成内置版本。

## 顶部菜单栏与开发者模式

界面只分两个模块：**顶部 chrome** + **内容区**（满高展示当前页面）。两条 ~34px 的栏都贴顶、通栏、无卡片间距，视觉上收进同一条顶部区域。

第一条是细菜单（`components/MenuBar.vue`）：鲸鱼 logo + `视图 / Pages / DSH / OpenClaw / 更新 / 帮助`，右侧仅留一个「N 运行中」小指示与主题切换。原先占据左右两块的运行胶囊、更新徽章、F12 按钮、工作台/设置切换按钮全部收进菜单。

第二条是页面标签栏（`components/PageTabs.vue`）：左侧页面下拉选择器列出所有 page（状态点、DSH 徽标、端口/pid，hover 出启停与自动启动按钮），并含外部地址与最近使用；中部显示当前标题/URL；右侧四个按钮——重载、调试内嵌页、打开终端、系统浏览器打开。主界面 `HomeView.vue` 因此只剩内容容器：有 URL 时渲染 `<webview>`，否则渲染内置插件市场工作台（`MarketView.vue`，即默认视图）。

- **主题跟随**：Electron 渲染进程的 `matchMedia('(prefers-color-scheme)')` 在 Windows 上不可靠，所以 OS 明暗改由主进程 `nativeTheme.shouldUseDarkColors` 提供，经 `container:get-native-theme` 初值 + `container:native-theme` 事件推给渲染层。App.vue 用响应式 `isDark` ref 驱动 shell chrome 的 `.light` 类与切换按钮图标；`watchEffect(applyTheme)` 让 light/dark/auto 三态即时生效。dsh 内嵌页只在 OS 为暗色时通过启动 URL 追加 `?theme=dark` 跟随（OS 亮色则不加参数、保持 dsh 默认）。

- **浮层面板**：点菜单项在条目下方弹出面板（`position: fixed`），不占布局，因此内容区始终满高、内嵌 `<webview>` 不会被卸载；点面板外任意处或按 Esc 收起，再点同一项也可关闭。
- **各面板内容**：`视图` = 默认视图 / 外部地址 / 打开方式 / 主题 / 任务栏行为 / DSH Home / OpenClaw Home（`SettingsPanel.vue`）；`Pages`、`DSH`、`OpenClaw` 分别复用 `PageManager`、`DshManager`、`OpenclawManager`；`更新` 是版本检测表格（标题上的角标显示待更新数，取代了原 UpdateBadge）；`帮助` 展示内置 Node 版本与路径、运行数和使用提示。
- 应用不再依赖 `vue-router`，页面切换只是面板开合与 webview 换 src。

开发者模式分两个作用域，都走 `container:toggle-devtools`：

- `F12` → 容器自身界面（shell）的 DevTools，分离窗口，再次触发即关闭。
- 页面标签栏按钮 → 当前内嵌 page 的 DevTools，通过 `<webview>.getWebContentsId()` 把 guest 的 webContents id 传给主进程后用 `webContents.fromId()` 定位。仅在有活动 page 时出现（外部地址不由 webview 渲染）。

## 脚本

| 命令                                                  | 说明                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                         | electron-vite 开发                                                                                                                             |
| `npm run build`                                       | typecheck + 打包渲染层/主进程/preload                                                                                                          |
| `npm run build:win`                                   | electron-builder NSIS 安装包（内置 node 经 extraResources 随包分发）                                                                           |
| `npm test`                                            | vitest（page 生命周期真进程测试 + git 检测 fixture 测试 + dsh 插件管理真实 CLI 测试 + 终端命令生成）                                           |
| `E2E_DSH_BOOT=1 npx vitest run test/dsh.boot.test.ts` | 真启动一个 dsh web profile，验证端口发现与带 token 的 URL                                                                                      |
| `npm run setup:node`                                  | 下载解压内置 Node                                                                                                                              |
| `npm run setup:openclaw`                              | 用内置 node 把 openclaw（latest）装进 `resources/openclaw`，随包分发；幂等（已装即跳过，`--force` 刷新），`npm run build` 经 prebuild 自动触发 |
| `npm run setup:dsh`                                   | 用内置 node 把 dsh（alpha）+ pnpm（latest）装进 `resources/dsh`，随包分发；同样幂等 + prebuild 自动触发，并修复 pnpm 的 Windows shim           |
| `node tools/build-icon.cjs <source.png> [shrink]`     | 由鲸鱼源图重绘图标：裁掉水印带→居中取方→缩放，产出 `resources/icon.png` 与手工组装的 `build/icon.ico`（PNG-in-ICO，7 个尺寸）                  |

## 已知限制

- 应用图标由生成的鲸鱼源图经 `tools/build-icon.cjs` 产出；`tools/render-icon.ps1` / `gen-icon.cjs` 是早期的 emoji(GDI TextRenderer，单色轮廓) 方案，仅作保留。
- Windows 终端用 `powershell.exe`（WinPS 5.1 与 PowerShell 7 均可），不依赖 Windows Terminal 是否安装。
- `git clone` 安装依赖系统 git 与网络（npmmirror 无法代理 git 协议）。
- 打包后 `pages/` 迁移到 userData 目录，升级安装不丢已装项目。

## 打包注意事项（易踩坑）

- **`extraResources` 必须整棵 `resources/` 一起拷**：electron-builder 的 filter（`app-builder-lib/out/util/filter.js` 的 `createFilter`）会**主动丢弃拷贝源的根 `node_modules`**（`if (relative === "node_modules") return false`）。若写成 `from: resources/dsh, to: dsh`，相对路径正好是 `node_modules` → 整目录被跳过，安装包里只剩 `.cmd` shim 与 `.npmrc`，运行时必然找不到 CLI。正确写法是 `from: resources, to: .`，此时相对路径变成 `dsh/node_modules`，会被保留。
- **打包后务必核对入口文件**：`dist/win-unpacked/resources/<runtime>/node_modules/...` 下应能找到真实入口（`openclaw.mjs`、`@deepseek-ai/dsh/lib/bin.js`、`node/node_modules/npm/bin/npm-cli.js`）。某个 runtime 目录只有 4 个文件 / 0.0MB 就是上面那条坑复发了。
- **`resources/**` 不进 app.asar**：`files` 里加了 `!resources/**`，否则同一棵树会同时被打进 `app.asar`、被 `asarUnpack` 再解一遍、又被 extraResources 拷一遍（实测三份合计 >1GB）。运行时解析一律走 `process.resourcesPath`，`app.getPath()/resources/...` 只是 dev 兜底，所以排除是安全的。
- **`openclaw` 与 `@deepseek-ai/dsh` 放在 devDependencies**：容器自带的是 `resources/` 里的 provisioned 副本，`src/` 从不 import 这两个包；若留在 `dependencies`，electron-builder 会把项目 `node_modules` 里那两份（363MB + 208MB，另加它们的传递依赖）一起塞进 `app.asar`，纯属重复。
- 本机构建往往要绕开 `npm run`（沙箱里 npm 会去拉 `wsl.exe`）：直接 `node node_modules/electron-vite/bin/electron-vite.js build`、`node node_modules/electron-builder/cli.js --win --x64 --publish never --config.electronDist=<abs node_modules/electron/dist>`。产物 ~1.5GB，`dist/` 请先用 `cmd /c rmdir /s /q dist` 删除（Node 的 `fs.rm` 在数万文件的大目录上会无限阻塞）。
