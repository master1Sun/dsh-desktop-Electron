# Desktop Container

桌面端 Node 容器：托管 `pages/` 下的 node web 项目并在主界面内嵌展示，支持配置持久化、任务栏常驻与 git 更新检测。运行时（Node / dsh / openclaw）首启按需下载到 userData，安装包保持瘦小。

## 能力

- **运行时按需下载**：Node / dsh / openclaw 不内置，首启下载到 userData。
- **Page 生命周期**：每个 page 是内置 node 子进程，端口就绪探测、日志采集、一键启停。
- **内嵌展示**：主界面内嵌运行中的 page 或外部地址（可选系统浏览器打开）。
- **配置持久化**：设置存 userData，升级安装不丢已装项目。
- **任务栏常驻**：点 ✕ 隐藏到托盘继续运行，托盘可恢复窗口 / 启停各页 / 退出。
- **git 更新检测**：容器与 pages 统一检测，一键 `git pull --ff-only`，脏仓库自动跳过。
- **DSH 插件管理**：对 dsh profile 安装 / 卸载 / 更新插件，并把 profile 作为页面内嵌打开。
- **OpenClaw 网关托管**：按需下载 openclaw，注册为可启停页面，内嵌 Control UI。
- **内置终端**：在对应项目目录拉起系统控制台，PATH 已前置内置 node / pnpm。
- **纯 CLI 项目**：`kind:"terminal"` 页面整屏跑启动命令，退出即返回。
- **崩溃自动恢复**：子进程异常退出按指数退避自动重启，可在设置页关闭。
- **定时静默更新检查**：后台周期检测，仅刷新角标不弹窗。
- **全局命令面板**（Ctrl / Cmd + K）：切页 / 启停 / 终端 / 面板 / 主题 / 检查更新等统一入口。
- **主题**：auto / light / dark，容器界面即时切换。
- **打包日志落盘**：主进程与各 page 输出写 userData/logs，可一键打开。
- **环境目录**：dsh / openclaw 默认各自 home，可在设置页改到任意目录。
- **开发者模式**：F12 调试容器界面，工具条按钮调试当前内嵌页。

## 快速开始

```bash
npm install
npm run setup:node    # 预置内置 Node（可选，运行时也会自动下载）
npm run ensure:pages  # 清理退役页目录并准备 pages/
npm run dev
```

## Page 约定

在 `pages/<id>/container.json` 声明，**所有字段可省略**（按默认值推断）：

```json
{
  "name": "My Page",
  "description": { "zh": "我的页面", "en": "My page" },
  "port": 3000,
  "startCommand": "node server.js"
}
```

机器可读 schema 见 [`pages/container.schema.json`](pages/container.schema.json)。

| 字段 | 说明 |
| --- | --- |
| `name` / `description` | 标题 / 说明，支持 `{zh,en}` 双语；`name` 缺省用目录名。 |
| `author` / `version` / `icon` | 展示用元信息与图标（`data:` URL 或相对页面目录的图片）。 |
| `kind` | `page`（默认）/ `dsh` / `openclaw` / `terminal`。 |
| `port` / `startCommand` | 服务端口与启动命令；缺省按 `server.js` → `index.js` → `npm start` 推断。 |
| `external` / `externalUrl` | 外链页：不拉进程，直接内嵌该地址。 |
| `healthUrl` | 假死探测地址，连续失败判定 hung 并重启一次。 |
| `dependsOn` | 需要先启动的 page id。 |
| `envVars` | 注入子进程的环境变量（`key` / `label` / `type: dir|text` / `defaultPath` 等）。 |
| `permissions` | 能力声明（`notify` / `downloads` / `externalShell`），当前仅展示不拦截。 |

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | electron-vite 开发 |
| `npm run build` | typecheck + 打包渲染层 / 主进程 / preload |
| `npm run build:win` | electron-builder NSIS 安装包 |
| `npm test` | vitest 单元 + UI 测试 |
| `npm run setup:node` | 下载内置 Node |
| `npm run setup:dsh` / `setup:openclaw` | dev 兜底预置 dsh / openclaw |
