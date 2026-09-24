import electron, { app as app$1, Notification, shell as shell$1, nativeTheme, BrowserWindow, net, screen, ipcMain as ipcMain$1, dialog, webContents, session, nativeImage, Tray, Menu } from "electron";
import * as fs from "node:fs";
import fs__default, { existsSync, mkdirSync, readdirSync, appendFileSync, statSync, renameSync, openSync, readSync, closeSync, watch, readFileSync, unlinkSync, writeFileSync as writeFileSync$1, rmSync, cpSync, createWriteStream, createReadStream, promises, copyFileSync } from "node:fs";
import path, { join, delimiter, extname, basename, dirname, sep } from "node:path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { EventEmitter, once } from "node:events";
import { spawn, execFile, execFileSync, spawnSync } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { get as get$2, createServer as createServer$1 } from "node:http";
import { get as get$1 } from "node:https";
import * as os from "node:os";
import os__default, { homedir as homedir$1 } from "node:os";
import process$1 from "node:process";
import { promisify, isDeepStrictEqual } from "node:util";
import crypto, { randomBytes, createHash } from "node:crypto";
import assert from "node:assert";
import { Transform } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as pty from "node-pty";
import { pipeline } from "node:stream/promises";
import { simpleGit } from "simple-git";
import { join as join$1 } from "path";
import { copyFile, readdir, stat } from "node:fs/promises";
import { createSocket } from "node:dgram";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const CONTAINER_REPO_URL = "https://github.com/master1Sun/dsh-desktop-Electron.git";
const DISPLAY_TIME_ZONE = "Asia/Shanghai";
const REGISTRY_CANDIDATES = [
  {
    id: "npmmirror",
    url: "https://registry.npmmirror.com",
    label: { zh: "npmmirror（国内默认）", en: "npmmirror (built-in default)" },
    builtin: true
  },
  { id: "npm", url: "https://registry.npmjs.org", label: { zh: "npm 官方", en: "npm official" } },
  {
    id: "tencent",
    url: "https://mirrors.cloud.tencent.com/npm",
    label: { zh: "腾讯云", en: "Tencent Cloud" }
  },
  {
    id: "huawei",
    url: "https://repo.huaweicloud.com/repository/npm",
    label: { zh: "华为云", en: "Huawei Cloud" }
  }
];
const NPM_REGISTRY_DEFAULT = REGISTRY_CANDIDATES[0].url;
const OPENCLAW_DEFAULT_PORT = 18789;
const DEFAULT_KEYBINDINGS = {
  palette: "Ctrl+K",
  devtools: "F12",
  terminal: "Ctrl+`",
  closePanel: "Esc",
  popoutCurrent: "Ctrl+Shift+Enter",
  eventsTimeline: ""
};
const IPC = {
  GetNodeInfo: "container:get-node-info",
  ListPages: "container:list-pages",
  StartPage: "container:start-page",
  StopPage: "container:stop-page",
  RestartPage: "container:restart-page",
  GetPageLogs: "container:get-page-logs",
  InstallPageFromGit: "container:install-page-git",
  InstallPageFromDir: "container:install-page-dir",
  /** install a published npm CLI package (with a bin) as a terminal page */
  InstallPageFromNpm: "container:install-page-npm",
  /** judge an import source before downloading (ImportPreflight) to gate the import UI */
  PreflightImport: "container:import-preflight",
  ChooseDirectory: "container:choose-directory",
  RemovePage: "container:remove-page",
  /** switch a built-in dsh/openclaw page off/on (disabled = hidden from switcher, never starts) */
  SetPageDisabled: "container:set-page-disabled",
  /** restore a builtin page's userData copy from the bundled seed (user broke its files) */
  ResetBuiltinPage: "container:reset-builtin-page",
  SetPagePort: "container:set-page-port",
  /** #4: override a page's container.json dependsOn (pageDeps map) without editing its file */
  SetPageDeps: "container:set-page-deps",
  OpenPageExternal: "container:open-page-external",
  GetSettings: "container:get-settings",
  UpdateSettings: "container:update-settings",
  EnvRoot: "container:env-root",
  /** resolved webview download folder + the OS default it falls back to (DownloadDirInfo) */
  DownloadDir: "container:download-dir",
  CheckUpdates: "container:check-updates",
  PerformUpdate: "container:perform-update",
  /** list Node versions eligible to replace the bundled runtime (NodeVersionInfo[]) */
  ListNodeVersions: "container:list-node-versions",
  /** download + install one Node runtime over the bundled one; streams OnNodeUpdateProgress */
  UpdateNodeRuntime: "container:update-node-runtime",
  /** drop the updated runtime and fall back to the installer-shipped bundled one */
  RestoreBundledNode: "container:restore-bundled-node",
  /** install/upgrade a built-in agent runtime (dsh / openclaw) with the bundled npm (BuiltinKind) */
  ProvisionBuiltin: "container:provision-builtin",
  /** stream: live progress of an in-flight bundled-Node update (UpdateProgress) */
  OnNodeUpdateProgress: "container:node-update-progress",
  /** broadcast: live progress of an in-flight update download (UpdateProgress) */
  OnUpdateProgress: "container:update-progress",
  /** broadcast: per-page startup progress while a page is 'starting' (PageProgress) */
  OnPageProgress: "container:page-progress",
  /** stream: import progress (git clone / local copy) back to the requesting window (InstallProgress) */
  OnInstallProgress: "container:install-progress",
  /** broadcast: silent background update-check results (UpdateCheckResult[]) — badge-only, never a popup */
  OnUpdateResults: "container:update-results",
  /** open userData/logs in the OS file manager (field debugging: packaged apps have no stderr) */
  OpenLogsDir: "container:open-logs-dir",
  /** relaunch the app after the container updated its own source from git */
  RelaunchApp: "container:relaunch-app",
  ShowWindow: "container:show-window",
  QuitApp: "container:quit-app",
  /** push: main asks the renderer to show a horizontal quit-confirm dialog */
  OnQuitConfirm: "container:quit-confirm",
  OnStateChanged: "container:state-changed",
  DshStatus: "dsh:status",
  DshListPlugins: "dsh:list-plugins",
  DshPluginUpdates: "dsh:plugin-updates",
  DshInstallPlugin: "dsh:install-plugin",
  DshUninstallPlugin: "dsh:uninstall-plugin",
  DshUpdatePlugin: "dsh:update-plugin",
  DshUpdateAll: "dsh:update-all",
  /** broadcast: in-flight dsh plugin ops (DshPluginOpEvent) → window top progress bar */
  OnDshPluginOp: "dsh:plugin-op",
  DshCreatePage: "dsh:create-page",
  DshToken: "dsh:token",
  OpenclawStatus: "openclaw:status",
  OpenclawCreatePage: "openclaw:create-page",
  OpenclawToken: "openclaw:token",
  /** one-click: generate & persist a gateway token (rotate when the arg is true) */
  OpenclawInitToken: "openclaw:init-token",
  ToggleDevTools: "container:toggle-devtools",
  GetNativeTheme: "container:get-native-theme",
  OnNativeTheme: "container:native-theme",
  SetNativeTheme: "container:set-native-theme",
  MinimizeWindow: "container:minimize-window",
  ToggleMaximize: "container:toggle-maximize",
  CloseWindow: "container:close-window",
  GetIsMaximized: "container:get-is-maximized",
  OnMaximizedChanged: "container:maximized-changed",
  PtyStart: "container:pty-start",
  PtyShells: "container:pty-shells",
  PageRunSpec: "container:page-run-spec",
  PtyWrite: "container:pty-write",
  PtyResize: "container:pty-resize",
  PtyKill: "container:pty-kill",
  OnPtyData: "container:pty-data",
  OnPtyExit: "container:pty-exit",
  /** broadcast: a secondary window asks every window to switch to that CLI page's terminal */
  OpenTerminalPage: "container:open-terminal-page",
  /** broadcast: live progress of a file download inside an embedded webview (DownloadProgress) */
  OnDownloadProgress: "container:download-progress",
  /** list readable log files (main + per-page tails) for the in-app viewer (LogFileInfo[]) */
  ListLogFiles: "container:list-log-files",
  /** read the tail of one log file, optionally filtered (ReadLogsArgs → LogReadResult) */
  ReadLogs: "container:read-logs",
  /** collect versions/settings/logs summary into a zip via a save dialog; resolves the path */
  ExportDiagnostics: "container:export-diagnostics",
  /** taskkill the foreign process LISTENING on that port (port-conflict quick fix) */
  KillPortHolder: "container:kill-port-holder",
  /** swap the pre-update app.asar.bak back in and relaunch (one-level OTA rollback) */
  RollbackAsar: "container:rollback-asar",
  /** #15: bundle pages manifest + per-page container.json + settings into an importable zip */
  ExportSnapshot: "container:export-snapshot",
  /** #15: restore from a snapshot zip chosen via open dialog */
  ImportSnapshot: "container:import-snapshot",
  /** #21: one-shot network reachability probe (connectivity / proxy / registry mirrors) */
  RunNetworkProbe: "container:run-network-probe",
  /** #17: read the OTA update-meta history for the container row */
  GetUpdateHistory: "container:get-update-history",
  /** #20: on-demand CPU/RAM sample for currently running pages (PageMetrics[]) */
  GetPageMetrics: "container:get-page-metrics",
  /** system + runtime overview for the help panel's 关于与运行 tab (SystemInfo) */
  GetSystemInfo: "container:get-system-info",
  /** live network interfaces + cumulative byte counters for the help panel (NetworkStats) */
  GetNetworkStats: "container:get-network-stats",
  /** broadcast: #20 periodic CPU/RAM sample for running pages (PageMetrics[]) */
  OnPageMetrics: "container:page-metrics",
  /** broadcast: top-bar live network sample (NetSample) — rates + latency + online ports */
  OnNetSample: "container:net-sample",
  /** broadcast: #22 tailed lines appended to a log file since the last tick (LogLineEvent) */
  OnLogLine: "container:log-line",
  /** #26: probe every candidate npm registry in parallel → RegistryProbe[] */
  ProbeRegistries: "container:probe-registries",
  /** #26: what the embedded webviews hold (cookies per domain, cache + storage bytes) → WebDataReport */
  GetWebData: "container:get-web-data",
  /** #26: wipe cache / cookies (optionally one domain) / storage / everything (WebDataClearArgs) */
  ClearWebData: "container:clear-web-data",
  /** #8: recursive disk-usage breakdown of userData/pages/envRoot/logs/workspace/… → DiskReport */
  GetDiskReport: "container:get-disk-report",
  /** #8: wipe one allowlisted disk scope ('webcache' | 'logs') → DiskReport */
  ClearDiskScope: "container:clear-disk-scope",
  /** activity timeline: read filtered events from logs/events.jsonl (ListEventsArgs → ContainerEvent[]) */
  ListEvents: "container:list-events",
  /** broadcast: one new activity-timeline event (ContainerEvent) */
  OnEvent: "container:event",
  /** #20 follow-up: retained CPU/RAM history per running page → Record<pageId, PageMetrics[]> */
  GetMetricsHistory: "container:get-metrics-history",
  /** open a hosted page in its own top-level window (pageId) — shares the embedded-page session */
  OpenPageWindow: "container:open-page-window",
  /** is a TCP port free on 127.0.0.1? → { free, holder? } so the config dialog can warn up front */
  CheckPortFree: "container:check-port-free",
  /** broadcast: a rebindable shortcut was pressed *inside* a hosted webview, so the shell window
   *  that owns the action runs it (HotkeySignal). The guest consumed nothing back. */
  OnHotkey: "container:hotkey",
  /** MCP hub: live state of every registered server → McpServerState[] */
  McpListServers: "container:mcp-list-servers",
  /** MCP hub: add or update one spec (id wins over an existing row) → McpServerState[] */
  McpSaveServer: "container:mcp-save-server",
  /** MCP hub: disconnect (when live) and drop one server spec */
  McpRemoveServer: "container:mcp-remove-server",
  /** MCP hub: open the stdio connection for one server */
  McpConnect: "container:mcp-connect",
  /** MCP hub: close the stdio connection for one server */
  McpDisconnect: "container:mcp-disconnect",
  /** MCP hub: aggregated tool catalog, optionally for one server → McpToolInfo[] */
  McpListTools: "container:mcp-list-tools",
  /** MCP hub: invoke one tool and await its result (McpCallToolArgs → McpCallToolResult) */
  McpCallTool: "container:mcp-call-tool",
  /** broadcast: hub server states changed (McpServerState[]) */
  OnMcpStateChanged: "container:mcp-state-changed",
  /** broadcast: the hub's recent tool-call feed changed (McpCallEvent[], newest last) */
  OnMcpCalls: "container:mcp-calls",
  /** MCP hub: cold-read the buffered tool-call feed → McpCallEvent[] */
  GetMcpCalls: "container:mcp-get-calls",
  /** MCP bridge: where the agent-facing catalog/config exports live → McpBridgeInfo */
  McpBridgeInfo: "container:mcp-bridge-info",
  /** #11: connection info for the container's OWN MCP server (gated) → ContainerMcpInfo */
  GetContainerMcpInfo: "container:get-container-mcp-info",
  /** MCP built-in packages: on-disk provisioning state of userData/mcp → McpPkgStatus[] */
  McpPackagesStatus: "container:mcp-packages-status",
  /** shared workspace: read the container-owned context + its locations → WorkspaceInfo */
  WorkspaceGet: "container:workspace-get",
  /** shared workspace: persist a partial edit ({ task?, notes? }) → WorkspaceContext */
  WorkspaceSave: "container:workspace-save",
  /** shared workspace: push the current task to running agents (bump revision + log a note) → WorkspaceContext */
  WorkspaceBroadcast: "container:workspace-broadcast",
  /**
   * route one renderer toast to the OS notification center (ToastLevel + text). The renderer
   * suppresses its in-app corner toast and calls this only while `systemNotifications` is on;
   * resolves false when the platform can't notify, so the renderer falls back to the toast.
   */
  ShowSystemToast: "container:show-system-toast"
};
let cached = null;
function invalidateNodeRuntimeCache() {
  cached = null;
}
function overrideNodeDir() {
  return join(app$1.getPath("userData"), "node");
}
function nodeVersionUsable(v) {
  if (!v) return false;
  const m2 = /v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m2) return false;
  const maj = Number(m2[1]);
  const min = Number(m2[2]);
  return maj === 24 && min >= 16 || maj > 25;
}
function candidateDirs() {
  const dirs = [];
  if (process.env.DSH_NODE_DIR) dirs.push(process.env.DSH_NODE_DIR);
  dirs.push(overrideNodeDir());
  dirs.push(join(process.resourcesPath || "", "node"));
  dirs.push(join(app$1.getAppPath(), "resources", "node"));
  dirs.push(join(process.cwd(), "resources", "node"));
  return dirs.filter(Boolean);
}
function getNodeExePath() {
  const exe = process.platform === "win32" ? "node.exe" : "node";
  if (process.env.DSH_NODE_PATH && !candidateDirs().some((d) => existsSync(join(d, exe))))
    return process.env.DSH_NODE_PATH;
  for (const dir of candidateDirs()) {
    const p = join(dir, exe);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Bundled Node runtime not found. Run "npm run setup:node" first. Searched: ${candidateDirs().join(", ")}`
  );
}
function resolveDshNodeExePath() {
  const pinned = (process.env.DSH_NODE_PATH || "").trim();
  if (pinned && !candidateDirs().some((d) => existsSync(join(d, exeName())))) return pinned;
  const sys = whichOnPATH(exeName());
  if (sys) return sys;
  return getNodeExePath();
}
function exeName() {
  return process.platform === "win32" ? "node.exe" : "node";
}
function whichOnPATH(cmd) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".CMD;.EXE;.BAT;.COM").split(";").map((e) => e.toLowerCase()) : [""];
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
async function getNodeRuntimeInfo(refresh = false) {
  if (cached && !refresh) return cached;
  let path2 = "";
  try {
    path2 = getNodeExePath();
  } catch {
    cached = { path: "", version: null, dir: "", ok: false, override: false };
    return cached;
  }
  const version = await readNodeVersion(path2);
  cached = {
    path: path2,
    version,
    dir: join(path2, ".."),
    // "ok" means hosted runtimes accept it — an updated version is just as valid as
    // the shipped one, so don't grade every non-NODE_VERSION_REQUIRED runtime red.
    ok: nodeVersionUsable(version),
    override: join(path2, "..") === overrideNodeDir()
  };
  return cached;
}
function readNodeVersion(nodePath) {
  return new Promise((resolve2) => {
    const child = spawn(nodePath, ["--version"], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => out += d.toString());
    child.on("error", () => resolve2(null));
    child.on("close", () => resolve2(out.trim() || null));
  });
}
function stripInspectorOptions(value) {
  if (!value) return value;
  const kept = value.split(/\s+/).filter((o) => o && !/^--inspect\b/i.test(o));
  return kept.length ? kept.join(" ") : void 0;
}
function bundledEnv(extra = {}) {
  const dir = join(getNodeExePath(), "..");
  const env2 = {
    ...process.env,
    PATH: `${dir}${delimiter}${process.env.PATH || ""}`,
    ...extra
  };
  const nodeOptions = stripInspectorOptions(env2.NODE_OPTIONS);
  if (nodeOptions) env2.NODE_OPTIONS = nodeOptions;
  else delete env2.NODE_OPTIONS;
  return env2;
}
function envWithPATH(dirs, extra = {}) {
  let base = { ...process.env };
  try {
    base = bundledEnv(extra);
  } catch {
    base = { ...base, ...extra };
  }
  const prepend = dirs.filter((d) => existsSync(d));
  if (!prepend.length) return base;
  return { ...base, PATH: `${prepend.join(delimiter)}${delimiter}${base.PATH}` };
}
const nodeRuntime = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  bundledEnv,
  envWithPATH,
  getNodeExePath,
  getNodeRuntimeInfo,
  invalidateNodeRuntimeCache,
  nodeVersionUsable,
  overrideNodeDir,
  resolveDshNodeExePath
}, Symbol.toStringTag, { value: "Module" }));
const isObject = (value) => {
  const type2 = typeof value;
  return value !== null && (type2 === "object" || type2 === "function");
};
const disallowedKeys = /* @__PURE__ */ new Set([
  "__proto__",
  "prototype",
  "constructor"
]);
const maxDisallowedKeyLength = Math.max(...[...disallowedKeys].map((key) => key.length));
const MAX_ARRAY_INDEX = 1e6;
const isDigit = (character) => character >= "0" && character <= "9";
function shouldCoerceToNumber(segment) {
  if (segment === "0") {
    return true;
  }
  if (/^[1-9]\d*$/.test(segment)) {
    const parsedNumber = Number.parseInt(segment, 10);
    return parsedNumber <= Number.MAX_SAFE_INTEGER && parsedNumber <= MAX_ARRAY_INDEX;
  }
  return false;
}
function processSegment(segment, parts) {
  if (disallowedKeys.has(segment)) {
    return false;
  }
  if (segment && shouldCoerceToNumber(segment)) {
    parts.push(Number.parseInt(segment, 10));
  } else {
    parts.push(segment);
  }
  return true;
}
function parsePath(path2) {
  if (typeof path2 !== "string") {
    throw new TypeError(`Expected a string, got ${typeof path2}`);
  }
  const parts = [];
  let currentSegment = "";
  let indexSegment = "";
  let hadProperty = false;
  let currentPart = "start";
  let isEscaping = false;
  let position = 0;
  for (const character of path2) {
    position++;
    if (isEscaping) {
      currentSegment += character;
      isEscaping = false;
      continue;
    }
    if (character === "\\") {
      if (currentPart === "index") {
        throw new Error(`Invalid character '${character}' in an index at position ${position}`);
      }
      if (currentPart === "indexEnd") {
        throw new Error(`Invalid character '${character}' after an index at position ${position}`);
      }
      isEscaping = true;
      currentPart = currentPart === "start" ? "property" : currentPart;
      continue;
    }
    switch (character) {
      case ".": {
        if (currentPart === "index") {
          throw new Error(`Invalid character '${character}' in an index at position ${position}`);
        }
        if (currentPart === "indexEnd") {
          currentPart = "property";
          break;
        }
        if (!processSegment(currentSegment, parts)) {
          return [];
        }
        currentSegment = "";
        currentPart = "property";
        break;
      }
      case "[": {
        if (currentPart === "index") {
          throw new Error(`Invalid character '${character}' in an index at position ${position}`);
        }
        if (currentPart === "indexEnd") {
          currentPart = "index";
          break;
        }
        if (currentPart === "property" && currentSegment.length <= maxDisallowedKeyLength && disallowedKeys.has(currentSegment)) {
          return [];
        }
        hadProperty = currentPart === "property";
        currentPart = "index";
        break;
      }
      case "]": {
        if (currentPart === "indexEnd") {
          throw new Error(`Invalid character '${character}' after an index at position ${position}`);
        }
        if (currentPart !== "index") {
          if (currentPart === "start") {
            currentPart = "property";
          }
          currentSegment += character;
          break;
        }
        if (indexSegment === "") {
          currentSegment += "[]";
          currentPart = "property";
          break;
        }
        if ((currentSegment !== "" || hadProperty) && !processSegment(currentSegment, parts)) {
          return [];
        }
        currentSegment = "";
        hadProperty = false;
        const parsedNumber = Number.parseInt(indexSegment, 10);
        const isValidInteger = parsedNumber <= MAX_ARRAY_INDEX && indexSegment === String(parsedNumber);
        parts.push(isValidInteger ? parsedNumber : indexSegment);
        indexSegment = "";
        currentPart = "indexEnd";
        break;
      }
      default: {
        if (currentPart === "index") {
          if (!isDigit(character)) {
            throw new Error(`Invalid character '${character}' in an index at position ${position}`);
          }
          indexSegment += character;
          break;
        }
        if (currentPart === "indexEnd") {
          throw new Error(`Invalid character '${character}' after an index at position ${position}`);
        }
        if (currentPart === "start") {
          currentPart = "property";
        }
        currentSegment += character;
      }
    }
  }
  if (isEscaping) {
    currentSegment += "\\";
  }
  switch (currentPart) {
    case "property": {
      if (!processSegment(currentSegment, parts)) {
        return [];
      }
      break;
    }
    case "index": {
      throw new Error("Index was not closed");
    }
    case "start": {
      parts.push("");
      break;
    }
  }
  return parts;
}
function normalizePath(path2) {
  if (typeof path2 === "string") {
    return parsePath(path2);
  }
  if (Array.isArray(path2)) {
    const normalized = [];
    for (const [index, segment] of path2.entries()) {
      if (typeof segment !== "string" && typeof segment !== "number") {
        throw new TypeError(`Expected a string or number for path segment at index ${index}, got ${typeof segment}`);
      }
      if (typeof segment === "number" && !Number.isFinite(segment)) {
        throw new TypeError(`Path segment at index ${index} must be a finite number, got ${segment}`);
      }
      if (disallowedKeys.has(segment)) {
        return [];
      }
      if (typeof segment === "string" && shouldCoerceToNumber(segment)) {
        normalized.push(Number.parseInt(segment, 10));
      } else {
        normalized.push(segment);
      }
    }
    return normalized;
  }
  return [];
}
function getProperty(object, path2, value) {
  if (!isObject(object) || typeof path2 !== "string" && !Array.isArray(path2)) {
    return value === void 0 ? object : value;
  }
  const pathArray = normalizePath(path2);
  if (pathArray.length === 0) {
    return value;
  }
  for (let index = 0; index < pathArray.length; index++) {
    const key = pathArray[index];
    object = object[key];
    if (object === void 0 || object === null) {
      if (index !== pathArray.length - 1) {
        return value;
      }
      break;
    }
  }
  return object === void 0 ? value : object;
}
function setProperty(object, path2, value) {
  if (!isObject(object) || typeof path2 !== "string" && !Array.isArray(path2)) {
    return object;
  }
  const root2 = object;
  const pathArray = normalizePath(path2);
  if (pathArray.length === 0) {
    return object;
  }
  for (let index = 0; index < pathArray.length; index++) {
    const key = pathArray[index];
    if (index === pathArray.length - 1) {
      object[key] = value;
      continue;
    }
    const existingValue = object[key];
    if (isObject(existingValue)) {
      object = existingValue;
      continue;
    }
    const nextKey = pathArray[index + 1];
    const shouldCreateArray = typeof nextKey === "number";
    object[key] = shouldCreateArray ? [] : {};
    object = object[key];
  }
  return root2;
}
function deleteProperty(object, path2) {
  if (!isObject(object) || typeof path2 !== "string" && !Array.isArray(path2)) {
    return false;
  }
  const pathArray = normalizePath(path2);
  if (pathArray.length === 0) {
    return false;
  }
  for (let index = 0; index < pathArray.length; index++) {
    const key = pathArray[index];
    if (index === pathArray.length - 1) {
      const existed = Object.hasOwn(object, key);
      if (!existed) {
        return false;
      }
      delete object[key];
      return true;
    }
    const existingValue = object[key];
    if (!isObject(existingValue)) {
      return false;
    }
    object = existingValue;
  }
}
function hasProperty(object, path2) {
  if (!isObject(object) || typeof path2 !== "string" && !Array.isArray(path2)) {
    return false;
  }
  const pathArray = normalizePath(path2);
  if (pathArray.length === 0) {
    return false;
  }
  for (const key of pathArray) {
    if (!isObject(object) || !(key in object)) {
      return false;
    }
    object = object[key];
  }
  return true;
}
const homedir = os__default.homedir();
const tmpdir = os__default.tmpdir();
const { env } = process$1;
const macos = (name) => {
  const library = path.join(homedir, "Library");
  return {
    data: path.join(library, "Application Support", name),
    config: path.join(library, "Preferences", name),
    cache: path.join(library, "Caches", name),
    log: path.join(library, "Logs", name),
    temp: path.join(tmpdir, name)
  };
};
const windows = (name) => {
  const appData = env.APPDATA || path.join(homedir, "AppData", "Roaming");
  const localAppData = env.LOCALAPPDATA || path.join(homedir, "AppData", "Local");
  return {
    // Data/config/cache/log are invented by me as Windows isn't opinionated about this
    data: path.join(localAppData, name, "Data"),
    config: path.join(appData, name, "Config"),
    cache: path.join(localAppData, name, "Cache"),
    log: path.join(localAppData, name, "Log"),
    temp: path.join(tmpdir, name)
  };
};
const linux = (name) => {
  const username = path.basename(homedir);
  return {
    data: path.join(env.XDG_DATA_HOME || path.join(homedir, ".local", "share"), name),
    config: path.join(env.XDG_CONFIG_HOME || path.join(homedir, ".config"), name),
    cache: path.join(env.XDG_CACHE_HOME || path.join(homedir, ".cache"), name),
    // https://wiki.debian.org/XDGBaseDirectorySpecification#state
    log: path.join(env.XDG_STATE_HOME || path.join(homedir, ".local", "state"), name),
    temp: path.join(tmpdir, username, name)
  };
};
function envPaths(name, { suffix = "nodejs" } = {}) {
  if (typeof name !== "string") {
    throw new TypeError(`Expected a string, got ${typeof name}`);
  }
  if (suffix) {
    name += `-${suffix}`;
  }
  if (process$1.platform === "darwin") {
    return macos(name);
  }
  if (process$1.platform === "win32") {
    return windows(name);
  }
  return linux(name);
}
const attemptifyAsync = (fn, options) => {
  const { onError } = options;
  return function attemptified(...args) {
    return fn.apply(void 0, args).catch(onError);
  };
};
const attemptifySync = (fn, options) => {
  const { onError } = options;
  return function attemptified(...args) {
    try {
      return fn.apply(void 0, args);
    } catch (error) {
      return onError(error);
    }
  };
};
const RETRY_INTERVAL = 250;
const retryifyAsync = (fn, options) => {
  const { isRetriable } = options;
  return function retryified(options2) {
    const { timeout } = options2;
    const interval = options2.interval ?? RETRY_INTERVAL;
    const timestamp = Date.now() + timeout;
    return function attempt(...args) {
      return fn.apply(void 0, args).catch((error) => {
        if (!isRetriable(error))
          throw error;
        if (Date.now() >= timestamp)
          throw error;
        const delay = Math.round(interval * Math.random());
        if (delay > 0) {
          const delayPromise = new Promise((resolve2) => setTimeout(resolve2, delay));
          return delayPromise.then(() => attempt.apply(void 0, args));
        } else {
          return attempt.apply(void 0, args);
        }
      });
    };
  };
};
const retryifySync = (fn, options) => {
  const { isRetriable } = options;
  return function retryified(options2) {
    const { timeout } = options2;
    const timestamp = Date.now() + timeout;
    return function attempt(...args) {
      while (true) {
        try {
          return fn.apply(void 0, args);
        } catch (error) {
          if (!isRetriable(error))
            throw error;
          if (Date.now() >= timestamp)
            throw error;
          continue;
        }
      }
    };
  };
};
const Handlers = {
  /* API */
  isChangeErrorOk: (error) => {
    if (!Handlers.isNodeError(error))
      return false;
    const { code: code2 } = error;
    if (code2 === "ENOSYS")
      return true;
    if (!IS_USER_ROOT && (code2 === "EINVAL" || code2 === "EPERM"))
      return true;
    return false;
  },
  isNodeError: (error) => {
    return error instanceof Error;
  },
  isRetriableError: (error) => {
    if (!Handlers.isNodeError(error))
      return false;
    const { code: code2 } = error;
    if (code2 === "EMFILE" || code2 === "ENFILE" || code2 === "EAGAIN" || code2 === "EBUSY" || code2 === "EACCESS" || code2 === "EACCES" || code2 === "EACCS" || code2 === "EPERM")
      return true;
    return false;
  },
  onChangeError: (error) => {
    if (!Handlers.isNodeError(error))
      throw error;
    if (Handlers.isChangeErrorOk(error))
      return;
    throw error;
  }
};
const ATTEMPTIFY_CHANGE_ERROR_OPTIONS = {
  onError: Handlers.onChangeError
};
const ATTEMPTIFY_NOOP_OPTIONS = {
  onError: () => void 0
};
const IS_USER_ROOT = process$1.getuid ? !process$1.getuid() : false;
const RETRYIFY_OPTIONS = {
  isRetriable: Handlers.isRetriableError
};
const FS = {
  attempt: {
    /* ASYNC */
    chmod: attemptifyAsync(promisify(fs__default.chmod), ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    chown: attemptifyAsync(promisify(fs__default.chown), ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    close: attemptifyAsync(promisify(fs__default.close), ATTEMPTIFY_NOOP_OPTIONS),
    fsync: attemptifyAsync(promisify(fs__default.fsync), ATTEMPTIFY_NOOP_OPTIONS),
    mkdir: attemptifyAsync(promisify(fs__default.mkdir), ATTEMPTIFY_NOOP_OPTIONS),
    realpath: attemptifyAsync(promisify(fs__default.realpath), ATTEMPTIFY_NOOP_OPTIONS),
    stat: attemptifyAsync(promisify(fs__default.stat), ATTEMPTIFY_NOOP_OPTIONS),
    unlink: attemptifyAsync(promisify(fs__default.unlink), ATTEMPTIFY_NOOP_OPTIONS),
    /* SYNC */
    chmodSync: attemptifySync(fs__default.chmodSync, ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    chownSync: attemptifySync(fs__default.chownSync, ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    closeSync: attemptifySync(fs__default.closeSync, ATTEMPTIFY_NOOP_OPTIONS),
    existsSync: attemptifySync(fs__default.existsSync, ATTEMPTIFY_NOOP_OPTIONS),
    fsyncSync: attemptifySync(fs__default.fsync, ATTEMPTIFY_NOOP_OPTIONS),
    mkdirSync: attemptifySync(fs__default.mkdirSync, ATTEMPTIFY_NOOP_OPTIONS),
    realpathSync: attemptifySync(fs__default.realpathSync, ATTEMPTIFY_NOOP_OPTIONS),
    statSync: attemptifySync(fs__default.statSync, ATTEMPTIFY_NOOP_OPTIONS),
    unlinkSync: attemptifySync(fs__default.unlinkSync, ATTEMPTIFY_NOOP_OPTIONS)
  },
  retry: {
    /* ASYNC */
    close: retryifyAsync(promisify(fs__default.close), RETRYIFY_OPTIONS),
    fsync: retryifyAsync(promisify(fs__default.fsync), RETRYIFY_OPTIONS),
    open: retryifyAsync(promisify(fs__default.open), RETRYIFY_OPTIONS),
    readFile: retryifyAsync(promisify(fs__default.readFile), RETRYIFY_OPTIONS),
    rename: retryifyAsync(promisify(fs__default.rename), RETRYIFY_OPTIONS),
    stat: retryifyAsync(promisify(fs__default.stat), RETRYIFY_OPTIONS),
    write: retryifyAsync(promisify(fs__default.write), RETRYIFY_OPTIONS),
    writeFile: retryifyAsync(promisify(fs__default.writeFile), RETRYIFY_OPTIONS),
    /* SYNC */
    closeSync: retryifySync(fs__default.closeSync, RETRYIFY_OPTIONS),
    fsyncSync: retryifySync(fs__default.fsyncSync, RETRYIFY_OPTIONS),
    openSync: retryifySync(fs__default.openSync, RETRYIFY_OPTIONS),
    readFileSync: retryifySync(fs__default.readFileSync, RETRYIFY_OPTIONS),
    renameSync: retryifySync(fs__default.renameSync, RETRYIFY_OPTIONS),
    statSync: retryifySync(fs__default.statSync, RETRYIFY_OPTIONS),
    writeSync: retryifySync(fs__default.writeSync, RETRYIFY_OPTIONS),
    writeFileSync: retryifySync(fs__default.writeFileSync, RETRYIFY_OPTIONS)
  }
};
const DEFAULT_ENCODING = "utf8";
const DEFAULT_FILE_MODE = 438;
const DEFAULT_FOLDER_MODE = 511;
const DEFAULT_WRITE_OPTIONS = {};
const DEFAULT_USER_UID = process$1.geteuid ? process$1.geteuid() : -1;
const DEFAULT_USER_GID = process$1.getegid ? process$1.getegid() : -1;
const DEFAULT_TIMEOUT_SYNC = 1e3;
const IS_POSIX = !!process$1.getuid;
process$1.getuid ? !process$1.getuid() : false;
const LIMIT_BASENAME_LENGTH = 128;
const isException = (value) => {
  return value instanceof Error && "code" in value;
};
const isString = (value) => {
  return typeof value === "string";
};
const isUndefined = (value) => {
  return value === void 0;
};
const IS_LINUX = process$1.platform === "linux";
const IS_WINDOWS = process$1.platform === "win32";
const Signals = ["SIGHUP", "SIGINT", "SIGTERM"];
if (!IS_WINDOWS) {
  Signals.push("SIGALRM", "SIGABRT", "SIGVTALRM", "SIGXCPU", "SIGXFSZ", "SIGUSR2", "SIGTRAP", "SIGSYS", "SIGQUIT", "SIGIOT");
}
if (IS_LINUX) {
  Signals.push("SIGIO", "SIGPOLL", "SIGPWR", "SIGSTKFLT");
}
class Interceptor {
  /* CONSTRUCTOR */
  constructor() {
    this.callbacks = /* @__PURE__ */ new Set();
    this.exited = false;
    this.exit = (signal) => {
      if (this.exited)
        return;
      this.exited = true;
      for (const callback of this.callbacks) {
        callback();
      }
      if (signal) {
        if (IS_WINDOWS && (signal !== "SIGINT" && signal !== "SIGTERM" && signal !== "SIGKILL")) {
          process$1.kill(process$1.pid, "SIGTERM");
        } else {
          process$1.kill(process$1.pid, signal);
        }
      }
    };
    this.hook = () => {
      process$1.once("exit", () => this.exit());
      for (const signal of Signals) {
        try {
          process$1.once(signal, () => this.exit(signal));
        } catch {
        }
      }
    };
    this.register = (callback) => {
      this.callbacks.add(callback);
      return () => {
        this.callbacks.delete(callback);
      };
    };
    this.hook();
  }
}
const Interceptor$1 = new Interceptor();
const whenExit = Interceptor$1.register;
const Temp = {
  /* VARIABLES */
  store: {},
  // filePath => purge
  /* API */
  create: (filePath) => {
    const randomness = `000000${Math.floor(Math.random() * 16777215).toString(16)}`.slice(-6);
    const timestamp = Date.now().toString().slice(-10);
    const prefix = "tmp-";
    const suffix = `.${prefix}${timestamp}${randomness}`;
    const tempPath = `${filePath}${suffix}`;
    return tempPath;
  },
  get: (filePath, creator, purge = true) => {
    const tempPath = Temp.truncate(creator(filePath));
    if (tempPath in Temp.store)
      return Temp.get(filePath, creator, purge);
    Temp.store[tempPath] = purge;
    const disposer = () => delete Temp.store[tempPath];
    return [tempPath, disposer];
  },
  purge: (filePath) => {
    if (!Temp.store[filePath])
      return;
    delete Temp.store[filePath];
    FS.attempt.unlink(filePath);
  },
  purgeSync: (filePath) => {
    if (!Temp.store[filePath])
      return;
    delete Temp.store[filePath];
    FS.attempt.unlinkSync(filePath);
  },
  purgeSyncAll: () => {
    for (const filePath in Temp.store) {
      Temp.purgeSync(filePath);
    }
  },
  truncate: (filePath) => {
    const basename2 = path.basename(filePath);
    if (basename2.length <= LIMIT_BASENAME_LENGTH)
      return filePath;
    const truncable = /^(\.?)(.*?)((?:\.[^.]+)?(?:\.tmp-\d{10}[a-f0-9]{6})?)$/.exec(basename2);
    if (!truncable)
      return filePath;
    const truncationLength = basename2.length - LIMIT_BASENAME_LENGTH;
    return `${filePath.slice(0, -basename2.length)}${truncable[1]}${truncable[2].slice(0, -truncationLength)}${truncable[3]}`;
  }
};
whenExit(Temp.purgeSyncAll);
function writeFileSync(filePath, data, options = DEFAULT_WRITE_OPTIONS) {
  if (isString(options))
    return writeFileSync(filePath, data, { encoding: options });
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_SYNC;
  const retryOptions = { timeout };
  let tempDisposer = null;
  let tempPath = null;
  let fd = null;
  try {
    const filePathReal = FS.attempt.realpathSync(filePath);
    const filePathExists = !!filePathReal;
    filePath = filePathReal || filePath;
    [tempPath, tempDisposer] = Temp.get(filePath, options.tmpCreate || Temp.create, !(options.tmpPurge === false));
    const useStatChown = IS_POSIX && isUndefined(options.chown);
    const useStatMode = isUndefined(options.mode);
    if (filePathExists && (useStatChown || useStatMode)) {
      const stats = FS.attempt.statSync(filePath);
      if (stats) {
        options = { ...options };
        if (useStatChown) {
          options.chown = { uid: stats.uid, gid: stats.gid };
        }
        if (useStatMode) {
          options.mode = stats.mode;
        }
      }
    }
    if (!filePathExists) {
      const parentPath = path.dirname(filePath);
      FS.attempt.mkdirSync(parentPath, {
        mode: DEFAULT_FOLDER_MODE,
        recursive: true
      });
    }
    fd = FS.retry.openSync(retryOptions)(tempPath, "w", options.mode || DEFAULT_FILE_MODE);
    if (options.tmpCreated) {
      options.tmpCreated(tempPath);
    }
    if (isString(data)) {
      FS.retry.writeSync(retryOptions)(fd, data, 0, options.encoding || DEFAULT_ENCODING);
    } else if (!isUndefined(data)) {
      FS.retry.writeSync(retryOptions)(fd, data, 0, data.length, 0);
    }
    if (options.fsync !== false) {
      if (options.fsyncWait !== false) {
        FS.retry.fsyncSync(retryOptions)(fd);
      } else {
        FS.attempt.fsync(fd);
      }
    }
    FS.retry.closeSync(retryOptions)(fd);
    fd = null;
    if (options.chown && (options.chown.uid !== DEFAULT_USER_UID || options.chown.gid !== DEFAULT_USER_GID)) {
      FS.attempt.chownSync(tempPath, options.chown.uid, options.chown.gid);
    }
    if (options.mode && options.mode !== DEFAULT_FILE_MODE) {
      FS.attempt.chmodSync(tempPath, options.mode);
    }
    try {
      FS.retry.renameSync(retryOptions)(tempPath, filePath);
    } catch (error) {
      if (!isException(error))
        throw error;
      if (error.code !== "ENAMETOOLONG")
        throw error;
      FS.retry.renameSync(retryOptions)(tempPath, Temp.truncate(filePath));
    }
    tempDisposer();
    tempPath = null;
  } finally {
    if (fd)
      FS.attempt.closeSync(fd);
    if (tempPath)
      Temp.purge(tempPath);
  }
}
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var _2020 = { exports: {} };
var core$1 = {};
var validate = {};
var boolSchema = {};
var errors = {};
var codegen = {};
var code$1 = {};
var hasRequiredCode$1;
function requireCode$1() {
  if (hasRequiredCode$1) return code$1;
  hasRequiredCode$1 = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    class _CodeOrName {
    }
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    class Name extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    }
    exports.Name = Name;
    class _Code extends _CodeOrName {
      constructor(code2) {
        super();
        this._items = typeof code2 === "string" ? [code2] : code2;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names2, c) => {
          if (c instanceof Name)
            names2[c.str] = (names2[c.str] || 0) + 1;
          return names2;
        }, {});
      }
    }
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code2 = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code2, args[i]);
        code2.push(strs[++i]);
      }
      return new _Code(code2);
    }
    exports._ = _;
    const plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code2, arg) {
      if (arg instanceof _Code)
        code2.push(...arg._items);
      else if (arg instanceof Name)
        code2.push(arg);
      else
        code2.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty2(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty2;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  })(code$1);
  return code$1;
}
var scope = {};
var hasRequiredScope;
function requireScope() {
  if (hasRequiredScope) return scope;
  hasRequiredScope = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    const code_1 = /* @__PURE__ */ requireCode$1();
    class ValueError extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    }
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    class Scope {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    }
    exports.Scope = Scope;
    class ValueScopeName extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    }
    exports.ValueScopeName = ValueScopeName;
    const line = (0, code_1._)`\n`;
    class ValueScope extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code2 = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code2 = (0, code_1._)`${code2}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code2 = (0, code_1._)`${code2}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code2;
      }
    }
    exports.ValueScope = ValueScope;
  })(scope);
  return scope;
}
var hasRequiredCodegen;
function requireCodegen() {
  if (hasRequiredCodegen) return codegen;
  hasRequiredCodegen = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    const code_1 = /* @__PURE__ */ requireCode$1();
    const scope_1 = /* @__PURE__ */ requireScope();
    var code_2 = /* @__PURE__ */ requireCode$1();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = /* @__PURE__ */ requireScope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    class Node {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    }
    class Def extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names2, constants2) {
        if (!names2[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names2, constants2);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    }
    class Assign extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names2, constants2) {
        if (this.lhs instanceof code_1.Name && !names2[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names2, constants2);
        return this;
      }
      get names() {
        const names2 = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names2, this.rhs);
      }
    }
    class AssignOp extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    }
    class Label extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    }
    class Break extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    }
    class Throw extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    }
    class AnyCode extends Node {
      constructor(code2) {
        super();
        this.code = code2;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names2, constants2) {
        this.code = optimizeExpr(this.code, names2, constants2);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    }
    class ParentNode extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code2, n) => code2 + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names2, constants2) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names2, constants2))
            continue;
          subtractNames(names2, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names2, n) => addNames(names2, n.names), {});
      }
    }
    class BlockNode extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    }
    class Root extends ParentNode {
    }
    class Else extends BlockNode {
    }
    Else.kind = "else";
    class If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code2 = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code2 += "else " + this.else.render(opts);
        return code2;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new If(not2(cond), e instanceof If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names2, constants2) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names2, constants2);
        if (!(super.optimizeNames(names2, constants2) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names2, constants2);
        return this;
      }
      get names() {
        const names2 = super.names;
        addExprNames(names2, this.condition);
        if (this.else)
          addNames(names2, this.else.names);
        return names2;
      }
    }
    If.kind = "if";
    class For extends BlockNode {
    }
    For.kind = "for";
    class ForLoop extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names2, constants2) {
        if (!super.optimizeNames(names2, constants2))
          return;
        this.iteration = optimizeExpr(this.iteration, names2, constants2);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    }
    class ForRange extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names2 = addExprNames(super.names, this.from);
        return addExprNames(names2, this.to);
      }
    }
    class ForIter extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names2, constants2) {
        if (!super.optimizeNames(names2, constants2))
          return;
        this.iterable = optimizeExpr(this.iterable, names2, constants2);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    }
    class Func extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    }
    Func.kind = "func";
    class Return extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    }
    Return.kind = "return";
    class Try extends BlockNode {
      render(opts) {
        let code2 = "try" + super.render(opts);
        if (this.catch)
          code2 += this.catch.render(opts);
        if (this.finally)
          code2 += this.finally.render(opts);
        return code2;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names2, constants2) {
        var _a, _b;
        super.optimizeNames(names2, constants2);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names2, constants2);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names2, constants2);
        return this;
      }
      get names() {
        const names2 = super.names;
        if (this.catch)
          addNames(names2, this.catch.names);
        if (this.finally)
          addNames(names2, this.finally.names);
        return names2;
      }
    }
    class Catch extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    }
    Catch.kind = "catch";
    class Finally extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    }
    Finally.kind = "finally";
    class CodeGen {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code2 = ["{"];
        for (const [key, value] of keyValues) {
          if (code2.length > 1)
            code2.push(",");
          code2.push(key);
          if (key !== value || this.opts.es5) {
            code2.push(":");
            (0, code_1.addCodeArg)(code2, value);
          }
        }
        code2.push("}");
        return new code_1._Code(code2);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    }
    exports.CodeGen = CodeGen;
    function addNames(names2, from) {
      for (const n in from)
        names2[n] = (names2[n] || 0) + (from[n] || 0);
      return names2;
    }
    function addExprNames(names2, from) {
      return from instanceof code_1._CodeOrName ? addNames(names2, from.names) : names2;
    }
    function optimizeExpr(expr, names2, constants2) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items2, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items2.push(...c._items);
        else
          items2.push(c);
        return items2;
      }, []));
      function replaceName(n) {
        const c = constants2[n.str];
        if (c === void 0 || names2[n.str] !== 1)
          return n;
        delete names2[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names2[c.str] === 1 && constants2[c.str] !== void 0);
      }
    }
    function subtractNames(names2, from) {
      for (const n in from)
        names2[n] = (names2[n] || 0) - (from[n] || 0);
    }
    function not2(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not2;
    const andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    const orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  })(codegen);
  return codegen;
}
var util = {};
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  Object.defineProperty(util, "__esModule", { value: true });
  util.checkStrictMode = util.getErrorPath = util.Type = util.useFunc = util.setEvaluated = util.evaluatedPropsToName = util.mergeEvaluated = util.eachItem = util.unescapeJsonPointer = util.escapeJsonPointer = util.escapeFragment = util.unescapeFragment = util.schemaRefOrVal = util.schemaHasRulesButRef = util.schemaHasRules = util.checkUnknownRules = util.alwaysValidSchema = util.toHash = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const code_1 = /* @__PURE__ */ requireCode$1();
  function toHash(arr) {
    const hash = {};
    for (const item of arr)
      hash[item] = true;
    return hash;
  }
  util.toHash = toHash;
  function alwaysValidSchema(it, schema) {
    if (typeof schema == "boolean")
      return schema;
    if (Object.keys(schema).length === 0)
      return true;
    checkUnknownRules(it, schema);
    return !schemaHasRules(schema, it.self.RULES.all);
  }
  util.alwaysValidSchema = alwaysValidSchema;
  function checkUnknownRules(it, schema = it.schema) {
    const { opts, self } = it;
    if (!opts.strictSchema)
      return;
    if (typeof schema === "boolean")
      return;
    const rules2 = self.RULES.keywords;
    for (const key in schema) {
      if (!rules2[key])
        checkStrictMode(it, `unknown keyword: "${key}"`);
    }
  }
  util.checkUnknownRules = checkUnknownRules;
  function schemaHasRules(schema, rules2) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (rules2[key])
        return true;
    return false;
  }
  util.schemaHasRules = schemaHasRules;
  function schemaHasRulesButRef(schema, RULES) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (key !== "$ref" && RULES.all[key])
        return true;
    return false;
  }
  util.schemaHasRulesButRef = schemaHasRulesButRef;
  function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword2, $data) {
    if (!$data) {
      if (typeof schema == "number" || typeof schema == "boolean")
        return schema;
      if (typeof schema == "string")
        return (0, codegen_1._)`${schema}`;
    }
    return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword2)}`;
  }
  util.schemaRefOrVal = schemaRefOrVal;
  function unescapeFragment(str) {
    return unescapeJsonPointer(decodeURIComponent(str));
  }
  util.unescapeFragment = unescapeFragment;
  function escapeFragment(str) {
    return encodeURIComponent(escapeJsonPointer(str));
  }
  util.escapeFragment = escapeFragment;
  function escapeJsonPointer(str) {
    if (typeof str == "number")
      return `${str}`;
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  util.escapeJsonPointer = escapeJsonPointer;
  function unescapeJsonPointer(str) {
    return str.replace(/~1/g, "/").replace(/~0/g, "~");
  }
  util.unescapeJsonPointer = unescapeJsonPointer;
  function eachItem(xs, f) {
    if (Array.isArray(xs)) {
      for (const x of xs)
        f(x);
    } else {
      f(xs);
    }
  }
  util.eachItem = eachItem;
  function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
    return (gen, from, to, toName) => {
      const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
      return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
    };
  }
  util.mergeEvaluated = {
    props: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
        gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
      }),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
        if (from === true) {
          gen.assign(to, true);
        } else {
          gen.assign(to, (0, codegen_1._)`${to} || {}`);
          setEvaluated(gen, to, from);
        }
      }),
      mergeValues: (from, to) => from === true ? true : { ...from, ...to },
      resultToName: evaluatedPropsToName
    }),
    items: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
      mergeValues: (from, to) => from === true ? true : Math.max(from, to),
      resultToName: (gen, items2) => gen.var("items", items2)
    })
  };
  function evaluatedPropsToName(gen, ps) {
    if (ps === true)
      return gen.var("props", true);
    const props = gen.var("props", (0, codegen_1._)`{}`);
    if (ps !== void 0)
      setEvaluated(gen, props, ps);
    return props;
  }
  util.evaluatedPropsToName = evaluatedPropsToName;
  function setEvaluated(gen, props, ps) {
    Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
  }
  util.setEvaluated = setEvaluated;
  const snippets = {};
  function useFunc(gen, f) {
    return gen.scopeValue("func", {
      ref: f,
      code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
    });
  }
  util.useFunc = useFunc;
  var Type;
  (function(Type2) {
    Type2[Type2["Num"] = 0] = "Num";
    Type2[Type2["Str"] = 1] = "Str";
  })(Type || (util.Type = Type = {}));
  function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
    if (dataProp instanceof codegen_1.Name) {
      const isNumber = dataPropType === Type.Num;
      return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
    }
    return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
  }
  util.getErrorPath = getErrorPath;
  function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
    if (!mode)
      return;
    msg = `strict mode: ${msg}`;
    if (mode === true)
      throw new Error(msg);
    it.self.logger.warn(msg);
  }
  util.checkStrictMode = checkStrictMode;
  return util;
}
var names = {};
var hasRequiredNames;
function requireNames() {
  if (hasRequiredNames) return names;
  hasRequiredNames = 1;
  Object.defineProperty(names, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names$1 = {
    // validation function arguments
    data: new codegen_1.Name("data"),
    // data passed to validation function
    // args passed from referencing schema
    valCxt: new codegen_1.Name("valCxt"),
    // validation/data context - should not be used directly, it is destructured to the names below
    instancePath: new codegen_1.Name("instancePath"),
    parentData: new codegen_1.Name("parentData"),
    parentDataProperty: new codegen_1.Name("parentDataProperty"),
    rootData: new codegen_1.Name("rootData"),
    // root data - same as the data passed to the first/top validation function
    dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
    // used to support recursiveRef and dynamicRef
    // function scoped variables
    vErrors: new codegen_1.Name("vErrors"),
    // null or array of validation errors
    errors: new codegen_1.Name("errors"),
    // counter of validation errors
    this: new codegen_1.Name("this"),
    // "globals"
    self: new codegen_1.Name("self"),
    scope: new codegen_1.Name("scope"),
    // JTD serialize/parse name for JSON string and position
    json: new codegen_1.Name("json"),
    jsonPos: new codegen_1.Name("jsonPos"),
    jsonLen: new codegen_1.Name("jsonLen"),
    jsonPart: new codegen_1.Name("jsonPart")
  };
  names.default = names$1;
  return names;
}
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const util_1 = /* @__PURE__ */ requireUtil();
    const names_1 = /* @__PURE__ */ requireNames();
    exports.keywordError = {
      message: ({ keyword: keyword2 }) => (0, codegen_1.str)`must pass "${keyword2}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword: keyword2, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword2}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword2}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword: keyword2, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword2}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    const E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword: keyword2, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword2}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword: keyword2, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword2], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  })(errors);
  return errors;
}
var hasRequiredBoolSchema;
function requireBoolSchema() {
  if (hasRequiredBoolSchema) return boolSchema;
  hasRequiredBoolSchema = 1;
  Object.defineProperty(boolSchema, "__esModule", { value: true });
  boolSchema.boolOrEmptySchema = boolSchema.topBoolOrEmptySchema = void 0;
  const errors_1 = /* @__PURE__ */ requireErrors();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const boolError = {
    message: "boolean schema is false"
  };
  function topBoolOrEmptySchema(it) {
    const { gen, schema, validateName } = it;
    if (schema === false) {
      falseSchemaError(it, false);
    } else if (typeof schema == "object" && schema.$async === true) {
      gen.return(names_1.default.data);
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, null);
      gen.return(true);
    }
  }
  boolSchema.topBoolOrEmptySchema = topBoolOrEmptySchema;
  function boolOrEmptySchema(it, valid2) {
    const { gen, schema } = it;
    if (schema === false) {
      gen.var(valid2, false);
      falseSchemaError(it);
    } else {
      gen.var(valid2, true);
    }
  }
  boolSchema.boolOrEmptySchema = boolOrEmptySchema;
  function falseSchemaError(it, overrideAllErrors) {
    const { gen, data } = it;
    const cxt = {
      gen,
      keyword: "false schema",
      data,
      schema: false,
      schemaCode: false,
      schemaValue: false,
      params: {},
      it
    };
    (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
  }
  return boolSchema;
}
var dataType = {};
var rules = {};
var hasRequiredRules;
function requireRules() {
  if (hasRequiredRules) return rules;
  hasRequiredRules = 1;
  Object.defineProperty(rules, "__esModule", { value: true });
  rules.getRules = rules.isJSONType = void 0;
  const _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
  const jsonTypes = new Set(_jsonTypes);
  function isJSONType(x) {
    return typeof x == "string" && jsonTypes.has(x);
  }
  rules.isJSONType = isJSONType;
  function getRules() {
    const groups = {
      number: { type: "number", rules: [] },
      string: { type: "string", rules: [] },
      array: { type: "array", rules: [] },
      object: { type: "object", rules: [] }
    };
    return {
      types: { ...groups, integer: true, boolean: true, null: true },
      rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
      post: { rules: [] },
      all: {},
      keywords: {}
    };
  }
  rules.getRules = getRules;
  return rules;
}
var applicability = {};
var hasRequiredApplicability;
function requireApplicability() {
  if (hasRequiredApplicability) return applicability;
  hasRequiredApplicability = 1;
  Object.defineProperty(applicability, "__esModule", { value: true });
  applicability.shouldUseRule = applicability.shouldUseGroup = applicability.schemaHasRulesForType = void 0;
  function schemaHasRulesForType({ schema, self }, type2) {
    const group = self.RULES.types[type2];
    return group && group !== true && shouldUseGroup(schema, group);
  }
  applicability.schemaHasRulesForType = schemaHasRulesForType;
  function shouldUseGroup(schema, group) {
    return group.rules.some((rule) => shouldUseRule(schema, rule));
  }
  applicability.shouldUseGroup = shouldUseGroup;
  function shouldUseRule(schema, rule) {
    var _a;
    return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
  }
  applicability.shouldUseRule = shouldUseRule;
  return applicability;
}
var hasRequiredDataType;
function requireDataType() {
  if (hasRequiredDataType) return dataType;
  hasRequiredDataType = 1;
  Object.defineProperty(dataType, "__esModule", { value: true });
  dataType.reportTypeError = dataType.checkDataTypes = dataType.checkDataType = dataType.coerceAndCheckDataType = dataType.getJSONTypes = dataType.getSchemaTypes = dataType.DataType = void 0;
  const rules_1 = /* @__PURE__ */ requireRules();
  const applicability_1 = /* @__PURE__ */ requireApplicability();
  const errors_1 = /* @__PURE__ */ requireErrors();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  var DataType;
  (function(DataType2) {
    DataType2[DataType2["Correct"] = 0] = "Correct";
    DataType2[DataType2["Wrong"] = 1] = "Wrong";
  })(DataType || (dataType.DataType = DataType = {}));
  function getSchemaTypes(schema) {
    const types2 = getJSONTypes(schema.type);
    const hasNull = types2.includes("null");
    if (hasNull) {
      if (schema.nullable === false)
        throw new Error("type: null contradicts nullable: false");
    } else {
      if (!types2.length && schema.nullable !== void 0) {
        throw new Error('"nullable" cannot be used without "type"');
      }
      if (schema.nullable === true)
        types2.push("null");
    }
    return types2;
  }
  dataType.getSchemaTypes = getSchemaTypes;
  function getJSONTypes(ts) {
    const types2 = Array.isArray(ts) ? ts : ts ? [ts] : [];
    if (types2.every(rules_1.isJSONType))
      return types2;
    throw new Error("type must be JSONType or JSONType[]: " + types2.join(","));
  }
  dataType.getJSONTypes = getJSONTypes;
  function coerceAndCheckDataType(it, types2) {
    const { gen, data, opts } = it;
    const coerceTo = coerceToTypes(types2, opts.coerceTypes);
    const checkTypes = types2.length > 0 && !(coerceTo.length === 0 && types2.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types2[0]));
    if (checkTypes) {
      const wrongType = checkDataTypes(types2, data, opts.strictNumbers, DataType.Wrong);
      gen.if(wrongType, () => {
        if (coerceTo.length)
          coerceData(it, types2, coerceTo);
        else
          reportTypeError(it);
      });
    }
    return checkTypes;
  }
  dataType.coerceAndCheckDataType = coerceAndCheckDataType;
  const COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
  function coerceToTypes(types2, coerceTypes) {
    return coerceTypes ? types2.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
  }
  function coerceData(it, types2, coerceTo) {
    const { gen, data, opts } = it;
    const dataType2 = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
    const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
    if (opts.coerceTypes === "array") {
      gen.if((0, codegen_1._)`${dataType2} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType2, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types2, data, opts.strictNumbers), () => gen.assign(coerced, data)));
    }
    gen.if((0, codegen_1._)`${coerced} !== undefined`);
    for (const t of coerceTo) {
      if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
        coerceSpecificType(t);
      }
    }
    gen.else();
    reportTypeError(it);
    gen.endIf();
    gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
      gen.assign(data, coerced);
      assignParentData(it, coerced);
    });
    function coerceSpecificType(t) {
      switch (t) {
        case "string":
          gen.elseIf((0, codegen_1._)`${dataType2} == "number" || ${dataType2} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
          return;
        case "number":
          gen.elseIf((0, codegen_1._)`${dataType2} == "boolean" || ${data} === null
              || (${dataType2} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "integer":
          gen.elseIf((0, codegen_1._)`${dataType2} === "boolean" || ${data} === null
              || (${dataType2} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "boolean":
          gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
          return;
        case "null":
          gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
          gen.assign(coerced, null);
          return;
        case "array":
          gen.elseIf((0, codegen_1._)`${dataType2} === "string" || ${dataType2} === "number"
              || ${dataType2} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
      }
    }
  }
  function assignParentData({ gen, parentData, parentDataProperty }, expr) {
    gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
  }
  function checkDataType(dataType2, data, strictNums, correct = DataType.Correct) {
    const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
    let cond;
    switch (dataType2) {
      case "null":
        return (0, codegen_1._)`${data} ${EQ} null`;
      case "array":
        cond = (0, codegen_1._)`Array.isArray(${data})`;
        break;
      case "object":
        cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
        break;
      case "integer":
        cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
        break;
      case "number":
        cond = numCond();
        break;
      default:
        return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType2}`;
    }
    return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
    function numCond(_cond = codegen_1.nil) {
      return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
    }
  }
  dataType.checkDataType = checkDataType;
  function checkDataTypes(dataTypes, data, strictNums, correct) {
    if (dataTypes.length === 1) {
      return checkDataType(dataTypes[0], data, strictNums, correct);
    }
    let cond;
    const types2 = (0, util_1.toHash)(dataTypes);
    if (types2.array && types2.object) {
      const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
      cond = types2.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
      delete types2.null;
      delete types2.array;
      delete types2.object;
    } else {
      cond = codegen_1.nil;
    }
    if (types2.number)
      delete types2.integer;
    for (const t in types2)
      cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
    return cond;
  }
  dataType.checkDataTypes = checkDataTypes;
  const typeError = {
    message: ({ schema }) => `must be ${schema}`,
    params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
  };
  function reportTypeError(it) {
    const cxt = getTypeErrorContext(it);
    (0, errors_1.reportError)(cxt, typeError);
  }
  dataType.reportTypeError = reportTypeError;
  function getTypeErrorContext(it) {
    const { gen, data, schema } = it;
    const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
    return {
      gen,
      keyword: "type",
      data,
      schema: schema.type,
      schemaCode,
      schemaValue: schemaCode,
      parentSchema: schema,
      params: {},
      it
    };
  }
  return dataType;
}
var defaults = {};
var hasRequiredDefaults;
function requireDefaults() {
  if (hasRequiredDefaults) return defaults;
  hasRequiredDefaults = 1;
  Object.defineProperty(defaults, "__esModule", { value: true });
  defaults.assignDefaults = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  function assignDefaults(it, ty) {
    const { properties: properties2, items: items2 } = it.schema;
    if (ty === "object" && properties2) {
      for (const key in properties2) {
        assignDefault(it, key, properties2[key].default);
      }
    } else if (ty === "array" && Array.isArray(items2)) {
      items2.forEach((sch, i) => assignDefault(it, i, sch.default));
    }
  }
  defaults.assignDefaults = assignDefaults;
  function assignDefault(it, prop, defaultValue) {
    const { gen, compositeRule, data, opts } = it;
    if (defaultValue === void 0)
      return;
    const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
    if (compositeRule) {
      (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
      return;
    }
    let condition = (0, codegen_1._)`${childData} === undefined`;
    if (opts.useDefaults === "empty") {
      condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
    }
    gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
  }
  return defaults;
}
var keyword = {};
var code = {};
var hasRequiredCode;
function requireCode() {
  if (hasRequiredCode) return code;
  hasRequiredCode = 1;
  Object.defineProperty(code, "__esModule", { value: true });
  code.validateUnion = code.validateArray = code.usePattern = code.callValidateCode = code.schemaProperties = code.allSchemaProperties = code.noPropertyInData = code.propertyInData = code.isOwnProperty = code.hasPropFunc = code.reportMissingProp = code.checkMissingProp = code.checkReportMissingProp = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const names_1 = /* @__PURE__ */ requireNames();
  const util_2 = /* @__PURE__ */ requireUtil();
  function checkReportMissingProp(cxt, prop) {
    const { gen, data, it } = cxt;
    gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
      cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
      cxt.error();
    });
  }
  code.checkReportMissingProp = checkReportMissingProp;
  function checkMissingProp({ gen, data, it: { opts } }, properties2, missing) {
    return (0, codegen_1.or)(...properties2.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
  }
  code.checkMissingProp = checkMissingProp;
  function reportMissingProp(cxt, missing) {
    cxt.setParams({ missingProperty: missing }, true);
    cxt.error();
  }
  code.reportMissingProp = reportMissingProp;
  function hasPropFunc(gen) {
    return gen.scopeValue("func", {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ref: Object.prototype.hasOwnProperty,
      code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
    });
  }
  code.hasPropFunc = hasPropFunc;
  function isOwnProperty(gen, data, property) {
    return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
  }
  code.isOwnProperty = isOwnProperty;
  function propertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
    return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
  }
  code.propertyInData = propertyInData;
  function noPropertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
    return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
  }
  code.noPropertyInData = noPropertyInData;
  function allSchemaProperties(schemaMap) {
    return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
  }
  code.allSchemaProperties = allSchemaProperties;
  function schemaProperties(it, schemaMap) {
    return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
  }
  code.schemaProperties = schemaProperties;
  function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
    const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
    const valCxt = [
      [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
      [names_1.default.parentData, it.parentData],
      [names_1.default.parentDataProperty, it.parentDataProperty],
      [names_1.default.rootData, names_1.default.rootData]
    ];
    if (it.opts.dynamicRef)
      valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
    const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
    return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
  }
  code.callValidateCode = callValidateCode;
  const newRegExp = (0, codegen_1._)`new RegExp`;
  function usePattern({ gen, it: { opts } }, pattern2) {
    const u = opts.unicodeRegExp ? "u" : "";
    const { regExp } = opts.code;
    const rx = regExp(pattern2, u);
    return gen.scopeValue("pattern", {
      key: rx.toString(),
      ref: rx,
      code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern2}, ${u})`
    });
  }
  code.usePattern = usePattern;
  function validateArray(cxt) {
    const { gen, data, keyword: keyword2, it } = cxt;
    const valid2 = gen.name("valid");
    if (it.allErrors) {
      const validArr = gen.let("valid", true);
      validateItems(() => gen.assign(validArr, false));
      return validArr;
    }
    gen.var(valid2, true);
    validateItems(() => gen.break());
    return valid2;
    function validateItems(notValid) {
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      gen.forRange("i", 0, len, (i) => {
        cxt.subschema({
          keyword: keyword2,
          dataProp: i,
          dataPropType: util_1.Type.Num
        }, valid2);
        gen.if((0, codegen_1.not)(valid2), notValid);
      });
    }
  }
  code.validateArray = validateArray;
  function validateUnion(cxt) {
    const { gen, schema, keyword: keyword2, it } = cxt;
    if (!Array.isArray(schema))
      throw new Error("ajv implementation error");
    const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
    if (alwaysValid && !it.opts.unevaluated)
      return;
    const valid2 = gen.let("valid", false);
    const schValid = gen.name("_valid");
    gen.block(() => schema.forEach((_sch, i) => {
      const schCxt = cxt.subschema({
        keyword: keyword2,
        schemaProp: i,
        compositeRule: true
      }, schValid);
      gen.assign(valid2, (0, codegen_1._)`${valid2} || ${schValid}`);
      const merged = cxt.mergeValidEvaluated(schCxt, schValid);
      if (!merged)
        gen.if((0, codegen_1.not)(valid2));
    }));
    cxt.result(valid2, () => cxt.reset(), () => cxt.error(true));
  }
  code.validateUnion = validateUnion;
  return code;
}
var hasRequiredKeyword;
function requireKeyword() {
  if (hasRequiredKeyword) return keyword;
  hasRequiredKeyword = 1;
  Object.defineProperty(keyword, "__esModule", { value: true });
  keyword.validateKeywordUsage = keyword.validSchemaType = keyword.funcKeywordCode = keyword.macroKeywordCode = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const code_1 = /* @__PURE__ */ requireCode();
  const errors_1 = /* @__PURE__ */ requireErrors();
  function macroKeywordCode(cxt, def) {
    const { gen, keyword: keyword2, schema, parentSchema, it } = cxt;
    const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
    const schemaRef = useKeyword(gen, keyword2, macroSchema);
    if (it.opts.validateSchema !== false)
      it.self.validateSchema(macroSchema, true);
    const valid2 = gen.name("valid");
    cxt.subschema({
      schema: macroSchema,
      schemaPath: codegen_1.nil,
      errSchemaPath: `${it.errSchemaPath}/${keyword2}`,
      topSchemaRef: schemaRef,
      compositeRule: true
    }, valid2);
    cxt.pass(valid2, () => cxt.error(true));
  }
  keyword.macroKeywordCode = macroKeywordCode;
  function funcKeywordCode(cxt, def) {
    var _a;
    const { gen, keyword: keyword2, schema, parentSchema, $data, it } = cxt;
    checkAsyncKeyword(it, def);
    const validate2 = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
    const validateRef = useKeyword(gen, keyword2, validate2);
    const valid2 = gen.let("valid");
    cxt.block$data(valid2, validateKeyword);
    cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid2);
    function validateKeyword() {
      if (def.errors === false) {
        assignValid();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => cxt.error());
      } else {
        const ruleErrs = def.async ? validateAsync() : validateSync();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => addErrs(cxt, ruleErrs));
      }
    }
    function validateAsync() {
      const ruleErrs = gen.let("ruleErrs", null);
      gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid2, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
      return ruleErrs;
    }
    function validateSync() {
      const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
      gen.assign(validateErrs, null);
      assignValid(codegen_1.nil);
      return validateErrs;
    }
    function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
      const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
      const passSchema = !("compile" in def && !$data || def.schema === false);
      gen.assign(valid2, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
    }
    function reportErrs(errors2) {
      var _a2;
      gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid2), errors2);
    }
  }
  keyword.funcKeywordCode = funcKeywordCode;
  function modifyData(cxt) {
    const { gen, data, it } = cxt;
    gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
  }
  function addErrs(cxt, errs) {
    const { gen } = cxt;
    gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      (0, errors_1.extendErrors)(cxt);
    }, () => cxt.error());
  }
  function checkAsyncKeyword({ schemaEnv }, def) {
    if (def.async && !schemaEnv.$async)
      throw new Error("async keyword in sync schema");
  }
  function useKeyword(gen, keyword2, result) {
    if (result === void 0)
      throw new Error(`keyword "${keyword2}" failed to compile`);
    return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
  }
  function validSchemaType(schema, schemaType, allowUndefined = false) {
    return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
  }
  keyword.validSchemaType = validSchemaType;
  function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword2) {
    if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword2) : def.keyword !== keyword2) {
      throw new Error("ajv implementation error");
    }
    const deps = def.dependencies;
    if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
      throw new Error(`parent schema must have dependencies of ${keyword2}: ${deps.join(",")}`);
    }
    if (def.validateSchema) {
      const valid2 = def.validateSchema(schema[keyword2]);
      if (!valid2) {
        const msg = `keyword "${keyword2}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
        if (opts.validateSchema === "log")
          self.logger.error(msg);
        else
          throw new Error(msg);
      }
    }
  }
  keyword.validateKeywordUsage = validateKeywordUsage;
  return keyword;
}
var subschema = {};
var hasRequiredSubschema;
function requireSubschema() {
  if (hasRequiredSubschema) return subschema;
  hasRequiredSubschema = 1;
  Object.defineProperty(subschema, "__esModule", { value: true });
  subschema.extendSubschemaMode = subschema.extendSubschemaData = subschema.getSubschema = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  function getSubschema(it, { keyword: keyword2, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
    if (keyword2 !== void 0 && schema !== void 0) {
      throw new Error('both "keyword" and "schema" passed, only one allowed');
    }
    if (keyword2 !== void 0) {
      const sch = it.schema[keyword2];
      return schemaProp === void 0 ? {
        schema: sch,
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword2)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword2}`
      } : {
        schema: sch[schemaProp],
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword2)}${(0, codegen_1.getProperty)(schemaProp)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword2}/${(0, util_1.escapeFragment)(schemaProp)}`
      };
    }
    if (schema !== void 0) {
      if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
        throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
      }
      return {
        schema,
        schemaPath,
        topSchemaRef,
        errSchemaPath
      };
    }
    throw new Error('either "keyword" or "schema" must be passed');
  }
  subschema.getSubschema = getSubschema;
  function extendSubschemaData(subschema2, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
    if (data !== void 0 && dataProp !== void 0) {
      throw new Error('both "data" and "dataProp" passed, only one allowed');
    }
    const { gen } = it;
    if (dataProp !== void 0) {
      const { errorPath, dataPathArr, opts } = it;
      const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
      dataContextProps(nextData);
      subschema2.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
      subschema2.parentDataProperty = (0, codegen_1._)`${dataProp}`;
      subschema2.dataPathArr = [...dataPathArr, subschema2.parentDataProperty];
    }
    if (data !== void 0) {
      const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
      dataContextProps(nextData);
      if (propertyName !== void 0)
        subschema2.propertyName = propertyName;
    }
    if (dataTypes)
      subschema2.dataTypes = dataTypes;
    function dataContextProps(_nextData) {
      subschema2.data = _nextData;
      subschema2.dataLevel = it.dataLevel + 1;
      subschema2.dataTypes = [];
      it.definedProperties = /* @__PURE__ */ new Set();
      subschema2.parentData = it.data;
      subschema2.dataNames = [...it.dataNames, _nextData];
    }
  }
  subschema.extendSubschemaData = extendSubschemaData;
  function extendSubschemaMode(subschema2, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
    if (compositeRule !== void 0)
      subschema2.compositeRule = compositeRule;
    if (createErrors !== void 0)
      subschema2.createErrors = createErrors;
    if (allErrors !== void 0)
      subschema2.allErrors = allErrors;
    subschema2.jtdDiscriminator = jtdDiscriminator;
    subschema2.jtdMetadata = jtdMetadata;
  }
  subschema.extendSubschemaMode = extendSubschemaMode;
  return subschema;
}
var resolve = {};
var fastDeepEqual;
var hasRequiredFastDeepEqual;
function requireFastDeepEqual() {
  if (hasRequiredFastDeepEqual) return fastDeepEqual;
  hasRequiredFastDeepEqual = 1;
  fastDeepEqual = function equal2(a, b) {
    if (a === b) return true;
    if (a && b && typeof a == "object" && typeof b == "object") {
      if (a.constructor !== b.constructor) return false;
      var length, i, keys;
      if (Array.isArray(a)) {
        length = a.length;
        if (length != b.length) return false;
        for (i = length; i-- !== 0; )
          if (!equal2(a[i], b[i])) return false;
        return true;
      }
      if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
      if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
      if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length) return false;
      for (i = length; i-- !== 0; )
        if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
      for (i = length; i-- !== 0; ) {
        var key = keys[i];
        if (!equal2(a[key], b[key])) return false;
      }
      return true;
    }
    return a !== a && b !== b;
  };
  return fastDeepEqual;
}
var jsonSchemaTraverse = { exports: {} };
var hasRequiredJsonSchemaTraverse;
function requireJsonSchemaTraverse() {
  if (hasRequiredJsonSchemaTraverse) return jsonSchemaTraverse.exports;
  hasRequiredJsonSchemaTraverse = 1;
  var traverse = jsonSchemaTraverse.exports = function(schema, opts, cb) {
    if (typeof opts == "function") {
      cb = opts;
      opts = {};
    }
    cb = opts.cb || cb;
    var pre = typeof cb == "function" ? cb : cb.pre || function() {
    };
    var post = cb.post || function() {
    };
    _traverse(opts, pre, post, schema, "", schema);
  };
  traverse.keywords = {
    additionalItems: true,
    items: true,
    contains: true,
    additionalProperties: true,
    propertyNames: true,
    not: true,
    if: true,
    then: true,
    else: true
  };
  traverse.arrayKeywords = {
    items: true,
    allOf: true,
    anyOf: true,
    oneOf: true
  };
  traverse.propsKeywords = {
    $defs: true,
    definitions: true,
    properties: true,
    patternProperties: true,
    dependencies: true
  };
  traverse.skipKeywords = {
    default: true,
    enum: true,
    const: true,
    required: true,
    maximum: true,
    minimum: true,
    exclusiveMaximum: true,
    exclusiveMinimum: true,
    multipleOf: true,
    maxLength: true,
    minLength: true,
    pattern: true,
    format: true,
    maxItems: true,
    minItems: true,
    uniqueItems: true,
    maxProperties: true,
    minProperties: true
  };
  function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
    if (schema && typeof schema == "object" && !Array.isArray(schema)) {
      pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      for (var key in schema) {
        var sch = schema[key];
        if (Array.isArray(sch)) {
          if (key in traverse.arrayKeywords) {
            for (var i = 0; i < sch.length; i++)
              _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
          }
        } else if (key in traverse.propsKeywords) {
          if (sch && typeof sch == "object") {
            for (var prop in sch)
              _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
          }
        } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
          _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
        }
      }
      post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
    }
  }
  function escapeJsonPtr(str) {
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  return jsonSchemaTraverse.exports;
}
var hasRequiredResolve;
function requireResolve() {
  if (hasRequiredResolve) return resolve;
  hasRequiredResolve = 1;
  Object.defineProperty(resolve, "__esModule", { value: true });
  resolve.getSchemaRefs = resolve.resolveUrl = resolve.normalizeId = resolve._getFullPath = resolve.getFullPath = resolve.inlineRef = void 0;
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal2 = requireFastDeepEqual();
  const traverse = requireJsonSchemaTraverse();
  const SIMPLE_INLINED = /* @__PURE__ */ new Set([
    "type",
    "format",
    "pattern",
    "maxLength",
    "minLength",
    "maxProperties",
    "minProperties",
    "maxItems",
    "minItems",
    "maximum",
    "minimum",
    "uniqueItems",
    "multipleOf",
    "required",
    "enum",
    "const"
  ]);
  function inlineRef(schema, limit2 = true) {
    if (typeof schema == "boolean")
      return true;
    if (limit2 === true)
      return !hasRef(schema);
    if (!limit2)
      return false;
    return countKeys(schema) <= limit2;
  }
  resolve.inlineRef = inlineRef;
  const REF_KEYWORDS = /* @__PURE__ */ new Set([
    "$ref",
    "$recursiveRef",
    "$recursiveAnchor",
    "$dynamicRef",
    "$dynamicAnchor"
  ]);
  function hasRef(schema) {
    for (const key in schema) {
      if (REF_KEYWORDS.has(key))
        return true;
      const sch = schema[key];
      if (Array.isArray(sch) && sch.some(hasRef))
        return true;
      if (typeof sch == "object" && hasRef(sch))
        return true;
    }
    return false;
  }
  function countKeys(schema) {
    let count = 0;
    for (const key in schema) {
      if (key === "$ref")
        return Infinity;
      count++;
      if (SIMPLE_INLINED.has(key))
        continue;
      if (typeof schema[key] == "object") {
        (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
      }
      if (count === Infinity)
        return Infinity;
    }
    return count;
  }
  function getFullPath(resolver, id2 = "", normalize) {
    if (normalize !== false)
      id2 = normalizeId(id2);
    const p = resolver.parse(id2);
    return _getFullPath(resolver, p);
  }
  resolve.getFullPath = getFullPath;
  function _getFullPath(resolver, p) {
    const serialized = resolver.serialize(p);
    return serialized.split("#")[0] + "#";
  }
  resolve._getFullPath = _getFullPath;
  const TRAILING_SLASH_HASH = /#\/?$/;
  function normalizeId(id2) {
    return id2 ? id2.replace(TRAILING_SLASH_HASH, "") : "";
  }
  resolve.normalizeId = normalizeId;
  function resolveUrl(resolver, baseId, id2) {
    id2 = normalizeId(id2);
    return resolver.resolve(baseId, id2);
  }
  resolve.resolveUrl = resolveUrl;
  const ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
  function getSchemaRefs(schema, baseId) {
    if (typeof schema == "boolean")
      return {};
    const { schemaId, uriResolver } = this.opts;
    const schId = normalizeId(schema[schemaId] || baseId);
    const baseIds = { "": schId };
    const pathPrefix = getFullPath(uriResolver, schId, false);
    const localRefs = {};
    const schemaRefs = /* @__PURE__ */ new Set();
    traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
      if (parentJsonPtr === void 0)
        return;
      const fullPath = pathPrefix + jsonPtr;
      let innerBaseId = baseIds[parentJsonPtr];
      if (typeof sch[schemaId] == "string")
        innerBaseId = addRef.call(this, sch[schemaId]);
      addAnchor.call(this, sch.$anchor);
      addAnchor.call(this, sch.$dynamicAnchor);
      baseIds[jsonPtr] = innerBaseId;
      function addRef(ref2) {
        const _resolve = this.opts.uriResolver.resolve;
        ref2 = normalizeId(innerBaseId ? _resolve(innerBaseId, ref2) : ref2);
        if (schemaRefs.has(ref2))
          throw ambiguos(ref2);
        schemaRefs.add(ref2);
        let schOrRef = this.refs[ref2];
        if (typeof schOrRef == "string")
          schOrRef = this.refs[schOrRef];
        if (typeof schOrRef == "object") {
          checkAmbiguosRef(sch, schOrRef.schema, ref2);
        } else if (ref2 !== normalizeId(fullPath)) {
          if (ref2[0] === "#") {
            checkAmbiguosRef(sch, localRefs[ref2], ref2);
            localRefs[ref2] = sch;
          } else {
            this.refs[ref2] = fullPath;
          }
        }
        return ref2;
      }
      function addAnchor(anchor) {
        if (typeof anchor == "string") {
          if (!ANCHOR.test(anchor))
            throw new Error(`invalid anchor "${anchor}"`);
          addRef.call(this, `#${anchor}`);
        }
      }
    });
    return localRefs;
    function checkAmbiguosRef(sch1, sch2, ref2) {
      if (sch2 !== void 0 && !equal2(sch1, sch2))
        throw ambiguos(ref2);
    }
    function ambiguos(ref2) {
      return new Error(`reference "${ref2}" resolves to more than one schema`);
    }
  }
  resolve.getSchemaRefs = getSchemaRefs;
  return resolve;
}
var hasRequiredValidate;
function requireValidate() {
  if (hasRequiredValidate) return validate;
  hasRequiredValidate = 1;
  Object.defineProperty(validate, "__esModule", { value: true });
  validate.getData = validate.KeywordCxt = validate.validateFunctionCode = void 0;
  const boolSchema_1 = /* @__PURE__ */ requireBoolSchema();
  const dataType_1 = /* @__PURE__ */ requireDataType();
  const applicability_1 = /* @__PURE__ */ requireApplicability();
  const dataType_2 = /* @__PURE__ */ requireDataType();
  const defaults_1 = /* @__PURE__ */ requireDefaults();
  const keyword_1 = /* @__PURE__ */ requireKeyword();
  const subschema_1 = /* @__PURE__ */ requireSubschema();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const resolve_1 = /* @__PURE__ */ requireResolve();
  const util_1 = /* @__PURE__ */ requireUtil();
  const errors_1 = /* @__PURE__ */ requireErrors();
  function validateFunctionCode(it) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        topSchemaObjCode(it);
        return;
      }
    }
    validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
  }
  validate.validateFunctionCode = validateFunctionCode;
  function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
    if (opts.code.es5) {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
        gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
        destructureValCxtES5(gen, opts);
        gen.code(body);
      });
    } else {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
    }
  }
  function destructureValCxt(opts) {
    return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
  }
  function destructureValCxtES5(gen, opts) {
    gen.if(names_1.default.valCxt, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
      gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
    }, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.rootData, names_1.default.data);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
    });
  }
  function topSchemaObjCode(it) {
    const { schema, opts, gen } = it;
    validateFunction(it, () => {
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      checkNoDefault(it);
      gen.let(names_1.default.vErrors, null);
      gen.let(names_1.default.errors, 0);
      if (opts.unevaluated)
        resetEvaluated(it);
      typeAndKeywords(it);
      returnResults(it);
    });
    return;
  }
  function resetEvaluated(it) {
    const { gen, validateName } = it;
    it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
  }
  function funcSourceUrl(schema, opts) {
    const schId = typeof schema == "object" && schema[opts.schemaId];
    return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
  }
  function subschemaCode(it, valid2) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        subSchemaObjCode(it, valid2);
        return;
      }
    }
    (0, boolSchema_1.boolOrEmptySchema)(it, valid2);
  }
  function schemaCxtHasRules({ schema, self }) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (self.RULES.all[key])
        return true;
    return false;
  }
  function isSchemaObj(it) {
    return typeof it.schema != "boolean";
  }
  function subSchemaObjCode(it, valid2) {
    const { schema, gen, opts } = it;
    if (opts.$comment && schema.$comment)
      commentKeyword(it);
    updateContext(it);
    checkAsyncSchema(it);
    const errsCount = gen.const("_errs", names_1.default.errors);
    typeAndKeywords(it, errsCount);
    gen.var(valid2, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
  }
  function checkKeywords(it) {
    (0, util_1.checkUnknownRules)(it);
    checkRefsAndKeywords(it);
  }
  function typeAndKeywords(it, errsCount) {
    if (it.opts.jtd)
      return schemaKeywords(it, [], false, errsCount);
    const types2 = (0, dataType_1.getSchemaTypes)(it.schema);
    const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types2);
    schemaKeywords(it, types2, !checkedTypes, errsCount);
  }
  function checkRefsAndKeywords(it) {
    const { schema, errSchemaPath, opts, self } = it;
    if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
      self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
    }
  }
  function checkNoDefault(it) {
    const { schema, opts } = it;
    if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
      (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
    }
  }
  function updateContext(it) {
    const schId = it.schema[it.opts.schemaId];
    if (schId)
      it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
  }
  function checkAsyncSchema(it) {
    if (it.schema.$async && !it.schemaEnv.$async)
      throw new Error("async schema in sync schema");
  }
  function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
    const msg = schema.$comment;
    if (opts.$comment === true) {
      gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
    } else if (typeof opts.$comment == "function") {
      const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
      const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
      gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
    }
  }
  function returnResults(it) {
    const { gen, schemaEnv, validateName, ValidationError, opts } = it;
    if (schemaEnv.$async) {
      gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
      if (opts.unevaluated)
        assignEvaluated(it);
      gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
    }
  }
  function assignEvaluated({ gen, evaluated, props, items: items2 }) {
    if (props instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.props`, props);
    if (items2 instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.items`, items2);
  }
  function schemaKeywords(it, types2, typeErrors, errsCount) {
    const { gen, schema, data, allErrors, opts, self } = it;
    const { RULES } = self;
    if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
      gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
      return;
    }
    if (!opts.jtd)
      checkStrictTypes(it, types2);
    gen.block(() => {
      for (const group of RULES.rules)
        groupKeywords(group);
      groupKeywords(RULES.post);
    });
    function groupKeywords(group) {
      if (!(0, applicability_1.shouldUseGroup)(schema, group))
        return;
      if (group.type) {
        gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
        iterateKeywords(it, group);
        if (types2.length === 1 && types2[0] === group.type && typeErrors) {
          gen.else();
          (0, dataType_2.reportTypeError)(it);
        }
        gen.endIf();
      } else {
        iterateKeywords(it, group);
      }
      if (!allErrors)
        gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
    }
  }
  function iterateKeywords(it, group) {
    const { gen, schema, opts: { useDefaults } } = it;
    if (useDefaults)
      (0, defaults_1.assignDefaults)(it, group.type);
    gen.block(() => {
      for (const rule of group.rules) {
        if ((0, applicability_1.shouldUseRule)(schema, rule)) {
          keywordCode(it, rule.keyword, rule.definition, group.type);
        }
      }
    });
  }
  function checkStrictTypes(it, types2) {
    if (it.schemaEnv.meta || !it.opts.strictTypes)
      return;
    checkContextTypes(it, types2);
    if (!it.opts.allowUnionTypes)
      checkMultipleTypes(it, types2);
    checkKeywordTypes(it, it.dataTypes);
  }
  function checkContextTypes(it, types2) {
    if (!types2.length)
      return;
    if (!it.dataTypes.length) {
      it.dataTypes = types2;
      return;
    }
    types2.forEach((t) => {
      if (!includesType(it.dataTypes, t)) {
        strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
      }
    });
    narrowSchemaTypes(it, types2);
  }
  function checkMultipleTypes(it, ts) {
    if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
      strictTypesError(it, "use allowUnionTypes to allow union type keyword");
    }
  }
  function checkKeywordTypes(it, ts) {
    const rules2 = it.self.RULES.all;
    for (const keyword2 in rules2) {
      const rule = rules2[keyword2];
      if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
        const { type: type2 } = rule.definition;
        if (type2.length && !type2.some((t) => hasApplicableType(ts, t))) {
          strictTypesError(it, `missing type "${type2.join(",")}" for keyword "${keyword2}"`);
        }
      }
    }
  }
  function hasApplicableType(schTs, kwdT) {
    return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
  }
  function includesType(ts, t) {
    return ts.includes(t) || t === "integer" && ts.includes("number");
  }
  function narrowSchemaTypes(it, withTypes) {
    const ts = [];
    for (const t of it.dataTypes) {
      if (includesType(withTypes, t))
        ts.push(t);
      else if (withTypes.includes("integer") && t === "number")
        ts.push("integer");
    }
    it.dataTypes = ts;
  }
  function strictTypesError(it, msg) {
    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
    msg += ` at "${schemaPath}" (strictTypes)`;
    (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
  }
  class KeywordCxt {
    constructor(it, def, keyword2) {
      (0, keyword_1.validateKeywordUsage)(it, def, keyword2);
      this.gen = it.gen;
      this.allErrors = it.allErrors;
      this.keyword = keyword2;
      this.data = it.data;
      this.schema = it.schema[keyword2];
      this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
      this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword2, this.$data);
      this.schemaType = def.schemaType;
      this.parentSchema = it.schema;
      this.params = {};
      this.it = it;
      this.def = def;
      if (this.$data) {
        this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
      } else {
        this.schemaCode = this.schemaValue;
        if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
          throw new Error(`${keyword2} value must be ${JSON.stringify(def.schemaType)}`);
        }
      }
      if ("code" in def ? def.trackErrors : def.errors !== false) {
        this.errsCount = it.gen.const("_errs", names_1.default.errors);
      }
    }
    result(condition, successAction, failAction) {
      this.failResult((0, codegen_1.not)(condition), successAction, failAction);
    }
    failResult(condition, successAction, failAction) {
      this.gen.if(condition);
      if (failAction)
        failAction();
      else
        this.error();
      if (successAction) {
        this.gen.else();
        successAction();
        if (this.allErrors)
          this.gen.endIf();
      } else {
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
    }
    pass(condition, failAction) {
      this.failResult((0, codegen_1.not)(condition), void 0, failAction);
    }
    fail(condition) {
      if (condition === void 0) {
        this.error();
        if (!this.allErrors)
          this.gen.if(false);
        return;
      }
      this.gen.if(condition);
      this.error();
      if (this.allErrors)
        this.gen.endIf();
      else
        this.gen.else();
    }
    fail$data(condition) {
      if (!this.$data)
        return this.fail(condition);
      const { schemaCode } = this;
      this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
    }
    error(append2, errorParams, errorPaths) {
      if (errorParams) {
        this.setParams(errorParams);
        this._error(append2, errorPaths);
        this.setParams({});
        return;
      }
      this._error(append2, errorPaths);
    }
    _error(append2, errorPaths) {
      (append2 ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
    }
    $dataError() {
      (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
    }
    reset() {
      if (this.errsCount === void 0)
        throw new Error('add "trackErrors" to keyword definition');
      (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
    }
    ok(cond) {
      if (!this.allErrors)
        this.gen.if(cond);
    }
    setParams(obj, assign) {
      if (assign)
        Object.assign(this.params, obj);
      else
        this.params = obj;
    }
    block$data(valid2, codeBlock, $dataValid = codegen_1.nil) {
      this.gen.block(() => {
        this.check$data(valid2, $dataValid);
        codeBlock();
      });
    }
    check$data(valid2 = codegen_1.nil, $dataValid = codegen_1.nil) {
      if (!this.$data)
        return;
      const { gen, schemaCode, schemaType, def } = this;
      gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
      if (valid2 !== codegen_1.nil)
        gen.assign(valid2, true);
      if (schemaType.length || def.validateSchema) {
        gen.elseIf(this.invalid$data());
        this.$dataError();
        if (valid2 !== codegen_1.nil)
          gen.assign(valid2, false);
      }
      gen.else();
    }
    invalid$data() {
      const { gen, schemaCode, schemaType, def, it } = this;
      return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
      function wrong$DataType() {
        if (schemaType.length) {
          if (!(schemaCode instanceof codegen_1.Name))
            throw new Error("ajv implementation error");
          const st = Array.isArray(schemaType) ? schemaType : [schemaType];
          return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
        }
        return codegen_1.nil;
      }
      function invalid$DataSchema() {
        if (def.validateSchema) {
          const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
          return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
        }
        return codegen_1.nil;
      }
    }
    subschema(appl, valid2) {
      const subschema2 = (0, subschema_1.getSubschema)(this.it, appl);
      (0, subschema_1.extendSubschemaData)(subschema2, this.it, appl);
      (0, subschema_1.extendSubschemaMode)(subschema2, appl);
      const nextContext = { ...this.it, ...subschema2, items: void 0, props: void 0 };
      subschemaCode(nextContext, valid2);
      return nextContext;
    }
    mergeEvaluated(schemaCxt, toName) {
      const { it, gen } = this;
      if (!it.opts.unevaluated)
        return;
      if (it.props !== true && schemaCxt.props !== void 0) {
        it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
      }
      if (it.items !== true && schemaCxt.items !== void 0) {
        it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
      }
    }
    mergeValidEvaluated(schemaCxt, valid2) {
      const { it, gen } = this;
      if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
        gen.if(valid2, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
        return true;
      }
    }
  }
  validate.KeywordCxt = KeywordCxt;
  function keywordCode(it, keyword2, def, ruleType) {
    const cxt = new KeywordCxt(it, def, keyword2);
    if ("code" in def) {
      def.code(cxt, ruleType);
    } else if (cxt.$data && def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    } else if ("macro" in def) {
      (0, keyword_1.macroKeywordCode)(cxt, def);
    } else if (def.compile || def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    }
  }
  const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
  const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
  function getData($data, { dataLevel, dataNames, dataPathArr }) {
    let jsonPointer;
    let data;
    if ($data === "")
      return names_1.default.rootData;
    if ($data[0] === "/") {
      if (!JSON_POINTER.test($data))
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      jsonPointer = $data;
      data = names_1.default.rootData;
    } else {
      const matches = RELATIVE_JSON_POINTER.exec($data);
      if (!matches)
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      const up = +matches[1];
      jsonPointer = matches[2];
      if (jsonPointer === "#") {
        if (up >= dataLevel)
          throw new Error(errorMsg("property/index", up));
        return dataPathArr[dataLevel - up];
      }
      if (up > dataLevel)
        throw new Error(errorMsg("data", up));
      data = dataNames[dataLevel - up];
      if (!jsonPointer)
        return data;
    }
    let expr = data;
    const segments = jsonPointer.split("/");
    for (const segment of segments) {
      if (segment) {
        data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
        expr = (0, codegen_1._)`${expr} && ${data}`;
      }
    }
    return expr;
    function errorMsg(pointerType, up) {
      return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
    }
  }
  validate.getData = getData;
  return validate;
}
var validation_error = {};
var hasRequiredValidation_error;
function requireValidation_error() {
  if (hasRequiredValidation_error) return validation_error;
  hasRequiredValidation_error = 1;
  Object.defineProperty(validation_error, "__esModule", { value: true });
  class ValidationError extends Error {
    constructor(errors2) {
      super("validation failed");
      this.errors = errors2;
      this.ajv = this.validation = true;
    }
  }
  validation_error.default = ValidationError;
  return validation_error;
}
var ref_error = {};
var hasRequiredRef_error;
function requireRef_error() {
  if (hasRequiredRef_error) return ref_error;
  hasRequiredRef_error = 1;
  Object.defineProperty(ref_error, "__esModule", { value: true });
  const resolve_1 = /* @__PURE__ */ requireResolve();
  class MissingRefError extends Error {
    constructor(resolver, baseId, ref2, msg) {
      super(msg || `can't resolve reference ${ref2} from id ${baseId}`);
      this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref2);
      this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
    }
  }
  ref_error.default = MissingRefError;
  return ref_error;
}
var compile = {};
var hasRequiredCompile;
function requireCompile() {
  if (hasRequiredCompile) return compile;
  hasRequiredCompile = 1;
  Object.defineProperty(compile, "__esModule", { value: true });
  compile.resolveSchema = compile.getCompilingSchema = compile.resolveRef = compile.compileSchema = compile.SchemaEnv = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const validation_error_1 = /* @__PURE__ */ requireValidation_error();
  const names_1 = /* @__PURE__ */ requireNames();
  const resolve_1 = /* @__PURE__ */ requireResolve();
  const util_1 = /* @__PURE__ */ requireUtil();
  const validate_1 = /* @__PURE__ */ requireValidate();
  class SchemaEnv {
    constructor(env2) {
      var _a;
      this.refs = {};
      this.dynamicAnchors = {};
      let schema;
      if (typeof env2.schema == "object")
        schema = env2.schema;
      this.schema = env2.schema;
      this.schemaId = env2.schemaId;
      this.root = env2.root || this;
      this.baseId = (_a = env2.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env2.schemaId || "$id"]);
      this.schemaPath = env2.schemaPath;
      this.localRefs = env2.localRefs;
      this.meta = env2.meta;
      this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
      this.refs = {};
    }
  }
  compile.SchemaEnv = SchemaEnv;
  function compileSchema(sch) {
    const _sch = getCompilingSchema.call(this, sch);
    if (_sch)
      return _sch;
    const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
    const { es5, lines } = this.opts.code;
    const { ownProperties } = this.opts;
    const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
    let _ValidationError;
    if (sch.$async) {
      _ValidationError = gen.scopeValue("Error", {
        ref: validation_error_1.default,
        code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
      });
    }
    const validateName = gen.scopeName("validate");
    sch.validateName = validateName;
    const schemaCxt = {
      gen,
      allErrors: this.opts.allErrors,
      data: names_1.default.data,
      parentData: names_1.default.parentData,
      parentDataProperty: names_1.default.parentDataProperty,
      dataNames: [names_1.default.data],
      dataPathArr: [codegen_1.nil],
      // TODO can its length be used as dataLevel if nil is removed?
      dataLevel: 0,
      dataTypes: [],
      definedProperties: /* @__PURE__ */ new Set(),
      topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
      validateName,
      ValidationError: _ValidationError,
      schema: sch.schema,
      schemaEnv: sch,
      rootId,
      baseId: sch.baseId || rootId,
      schemaPath: codegen_1.nil,
      errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
      errorPath: (0, codegen_1._)`""`,
      opts: this.opts,
      self: this
    };
    let sourceCode;
    try {
      this._compilations.add(sch);
      (0, validate_1.validateFunctionCode)(schemaCxt);
      gen.optimize(this.opts.code.optimize);
      const validateCode = gen.toString();
      sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
      if (this.opts.code.process)
        sourceCode = this.opts.code.process(sourceCode, sch);
      const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
      const validate2 = makeValidate(this, this.scope.get());
      this.scope.value(validateName, { ref: validate2 });
      validate2.errors = null;
      validate2.schema = sch.schema;
      validate2.schemaEnv = sch;
      if (sch.$async)
        validate2.$async = true;
      if (this.opts.code.source === true) {
        validate2.source = { validateName, validateCode, scopeValues: gen._values };
      }
      if (this.opts.unevaluated) {
        const { props, items: items2 } = schemaCxt;
        validate2.evaluated = {
          props: props instanceof codegen_1.Name ? void 0 : props,
          items: items2 instanceof codegen_1.Name ? void 0 : items2,
          dynamicProps: props instanceof codegen_1.Name,
          dynamicItems: items2 instanceof codegen_1.Name
        };
        if (validate2.source)
          validate2.source.evaluated = (0, codegen_1.stringify)(validate2.evaluated);
      }
      sch.validate = validate2;
      return sch;
    } catch (e) {
      delete sch.validate;
      delete sch.validateName;
      if (sourceCode)
        this.logger.error("Error compiling schema, function code:", sourceCode);
      throw e;
    } finally {
      this._compilations.delete(sch);
    }
  }
  compile.compileSchema = compileSchema;
  function resolveRef(root2, baseId, ref2) {
    var _a;
    ref2 = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref2);
    const schOrFunc = root2.refs[ref2];
    if (schOrFunc)
      return schOrFunc;
    let _sch = resolve2.call(this, root2, ref2);
    if (_sch === void 0) {
      const schema = (_a = root2.localRefs) === null || _a === void 0 ? void 0 : _a[ref2];
      const { schemaId } = this.opts;
      if (schema)
        _sch = new SchemaEnv({ schema, schemaId, root: root2, baseId });
    }
    if (_sch === void 0)
      return;
    return root2.refs[ref2] = inlineOrCompile.call(this, _sch);
  }
  compile.resolveRef = resolveRef;
  function inlineOrCompile(sch) {
    if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
      return sch.schema;
    return sch.validate ? sch : compileSchema.call(this, sch);
  }
  function getCompilingSchema(schEnv) {
    for (const sch of this._compilations) {
      if (sameSchemaEnv(sch, schEnv))
        return sch;
    }
  }
  compile.getCompilingSchema = getCompilingSchema;
  function sameSchemaEnv(s1, s2) {
    return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
  }
  function resolve2(root2, ref2) {
    let sch;
    while (typeof (sch = this.refs[ref2]) == "string")
      ref2 = sch;
    return sch || this.schemas[ref2] || resolveSchema.call(this, root2, ref2);
  }
  function resolveSchema(root2, ref2) {
    const p = this.opts.uriResolver.parse(ref2);
    const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
    let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root2.baseId, void 0);
    if (Object.keys(root2.schema).length > 0 && refPath === baseId) {
      return getJsonPointer.call(this, p, root2);
    }
    const id2 = (0, resolve_1.normalizeId)(refPath);
    const schOrRef = this.refs[id2] || this.schemas[id2];
    if (typeof schOrRef == "string") {
      const sch = resolveSchema.call(this, root2, schOrRef);
      if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
        return;
      return getJsonPointer.call(this, p, sch);
    }
    if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
      return;
    if (!schOrRef.validate)
      compileSchema.call(this, schOrRef);
    if (id2 === (0, resolve_1.normalizeId)(ref2)) {
      const { schema } = schOrRef;
      const { schemaId } = this.opts;
      const schId = schema[schemaId];
      if (schId)
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      return new SchemaEnv({ schema, schemaId, root: root2, baseId });
    }
    return getJsonPointer.call(this, p, schOrRef);
  }
  compile.resolveSchema = resolveSchema;
  const PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
    "properties",
    "patternProperties",
    "enum",
    "dependencies",
    "definitions"
  ]);
  function getJsonPointer(parsedRef, { baseId, schema, root: root2 }) {
    var _a;
    if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
      return;
    for (const part of parsedRef.fragment.slice(1).split("/")) {
      if (typeof schema === "boolean")
        return;
      const partSchema = schema[(0, util_1.unescapeFragment)(part)];
      if (partSchema === void 0)
        return;
      schema = partSchema;
      const schId = typeof schema === "object" && schema[this.opts.schemaId];
      if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      }
    }
    let env2;
    if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
      const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
      env2 = resolveSchema.call(this, root2, $ref);
    }
    const { schemaId } = this.opts;
    env2 = env2 || new SchemaEnv({ schema, schemaId, root: root2, baseId });
    if (env2.schema !== env2.root.schema)
      return env2;
    return void 0;
  }
  return compile;
}
const $id$9 = "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#";
const description = "Meta-schema for $data reference (JSON AnySchema extension proposal)";
const type$9 = "object";
const required$1 = ["$data"];
const properties$a = { "$data": { "type": "string", "anyOf": [{ "format": "relative-json-pointer" }, { "format": "json-pointer" }] } };
const additionalProperties$1 = false;
const require$$9 = {
  $id: $id$9,
  description,
  type: type$9,
  required: required$1,
  properties: properties$a,
  additionalProperties: additionalProperties$1
};
var uri = {};
var fastUri = { exports: {} };
var utils;
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  const isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
  const isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
  const isPort = RegExp.prototype.test.bind(/^\d*$/u);
  const isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
  const isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
  const isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
  const isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
  const isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
  const BYTE_HEX = new Array(256);
  {
    const HEX_DIGITS = "0123456789ABCDEF";
    for (let i = 0; i < 256; i++) {
      BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
    }
  }
  function percentEncodeNonAscii(cp) {
    if (cp < 2048) {
      return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
    }
    if (cp < 65536) {
      return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
    }
    return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
  }
  function stringArrayToHexStripped(input) {
    let acc = "";
    let code2 = 0;
    let i = 0;
    for (i = 0; i < input.length; i++) {
      code2 = input[i].charCodeAt(0);
      if (code2 === 48) {
        continue;
      }
      if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
        return "";
      }
      acc += input[i];
      break;
    }
    for (i += 1; i < input.length; i++) {
      code2 = input[i].charCodeAt(0);
      if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
        return "";
      }
      acc += input[i];
    }
    return acc;
  }
  const isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
  const isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
  const isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
  const nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
  function isZoneIdentifier(zone) {
    if (zone.length === 0) return false;
    for (let i = 0; i < zone.length; i++) {
      if (isZoneCharacter(zone[i])) continue;
      if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
        i += 2;
        continue;
      }
      return false;
    }
    return true;
  }
  function compressIPv6ZeroRun(hextets) {
    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;
    let runLength = 0;
    for (let i = 0; i < hextets.length; i++) {
      if (hextets[i] === "0") {
        if (runStart === -1) runStart = i;
        runLength++;
        if (runLength > bestLength) {
          bestLength = runLength;
          bestStart = runStart;
        }
      } else {
        runStart = -1;
        runLength = 0;
      }
    }
    if (bestLength < 2) return hextets.join(":");
    const head = hextets.slice(0, bestStart).join(":");
    const tail = hextets.slice(bestStart + bestLength).join(":");
    return head + "::" + tail;
  }
  function normalizeIPv6Address(input) {
    const compression = input.indexOf("::");
    if (compression !== -1 && input.indexOf("::", compression + 1) !== -1) return void 0;
    const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
    const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
    if (compression !== -1) {
      if (left.length === 1 && left[0] === "") left.length = 0;
      if (right.length === 1 && right[0] === "") right.length = 0;
    }
    const parts = left.concat(right);
    let hextetCount = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === "") return void 0;
      if (part.indexOf(".") !== -1) {
        if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part)) return void 0;
        hextetCount += 2;
        continue;
      }
      if (!isHextet(part)) return void 0;
      parts[i] = parseInt(part, 16).toString(16);
      hextetCount++;
    }
    if (compression === -1) {
      if (hextetCount !== 8) return void 0;
      return compressIPv6ZeroRun(parts);
    }
    if (hextetCount >= 8) return void 0;
    const expanded = parts.slice(0, left.length);
    for (let i = hextetCount; i < 8; i++) expanded.push("0");
    for (let i = left.length; i < parts.length; i++) expanded.push(parts[i]);
    return compressIPv6ZeroRun(expanded);
  }
  function normalizeIPv6(host) {
    const bracketed = host[0] === "[" && host[host.length - 1] === "]";
    const hasBracket = host[0] === "[" || host[host.length - 1] === "]";
    if (hasBracket && !bracketed) return { host, isIPV6: false, error: true };
    let input = bracketed ? host.slice(1, -1) : host;
    if (bracketed && isIPvFuture(input)) {
      input = input.toLowerCase();
      return { host: `[${input}]`, escapedHost: input, isIPV6: false, isIPVFuture: true };
    }
    if (findToken(input, ":") < 2) {
      return { host, isIPV6: false, error: bracketed };
    }
    let zoneIdentifier = "";
    const zoneSeparator = input.indexOf("%");
    if (zoneSeparator !== -1) {
      const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
      zoneIdentifier = input.slice(zoneSeparator + separatorLength);
      if (!isZoneIdentifier(zoneIdentifier)) return { host, isIPV6: false, error: true };
      input = input.slice(0, zoneSeparator);
    }
    const address = normalizeIPv6Address(input);
    if (address === void 0) return { host, isIPV6: false, error: true };
    return {
      host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
      escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
      isIPV6: true
    };
  }
  function findToken(str, token) {
    let ind = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === token) ind++;
    }
    return ind;
  }
  function removeDotSegments(path2) {
    let input = path2;
    const output = [];
    let nextSlash = -1;
    let len = 0;
    while (len = input.length) {
      if (len === 1) {
        if (input === ".") {
          break;
        } else if (input === "/") {
          output.push("/");
          break;
        } else {
          output.push(input);
          break;
        }
      } else if (len === 2) {
        if (input[0] === ".") {
          if (input[1] === ".") {
            break;
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === "." || input[1] === "/") {
            output.push("/");
            break;
          }
        }
      } else if (len === 3) {
        if (input === "/..") {
          if (output.length !== 0) {
            output.pop();
          }
          output.push("/");
          break;
        }
      }
      if (input[0] === ".") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(3);
            continue;
          }
        } else if (input[1] === "/") {
          input = input.slice(2);
          continue;
        }
      } else if (input[0] === "/") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(2);
            continue;
          } else if (input[2] === ".") {
            if (input[3] === "/") {
              input = input.slice(3);
              if (output.length !== 0) {
                output.pop();
              }
              continue;
            }
          }
        }
      }
      if ((nextSlash = input.indexOf("/", 1)) === -1) {
        output.push(input);
        break;
      } else {
        output.push(input.slice(0, nextSlash));
        input = input.slice(nextSlash);
      }
    }
    return output.join("");
  }
  const HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
  const HOST_DELIM_RE = /[@/?#:]/g;
  const HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
  function reescapeHostDelimiters(host, isIP) {
    const re2 = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
    re2.lastIndex = 0;
    return host.replace(re2, (ch) => HOST_DELIMS[ch]);
  }
  function normalizePercentEncoding(input, decodeUnreserved = false) {
    if (input.indexOf("%") === -1) {
      return input;
    }
    let output = "";
    for (let i = 0; i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decodeUnreserved && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      output += input[i];
    }
    return output;
  }
  function normalizePathEncoding(input) {
    let output = "";
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decoded !== "." && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      if (isPathCharacter(ch)) {
        output += ch;
      } else {
        const code2 = input.charCodeAt(i);
        if (code2 < 128) {
          output += isEscapeSafe(code2) ? ch : BYTE_HEX[code2];
        } else if (code2 < 55296 || code2 > 57343) {
          output += percentEncodeNonAscii(code2);
        } else if (code2 <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function serializePathEncoding(input, pathNoScheme = false) {
    let output = "";
    let firstSegment = pathNoScheme && input[0] !== "/";
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      if (ch === "/") {
        firstSegment = false;
      }
      if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) {
        output += ch;
      } else {
        const code2 = input.charCodeAt(i);
        if (code2 < 128) {
          output += BYTE_HEX[code2];
        } else if (code2 < 55296 || code2 > 57343) {
          output += percentEncodeNonAscii(code2);
        } else if (code2 <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function encodeComponent(input, isAllowed) {
    let output = "";
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      if (isAllowed(ch)) {
        output += ch;
      } else {
        const code2 = input.charCodeAt(i);
        if (code2 < 128) {
          output += BYTE_HEX[code2];
        } else if (code2 < 55296 || code2 > 57343) {
          output += percentEncodeNonAscii(code2);
        } else if (code2 <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function encodeUserinfo(input) {
    return encodeComponent(input, isUserinfoCharacter);
  }
  function encodeQuery(input) {
    return encodeComponent(input, isQueryFragmentCharacter);
  }
  function encodeFragment(input) {
    return encodeComponent(input, isQueryFragmentCharacter);
  }
  function isEscapeSafe(cp) {
    return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
  }
  function normalizeQueryFragmentEncoding(input) {
    let output = "";
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      if (isQueryFragmentCharacter(ch)) {
        output += ch;
      } else {
        const code2 = input.charCodeAt(i);
        if (code2 < 128) {
          output += isEscapeSafe(code2) ? ch : BYTE_HEX[code2];
        } else if (code2 < 55296 || code2 > 57343) {
          output += percentEncodeNonAscii(code2);
        } else if (code2 <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code2 - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function escapePreservingEscapes(input) {
    let output = "";
    for (let i = 0; i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      output += escape(input[i]);
    }
    return output;
  }
  function recomposeAuthority(component) {
    const uriTokens = [];
    if (component.userinfo !== void 0) {
      uriTokens.push(encodeUserinfo(component.userinfo));
      uriTokens.push("@");
    }
    if (component.host !== void 0) {
      let host = component.host;
      if (!isIPv4(host)) {
        let ipV6res = normalizeIPv6(host);
        if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
          host = normalizePercentEncoding(host, true);
          ipV6res = normalizeIPv6(host);
        }
        if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) {
          host = `[${ipV6res.escapedHost}]`;
        } else {
          host = reescapeHostDelimiters(host, false);
        }
      }
      uriTokens.push(host);
    }
    if (typeof component.port === "number" || typeof component.port === "string") {
      const port = String(component.port);
      if (!isPort(port)) {
        throw new TypeError("URI port is malformed.");
      }
      uriTokens.push(":");
      uriTokens.push(port);
    }
    return uriTokens.length ? uriTokens.join("") : void 0;
  }
  utils = {
    nonSimpleDomain,
    recomposeAuthority,
    reescapeHostDelimiters,
    normalizePercentEncoding,
    normalizePathEncoding,
    serializePathEncoding,
    normalizeQueryFragmentEncoding,
    encodeUserinfo,
    encodeQuery,
    encodeFragment,
    escapePreservingEscapes,
    removeDotSegments,
    isIPv4,
    isUUID,
    normalizeIPv6,
    stringArrayToHexStripped
  };
  return utils;
}
var schemes;
var hasRequiredSchemes;
function requireSchemes() {
  if (hasRequiredSchemes) return schemes;
  hasRequiredSchemes = 1;
  const { isUUID } = requireUtils();
  const URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
  const supportedSchemeNames = (
    /** @type {const} */
    [
      "http",
      "https",
      "ws",
      "wss",
      "urn",
      "urn:uuid"
    ]
  );
  function isValidSchemeName(name) {
    return supportedSchemeNames.indexOf(
      /** @type {*} */
      name
    ) !== -1;
  }
  function wsIsSecure(wsComponent) {
    if (wsComponent.secure === true) {
      return true;
    } else if (wsComponent.secure === false) {
      return false;
    } else if (wsComponent.scheme) {
      return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
    } else {
      return false;
    }
  }
  function httpParse(component) {
    if (!component.host) {
      component.error = component.error || "HTTP URIs must have a host.";
    }
    return component;
  }
  function httpSerialize(component) {
    const secure = String(component.scheme).toLowerCase() === "https";
    if (component.port === (secure ? 443 : 80) || component.port === "") {
      component.port = void 0;
    }
    if (!component.path) {
      component.path = "/";
    }
    return component;
  }
  function wsParse(wsComponent) {
    wsComponent.secure = wsIsSecure(wsComponent);
    wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
    wsComponent.path = void 0;
    wsComponent.query = void 0;
    return wsComponent;
  }
  function wsSerialize(wsComponent) {
    if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
      wsComponent.port = void 0;
    }
    if (typeof wsComponent.secure === "boolean") {
      wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
      wsComponent.secure = void 0;
    }
    if (wsComponent.resourceName) {
      const queryIndex = wsComponent.resourceName.indexOf("?");
      const path2 = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
      wsComponent.path = path2 && path2 !== "/" ? path2 : void 0;
      wsComponent.query = queryIndex === -1 ? void 0 : wsComponent.resourceName.slice(queryIndex + 1);
      wsComponent.resourceName = void 0;
    }
    wsComponent.fragment = void 0;
    return wsComponent;
  }
  function urnParse(urnComponent, options) {
    if (!urnComponent.path) {
      urnComponent.error = "URN can not be parsed";
      return urnComponent;
    }
    const matches = urnComponent.path.match(URN_REG);
    if (matches && matches[0] === urnComponent.path) {
      const scheme = options.scheme || urnComponent.scheme || "urn";
      urnComponent.nid = matches[1].toLowerCase();
      urnComponent.nss = matches[2];
      const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      urnComponent.path = void 0;
      if (schemeHandler) {
        urnComponent = schemeHandler.parse(urnComponent, options);
      }
    } else {
      urnComponent.error = urnComponent.error || "URN can not be parsed.";
    }
    return urnComponent;
  }
  function urnSerialize(urnComponent, options) {
    if (urnComponent.nid === void 0) {
      throw new Error("URN without nid cannot be serialized");
    }
    const scheme = options.scheme || urnComponent.scheme || "urn";
    const nid = urnComponent.nid.toLowerCase();
    const urnScheme = `${scheme}:${options.nid || nid}`;
    const schemeHandler = getSchemeHandler(urnScheme);
    if (schemeHandler) {
      urnComponent = schemeHandler.serialize(urnComponent, options);
    }
    const uriComponent = urnComponent;
    const nss = urnComponent.nss;
    uriComponent.path = `${nid || options.nid}:${nss}`;
    options.skipEscape = true;
    return uriComponent;
  }
  function urnuuidParse(urnComponent, options) {
    const uuidComponent = urnComponent;
    uuidComponent.uuid = uuidComponent.nss;
    uuidComponent.nss = void 0;
    if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
      uuidComponent.error = uuidComponent.error || "UUID is not valid.";
    }
    return uuidComponent;
  }
  function urnuuidSerialize(uuidComponent) {
    const urnComponent = uuidComponent;
    urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
    return urnComponent;
  }
  const http = (
    /** @type {SchemeHandler} */
    {
      scheme: "http",
      domainHost: true,
      parse: httpParse,
      serialize: httpSerialize
    }
  );
  const https = (
    /** @type {SchemeHandler} */
    {
      scheme: "https",
      domainHost: http.domainHost,
      parse: httpParse,
      serialize: httpSerialize
    }
  );
  const ws = (
    /** @type {SchemeHandler} */
    {
      scheme: "ws",
      domainHost: true,
      parse: wsParse,
      serialize: wsSerialize
    }
  );
  const wss = (
    /** @type {SchemeHandler} */
    {
      scheme: "wss",
      domainHost: ws.domainHost,
      parse: ws.parse,
      serialize: ws.serialize
    }
  );
  const urn = (
    /** @type {SchemeHandler} */
    {
      scheme: "urn",
      parse: urnParse,
      serialize: urnSerialize,
      skipNormalize: true
    }
  );
  const urnuuid = (
    /** @type {SchemeHandler} */
    {
      scheme: "urn:uuid",
      parse: urnuuidParse,
      serialize: urnuuidSerialize,
      skipNormalize: true
    }
  );
  const SCHEMES = (
    /** @type {Record<SchemeName, SchemeHandler>} */
    {
      http,
      https,
      ws,
      wss,
      urn,
      "urn:uuid": urnuuid
    }
  );
  Object.setPrototypeOf(SCHEMES, null);
  function getSchemeHandler(scheme) {
    return scheme && (SCHEMES[
      /** @type {SchemeName} */
      scheme
    ] || SCHEMES[
      /** @type {SchemeName} */
      scheme.toLowerCase()
    ]) || void 0;
  }
  schemes = {
    wsIsSecure,
    SCHEMES,
    isValidSchemeName,
    getSchemeHandler
  };
  return schemes;
}
var hasRequiredFastUri;
function requireFastUri() {
  if (hasRequiredFastUri) return fastUri.exports;
  hasRequiredFastUri = 1;
  const { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = requireUtils();
  const { SCHEMES, getSchemeHandler } = requireSchemes();
  const VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
  const MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
  function decodeValidScheme(scheme) {
    const decodedScheme = unescape(String(scheme));
    if (!VALID_SCHEME.test(decodedScheme)) {
      throw new TypeError(MALFORMED_SCHEME_ERROR);
    }
    return decodedScheme;
  }
  function normalize(uri2, options) {
    if (typeof uri2 === "string") {
      uri2 = /** @type {T} */
      normalizeString(uri2, options);
    } else if (typeof uri2 === "object") {
      uri2 = /** @type {T} */
      parse(serialize(uri2, options), options);
    }
    return uri2;
  }
  function resolve2(baseURI, relativeURI, options) {
    const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
    const {
      parsed: baseParsed,
      malformedAuthorityOrPort: baseMalformed,
      malformedPercentEncoding: baseMalformedPercentEncoding,
      malformedSchemeSpecific: baseMalformedSchemeSpecific,
      malformedHost: baseMalformedHost,
      malformedScheme: baseMalformedScheme
    } = parseWithStatus(baseURI, schemelessOptions);
    const {
      parsed: relativeParsed,
      malformedAuthorityOrPort: relativeMalformed,
      malformedPercentEncoding: relativeMalformedPercentEncoding,
      malformedSchemeSpecific: relativeMalformedSchemeSpecific,
      malformedHost: relativeMalformedHost,
      malformedScheme: relativeMalformedScheme
    } = parseWithStatus(relativeURI, schemelessOptions);
    if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) {
      throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
    }
    const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
    const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
    const resolvedHost = resolved.host;
    const resolvedHostIsIP = resolvedHost !== void 0 && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
    canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
    const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !new RegExp("\\P{ASCII}", "u").test(resolvedHost);
    if (resolved.error && !encodedASCIIHost) {
      throw new Error(resolved.error);
    }
    schemelessOptions.skipEscape = true;
    return serialize(resolved, schemelessOptions);
  }
  function resolveComponent(base, relative, options, skipNormalization) {
    const target = {};
    if (!skipNormalization) {
      base = parse(serialize(base, options), options);
      relative = parse(serialize(relative, options), options);
    }
    options = options || {};
    if (!options.tolerant && relative.scheme) {
      target.scheme = relative.scheme;
      target.userinfo = relative.userinfo;
      target.host = relative.host;
      target.port = relative.port;
      target.path = removeDotSegments(relative.path || "");
      target.query = relative.query;
    } else {
      if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (!relative.path) {
          target.path = base.path;
          if (relative.query !== void 0) {
            target.query = relative.query;
          } else {
            target.query = base.query;
          }
        } else {
          if (relative.path[0] === "/") {
            target.path = removeDotSegments(relative.path);
          } else {
            if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
              target.path = "/" + relative.path;
            } else if (!base.path) {
              target.path = relative.path;
            } else {
              target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
            }
            target.path = removeDotSegments(target.path);
          }
          target.query = relative.query;
        }
        target.userinfo = base.userinfo;
        target.host = base.host;
        target.port = base.port;
      }
      target.scheme = base.scheme;
    }
    target.fragment = relative.fragment;
    return target;
  }
  function equal2(uriA, uriB, options) {
    const normalizedA = normalizeComparableURI(uriA, options);
    const normalizedB = normalizeComparableURI(uriB, options);
    return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA === normalizedB;
  }
  function serialize(cmpts, opts) {
    const component = {
      host: cmpts.host,
      scheme: cmpts.scheme,
      userinfo: cmpts.userinfo,
      port: cmpts.port,
      path: cmpts.path,
      query: cmpts.query,
      nid: cmpts.nid,
      nss: cmpts.nss,
      uuid: cmpts.uuid,
      fragment: cmpts.fragment,
      reference: cmpts.reference,
      resourceName: cmpts.resourceName,
      secure: cmpts.secure,
      error: ""
    };
    const options = Object.assign({}, opts);
    const uriTokens = [];
    if (component.scheme) {
      component.scheme = decodeValidScheme(component.scheme);
    }
    const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
    if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
    const hasAuthority = component.userinfo !== void 0 || component.host !== void 0 || component.port !== void 0;
    const pathNoScheme = !options.skipEscape && component.scheme === void 0 && !hasAuthority;
    if (component.path !== void 0) {
      if (!options.skipEscape) {
        component.path = serializePathEncoding(component.path, pathNoScheme);
      } else {
        component.path = normalizePercentEncoding(component.path);
      }
    }
    if (options.reference !== "suffix" && component.scheme) {
      component.scheme = decodeValidScheme(component.scheme);
      uriTokens.push(component.scheme, ":");
    }
    const authority = recomposeAuthority(component);
    if (authority !== void 0) {
      if (options.reference !== "suffix") {
        uriTokens.push("//");
      }
      uriTokens.push(authority);
      if (component.path && component.path[0] !== "/") {
        uriTokens.push("/");
      }
    }
    if (component.path !== void 0) {
      let s = component.path;
      if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
        s = removeDotSegments(s);
      }
      if (pathNoScheme) {
        s = serializePathEncoding(s, true);
      }
      if (authority === void 0 && s[0] === "/" && s[1] === "/") {
        s = "/%2F" + s.slice(2);
      }
      uriTokens.push(s);
    }
    if (component.query !== void 0) {
      uriTokens.push("?", encodeQuery(component.query));
    }
    if (component.fragment !== void 0) {
      uriTokens.push("#", encodeFragment(component.fragment));
    }
    return uriTokens.join("");
  }
  const URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
  const AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
  const AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
  function getParseError(parsed, matches) {
    if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
      return 'URI path must start with "/" when authority is present.';
    }
    if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
      return "URI port is malformed.";
    }
    return void 0;
  }
  function hasMalformedPercentEncoding(component) {
    if (component === void 0) return false;
    let percent = component.indexOf("%");
    while (percent !== -1) {
      if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) {
        return true;
      }
      percent = component.indexOf("%", percent + 3);
    }
    return false;
  }
  function isIPLiteral(host) {
    return host[0] === "[" && host[host.length - 1] === "]";
  }
  function hasMalformedComponentPercentEncoding(matches) {
    const host = matches[4];
    return hasMalformedPercentEncoding(matches[3]) || host !== void 0 && !isIPLiteral(host) && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
  }
  function canonicalizeHost(parsed, options, schemeHandler, isIP) {
    if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
      try {
        parsed.host = new URL("http://" + parsed.host).hostname;
      } catch (e) {
        parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
        return true;
      }
    }
    return false;
  }
  function parseWithStatus(uri2, opts) {
    const options = Object.assign({}, opts);
    const parsed = {
      scheme: void 0,
      userinfo: void 0,
      host: "",
      port: void 0,
      path: "",
      query: void 0,
      fragment: void 0
    };
    let malformedAuthorityOrPort = false;
    let malformedPercentEncoding = false;
    let malformedSchemeSpecific = false;
    let malformedHost = false;
    let malformedIPLiteral = false;
    let malformedScheme = false;
    let isIP = false;
    if (options.reference === "suffix") {
      if (options.scheme) {
        uri2 = options.scheme + ":" + uri2;
      } else {
        uri2 = "//" + uri2;
      }
    }
    const authorityMatch = uri2.match(AUTHORITY_PREFIX);
    if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
      parsed.error = "URI authority must not contain a literal backslash.";
      malformedAuthorityOrPort = true;
    }
    const introducerMatch = uri2.match(AUTHORITY_INTRODUCER_REGION);
    if (introducerMatch !== null) {
      const region = introducerMatch[1];
      const normalizedRegion = region.replace(/[\t\n\r]/g, "");
      if (normalizedRegion.length >= 2) {
        if (normalizedRegion.slice(0, 2) !== "//") {
          parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
          malformedAuthorityOrPort = true;
        } else if (region.length !== normalizedRegion.length) {
          parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
          malformedAuthorityOrPort = true;
        }
      }
    }
    const matches = uri2.match(URI_PARSE);
    if (matches) {
      parsed.scheme = matches[1];
      parsed.userinfo = matches[3];
      parsed.host = matches[4];
      parsed.port = parseInt(matches[5], 10);
      parsed.path = matches[6] || "";
      parsed.query = matches[7];
      parsed.fragment = matches[8];
      if (parsed.scheme !== void 0) {
        const decodedScheme = unescape(parsed.scheme);
        if (VALID_SCHEME.test(decodedScheme)) {
          parsed.scheme = decodedScheme.toLowerCase();
        } else {
          parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
          malformedScheme = true;
        }
      }
      malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
      if (malformedPercentEncoding) {
        parsed.error = parsed.error || "URI contains malformed percent-encoding.";
      }
      if (isNaN(parsed.port)) {
        parsed.port = matches[5];
      }
      const parseError = getParseError(parsed, matches);
      if (parseError !== void 0) {
        parsed.error = parsed.error || parseError;
        malformedAuthorityOrPort = true;
      }
      if (parsed.host) {
        const ipv4result = isIPv4(parsed.host);
        if (ipv4result === false) {
          const bracketedIPLiteral = isIPLiteral(parsed.host);
          const hasIPLiteralBracket = parsed.host.indexOf("[") !== -1 || parsed.host.indexOf("]") !== -1;
          const ipv6result = normalizeIPv6(parsed.host);
          isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
          malformedIPLiteral = hasIPLiteralBracket && (!bracketedIPLiteral || ipv6result.error === true);
          parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
          if (malformedIPLiteral) {
            parsed.error = parsed.error || "URI host is malformed.";
            malformedAuthorityOrPort = true;
          }
        } else {
          isIP = true;
        }
      }
      if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
        parsed.reference = "same-document";
      } else if (parsed.scheme === void 0) {
        parsed.reference = "relative";
      } else if (parsed.fragment === void 0) {
        parsed.reference = "absolute";
      } else {
        parsed.reference = "uri";
      }
      if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
        parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
      }
      const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
      if (!malformedIPLiteral) {
        malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
      }
      if (uri2.indexOf("%") !== -1 && parsed.host !== void 0 && !malformedIPLiteral) {
        let host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
        if (!isIP) {
          host = normalizePercentEncoding(host.toLowerCase());
        }
        parsed.host = reescapeHostDelimiters(host, isIP);
      }
      if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
        if (parsed.path) {
          parsed.path = normalizePathEncoding(parsed.path);
        }
        if (parsed.query) {
          parsed.query = normalizeQueryFragmentEncoding(parsed.query);
        }
        if (parsed.fragment) {
          parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
        }
      }
      if (schemeHandler && schemeHandler.parse) {
        schemeHandler.parse(parsed, options);
        if (schemeHandler === SCHEMES.urn && parsed.nid === void 0) {
          malformedSchemeSpecific = true;
        }
      }
    } else {
      parsed.error = parsed.error || "URI can not be parsed.";
    }
    return { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme };
  }
  function parse(uri2, opts) {
    return parseWithStatus(uri2, opts).parsed;
  }
  function normalizeString(uri2, opts) {
    return normalizeStringWithStatus(uri2, opts).normalized;
  }
  function normalizeStringWithStatus(uri2, opts) {
    const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri2, opts);
    return {
      normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri2 : serialize(parsed, opts),
      malformedAuthorityOrPort,
      malformedPercentEncoding,
      malformedSchemeSpecific,
      malformedHost,
      malformedScheme
    };
  }
  function normalizeComparableURI(uri2, opts) {
    if (typeof uri2 !== "string" && typeof uri2 !== "object") {
      return void 0;
    }
    let value;
    try {
      value = typeof uri2 === "string" ? uri2 : serialize(uri2, opts);
    } catch {
      return void 0;
    }
    const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
    return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? void 0 : normalized;
  }
  const fastUri$1 = {
    SCHEMES,
    normalize,
    resolve: resolve2,
    resolveComponent,
    equal: equal2,
    serialize,
    parse
  };
  fastUri.exports = fastUri$1;
  fastUri.exports.default = fastUri$1;
  fastUri.exports.fastUri = fastUri$1;
  return fastUri.exports;
}
var hasRequiredUri;
function requireUri() {
  if (hasRequiredUri) return uri;
  hasRequiredUri = 1;
  Object.defineProperty(uri, "__esModule", { value: true });
  const uri$1 = requireFastUri();
  uri$1.code = 'require("ajv/dist/runtime/uri").default';
  uri.default = uri$1;
  return uri;
}
var hasRequiredCore$1;
function requireCore$1() {
  if (hasRequiredCore$1) return core$1;
  hasRequiredCore$1 = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = /* @__PURE__ */ requireValidate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = /* @__PURE__ */ requireCodegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    const validation_error_1 = /* @__PURE__ */ requireValidation_error();
    const ref_error_1 = /* @__PURE__ */ requireRef_error();
    const rules_1 = /* @__PURE__ */ requireRules();
    const compile_1 = /* @__PURE__ */ requireCompile();
    const codegen_2 = /* @__PURE__ */ requireCodegen();
    const resolve_1 = /* @__PURE__ */ requireResolve();
    const dataType_1 = /* @__PURE__ */ requireDataType();
    const util_1 = /* @__PURE__ */ requireUtil();
    const $dataRefSchema = require$$9;
    const uri_1 = /* @__PURE__ */ requireUri();
    const defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    const META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    const EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    const removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    const deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    const MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    class Ajv {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid2 = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid2;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref2, missingRef }) {
          if (this.refs[ref2]) {
            throw new Error(`AnySchema ${ref2} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref2) {
          const _schema = await _loadSchema.call(this, ref2);
          if (!this.refs[ref2])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref2])
            this.addSchema(_schema, ref2, meta);
        }
        async function _loadSchema(ref2) {
          const p = this._loading[ref2];
          if (p)
            return p;
          try {
            return await (this._loading[ref2] = loadSchema(ref2));
          } finally {
            delete this._loading[ref2];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id2;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id2 = schema[schemaId];
          if (id2 !== void 0 && typeof id2 != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id2);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema2;
        $schema2 = schema.$schema;
        if ($schema2 !== void 0 && typeof $schema2 != "string") {
          throw new Error("$schema must be a string");
        }
        $schema2 = $schema2 || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema2) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid2 = this.validate($schema2, schema);
        if (!valid2 && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid2;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root2 = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root2, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id2 = schemaKeyRef[this.opts.schemaId];
            if (id2) {
              id2 = (0, resolve_1.normalizeId)(id2);
              delete this.schemas[id2];
              delete this.refs[id2];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions2) {
        for (const def of definitions2)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword2;
        if (typeof kwdOrDef == "string") {
          keyword2 = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword2;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword2 = def.keyword;
          if (Array.isArray(keyword2) && !keyword2.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword2, def);
        if (!def) {
          (0, util_1.eachItem)(keyword2, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword2, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword2) {
        const rule = this.RULES.all[keyword2];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword2) {
        const { RULES } = this;
        delete RULES.keywords[keyword2];
        delete RULES.all[keyword2];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword2);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format2) {
        if (typeof format2 == "string")
          format2 = new RegExp(format2);
        this.formats[name] = format2;
        return this;
      }
      errorsText(errors2 = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors2 || errors2.length === 0)
          return "No errors";
        return errors2.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules2 = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules2) {
            const rule = rules2[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id2;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id2 = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id2 || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id2) {
        if (this.schemas[id2] || this.refs[id2]) {
          throw new Error(`schema with key or id "${id2}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    }
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format2 = this.opts.formats[name];
        if (format2)
          this.addFormat(name, format2);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword2 in defs) {
        const def = defs[keyword2];
        if (!def.keyword)
          def.keyword = keyword2;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    const noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword2, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword2, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword2, definition, dataType2) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType2 && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType2);
      if (!ruleGroup) {
        ruleGroup = { type: dataType2, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword2] = true;
      if (!definition)
        return;
      const rule = {
        keyword: keyword2,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword2] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    const $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  })(core$1);
  return core$1;
}
var draft2020 = {};
var core = {};
var id = {};
var hasRequiredId;
function requireId() {
  if (hasRequiredId) return id;
  hasRequiredId = 1;
  Object.defineProperty(id, "__esModule", { value: true });
  const def = {
    keyword: "id",
    code() {
      throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
    }
  };
  id.default = def;
  return id;
}
var ref = {};
var hasRequiredRef;
function requireRef() {
  if (hasRequiredRef) return ref;
  hasRequiredRef = 1;
  Object.defineProperty(ref, "__esModule", { value: true });
  ref.callRef = ref.getValidate = void 0;
  const ref_error_1 = /* @__PURE__ */ requireRef_error();
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const compile_1 = /* @__PURE__ */ requireCompile();
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "$ref",
    schemaType: "string",
    code(cxt) {
      const { gen, schema: $ref, it } = cxt;
      const { baseId, schemaEnv: env2, validateName, opts, self } = it;
      const { root: root2 } = env2;
      if (($ref === "#" || $ref === "#/") && baseId === root2.baseId)
        return callRootRef();
      const schOrEnv = compile_1.resolveRef.call(self, root2, baseId, $ref);
      if (schOrEnv === void 0)
        throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
      if (schOrEnv instanceof compile_1.SchemaEnv)
        return callValidate(schOrEnv);
      return inlineRefSchema(schOrEnv);
      function callRootRef() {
        if (env2 === root2)
          return callRef(cxt, validateName, env2, env2.$async);
        const rootName = gen.scopeValue("root", { ref: root2 });
        return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root2, root2.$async);
      }
      function callValidate(sch) {
        const v = getValidate(cxt, sch);
        callRef(cxt, v, sch, sch.$async);
      }
      function inlineRefSchema(sch) {
        const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
        const valid2 = gen.name("valid");
        const schCxt = cxt.subschema({
          schema: sch,
          dataTypes: [],
          schemaPath: codegen_1.nil,
          topSchemaRef: schName,
          errSchemaPath: $ref
        }, valid2);
        cxt.mergeEvaluated(schCxt);
        cxt.ok(valid2);
      }
    }
  };
  function getValidate(cxt, sch) {
    const { gen } = cxt;
    return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
  }
  ref.getValidate = getValidate;
  function callRef(cxt, v, sch, $async) {
    const { gen, it } = cxt;
    const { allErrors, schemaEnv: env2, opts } = it;
    const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
    if ($async)
      callAsyncRef();
    else
      callSyncRef();
    function callAsyncRef() {
      if (!env2.$async)
        throw new Error("async schema referenced by sync schema");
      const valid2 = gen.let("valid");
      gen.try(() => {
        gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
        addEvaluatedFrom(v);
        if (!allErrors)
          gen.assign(valid2, true);
      }, (e) => {
        gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
        addErrorsFrom(e);
        if (!allErrors)
          gen.assign(valid2, false);
      });
      cxt.ok(valid2);
    }
    function callSyncRef() {
      cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
    }
    function addErrorsFrom(source) {
      const errs = (0, codegen_1._)`${source}.errors`;
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
      gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
    }
    function addEvaluatedFrom(source) {
      var _a;
      if (!it.opts.unevaluated)
        return;
      const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
      if (it.props !== true) {
        if (schEvaluated && !schEvaluated.dynamicProps) {
          if (schEvaluated.props !== void 0) {
            it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
          }
        } else {
          const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
          it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
        }
      }
      if (it.items !== true) {
        if (schEvaluated && !schEvaluated.dynamicItems) {
          if (schEvaluated.items !== void 0) {
            it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
          }
        } else {
          const items2 = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
          it.items = util_1.mergeEvaluated.items(gen, items2, it.items, codegen_1.Name);
        }
      }
    }
  }
  ref.callRef = callRef;
  ref.default = def;
  return ref;
}
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  Object.defineProperty(core, "__esModule", { value: true });
  const id_1 = /* @__PURE__ */ requireId();
  const ref_1 = /* @__PURE__ */ requireRef();
  const core$12 = [
    "$schema",
    "$id",
    "$defs",
    "$vocabulary",
    { keyword: "$comment" },
    "definitions",
    id_1.default,
    ref_1.default
  ];
  core.default = core$12;
  return core;
}
var validation = {};
var limitNumber = {};
var hasRequiredLimitNumber;
function requireLimitNumber() {
  if (hasRequiredLimitNumber) return limitNumber;
  hasRequiredLimitNumber = 1;
  Object.defineProperty(limitNumber, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const ops = codegen_1.operators;
  const KWDs = {
    maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
    minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
    exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
    exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
  };
  const error = {
    message: ({ keyword: keyword2, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword2].okStr} ${schemaCode}`,
    params: ({ keyword: keyword2, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword2].okStr}, limit: ${schemaCode}}`
  };
  const def = {
    keyword: Object.keys(KWDs),
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode } = cxt;
      cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword2].fail} ${schemaCode} || isNaN(${data})`);
    }
  };
  limitNumber.default = def;
  return limitNumber;
}
var multipleOf = {};
var hasRequiredMultipleOf;
function requireMultipleOf() {
  if (hasRequiredMultipleOf) return multipleOf;
  hasRequiredMultipleOf = 1;
  Object.defineProperty(multipleOf, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
    params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
  };
  const def = {
    keyword: "multipleOf",
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, schemaCode, it } = cxt;
      const prec = it.opts.multipleOfPrecision;
      const res = gen.let("res");
      const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
      cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
    }
  };
  multipleOf.default = def;
  return multipleOf;
}
var limitLength = {};
var ucs2length = {};
var hasRequiredUcs2length;
function requireUcs2length() {
  if (hasRequiredUcs2length) return ucs2length;
  hasRequiredUcs2length = 1;
  Object.defineProperty(ucs2length, "__esModule", { value: true });
  function ucs2length$1(str) {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
      length++;
      value = str.charCodeAt(pos++);
      if (value >= 55296 && value <= 56319 && pos < len) {
        value = str.charCodeAt(pos);
        if ((value & 64512) === 56320)
          pos++;
      }
    }
    return length;
  }
  ucs2length.default = ucs2length$1;
  ucs2length$1.code = 'require("ajv/dist/runtime/ucs2length").default';
  return ucs2length;
}
var hasRequiredLimitLength;
function requireLimitLength() {
  if (hasRequiredLimitLength) return limitLength;
  hasRequiredLimitLength = 1;
  Object.defineProperty(limitLength, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const ucs2length_1 = /* @__PURE__ */ requireUcs2length();
  const error = {
    message({ keyword: keyword2, schemaCode }) {
      const comp = keyword2 === "maxLength" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  const def = {
    keyword: ["maxLength", "minLength"],
    type: "string",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode, it } = cxt;
      const op = keyword2 === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
      const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
      cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
    }
  };
  limitLength.default = def;
  return limitLength;
}
var pattern = {};
var hasRequiredPattern;
function requirePattern() {
  if (hasRequiredPattern) return pattern;
  hasRequiredPattern = 1;
  Object.defineProperty(pattern, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const util_1 = /* @__PURE__ */ requireUtil();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
  };
  const def = {
    keyword: "pattern",
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const u = it.opts.unicodeRegExp ? "u" : "";
      if ($data) {
        const { regExp } = it.opts.code;
        const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
        const valid2 = gen.let("valid");
        gen.try(() => gen.assign(valid2, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid2, false));
        cxt.fail$data((0, codegen_1._)`!${valid2}`);
      } else {
        const regExp = (0, code_1.usePattern)(cxt, schema);
        cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
      }
    }
  };
  pattern.default = def;
  return pattern;
}
var limitProperties = {};
var hasRequiredLimitProperties;
function requireLimitProperties() {
  if (hasRequiredLimitProperties) return limitProperties;
  hasRequiredLimitProperties = 1;
  Object.defineProperty(limitProperties, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message({ keyword: keyword2, schemaCode }) {
      const comp = keyword2 === "maxProperties" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  const def = {
    keyword: ["maxProperties", "minProperties"],
    type: "object",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode } = cxt;
      const op = keyword2 === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
    }
  };
  limitProperties.default = def;
  return limitProperties;
}
var required = {};
var hasRequiredRequired;
function requireRequired() {
  if (hasRequiredRequired) return required;
  hasRequiredRequired = 1;
  Object.defineProperty(required, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
    params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
  };
  const def = {
    keyword: "required",
    type: "object",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, schema, schemaCode, data, $data, it } = cxt;
      const { opts } = it;
      if (!$data && schema.length === 0)
        return;
      const useLoop = schema.length >= opts.loopRequired;
      if (it.allErrors)
        allErrorsMode();
      else
        exitOnErrorMode();
      if (opts.strictRequired) {
        const props = cxt.parentSchema.properties;
        const { definedProperties } = cxt.it;
        for (const requiredKey of schema) {
          if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
            const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
            const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
            (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
          }
        }
      }
      function allErrorsMode() {
        if (useLoop || $data) {
          cxt.block$data(codegen_1.nil, loopAllRequired);
        } else {
          for (const prop of schema) {
            (0, code_1.checkReportMissingProp)(cxt, prop);
          }
        }
      }
      function exitOnErrorMode() {
        const missing = gen.let("missing");
        if (useLoop || $data) {
          const valid2 = gen.let("valid", true);
          cxt.block$data(valid2, () => loopUntilMissing(missing, valid2));
          cxt.ok(valid2);
        } else {
          gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
      function loopAllRequired() {
        gen.forOf("prop", schemaCode, (prop) => {
          cxt.setParams({ missingProperty: prop });
          gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
        });
      }
      function loopUntilMissing(missing, valid2) {
        cxt.setParams({ missingProperty: missing });
        gen.forOf(missing, schemaCode, () => {
          gen.assign(valid2, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
          gen.if((0, codegen_1.not)(valid2), () => {
            cxt.error();
            gen.break();
          });
        }, codegen_1.nil);
      }
    }
  };
  required.default = def;
  return required;
}
var limitItems = {};
var hasRequiredLimitItems;
function requireLimitItems() {
  if (hasRequiredLimitItems) return limitItems;
  hasRequiredLimitItems = 1;
  Object.defineProperty(limitItems, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message({ keyword: keyword2, schemaCode }) {
      const comp = keyword2 === "maxItems" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  const def = {
    keyword: ["maxItems", "minItems"],
    type: "array",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword: keyword2, data, schemaCode } = cxt;
      const op = keyword2 === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
    }
  };
  limitItems.default = def;
  return limitItems;
}
var uniqueItems = {};
var equal = {};
var hasRequiredEqual;
function requireEqual() {
  if (hasRequiredEqual) return equal;
  hasRequiredEqual = 1;
  Object.defineProperty(equal, "__esModule", { value: true });
  const equal$1 = requireFastDeepEqual();
  equal$1.code = 'require("ajv/dist/runtime/equal").default';
  equal.default = equal$1;
  return equal;
}
var hasRequiredUniqueItems;
function requireUniqueItems() {
  if (hasRequiredUniqueItems) return uniqueItems;
  hasRequiredUniqueItems = 1;
  Object.defineProperty(uniqueItems, "__esModule", { value: true });
  const dataType_1 = /* @__PURE__ */ requireDataType();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal_1 = /* @__PURE__ */ requireEqual();
  const error = {
    message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
    params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
  };
  const def = {
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
      if (!$data && !schema)
        return;
      const valid2 = gen.let("valid");
      const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
      cxt.block$data(valid2, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
      cxt.ok(valid2);
      function validateUniqueItems() {
        const i = gen.let("i", (0, codegen_1._)`${data}.length`);
        const j = gen.let("j");
        cxt.setParams({ i, j });
        gen.assign(valid2, true);
        gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
      }
      function canOptimize() {
        return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
      }
      function loopN(i, j) {
        const item = gen.name("item");
        const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
        const indices = gen.const("indices", (0, codegen_1._)`{}`);
        gen.for((0, codegen_1._)`;${i}--;`, () => {
          gen.let(item, (0, codegen_1._)`${data}[${i}]`);
          gen.if(wrongType, (0, codegen_1._)`continue`);
          if (itemTypes.length > 1)
            gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
          gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
            gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
            cxt.error();
            gen.assign(valid2, false).break();
          }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
        });
      }
      function loopN2(i, j) {
        const eql = (0, util_1.useFunc)(gen, equal_1.default);
        const outer = gen.name("outer");
        gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
          cxt.error();
          gen.assign(valid2, false).break(outer);
        })));
      }
    }
  };
  uniqueItems.default = def;
  return uniqueItems;
}
var _const = {};
var hasRequired_const;
function require_const() {
  if (hasRequired_const) return _const;
  hasRequired_const = 1;
  Object.defineProperty(_const, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal_1 = /* @__PURE__ */ requireEqual();
  const error = {
    message: "must be equal to constant",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
  };
  const def = {
    keyword: "const",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schemaCode, schema } = cxt;
      if ($data || schema && typeof schema == "object") {
        cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
      } else {
        cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
      }
    }
  };
  _const.default = def;
  return _const;
}
var _enum = {};
var hasRequired_enum;
function require_enum() {
  if (hasRequired_enum) return _enum;
  hasRequired_enum = 1;
  Object.defineProperty(_enum, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const equal_1 = /* @__PURE__ */ requireEqual();
  const error = {
    message: "must be equal to one of the allowed values",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
  };
  const def = {
    keyword: "enum",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      if (!$data && schema.length === 0)
        throw new Error("enum must have non-empty array");
      const useLoop = schema.length >= it.opts.loopEnum;
      let eql;
      const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
      let valid2;
      if (useLoop || $data) {
        valid2 = gen.let("valid");
        cxt.block$data(valid2, loopEnum);
      } else {
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const vSchema = gen.const("vSchema", schemaCode);
        valid2 = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
      }
      cxt.pass(valid2);
      function loopEnum() {
        gen.assign(valid2, false);
        gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid2, true).break()));
      }
      function equalCode(vSchema, i) {
        const sch = schema[i];
        return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
      }
    }
  };
  _enum.default = def;
  return _enum;
}
var hasRequiredValidation;
function requireValidation() {
  if (hasRequiredValidation) return validation;
  hasRequiredValidation = 1;
  Object.defineProperty(validation, "__esModule", { value: true });
  const limitNumber_1 = /* @__PURE__ */ requireLimitNumber();
  const multipleOf_1 = /* @__PURE__ */ requireMultipleOf();
  const limitLength_1 = /* @__PURE__ */ requireLimitLength();
  const pattern_1 = /* @__PURE__ */ requirePattern();
  const limitProperties_1 = /* @__PURE__ */ requireLimitProperties();
  const required_1 = /* @__PURE__ */ requireRequired();
  const limitItems_1 = /* @__PURE__ */ requireLimitItems();
  const uniqueItems_1 = /* @__PURE__ */ requireUniqueItems();
  const const_1 = /* @__PURE__ */ require_const();
  const enum_1 = /* @__PURE__ */ require_enum();
  const validation$1 = [
    // number
    limitNumber_1.default,
    multipleOf_1.default,
    // string
    limitLength_1.default,
    pattern_1.default,
    // object
    limitProperties_1.default,
    required_1.default,
    // array
    limitItems_1.default,
    uniqueItems_1.default,
    // any
    { keyword: "type", schemaType: ["string", "array"] },
    { keyword: "nullable", schemaType: "boolean" },
    const_1.default,
    enum_1.default
  ];
  validation.default = validation$1;
  return validation;
}
var applicator = {};
var additionalItems = {};
var hasRequiredAdditionalItems;
function requireAdditionalItems() {
  if (hasRequiredAdditionalItems) return additionalItems;
  hasRequiredAdditionalItems = 1;
  Object.defineProperty(additionalItems, "__esModule", { value: true });
  additionalItems.validateAdditionalItems = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  const def = {
    keyword: "additionalItems",
    type: "array",
    schemaType: ["boolean", "object"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { parentSchema, it } = cxt;
      const { items: items2 } = parentSchema;
      if (!Array.isArray(items2)) {
        (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
        return;
      }
      validateAdditionalItems(cxt, items2);
    }
  };
  function validateAdditionalItems(cxt, items2) {
    const { gen, schema, data, keyword: keyword2, it } = cxt;
    it.items = true;
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    if (schema === false) {
      cxt.setParams({ len: items2.length });
      cxt.pass((0, codegen_1._)`${len} <= ${items2.length}`);
    } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
      const valid2 = gen.var("valid", (0, codegen_1._)`${len} <= ${items2.length}`);
      gen.if((0, codegen_1.not)(valid2), () => validateItems(valid2));
      cxt.ok(valid2);
    }
    function validateItems(valid2) {
      gen.forRange("i", items2.length, len, (i) => {
        cxt.subschema({ keyword: keyword2, dataProp: i, dataPropType: util_1.Type.Num }, valid2);
        if (!it.allErrors)
          gen.if((0, codegen_1.not)(valid2), () => gen.break());
      });
    }
  }
  additionalItems.validateAdditionalItems = validateAdditionalItems;
  additionalItems.default = def;
  return additionalItems;
}
var prefixItems = {};
var items = {};
var hasRequiredItems;
function requireItems() {
  if (hasRequiredItems) return items;
  hasRequiredItems = 1;
  Object.defineProperty(items, "__esModule", { value: true });
  items.validateTuple = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const code_1 = /* @__PURE__ */ requireCode();
  const def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "array", "boolean"],
    before: "uniqueItems",
    code(cxt) {
      const { schema, it } = cxt;
      if (Array.isArray(schema))
        return validateTuple(cxt, "additionalItems", schema);
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  function validateTuple(cxt, extraItems, schArr = cxt.schema) {
    const { gen, parentSchema, data, keyword: keyword2, it } = cxt;
    checkStrictTuple(parentSchema);
    if (it.opts.unevaluated && schArr.length && it.items !== true) {
      it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
    }
    const valid2 = gen.name("valid");
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    schArr.forEach((sch, i) => {
      if ((0, util_1.alwaysValidSchema)(it, sch))
        return;
      gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
        keyword: keyword2,
        schemaProp: i,
        dataProp: i
      }, valid2));
      cxt.ok(valid2);
    });
    function checkStrictTuple(sch) {
      const { opts, errSchemaPath } = it;
      const l = schArr.length;
      const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
      if (opts.strictTuples && !fullTuple) {
        const msg = `"${keyword2}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
        (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
      }
    }
  }
  items.validateTuple = validateTuple;
  items.default = def;
  return items;
}
var hasRequiredPrefixItems;
function requirePrefixItems() {
  if (hasRequiredPrefixItems) return prefixItems;
  hasRequiredPrefixItems = 1;
  Object.defineProperty(prefixItems, "__esModule", { value: true });
  const items_1 = /* @__PURE__ */ requireItems();
  const def = {
    keyword: "prefixItems",
    type: "array",
    schemaType: ["array"],
    before: "uniqueItems",
    code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
  };
  prefixItems.default = def;
  return prefixItems;
}
var items2020 = {};
var hasRequiredItems2020;
function requireItems2020() {
  if (hasRequiredItems2020) return items2020;
  hasRequiredItems2020 = 1;
  Object.defineProperty(items2020, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const code_1 = /* @__PURE__ */ requireCode();
  const additionalItems_1 = /* @__PURE__ */ requireAdditionalItems();
  const error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  const def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { schema, parentSchema, it } = cxt;
      const { prefixItems: prefixItems2 } = parentSchema;
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      if (prefixItems2)
        (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems2);
      else
        cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  items2020.default = def;
  return items2020;
}
var contains = {};
var hasRequiredContains;
function requireContains() {
  if (hasRequiredContains) return contains;
  hasRequiredContains = 1;
  Object.defineProperty(contains, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
    params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
  };
  const def = {
    keyword: "contains",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      let min;
      let max;
      const { minContains, maxContains } = parentSchema;
      if (it.opts.next) {
        min = minContains === void 0 ? 1 : minContains;
        max = maxContains;
      } else {
        min = 1;
      }
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      cxt.setParams({ min, max });
      if (max === void 0 && min === 0) {
        (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
        return;
      }
      if (max !== void 0 && min > max) {
        (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
        cxt.fail();
        return;
      }
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        let cond = (0, codegen_1._)`${len} >= ${min}`;
        if (max !== void 0)
          cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
        cxt.pass(cond);
        return;
      }
      it.items = true;
      const valid2 = gen.name("valid");
      if (max === void 0 && min === 1) {
        validateItems(valid2, () => gen.if(valid2, () => gen.break()));
      } else if (min === 0) {
        gen.let(valid2, true);
        if (max !== void 0)
          gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
      } else {
        gen.let(valid2, false);
        validateItemsWithCount();
      }
      cxt.result(valid2, () => cxt.reset());
      function validateItemsWithCount() {
        const schValid = gen.name("_valid");
        const count = gen.let("count", 0);
        validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
      }
      function validateItems(_valid, block) {
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword: "contains",
            dataProp: i,
            dataPropType: util_1.Type.Num,
            compositeRule: true
          }, _valid);
          block();
        });
      }
      function checkLimits(count) {
        gen.code((0, codegen_1._)`${count}++`);
        if (max === void 0) {
          gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid2, true).break());
        } else {
          gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid2, false).break());
          if (min === 1)
            gen.assign(valid2, true);
          else
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid2, true));
        }
      }
    }
  };
  contains.default = def;
  return contains;
}
var dependencies = {};
var hasRequiredDependencies;
function requireDependencies() {
  if (hasRequiredDependencies) return dependencies;
  hasRequiredDependencies = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const util_1 = /* @__PURE__ */ requireUtil();
    const code_1 = /* @__PURE__ */ requireCode();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    const def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty2 = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty2, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty2} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword: keyword2, it } = cxt;
      const valid2 = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword: keyword2, schemaProp: prop }, valid2);
            cxt.mergeValidEvaluated(schCxt, valid2);
          },
          () => gen.var(valid2, true)
          // TODO var
        );
        cxt.ok(valid2);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  })(dependencies);
  return dependencies;
}
var propertyNames = {};
var hasRequiredPropertyNames;
function requirePropertyNames() {
  if (hasRequiredPropertyNames) return propertyNames;
  hasRequiredPropertyNames = 1;
  Object.defineProperty(propertyNames, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: "property name must be valid",
    params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
  };
  const def = {
    keyword: "propertyNames",
    type: "object",
    schemaType: ["object", "boolean"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      const valid2 = gen.name("valid");
      gen.forIn("key", data, (key) => {
        cxt.setParams({ propertyName: key });
        cxt.subschema({
          keyword: "propertyNames",
          data: key,
          dataTypes: ["string"],
          propertyName: key,
          compositeRule: true
        }, valid2);
        gen.if((0, codegen_1.not)(valid2), () => {
          cxt.error(true);
          if (!it.allErrors)
            gen.break();
        });
      });
      cxt.ok(valid2);
    }
  };
  propertyNames.default = def;
  return propertyNames;
}
var additionalProperties = {};
var hasRequiredAdditionalProperties;
function requireAdditionalProperties() {
  if (hasRequiredAdditionalProperties) return additionalProperties;
  hasRequiredAdditionalProperties = 1;
  Object.defineProperty(additionalProperties, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: "must NOT have additional properties",
    params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
  };
  const def = {
    keyword: "additionalProperties",
    type: ["object"],
    schemaType: ["boolean", "object"],
    allowUndefined: true,
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, opts } = it;
      it.props = true;
      if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
        return;
      const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
      const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
      checkAdditionalProperties();
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function checkAdditionalProperties() {
        gen.forIn("key", data, (key) => {
          if (!props.length && !patProps.length)
            additionalPropertyCode(key);
          else
            gen.if(isAdditional(key), () => additionalPropertyCode(key));
        });
      }
      function isAdditional(key) {
        let definedProp;
        if (props.length > 8) {
          const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
          definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
        } else if (props.length) {
          definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
        } else {
          definedProp = codegen_1.nil;
        }
        if (patProps.length) {
          definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
        }
        return (0, codegen_1.not)(definedProp);
      }
      function deleteAdditional(key) {
        gen.code((0, codegen_1._)`delete ${data}[${key}]`);
      }
      function additionalPropertyCode(key) {
        if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
          deleteAdditional(key);
          return;
        }
        if (schema === false) {
          cxt.setParams({ additionalProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid2 = gen.name("valid");
          if (opts.removeAdditional === "failing") {
            applyAdditionalSchema(key, valid2, false);
            gen.if((0, codegen_1.not)(valid2), () => {
              cxt.reset();
              deleteAdditional(key);
            });
          } else {
            applyAdditionalSchema(key, valid2);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid2), () => gen.break());
          }
        }
      }
      function applyAdditionalSchema(key, valid2, errors2) {
        const subschema2 = {
          keyword: "additionalProperties",
          dataProp: key,
          dataPropType: util_1.Type.Str
        };
        if (errors2 === false) {
          Object.assign(subschema2, {
            compositeRule: true,
            createErrors: false,
            allErrors: false
          });
        }
        cxt.subschema(subschema2, valid2);
      }
    }
  };
  additionalProperties.default = def;
  return additionalProperties;
}
var properties$9 = {};
var hasRequiredProperties;
function requireProperties() {
  if (hasRequiredProperties) return properties$9;
  hasRequiredProperties = 1;
  Object.defineProperty(properties$9, "__esModule", { value: true });
  const validate_1 = /* @__PURE__ */ requireValidate();
  const code_1 = /* @__PURE__ */ requireCode();
  const util_1 = /* @__PURE__ */ requireUtil();
  const additionalProperties_1 = /* @__PURE__ */ requireAdditionalProperties();
  const def = {
    keyword: "properties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
        additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
      }
      const allProps = (0, code_1.allSchemaProperties)(schema);
      for (const prop of allProps) {
        it.definedProperties.add(prop);
      }
      if (it.opts.unevaluated && allProps.length && it.props !== true) {
        it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
      }
      const properties2 = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
      if (properties2.length === 0)
        return;
      const valid2 = gen.name("valid");
      for (const prop of properties2) {
        if (hasDefault(prop)) {
          applyPropertySchema(prop);
        } else {
          gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
          applyPropertySchema(prop);
          if (!it.allErrors)
            gen.else().var(valid2, true);
          gen.endIf();
        }
        cxt.it.definedProperties.add(prop);
        cxt.ok(valid2);
      }
      function hasDefault(prop) {
        return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
      }
      function applyPropertySchema(prop) {
        cxt.subschema({
          keyword: "properties",
          schemaProp: prop,
          dataProp: prop
        }, valid2);
      }
    }
  };
  properties$9.default = def;
  return properties$9;
}
var patternProperties = {};
var hasRequiredPatternProperties;
function requirePatternProperties() {
  if (hasRequiredPatternProperties) return patternProperties;
  hasRequiredPatternProperties = 1;
  Object.defineProperty(patternProperties, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const util_2 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "patternProperties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, data, parentSchema, it } = cxt;
      const { opts } = it;
      const patterns = (0, code_1.allSchemaProperties)(schema);
      const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
      if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
        return;
      }
      const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
      const valid2 = gen.name("valid");
      if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
        it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
      }
      const { props } = it;
      validatePatternProperties();
      function validatePatternProperties() {
        for (const pat of patterns) {
          if (checkProperties)
            checkMatchingProperties(pat);
          if (it.allErrors) {
            validateProperties(pat);
          } else {
            gen.var(valid2, true);
            validateProperties(pat);
            gen.if(valid2);
          }
        }
      }
      function checkMatchingProperties(pat) {
        for (const prop in checkProperties) {
          if (new RegExp(pat).test(prop)) {
            (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
          }
        }
      }
      function validateProperties(pat) {
        gen.forIn("key", data, (key) => {
          gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
            const alwaysValid = alwaysValidPatterns.includes(pat);
            if (!alwaysValid) {
              cxt.subschema({
                keyword: "patternProperties",
                schemaProp: pat,
                dataProp: key,
                dataPropType: util_2.Type.Str
              }, valid2);
            }
            if (it.opts.unevaluated && props !== true) {
              gen.assign((0, codegen_1._)`${props}[${key}]`, true);
            } else if (!alwaysValid && !it.allErrors) {
              gen.if((0, codegen_1.not)(valid2), () => gen.break());
            }
          });
        });
      }
    }
  };
  patternProperties.default = def;
  return patternProperties;
}
var not = {};
var hasRequiredNot;
function requireNot() {
  if (hasRequiredNot) return not;
  hasRequiredNot = 1;
  Object.defineProperty(not, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "not",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    code(cxt) {
      const { gen, schema, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        cxt.fail();
        return;
      }
      const valid2 = gen.name("valid");
      cxt.subschema({
        keyword: "not",
        compositeRule: true,
        createErrors: false,
        allErrors: false
      }, valid2);
      cxt.failResult(valid2, () => cxt.reset(), () => cxt.error());
    },
    error: { message: "must NOT be valid" }
  };
  not.default = def;
  return not;
}
var anyOf = {};
var hasRequiredAnyOf;
function requireAnyOf() {
  if (hasRequiredAnyOf) return anyOf;
  hasRequiredAnyOf = 1;
  Object.defineProperty(anyOf, "__esModule", { value: true });
  const code_1 = /* @__PURE__ */ requireCode();
  const def = {
    keyword: "anyOf",
    schemaType: "array",
    trackErrors: true,
    code: code_1.validateUnion,
    error: { message: "must match a schema in anyOf" }
  };
  anyOf.default = def;
  return anyOf;
}
var oneOf = {};
var hasRequiredOneOf;
function requireOneOf() {
  if (hasRequiredOneOf) return oneOf;
  hasRequiredOneOf = 1;
  Object.defineProperty(oneOf, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: "must match exactly one schema in oneOf",
    params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
  };
  const def = {
    keyword: "oneOf",
    schemaType: "array",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      if (it.opts.discriminator && parentSchema.discriminator)
        return;
      const schArr = schema;
      const valid2 = gen.let("valid", false);
      const passing = gen.let("passing", null);
      const schValid = gen.name("_valid");
      cxt.setParams({ passing });
      gen.block(validateOneOf);
      cxt.result(valid2, () => cxt.reset(), () => cxt.error(true));
      function validateOneOf() {
        schArr.forEach((sch, i) => {
          let schCxt;
          if ((0, util_1.alwaysValidSchema)(it, sch)) {
            gen.var(schValid, true);
          } else {
            schCxt = cxt.subschema({
              keyword: "oneOf",
              schemaProp: i,
              compositeRule: true
            }, schValid);
          }
          if (i > 0) {
            gen.if((0, codegen_1._)`${schValid} && ${valid2}`).assign(valid2, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
          }
          gen.if(schValid, () => {
            gen.assign(valid2, true);
            gen.assign(passing, i);
            if (schCxt)
              cxt.mergeEvaluated(schCxt, codegen_1.Name);
          });
        });
      }
    }
  };
  oneOf.default = def;
  return oneOf;
}
var allOf$1 = {};
var hasRequiredAllOf;
function requireAllOf() {
  if (hasRequiredAllOf) return allOf$1;
  hasRequiredAllOf = 1;
  Object.defineProperty(allOf$1, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "allOf",
    schemaType: "array",
    code(cxt) {
      const { gen, schema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const valid2 = gen.name("valid");
      schema.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid2);
        cxt.ok(valid2);
        cxt.mergeEvaluated(schCxt);
      });
    }
  };
  allOf$1.default = def;
  return allOf$1;
}
var _if = {};
var hasRequired_if;
function require_if() {
  if (hasRequired_if) return _if;
  hasRequired_if = 1;
  Object.defineProperty(_if, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
    params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
  };
  const def = {
    keyword: "if",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, parentSchema, it } = cxt;
      if (parentSchema.then === void 0 && parentSchema.else === void 0) {
        (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
      }
      const hasThen = hasSchema(it, "then");
      const hasElse = hasSchema(it, "else");
      if (!hasThen && !hasElse)
        return;
      const valid2 = gen.let("valid", true);
      const schValid = gen.name("_valid");
      validateIf();
      cxt.reset();
      if (hasThen && hasElse) {
        const ifClause = gen.let("ifClause");
        cxt.setParams({ ifClause });
        gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
      } else if (hasThen) {
        gen.if(schValid, validateClause("then"));
      } else {
        gen.if((0, codegen_1.not)(schValid), validateClause("else"));
      }
      cxt.pass(valid2, () => cxt.error(true));
      function validateIf() {
        const schCxt = cxt.subschema({
          keyword: "if",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, schValid);
        cxt.mergeEvaluated(schCxt);
      }
      function validateClause(keyword2, ifClause) {
        return () => {
          const schCxt = cxt.subschema({ keyword: keyword2 }, schValid);
          gen.assign(valid2, schValid);
          cxt.mergeValidEvaluated(schCxt, valid2);
          if (ifClause)
            gen.assign(ifClause, (0, codegen_1._)`${keyword2}`);
          else
            cxt.setParams({ ifClause: keyword2 });
        };
      }
    }
  };
  function hasSchema(it, keyword2) {
    const schema = it.schema[keyword2];
    return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
  }
  _if.default = def;
  return _if;
}
var thenElse = {};
var hasRequiredThenElse;
function requireThenElse() {
  if (hasRequiredThenElse) return thenElse;
  hasRequiredThenElse = 1;
  Object.defineProperty(thenElse, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: ["then", "else"],
    schemaType: ["object", "boolean"],
    code({ keyword: keyword2, parentSchema, it }) {
      if (parentSchema.if === void 0)
        (0, util_1.checkStrictMode)(it, `"${keyword2}" without "if" is ignored`);
    }
  };
  thenElse.default = def;
  return thenElse;
}
var hasRequiredApplicator;
function requireApplicator() {
  if (hasRequiredApplicator) return applicator;
  hasRequiredApplicator = 1;
  Object.defineProperty(applicator, "__esModule", { value: true });
  const additionalItems_1 = /* @__PURE__ */ requireAdditionalItems();
  const prefixItems_1 = /* @__PURE__ */ requirePrefixItems();
  const items_1 = /* @__PURE__ */ requireItems();
  const items2020_1 = /* @__PURE__ */ requireItems2020();
  const contains_1 = /* @__PURE__ */ requireContains();
  const dependencies_1 = /* @__PURE__ */ requireDependencies();
  const propertyNames_1 = /* @__PURE__ */ requirePropertyNames();
  const additionalProperties_1 = /* @__PURE__ */ requireAdditionalProperties();
  const properties_1 = /* @__PURE__ */ requireProperties();
  const patternProperties_1 = /* @__PURE__ */ requirePatternProperties();
  const not_1 = /* @__PURE__ */ requireNot();
  const anyOf_1 = /* @__PURE__ */ requireAnyOf();
  const oneOf_1 = /* @__PURE__ */ requireOneOf();
  const allOf_1 = /* @__PURE__ */ requireAllOf();
  const if_1 = /* @__PURE__ */ require_if();
  const thenElse_1 = /* @__PURE__ */ requireThenElse();
  function getApplicator(draft20202 = false) {
    const applicator2 = [
      // any
      not_1.default,
      anyOf_1.default,
      oneOf_1.default,
      allOf_1.default,
      if_1.default,
      thenElse_1.default,
      // object
      propertyNames_1.default,
      additionalProperties_1.default,
      dependencies_1.default,
      properties_1.default,
      patternProperties_1.default
    ];
    if (draft20202)
      applicator2.push(prefixItems_1.default, items2020_1.default);
    else
      applicator2.push(additionalItems_1.default, items_1.default);
    applicator2.push(contains_1.default);
    return applicator2;
  }
  applicator.default = getApplicator;
  return applicator;
}
var dynamic = {};
var dynamicAnchor = {};
var hasRequiredDynamicAnchor;
function requireDynamicAnchor() {
  if (hasRequiredDynamicAnchor) return dynamicAnchor;
  hasRequiredDynamicAnchor = 1;
  Object.defineProperty(dynamicAnchor, "__esModule", { value: true });
  dynamicAnchor.dynamicAnchor = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const compile_1 = /* @__PURE__ */ requireCompile();
  const ref_1 = /* @__PURE__ */ requireRef();
  const def = {
    keyword: "$dynamicAnchor",
    schemaType: "string",
    code: (cxt) => dynamicAnchor$1(cxt, cxt.schema)
  };
  function dynamicAnchor$1(cxt, anchor) {
    const { gen, it } = cxt;
    it.schemaEnv.root.dynamicAnchors[anchor] = true;
    const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
    const validate2 = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
    gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate2));
  }
  dynamicAnchor.dynamicAnchor = dynamicAnchor$1;
  function _getValidate(cxt) {
    const { schemaEnv, schema, self } = cxt.it;
    const { root: root2, baseId, localRefs, meta } = schemaEnv.root;
    const { schemaId } = self.opts;
    const sch = new compile_1.SchemaEnv({ schema, schemaId, root: root2, baseId, localRefs, meta });
    compile_1.compileSchema.call(self, sch);
    return (0, ref_1.getValidate)(cxt, sch);
  }
  dynamicAnchor.default = def;
  return dynamicAnchor;
}
var dynamicRef = {};
var hasRequiredDynamicRef;
function requireDynamicRef() {
  if (hasRequiredDynamicRef) return dynamicRef;
  hasRequiredDynamicRef = 1;
  Object.defineProperty(dynamicRef, "__esModule", { value: true });
  dynamicRef.dynamicRef = void 0;
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const names_1 = /* @__PURE__ */ requireNames();
  const ref_1 = /* @__PURE__ */ requireRef();
  const def = {
    keyword: "$dynamicRef",
    schemaType: "string",
    code: (cxt) => dynamicRef$1(cxt, cxt.schema)
  };
  function dynamicRef$1(cxt, ref2) {
    const { gen, keyword: keyword2, it } = cxt;
    if (ref2[0] !== "#")
      throw new Error(`"${keyword2}" only supports hash fragment reference`);
    const anchor = ref2.slice(1);
    if (it.allErrors) {
      _dynamicRef();
    } else {
      const valid2 = gen.let("valid", false);
      _dynamicRef(valid2);
      cxt.ok(valid2);
    }
    function _dynamicRef(valid2) {
      if (it.schemaEnv.root.dynamicAnchors[anchor]) {
        const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
        gen.if(v, _callRef(v, valid2), _callRef(it.validateName, valid2));
      } else {
        _callRef(it.validateName, valid2)();
      }
    }
    function _callRef(validate2, valid2) {
      return valid2 ? () => gen.block(() => {
        (0, ref_1.callRef)(cxt, validate2);
        gen.let(valid2, true);
      }) : () => (0, ref_1.callRef)(cxt, validate2);
    }
  }
  dynamicRef.dynamicRef = dynamicRef$1;
  dynamicRef.default = def;
  return dynamicRef;
}
var recursiveAnchor = {};
var hasRequiredRecursiveAnchor;
function requireRecursiveAnchor() {
  if (hasRequiredRecursiveAnchor) return recursiveAnchor;
  hasRequiredRecursiveAnchor = 1;
  Object.defineProperty(recursiveAnchor, "__esModule", { value: true });
  const dynamicAnchor_1 = /* @__PURE__ */ requireDynamicAnchor();
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: "$recursiveAnchor",
    schemaType: "boolean",
    code(cxt) {
      if (cxt.schema)
        (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
      else
        (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
    }
  };
  recursiveAnchor.default = def;
  return recursiveAnchor;
}
var recursiveRef = {};
var hasRequiredRecursiveRef;
function requireRecursiveRef() {
  if (hasRequiredRecursiveRef) return recursiveRef;
  hasRequiredRecursiveRef = 1;
  Object.defineProperty(recursiveRef, "__esModule", { value: true });
  const dynamicRef_1 = /* @__PURE__ */ requireDynamicRef();
  const def = {
    keyword: "$recursiveRef",
    schemaType: "string",
    code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
  };
  recursiveRef.default = def;
  return recursiveRef;
}
var hasRequiredDynamic;
function requireDynamic() {
  if (hasRequiredDynamic) return dynamic;
  hasRequiredDynamic = 1;
  Object.defineProperty(dynamic, "__esModule", { value: true });
  const dynamicAnchor_1 = /* @__PURE__ */ requireDynamicAnchor();
  const dynamicRef_1 = /* @__PURE__ */ requireDynamicRef();
  const recursiveAnchor_1 = /* @__PURE__ */ requireRecursiveAnchor();
  const recursiveRef_1 = /* @__PURE__ */ requireRecursiveRef();
  const dynamic$1 = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
  dynamic.default = dynamic$1;
  return dynamic;
}
var next = {};
var dependentRequired = {};
var hasRequiredDependentRequired;
function requireDependentRequired() {
  if (hasRequiredDependentRequired) return dependentRequired;
  hasRequiredDependentRequired = 1;
  Object.defineProperty(dependentRequired, "__esModule", { value: true });
  const dependencies_1 = /* @__PURE__ */ requireDependencies();
  const def = {
    keyword: "dependentRequired",
    type: "object",
    schemaType: "object",
    error: dependencies_1.error,
    code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
  };
  dependentRequired.default = def;
  return dependentRequired;
}
var dependentSchemas = {};
var hasRequiredDependentSchemas;
function requireDependentSchemas() {
  if (hasRequiredDependentSchemas) return dependentSchemas;
  hasRequiredDependentSchemas = 1;
  Object.defineProperty(dependentSchemas, "__esModule", { value: true });
  const dependencies_1 = /* @__PURE__ */ requireDependencies();
  const def = {
    keyword: "dependentSchemas",
    type: "object",
    schemaType: "object",
    code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
  };
  dependentSchemas.default = def;
  return dependentSchemas;
}
var limitContains = {};
var hasRequiredLimitContains;
function requireLimitContains() {
  if (hasRequiredLimitContains) return limitContains;
  hasRequiredLimitContains = 1;
  Object.defineProperty(limitContains, "__esModule", { value: true });
  const util_1 = /* @__PURE__ */ requireUtil();
  const def = {
    keyword: ["maxContains", "minContains"],
    type: "array",
    schemaType: "number",
    code({ keyword: keyword2, parentSchema, it }) {
      if (parentSchema.contains === void 0) {
        (0, util_1.checkStrictMode)(it, `"${keyword2}" without "contains" is ignored`);
      }
    }
  };
  limitContains.default = def;
  return limitContains;
}
var hasRequiredNext;
function requireNext() {
  if (hasRequiredNext) return next;
  hasRequiredNext = 1;
  Object.defineProperty(next, "__esModule", { value: true });
  const dependentRequired_1 = /* @__PURE__ */ requireDependentRequired();
  const dependentSchemas_1 = /* @__PURE__ */ requireDependentSchemas();
  const limitContains_1 = /* @__PURE__ */ requireLimitContains();
  const next$1 = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
  next.default = next$1;
  return next;
}
var unevaluated = {};
var unevaluatedProperties = {};
var hasRequiredUnevaluatedProperties;
function requireUnevaluatedProperties() {
  if (hasRequiredUnevaluatedProperties) return unevaluatedProperties;
  hasRequiredUnevaluatedProperties = 1;
  Object.defineProperty(unevaluatedProperties, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const names_1 = /* @__PURE__ */ requireNames();
  const error = {
    message: "must NOT have unevaluated properties",
    params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
  };
  const def = {
    keyword: "unevaluatedProperties",
    type: "object",
    schemaType: ["boolean", "object"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, props } = it;
      if (props instanceof codegen_1.Name) {
        gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
      } else if (props !== true) {
        gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
      }
      it.props = true;
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function unevaluatedPropCode(key) {
        if (schema === false) {
          cxt.setParams({ unevaluatedProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (!(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid2 = gen.name("valid");
          cxt.subschema({
            keyword: "unevaluatedProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          }, valid2);
          if (!allErrors)
            gen.if((0, codegen_1.not)(valid2), () => gen.break());
        }
      }
      function unevaluatedDynamic(evaluatedProps, key) {
        return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
      }
      function unevaluatedStatic(evaluatedProps, key) {
        const ps = [];
        for (const p in evaluatedProps) {
          if (evaluatedProps[p] === true)
            ps.push((0, codegen_1._)`${key} !== ${p}`);
        }
        return (0, codegen_1.and)(...ps);
      }
    }
  };
  unevaluatedProperties.default = def;
  return unevaluatedProperties;
}
var unevaluatedItems = {};
var hasRequiredUnevaluatedItems;
function requireUnevaluatedItems() {
  if (hasRequiredUnevaluatedItems) return unevaluatedItems;
  hasRequiredUnevaluatedItems = 1;
  Object.defineProperty(unevaluatedItems, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  const def = {
    keyword: "unevaluatedItems",
    type: "array",
    schemaType: ["boolean", "object"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      const items2 = it.items || 0;
      if (items2 === true)
        return;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items2 });
        cxt.fail((0, codegen_1._)`${len} > ${items2}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid2 = gen.var("valid", (0, codegen_1._)`${len} <= ${items2}`);
        gen.if((0, codegen_1.not)(valid2), () => validateItems(valid2, items2));
        cxt.ok(valid2);
      }
      it.items = true;
      function validateItems(valid2, from) {
        gen.forRange("i", from, len, (i) => {
          cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid2);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid2), () => gen.break());
        });
      }
    }
  };
  unevaluatedItems.default = def;
  return unevaluatedItems;
}
var hasRequiredUnevaluated;
function requireUnevaluated() {
  if (hasRequiredUnevaluated) return unevaluated;
  hasRequiredUnevaluated = 1;
  Object.defineProperty(unevaluated, "__esModule", { value: true });
  const unevaluatedProperties_1 = /* @__PURE__ */ requireUnevaluatedProperties();
  const unevaluatedItems_1 = /* @__PURE__ */ requireUnevaluatedItems();
  const unevaluated$1 = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
  unevaluated.default = unevaluated$1;
  return unevaluated;
}
var format$1 = {};
var format = {};
var hasRequiredFormat$1;
function requireFormat$1() {
  if (hasRequiredFormat$1) return format;
  hasRequiredFormat$1 = 1;
  Object.defineProperty(format, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
  };
  const def = {
    keyword: "format",
    type: ["number", "string"],
    schemaType: "string",
    $data: true,
    error,
    code(cxt, ruleType) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const { opts, errSchemaPath, schemaEnv, self } = it;
      if (!opts.validateFormats)
        return;
      if ($data)
        validate$DataFormat();
      else
        validateFormat();
      function validate$DataFormat() {
        const fmts = gen.scopeValue("formats", {
          ref: self.formats,
          code: opts.code.formats
        });
        const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
        const fType = gen.let("fType");
        const format2 = gen.let("format");
        gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format2, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format2, fDef));
        cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
        function unknownFmt() {
          if (opts.strictSchema === false)
            return codegen_1.nil;
          return (0, codegen_1._)`${schemaCode} && !${format2}`;
        }
        function invalidFmt() {
          const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format2}(${data}) : ${format2}(${data}))` : (0, codegen_1._)`${format2}(${data})`;
          const validData = (0, codegen_1._)`(typeof ${format2} == "function" ? ${callFormat} : ${format2}.test(${data}))`;
          return (0, codegen_1._)`${format2} && ${format2} !== true && ${fType} === ${ruleType} && !${validData}`;
        }
      }
      function validateFormat() {
        const formatDef = self.formats[schema];
        if (!formatDef) {
          unknownFormat();
          return;
        }
        if (formatDef === true)
          return;
        const [fmtType, format2, fmtRef] = getFormat(formatDef);
        if (fmtType === ruleType)
          cxt.pass(validCondition());
        function unknownFormat() {
          if (opts.strictSchema === false) {
            self.logger.warn(unknownMsg());
            return;
          }
          throw new Error(unknownMsg());
          function unknownMsg() {
            return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
          }
        }
        function getFormat(fmtDef) {
          const code2 = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
          const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code: code2 });
          if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
            return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
          }
          return ["string", fmtDef, fmt];
        }
        function validCondition() {
          if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
            if (!schemaEnv.$async)
              throw new Error("async format in sync schema");
            return (0, codegen_1._)`await ${fmtRef}(${data})`;
          }
          return typeof format2 == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
        }
      }
    }
  };
  format.default = def;
  return format;
}
var hasRequiredFormat;
function requireFormat() {
  if (hasRequiredFormat) return format$1;
  hasRequiredFormat = 1;
  Object.defineProperty(format$1, "__esModule", { value: true });
  const format_1 = /* @__PURE__ */ requireFormat$1();
  const format2 = [format_1.default];
  format$1.default = format2;
  return format$1;
}
var metadata = {};
var hasRequiredMetadata;
function requireMetadata() {
  if (hasRequiredMetadata) return metadata;
  hasRequiredMetadata = 1;
  Object.defineProperty(metadata, "__esModule", { value: true });
  metadata.contentVocabulary = metadata.metadataVocabulary = void 0;
  metadata.metadataVocabulary = [
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples"
  ];
  metadata.contentVocabulary = [
    "contentMediaType",
    "contentEncoding",
    "contentSchema"
  ];
  return metadata;
}
var hasRequiredDraft2020;
function requireDraft2020() {
  if (hasRequiredDraft2020) return draft2020;
  hasRequiredDraft2020 = 1;
  Object.defineProperty(draft2020, "__esModule", { value: true });
  const core_1 = /* @__PURE__ */ requireCore();
  const validation_1 = /* @__PURE__ */ requireValidation();
  const applicator_1 = /* @__PURE__ */ requireApplicator();
  const dynamic_1 = /* @__PURE__ */ requireDynamic();
  const next_1 = /* @__PURE__ */ requireNext();
  const unevaluated_1 = /* @__PURE__ */ requireUnevaluated();
  const format_1 = /* @__PURE__ */ requireFormat();
  const metadata_1 = /* @__PURE__ */ requireMetadata();
  const draft2020Vocabularies = [
    dynamic_1.default,
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(true),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary,
    next_1.default,
    unevaluated_1.default
  ];
  draft2020.default = draft2020Vocabularies;
  return draft2020;
}
var discriminator = {};
var types = {};
var hasRequiredTypes;
function requireTypes() {
  if (hasRequiredTypes) return types;
  hasRequiredTypes = 1;
  Object.defineProperty(types, "__esModule", { value: true });
  types.DiscrError = void 0;
  var DiscrError;
  (function(DiscrError2) {
    DiscrError2["Tag"] = "tag";
    DiscrError2["Mapping"] = "mapping";
  })(DiscrError || (types.DiscrError = DiscrError = {}));
  return types;
}
var hasRequiredDiscriminator;
function requireDiscriminator() {
  if (hasRequiredDiscriminator) return discriminator;
  hasRequiredDiscriminator = 1;
  Object.defineProperty(discriminator, "__esModule", { value: true });
  const codegen_1 = /* @__PURE__ */ requireCodegen();
  const types_1 = /* @__PURE__ */ requireTypes();
  const compile_1 = /* @__PURE__ */ requireCompile();
  const ref_error_1 = /* @__PURE__ */ requireRef_error();
  const util_1 = /* @__PURE__ */ requireUtil();
  const error = {
    message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
    params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
  };
  const def = {
    keyword: "discriminator",
    type: "object",
    schemaType: "object",
    error,
    code(cxt) {
      const { gen, data, schema, parentSchema, it } = cxt;
      const { oneOf: oneOf2 } = parentSchema;
      if (!it.opts.discriminator) {
        throw new Error("discriminator: requires discriminator option");
      }
      const tagName = schema.propertyName;
      if (typeof tagName != "string")
        throw new Error("discriminator: requires propertyName");
      if (schema.mapping)
        throw new Error("discriminator: mapping is not supported");
      if (!oneOf2)
        throw new Error("discriminator: requires oneOf keyword");
      const valid2 = gen.let("valid", false);
      const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
      gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
      cxt.ok(valid2);
      function validateMapping() {
        const mapping = getMapping();
        gen.if(false);
        for (const tagValue in mapping) {
          gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
          gen.assign(valid2, applyTagSchema(mapping[tagValue]));
        }
        gen.else();
        cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
        gen.endIf();
      }
      function applyTagSchema(schemaProp) {
        const _valid = gen.name("valid");
        const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
        cxt.mergeEvaluated(schCxt, codegen_1.Name);
        return _valid;
      }
      function getMapping() {
        var _a;
        const oneOfMapping = {};
        const topRequired = hasRequired(parentSchema);
        let tagRequired = true;
        for (let i = 0; i < oneOf2.length; i++) {
          let sch = oneOf2[i];
          if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
            const ref2 = sch.$ref;
            sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref2);
            if (sch instanceof compile_1.SchemaEnv)
              sch = sch.schema;
            if (sch === void 0)
              throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref2);
          }
          const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
          if (typeof propSch != "object") {
            throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
          }
          tagRequired = tagRequired && (topRequired || hasRequired(sch));
          addMappings(propSch, i);
        }
        if (!tagRequired)
          throw new Error(`discriminator: "${tagName}" must be required`);
        return oneOfMapping;
        function hasRequired({ required: required2 }) {
          return Array.isArray(required2) && required2.includes(tagName);
        }
        function addMappings(sch, i) {
          if (sch.const) {
            addMapping(sch.const, i);
          } else if (sch.enum) {
            for (const tagValue of sch.enum) {
              addMapping(tagValue, i);
            }
          } else {
            throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
          }
        }
        function addMapping(tagValue, i) {
          if (typeof tagValue != "string" || tagValue in oneOfMapping) {
            throw new Error(`discriminator: "${tagName}" values must be unique strings`);
          }
          oneOfMapping[tagValue] = i;
        }
      }
    }
  };
  discriminator.default = def;
  return discriminator;
}
var jsonSchema202012 = {};
const $schema$8 = "https://json-schema.org/draft/2020-12/schema";
const $id$8 = "https://json-schema.org/draft/2020-12/schema";
const $vocabulary$7 = { "https://json-schema.org/draft/2020-12/vocab/core": true, "https://json-schema.org/draft/2020-12/vocab/applicator": true, "https://json-schema.org/draft/2020-12/vocab/unevaluated": true, "https://json-schema.org/draft/2020-12/vocab/validation": true, "https://json-schema.org/draft/2020-12/vocab/meta-data": true, "https://json-schema.org/draft/2020-12/vocab/format-annotation": true, "https://json-schema.org/draft/2020-12/vocab/content": true };
const $dynamicAnchor$7 = "meta";
const title$8 = "Core and Validation specifications meta-schema";
const allOf = [{ "$ref": "meta/core" }, { "$ref": "meta/applicator" }, { "$ref": "meta/unevaluated" }, { "$ref": "meta/validation" }, { "$ref": "meta/meta-data" }, { "$ref": "meta/format-annotation" }, { "$ref": "meta/content" }];
const type$8 = ["object", "boolean"];
const $comment = "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.";
const properties$8 = { "definitions": { "$comment": '"definitions" has been replaced by "$defs".', "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "deprecated": true, "default": {} }, "dependencies": { "$comment": '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.', "type": "object", "additionalProperties": { "anyOf": [{ "$dynamicRef": "#meta" }, { "$ref": "meta/validation#/$defs/stringArray" }] }, "deprecated": true, "default": {} }, "$recursiveAnchor": { "$comment": '"$recursiveAnchor" has been replaced by "$dynamicAnchor".', "$ref": "meta/core#/$defs/anchorString", "deprecated": true }, "$recursiveRef": { "$comment": '"$recursiveRef" has been replaced by "$dynamicRef".', "$ref": "meta/core#/$defs/uriReferenceString", "deprecated": true } };
const require$$0 = {
  $schema: $schema$8,
  $id: $id$8,
  $vocabulary: $vocabulary$7,
  $dynamicAnchor: $dynamicAnchor$7,
  title: title$8,
  allOf,
  type: type$8,
  $comment,
  properties: properties$8
};
const $schema$7 = "https://json-schema.org/draft/2020-12/schema";
const $id$7 = "https://json-schema.org/draft/2020-12/meta/applicator";
const $vocabulary$6 = { "https://json-schema.org/draft/2020-12/vocab/applicator": true };
const $dynamicAnchor$6 = "meta";
const title$7 = "Applicator vocabulary meta-schema";
const type$7 = ["object", "boolean"];
const properties$7 = { "prefixItems": { "$ref": "#/$defs/schemaArray" }, "items": { "$dynamicRef": "#meta" }, "contains": { "$dynamicRef": "#meta" }, "additionalProperties": { "$dynamicRef": "#meta" }, "properties": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "default": {} }, "patternProperties": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "propertyNames": { "format": "regex" }, "default": {} }, "dependentSchemas": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" }, "default": {} }, "propertyNames": { "$dynamicRef": "#meta" }, "if": { "$dynamicRef": "#meta" }, "then": { "$dynamicRef": "#meta" }, "else": { "$dynamicRef": "#meta" }, "allOf": { "$ref": "#/$defs/schemaArray" }, "anyOf": { "$ref": "#/$defs/schemaArray" }, "oneOf": { "$ref": "#/$defs/schemaArray" }, "not": { "$dynamicRef": "#meta" } };
const $defs$2 = { "schemaArray": { "type": "array", "minItems": 1, "items": { "$dynamicRef": "#meta" } } };
const require$$1 = {
  $schema: $schema$7,
  $id: $id$7,
  $vocabulary: $vocabulary$6,
  $dynamicAnchor: $dynamicAnchor$6,
  title: title$7,
  type: type$7,
  properties: properties$7,
  $defs: $defs$2
};
const $schema$6 = "https://json-schema.org/draft/2020-12/schema";
const $id$6 = "https://json-schema.org/draft/2020-12/meta/unevaluated";
const $vocabulary$5 = { "https://json-schema.org/draft/2020-12/vocab/unevaluated": true };
const $dynamicAnchor$5 = "meta";
const title$6 = "Unevaluated applicator vocabulary meta-schema";
const type$6 = ["object", "boolean"];
const properties$6 = { "unevaluatedItems": { "$dynamicRef": "#meta" }, "unevaluatedProperties": { "$dynamicRef": "#meta" } };
const require$$2 = {
  $schema: $schema$6,
  $id: $id$6,
  $vocabulary: $vocabulary$5,
  $dynamicAnchor: $dynamicAnchor$5,
  title: title$6,
  type: type$6,
  properties: properties$6
};
const $schema$5 = "https://json-schema.org/draft/2020-12/schema";
const $id$5 = "https://json-schema.org/draft/2020-12/meta/content";
const $vocabulary$4 = { "https://json-schema.org/draft/2020-12/vocab/content": true };
const $dynamicAnchor$4 = "meta";
const title$5 = "Content vocabulary meta-schema";
const type$5 = ["object", "boolean"];
const properties$5 = { "contentEncoding": { "type": "string" }, "contentMediaType": { "type": "string" }, "contentSchema": { "$dynamicRef": "#meta" } };
const require$$3$1 = {
  $schema: $schema$5,
  $id: $id$5,
  $vocabulary: $vocabulary$4,
  $dynamicAnchor: $dynamicAnchor$4,
  title: title$5,
  type: type$5,
  properties: properties$5
};
const $schema$4 = "https://json-schema.org/draft/2020-12/schema";
const $id$4 = "https://json-schema.org/draft/2020-12/meta/core";
const $vocabulary$3 = { "https://json-schema.org/draft/2020-12/vocab/core": true };
const $dynamicAnchor$3 = "meta";
const title$4 = "Core vocabulary meta-schema";
const type$4 = ["object", "boolean"];
const properties$4 = { "$id": { "$ref": "#/$defs/uriReferenceString", "$comment": "Non-empty fragments not allowed.", "pattern": "^[^#]*#?$" }, "$schema": { "$ref": "#/$defs/uriString" }, "$ref": { "$ref": "#/$defs/uriReferenceString" }, "$anchor": { "$ref": "#/$defs/anchorString" }, "$dynamicRef": { "$ref": "#/$defs/uriReferenceString" }, "$dynamicAnchor": { "$ref": "#/$defs/anchorString" }, "$vocabulary": { "type": "object", "propertyNames": { "$ref": "#/$defs/uriString" }, "additionalProperties": { "type": "boolean" } }, "$comment": { "type": "string" }, "$defs": { "type": "object", "additionalProperties": { "$dynamicRef": "#meta" } } };
const $defs$1 = { "anchorString": { "type": "string", "pattern": "^[A-Za-z_][-A-Za-z0-9._]*$" }, "uriString": { "type": "string", "format": "uri" }, "uriReferenceString": { "type": "string", "format": "uri-reference" } };
const require$$4 = {
  $schema: $schema$4,
  $id: $id$4,
  $vocabulary: $vocabulary$3,
  $dynamicAnchor: $dynamicAnchor$3,
  title: title$4,
  type: type$4,
  properties: properties$4,
  $defs: $defs$1
};
const $schema$3 = "https://json-schema.org/draft/2020-12/schema";
const $id$3 = "https://json-schema.org/draft/2020-12/meta/format-annotation";
const $vocabulary$2 = { "https://json-schema.org/draft/2020-12/vocab/format-annotation": true };
const $dynamicAnchor$2 = "meta";
const title$3 = "Format vocabulary meta-schema for annotation results";
const type$3 = ["object", "boolean"];
const properties$3 = { "format": { "type": "string" } };
const require$$5 = {
  $schema: $schema$3,
  $id: $id$3,
  $vocabulary: $vocabulary$2,
  $dynamicAnchor: $dynamicAnchor$2,
  title: title$3,
  type: type$3,
  properties: properties$3
};
const $schema$2 = "https://json-schema.org/draft/2020-12/schema";
const $id$2 = "https://json-schema.org/draft/2020-12/meta/meta-data";
const $vocabulary$1 = { "https://json-schema.org/draft/2020-12/vocab/meta-data": true };
const $dynamicAnchor$1 = "meta";
const title$2 = "Meta-data vocabulary meta-schema";
const type$2 = ["object", "boolean"];
const properties$2 = { "title": { "type": "string" }, "description": { "type": "string" }, "default": true, "deprecated": { "type": "boolean", "default": false }, "readOnly": { "type": "boolean", "default": false }, "writeOnly": { "type": "boolean", "default": false }, "examples": { "type": "array", "items": true } };
const require$$6 = {
  $schema: $schema$2,
  $id: $id$2,
  $vocabulary: $vocabulary$1,
  $dynamicAnchor: $dynamicAnchor$1,
  title: title$2,
  type: type$2,
  properties: properties$2
};
const $schema$1 = "https://json-schema.org/draft/2020-12/schema";
const $id$1 = "https://json-schema.org/draft/2020-12/meta/validation";
const $vocabulary = { "https://json-schema.org/draft/2020-12/vocab/validation": true };
const $dynamicAnchor = "meta";
const title$1 = "Validation vocabulary meta-schema";
const type$1 = ["object", "boolean"];
const properties$1 = { "type": { "anyOf": [{ "$ref": "#/$defs/simpleTypes" }, { "type": "array", "items": { "$ref": "#/$defs/simpleTypes" }, "minItems": 1, "uniqueItems": true }] }, "const": true, "enum": { "type": "array", "items": true }, "multipleOf": { "type": "number", "exclusiveMinimum": 0 }, "maximum": { "type": "number" }, "exclusiveMaximum": { "type": "number" }, "minimum": { "type": "number" }, "exclusiveMinimum": { "type": "number" }, "maxLength": { "$ref": "#/$defs/nonNegativeInteger" }, "minLength": { "$ref": "#/$defs/nonNegativeIntegerDefault0" }, "pattern": { "type": "string", "format": "regex" }, "maxItems": { "$ref": "#/$defs/nonNegativeInteger" }, "minItems": { "$ref": "#/$defs/nonNegativeIntegerDefault0" }, "uniqueItems": { "type": "boolean", "default": false }, "maxContains": { "$ref": "#/$defs/nonNegativeInteger" }, "minContains": { "$ref": "#/$defs/nonNegativeInteger", "default": 1 }, "maxProperties": { "$ref": "#/$defs/nonNegativeInteger" }, "minProperties": { "$ref": "#/$defs/nonNegativeIntegerDefault0" }, "required": { "$ref": "#/$defs/stringArray" }, "dependentRequired": { "type": "object", "additionalProperties": { "$ref": "#/$defs/stringArray" } } };
const $defs = { "nonNegativeInteger": { "type": "integer", "minimum": 0 }, "nonNegativeIntegerDefault0": { "$ref": "#/$defs/nonNegativeInteger", "default": 0 }, "simpleTypes": { "enum": ["array", "boolean", "integer", "null", "number", "object", "string"] }, "stringArray": { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "default": [] } };
const require$$7 = {
  $schema: $schema$1,
  $id: $id$1,
  $vocabulary,
  $dynamicAnchor,
  title: title$1,
  type: type$1,
  properties: properties$1,
  $defs
};
var hasRequiredJsonSchema202012;
function requireJsonSchema202012() {
  if (hasRequiredJsonSchema202012) return jsonSchema202012;
  hasRequiredJsonSchema202012 = 1;
  Object.defineProperty(jsonSchema202012, "__esModule", { value: true });
  const metaSchema = require$$0;
  const applicator2 = require$$1;
  const unevaluated2 = require$$2;
  const content = require$$3$1;
  const core2 = require$$4;
  const format2 = require$$5;
  const metadata2 = require$$6;
  const validation2 = require$$7;
  const META_SUPPORT_DATA = ["/properties"];
  function addMetaSchema2020($data) {
    [
      metaSchema,
      applicator2,
      unevaluated2,
      content,
      core2,
      with$data(this, format2),
      metadata2,
      with$data(this, validation2)
    ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
    return this;
    function with$data(ajv2, sch) {
      return $data ? ajv2.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
    }
  }
  jsonSchema202012.default = addMetaSchema2020;
  return jsonSchema202012;
}
var hasRequired_2020;
function require_2020() {
  if (hasRequired_2020) return _2020.exports;
  hasRequired_2020 = 1;
  (function(module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    const core_1 = /* @__PURE__ */ requireCore$1();
    const draft2020_1 = /* @__PURE__ */ requireDraft2020();
    const discriminator_1 = /* @__PURE__ */ requireDiscriminator();
    const json_schema_2020_12_1 = /* @__PURE__ */ requireJsonSchema202012();
    const META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    class Ajv2020 extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    }
    exports.Ajv2020 = Ajv2020;
    module.exports = exports = Ajv2020;
    module.exports.Ajv2020 = Ajv2020;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv2020;
    var validate_1 = /* @__PURE__ */ requireValidate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = /* @__PURE__ */ requireCodegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = /* @__PURE__ */ requireValidation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = /* @__PURE__ */ requireRef_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  })(_2020, _2020.exports);
  return _2020.exports;
}
var _2020Exports = /* @__PURE__ */ require_2020();
var dist = { exports: {} };
var formats = {};
var hasRequiredFormats;
function requireFormats() {
  if (hasRequiredFormats) return formats;
  hasRequiredFormats = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
    function fmtDef(validate2, compare) {
      return { validate: validate2, compare };
    }
    exports.fullFormats = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: fmtDef(date, compareDate),
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: fmtDef(getTime(true), compareTime),
      "date-time": fmtDef(getDateTime(true), compareDateTime),
      "iso-time": fmtDef(getTime(), compareIsoTime),
      "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
      // duration: https://tools.ietf.org/html/rfc3339#appendix-A
      duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
      uri: uri2,
      "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
      // uri-template: https://tools.ietf.org/html/rfc6570
      "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
      // For the source: https://gist.github.com/dperini/729294
      // For test cases: https://mathiasbynens.be/demo/url-regex
      url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
      ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
      "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
      // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
      // byte: https://github.com/miguelmota/is-base64
      byte,
      // signed 32 bit integer
      int32: { type: "number", validate: validateInt32 },
      // signed 64 bit integer
      int64: { type: "number", validate: validateInt64 },
      // C-type float
      float: { type: "number", validate: validateNumber },
      // C-type double
      double: { type: "number", validate: validateNumber },
      // hint to the UI to hide input strings
      password: true,
      // unchecked string payload
      binary: true
    };
    exports.fastFormats = {
      ...exports.fullFormats,
      date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
      time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
      "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
      "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
      "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports.formatNames = Object.keys(exports.fullFormats);
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    function date(str) {
      const matches = DATE.exec(str);
      if (!matches)
        return false;
      const year = +matches[1];
      const month = +matches[2];
      const day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
      if (!(d1 && d2))
        return void 0;
      if (d1 > d2)
        return 1;
      if (d1 < d2)
        return -1;
      return 0;
    }
    const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
    function getTime(strictTimeZone) {
      return function time(str) {
        const matches = TIME.exec(str);
        if (!matches)
          return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min <= 59 && sec < 60)
          return true;
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
      };
    }
    function compareTime(s1, s2) {
      if (!(s1 && s2))
        return void 0;
      const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
      const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
      if (!(t1 && t2))
        return void 0;
      return t1 - t2;
    }
    function compareIsoTime(t1, t2) {
      if (!(t1 && t2))
        return void 0;
      const a1 = TIME.exec(t1);
      const a2 = TIME.exec(t2);
      if (!(a1 && a2))
        return void 0;
      t1 = a1[1] + a1[2] + a1[3];
      t2 = a2[1] + a2[2] + a2[3];
      if (t1 > t2)
        return 1;
      if (t1 < t2)
        return -1;
      return 0;
    }
    const DATE_TIME_SEPARATOR = /t|\s/i;
    function getDateTime(strictTimeZone) {
      const time = getTime(strictTimeZone);
      return function date_time(str) {
        const dateTime = str.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
      };
    }
    function compareDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const d1 = new Date(dt1).valueOf();
      const d2 = new Date(dt2).valueOf();
      if (!(d1 && d2))
        return void 0;
      return d1 - d2;
    }
    function compareIsoDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
      const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
      const res = compareDate(d1, d2);
      if (res === void 0)
        return void 0;
      return res || compareTime(t1, t2);
    }
    const NOT_URI_FRAGMENT = /\/|:/;
    const URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri2(str) {
      return NOT_URI_FRAGMENT.test(str) && URI.test(str);
    }
    const BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
    function byte(str) {
      BYTE.lastIndex = 0;
      return BYTE.test(str);
    }
    const MIN_INT32 = -2147483648;
    const MAX_INT32 = 2 ** 31 - 1;
    function validateInt32(value) {
      return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
    }
    function validateInt64(value) {
      return Number.isInteger(value);
    }
    function validateNumber() {
      return true;
    }
    const Z_ANCHOR = /[^\\]\\Z/;
    function regex(str) {
      if (Z_ANCHOR.test(str))
        return false;
      try {
        new RegExp(str);
        return true;
      } catch (e) {
        return false;
      }
    }
  })(formats);
  return formats;
}
var limit = {};
var ajv = { exports: {} };
var draft7 = {};
var hasRequiredDraft7;
function requireDraft7() {
  if (hasRequiredDraft7) return draft7;
  hasRequiredDraft7 = 1;
  Object.defineProperty(draft7, "__esModule", { value: true });
  const core_1 = /* @__PURE__ */ requireCore();
  const validation_1 = /* @__PURE__ */ requireValidation();
  const applicator_1 = /* @__PURE__ */ requireApplicator();
  const format_1 = /* @__PURE__ */ requireFormat();
  const metadata_1 = /* @__PURE__ */ requireMetadata();
  const draft7Vocabularies = [
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary
  ];
  draft7.default = draft7Vocabularies;
  return draft7;
}
const $schema = "http://json-schema.org/draft-07/schema#";
const $id = "http://json-schema.org/draft-07/schema#";
const title = "Core schema meta-schema";
const definitions = { "schemaArray": { "type": "array", "minItems": 1, "items": { "$ref": "#" } }, "nonNegativeInteger": { "type": "integer", "minimum": 0 }, "nonNegativeIntegerDefault0": { "allOf": [{ "$ref": "#/definitions/nonNegativeInteger" }, { "default": 0 }] }, "simpleTypes": { "enum": ["array", "boolean", "integer", "null", "number", "object", "string"] }, "stringArray": { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "default": [] } };
const type = ["object", "boolean"];
const properties = { "$id": { "type": "string", "format": "uri-reference" }, "$schema": { "type": "string", "format": "uri" }, "$ref": { "type": "string", "format": "uri-reference" }, "$comment": { "type": "string" }, "title": { "type": "string" }, "description": { "type": "string" }, "default": true, "readOnly": { "type": "boolean", "default": false }, "examples": { "type": "array", "items": true }, "multipleOf": { "type": "number", "exclusiveMinimum": 0 }, "maximum": { "type": "number" }, "exclusiveMaximum": { "type": "number" }, "minimum": { "type": "number" }, "exclusiveMinimum": { "type": "number" }, "maxLength": { "$ref": "#/definitions/nonNegativeInteger" }, "minLength": { "$ref": "#/definitions/nonNegativeIntegerDefault0" }, "pattern": { "type": "string", "format": "regex" }, "additionalItems": { "$ref": "#" }, "items": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/schemaArray" }], "default": true }, "maxItems": { "$ref": "#/definitions/nonNegativeInteger" }, "minItems": { "$ref": "#/definitions/nonNegativeIntegerDefault0" }, "uniqueItems": { "type": "boolean", "default": false }, "contains": { "$ref": "#" }, "maxProperties": { "$ref": "#/definitions/nonNegativeInteger" }, "minProperties": { "$ref": "#/definitions/nonNegativeIntegerDefault0" }, "required": { "$ref": "#/definitions/stringArray" }, "additionalProperties": { "$ref": "#" }, "definitions": { "type": "object", "additionalProperties": { "$ref": "#" }, "default": {} }, "properties": { "type": "object", "additionalProperties": { "$ref": "#" }, "default": {} }, "patternProperties": { "type": "object", "additionalProperties": { "$ref": "#" }, "propertyNames": { "format": "regex" }, "default": {} }, "dependencies": { "type": "object", "additionalProperties": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/stringArray" }] } }, "propertyNames": { "$ref": "#" }, "const": true, "enum": { "type": "array", "items": true, "minItems": 1, "uniqueItems": true }, "type": { "anyOf": [{ "$ref": "#/definitions/simpleTypes" }, { "type": "array", "items": { "$ref": "#/definitions/simpleTypes" }, "minItems": 1, "uniqueItems": true }] }, "format": { "type": "string" }, "contentMediaType": { "type": "string" }, "contentEncoding": { "type": "string" }, "if": { "$ref": "#" }, "then": { "$ref": "#" }, "else": { "$ref": "#" }, "allOf": { "$ref": "#/definitions/schemaArray" }, "anyOf": { "$ref": "#/definitions/schemaArray" }, "oneOf": { "$ref": "#/definitions/schemaArray" }, "not": { "$ref": "#" } };
const require$$3 = {
  $schema,
  $id,
  title,
  definitions,
  type,
  properties,
  "default": true
};
var hasRequiredAjv;
function requireAjv() {
  if (hasRequiredAjv) return ajv.exports;
  hasRequiredAjv = 1;
  (function(module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
    const core_1 = /* @__PURE__ */ requireCore$1();
    const draft7_1 = /* @__PURE__ */ requireDraft7();
    const discriminator_1 = /* @__PURE__ */ requireDiscriminator();
    const draft7MetaSchema = require$$3;
    const META_SUPPORT_DATA = ["/properties"];
    const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    class Ajv extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    }
    exports.Ajv = Ajv;
    module.exports = exports = Ajv;
    module.exports.Ajv = Ajv;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv;
    var validate_1 = /* @__PURE__ */ requireValidate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = /* @__PURE__ */ requireCodegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = /* @__PURE__ */ requireValidation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = /* @__PURE__ */ requireRef_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  })(ajv, ajv.exports);
  return ajv.exports;
}
var hasRequiredLimit;
function requireLimit() {
  if (hasRequiredLimit) return limit;
  hasRequiredLimit = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatLimitDefinition = void 0;
    const ajv_1 = /* @__PURE__ */ requireAjv();
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const ops = codegen_1.operators;
    const KWDs = {
      formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    const error = {
      message: ({ keyword: keyword2, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword2].okStr} ${schemaCode}`,
      params: ({ keyword: keyword2, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword2].okStr}, limit: ${schemaCode}}`
    };
    exports.formatLimitDefinition = {
      keyword: Object.keys(KWDs),
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, keyword: keyword2, it } = cxt;
        const { opts, self } = it;
        if (!opts.validateFormats)
          return;
        const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
        if (fCxt.$data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
          cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
          const format2 = fCxt.schema;
          const fmtDef = self.formats[format2];
          if (!fmtDef || fmtDef === true)
            return;
          if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
            throw new Error(`"${keyword2}": format "${format2}" does not define "compare" function`);
          }
          const fmt = gen.scopeValue("formats", {
            key: format2,
            ref: fmtDef,
            code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format2)}` : void 0
          });
          cxt.fail$data(compareCode(fmt));
        }
        function compareCode(fmt) {
          return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword2].fail} 0`;
        }
      },
      dependencies: ["format"]
    };
    const formatLimitPlugin = (ajv2) => {
      ajv2.addKeyword(exports.formatLimitDefinition);
      return ajv2;
    };
    exports.default = formatLimitPlugin;
  })(limit);
  return limit;
}
var hasRequiredDist;
function requireDist() {
  if (hasRequiredDist) return dist.exports;
  hasRequiredDist = 1;
  (function(module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    const formats_1 = requireFormats();
    const limit_1 = requireLimit();
    const codegen_1 = /* @__PURE__ */ requireCodegen();
    const fullName = new codegen_1.Name("fullFormats");
    const fastName = new codegen_1.Name("fastFormats");
    const formatsPlugin = (ajv2, opts = { keywords: true }) => {
      if (Array.isArray(opts)) {
        addFormats(ajv2, opts, formats_1.fullFormats, fullName);
        return ajv2;
      }
      const [formats2, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
      const list = opts.formats || formats_1.formatNames;
      addFormats(ajv2, list, formats2, exportName);
      if (opts.keywords)
        (0, limit_1.default)(ajv2);
      return ajv2;
    };
    formatsPlugin.get = (name, mode = "full") => {
      const formats2 = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
      const f = formats2[name];
      if (!f)
        throw new Error(`Unknown format "${name}"`);
      return f;
    };
    function addFormats(ajv2, list, fs2, exportName) {
      var _a;
      var _b;
      (_a = (_b = ajv2.opts.code).formats) !== null && _a !== void 0 ? _a : _b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`;
      for (const f of list)
        ajv2.addFormat(f, fs2[f]);
    }
    module.exports = exports = formatsPlugin;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = formatsPlugin;
  })(dist, dist.exports);
  return dist.exports;
}
var distExports = requireDist();
const ajvFormatsModule = /* @__PURE__ */ getDefaultExportFromCjs(distExports);
const copyProperty = (to, from, property, ignoreNonConfigurable) => {
  if (property === "length" || property === "prototype") {
    return;
  }
  if (property === "arguments" || property === "caller") {
    return;
  }
  const toDescriptor = Object.getOwnPropertyDescriptor(to, property);
  const fromDescriptor = Object.getOwnPropertyDescriptor(from, property);
  if (!canCopyProperty(toDescriptor, fromDescriptor) && ignoreNonConfigurable) {
    return;
  }
  Object.defineProperty(to, property, fromDescriptor);
};
const canCopyProperty = function(toDescriptor, fromDescriptor) {
  return toDescriptor === void 0 || toDescriptor.configurable || toDescriptor.writable === fromDescriptor.writable && toDescriptor.enumerable === fromDescriptor.enumerable && toDescriptor.configurable === fromDescriptor.configurable && (toDescriptor.writable || toDescriptor.value === fromDescriptor.value);
};
const changePrototype = (to, from) => {
  const fromPrototype = Object.getPrototypeOf(from);
  if (fromPrototype === Object.getPrototypeOf(to)) {
    return;
  }
  Object.setPrototypeOf(to, fromPrototype);
};
const wrappedToString = (withName, fromBody) => `/* Wrapped ${withName}*/
${fromBody}`;
const toStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, "toString");
const toStringName = Object.getOwnPropertyDescriptor(Function.prototype.toString, "name");
const changeToString = (to, from, name) => {
  const withName = name === "" ? "" : `with ${name.trim()}() `;
  const newToString = wrappedToString.bind(null, withName, from.toString());
  Object.defineProperty(newToString, "name", toStringName);
  const { writable, enumerable, configurable } = toStringDescriptor;
  Object.defineProperty(to, "toString", { value: newToString, writable, enumerable, configurable });
};
function mimicFunction(to, from, { ignoreNonConfigurable = false } = {}) {
  const { name } = to;
  for (const property of Reflect.ownKeys(from)) {
    copyProperty(to, from, property, ignoreNonConfigurable);
  }
  changePrototype(to, from);
  changeToString(to, from, name);
  return to;
}
const debounceFunction = (inputFunction, options = {}) => {
  if (typeof inputFunction !== "function") {
    throw new TypeError(`Expected the first argument to be a function, got \`${typeof inputFunction}\``);
  }
  const {
    wait = 0,
    maxWait = Number.POSITIVE_INFINITY,
    before = false,
    after = true
  } = options;
  if (wait < 0 || maxWait < 0) {
    throw new RangeError("`wait` and `maxWait` must not be negative.");
  }
  if (!before && !after) {
    throw new Error("Both `before` and `after` are false, function wouldn't be called.");
  }
  let timeout;
  let maxTimeout;
  let result;
  const debouncedFunction = function(...arguments_) {
    const context = this;
    const later = () => {
      timeout = void 0;
      if (maxTimeout) {
        clearTimeout(maxTimeout);
        maxTimeout = void 0;
      }
      if (after) {
        result = inputFunction.apply(context, arguments_);
      }
    };
    const maxLater = () => {
      maxTimeout = void 0;
      if (timeout) {
        clearTimeout(timeout);
        timeout = void 0;
      }
      if (after) {
        result = inputFunction.apply(context, arguments_);
      }
    };
    const shouldCallNow = before && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (maxWait > 0 && maxWait !== Number.POSITIVE_INFINITY && !maxTimeout) {
      maxTimeout = setTimeout(maxLater, maxWait);
    }
    if (shouldCallNow) {
      result = inputFunction.apply(context, arguments_);
    }
    return result;
  };
  mimicFunction(debouncedFunction, inputFunction);
  debouncedFunction.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = void 0;
    }
    if (maxTimeout) {
      clearTimeout(maxTimeout);
      maxTimeout = void 0;
    }
  };
  return debouncedFunction;
};
var re = { exports: {} };
var constants;
var hasRequiredConstants;
function requireConstants() {
  if (hasRequiredConstants) return constants;
  hasRequiredConstants = 1;
  const SEMVER_SPEC_VERSION = "2.0.0";
  const MAX_LENGTH = 256;
  const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
  9007199254740991;
  const MAX_SAFE_COMPONENT_LENGTH = 16;
  const MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
  const RELEASE_TYPES = [
    "major",
    "premajor",
    "minor",
    "preminor",
    "patch",
    "prepatch",
    "prerelease"
  ];
  constants = {
    MAX_LENGTH,
    MAX_SAFE_COMPONENT_LENGTH,
    MAX_SAFE_BUILD_LENGTH,
    MAX_SAFE_INTEGER,
    RELEASE_TYPES,
    SEMVER_SPEC_VERSION,
    FLAG_INCLUDE_PRERELEASE: 1,
    FLAG_LOOSE: 2
  };
  return constants;
}
var debug_1;
var hasRequiredDebug;
function requireDebug() {
  if (hasRequiredDebug) return debug_1;
  hasRequiredDebug = 1;
  const debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
  };
  debug_1 = debug;
  return debug_1;
}
var hasRequiredRe;
function requireRe() {
  if (hasRequiredRe) return re.exports;
  hasRequiredRe = 1;
  (function(module, exports) {
    const {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = requireConstants();
    const debug = requireDebug();
    exports = module.exports = {};
    const re2 = exports.re = [];
    const safeRe = exports.safeRe = [];
    const src = exports.src = [];
    const safeSrc = exports.safeSrc = [];
    const t = exports.t = {};
    let R = 0;
    const LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    const safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    const makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    const createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re2[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  })(re, re.exports);
  return re.exports;
}
var parseOptions_1;
var hasRequiredParseOptions;
function requireParseOptions() {
  if (hasRequiredParseOptions) return parseOptions_1;
  hasRequiredParseOptions = 1;
  const looseOption = Object.freeze({ loose: true });
  const emptyOpts = Object.freeze({});
  const parseOptions = (options) => {
    if (!options) {
      return emptyOpts;
    }
    if (typeof options !== "object") {
      return looseOption;
    }
    return options;
  };
  parseOptions_1 = parseOptions;
  return parseOptions_1;
}
var identifiers;
var hasRequiredIdentifiers;
function requireIdentifiers() {
  if (hasRequiredIdentifiers) return identifiers;
  hasRequiredIdentifiers = 1;
  const numeric = /^[0-9]+$/;
  const compareIdentifiers = (a, b) => {
    if (typeof a === "number" && typeof b === "number") {
      return a === b ? 0 : a < b ? -1 : 1;
    }
    const anum = numeric.test(a);
    const bnum = numeric.test(b);
    if (anum && bnum) {
      a = +a;
      b = +b;
    }
    return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
  };
  const rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
  identifiers = {
    compareIdentifiers,
    rcompareIdentifiers
  };
  return identifiers;
}
var semver$2;
var hasRequiredSemver$1;
function requireSemver$1() {
  if (hasRequiredSemver$1) return semver$2;
  hasRequiredSemver$1 = 1;
  const debug = requireDebug();
  const { MAX_LENGTH, MAX_SAFE_INTEGER } = requireConstants();
  const { safeRe: re2, t } = requireRe();
  const parseOptions = requireParseOptions();
  const { compareIdentifiers } = requireIdentifiers();
  const isPrereleaseIdentifier = (prerelease, identifier) => {
    const identifiers2 = identifier.split(".");
    if (identifiers2.length > prerelease.length) {
      return false;
    }
    for (let i = 0; i < identifiers2.length; i++) {
      if (compareIdentifiers(prerelease[i], identifiers2[i]) !== 0) {
        return false;
      }
    }
    return true;
  };
  class SemVer {
    constructor(version, options) {
      options = parseOptions(options);
      if (version instanceof SemVer) {
        if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
          return version;
        } else {
          version = version.version;
        }
      } else if (typeof version !== "string") {
        throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
      }
      if (version.length > MAX_LENGTH) {
        throw new TypeError(
          `version is longer than ${MAX_LENGTH} characters`
        );
      }
      debug("SemVer", version, options);
      this.options = options;
      this.loose = !!options.loose;
      this.includePrerelease = !!options.includePrerelease;
      const m2 = version.trim().match(options.loose ? re2[t.LOOSE] : re2[t.FULL]);
      if (!m2) {
        throw new TypeError(`Invalid Version: ${version}`);
      }
      this.raw = version;
      this.major = +m2[1];
      this.minor = +m2[2];
      this.patch = +m2[3];
      if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
        throw new TypeError("Invalid major version");
      }
      if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
        throw new TypeError("Invalid minor version");
      }
      if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
        throw new TypeError("Invalid patch version");
      }
      if (!m2[4]) {
        this.prerelease = [];
      } else {
        this.prerelease = m2[4].split(".").map((id2) => {
          if (/^[0-9]+$/.test(id2)) {
            const num = +id2;
            if (num >= 0 && num < MAX_SAFE_INTEGER) {
              return num;
            }
          }
          return id2;
        });
      }
      this.build = m2[5] ? m2[5].split(".") : [];
      this.format();
    }
    format() {
      this.version = `${this.major}.${this.minor}.${this.patch}`;
      if (this.prerelease.length) {
        this.version += `-${this.prerelease.join(".")}`;
      }
      return this.version;
    }
    toString() {
      return this.version;
    }
    compare(other) {
      debug("SemVer.compare", this.version, this.options, other);
      if (!(other instanceof SemVer)) {
        if (typeof other === "string" && other === this.version) {
          return 0;
        }
        other = new SemVer(other, this.options);
      }
      if (other.version === this.version) {
        return 0;
      }
      return this.compareMain(other) || this.comparePre(other);
    }
    compareMain(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      if (this.major < other.major) {
        return -1;
      }
      if (this.major > other.major) {
        return 1;
      }
      if (this.minor < other.minor) {
        return -1;
      }
      if (this.minor > other.minor) {
        return 1;
      }
      if (this.patch < other.patch) {
        return -1;
      }
      if (this.patch > other.patch) {
        return 1;
      }
      return 0;
    }
    comparePre(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      if (this.prerelease.length && !other.prerelease.length) {
        return -1;
      } else if (!this.prerelease.length && other.prerelease.length) {
        return 1;
      } else if (!this.prerelease.length && !other.prerelease.length) {
        return 0;
      }
      let i = 0;
      do {
        const a = this.prerelease[i];
        const b = other.prerelease[i];
        debug("prerelease compare", i, a, b);
        if (a === void 0 && b === void 0) {
          return 0;
        } else if (b === void 0) {
          return 1;
        } else if (a === void 0) {
          return -1;
        } else if (a === b) {
          continue;
        } else {
          return compareIdentifiers(a, b);
        }
      } while (++i);
    }
    compareBuild(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      let i = 0;
      do {
        const a = this.build[i];
        const b = other.build[i];
        debug("build compare", i, a, b);
        if (a === void 0 && b === void 0) {
          return 0;
        } else if (b === void 0) {
          return 1;
        } else if (a === void 0) {
          return -1;
        } else if (a === b) {
          continue;
        } else {
          return compareIdentifiers(a, b);
        }
      } while (++i);
    }
    // preminor will bump the version up to the next minor release, and immediately
    // down to pre-release. premajor and prepatch work the same way.
    inc(release, identifier, identifierBase) {
      if (release.startsWith("pre")) {
        if (!identifier && identifierBase === false) {
          throw new Error("invalid increment argument: identifier is empty");
        }
        if (identifier) {
          const match = `-${identifier}`.match(this.options.loose ? re2[t.PRERELEASELOOSE] : re2[t.PRERELEASE]);
          if (!match || match[1] !== identifier) {
            throw new Error(`invalid identifier: ${identifier}`);
          }
        }
      }
      switch (release) {
        case "premajor":
          this.prerelease.length = 0;
          this.patch = 0;
          this.minor = 0;
          this.major++;
          this.inc("pre", identifier, identifierBase);
          break;
        case "preminor":
          this.prerelease.length = 0;
          this.patch = 0;
          this.minor++;
          this.inc("pre", identifier, identifierBase);
          break;
        case "prepatch":
          this.prerelease.length = 0;
          this.inc("patch", identifier, identifierBase);
          this.inc("pre", identifier, identifierBase);
          break;
        // If the input is a non-prerelease version, this acts the same as
        // prepatch.
        case "prerelease":
          if (this.prerelease.length === 0) {
            this.inc("patch", identifier, identifierBase);
          }
          this.inc("pre", identifier, identifierBase);
          break;
        case "release":
          if (this.prerelease.length === 0) {
            throw new Error(`version ${this.raw} is not a prerelease`);
          }
          this.prerelease.length = 0;
          break;
        case "major":
          if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
            this.major++;
          }
          this.minor = 0;
          this.patch = 0;
          this.prerelease = [];
          break;
        case "minor":
          if (this.patch !== 0 || this.prerelease.length === 0) {
            this.minor++;
          }
          this.patch = 0;
          this.prerelease = [];
          break;
        case "patch":
          if (this.prerelease.length === 0) {
            this.patch++;
          }
          this.prerelease = [];
          break;
        // This probably shouldn't be used publicly.
        // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
        case "pre": {
          const base = Number(identifierBase) ? 1 : 0;
          if (this.prerelease.length === 0) {
            this.prerelease = [base];
          } else {
            let i = this.prerelease.length;
            while (--i >= 0) {
              if (typeof this.prerelease[i] === "number") {
                this.prerelease[i]++;
                i = -2;
              }
            }
            if (i === -1) {
              if (identifier === this.prerelease.join(".") && identifierBase === false) {
                throw new Error("invalid increment argument: identifier already exists");
              }
              this.prerelease.push(base);
            }
          }
          if (identifier) {
            let prerelease = [identifier, base];
            if (identifierBase === false) {
              prerelease = [identifier];
            }
            if (isPrereleaseIdentifier(this.prerelease, identifier)) {
              const prereleaseBase = this.prerelease[identifier.split(".").length];
              if (isNaN(prereleaseBase)) {
                this.prerelease = prerelease;
              }
            } else {
              this.prerelease = prerelease;
            }
          }
          break;
        }
        default:
          throw new Error(`invalid increment argument: ${release}`);
      }
      this.raw = this.format();
      if (this.build.length) {
        this.raw += `+${this.build.join(".")}`;
      }
      return this;
    }
  }
  semver$2 = SemVer;
  return semver$2;
}
var parse_1;
var hasRequiredParse;
function requireParse() {
  if (hasRequiredParse) return parse_1;
  hasRequiredParse = 1;
  const SemVer = requireSemver$1();
  const parse = (version, options, throwErrors = false) => {
    if (version instanceof SemVer) {
      return version;
    }
    try {
      return new SemVer(version, options);
    } catch (er) {
      if (!throwErrors) {
        return null;
      }
      throw er;
    }
  };
  parse_1 = parse;
  return parse_1;
}
var valid_1;
var hasRequiredValid$1;
function requireValid$1() {
  if (hasRequiredValid$1) return valid_1;
  hasRequiredValid$1 = 1;
  const parse = requireParse();
  const valid2 = (version, options) => {
    const v = parse(version, options);
    return v ? v.version : null;
  };
  valid_1 = valid2;
  return valid_1;
}
var clean_1;
var hasRequiredClean;
function requireClean() {
  if (hasRequiredClean) return clean_1;
  hasRequiredClean = 1;
  const parse = requireParse();
  const clean = (version, options) => {
    const s = parse(version.trim().replace(/^[=v]+/, ""), options);
    return s ? s.version : null;
  };
  clean_1 = clean;
  return clean_1;
}
var inc_1;
var hasRequiredInc;
function requireInc() {
  if (hasRequiredInc) return inc_1;
  hasRequiredInc = 1;
  const SemVer = requireSemver$1();
  const inc = (version, release, options, identifier, identifierBase) => {
    if (typeof options === "string") {
      identifierBase = identifier;
      identifier = options;
      options = void 0;
    }
    try {
      return new SemVer(
        version instanceof SemVer ? version.version : version,
        options
      ).inc(release, identifier, identifierBase).version;
    } catch (er) {
      return null;
    }
  };
  inc_1 = inc;
  return inc_1;
}
var diff_1;
var hasRequiredDiff;
function requireDiff() {
  if (hasRequiredDiff) return diff_1;
  hasRequiredDiff = 1;
  const parse = requireParse();
  const diff = (version1, version2) => {
    const v1 = parse(version1, null, true);
    const v2 = parse(version2, null, true);
    const comparison = v1.compare(v2);
    if (comparison === 0) {
      return null;
    }
    const v1Higher = comparison > 0;
    const highVersion = v1Higher ? v1 : v2;
    const lowVersion = v1Higher ? v2 : v1;
    const highHasPre = !!highVersion.prerelease.length;
    const lowHasPre = !!lowVersion.prerelease.length;
    if (lowHasPre && !highHasPre) {
      if (!lowVersion.patch && !lowVersion.minor) {
        return "major";
      }
      if (lowVersion.compareMain(highVersion) === 0) {
        if (lowVersion.minor && !lowVersion.patch) {
          return "minor";
        }
        return "patch";
      }
    }
    const prefix = highHasPre ? "pre" : "";
    if (v1.major !== v2.major) {
      return prefix + "major";
    }
    if (v1.minor !== v2.minor) {
      return prefix + "minor";
    }
    if (v1.patch !== v2.patch) {
      return prefix + "patch";
    }
    return "prerelease";
  };
  diff_1 = diff;
  return diff_1;
}
var major_1;
var hasRequiredMajor;
function requireMajor() {
  if (hasRequiredMajor) return major_1;
  hasRequiredMajor = 1;
  const SemVer = requireSemver$1();
  const major = (a, loose) => new SemVer(a, loose).major;
  major_1 = major;
  return major_1;
}
var minor_1;
var hasRequiredMinor;
function requireMinor() {
  if (hasRequiredMinor) return minor_1;
  hasRequiredMinor = 1;
  const SemVer = requireSemver$1();
  const minor = (a, loose) => new SemVer(a, loose).minor;
  minor_1 = minor;
  return minor_1;
}
var patch_1;
var hasRequiredPatch;
function requirePatch() {
  if (hasRequiredPatch) return patch_1;
  hasRequiredPatch = 1;
  const SemVer = requireSemver$1();
  const patch = (a, loose) => new SemVer(a, loose).patch;
  patch_1 = patch;
  return patch_1;
}
var prerelease_1;
var hasRequiredPrerelease;
function requirePrerelease() {
  if (hasRequiredPrerelease) return prerelease_1;
  hasRequiredPrerelease = 1;
  const parse = requireParse();
  const prerelease = (version, options) => {
    const parsed = parse(version, options);
    return parsed && parsed.prerelease.length ? parsed.prerelease : null;
  };
  prerelease_1 = prerelease;
  return prerelease_1;
}
var compare_1;
var hasRequiredCompare;
function requireCompare() {
  if (hasRequiredCompare) return compare_1;
  hasRequiredCompare = 1;
  const SemVer = requireSemver$1();
  const compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
  compare_1 = compare;
  return compare_1;
}
var rcompare_1;
var hasRequiredRcompare;
function requireRcompare() {
  if (hasRequiredRcompare) return rcompare_1;
  hasRequiredRcompare = 1;
  const compare = requireCompare();
  const rcompare = (a, b, loose) => compare(b, a, loose);
  rcompare_1 = rcompare;
  return rcompare_1;
}
var compareLoose_1;
var hasRequiredCompareLoose;
function requireCompareLoose() {
  if (hasRequiredCompareLoose) return compareLoose_1;
  hasRequiredCompareLoose = 1;
  const compare = requireCompare();
  const compareLoose = (a, b) => compare(a, b, true);
  compareLoose_1 = compareLoose;
  return compareLoose_1;
}
var compareBuild_1;
var hasRequiredCompareBuild;
function requireCompareBuild() {
  if (hasRequiredCompareBuild) return compareBuild_1;
  hasRequiredCompareBuild = 1;
  const SemVer = requireSemver$1();
  const compareBuild = (a, b, loose) => {
    const versionA = new SemVer(a, loose);
    const versionB = new SemVer(b, loose);
    return versionA.compare(versionB) || versionA.compareBuild(versionB);
  };
  compareBuild_1 = compareBuild;
  return compareBuild_1;
}
var sort_1;
var hasRequiredSort;
function requireSort() {
  if (hasRequiredSort) return sort_1;
  hasRequiredSort = 1;
  const compareBuild = requireCompareBuild();
  const sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
  sort_1 = sort;
  return sort_1;
}
var rsort_1;
var hasRequiredRsort;
function requireRsort() {
  if (hasRequiredRsort) return rsort_1;
  hasRequiredRsort = 1;
  const compareBuild = requireCompareBuild();
  const rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
  rsort_1 = rsort;
  return rsort_1;
}
var gt_1;
var hasRequiredGt;
function requireGt() {
  if (hasRequiredGt) return gt_1;
  hasRequiredGt = 1;
  const compare = requireCompare();
  const gt = (a, b, loose) => compare(a, b, loose) > 0;
  gt_1 = gt;
  return gt_1;
}
var lt_1;
var hasRequiredLt;
function requireLt() {
  if (hasRequiredLt) return lt_1;
  hasRequiredLt = 1;
  const compare = requireCompare();
  const lt = (a, b, loose) => compare(a, b, loose) < 0;
  lt_1 = lt;
  return lt_1;
}
var eq_1;
var hasRequiredEq;
function requireEq() {
  if (hasRequiredEq) return eq_1;
  hasRequiredEq = 1;
  const compare = requireCompare();
  const eq = (a, b, loose) => compare(a, b, loose) === 0;
  eq_1 = eq;
  return eq_1;
}
var neq_1;
var hasRequiredNeq;
function requireNeq() {
  if (hasRequiredNeq) return neq_1;
  hasRequiredNeq = 1;
  const compare = requireCompare();
  const neq = (a, b, loose) => compare(a, b, loose) !== 0;
  neq_1 = neq;
  return neq_1;
}
var gte_1;
var hasRequiredGte;
function requireGte() {
  if (hasRequiredGte) return gte_1;
  hasRequiredGte = 1;
  const compare = requireCompare();
  const gte = (a, b, loose) => compare(a, b, loose) >= 0;
  gte_1 = gte;
  return gte_1;
}
var lte_1;
var hasRequiredLte;
function requireLte() {
  if (hasRequiredLte) return lte_1;
  hasRequiredLte = 1;
  const compare = requireCompare();
  const lte = (a, b, loose) => compare(a, b, loose) <= 0;
  lte_1 = lte;
  return lte_1;
}
var cmp_1;
var hasRequiredCmp;
function requireCmp() {
  if (hasRequiredCmp) return cmp_1;
  hasRequiredCmp = 1;
  const eq = requireEq();
  const neq = requireNeq();
  const gt = requireGt();
  const gte = requireGte();
  const lt = requireLt();
  const lte = requireLte();
  const cmp = (a, op, b, loose) => {
    switch (op) {
      case "===":
        if (typeof a === "object") {
          a = a.version;
        }
        if (typeof b === "object") {
          b = b.version;
        }
        return a === b;
      case "!==":
        if (typeof a === "object") {
          a = a.version;
        }
        if (typeof b === "object") {
          b = b.version;
        }
        return a !== b;
      case "":
      case "=":
      case "==":
        return eq(a, b, loose);
      case "!=":
        return neq(a, b, loose);
      case ">":
        return gt(a, b, loose);
      case ">=":
        return gte(a, b, loose);
      case "<":
        return lt(a, b, loose);
      case "<=":
        return lte(a, b, loose);
      default:
        throw new TypeError(`Invalid operator: ${op}`);
    }
  };
  cmp_1 = cmp;
  return cmp_1;
}
var coerce_1;
var hasRequiredCoerce;
function requireCoerce() {
  if (hasRequiredCoerce) return coerce_1;
  hasRequiredCoerce = 1;
  const SemVer = requireSemver$1();
  const parse = requireParse();
  const { safeRe: re2, t } = requireRe();
  const coerce = (version, options) => {
    if (version instanceof SemVer) {
      return version;
    }
    if (typeof version === "number") {
      version = String(version);
    }
    if (typeof version !== "string") {
      return null;
    }
    options = options || {};
    let match = null;
    if (!options.rtl) {
      match = version.match(options.includePrerelease ? re2[t.COERCEFULL] : re2[t.COERCE]);
    } else {
      const coerceRtlRegex = options.includePrerelease ? re2[t.COERCERTLFULL] : re2[t.COERCERTL];
      let next2;
      while ((next2 = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
        if (!match || next2.index + next2[0].length !== match.index + match[0].length) {
          match = next2;
        }
        coerceRtlRegex.lastIndex = next2.index + next2[1].length + next2[2].length;
      }
      coerceRtlRegex.lastIndex = -1;
    }
    if (match === null) {
      return null;
    }
    const major = match[2];
    const minor = match[3] || "0";
    const patch = match[4] || "0";
    const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
    const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
    return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
  };
  coerce_1 = coerce;
  return coerce_1;
}
var truncate_1;
var hasRequiredTruncate;
function requireTruncate() {
  if (hasRequiredTruncate) return truncate_1;
  hasRequiredTruncate = 1;
  const parse = requireParse();
  const constants2 = requireConstants();
  const SemVer = requireSemver$1();
  const truncate = (version, truncation, options) => {
    if (!constants2.RELEASE_TYPES.includes(truncation)) {
      return null;
    }
    const clonedVersion = cloneInputVersion(version, options);
    return clonedVersion && doTruncation(clonedVersion, truncation);
  };
  const cloneInputVersion = (version, options) => {
    const versionStringToParse = version instanceof SemVer ? version.version : version;
    return parse(versionStringToParse, options);
  };
  const doTruncation = (version, truncation) => {
    if (isPrerelease(truncation)) {
      return version.version;
    }
    version.prerelease = [];
    switch (truncation) {
      case "major":
        version.minor = 0;
        version.patch = 0;
        break;
      case "minor":
        version.patch = 0;
        break;
    }
    return version.format();
  };
  const isPrerelease = (type2) => {
    return type2.startsWith("pre");
  };
  truncate_1 = truncate;
  return truncate_1;
}
var lrucache;
var hasRequiredLrucache;
function requireLrucache() {
  if (hasRequiredLrucache) return lrucache;
  hasRequiredLrucache = 1;
  class LRUCache {
    constructor() {
      this.max = 1e3;
      this.map = /* @__PURE__ */ new Map();
    }
    get(key) {
      const value = this.map.get(key);
      if (value === void 0) {
        return void 0;
      } else {
        this.map.delete(key);
        this.map.set(key, value);
        return value;
      }
    }
    delete(key) {
      return this.map.delete(key);
    }
    set(key, value) {
      const deleted = this.delete(key);
      if (!deleted && value !== void 0) {
        if (this.map.size >= this.max) {
          const firstKey = this.map.keys().next().value;
          this.delete(firstKey);
        }
        this.map.set(key, value);
      }
      return this;
    }
  }
  lrucache = LRUCache;
  return lrucache;
}
var range;
var hasRequiredRange;
function requireRange() {
  if (hasRequiredRange) return range;
  hasRequiredRange = 1;
  const SPACE_CHARACTERS = /\s+/g;
  class Range {
    constructor(range2, options) {
      options = parseOptions(options);
      if (range2 instanceof Range) {
        if (range2.loose === !!options.loose && range2.includePrerelease === !!options.includePrerelease) {
          return range2;
        } else {
          return new Range(range2.raw, options);
        }
      }
      if (range2 instanceof Comparator) {
        this.raw = range2.value;
        this.set = [[range2]];
        this.formatted = void 0;
        return this;
      }
      this.options = options;
      this.loose = !!options.loose;
      this.includePrerelease = !!options.includePrerelease;
      this.raw = range2.trim().replace(SPACE_CHARACTERS, " ");
      this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
      if (!this.set.length) {
        throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
      }
      if (this.set.length > 1) {
        const first = this.set[0];
        this.set = this.set.filter((c) => !isNullSet(c[0]));
        if (this.set.length === 0) {
          this.set = [first];
        } else if (this.set.length > 1) {
          for (const c of this.set) {
            if (c.length === 1 && isAny(c[0])) {
              this.set = [c];
              break;
            }
          }
        }
      }
      this.formatted = void 0;
    }
    get range() {
      if (this.formatted === void 0) {
        this.formatted = "";
        for (let i = 0; i < this.set.length; i++) {
          if (i > 0) {
            this.formatted += "||";
          }
          const comps = this.set[i];
          for (let k = 0; k < comps.length; k++) {
            if (k > 0) {
              this.formatted += " ";
            }
            this.formatted += comps[k].toString().trim();
          }
        }
      }
      return this.formatted;
    }
    format() {
      return this.range;
    }
    toString() {
      return this.range;
    }
    parseRange(range2) {
      range2 = range2.replace(BUILDSTRIPRE, "");
      const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
      const memoKey = memoOpts + ":" + range2;
      const cached2 = cache2.get(memoKey);
      if (cached2) {
        return cached2;
      }
      const loose = this.options.loose;
      const hr = loose ? re2[t.HYPHENRANGELOOSE] : re2[t.HYPHENRANGE];
      range2 = range2.replace(hr, hyphenReplace(this.options.includePrerelease));
      debug("hyphen replace", range2);
      range2 = range2.replace(re2[t.COMPARATORTRIM], comparatorTrimReplace);
      debug("comparator trim", range2);
      range2 = range2.replace(re2[t.TILDETRIM], tildeTrimReplace);
      debug("tilde trim", range2);
      range2 = range2.replace(re2[t.CARETTRIM], caretTrimReplace);
      debug("caret trim", range2);
      let rangeList = range2.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
      if (loose) {
        rangeList = rangeList.filter((comp) => {
          debug("loose invalid filter", comp, this.options);
          return !!comp.match(re2[t.COMPARATORLOOSE]);
        });
      }
      debug("range list", rangeList);
      const rangeMap = /* @__PURE__ */ new Map();
      const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
      for (const comp of comparators) {
        if (isNullSet(comp)) {
          return [comp];
        }
        rangeMap.set(comp.value, comp);
      }
      if (rangeMap.size > 1 && rangeMap.has("")) {
        rangeMap.delete("");
      }
      const result = [...rangeMap.values()];
      cache2.set(memoKey, result);
      return result;
    }
    intersects(range2, options) {
      if (!(range2 instanceof Range)) {
        throw new TypeError("a Range is required");
      }
      return this.set.some((thisComparators) => {
        return isSatisfiable(thisComparators, options) && range2.set.some((rangeComparators) => {
          return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
            return rangeComparators.every((rangeComparator) => {
              return thisComparator.intersects(rangeComparator, options);
            });
          });
        });
      });
    }
    // if ANY of the sets match ALL of its comparators, then pass
    test(version) {
      if (!version) {
        return false;
      }
      if (typeof version === "string") {
        try {
          version = new SemVer(version, this.options);
        } catch (er) {
          return false;
        }
      }
      for (let i = 0; i < this.set.length; i++) {
        if (testSet(this.set[i], version, this.options)) {
          return true;
        }
      }
      return false;
    }
  }
  range = Range;
  const LRU = requireLrucache();
  const cache2 = new LRU();
  const parseOptions = requireParseOptions();
  const Comparator = requireComparator();
  const debug = requireDebug();
  const SemVer = requireSemver$1();
  const {
    safeRe: re2,
    src,
    t,
    comparatorTrimReplace,
    tildeTrimReplace,
    caretTrimReplace
  } = requireRe();
  const { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = requireConstants();
  const BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
  const isNullSet = (c) => c.value === "<0.0.0-0";
  const isAny = (c) => c.value === "";
  const isSatisfiable = (comparators, options) => {
    let result = true;
    const remainingComparators = comparators.slice();
    let testComparator = remainingComparators.pop();
    while (result && remainingComparators.length) {
      result = remainingComparators.every((otherComparator) => {
        return testComparator.intersects(otherComparator, options);
      });
      testComparator = remainingComparators.pop();
    }
    return result;
  };
  const parseComparator = (comp, options) => {
    comp = comp.replace(re2[t.BUILD], "");
    debug("comp", comp, options);
    comp = replaceCarets(comp, options);
    debug("caret", comp);
    comp = replaceTildes(comp, options);
    debug("tildes", comp);
    comp = replaceXRanges(comp, options);
    debug("xrange", comp);
    comp = replaceStars(comp, options);
    debug("stars", comp);
    return comp;
  };
  const isX = (id2) => !id2 || id2.toLowerCase() === "x" || id2 === "*";
  const invalidXRangeOrder = (M, m2, p) => isX(M) && !isX(m2) || isX(m2) && p && !isX(p);
  const replaceTildes = (comp, options) => {
    return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
  };
  const replaceTilde = (comp, options) => {
    const r = options.loose ? re2[t.TILDELOOSE] : re2[t.TILDE];
    const z = options.includePrerelease ? "-0" : "";
    return comp.replace(r, (_, M, m2, p, pr) => {
      debug("tilde", comp, _, M, m2, p, pr);
      let ret;
      if (isX(M)) {
        ret = "";
      } else if (isX(m2)) {
        ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
      } else if (isX(p)) {
        ret = `>=${M}.${m2}.0${z} <${M}.${+m2 + 1}.0-0`;
      } else if (pr) {
        debug("replaceTilde pr", pr);
        ret = `>=${M}.${m2}.${p}-${pr} <${M}.${+m2 + 1}.0-0`;
      } else {
        ret = `>=${M}.${m2}.${p} <${M}.${+m2 + 1}.0-0`;
      }
      debug("tilde return", ret);
      return ret;
    });
  };
  const replaceCarets = (comp, options) => {
    return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
  };
  const replaceCaret = (comp, options) => {
    debug("caret", comp, options);
    const r = options.loose ? re2[t.CARETLOOSE] : re2[t.CARET];
    const z = options.includePrerelease ? "-0" : "";
    return comp.replace(r, (_, M, m2, p, pr) => {
      debug("caret", comp, _, M, m2, p, pr);
      let ret;
      if (isX(M)) {
        ret = "";
      } else if (isX(m2)) {
        ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
      } else if (isX(p)) {
        if (M === "0") {
          ret = `>=${M}.${m2}.0${z} <${M}.${+m2 + 1}.0-0`;
        } else {
          ret = `>=${M}.${m2}.0${z} <${+M + 1}.0.0-0`;
        }
      } else if (pr) {
        debug("replaceCaret pr", pr);
        if (M === "0") {
          if (m2 === "0") {
            ret = `>=${M}.${m2}.${p}-${pr} <${M}.${m2}.${+p + 1}-0`;
          } else {
            ret = `>=${M}.${m2}.${p}-${pr} <${M}.${+m2 + 1}.0-0`;
          }
        } else {
          ret = `>=${M}.${m2}.${p}-${pr} <${+M + 1}.0.0-0`;
        }
      } else {
        debug("no pr");
        if (M === "0") {
          if (m2 === "0") {
            ret = `>=${M}.${m2}.${p} <${M}.${m2}.${+p + 1}-0`;
          } else {
            ret = `>=${M}.${m2}.${p} <${M}.${+m2 + 1}.0-0`;
          }
        } else {
          ret = `>=${M}.${m2}.${p} <${+M + 1}.0.0-0`;
        }
      }
      debug("caret return", ret);
      return ret;
    });
  };
  const replaceXRanges = (comp, options) => {
    debug("replaceXRanges", comp, options);
    return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
  };
  const replaceXRange = (comp, options) => {
    comp = comp.trim();
    const r = options.loose ? re2[t.XRANGELOOSE] : re2[t.XRANGE];
    return comp.replace(r, (ret, gtlt, M, m2, p, pr) => {
      debug("xRange", comp, ret, gtlt, M, m2, p, pr);
      if (invalidXRangeOrder(M, m2, p)) {
        return comp;
      }
      const xM = isX(M);
      const xm = xM || isX(m2);
      const xp = xm || isX(p);
      const anyX = xp;
      if (gtlt === "=" && anyX) {
        gtlt = "";
      }
      pr = options.includePrerelease ? "-0" : "";
      if (xM) {
        if (gtlt === ">" || gtlt === "<") {
          ret = "<0.0.0-0";
        } else {
          ret = "*";
        }
      } else if (gtlt && anyX) {
        if (xm) {
          m2 = 0;
        }
        p = 0;
        if (gtlt === ">") {
          gtlt = ">=";
          if (xm) {
            M = +M + 1;
            m2 = 0;
            p = 0;
          } else {
            m2 = +m2 + 1;
            p = 0;
          }
        } else if (gtlt === "<=") {
          gtlt = "<";
          if (xm) {
            M = +M + 1;
          } else {
            m2 = +m2 + 1;
          }
        }
        if (gtlt === "<") {
          pr = "-0";
        }
        ret = `${gtlt + M}.${m2}.${p}${pr}`;
      } else if (xm) {
        ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
      } else if (xp) {
        ret = `>=${M}.${m2}.0${pr} <${M}.${+m2 + 1}.0-0`;
      }
      debug("xRange return", ret);
      return ret;
    });
  };
  const replaceStars = (comp, options) => {
    debug("replaceStars", comp, options);
    return comp.trim().replace(re2[t.STAR], "");
  };
  const replaceGTE0 = (comp, options) => {
    debug("replaceGTE0", comp, options);
    return comp.trim().replace(re2[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
  };
  const hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
    if (isX(fM)) {
      from = "";
    } else if (isX(fm)) {
      from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
    } else if (isX(fp)) {
      from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
    } else if (fpr) {
      from = `>=${from}`;
    } else {
      from = `>=${from}${incPr ? "-0" : ""}`;
    }
    if (isX(tM)) {
      to = "";
    } else if (isX(tm)) {
      to = `<${+tM + 1}.0.0-0`;
    } else if (isX(tp)) {
      to = `<${tM}.${+tm + 1}.0-0`;
    } else if (tpr) {
      to = `<=${tM}.${tm}.${tp}-${tpr}`;
    } else if (incPr) {
      to = `<${tM}.${tm}.${+tp + 1}-0`;
    } else {
      to = `<=${to}`;
    }
    return `${from} ${to}`.trim();
  };
  const testSet = (set, version, options) => {
    for (let i = 0; i < set.length; i++) {
      if (!set[i].test(version)) {
        return false;
      }
    }
    if (version.prerelease.length && !options.includePrerelease) {
      for (let i = 0; i < set.length; i++) {
        debug(set[i].semver);
        if (set[i].semver === Comparator.ANY) {
          continue;
        }
        if (set[i].semver.prerelease.length > 0) {
          const allowed = set[i].semver;
          if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
            return true;
          }
        }
      }
      return false;
    }
    return true;
  };
  return range;
}
var comparator;
var hasRequiredComparator;
function requireComparator() {
  if (hasRequiredComparator) return comparator;
  hasRequiredComparator = 1;
  const ANY = /* @__PURE__ */ Symbol("SemVer ANY");
  class Comparator {
    static get ANY() {
      return ANY;
    }
    constructor(comp, options) {
      options = parseOptions(options);
      if (comp instanceof Comparator) {
        if (comp.loose === !!options.loose) {
          return comp;
        } else {
          comp = comp.value;
        }
      }
      comp = comp.trim().split(/\s+/).join(" ");
      debug("comparator", comp, options);
      this.options = options;
      this.loose = !!options.loose;
      this.parse(comp);
      if (this.semver === ANY) {
        this.value = "";
      } else {
        this.value = this.operator + this.semver.version;
      }
      debug("comp", this);
    }
    parse(comp) {
      const r = this.options.loose ? re2[t.COMPARATORLOOSE] : re2[t.COMPARATOR];
      const m2 = comp.match(r);
      if (!m2) {
        throw new TypeError(`Invalid comparator: ${comp}`);
      }
      this.operator = m2[1] !== void 0 ? m2[1] : "";
      if (this.operator === "=") {
        this.operator = "";
      }
      if (!m2[2]) {
        this.semver = ANY;
      } else {
        this.semver = new SemVer(m2[2], this.options.loose);
      }
    }
    toString() {
      return this.value;
    }
    test(version) {
      debug("Comparator.test", version, this.options.loose);
      if (this.semver === ANY || version === ANY) {
        return true;
      }
      if (typeof version === "string") {
        try {
          version = new SemVer(version, this.options);
        } catch (er) {
          return false;
        }
      }
      return cmp(version, this.operator, this.semver, this.options);
    }
    intersects(comp, options) {
      if (!(comp instanceof Comparator)) {
        throw new TypeError("a Comparator is required");
      }
      if (this.operator === "") {
        if (this.value === "") {
          return true;
        }
        return new Range(comp.value, options).test(this.value);
      } else if (comp.operator === "") {
        if (comp.value === "") {
          return true;
        }
        return new Range(this.value, options).test(comp.semver);
      }
      options = parseOptions(options);
      if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
        return false;
      }
      if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
        return false;
      }
      if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
        return true;
      }
      if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
        return true;
      }
      if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
        return true;
      }
      if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
        return true;
      }
      if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
        return true;
      }
      return false;
    }
  }
  comparator = Comparator;
  const parseOptions = requireParseOptions();
  const { safeRe: re2, t } = requireRe();
  const cmp = requireCmp();
  const debug = requireDebug();
  const SemVer = requireSemver$1();
  const Range = requireRange();
  return comparator;
}
var satisfies_1;
var hasRequiredSatisfies;
function requireSatisfies() {
  if (hasRequiredSatisfies) return satisfies_1;
  hasRequiredSatisfies = 1;
  const Range = requireRange();
  const satisfies = (version, range2, options) => {
    try {
      range2 = new Range(range2, options);
    } catch (er) {
      return false;
    }
    return range2.test(version);
  };
  satisfies_1 = satisfies;
  return satisfies_1;
}
var toComparators_1;
var hasRequiredToComparators;
function requireToComparators() {
  if (hasRequiredToComparators) return toComparators_1;
  hasRequiredToComparators = 1;
  const Range = requireRange();
  const toComparators = (range2, options) => new Range(range2, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
  toComparators_1 = toComparators;
  return toComparators_1;
}
var maxSatisfying_1;
var hasRequiredMaxSatisfying;
function requireMaxSatisfying() {
  if (hasRequiredMaxSatisfying) return maxSatisfying_1;
  hasRequiredMaxSatisfying = 1;
  const SemVer = requireSemver$1();
  const Range = requireRange();
  const maxSatisfying = (versions, range2, options) => {
    let max = null;
    let maxSV = null;
    let rangeObj = null;
    try {
      rangeObj = new Range(range2, options);
    } catch (er) {
      return null;
    }
    versions.forEach((v) => {
      if (rangeObj.test(v)) {
        if (!max || maxSV.compare(v) === -1) {
          max = v;
          maxSV = new SemVer(max, options);
        }
      }
    });
    return max;
  };
  maxSatisfying_1 = maxSatisfying;
  return maxSatisfying_1;
}
var minSatisfying_1;
var hasRequiredMinSatisfying;
function requireMinSatisfying() {
  if (hasRequiredMinSatisfying) return minSatisfying_1;
  hasRequiredMinSatisfying = 1;
  const SemVer = requireSemver$1();
  const Range = requireRange();
  const minSatisfying = (versions, range2, options) => {
    let min = null;
    let minSV = null;
    let rangeObj = null;
    try {
      rangeObj = new Range(range2, options);
    } catch (er) {
      return null;
    }
    versions.forEach((v) => {
      if (rangeObj.test(v)) {
        if (!min || minSV.compare(v) === 1) {
          min = v;
          minSV = new SemVer(min, options);
        }
      }
    });
    return min;
  };
  minSatisfying_1 = minSatisfying;
  return minSatisfying_1;
}
var minVersion_1;
var hasRequiredMinVersion;
function requireMinVersion() {
  if (hasRequiredMinVersion) return minVersion_1;
  hasRequiredMinVersion = 1;
  const SemVer = requireSemver$1();
  const Range = requireRange();
  const gt = requireGt();
  const minVersion = (range2, loose) => {
    range2 = new Range(range2, loose);
    let minver = new SemVer("0.0.0");
    if (range2.test(minver)) {
      return minver;
    }
    minver = new SemVer("0.0.0-0");
    if (range2.test(minver)) {
      return minver;
    }
    minver = null;
    for (let i = 0; i < range2.set.length; ++i) {
      const comparators = range2.set[i];
      let setMin = null;
      comparators.forEach((comparator2) => {
        const compver = new SemVer(comparator2.semver.version);
        switch (comparator2.operator) {
          case ">":
            if (compver.prerelease.length === 0) {
              compver.patch++;
            } else {
              compver.prerelease.push(0);
            }
            compver.raw = compver.format();
          /* fallthrough */
          case "":
          case ">=":
            if (!setMin || gt(compver, setMin)) {
              setMin = compver;
            }
            break;
          case "<":
          case "<=":
            break;
          /* istanbul ignore next */
          default:
            throw new Error(`Unexpected operation: ${comparator2.operator}`);
        }
      });
      if (setMin && (!minver || gt(minver, setMin))) {
        minver = setMin;
      }
    }
    if (minver && range2.test(minver)) {
      return minver;
    }
    return null;
  };
  minVersion_1 = minVersion;
  return minVersion_1;
}
var valid;
var hasRequiredValid;
function requireValid() {
  if (hasRequiredValid) return valid;
  hasRequiredValid = 1;
  const Range = requireRange();
  const validRange = (range2, options) => {
    try {
      return new Range(range2, options).range || "*";
    } catch (er) {
      return null;
    }
  };
  valid = validRange;
  return valid;
}
var outside_1;
var hasRequiredOutside;
function requireOutside() {
  if (hasRequiredOutside) return outside_1;
  hasRequiredOutside = 1;
  const SemVer = requireSemver$1();
  const Comparator = requireComparator();
  const { ANY } = Comparator;
  const Range = requireRange();
  const satisfies = requireSatisfies();
  const gt = requireGt();
  const lt = requireLt();
  const lte = requireLte();
  const gte = requireGte();
  const outside = (version, range2, hilo, options) => {
    version = new SemVer(version, options);
    range2 = new Range(range2, options);
    let gtfn, ltefn, ltfn, comp, ecomp;
    switch (hilo) {
      case ">":
        gtfn = gt;
        ltefn = lte;
        ltfn = lt;
        comp = ">";
        ecomp = ">=";
        break;
      case "<":
        gtfn = lt;
        ltefn = gte;
        ltfn = gt;
        comp = "<";
        ecomp = "<=";
        break;
      default:
        throw new TypeError('Must provide a hilo val of "<" or ">"');
    }
    if (satisfies(version, range2, options)) {
      return false;
    }
    for (let i = 0; i < range2.set.length; ++i) {
      const comparators = range2.set[i];
      let high = null;
      let low = null;
      comparators.forEach((comparator2) => {
        if (comparator2.semver === ANY) {
          comparator2 = new Comparator(">=0.0.0");
        }
        high = high || comparator2;
        low = low || comparator2;
        if (gtfn(comparator2.semver, high.semver, options)) {
          high = comparator2;
        } else if (ltfn(comparator2.semver, low.semver, options)) {
          low = comparator2;
        }
      });
      if (high.operator === comp || high.operator === ecomp) {
        return false;
      }
      if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
        return false;
      } else if (low.operator === ecomp && ltfn(version, low.semver)) {
        return false;
      }
    }
    return true;
  };
  outside_1 = outside;
  return outside_1;
}
var gtr_1;
var hasRequiredGtr;
function requireGtr() {
  if (hasRequiredGtr) return gtr_1;
  hasRequiredGtr = 1;
  const outside = requireOutside();
  const gtr = (version, range2, options) => outside(version, range2, ">", options);
  gtr_1 = gtr;
  return gtr_1;
}
var ltr_1;
var hasRequiredLtr;
function requireLtr() {
  if (hasRequiredLtr) return ltr_1;
  hasRequiredLtr = 1;
  const outside = requireOutside();
  const ltr = (version, range2, options) => outside(version, range2, "<", options);
  ltr_1 = ltr;
  return ltr_1;
}
var intersects_1;
var hasRequiredIntersects;
function requireIntersects() {
  if (hasRequiredIntersects) return intersects_1;
  hasRequiredIntersects = 1;
  const Range = requireRange();
  const intersects = (r1, r2, options) => {
    r1 = new Range(r1, options);
    r2 = new Range(r2, options);
    return r1.intersects(r2, options);
  };
  intersects_1 = intersects;
  return intersects_1;
}
var simplify;
var hasRequiredSimplify;
function requireSimplify() {
  if (hasRequiredSimplify) return simplify;
  hasRequiredSimplify = 1;
  const satisfies = requireSatisfies();
  const compare = requireCompare();
  simplify = (versions, range2, options) => {
    const set = [];
    let first = null;
    let prev = null;
    const v = versions.sort((a, b) => compare(a, b, options));
    for (const version of v) {
      const included = satisfies(version, range2, options);
      if (included) {
        prev = version;
        if (!first) {
          first = version;
        }
      } else {
        if (prev) {
          set.push([first, prev]);
        }
        prev = null;
        first = null;
      }
    }
    if (first) {
      set.push([first, null]);
    }
    const ranges = [];
    for (const [min, max] of set) {
      if (min === max) {
        ranges.push(min);
      } else if (!max && min === v[0]) {
        ranges.push("*");
      } else if (!max) {
        ranges.push(`>=${min}`);
      } else if (min === v[0]) {
        ranges.push(`<=${max}`);
      } else {
        ranges.push(`${min} - ${max}`);
      }
    }
    const simplified = ranges.join(" || ");
    const original = typeof range2.raw === "string" ? range2.raw : String(range2);
    return simplified.length < original.length ? simplified : range2;
  };
  return simplify;
}
var subset_1;
var hasRequiredSubset;
function requireSubset() {
  if (hasRequiredSubset) return subset_1;
  hasRequiredSubset = 1;
  const Range = requireRange();
  const Comparator = requireComparator();
  const { ANY } = Comparator;
  const satisfies = requireSatisfies();
  const compare = requireCompare();
  const subset = (sub, dom, options = {}) => {
    if (sub === dom) {
      return true;
    }
    sub = new Range(sub, options);
    dom = new Range(dom, options);
    let sawNonNull = false;
    OUTER: for (const simpleSub of sub.set) {
      for (const simpleDom of dom.set) {
        const isSub = simpleSubset(simpleSub, simpleDom, options);
        sawNonNull = sawNonNull || isSub !== null;
        if (isSub) {
          continue OUTER;
        }
      }
      if (sawNonNull) {
        return false;
      }
    }
    return true;
  };
  const minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
  const minimumVersion = [new Comparator(">=0.0.0")];
  const simpleSubset = (sub, dom, options) => {
    if (sub === dom) {
      return true;
    }
    if (sub.length === 1 && sub[0].semver === ANY) {
      if (dom.length === 1 && dom[0].semver === ANY) {
        return true;
      } else if (options.includePrerelease) {
        sub = minimumVersionWithPreRelease;
      } else {
        sub = minimumVersion;
      }
    }
    if (dom.length === 1 && dom[0].semver === ANY) {
      if (options.includePrerelease) {
        return true;
      } else {
        dom = minimumVersion;
      }
    }
    const eqSet = /* @__PURE__ */ new Set();
    let gt, lt;
    for (const c of sub) {
      if (c.operator === ">" || c.operator === ">=") {
        gt = higherGT(gt, c, options);
      } else if (c.operator === "<" || c.operator === "<=") {
        lt = lowerLT(lt, c, options);
      } else {
        eqSet.add(c.semver);
      }
    }
    if (eqSet.size > 1) {
      return null;
    }
    let gtltComp;
    if (gt && lt) {
      gtltComp = compare(gt.semver, lt.semver, options);
      if (gtltComp > 0) {
        return null;
      } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
        return null;
      }
    }
    for (const eq of eqSet) {
      if (gt && !satisfies(eq, String(gt), options)) {
        return null;
      }
      if (lt && !satisfies(eq, String(lt), options)) {
        return null;
      }
      for (const c of dom) {
        if (!satisfies(eq, String(c), options)) {
          return false;
        }
      }
      return true;
    }
    let higher, lower;
    let hasDomLT, hasDomGT;
    let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
    let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
    if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
      needDomLTPre = false;
    }
    for (const c of dom) {
      hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
      hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
      if (gt) {
        if (needDomGTPre) {
          if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
            needDomGTPre = false;
          }
        }
        if (c.operator === ">" || c.operator === ">=") {
          higher = higherGT(gt, c, options);
          if (higher === c && higher !== gt) {
            return false;
          }
        } else if (gt.operator === ">=" && !c.test(gt.semver)) {
          return false;
        }
      }
      if (lt) {
        if (needDomLTPre) {
          if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
            needDomLTPre = false;
          }
        }
        if (c.operator === "<" || c.operator === "<=") {
          lower = lowerLT(lt, c, options);
          if (lower === c && lower !== lt) {
            return false;
          }
        } else if (lt.operator === "<=" && !c.test(lt.semver)) {
          return false;
        }
      }
      if (!c.operator && (lt || gt) && gtltComp !== 0) {
        return false;
      }
    }
    if (gt && hasDomLT && !lt && gtltComp !== 0) {
      return false;
    }
    if (lt && hasDomGT && !gt && gtltComp !== 0) {
      return false;
    }
    if (needDomGTPre || needDomLTPre) {
      return false;
    }
    return true;
  };
  const higherGT = (a, b, options) => {
    if (!a) {
      return b;
    }
    const comp = compare(a.semver, b.semver, options);
    return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
  };
  const lowerLT = (a, b, options) => {
    if (!a) {
      return b;
    }
    const comp = compare(a.semver, b.semver, options);
    return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
  };
  subset_1 = subset;
  return subset_1;
}
var semver$1;
var hasRequiredSemver;
function requireSemver() {
  if (hasRequiredSemver) return semver$1;
  hasRequiredSemver = 1;
  const internalRe = requireRe();
  const constants2 = requireConstants();
  const SemVer = requireSemver$1();
  const identifiers2 = requireIdentifiers();
  const parse = requireParse();
  const valid2 = requireValid$1();
  const clean = requireClean();
  const inc = requireInc();
  const diff = requireDiff();
  const major = requireMajor();
  const minor = requireMinor();
  const patch = requirePatch();
  const prerelease = requirePrerelease();
  const compare = requireCompare();
  const rcompare = requireRcompare();
  const compareLoose = requireCompareLoose();
  const compareBuild = requireCompareBuild();
  const sort = requireSort();
  const rsort = requireRsort();
  const gt = requireGt();
  const lt = requireLt();
  const eq = requireEq();
  const neq = requireNeq();
  const gte = requireGte();
  const lte = requireLte();
  const cmp = requireCmp();
  const coerce = requireCoerce();
  const truncate = requireTruncate();
  const Comparator = requireComparator();
  const Range = requireRange();
  const satisfies = requireSatisfies();
  const toComparators = requireToComparators();
  const maxSatisfying = requireMaxSatisfying();
  const minSatisfying = requireMinSatisfying();
  const minVersion = requireMinVersion();
  const validRange = requireValid();
  const outside = requireOutside();
  const gtr = requireGtr();
  const ltr = requireLtr();
  const intersects = requireIntersects();
  const simplifyRange = requireSimplify();
  const subset = requireSubset();
  semver$1 = {
    parse,
    valid: valid2,
    clean,
    inc,
    diff,
    major,
    minor,
    patch,
    prerelease,
    compare,
    rcompare,
    compareLoose,
    compareBuild,
    sort,
    rsort,
    gt,
    lt,
    eq,
    neq,
    gte,
    lte,
    cmp,
    coerce,
    truncate,
    Comparator,
    Range,
    satisfies,
    toComparators,
    maxSatisfying,
    minSatisfying,
    minVersion,
    validRange,
    outside,
    gtr,
    ltr,
    intersects,
    simplifyRange,
    subset,
    SemVer,
    re: internalRe.re,
    src: internalRe.src,
    tokens: internalRe.t,
    SEMVER_SPEC_VERSION: constants2.SEMVER_SPEC_VERSION,
    RELEASE_TYPES: constants2.RELEASE_TYPES,
    compareIdentifiers: identifiers2.compareIdentifiers,
    rcompareIdentifiers: identifiers2.rcompareIdentifiers
  };
  return semver$1;
}
var semverExports = requireSemver();
const semver = /* @__PURE__ */ getDefaultExportFromCjs(semverExports);
const objectToString = Object.prototype.toString;
const uint8ArrayStringified = "[object Uint8Array]";
const arrayBufferStringified = "[object ArrayBuffer]";
function isType(value, typeConstructor, typeStringified) {
  if (!value) {
    return false;
  }
  if (value.constructor === typeConstructor) {
    return true;
  }
  return objectToString.call(value) === typeStringified;
}
function isUint8Array(value) {
  return isType(value, Uint8Array, uint8ArrayStringified);
}
function isArrayBuffer(value) {
  return isType(value, ArrayBuffer, arrayBufferStringified);
}
function isUint8ArrayOrArrayBuffer(value) {
  return isUint8Array(value) || isArrayBuffer(value);
}
function assertUint8Array(value) {
  if (!isUint8Array(value)) {
    throw new TypeError(`Expected \`Uint8Array\`, got \`${typeof value}\``);
  }
}
function assertUint8ArrayOrArrayBuffer(value) {
  if (!isUint8ArrayOrArrayBuffer(value)) {
    throw new TypeError(`Expected \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof value}\``);
  }
}
function concatUint8Arrays(arrays, totalLength) {
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }
  totalLength ??= arrays.reduce((accumulator, currentValue) => accumulator + currentValue.length, 0);
  const returnValue = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    assertUint8Array(array);
    returnValue.set(array, offset);
    offset += array.length;
  }
  return returnValue;
}
const cachedDecoders = {
  utf8: new globalThis.TextDecoder("utf8")
};
function uint8ArrayToString(array, encoding = "utf8") {
  assertUint8ArrayOrArrayBuffer(array);
  cachedDecoders[encoding] ??= new globalThis.TextDecoder(encoding);
  return cachedDecoders[encoding].decode(array);
}
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(`Expected \`string\`, got \`${typeof value}\``);
  }
}
const cachedEncoder = new globalThis.TextEncoder();
function stringToUint8Array(string) {
  assertString(string);
  return cachedEncoder.encode(string);
}
Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));
const defaultEncryptionAlgorithm = "aes-256-cbc";
const supportedEncryptionAlgorithms = /* @__PURE__ */ new Set([
  "aes-256-cbc",
  "aes-256-gcm",
  "aes-256-ctr"
]);
const isSupportedEncryptionAlgorithm = (value) => typeof value === "string" && supportedEncryptionAlgorithms.has(value);
const createPlainObject = () => /* @__PURE__ */ Object.create(null);
const isExist = (data) => data !== void 0;
const checkValueType = (key, value) => {
  const nonJsonTypes = /* @__PURE__ */ new Set([
    "undefined",
    "symbol",
    "function"
  ]);
  const type2 = typeof value;
  if (nonJsonTypes.has(type2)) {
    throw new TypeError(`Setting a value of type \`${type2}\` for key \`${key}\` is not allowed as it's not supported by JSON`);
  }
};
const INTERNAL_KEY = "__internal__";
const MIGRATION_KEY = `${INTERNAL_KEY}.migrations.version`;
class Conf {
  path;
  events;
  #validator;
  #encryptionKey;
  #encryptionAlgorithm;
  #options;
  #defaultValues = {};
  #isInMigration = false;
  #watcher;
  #watchFile;
  #debouncedChangeHandler;
  constructor(partialOptions = {}) {
    const options = this.#prepareOptions(partialOptions);
    this.#options = options;
    this.#setupValidator(options);
    this.#applyDefaultValues(options);
    this.#configureSerialization(options);
    this.events = new EventTarget();
    this.#encryptionKey = options.encryptionKey;
    this.#encryptionAlgorithm = options.encryptionAlgorithm ?? defaultEncryptionAlgorithm;
    this.path = this.#resolvePath(options);
    this.#initializeStore(options);
    if (options.watch) {
      this._watch();
    }
  }
  get(key, defaultValue) {
    if (this.#options.accessPropertiesByDotNotation) {
      return this._get(key, defaultValue);
    }
    const { store: store2 } = this;
    return key in store2 ? store2[key] : defaultValue;
  }
  set(key, value) {
    if (typeof key !== "string" && typeof key !== "object") {
      throw new TypeError(`Expected \`key\` to be of type \`string\` or \`object\`, got ${typeof key}`);
    }
    if (typeof key !== "object" && value === void 0) {
      throw new TypeError("Use `delete()` to clear values");
    }
    if (this._containsReservedKey(key)) {
      throw new TypeError(`Please don't use the ${INTERNAL_KEY} key, as it's used to manage this module internal operations.`);
    }
    const { store: store2 } = this;
    const set = (key2, value2) => {
      checkValueType(key2, value2);
      if (this.#options.accessPropertiesByDotNotation) {
        setProperty(store2, key2, value2);
      } else {
        if (key2 === "__proto__" || key2 === "constructor" || key2 === "prototype") {
          return;
        }
        store2[key2] = value2;
      }
    };
    if (typeof key === "object") {
      const object = key;
      for (const [key2, value2] of Object.entries(object)) {
        set(key2, value2);
      }
    } else {
      set(key, value);
    }
    this.store = store2;
  }
  has(key) {
    if (this.#options.accessPropertiesByDotNotation) {
      return hasProperty(this.store, key);
    }
    return key in this.store;
  }
  appendToArray(key, value) {
    checkValueType(key, value);
    const array = this.#options.accessPropertiesByDotNotation ? this._get(key, []) : key in this.store ? this.store[key] : [];
    if (!Array.isArray(array)) {
      throw new TypeError(`The key \`${key}\` is already set to a non-array value`);
    }
    this.set(key, [...array, value]);
  }
  /**
      Reset items to their default values, as defined by the `defaults` or `schema` option.
  
      @see `clear()` to reset all items.
  
      @param keys - The keys of the items to reset.
      */
  reset(...keys) {
    for (const key of keys) {
      if (isExist(this.#defaultValues[key])) {
        this.set(key, this.#defaultValues[key]);
      }
    }
  }
  delete(key) {
    const { store: store2 } = this;
    if (this.#options.accessPropertiesByDotNotation) {
      deleteProperty(store2, key);
    } else {
      delete store2[key];
    }
    this.store = store2;
  }
  /**
      Delete all items.
  
      This resets known items to their default values, if defined by the `defaults` or `schema` option.
      */
  clear() {
    const newStore = createPlainObject();
    for (const key of Object.keys(this.#defaultValues)) {
      if (isExist(this.#defaultValues[key])) {
        checkValueType(key, this.#defaultValues[key]);
        if (this.#options.accessPropertiesByDotNotation) {
          setProperty(newStore, key, this.#defaultValues[key]);
        } else {
          newStore[key] = this.#defaultValues[key];
        }
      }
    }
    this.store = newStore;
  }
  onDidChange(key, callback) {
    if (typeof key !== "string") {
      throw new TypeError(`Expected \`key\` to be of type \`string\`, got ${typeof key}`);
    }
    if (typeof callback !== "function") {
      throw new TypeError(`Expected \`callback\` to be of type \`function\`, got ${typeof callback}`);
    }
    return this._handleValueChange(() => this.get(key), callback);
  }
  /**
      Watches the whole config object, calling `callback` on any changes.
  
      @param callback - A callback function that is called on any changes. When a `key` is first set `oldValue` will be `undefined`, and when a key is deleted `newValue` will be `undefined`.
      @returns A function, that when called, will unsubscribe.
      */
  onDidAnyChange(callback) {
    if (typeof callback !== "function") {
      throw new TypeError(`Expected \`callback\` to be of type \`function\`, got ${typeof callback}`);
    }
    return this._handleStoreChange(callback);
  }
  get size() {
    const entries2 = Object.keys(this.store);
    return entries2.filter((key) => !this._isReservedKeyPath(key)).length;
  }
  /**
      Get all the config as an object or replace the current config with an object.
  
      @example
      ```
      console.log(config.store);
      //=> {name: 'John', age: 30}
      ```
  
      @example
      ```
      config.store = {
          hello: 'world'
      };
      ```
      */
  get store() {
    try {
      const data = fs__default.readFileSync(this.path, this.#encryptionKey ? null : "utf8");
      const dataString = this._decryptData(data);
      const parseStore = (value) => {
        const deserializedData = this._deserialize(value);
        if (!this.#isInMigration) {
          this._validate(deserializedData);
        }
        return Object.assign(createPlainObject(), deserializedData);
      };
      return parseStore(dataString);
    } catch (error) {
      if (error?.code === "ENOENT") {
        this._ensureDirectory();
        return createPlainObject();
      }
      if (this.#options.clearInvalidConfig) {
        const errorInstance = error;
        if (errorInstance.name === "SyntaxError") {
          return createPlainObject();
        }
        if (errorInstance.message?.startsWith("Config schema violation:")) {
          return createPlainObject();
        }
        if (errorInstance.message === "Failed to decrypt config data.") {
          return createPlainObject();
        }
      }
      throw error;
    }
  }
  set store(value) {
    this._ensureDirectory();
    if (!hasProperty(value, INTERNAL_KEY)) {
      try {
        const data = fs__default.readFileSync(this.path, this.#encryptionKey ? null : "utf8");
        const dataString = this._decryptData(data);
        const currentStore = this._deserialize(dataString);
        if (hasProperty(currentStore, INTERNAL_KEY)) {
          setProperty(value, INTERNAL_KEY, getProperty(currentStore, INTERNAL_KEY));
        }
      } catch {
      }
    }
    if (!this.#isInMigration) {
      this._validate(value);
    }
    this._write(value);
    this.events.dispatchEvent(new Event("change"));
  }
  *[Symbol.iterator]() {
    for (const [key, value] of Object.entries(this.store)) {
      if (!this._isReservedKeyPath(key)) {
        yield [key, value];
      }
    }
  }
  /**
  Close the file watcher if one exists. This is useful in tests to prevent the process from hanging.
  */
  _closeWatcher() {
    if (this.#watcher) {
      this.#watcher.close();
      this.#watcher = void 0;
    }
    if (this.#watchFile) {
      fs__default.unwatchFile(this.path);
      this.#watchFile = false;
    }
    this.#debouncedChangeHandler = void 0;
  }
  _decryptData(data) {
    const encryptionKey = this.#encryptionKey;
    if (!encryptionKey) {
      return typeof data === "string" ? data : uint8ArrayToString(data);
    }
    const encryptionAlgorithm = this.#encryptionAlgorithm;
    const authenticationTagLength = encryptionAlgorithm === "aes-256-gcm" ? 16 : 0;
    const separatorCodePoint = ":".codePointAt(0);
    const separatorByte = typeof data === "string" ? data.codePointAt(16) : data[16];
    const hasSeparator = separatorCodePoint !== void 0 && separatorByte === separatorCodePoint;
    if (!hasSeparator) {
      if (encryptionAlgorithm === "aes-256-cbc") {
        return typeof data === "string" ? data : uint8ArrayToString(data);
      }
      throw new Error("Failed to decrypt config data.");
    }
    const getEncryptedPayload = (dataUpdate2) => {
      if (authenticationTagLength === 0) {
        return { ciphertext: dataUpdate2 };
      }
      const authenticationTagStart = dataUpdate2.length - authenticationTagLength;
      if (authenticationTagStart < 0) {
        throw new Error("Invalid authentication tag length.");
      }
      return {
        ciphertext: dataUpdate2.slice(0, authenticationTagStart),
        authenticationTag: dataUpdate2.slice(authenticationTagStart)
      };
    };
    const initializationVector = data.slice(0, 16);
    const slice = data.slice(17);
    const dataUpdate = typeof slice === "string" ? stringToUint8Array(slice) : slice;
    const decrypt = (salt) => {
      const { ciphertext, authenticationTag } = getEncryptedPayload(dataUpdate);
      const password = crypto.pbkdf2Sync(encryptionKey, salt, 1e4, 32, "sha512");
      const decipher = crypto.createDecipheriv(encryptionAlgorithm, password, initializationVector);
      if (authenticationTag) {
        decipher.setAuthTag(authenticationTag);
      }
      return uint8ArrayToString(concatUint8Arrays([decipher.update(ciphertext), decipher.final()]));
    };
    try {
      return decrypt(initializationVector);
    } catch {
      try {
        return decrypt(initializationVector.toString());
      } catch {
      }
    }
    if (encryptionAlgorithm === "aes-256-cbc") {
      return typeof data === "string" ? data : uint8ArrayToString(data);
    }
    throw new Error("Failed to decrypt config data.");
  }
  _handleStoreChange(callback) {
    let currentValue = this.store;
    const onChange = () => {
      const oldValue = currentValue;
      const newValue = this.store;
      if (isDeepStrictEqual(newValue, oldValue)) {
        return;
      }
      currentValue = newValue;
      callback.call(this, newValue, oldValue);
    };
    this.events.addEventListener("change", onChange);
    return () => {
      this.events.removeEventListener("change", onChange);
    };
  }
  _handleValueChange(getter, callback) {
    let currentValue = getter();
    const onChange = () => {
      const oldValue = currentValue;
      const newValue = getter();
      if (isDeepStrictEqual(newValue, oldValue)) {
        return;
      }
      currentValue = newValue;
      callback.call(this, newValue, oldValue);
    };
    this.events.addEventListener("change", onChange);
    return () => {
      this.events.removeEventListener("change", onChange);
    };
  }
  _deserialize = (value) => JSON.parse(value);
  _serialize = (value) => JSON.stringify(value, void 0, "	");
  _validate(data) {
    if (!this.#validator) {
      return;
    }
    const valid2 = this.#validator(data);
    if (valid2 || !this.#validator.errors) {
      return;
    }
    const errors2 = this.#validator.errors.map(({ instancePath, message = "" }) => `\`${instancePath.slice(1)}\` ${message}`);
    throw new Error("Config schema violation: " + errors2.join("; "));
  }
  _ensureDirectory() {
    fs__default.mkdirSync(path.dirname(this.path), { recursive: true });
  }
  _write(value) {
    let data = this._serialize(value);
    const encryptionKey = this.#encryptionKey;
    if (encryptionKey) {
      const initializationVector = crypto.randomBytes(16);
      const password = crypto.pbkdf2Sync(encryptionKey, initializationVector, 1e4, 32, "sha512");
      const cipher = crypto.createCipheriv(this.#encryptionAlgorithm, password, initializationVector);
      const encryptedData = concatUint8Arrays([cipher.update(stringToUint8Array(data)), cipher.final()]);
      const encryptedParts = [initializationVector, stringToUint8Array(":"), encryptedData];
      if (this.#encryptionAlgorithm === "aes-256-gcm") {
        encryptedParts.push(cipher.getAuthTag());
      }
      data = concatUint8Arrays(encryptedParts);
    }
    if (process$1.env.SNAP) {
      fs__default.writeFileSync(this.path, data, { mode: this.#options.configFileMode });
    } else {
      try {
        writeFileSync(this.path, data, { mode: this.#options.configFileMode });
      } catch (error) {
        if (error?.code === "EXDEV") {
          fs__default.writeFileSync(this.path, data, { mode: this.#options.configFileMode });
          return;
        }
        throw error;
      }
    }
  }
  _watch() {
    this._ensureDirectory();
    if (!fs__default.existsSync(this.path)) {
      this._write(createPlainObject());
    }
    if (process$1.platform === "win32" || process$1.platform === "darwin") {
      this.#debouncedChangeHandler ??= debounceFunction(() => {
        this.events.dispatchEvent(new Event("change"));
      }, { wait: 100 });
      const directory = path.dirname(this.path);
      const basename2 = path.basename(this.path);
      this.#watcher = fs__default.watch(directory, { persistent: false, encoding: "utf8" }, (_eventType, filename) => {
        if (filename && filename !== basename2) {
          return;
        }
        if (typeof this.#debouncedChangeHandler === "function") {
          this.#debouncedChangeHandler();
        }
      });
    } else {
      this.#debouncedChangeHandler ??= debounceFunction(() => {
        this.events.dispatchEvent(new Event("change"));
      }, { wait: 1e3 });
      fs__default.watchFile(this.path, { persistent: false }, (_current, _previous) => {
        if (typeof this.#debouncedChangeHandler === "function") {
          this.#debouncedChangeHandler();
        }
      });
      this.#watchFile = true;
    }
  }
  _migrate(migrations, versionToMigrate, beforeEachMigration) {
    let previousMigratedVersion = this._get(MIGRATION_KEY, "0.0.0");
    const newerVersions = Object.keys(migrations).filter((candidateVersion) => this._shouldPerformMigration(candidateVersion, previousMigratedVersion, versionToMigrate));
    let storeBackup = structuredClone(this.store);
    for (const version of newerVersions) {
      try {
        if (beforeEachMigration) {
          beforeEachMigration(this, {
            fromVersion: previousMigratedVersion,
            toVersion: version,
            finalVersion: versionToMigrate,
            versions: newerVersions
          });
        }
        const migration = migrations[version];
        migration?.(this);
        this._set(MIGRATION_KEY, version);
        previousMigratedVersion = version;
        storeBackup = structuredClone(this.store);
      } catch (error) {
        this.store = storeBackup;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Something went wrong during the migration! Changes applied to the store until this failed migration will be restored. ${errorMessage}`);
      }
    }
    if (this._isVersionInRangeFormat(previousMigratedVersion) || !semver.eq(previousMigratedVersion, versionToMigrate)) {
      this._set(MIGRATION_KEY, versionToMigrate);
    }
  }
  _containsReservedKey(key) {
    if (typeof key === "string") {
      return this._isReservedKeyPath(key);
    }
    if (!key || typeof key !== "object") {
      return false;
    }
    return this._objectContainsReservedKey(key);
  }
  _objectContainsReservedKey(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    for (const [candidateKey, candidateValue] of Object.entries(value)) {
      if (this._isReservedKeyPath(candidateKey)) {
        return true;
      }
      if (this._objectContainsReservedKey(candidateValue)) {
        return true;
      }
    }
    return false;
  }
  _isReservedKeyPath(candidate) {
    return candidate === INTERNAL_KEY || candidate.startsWith(`${INTERNAL_KEY}.`);
  }
  _isVersionInRangeFormat(version) {
    return semver.clean(version) === null;
  }
  _shouldPerformMigration(candidateVersion, previousMigratedVersion, versionToMigrate) {
    if (this._isVersionInRangeFormat(candidateVersion)) {
      if (previousMigratedVersion !== "0.0.0" && semver.satisfies(previousMigratedVersion, candidateVersion)) {
        return false;
      }
      return semver.satisfies(versionToMigrate, candidateVersion);
    }
    if (semver.lte(candidateVersion, previousMigratedVersion)) {
      return false;
    }
    if (semver.gt(candidateVersion, versionToMigrate)) {
      return false;
    }
    return true;
  }
  _get(key, defaultValue) {
    return getProperty(this.store, key, defaultValue);
  }
  _set(key, value) {
    const { store: store2 } = this;
    setProperty(store2, key, value);
    this.store = store2;
  }
  #prepareOptions(partialOptions) {
    const options = {
      configName: "config",
      fileExtension: "json",
      projectSuffix: "nodejs",
      clearInvalidConfig: false,
      accessPropertiesByDotNotation: true,
      configFileMode: 438,
      ...partialOptions
    };
    options.encryptionAlgorithm ??= defaultEncryptionAlgorithm;
    if (!isSupportedEncryptionAlgorithm(options.encryptionAlgorithm)) {
      throw new TypeError(`The \`encryptionAlgorithm\` option must be one of: ${[...supportedEncryptionAlgorithms].join(", ")}`);
    }
    if (!options.cwd) {
      if (!options.projectName) {
        throw new Error("Please specify the `projectName` option.");
      }
      options.cwd = envPaths(options.projectName, { suffix: options.projectSuffix }).config;
    }
    if (typeof options.fileExtension === "string") {
      options.fileExtension = options.fileExtension.replace(/^\.+/, "");
    }
    return options;
  }
  #setupValidator(options) {
    if (!(options.schema ?? options.ajvOptions ?? options.rootSchema)) {
      return;
    }
    if (options.schema && typeof options.schema !== "object") {
      throw new TypeError("The `schema` option must be an object.");
    }
    const ajvFormats = ajvFormatsModule.default;
    const ajv2 = new _2020Exports.Ajv2020({
      allErrors: true,
      useDefaults: true,
      ...options.ajvOptions
    });
    ajvFormats(ajv2);
    const schema = {
      ...options.rootSchema,
      type: "object",
      properties: options.schema
    };
    this.#validator = ajv2.compile(schema);
    this.#captureSchemaDefaults(options.schema);
  }
  #captureSchemaDefaults(schemaConfig) {
    const schemaEntries = Object.entries(schemaConfig ?? {});
    for (const [key, schemaDefinition] of schemaEntries) {
      if (!schemaDefinition || typeof schemaDefinition !== "object") {
        continue;
      }
      if (!Object.hasOwn(schemaDefinition, "default")) {
        continue;
      }
      const { default: defaultValue } = schemaDefinition;
      if (defaultValue === void 0) {
        continue;
      }
      this.#defaultValues[key] = defaultValue;
    }
  }
  #applyDefaultValues(options) {
    if (options.defaults) {
      Object.assign(this.#defaultValues, options.defaults);
    }
  }
  #configureSerialization(options) {
    if (options.serialize) {
      this._serialize = options.serialize;
    }
    if (options.deserialize) {
      this._deserialize = options.deserialize;
    }
  }
  #resolvePath(options) {
    const normalizedFileExtension = typeof options.fileExtension === "string" ? options.fileExtension : void 0;
    const fileExtension = normalizedFileExtension ? `.${normalizedFileExtension}` : "";
    return path.resolve(options.cwd, `${options.configName ?? "config"}${fileExtension}`);
  }
  #initializeStore(options) {
    if (options.migrations) {
      this.#runMigrations(options);
      this._validate(this.store);
      return;
    }
    const fileStore = this.store;
    const storeWithDefaults = Object.assign(createPlainObject(), options.defaults ?? {}, fileStore);
    this._validate(storeWithDefaults);
    try {
      assert.deepEqual(fileStore, storeWithDefaults);
    } catch {
      this.store = storeWithDefaults;
    }
  }
  #runMigrations(options) {
    const { migrations, projectVersion } = options;
    if (!migrations) {
      return;
    }
    if (!projectVersion) {
      throw new Error("Please specify the `projectVersion` option.");
    }
    this.#isInMigration = true;
    try {
      const fileStore = this.store;
      const storeWithDefaults = Object.assign(createPlainObject(), options.defaults ?? {}, fileStore);
      try {
        assert.deepEqual(fileStore, storeWithDefaults);
      } catch {
        this._write(storeWithDefaults);
      }
      this._migrate(migrations, projectVersion, options.beforeEachMigration);
    } finally {
      this.#isInMigration = false;
    }
  }
}
const { app, ipcMain, shell } = electron;
let isInitialized = false;
const initDataListener = () => {
  if (!ipcMain || !app) {
    throw new Error("Electron Store: You need to call `.initRenderer()` from the main process.");
  }
  const appData = {
    defaultCwd: app.getPath("userData"),
    appVersion: app.getVersion()
  };
  if (isInitialized) {
    return appData;
  }
  ipcMain.on("electron-store-get-data", (event) => {
    event.returnValue = appData;
  });
  isInitialized = true;
  return appData;
};
class ElectronStore extends Conf {
  constructor(options) {
    let defaultCwd;
    let appVersion;
    if (process$1.type === "renderer") {
      const appData = electron.ipcRenderer.sendSync("electron-store-get-data");
      if (!appData) {
        throw new Error("Electron Store: You need to call `.initRenderer()` from the main process.");
      }
      ({ defaultCwd, appVersion } = appData);
    } else if (ipcMain && app) {
      ({ defaultCwd, appVersion } = initDataListener());
    }
    options = {
      name: "config",
      ...options
    };
    options.projectVersion ||= appVersion;
    if (options.cwd) {
      options.cwd = path.isAbsolute(options.cwd) ? options.cwd : path.join(defaultCwd, options.cwd);
    } else {
      options.cwd = defaultCwd;
    }
    options.configName = options.name;
    delete options.name;
    super(options);
  }
  static initRenderer() {
    initDataListener();
  }
  async openInEditor() {
    const error = await shell.openPath(this.path);
    if (error) {
      throw new Error(error);
    }
  }
}
const ENV_INSTALL = "@install";
const ENV_SYSTEM = "@system";
function envDirName(key, pageId) {
  const m2 = /^(.+?)_HOME$/i.exec((key || "").trim());
  return `.${(m2?.[1] || pageId || "page").toLowerCase()}`;
}
const DEFAULTS = {
  defaultView: { kind: "none" },
  openExternalIn: "embedded",
  minimizeToTray: true,
  // off by default: registering a login item is an OS-level change we never make unprompted
  launchAtStartup: false,
  // auto-run the bundled runtimes on launch: openclaw (gateway) + dsh-web (server)
  autoStartPages: ["openclaw", "dsh-web"],
  // empty until the user pins a page's auto-start by hand; see ContainerSettings.autoStartManual
  autoStartManual: [],
  // built-in pages switched off from the Pages panel (hidden from the switcher, never started)
  disabledPages: [],
  lastExternalUrls: [],
  externalSites: [],
  theme: "auto",
  // UI display language; defaults to Chinese
  locale: "zh",
  // env root is no longer user-configurable: fixed at userData/env (the system-common spot).
  // The field only survives in old settings files; resolveEnvRoot() ignores it. '@system' was
  // also a persisted choice there and resolves to the same place, so nothing needs migrating.
  envRoot: "",
  dshHome: "",
  openclawHome: "",
  // empty = userData/workspace; the shared context every hosted agent reads/writes
  workspaceRoot: "",
  // empty = the OS Downloads folder; embedded-page downloads save there (see downloads.ts)
  downloadDir: "",
  pageEnvs: {},
  pagePorts: {},
  // #4: container-side per-page dependency overrides (pageId -> [depId…]); shadows container.json
  pageDeps: {},
  // free-form per-page KEY=VALUE overrides, kept apart from the directory-typed pageEnvs
  pageCustomEnvs: {},
  // DSH tracks the `alpha` dist-tag (where its prereleases are published); switchable in Settings.
  dshChannel: "alpha",
  // container OTA follows the stable `release` branch unless the user opts into beta
  containerChannel: "stable",
  // an over-budget page is only flagged; 'restart' opts it into a leak guard
  memLimitAction: "notify",
  // only user-chosen shortcuts live here — every action has a built-in default
  keybindings: {},
  // a page that crashes after having run is relaunched automatically; off surfaces the error only
  crashAutoRestart: true,
  // rare user-action-needed events (guard gave up, staged update) go to the OS notification center
  systemNotifications: true,
  // #25: '' keeps each theme's CSS-defined accent; a hex overrides it live in both modes.
  accentColor: "",
  // #25: frosted-blur px; the slider overrides --glass-blur live, clamped to GLASS_BLUR_MAX_PX
  // (25) at apply time — this default sits at that ceiling, i.e. the heaviest frost.
  glassBlur: 30,
  // #25: frosted-surface opacity (%); slider overrides --glass-tint-a live (independent of blur).
  glassAlpha: 60,
  // #20: RSS (MB) over which a running page is flagged over-budget (tray resource badge).
  memWarnMb: 800,
  // bottom-docked terminal height the user dragged out; keep the default in sync with
  // TerminalDrawer's DEFAULT_H.
  terminalHeight: 320,
  // scrollback lines kept per terminal surface; clamped to TERMINAL_SCROLLBACK_MAX at create time.
  terminalScrollback: 8e3,
  // how the terminal is shown: docked into the page area, or a floating overlay that can minimize.
  terminalMode: "embedded",
  // #26: restore the last window geometry/maximized state. On by default: a container that
  // relaunches at 1280x860 every time is annoying once you've arranged it beside other windows.
  rememberWindowBounds: true,
  // #26: 'auto' keeps the previous behaviour of following the OS reduced-motion preference.
  reduceMotion: "auto",
  // the dark-mode flowing-light border ring is on by default (decorative; switchable in Settings).
  marqueeBorder: true,
  // #26: '' = the built-in mirror (NPM_REGISTRY_DEFAULT), i.e. the pre-setting behaviour.
  npmRegistry: "",
  // #26: tray defaults mirror what the menu/badge did before they were configurable.
  trayPageEntries: "all",
  trayBadge: "all",
  // on by default: hosted agents get the shared workspace pointers at spawn (see runtime/workspace.ts)
  sharedWorkspace: true
};
let store$1 = null;
function getStore() {
  if (!store$1) {
    store$1 = new ElectronStore({ name: "container-settings", defaults: DEFAULTS });
  }
  return store$1;
}
function getSettings() {
  return { ...DEFAULTS, ...getStore().store };
}
function updateSettings(partial, opts = {}) {
  const s = getStore();
  if (Array.isArray(partial.autoStartPages) && opts.syncAutoStartPin !== false) {
    const prev = new Set(s.get("autoStartPages") || []);
    const next2 = new Set(partial.autoStartPages);
    const manual = new Set(s.get("autoStartManual") || []);
    for (const id2 of next2) if (!prev.has(id2)) manual.add(id2);
    for (const id2 of prev) if (!next2.has(id2)) manual.delete(id2);
    s.set("autoStartManual", [...manual]);
  }
  for (const [k, v] of Object.entries(partial)) {
    if (v !== void 0) s.set(k, v);
  }
  return getSettings();
}
function syncAutoStartForDefaultView(prevPageId, nextPageId) {
  const s = getStore();
  const manual = new Set(s.get("autoStartManual") || []);
  const auto = new Set(s.get("autoStartPages") || []);
  if (prevPageId && prevPageId !== nextPageId && !manual.has(prevPageId)) auto.delete(prevPageId);
  if (nextPageId) auto.add(nextPageId);
  s.set("autoStartPages", [...auto]);
}
function setDefaultView(view) {
  const s = getStore();
  s.set("defaultView", view);
  if (view.kind === "external") {
    const list = (s.get("lastExternalUrls") || []).filter((u) => u !== view.url);
    list.unshift(view.url);
    s.set("lastExternalUrls", list.slice(0, 10));
  }
}
function resolveProjectDir() {
  return app$1.getAppPath();
}
function resolvePagesDir() {
  if (process.env.DSH_PAGES_DIR) return process.env.DSH_PAGES_DIR;
  if (app$1.isPackaged) return join(app$1.getPath("userData"), "pages");
  return join(resolveProjectDir(), "pages");
}
function resolveCapabilitiesDir() {
  if (process.env.DSH_CAPABILITIES_DIR) return process.env.DSH_CAPABILITIES_DIR;
  return join(app$1.getPath("userData"), "capabilities");
}
function resolveInstallDir() {
  if (app$1.isPackaged) {
    try {
      return dirname(app$1.getPath("exe"));
    } catch {
    }
  }
  return resolveProjectDir();
}
function resolveEnvRoot() {
  return join(app$1.getPath("userData"), "env");
}
function expandEnvTemplate(p) {
  if (!p) return p;
  return expandHome(p).replace(/\{envRoot\}/g, resolveEnvRoot()).replace(/\{userData\}/g, app$1.getPath("userData"));
}
function preferExisting(candidate, legacy) {
  return existsSync(candidate) || !existsSync(legacy) ? candidate : legacy;
}
function hasData(dir) {
  if (!dir) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}
function resolveDshRuntimeDirs() {
  const pinned = (process.env.DSH_DSH_ROOT || "").trim();
  const roots = [
    join(app$1.getPath("userData"), "dsh"),
    join(process.resourcesPath || "", "dsh"),
    join(app$1.getAppPath(), "resources", "dsh"),
    join(process.cwd(), "resources", "dsh")
  ].filter(Boolean);
  return pinned ? [pinned, ...roots.filter((r) => r !== pinned)] : roots;
}
function resolveDshHome() {
  const fromEnv = (process.env.DSH_HOME || "").trim();
  if (fromEnv) return expandHome(fromEnv);
  const override = (getSettings().dshHome || "").trim() || (getSettings().pageEnvs?.["dsh-web"]?.DSH_HOME || "").trim();
  const systemHome = join(homedir$1(), ".dsh");
  if (override === ENV_SYSTEM) return systemHome;
  const installHome = join(resolveEnvRoot(), envDirName("DSH_HOME", "dsh-web"));
  if (override === ENV_INSTALL) return installHome;
  return hasData(systemHome) ? systemHome : installHome;
}
function expandHome(p) {
  if (p === "~") return homedir$1();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir$1(), p.slice(2));
  return p;
}
function resolveDshProfileDir(profile) {
  const safe = profile.replace(/[^\w-]/g, "");
  return join(resolveDshHome(), "profiles", safe || "web");
}
function resolveOpenclawHome() {
  const fromEnv = (process.env.OPENCLAW_STATE_DIR || "").trim();
  if (fromEnv) return expandHome(fromEnv);
  const override = (getSettings().openclawHome || "").trim() || (getSettings().pageEnvs?.["openclaw"]?.OPENCLAW_HOME || "").trim();
  const systemHome = join(homedir$1(), ".openclaw");
  if (override === ENV_SYSTEM) return systemHome;
  const installHome = join(resolveEnvRoot(), envDirName("OPENCLAW_HOME", "openclaw"));
  if (override === ENV_INSTALL) return installHome;
  return hasData(systemHome) ? systemHome : installHome;
}
function resolvePageEnv(pageId, key, defaultPath, legacyPath) {
  const fromEnv = (process.env[key] || "").trim();
  if (fromEnv) return expandHome(fromEnv);
  const override = (getSettings().pageEnvs?.[pageId]?.[key] || "").trim();
  const installDir = join(resolveEnvRoot(), envDirName(key, pageId));
  if (override === ENV_INSTALL) return installDir;
  const declared = defaultPath && defaultPath.trim() ? expandEnvTemplate(defaultPath.trim()) : "";
  const legacy = (legacyPath || "").trim() ? expandHome((legacyPath || "").trim()) : "";
  if (override === ENV_SYSTEM) {
    if (!declared) return "";
    return legacy ? preferExisting(declared, legacy) : declared;
  }
  if (hasData(declared)) return declared;
  if (hasData(legacy)) return legacy;
  return installDir;
}
function resolvePageTextEnv(pageId, key, defaultValue) {
  return (process.env[key] || "").trim() || (getSettings().pageEnvs?.[pageId]?.[key] || "").trim() || (defaultValue || "").trim();
}
const CUSTOM_ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function resolvePageCustomEnvs(pageId) {
  const map = getSettings().pageCustomEnvs?.[pageId];
  if (!map) return {};
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    if (!CUSTOM_ENV_KEY_RE.test(key)) continue;
    if (RESERVED_PAGE_ENV_KEYS.has(key)) continue;
    if (value === void 0 || value === null) continue;
    out[key] = String(value);
  }
  return out;
}
const RESERVED_PAGE_ENV_KEYS = /* @__PURE__ */ new Set([
  "PATH",
  "Path",
  "NODE_OPTIONS",
  "ELECTRON_RUN_AS_NODE",
  "npm_config_registry",
  "npm_config_prefix"
]);
function isValidPort(port) {
  return Number.isInteger(Number(port)) && Number(port) >= 1 && Number(port) <= 65535;
}
function applyLaunchAtStartup(enabled) {
  if (!app$1.isPackaged) return;
  try {
    app$1.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled,
      args: enabled ? ["--autostart"] : []
    });
  } catch (err) {
    console.warn("[container] setLoginItemSettings failed:", err.message);
  }
}
function resolvePagePort(pageId, declared) {
  const override = getSettings().pagePorts?.[pageId];
  return isValidPort(override) ? Number(override) : declared;
}
function defaultDownloadDir() {
  try {
    const p = app$1.getPath("downloads");
    if (p) return p;
  } catch {
  }
  return join(app$1.getPath("userData"), "Downloads");
}
function resolveDownloadDir() {
  const override = (getSettings().downloadDir || "").trim();
  return override ? expandHome(override) : defaultDownloadDir();
}
function resolveWorkspaceDir() {
  const override = (getSettings().workspaceRoot || "").trim();
  if (override) return expandEnvTemplate(override);
  return join(app$1.getPath("userData"), "workspace");
}
function resolveNpmRegistry() {
  const override = (getSettings().npmRegistry || "").trim().replace(/\/+$/, "");
  return override || NPM_REGISTRY_DEFAULT;
}
function npmRegistryWithSlash() {
  return `${resolveNpmRegistry()}/`;
}
function clearWindowBounds() {
  getStore().delete("windowBounds");
}
function applyNpmRegistryEnv() {
  const url = npmRegistryWithSlash();
  process.env.npm_config_registry = url;
  return url;
}
function uniquePath(dir, filename) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
  }
  const ext = extname(filename);
  const stem = basename(filename, ext);
  for (let i = 0; i < 1e3; i += 1) {
    const candidate = join(dir, i === 0 ? filename : `${stem} (${i})${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return join(dir, `${stem} (${Date.now()})${ext}`);
}
function resolveExportPath(filename) {
  return uniquePath(resolveDownloadDir(), filename);
}
const zh = {
  "app.title": "桌面控制台",
  "tray.show": "显示主界面",
  "tray.stop": "停止 {name}",
  "tray.start": "启动 {name}",
  "tray.quit": "退出控制台",
  "tray.quitConfirmTitle": "确认退出",
  "tray.quitConfirm": "确定要退出吗？",
  "tray.quitYes": "确定",
  "tray.quitNo": "取消",
  "tray.tooltip": "桌面控制台 · {n} 个 page 运行中",
  "tray.tooltipAlert": "桌面控制台 · 有页面异常退出，请打开面板排查",
  "dialog.title": "DSH 容器",
  "dialog.chooseDir": "选择要托管的本地项目目录",
  "dialog.saveAs": "另存为",
  "err.nodeVersion": "内置 Node 版本异常：{version}（期望 v24.21.0）",
  "err.nodeMissing": "未找到内置 Node 运行时，请在“环境准备”引导中点击下载（开发者可运行 npm run setup:node）",
  "err.dualInstance": "未能重新获取单实例锁：可能有另一个实例仍在运行，请确认是否出现双实例并存后手动关闭多余实例",
  "err.fatal": "桌面控制台遇到致命错误（{err}），即将退出。若反复出现，请通过任务管理器结束残留进程后重新启动；仍无法恢复时请重新安装或回退最近的更新",
  "mcp.errNoId": "缺少服务 id",
  "mcp.errBadId": "服务 id “{id}” 不合法：仅允许字母/数字/下划线/短横线，且以字母或数字开头",
  "mcp.errNoCommand": "缺少启动命令（command）",
  "mcp.errBadEnvKey": "环境变量名 “{key}” 不合法",
  "mcp.errBadCwd": "工作目录（cwd）必须是字符串",
  "mcp.errUnknown": "未知的 MCP 服务：{id}",
  "mcp.errDisabled": "MCP 服务 {id} 已停用，无法连接",
  "mcp.errNotConnected": "MCP 服务 {id} 未连接，请先连接",
  "mcp.errHandshakeTimeout": "MCP 握手超时：服务进程未响应 initialize",
  "mcp.errListToolsTimeout": "MCP 获取工具列表超时",
  "mcp.errCallTimeout": "MCP 工具调用超时",
  "mcp.errClosed": "MCP 服务进程已退出（异常终止或被外部结束）",
  "mcp.errBuiltinEdit": "内置 MCP 服务不可修改",
  "mcp.errBuiltinRemove": "内置 MCP 服务不可删除",
  "mcp.errPkgMissing": "「{name}」的组件尚未下载，请点击行下方的下载按钮获取",
  "mcp.builtin.sequential-thinking.name": "分步推理 Sequential Thinking",
  "mcp.builtin.memory.name": "知识图谱记忆 Memory",
  "mcp.builtin.everything.name": "官方能力演示 Everything",
  "mcp.builtin.filesystem.name": "文件系统 Filesystem",
  "mcp.builtin.context7.name": "库文档检索 Context7",
  "mcp.builtin.playwright.name": "浏览器自动化 Playwright",
  "mcp.builtin.github.name": "GitHub（需密钥）",
  "mcp.builtin.brave-search.name": "Brave 搜索（需密钥）",
  "mcp.builtin.dsh-workspace.name": "共享上下文 Workspace",
  "download.doneTitle": "下载完成",
  "download.doneBody": "{name} 已保存到 {dir}",
  "ipc.portRange": "端口需为 1-65535 的整数",
  "ipc.depsCycle": "依赖存在循环：{chain}",
  "ipc.notTerminal": "{id} 不是终端类项目",
  "ipc.unknownTarget": "未知的目标: {target}",
  "ipc.containerRoot": "容器根目录",
  "ipc.guestGone": "内嵌页面已不可用",
  "ipc.resetNotBuiltin": "只有容器内置页面可以重置",
  "pty.commandNotFound": "找不到命令 “{cmd}”：它不在 PATH 中，也不是可执行文件。请确认该 CLI 已安装或已在设置中提供完整路径。",
  "page.noEntryCommand": "无法推断启动命令：目录缺少 server.js / index.js / package.json(start script)",
  "page.metaParseFail": "container.json 解析失败: {err}",
  "page.metaNoStart": "container.json 缺少 startCommand（terminal 类型必填）",
  "page.metaNoPort": "container.json 缺少 port（或设置 external=true / kind=terminal，或项目自带可推断的启动入口）",
  "page.dirEnvLabel": "页面目录",
  "page.dirEnvDesc": "自动生成的应用安装目录，以环境变量注入该页面子进程。留空即用导入时的目录。",
  "page.metaInvalid": "{entry} (配置无效)",
  // container.json 轻校验：不致命，只作为「manifest 提示」展示
  "page.warnUnknownKey": "未知的 container.json 字段「{key}」，已忽略",
  "page.warnBadType": "字段「{key}」类型应为 {want}",
  "page.warnUnknownPermission": "未支持的权限声明「{key}」，容器当前只识别 notify/downloads/externalShell",
  "page.warnIconBig": "图标过大（{size}KB，上限 64KB），已忽略",
  "page.warnIconPath": "图标路径无法使用（需为页面目录内的 png/jpg/svg/ico）：{path}",
  "page.warnIconMissing": "未找到图标文件：{path}",
  "page.portNotReady": "端口 {port} 在 {sec}s 内未就绪",
  "page.containerDesc": "容器主程序（git 更新检测对象）",
  "page.unknown": "未知 page: {id}",
  "page.externalNoStart": "{name} 是外部地址项目，无需启动进程",
  "page.disabled": "{name} 已禁用，请在页面管理中重新启用后再试",
  "page.disableExternal": "外部地址项目请在外部地址管理中删除，不支持禁用",
  "page.invalidConfig": "{name} 配置无效，无法启动（请先设置端口）",
  "page.noStartCommand": "{name} 缺少启动命令，无法在终端中运行",
  "page.logStarting": "[container] 正在启动 {name}（端口 {port}）…",
  "page.dshStartFail": "dsh 启动失败: {err}",
  "page.openclawStartFail": "openclaw 启动失败: {err}",
  "page.cliNeedsTerminal": "{name} 是命令行项目，请点击「终端」在内置终端中运行",
  "page.spawnFail": "spawn 失败: {err}",
  "page.processExited": "进程退出，code={code}",
  "page.logReady": "[container] 已就绪，监听端口 {port}",
  "page.dshProfileNotReady": "dsh profile 在 {sec}s 内未就绪（端口 {port}）",
  "page.healthFail": "端口已监听但健康检查未通过：{url}",
  "page.portOwner": "端口 {port} 已被进程 {name}（PID {pid}）占用，可结束它后重试，或改用其他端口",
  "page.depsCycle": "启动依赖存在循环：{chain}",
  "page.depsFail": "依赖页面 {dep} 启动失败：{err}",
  "page.logHealthKill": "[container] 健康检查连续 {n} 次失败，判定进程假死，正在重启…",
  "notify.giveUpTitle": "页面自动重启已放弃",
  "notify.giveUpBody": "{name} 连续异常退出 {max} 次，容器已停止自动重启，请在「页面」面板排查",
  "notify.updateReadyTitle": "更新已就绪",
  "notify.updateReadyBody": "桌面控制台 v{version} 已下载完成，重启后生效",
  "log.mainLabel": "主进程日志",
  "update.noRollback": "当前没有可回退的上一版本备份（仅在完成过一次在线更新后可用）",
  "update.hashMismatch": "更新包内容校验失败（SHA-512 不匹配），已丢弃本次下载，请重试",
  "update.rollbackFailed": "回退调度失败，请查看日志",
  "update.relaunchDev": "当前处于开发模式（npm run dev），自我重启会连带关闭开发服务器并留下黑屏窗口，已取消本次重启。主进程改动会由 electron-vite 自动重建并重启；如需完全重启，请手动停止并重新运行 npm run dev",
  "diag.exportTitle": "导出诊断报告",
  "page.logStopping": "[container] 正在停止…",
  "page.logRetryAfterReclaim": "[container] 检测到旧进程占用，已清理残留进程，正在重试启动…",
  "page.logCrashRestart": "[container] 进程异常退出（code={code}），{sec} 秒后自动重启（第 {n}/{max} 次）…",
  "page.crashGiveUp": "连续 {max} 次异常退出，已停止自动重启；请在「帮助 → 打开日志目录」排查",
  "dsh.pnpmMissing": "未找到 pnpm（dsh 的插件管理依赖 pnpm）。请先执行: npm install -g pnpm",
  "dsh.invalidProfile": "非法 profile 名: {profile}",
  "dsh.reservedProfile": 'profile 名 "desktop" 由 dsh 的 Electron 应用保留',
  "dsh.notInstalled": "未安装 @deepseek-ai/dsh（npm run setup:dsh 或 npm install @deepseek-ai/dsh）",
  "dsh.pkgNoManifest": "dsh 包缺少 package.json",
  "dsh.pkgBroken": "dsh 包损坏：{err}",
  "dsh.unavailable": "dsh 不可用",
  "dsh.exitCode": "dsh 退出码 {code}",
  "dsh.pageExists": "pages/{id} 已存在",
  "dsh.homeLabel": "DSH 配置目录",
  "dsh.homeDesc": "默认使用独立目录（容器独占，环境根目录下的 .dsh 子目录）；若未手动改动且 ~/.dsh 已有登录会自动沿用以免丢失；选系统通用目录则与终端共用同一套 profile（~/.dsh）",
  "dsh.profilePageDesc": "由容器管理的 @deepseek-ai/dsh profile「{profile}」，插件在本机 userData 的 profile 目录内管理",
  "dsh.invalidSpec": "非法包名/地址: {spec}",
  "dsh.gitNeedsUrl": "git 更新需要提供仓库地址",
  "dsh.updatedTo": "已更新至 {spec}",
  "dsh.npmUpdated": "已通过 npm 更新 {spec}",
  "dsh.notADependency": "{name} 并非本 profile 的已安装依赖（已被卸载，或仅是 dsh 遗留的 bundle 层），无需卸载；插件列表已重新读取",
  "dsh.illegalRepoChars": "仓库地址包含非法字符",
  "dsh.lsRemoteFail": "git ls-remote 失败",
  "dsh.remoteHeadFail": "无法解析远端 HEAD",
  "dsh.binMissing": "未找到 @deepseek-ai/dsh/lib/bin.js（先运行 npm run setup:dsh）",
  "openclaw.cliMissing": "未找到 openclaw CLI，请先运行 npm run setup:openclaw（或全局安装 openclaw@latest）",
  "openclaw.cliMissingShort": "未找到 openclaw CLI，请先运行 npm run setup:openclaw",
  "openclaw.versionFail": "openclaw --version 退出码 {code}",
  "openclaw.unavailable": "openclaw 不可用：{err}",
  "openclaw.homeLabel": "OPENCLAW 配置目录",
  "openclaw.homeDesc": "默认使用独立目录（容器独占，环境根目录下的 .openclaw 子目录）；若未手动改动且 ~/.openclaw 已有配置会自动沿用以免丢失；选系统通用目录则与终端共用同一套配置（~/.openclaw）",
  "openclaw.pageDesc": "由容器管理的 openclaw gateway（自带最新版），主界面内嵌打开 Control UI；配置目录默认 ~/.openclaw",
  "openclaw.configUnreadable": "无法解析 openclaw 配置（{path}），已中止以免覆盖：{err}",
  "openclaw.tokenWriteFail": "写入 Gateway 令牌失败：{err}",
  "node.notWin": "内置 Node 自动更新目前仅支持 Windows",
  "node.badVersion": "无效的 Node 版本号：{v}",
  "node.indexFail": "无法获取 Node 版本列表：{err}",
  "node.downloading": "正在下载 Node {v} …",
  "node.downloadingPct": "正在下载 Node {v}… {p}%（{mb} MB）",
  "node.extracting": "下载完成，正在解压校验…",
  "node.tooSmall": "下载文件过小（{n} 字节），已放弃",
  "node.downloadFail": "下载失败（已尝试全部镜像）：{err}",
  "node.extractFail": "解压失败：{err}",
  "node.verifyFail": "解压校验失败：未找到 node.exe 或版本不符",
  "node.locked": "旧运行时文件被占用，请先停止使用内置 Node 的页面/终端后重试：{err}",
  "node.done": "内置 Node 已更新为 {v}",
  "install.importedDesc": "导入时由容器生成",
  "install.repoUrlInvalid": "仓库地址需为 https 或 git@ 形式的 git URL",
  "install.dirNameNeeded": "无法推导目录名，请指定 name",
  "install.dirNameFail": "无法推导目录名",
  "install.rejectNonNode": "该项目基于 {stack}，容器只能托管 Node 项目，无法克隆或运行；如需接入请把已运行实例配为 external URL。",
  "install.rejectNoEntry": "未找到可运行的入口（server.js / index.js 或 package.json 的 start 脚本 / bin），容器无法启动该项目。",
  "install.rejectMonorepoRoot": "这是一个 monorepo 根目录（private 或含 workspaces），自身没有可运行入口；请改为导入具体的子包目录。",
  "install.npmMissing": "内置 npm 不可用，无法自动安装依赖；请先修复内置 Node 环境后重试。",
  "install.timeout": "命令超时（{cmd}），已中止。",
  "install.depsFail": "依赖安装失败（{cmd}）：{tail}",
  "install.npmSpecNeeded": "请输入要安装的 npm 包名",
  "install.npmSpecInvalid": "无效的 npm 包名：{spec}",
  "install.npmNoBin": "npm 包 {pkg} 未声明可执行的 bin，无法作为终端命令运行；如需托管它的 Web 服务，请改用 Git 导入源码仓库。",
  "install.importedNpmDesc": "导入时由容器生成（npm 包）",
  "install.srcMissing": "目录不存在: {dir}",
  "install.cannotRemoveContainer": "不能移除容器本身",
  "install.builtinUndeletable": "{id} 是容器内置页面，不可删除",
  "install.illegalPageId": "非法 page id",
  "git.notRepo": "不是 git 仓库（本地目录安装或已移除）",
  "git.asarDownloaded": "已下载 v{version}，重启应用后生效（启动异常会自动回滚）",
  "git.asarFetching": "正在从 release 分支下载更新…{percent}",
  "git.asarExtracting": "正在写入更新包：{percent}",
  "git.asarResuming": "从断点继续写入更新包：{percent}",
  "git.zipUnpacking": "下载完成，正在解压 app.asar 与原生模块…",
  "git.asarSizeUnknown": "无法确定更新包大小，下载已中止",
  "git.asarSizeMismatch": "更新包大小校验失败（应为 {want} 字节，实得 {got}），请重试",
  "git.asarExtractFailed": "解压后未找到有效的 app.asar，更新已中止",
  "git.noOrigin": "无 origin 远端",
  "git.branchMissing": "远端没有分支 {branch}",
  "git.dirtySkipped": "工作区有未提交改动，已跳过（请手动处理）",
  "upd.registryUnreachable": "无法访问 npm registry",
  "upd.versionNotDetected": "未检测到已安装版本",
  "upd.dshName": "DSH 本体",
  "upd.npmExitCode": "npm 退出码 {code}",
  "upd.npmMissing": "缺少内置 npm（{npm}），请先运行 npm run setup:node",
  "upd.dshDirNotWritable": "（目录不可写：请检查用户数据目录权限，或手动运行 npm run setup:dsh --force）",
  "upd.dshUpgraded": "DSH 已升级至 {after}，重启 dsh 页面后生效",
  "upd.dshUpToDate": "DSH 已是最新（{after}）",
  "upd.openclawDirMissing": "未找到 openclaw 安装目录",
  "upd.openclawDirNotWritable": "（安装目录不可写：请以管理员身份重新构建，或手动运行 npm run setup:openclaw --force）",
  "upd.openclawUpgraded": "OpenClaw 已升级至 {after}，重启该页面后生效",
  "upd.openclawUpToDate": "OpenClaw 已是最新（{after}）",
  "upd.mcpName": "MCP 内置组件",
  "upd.mcpMissingCount": "{n} 个待下载",
  "upd.mcpUpdatableCount": "{n} 个可更新",
  "upd.mcpRootMissing": "未确定 MCP 组件目录",
  "upd.mcpReady": "MCP 内置组件已就绪",
  "upd.mcpAlreadyReady": "MCP 内置组件已是最新（{after}）",
  "upd.localNoAuto": "本地项目不支持自动更新，请在其仓库拉取新版后重装/复制",
  "upd.builtinFollowsContainer": "容器内置页面，随桌面控制台源码一起更新",
  "upd.unknownChannel": "未知的更新方式",
  // #15 配置快照 / 迁移包
  "snapshot.exportTitle": "导出迁移包",
  "snapshot.importTitle": "导入迁移包",
  "snapshot.zipFilter": "迁移包 (zip)",
  "snapshot.noPages": "没有可导出的页面清单，请先导入至少一个项目",
  "snapshot.exported": "迁移包已导出：{path}",
  "snapshot.exportFail": "导出迁移包失败：{err}",
  "snapshot.importFail": "导入迁移包失败：{err}",
  "snapshot.badArchive": "迁移包格式无效或缺少 manifest.json",
  "snapshot.restored": "已导入迁移包，恢复 {n} 个页面配置",
  // #18 崩溃守护分级退出码
  "page.logEngineMismatch": "[container] 依赖引擎版本不匹配（EBADENGINE），自动重启无意义，已停止重试",
  "page.logReclaimRetry": "[container] 退出码 78（资源被占用），已清理残留进程并立即重试，不计入崩溃预算",
  // #20 资源超限角标
  "tray.tooltipResource": "桌面控制台 · 有页面资源占用超限",
  // #21 网络诊断向导（步骤标签由渲染层按 step.id 本地化）
  "net.proxyNone": "未检测到代理环境变量",
  "net.reachable": "可达（{ms}ms）",
  "net.unreachable": "不可达：{err}"
};
const en = {
  "app.title": "Desktop Console",
  "tray.show": "Show main window",
  "tray.stop": "Stop {name}",
  "tray.start": "Start {name}",
  "tray.quit": "Quit container",
  "tray.quitConfirmTitle": "Confirm Exit",
  "tray.quitConfirm": "Are you sure you want to quit?",
  "tray.quitYes": "OK",
  "tray.quitNo": "Cancel",
  "tray.tooltip": "Desktop Console · {n} page(s) running",
  "tray.tooltipAlert": "Desktop Console · a page exited abnormally — open the panel to investigate",
  "dialog.title": "DSH Container",
  "dialog.chooseDir": "Choose the local project folder to host",
  "dialog.saveAs": "Save As",
  "err.nodeVersion": "Unexpected built-in Node version: {version} (expected v24.21.0)",
  "err.nodeMissing": "Built-in Node runtime not found — download it from the setup guide (developers: run npm run setup:node)",
  "err.dualInstance": "Failed to re-acquire the single-instance lock: another instance may still be running — check for duplicate instances and close the extra one manually",
  "err.fatal": "The desktop container hit a fatal error ({err}) and will exit. If it keeps happening, kill leftover processes in Task Manager and restart; if it persists, reinstall or roll back the latest update",
  "mcp.errNoId": "missing server id",
  "mcp.errBadId": 'invalid server id "{id}": use letters/digits/underscore/dash, starting with a letter or digit',
  "mcp.errNoCommand": "missing command",
  "mcp.errBadEnvKey": 'invalid env var name "{key}"',
  "mcp.errBadCwd": "cwd must be a string",
  "mcp.errUnknown": "unknown MCP server: {id}",
  "mcp.errDisabled": "MCP server {id} is disabled and cannot be connected",
  "mcp.errNotConnected": "MCP server {id} is not connected — connect it first",
  "mcp.errHandshakeTimeout": "MCP handshake timed out: the server never answered initialize",
  "mcp.errListToolsTimeout": "MCP listTools timed out",
  "mcp.errCallTimeout": "MCP tool call timed out",
  "mcp.errClosed": "MCP server process exited (crashed or killed externally)",
  "mcp.errBuiltinEdit": "built-in MCP servers cannot be modified",
  "mcp.errBuiltinRemove": "built-in MCP servers cannot be removed",
  "mcp.errPkgMissing": "the component for '{name}' has not been downloaded yet — use the download button under the row to fetch it",
  "mcp.builtin.sequential-thinking.name": "Sequential Thinking",
  "mcp.builtin.memory.name": "Knowledge-graph Memory",
  "mcp.builtin.everything.name": "Everything (official demo)",
  "mcp.builtin.filesystem.name": "Filesystem",
  "mcp.builtin.context7.name": "Context7 (library docs)",
  "mcp.builtin.playwright.name": "Playwright (browser automation)",
  "mcp.builtin.github.name": "GitHub (needs token)",
  "mcp.builtin.brave-search.name": "Brave Search (needs key)",
  "mcp.builtin.dsh-workspace.name": "Shared context (Workspace)",
  "download.doneTitle": "Download complete",
  "download.doneBody": "{name} saved to {dir}",
  "ipc.portRange": "Port must be an integer from 1 to 65535",
  "ipc.depsCycle": "Dependency cycle: {chain}",
  "ipc.notTerminal": "{id} is not a terminal project",
  "ipc.unknownTarget": "Unknown target: {target}",
  "ipc.containerRoot": "Container root",
  "ipc.guestGone": "The embedded page is no longer available",
  "ipc.resetNotBuiltin": "Only container built-in pages can be reset",
  "pty.commandNotFound": "Command not found: “{cmd}” — it is neither on PATH nor an executable file. Make sure the CLI is installed, or set its full path in the settings.",
  "page.noEntryCommand": "Cannot infer a start command: the folder has no server.js / index.js / package.json(start script)",
  "page.metaParseFail": "Failed to parse container.json: {err}",
  "page.metaNoStart": "container.json is missing startCommand (required for kind=terminal)",
  "page.metaNoPort": "container.json is missing port (or set external=true / kind=terminal, or provide an inferable entry point)",
  "page.dirEnvLabel": "Page directory",
  "page.dirEnvDesc": "Auto-generated app install directory, injected into this page’s subprocess as an env var. Empty uses the imported directory.",
  "page.metaInvalid": "{entry} (invalid config)",
  // container.json light validation: never fatal, surfaced as "manifest hints"
  "page.warnUnknownKey": 'Unknown container.json field "{key}" (ignored)',
  "page.warnBadType": 'Field "{key}" should be of type {want}',
  "page.warnUnknownPermission": 'Unsupported permission declaration "{key}" — the container only knows notify/downloads/externalShell',
  "page.warnIconBig": "Icon too large ({size}KB, 64KB cap); ignored",
  "page.warnIconPath": "Icon path is not usable (must be a png/jpg/svg/ico inside the page directory): {path}",
  "page.warnIconMissing": "Icon file not found: {path}",
  "page.portNotReady": "Port {port} was not ready within {sec}s",
  "page.containerDesc": "Container main program (git update-check target)",
  "page.unknown": "Unknown page: {id}",
  "page.externalNoStart": "{name} is an external address project; no process to start",
  "page.disabled": "{name} is disabled; re-enable it in the Pages panel first",
  "page.disableExternal": "External address projects can be removed in the External Sites manager; they cannot be disabled",
  "page.invalidConfig": "{name} has an invalid config and cannot start (set a port first)",
  "page.noStartCommand": "{name} has no start command and cannot run in a terminal",
  "page.logStarting": "[container] Starting {name} (port {port})…",
  "page.dshStartFail": "dsh failed to start: {err}",
  "page.openclawStartFail": "openclaw failed to start: {err}",
  "page.cliNeedsTerminal": '{name} is a CLI project — click "Terminal" to run it in the built-in terminal',
  "page.spawnFail": "spawn failed: {err}",
  "page.processExited": "Process exited, code={code}",
  "page.logReady": "[container] Ready, listening on port {port}",
  "page.dshProfileNotReady": "dsh profile was not ready within {sec}s (port {port})",
  "page.healthFail": "The port is listening but the health check failed: {url}",
  "page.portOwner": "Port {port} is already held by process {name} (PID {pid}) — kill it and retry, or pick another port",
  "page.depsCycle": "Circular page startup dependency: {chain}",
  "page.depsFail": "Dependency page {dep} failed to start: {err}",
  "page.logHealthKill": "[container] Health check failed {n} times in a row — treating the process as hung and restarting…",
  "notify.giveUpTitle": "Page auto-restart gave up",
  "notify.giveUpBody": "{name} exited abnormally {max} times in a row; the container stopped restarting it — investigate in the Pages panel",
  "notify.updateReadyTitle": "Update ready",
  "notify.updateReadyBody": "Desktop container v{version} downloaded — restart to apply",
  "log.mainLabel": "Main process log",
  "update.noRollback": "No previous-version backup is available to roll back to (only offered after one OTA update has completed)",
  "update.hashMismatch": "The update package failed its SHA-512 content check; the download was discarded — please retry",
  "update.rollbackFailed": "Failed to schedule the rollback — check the logs",
  "update.relaunchDev": "Running in dev mode (npm run dev): a self-relaunch would tear down the renderer dev server and leave a black window, so this relaunch was cancelled. electron-vite already rebuilds and restarts the app for main-process edits — to fully restart, stop and re-run npm run dev manually",
  "diag.exportTitle": "Export diagnostic report",
  "page.logStopping": "[container] Stopping…",
  "page.logRetryAfterReclaim": "[container] A stale process was holding the resource; reclaimed it and retrying the start…",
  "page.logCrashRestart": "[container] Process died unexpectedly (code={code}); auto-restarting in {sec}s (attempt {n}/{max})…",
  "page.crashGiveUp": "Exited abnormally {max} times in a row; auto-restart stopped — open the log folder from Help to investigate",
  "dsh.pnpmMissing": "pnpm not found (dsh manages plugins with pnpm). Run: npm install -g pnpm",
  "dsh.invalidProfile": "Invalid profile name: {profile}",
  "dsh.reservedProfile": 'The profile name "desktop" is reserved by dsh’s Electron app',
  "dsh.notInstalled": "@deepseek-ai/dsh is not installed (npm run setup:dsh or npm install @deepseek-ai/dsh)",
  "dsh.pkgNoManifest": "The dsh package is missing package.json",
  "dsh.pkgBroken": "The dsh package is broken: {err}",
  "dsh.unavailable": "dsh is unavailable",
  "dsh.exitCode": "dsh exited with code {code}",
  "dsh.pageExists": "pages/{id} already exists",
  "dsh.homeLabel": "DSH config directory",
  "dsh.homeDesc": "Uses a container-owned .dsh subfolder of the env root by default; until you change it, an existing ~/.dsh login is kept automatically so nothing is lost. Pick the system-common folder to share the CLI profile store (~/.dsh)",
  "dsh.profilePageDesc": 'Container-managed @deepseek-ai/dsh profile "{profile}"; plugins are managed in this machine’s userData profile directory',
  "dsh.invalidSpec": "Invalid package name / URL: {spec}",
  "dsh.gitNeedsUrl": "A git update requires a repository URL",
  "dsh.updatedTo": "Updated to {spec}",
  "dsh.npmUpdated": "Updated {spec} via npm",
  "dsh.notADependency": "{name} is not an installed dependency of this profile (already removed, or just a leftover dsh bundle layer) — nothing to uninstall; the plugin list has been re-read",
  "dsh.illegalRepoChars": "The repository URL contains illegal characters",
  "dsh.lsRemoteFail": "git ls-remote failed",
  "dsh.remoteHeadFail": "Could not resolve the remote HEAD",
  "dsh.binMissing": "@deepseek-ai/dsh/lib/bin.js not found (run npm run setup:dsh first)",
  "openclaw.cliMissing": "openclaw CLI not found — run npm run setup:openclaw (or install openclaw@latest globally)",
  "openclaw.cliMissingShort": "openclaw CLI not found — run npm run setup:openclaw first",
  "openclaw.versionFail": "openclaw --version exited with code {code}",
  "openclaw.unavailable": "openclaw is unavailable: {err}",
  "openclaw.homeLabel": "OPENCLAW config dir",
  "openclaw.homeDesc": "Uses a container-owned .openclaw subfolder of the env root by default; until you change it, an existing ~/.openclaw config is kept automatically so nothing is lost. Pick the system-common folder to share the CLI config store (~/.openclaw)",
  "openclaw.pageDesc": "Container-managed openclaw gateway (bundled latest); the main window embeds its Control UI; the config dir defaults to ~/.openclaw",
  "openclaw.configUnreadable": "Could not parse the openclaw config ({path}); aborted to avoid overwriting it: {err}",
  "openclaw.tokenWriteFail": "Failed to write the gateway token: {err}",
  "node.notWin": "Bundled-Node auto-update currently supports Windows only",
  "node.badVersion": "Invalid Node version: {v}",
  "node.indexFail": "Cannot fetch the Node version list: {err}",
  "node.downloading": "Downloading Node {v} …",
  "node.downloadingPct": "Downloading Node {v}… {p}% ({mb} MB)",
  "node.extracting": "Download complete; extracting and verifying…",
  "node.tooSmall": "Downloaded file too small ({n} bytes), aborted",
  "node.downloadFail": "Download failed on every mirror: {err}",
  "node.extractFail": "Extraction failed: {err}",
  "node.verifyFail": "Post-extract check failed: node.exe missing or version mismatch",
  "node.locked": "The previous runtime is still in use — stop pages/terminals using the bundled Node and retry: {err}",
  "node.done": "Bundled Node updated to {v}",
  "install.importedDesc": "Generated by the container when the project was imported",
  "install.repoUrlInvalid": "The repository URL must be an https or git@ git URL",
  "install.dirNameNeeded": "Could not infer a folder name; please specify name",
  "install.dirNameFail": "Could not infer a folder name",
  "install.rejectNonNode": "This project is a {stack} codebase; the container can only host Node projects and cannot clone or run it. Point it at a running instance as an external URL instead.",
  "install.rejectNoEntry": "No runnable entry (server.js / index.js or a package.json start script / bin) was found, so the container cannot start this project.",
  "install.rejectMonorepoRoot": "This is a monorepo root (private or with workspaces) and has no runnable entry of its own; add a specific workspace folder instead.",
  "install.npmMissing": "The bundled npm is unavailable, so dependencies could not be installed automatically. Repair the bundled Node and retry.",
  "install.timeout": "The command timed out ({cmd}) and was aborted.",
  "install.depsFail": "Dependency installation failed ({cmd}): {tail}",
  "install.npmSpecNeeded": "Enter the npm package to install",
  "install.npmSpecInvalid": "Invalid npm package name: {spec}",
  "install.npmNoBin": "The npm package {pkg} declares no runnable bin, so it cannot run as a terminal command. To host its web server, add its source repository from Git instead.",
  "install.importedNpmDesc": "Generated by the container when this npm package was installed",
  "install.srcMissing": "Directory does not exist: {dir}",
  "install.cannotRemoveContainer": "The container itself cannot be removed",
  "install.builtinUndeletable": "{id} is a built-in container page and cannot be removed",
  "install.illegalPageId": "Illegal page id",
  "git.notRepo": "Not a git repository (installed from a local folder, or removed)",
  "git.asarDownloaded": "v{version} downloaded; restart the app to apply (auto-rolls back if it fails to boot)",
  "git.asarFetching": "Downloading update from the release branch…{percent}",
  "git.asarExtracting": "Writing the update package: {percent}",
  "git.asarResuming": "Resuming the update package write from the breakpoint: {percent}",
  "git.zipUnpacking": "Download complete; unpacking app.asar and native modules…",
  "git.asarSizeUnknown": "Could not determine the update package size; download aborted",
  "git.asarSizeMismatch": "Update package size check failed (expected {want} bytes, got {got}); please retry",
  "git.asarExtractFailed": "No valid app.asar after extraction; update aborted",
  "git.noOrigin": "No origin remote",
  "git.branchMissing": "The remote has no branch {branch}",
  "git.dirtySkipped": "The working tree has uncommitted changes; skipped (handle manually)",
  "upd.registryUnreachable": "Cannot reach the npm registry",
  "upd.versionNotDetected": "No installed version detected",
  "upd.dshName": "DSH core",
  "upd.npmExitCode": "npm exited with code {code}",
  "upd.npmMissing": "Built-in npm is missing ({npm}); run npm run setup:node first",
  "upd.dshDirNotWritable": " (directory not writable: check user-data directory permissions, or run npm run setup:dsh --force manually)",
  "upd.dshUpgraded": "DSH upgraded to {after}; restart the dsh page to apply",
  "upd.dshUpToDate": "DSH is up to date ({after})",
  "upd.openclawDirMissing": "openclaw install directory not found",
  "upd.openclawDirNotWritable": " (install directory not writable: rebuild as administrator, or run npm run setup:openclaw --force manually)",
  "upd.openclawUpgraded": "OpenClaw upgraded to {after}; restart that page to apply",
  "upd.openclawUpToDate": "OpenClaw is up to date ({after})",
  "upd.mcpName": "MCP built-in components",
  "upd.mcpMissingCount": "{n} to download",
  "upd.mcpUpdatableCount": "{n} updatable",
  "upd.mcpRootMissing": "MCP components directory not resolved",
  "upd.mcpReady": "MCP built-in components are ready",
  "upd.mcpAlreadyReady": "MCP built-in components are up to date ({after})",
  "upd.localNoAuto": "Local projects do not support auto-update; pull the new version in their repo, then reinstall/copy",
  "upd.builtinFollowsContainer": "Built-in container page — updates with the desktop container source",
  "upd.unknownChannel": "Unknown update channel",
  // #15 config snapshot / migration package
  "snapshot.exportTitle": "Export migration package",
  "snapshot.importTitle": "Import migration package",
  "snapshot.zipFilter": "Migration package (zip)",
  "snapshot.noPages": "No page manifest to export — import at least one project first",
  "snapshot.exported": "Migration package exported: {path}",
  "snapshot.exportFail": "Failed to export the migration package: {err}",
  "snapshot.importFail": "Failed to import the migration package: {err}",
  "snapshot.badArchive": "The migration package is invalid or missing manifest.json",
  "snapshot.restored": "Migration package imported — restored {n} page configs",
  // #18 crash guard exit-code tiers
  "page.logEngineMismatch": "[container] Dependency engine version mismatch (EBADENGINE); restarting is pointless, retries stopped",
  "page.logReclaimRetry": "[container] Exit code 78 (resource busy); stale process reclaimed and retried immediately, without burning the crash budget",
  // #20 over-budget tray badge
  "tray.tooltipResource": "Desktop Console · a page is over its resource budget",
  // #21 network diagnostic wizard (step labels localized by the renderer via step.id)
  "net.proxyNone": "No proxy environment variables detected",
  "net.reachable": "Reachable ({ms}ms)",
  "net.unreachable": "Unreachable: {err}"
};
const dictionaries = { zh, en };
let localeSource = () => "zh";
function registerLocaleSource(fn) {
  localeSource = fn;
  cachedLocale = null;
}
let cachedLocale = null;
function invalidateLocaleCache() {
  cachedLocale = null;
}
const localeListeners = /* @__PURE__ */ new Set();
function onLocaleChanged(fn) {
  localeListeners.add(fn);
}
function notifyLocaleChanged() {
  invalidateLocaleCache();
  for (const fn of localeListeners) fn();
}
function currentLocale() {
  if (cachedLocale === null) cachedLocale = localeSource() === "en" ? "en" : "zh";
  return cachedLocale;
}
function msgIn(lang, key, params) {
  const l = lang === "en" ? "en" : "zh";
  let str = dictionaries[l][key] ?? zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
function m(key, params) {
  return msgIn(currentLocale(), key, params);
}
function resolveText(value, fallback = "") {
  if (typeof value === "string") return value.trim() ? value : fallback;
  if (!value) return fallback;
  const loc = currentLocale();
  const other = loc === "zh" ? "en" : "zh";
  const pick = (v) => typeof v === "string" && v.trim() ? v : "";
  return pick(value[loc]) || pick(value[other]) || fallback;
}
function zoneOffsetMs(d) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const p = {};
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  return asUTC - Math.floor(d.getTime() / 1e3) * 1e3;
}
function isoShanghai(d = /* @__PURE__ */ new Date()) {
  const offset = zoneOffsetMs(d);
  const shifted = new Date(d.getTime() + offset);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 36e5)).padStart(2, "0");
  const mm = String(Math.floor(abs % 36e5 / 6e4)).padStart(2, "0");
  return `${shifted.toISOString().replace("Z", "")}${sign}${hh}:${mm}`;
}
const MAX_BYTES$1 = 5 * 1024 * 1024;
const ROTATED_KEEP = 2;
let logsRoot = null;
let installed = false;
function logsDir() {
  if (logsRoot) return logsRoot;
  let base;
  try {
    base = app$1.getPath("userData");
  } catch {
    base = app$1.getPath("temp");
  }
  logsRoot = join(base, "logs");
  try {
    mkdirSync(logsRoot, { recursive: true });
  } catch {
  }
  return logsRoot;
}
function rotateIfNeeded(file) {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES$1) return;
    for (let i = ROTATED_KEEP; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      const to = `${file}.${i}`;
      if (existsSync(from)) {
        if (i > ROTATED_KEEP && existsSync(to)) continue;
        renameSync(from, to);
      }
    }
  } catch {
  }
}
function append(file, line) {
  try {
    rotateIfNeeded(file);
    appendFileSync(file, line, "utf8");
  } catch {
  }
}
const stamp = () => isoShanghai();
function writeLine(level, args) {
  const parts = args.map((a) => a instanceof Error ? a.stack ?? a.message : safeStr(a));
  append(join(logsDir(), "main.log"), `[${stamp()}] [${level}] ${parts.join(" ")}
`);
}
function safeStr(v) {
  if (typeof v === "string") return v;
  try {
    return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
  } catch {
    return "[unserializable]";
  }
}
function installFileLogger() {
  if (installed) return;
  installed = true;
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      writeLine(level.toUpperCase(), args);
      original(...args);
    };
  }
}
function logPageLine(pageId, chunk) {
  const safe = pageId.replace(/[^\w.-]/g, "_");
  const dir = join(logsDir(), "pages");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }
  const file = join(dir, `${safe}.log`);
  rotateIfNeeded(file);
  const body = chunk.split(/\r?\n/).filter((l) => l.trim()).map((l) => `[${stamp()}] ${l}
`).join("");
  if (body) append(file, body);
}
function resolveLogKey(key) {
  if (key === "main") return join(logsDir(), "main.log");
  const mm = key.match(/^pages\/([\w.-]+)\.log$/);
  if (mm && !mm[1].includes("..")) return join(logsDir(), "pages", `${mm[1]}.log`);
  return null;
}
function listLogFiles() {
  const out = [];
  const push = (key, label, file) => {
    try {
      const st = statSync(file);
      if (st.isFile()) out.push({ key, label, bytes: st.size, mtimeMs: st.mtimeMs });
    } catch {
    }
  };
  push("main", m("log.mainLabel"), join(logsDir(), "main.log"));
  const dir = join(logsDir(), "pages");
  try {
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".log")) push(`pages/${f}`, f.replace(/\.log$/, ""), join(dir, f));
      }
    }
  } catch {
  }
  return out;
}
const TAIL_READ_CAP = 512 * 1024;
function readLogTail(key, tail = 400, filter) {
  const file = resolveLogKey(key);
  if (!file) return { lines: [], truncated: false, readBytes: 0, totalBytes: 0 };
  let total = 0;
  try {
    total = statSync(file).size;
  } catch {
    return { lines: [], truncated: false, readBytes: 0, totalBytes: 0 };
  }
  const readBytes = Math.min(total, TAIL_READ_CAP);
  const buf = Buffer.allocUnsafe(readBytes);
  let fd;
  try {
    fd = openSync(file, "r");
    readSync(fd, buf, 0, readBytes, total - readBytes);
  } catch {
    return { lines: [], truncated: false, readBytes: 0, totalBytes: total };
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
  let lines = buf.toString("utf8").split(/\r?\n/);
  if (readBytes < total) lines = lines.slice(1);
  const needle = (filter ?? "").trim().toLowerCase();
  if (needle) lines = lines.filter((l) => l.toLowerCase().includes(needle));
  const keep = Math.max(1, Math.min(tail || 400, 5e3));
  return {
    lines: lines.slice(-keep),
    truncated: readBytes < total || lines.length > keep,
    readBytes,
    totalBytes: total
  };
}
const streamOffsets = /* @__PURE__ */ new Map();
let streamWatchers = [];
function flushFile(file, key, onLine) {
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    return;
  }
  let off = streamOffsets.get(file);
  if (off === void 0) off = 0;
  if (size < off) off = 0;
  if (size <= off) return;
  const want = Math.min(size - off, 64 * 1024);
  const buf = Buffer.allocUnsafe(want);
  let fd;
  try {
    fd = openSync(file, "r");
    readSync(fd, buf, 0, want, off);
  } catch {
    return;
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
  const text = buf.toString("utf8");
  const lastNl = text.lastIndexOf("\n");
  if (lastNl === -1) return;
  const complete = text.slice(0, lastNl);
  streamOffsets.set(file, off + Buffer.byteLength(complete, "utf8") + 1);
  const lines = complete.split(/\r?\n/).map((l) => l.replace(/\r$/, "")).filter((l) => l.length > 0);
  if (lines.length) onLine({ key, lines });
}
function startLogStream(onLine) {
  stopLogStream();
  streamOffsets.clear();
  const root2 = logsDir();
  const pagesDir = join(root2, "pages");
  try {
    mkdirSync(pagesDir, { recursive: true });
  } catch {
  }
  const seed = (file) => {
    try {
      streamOffsets.set(file, statSync(file).size);
    } catch {
    }
  };
  seed(join(root2, "main.log"));
  try {
    for (const f of readdirSync(pagesDir)) {
      if (f.endsWith(".log")) seed(join(pagesDir, f));
    }
  } catch {
  }
  const watchDir = (dir, resolve2) => {
    try {
      const w = watch(dir, (_event, filename) => {
        if (!filename) return;
        const name = String(filename);
        const key = resolve2(name);
        if (!key) return;
        flushFile(join(dir, name), key, onLine);
      });
      w.on("error", () => {
      });
      streamWatchers.push(w);
    } catch {
    }
  };
  watchDir(root2, (name) => name === "main.log" ? "main" : null);
  watchDir(pagesDir, (name) => name.endsWith(".log") ? `pages/${name}` : null);
}
function stopLogStream() {
  for (const w of streamWatchers) {
    try {
      w.close();
    } catch {
    }
  }
  streamWatchers = [];
  streamOffsets.clear();
}
const RETENTION_DAYS = 7;
const MEMORY_CAP = 500;
const MAX_BYTES = 1024 * 1024;
let activeDay = null;
const memory = [];
let broadcaster = null;
function displayDay(ts = Date.now()) {
  return isoShanghai(new Date(ts)).slice(0, 10);
}
function activeFile() {
  return join(eventsDir(), "events.jsonl");
}
function archiveDir() {
  return join(eventsDir(), "events");
}
function eventsDir() {
  const dir = logsDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
  }
  return dir;
}
function archiveDay(day) {
  const from = activeFile();
  if (!existsSync(from)) return;
  try {
    mkdirSync(archiveDir(), { recursive: true });
    let to = join(archiveDir(), `events-${day}.jsonl`);
    for (let i = 1; existsSync(to); i++) to = join(archiveDir(), `events-${day}.${i}.jsonl`);
    renameSync(from, to);
  } catch {
  }
}
function pruneArchives(today) {
  const cutoff = (/* @__PURE__ */ new Date(`${today}T00:00:00Z`)).getTime() - RETENTION_DAYS * 864e5;
  let names2 = [];
  try {
    names2 = readdirSync(archiveDir());
  } catch {
    return;
  }
  for (const name of names2) {
    const mm = name.match(/^events-(\d{4}-\d{2}-\d{2})(\.\d+)?\.jsonl$/);
    if (!mm) continue;
    if ((/* @__PURE__ */ new Date(`${mm[1]}T00:00:00Z`)).getTime() < cutoff) {
      try {
        unlinkSync(join(archiveDir(), name));
      } catch {
      }
    }
  }
}
function readJsonl(file) {
  let raw;
  try {
    if (!existsSync(file)) return [];
    raw = readFileSync(file, "utf-8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.kind === "string" && typeof parsed.ts === "number") out.push(parsed);
    } catch {
    }
  }
  return out;
}
function eventFiles() {
  const files = [activeFile()];
  let names2 = [];
  try {
    names2 = readdirSync(archiveDir());
  } catch {
  }
  for (const name of names2.filter((n) => /^events-\d{4}-\d{2}-\d{2}(\.\d+)?\.jsonl$/.test(n)).sort().reverse()) {
    files.push(join(archiveDir(), name));
  }
  return files;
}
function setEventBroadcaster(fn) {
  broadcaster = fn;
}
function logEvent(input) {
  const meta = input.meta ? Object.fromEntries(
    Object.entries(input.meta).filter(([, v]) => v !== void 0)
  ) : void 0;
  const ev = {
    ts: Date.now(),
    level: input.level,
    kind: input.kind,
    ...input.pageId ? { pageId: input.pageId } : {},
    ...input.detail ? { detail: input.detail } : {},
    ...meta ? { meta } : {}
  };
  const today = displayDay(ev.ts);
  if (activeDay && activeDay !== today) {
    archiveDay(activeDay);
    pruneArchives(today);
  }
  activeDay = today;
  try {
    const file = activeFile();
    if (existsSync(file) && statSync(file).size > MAX_BYTES) archiveDay(today);
    appendFileSync(file, JSON.stringify({ ...ev, iso: isoShanghai(new Date(ev.ts)) }) + "\n", "utf8");
  } catch {
  }
  memory.push(ev);
  if (memory.length > MEMORY_CAP) memory.splice(0, memory.length - MEMORY_CAP);
  try {
    broadcaster?.(ev);
  } catch {
  }
  return ev;
}
function listEvents(args = {}) {
  const limit2 = Math.max(1, Math.min(2e3, args.limit ?? 200));
  let rows = [];
  for (const file of eventFiles()) {
    rows = rows.concat(readJsonl(file));
    if (rows.length >= limit2 * 2) break;
  }
  if (!rows.length) rows = memory.slice();
  const order = /* @__PURE__ */ new Map();
  rows.forEach((r, i) => order.set(r, i));
  const filtered = rows.filter(
    (r) => (!args.level || r.level === args.level) && (!args.pageId || r.pageId === args.pageId) && (!args.kind || r.kind === args.kind) && (!args.since || r.ts >= args.since)
  );
  filtered.sort((a, b) => b.ts - a.ts || (order.get(b) ?? 0) - (order.get(a) ?? 0));
  return filtered.slice(0, limit2);
}
function capture$1(cmd, args, timeoutMs = 8e3) {
  return new Promise((resolve2) => {
    const child = spawn(cmd, args, { windowsHide: true, timeout: timeoutMs });
    let out = "";
    child.stdout?.on("data", (d) => out += String(d));
    child.on("error", () => resolve2(""));
    child.on("close", () => resolve2(out));
  });
}
async function windowsHolders(port) {
  const out = await capture$1("netstat", ["-ano", "-p", "tcp"]);
  const pids = /* @__PURE__ */ new Set();
  const needle = `:${port}`;
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    if (cols[1] !== needle && !cols[1].endsWith(needle)) continue;
    const pid = Number(cols[cols.length - 1]);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}
async function posixHolders(port) {
  const out = await capture$1("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
  return out.split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}
async function processName(pid) {
  if (process.platform === "win32") {
    const out2 = await capture$1("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"]);
    return out2.match(/^"([^"]+)"/)?.[1] || `PID ${pid}`;
  }
  const out = await capture$1("ps", ["-p", String(pid), "-o", "comm="]);
  return out.trim() || `PID ${pid}`;
}
async function findPortHolder(port) {
  try {
    const pids = process.platform === "win32" ? await windowsHolders(port) : await posixHolders(port);
    if (!pids.length) return null;
    return { pid: pids[0], name: await processName(pids[0]) };
  } catch (err) {
    console.warn("[port] holder probe failed (ignored):", err.message);
    return null;
  }
}
function probePortBind(port) {
  return new Promise((resolve2) => {
    let settled = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      resolve2(v);
    };
    const srv = createServer();
    srv.unref();
    const timer = setTimeout(() => {
      srv.close();
      settle("error");
    }, 2500);
    timer.unref?.();
    srv.once("error", () => {
      clearTimeout(timer);
      settle("busy");
    });
    srv.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
      srv.close(() => {
        clearTimeout(timer);
        settle("free");
      });
    });
  });
}
async function killPortHolder(port) {
  const pids = process.platform === "win32" ? await windowsHolders(port) : await posixHolders(port);
  if (!pids.length) return null;
  const first = { pid: pids[0], name: await processName(pids[0]) };
  for (const pid of pids) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    }
  }
  await new Promise((r) => setTimeout(r, 700));
  return first;
}
const portHolder = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  findPortHolder,
  killPortHolder,
  probePortBind
}, Symbol.toStringTag, { value: "Module" }));
function notifyEvent(titleKey, bodyKey, params, revealPath) {
  try {
    if (getSettings().systemNotifications === false) return;
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: m(titleKey), body: m(bodyKey, params) });
    if (revealPath) ;
    n.show();
  } catch (err) {
    console.warn("[notify] failed (ignored):", err.message);
  }
}
function notifyToast(_level, text) {
  if (getSettings().systemNotifications === false) return Promise.resolve(false);
  if (!Notification.isSupported()) return Promise.resolve(false);
  const body = (text || "").trim();
  if (!body) return Promise.resolve(false);
  return new Promise((resolve2) => {
    let settled = false;
    const done = (shown) => {
      if (settled) return;
      settled = true;
      resolve2(shown);
    };
    try {
      const n = new Notification({ title: m("app.title"), body });
      n.once("show", () => done(true));
      n.once("click", () => done(true));
      n.once("close", () => done(true));
      n.show();
      setTimeout(() => done(false), 1500);
    } catch (err) {
      console.warn("[notify] toast failed (ignored):", err.message);
      done(false);
    }
  });
}
let current = null;
function setContainerEndpoint(v) {
  current = v;
}
function getContainerEndpoint() {
  return current;
}
const CONTAINER_BRIDGE_ID = "dsh-container";
function containerHttpEntry() {
  const ep = getContainerEndpoint();
  if (!ep) return null;
  return { id: CONTAINER_BRIDGE_ID, url: ep.url, headers: { authorization: `Bearer ${ep.bearerToken}` } };
}
function bridgeDir() {
  return join(app$1.getPath("userData"), "mcp-bridge");
}
function bridgeCatalogFile() {
  return join(bridgeDir(), "mcp-catalog.json");
}
function bridgeConfigFile() {
  return join(bridgeDir(), "mcp-servers.json");
}
function buildCatalog(servers, tools) {
  return {
    version: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    servers: servers.filter((s) => s.spec.enabled !== false).map((s) => ({
      ...s.spec,
      status: s.status,
      tools: (s.status === "connected" ? tools : []).filter((t) => t.serverId === s.spec.id).map((t) => ({
        name: t.name,
        ...t.title ? { title: t.title } : {},
        ...t.description ? { description: t.description } : {},
        ...t.inputSchema ? { inputSchema: t.inputSchema } : {}
      }))
    }))
  };
}
function buildMcpServersJson(servers) {
  const out = {};
  for (const s of servers) {
    out[s.id] = {
      command: s.command,
      ...s.args?.length ? { args: s.args } : {},
      ...s.env && Object.keys(s.env).length ? { env: s.env } : {},
      ...s.cwd ? { cwd: s.cwd } : {}
    };
  }
  const c = containerHttpEntry();
  if (c) out[c.id] = { url: c.url, headers: c.headers };
  return { mcpServers: out };
}
const BRIDGE_BEGIN = "# >>> dsh-mcp-bridge >>> (managed by 桌面控制台 MCP hub; edit above/below, never between)";
const BRIDGE_END = "# <<< dsh-mcp-bridge <<<";
function renderCodexBlock(servers) {
  const lines = [BRIDGE_BEGIN];
  for (const s of servers) {
    lines.push(`[mcp_servers.${s.id}]`);
    lines.push(`command = ${JSON.stringify(s.command)}`);
    if (s.args?.length) {
      lines.push(`args = [${s.args.map((a) => JSON.stringify(a)).join(", ")}]`);
    }
    if (s.cwd) lines.push(`cwd = ${JSON.stringify(s.cwd)}`);
    if (s.env && Object.keys(s.env).length) {
      lines.push(`[mcp_servers.${s.id}.env]`);
      for (const [k, v] of Object.entries(s.env)) lines.push(`${k} = ${JSON.stringify(v)}`);
    }
    lines.push("");
  }
  const c = containerHttpEntry();
  if (c) {
    lines.push(`[mcp_servers.${c.id}]`);
    lines.push(`url = ${JSON.stringify(c.url)}`);
    lines.push(`[mcp_servers.${c.id}.headers]`);
    for (const [k, v] of Object.entries(c.headers)) lines.push(`${k} = ${JSON.stringify(v)}`);
    lines.push("");
  }
  lines.push(BRIDGE_END);
  return lines.join("\n");
}
function hasUserTomlTable(outside, id2) {
  return new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*${id2.replace(/-/g, "\\-")}\\s*\\]`, "m").test(outside);
}
function mergeCodexToml(existing, servers) {
  const begin = existing.indexOf(BRIDGE_BEGIN);
  const end = existing.lastIndexOf(BRIDGE_END);
  const hasBlock = begin >= 0 && end > begin;
  const head = hasBlock ? existing.slice(0, begin) : existing;
  const tail = hasBlock ? existing.slice(end + BRIDGE_END.length) : "";
  const kept = servers.filter((s) => !hasUserTomlTable(head + tail, s.id));
  if (!hasBlock && !kept.length) return existing;
  const block = renderCodexBlock(kept);
  const glue = (part) => part && !part.endsWith("\n") ? `${part}
` : part;
  return `${glue(head)}${block}
${tail.replace(/^\n/, "")}`;
}
function bridgeEnvVars() {
  return {
    DSH_MCP_BRIDGE_DIR: bridgeDir(),
    DSH_MCP_CATALOG: bridgeCatalogFile(),
    DSH_MCP_CONFIG_JSON: bridgeConfigFile()
  };
}
function detectMcpAgent(startCommand) {
  return /codex(\b|\.)/i.test(startCommand || "") ? "codex" : null;
}
function writeText(file, text) {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync$1(file, text, "utf8");
}
function exportBridgeFiles(servers, tools) {
  const catalog = buildCatalog(servers, tools);
  writeText(bridgeCatalogFile(), JSON.stringify(catalog, null, 2));
  writeText(bridgeConfigFile(), JSON.stringify(buildMcpServersJson(catalog.servers), null, 2));
}
function syncCodexConfig(servers, home) {
  const dir = home ? expandHome(home) : process.env.CODEX_HOME ? expandHome(process.env.CODEX_HOME) : join(homedir$1(), ".codex");
  const file = join(dir, "config.toml");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeText(file, mergeCodexToml(existing, servers));
  return file;
}
const OPENCLAW_MCP_PREFIX = "dsh__";
function mcpNamespaceSlug(id2) {
  return id2.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^dsh[-_]+/i, "");
}
function openclawServerKey(id2) {
  return `${OPENCLAW_MCP_PREFIX}${mcpNamespaceSlug(id2)}`;
}
function mergeOpenclawMcpConfig(cfg, servers) {
  const mcp = cfg.mcp && typeof cfg.mcp === "object" && !Array.isArray(cfg.mcp) ? cfg.mcp : {};
  const cur = mcp.servers && typeof mcp.servers === "object" && !Array.isArray(mcp.servers) ? mcp.servers : {};
  const out = {};
  for (const [k, v] of Object.entries(cur)) if (!k.startsWith(OPENCLAW_MCP_PREFIX)) out[k] = v;
  for (const s of servers) {
    out[openclawServerKey(s.id)] = {
      command: s.command,
      ...s.args?.length ? { args: s.args } : {},
      ...s.cwd ? { cwd: s.cwd } : {},
      ...s.env && Object.keys(s.env).length ? { env: s.env } : {},
      enabled: true
    };
  }
  const c = containerHttpEntry();
  if (c) out[openclawServerKey(c.id)] = { url: c.url, headers: c.headers, enabled: true };
  return { ...cfg, mcp: { ...mcp, servers: out } };
}
function syncOpenclawMcpConfig(servers, cfgPath) {
  let cfg = {};
  if (existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(cfgPath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        cfg = parsed;
      }
    } catch {
      return cfgPath;
    }
  }
  writeText(cfgPath, JSON.stringify(mergeOpenclawMcpConfig(cfg, servers), null, 2) + "\n");
  return cfgPath;
}
function dshMcpPatchFile() {
  return join(bridgeDir(), "dsh-mcp.patch.json");
}
function dshServerName(id2) {
  return `dsh_${mcpNamespaceSlug(id2)}`.slice(0, 32);
}
function renderDshMcpPatch(servers) {
  const entries2 = servers.map((s) => ({
    id: `dsh-mcp-${mcpNamespaceSlug(s.id)}`,
    name: "@deepseek-ai/dsh-mcp-client",
    config: {
      serverName: dshServerName(s.id),
      transport: "stdio",
      command: s.command,
      ...s.args?.length ? { args: s.args } : {},
      ...s.cwd ? { cwd: s.cwd } : {},
      ...s.env && Object.keys(s.env).length ? { env: s.env } : {}
    }
  }));
  const c = containerHttpEntry();
  if (c) {
    entries2.push({
      id: `dsh-mcp-${mcpNamespaceSlug(c.id)}`,
      name: "@deepseek-ai/dsh-mcp-client",
      config: { serverName: dshServerName(c.id), transport: "http", url: c.url, headers: c.headers }
    });
  }
  return entries2.length ? [{ insert: entries2 }] : [];
}
function syncDshMcpPatch(servers) {
  const entries2 = renderDshMcpPatch(servers);
  if (!entries2.length) return null;
  writeText(dshMcpPatchFile(), JSON.stringify(entries2, null, 2));
  return dshMcpPatchFile();
}
function workspaceDir() {
  return resolveWorkspaceDir();
}
function workspaceFile() {
  return join(workspaceDir(), "context.json");
}
function isSharedWorkspaceEnabled() {
  return getSettings().sharedWorkspace !== false;
}
function emptyContext() {
  return { version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), revision: 0, task: "", notes: [] };
}
function newNoteId() {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
const TASK_STATUSES = ["todo", "doing", "done"];
function normalizeTasks(raw) {
  const seen = /* @__PURE__ */ new Set();
  return (Array.isArray(raw) ? raw : []).map((t) => {
    if (!t || typeof t !== "object") return null;
    const r = t;
    const title2 = typeof r.title === "string" ? r.title : "";
    if (!title2.trim()) return null;
    const id2 = typeof r.id === "string" && r.id ? r.id : newTaskId();
    if (seen.has(id2)) return null;
    seen.add(id2);
    const deps = (Array.isArray(r.deps) ? r.deps : []).filter(
      (d) => typeof d === "string" && !!d
    );
    return {
      id: id2,
      title: title2,
      status: TASK_STATUSES.includes(r.status) ? r.status : "todo",
      ...typeof r.owner === "string" && r.owner ? { owner: r.owner } : {},
      ...deps.length ? { deps } : {},
      ...typeof r.result === "string" && r.result ? { result: r.result } : {},
      at: typeof r.at === "number" ? r.at : Date.now(),
      // #1 autopilot bookkeeping must survive every normalize, or a task would forget it was
      // already dispatched / how many tries it spent and get re-run in a loop.
      ...typeof r.dispatchedAt === "number" ? { dispatchedAt: r.dispatchedAt } : {},
      ...typeof r.attempts === "number" ? { attempts: r.attempts } : {}
    };
  }).filter((t) => t !== null);
}
function newTaskId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeContext(raw) {
  if (!raw || typeof raw !== "object") return emptyContext();
  const o = raw;
  const notes = (Array.isArray(o.notes) ? o.notes : []).map((n) => {
    if (!n || typeof n !== "object") return null;
    const r = n;
    const text = typeof r.text === "string" ? r.text : "";
    if (!text.trim()) return null;
    return {
      id: typeof r.id === "string" && r.id ? r.id : newNoteId(),
      author: typeof r.author === "string" && r.author ? r.author : "agent",
      text,
      ts: typeof r.ts === "number" ? r.ts : Date.now()
    };
  }).filter((n) => n !== null);
  return {
    version: 1,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
    revision: typeof o.revision === "number" && o.revision >= 0 ? o.revision : 0,
    ...typeof o.broadcastAt === "string" ? { broadcastAt: o.broadcastAt } : {},
    task: typeof o.task === "string" ? o.task : "",
    notes,
    // Absent stays absent so a pre-queue document round-trips unchanged on disk.
    ...Array.isArray(o.tasks) ? { tasks: normalizeTasks(o.tasks) } : {}
  };
}
const taskListeners = /* @__PURE__ */ new Set();
function onWorkspaceTasksChanged(fn) {
  taskListeners.add(fn);
  return () => taskListeners.delete(fn);
}
function notifyTasksChanged(ctx) {
  for (const fn of [...taskListeners]) {
    try {
      fn(ctx);
    } catch {
    }
  }
}
function readWorkspace() {
  try {
    const file = workspaceFile();
    if (!existsSync(file)) return emptyContext();
    return normalizeContext(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return emptyContext();
  }
}
function ensureWorkspace() {
  try {
    mkdirSync(workspaceDir(), { recursive: true });
  } catch {
  }
  const file = workspaceFile();
  if (!existsSync(file)) {
    const seed = emptyContext();
    try {
      writeFileSync$1(file, JSON.stringify(seed, null, 2), "utf8");
    } catch {
    }
    return seed;
  }
  return readWorkspace();
}
function writeWorkspace(patch) {
  const cur = ensureWorkspace();
  const nextTasks = patch.tasks !== void 0 ? normalizeTasks(patch.tasks) : cur.tasks;
  const tasksChanged = JSON.stringify(nextTasks ?? null) !== JSON.stringify(cur.tasks ?? null);
  const next2 = {
    version: 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    // A plain edit keeps the broadcast signal; broadcasts and task changes move it forward.
    revision: cur.revision + (tasksChanged ? 1 : 0),
    ...cur.broadcastAt ? { broadcastAt: cur.broadcastAt } : {},
    task: patch.task !== void 0 ? patch.task : cur.task,
    notes: patch.notes !== void 0 ? normalizeContext({ notes: patch.notes }).notes : cur.notes,
    ...nextTasks !== void 0 ? { tasks: nextTasks } : {}
  };
  try {
    writeFileSync$1(workspaceFile(), JSON.stringify(next2, null, 2), "utf8");
  } catch {
  }
  if (tasksChanged) notifyTasksChanged(next2);
  return next2;
}
function broadcastWorkspace() {
  const cur = ensureWorkspace();
  const now = /* @__PURE__ */ new Date();
  const task = cur.task.trim();
  const notes = task ? [...cur.notes, { id: newNoteId(), author: "container", text: `【广播】${task}`, ts: now.getTime() }] : cur.notes;
  const next2 = {
    version: 1,
    updatedAt: now.toISOString(),
    revision: (Number.isFinite(cur.revision) ? cur.revision : 0) + 1,
    broadcastAt: now.toISOString(),
    task: cur.task,
    notes,
    ...cur.tasks !== void 0 ? { tasks: cur.tasks } : {}
  };
  try {
    writeFileSync$1(workspaceFile(), JSON.stringify(next2, null, 2), "utf8");
  } catch {
  }
  return next2;
}
function workspaceInfo() {
  return { dir: workspaceDir(), file: workspaceFile(), context: ensureWorkspace() };
}
function workspaceEnvVars() {
  if (!isSharedWorkspaceEnabled()) return {};
  ensureWorkspace();
  return {
    DSH_WORKSPACE_DIR: workspaceDir(),
    DSH_WORKSPACE_FILE: workspaceFile()
  };
}
const BUILTIN_MCP_PKG = {
  "sequential-thinking": "@modelcontextprotocol/server-sequential-thinking",
  memory: "@modelcontextprotocol/server-memory",
  everything: "@modelcontextprotocol/server-everything",
  filesystem: "@modelcontextprotocol/server-filesystem",
  context7: "@upstash/context7-mcp",
  playwright: "@playwright/mcp",
  github: "@modelcontextprotocol/server-github",
  "brave-search": "@modelcontextprotocol/server-brave-search"
};
const MCP_PKG_GROUP = "@modelcontextprotocol/server-*";
let root = null;
function setMcpPackagesRoot(dir) {
  root = dir;
}
function mcpPackagesRoot() {
  return root;
}
function readBinPkgJson(dir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
  }
  return null;
}
function resolveMcpPkgEntry(pkgName, base = root) {
  if (!base) return null;
  const pkgDir = join(base, "node_modules", ...pkgName.split("/"));
  const meta = readBinPkgJson(pkgDir);
  if (!meta) return null;
  const short = pkgName.split("/").pop();
  let rel = null;
  if (typeof meta.bin === "string") rel = meta.bin;
  else if (meta.bin && typeof meta.bin === "object") {
    const map = meta.bin;
    const pick = map[short] ?? Object.values(map).find((v) => typeof v === "string");
    if (typeof pick === "string") rel = pick;
  }
  if (!rel) return null;
  const entry = join(pkgDir, rel.replace(/^\.\//, ""));
  return existsSync(entry) ? entry : null;
}
function mcpPkgVersion(pkgName, base = root) {
  if (!base) return void 0;
  const v = readBinPkgJson(join(base, "node_modules", ...pkgName.split("/")))?.version;
  return typeof v === "string" && v ? v : void 0;
}
function mcpPackagesStatus() {
  return Object.entries(BUILTIN_MCP_PKG).map(([id2, pkg]) => ({
    id: id2,
    pkg,
    installed: resolveMcpPkgEntry(pkg) !== null,
    version: mcpPkgVersion(pkg)
  }));
}
const WORKSPACE_SERVER_SOURCE = "#!/usr/bin/env node\r\n/**\r\n * dsh-workspace MCP server — the container's shared-context layer, exposed as MCP tools.\r\n *\r\n * Why this exists: the container hands every hosted agent a pointer to one shared document\r\n * (DSH_WORKSPACE_FILE) via env, but a bare path is only useful to an agent that happens to be\r\n * written to read it. Registering this server in the bridge (mcp-servers.json / codex\r\n * config.toml) means any MCP-speaking agent can `workspace_read` the current task + shared\r\n * memory and `workspace_append` a finding back into it — a real read/write channel, not just a\r\n * path. The agent spawns its own copy of this process (stdio), exactly like it does for the\r\n * curated npm servers; the container never proxies the calls.\r\n *\r\n * Dependency-free on purpose: it runs under the bundled node.exe from userData, where app.asar\r\n * — and therefore @modelcontextprotocol/sdk — is not readable. The only external piece is the\r\n * MCP stdio wire format: newline-delimited JSON-RPC 2.0. It reads/writes the same context.json\r\n * the container's UI edits, tolerating anything a hand-edit or a peer agent may have written.\r\n */\r\nimport { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'\r\nimport { dirname } from 'node:path'\r\nimport readline from 'node:readline'\r\n\r\n/** Absolute path to the shared context.json, injected by the bridge spec's env. */\r\nconst FILE = process.env.DSH_WORKSPACE_FILE || ''\r\n/** Fallback when the client does not negotiate a version; clients accept an equal/older one. */\r\nconst PROTOCOL = '2024-11-05'\r\n\r\nfunction emptyDoc() {\r\n  return { version: 1, updatedAt: new Date().toISOString(), revision: 0, task: '', notes: [] }\r\n}\r\n\r\nfunction newId() {\r\n  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)\r\n}\r\n\r\nfunction newTaskId() {\r\n  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)\r\n}\r\n\r\nconst TASK_STATUSES = ['todo', 'doing', 'done']\r\n\r\n/** Coerce unknown JSON into a trustworthy task queue (mirrors the container's normalizeTasks). */\r\nfunction normalizeTasks(raw) {\r\n  const seen = new Set()\r\n  return (Array.isArray(raw) ? raw : [])\r\n    .map((t) => {\r\n      if (!t || typeof t !== 'object') return null\r\n      const title = typeof t.title === 'string' ? t.title : ''\r\n      if (!title.trim()) return null\r\n      const id = typeof t.id === 'string' && t.id ? t.id : newTaskId()\r\n      if (seen.has(id)) return null\r\n      seen.add(id)\r\n      const deps = (Array.isArray(t.deps) ? t.deps : []).filter((d) => typeof d === 'string' && d)\r\n      return {\r\n        id,\r\n        title,\r\n        status: TASK_STATUSES.includes(t.status) ? t.status : 'todo',\r\n        ...(typeof t.owner === 'string' && t.owner ? { owner: t.owner } : {}),\r\n        ...(deps.length ? { deps } : {}),\r\n        ...(typeof t.result === 'string' && t.result ? { result: t.result } : {}),\r\n        at: typeof t.at === 'number' ? t.at : Date.now()\r\n      }\r\n    })\r\n    .filter(Boolean)\r\n}\r\n\r\n/** Coerce unknown JSON into a trustworthy doc without ever throwing (mirrors the container). */\r\nfunction normalize(raw) {\r\n  if (!raw || typeof raw !== 'object') return emptyDoc()\r\n  const notes = (Array.isArray(raw.notes) ? raw.notes : [])\r\n    .map((n) => {\r\n      if (!n || typeof n !== 'object') return null\r\n      const text = typeof n.text === 'string' ? n.text : ''\r\n      if (!text.trim()) return null\r\n      return {\r\n        id: typeof n.id === 'string' && n.id ? n.id : newId(),\r\n        author: typeof n.author === 'string' && n.author ? n.author : 'agent',\r\n        text,\r\n        ts: typeof n.ts === 'number' ? n.ts : Date.now()\r\n      }\r\n    })\r\n    .filter(Boolean)\r\n  return {\r\n    version: 1,\r\n    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),\r\n    revision: typeof raw.revision === 'number' && raw.revision >= 0 ? raw.revision : 0,\r\n    ...(typeof raw.broadcastAt === 'string' ? { broadcastAt: raw.broadcastAt } : {}),\r\n    task: typeof raw.task === 'string' ? raw.task : '',\r\n    notes,\r\n    // Absent stays absent so a pre-queue document round-trips unchanged on disk.\r\n    ...(Array.isArray(raw.tasks) ? { tasks: normalizeTasks(raw.tasks) } : {})\r\n  }\r\n}\r\n\r\nfunction readDoc() {\r\n  try {\r\n    if (!FILE || !existsSync(FILE)) return emptyDoc()\r\n    return normalize(JSON.parse(readFileSync(FILE, 'utf8')))\r\n  } catch {\r\n    return emptyDoc()\r\n  }\r\n}\r\n\r\n/** Best-effort write: a read-only root surfaces through the tool result, never kills the child. */\r\nfunction writeDoc(doc) {\r\n  if (!FILE) return false\r\n  try {\r\n    mkdirSync(dirname(FILE), { recursive: true })\r\n    writeFileSync(FILE, JSON.stringify(doc, null, 2), 'utf8')\r\n    return true\r\n  } catch {\r\n    return false\r\n  }\r\n}\r\n\r\nconst TOOLS = [\r\n  {\r\n    name: 'workspace_read',\r\n    description:\r\n      'Read the container-owned shared context: the current task, the append-only shared-memory log (notes), and the broadcast revision. Call this to load cross-agent context.',\r\n    inputSchema: { type: 'object', properties: {}, additionalProperties: false }\r\n  },\r\n  {\r\n    name: 'workspace_append',\r\n    description:\r\n      'Append one entry to the shared-memory log so other hosted agents can see it. Use for findings or decisions worth sharing across agents.',\r\n    inputSchema: {\r\n      type: 'object',\r\n      properties: {\r\n        text: { type: 'string', description: 'The note to share (non-empty).' },\r\n        author: { type: 'string', description: 'Who is writing (defaults to your agent name).' }\r\n      },\r\n      required: ['text'],\r\n      additionalProperties: false\r\n    }\r\n  },\r\n  {\r\n    name: 'workspace_set_task',\r\n    description: 'Set the single current shared task/goal that all hosted agents work toward.',\r\n    inputSchema: {\r\n      type: 'object',\r\n      properties: { task: { type: 'string', description: 'The current task text.' } },\r\n      required: ['task'],\r\n      additionalProperties: false\r\n    }\r\n  },\r\n  {\r\n    name: 'workspace_submit',\r\n    description:\r\n      'Submit a new task into the shared task queue (todo column). Other agents can then claim it. Use for decomposed work items, not the overall goal (that is workspace_set_task).',\r\n    inputSchema: {\r\n      type: 'object',\r\n      properties: {\r\n        title: { type: 'string', description: 'One-line task title (non-empty).' },\r\n        deps: {\r\n          type: 'array',\r\n          items: { type: 'string' },\r\n          description: 'Ids of tasks this one waits on (advisory, optional).'\r\n        }\r\n      },\r\n      required: ['title'],\r\n      additionalProperties: false\r\n    }\r\n  },\r\n  {\r\n    name: 'workspace_claim',\r\n    description:\r\n      'Claim a queued task for yourself: sets the owner and moves it to doing. Fails if it is already claimed or done.',\r\n    inputSchema: {\r\n      type: 'object',\r\n      properties: {\r\n        taskId: { type: 'string', description: 'The task id returned by workspace_submit/read.' },\r\n        owner: { type: 'string', description: 'Your agent name (non-empty).' }\r\n      },\r\n      required: ['taskId', 'owner'],\r\n      additionalProperties: false\r\n    }\r\n  },\r\n  {\r\n    name: 'workspace_complete',\r\n    description:\r\n      'Mark a claimed task as done and optionally record its outcome. The result is mirrored into the shared-memory notes so every agent sees the outcome.',\r\n    inputSchema: {\r\n      type: 'object',\r\n      properties: {\r\n        taskId: { type: 'string', description: 'The task id to close.' },\r\n        result: { type: 'string', description: 'Outcome summary (optional but recommended).' }\r\n      },\r\n      required: ['taskId'],\r\n      additionalProperties: false\r\n    }\r\n  }\r\n]\r\n\r\nfunction textResult(text) {\r\n  return { content: [{ type: 'text', text: String(text) }], isError: false }\r\n}\r\nfunction errorResult(text) {\r\n  return { content: [{ type: 'text', text: String(text) }], isError: true }\r\n}\r\n\r\n/**\r\n * Any task-queue mutation bumps `revision`: a polling agent diffs the counter, sees the move,\r\n * and re-reads the queue. Notes stay untouched except workspace_complete's explicit mirror.\r\n */\r\nfunction saveTasks(doc, tasks, note) {\r\n  doc.tasks = tasks\r\n  doc.revision = (typeof doc.revision === 'number' ? doc.revision : 0) + 1\r\n  doc.updatedAt = new Date().toISOString()\r\n  if (note) doc.notes.push({ id: newId(), ...note, ts: Date.now() })\r\n  return writeDoc(doc)\r\n    ? textResult(JSON.stringify({ ok: true, revision: doc.revision, tasks: doc.tasks }, null, 2))\r\n    : errorResult('Failed to write the shared context (read-only path?).')\r\n}\r\n\r\nfunction callTool(name, args) {\r\n  const a = args && typeof args === 'object' ? args : {}\r\n  if (name === 'workspace_read') return textResult(JSON.stringify(readDoc(), null, 2))\r\n  if (name === 'workspace_append') {\r\n    const text = typeof a.text === 'string' ? a.text.trim() : ''\r\n    if (!text) return errorResult('workspace_append needs a non-empty \"text\".')\r\n    const doc = readDoc()\r\n    doc.notes.push({\r\n      id: newId(),\r\n      author: (typeof a.author === 'string' && a.author.trim()) || 'agent',\r\n      text,\r\n      ts: Date.now()\r\n    })\r\n    doc.updatedAt = new Date().toISOString()\r\n    if (!writeDoc(doc)) return errorResult('Failed to write the shared context (read-only path?).')\r\n    return textResult(\r\n      'Appended shared-memory note; the context now has ' + doc.notes.length + ' note(s).'\r\n    )\r\n  }\r\n  if (name === 'workspace_set_task') {\r\n    const doc = readDoc()\r\n    doc.task = typeof a.task === 'string' ? a.task : ''\r\n    doc.updatedAt = new Date().toISOString()\r\n    if (!writeDoc(doc)) return errorResult('Failed to write the shared context (read-only path?).')\r\n    return textResult('Current shared task set.')\r\n  }\r\n  if (name === 'workspace_submit') {\r\n    const title = typeof a.title === 'string' ? a.title.trim() : ''\r\n    if (!title) return errorResult('workspace_submit needs a non-empty \"title\".')\r\n    const doc = readDoc()\r\n    const tasks = normalizeTasks(doc.tasks)\r\n    const deps = (Array.isArray(a.deps) ? a.deps : [])\r\n      .filter((d) => typeof d === 'string' && d.trim())\r\n      .map((d) => d.trim())\r\n    tasks.push({\r\n      id: newTaskId(),\r\n      title,\r\n      status: 'todo',\r\n      ...(deps.length ? { deps } : {}),\r\n      at: Date.now()\r\n    })\r\n    return saveTasks(doc, tasks)\r\n  }\r\n  if (name === 'workspace_claim') {\r\n    const owner = typeof a.owner === 'string' ? a.owner.trim() : ''\r\n    if (!owner) return errorResult('workspace_claim needs a non-empty \"owner\".')\r\n    const doc = readDoc()\r\n    const tasks = normalizeTasks(doc.tasks)\r\n    const t = tasks.find((x) => x.id === a.taskId)\r\n    if (!t) return errorResult('No such task: ' + String(a.taskId) + ' (see workspace_read).')\r\n    if (t.status === 'done') return errorResult(`Task ${t.id} is already done.`)\r\n    if (t.status === 'doing' && t.owner && t.owner !== owner)\r\n      return errorResult(`Task ${t.id} is already claimed by ${t.owner}.`)\r\n    t.status = 'doing'\r\n    t.owner = owner\r\n    t.at = Date.now()\r\n    return saveTasks(doc, tasks)\r\n  }\r\n  if (name === 'workspace_complete') {\r\n    const doc = readDoc()\r\n    const tasks = normalizeTasks(doc.tasks)\r\n    const t = tasks.find((x) => x.id === a.taskId)\r\n    if (!t) return errorResult('No such task: ' + String(a.taskId) + ' (see workspace_read).')\r\n    if (t.status === 'done') return errorResult(`Task ${t.id} is already done.`)\r\n    t.status = 'done'\r\n    const result = typeof a.result === 'string' ? a.result.trim() : ''\r\n    if (result) t.result = result\r\n    t.at = Date.now()\r\n    // Mirror the outcome into the shared memory — the plan's \"done ⇒ visible to everyone\".\r\n    const note = {\r\n      author: t.owner || 'agent',\r\n      text: `【任务完成】${t.title}${result ? ' — ' + result : ''}`\r\n    }\r\n    return saveTasks(doc, tasks, note)\r\n  }\r\n  return errorResult('Unknown tool: ' + name)\r\n}\r\n\r\nfunction send(msg) {\r\n  process.stdout.write(JSON.stringify(msg) + '\\n')\r\n}\r\nfunction reply(id, result) {\r\n  send({ jsonrpc: '2.0', id, result })\r\n}\r\nfunction replyError(id, code, message) {\r\n  send({ jsonrpc: '2.0', id, error: { code, message } })\r\n}\r\n\r\nfunction handle(msg) {\r\n  if (!msg || typeof msg !== 'object') return\r\n  const id = msg.id\r\n  const method = msg.method\r\n  const params = msg.params\r\n  const isRequest = id !== undefined && id !== null\r\n  switch (method) {\r\n    case 'initialize': {\r\n      const clientProto = params && params.protocolVersion\r\n      reply(id, {\r\n        // Echo the client's requested version when present so older/newer clients both handshake.\r\n        protocolVersion: typeof clientProto === 'string' ? clientProto : PROTOCOL,\r\n        capabilities: { tools: {} },\r\n        serverInfo: { name: 'dsh-workspace', version: '1.0.0' }\r\n      })\r\n      return\r\n    }\r\n    case 'ping':\r\n      if (isRequest) reply(id, {})\r\n      return\r\n    case 'notifications/initialized':\r\n    case 'initialized':\r\n    case 'notifications/cancelled':\r\n      return // notifications: no response\r\n    case 'tools/list':\r\n      reply(id, { tools: TOOLS })\r\n      return\r\n    case 'tools/call': {\r\n      const p = params || {}\r\n      reply(id, callTool(p.name, p.arguments))\r\n      return\r\n    }\r\n    // Declare only `tools`, but answer these cheaply in case a client probes them anyway.\r\n    case 'resources/list':\r\n      reply(id, { resources: [] })\r\n      return\r\n    case 'prompts/list':\r\n      reply(id, { prompts: [] })\r\n      return\r\n    default:\r\n      if (isRequest) replyError(id, -32601, 'Method not found: ' + method)\r\n  }\r\n}\r\n\r\nconst rl = readline.createInterface({ input: process.stdin, terminal: false })\r\nrl.on('line', (line) => {\r\n  const s = line.trim()\r\n  if (!s) return\r\n  let msg\r\n  try {\r\n    msg = JSON.parse(s)\r\n  } catch {\r\n    return // a non-JSON line is not a protocol message; ignore rather than crash\r\n  }\r\n  try {\r\n    handle(msg)\r\n  } catch (err) {\r\n    if (msg && msg.id !== undefined) replyError(msg.id, -32603, String((err && err.message) || err))\r\n  }\r\n})\r\nrl.on('close', () => process.exit(0))\r\n";
const WORKSPACE_MCP_ID = "dsh-workspace";
function workspaceServerFile() {
  return join(bridgeDir(), "workspace-server.mjs");
}
let writtenSource = "";
function ensureWorkspaceServerScript() {
  const file = workspaceServerFile();
  if (writtenSource !== WORKSPACE_SERVER_SOURCE || !existsSync(file)) {
    try {
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync$1(file, WORKSPACE_SERVER_SOURCE, "utf8");
      writtenSource = WORKSPACE_SERVER_SOURCE;
    } catch {
    }
  }
  return file;
}
function workspaceMcpSpec() {
  if (!isSharedWorkspaceEnabled()) return null;
  const script = ensureWorkspaceServerScript();
  let command = "node";
  try {
    command = getNodeExePath();
  } catch {
  }
  return {
    id: WORKSPACE_MCP_ID,
    name: m("mcp.builtin.dsh-workspace.name"),
    command,
    args: [script],
    env: { DSH_WORKSPACE_FILE: workspaceFile(), DSH_WORKSPACE_DIR: workspaceDir() },
    enabled: true,
    autoStart: true,
    builtin: true
  };
}
const CONNECT_TIMEOUT_MS = 3e4;
const MCP_CALL_TOOL_TIMEOUT_MS = 6e4;
let store = null;
function mcpStore() {
  if (!store) {
    store = new ElectronStore({
      name: "mcp-servers",
      defaults: { servers: [], dismissed: [] }
    });
  }
  return store;
}
function isValidMcpId(id2) {
  return /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(id2);
}
function sanitizeMcpSpec(raw) {
  const errors2 = [];
  const r = raw ?? {};
  const id2 = typeof r.id === "string" ? r.id.trim() : "";
  if (!id2) errors2.push(m("mcp.errNoId"));
  else if (!isValidMcpId(id2)) errors2.push(m("mcp.errBadId", { id: id2 }));
  const command = typeof r.command === "string" ? r.command.trim() : "";
  if (!command) errors2.push(m("mcp.errNoCommand"));
  const args = Array.isArray(r.args) ? r.args.filter((a) => typeof a === "string") : [];
  const env2 = {};
  if (r.env && typeof r.env === "object" && !Array.isArray(r.env)) {
    for (const [k, v] of Object.entries(r.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
        errors2.push(m("mcp.errBadEnvKey", { key: k }));
        continue;
      }
      if (v !== void 0 && v !== null) env2[k] = String(v);
    }
  }
  if (r.cwd !== void 0 && typeof r.cwd !== "string") errors2.push(m("mcp.errBadCwd"));
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : id2;
  if (errors2.length) return { errors: errors2 };
  return {
    spec: {
      id: id2,
      name,
      command,
      args,
      env: Object.keys(env2).length ? env2 : void 0,
      cwd: typeof r.cwd === "string" && r.cwd.trim() ? r.cwd.trim() : void 0,
      enabled: r.enabled !== false,
      autoStart: r.autoStart === true
    },
    errors: []
  };
}
function flattenToolContent(content) {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content.map((block) => {
    if (block && typeof block === "object" && block.type === "text") {
      return String(block.text ?? "");
    }
    return JSON.stringify(block);
  }).join("\n");
}
const entries = /* @__PURE__ */ new Map();
const connecting = /* @__PURE__ */ new Map();
let shuttingDown = false;
const hubEvents = new EventEmitter();
const CALL_BUFFER_CAP = 200;
const callEvents = [];
function recordCall(evt) {
  callEvents.push(evt);
  if (callEvents.length > CALL_BUFFER_CAP) callEvents.shift();
  hubEvents.emit("calls", getCalls());
}
function getCalls() {
  return [...callEvents];
}
function snapshot() {
  return [...entries.values()].map((e) => ({
    spec: e.spec,
    status: e.status,
    serverInfo: e.serverInfo,
    toolCount: e.tools.length,
    lastError: e.lastError
  }));
}
function emitChanged() {
  hubEvents.emit("changed", snapshot());
  scheduleBridgeExport();
}
const BRIDGE_DEBOUNCE_MS = 400;
let bridgeTimer = null;
function scheduleBridgeExport() {
  if (bridgeTimer) clearTimeout(bridgeTimer);
  bridgeTimer = setTimeout(() => {
    bridgeTimer = null;
    try {
      exportBridgeFiles(effectiveServers(), listTools());
    } catch (err) {
      console.warn("[mcp-hub] bridge export failed:", err.message);
    }
  }, BRIDGE_DEBOUNCE_MS);
}
function refreshBridge() {
  scheduleBridgeExport();
}
function loadSpecs() {
  const raw = mcpStore().get("servers");
  return Array.isArray(raw) ? raw : [];
}
function persistSpecs(list) {
  mcpStore().set("servers", list.filter((s) => !isCodeOwnedId(s.id)));
}
const LOCKED_MCP_DEFS = [{ id: "filesystem", autoStart: true }];
const SEED_MCP_DEFS = [
  { id: "sequential-thinking" },
  { id: "memory" },
  { id: "everything" },
  { id: "context7" },
  { id: "playwright" },
  { id: "github", enabled: false },
  { id: "brave-search", enabled: false }
];
const LOCKED_MCP_IDS = new Set(LOCKED_MCP_DEFS.map((d) => d.id));
const SEED_MCP_IDS = new Set(SEED_MCP_DEFS.map((d) => d.id));
const CURATED_MCP_IDS = /* @__PURE__ */ new Set([...LOCKED_MCP_IDS, ...SEED_MCP_IDS]);
const hasDirArg = (id2) => id2 === "filesystem";
function curatedSpec(def) {
  const pkg = BUILTIN_MCP_PKG[def.id];
  return {
    id: def.id,
    name: m(`mcp.builtin.${def.id}.name`),
    command: "npx",
    args: hasDirArg(def.id) ? ["-y", pkg, resolveDownloadDir()] : ["-y", pkg],
    enabled: def.enabled ?? true,
    autoStart: def.autoStart === true,
    builtin: LOCKED_MCP_IDS.has(def.id)
  };
}
function lockedMcpSpecs() {
  return LOCKED_MCP_DEFS.map(curatedSpec);
}
function isCodeOwnedId(id2) {
  return LOCKED_MCP_IDS.has(id2) || id2 === WORKSPACE_MCP_ID;
}
function codeOwnedSpecs() {
  const ws = workspaceMcpSpec();
  return ws ? [...lockedMcpSpecs(), ws] : lockedMcpSpecs();
}
function isDefaultCurated(spec) {
  const pkg = BUILTIN_MCP_PKG[spec.id];
  return !!pkg && spec.command === "npx" && (spec.args ?? []).includes(pkg);
}
function effectiveSpawn(spec) {
  const pkg = BUILTIN_MCP_PKG[spec.id];
  const entry = pkg && isDefaultCurated(spec) ? resolveMcpPkgEntry(pkg) : null;
  if (entry && pkg) {
    const positional = (spec.args ?? []).filter((a) => a !== "-y" && a !== pkg);
    return { command: getNodeExePath(), args: [entry, ...positional] };
  }
  return { command: spec.command, args: spec.args ?? [] };
}
function effectiveServers() {
  return listServers().map((s) => {
    const eff = effectiveSpawn(s.spec);
    return { ...s, spec: { ...s.spec, command: eff.command, args: eff.args } };
  });
}
function loadDismissed() {
  const raw = mcpStore().get("dismissed");
  return Array.isArray(raw) ? raw : [];
}
function dismissSeed(id2) {
  const set = new Set(loadDismissed());
  set.add(id2);
  mcpStore().set("dismissed", [...set]);
}
function ensureSeeded() {
  const specs = loadSpecs();
  const present = new Set(specs.map((s) => s.id));
  const dismissed = new Set(loadDismissed());
  let changed = false;
  for (const def of SEED_MCP_DEFS) {
    if (present.has(def.id) || dismissed.has(def.id)) continue;
    specs.push(curatedSpec(def));
    present.add(def.id);
    changed = true;
  }
  if (changed) persistSpecs(specs);
}
function reconcile() {
  ensureSeeded();
  const specs = [
    ...codeOwnedSpecs(),
    ...loadSpecs().filter((s) => !isCodeOwnedId(s.id))
  ];
  const alive = new Set(specs.map((s) => s.id));
  for (const id2 of [...entries.keys()]) {
    if (!alive.has(id2)) {
      void disconnect(id2).catch(() => void 0);
      entries.delete(id2);
    }
  }
  for (const spec of specs) {
    const existing = entries.get(spec.id);
    if (existing) existing.spec = spec;
    else entries.set(spec.id, { spec, status: "stopped", tools: [] });
  }
}
function listServers() {
  reconcile();
  return snapshot();
}
function refreshBuiltinPackages() {
  reconcile();
  emitChanged();
}
async function saveServer(raw) {
  const { spec, errors: errors2 } = sanitizeMcpSpec(raw);
  if (!spec) throw new Error(errors2.join("; "));
  if (isCodeOwnedId(spec.id)) throw new Error(m("mcp.errBuiltinEdit"));
  const specs = loadSpecs();
  const idx = specs.findIndex((s) => s.id === spec.id);
  if (idx >= 0) specs[idx] = spec;
  else specs.push(spec);
  persistSpecs(specs);
  reconcile();
  const entry = entries.get(spec.id);
  if (entry && entry.status === "connected") {
    await disconnect(spec.id).catch(() => void 0);
    void connect(spec.id).catch(() => void 0);
  }
  return snapshot();
}
async function removeServer(id2) {
  if (isCodeOwnedId(id2)) throw new Error(m("mcp.errBuiltinRemove"));
  await disconnect(id2).catch(() => void 0);
  entries.delete(id2);
  persistSpecs(loadSpecs().filter((s) => s.id !== id2));
  if (SEED_MCP_IDS.has(id2)) dismissSeed(id2);
  emitChanged();
  return snapshot();
}
function connect(id2) {
  const inflight = connecting.get(id2);
  if (inflight) return inflight;
  const run = doConnect(id2).finally(() => connecting.delete(id2));
  connecting.set(id2, run);
  return run;
}
async function doConnect(id2) {
  const e = entries.get(id2) ?? reconcileAndFind(id2);
  if (!e) throw new Error(m("mcp.errUnknown", { id: id2 }));
  if (e.spec.enabled === false) throw new Error(m("mcp.errDisabled", { id: id2 }));
  if (e.status === "connected") return;
  if (e.status === "connecting") return connecting.get(id2) ?? Promise.resolve();
  e.status = "connecting";
  e.lastError = void 0;
  emitChanged();
  const startedAt = Date.now();
  try {
    const spawn2 = effectiveSpawn(e.spec);
    const transport = new StdioClientTransport({
      command: spawn2.command,
      args: spawn2.args,
      cwd: e.spec.cwd,
      env: { ...getDefaultEnvironment(), ...e.spec.env ?? {} }
    });
    const client = new Client(
      { name: "dsh-desktop-container", version: "1.0.0" },
      { capabilities: {} }
      // hub is a pure client: it offers no server-side capabilities back
    );
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, m("mcp.errHandshakeTimeout"));
    const listed = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, m("mcp.errListToolsTimeout"));
    e.client = client;
    e.transport = transport;
    const meta = client.getServerVersion?.();
    if (meta?.name) e.serverInfo = { name: meta.name, version: meta.version };
    e.tools = (listed?.tools ?? []).map((t) => ({
      serverId: id2,
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema
    }));
    e.status = "connected";
    transport.onclose = () => {
      if (e.status === "connected" && !shuttingDown) {
        e.status = "error";
        e.lastError = m("mcp.errClosed");
        e.tools = [];
        emitChanged();
        logEvent({ level: "warn", kind: "mcp.lost", pageId: id2 });
      }
    };
    logEvent({
      level: "info",
      kind: "mcp.connected",
      pageId: id2,
      meta: { tools: e.tools.length, ms: Date.now() - startedAt }
    });
  } catch (err) {
    e.status = "error";
    e.lastError = isDefaultCurated(e.spec) && !resolveMcpPkgEntry(BUILTIN_MCP_PKG[e.spec.id]) ? m("mcp.errPkgMissing", { name: e.spec.name }) : err.message;
    e.tools = [];
    logEvent({ level: "error", kind: "mcp.failed", pageId: id2, detail: e.lastError });
    throw err;
  } finally {
    emitChanged();
  }
}
function reconcileAndFind(id2) {
  reconcile();
  return entries.get(id2);
}
async function disconnect(id2) {
  const e = entries.get(id2);
  if (!e) return;
  const client = e.client;
  e.client = void 0;
  e.transport = void 0;
  e.tools = [];
  e.serverInfo = void 0;
  try {
    await withTimeout(client?.close() ?? Promise.resolve(), 5e3, "close timeout");
  } catch {
  }
  if (e.status !== "error") e.status = "stopped";
  e.lastError = void 0;
  emitChanged();
}
function listTools(serverId) {
  const all = [...entries.values()].flatMap((e) => e.tools);
  return serverId ? all.filter((t) => t.serverId === serverId) : all;
}
async function callTool(args) {
  const startedAt = Date.now();
  const finish = (r) => {
    recordCall({
      serverId: args.serverId,
      tool: args.tool,
      ms: r.durationMs,
      ok: r.ok,
      ...r.error ? { err: r.error } : {},
      at: Date.now()
    });
    return r;
  };
  const e = entries.get(args.serverId);
  if (!e)
    return finish({ ok: false, text: "", isError: true, error: m("mcp.errUnknown", { id: args.serverId }), durationMs: 0 });
  if (!e.client || e.status !== "connected") {
    return finish({ ok: false, text: "", isError: true, error: m("mcp.errNotConnected", { id: e.spec.id }), durationMs: 0 });
  }
  try {
    const res = await withTimeout(
      e.client.callTool(
        { name: args.tool, arguments: args.arguments ?? {} },
        void 0,
        { timeout: args.timeoutMs ?? MCP_CALL_TOOL_TIMEOUT_MS }
      ),
      (args.timeoutMs ?? MCP_CALL_TOOL_TIMEOUT_MS) + 2e3,
      // SDK's own timeout should fire first; this is the safety net
      m("mcp.errCallTimeout")
    );
    const text = flattenToolContent(res.content);
    const isError = Boolean(res.isError);
    return finish({ ok: !isError, text, isError, durationMs: Date.now() - startedAt });
  } catch (err) {
    return finish({ ok: false, text: "", isError: true, error: err.message, durationMs: Date.now() - startedAt });
  }
}
async function autoStartAll() {
  reconcile();
  const wanted = [...entries.values()].filter(
    (e) => e.spec.enabled !== false && e.spec.autoStart === true && e.status === "stopped"
  );
  await Promise.allSettled(
    wanted.map(
      (e) => connect(e.spec.id).catch((err) => {
        console.warn(`[mcp-hub] auto-start ${e.spec.id} failed:`, err.message);
      })
    )
  );
}
async function shutdownAll() {
  shuttingDown = true;
  if (bridgeTimer) {
    clearTimeout(bridgeTimer);
    bridgeTimer = null;
  }
  try {
    exportBridgeFiles(listServers(), listTools());
  } catch {
  }
  await Promise.allSettled([...entries.keys()].map((id2) => disconnect(id2)));
}
function withTimeout(p, ms, message) {
  return new Promise((resolve2, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve2(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
const mcpHub = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  CURATED_MCP_IDS,
  LOCKED_MCP_IDS,
  MCP_CALL_TOOL_TIMEOUT_MS,
  SEED_MCP_IDS,
  autoStartAll,
  callTool,
  connect,
  disconnect,
  flattenToolContent,
  getCalls,
  hubEvents,
  isValidMcpId,
  listServers,
  listTools,
  lockedMcpSpecs,
  refreshBridge,
  refreshBuiltinPackages,
  removeServer,
  sanitizeMcpSpec,
  saveServer,
  shutdownAll
}, Symbol.toStringTag, { value: "Module" }));
const BUILTIN_PAGE_IDS = /* @__PURE__ */ new Set(["dsh-web", "openclaw"]);
function defaultStartCommand(dir) {
  if (existsSync(join(dir, "server.js"))) return "node server.js";
  if (existsSync(join(dir, "index.js"))) return "node index.js";
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    if (pkg.scripts?.start) return "npm run start";
  } catch {
  }
  throw new Error(m("page.noEntryCommand"));
}
function startCommandInferable(dir) {
  return existsSync(join(dir, "server.js")) || existsSync(join(dir, "index.js")) || existsSync(join(dir, "package.json"));
}
function resolvePageDeps(id2, declared) {
  const override = getSettings().pageDeps?.[id2];
  const source = Array.isArray(override) ? override : Array.isArray(declared) ? declared : null;
  if (!source) return void 0;
  const cleaned = source.filter((d) => typeof d === "string" && Boolean(d.trim()) && d.trim() !== id2).map((d) => d.trim());
  return cleaned.length ? cleaned : void 0;
}
const MANIFEST_KEYS = /* @__PURE__ */ new Set([
  "$schema",
  "name",
  "description",
  "port",
  "startCommand",
  "external",
  "externalUrl",
  "kind",
  "dsh",
  "openclaw",
  "manageAsApp",
  "dependsOn",
  "healthUrl",
  "envVars",
  "schemaVersion",
  "author",
  "version",
  "icon",
  "permissions",
  "npmPackage",
  "capabilityDir"
]);
const MANIFEST_PERMISSIONS = /* @__PURE__ */ new Set(["notify", "downloads", "externalShell"]);
function manifestWarnings(raw) {
  const out = [];
  for (const key of Object.keys(raw ?? {})) {
    if (!MANIFEST_KEYS.has(key)) out.push(m("page.warnUnknownKey", { key }));
  }
  if (raw.port !== void 0 && typeof raw.port !== "number") {
    out.push(m("page.warnBadType", { key: "port", want: "number" }));
  }
  if (raw.icon !== void 0 && typeof raw.icon !== "string") {
    out.push(m("page.warnBadType", { key: "icon", want: "string" }));
  }
  if (raw.permissions !== void 0 && !Array.isArray(raw.permissions)) {
    out.push(m("page.warnBadType", { key: "permissions", want: "string[]" }));
  } else {
    for (const p of raw.permissions ?? []) {
      if (typeof p !== "string" || !MANIFEST_PERMISSIONS.has(p)) {
        out.push(m("page.warnUnknownPermission", { key: String(p) }));
      }
    }
  }
  if (Array.isArray(raw.envVars)) {
    for (const v of raw.envVars) {
      if (v?.type && v.type !== "dir" && v.type !== "text") {
        out.push(m("page.warnBadType", { key: `envVars[${v.key}].type`, want: "dir | text" }));
      }
    }
  }
  return out;
}
const ICON_MIME = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};
const ICON_MAX_BYTES = 64 * 1024;
function resolveIconUrl(dir, icon2, warnings) {
  const value = typeof icon2 === "string" ? icon2.trim() : "";
  if (!value) return void 0;
  if (value.startsWith("data:")) {
    if (value.length > ICON_MAX_BYTES * 2) {
      warnings.push(m("page.warnIconBig", { size: Math.round(value.length / 1024) }));
      return void 0;
    }
    return value;
  }
  const ext = value.toLowerCase().match(/\.[a-z]+$/)?.[0] || "";
  const mime = ICON_MIME[ext];
  if (!mime || value.includes("..") || /^[a-zA-Z]:[\\/]|^[\\/]/.test(value)) {
    warnings.push(m("page.warnIconPath", { path: value }));
    return void 0;
  }
  try {
    const buf = readFileSync(join(dir, value));
    if (buf.byteLength > ICON_MAX_BYTES) {
      warnings.push(m("page.warnIconBig", { size: Math.round(buf.byteLength / 1024) }));
      return void 0;
    }
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    warnings.push(m("page.warnIconMissing", { path: value }));
    return void 0;
  }
}
const PAGE_DIR_ENV_KEY = "APP_DIR";
function readPageMeta(pagesDir, id2) {
  const dir = join(pagesDir, id2);
  let raw = {};
  const metaFile = join(dir, "container.json");
  if (existsSync(metaFile)) {
    try {
      raw = JSON.parse(readFileSync(metaFile, "utf-8"));
    } catch (err) {
      throw new Error(m("page.metaParseFail", { err: err.message }));
    }
  }
  const kind = raw.kind === "dsh" ? "dsh" : raw.kind === "openclaw" ? "openclaw" : raw.kind === "terminal" ? "terminal" : "page";
  const external = Boolean(raw.external);
  const override = getSettings().pagePorts?.[id2];
  let port = Number(raw.port ?? 0) || (isValidPort(override) ? Number(override) : 0);
  let startCommand = raw.startCommand || "";
  if (kind === "dsh") {
    port = Number(raw.dsh?.port ?? raw.port ?? 5173);
    startCommand = `dsh --profile ${raw.dsh?.profile || "web"}`;
  } else if (kind === "openclaw") {
    port = Number(raw.openclaw?.port ?? raw.port ?? OPENCLAW_DEFAULT_PORT);
    startCommand = `openclaw gateway run --force --allow-unconfigured --port ${port}`;
  } else if (kind === "terminal") {
    if (!startCommand) throw new Error(m("page.metaNoStart"));
  } else if (!external && !port && !startCommand) {
    if (startCommandInferable(dir)) startCommand = defaultStartCommand(dir);
    else throw new Error(m("page.metaNoPort"));
  }
  if (kind === "page" && !external && !startCommand) startCommand = defaultStartCommand(dir);
  const declared = Array.isArray(raw.envVars) ? raw.envVars : [];
  const warnings = manifestWarnings(raw);
  const declaredSpecs = declared.filter((v) => Boolean(v?.key)).map((v) => {
    const { label, description: description2, type: type2, ...rest } = v;
    return {
      ...rest,
      label: resolveText(label) || void 0,
      description: resolveText(description2) || void 0,
      // Only the two known editor kinds survive (anything else was already warned about),
      // so the panel never renders an input for a type it doesn't implement.
      ...type2 === "text" ? { type: "text" } : type2 === "dir" ? { type: "dir" } : {}
    };
  });
  let envVars = declaredSpecs.length ? declaredSpecs : void 0;
  if (kind === "page" && !external && !declaredSpecs.some((v) => v.key === PAGE_DIR_ENV_KEY)) {
    envVars = [
      {
        key: PAGE_DIR_ENV_KEY,
        label: m("page.dirEnvLabel"),
        defaultPath: dir,
        description: m("page.dirEnvDesc")
      },
      ...declaredSpecs
    ];
  }
  return {
    id: id2,
    name: resolveText(raw.name, id2),
    dir,
    port,
    containerPort: resolvePagePort(id2, port),
    startCommand,
    description: resolveText(raw.description) || void 0,
    external,
    externalUrl: raw.externalUrl,
    kind,
    builtin: BUILTIN_PAGE_IDS.has(id2),
    dshProfile: raw.dsh?.profile || "web",
    // Agent runtimes live in the 应用 menu by default; imported pages opt in via
    // container.json "manageAsApp": true.
    manageAsApp: raw.manageAsApp ?? (kind === "dsh" || kind === "openclaw"),
    // Deps keep only non-empty strings that aren't the page itself — self-imports would
    // deadlock ensureDeps behind an ancestry check that legitimately allows siblings.
    // A container-side `pageDeps` override (editable in the Pages panel) fully shadows the
    // project's own declaration — including an empty array, the explicit "no deps" case — so
    // wiring never requires rewriting a third-party container.json.
    dependsOn: resolvePageDeps(id2, raw.dependsOn),
    healthUrl: !external && typeof raw.healthUrl === "string" && raw.healthUrl.trim() ? raw.healthUrl.trim() : void 0,
    schemaVersion: Number.isFinite(Number(raw.schemaVersion)) ? Number(raw.schemaVersion) : void 0,
    author: typeof raw.author === "string" ? raw.author.trim() || void 0 : void 0,
    version: typeof raw.version === "string" ? raw.version.trim() || void 0 : void 0,
    iconUrl: resolveIconUrl(dir, raw.icon, warnings),
    permissions: Array.isArray(raw.permissions) ? raw.permissions.filter((p) => typeof p === "string") : void 0,
    npmPackage: typeof raw.npmPackage === "string" && raw.npmPackage.trim() ? raw.npmPackage.trim() : void 0,
    capabilityDir: typeof raw.capabilityDir === "string" && raw.capabilityDir.trim() ? raw.capabilityDir.trim() : void 0,
    manifestWarnings: warnings.length ? warnings : void 0,
    envVars
  };
}
const reportedManifestWarnings = /* @__PURE__ */ new Map();
function scanInstalledPages(pagesDir) {
  if (!existsSync(pagesDir)) return [];
  const out = [];
  for (const entry of readdirSync(pagesDir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(pagesDir, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
      const meta = readPageMeta(pagesDir, entry);
      const warnings = meta.manifestWarnings ?? [];
      const signature = warnings.join("\n");
      if (reportedManifestWarnings.get(entry) !== signature) {
        if (warnings.length) {
          reportedManifestWarnings.set(entry, signature);
          logEvent({
            level: "warn",
            kind: "manifest.invalid",
            pageId: entry,
            detail: signature,
            meta: { count: warnings.length }
          });
        } else {
          reportedManifestWarnings.delete(entry);
        }
      }
      out.push(meta);
    } catch (err) {
      out.push({
        id: entry,
        name: m("page.metaInvalid", { entry }),
        dir: full,
        port: 0,
        containerPort: resolvePagePort(entry, 0),
        startCommand: "",
        description: String(err.message),
        external: false
      });
    }
  }
  return out;
}
function runCli$2(cmd, args, opts = {}) {
  return new Promise((resolve2) => {
    const child = spawn(cmd, args, { windowsHide: true, timeout: opts.timeoutMs });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => stdout += String(d));
    child.stderr?.on("data", (d) => stderr += String(d));
    child.on("error", (err) => resolve2({ code: -1, stdout, stderr: stderr || err.message }));
    child.on("close", (code2) => resolve2({ code: code2 ?? -1, stdout, stderr }));
  });
}
async function reclaimOpenclawOrphans(tracked) {
  try {
    const victims = [];
    if (process.platform === "win32") {
      const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }`;
      const res = await runCli$2("powershell.exe", ["-NoProfile", "-Command", ps], {
        timeoutMs: 15e3
      });
      for (const line of res.stdout.split(/\r?\n/)) {
        const bar = line.indexOf("|");
        if (bar < 0) continue;
        const pid = Number(line.slice(0, bar));
        const cmd = line.slice(bar + 1);
        if (!Number.isFinite(pid) || pid <= 0) continue;
        if (/openclaw[/\\]+openclaw\.mjs/.test(cmd) && !tracked.has(pid)) victims.push(pid);
      }
      for (const pid of victims) {
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      }
    } else {
      const res = await runCli$2("pgrep", ["-f", "openclaw/openclaw.mjs"], { timeoutMs: 15e3 });
      for (const tok of res.stdout.split(/\r?\n/)) {
        const pid = Number(tok.trim());
        if (Number.isFinite(pid) && pid > 0 && !tracked.has(pid)) victims.push(pid);
      }
      for (const pid of victims) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
        }
      }
    }
    if (victims.length) {
      console.warn(
        `[pages] reclaimed ${victims.length} orphan openclaw gateway(s): ${victims.join(", ")}`
      );
      await new Promise((r) => setTimeout(r, 700));
    }
  } catch (err) {
    console.warn("[pages] openclaw orphan reclaim failed (ignored):", err.message);
  }
}
async function reclaimDshHarnesses(profile, tracked) {
  try {
    const victims = [];
    const esc = profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const harnessRe = new RegExp(`bin\\.js (?:--profile ${esc}(?:\\s|$)|${esc}(?:\\s|$))`, "i");
    if (process.platform === "win32") {
      const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }`;
      const res = await runCli$2("powershell.exe", ["-NoProfile", "-Command", ps], {
        timeoutMs: 15e3
      });
      for (const line of res.stdout.split(/\r?\n/)) {
        const bar = line.indexOf("|");
        if (bar < 0) continue;
        const pid = Number(line.slice(0, bar));
        const cmd = line.slice(bar + 1);
        if (!Number.isFinite(pid) || pid <= 0) continue;
        if (harnessRe.test(cmd) && !tracked.has(pid)) victims.push(pid);
      }
      for (const pid of victims) {
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      }
    } else {
      const res = await runCli$2("pgrep", ["-f", `bin.js --profile ${profile}`], {
        timeoutMs: 15e3
      });
      for (const tok of res.stdout.split(/\r?\n/)) {
        const pid = Number(tok.trim());
        if (Number.isFinite(pid) && pid > 0 && !tracked.has(pid)) victims.push(pid);
      }
      for (const pid of victims) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
        }
      }
    }
    if (victims.length) {
      console.warn(
        `[pages] reclaimed ${victims.length} orphan dsh harness(es) on profile "${profile}": ${victims.join(", ")}`
      );
      await new Promise((r) => setTimeout(r, 700));
    }
  } catch (err) {
    console.warn("[pages] dsh orphan reclaim failed (ignored):", err.message);
  }
}
const LOG_LIMIT = 1e3;
const START_TIMEOUT_MS = Number(process.env.DSH_PAGE_START_TIMEOUT_MS || 3e4);
const OPENCLAW_READY_TIMEOUT_MS = Number(process.env.DSH_OPENCLAW_READY_TIMEOUT_MS || 12e4);
const DSH_READY_TIMEOUT_MS = Number(process.env.DSH_DSH_READY_TIMEOUT_MS || 12e4);
const ANNOUNCE_GRACE_MS = 1500;
const CRASH_RETRY_DELAYS_MS = [2e3, 5e3, 15e3];
const STABLE_RESET_MS = 5 * 6e4;
const MAX_RECLAIM_RETRIES = 3;
const HEALTH_READY_TIMEOUT_MS = 2e4;
const HEALTH_POLL_MS = 3e4;
const HEALTH_FAIL_LIMIT = 3;
function healthTarget(meta, port) {
  const raw = (meta.healthUrl || "").trim();
  if (!raw) return null;
  const filled = raw.replace(/\{port\}/g, String(port));
  if (/^https?:\/\//i.test(filled)) return filled;
  try {
    return new URL(filled.startsWith("/") ? filled : `/${filled}`, `http://127.0.0.1:${port}`).toString();
  } catch {
    return null;
  }
}
function probeHealth(url, timeoutMs = 5e3) {
  return new Promise((resolve2) => {
    try {
      const lib = url.startsWith("https") ? get$1 : get$2;
      const req = lib(url, { timeout: timeoutMs }, (res) => {
        res.resume();
        const status = res.statusCode ?? 0;
        resolve2(status >= 200 && status < 400);
      });
      req.on("error", () => resolve2(false));
      req.on("timeout", () => {
        req.destroy();
        resolve2(false);
      });
    } catch {
      resolve2(false);
    }
  });
}
async function waitHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    if (await probeHealth(url)) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 700));
  }
}
function detectEngineMismatch(e) {
  return e.logs.some((l) => /EBADENGINE/i.test(l));
}
class PortNotReadyError extends Error {
  constructor(port, timeoutMs) {
    super(m("page.portNotReady", { port, sec: Math.round(timeoutMs / 1e3) }));
    this.port = port;
  }
  port;
}
function waitPortReady(port, timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve2, reject) => {
    const attempt = () => {
      const sock = createConnection({ host: "127.0.0.1", port }, () => {
        sock.destroy();
        resolve2(port);
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() > deadline) {
          reject(new PortNotReadyError(port, timeoutMs));
        } else {
          setTimeout(attempt, 400);
        }
      });
    };
    attempt();
  });
}
function parseLaunchLine(text) {
  const m2 = text.match(/^\s*dsh\s+\S+:\s+(https?:\/\/\S+)/);
  if (!m2) return null;
  const url = m2[1].trim();
  const port = Number(new URL(url).port);
  if (!Number.isFinite(port) || port < 1024 || port > 65535) return null;
  return { port, url };
}
function tokenFromLaunchUrl(url) {
  if (!url) return null;
  try {
    const token = new URL(url).searchParams.get("token");
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}
function resolveDshToken(pages, profile) {
  const wanted = profile.trim() || "web";
  const candidates = pages.filter((p) => p.kind === "dsh" && (p.dshProfile || "web") === wanted);
  for (const p of candidates) {
    const token = tokenFromLaunchUrl(p.launchUrl);
    if (token && p.launchUrl) return { kind: "ok", token, pageId: p.id, url: p.launchUrl };
  }
  return candidates.length ? { kind: "stopped", pageId: candidates[0].id } : { kind: "no-page", profile: wanted };
}
function withThemeParam(url, kind) {
  if (!url || kind !== "dsh" || !nativeTheme.shouldUseDarkColors) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("theme")) {
      u.searchParams.set("theme", "dark");
      return u.toString();
    }
  } catch {
  }
  return url;
}
function ensureEnvDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
  }
}
function buildPageEnv(meta) {
  const out = {};
  for (const spec of meta.envVars ?? []) {
    if (!spec?.key) continue;
    if (spec.type === "text") {
      const v2 = resolvePageTextEnv(meta.id, spec.key, spec.defaultValue);
      if (v2) out[spec.key] = v2;
      continue;
    }
    const v = resolvePageEnv(meta.id, spec.key, spec.defaultPath, spec.legacyPath);
    if (!v) continue;
    ensureEnvDir(v);
    out[spec.key] = v;
  }
  const merged = { ...out, ...resolvePageCustomEnvs(meta.id) };
  if (detectMcpAgent(expandStartCommand(meta.startCommand || "")) === "codex") {
    try {
      const states = listServers();
      const tools = listTools();
      exportBridgeFiles(states, tools);
      syncCodexConfig(buildCatalog(states, tools).servers, merged.CODEX_HOME);
    } catch (err) {
      console.warn("[mcp-bridge] codex sync failed:", err.message);
    }
  }
  return { ...bridgeEnvVars(), ...workspaceEnvVars(), ...merged };
}
function expandStartCommand(cmd) {
  return cmd.replace(/(^|\s)~(?=[/\\]|$)/g, (_m, pre) => pre + expandHome("~"));
}
class PageRegistry extends EventEmitter {
  constructor(root2) {
    super();
    this.root = root2;
    this.reconcile();
  }
  root;
  entries = /* @__PURE__ */ new Map();
  quitting = false;
  /**
   * Terminal-kind pages have no `e.proc` — their process is a PTY owned by the
   * IPC layer's PtyManager. `registerIpc` wires this hook so {@link stop} can
   * reach the real process; the status flip itself arrives later, through the
   * PTY exit event calling {@link reportTerminal}.
   */
  onKillTerminal = null;
  /**
   * Cached "is the on-demand CLI present" probe for the hosted runtimes, refreshed by
   * {@link refreshRuntimePresence} and read synchronously by {@link toState}. `loaded` is false
   * until the first probe, so an early read fails open (reports present) rather than mis-badging.
   */
  runtimePresence = { dsh: false, openclaw: false, loaded: false };
  /** container itself is always listed first so git-update covers it too */
  containerEntry() {
    return {
      id: "__container__",
      name: m("app.title"),
      dir: this.root.projectDir,
      port: 0,
      startCommand: "",
      description: m("page.containerDesc"),
      external: true
    };
  }
  reconcile() {
    const metas = scanInstalledPages(this.root.pagesDir);
    const alive = new Set(metas.map((m2) => m2.id));
    for (const id2 of [...this.entries.keys()]) {
      if (!alive.has(id2)) {
        this.clearRestartTimers(this.entries.get(id2));
        this.stop(id2);
        this.entries.delete(id2);
      }
    }
    for (const meta of metas) {
      const existing = this.entries.get(meta.id);
      if (existing) existing.meta = meta;
      else
        this.entries.set(meta.id, {
          meta,
          status: "stopped",
          logs: [],
          crashes: 0,
          healthFails: 0
        });
    }
    return metas;
  }
  list() {
    return [...this.entries.values()].map((e) => this.toState(e));
  }
  get(id2) {
    const e = this.entries.get(id2);
    return e && this.toState(e);
  }
  running() {
    return this.list().filter((s) => s.status === "running");
  }
  toState(e) {
    const port = e.resolvedPort ?? e.meta.containerPort ?? e.meta.port;
    const url = e.meta.external ? e.meta.externalUrl : `http://127.0.0.1:${port}`;
    return {
      ...e.meta,
      status: e.status,
      pid: e.pid,
      startedAt: e.startedAt,
      exitCode: e.exitCode,
      lastError: e.lastError,
      url,
      launchUrl: withThemeParam(e.launchUrl || url, e.meta.kind),
      // Settings-backed flag joined onto every list so the switcher, the Pages panel and the
      // start guards all read the same synchronous source (no async status IPC lag).
      disabled: getSettings().disabledPages?.includes(e.meta.id) || void 0,
      runtimeMissing: (e.meta.kind === "dsh" || e.meta.kind === "openclaw") && e.status !== "running" ? !this.hasRuntime(e.meta.kind) : void 0,
      portHolder: e.portHolder,
      crashes: e.crashes || void 0,
      nextRestartAt: e.nextRestartAt,
      // #16: only a page that declares a healthUrl has a meaningful probe outcome; others
      // leave it undefined so the panel skips the badge rather than showing a false "unknown".
      health: e.meta.healthUrl ? {
        status: e.lastHealthOk === void 0 ? "unknown" : e.lastHealthOk ? "ok" : "fail",
        fails: e.healthFails,
        lastAt: e.lastHealthAt,
        url: healthTarget(e.meta, port) ?? void 0
      } : void 0
    };
  }
  logs(id2) {
    const e = this.entries.get(id2);
    if (!e) return [];
    return [...e.logs];
  }
  /**
   * Terminal-kind CLIs are never spawned by the registry — the embedded terminal
   * (PtyManager, wired from ipc.ts) owns their whole lifecycle, so it is the only
   * source that can say "running". The PtyStart handler calls this on spawn and on
   * exit to keep the switcher / Pages-panel traffic lights honest. The health
   * watchdog stays out of it: its probes all short-circuit on the absent `e.proc`.
   */
  reportTerminal(id2, phase, code2) {
    const e = this.entries.get(id2);
    if (!e || e.meta.kind !== "terminal" || this.quitting) return;
    if (phase === "running") {
      if (e.status === "running") return;
      e.startedAt = Date.now();
      e.lastError = void 0;
      e.exitCode = void 0;
      e.logs.push(`[container] ${m("page.logStarting", { name: e.meta.name, port: "-" })}`);
      this.setStatus(e, "running");
      logEvent({
        level: "info",
        kind: "page.running",
        pageId: id2,
        // no port for a CLI — fill the template's {port} slot rather than leaking a raw placeholder
        meta: { port: "-", ms: 0 }
      });
      return;
    }
    if (e.status !== "running" && e.status !== "starting") return;
    e.exitCode = code2;
    const clean = code2 === 0;
    if (!clean) e.lastError = m("page.processExited", { code: code2 ?? "" });
    e.logs.push(`[container] ${m("page.processExited", { code: code2 ?? "" })}`);
    this.setStatus(e, clean ? "stopped" : "error");
    logEvent({
      level: clean ? "info" : "warn",
      kind: "page.exit",
      pageId: id2,
      meta: { code: code2 ?? "n/a" }
    });
  }
  async start(id2, opts) {
    const e = this.entries.get(id2);
    if (!e) throw new Error(m("page.unknown", { id: id2 }));
    if (getSettings().disabledPages?.includes(id2))
      throw new Error(m("page.disabled", { name: e.meta.name }));
    const initialStatus = e.status;
    if (initialStatus === "running" || initialStatus === "starting") return this.toState(e);
    if (!opts?.fromCrashGuard) {
      this.clearRestartTimers(e);
      e.crashes = 0;
    }
    e.lastError = void 0;
    try {
      return await this.startAttempt(e, id2);
    } catch (err) {
      if (e.status === "starting") this.fail(e, err.message);
      const exitedEarly = e.exitCode !== void 0 && e.exitCode !== null && e.exitCode !== 0;
      const retriable = exitedEarly && (e.meta.kind === "dsh" || e.meta.kind === "openclaw");
      if (!retriable) throw err;
      await this.reclaimOrphan(e, id2);
      const statusNow = e.status;
      if (statusNow !== "starting") return this.toState(e);
      e.logs.push(m("page.logRetryAfterReclaim"));
      this.emitProgress(e, "retry");
      return this.startAttempt(e, id2);
    }
  }
  /** One spawn + readiness wait. `start` may call this twice (see the reclaim-on-failure retry). */
  async startAttempt(e, id2) {
    if (e.meta.external) throw new Error(m("page.externalNoStart", { name: e.meta.name }));
    const isDsh = e.meta.kind === "dsh";
    const isOpenclaw = e.meta.kind === "openclaw";
    const isTerminal = e.meta.kind === "terminal";
    const port = e.meta.containerPort || e.meta.port;
    if (!isDsh && !isOpenclaw && !isTerminal && (!port || !e.meta.startCommand)) {
      throw new Error(m("page.invalidConfig", { name: e.meta.name }));
    }
    if (isTerminal && !e.meta.startCommand) {
      throw new Error(m("page.noStartCommand", { name: e.meta.name }));
    }
    this.setStatus(e, "starting");
    e.logs = [m("page.logStarting", { name: e.meta.name, port })];
    e.lastError = void 0;
    e.exitCode = void 0;
    e.resolvedPort = void 0;
    e.launchUrl = void 0;
    e.portHolder = null;
    this.emitProgress(e, "spawning");
    let mcpServers = [];
    if (isDsh || isOpenclaw) {
      try {
        const states = listServers();
        const tools = listTools();
        exportBridgeFiles(states, tools);
        mcpServers = buildCatalog(states, tools).servers;
      } catch (err) {
        console.warn("[mcp-bridge] agent snapshot failed:", err.message);
      }
    }
    let launch;
    if (isDsh) {
      const { dshSpawnCommand: dshSpawnCommand2 } = await Promise.resolve().then(() => dsh);
      let spec;
      try {
        spec = await dshSpawnCommand2(e.meta.dshProfile || "web", port, syncDshMcpPatch(mcpServers));
      } catch (err) {
        this.fail(e, m("page.dshStartFail", { err: err.message }));
        throw new Error(e.lastError);
      }
      launch = {
        cmd: spec.cmd,
        args: spec.args,
        cwd: spec.cwd,
        env: { ...spec.env, ...resolvePageCustomEnvs(e.meta.id) }
      };
    } else if (isOpenclaw) {
      const { openclawSpawnSpec: openclawSpawnSpec2 } = await Promise.resolve().then(() => openclaw);
      const spec = openclawSpawnSpec2(port, mcpServers);
      launch = {
        cmd: spec.cmd,
        args: spec.args,
        cwd: spec.cwd,
        env: { ...spec.env, ...resolvePageCustomEnvs(e.meta.id) }
      };
    } else {
      if (isTerminal) {
        this.setStatus(e, "stopped");
        throw new Error(m("page.cliNeedsTerminal", { name: e.meta.name }));
      }
      const [cmd, ...args] = expandStartCommand(e.meta.startCommand).split(/\s+/);
      const executable = cmd === "node" ? getNodeExePath() : cmd;
      launch = {
        cmd: executable,
        args,
        cwd: e.meta.dir,
        env: bundledEnv({ PORT: String(port), ...buildPageEnv(e.meta) })
      };
    }
    let proc;
    try {
      proc = spawn(launch.cmd, launch.args, {
        cwd: launch.cwd,
        env: launch.env,
        windowsHide: true,
        shell: false,
        stdio: "pipe"
      });
    } catch (err) {
      const failKey = isDsh ? "page.dshStartFail" : isOpenclaw ? "page.openclawStartFail" : "page.spawnFail";
      this.fail(e, m(failKey, { err: err.message }));
      throw new Error(e.lastError);
    }
    e.proc = proc;
    e.pid = proc.pid;
    e.startedAt = Date.now();
    proc.on("spawn", () => this.emitProgress(e, "process"));
    proc.stdout.on("data", (d) => this.appendLog(e, d));
    proc.stderr.on("data", (d) => this.appendLog(e, d));
    proc.on("error", (err) => this.fail(e, err.message));
    proc.on("close", (code2) => this.handleProcessDeath(e, code2));
    try {
      this.emitProgress(e, "port");
      const { port: boundPort, url } = await this.waitReady(e, proc, isDsh, isOpenclaw, isTerminal);
      e.resolvedPort = boundPort;
      if (e.meta.healthUrl) {
        const target = healthTarget(e.meta, boundPort);
        if (target && !await waitHealth(target, HEALTH_READY_TIMEOUT_MS)) {
          throw new Error(m("page.healthFail", { url: target }));
        }
        e.lastHealthOk = true;
        e.lastHealthAt = Date.now();
      }
      let launchUrl = url;
      if (isOpenclaw) {
        this.emitProgress(e, "url");
        const { resolveOpenclawLaunchUrl: resolveOpenclawLaunchUrl2 } = await Promise.resolve().then(() => openclaw);
        launchUrl = await resolveOpenclawLaunchUrl2() || url;
      }
      e.launchUrl = launchUrl;
      e.logs.push(m("page.logReady", { port: boundPort }));
      this.setStatus(e, "running");
      logEvent({
        level: "info",
        kind: "page.running",
        pageId: e.meta.id,
        meta: { port: boundPort, ms: e.startedAt ? Date.now() - e.startedAt : 0 }
      });
      clearTimeout(e.stableTimer);
      e.stableTimer = setTimeout(() => {
        e.stableTimer = void 0;
        if (e.status === "running") {
          e.crashes = 0;
          e.reclaimRetries = 0;
        }
      }, STABLE_RESET_MS);
      e.stableTimer.unref?.();
      this.emitProgress(e, "ready");
      this.emitChanged();
      return this.toState(e);
    } catch (err) {
      let failure = err;
      if (failure instanceof PortNotReadyError) {
        const holder = await findPortHolder(failure.port);
        if (holder && holder.pid !== e.pid) {
          e.portHolder = holder;
          logEvent({
            level: "warn",
            kind: "page.portBusy",
            pageId: e.meta.id,
            detail: `${holder.name} (${holder.pid})`,
            meta: { port: failure.port }
          });
          failure = new Error(
            m("page.portOwner", { port: failure.port, pid: holder.pid, name: holder.name })
          );
        }
      }
      this.fail(e, failure.message);
      if (e.proc) this.stop(id2);
      throw failure;
    }
  }
  /** Dispatch orphan reclaim by kind, so `start` doesn't import both code paths. */
  async reclaimOrphan(e, selfId) {
    if (e.meta.kind === "dsh") await this.reclaimOrphanDsh(e.meta.dshProfile || "web", selfId);
    else if (e.meta.kind === "openclaw") await this.reclaimOrphanOpenclaw(selfId);
  }
  /** Stream a startup phase + log tail to the renderer's boot overlay. */
  emitProgress(e, phase) {
    if (phase === "log") {
      const now = Date.now();
      if (e.lastProgAt && now - e.lastProgAt < 250) return;
      e.lastProgAt = now;
    }
    this.emit("progress", {
      pageId: e.meta.id,
      phase,
      logs: e.logs.slice(-12)
    });
  }
  /** plain pages: poll the effective port; dsh: also parse the app's own ready line for the bound URL;
      terminal kinds: ready as soon as the process is alive (no HTTP surface to wait for). */
  waitReady(e, proc, isDsh, isOpenclaw = false, isTerminal = false) {
    if (isTerminal) return Promise.resolve({ port: 0 });
    const timeoutMs = isOpenclaw ? OPENCLAW_READY_TIMEOUT_MS : isDsh ? DSH_READY_TIMEOUT_MS : START_TIMEOUT_MS;
    const wantPort = e.meta.containerPort || e.meta.port;
    if (!isDsh) {
      return new Promise((resolve2, reject) => {
        const onClose = (code2) => {
          if (code2 || isOpenclaw) reject(new Error(m("page.processExited", { code: code2 ?? "" })));
        };
        proc.once("close", onClose);
        waitPortReady(wantPort, timeoutMs).then(
          (port) => {
            proc.off("close", onClose);
            resolve2({ port });
          },
          (err) => {
            proc.off("close", onClose);
            reject(err);
          }
        );
      });
    }
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve2, reject) => {
      let announced = null;
      const failWith = (err) => reject(err);
      const onExit = (code2) => {
        if (code2) {
          cleanup();
          failWith(new Error(m("page.processExited", { code: code2 })));
        }
      };
      const onChunk = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) {
          const found = parseLaunchLine(line);
          if (!found) continue;
          announced = found;
          cleanup();
          waitPortReady(found.port, Math.max(2e3, deadline - Date.now())).then(
            () => resolve2({ port: found.port, url: found.url }),
            failWith
          );
          return;
        }
      };
      const timer = setInterval(() => {
        if (Date.now() > deadline) {
          cleanup();
          failWith(
            new Error(
              m("page.dshProfileNotReady", {
                sec: Math.round(timeoutMs / 1e3),
                port: wantPort
              })
            )
          );
        }
      }, 5e3);
      const cleanup = () => {
        clearInterval(timer);
        proc.stdout.off("data", onChunk);
        proc.stderr.off("data", onChunk);
        proc.off("close", onExit);
      };
      proc.stdout.on("data", onChunk);
      proc.stderr.on("data", onChunk);
      proc.once("close", onExit);
      waitPortReady(wantPort, timeoutMs).then(
        (port) => {
          const settleDeadline = Date.now() + ANNOUNCE_GRACE_MS * 4;
          const settle = () => {
            clearInterval(poll);
            cleanup();
            resolve2({ port, url: announced?.url });
          };
          const poll = setInterval(() => {
            if (announced || Date.now() > settleDeadline) settle();
          }, 150);
        },
        failWith
      );
    });
  }
  stop(id2) {
    const e = this.entries.get(id2);
    if (!e) return;
    this.clearRestartTimers(e);
    if (e.meta.kind === "terminal") {
      if (e.status === "running" || e.status === "starting") {
        e.logs.push(m("page.logStopping"));
        this.onKillTerminal?.(id2);
      }
      return;
    }
    if (!e?.proc) {
      if (e && (e.status === "running" || e.status === "starting")) this.setStatus(e, "stopped");
      return;
    }
    const proc = e.proc;
    e.logs.push(m("page.logStopping"));
    e.exitCode = void 0;
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true });
    } else {
      proc.kill("SIGTERM");
    }
    e.proc = void 0;
    e.pid = void 0;
    this.setStatus(e, "stopped");
    this.emitChanged();
  }
  /** Like `stop` but resolves once the child's exit callback has fired — on Windows the
      taskkill tree-kill is async, so callers that delete/reuse the cwd need this signal. */
  stopAndWait(id2, timeoutMs = 8e3) {
    const e = this.entries.get(id2);
    const proc = e?.proc;
    if (!proc) {
      return Promise.resolve();
    }
    this.stop(id2);
    return new Promise((resolve2) => {
      const done = () => {
        clearTimeout(timer);
        resolve2();
      };
      const timer = setTimeout(done, timeoutMs);
      proc.once("close", done);
    });
  }
  /** Kill leftover bundled-node openclaw gateways this registry no longer tracks — the
      enumeration/kill mechanics live in pages-reclaim.ts. Best-effort; never throws. */
  async reclaimOrphanOpenclaw(selfId) {
    const tracked = /* @__PURE__ */ new Set();
    for (const [id2, e] of this.entries) {
      if (id2 !== selfId && e.meta.kind === "openclaw" && e.proc?.pid) tracked.add(e.proc.pid);
    }
    await reclaimOpenclawOrphans(tracked);
  }
  /** Kill dsh harnesses on `profile` this registry no longer tracks (see pages-reclaim.ts). */
  async reclaimOrphanDsh(profile, selfId) {
    const tracked = /* @__PURE__ */ new Set();
    for (const [id2, e] of this.entries) {
      if (id2 !== selfId && e.meta.kind === "dsh" && (e.meta.dshProfile || "web") === profile && e.proc?.pid) {
        tracked.add(e.proc.pid);
      }
    }
    await reclaimDshHarnesses(profile, tracked);
  }
  async restart(id2) {
    await this.stopAndWait(id2);
    return this.start(id2);
  }
  /** Start a page after everything it `dependsOn` is up. The deps chain is walked depth-first
   *  with an ancestry trail, so a cycle in user-authored container.jsons surfaces as an error
   *  naming the loop instead of two pages waitLooping on each other. */
  async startWithDeps(id2) {
    await this.ensureDeps(id2, []);
    return this.start(id2);
  }
  async restartWithDeps(id2) {
    await this.stopAndWait(id2);
    return this.startWithDeps(id2);
  }
  /** Recursively make every declared dep `running` (starting it if stopped), before the
   *  dependent is allowed to spawn. Deps that aren't known pages are ignored — an imported
   *  project may declare a dep on an optional builtin the user never installed. */
  async ensureDeps(id2, ancestry) {
    const e = this.entries.get(id2);
    const deps = e?.meta.dependsOn ?? [];
    if (!deps.length) return;
    if (ancestry.includes(id2)) {
      throw new Error(m("page.depsCycle", { chain: [...ancestry, id2].join(" → ") }));
    }
    for (const dep of deps) {
      const d = this.entries.get(dep);
      if (!d || d.meta.external || d.meta.kind === "terminal") continue;
      if (d.status === "running") continue;
      if (d.status === "starting") {
        await this.waitDepReady(dep);
        continue;
      }
      try {
        await this.ensureDeps(dep, [...ancestry, id2]);
        await this.start(dep);
      } catch (err) {
        throw new Error(m("page.depsFail", { dep, err: err.message }));
      }
    }
  }
  /** Wait for a dep that's already mid-boot (someone else called start) to settle.
   *  No cycle re-check here: the dep is in flight, this method never spawns anything, so
   *  the worst case is the boot timeout firing — a plain depsFail, not a deadlock. */
  waitDepReady(id2) {
    const deadline = Date.now() + DSH_READY_TIMEOUT_MS;
    return new Promise((resolve2, reject) => {
      const tick2 = () => {
        const d = this.entries.get(id2);
        if (!d) return resolve2();
        if (d.status === "running") return resolve2();
        if (d.status !== "starting") {
          return reject(new Error(m("page.depsFail", { dep: id2, err: d.lastError || d.status })));
        }
        if (Date.now() > deadline) {
          return reject(new Error(m("page.depsFail", { dep: id2, err: "timeout" })));
        }
        setTimeout(tick2, 400);
      };
      tick2();
    });
  }
  /**
   * Re-run the two on-demand CLI presence probes (pure `existsSync` over candidate paths) and
   * cache them for {@link toState}. The slim installer ships neither dsh nor openclaw — both are
   * provisioned into userData on demand — so a hosted page whose runtime is absent can never
   * start. Caching keeps that verdict on `PageState` (a synchronous read), so the list badges,
   * the switcher and the default-view restore share one race-free source instead of each awaiting
   * the async status IPC and guessing around an "unknown" window. Dynamic imports keep the module
   * graph as lean as `startAttempt` already has.
   */
  async refreshRuntimePresence() {
    const [{ isDshInstalled: isDshInstalled2 }, { isOpenclawInstalled: isOpenclawInstalled2 }] = await Promise.all([
      Promise.resolve().then(() => dsh),
      Promise.resolve().then(() => openclaw)
    ]);
    this.runtimePresence.dsh = isDshInstalled2();
    this.runtimePresence.openclaw = isOpenclawInstalled2();
    this.runtimePresence.loaded = true;
  }
  /** Sync read of the last probe. Non-hosted kinds are never gated; an unwarmed cache reports
   *  "present" so callers fail open (attempt the start) rather than block on unknown. */
  hasRuntime(kind) {
    if (kind !== "dsh" && kind !== "openclaw") return true;
    if (!this.runtimePresence.loaded) return true;
    return kind === "dsh" ? this.runtimePresence.dsh : this.runtimePresence.openclaw;
  }
  /** auto-start configured pages; failures are logged, never thrown.
      Terminal-kind pages run in the embedded terminal and are opened by the renderer,
      so they are skipped here to avoid a spurious "run in terminal" error. Unknown ids
      (a retired builtin still listed in persisted settings) are skipped silently. */
  async autoStart(ids) {
    await this.refreshRuntimePresence().catch(() => void 0);
    await Promise.all(
      ids.map(async (id2) => {
        const entry = this.entries.get(id2);
        if (!entry || entry.meta.kind === "terminal") return;
        if (getSettings().disabledPages?.includes(id2)) return;
        if (!this.hasRuntime(entry.meta.kind)) {
          console.log(`[pages] auto-start ${id2} skipped: ${entry.meta.kind} runtime not installed`);
          return;
        }
        try {
          await this.startWithDeps(id2);
        } catch (err) {
          console.warn(`[pages] auto-start ${id2} failed:`, err.message);
          logEvent({
            level: "warn",
            kind: "page.autostartFail",
            pageId: id2,
            detail: err.message
          });
        }
      })
    );
  }
  /** Broadcast the current list after a settings-only change (e.g. disabledPages flipped on a
      stopped page, where no status transition fires emitChanged on its own). */
  announceChange() {
    this.emitChanged();
  }
  /** Stop every tracked page and resolve once all children have actually exited (or
   * their per-process timeouts fired). On Windows the taskkill tree-kill is async, so
   * quit paths that don't await this can orphan grandchildren on slow machines. */
  async shutdownAll() {
    this.quitting = true;
    const ids = [...this.entries.keys()];
    await Promise.all(ids.map((id2) => this.stopAndWait(id2)));
  }
  /**
   * Shared death path for anything with a real child handle (piped / POSIX-detached spawns). A
   * hidden launch has no handle and reaches this via the pid-liveness poll with `code = null`.
   * Marks the row stopped/error, then runs the crash health-guard for an unscheduled death.
   */
  handleProcessDeath(e, code2) {
    const wasRunning = e.status === "running";
    if (e.status === "starting" || e.status === "running") {
      this.setStatus(e, code2 === 0 || this.quitting ? "stopped" : "error");
      e.exitCode = code2;
      if (code2 !== 0 && !this.quitting) {
        e.lastError = m("page.processExited", { code: code2 ?? "" });
        e.logs.push(`[container] ${e.lastError}`);
      }
    }
    if (wasRunning && code2 !== 0 && !this.quitting && e.meta.kind !== "terminal" && getSettings().crashAutoRestart !== false) {
      if (detectEngineMismatch(e)) {
        e.lastError = m("page.logEngineMismatch");
        e.logs.push(`[container] ${e.lastError}`);
        console.warn(`[pages] ${e.meta.id}: EBADENGINE — not restarting (engine mismatch)`);
        logEvent({ level: "error", kind: "page.engineMismatch", pageId: e.meta.id });
      } else if (code2 === 78 && (e.reclaimRetries ?? 0) < MAX_RECLAIM_RETRIES) {
        e.reclaimRetries = (e.reclaimRetries ?? 0) + 1;
        e.logs.push(`[container] ${m("page.logReclaimRetry")}`);
        logEvent({
          level: "warn",
          kind: "page.reclaim",
          pageId: e.meta.id,
          meta: { attempt: e.reclaimRetries }
        });
        this.scheduleReclaimRestart(e);
      } else {
        e.crashes++;
        logEvent({
          level: "warn",
          kind: "page.crash",
          pageId: e.meta.id,
          meta: { code: code2 ?? "n/a", attempt: e.crashes }
        });
        this.scheduleCrashRestart(e, code2);
      }
    }
    e.proc = void 0;
    e.pid = void 0;
    this.emitChanged();
  }
  setStatus(e, status) {
    e.status = status;
    if (status === "running") this.startHealthMonitor(e);
    else this.stopHealthMonitor(e);
    this.emitChanged();
  }
  /** Periodically probe the declared healthUrl while running. Consecutive failures past
   *  HEALTH_FAIL_LIMIT mean "bound but hung" — kill the child so the crash guard's normal
   *  close-event path (backoff + budget) restarts it instead of us inventing a second path. */
  startHealthMonitor(e) {
    this.stopHealthMonitor(e);
    if (!e.meta.healthUrl) return;
    const probe = () => {
      if (e.status !== "running" || !e.proc || this.quitting) return;
      const target = healthTarget(e.meta, e.resolvedPort ?? e.meta.containerPort ?? e.meta.port);
      if (!target) return;
      void probeHealth(target).then((alive) => {
        if (e.status !== "running" || !e.proc) return;
        e.lastHealthAt = Date.now();
        if (alive) {
          e.lastHealthOk = true;
          e.healthFails = 0;
          return;
        }
        e.lastHealthOk = false;
        e.healthFails++;
        if (e.healthFails < HEALTH_FAIL_LIMIT) {
          this.emitChanged();
          return;
        }
        e.healthFails = 0;
        e.logs.push(`[container] ${m("page.logHealthKill", { n: HEALTH_FAIL_LIMIT })}`);
        console.warn(`[pages] ${e.meta.id}: ${HEALTH_FAIL_LIMIT} failed health probes — restarting`);
        logEvent({
          level: "warn",
          kind: "page.hung",
          pageId: e.meta.id,
          meta: { n: HEALTH_FAIL_LIMIT, url: target }
        });
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(e.proc.pid), "/T", "/F"], { windowsHide: true });
        } else {
          e.proc.kill("SIGTERM");
        }
      });
    };
    setTimeout(probe, 1500).unref?.();
    e.healthTimer = setInterval(probe, HEALTH_POLL_MS);
    e.healthTimer.unref?.();
  }
  stopHealthMonitor(e) {
    if (e.healthTimer) clearInterval(e.healthTimer);
    e.healthTimer = void 0;
    e.healthFails = 0;
    e.lastHealthOk = void 0;
    e.lastHealthAt = void 0;
  }
  /** Cancel the guard's pending auto-restart / budget-refill timers for one entry. */
  clearRestartTimers(e) {
    if (e.restartTimer) clearTimeout(e.restartTimer);
    if (e.stableTimer) clearTimeout(e.stableTimer);
    e.restartTimer = void 0;
    e.stableTimer = void 0;
    e.nextRestartAt = void 0;
  }
  /**
   * One backoff rung of the crash health-guard. `crashes` is already incremented by the
   * caller; when the budget is spent the entry just stays in 'error' with a lastError
   * that says so — the user keeps the restart/logs affordances, we stop spawning.
   */
  scheduleCrashRestart(e, code2) {
    this.clearRestartTimers(e);
    const max = CRASH_RETRY_DELAYS_MS.length;
    if (e.crashes > max) {
      e.crashes = max;
      e.lastError = m("page.crashGiveUp", { max });
      e.logs.push(`[container] ${e.lastError}`);
      console.warn(`[pages] ${e.meta.id}: crash budget spent (${max}), auto-restart stopped`);
      logEvent({ level: "error", kind: "page.giveUp", pageId: e.meta.id, meta: { max } });
      notifyEvent("notify.giveUpTitle", "notify.giveUpBody", {
        name: e.meta.name,
        max
      });
      return;
    }
    const delay = CRASH_RETRY_DELAYS_MS[e.crashes - 1];
    const line = m("page.logCrashRestart", {
      code: code2 ?? "",
      sec: Math.round(delay / 1e3),
      n: e.crashes,
      max
    });
    e.logs.push(`[container] ${line}`);
    e.nextRestartAt = Date.now() + delay;
    console.warn(`[pages] ${e.meta.id} crashed (code=${code2}) — ${line}`);
    e.restartTimer = setTimeout(() => {
      e.restartTimer = void 0;
      e.nextRestartAt = void 0;
      if (this.quitting || e.proc) return;
      this.start(e.meta.id, { fromCrashGuard: true }).catch((err) => {
        console.warn(`[pages] crash-restart ${e.meta.id} failed:`, err.message);
      });
    }, delay);
    e.restartTimer.unref?.();
  }
  /**
   * #18: exit-78 (resource busy) reclaim-and-retry. Mirrors scheduleCrashRestart's shape
   * but does NOT consume the crash budget — it reclaims the orphan holding the resource and
   * restarts on the shortest rung. Bounded by MAX_RECLAIM_RETRIES (checked by the caller) so
   * a page that keeps hitting 78 can't hot-loop; once the cap is spent the caller falls back
   * to the normal budgeted ladder.
   */
  scheduleReclaimRestart(e) {
    this.clearRestartTimers(e);
    const delay = CRASH_RETRY_DELAYS_MS[0];
    e.nextRestartAt = Date.now() + delay;
    this.emitChanged();
    e.restartTimer = setTimeout(() => {
      e.restartTimer = void 0;
      e.nextRestartAt = void 0;
      if (this.quitting || e.proc) return;
      void this.reclaimOrphan(e, e.meta.id).catch((err) => console.warn(`[pages] ${e.meta.id} reclaim failed:`, err.message)).finally(() => {
        if (this.quitting || e.proc) return;
        this.start(e.meta.id, { fromCrashGuard: true }).catch((err) => {
          console.warn(`[pages] reclaim-restart ${e.meta.id} failed:`, err.message);
        });
      });
    }, delay);
    e.restartTimer.unref?.();
  }
  fail(e, message) {
    e.lastError = message;
    e.logs.push(`[container] ${message}`);
    logEvent({ level: "error", kind: "page.failed", pageId: e.meta.id, detail: message });
    this.setStatus(e, "error");
  }
  appendLog(e, chunk) {
    const text = String(chunk);
    logPageLine(e.meta.id, text);
    let added = false;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      e.logs.push(line);
      added = true;
      if (e.logs.length > LOG_LIMIT) e.logs.shift();
    }
    if (added && e.status === "starting") this.emitProgress(e, "log");
  }
  /** Ask every listener to re-read state. Out-of-band callers (e.g. a language change, which
      changes the strings resolved out of container.json) use this; `reconcile()` first if the
      manifests themselves need re-reading. */
  emitChanged() {
    this.emit("changed");
  }
}
function textResult(text) {
  const t = typeof text === "string" ? text : JSON.stringify(text, null, 2);
  return { content: [{ type: "text", text: t }], isError: false };
}
function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}
const TOOLS = [
  {
    name: "container_list_pages",
    description: "List every page the container hosts: id, name, kind, lifecycle status and port.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "container_get_logs",
    description: "Read the tail of one hosted page’s captured output (logs/pages/<pageId>.log).",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The page id (see container_list_pages)." },
        tail: { type: "number", description: "How many trailing lines to return (default 200, max 5000)." }
      },
      required: ["pageId"],
      additionalProperties: false
    }
  },
  {
    name: "container_workspace_read",
    description: "Read the container-owned shared context: current task, shared-memory notes, and the task queue.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "container_workspace_submit",
    description: "Submit a new task into the shared task queue (todo column), optionally listing dependency ids.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "One-line task title (non-empty)." },
        deps: { type: "array", items: { type: "string" }, description: "Ids of tasks this one waits on (optional)." }
      },
      required: ["title"],
      additionalProperties: false
    }
  },
  {
    name: "container_workspace_complete",
    description: "Mark a task done and optionally record its outcome (mirrored into the shared-memory notes).",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The task id to close." },
        result: { type: "string", description: "Outcome summary (optional)." }
      },
      required: ["taskId"],
      additionalProperties: false
    }
  },
  {
    name: "container_list_mcp_tools",
    description: "List the tools of every MCP server connected in the container hub (optionally one server).",
    inputSchema: {
      type: "object",
      properties: { serverId: { type: "string", description: "Restrict to one hub server id (optional)." } },
      additionalProperties: false
    }
  },
  {
    name: "container_call_mcp_tool",
    description: "Call one tool on an MCP server the container hub already connects to.",
    inputSchema: {
      type: "object",
      properties: {
        serverId: { type: "string", description: "The hub server id (see container_list_mcp_tools)." },
        tool: { type: "string", description: "The tool name on that server." },
        arguments: { type: "object", description: "Arguments object the tool expects." }
      },
      required: ["serverId", "tool"],
      additionalProperties: false
    }
  },
  {
    name: "container_start_page",
    description: "Start a hosted page by id. Dependencies (per the container manifest) are started first.",
    inputSchema: {
      type: "object",
      properties: { pageId: { type: "string", description: "The page id to start." } },
      required: ["pageId"],
      additionalProperties: false
    }
  },
  {
    name: "container_stop_page",
    description: "Stop a running hosted page by id.",
    inputSchema: {
      type: "object",
      properties: { pageId: { type: "string", description: "The page id to stop." } },
      required: ["pageId"],
      additionalProperties: false
    }
  },
  {
    name: "container_restart_page",
    description: "Restart a hosted page by id (its dependencies are started first if needed).",
    inputSchema: {
      type: "object",
      properties: { pageId: { type: "string", description: "The page id to restart." } },
      required: ["pageId"],
      additionalProperties: false
    }
  }
];
function pageSummary(registry2, id2) {
  const p = registry2.get(id2);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    status: p.status,
    port: p.containerPort || p.port || void 0,
    external: p.external || void 0
  };
}
async function dispatch(getRegistry, name, args) {
  const a = args && typeof args === "object" ? args : {};
  switch (name) {
    case "container_list_pages": {
      const registry2 = getRegistry();
      if (!registry2) return errorResult("container registry not ready");
      return textResult(registry2.list().map((p) => pageSummary(registry2, p.id)));
    }
    case "container_get_logs": {
      const pageId = typeof a.pageId === "string" ? a.pageId.trim() : "";
      if (!pageId) return errorResult("container_get_logs needs a pageId");
      const tail = typeof a.tail === "number" ? Math.max(1, Math.min(5e3, a.tail)) : 200;
      const safe = pageId.replace(/[^\w.-]/g, "_");
      const res = readLogTail(`pages/${safe}.log`, tail);
      return textResult(res.lines.join("\n") || "(no log output captured yet)");
    }
    case "container_workspace_read":
      return textResult(readWorkspace());
    case "container_workspace_submit": {
      const rawTitle = typeof a.title === "string" ? a.title : "";
      const title2 = rawTitle.trim();
      if (!title2) return errorResult("container_workspace_submit needs a title");
      if (/[\x00-\x1f\x7f]/.test(rawTitle))
        return errorResult(
          "container_workspace_submit title must not contain newlines or control characters"
        );
      const cur = readWorkspace();
      const tasks = normalizeTasks(cur.tasks);
      const deps = (Array.isArray(a.deps) ? a.deps : []).filter((d) => typeof d === "string" && !!d.trim()).map((d) => d.trim());
      const id2 = `t${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
      tasks.push({ id: id2, title: title2, status: "todo", ...deps.length ? { deps } : {}, at: Date.now() });
      const next2 = writeWorkspace({ tasks });
      return textResult({ ok: true, taskId: id2, tasks: next2.tasks });
    }
    case "container_workspace_complete": {
      const taskId = typeof a.taskId === "string" ? a.taskId.trim() : "";
      if (!taskId) return errorResult("container_workspace_complete needs a taskId");
      const cur = readWorkspace();
      const tasks = normalizeTasks(cur.tasks);
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return errorResult(`no such task: ${taskId}`);
      if (t.status === "done") return errorResult(`task ${taskId} already done`);
      t.status = "done";
      const result = typeof a.result === "string" ? a.result.trim() : "";
      if (result) t.result = result;
      t.at = Date.now();
      const next2 = writeWorkspace({ tasks });
      return textResult({ ok: true, revision: next2.revision, tasks: next2.tasks });
    }
    case "container_list_mcp_tools": {
      const serverId = typeof a.serverId === "string" ? a.serverId : void 0;
      return textResult(listTools(serverId));
    }
    case "container_call_mcp_tool": {
      const serverId = typeof a.serverId === "string" ? a.serverId : "";
      const tool = typeof a.tool === "string" ? a.tool : "";
      if (!serverId || !tool) return errorResult("container_call_mcp_tool needs serverId and tool");
      const callArgs = {
        serverId,
        tool,
        ...a.arguments && typeof a.arguments === "object" ? { arguments: a.arguments } : {}
      };
      const r = await callTool(callArgs);
      return r.isError ? errorResult(r.error || r.text || "tool call failed") : textResult(r.text);
    }
    case "container_start_page": {
      const registry2 = getRegistry();
      const pageId = typeof a.pageId === "string" ? a.pageId.trim() : "";
      if (!registry2 || !pageId) return errorResult("container_start_page needs a pageId");
      const state = await registry2.startWithDeps(pageId);
      logEvent({ level: "info", kind: "container-mcp", pageId, detail: "start" });
      return textResult(pageSummary(registry2, pageId) ?? { id: pageId, status: state.status });
    }
    case "container_stop_page": {
      const registry2 = getRegistry();
      const pageId = typeof a.pageId === "string" ? a.pageId.trim() : "";
      if (!registry2 || !pageId) return errorResult("container_stop_page needs a pageId");
      registry2.stop(pageId);
      registry2.emitChanged();
      logEvent({ level: "info", kind: "container-mcp", pageId, detail: "stop" });
      return textResult(pageSummary(registry2, pageId) ?? { id: pageId, status: "stopped" });
    }
    case "container_restart_page": {
      const registry2 = getRegistry();
      const pageId = typeof a.pageId === "string" ? a.pageId.trim() : "";
      if (!registry2 || !pageId) return errorResult("container_restart_page needs a pageId");
      const state = await registry2.restartWithDeps(pageId);
      logEvent({ level: "info", kind: "container-mcp", pageId, detail: "restart" });
      return textResult(pageSummary(registry2, pageId) ?? { id: pageId, status: state.status });
    }
    default:
      return errorResult(`unknown tool: ${name}`);
  }
}
function buildMcpServer(getRegistry) {
  const server = new Server(
    { name: "dsh-container", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const p = request?.params ?? {};
    try {
      return await dispatch(getRegistry, String(p.name ?? ""), p.arguments ?? {});
    } catch (err) {
      return errorResult(`tool failed: ${err?.message ?? String(err)}`);
    }
  });
  return server;
}
function readJsonBody(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve2(null);
      try {
        resolve2(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
let httpServer = null;
let currentInfo = null;
let currentToken = "";
let starting = null;
function writeToken(token) {
  const file = join(bridgeDir(), "container-server.token");
  mkdirSync(bridgeDir(), { recursive: true });
  writeFileSync$1(file, token, { encoding: "utf8", mode: 384 });
  return file;
}
function authorized(req) {
  const header = req.headers["authorization"] || "";
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${currentToken}`;
}
function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
async function startContainerMcpServer(getRegistry) {
  if (httpServer && currentInfo) return currentInfo;
  if (!starting) starting = listen(getRegistry).finally(() => starting = null);
  return starting;
}
async function listen(getRegistry) {
  const token = randomBytes(24).toString("hex");
  const tokenFile = writeToken(token);
  currentToken = token;
  const server = createServer$1(async (req, res) => {
    if (!req.url) return sendJson(res, 400, { error: "bad request" });
    if (!authorized(req)) return sendJson(res, 401, { error: "unauthorized" });
    const [path2] = req.url.split("?");
    if (path2 !== "/mcp") return sendJson(res, 404, { error: "not found" });
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST", "content-type": "application/json" });
      return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32e3, message: "Method not allowed." }, id: null }));
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    }
    const mcp = buildMcpServer(getRegistry);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: void 0 });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.warn("[container-mcp] request failed:", err?.message ?? err);
      sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });
  server.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
  } catch (err) {
    currentToken = "";
    server.close();
    throw err;
  }
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/mcp`;
  httpServer = server;
  currentInfo = { url, port, tokenFile };
  const endpoint = { url, port, tokenFile, bearerToken: token };
  setContainerEndpoint(endpoint);
  logEvent({ level: "info", kind: "container-mcp", detail: "server started", meta: { url } });
  refreshBridge();
  return currentInfo;
}
async function stopContainerMcpServer() {
  if (starting) {
    try {
      await starting;
    } catch {
    }
  }
  setContainerEndpoint(null);
  const server = httpServer;
  httpServer = null;
  currentInfo = null;
  currentToken = "";
  if (server) {
    await new Promise((resolve2) => server.close(() => resolve2()));
  }
  try {
    rmSync(join(bridgeDir(), "container-server.token"), { force: true });
  } catch {
  }
  logEvent({ level: "info", kind: "container-mcp", detail: "server stopped" });
  refreshBridge();
}
function isContainerMcpServerRunning() {
  return !!httpServer;
}
function getContainerMcpServerInfo() {
  return currentInfo;
}
const DEFAULT_PROFILE = "web";
const STALE_EMPTY_LOCK_MS = 15e3;
function runCli$1(cmd, args, opts = {}) {
  return new Promise((resolve2) => {
    const child = spawn(cmd, args, {
      env: opts.env,
      windowsHide: true,
      shell: opts.shell ?? false,
      timeout: opts.timeoutMs
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      const s = String(d);
      stdout += s;
      opts.onData?.(s);
    });
    child.stderr?.on("data", (d) => {
      const s = String(d);
      stderr += s;
      opts.onData?.(s);
    });
    child.on("error", (err) => resolve2({ code: -1, stdout, stderr: stderr || err.message }));
    child.on("close", (code2) => resolve2({ code: code2 ?? -1, stdout, stderr }));
  });
}
function dshRoots() {
  return resolveDshRuntimeDirs();
}
function dshBinJs() {
  for (const root2 of dshRoots()) {
    const p = join(root2, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (existsSync(p)) return p;
  }
  return null;
}
function dshBinCandidates() {
  const out = [];
  for (const root2 of dshRoots()) {
    const bin = join(root2, "node_modules", ".bin");
    if (process.platform === "win32")
      out.push(join(bin, "dsh.cmd"), join(bin, "dsh"), join(root2, "dsh.cmd"), join(root2, "dsh"));
    else out.push(join(bin, "dsh"), join(root2, "dsh"));
  }
  return out;
}
function dshPackageDir() {
  for (const root2 of dshRoots()) {
    const p = join(root2, "node_modules", "@deepseek-ai", "dsh");
    if (existsSync(join(p, "package.json"))) return p;
  }
  return null;
}
let pnpmDirsPromise;
function pnpmBinDirs() {
  return pnpmDirsPromise ??= probePnpmBinDirs();
}
async function probePnpmBinDirs() {
  const marker = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const dirs = dshRoots().filter((r) => existsSync(join(r, marker)));
  if (!dirs.length) {
    const res = await runCli$1("npm", ["prefix", "-g"], {
      timeoutMs: 6e4,
      shell: process.platform === "win32"
    });
    const prefix = res.code === 0 ? res.stdout.trim() : "";
    const candidate = process.platform === "win32" ? prefix : join(prefix, "bin");
    if (candidate && existsSync(join(candidate, marker))) dirs.push(candidate);
  }
  return dirs;
}
function repairPnpmCmd(root2) {
  if (process.platform !== "win32") return;
  linkNativePnpm(root2);
  const mjs = join(root2, "node_modules", "pnpm", "bin", "pnpm.mjs");
  const cmd = join(root2, "pnpm.cmd");
  if (!existsSync(mjs) || !existsSync(cmd)) return;
  const desired = '@ECHO off\r\nSETLOCAL\r\nIF EXIST "%~dp0node.exe" (\r\n  "%~dp0node.exe" "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n) ELSE (\r\n  node "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n)\r\nENDLOCAL\r\nEXIT /b %ERRORLEVEL%\r\n';
  try {
    if (readFileSync(cmd, "utf-8") === desired) return;
    writeFileSync$1(cmd, desired, "utf-8");
    pnpmDirsPromise = void 0;
  } catch {
  }
}
function linkNativePnpm(root2) {
  const pkgDir = join(root2, "node_modules", "pnpm");
  const manifest = join(pkgDir, "package.json");
  if (!existsSync(manifest)) return;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifest, "utf-8"));
  } catch {
    return;
  }
  const target = Object.keys(pkg.optionalDependencies ?? {}).find((k) => k.startsWith("@pnpm/exe."));
  if (!target) return;
  const binFile = target.includes("win32-arm64") ? "pnpm-arm64.exe" : "pnpm.exe";
  const native = join(root2, "node_modules", ...target.split("/"), binFile);
  if (!existsSync(native)) return;
  try {
    const buf = readFileSync(native);
    for (const name of ["pnpm", "pn", "pnpx", "pnx"]) {
      for (const suffix of ["", ".exe"]) {
        const dest = join(pkgDir, name + suffix);
        if (name !== "pnpm" && !suffix && !existsSync(dest)) continue;
        writeFileSync$1(dest, buf);
      }
    }
  } catch {
  }
}
function pnpmMissingError() {
  return new Error(m("dsh.pnpmMissing"));
}
async function dshEnv(profileDir) {
  const nodeExe = resolveDshNodeExePath();
  const dirs = [
    dirname(nodeExe),
    ...await pnpmBinDirs(),
    ...dshRoots().flatMap((r) => [r, join(r, "node_modules", ".bin")])
  ];
  return envWithPATH(dirs, {
    DSH_HOME: join(profileDir, "..", ".."),
    DSH_NODE_PATH: nodeExe,
    // MCP hub catalog pointers: dsh's terminals inherit them to every plugin process
    ...bridgeEnvVars(),
    // shared workspace pointers: dsh's terminals inherit them to every plugin process too
    ...workspaceEnvVars()
  });
}
function validateProfileName(profile) {
  const p = profile.trim() || DEFAULT_PROFILE;
  if (!/^[\w.-]+$/.test(p) || p === "." || p === ".." || p === "node_modules") {
    throw new Error(m("dsh.invalidProfile", { profile }));
  }
  if (p.toLowerCase() === "desktop") throw new Error(m("dsh.reservedProfile"));
  return p;
}
function isDshInstalled() {
  return dshBinCandidates().some((p) => existsSync(p));
}
async function getDshStatus(profile = DEFAULT_PROFILE) {
  const safe = validateProfileName(profile);
  const profileDir = resolveDshProfileDir(safe);
  const base = {
    installed: false,
    profile: safe,
    profileDir,
    pnpmFound: (await pnpmBinDirs()).length > 0
  };
  const bin = dshBinCandidates().find((p) => existsSync(p));
  if (!bin)
    return {
      ...base,
      error: m("dsh.notInstalled")
    };
  const pkgDir = dshPackageDir();
  if (!pkgDir) return { ...base, binPath: bin, error: m("dsh.pkgNoManifest") };
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
    return { ...base, installed: true, version: pkg.version, binPath: bin };
  } catch (err) {
    return { ...base, binPath: bin, error: m("dsh.pkgBroken", { err: err.message }) };
  }
}
async function runDsh(args, opts = {}) {
  const status = await getDshStatus(opts.profile);
  if (!status.binPath) throw new Error(status.error || m("dsh.unavailable"));
  const viaNode = !/\.(cmd|bat)$/i.test(status.binPath);
  const res = await runCli$1(
    viaNode ? resolveDshNodeExePath() : status.binPath,
    viaNode ? [status.binPath, ...args] : args,
    {
      env: await dshEnv(status.profileDir),
      shell: process.platform === "win32" && !viaNode,
      timeoutMs: opts.timeoutMs ?? 10 * 6e4,
      onData: opts.onData
    }
  );
  if (res.code !== 0)
    throw new Error(
      res.stderr.slice(-2e3) || res.stdout.slice(-2e3) || m("dsh.exitCode", { code: res.code })
    );
  return res.stdout;
}
async function dshPluginForward(pnpmArgs, profile = DEFAULT_PROFILE, onData) {
  if (!(await pnpmBinDirs()).length) throw pnpmMissingError();
  return runDsh(["plugin", "--profile", profile, ...pnpmArgs], {
    timeoutMs: 15 * 6e4,
    profile,
    onData
  });
}
function readProfileManifest(profileDir) {
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf-8"));
  } catch {
    return { bundles: [], dependencies: {} };
  }
  const dependencies2 = Object.assign({}, pkg.dependencies || {});
  const dshSection = pkg.dsh || {};
  const profileSection = dshSection.profile || {};
  let bundles = [];
  if (Array.isArray(profileSection.bundles)) bundles = profileSection.bundles.map(String);
  else if (Array.isArray(dshSection.bundles))
    bundles = dshSection.bundles.map(String);
  else {
    try {
      const raw = JSON.parse(readFileSync(join(profileDir, "dsh.profile"), "utf-8"));
      if (Array.isArray(raw.bundles)) bundles = raw.bundles.map(String);
    } catch {
    }
  }
  return { bundles, dependencies: dependencies2 };
}
function listDshPlugins(profile = DEFAULT_PROFILE) {
  const profileDir = resolveDshProfileDir(profile);
  const { bundles, dependencies: dependencies2 } = readProfileManifest(profileDir);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [name, range2] of Object.entries(dependencies2)) {
    if (name.startsWith("@deepseek-ai/dsh-base")) continue;
    out.push({ name, version: String(range2), source: "profile" });
    seen.add(name);
  }
  for (const b of bundles) {
    if (seen.has(b)) continue;
    const version = installedBundleVersion(b, profileDir);
    out.push(
      version ? { name: b, version, source: "bundle", present: true } : { name: b, version: "", source: "bundle", present: false }
    );
  }
  return out;
}
function installedBundleVersion(name, profileDir) {
  const parts = name.split("/");
  for (const dir of bundleSearchDirs(profileDir)) {
    try {
      const manifest = join(dir, ...parts, "package.json");
      return JSON.parse(readFileSync(manifest, "utf-8")).version;
    } catch {
    }
  }
  return null;
}
function installedPkgMeta(name, profileDir) {
  const parts = name.split("/");
  for (const dir of bundleSearchDirs(profileDir)) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, ...parts, "package.json"), "utf-8"));
      const repo = pkg.repository;
      return {
        version: typeof pkg.version === "string" ? pkg.version : "",
        repository: typeof repo === "string" ? repo : repo?.url || (typeof pkg.homepage === "string" ? pkg.homepage : "")
      };
    } catch {
    }
  }
  return { version: "", repository: "" };
}
function bundleSearchDirs(profileDir) {
  const dirs = [join(profileDir, "node_modules")];
  for (const root2 of dshRoots()) {
    const nm = join(root2, "node_modules");
    dirs.push(nm, join(nm, "@deepseek-ai", "dsh", "node_modules"));
  }
  return dirs;
}
function createDshPage(profile, port) {
  const safe = validateProfileName(profile);
  const id2 = `dsh-${safe}`;
  const dir = join(resolvePagesDir(), id2);
  if (existsSync(join(dir, "container.json"))) throw new Error(m("dsh.pageExists", { id: id2 }));
  mkdirSync(dir, { recursive: true });
  const manifest = {
    name: `DSH (${safe})`,
    description: {
      zh: msgIn("zh", "dsh.profilePageDesc", { profile: safe }),
      en: msgIn("en", "dsh.profilePageDesc", { profile: safe })
    },
    kind: "dsh",
    dsh: { profile: safe, port }
  };
  writeFileSync$1(join(dir, "container.json"), JSON.stringify(manifest, null, 2));
  return id2;
}
function validateNpmSpec(spec) {
  const s = spec.trim();
  if (!/^(@[\w.-]+\/)?[\w.-]+(@([\d.x^~*|-]+|tag|alpha|beta|next|\*))?$/i.test(s) && !/^https?:\/\//i.test(s) && !/^git[@+]/i.test(s) && !/\.git(#.+)?$/.test(s)) {
    throw new Error(m("dsh.invalidSpec", { spec: s }));
  }
  return s;
}
async function installDshPlugin(spec, profile = DEFAULT_PROFILE) {
  const s = validateNpmSpec(spec);
  broadcastPluginOp({ name: s, done: false });
  const tee = pluginOutputTee(`plugin add ${s}`);
  try {
    await dshPluginForward(["add", s], profile, tee.onData);
    broadcastPluginOp({ name: s, done: true });
  } catch (err) {
    broadcastPluginOp({ name: s, done: true, error: err.message });
    throw err;
  } finally {
    tee.flush();
  }
}
const NOT_A_DEPENDENCY = /ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS|no such dependency found/i;
async function uninstallDshPlugin(name, profile = DEFAULT_PROFILE) {
  const s = validateNpmSpec(name);
  const tee = pluginOutputTee(`plugin remove ${s}`);
  try {
    await dshPluginForward(["remove", s], profile, tee.onData);
  } catch (err) {
    const raw = err.message;
    if (NOT_A_DEPENDENCY.test(raw)) throw new Error(m("dsh.notADependency", { name: s }));
    throw err;
  } finally {
    tee.flush();
  }
}
function pluginOutputTee(label) {
  let buf = "";
  const emit = (line) => {
    const trimmed = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
    if (trimmed) console.log(`[dsh] ${trimmed}`);
  };
  console.log(`[dsh] ${label} started`);
  return {
    onData(chunk) {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) emit(line);
    },
    flush() {
      if (buf) emit(buf);
      buf = "";
    }
  };
}
function broadcastPluginOp(p) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.OnDshPluginOp, p);
  }
}
async function updateDshPlugin(name, channel, gitUrl, profile = DEFAULT_PROFILE) {
  try {
    const result = await applyPluginUpdate(name, channel, gitUrl, profile);
    broadcastPluginOp({ name, done: true });
    return result;
  } catch (err) {
    broadcastPluginOp({ name, done: true, error: err.message });
    throw err;
  }
}
async function applyPluginUpdate(name, channel, gitUrl, profile = DEFAULT_PROFILE) {
  if (channel === "git") {
    if (!gitUrl) throw new Error(m("dsh.gitNeedsUrl"));
    const parsed = parseGitSpec(gitUrl);
    const repo = parsed ? parsed.repo : gitUrl;
    const ref2 = parsed?.ref;
    const installSpec = ref2 ? `${repo}#${ref2}` : `${repo}#${(await remoteHeadSha(repo)).slice(0, 8)}`;
    const tee2 = pluginOutputTee(`plugin update ${name} (git ${installSpec})`);
    try {
      await dshPluginForward(["add", installSpec], profile, tee2.onData);
    } finally {
      tee2.flush();
    }
    return m("dsh.updatedTo", { spec: installSpec });
  }
  const s = validateNpmSpec(name);
  const tee = pluginOutputTee(`plugin update ${s}`);
  try {
    await dshPluginForward(["update", s, "--latest"], profile, tee.onData);
  } finally {
    tee.flush();
  }
  return m("dsh.npmUpdated", { spec: s });
}
async function updateAllDshPlugins(profile = DEFAULT_PROFILE) {
  const current2 = new Map(listDshPlugins(profile).map((p) => [p.name, p.version]));
  const targets = (await checkDshPluginUpdates(profile)).filter((u) => u.updateAvailable);
  if (!targets.length) return "";
  const done = [];
  const failed = [];
  const total = targets.length;
  let index = 0;
  for (const u of targets) {
    index++;
    broadcastPluginOp({ name: u.name, done: false, index, total });
    try {
      const pinnedToGit = !!parseGitSpec(current2.get(u.name) || "");
      if (u.channel === "npm" && pinnedToGit && u.latest) {
        const spec = `${u.name}@${u.latest}`;
        await installDshPlugin(spec, profile);
        done.push(m("dsh.npmUpdated", { spec }));
      } else {
        done.push(await applyPluginUpdate(u.name, u.channel || "npm", u.gitUrl, profile));
      }
    } catch (err) {
      failed.push(`${u.name}: ${err.message}`);
    }
    broadcastPluginOp({ name: u.name, done: true });
  }
  if (!done.length) throw new Error(failed.join("\n") || m("dsh.unavailable"));
  return [...done, ...failed].join("\n").slice(-2e3);
}
function parseGitSpec(version) {
  const from = (repo, ref2) => ({
    repo,
    ref: ref2,
    isSha: !!ref2 && /^[0-9a-f]{7,40}$/i.test(ref2)
  });
  const m2 = /^github:([\w.-]+\/[\w.-]+?)(?:\.git)?(?:#(.+))?$/i.exec(version);
  if (m2) return from(`https://github.com/${m2[1]}.git`, m2[2]);
  const n = /^(?:git\+)?(https?:\/\/[^\s#]+\.git)(?:#(.+))?$/i.exec(version);
  if (n) return from(n[1], n[2]);
  return null;
}
async function latestGitTag(repo) {
  if (/[\s;`$&|]/.test(repo)) return { tag: null };
  const res = await runCli$1("git", ["ls-remote", "--tags", repo], { timeoutMs: 6e4 });
  if (res.code !== 0)
    return {
      tag: null,
      error: (res.stderr || res.stdout || `git ls-remote exited ${res.code}`).trim().slice(-300)
    };
  const tagSha = /* @__PURE__ */ new Map();
  const commitSha = /* @__PURE__ */ new Map();
  for (const line of res.stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [sha2, ref2] = parts;
    const deref = /^refs\/tags\/(.+)\^\{\}$/.exec(ref2);
    if (deref) {
      commitSha.set(deref[1], sha2);
      continue;
    }
    const m2 = /^refs\/tags\/(.+)$/.exec(ref2);
    if (m2) tagSha.set(m2[1], sha2);
  }
  let bestName = null;
  let bestVer = null;
  for (const name of tagSha.keys()) {
    const ver = name.replace(/^v/i, "");
    if (!/^\d+\.\d+\.\d+/.test(ver)) continue;
    if (!bestVer || isNewerVersion(bestVer, ver)) {
      bestVer = ver;
      bestName = name;
    }
  }
  if (!bestName) return { tag: null };
  const sha = commitSha.get(bestName) || tagSha.get(bestName) || "";
  return { tag: { version: bestName, sha } };
}
function parseSemver(s) {
  const clean = (s || "").replace(/^[\^~>=<*v]+/i, "").trim();
  const m2 = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(clean);
  if (!m2) return null;
  const pre = m2[4] ? m2[4].split(".").map((x) => /^\d+$/.test(x) ? parseInt(x, 10) : x) : [];
  return { major: +m2[1], minor: +m2[2], patch: +m2[3], pre };
}
function cmpPrerelease(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai === void 0) return -1;
    if (bi === void 0) return 1;
    if (ai === bi) continue;
    const aNum = typeof ai === "number";
    const bNum = typeof bi === "number";
    if (aNum && bNum) return ai < bi ? -1 : 1;
    if (aNum) return -1;
    if (bNum) return 1;
    return String(ai) < String(bi) ? -1 : 1;
  }
  return 0;
}
function isNewerVersion(installed2, latest) {
  const a = parseSemver(installed2);
  const b = parseSemver(latest);
  if (!a || !b) return false;
  if (a.major !== b.major) return b.major > a.major;
  if (a.minor !== b.minor) return b.minor > a.minor;
  if (a.patch !== b.patch) return b.patch > a.patch;
  return cmpPrerelease(a.pre, b.pre) < 0;
}
async function npmLatestVersion(name) {
  const res = await runCli$1("npm", ["view", name, "version", "--registry", npmRegistryWithSlash()], {
    timeoutMs: 3e4,
    shell: process.platform === "win32"
  });
  return res.code === 0 ? res.stdout.trim().replace(/^v/, "") : "";
}
function cleanVersion(s) {
  return s.replace(/^[\^~>=<*v]+/i, "").trim();
}
function isSemver(s) {
  return /^\d+\.\d+\.\d+/.test(s);
}
function normalizeRepoUrl$1(raw) {
  const s = (raw || "").trim().replace(/^git\+/i, "");
  if (!s) return null;
  const gh = /^(?:github[:/]|https?:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(s);
  if (gh) return `https://github.com/${gh[1]}.git`;
  if (/^(?:https?|ssh|git):\/\//i.test(s) || /^[\w.-]+@[\w.-]+:/i.test(s)) return s;
  return null;
}
async function npmRepositoryUrl(name) {
  const res = await runCli$1(
    "npm",
    ["view", name, "repository.url", "--registry", npmRegistryWithSlash()],
    { timeoutMs: 3e4, shell: process.platform === "win32" }
  );
  return res.code === 0 ? res.stdout.trim().replace(/^["']|["']$/g, "") : "";
}
function installedSemverOf(raw, git) {
  const v = cleanVersion(git ? git.ref || "" : raw);
  return isSemver(v) ? v : null;
}
async function describePluginUpdate(p, profileDir) {
  const gitDep = parseGitSpec(p.version);
  const meta = installedPkgMeta(p.name, profileDir);
  const npmInstalled = cleanVersion(meta.version || "");
  const installedSem = !gitDep && isSemver(npmInstalled) ? npmInstalled : installedSemverOf(p.version, gitDep);
  const repo = gitDep?.repo || normalizeRepoUrl$1(await npmRepositoryUrl(p.name)) || normalizeRepoUrl$1(meta.repository);
  const [npmRaw, gitLookup] = await Promise.all([
    npmLatestVersion(p.name),
    repo ? latestGitTag(repo) : Promise.resolve({
      tag: null,
      error: void 0
    })
  ]);
  const tag = gitLookup.tag;
  const gitErr = gitLookup.error;
  const withErr = (u) => gitErr ? { ...u, error: gitErr } : u;
  const npmSem = isSemver(cleanVersion(npmRaw)) ? cleanVersion(npmRaw) : null;
  const gitSem = tag && isSemver(cleanVersion(tag.version)) ? cleanVersion(tag.version) : null;
  if (gitDep && !installedSem && tag && repo) {
    const moved = (gitDep.ref || "").toLowerCase() !== tag.sha.toLowerCase();
    return moved ? withErr({
      name: p.name,
      updateAvailable: true,
      latest: tag.version,
      channel: "git",
      gitUrl: `${repo}#${tag.version}`
    }) : withErr({ name: p.name, updateAvailable: false, channel: "git" });
  }
  let best = null;
  if (npmSem) best = { ver: npmSem, channel: "npm" };
  if (gitSem && (!best || isNewerVersion(best.ver, gitSem)))
    best = {
      ver: gitSem,
      channel: "git",
      gitUrl: repo && tag ? `${repo}#${tag.version}` : void 0
    };
  if (!best) return withErr({ name: p.name, updateAvailable: false, channel: gitDep ? "git" : "npm" });
  const updateAvailable = installedSem ? isNewerVersion(installedSem, best.ver) : false;
  if (!updateAvailable)
    return withErr({ name: p.name, updateAvailable: false, channel: best.channel });
  return {
    name: p.name,
    updateAvailable: true,
    latest: best.channel === "git" && tag ? tag.version : best.ver,
    channel: best.channel,
    gitUrl: best.gitUrl
  };
}
async function checkDshPluginUpdates(profile = DEFAULT_PROFILE) {
  const profileDir = resolveDshProfileDir(profile);
  const plugins = listDshPlugins(profile).filter((p) => p.source === "profile");
  return Promise.all(
    plugins.map(
      (p) => describePluginUpdate(p, profileDir).catch(
        (e) => ({
          name: p.name,
          updateAvailable: false,
          error: e.message
        })
      )
    )
  );
}
async function remoteHeadSha(repoUrl) {
  if (/[\s;`$&|]/.test(repoUrl)) throw new Error(m("dsh.illegalRepoChars"));
  const res = await runCli$1("git", ["ls-remote", repoUrl, "HEAD"], { timeoutMs: 6e4 });
  if (res.code !== 0) throw new Error(res.stderr.slice(-500) || m("dsh.lsRemoteFail"));
  const sha = res.stdout.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(m("dsh.remoteHeadFail"));
  return sha;
}
function clearStaleDshLocks(homeDir) {
  let names2 = [];
  try {
    names2 = readdirSync(homeDir).filter((n) => n.endsWith(".lock"));
  } catch {
    return [];
  }
  const removed = [];
  for (const name of names2) {
    const file = join(homeDir, name);
    let raw = "";
    let mtimeMs = 0;
    try {
      raw = readFileSync(file, "utf-8").trim();
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      continue;
    }
    let stale;
    if (!raw) {
      stale = Date.now() - mtimeMs > STALE_EMPTY_LOCK_MS;
    } else {
      const pid = parseInt(raw, 10);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      stale = !isProcessAlive(pid);
    }
    if (!stale) continue;
    try {
      unlinkSync(file);
      removed.push(file);
    } catch {
    }
  }
  if (removed.length) console.warn(`[dsh] reclaimed stale writer lock(s): ${removed.join(", ")}`);
  return removed;
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
async function dshSpawnCommand(profile, port, mcpPatchFile) {
  const status = await getDshStatus(profile);
  if (!status.installed) throw new Error(status.error || m("dsh.unavailable"));
  const binJs = dshBinJs();
  if (!binJs) throw new Error(m("dsh.binMissing"));
  mkdirSync(status.profileDir, { recursive: true });
  clearStaleDshLocks(join(status.profileDir, "..", ".."));
  const patchArgs = mcpPatchFile ? ["--patch", mcpPatchFile] : [];
  return {
    cmd: resolveDshNodeExePath(),
    args: [
      binJs,
      "--profile",
      profile,
      ...patchArgs,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--no-open"
    ],
    cwd: status.profileDir,
    env: await dshEnv(status.profileDir)
  };
}
const dsh = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  checkDshPluginUpdates,
  clearStaleDshLocks,
  createDshPage,
  dshBinJs,
  dshPluginForward,
  dshSpawnCommand,
  getDshStatus,
  installDshPlugin,
  isDshInstalled,
  isNewerVersion,
  listDshPlugins,
  pnpmBinDirs,
  repairPnpmCmd,
  uninstallDshPlugin,
  updateAllDshPlugins,
  updateDshPlugin
}, Symbol.toStringTag, { value: "Module" }));
class PtySession {
  constructor(id2, title2, cwd, shell2, args, env2) {
    this.id = id2;
    this.title = title2;
    this.cwd = cwd;
    this.proc = pty.spawn(shell2, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: existsSync(cwd) ? cwd : os.homedir(),
      env: env2,
      ...WINPTY_BACKEND
    });
    this.proc.onData((chunk) => this.emitter.emit("data", chunk));
    this.proc.onExit(({ exitCode }) => this.emitter.emit("exit", exitCode ?? 0));
  }
  id;
  title;
  cwd;
  proc;
  emitter = new EventEmitter();
  on(event, cb) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  write(data) {
    try {
      this.proc.write(data);
    } catch {
    }
  }
  resize(cols, rows) {
    if (cols <= 0 || rows <= 0) return;
    try {
      this.proc.resize(cols, rows);
    } catch {
    }
  }
  kill() {
    try {
      this.proc.kill();
    } catch {
    }
  }
}
function expandTilde(cmd) {
  return cmd.replace(/(^|\s)~(?=[/\\]|$)/g, (_m, pre) => pre + os.homedir());
}
function whichOnPath(cmd, env2) {
  if (cmd.includes("/") || cmd.includes("\\")) return null;
  const pathKey = Object.keys(env2).find((k) => k.toUpperCase() === "PATH") || "PATH";
  const exts = process.platform === "win32" ? (env2.PATHEXT || ".CMD;.EXE;.BAT;.COM").split(";").map((e) => e.toLowerCase()) : [""];
  for (const dir of (env2[pathKey] || "").split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
async function terminalEnv() {
  const env2 = { ...process.env, TERM: "xterm-256color" };
  let nodeDir = "";
  try {
    nodeDir = dirname(getNodeExePath());
  } catch {
    nodeDir = dirname(process.execPath);
  }
  const dirs = [nodeDir, ...await pnpmBinDirs()].filter(Boolean);
  if (dirs.length) {
    const sep2 = process.platform === "win32" ? ";" : ":";
    const key = Object.keys(env2).find((k) => k.toUpperCase() === "PATH") || "PATH";
    env2[key] = [...dirs, env2[key] || ""].join(sep2);
  }
  return env2;
}
let shellCache = null;
function detectShells() {
  if (shellCache) return shellCache;
  const out = [];
  if (process.platform === "win32") {
    const sysRoot = process.env.SystemRoot || "C:\\Windows";
    out.push({ id: "powershell", label: "PowerShell", path: "powershell.exe", args: ["-NoLogo"] });
    out.push({ id: "cmd", label: "Command Prompt", path: "cmd.exe", args: [] });
    const pwsh = whichOnPath("pwsh.exe", process.env);
    if (pwsh) out.push({ id: "pwsh", label: "PowerShell 7", path: pwsh, args: ["-NoLogo"] });
    const bases = [
      process.env["ProgramFiles"],
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : ""
    ].filter(Boolean);
    let bash = "";
    for (const base of bases) {
      const c = join(base, "Git", "bin", "bash.exe");
      if (existsSync(c)) {
        bash = c;
        break;
      }
    }
    if (!bash) {
      const git = whichOnPath("git.exe", process.env);
      if (git) {
        const c = join(dirname(dirname(dirname(git))), "bin", "bash.exe");
        if (existsSync(c)) bash = c;
      }
    }
    if (bash) out.push({ id: "gitbash", label: "Git Bash", path: bash, args: ["-l"] });
    const wsl = join(sysRoot, "System32", "wsl.exe");
    if (existsSync(wsl)) out.push({ id: "wsl", label: "Ubuntu (WSL)", path: wsl, args: [] });
  } else {
    const seen = /* @__PURE__ */ new Set();
    const add = (id2, label, path2) => {
      if (path2 && existsSync(path2) && !seen.has(path2)) {
        seen.add(path2);
        out.push({ id: id2, label, path: path2, args: ["-l"] });
      }
    };
    const shell2 = process.env.SHELL;
    add("login", shell2 ? basename(shell2) : "Shell", shell2);
    add("bash", "bash", "/bin/bash");
    add("zsh", "zsh", "/bin/zsh");
  }
  shellCache = out;
  return out;
}
function defaultShellId() {
  if (process.platform === "win32") return "powershell";
  return detectShells().some((s) => s.id === "login") ? "login" : "bash";
}
function listShells() {
  const def = defaultShellId();
  return [...detectShells()].sort((a, b) => a.id === def ? -1 : b.id === def ? 1 : 0);
}
function resolveShell(id2) {
  const list = detectShells();
  const hit = id2 && list.find((s) => s.id === id2) || list.find((s) => s.id === defaultShellId()) || list[0];
  return hit ? { shell: hit.path, args: hit.args } : { shell: "powershell.exe", args: ["-NoLogo"] };
}
let counter = 0;
const sessions = /* @__PURE__ */ new Map();
const WINPTY_BACKEND = process.platform === "win32" ? { useConpty: false } : {};
class PtyManager {
  /** Start a shell rooted at `cwd`, titled `title`; returns its session descriptor.
      With `run`, the session executes that command line instead of an interactive shell; else it
      launches the picker's `shell` id (or the default when unset). */
  async start(cwd, title2, opts) {
    const id2 = `pty-${Date.now().toString(36)}-${++counter}`;
    let shell2;
    let args;
    let env2 = await terminalEnv();
    const run = opts?.run;
    if (run?.command.trim()) {
      const [cmd, ...rest] = expandTilde(run.command.trim()).split(/\s+/);
      env2 = { ...env2, ...run.env || {} };
      shell2 = cmd === "node" ? getNodeExePath() : whichOnPath(cmd, env2) ?? cmd;
      args = rest;
      if (cmd !== "node" && !existsSync(shell2)) {
        throw new Error(m("pty.commandNotFound", { cmd }));
      }
    } else {
      ({ shell: shell2, args } = resolveShell(opts?.shell));
    }
    const session2 = new PtySession(id2, title2, cwd, shell2, args, env2);
    session2.on("exit", () => sessions.delete(id2));
    sessions.set(id2, session2);
    return { id: id2, title: title2, cwd: session2.cwd };
  }
  get(id2) {
    return sessions.get(id2);
  }
  write(id2, data) {
    sessions.get(id2)?.write(data);
  }
  resize(id2, cols, rows) {
    sessions.get(id2)?.resize(cols, rows);
  }
  kill(id2) {
    const s = sessions.get(id2);
    if (!s) return;
    s.kill();
    sessions.delete(id2);
  }
  killAll() {
    for (const s of [...sessions.values()]) s.kill();
    sessions.clear();
  }
}
const MAX_ATTEMPTS = 2;
const OWNER_PREFIX = "autopilot:";
function depsSatisfied(task, done) {
  return (task.deps ?? []).every((d) => done.has(d));
}
function pickNextTask(tasks, busy) {
  const done = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
  let best = null;
  for (const t of tasks) {
    if (t.status !== "todo") continue;
    if (t.owner) continue;
    if (busy.has(t.id)) continue;
    if ((t.attempts ?? 0) >= MAX_ATTEMPTS) continue;
    if (!depsSatisfied(t, done)) continue;
    if (!best || t.at < best.at) best = t;
  }
  return best;
}
function safeField(s) {
  return s.replace(/[\x00-\x1f\x7f]/g, " ");
}
function buildPrompt(task, template) {
  const title2 = safeField(task.title);
  const id2 = safeField(task.id);
  const deps = (task.deps ?? []).map(safeField).join(", ") || "无";
  if (template && template.trim()) {
    return template.replace(/\{title\}/g, () => title2).replace(/\{id\}/g, () => id2).replace(/\{deps\}/g, () => deps);
  }
  return `请完成以下任务：
标题：${title2}
编号：${id2}
依赖：${deps}
完成后，务必调用 dsh-workspace 的 workspace_complete（taskId="${id2}"）回填你的结果。`;
}
class TaskDispatcher {
  deps;
  inFlight = /* @__PURE__ */ new Set();
  constructor(deps) {
    this.deps = deps;
  }
  now() {
    return this.deps.now?.() ?? Date.now();
  }
  /** Number of tasks currently dispatched and awaiting their executor's exit. */
  get busyCount() {
    return this.inFlight.size;
  }
  tick() {
    const s = this.deps.settings();
    if (!s.enabled) return;
    const registry2 = this.deps.getRegistry();
    if (!registry2 || !s.executorPageId) return;
    const page = registry2.get(s.executorPageId);
    if (!page || page.kind !== "terminal") return;
    const concurrency = Math.max(1, s.concurrency || 1);
    const tasks = this.deps.readTasks();
    while (this.inFlight.size < concurrency) {
      const next2 = pickNextTask(tasks, this.inFlight);
      if (!next2) break;
      this.inFlight.add(next2.id);
      void this.dispatch(next2, page, s);
    }
  }
  async dispatch(task, page, s) {
    const at = this.now();
    const fresh = this.deps.readTasks();
    const t = fresh.find((x) => x.id === task.id);
    if (!t) {
      this.inFlight.delete(task.id);
      return;
    }
    t.status = "doing";
    t.owner = `${OWNER_PREFIX}${page.id}`;
    t.dispatchedAt = at;
    t.attempts = (t.attempts ?? 0) + 1;
    t.at = at;
    this.deps.writeTasks(fresh);
    this.deps.log({ level: "info", detail: `派发给执行页`, taskId: task.id, pageId: page.id });
    const prompt = buildPrompt(task, s.prompt);
    try {
      const exec = await this.deps.executor.run(page, task, prompt);
      const code2 = await exec.exited;
      this.reconcile(task.id, code2);
    } catch (err) {
      this.deps.log({
        level: "error",
        detail: `执行器启动失败：${err?.message ?? String(err)}`,
        taskId: task.id,
        pageId: page.id
      });
      this.reconcile(task.id, -1);
    }
  }
  /** Reconcile one finished dispatch against the shared queue's truth, then look for more work. */
  reconcile(taskId, code2) {
    this.inFlight.delete(taskId);
    const tasks = this.deps.readTasks();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) {
      this.deps.log({ level: "warn", detail: `任务已不存在，跳过收尾`, taskId });
      this.tick();
      return;
    }
    if (t.status === "done") {
      this.deps.log({ level: "info", detail: `由 agent 回填完成`, taskId });
    } else if (code2 === 0) {
      t.status = "done";
      t.at = this.now();
      if (!t.result) t.result = "容器代记：执行器正常退出，但 agent 未回填结果";
      this.deps.writeTasks(tasks);
      this.deps.log({ level: "info", detail: `执行器退出(0)，容器代为记为完成`, taskId });
    } else {
      t.status = "todo";
      delete t.owner;
      delete t.dispatchedAt;
      this.deps.writeTasks(tasks);
      this.deps.log({
        level: "warn",
        detail: `执行器异常退出(${code2})，退回待办（已试 ${t.attempts ?? 0} 次）`,
        taskId
      });
    }
    this.tick();
  }
}
const BOOT_INJECT_MS = 3500;
const POLL_MS = 15e3;
function ptyTextForLog(chunk) {
  return chunk.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b[@-Z\\-_]/g, "").replace(/\r\n?/g, "\n");
}
class HeadlessExecutor {
  pty = new PtyManager();
  async run(page, task, prompt) {
    const env2 = { ...buildPageEnv(page), ...bridgeEnvVars(), ...workspaceEnvVars() };
    const info = await this.pty.start(page.dir, `autopilot:${task.id}`, {
      run: { command: expandStartCommand(page.startCommand), env: env2 }
    });
    const session2 = this.pty.get(info.id);
    if (!session2) throw new Error("pty session vanished right after start");
    session2.on("data", (chunk) => logPageLine(page.id, ptyTextForLog(String(chunk))));
    const exited = new Promise((resolve2) => {
      session2.on("exit", (code2) => resolve2(Number(code2)));
    });
    setTimeout(() => {
      try {
        session2.write(`
${prompt}
`);
      } catch {
      }
    }, BOOT_INJECT_MS);
    return { exited };
  }
}
let dispatcher = null;
let offTasksChanged = null;
let pollTimer = null;
function initAutopilot(getRegistry) {
  if (dispatcher) return;
  dispatcher = new TaskDispatcher({
    getRegistry,
    executor: new HeadlessExecutor(),
    settings: () => {
      const s = getSettings();
      return {
        enabled: !!s.autopilotEnabled,
        executorPageId: s.autopilotExecutorPage,
        concurrency: s.autopilotConcurrency ?? 1,
        prompt: s.autopilotPrompt
      };
    },
    readTasks: () => normalizeTasks(readWorkspace().tasks),
    writeTasks: (tasks) => {
      writeWorkspace({ tasks });
    },
    log: (e) => logEvent({
      level: e.level,
      kind: "autopilot",
      pageId: e.pageId,
      detail: e.detail,
      ...e.taskId ? { meta: { taskId: e.taskId } } : {}
    })
  });
  offTasksChanged = onWorkspaceTasksChanged(() => dispatcher?.tick());
  pollTimer = setInterval(() => dispatcher?.tick(), POLL_MS);
  dispatcher.tick();
}
function disposeAutopilot() {
  offTasksChanged?.();
  offTasksChanged = null;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  dispatcher = null;
}
function kickAutopilot() {
  dispatcher?.tick();
}
const ok = (data) => ({ ok: true, data });
const fail = (err) => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err)
});
const MODIFIERS = {
  ctrl: "ctrl",
  control: "ctrl",
  cmd: "meta",
  command: "meta",
  meta: "meta",
  super: "meta",
  win: "meta",
  winkeys: "meta",
  alt: "alt",
  option: "alt",
  shift: "shift"
};
const KEY_ALIASES = {
  escape: "esc",
  " ": "space",
  spacebar: "space",
  delete: "del",
  insert: "ins",
  pageup: "pgup",
  pagedown: "pgdn",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  backquote: "`",
  graveaccent: "`",
  plus: "+",
  numpadadd: "+"
};
function normalizeKey(raw) {
  const lowered = (raw || "").toLowerCase();
  return KEY_ALIASES[lowered] ?? lowered.trim();
}
function normalizeCode(code2) {
  const c = (code2 || "").trim();
  if (!c) return "";
  const mm = c.match(/^Key([A-Z])$/);
  if (mm) return mm[1].toLowerCase();
  const num = c.match(/^Digit(\d)$/);
  if (num) return num[1];
  return normalizeKey(c);
}
function parseAccelerator(accel) {
  const text = (accel || "").trim();
  if (!text) return null;
  const parts = text.split(/\+(?=\S)/);
  const key = normalizeKey(parts.pop());
  if (!key) return null;
  const out = { key, ctrl: false, shift: false, alt: false, meta: false };
  for (const raw of parts) {
    const name = raw.trim().toLowerCase();
    if (name === "cmdorctrl" || name === "commandorcontrol" || name === "ctrlorcommand") {
      out.ctrl = true;
      continue;
    }
    const slot = MODIFIERS[name];
    if (slot === "ctrl" || slot === "shift" || slot === "alt" || slot === "meta") out[slot] = true;
    else return null;
  }
  const dedicated = /^f\d{1,2}$/.test(key) || ["esc", "space", "tab", "enter", "up", "down", "left", "right"].includes(key);
  if (!out.ctrl && !out.alt && !out.meta && !dedicated) return null;
  return out;
}
function matchesAccelerator(accel, e) {
  const parts = parseAccelerator(accel);
  if (!parts) return false;
  const key = normalizeKey(e.key) || normalizeCode(e.code);
  if (!key || key !== parts.key) return false;
  return Boolean(e.ctrl) === parts.ctrl && Boolean(e.shift) === parts.shift && Boolean(e.alt) === parts.alt && Boolean(e.meta) === parts.meta;
}
function makeGit(dir) {
  const options = { baseDir: dir, maxConcurrentProcesses: 4 };
  return simpleGit(options);
}
function normalizeRepoUrl(url) {
  return url.trim().replace(/\/+$/, "").replace(/^(https?:\/\/)[^@/\s]+@/i, "$1");
}
function isSshRemote(url) {
  return /^ssh:\/\//i.test(url) || /^[^@\s/]+@[^:\s]+:/.test(url.trim());
}
function recloneUrl(url) {
  return isSshRemote(url) ? url : normalizeRepoUrl(url).replace(/^(https?:\/\/)[^@/\s]+@/i, "$1");
}
async function cloneWithAuthFallback(dir, url, onProgress) {
  const makeGit2 = () => onProgress ? simpleGit({
    baseDir: process.cwd(),
    progress: (ev) => {
      onProgress({
        stage: String(ev.stage),
        percent: Number(ev.progress) || 0,
        processed: ev.processed,
        total: ev.total
      });
    }
  }) : simpleGit({ baseDir: process.cwd() });
  try {
    await makeGit2().clone(url, dir);
  } catch (err) {
    const fallback = recloneUrl(url);
    if (fallback === normalizeRepoUrl(url)) throw err;
    await makeGit2().clone(fallback, dir);
  }
}
async function checkOne(name, dir, isContainer) {
  const base = { name, dir, isContainer, ok: false };
  try {
    if (!existsSync(join(dir, ".git"))) {
      return { ...base, error: m("git.notRepo") };
    }
    const git = makeGit(dir);
    const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    const localHead = (await git.revparse(["HEAD"])).trim();
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    if (!origin?.refs.fetch) return { ...base, branch, localHead, error: m("git.noOrigin") };
    const ls = await git.listRemote([origin.refs.fetch]);
    const headLine = ls.split("\n").find((l) => l.includes(`refs/heads/${branch}`)) || ls.split("\n").find((l) => l.includes("HEAD"));
    if (!headLine) return { ...base, branch, localHead, error: m("git.branchMissing", { branch }) };
    const remoteHead = headLine.split(/\s+/)[0];
    return {
      ...base,
      ok: true,
      branch,
      localHead,
      remoteHead,
      hasUpdate: remoteHead !== localHead
    };
  } catch (err) {
    return { ...base, error: err.message };
  }
}
async function performUpdate$1(target) {
  try {
    const git = makeGit(target.dir);
    const status = await git.status();
    if (!status.isClean()) {
      return {
        name: target.name,
        ok: false,
        updated: false,
        error: m("git.dirtySkipped")
      };
    }
    const before = (await git.revparse(["HEAD"])).trim();
    await git.pull(["--ff-only"]);
    const after = (await git.revparse(["HEAD"])).trim();
    return { name: target.name, ok: true, updated: before !== after };
  } catch (err) {
    return { name: target.name, ok: false, updated: false, error: err.message };
  }
}
function runCli(cmd, args, opts = {}) {
  return new Promise((resolve2) => {
    const child = spawn(cmd, args, {
      env: opts.env,
      windowsHide: true,
      shell: false,
      timeout: opts.timeoutMs
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => stdout += String(d));
    child.stderr?.on("data", (d) => stderr += String(d));
    child.on("error", (err) => resolve2({ code: -1, stdout, stderr: stderr || err.message }));
    child.on("close", (code2) => resolve2({ code: code2 ?? -1, stdout, stderr }));
  });
}
function openclawEntryCandidates() {
  const roots = [
    join(app$1.getPath("userData"), "openclaw"),
    join(process.resourcesPath || "", "openclaw"),
    join(app$1.getAppPath(), "resources", "openclaw"),
    join(process.cwd(), "resources", "openclaw")
  ].filter(Boolean);
  const entries2 = ["node_modules", join("lib", "node_modules")];
  const out = [];
  for (const root2 of roots)
    for (const e of entries2) out.push(join(root2, e, "openclaw", "openclaw.mjs"));
  return out;
}
function resolveOpenclawCommand() {
  const script = openclawEntryCandidates().find((p) => existsSync(p));
  if (!script) return null;
  return { cmd: getNodeExePath(), script };
}
function openclawEnv(extra = {}) {
  return bundledEnv({
    OPENCLAW_STATE_DIR: resolveOpenclawHome(),
    ...bridgeEnvVars(),
    // and the shared workspace pointers, so openclaw reads/writes the one container context
    ...workspaceEnvVars(),
    ...extra
  });
}
function isOpenclawInstalled() {
  return openclawEntryCandidates().some((p) => existsSync(p));
}
function openclawVersion() {
  const roots = [
    join(app$1.getPath("userData"), "openclaw"),
    join(process.resourcesPath || "", "openclaw"),
    join(app$1.getAppPath(), "resources", "openclaw"),
    join(process.cwd(), "resources", "openclaw")
  ].filter(Boolean);
  for (const root2 of roots)
    for (const e of ["node_modules", join("lib", "node_modules")]) {
      try {
        return JSON.parse(readFileSync(join(root2, e, "openclaw", "package.json"), "utf-8")).version ?? void 0;
      } catch {
      }
    }
  return void 0;
}
async function getOpenclawStatus() {
  const home = resolveOpenclawHome();
  const base = { installed: false, home, port: OPENCLAW_DEFAULT_PORT };
  const resolved = resolveOpenclawCommand();
  if (!resolved)
    return {
      ...base,
      error: m("openclaw.cliMissing")
    };
  try {
    const res = await runCli(resolved.cmd, [resolved.script, "--version"], {
      env: openclawEnv(),
      timeoutMs: 3e4
    });
    const out = res.stdout.trim();
    if (res.code !== 0)
      return {
        ...base,
        binPath: resolved.script,
        error: res.stderr.slice(-500) || m("openclaw.versionFail", { code: res.code })
      };
    return {
      ...base,
      installed: true,
      binPath: resolved.script,
      version: out.replace(/^v/, "") || void 0
    };
  } catch (err) {
    return {
      ...base,
      binPath: resolved.script,
      error: m("openclaw.unavailable", { err: err.message })
    };
  }
}
function openclawEnvVars() {
  return [
    {
      key: "OPENCLAW_HOME",
      label: {
        zh: msgIn("zh", "openclaw.homeLabel"),
        en: msgIn("en", "openclaw.homeLabel")
      },
      defaultPath: "~/.openclaw",
      description: {
        zh: msgIn("zh", "openclaw.homeDesc"),
        en: msgIn("en", "openclaw.homeDesc")
      }
    }
  ];
}
function createOpenclawPage(port = OPENCLAW_DEFAULT_PORT) {
  const p = Number(port) > 0 ? Number(port) : OPENCLAW_DEFAULT_PORT;
  const id2 = "openclaw";
  const dir = join(resolvePagesDir(), id2);
  mkdirSync(dir, { recursive: true });
  const manifest = {
    name: "OpenClaw Gateway",
    description: {
      zh: msgIn("zh", "openclaw.pageDesc"),
      en: msgIn("en", "openclaw.pageDesc")
    },
    kind: "openclaw",
    openclaw: { port: p },
    envVars: openclawEnvVars()
  };
  writeFileSync$1(join(dir, "container.json"), JSON.stringify(manifest, null, 2));
  return id2;
}
function refreshBuiltinEnvVars(id2, envVars) {
  const metaFile = join(resolvePagesDir(), id2, "container.json");
  if (!existsSync(metaFile)) return;
  try {
    const raw = JSON.parse(readFileSync(metaFile, "utf-8"));
    const cur = Array.isArray(raw.envVars) ? raw.envVars : [];
    if (JSON.stringify(cur) === JSON.stringify(envVars)) return;
    writeFileSync$1(metaFile, JSON.stringify({ ...raw, envVars }, null, 2));
  } catch {
  }
}
function dshEnvVars() {
  return [
    {
      key: "DSH_HOME",
      label: {
        zh: msgIn("zh", "dsh.homeLabel"),
        en: msgIn("en", "dsh.homeLabel")
      },
      defaultPath: "~/.dsh",
      description: {
        zh: msgIn("zh", "dsh.homeDesc"),
        en: msgIn("en", "dsh.homeDesc")
      }
    }
  ];
}
function ensureDefaultOpenclawPage() {
  const metaFile = join(resolvePagesDir(), "openclaw", "container.json");
  if (existsSync(metaFile)) {
    refreshBuiltinEnvVars("openclaw", openclawEnvVars());
    return;
  }
  try {
    createOpenclawPage(OPENCLAW_DEFAULT_PORT);
  } catch {
  }
}
function createDshWebPage() {
  const dir = join(resolvePagesDir(), "dsh-web");
  mkdirSync(dir, { recursive: true });
  const manifest = {
    name: "DSH (web)",
    description: {
      zh: msgIn("zh", "dsh.profilePageDesc", { profile: "web" }),
      en: msgIn("en", "dsh.profilePageDesc", { profile: "web" })
    },
    kind: "dsh",
    dsh: { profile: "web", port: 8899 },
    envVars: dshEnvVars()
  };
  writeFileSync$1(join(dir, "container.json"), JSON.stringify(manifest, null, 2));
}
function ensureBuiltinPages() {
  removeLegacyBuiltinPages();
  const destRoot = resolvePagesDir();
  const srcRoot = app$1.isPackaged ? join(process.resourcesPath || "", "pages") : destRoot;
  for (const id2 of ["dsh-web"]) {
    const src = join(srcRoot, id2);
    const dest = join(destRoot, id2);
    if (!existsSync(src)) continue;
    if (existsSync(join(dest, "container.json"))) continue;
    try {
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
    } catch {
    }
  }
  if (!existsSync(join(destRoot, "dsh-web", "container.json"))) createDshWebPage();
  refreshBuiltinEnvVars("dsh-web", dshEnvVars());
  try {
    const s = getSettings();
    const alive = (pageId) => existsSync(join(destRoot, pageId, "container.json"));
    const dv = s.defaultView;
    if (dv.kind === "page" && !alive(dv.pageId)) setDefaultView({ kind: "none" });
    const freshAuto = s.autoStartPages.filter(alive);
    if (freshAuto.length !== s.autoStartPages.length) updateSettings({ autoStartPages: freshAuto });
  } catch {
  }
}
function removeLegacyBuiltinPages() {
  if (getSettings().legacyBuiltinPagesPruned) return;
  const retired = ["codex", "dsh-plugin-market"];
  for (const id2 of retired) {
    const dir = join(resolvePagesDir(), id2);
    if (!existsSync(dir)) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
      console.log(`[pages] removed retired builtin page: ${id2}`);
    } catch (err) {
      console.warn(`[pages] failed to remove retired builtin ${id2}:`, err.message);
    }
  }
  try {
    const s = getSettings();
    const dv = s.defaultView;
    const staleAutoStart = s.autoStartPages.some((id2) => retired.includes(id2));
    const staleDefault = dv.kind === "page" && retired.includes(dv.pageId);
    if (staleAutoStart)
      updateSettings({ autoStartPages: s.autoStartPages.filter((id2) => !retired.includes(id2)) });
    if (staleDefault) setDefaultView({ kind: "none" });
  } catch {
  }
  try {
    updateSettings({ legacyBuiltinPagesPruned: true });
  } catch {
  }
}
function openclawSpawnSpec(port, mcpServers = []) {
  const resolved = resolveOpenclawCommand();
  if (!resolved) throw new Error(m("openclaw.cliMissingShort"));
  const home = resolveOpenclawHome();
  mkdirSync(home, { recursive: true });
  const p = Number(port) > 0 ? Number(port) : OPENCLAW_DEFAULT_PORT;
  ensureOpenclawConfig(home, p);
  try {
    initializeOpenclawToken();
  } catch (err) {
    console.warn("[openclaw] durable gateway token seed failed:", err.message);
  }
  try {
    syncOpenclawMcpConfig(mcpServers, openclawConfigPath());
  } catch (err) {
    console.warn("[openclaw] mcp bridge sync failed:", err.message);
  }
  return {
    cmd: resolved.cmd,
    // `gateway` is a command group; the foreground runner is `gateway run`. Bare
    // `gateway --port` only prints help and never binds. --force clears any stale
    // listener on the port so a restart doesn't hang waiting on the old process.
    // --allow-unconfigured is a safety net: even if ensureOpenclawConfig's seed write
    // fails (AV/permission/home mismatch), openclaw won't exit 78 on "Missing config".
    args: [
      resolved.script,
      "gateway",
      "run",
      "--force",
      "--allow-unconfigured",
      "--port",
      String(p)
    ],
    cwd: home,
    env: openclawEnv()
  };
}
async function resolveOpenclawLaunchUrl() {
  const resolved = resolveOpenclawCommand();
  if (!resolved) return null;
  try {
    const res = await runCli(resolved.cmd, [resolved.script, "dashboard", "--json"], {
      env: openclawEnv(),
      timeoutMs: 3e4
    });
    const out = res.stdout;
    const obj = JSON.parse(out.slice(out.indexOf("{")));
    return obj.ok && obj.browserUrl ? obj.browserUrl : null;
  } catch {
    return null;
  }
}
function openclawConfigPath() {
  return (process.env.OPENCLAW_CONFIG_PATH || "").trim() || join(resolveOpenclawHome(), "openclaw.json");
}
function getOpenclawGatewayToken() {
  const envToken = (process.env.OPENCLAW_GATEWAY_TOKEN || "").trim();
  const cfgPath = openclawConfigPath();
  let configToken = "";
  try {
    if (existsSync(cfgPath)) {
      const parsed = JSON.parse(readFileSync(cfgPath, "utf-8"));
      const t = parsed?.gateway?.auth?.token;
      if (typeof t === "string") configToken = t.trim();
    }
  } catch {
  }
  if (configToken) return { token: configToken, source: "config" };
  if (envToken) return { token: envToken, source: "env" };
  return null;
}
function initializeOpenclawToken(rotate = false) {
  const cfgPath = openclawConfigPath();
  let cfg = {};
  if (existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(cfgPath, "utf-8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        cfg = parsed;
      }
    } catch (err) {
      throw new Error(
        m("openclaw.configUnreadable", { path: cfgPath, err: err.message })
      );
    }
  }
  const gateway = cfg.gateway && typeof cfg.gateway === "object" ? cfg.gateway : {};
  const auth = gateway.auth && typeof gateway.auth === "object" ? gateway.auth : {};
  const existing = typeof auth.token === "string" ? auth.token.trim() : "";
  if (existing && !rotate) return { token: existing, created: false };
  const token = randomBytes(32).toString("base64url");
  auth.token = token;
  gateway.auth = auth;
  if (!("mode" in gateway)) gateway.mode = "local";
  cfg.gateway = gateway;
  try {
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync$1(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  } catch (err) {
    throw new Error(m("openclaw.tokenWriteFail", { err: err.message }));
  }
  return { token, created: true };
}
function ensureOpenclawConfig(home, port) {
  const cfgPath = join(home, "openclaw.json");
  if (existsSync(cfgPath)) return;
  try {
    writeFileSync$1(cfgPath, JSON.stringify({ gateway: { mode: "local", port } }, null, 2) + "\n");
  } catch {
  }
}
const openclaw = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createOpenclawPage,
  ensureBuiltinPages,
  ensureDefaultOpenclawPage,
  getOpenclawGatewayToken,
  getOpenclawStatus,
  initializeOpenclawToken,
  isOpenclawInstalled,
  openclawSpawnSpec,
  openclawVersion,
  resolveOpenclawLaunchUrl
}, Symbol.toStringTag, { value: "Module" }));
function registryUrl() {
  const picked = (getSettings().npmRegistry || "").trim();
  const base = picked || process.env.npm_config_registry || NPM_REGISTRY_DEFAULT;
  return `${base.replace(/\/+$/, "")}/`;
}
const DSH_PKG = "@deepseek-ai/dsh";
const OPENCLAW_PKG = "openclaw";
function dshChannel() {
  return getSettings().dshChannel === "latest" ? "latest" : "alpha";
}
const containerName = () => m("app.title");
const CACHE_TTL_MS = 5 * 601e3;
let cache = null;
async function fetchNpmLatest(name, tag = "latest") {
  const url = new URL(
    encodeURIComponent(name).replace(/^%40/, "@") + `/${encodeURIComponent(tag)}`,
    registryUrl()
  ).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15e3) });
    if (!res.ok) return null;
    const json = await res.json();
    return json.version || null;
  } catch {
    return null;
  }
}
function semverTuple(v) {
  return (v.replace(/^v/, "").split(/[-+]/)[0].match(/\d+/g) || []).map(Number);
}
function isNewer(current2, latest) {
  const a = semverTuple(current2);
  const b = semverTuple(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d > 0) return true;
    if (d < 0) return false;
  }
  return false;
}
function readPkgJson(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    if (pkg?.name && pkg?.version) return { name: String(pkg.name), version: String(pkg.version) };
  } catch {
  }
  return null;
}
async function checkPage(p) {
  if (p.builtin) {
    return {
      name: p.name,
      dir: p.dir,
      isContainer: false,
      ok: true,
      hasUpdate: false,
      source: "builtin",
      action: "none",
      canAutoUpdate: false,
      // lets the panel offer 重置 (re-seed pages/<id> from the bundled original)
      pageId: p.id
    };
  }
  const gitRes = await checkOne(p.name, p.dir, false);
  if (gitRes.ok) return { ...gitRes, source: "git", action: "pull", canAutoUpdate: true };
  const pkg = readPkgJson(p.dir);
  if (!pkg) return { ...gitRes, source: "git", canAutoUpdate: false };
  const latest = await fetchNpmLatest(pkg.name);
  if (!latest)
    return {
      name: p.name,
      dir: p.dir,
      isContainer: false,
      ok: false,
      source: "npm",
      currentVersion: pkg.version,
      error: m("upd.registryUnreachable")
    };
  return {
    name: p.name,
    dir: p.dir,
    isContainer: false,
    ok: true,
    source: "npm",
    packageName: pkg.name,
    currentVersion: pkg.version,
    latestVersion: latest,
    hasUpdate: isNewer(pkg.version, latest),
    canAutoUpdate: false,
    action: "manual"
  };
}
async function checkBuiltin(name, dir, packageName, currentVersion, tag = "latest") {
  const base = {
    name,
    dir,
    isContainer: false,
    ok: false,
    source: "builtin",
    packageName,
    action: "reprovision",
    canAutoUpdate: true
  };
  if (!currentVersion) return { ...base, error: m("upd.versionNotDetected") };
  const latest = await fetchNpmLatest(packageName, tag);
  if (!latest) return { ...base, currentVersion, error: m("upd.registryUnreachable") };
  return {
    ...base,
    ok: true,
    currentVersion,
    latestVersion: latest,
    hasUpdate: isNewer(currentVersion, latest)
  };
}
async function checkNpmCapability(p) {
  const base = {
    name: p.name,
    dir: p.capabilityDir || p.dir,
    isContainer: false,
    ok: false,
    source: "npm",
    packageName: p.npmPackage,
    capabilityId: p.id,
    action: "reprovision",
    canAutoUpdate: true
  };
  const capDir = p.capabilityDir;
  const pkg = p.npmPackage;
  if (!capDir || !pkg) return { ...base, error: m("upd.versionNotDetected") };
  const current2 = mcpPkgVersion(pkg, capDir);
  if (!current2 || resolveMcpPkgEntry(pkg, capDir) === null)
    return { ...base, error: m("upd.versionNotDetected") };
  const latest = await fetchNpmLatest(pkg);
  if (!latest) return { ...base, currentVersion: current2, error: m("upd.registryUnreachable") };
  return {
    ...base,
    ok: true,
    currentVersion: current2,
    latestVersion: latest,
    hasUpdate: isNewer(current2, latest)
  };
}
async function computeAll(pages) {
  const name = containerName();
  return Promise.all([
    // Both packaged and dev detect the container's own update the same way: compare the
    // running version against the `release` branch tip (over-the-air app.asar channel).
    // On relaunch, relaunchToApplyStaged swaps a staged asar into resources/ in place
    // (packaged only — a dev checkout just stages the download, since out/ isn't the running asar).
    checkAsarUpdate(name, resolveInstallDir()),
    ...pages.filter((p) => !p.id.startsWith("__") && !p.npmPackage).map(checkPage),
    ...pages.filter((p) => p.npmPackage).map(checkNpmCapability),
    checkBuiltin(
      m("upd.dshName"),
      join(app$1.getPath("userData"), "dsh"),
      DSH_PKG,
      (await getDshStatus()).version,
      dshChannel()
    ),
    checkBuiltin("OpenClaw", openclawRoot() || "", OPENCLAW_PKG, openclawVersion()),
    checkMcpPackages()
  ]);
}
async function checkUpdates(pages, force = false) {
  if (cache && !force && Date.now() - cache.at < CACHE_TTL_MS) return cache.results;
  const results = await computeAll(pages);
  cache = { at: Date.now(), results };
  return results;
}
function clearUpdateCache() {
  cache = null;
}
function openclawRoots() {
  return [
    join(app$1.getPath("userData"), "openclaw"),
    join(process.resourcesPath || "", "openclaw"),
    join(app$1.getAppPath(), "resources", "openclaw"),
    join(process.cwd(), "resources", "openclaw")
  ].filter(Boolean);
}
function openclawRoot() {
  return openclawRoots().find((r) => existsSync(join(r, "node_modules", "openclaw"))) || openclawRoots()[0] || null;
}
function bundledNpmCli$1() {
  return join(dirname(getNodeExePath()), "node_modules", "npm", "bin", "npm-cli.js");
}
async function runNpm(cmd, args, env2, timeoutMs, onLine) {
  const res = await new Promise((resolve2) => {
    const argv = onLine ? [...args, "--loglevel=info"] : args;
    const child = spawn(cmd, argv, {
      env: env2,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32" && cmd !== getNodeExePath(),
      timeout: timeoutMs
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      const chunk = String(d);
      stderr += chunk;
      if (onLine) {
        const line = chunk.split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean).pop();
        if (line) onLine(line);
      }
    });
    child.on("error", (err) => resolve2({ code: -1, stderr: err.message }));
    child.on("close", (code2) => resolve2({ code: code2 ?? -1, stderr }));
  });
  if (res.code !== 0)
    throw new Error(
      `${res.stderr.slice(-500) || m("upd.npmExitCode", { code: res.code })}（${args.join(" ")}）`
    );
}
function npmWatcher(name, builtin, onProgress) {
  if (!onProgress) return void 0;
  onProgress({ name, phase: "fetch", builtin });
  let last = 0;
  let lastLine = "";
  return (line) => {
    if (line === lastLine) return;
    const now = Date.now();
    if (now - last < 400) return;
    last = now;
    lastLine = line;
    onProgress({ name, phase: "fetch", builtin, message: line.slice(0, 160) });
  };
}
async function updateDshSelf(pinned, onProgress, rowName) {
  const name = m("upd.dshName");
  const watch2 = npmWatcher(rowName || name, "dsh", onProgress);
  const root2 = join(app$1.getPath("userData"), "dsh");
  const before = (await getDshStatus()).version;
  try {
    mkdirSync(root2, { recursive: true });
    writeFileSync$1(join(root2, ".npmrc"), `registry=${registryUrl()}
`);
    const node = getNodeExePath();
    const npmCli = bundledNpmCli$1();
    if (!existsSync(npmCli)) throw new Error(m("upd.npmMissing", { npm: npmCli }));
    await runNpm(
      node,
      [
        npmCli,
        "install",
        "-g",
        // An explicit version wins over the channel: "重装指定版本" is the escape hatch when a
        // channel's newest prerelease is the thing that broke.
        `${DSH_PKG}@${pinned || dshChannel()}`,
        "--config.minimumReleaseAge=0",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund"
      ],
      { ...process.env, npm_config_prefix: root2 },
      15 * 6e4,
      watch2
    );
    if (!existsSync(join(root2, "pnpm.cmd")))
      await runNpm(
        node,
        [
          npmCli,
          "install",
          "-g",
          "pnpm@latest",
          "--config.minimumReleaseAge=0",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund"
        ],
        { ...process.env, npm_config_prefix: root2 },
        15 * 6e4,
        watch2
      );
    repairPnpmCmd(root2);
  } catch (err) {
    const msg = err.message || String(err);
    const hint = /EPERM|EACCES|EROFS|permission/i.test(msg) ? m("upd.dshDirNotWritable") : "";
    return { name, ok: false, updated: false, error: msg + hint };
  }
  const after = (await getDshStatus()).version;
  return {
    name,
    ok: true,
    updated: Boolean(after && after !== before),
    message: after && after !== before ? m("upd.dshUpgraded", { after }) : m("upd.dshUpToDate", { after: after || "?" })
  };
}
async function reprovisionOpenclaw(pinned, onProgress, rowName) {
  const name = "OpenClaw";
  const watch2 = npmWatcher(rowName || name, "openclaw", onProgress);
  const root2 = openclawRoot();
  if (!root2) return { name, ok: false, updated: false, error: m("upd.openclawDirMissing") };
  const before = openclawVersion();
  try {
    mkdirSync(root2, { recursive: true });
    writeFileSync$1(join(root2, ".npmrc"), `registry=${registryUrl()}
`);
    const node = getNodeExePath();
    const npmCli = bundledNpmCli$1();
    if (!existsSync(npmCli)) throw new Error(m("upd.npmMissing", { npm: npmCli }));
    await runNpm(
      node,
      [
        npmCli,
        "install",
        "-g",
        `${OPENCLAW_PKG}@${pinned || "latest"}`,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund"
      ],
      { ...process.env, npm_config_prefix: root2 },
      15 * 6e4,
      watch2
    );
  } catch (err) {
    const msg = err.message || String(err);
    const hint = /EPERM|EACCES|EROFS|permission/i.test(msg) ? m("upd.openclawDirNotWritable") : "";
    return { name, ok: false, updated: false, error: msg + hint };
  }
  const after = openclawVersion();
  return {
    name,
    ok: true,
    updated: Boolean(after && after !== before),
    message: after && after !== before ? m("upd.openclawUpgraded", { after }) : m("upd.openclawUpToDate", { after: after || "?" })
  };
}
async function updateCapability(packageName, capDir, rowName, pinned, onProgress) {
  const name = rowName;
  const watch2 = npmWatcher(name, void 0, onProgress);
  const before = mcpPkgVersion(packageName, capDir);
  try {
    mkdirSync(capDir, { recursive: true });
    writeFileSync$1(join(capDir, ".npmrc"), `registry=${registryUrl()}
`);
    const node = getNodeExePath();
    const npmCli = bundledNpmCli$1();
    if (!existsSync(npmCli)) throw new Error(m("upd.npmMissing", { npm: npmCli }));
    await runNpm(
      node,
      [
        npmCli,
        "install",
        "-g",
        `${packageName}@${pinned || "latest"}`,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund"
      ],
      { ...process.env, npm_config_prefix: capDir },
      15 * 6e4,
      watch2
    );
  } catch (err) {
    const msg = err.message || String(err);
    const hint = /EPERM|EACCES|EROFS|permission/i.test(msg) ? m("upd.dshDirNotWritable") : "";
    return { name, ok: false, updated: false, error: msg + hint };
  }
  const after = mcpPkgVersion(packageName, capDir);
  return {
    name,
    ok: true,
    updated: Boolean(after && after !== before),
    message: after && after !== before ? m("upd.dshUpgraded", { after }) : m("upd.dshUpToDate", { after: after || "?" })
  };
}
async function checkMcpPackages() {
  const name = m("upd.mcpName");
  const base = {
    name,
    dir: mcpPackagesRoot() || "",
    isContainer: false,
    ok: false,
    source: "builtin",
    packageName: MCP_PKG_GROUP,
    action: "reprovision",
    canAutoUpdate: true
  };
  const statuses = mcpPackagesStatus();
  const total = statuses.length;
  const installedCount = statuses.filter((s) => s.installed).length;
  const missing = total - installedCount;
  let registryDown = false;
  let outdatedCount = 0;
  for (const s of statuses) {
    if (!s.installed) continue;
    const latest = await fetchNpmLatest(s.pkg);
    if (!latest) registryDown = true;
    else if (s.version && isNewer(s.version, latest)) outdatedCount++;
  }
  const currentVersion = `${installedCount}/${total}`;
  if (missing === 0 && registryDown)
    return { ...base, currentVersion, error: m("upd.registryUnreachable") };
  return {
    ...base,
    ok: true,
    currentVersion,
    hasUpdate: missing > 0 || outdatedCount > 0,
    latestVersion: missing > 0 ? m("upd.mcpMissingCount", { n: missing }) : outdatedCount > 0 ? m("upd.mcpUpdatableCount", { n: outdatedCount }) : void 0
  };
}
async function installMcpPackages(pinned, onProgress, rowName) {
  const name = m("upd.mcpName");
  const root2 = mcpPackagesRoot();
  if (!root2) return { name, ok: false, updated: false, error: m("upd.mcpRootMissing") };
  const watch2 = npmWatcher(rowName || name, "mcp", onProgress);
  const before = mcpPackagesStatus().filter((s) => s.installed).map((s) => `${s.pkg}@${s.version}`).join(",");
  try {
    mkdirSync(root2, { recursive: true });
    writeFileSync$1(join(root2, ".npmrc"), `registry=${registryUrl()}
`);
    const node = getNodeExePath();
    const npmCli = bundledNpmCli$1();
    if (!existsSync(npmCli)) throw new Error(m("upd.npmMissing", { npm: npmCli }));
    const specs = mcpPackagesStatus().map((s) => `${s.pkg}@${pinned || "latest"}`);
    await runNpm(
      node,
      [npmCli, "install", "--global", "--no-save", "--prefix", root2, ...specs, "--ignore-scripts", "--no-audit", "--no-fund"],
      { ...process.env, npm_config_prefix: root2 },
      15 * 6e4,
      watch2
    );
  } catch (err) {
    return { name, ok: false, updated: false, error: err.message || String(err) };
  }
  const after = mcpPackagesStatus().filter((s) => s.installed).map((s) => `${s.pkg}@${s.version}`).join(",");
  return {
    name,
    ok: true,
    updated: after !== before,
    message: after !== before ? m("upd.mcpReady") : m("upd.mcpAlreadyReady", { after: after || "?" })
  };
}
async function provisionBuiltin(kind, pinned) {
  const version = (pinned || "").trim();
  if (kind === "mcp") {
    const result2 = await installMcpPackages(version);
    logEvent(
      result2.ok ? { level: "info", kind: "runtime.provision", detail: result2.message, meta: { name: kind } } : { level: "error", kind: "runtime.provisionFail", detail: result2.error, meta: { name: kind } }
    );
    return result2;
  }
  const result = kind === "dsh" ? await updateDshSelf(version) : await reprovisionOpenclaw(version);
  logEvent(
    result.ok ? {
      level: "info",
      kind: "runtime.provision",
      detail: result.message,
      meta: { name: kind, version: version || (kind === "dsh" ? dshChannel() : "latest") }
    } : { level: "error", kind: "runtime.provisionFail", detail: result.error, meta: { name: kind } }
  );
  return result;
}
const inFlightUpdates = /* @__PURE__ */ new Map();
function performUpdate(target, onProgress) {
  const running = inFlightUpdates.get(target.name);
  if (running) {
    console.log(`[update] ${target.name}: update already in flight, joining`);
    return running;
  }
  const done = runUpdate(target, onProgress).finally(() => {
    inFlightUpdates.delete(target.name);
  });
  inFlightUpdates.set(target.name, done);
  return done;
}
async function runUpdate(target, onProgress) {
  switch (target.action) {
    case "pull":
      return performUpdate$1({ name: target.name, dir: target.dir });
    case "apply-asar":
      return applyAsarUpdate(target.name, onProgress);
    case "reprovision":
      if (target.capabilityId && target.packageName && target.dir)
        return updateCapability(target.packageName, target.dir, target.name, void 0, onProgress);
      return target.packageName === MCP_PKG_GROUP ? installMcpPackages(void 0, onProgress, target.name) : target.packageName === DSH_PKG ? updateDshSelf(void 0, onProgress, target.name) : reprovisionOpenclaw(void 0, onProgress, target.name);
    case "manual":
      return {
        name: target.name,
        ok: false,
        updated: false,
        error: m("upd.localNoAuto")
      };
    default:
      return { name: target.name, ok: false, updated: false, error: m("upd.unknownChannel") };
  }
}
const INDEX_URLS = [
  "https://npmmirror.com/mirrors/node/index.json",
  "https://nodejs.org/dist/index.json"
];
const DIST_BASES = [
  "https://npmmirror.com/mirrors/node/%V%/node-%V%-win-x64.zip",
  "https://cdn.npmmirror.com/binaries/node/%V%/node-%V%-win-x64.zip",
  "https://nodejs.org/dist/%V%/node-%V%-win-x64.zip"
];
function preferUpstream() {
  return (getSettings().npmRegistry || "").trim().replace(/\/+$/, "") === "https://registry.npmjs.org";
}
const indexUrls = () => preferUpstream() ? [...INDEX_URLS].reverse() : INDEX_URLS;
const distBases = () => preferUpstream() ? [...DIST_BASES].reverse() : DIST_BASES;
const MAX_VERSIONS = 200;
function isValidTag(v) {
  return /^v\d+\.\d+\.\d+$/.test(v);
}
function get(url, timeoutMs = 2e4) {
  return new Promise((resolve2, reject) => {
    let settled = false;
    let timer;
    const done = (fn) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };
    const req = net.request({ url, method: "GET" });
    req.setHeader("user-agent", "DesktopContainer");
    timer = setTimeout(() => {
      done(() => {
        try {
          req.abort();
        } catch {
        }
        reject(new Error(`timeout fetching ${url}`));
      });
    }, timeoutMs);
    req.on("response", (res) => {
      if (res.statusCode !== 200) {
        res.on("error", () => void 0);
        done(() => reject(new Error(`HTTP ${res.statusCode}`)));
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(Buffer.from(d)));
      res.on(
        "end",
        () => done(() => resolve2({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf-8") }))
      );
      res.on("error", (e) => done(() => reject(e)));
    });
    req.on("error", (e) => done(() => reject(e)));
    req.end();
  });
}
async function listNodeVersions(includeIncompatible = false) {
  if (process.platform !== "win32") throw new Error(m("node.notWin"));
  let lastErr = "";
  for (const url of indexUrls()) {
    try {
      const { body } = await get(url, 25e3);
      const entries2 = JSON.parse(body);
      const out = [];
      for (const e of entries2) {
        if (!isValidTag(e.version)) continue;
        if (e.files && !e.files.includes("win-x64-zip") && !e.files.includes("win-x64")) continue;
        const usable = nodeVersionUsable(e.version);
        if (!usable && !includeIncompatible) continue;
        out.push({ version: e.version, date: e.date, lts: e.lts, usable });
        if (out.length >= MAX_VERSIONS) break;
      }
      if (!out.length) throw new Error("no usable versions in index");
      return out;
    } catch (err) {
      lastErr = err.message;
    }
  }
  throw new Error(m("node.indexFail", { err: lastErr }));
}
const PROGRESS_INTERVAL_MS$1 = 150;
function download(url, target, version, onProgress) {
  return new Promise((resolve2, reject) => {
    const req = get$1(
      url,
      { headers: { "user-agent": "DesktopContainer" }, timeout: 6e4 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          download(new URL(res.headers.location, url).toString(), target, version, onProgress).then(
            resolve2,
            reject
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers["content-length"] || 0);
        let received = 0;
        let lastEmit = 0;
        const emit = (force) => {
          const now = Date.now();
          if (!force && now - lastEmit < PROGRESS_INTERVAL_MS$1) return;
          lastEmit = now;
          const percent = total ? Math.min(100, Math.floor(received / total * 100)) : void 0;
          const mb = (received / 1024 / 1024).toFixed(1);
          onProgress({
            name: "Node",
            phase: "fetch",
            received,
            total: total || void 0,
            percent,
            message: m("node.downloadingPct", { v: version, p: percent ?? "--", mb })
          });
        };
        res.on("data", (chunk) => {
          received += chunk.length;
          emit(received >= total);
        });
        pipeline(res, createWriteStream(target)).then(
          () => {
            emit(true);
            resolve2();
          },
          (err) => reject(err)
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout fetching ${url}`)));
  });
}
async function downloadZip(urls, target, version, onProgress) {
  let lastErr = "";
  for (const url of urls) {
    try {
      await download(url, target, version, onProgress);
      const size = existsSync(target) ? statSync(target).size : 0;
      if (size < 10 * 1024 * 1024) throw new Error(m("node.tooSmall", { n: size }));
      return;
    } catch (err) {
      lastErr = err.message;
      rmSync(target, { force: true });
    }
  }
  throw new Error(m("node.downloadFail", { err: lastErr }));
}
function extractZip(zip, dest) {
  return new Promise((resolve2, reject) => {
    const q = (p) => `'${p.replace(/'/g, "''")}'`;
    const script = `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(dest)} -Force`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      // Backstop so a wedged PowerShell can never hang the update forever (5 min is generous
      // for a ~30 MB Node zip on a slow disk).
      { windowsHide: true, timeout: 3e5 },
      (err) => err ? reject(new Error(m("node.extractFail", { err: err.message }))) : resolve2()
    );
  });
}
function verifyRuntime(nodeExe, want) {
  let out = "";
  try {
    out = execFileSync(nodeExe, ["--version"], { windowsHide: true }).toString().trim();
  } catch {
  }
  if (out !== want) throw new Error(m("node.verifyFail"));
}
function sweepStaleOverrides(dir) {
  const parent = join(dir, "..");
  const base = `${dir.split(/[\\/]/).pop()}.old`;
  let names2;
  try {
    names2 = readdirSync(parent);
  } catch {
    return;
  }
  for (const n of names2) {
    if (n !== base && !n.startsWith(`${base}-`)) continue;
    try {
      rmSync(join(parent, n), { recursive: true, force: true });
    } catch {
    }
  }
}
function parkOverride(dir) {
  let lastErr;
  for (const target of [`${dir}.old`, `${dir}.old-${Date.now()}`]) {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
    }
    try {
      renameSync(dir, target);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(m("node.locked", { err: lastErr?.message ?? "override dir is in use" }));
}
async function updateNodeRuntime(version, onProgress) {
  if (process.platform !== "win32") throw new Error(m("node.notWin"));
  const want = version.startsWith("v") ? version : `v${version}`;
  if (!isValidTag(want)) throw new Error(m("node.badVersion", { v: version }));
  const work = join(app$1.getPath("userData"), "node-update");
  const staging = join(work, `runtime-${want}`);
  const zip = join(work, `node-${want}-win-x64.zip`);
  const extracted = join(work, `extract-${want}`);
  rmSync(zip, { force: true });
  rmSync(staging, { recursive: true, force: true });
  rmSync(extracted, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  onProgress({ name: "Node", phase: "fetch", percent: 0, message: m("node.downloading", { v: want }) });
  await downloadZip(
    distBases().map((b) => b.split("%V%").join(want)),
    zip,
    want,
    onProgress
  );
  onProgress({ name: "Node", phase: "extract", message: m("node.extracting") });
  await extractZip(zip, extracted);
  const nested = readdirSync(extracted).find((d) => d.startsWith(`node-${want}-win-x64`));
  const srcRoot = nested ? join(extracted, nested) : extracted;
  mkdirSync(staging, { recursive: true });
  for (const entry of readdirSync(srcRoot)) {
    renameSync(join(srcRoot, entry), join(staging, entry));
  }
  verifyRuntime(join(staging, "node.exe"), want);
  const dir = overrideNodeDir();
  sweepStaleOverrides(dir);
  if (existsSync(dir)) parkOverride(dir);
  renameSync(staging, dir);
  invalidateNodeRuntimeCache();
  onProgress({ name: "Node", phase: "done", message: m("node.done", { v: want }) });
  try {
    rmSync(zip, { force: true });
    rmSync(extracted, { recursive: true, force: true });
  } catch {
  }
  sweepStaleOverrides(dir);
  return getNodeRuntimeInfo(true);
}
async function restoreBundledNode() {
  const dir = overrideNodeDir();
  sweepStaleOverrides(dir);
  if (existsSync(dir)) parkOverride(dir);
  invalidateNodeRuntimeCache();
  const info = await getNodeRuntimeInfo(true);
  sweepStaleOverrides(dir);
  return info;
}
const ofs = (() => {
  try {
    if (typeof require2 === "function") return require2("original-fs");
  } catch {
  }
  return fs;
})();
const RELEASE_BRANCH = "release";
const RELEASE_BRANCH_BETA = "release-beta";
let betaBranchMissing = false;
function effectiveReleaseBranch() {
  const wantsBeta = getSettings().containerChannel === "beta";
  return wantsBeta && !betaBranchMissing ? RELEASE_BRANCH_BETA : RELEASE_BRANCH;
}
function resetBranchProbe() {
  betaBranchMissing = false;
}
const PROGRESS_INTERVAL_MS = 150;
const MIN_ASAR_BYTES = 1024 * 1024;
async function sha512OfFile(path2) {
  const hash = createHash("sha512");
  await pipeline(
    createReadStream(path2),
    new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk);
        cb();
      }
    })
  );
  return hash.digest("hex");
}
async function verifyStagedIntegrity() {
  const meta = readMeta();
  if (!meta?.pendingAsar || !meta.sha512) return true;
  const zip = join(updatesRoot(), dirname(meta.pendingAsar), "app.zip");
  try {
    return await sha512OfFile(zip) === meta.sha512;
  } catch {
    return false;
  }
}
function readStagedUpdate() {
  const metaFile = join(updatesRoot(), "update-meta.json");
  let meta = null;
  try {
    meta = JSON.parse(readFileSync(metaFile, "utf-8"));
  } catch {
    return null;
  }
  if (!meta?.pendingAsar || meta.broken) return null;
  const pending = join(updatesRoot(), meta.pendingAsar);
  let size = 0;
  try {
    size = ofs.statSync(pending).size;
  } catch {
    size = 0;
  }
  if (size >= MIN_ASAR_BYTES) return { version: meta.version || "", commit: meta.commit || "" };
  try {
    writeFileSync$1(metaFile, JSON.stringify({ ...meta, pendingAsar: null }));
  } catch {
  }
  return null;
}
function clearStagedUpdate() {
  const metaFile = join(updatesRoot(), "update-meta.json");
  try {
    const meta = JSON.parse(readFileSync(metaFile, "utf-8"));
    writeFileSync$1(metaFile, JSON.stringify({ ...meta, pendingAsar: null }));
  } catch {
  }
}
function updatesRoot() {
  return join(dirname(app$1.getPath("exe")), "resources", "updates");
}
function gitDir() {
  return join(updatesRoot(), "release.git");
}
function runGit(args) {
  const res = spawnSync("git", args, { encoding: "utf-8", windowsHide: true });
  if (res.status !== 0)
    throw new Error((res.stderr || res.stdout || `git ${args[0]} failed`).trim());
  return res.stdout;
}
function runGitAsync(args, onStderr) {
  return new Promise((resolve2, reject) => {
    const child = spawn("git", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => stdout += String(d));
    child.stderr.on("data", (d) => {
      const s = String(d);
      stderr += s;
      onStderr?.(s);
    });
    child.on("error", reject);
    child.on(
      "close",
      (code2) => code2 === 0 ? resolve2(stdout) : reject(new Error((stderr || stdout || `git ${args[0]} failed`).trim()))
    );
  });
}
function ensureRepo() {
  if (!existsSync(join(gitDir(), "HEAD"))) {
    mkdirSync(dirname(gitDir()), { recursive: true });
    runGit(["init", "--bare", gitDir()]);
    runGit(["--git-dir", gitDir(), "remote", "add", "origin", CONTAINER_REPO_URL]);
  }
}
function parseGitPercent(chunk) {
  let last = null;
  for (const hit of chunk.matchAll(/(\d+)%/g)) last = Number(hit[1]);
  return last;
}
async function fetchTip(name, onProgress) {
  ensureRepo();
  const branch = effectiveReleaseBranch();
  try {
    await fetchBranch(branch, name, onProgress);
  } catch (err) {
    if (branch !== RELEASE_BRANCH) {
      betaBranchMissing = true;
      logEvent({
        level: "warn",
        kind: "ota.channelFallback",
        detail: `${branch}: ${err.message}`,
        meta: { from: branch, to: RELEASE_BRANCH }
      });
      await fetchBranch(RELEASE_BRANCH, name, onProgress);
    } else {
      throw err;
    }
  }
  const commit = runGit(["--git-dir", gitDir(), "rev-parse", "FETCH_HEAD"]).trim();
  const version = runGit(["--git-dir", gitDir(), "show", `${commit}:version.txt`]).split(/\r?\n/)[0].trim();
  return { version, commit };
}
function fetchBranch(branch, name, onProgress) {
  return runGitAsync(
    ["--git-dir", gitDir(), "fetch", "--progress", "--depth", "1", "origin", branch],
    (chunk) => {
      if (!onProgress) return;
      const percent = parseGitPercent(chunk) ?? void 0;
      onProgress({
        name,
        phase: "fetch",
        percent,
        message: m("git.asarFetching", { percent: percent === void 0 ? "" : ` ${percent}%` })
      });
    }
  );
}
async function streamBlob(rev, partPath, resumeFrom, total, name, resumed, onProgress) {
  const child = spawn("git", ["--git-dir", gitDir(), "cat-file", "blob", rev], {
    windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data", (d) => stderr += String(d));
  let toSkip = resumeFrom;
  let written = resumeFrom;
  let lastEmit = 0;
  const emit = (force = false) => {
    const now = Date.now();
    if (!onProgress || !force && now - lastEmit < PROGRESS_INTERVAL_MS) return;
    lastEmit = now;
    const received = Math.min(written, total);
    const percent = total > 0 ? Math.floor(received / total * 100) : 0;
    onProgress({
      name,
      phase: "extract",
      received,
      total,
      percent,
      resumed,
      message: m(resumed ? "git.asarResuming" : "git.asarExtracting", {
        percent: `${percent}%`
      })
    });
  };
  const gate = new Transform({
    transform(chunk, _enc, cb) {
      let data = chunk;
      if (toSkip > 0) {
        if (data.length <= toSkip) {
          toSkip -= data.length;
          return cb();
        }
        data = data.subarray(toSkip);
        toSkip = 0;
      }
      written += data.length;
      emit();
      cb(null, data);
    }
  });
  const out = createWriteStream(partPath, { flags: resumeFrom > 0 ? "a" : "w" });
  const closed = new Promise((resolve2) => {
    let settled = false;
    const settle = (code2) => {
      if (settled) return;
      settled = true;
      resolve2(code2);
    };
    child.on("close", (code2) => settle(code2 ?? -1));
    child.on("exit", (code2) => settle(code2 ?? -1));
    child.on("error", (err) => {
      stderr = err.message;
      settle(-1);
    });
  });
  try {
    await pipeline(child.stdout, gate, out);
    const code2 = await closed;
    if (code2 !== 0) throw new Error((stderr || `git cat-file failed (code ${code2})`).trim());
    emit(true);
  } catch (err) {
    child.kill();
    out.destroy();
    throw err;
  }
}
function pruneOldReleases(root2, keep) {
  try {
    for (const f of readdirSync(root2)) {
      if (f === "release.git" || keep.has(f)) continue;
      const p = join(root2, f);
      try {
        if (!statSync(p).isDirectory()) continue;
      } catch {
        continue;
      }
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
      }
    }
  } catch {
  }
}
async function downloadAsar(tip, name, onProgress) {
  const root2 = updatesRoot();
  mkdirSync(root2, { recursive: true });
  const rev = `${tip.commit}:app.zip`;
  const total = Number(runGit(["--git-dir", gitDir(), "cat-file", "-s", rev]).trim());
  if (!Number.isFinite(total) || total <= 0) throw new Error(m("git.asarSizeUnknown"));
  const dir = join(root2, tip.commit);
  mkdirSync(dir, { recursive: true });
  const part = join(dir, "app.zip.part");
  let expectedHash = null;
  try {
    expectedHash = runGit(["--git-dir", gitDir(), "show", `${tip.commit}:sha512.txt`]).trim().split(/\r?\n/)[0] || null;
  } catch {
    logEvent({
      level: "warn",
      kind: "ota.hashMissing",
      detail: `release ${tip.commit.slice(0, 8)} carries no sha512.txt — size-only check`,
      meta: { commit: tip.commit.slice(0, 8) }
    });
  }
  let resumeFrom = 0;
  if (existsSync(part)) {
    const size = statSync(part).size;
    if (size > 0 && size < total) resumeFrom = size;
    else rmSync(part, { force: true });
  }
  await streamBlob(rev, part, resumeFrom, total, name, resumeFrom > 0, onProgress);
  if (statSync(part).size !== total)
    throw new Error(m("git.asarSizeMismatch", { want: total, got: statSync(part).size }));
  const actualHash = await sha512OfFile(part);
  if (expectedHash && actualHash !== expectedHash) {
    rmSync(part, { force: true });
    logEvent({
      level: "error",
      kind: "ota.hashMismatch",
      meta: { commit: tip.commit.slice(0, 8), want: expectedHash.slice(0, 16), got: actualHash.slice(0, 16) }
    });
    throw new Error(m("update.hashMismatch"));
  }
  const zipPath = join(dir, "app.zip");
  rmSync(zipPath, { force: true });
  renameSync(part, zipPath);
  onProgress?.({ name, phase: "extract", percent: 100, message: m("git.zipUnpacking") });
  console.log(`[update] extracting ${zipPath} -> ${dir}`);
  await extractZip(zipPath, dir);
  console.log(`[update] extract finished: ${dir}`);
  const stagedAsar = join(dir, "app.asar");
  if (!ofs.existsSync(stagedAsar) || ofs.statSync(stagedAsar).size < MIN_ASAR_BYTES)
    throw new Error(m("git.asarExtractFailed"));
  const metaFile = join(root2, "update-meta.json");
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(metaFile, "utf-8"));
  } catch {
  }
  writeFileSync$1(
    metaFile,
    JSON.stringify({
      ...prev,
      broken: false,
      pendingAsar: join(tip.commit, "app.asar"),
      version: tip.version,
      commit: tip.commit,
      sha512: actualHash
    })
  );
  const keep = /* @__PURE__ */ new Set([tip.commit]);
  if (prev.currentAsar) keep.add(String(prev.currentAsar).split(/[\\/]/)[0]);
  pruneOldReleases(root2, keep);
  notifyEvent("notify.updateReadyTitle", "notify.updateReadyBody", { version: tip.version });
  logEvent({
    level: "info",
    kind: "ota.staged",
    meta: { version: tip.version, commit: tip.commit.slice(0, 8), branch: effectiveReleaseBranch() }
  });
  onProgress?.({ name, phase: "done", received: total, total, percent: 100 });
}
async function checkAsarUpdate(name, dir) {
  const base = {
    name,
    dir,
    isContainer: true,
    ok: false,
    source: "git",
    action: "apply-asar",
    canAutoUpdate: true
  };
  try {
    const current2 = app$1.getVersion();
    let staged = readStagedUpdate();
    if (staged && !isNewer(current2, staged.version)) {
      clearStagedUpdate();
      staged = null;
    }
    if (staged && !await verifyStagedIntegrity()) {
      logEvent({ level: "warn", kind: "ota.stagedCorrupt", meta: { version: staged.version } });
      clearStagedUpdate();
      staged = null;
    }
    if (staged) {
      const rb2 = canRollbackAsar();
      return {
        ...base,
        ok: true,
        branch: effectiveReleaseBranch(),
        localHead: current2,
        remoteHead: staged.commit.slice(0, 8),
        currentVersion: current2,
        latestVersion: staged.version,
        hasUpdate: false,
        pendingRestart: true,
        canRollback: rb2.available,
        rollbackVersion: rb2.fromVersion
      };
    }
    const tip = await fetchTip(name);
    const rb = canRollbackAsar();
    return {
      ...base,
      ok: true,
      branch: effectiveReleaseBranch(),
      localHead: current2,
      remoteHead: tip.commit.slice(0, 8),
      currentVersion: current2,
      latestVersion: tip.version,
      // local ahead of the release branch (e.g. a locally-built 0.1.5 vs server 0.1.4) is
      // simply up-to-date: hasUpdate stays false and no action is offered.
      hasUpdate: isNewer(current2, tip.version),
      pendingRestart: false,
      canRollback: rb.available,
      rollbackVersion: rb.fromVersion
    };
  } catch (err) {
    return { ...base, error: err.message };
  }
}
async function applyAsarUpdate(name, onProgress) {
  try {
    const tip = await fetchTip(name, onProgress);
    console.log(`[update] ${name}: release tip ${tip.version} (${tip.commit.slice(0, 8)})`);
    await downloadAsar(tip, name, onProgress);
    console.log(`[update] ${name}: staged ${tip.version}, restart to apply`);
    return {
      name,
      ok: true,
      updated: true,
      message: m("git.asarDownloaded", { version: tip.version })
    };
  } catch (err) {
    console.error(`[update] ${name}: apply failed:`, err);
    return { name, ok: false, updated: false, error: err.message };
  }
}
function psStr(s) {
  return `'${s.replace(/'/g, "''")}'`;
}
function relaunchToApplyStaged() {
  if (!app$1.isPackaged) return false;
  const metaFile = join(updatesRoot(), "update-meta.json");
  let meta = null;
  try {
    meta = JSON.parse(readFileSync(metaFile, "utf-8"));
  } catch {
    meta = null;
  }
  const pending = meta?.pendingAsar;
  if (!pending) return false;
  const stagedAsar = join(updatesRoot(), pending);
  let size = 0;
  try {
    size = ofs.statSync(stagedAsar).size;
  } catch {
    size = 0;
  }
  if (size < MIN_ASAR_BYTES) return false;
  const stagedDir = dirname(stagedAsar);
  const resourcesDir = dirname(updatesRoot());
  const targetAsar = join(resourcesDir, "app.asar");
  const stagedUnpacked = join(stagedDir, "app.asar.unpacked");
  const targetUnpacked = join(resourcesDir, "app.asar.unpacked");
  const exe = app$1.getPath("exe");
  try {
    const withOrigin = { ...meta, rollbackFromVersion: app$1.getVersion() };
    writeFileSync$1(metaFile, JSON.stringify(withOrigin));
    meta = withOrigin;
  } catch {
  }
  logEvent({
    level: "info",
    kind: "ota.applying",
    meta: { from: app$1.getVersion(), to: meta?.version || "unknown" }
  });
  const noise = /* @__PURE__ */ new Set([
    "--autostart",
    "--dsh-relaunched",
    "--dsh-boot-retry",
    "--dsh-asar-launched"
  ]);
  const relaunchArgs = process.argv.slice(1).filter((a) => !noise.has(a) && !a.startsWith("--app-path=")).concat("--dsh-relaunched");
  const ps1 = join(updatesRoot(), "apply-update.ps1");
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$appPid = ${process.pid}`,
    `$exe = ${psStr(exe)}`,
    `$relaunchArgs = @(${relaunchArgs.map(psStr).join(", ")})`,
    `$srcAsar = ${psStr(stagedAsar)}`,
    `$dstAsar = ${psStr(targetAsar)}`,
    `$srcUnpacked = ${psStr(stagedUnpacked)}`,
    `$dstUnpacked = ${psStr(targetUnpacked)}`,
    `$metaFile = ${psStr(metaFile)}`,
    // Wait for the app to actually exit (this PID gone), then a short grace for the OS to free
    // the asar / native handles.
    "while (Get-Process -Id $appPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }",
    "Start-Sleep -Milliseconds 800",
    // Keep a single rollback copy of the version we are replacing — asar AND natives, so a
    // rollback can restore a consistent pair (a mismatched unpacked tree breaks node-pty).
    'if (Test-Path $dstAsar) { Copy-Item $dstAsar "$dstAsar.bak" -Force }',
    'if (Test-Path $dstUnpacked) { robocopy $dstUnpacked "$dstUnpacked.bak" /MIR /NFL /NDL /NJH /NJS /NP /R:5 /W:1 | Out-Null }',
    // Retry the copy while a lingering AV/defender handle releases (up to ~10s).
    "for ($i = 0; $i -lt 20; $i++) { try { Copy-Item $srcAsar $dstAsar -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 } }",
    // node-pty's natives live beside the asar; mirror them too (robocopy /MIR returns 0-7 on ok).
    "if (Test-Path $srcUnpacked) { robocopy $srcUnpacked $dstUnpacked /MIR /NFL /NDL /NJH /NJS /NP /R:5 /W:1 | Out-Null }",
    // Clear pending so a later plain launch does not re-apply; record what is now current.
    // WriteAllText (not Set-Content -Encoding UTF8) so PowerShell 5.1 emits no BOM — the main
    // process JSON.parses this file and a leading \uFEFF would make it throw and mis-report "none".
    "try { $m = Get-Content $metaFile -Raw | ConvertFrom-Json; $m.currentAsar = $m.pendingAsar; $m.pendingAsar = $null; [IO.File]::WriteAllText($metaFile, ($m | ConvertTo-Json -Compress)) } catch {}",
    "Start-Process -FilePath $exe -ArgumentList $relaunchArgs"
  ].join("\r\n");
  try {
    mkdirSync(updatesRoot(), { recursive: true });
    writeFileSync$1(ps1, script, "utf-8");
    const helper = spawn(
      "cmd.exe",
      [
        "/c",
        "start",
        "",
        "/min",
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        ps1
      ],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    helper.on("error", (err) => console.error("[update] swap helper spawn failed:", err));
    helper.unref();
    console.log(`[update] scheduled in-place swap of ${pending} into ${targetAsar}`);
    return true;
  } catch (err) {
    console.error("[update] failed to schedule staged asar swap:", err);
    return false;
  }
}
function readMeta() {
  try {
    return JSON.parse(readFileSync(join(updatesRoot(), "update-meta.json"), "utf-8"));
  } catch {
    return null;
  }
}
function getUpdateHistory() {
  const meta = readMeta();
  const staged = readStagedUpdate();
  const rb = canRollbackAsar();
  return {
    running: app$1.getVersion(),
    current: staged?.version || null,
    backup: rb.available ? rb.fromVersion || null : null,
    rollbackFrom: meta?.rollbackFromVersion || null,
    pendingRestart: !!staged
  };
}
function canRollbackAsar() {
  if (!app$1.isPackaged) return { available: false };
  const resourcesDir = dirname(updatesRoot());
  const bakAsar = join(resourcesDir, "app.asar.bak");
  let size = 0;
  try {
    size = ofs.statSync(bakAsar).size;
  } catch {
    size = 0;
  }
  if (size < MIN_ASAR_BYTES) return { available: false };
  const meta = readMeta();
  const from = meta?.rollbackFromVersion;
  return from ? { available: true, fromVersion: from } : { available: false };
}
function rollbackToPreviousAsar() {
  const rb = canRollbackAsar();
  if (!rb.available) return false;
  const resourcesDir = dirname(updatesRoot());
  const targetAsar = join(resourcesDir, "app.asar");
  const bakAsar = `${targetAsar}.bak`;
  const targetUnpacked = join(resourcesDir, "app.asar.unpacked");
  const bakUnpacked = `${targetUnpacked}.bak`;
  const metaFile = join(updatesRoot(), "update-meta.json");
  const exe = app$1.getPath("exe");
  const noise = /* @__PURE__ */ new Set(["--autostart", "--dsh-relaunched", "--dsh-boot-retry", "--dsh-asar-launched"]);
  const relaunchArgs = process.argv.slice(1).filter((a) => !noise.has(a) && !a.startsWith("--app-path=")).concat("--dsh-relaunched");
  const ps1 = join(updatesRoot(), "rollback-update.ps1");
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$appPid = ${process.pid}`,
    `$exe = ${psStr(exe)}`,
    `$relaunchArgs = @(${relaunchArgs.map(psStr).join(", ")})`,
    `$bakAsar = ${psStr(bakAsar)}`,
    `$dstAsar = ${psStr(targetAsar)}`,
    `$bakUnpacked = ${psStr(bakUnpacked)}`,
    `$dstUnpacked = ${psStr(targetUnpacked)}`,
    `$metaFile = ${psStr(metaFile)}`,
    "while (Get-Process -Id $appPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }",
    "Start-Sleep -Milliseconds 800",
    // Stage a verified copy first: moving a corrupt .bak over the live asar would brick boot.
    'for ($i = 0; $i -lt 20; $i++) { try { Copy-Item $bakAsar "$dstAsar.rbk" -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 } }',
    'if ((Get-Item "$dstAsar.rbk" -ErrorAction SilentlyContinue).Length -lt ' + MIN_ASAR_BYTES + ") { exit 1 }",
    'Move-Item -Force "$dstAsar.rbk" $dstAsar',
    // Restore the matching natives tree, then drop both backups (rollback is one-way).
    "if (Test-Path $bakUnpacked) { robocopy $bakUnpacked $dstUnpacked /MIR /NFL /NDL /NJH /NJS /NP /R:5 /W:1 | Out-Null }",
    'Remove-Item "$bakAsar","$bakUnpacked" -Recurse -Force -ErrorAction SilentlyContinue',
    // Consume the rollback record + any pending marker so boot/OTA read the restored state.
    "try { $m = Get-Content $metaFile -Raw | ConvertFrom-Json; $m.pendingAsar = $null; $m.rollbackFromVersion = $null; [IO.File]::WriteAllText($metaFile, ($m | ConvertTo-Json -Compress)) } catch {}",
    "Start-Process -FilePath $exe -ArgumentList $relaunchArgs"
  ].join("\r\n");
  try {
    writeFileSync$1(ps1, script, "utf-8");
    const helper = spawn(
      "cmd.exe",
      [
        "/c",
        "start",
        "",
        "/min",
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        ps1
      ],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    helper.on("error", (err) => console.error("[update] rollback helper spawn failed:", err));
    helper.unref();
    console.log("[update] scheduled asar rollback swap");
    logEvent({
      level: "warn",
      kind: "ota.rollback",
      meta: { from: app$1.getVersion(), to: rb.fromVersion || "unknown" }
    });
    return true;
  } catch (err) {
    console.error("[update] failed to schedule asar rollback:", err);
    return false;
  }
}
const SAVE_DEBOUNCE_MS = 400;
const MIN_VISIBLE_PX = 60;
let saveTimer = null;
let watched = null;
function boundsEnabled() {
  return getSettings().rememberWindowBounds !== false;
}
function isValid(b) {
  if (!b) return false;
  return [b.x, b.y, b.width, b.height].every((n) => Number.isFinite(n));
}
function isOnSomeDisplay(rect) {
  const probe = {
    x: rect.x,
    y: rect.y,
    width: Math.max(1, Math.min(rect.width, MIN_VISIBLE_PX)),
    height: Math.max(1, Math.min(rect.height, MIN_VISIBLE_PX))
  };
  return screen.getAllDisplays().some((d) => {
    const a = d.bounds;
    const ix = Math.max(probe.x, a.x);
    const iy = Math.max(probe.y, a.y);
    const ix2 = Math.min(probe.x + probe.width, a.x + a.width);
    const iy2 = Math.min(probe.y + probe.height, a.y + a.height);
    return ix2 - ix > 0 && iy2 - iy > 0;
  });
}
function resolveBounds(minWidth, minHeight) {
  if (!boundsEnabled()) return null;
  const stored = getSettings().windowBounds;
  if (!isValid(stored)) return null;
  const rect = {
    x: stored.x,
    y: stored.y,
    width: Math.max(stored.width, minWidth),
    height: Math.max(stored.height, minHeight)
  };
  if (!isOnSomeDisplay(rect)) return null;
  const display = screen.getDisplayMatching(rect);
  const wa = display.workAreaSize;
  return {
    x: stored.x,
    y: stored.y,
    width: Math.min(rect.width, wa.width),
    height: Math.min(rect.height, wa.height),
    maximized: Boolean(stored.maximized)
  };
}
function scheduleSave() {
  if (!boundsEnabled()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveWindowBounds();
  }, SAVE_DEBOUNCE_MS);
}
function saveWindowBounds() {
  if (!boundsEnabled()) return;
  const win = watched;
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const n = win.getNormalBounds();
  const next2 = {
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    maximized: win.isMaximized()
  };
  const prev = getSettings().windowBounds;
  if (prev && prev.x === next2.x && prev.y === next2.y && prev.width === next2.width && prev.height === next2.height && prev.maximized === next2.maximized)
    return;
  updateSettings({ windowBounds: next2 });
}
function flushWindowBounds() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveWindowBounds();
}
function forgetWindowBounds() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  clearWindowBounds();
}
function watchWindowBounds(win) {
  if (watched === win) return;
  if (watched && !watched.isDestroyed()) {
    watched.off("resize", scheduleSave);
    watched.off("move", scheduleSave);
    watched.off("maximize", scheduleSave);
    watched.off("unmaximize", scheduleSave);
  }
  watched = win;
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", scheduleSave);
  win.on("unmaximize", scheduleSave);
}
function unwatchWindowBounds() {
  flushWindowBounds();
  watched = null;
}
function popoutSlot(pageId) {
  const b = getSettings().popoutBounds?.[pageId];
  return isValid(b) ? b : null;
}
function resolvePopoutBounds(pageId, minWidth, minHeight) {
  if (!boundsEnabled()) return null;
  const stored = popoutSlot(pageId);
  if (!stored) return null;
  const rect = {
    x: stored.x,
    y: stored.y,
    width: Math.max(stored.width, minWidth),
    height: Math.max(stored.height, minHeight)
  };
  if (!isOnSomeDisplay(rect)) return null;
  return { ...rect, maximized: Boolean(stored.maximized) };
}
function rememberPopoutBounds(win, pageId) {
  if (!boundsEnabled()) return;
  if (win.isMinimized()) return;
  const n = win.getNormalBounds();
  const prev = popoutSlot(pageId);
  if (prev && prev.x === n.x && prev.y === n.y && prev.width === n.width && prev.height === n.height && prev.maximized === win.isMaximized())
    return;
  updateSettings({ popoutBounds: { ...getSettings().popoutBounds, [pageId]: { ...n, maximized: win.isMaximized() } } });
}
const icon = join$1(import.meta.dirname, "../../resources/icon.png");
function appIconPath() {
  const candidates = [
    icon,
    join(process.resourcesPath || "", "icon.png"),
    join(app$1.getAppPath(), "resources", "icon.png")
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || icon;
}
function savedSite(pageId) {
  return getSettings().externalSites?.find((s) => s.id === pageId) || null;
}
const popoutWindows = /* @__PURE__ */ new Map();
let popoutSaveTimer = null;
let guestKeysWired = false;
let guestSchemeWired = false;
const guestSchemeCss = /* @__PURE__ */ new WeakMap();
function shellPreload() {
  const dir = join(__dirname, "../preload");
  for (const name of ["index.mjs", "index.js"]) {
    if (existsSync(join(dir, name))) return join(dir, name);
  }
  return join(dir, "index.mjs");
}
function schedulePopoutSave() {
  if (popoutSaveTimer) clearTimeout(popoutSaveTimer);
  popoutSaveTimer = setTimeout(() => {
    popoutSaveTimer = null;
    flushPopoutBounds();
  }, 800);
  popoutSaveTimer.unref?.();
}
function flushPopoutBounds() {
  if (popoutSaveTimer) {
    clearTimeout(popoutSaveTimer);
    popoutSaveTimer = null;
  }
  for (const [id2, win] of popoutWindows) {
    if (!win.isDestroyed()) rememberPopoutBounds(win, id2);
  }
}
function openPageWindow(registry2, pageId) {
  const existing = popoutWindows.get(pageId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  const state = registry2.get(pageId);
  const restored = resolvePopoutBounds(pageId, 720, 480);
  const win = new BrowserWindow({
    width: restored?.width ?? 1e3,
    height: restored?.height ?? 700,
    x: restored?.x,
    y: restored?.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: state?.name || savedSite(pageId)?.name || pageId,
    backgroundColor: "#000000",
    // same frameless contract as the main shell: the renderer draws its own title strip
    frame: false,
    icon: appIconPath(),
    webPreferences: {
      preload: shellPreload(),
      // mirrors the main window: the popout hosts the page in a <webview> of its own
      sandbox: false,
      webviewTag: true
    }
  });
  popoutWindows.set(pageId, win);
  win.on("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on("page-title-updated", (e) => {
    e.preventDefault();
  });
  win.on("resize", schedulePopoutSave);
  win.on("move", schedulePopoutSave);
  const pushMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.OnMaximizedChanged, win.isMaximized());
  };
  win.on("maximize", () => {
    schedulePopoutSave();
    pushMaximized();
  });
  win.on("unmaximize", () => {
    schedulePopoutSave();
    pushMaximized();
  });
  win.on("closed", () => {
    popoutWindows.delete(pageId);
  });
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) win.loadURL(`${devUrl}?popout=${encodeURIComponent(pageId)}`);
  else win.loadFile(join(__dirname, "../renderer/index.html"), { query: { popout: pageId } });
  return win;
}
function activeKeybindings() {
  const stored = getSettings().keybindings || {};
  const out = { ...DEFAULT_KEYBINDINGS };
  for (const action of Object.keys(out)) {
    const v = stored[action];
    if (typeof v === "string") out[action] = v;
  }
  return out;
}
const GUEST_ACTIONS = ["palette", "terminal", "popoutCurrent"];
function wireGuestShortcuts(registry2) {
  if (guestKeysWired) return;
  guestKeysWired = true;
  app$1.on("web-contents-created", (_e, contents) => {
    if (contents.getType() !== "webview") return;
    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const bindings = activeKeybindings();
      let fired = null;
      for (const action of GUEST_ACTIONS) {
        if (matchesAccelerator(bindings[action], {
          key: input.key,
          code: input.code,
          ctrl: input.control,
          shift: input.shift,
          alt: input.alt,
          meta: input.meta
        })) {
          fired = action;
          break;
        }
      }
      if (!fired) return;
      event.preventDefault();
      const url = contents.getURL();
      const pageId = url ? registry2.running().find((p) => p.url && url.startsWith(p.url))?.id : void 0;
      const signal = { action: fired, ...pageId ? { pageId } : {} };
      const hostId = contents.hostWebContents?.id;
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.webContents.id === hostId) {
          win.webContents.send(IPC.OnHotkey, signal);
          break;
        }
      }
    });
  });
}
const GUEST_DARK_PROBE = `(() => {
  const de = document.documentElement
  if (!de) return false
  const root = getComputedStyle(de)
  if ((root.colorScheme || 'normal').indexOf('dark') >= 0) return false
  const rgba = (c) => {
    const m = String(c).match(/rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?\\)/)
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null
  }
  const body = document.body ? rgba(getComputedStyle(document.body).backgroundColor) : null
  const bg = (body && body.a ? body : rgba(root.backgroundColor)) || null
  if (!bg || bg.a === 0) return false
  return 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b < 110
})()`;
const GUEST_DARK_CSS = ":root{color-scheme:dark}";
async function backfillGuestScheme(contents) {
  if (contents.isDestroyed()) return;
  const prev = guestSchemeCss.get(contents);
  if (prev) {
    guestSchemeCss.delete(contents);
    await contents.removeInsertedCSS(prev).catch(() => void 0);
  }
  if (!nativeTheme.shouldUseDarkColors) return;
  try {
    if (await contents.executeJavaScript(GUEST_DARK_PROBE, false) !== true) return;
    guestSchemeCss.set(contents, await contents.insertCSS(GUEST_DARK_CSS, { cssOrigin: "user" }));
  } catch {
  }
}
function wireGuestScheme() {
  if (guestSchemeWired) return;
  guestSchemeWired = true;
  app$1.on("web-contents-created", (_e, contents) => {
    if (contents.getType() !== "webview") return;
    contents.on("dom-ready", () => void backfillGuestScheme(contents));
    contents.once("destroyed", () => guestSchemeCss.delete(contents));
  });
  nativeTheme.on("updated", () => {
    for (const c of webContents.getAllWebContents()) {
      if (!c.isDestroyed() && c.getType() === "webview") void backfillGuestScheme(c);
    }
  });
}
function registerWindowIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  nativeTheme.on("updated", () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.OnNativeTheme, nativeTheme.shouldUseDarkColors);
    }
  });
  ipcMain$1.handle(IPC.GetNativeTheme, () => ok2(nativeTheme.shouldUseDarkColors));
  ipcMain$1.handle(
    IPC.SetNativeTheme,
    (_e, source) => {
      if (source === "auto" || source === void 0 || source === null)
        nativeTheme.themeSource = "system";
      else if (typeof source === "boolean") nativeTheme.themeSource = source ? "dark" : "light";
      else nativeTheme.themeSource = source;
      return ok2(true);
    }
  );
  ipcMain$1.handle(IPC.MinimizeWindow, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
    return ok2(true);
  });
  ipcMain$1.handle(IPC.ToggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return ok2(false);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return ok2(win.isMaximized());
  });
  ipcMain$1.handle(IPC.CloseWindow, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
    return ok2(true);
  });
  ipcMain$1.handle(
    IPC.GetIsMaximized,
    (e) => ok2(Boolean(BrowserWindow.fromWebContents(e.sender)?.isMaximized()))
  );
  wireGuestShortcuts(registry2);
  wireGuestScheme();
  ipcMain$1.handle(IPC.OpenPageWindow, (_e, pageId) => {
    try {
      if (!registry2.get(pageId) && !savedSite(pageId)) {
        return fail2(new Error(m("page.unknown", { id: pageId })));
      }
      openPageWindow(registry2, pageId);
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.RelaunchApp, () => {
    if (!app$1.isPackaged) {
      dialog.showMessageBox({ type: "info", title: m("dialog.title"), message: m("update.relaunchDev") }).catch(() => void 0);
      return ok2(false);
    }
    if (relaunchToApplyStaged()) {
      setTimeout(() => app$1.exit(0), 700);
      return ok2(true);
    }
    const args = process.argv.slice(1).filter((a) => a !== "--autostart");
    app$1.relaunch({ args: [...args, "--dsh-relaunched"] });
    app$1.exit(0);
    return ok2(true);
  });
  ipcMain$1.handle(IPC.QuitApp, () => {
    app$1.quit();
    return ok2(true);
  });
  ipcMain$1.handle(IPC.ToggleDevTools, (e, guestId) => {
    try {
      const guest = typeof guestId === "number" ? webContents.fromId(guestId) : void 0;
      if (typeof guestId === "number" && !guest) return fail2(new Error(m("ipc.guestGone")));
      const target = guest ?? BrowserWindow.fromWebContents(e.sender)?.webContents ?? e.sender;
      if (target.isDevToolsOpened()) target.closeDevTools();
      else target.openDevTools({ mode: "detach" });
      return ok2({ opened: target.isDevToolsOpened(), scope: guest ? "webview" : "window" });
    } catch (err) {
      return fail2(err);
    }
  });
}
function registerRuntimeIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  ipcMain$1.handle(IPC.GetNodeInfo, async () => {
    try {
      return ok2(await getNodeRuntimeInfo());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ListNodeVersions, async (_e, includeIncompatible) => {
    try {
      return ok2(await listNodeVersions(!!includeIncompatible));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.UpdateNodeRuntime, async (e, version) => {
    const sender = e.sender;
    const onProgress = (p) => {
      if (!sender.isDestroyed()) sender.send(IPC.OnNodeUpdateProgress, p);
    };
    try {
      return ok2(await updateNodeRuntime(version, onProgress));
    } catch (err) {
      return fail2(err);
    } finally {
      onProgress({ name: "Node", phase: "done" });
    }
  });
  ipcMain$1.handle(IPC.RestoreBundledNode, async () => {
    try {
      return ok2(await restoreBundledNode());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(
    IPC.ProvisionBuiltin,
    async (_e, kind, version) => {
      try {
        const res = await provisionBuiltin(kind, version);
        clearUpdateCache();
        if (kind === "mcp") refreshBuiltinPackages();
        registry2.emitChanged();
        return ok2(res);
      } catch (err) {
        return fail2(err);
      }
    }
  );
}
const SERVER_DEP_MARKERS = [
  "express",
  "koa",
  "fastify",
  "@nestjs",
  "hapi",
  "restify",
  "egg",
  "midway",
  "next",
  "nuxt",
  "astro",
  "remix",
  "hono",
  "polka",
  "socket.io",
  "strapi",
  "adonis",
  "feathers",
  "micro",
  "http-server",
  "graphql-yoga",
  "body-parser"
];
const NON_NODE_MARKERS = [
  { file: "Cargo.toml", label: "Rust" },
  { file: "go.mod", label: "Go" },
  { file: "pom.xml", label: "Java (Maven)" },
  { file: "build.gradle", label: "Java (Gradle)" },
  { file: "build.gradle.kts", label: "Java (Gradle)" },
  { file: "Gemfile", label: "Ruby" },
  { file: "requirements.txt", label: "Python" },
  { file: "pyproject.toml", label: "Python" },
  { file: "composer.json", label: "PHP" }
];
const KNOWN_NPM_BY_REPO = {
  "openai/codex": "@openai/codex",
  codex: "@openai/codex",
  "anthropics/claude-code": "@anthropic-ai/claude-code",
  "claude-code": "@anthropic-ai/claude-code",
  "google-gemini/gemini-cli": "@google/gemini-cli",
  "gemini-cli": "@google/gemini-cli",
  "sst/opencode": "opencode-ai"
};
function npmSuggestionFor(source) {
  const s = (source || "").trim().replace(/\.git$/i, "").replace(/[/\\]+$/, "");
  if (!s) return null;
  const segs = s.split(/[\\/:@]+/).filter((x) => x && x !== "github.com" && !x.includes("."));
  const tail = segs.slice(-2);
  if (tail.length === 2) {
    const ownerRepo = `${tail[0]}/${tail[1]}`.toLowerCase();
    if (KNOWN_NPM_BY_REPO[ownerRepo]) return KNOWN_NPM_BY_REPO[ownerRepo];
  }
  const repo = tail[tail.length - 1]?.toLowerCase();
  return repo ? KNOWN_NPM_BY_REPO[repo] ?? null : null;
}
function readPkgSafe(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}
function hasServerDependency(pkg) {
  if (!pkg) return false;
  const all = { ...pkg.dependencies || {}, ...pkg.devDependencies || {} };
  return Object.keys(all).some((n) => {
    const k = n.toLowerCase();
    return SERVER_DEP_MARKERS.some((mk) => k === mk || k.startsWith(`${mk}/`) || k.includes(mk));
  });
}
function runtimeDepCount(pkg) {
  if (!pkg) return 0;
  return Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.optionalDependencies || {}).length;
}
function cliStartCommand(dir, pkg) {
  if (pkg?.scripts?.start) return "npm run start";
  const bin = pkg?.bin;
  let rel = null;
  if (typeof bin === "string") rel = bin;
  else if (bin && typeof bin === "object") rel = Object.values(bin)[0] ?? null;
  if (rel) {
    const clean = rel.replace(/^\.\//, "");
    if (existsSync(join(dir, clean))) return `node ${clean}`;
  }
  return null;
}
function detectNonNodeStack(dir) {
  for (const mk of NON_NODE_MARKERS) if (existsSync(join(dir, mk.file))) return mk.label;
  try {
    for (const e of readdirSync(dir)) {
      if (/\.(csproj|fsproj|vbproj|sln|vcxproj)$/i.test(e)) return ".NET / C++";
    }
  } catch {
  }
  return null;
}
function classifyProject(dir) {
  const pkg = readPkgSafe(dir);
  const hasPkg = pkg !== null;
  const nonNode = detectNonNodeStack(dir);
  const pageViable = existsSync(join(dir, "server.js")) || existsSync(join(dir, "index.js")) || Boolean(pkg?.scripts?.start);
  const binOnlyCli = Boolean(pkg?.bin) && !hasServerDependency(pkg);
  const terminalStart = binOnlyCli ? cliStartCommand(dir, pkg) : null;
  const terminalViable = Boolean(terminalStart);
  const deps = runtimeDepCount(pkg);
  const needsInstall = hasPkg && deps > 0;
  if (terminalViable) {
    return {
      tier: needsInstall ? "yellow" : "green",
      kind: "terminal",
      needsInstall,
      startCommand: terminalStart
    };
  }
  if (pageViable) {
    return { tier: needsInstall ? "yellow" : "green", kind: "page", needsInstall };
  }
  if (nonNode) {
    return {
      tier: "red",
      needsInstall: false,
      reason: "install.rejectNonNode",
      reasonParams: { stack: nonNode }
    };
  }
  if (hasPkg && (pkg?.private || pkg?.workspaces)) {
    return { tier: "red", needsInstall: false, reason: "install.rejectMonorepoRoot" };
  }
  return { tier: "red", needsInstall: false, reason: "install.rejectNoEntry" };
}
function githubRawBase(url) {
  const https = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (https) return `https://raw.githubusercontent.com/${https[1]}/${https[2]}/HEAD`;
  const ssh = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ssh) return `https://raw.githubusercontent.com/${ssh[1]}/${ssh[2]}/HEAD`;
  return null;
}
function fetchRaw(url, timeoutMs = 5e3) {
  return new Promise((resolve2) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve2(v);
    };
    try {
      const lib = url.startsWith("https") ? get$1 : get$2;
      const req = lib(url, { timeout: timeoutMs }, (res) => {
        if ((res.statusCode ?? 0) !== 200) {
          res.resume();
          return done({ ok: false, body: "" });
        }
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (d) => body += d);
        res.on("end", () => done({ ok: true, body }));
        res.on("error", () => done({ ok: false, body: "" }));
      });
      req.on("error", () => done({ ok: false, body: "" }));
      req.on("timeout", () => {
        req.destroy();
        done({ ok: false, body: "" });
      });
    } catch {
      done({ ok: false, body: "" });
    }
  });
}
async function probeRemoteTier(repoUrl) {
  const base = githubRawBase(repoUrl);
  if (!base) return null;
  const [pkgRes, serverRes, indexRes, cargoRes, gomodRes] = await Promise.all([
    fetchRaw(`${base}/package.json`),
    fetchRaw(`${base}/server.js`),
    fetchRaw(`${base}/index.js`),
    fetchRaw(`${base}/Cargo.toml`),
    fetchRaw(`${base}/go.mod`)
  ]);
  const nonNodeLabel = () => {
    if (cargoRes.ok) return "Rust";
    if (gomodRes.ok) return "Go";
    return null;
  };
  let pkg = null;
  if (pkgRes.ok) {
    try {
      pkg = JSON.parse(pkgRes.body);
    } catch {
      return null;
    }
  } else {
    const stack2 = nonNodeLabel();
    if (stack2 && !serverRes.ok && !indexRes.ok) {
      return {
        tier: "red",
        needsInstall: false,
        reason: "install.rejectNonNode",
        reasonParams: { stack: stack2 }
      };
    }
    return null;
  }
  const pageViable = serverRes.ok || indexRes.ok || Boolean(pkg?.scripts?.start);
  if (pageViable || Boolean(pkg?.bin)) return null;
  const stack = nonNodeLabel();
  if (stack) {
    return {
      tier: "red",
      needsInstall: false,
      reason: "install.rejectNonNode",
      reasonParams: { stack }
    };
  }
  if (pkg?.private || pkg?.workspaces) {
    return { tier: "red", needsInstall: false, reason: "install.rejectMonorepoRoot" };
  }
  return null;
}
async function adoptOrigin(dir, originUrl) {
  const pageGit = simpleGit({ baseDir: dir });
  await pageGit.init(["-b", "main"]);
  await pageGit.add(".");
  await pageGit.commit("Imported into DSH container (origin tracked for updates)", [
    "--allow-empty",
    "--author",
    "DSH Container <container@local>",
    "--date",
    "now"
  ]);
  await pageGit.remote(["add", "origin", originUrl]);
}
function applyPortOverride(dirName, port) {
  if (!isValidPort(port)) return;
  updateSettings({ pagePorts: { ...getSettings().pagePorts, [dirName]: Number(port) } });
}
function seedContainerManifest(pagesDir, dirName, port, cls) {
  const dir = join(pagesDir, dirName);
  const metaFile = join(dir, "container.json");
  if (!existsSync(metaFile)) {
    const manifest = {
      name: dirName,
      description: {
        zh: msgIn("zh", "install.importedDesc"),
        en: msgIn("en", "install.importedDesc")
      }
    };
    if (cls.kind === "terminal") {
      manifest.kind = "terminal";
      if (cls.startCommand) manifest.startCommand = cls.startCommand;
    } else {
      manifest.kind = "page";
      if (isValidPort(port)) manifest.port = Number(port);
    }
    writeFileSync$1(metaFile, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  }
  return cls;
}
function bundledNpmCli() {
  return join(dirname(getNodeExePath()), "node_modules", "npm", "bin", "npm-cli.js");
}
async function installDeps(dir, onMessage) {
  const pkg = readPkgSafe(dir);
  const deps = runtimeDepCount(pkg);
  if (!deps) return;
  const cli = bundledNpmCli();
  if (!existsSync(cli)) throw new Error(m("install.npmMissing"));
  applyNpmRegistryEnv();
  const args = existsSync(join(dir, "package-lock.json")) ? ["ci"] : ["install"];
  await runStream(
    getNodeExePath(),
    [cli, ...args, "--no-audit", "--no-fund"],
    dir,
    `npm ${args.join(" ")}`,
    onMessage,
    // the import target folder *is* the page id — mirror npm's output into its log file
    basename(dir)
  );
}
function runStream(cmd, args, cwd, caption, onMessage, logTo, timeoutMs = 15 * 6e4) {
  return new Promise((resolve2, reject) => {
    const child = spawn(cmd, args, { cwd, env: bundledEnv(), windowsHide: true, shell: false });
    console.log(`[install] ${caption} started in ${cwd}`);
    let tail = "";
    const onData = (d) => {
      const text = String(d);
      if (logTo) logPageLine(logTo, text);
      tail += text;
      if (tail.length > 8e3) tail = tail.slice(-8e3);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length) onMessage?.(lines[lines.length - 1].trim());
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      console.error(`[install] ${caption} timed out after ${Math.round(timeoutMs / 6e4)}min`);
      reject(new Error(m("install.timeout", { cmd: caption })));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      console.error(`[install] ${caption} spawn failed:`, err);
      reject(err);
    });
    child.on("close", (code2) => {
      clearTimeout(timer);
      if (code2 === 0) {
        console.log(`[install] ${caption} finished`);
        resolve2();
      } else {
        console.error(`[install] ${caption} failed (exit ${code2}): ${tail.slice(-500)}`);
        reject(new Error(m("install.depsFail", { cmd: caption, tail: tail.slice(-500) })));
      }
    });
  });
}
function validateRepoUrl(url) {
  const trimmed = url.trim();
  if (!/^(https?:\/\/|git@)[^\s]+\.git$/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error(m("install.repoUrlInvalid"));
  }
  if (/[\s;`$&|]/.test(trimmed)) throw new Error(m("dsh.illegalRepoChars"));
  return trimmed;
}
async function installFromGit(pagesDir, repoUrl, name, port, originUrl, onProgress, opts) {
  const url = validateRepoUrl(repoUrl);
  let dirName = (name || "").trim().replace(/[^\w.-]/g, "");
  if (!dirName) {
    const base = url.split("/").pop() || "page";
    dirName = base.replace(/\.git$/i, "");
  }
  if (!dirName || dirName === "." || dirName === "..") throw new Error(m("install.dirNameNeeded"));
  const target = join(pagesDir, dirName);
  if (existsSync(target)) throw new Error(m("dsh.pageExists", { id: dirName }));
  mkdirSync(pagesDir, { recursive: true });
  const emit = (p) => onProgress?.({ op: "git", phase: "preparing", source: repoUrl, target: dirName, ...p });
  emit({ phase: "preparing" });
  const pre = await probeRemoteTier(url).catch(() => null);
  if (pre?.tier === "red") {
    logEvent({ level: "warn", kind: "install.rejected", pageId: dirName, detail: pre.reason });
    throw new Error(m(pre.reason, pre.reasonParams));
  }
  await cloneWithAuthFallback(
    target,
    url,
    (g) => emit({ phase: "receiving", percent: g.percent, message: gitCaption(g) })
  );
  emit({ phase: "validating" });
  const cls = classifyProject(target);
  if (cls.tier === "red") {
    rmSync(target, { recursive: true, force: true });
    logEvent({ level: "warn", kind: "install.rejected", pageId: dirName, detail: cls.reason });
    throw new Error(m(cls.reason, cls.reasonParams));
  }
  applyPortOverride(dirName, port);
  seedContainerManifest(pagesDir, dirName, port, cls);
  try {
    readPageMeta(pagesDir, dirName);
  } catch (err) {
    console.warn(`[installer] ${dirName}: seeded but readPageMeta failed (kept on disk):`, err);
    logEvent({
      level: "warn",
      kind: "install.needsConfig",
      pageId: dirName,
      detail: err.message
    });
  }
  await runInstallStep(target, cls, opts, emit);
  emit({ phase: "done", percent: 100 });
  return dirName;
}
async function runInstallStep(target, cls, opts, emit) {
  if (!opts?.autoInstall || !cls.needsInstall) return;
  emit({ phase: "installing", message: "npm install" });
  try {
    await installDeps(target, (line) => emit({ phase: "installing", message: line }));
  } catch (err) {
    console.warn("[installer] dependency install failed (import kept):", err.message);
    logEvent({
      level: "warn",
      kind: "install.depsFailed",
      detail: err.message
    });
  }
}
function gitCaption(g) {
  const cnt = g.total ? ` (${g.processed ?? 0}/${g.total})` : "";
  return `${g.stage}${cnt} ${g.percent}%`;
}
function parseNpmSpec(spec) {
  const s = (spec || "").trim();
  if (!s) throw new Error(m("install.npmSpecNeeded"));
  const at = s.startsWith("@") ? s.indexOf("@", 1) : s.indexOf("@");
  const pkg = at === -1 ? s : s.slice(0, at);
  const version = at === -1 ? void 0 : s.slice(at + 1);
  const validName = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/[a-z0-9-._~]+|[a-z0-9-._~]+)$/i.test(pkg);
  const validVersion = version === void 0 || /^[\w.+-]+$/.test(version);
  if (!pkg || !validName || !validVersion) {
    throw new Error(m("install.npmSpecInvalid", { spec: s }));
  }
  return { pkg, version };
}
async function installFromNpm(pagesDir, spec, name, onProgress, capabilitiesDir = join(pagesDir, "..", "capabilities")) {
  const { pkg, version } = parseNpmSpec(spec);
  let dirName = (name || "").trim().replace(/[^\w.-]/g, "");
  if (!dirName) dirName = pkg.replace(/^@/, "").replace(/\//g, "-");
  if (!dirName || dirName === "." || dirName === "..") throw new Error(m("install.dirNameNeeded"));
  const target = join(pagesDir, dirName);
  if (existsSync(target)) throw new Error(m("dsh.pageExists", { id: dirName }));
  const capDir = join(capabilitiesDir, dirName);
  const specLabel = `${pkg}@${version || "latest"}`;
  const emit = (p) => onProgress?.({ op: "npm", phase: "preparing", source: specLabel, target: dirName, ...p });
  emit({ phase: "preparing" });
  mkdirSync(capDir, { recursive: true });
  writeFileSync$1(
    join(capDir, "package.json"),
    JSON.stringify({ name: dirName.toLowerCase(), version: "0.0.0", private: true }, null, 2) + "\n",
    "utf-8"
  );
  applyNpmRegistryEnv();
  const cli = bundledNpmCli();
  if (!existsSync(cli)) {
    rmSync(capDir, { recursive: true, force: true });
    throw new Error(m("install.npmMissing"));
  }
  emit({ phase: "installing", message: `npm install ${specLabel}` });
  try {
    await runStream(
      getNodeExePath(),
      [cli, "install", specLabel, "--no-audit", "--no-fund"],
      capDir,
      `npm install ${specLabel}`,
      (line) => emit({ phase: "installing", message: line }),
      // mirror the npm install into the new page's own log file, like a hosted page's output
      dirName
    );
  } catch (err) {
    rmSync(capDir, { recursive: true, force: true });
    throw err;
  }
  emit({ phase: "validating" });
  const entry = resolveMcpPkgEntry(pkg, capDir);
  if (!entry) {
    rmSync(capDir, { recursive: true, force: true });
    logEvent({ level: "warn", kind: "install.rejected", pageId: dirName, detail: "install.npmNoBin" });
    throw new Error(m("install.npmNoBin", { pkg }));
  }
  mkdirSync(target, { recursive: true });
  const manifest = {
    name: dirName,
    description: {
      zh: msgIn("zh", "install.importedNpmDesc"),
      en: msgIn("en", "install.importedNpmDesc")
    },
    kind: "terminal",
    startCommand: `node "${entry}"`,
    npmPackage: pkg,
    capabilityDir: capDir
  };
  writeFileSync$1(join(target, "container.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  try {
    readPageMeta(pagesDir, dirName);
  } catch (err) {
    console.warn(`[installer] ${dirName}: seeded but readPageMeta failed (kept on disk):`, err);
    logEvent({
      level: "warn",
      kind: "install.needsConfig",
      pageId: dirName,
      detail: err.message
    });
  }
  emit({ phase: "done", percent: 100 });
  return dirName;
}
async function planCopy(root2) {
  const entries2 = [];
  let totalBytes = 0;
  const walk = async (dir, relBase) => {
    const items2 = await readdir(dir, { withFileTypes: true });
    items2.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const it of items2) {
      if (it.name === "node_modules" || it.name === ".git") continue;
      const abs = join(dir, it.name);
      const rel = relBase ? `${relBase}/${it.name}` : it.name;
      if (it.isDirectory()) {
        entries2.push({ abs, rel, dir: true, size: 0 });
        await walk(abs, rel);
      } else if (it.isFile()) {
        const s = await stat(abs);
        entries2.push({ abs, rel, dir: false, size: s.size });
        totalBytes += s.size;
      }
    }
  };
  await walk(root2, "");
  return { entries: entries2, totalBytes };
}
async function copyDirWithProgress(srcDir, target, emit) {
  const { entries: entries2, totalBytes } = await planCopy(srcDir);
  mkdirSync(target, { recursive: true });
  let received = 0;
  let last = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - last < 100) return;
    last = now;
    emit({
      phase: "receiving",
      percent: totalBytes ? Math.min(100, Math.floor(received / totalBytes * 100)) : 100,
      received,
      total: totalBytes
    });
  };
  report(true);
  for (const e of entries2) {
    const dest = join(target, e.rel);
    if (e.dir) {
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      continue;
    }
    await copyFile(e.abs, dest);
    received += e.size;
    report();
  }
  report(true);
}
async function installFromLocalDir(pagesDir, srcDir, name, port, originUrl, onProgress, opts) {
  if (!existsSync(srcDir) || !existsSync(join(srcDir, ".")))
    throw new Error(m("install.srcMissing", { dir: srcDir }));
  let dirName = (name || "").trim().replace(/[^\w.-]/g, "");
  if (!dirName) dirName = srcDir.split(/[\\/]/).filter(Boolean).pop() || "";
  if (!dirName) throw new Error(m("install.dirNameFail"));
  const target = join(pagesDir, dirName);
  if (existsSync(target)) throw new Error(m("dsh.pageExists", { id: dirName }));
  const emit = (p) => onProgress?.({ op: "dir", phase: "preparing", source: srcDir, target: dirName, ...p });
  emit({ phase: "preparing" });
  const cls = classifyProject(srcDir);
  if (cls.tier === "red") {
    logEvent({ level: "warn", kind: "install.rejected", pageId: dirName, detail: cls.reason });
    throw new Error(m(cls.reason, cls.reasonParams));
  }
  await copyDirWithProgress(srcDir, target, emit);
  emit({ phase: "validating" });
  applyPortOverride(dirName, port);
  seedContainerManifest(pagesDir, dirName, port, cls);
  try {
    readPageMeta(pagesDir, dirName);
  } catch (err) {
    console.warn(`[installer] ${dirName}: seeded but readPageMeta failed (kept on disk):`, err);
    logEvent({
      level: "warn",
      kind: "install.needsConfig",
      pageId: dirName,
      detail: err.message
    });
  }
  emit({ phase: "finalizing" });
  await runInstallStep(target, cls, opts, emit);
  const origin = (originUrl || "").trim();
  if (origin) {
    try {
      await adoptOrigin(target, origin);
    } catch (err) {
      console.warn("[installer] adoptOrigin failed (ignored):", err.message);
    }
  }
  emit({ phase: "done", percent: 100 });
  return dirName;
}
function removePage(pagesDir, id2) {
  if (id2 === "__container__") throw new Error(m("install.cannotRemoveContainer"));
  if (BUILTIN_PAGE_IDS.has(id2)) throw new Error(m("install.builtinUndeletable", { id: id2 }));
  const target = join(pagesDir, id2);
  if (!target.startsWith(pagesDir + sep)) throw new Error(m("install.illegalPageId"));
  let capabilityDir;
  try {
    const raw = JSON.parse(readFileSync(join(target, "container.json"), "utf-8"));
    if (typeof raw.capabilityDir === "string" && raw.capabilityDir.trim()) capabilityDir = raw.capabilityDir.trim();
  } catch {
  }
  rmSync(target, { recursive: true, force: true });
  if (capabilityDir) rmSync(capabilityDir, { recursive: true, force: true });
  const { [id2]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {};
  const { [id2]: _depDropped, ...pageDepsRest } = getSettings().pageDeps ?? {};
  const pageDeps = {};
  for (const [k, v] of Object.entries(pageDepsRest)) {
    const kept = (v ?? []).filter((d) => d !== id2);
    if (kept.length) pageDeps[k] = kept;
  }
  updateSettings({ pagePorts, pageDeps });
}
function registerPagesIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  ipcMain$1.handle(IPC.ListPages, async () => {
    registry2.reconcile();
    await registry2.refreshRuntimePresence().catch(() => void 0);
    return ok2(registry2.list());
  });
  ipcMain$1.handle(IPC.StartPage, async (_e, id2) => {
    try {
      return ok2(await registry2.startWithDeps(id2));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.StopPage, async (_e, id2) => {
    registry2.stop(id2);
    return ok2(registry2.get(id2));
  });
  ipcMain$1.handle(IPC.RestartPage, async (_e, id2) => {
    try {
      return ok2(await registry2.restartWithDeps(id2));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetPageLogs, (_e, id2) => ok2(registry2.logs(id2)));
  ipcMain$1.handle(
    IPC.InstallPageFromGit,
    async (_e, repoUrl, name, port, opts) => {
      const sender = _e.sender;
      const onProgress = (p) => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p);
      };
      try {
        const dirName = await installFromGit(
          resolvePagesDir(),
          repoUrl,
          name,
          port,
          void 0,
          onProgress,
          opts
        );
        registry2.reconcile();
        clearUpdateCache();
        return ok2(dirName);
      } catch (err) {
        return fail2(err);
      } finally {
        onProgress({ op: "git", phase: "done", percent: 100 });
      }
    }
  );
  ipcMain$1.handle(
    IPC.InstallPageFromDir,
    async (_e, srcDir, name, port, originUrl, opts) => {
      const sender = _e.sender;
      const onProgress = (p) => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p);
      };
      try {
        const dirName = await installFromLocalDir(
          resolvePagesDir(),
          srcDir,
          name,
          port,
          originUrl,
          onProgress,
          opts
        );
        registry2.reconcile();
        clearUpdateCache();
        return ok2(dirName);
      } catch (err) {
        return fail2(err);
      } finally {
        onProgress({ op: "dir", phase: "done", percent: 100 });
      }
    }
  );
  ipcMain$1.handle(
    IPC.InstallPageFromNpm,
    async (_e, spec, name) => {
      const sender = _e.sender;
      const onProgress = (p) => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p);
      };
      try {
        const dirName = await installFromNpm(
          resolvePagesDir(),
          spec,
          name,
          onProgress,
          resolveCapabilitiesDir()
        );
        registry2.reconcile();
        clearUpdateCache();
        return ok2(dirName);
      } catch (err) {
        return fail2(err);
      } finally {
        onProgress({ op: "npm", phase: "done", percent: 100 });
      }
    }
  );
  ipcMain$1.handle(
    IPC.PreflightImport,
    async (_e, source, isDir) => {
      try {
        const cls = isDir ? classifyProject(String(source || "").trim()) : await probeRemoteTier(String(source || "").trim());
        if (!cls) return ok2({ tier: null });
        return ok2({
          tier: cls.tier,
          kind: cls.kind,
          needsInstall: cls.needsInstall,
          reason: cls.reason ? m(cls.reason, cls.reasonParams) : void 0,
          // a rejected well-known repo (codex & friends) has a runnable npm CLI: offer it.
          suggestNpm: cls.tier === "red" ? npmSuggestionFor(String(source || "")) ?? void 0 : void 0
        });
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(IPC.ChooseDirectory, async (e, title2) => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender);
      const opts = {
        properties: ["openDirectory", "createDirectory"],
        title: title2 || m("dialog.chooseDir")
      };
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      if (res.canceled || !res.filePaths.length) return ok2(null);
      return ok2(res.filePaths[0]);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.SetPageDisabled, (_e, id2, disabled) => {
    try {
      const state = registry2.get(id2);
      if (!state) return fail2(new Error(m("page.unknown", { id: id2 })));
      if (state.external) return fail2(new Error(m("page.disableExternal")));
      const s = getSettings();
      const set = new Set(s.disabledPages || []);
      if (disabled) set.add(id2);
      else set.delete(id2);
      updateSettings({ disabledPages: [...set] });
      if (disabled && (state.status === "running" || state.status === "starting"))
        registry2.stop(id2);
      else registry2.announceChange();
      return ok2(registry2.get(id2));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.RemovePage, (_e, id2) => {
    try {
      registry2.stop(id2);
      removePage(resolvePagesDir(), id2);
      registry2.reconcile();
      const s = getSettings();
      if (s.autoStartPages.includes(id2))
        updateSettings({ autoStartPages: s.autoStartPages.filter((x) => x !== id2) });
      if (s.defaultView.kind === "page" && s.defaultView.pageId === id2)
        setDefaultView({ kind: "none" });
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ResetBuiltinPage, (_e, id2) => {
    try {
      if (!BUILTIN_PAGE_IDS.has(id2)) return fail2(new Error(m("ipc.resetNotBuiltin")));
      const wasRunning = registry2.get(id2)?.status === "running";
      registry2.stop(id2);
      rmSync(join(resolvePagesDir(), id2), { recursive: true, force: true });
      ensureDefaultOpenclawPage();
      ensureBuiltinPages();
      registry2.reconcile();
      if (wasRunning) {
        registry2.start(id2).catch((err) => console.error(`[page:${id2}] reset auto-start failed:`, err));
      }
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.SetPagePort, (_e, id2, port) => {
    try {
      const clear = port === void 0 || port === null || Number(port) === 0;
      if (!clear && !isValidPort(port)) return { ok: false, error: m("ipc.portRange") };
      const pagePorts = { ...getSettings().pagePorts };
      if (clear) delete pagePorts[id2];
      else pagePorts[id2] = Number(port);
      updateSettings({ pagePorts });
      registry2.reconcile();
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.SetPageDeps, (_e, id2, deps) => {
    try {
      const pageDeps = { ...getSettings().pageDeps };
      const next2 = Array.isArray(deps) ? [...new Set(deps.map((d) => String(d).trim()).filter((d) => d && d !== id2))] : [];
      const cleaned = {};
      for (const [k, v] of Object.entries(pageDeps)) if (k !== id2 && Array.isArray(v)) cleaned[k] = v;
      if (next2.length) cleaned[id2] = next2;
      const graph = {};
      for (const p of registry2.list()) graph[p.id] = p.id === id2 ? next2 : [...p.dependsOn ?? []];
      graph[id2] = next2;
      const cycle = findDepCycle(graph, id2);
      if (cycle) return { ok: false, error: m("ipc.depsCycle", { chain: cycle.join(" → ") }) };
      updateSettings({ pageDeps: cleaned });
      registry2.reconcile();
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.OpenPageExternal, async (_e, url) => {
    try {
      await shell$1.openExternal(url);
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.KillPortHolder, async (_e, port) => {
    try {
      const n = Number(port);
      if (!Number.isFinite(n) || n < 1 || n > 65535) return fail2(new Error(m("ipc.portRange")));
      return ok2(await killPortHolder(n));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(
    IPC.CheckPortFree,
    async (_e, port, pageId) => {
      try {
        const n = Number(port);
        if (!isValidPort(n)) return fail2(new Error(m("ipc.portRange")));
        const bind = await probePortBind(n);
        if (bind === "free") return ok2({ port: n, free: true });
        const holder = await findPortHolder(n);
        if (bind === "error" && !holder) return ok2({ port: n, free: false, probeError: true });
        if (holder && pageId && registry2.get(pageId)?.pid === holder.pid) {
          return ok2({ port: n, free: true });
        }
        return ok2({ port: n, free: false, ...holder ? { holder } : {}, ...bind === "error" ? { probeError: true } : {} });
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(IPC.EnvRoot, () => {
    return ok2({
      envRoot: resolveEnvRoot(),
      installDir: resolveInstallDir(),
      home: homedir$1()
    });
  });
  ipcMain$1.handle(
    IPC.DownloadDir,
    () => ok2({
      downloadDir: resolveDownloadDir(),
      defaultDir: defaultDownloadDir(),
      custom: Boolean((getSettings().downloadDir || "").trim())
    })
  );
}
function findDepCycle(graph, start) {
  const path2 = [];
  const onPath = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const walk = (node) => {
    if (onPath.has(node)) return [...path2, node];
    if (visited.has(node)) return null;
    visited.add(node);
    onPath.add(node);
    path2.push(node);
    for (const dep of graph[node] ?? []) {
      if (graph[dep] === void 0) continue;
      const found = walk(dep);
      if (found) return found;
    }
    path2.pop();
    onPath.delete(node);
    return null;
  };
  return walk(start);
}
function probeUrl(url, timeoutMs = 8e3) {
  return new Promise((resolve2) => {
    const start = Date.now();
    const getter = url.startsWith("https:") ? get$1 : get$2;
    let settled = false;
    const req = getter(url, (res) => {
      if (settled) return;
      settled = true;
      const ms = Date.now() - start;
      const status = res.statusCode ?? 0;
      res.destroy();
      resolve2({ ok: status > 0, ms, status });
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      resolve2({ ok: false, error: err.message });
    });
    req.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      req.destroy();
      resolve2({ ok: false, error: `timeout ${timeoutMs}ms` });
    });
  });
}
function probeLoopback() {
  return new Promise((resolve2) => {
    const start = Date.now();
    const server = createServer((sock) => {
      sock.end("ok");
    });
    server.on("error", (err) => resolve2({ ok: false, error: err.message }));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        resolve2({ ok: false, error: "no address" });
        return;
      }
      const client = createConnection({ host: "127.0.0.1", port: addr.port });
      client.on("connect", () => {
        const ms = Date.now() - start;
        client.destroy();
        server.close();
        resolve2({ ok: true, ms });
      });
      client.on("error", (err) => {
        client.destroy();
        server.close();
        resolve2({ ok: false, error: err.message });
      });
    });
  });
}
function reachStep(id2, p) {
  if (p.ok) return { id: id2, ok: true, ms: p.ms, detail: m("net.reachable", { ms: p.ms ?? 0 }) };
  return { id: id2, ok: false, detail: m("net.unreachable", { err: p.error || `HTTP ${p.status ?? "?"}` }) };
}
async function runNetworkProbe(npmRegistry) {
  const proxy = {
    http: process.env.HTTP_PROXY || process.env.http_proxy || "",
    https: process.env.HTTPS_PROXY || process.env.https_proxy || "",
    no: process.env.NO_PROXY || process.env.no_proxy || ""
  };
  const proxyStep = {
    id: "proxy",
    ok: true,
    // informational — presence isn't a failure
    detail: proxy.http || proxy.https ? proxy.http || proxy.https : m("net.proxyNone")
  };
  const [gateway, github, npm, mirror] = await Promise.all([
    probeLoopback(),
    probeUrl("https://github.com"),
    probeUrl("https://registry.npmjs.org/-/ping"),
    probeUrl("https://registry.npmmirror.com/-/ping")
  ]);
  const steps = [
    reachStep("gateway", gateway),
    reachStep("github", github),
    reachStep("npm", npm),
    reachStep("npmmirror", mirror),
    proxyStep
  ];
  const healthy = gateway.ok && github.ok && (npm.ok || mirror.ok);
  return { steps, proxy, healthy };
}
async function probeRegistries(timeoutMs = 6e3) {
  const results = await Promise.all(
    REGISTRY_CANDIDATES.map(async (c) => {
      const p = await probeUrl(`${c.url.replace(/\/+$/, "")}/-/ping`, timeoutMs);
      return { id: c.id, url: c.url, ok: p.ok, ms: p.ms, status: p.status, error: p.error };
    })
  );
  return results;
}
const CACHE_DIRS = ["Cache", "Code Cache", "GPUCache", "DawnCache", "Shared Dictionary"];
const STORAGE_DIRS = ["Local Storage", "Session Storage", "IndexedDB", "FileSystem", "WebStorage"];
async function dirBytes(path2) {
  let entries2;
  try {
    entries2 = await promises.readdir(path2, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const ent of entries2) {
    const child = join(path2, ent.name);
    if (ent.isDirectory()) {
      total += await dirBytes(child);
      continue;
    }
    if (!ent.isFile()) continue;
    try {
      const st = await promises.stat(child);
      total += st.size;
    } catch {
    }
  }
  return total;
}
async function sumDirs(names2) {
  const root2 = app$1.getPath("userData");
  const sizes = await Promise.all(names2.map((n) => dirBytes(join(root2, n))));
  return sizes.reduce((a, b) => a + b, 0);
}
async function getWebDataReport() {
  const [cacheBytes, storageBytes, cookies] = await Promise.all([
    sumDirs(CACHE_DIRS),
    sumDirs(STORAGE_DIRS),
    session.defaultSession.cookies.get({})
  ]);
  const counts = /* @__PURE__ */ new Map();
  for (const c of cookies) {
    const domain = (c.domain || "").replace(/^\./, "") || "(unknown)";
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  const cookieDomains = [...counts.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  return { cacheBytes, storageBytes, cookieDomains, totalCookies: cookies.length };
}
function cookieUrl(cookie) {
  const host = (cookie.domain || "").replace(/^\./, "");
  const scheme = cookie.secure ? "https" : "http";
  const path2 = cookie.path && cookie.path !== "/" ? cookie.path : "";
  return `${scheme}://${host}${path2}`;
}
async function clearCookies(domain) {
  const all = await session.defaultSession.cookies.get({});
  const targets = domain ? all.filter((c) => {
    const host = (c.domain || "").replace(/^\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  }) : all;
  let removed = 0;
  for (const c of targets) {
    try {
      await session.defaultSession.cookies.remove(cookieUrl(c), c.name);
      removed += 1;
    } catch {
    }
  }
  return removed;
}
async function clearWebData(args) {
  const scope2 = args.scope;
  let removedCookies = 0;
  if (scope2 === "cache") {
    await session.defaultSession.clearCache();
  } else if (scope2 === "cookies") {
    removedCookies = await clearCookies(args.domain);
  } else if (scope2 === "storage") {
    await session.defaultSession.clearStorageData({
      storages: ["localstorage", "indexdb", "filesystem", "serviceworkers", "shadercache"]
    });
  } else {
    removedCookies = await clearCookies(args.domain);
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
  }
  return { removedCookies, scope: scope2 };
}
const MAX_DEPTH = 8;
const MAX_FILES = 25e4;
const SOFT_TIMEOUT_MS = 4e3;
async function scanDir(path2, depth, budget) {
  if (depth > MAX_DEPTH || budget.files >= MAX_FILES || Date.now() > budget.deadline) {
    budget.truncated = true;
    return 0;
  }
  let entries2;
  try {
    entries2 = await promises.readdir(path2, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const ent of entries2) {
    if (budget.files >= MAX_FILES || Date.now() > budget.deadline) {
      budget.truncated = true;
      break;
    }
    const child = join(path2, ent.name);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) {
      total += await scanDir(child, depth + 1, budget);
      continue;
    }
    if (!ent.isFile()) continue;
    budget.files += 1;
    try {
      const st = await promises.stat(child);
      total += st.size;
    } catch {
    }
  }
  return total;
}
async function subDirs(path2) {
  try {
    const entries2 = await promises.readdir(path2, { withFileTypes: true });
    return entries2.filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
async function dirScope(dir, id2, labelKey, label, budget, withChildren = false) {
  const bytes = await scanDir(dir, 0, budget);
  const scope2 = { id: id2, labelKey, label, bytes };
  if (withChildren) {
    const kids = await subDirs(dir);
    const children = [];
    for (const name of kids) {
      const kidBytes = await scanDir(join(dir, name), 1, budget);
      children.push({ id: `${id2}/${name}`, labelKey: "diskMgr.entry", label: name, bytes: kidBytes });
    }
    if (children.length) scope2.children = children;
  }
  return scope2;
}
async function volumeBytes(path2) {
  try {
    const s = await promises.statfs(path2);
    const total = s.bsize * s.blocks;
    const free = s.bsize * s.bavail;
    return { total: total > 0 ? total : null, free: Number.isFinite(free) ? free : null };
  } catch {
    return { free: null, total: null };
  }
}
async function webCacheBytes(budget) {
  const root2 = app$1.getPath("userData");
  let total = 0;
  for (const name of [...CACHE_DIRS, ...STORAGE_DIRS]) {
    total += await scanDir(join(root2, name), 0, budget);
  }
  return total;
}
async function getDiskReport() {
  const budget = { files: 0, deadline: Date.now() + SOFT_TIMEOUT_MS, truncated: false };
  const userData = app$1.getPath("userData");
  const scopes = [];
  scopes.push({
    id: "webcache",
    labelKey: "diskMgr.webcache",
    bytes: await webCacheBytes(budget)
  });
  scopes.push(
    await dirScope(resolvePagesDir(), "pages", "diskMgr.pages", void 0, budget, true)
  );
  scopes.push(await dirScope(resolveEnvRoot(), "env", "diskMgr.env", void 0, budget, true));
  scopes.push(
    await dirScope(
      resolveCapabilitiesDir(),
      "capabilities",
      "diskMgr.capabilities",
      void 0,
      budget
    )
  );
  scopes.push(
    await dirScope(join(userData, "mcp"), "mcp", "diskMgr.mcp", void 0, budget)
  );
  scopes.push(
    await dirScope(bridgeDir(), "mcp-bridge", "diskMgr.mcpBridge", void 0, budget)
  );
  scopes.push(await dirScope(logsDir(), "logs", "diskMgr.logs", void 0, budget));
  scopes.push(
    await dirScope(resolveWorkspaceDir(), "workspace", "diskMgr.workspace", void 0, budget)
  );
  scopes.push(
    await dirScope(resolveDownloadDir(), "downloads", "diskMgr.downloads", void 0, budget)
  );
  const usedBytes = scopes.reduce((a, s) => a + s.bytes, 0);
  const { free, total } = await volumeBytes(userData);
  const report = {
    usedBytes,
    freeBytes: free,
    totalBytes: total,
    scopes,
    generatedAt: Date.now()
  };
  if (budget.truncated) {
    report.scopes.push({
      id: "__truncated__",
      labelKey: "diskMgr.truncated",
      bytes: 0
    });
  }
  return report;
}
async function clearLogs() {
  const root2 = logsDir();
  const pagesDir = join(root2, "pages");
  const wipe = async (dir) => {
    let entries2;
    try {
      entries2 = await promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries2) {
      if (!ent.isFile()) continue;
      const file = join(dir, ent.name);
      if (/\.(log|jsonl)\.\d+$/.test(ent.name)) {
        try {
          await promises.unlink(file);
        } catch {
        }
        continue;
      }
      if (/\.(log|jsonl)$/.test(ent.name)) {
        try {
          await promises.writeFile(file, "");
        } catch {
        }
      }
    }
  };
  await wipe(root2);
  await wipe(pagesDir);
}
async function clearDiskScope(id2) {
  if (id2 === "webcache") {
    await clearWebData({ scope: "cache" });
    await clearWebData({ scope: "storage" });
    return;
  }
  if (id2 === "logs") {
    await clearLogs();
    return;
  }
  throw new Error(`scope not clearable: ${id2}`);
}
let tray = null;
let trayImage = null;
let updatePending = false;
let resourceWarn = false;
const BADGE_COLORS = {
  1: [245, 158, 11],
  2: [245, 192, 0],
  3: [239, 68, 68]
};
function composeImage(level) {
  if (!trayImage || level === 0) return trayImage;
  try {
    const { width, height } = trayImage.getSize();
    if (!width || !height) return trayImage;
    const bmp = trayImage.toBitmap();
    const [r, g, b] = BADGE_COLORS[level];
    const rad = Math.max(3, Math.round(width * 0.28));
    const cx = width - rad - 1;
    const cy = height - rad - 1;
    for (let y = Math.max(0, cy - rad); y < Math.min(height, cy + rad + 1); y++) {
      for (let x = Math.max(0, cx - rad); x < Math.min(width, cx + rad + 1); x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) continue;
        const i = (y * width + x) * 4;
        const edge = d2 > (rad - 1) * (rad - 1);
        bmp[i] = edge ? 255 : b;
        bmp[i + 1] = edge ? 255 : g;
        bmp[i + 2] = edge ? 255 : r;
        bmp[i + 3] = 255;
      }
    }
    return nativeImage.createFromBitmap(bmp, { width, height });
  } catch (err) {
    console.warn("[tray] badge compose failed, using bare icon:", err.message);
    return trayImage;
  }
}
let hooks = {
  getRegistry: () => null,
  onShowWindow: () => void 0,
  onQuitRequest: () => void 0
};
const TRAY_STOPPED_LIMIT = 8;
function pageEntryMode() {
  return getSettings().trayPageEntries ?? "all";
}
function badgeLevel(alert) {
  const mode = getSettings().trayBadge ?? "all";
  if (mode === "off") return 0;
  if (alert) return 3;
  if (mode === "alert") return 0;
  return resourceWarn ? 2 : updatePending ? 1 : 0;
}
function rebuildTrayMenu() {
  const registry2 = hooks.getRegistry();
  if (!tray || !registry2) return;
  const mode = pageEntryMode();
  const running = registry2.running();
  const stopped = registry2.list().filter((p) => p.status !== "running" && !p.external);
  const runningRows = mode === "off" ? [] : running.map((p) => ({
    label: m("tray.stop", { name: p.name }),
    click: () => registry2.stop(p.id)
  }));
  const stoppedRows = mode !== "all" ? [] : stopped.slice(0, TRAY_STOPPED_LIMIT).map((p) => ({
    label: m("tray.start", { name: p.name }),
    click: () => {
      registry2.start(p.id).catch((err) => console.warn("[tray] start failed:", err.message));
    }
  }));
  const pageRows = [...runningRows, ...stoppedRows];
  const template = [
    { label: m("tray.show"), click: () => hooks.onShowWindow() }
  ];
  if (pageRows.length) template.push({ type: "separator" }, ...pageRows);
  template.push({ type: "separator" }, { label: m("tray.quit"), click: () => hooks.onQuitRequest() });
  const alert = stopped.some((p) => p.status === "error");
  const level = badgeLevel(alert);
  tray.setToolTip(
    level === 3 ? m("tray.tooltipAlert") : level === 2 ? m("tray.tooltipResource") : m("tray.tooltip", { n: running.length })
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
  const img = composeImage(level);
  if (img) tray.setImage(img);
}
function setTrayUpdatePending(v) {
  if (updatePending === v) return;
  updatePending = v;
  refreshBadge();
}
function setTrayResourceWarn(v) {
  if (resourceWarn === v) return;
  resourceWarn = v;
  refreshBadge();
}
function refreshBadge() {
  if (!tray) return;
  const registry2 = hooks.getRegistry();
  const alert = registry2 ? registry2.list().some((p) => p.status === "error" && !p.external) : false;
  const img = composeImage(badgeLevel(alert));
  if (img) tray.setImage(img);
}
function createTray(injected) {
  if (tray) return;
  hooks = injected;
  const path2 = appIconPath();
  const image = existsSync(path2) ? nativeImage.createFromPath(path2) : nativeImage.createEmpty();
  trayImage = image.isEmpty() ? image : image.resize({ width: 16, height: 16 });
  tray = new Tray(trayImage);
  tray.on("click", () => hooks.onShowWindow());
  rebuildTrayMenu();
}
let surveyTimer = null;
const UPDATE_SURVEY_MS = 30 * 6e4;
let runSurveyFn = null;
function runSurvey() {
  runSurveyFn?.();
}
function registerUpdatesIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  ipcMain$1.handle(IPC.RollbackAsar, () => {
    try {
      if (!canRollbackAsar().available) return fail2(new Error(m("update.noRollback")));
      if (!rollbackToPreviousAsar()) return fail2(new Error(m("update.rollbackFailed")));
      setTimeout(() => app$1.exit(0), 700);
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetUpdateHistory, () => {
    try {
      return ok2(getUpdateHistory());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.CheckUpdates, async (_e, force) => {
    try {
      const results = await checkUpdates(registry2.list(), Boolean(force));
      setTrayUpdatePending(results.some((r) => r.ok && (r.hasUpdate || r.pendingRestart)));
      return ok2(results);
    } catch (err) {
      return fail2(err);
    }
  });
  if (surveyTimer) clearInterval(surveyTimer);
  runSurveyFn = () => {
    checkUpdates(registry2.list(), true).then((results) => {
      setTrayUpdatePending(results.some((r) => r.ok && (r.hasUpdate || r.pendingRestart)));
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.OnUpdateResults, results);
      }
    }).catch(() => void 0);
  };
  setTimeout(() => runSurvey(), 45e3).unref?.();
  surveyTimer = setInterval(() => runSurvey(), UPDATE_SURVEY_MS);
  surveyTimer.unref?.();
  ipcMain$1.handle(IPC.PerformUpdate, async (_e, target) => {
    const sender = _e.sender;
    const onProgress = (p) => {
      if (!sender.isDestroyed()) sender.send(IPC.OnUpdateProgress, p);
    };
    try {
      const res = await performUpdate(target, onProgress);
      clearUpdateCache();
      return ok2(res);
    } catch (err) {
      return fail2(err);
    } finally {
      onProgress({ name: target.name, phase: "done", percent: 100 });
    }
  });
}
function readTailText(file, cap) {
  try {
    const total = statSync(file).size;
    const len = Math.min(total, cap);
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(file, "r");
    try {
      readSync(fd, buf, 0, len, total - len);
    } finally {
      closeSync(fd);
    }
    return buf.toString("utf8");
  } catch {
    return `(unavailable: ${file})
`;
  }
}
function capture(cmd, args, cwd, timeoutMs = 8e3) {
  return new Promise((resolve2) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, timeout: timeoutMs });
    let out = "";
    child.stdout?.on("data", (d) => out += String(d));
    child.on("error", () => resolve2(""));
    child.on("close", () => resolve2(out.trim()));
  });
}
const SECRET_KEY_RE = /token|key|secret|password|pwd|auth|cookie/i;
const ENV_MAP_KEYS = ["pageEnvs", "pageCustomEnvs"];
function maskSettings() {
  const s = getSettings();
  const out = { ...s };
  for (const mapKey of ENV_MAP_KEYS) {
    const envs = s[mapKey];
    if (!envs) continue;
    out[mapKey] = Object.fromEntries(
      Object.entries(envs).map(([page, vars]) => [
        page,
        Object.fromEntries(
          Object.entries(vars ?? {}).map(([k, v]) => [k, SECRET_KEY_RE.test(k) && v ? "***" : v])
        )
      ])
    );
  }
  return out;
}
async function exportDiagnostics(registry2) {
  const ts = isoShanghai().replace(/[:.]/g, "-").slice(0, 19);
  const stage = join(app$1.getPath("temp"), `dsh-diag-${ts}`);
  mkdirSync(stage, { recursive: true });
  try {
    let nodeRuntime$1 = null;
    try {
      nodeRuntime$1 = await Promise.resolve().then(() => nodeRuntime).then((r) => r.getNodeRuntimeInfo());
    } catch {
    }
    let runtimes = {};
    try {
      const [{ isDshInstalled: isDshInstalled2 }, { isOpenclawInstalled: isOpenclawInstalled2 }] = await Promise.all([
        Promise.resolve().then(() => dsh),
        Promise.resolve().then(() => openclaw)
      ]);
      runtimes = { dshInstalled: isDshInstalled2(), openclawInstalled: isOpenclawInstalled2() };
    } catch {
    }
    writeFileSync$1(
      join(stage, "versions.json"),
      JSON.stringify(
        {
          generatedAt: isoShanghai(),
          appVersion: app$1.getVersion(),
          packaged: app$1.isPackaged,
          exePath: app$1.getPath("exe"),
          userData: app$1.getPath("userData"),
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          bundledNode: nodeRuntime$1,
          onDemandRuntimes: runtimes
        },
        null,
        2
      ),
      "utf8"
    );
    writeFileSync$1(join(stage, "settings.json"), JSON.stringify(maskSettings(), null, 2), "utf8");
    const pages = registry2.list().map((p) => {
      let manifest = null;
      try {
        const f = join(p.dir, "container.json");
        manifest = existsSync(f) ? JSON.parse(readFileSyncSafe(f)) : null;
      } catch {
        manifest = "(unreadable)";
      }
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        status: p.status,
        pid: p.pid,
        port: p.containerPort ?? p.port,
        external: p.external,
        lastError: p.lastError,
        crashes: p.crashes,
        dependsOn: p.dependsOn,
        healthUrl: p.healthUrl,
        containerJson: manifest
      };
    });
    writeFileSync$1(join(stage, "pages.json"), JSON.stringify(pages, null, 2), "utf8");
    try {
      const { probePortBind: probePortBind2, findPortHolder: findPortHolder2 } = await Promise.resolve().then(() => portHolder);
      const portRows = await Promise.allSettled(
        pages.filter((p) => !p.external && typeof p.port === "number" && p.port > 0).map(async (p) => ({
          pageId: p.id,
          port: p.port,
          bind: await probePortBind2(p.port),
          holder: await findPortHolder2(p.port)
        }))
      );
      writeFileSync$1(
        join(stage, "ports.json"),
        JSON.stringify(
          portRows.map((r) => r.status === "fulfilled" ? r.value : { error: String(r.reason) }),
          null,
          2
        ),
        "utf8"
      );
    } catch {
    }
    try {
      const { listServers: listServers2 } = await Promise.resolve().then(() => mcpHub);
      const summary = listServers2().map((s) => ({
        id: s.spec.id,
        name: s.spec.name,
        command: s.spec.command,
        args: s.spec.args ?? [],
        enabled: s.spec.enabled !== false,
        status: s.status,
        serverInfo: s.serverInfo,
        toolCount: s.toolCount,
        lastError: s.lastError
      }));
      writeFileSync$1(join(stage, "mcp.json"), JSON.stringify(summary, null, 2), "utf8");
    } catch {
    }
    try {
      const { getMetricsHistory: getMetricsHistory2 } = await Promise.resolve().then(() => metrics);
      const history2 = getMetricsHistory2();
      writeFileSync$1(
        join(stage, "metrics.json"),
        JSON.stringify(
          Object.fromEntries(Object.entries(history2).map(([id2, samples]) => [id2, samples.slice(-12)])),
          null,
          2
        ),
        "utf8"
      );
    } catch {
    }
    writeFileSync$1(
      join(stage, "system.txt"),
      [
        `os: ${os.type()} ${os.release()} (${os.arch()})`,
        `hostname: ${os.hostname()}`,
        `cpus: ${os.cpus().length} x ${os.cpus()[0]?.model ?? "?"}`,
        `totalMemory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
        `freeMemory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
        `home: ${os.homedir()}`,
        `locale: ${Intl.DateTimeFormat().resolvedOptions().locale} / TZ ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        `env.proxy: ${process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? "(none)"}`
      ].join("\n"),
      "utf8"
    );
    mkdirSync(join(stage, "logs"), { recursive: true });
    writeFileSync$1(join(stage, "logs", "main.log"), readTailText(join(logsDir(), "main.log"), 1024 * 1024), "utf8");
    writeFileSync$1(
      join(stage, "logs", "events.jsonl"),
      readTailText(join(logsDir(), "events.jsonl"), 512 * 1024),
      "utf8"
    );
    for (const f of safePageLogFiles()) {
      writeFileSync$1(
        join(stage, "logs", f.name),
        readTailText(join(logsDir(), "pages", f.name), 256 * 1024),
        "utf8"
      );
    }
    const gitLines = [];
    for (const p of [{ id: "__container__", dir: registry2.containerEntry().dir }, ...pages.map((p2) => ({ id: p2.id, dir: registry2.get(p2.id)?.dir ?? "" }))]) {
      if (!p.dir || !existsSync(join(p.dir, ".git"))) {
        gitLines.push(`${p.id}: (no .git)`);
        continue;
      }
      const head = await capture("git", ["rev-parse", "--short", "HEAD"], p.dir);
      const branch = await capture("git", ["branch", "--show-current"], p.dir);
      gitLines.push(`${p.id}: ${branch || "?"} @ ${head || "?"}`);
    }
    writeFileSync$1(join(stage, "git.txt"), gitLines.join("\n"), "utf8");
    const zipPath = join(app$1.getPath("temp"), `dsh-diag-${ts}.zip`);
    await zipFolder$1(stage, zipPath);
    const dest = resolveExportPath(`dsh-diag-${ts}.zip`);
    await promises.copyFile(zipPath, dest);
    logEvent({ level: "info", kind: "diagnostics.export", detail: dest });
    return dest;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
function readFileSyncSafe(file) {
  return JSON.stringify(JSON.parse(readFileSync(file, "utf-8")));
}
function safePageLogFiles() {
  try {
    const dir = join(logsDir(), "pages");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith(".log")).map((name) => ({ name }));
  } catch {
    return [];
  }
}
function zipFolder$1(src, dest) {
  const srcLit = src.replace(/'/g, "''");
  const destLit = dest.replace(/'/g, "''");
  const ps = `$items = Get-ChildItem -LiteralPath '${srcLit}' | ForEach-Object { $_.FullName }; Compress-Archive -LiteralPath $items -DestinationPath '${destLit}' -Force -ErrorAction Stop`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  return new Promise((resolve2, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-EncodedCommand", encoded], {
      windowsHide: true,
      timeout: 6e4
    });
    let err = "";
    child.stderr?.on("data", (d) => err += String(d));
    child.on("error", reject);
    child.on("close", (code2) => {
      if (code2 !== 0) return reject(new Error(`Compress-Archive failed (${code2}): ${err.trim()}`));
      if (!existsSync(dest)) return reject(new Error("Compress-Archive produced no archive"));
      resolve2();
    });
  });
}
function captureSettings() {
  const s = getSettings();
  return {
    defaultView: s.defaultView,
    openExternalIn: s.openExternalIn,
    minimizeToTray: s.minimizeToTray,
    autoStartPages: s.autoStartPages,
    autoStartManual: s.autoStartManual,
    externalSites: s.externalSites,
    theme: s.theme,
    locale: s.locale,
    envRoot: s.envRoot,
    dshHome: s.dshHome,
    openclawHome: s.openclawHome,
    downloadDir: s.downloadDir,
    pageEnvs: s.pageEnvs,
    pageCustomEnvs: s.pageCustomEnvs,
    pagePorts: s.pagePorts,
    pageDeps: s.pageDeps,
    crashAutoRestart: s.crashAutoRestart,
    systemNotifications: s.systemNotifications,
    accentColor: s.accentColor,
    glassBlur: s.glassBlur,
    glassAlpha: s.glassAlpha,
    memWarnMb: s.memWarnMb,
    memLimitAction: s.memLimitAction,
    terminalHeight: s.terminalHeight,
    // #26: preferences (the remembered `windowBounds` stays out on purpose — it is machine-local).
    rememberWindowBounds: s.rememberWindowBounds,
    reduceMotion: s.reduceMotion,
    npmRegistry: s.npmRegistry,
    trayPageEntries: s.trayPageEntries,
    trayBadge: s.trayBadge,
    // Update channels and rebound shortcuts are intent, not machine state, so they migrate too.
    dshChannel: s.dshChannel,
    containerChannel: s.containerChannel,
    keybindings: s.keybindings
  };
}
function zipFolder(src, dest) {
  const srcLit = src.replace(/'/g, "''");
  const destLit = dest.replace(/'/g, "''");
  const ps = `$items = Get-ChildItem -LiteralPath '${srcLit}' | ForEach-Object { $_.FullName }; Compress-Archive -LiteralPath $items -DestinationPath '${destLit}' -Force -ErrorAction Stop`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  return new Promise((resolve2, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      {
        windowsHide: true,
        timeout: 6e4
      }
    );
    let err = "";
    child.stderr?.on("data", (d) => err += String(d));
    child.on("error", reject);
    child.on("close", (code2) => {
      if (code2 !== 0) return reject(new Error(`Compress-Archive failed (${code2}): ${err.trim()}`));
      if (!existsSync(dest)) return reject(new Error("Compress-Archive produced no archive"));
      resolve2();
    });
  });
}
async function exportSnapshot(registry2) {
  const pages = registry2.list().filter((p) => !p.external).map((p) => {
    let containerJson = null;
    try {
      const f = join(p.dir, "container.json");
      if (existsSync(f)) containerJson = JSON.parse(readFileSync(f, "utf-8"));
    } catch {
      containerJson = null;
    }
    return { id: p.id, name: p.name, kind: p.kind, containerJson };
  }).filter((p) => p.containerJson !== null);
  if (pages.length === 0) throw new Error(m("snapshot.noPages"));
  const createdAt = Date.now();
  const ts = isoShanghai(new Date(createdAt)).replace(/[:.]/g, "-").slice(0, 19);
  const manifest = {
    appVersion: app$1.getVersion(),
    createdAt,
    settings: captureSettings(),
    pages
  };
  const stage = join(app$1.getPath("temp"), `dsh-snapshot-${ts}`);
  const containerDir = join(stage, "container");
  mkdirSync(containerDir, { recursive: true });
  try {
    writeFileSync$1(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    for (const p of pages) {
      writeFileSync$1(
        join(containerDir, `${p.id}.json`),
        JSON.stringify(p.containerJson, null, 2),
        "utf8"
      );
    }
    const zipPath = join(app$1.getPath("temp"), `dsh-snapshot-${ts}.zip`);
    await zipFolder(stage, zipPath);
    const filePath = resolveExportPath(`dsh-snapshot-${ts}.zip`);
    const { promises: fsp } = await import("node:fs");
    await fsp.copyFile(zipPath, filePath);
    return { path: filePath, pageIds: pages.map((p) => p.id), createdAt };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
async function importSnapshot(registry2) {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: m("snapshot.importTitle"),
    properties: ["openFile"],
    filters: [{ name: m("snapshot.zipFilter"), extensions: ["zip"] }]
  });
  if (canceled || !filePaths[0]) throw new Error(m("snapshot.badArchive"));
  const zip = filePaths[0];
  const ts = isoShanghai().replace(/[:.]/g, "-").slice(0, 19);
  const extractTo = join(app$1.getPath("temp"), `dsh-snapshot-in-${ts}`);
  mkdirSync(extractTo, { recursive: true });
  try {
    await extractZip(zip, extractTo);
    const manifestFile = join(extractTo, "manifest.json");
    if (!existsSync(manifestFile)) throw new Error(m("snapshot.badArchive"));
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestFile, "utf-8"));
    } catch {
      throw new Error(m("snapshot.badArchive"));
    }
    if (manifest.settings && typeof manifest.settings === "object") {
      updateSettings(manifest.settings, { syncAutoStartPin: false });
      applyNpmRegistryEnv();
      rebuildTrayMenu();
    }
    const pagesDir = resolvePagesDir();
    mkdirSync(pagesDir, { recursive: true });
    const restored = [];
    for (const p of manifest.pages ?? []) {
      if (!p?.id || p.containerJson == null) continue;
      const safeId = String(p.id).replace(/[^\w.-]/g, "");
      if (!safeId) continue;
      const dir = join(pagesDir, safeId);
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync$1(join(dir, "container.json"), JSON.stringify(p.containerJson, null, 2), "utf8");
        restored.push(safeId);
      } catch {
      }
    }
    registry2.reconcile();
    registry2.emitChanged();
    return {
      path: zip,
      pageIds: restored,
      createdAt: manifest.createdAt ?? Date.now(),
      restoredPages: restored,
      appliedSettings: !!manifest.settings
    };
  } finally {
    rmSync(extractTo, { recursive: true, force: true });
  }
}
function listInterfaces() {
  const out = [];
  let ifaces = {};
  try {
    ifaces = os.networkInterfaces();
  } catch {
    return out;
  }
  for (const [name, addrs] of Object.entries(ifaces)) {
    const list = addrs ?? [];
    const v4 = list.find((a) => String(a.family) === "IPv4" || String(a.family) === "4");
    const info = {
      name,
      family: v4 ? "IPv4" : String(list[0]?.family ?? "") || "",
      internal: Boolean(v4?.internal ?? list[0]?.internal),
      address: v4?.address ?? void 0,
      netmask: v4?.netmask ?? void 0,
      mac: v4?.mac ?? void 0,
      cidr: v4?.cidr ?? void 0
    };
    out.push(info);
  }
  return out;
}
function readCountersWindows() {
  return new Promise((resolve2) => {
    const script = "Get-NetAdapterStatistics | Where-Object { $_.Name -notmatch 'Loopback' } | Measure-Object -Property ReceivedBytes,SentBytes -Sum | ForEach-Object { $_.Property + '|' + $_.Sum }";
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { windowsHide: true, timeout: 8e3 }
    );
    let out = "";
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve2(v);
    };
    child.stdout?.on("data", (d) => out += String(d));
    child.on("error", () => finish(null));
    child.on("close", () => {
      let rx = 0;
      let tx = 0;
      for (const line of out.split(/\r?\n/)) {
        const [prop, sum] = line.trim().split("|");
        const n = Number(sum);
        if (!Number.isFinite(n)) continue;
        if (prop === "ReceivedBytes") rx += n;
        else if (prop === "SentBytes") tx += n;
      }
      finish(rx || tx ? { rxBytes: rx, txBytes: tx } : null);
    });
  });
}
function readCountersPosix() {
  try {
    const text = readFileSync("/proc/net/dev", "utf-8");
    let rx = 0;
    let tx = 0;
    for (const line of text.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const name = line.slice(0, idx).trim();
      if (name === "lo") continue;
      const cols = line.slice(idx + 1).trim().split(/\s+/).map(Number);
      if (Number.isFinite(cols[0])) rx += cols[0];
      if (Number.isFinite(cols[8])) tx += cols[8];
    }
    return rx || tx ? { rxBytes: rx, txBytes: tx } : null;
  } catch {
    return null;
  }
}
async function getNetworkStats() {
  const interfaces = listInterfaces();
  const counters = process.platform === "win32" ? await readCountersWindows() : readCountersPosix();
  return { interfaces, counters, sampleAt: Date.now() };
}
function getSystemInfo() {
  const cpus = os.cpus();
  let locale = "";
  let timezone = "";
  try {
    const dtf = Intl.DateTimeFormat().resolvedOptions();
    locale = dtf.locale || "";
    timezone = dtf.timeZone || "";
  } catch {
  }
  const interfaces = listInterfaces();
  return {
    osType: os.type(),
    osRelease: os.release(),
    platform: process.platform,
    arch: os.arch(),
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model?.trim(),
    cpuCores: cpus.length,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    osUptimeSec: os.uptime(),
    appUptimeSec: process.uptime(),
    locale,
    timezone,
    home: os.homedir(),
    appVersion: app$1.getVersion(),
    packaged: app$1.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    userData: app$1.getPath("userData"),
    interfaceCount: interfaces.filter((i) => !i.internal).length,
    installDir: resolveInstallDir()
  };
}
const NET_BAR_POLL_MS = 2e3;
const LATENCY_EVERY_TICKS = 40;
const LATENCY_PROBE_TIMEOUT_MS = 5e3;
const LATENCY_PROBE_URL = "https://registry.npmmirror.com/-/ping";
const EGRESS_PROBE_HOST = "223.5.5.5";
const EGRESS_PROBE_PORT = 53;
const EGRESS_EVERY_TICKS = 5;
let netBarTimer = null;
let lastCounters = null;
let lastRates = { rx: 0, tx: 0 };
let lastLatencyMs = null;
let latencyInFlight = false;
let tick = 0;
let activeEgressIp = null;
function startNetBarLoop(registry2) {
  if (netBarTimer) clearInterval(netBarTimer);
  tick = 0;
  activeEgressIp = null;
  netBarTimer = setInterval(() => void sampleNetBar(registry2), NET_BAR_POLL_MS);
  netBarTimer.unref?.();
  void sampleNetBar(registry2);
}
function collectOnlinePorts(registry2) {
  return registry2.running().map((p) => ({ id: p.id, name: p.name, port: Number(p.containerPort || p.port) || 0 })).filter((p) => p.port > 0).sort((a, b) => a.port - b.port);
}
function classifyInterface(name) {
  const n = name.toLowerCase();
  if (/wi-?fi|wlan|wireless|无线/.test(n)) return "wifi";
  if (/ethernet|以太网|\beth\b|gigabit|gbe/.test(n)) return "ethernet";
  return "other";
}
function detectEgressIPv4() {
  try {
    const socket = createSocket("udp4");
    socket.connect(EGRESS_PROBE_PORT, EGRESS_PROBE_HOST);
    const local = socket.address().address;
    socket.close();
    return local || null;
  } catch {
    return null;
  }
}
function pickLocalInterface(interfaces, egressIp) {
  const usable = interfaces.filter((i) => !i.internal && i.address);
  if (!usable.length) return null;
  const rank = (i) => classifyInterface(i.name) === "wifi" ? 0 : classifyInterface(i.name) === "ethernet" ? 1 : 2;
  const match = egressIp ? usable.find((i) => i.address === egressIp) : void 0;
  const chosen = match ?? [...usable].sort((a, b) => rank(a) - rank(b))[0];
  return {
    name: chosen.name,
    address: chosen.address,
    kind: classifyInterface(chosen.name)
  };
}
async function sampleNetBar(registry2) {
  try {
    tick++;
    if (tick % LATENCY_EVERY_TICKS === 1 && !latencyInFlight) {
      latencyInFlight = true;
      probeUrl(LATENCY_PROBE_URL, LATENCY_PROBE_TIMEOUT_MS).then((p) => {
        if (p.ok && p.ms != null) lastLatencyMs = p.ms;
      }).catch(() => void 0).finally(() => {
        latencyInFlight = false;
      });
    }
    const stats = await getNetworkStats();
    let rxRate = 0;
    let txRate = 0;
    if (stats.counters) {
      const prev = lastCounters;
      const dt = prev ? (stats.sampleAt - prev.at) / 1e3 : 0;
      if (prev && dt > 0) {
        rxRate = Math.max(0, (stats.counters.rxBytes - prev.rxBytes) / dt);
        txRate = Math.max(0, (stats.counters.txBytes - prev.txBytes) / dt);
      }
      lastCounters = { ...stats.counters, at: stats.sampleAt };
      lastRates = { rx: rxRate, tx: txRate };
    } else {
      rxRate = lastRates.rx;
      txRate = lastRates.tx;
    }
    if (tick % EGRESS_EVERY_TICKS === 1) activeEgressIp = detectEgressIPv4();
    const local = pickLocalInterface(stats.interfaces, activeEgressIp);
    const sample = {
      rxRateBps: rxRate,
      txRateBps: txRate,
      counters: stats.counters,
      localInterface: local,
      latencyMs: lastLatencyMs,
      onlinePorts: collectOnlinePorts(registry2),
      sampleAt: stats.sampleAt
    };
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnNetSample, sample);
    }
  } catch {
  }
}
const lastCpu = /* @__PURE__ */ new Map();
const HISTORY_CAP = 120;
const history = /* @__PURE__ */ new Map();
function sampleWindows(roots) {
  return new Promise((resolve2, reject) => {
    const list = roots.join(",");
    const script = [
      `$roots = @(${list})`,
      "$procs = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId",
      "function Get-Tree($root){",
      "  $acc = New-Object System.Collections.Generic.List[int]",
      "  $stack = New-Object System.Collections.Generic.Stack[int]",
      "  $stack.Push($root)",
      "  while($stack.Count -gt 0){",
      "    $cur = $stack.Pop(); $acc.Add($cur)",
      "    foreach($p in $procs){ if($p.ParentProcessId -eq $cur){ $stack.Push($p.ProcessId) } }",
      "  }",
      "  return $acc",
      "}",
      "foreach($root in $roots){",
      "  $ws = 0; $cpu = 0",
      "  foreach($id in (Get-Tree $root)){",
      "    $gp = Get-Process -Id $id -ErrorAction SilentlyContinue",
      "    if($gp){ $ws += $gp.WorkingSet64; try { $cpu += [double]$gp.CPU } catch {} }",
      "  }",
      '  Write-Output "$root|$ws|$cpu"',
      "}"
    ].join("\n");
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      windowsHide: true,
      timeout: 15e3
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => out += String(d));
    child.stderr?.on("data", (d) => err += String(d));
    child.on("error", reject);
    child.on("close", (code2) => {
      if (code2 !== 0) {
        reject(new Error(`powershell sample failed (${code2}): ${err.trim() || m("dsh.exitCode", { code: String(code2) })}`));
        return;
      }
      const map = /* @__PURE__ */ new Map();
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split("|");
        if (parts.length !== 3) continue;
        const root2 = Number(parts[0]);
        if (!Number.isFinite(root2)) continue;
        map.set(root2, { ws: Number(parts[1]) || 0, cpu: Number(parts[2]) || 0 });
      }
      resolve2(map);
    });
  });
}
function samplePosix(roots) {
  const map = /* @__PURE__ */ new Map();
  const procs = [];
  let entries2 = [];
  try {
    entries2 = readdirSync("/proc");
  } catch {
    return map;
  }
  for (const entry of entries2) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const stat2 = readFileSync(`/proc/${pid}/stat`, "utf-8");
      const rparen = stat2.lastIndexOf(")");
      const fields = stat2.slice(rparen + 2).trim().split(/\s+/);
      const ppid = Number(fields[1]);
      const utime = Number(fields[11]);
      const stime = Number(fields[12]);
      let rssKb = 0;
      try {
        const status = readFileSync(`/proc/${pid}/status`, "utf-8");
        const mm = status.match(/VmRSS:\s+(\d+)\s+kB/);
        if (mm) rssKb = Number(mm[1]);
      } catch {
      }
      procs.push({ pid, ppid, rssKb, cpuTicks: utime + stime });
    } catch {
    }
  }
  for (const root2 of roots) {
    let ws = 0;
    let cpuTicks = 0;
    for (const p of descendantsOf(procs, root2)) {
      ws += p.rssKb * 1024;
      cpuTicks += p.cpuTicks;
    }
    map.set(root2, { ws, cpu: cpuTicks / 100 });
  }
  return map;
}
function descendantsOf(procs, root2) {
  const out = [];
  const stack = [root2];
  const seen = /* @__PURE__ */ new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of procs) if (p.ppid === cur) {
      stack.push(p.pid);
      out.push(p);
    }
  }
  return out;
}
async function collectPageMetrics(registry2, memWarnMb) {
  const running = registry2.running().filter((p) => p.pid);
  if (running.length === 0) {
    history.clear();
    return [];
  }
  const byPid = /* @__PURE__ */ new Map();
  for (const p of running) byPid.set(p.pid, p.id);
  const roots = [...byPid.keys()];
  const now = Date.now();
  let samples;
  try {
    samples = process.platform === "win32" ? await sampleWindows(roots) : samplePosix(roots);
  } catch {
    return [];
  }
  const out = [];
  for (const [root2, s] of samples) {
    const pageId = byPid.get(root2);
    if (!pageId) continue;
    const prev = lastCpu.get(root2);
    let cpu = 0;
    if (prev) {
      const wallSec = (now - prev.at) / 1e3;
      const cpuSec = s.cpu - prev.cpu;
      if (wallSec > 0 && cpuSec >= 0) cpu = Math.round(cpuSec / wallSec * 1e3) / 10;
    }
    lastCpu.set(root2, { cpu: s.cpu, at: now });
    const memMb = Math.round(s.ws / 1024 / 1024);
    out.push({
      pageId,
      pid: root2,
      cpu,
      memMb,
      ts: now,
      overLimit: memWarnMb > 0 && memMb > memWarnMb
    });
  }
  recordHistory(out);
  return out;
}
function recordHistory(out) {
  const live = /* @__PURE__ */ new Set();
  for (const m2 of out) {
    live.add(m2.pageId);
    const arr = history.get(m2.pageId) ?? [];
    arr.push(m2);
    if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP);
    history.set(m2.pageId, arr);
  }
  for (const id2 of [...history.keys()]) if (!live.has(id2)) history.delete(id2);
}
function getMetricsHistory() {
  return Object.fromEntries([...history.entries()].map(([id2, rows]) => [id2, rows.slice()]));
}
function pruneMetricsBaseline(livePids) {
  const keep = new Set(livePids);
  for (const pid of [...lastCpu.keys()]) if (!keep.has(pid)) lastCpu.delete(pid);
}
function resetMetricsHistory() {
  history.clear();
  lastCpu.clear();
}
const metrics = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  collectPageMetrics,
  getMetricsHistory,
  pruneMetricsBaseline,
  resetMetricsHistory
}, Symbol.toStringTag, { value: "Module" }));
let metricsTimer = null;
const METRICS_POLL_MS = 5e3;
const memRestarted = /* @__PURE__ */ new Set();
const MEM_RESTART_MIN_UPTIME_MS = 10 * 6e4;
function resetMemGuard() {
  memRestarted.clear();
}
function registerLogsIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  ipcMain$1.handle(IPC.ListEvents, (_e, args) => {
    try {
      return ok2(listEvents(args || {}));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetMetricsHistory, () => {
    try {
      return ok2(getMetricsHistory());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.OpenLogsDir, async () => {
    try {
      const err = await shell$1.openPath(logsDir());
      return err ? fail2(new Error(err)) : ok2(logsDir());
    } catch (e) {
      return fail2(e);
    }
  });
  ipcMain$1.handle(IPC.ListLogFiles, () => {
    try {
      return ok2(listLogFiles());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ReadLogs, (_e, args) => {
    try {
      return ok2(readLogTail(args?.key ?? "", args?.tail, args?.filter));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ExportDiagnostics, async () => {
    try {
      return ok2(await exportDiagnostics(registry2));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ExportSnapshot, async () => {
    try {
      return ok2(await exportSnapshot(registry2));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ImportSnapshot, async () => {
    try {
      return ok2(await importSnapshot(registry2));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.RunNetworkProbe, async () => {
    try {
      return ok2(await runNetworkProbe());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetPageMetrics, async () => {
    try {
      return ok2(await collectPageMetrics(registry2, getSettings().memWarnMb ?? 0));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetSystemInfo, () => {
    try {
      return ok2(getSystemInfo());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetNetworkStats, async () => {
    try {
      return ok2(await getNetworkStats());
    } catch (err) {
      return fail2(err);
    }
  });
  startLogStream((ev) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnLogLine, ev);
    }
  });
  if (metricsTimer) clearInterval(metricsTimer);
  metricsTimer = setInterval(async () => {
    try {
      const settings = getSettings();
      const metrics2 = await collectPageMetrics(registry2, settings.memWarnMb ?? 0);
      pruneMetricsBaseline(
        registry2.running().map((p) => p.pid).filter(Boolean)
      );
      setTrayResourceWarn(metrics2.some((mm) => mm.overLimit));
      if (settings.memLimitAction === "restart") {
        for (const mm of metrics2) {
          if (!mm.overLimit || memRestarted.has(mm.pageId)) continue;
          const st = registry2.get(mm.pageId);
          if (!st?.startedAt || Date.now() - st.startedAt < MEM_RESTART_MIN_UPTIME_MS) continue;
          memRestarted.add(mm.pageId);
          logEvent({
            level: "warn",
            kind: "mem.restart",
            pageId: mm.pageId,
            meta: { memMb: mm.memMb, limitMb: settings.memWarnMb ?? 0 }
          });
          registry2.restart(mm.pageId).catch(
            (err) => console.warn("[metrics] memory restart failed:", err.message)
          );
        }
      }
      for (const id2 of [...memRestarted]) {
        if (!registry2.running().some((p) => p.id === id2)) memRestarted.delete(id2);
      }
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.OnPageMetrics, metrics2);
      }
    } catch {
    }
  }, METRICS_POLL_MS);
  metricsTimer.unref?.();
  startNetBarLoop(registry2);
}
function registerSettingsIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  ipcMain$1.handle(IPC.GetSettings, () => ok2(getSettings()));
  ipcMain$1.handle(
    IPC.ShowSystemToast,
    (_e, payload) => notifyToast(payload?.level, payload?.text || "")
  );
  ipcMain$1.handle(IPC.ProbeRegistries, async () => {
    try {
      return ok2(await probeRegistries());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetWebData, async () => {
    try {
      return ok2(await getWebDataReport());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ClearWebData, async (_e, args) => {
    try {
      return ok2(await clearWebData(args));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetDiskReport, async () => {
    try {
      return ok2(await getDiskReport());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.ClearDiskScope, async (_e, scope2) => {
    try {
      await clearDiskScope(scope2);
      return ok2(await getDiskReport());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(
    IPC.UpdateSettings,
    async (_e, partial) => {
      try {
        if (partial.defaultView) {
          const prevDv = getSettings().defaultView;
          const prevId = prevDv.kind === "page" ? prevDv.pageId : null;
          let nextId2 = partial.defaultView.kind === "page" ? partial.defaultView.pageId : null;
          if (nextId2 && registry2.get(nextId2)?.external) nextId2 = null;
          syncAutoStartForDefaultView(prevId, nextId2);
          setDefaultView(partial.defaultView);
        }
        const rest = { ...partial };
        delete rest.defaultView;
        if (Object.keys(rest).length) updateSettings(rest);
        if (typeof partial.launchAtStartup === "boolean") {
          applyLaunchAtStartup(partial.launchAtStartup);
        }
        if ("npmRegistry" in partial) applyNpmRegistryEnv();
        if ("containerChannel" in partial || "dshChannel" in partial) {
          resetBranchProbe();
          clearUpdateCache();
          void runSurvey();
        }
        if ("memLimitAction" in partial) resetMemGuard();
        if (typeof partial.containerMcpServer === "boolean") {
          try {
            if (partial.containerMcpServer) await startContainerMcpServer(() => registry2);
            else await stopContainerMcpServer();
          } catch (err) {
            updateSettings({ containerMcpServer: false });
            throw err;
          }
        }
        if ("autopilotEnabled" in partial || "autopilotExecutorPage" in partial || "autopilotConcurrency" in partial) {
          kickAutopilot();
        }
        if (partial.rememberWindowBounds === false) forgetWindowBounds();
        if (partial.trayPageEntries || partial.trayBadge) rebuildTrayMenu();
        if (partial.locale) {
          invalidateLocaleCache();
          registry2.reconcile();
          notifyLocaleChanged();
          registry2.emitChanged();
          runSurvey();
        }
        return ok2(getSettings());
      } catch (err) {
        return fail2(err);
      }
    }
  );
}
function registerTerminalIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  const ptyManager = new PtyManager();
  const cliPtyByPage = /* @__PURE__ */ new Map();
  const intentionalKills = /* @__PURE__ */ new Set();
  registry2.onKillTerminal = (id2) => {
    const sid = cliPtyByPage.get(id2);
    if (!sid || !ptyManager.get(sid)) {
      registry2.reportTerminal(id2, "exit", 0);
      return;
    }
    intentionalKills.add(sid);
    ptyManager.kill(sid);
  };
  ipcMain$1.handle(IPC.PageRunSpec, (_e, id2) => {
    try {
      const meta = registry2.get(id2);
      if (!meta || meta.external) return ok2(null);
      if (meta.kind === "dsh" || meta.kind === "openclaw") return ok2(null);
      const port = meta.containerPort || meta.port;
      return ok2({
        command: expandStartCommand(meta.startCommand),
        env: { ...port ? { PORT: String(port) } : {}, ...buildPageEnv(meta) }
      });
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.OpenTerminalPage, (_e, id2) => {
    try {
      const meta = registry2.get(id2);
      if (!meta || meta.kind !== "terminal") throw new Error(m("ipc.notTerminal", { id: id2 }));
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.OpenTerminalPage, id2);
      }
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  const terminalDirFor = (target) => {
    if (target === "container") return resolveProjectDir();
    if (target === "openclaw") return resolveOpenclawHome();
    if (target === "dsh-root") return resolveDshHome();
    if (target.startsWith("dsh:")) return resolveDshProfileDir(target.slice(4));
    const page = registry2.get(target);
    if (!page) throw new Error(m("ipc.unknownTarget", { target }));
    return page.dir;
  };
  const ptyTextForLog2 = (chunk) => chunk.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b[@-Z\\-_]/g, "").replace(/\r\n?/g, "\n");
  ipcMain$1.handle(
    IPC.PtyStart,
    async (e, target, opts) => {
      try {
        const cwd = terminalDirFor(target);
        const title2 = target === "container" ? m("ipc.containerRoot") : target;
        const info = await ptyManager.start(cwd, title2, {
          run: opts?.command ? { command: opts.command, env: opts.env } : void 0,
          shell: opts?.shell
        });
        const session2 = ptyManager.get(info.id);
        if (session2) {
          const sender = e.sender;
          const boundPage = opts?.command ? registry2.get(target) : void 0;
          const cliId = boundPage?.kind === "terminal" ? boundPage.id : null;
          if (cliId) {
            cliPtyByPage.set(cliId, info.id);
            registry2.reportTerminal(cliId, "running");
          }
          let buf = "";
          let timer = null;
          const FLUSH_MS = 16;
          const FLUSH_MAX = 64 * 1024;
          const flush = () => {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            if (!buf) return;
            const data = buf;
            buf = "";
            if (!sender.isDestroyed()) sender.send(IPC.OnPtyData, { id: info.id, data });
          };
          session2.on("data", (chunk) => {
            const text = String(chunk);
            if (cliId) logPageLine(cliId, ptyTextForLog2(text));
            buf += text;
            if (buf.length >= FLUSH_MAX) flush();
            else if (!timer) timer = setTimeout(flush, FLUSH_MS);
          });
          session2.on("exit", (code2) => {
            flush();
            const intentional = intentionalKills.delete(info.id);
            if (cliId) {
              if (cliPtyByPage.get(cliId) === info.id) cliPtyByPage.delete(cliId);
              registry2.reportTerminal(cliId, "exit", intentional ? 0 : Number(code2));
            }
            if (!sender.isDestroyed())
              sender.send(IPC.OnPtyExit, { id: info.id, code: Number(code2) });
          });
        }
        return ok2(info);
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(IPC.PtyShells, () => {
    try {
      return ok2(listShells());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.PtyWrite, (_e, id2, data) => {
    try {
      ptyManager.write(id2, data);
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.PtyResize, (_e, id2, cols, rows) => {
    try {
      ptyManager.resize(id2, cols, rows);
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.PtyKill, (_e, id2) => {
    try {
      intentionalKills.add(id2);
      ptyManager.kill(id2);
      return ok2(true);
    } catch (err) {
      return fail2(err);
    }
  });
}
function registerAgentsIpc(ctx) {
  const { registry: registry2, ok: ok2, fail: fail2 } = ctx;
  ipcMain$1.handle(IPC.DshStatus, async (_e, profile) => {
    try {
      return ok2(await getDshStatus(profile));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.DshListPlugins, (_e, profile) => {
    try {
      return ok2(listDshPlugins(profile));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.DshPluginUpdates, async (_e, profile) => {
    try {
      return ok2(await checkDshPluginUpdates(profile));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(
    IPC.DshInstallPlugin,
    async (_e, spec, profile) => {
      try {
        await installDshPlugin(spec, profile);
        return ok2(true);
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(
    IPC.DshUninstallPlugin,
    async (_e, name, profile) => {
      try {
        await uninstallDshPlugin(name, profile);
        return ok2(true);
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(
    IPC.DshUpdatePlugin,
    async (_e, name, channel, gitUrl, profile) => {
      try {
        return ok2(await updateDshPlugin(name, channel, gitUrl, profile));
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(IPC.DshUpdateAll, async (_e, profile) => {
    try {
      return ok2(await updateAllDshPlugins(profile));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.DshCreatePage, (_e, profile, port) => {
    try {
      const id2 = createDshPage(profile, Number(port) || 5173);
      registry2.reconcile();
      return ok2(id2);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.DshToken, (_e, profile) => {
    try {
      registry2.reconcile();
      return ok2(resolveDshToken(registry2.list(), profile || ""));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.OpenclawStatus, async () => {
    try {
      return ok2(await getOpenclawStatus());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.OpenclawCreatePage, (_e, port) => {
    try {
      const id2 = createOpenclawPage(Number(port) || void 0);
      registry2.reconcile();
      return ok2(id2);
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.OpenclawToken, () => {
    try {
      return ok2(getOpenclawGatewayToken());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(
    IPC.OpenclawInitToken,
    (_e, rotate) => {
      try {
        const { token, created } = initializeOpenclawToken(Boolean(rotate));
        let restarted = false;
        const page = registry2.get("openclaw");
        if (page && page.status === "running") {
          restarted = true;
          registry2.restart("openclaw").catch((err) => {
            console.warn("[openclaw] token restart failed (ignored):", err.message);
          });
        }
        return ok2({ token, created, restarted });
      } catch (err) {
        return fail2(err);
      }
    }
  );
}
function registerMcpIpc(ctx) {
  const { ok: ok2, fail: fail2 } = ctx;
  hubEvents.removeAllListeners("changed");
  hubEvents.on("changed", (states) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnMcpStateChanged, states);
    }
  });
  hubEvents.removeAllListeners("calls");
  hubEvents.on("calls", (calls) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnMcpCalls, calls);
    }
  });
  ipcMain$1.handle(IPC.McpListServers, () => {
    try {
      return ok2(listServers());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.McpSaveServer, async (_e, spec) => {
    try {
      return ok2(await saveServer(spec));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.McpRemoveServer, async (_e, id2) => {
    try {
      return ok2(await removeServer(id2));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.McpConnect, async (_e, id2) => {
    try {
      await connect(id2);
      return ok2();
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.McpDisconnect, async (_e, id2) => {
    try {
      await disconnect(id2);
      return ok2();
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.McpListTools, (_e, serverId) => {
    try {
      return ok2(listTools(serverId));
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetMcpCalls, () => {
    try {
      return ok2(getCalls());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(
    IPC.McpCallTool,
    async (_e, args) => {
      try {
        return ok2(await callTool(args));
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(IPC.McpBridgeInfo, () => {
    try {
      return ok2({ dir: bridgeDir(), catalogFile: bridgeCatalogFile(), configFile: bridgeConfigFile() });
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.GetContainerMcpInfo, () => {
    try {
      const running = isContainerMcpServerRunning();
      const info = getContainerMcpServerInfo();
      return ok2({
        enabled: !!getSettings().containerMcpServer,
        running,
        ...running && info ? { url: info.url, tokenFile: info.tokenFile } : {}
      });
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.McpPackagesStatus, () => {
    try {
      return ok2(mcpPackagesStatus());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(IPC.WorkspaceGet, () => {
    try {
      return ok2(workspaceInfo());
    } catch (err) {
      return fail2(err);
    }
  });
  ipcMain$1.handle(
    IPC.WorkspaceSave,
    (_e, patch) => {
      try {
        return ok2(writeWorkspace(patch || {}));
      } catch (err) {
        return fail2(err);
      }
    }
  );
  ipcMain$1.handle(IPC.WorkspaceBroadcast, () => {
    try {
      return ok2(broadcastWorkspace());
    } catch (err) {
      return fail2(err);
    }
  });
}
function registerIpc(registry2) {
  const ctx = { registry: registry2, ok, fail };
  for (const channel of Object.values(IPC)) {
    ipcMain$1.removeHandler(channel);
  }
  registry2.on("changed", () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(
        IPC.OnStateChanged,
        registry2.running().map((p) => ({
          id: p.id,
          name: p.name,
          port: p.containerPort || p.port,
          url: p.url || "",
          status: p.status,
          pid: p.pid
        }))
      );
    }
  });
  registry2.on("progress", (p) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnPageProgress, p);
    }
  });
  setEventBroadcaster((ev) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnEvent, ev);
    }
  });
  registerWindowIpc(ctx);
  registerRuntimeIpc(ctx);
  registerPagesIpc(ctx);
  registerSettingsIpc(ctx);
  registerLogsIpc(ctx);
  registerUpdatesIpc(ctx);
  registerTerminalIpc(ctx);
  registerAgentsIpc(ctx);
  registerMcpIpc(ctx);
}
let sequence = 0;
function nextId() {
  sequence += 1;
  return `dl-${Date.now().toString(36)}-${sequence}`;
}
function broadcast(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.OnDownloadProgress, payload);
  }
}
function computePercent(received, total) {
  if (!total || total < 0) return null;
  return Math.max(0, Math.min(100, Math.floor(received / total * 100)));
}
function hostOf(url) {
  if (!url) return void 0;
  try {
    return new URL(url).host;
  } catch {
    return void 0;
  }
}
function notifyDone(filename, savePath) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: m("download.doneTitle"),
      body: m("download.doneBody", { name: filename, dir: dirname(savePath) })
    });
    n.on("click", () => shell$1.showItemInFolder(savePath));
    n.show();
  } catch (err) {
    console.warn("[download] notification failed (ignored):", err.message);
  }
}
function wireItem(item, host) {
  const id2 = nextId();
  const label = () => basename(item.getSavePath()) || item.getFilename() || "download";
  const snapshot2 = (state) => ({
    id: id2,
    filename: label(),
    state,
    received: item.getReceivedBytes(),
    total: item.getTotalBytes(),
    percent: computePercent(item.getReceivedBytes(), item.getTotalBytes()),
    savePath: item.getSavePath() || void 0,
    host
  });
  item.on("updated", (_e, state) => {
    if (state === "progressing") broadcast(snapshot2("progressing"));
    else if (state === "interrupted") broadcast(snapshot2("progressing"));
  });
  item.once("done", (_e, state) => {
    if (state === "completed") {
      broadcast({ ...snapshot2("completed"), received: item.getReceivedBytes(), percent: 100 });
      const savePath = item.getSavePath();
      if (savePath) {
        notifyDone(basename(savePath), savePath);
        logEvent({
          level: "info",
          kind: "download.done",
          detail: savePath,
          meta: { file: basename(savePath), bytes: item.getReceivedBytes(), ...host ? { host } : {} }
        });
      }
    } else {
      broadcast({ ...snapshot2("cancelled"), state: "cancelled" });
      logEvent({ level: "warn", kind: "download.cancelled", meta: { file: label() } });
    }
  });
}
function registerDownloadHandling() {
  session.defaultSession.on("will-download", (_event, item, webContents2) => {
    const host = hostOf(webContents2?.getURL?.());
    item.setSavePath(uniquePath(resolveDownloadDir(), item.getFilename() || "download"));
    wireItem(item, host);
  });
}
const MIGRATION_MARKER = ".ascii-userdata-migrated";
function copyMissing(src, dst) {
  let copied = 0;
  const walk = (s, d) => {
    for (const ent of readdirSync(s, { withFileTypes: true })) {
      const sp = join(s, ent.name);
      const dp = join(d, ent.name);
      if (ent.isDirectory()) {
        if (!existsSync(dp)) mkdirSync(dp);
        walk(sp, dp);
      } else if (ent.isFile() && !existsSync(dp)) {
        copyFileSync(sp, dp);
        copied++;
      }
    }
  };
  walk(src, dst);
  return copied;
}
function ensureAsciiUserData() {
  const asciiLeaf = "DesktopContainer";
  try {
    const current2 = app$1.getPath("userData");
    if (!/[^\x20-\x7e]/.test(current2)) return;
    const target = join(app$1.getPath("appData"), asciiLeaf);
    if (/[^\x20-\x7e]/.test(target)) {
      console.warn("[container] no ASCII userData path available (Chinese username?):", target);
      return;
    }
    if (existsSync(target)) {
      if (existsSync(current2)) {
        try {
          const n = copyMissing(current2, target);
          console.warn(
            `[container] both userData folders existed; merged ${n} file(s) from the Chinese path into ASCII (no overwrite)`
          );
        } catch (err) {
          console.warn("[container] userData merge incomplete (continuing with ASCII):", err);
        }
      }
      app$1.setPath("userData", target);
      return;
    }
    if (!existsSync(current2)) {
      app$1.setPath("userData", target);
      return;
    }
    try {
      renameSync(current2, target);
      app$1.setPath("userData", target);
      try {
        writeFileSync$1(join(target, MIGRATION_MARKER), `migrated from ${current2} at ${isoShanghai()}`);
      } catch {
      }
    } catch (err) {
      console.error("[container] userData migration to ASCII path failed; keeping current:", err);
    }
  } catch (err) {
    console.error("[container] ensureAsciiUserData error:", err);
  }
}
ensureAsciiUserData();
installFileLogger();
registerLocaleSource(() => getSettings().locale);
onLocaleChanged(() => {
  mainWindow?.setTitle(m("app.title"));
  rebuildTrayMenu();
});
let mainWindow = null;
let registry = null;
let isQuitting = false;
let startHidden = false;
const FATAL_ERROR_CODES = /* @__PURE__ */ new Set(["MODULE_NOT_FOUND", "ERR_UNKNOWN_BUILTIN_MODULE", "ERR_DLOPEN_FAILED"]);
let fatalEscalated = false;
process.on("uncaughtException", (err) => {
  console.error("[container] uncaught exception:", err);
  logEvent({ level: "error", kind: "app.crash", detail: err?.stack || err?.message || String(err) });
  const code2 = err.code;
  if (app$1.isPackaged && code2 && FATAL_ERROR_CODES.has(code2) && !fatalEscalated) {
    fatalEscalated = true;
    const msg = m("err.fatal", { err: code2 });
    console.error(`[container] fatal: ${msg}`);
    dialog.showMessageBox({ type: "error", title: m("dialog.title"), message: msg }).catch(() => void 0).finally(() => app$1.exit(1));
  }
});
process.on("unhandledRejection", (reason) => {
  console.error("[container] unhandled rejection:", reason);
});
function markBootOk() {
  if (!app$1.isPackaged) return;
  try {
    mkdirSync(app$1.getPath("userData"), { recursive: true });
    writeFileSync$1(join(app$1.getPath("userData"), "dsh-boot-ok-marker"), app$1.getAppPath());
  } catch (err) {
    console.warn("[container] cannot write boot-ok marker:", err.message);
  }
}
function ensureUnpackedForUpdate() {
  if (!app$1.isPackaged) return;
  try {
    const resources = join(dirname(app$1.getPath("exe")), "resources");
    const appPath = app$1.getAppPath();
    if (!appPath.startsWith(join(resources, "updates"))) return;
    const src = join(resources, "app.asar.unpacked");
    const dst = join(dirname(appPath), "app.asar.unpacked");
    if (existsSync(src) && !existsSync(dst)) cpSync(src, dst, { recursive: true });
  } catch (err) {
    console.warn("[container] unpacked-copy for update failed (ignored):", err.message);
  }
}
function createWindow() {
  const restored = resolveBounds(940, 600);
  mainWindow = new BrowserWindow({
    width: restored?.width ?? 1280,
    height: restored?.height ?? 860,
    x: restored?.x,
    y: restored?.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: m("app.title"),
    backgroundColor: "#000000",
    // frameless: MenuBar doubles as the OS title bar with custom window controls
    frame: false,
    // win + linux read this for the taskbar/window chrome; mac uses build/icon.icns
    icon: appIconPath(),
    webPreferences: {
      preload: resolvePreload(),
      // Deliberate trade-off (container host): sandbox:false so the preload can expose node
      // helpers; webviewTag:true so managed pages run embedded. The blast radius is kept in
      // check by the authoritative web-contents-created handler below — every webview guest
      // gets window.open denied and navigated in place, so no guest escapes to a popup or
      // the system browser. Don't remove either without re-checking that handler.
      sandbox: false,
      webviewTag: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    if (!startHidden) mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    unwatchWindowBounds();
    mainWindow = null;
  });
  watchWindowBounds(mainWindow);
  if (restored?.maximized) mainWindow.maximize();
  const pushMaximized = () => {
    mainWindow?.webContents.send(IPC.OnMaximizedChanged, mainWindow.isMaximized());
  };
  mainWindow.on("maximize", pushMaximized);
  mainWindow.on("unmaximize", pushMaximized);
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell$1.openExternal(details.url);
    return { action: "deny" };
  });
  mainWindow.on("close", (e) => {
    if (isQuitting) return;
    if (getSettings().minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    } else {
      e.preventDefault();
      confirmAndQuit();
    }
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
function resolvePreload() {
  const dir = join(__dirname, "../preload");
  for (const name of ["index.mjs", "index.js"]) {
    if (existsSync(join(dir, name))) return join(dir, name);
  }
  return join(dir, "index.mjs");
}
function showWindow() {
  if (!mainWindow) createWindow();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}
function confirmAndQuit() {
  if (!mainWindow) {
    isQuitting = true;
    app$1.quit();
    return;
  }
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.webContents.send(IPC.OnQuitConfirm);
}
function quitNow() {
  isQuitting = true;
  app$1.quit();
}
async function verifyNodeRuntime() {
  const info = await getNodeRuntimeInfo();
  if (!info.ok) {
    if (info.version) {
      const msg = m("err.nodeVersion", { version: info.version });
      console.error(`[container] ${msg}`);
      dialogWarn(msg);
    } else {
      console.error(`[container] ${m("err.nodeMissing")}`);
    }
  } else {
    console.log(`[container] bundled node OK: ${info.path} (${info.version})`);
  }
}
function dialogWarn(msg) {
  dialog.showMessageBox({ type: "warning", title: m("dialog.title"), message: msg }).catch(() => void 0);
}
function reacquireSingleInstanceLock() {
  const RETRY_MS = 500;
  const MAX_ATTEMPTS2 = 10;
  const attempt = (n) => {
    if (app$1.requestSingleInstanceLock()) {
      console.log(`[container] relaunched instance took over the single-instance lock (attempt ${n})`);
      return;
    }
    if (n >= MAX_ATTEMPTS2) {
      const msg = m("err.dualInstance");
      console.error(`[container] ${msg} (lock still held after ${n} attempts)`);
      dialogWarn(msg);
      return;
    }
    setTimeout(() => attempt(n + 1), RETRY_MS);
  };
  attempt(1);
}
const relaunched = process.argv.includes("--dsh-relaunched");
const gotLock = relaunched || app$1.requestSingleInstanceLock();
if (!gotLock) {
  app$1.quit();
} else {
  if (relaunched) {
    reacquireSingleInstanceLock();
  }
  app$1.on("second-instance", showWindow);
  app$1.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.desktop-container");
    ensureUnpackedForUpdate();
    markBootOk();
    logEvent({
      level: "info",
      kind: "app.boot",
      meta: { version: app$1.getVersion(), packaged: app$1.isPackaged }
    });
    startHidden = process.argv.includes("--autostart") || app$1.getLoginItemSettings().wasOpenedAtLogin;
    applyLaunchAtStartup(getSettings().launchAtStartup);
    applyNpmRegistryEnv();
    app$1.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));
    app$1.on("web-contents-created", (_e, contents) => {
      if (contents.getType() === "webview") {
        contents.setBackgroundThrottling(false);
        contents.on("did-stop-loading", () => {
          if (!contents.isDestroyed()) contents.invalidate();
        });
        contents.on("did-finish-load", () => {
          if (!contents.isDestroyed()) contents.invalidate();
          setTimeout(() => {
            if (!contents.isDestroyed()) contents.invalidate();
          }, 120);
        });
        contents.setWindowOpenHandler(({ url }) => {
          contents.loadURL(url).catch(() => void 0);
          return { action: "deny" };
        });
      }
    });
    registerDownloadHandling();
    createWindow();
    createTray({
      getRegistry: () => registry,
      onShowWindow: showWindow,
      onQuitRequest: quitNow
    });
    verifyNodeRuntime().catch(
      (err) => console.error("[container] node runtime verification failed:", err)
    );
    ensureDefaultOpenclawPage();
    ensureBuiltinPages();
    registry = new PageRegistry({ pagesDir: resolvePagesDir(), projectDir: resolveProjectDir() });
    registerIpc(registry);
    registry.on("changed", rebuildTrayMenu);
    rebuildTrayMenu();
    const settings = getSettings();
    if (settings.autoStartPages.length) {
      registry.autoStart(settings.autoStartPages).catch((err) => console.warn("[container] auto-start failed", err));
    }
    setMcpPackagesRoot(join(app$1.getPath("userData"), "mcp"));
    autoStartAll().catch((err) => console.warn("[mcp-hub] auto-start failed", err));
    if (settings.containerMcpServer) {
      startContainerMcpServer(() => registry ?? void 0).catch((err) => {
        console.warn("[container-mcp] start failed, reverting flag:", err);
        try {
          updateSettings({ containerMcpServer: false });
        } catch {
        }
      });
    }
    initAutopilot(() => registry ?? void 0);
    void pnpmBinDirs().catch(() => void 0);
    app$1.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });
  app$1.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !getSettings().minimizeToTray) {
      isQuitting = true;
      app$1.quit();
    }
  });
  let shutdownDone = false;
  const QUIT_FLUSH_MS = 3e3;
  app$1.on("before-quit", (e) => {
    isQuitting = true;
    flushWindowBounds();
    flushPopoutBounds();
    if (registry && !shutdownDone) {
      shutdownDone = true;
      e.preventDefault();
      const grace = new Promise((resolve2) => setTimeout(resolve2, QUIT_FLUSH_MS));
      Promise.race([registry.shutdownAll(), grace]).then(
        async () => {
          disposeAutopilot();
          await stopContainerMcpServer().catch(() => void 0);
          await shutdownAll();
        },
        (err) => {
          console.error("[container] shutdownAll failed, forcing exit:", err);
        }
      ).finally(() => app$1.exit(0));
    }
  });
}
