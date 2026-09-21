import electron, { app as app$1, nativeTheme, net, ipcMain as ipcMain$1, BrowserWindow, dialog, shell as shell$1, webContents, session, Notification, nativeImage, Tray, Menu } from "electron";
import fs, { existsSync, mkdirSync, accessSync, constants as constants$1, appendFileSync, statSync, renameSync, readdirSync, readFileSync, rmSync, createWriteStream, writeFileSync as writeFileSync$1, unlinkSync, cpSync } from "node:fs";
import path, { join, delimiter, dirname, sep, extname, basename } from "node:path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { EventEmitter } from "node:events";
import { spawn, execFile, execFileSync, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import * as os from "node:os";
import os__default, { homedir as homedir$1 } from "node:os";
import process$1 from "node:process";
import { promisify, isDeepStrictEqual } from "node:util";
import crypto, { randomBytes } from "node:crypto";
import assert from "node:assert";
import { Transform } from "node:stream";
import { get as get$1 } from "node:https";
import { pipeline } from "node:stream/promises";
import { copyFile, readdir, stat } from "node:fs/promises";
import { simpleGit } from "simple-git";
import require$$1$1 from "tty";
import require$$1$2 from "util";
import require$$0$1 from "os";
import require$$0$3 from "fs";
import require$$0$2 from "buffer";
import require$$6$1 from "stream";
import require$$3$2, { join as join$1 } from "path";
import require$$1$3 from "zlib";
import require$$4$1 from "events";
import * as pty from "node-pty";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const CONTAINER_REPO_URL = "https://github.com/master1Sun/dsh-desktop-Electron.git";
const OPENCLAW_DEFAULT_PORT = 18789;
const IPC = {
  GetNodeInfo: "container:get-node-info",
  ListPages: "container:list-pages",
  StartPage: "container:start-page",
  StopPage: "container:stop-page",
  RestartPage: "container:restart-page",
  GetPageLogs: "container:get-page-logs",
  InstallPageFromGit: "container:install-page-git",
  InstallPageFromDir: "container:install-page-dir",
  ChooseDirectory: "container:choose-directory",
  RemovePage: "container:remove-page",
  SetPagePort: "container:set-page-port",
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
  OnStateChanged: "container:state-changed",
  DshStatus: "dsh:status",
  DshListPlugins: "dsh:list-plugins",
  DshPluginUpdates: "dsh:plugin-updates",
  DshInstallPlugin: "dsh:install-plugin",
  DshUninstallPlugin: "dsh:uninstall-plugin",
  DshUpdatePlugin: "dsh:update-plugin",
  DshUpdateAll: "dsh:update-all",
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
  PageRunSpec: "container:page-run-spec",
  PtyWrite: "container:pty-write",
  PtyResize: "container:pty-resize",
  PtyKill: "container:pty-kill",
  OnPtyData: "container:pty-data",
  OnPtyExit: "container:pty-exit",
  /** broadcast: a secondary window asks every window to switch to that CLI page's terminal */
  OpenTerminalPage: "container:open-terminal-page",
  /** broadcast: live progress of a file download inside an embedded webview (DownloadProgress) */
  OnDownloadProgress: "container:download-progress"
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
function bundledEnv(extra = {}) {
  const dir = join(getNodeExePath(), "..");
  return { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH || ""}`, ...extra };
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
  const root = object;
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
  return root;
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
    chmod: attemptifyAsync(promisify(fs.chmod), ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    chown: attemptifyAsync(promisify(fs.chown), ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    close: attemptifyAsync(promisify(fs.close), ATTEMPTIFY_NOOP_OPTIONS),
    fsync: attemptifyAsync(promisify(fs.fsync), ATTEMPTIFY_NOOP_OPTIONS),
    mkdir: attemptifyAsync(promisify(fs.mkdir), ATTEMPTIFY_NOOP_OPTIONS),
    realpath: attemptifyAsync(promisify(fs.realpath), ATTEMPTIFY_NOOP_OPTIONS),
    stat: attemptifyAsync(promisify(fs.stat), ATTEMPTIFY_NOOP_OPTIONS),
    unlink: attemptifyAsync(promisify(fs.unlink), ATTEMPTIFY_NOOP_OPTIONS),
    /* SYNC */
    chmodSync: attemptifySync(fs.chmodSync, ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    chownSync: attemptifySync(fs.chownSync, ATTEMPTIFY_CHANGE_ERROR_OPTIONS),
    closeSync: attemptifySync(fs.closeSync, ATTEMPTIFY_NOOP_OPTIONS),
    existsSync: attemptifySync(fs.existsSync, ATTEMPTIFY_NOOP_OPTIONS),
    fsyncSync: attemptifySync(fs.fsync, ATTEMPTIFY_NOOP_OPTIONS),
    mkdirSync: attemptifySync(fs.mkdirSync, ATTEMPTIFY_NOOP_OPTIONS),
    realpathSync: attemptifySync(fs.realpathSync, ATTEMPTIFY_NOOP_OPTIONS),
    statSync: attemptifySync(fs.statSync, ATTEMPTIFY_NOOP_OPTIONS),
    unlinkSync: attemptifySync(fs.unlinkSync, ATTEMPTIFY_NOOP_OPTIONS)
  },
  retry: {
    /* ASYNC */
    close: retryifyAsync(promisify(fs.close), RETRYIFY_OPTIONS),
    fsync: retryifyAsync(promisify(fs.fsync), RETRYIFY_OPTIONS),
    open: retryifyAsync(promisify(fs.open), RETRYIFY_OPTIONS),
    readFile: retryifyAsync(promisify(fs.readFile), RETRYIFY_OPTIONS),
    rename: retryifyAsync(promisify(fs.rename), RETRYIFY_OPTIONS),
    stat: retryifyAsync(promisify(fs.stat), RETRYIFY_OPTIONS),
    write: retryifyAsync(promisify(fs.write), RETRYIFY_OPTIONS),
    writeFile: retryifyAsync(promisify(fs.writeFile), RETRYIFY_OPTIONS),
    /* SYNC */
    closeSync: retryifySync(fs.closeSync, RETRYIFY_OPTIONS),
    fsyncSync: retryifySync(fs.fsyncSync, RETRYIFY_OPTIONS),
    openSync: retryifySync(fs.openSync, RETRYIFY_OPTIONS),
    readFileSync: retryifySync(fs.readFileSync, RETRYIFY_OPTIONS),
    renameSync: retryifySync(fs.renameSync, RETRYIFY_OPTIONS),
    statSync: retryifySync(fs.statSync, RETRYIFY_OPTIONS),
    writeSync: retryifySync(fs.writeSync, RETRYIFY_OPTIONS),
    writeFileSync: retryifySync(fs.writeFileSync, RETRYIFY_OPTIONS)
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
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
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
      _for(node2, forBody) {
        this._blockNode(node2);
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
        const node2 = new Return();
        this._blockNode(node2);
        this.code(value);
        if (node2.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node2 = new Try();
        this._blockNode(node2);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node2.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node2.finally = new Finally();
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
      _leafNode(node2) {
        this._currNode.nodes.push(node2);
        return this;
      }
      _blockNode(node2) {
        this._currNode.nodes.push(node2);
        this._nodes.push(node2);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node2) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node2;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node2) {
        const ns = this._nodes;
        ns[ns.length - 1] = node2;
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
    const { opts, self: self2 } = it;
    if (!opts.strictSchema)
      return;
    if (typeof schema === "boolean")
      return;
    const rules2 = self2.RULES.keywords;
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
  function schemaHasRulesForType({ schema, self: self2 }, type2) {
    const group = self2.RULES.types[type2];
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
  function validateKeywordUsage({ schema, opts, self: self2, errSchemaPath }, def, keyword2) {
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
        const msg = `keyword "${keyword2}" value is invalid at path "${errSchemaPath}": ` + self2.errorsText(def.validateSchema.errors);
        if (opts.validateSchema === "log")
          self2.logger.error(msg);
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
  function schemaCxtHasRules({ schema, self: self2 }) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (self2.RULES.all[key])
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
    const { schema, errSchemaPath, opts, self: self2 } = it;
    if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self2.RULES)) {
      self2.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
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
    const { gen, schema, data, allErrors, opts, self: self2 } = it;
    const { RULES } = self2;
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
  function resolveRef(root, baseId, ref2) {
    var _a;
    ref2 = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref2);
    const schOrFunc = root.refs[ref2];
    if (schOrFunc)
      return schOrFunc;
    let _sch = resolve2.call(this, root, ref2);
    if (_sch === void 0) {
      const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref2];
      const { schemaId } = this.opts;
      if (schema)
        _sch = new SchemaEnv({ schema, schemaId, root, baseId });
    }
    if (_sch === void 0)
      return;
    return root.refs[ref2] = inlineOrCompile.call(this, _sch);
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
  function resolve2(root, ref2) {
    let sch;
    while (typeof (sch = this.refs[ref2]) == "string")
      ref2 = sch;
    return sch || this.schemas[ref2] || resolveSchema.call(this, root, ref2);
  }
  function resolveSchema(root, ref2) {
    const p = this.opts.uriResolver.parse(ref2);
    const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
    let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
    if (Object.keys(root.schema).length > 0 && refPath === baseId) {
      return getJsonPointer.call(this, p, root);
    }
    const id2 = (0, resolve_1.normalizeId)(refPath);
    const schOrRef = this.refs[id2] || this.schemas[id2];
    if (typeof schOrRef == "string") {
      const sch = resolveSchema.call(this, root, schOrRef);
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
      return new SchemaEnv({ schema, schemaId, root, baseId });
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
  function getJsonPointer(parsedRef, { baseId, schema, root }) {
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
      env2 = resolveSchema.call(this, root, $ref);
    }
    const { schemaId } = this.opts;
    env2 = env2 || new SchemaEnv({ schema, schemaId, root, baseId });
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
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
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
      const { baseId, schemaEnv: env2, validateName, opts, self: self2 } = it;
      const { root } = env2;
      if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
        return callRootRef();
      const schOrEnv = compile_1.resolveRef.call(self2, root, baseId, $ref);
      if (schOrEnv === void 0)
        throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
      if (schOrEnv instanceof compile_1.SchemaEnv)
        return callValidate(schOrEnv);
      return inlineRefSchema(schOrEnv);
      function callRootRef() {
        if (env2 === root)
          return callRef(cxt, validateName, env2, env2.$async);
        const rootName = gen.scopeValue("root", { ref: root });
        return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
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
    const { schemaEnv, schema, self: self2 } = cxt.it;
    const { root, baseId, localRefs, meta } = schemaEnv.root;
    const { schemaId } = self2.opts;
    const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
    compile_1.compileSchema.call(self2, sch);
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
      const { opts, errSchemaPath, schemaEnv, self: self2 } = it;
      if (!opts.validateFormats)
        return;
      if ($data)
        validate$DataFormat();
      else
        validateFormat();
      function validate$DataFormat() {
        const fmts = gen.scopeValue("formats", {
          ref: self2.formats,
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
        const formatDef = self2.formats[schema];
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
            self2.logger.warn(unknownMsg());
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
        const { opts, self: self2 } = it;
        if (!opts.validateFormats)
          return;
        const fCxt = new ajv_1.KeywordCxt(it, self2.RULES.all.format.definition, "format");
        if (fCxt.$data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self2.formats,
            code: opts.code.formats
          });
          const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
          cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
          const format2 = fCxt.schema;
          const fmtDef = self2.formats[format2];
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
    const src2 = exports.src = [];
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
      src2[index] = value;
      safeSrc[index] = safe;
      re2[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src2[t.NUMERICIDENTIFIER]})\\.(${src2[t.NUMERICIDENTIFIER]})\\.(${src2[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src2[t.NUMERICIDENTIFIERLOOSE]})\\.(${src2[t.NUMERICIDENTIFIERLOOSE]})\\.(${src2[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src2[t.NONNUMERICIDENTIFIER]}|${src2[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src2[t.NONNUMERICIDENTIFIER]}|${src2[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src2[t.PRERELEASEIDENTIFIER]}(?:\\.${src2[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src2[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src2[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src2[t.BUILDIDENTIFIER]}(?:\\.${src2[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src2[t.MAINVERSION]}${src2[t.PRERELEASE]}?${src2[t.BUILD]}?`);
    createToken("FULL", `^${src2[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src2[t.MAINVERSIONLOOSE]}${src2[t.PRERELEASELOOSE]}?${src2[t.BUILD]}?`);
    createToken("LOOSE", `^${src2[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src2[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src2[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src2[t.XRANGEIDENTIFIER]})(?:\\.(${src2[t.XRANGEIDENTIFIER]})(?:\\.(${src2[t.XRANGEIDENTIFIER]})(?:${src2[t.PRERELEASE]})?${src2[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src2[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src2[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src2[t.XRANGEIDENTIFIERLOOSE]})(?:${src2[t.PRERELEASELOOSE]})?${src2[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src2[t.GTLT]}\\s*${src2[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src2[t.GTLT]}\\s*${src2[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src2[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src2[t.COERCEPLAIN] + `(?:${src2[t.PRERELEASE]})?(?:${src2[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src2[t.COERCE], true);
    createToken("COERCERTLFULL", src2[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src2[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src2[t.LONETILDE]}${src2[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src2[t.LONETILDE]}${src2[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src2[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src2[t.LONECARET]}${src2[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src2[t.LONECARET]}${src2[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src2[t.GTLT]}\\s*(${src2[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src2[t.GTLT]}\\s*(${src2[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src2[t.GTLT]}\\s*(${src2[t.LOOSEPLAIN]}|${src2[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src2[t.XRANGEPLAIN]})\\s+-\\s+(${src2[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src2[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src2[t.XRANGEPLAINLOOSE]})\\s*$`);
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
    src: src2,
    t,
    comparatorTrimReplace,
    tildeTrimReplace,
    caretTrimReplace
  } = requireRe();
  const { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = requireConstants();
  const BUILDSTRIPRE = new RegExp(src2[t.BUILD], "g");
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
    const entries = Object.keys(this.store);
    return entries.filter((key) => !this._isReservedKeyPath(key)).length;
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
      const data = fs.readFileSync(this.path, this.#encryptionKey ? null : "utf8");
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
        const data = fs.readFileSync(this.path, this.#encryptionKey ? null : "utf8");
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
      fs.unwatchFile(this.path);
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
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
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
      fs.writeFileSync(this.path, data, { mode: this.#options.configFileMode });
    } else {
      try {
        writeFileSync(this.path, data, { mode: this.#options.configFileMode });
      } catch (error) {
        if (error?.code === "EXDEV") {
          fs.writeFileSync(this.path, data, { mode: this.#options.configFileMode });
          return;
        }
        throw error;
      }
    }
  }
  _watch() {
    this._ensureDirectory();
    if (!fs.existsSync(this.path)) {
      this._write(createPlainObject());
    }
    if (process$1.platform === "win32" || process$1.platform === "darwin") {
      this.#debouncedChangeHandler ??= debounceFunction(() => {
        this.events.dispatchEvent(new Event("change"));
      }, { wait: 100 });
      const directory = path.dirname(this.path);
      const basename2 = path.basename(this.path);
      this.#watcher = fs.watch(directory, { persistent: false, encoding: "utf8" }, (_eventType, filename) => {
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
      fs.watchFile(this.path, { persistent: false }, (_current, _previous) => {
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
const DEFAULTS = {
  defaultView: { kind: "none" },
  openExternalIn: "embedded",
  minimizeToTray: true,
  // off by default: registering a login item is an OS-level change we never make unprompted
  launchAtStartup: false,
  // auto-run the bundled runtimes on launch: openclaw (gateway) + dsh-web (server)
  autoStartPages: ["openclaw", "dsh-web"],
  lastExternalUrls: [],
  externalSites: [],
  theme: "auto",
  // UI display language; defaults to Chinese
  locale: "zh",
  // empty = follow the install directory (<installDir>/env); see resolveEnvRoot()
  envRoot: "",
  dshHome: "",
  openclawHome: "",
  // empty = the OS Downloads folder; embedded-page downloads save there (see downloads.ts)
  downloadDir: "",
  pageEnvs: {},
  pagePorts: {},
  // a page that crashes after having run is relaunched automatically; off surfaces the error only
  crashAutoRestart: true
};
let store = null;
function getStore() {
  if (!store) {
    store = new ElectronStore({ name: "container-settings", defaults: DEFAULTS });
  }
  return store;
}
function getSettings() {
  return { ...DEFAULTS, ...getStore().store };
}
function updateSettings(partial) {
  const s = getStore();
  for (const [k, v] of Object.entries(partial)) {
    if (v !== void 0) s.set(k, v);
  }
  return getSettings();
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
function resolveInstallDir() {
  if (app$1.isPackaged) {
    try {
      return dirname(app$1.getPath("exe"));
    } catch {
    }
  }
  return resolveProjectDir();
}
function isWritableDir(dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    accessSync(dir, constants$1.W_OK);
    return true;
  } catch {
    return false;
  }
}
function resolveEnvRoot() {
  const override = (getSettings().envRoot || "").trim();
  if (override) return expandHome(override);
  if (app$1.isPackaged) {
    const candidate = join(resolveInstallDir(), "env");
    if (isWritableDir(candidate)) return candidate;
  }
  return join(app$1.getPath("userData"), "env");
}
function expandEnvTemplate(p) {
  if (!p) return p;
  return expandHome(p).replace(/\{envRoot\}/g, resolveEnvRoot()).replace(/\{userData\}/g, app$1.getPath("userData"));
}
function preferExisting(candidate, legacy) {
  return existsSync(candidate) || !existsSync(legacy) ? candidate : legacy;
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
  if (!override) {
    return join(homedir$1(), ".dsh");
  }
  return expandHome(override);
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
  if (!override) {
    return join(homedir$1(), ".openclaw");
  }
  return expandHome(override);
}
function resolvePageEnv(pageId, key, defaultPath, legacyPath) {
  const fromEnv = (process.env[key] || "").trim();
  if (fromEnv) return expandHome(fromEnv);
  const override = (getSettings().pageEnvs?.[pageId]?.[key] || "").trim();
  if (override) return expandHome(override);
  if (defaultPath && defaultPath.trim()) {
    const candidate = expandEnvTemplate(defaultPath.trim());
    const legacy = (legacyPath || "").trim();
    return legacy ? preferExisting(candidate, expandHome(legacy)) : candidate;
  }
  return "";
}
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
const MAX_BYTES = 5 * 1024 * 1024;
const ROTATED_KEEP = 1;
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
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return;
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
const stamp = () => (/* @__PURE__ */ new Date()).toISOString();
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
const zh = {
  "app.title": "桌面控制台",
  "tray.show": "显示主界面",
  "tray.stop": "停止 {name}",
  "tray.start": "启动 {name}",
  "tray.quit": "退出容器（将停止所有 node 进程）",
  "tray.quitConfirmTitle": "退出容器",
  "tray.quitConfirm": "退出将停止所有运行中的 node 进程与页面。确定退出吗？",
  "tray.quitYes": "退出",
  "tray.quitNo": "取消",
  "tray.tooltip": "桌面控制台 · {n} 个 page 运行中",
  "dialog.title": "DSH 容器",
  "dialog.chooseDir": "选择要托管的本地项目目录",
  "dialog.saveAs": "另存为",
  "err.nodeVersion": "内置 Node 版本异常：{version}（期望 v24.21.0）",
  "err.nodeMissing": "未找到内置 Node 运行时，请在“环境准备”引导中点击下载（开发者可运行 npm run setup:node）",
  "download.doneTitle": "下载完成",
  "download.doneBody": "{name} 已保存到 {dir}",
  "ipc.portRange": "端口需为 1-65535 的整数",
  "ipc.notTerminal": "{id} 不是终端类项目",
  "ipc.unknownTarget": "未知的目标: {target}",
  "ipc.containerRoot": "容器根目录",
  "ipc.guestGone": "内嵌页面已不可用",
  "pty.commandNotFound": "找不到命令 “{cmd}”：它不在 PATH 中，也不是可执行文件。请确认该 CLI 已安装或已在设置中提供完整路径。",
  "page.noEntryCommand": "无法推断启动命令：目录缺少 server.js / index.js / package.json(start script)",
  "page.metaParseFail": "container.json 解析失败: {err}",
  "page.metaNoStart": "container.json 缺少 startCommand（terminal 类型必填）",
  "page.metaNoPort": "container.json 缺少 port（或设置 external=true / kind=terminal，或项目自带可推断的启动入口）",
  "page.dirEnvLabel": "页面目录",
  "page.dirEnvDesc": "自动生成的应用安装目录，以环境变量注入该页面子进程。留空即用导入时的目录。",
  "page.metaInvalid": "{entry} (配置无效)",
  "page.portNotReady": "端口 {port} 在 {sec}s 内未就绪",
  "page.containerDesc": "容器主程序（git 更新检测对象）",
  "page.unknown": "未知 page: {id}",
  "page.externalNoStart": "{name} 是外部地址项目，无需启动进程",
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
  "dsh.profilePageDesc": "由容器管理的 @deepseek-ai/dsh profile「{profile}」，插件在本机 userData 的 profile 目录内管理",
  "dsh.invalidSpec": "非法包名/地址: {spec}",
  "dsh.gitNeedsUrl": "git 更新需要提供仓库地址",
  "dsh.updatedTo": "已更新至 {spec}",
  "dsh.npmUpdated": "已通过 npm 更新 {spec}",
  "dsh.illegalRepoChars": "仓库地址包含非法字符",
  "dsh.lsRemoteFail": "git ls-remote 失败",
  "dsh.remoteHeadFail": "无法解析远端 HEAD",
  "dsh.binMissing": "未找到 @deepseek-ai/dsh/lib/bin.js（先运行 npm run setup:dsh）",
  "openclaw.cliMissing": "未找到 openclaw CLI，请先运行 npm run setup:openclaw（或全局安装 openclaw@latest）",
  "openclaw.cliMissingShort": "未找到 openclaw CLI，请先运行 npm run setup:openclaw",
  "openclaw.versionFail": "openclaw --version 退出码 {code}",
  "openclaw.unavailable": "openclaw 不可用：{err}",
  "openclaw.homeLabel": "OPENCLAW 配置目录",
  "openclaw.homeDesc": "留空即使用 openclaw CLI 的默认目录 ~/.openclaw，与终端共用同一套配置",
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
  "install.clonedNoEntry": "克隆成功但缺少 container.json / 无法推断启动命令：{err}。请在设置页编辑该项目的 container.json。",
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
  "upd.localNoAuto": "本地项目不支持自动更新，请在其仓库拉取新版后重装/复制",
  "upd.builtinFollowsContainer": "容器内置页面，随桌面控制台源码一起更新",
  "upd.unknownChannel": "未知的更新方式"
};
const en = {
  "app.title": "Desktop Console",
  "tray.show": "Show main window",
  "tray.stop": "Stop {name}",
  "tray.start": "Start {name}",
  "tray.quit": "Quit container (stops all node processes)",
  "tray.quitConfirmTitle": "Quit container",
  "tray.quitConfirm": "Quitting stops all running node processes and pages. Quit anyway?",
  "tray.quitYes": "Quit",
  "tray.quitNo": "Cancel",
  "tray.tooltip": "Desktop Console · {n} page(s) running",
  "dialog.title": "DSH Container",
  "dialog.chooseDir": "Choose the local project folder to host",
  "dialog.saveAs": "Save As",
  "err.nodeVersion": "Unexpected built-in Node version: {version} (expected v24.21.0)",
  "err.nodeMissing": "Built-in Node runtime not found — download it from the setup guide (developers: run npm run setup:node)",
  "download.doneTitle": "Download complete",
  "download.doneBody": "{name} saved to {dir}",
  "ipc.portRange": "Port must be an integer from 1 to 65535",
  "ipc.notTerminal": "{id} is not a terminal project",
  "ipc.unknownTarget": "Unknown target: {target}",
  "ipc.containerRoot": "Container root",
  "ipc.guestGone": "The embedded page is no longer available",
  "pty.commandNotFound": "Command not found: “{cmd}” — it is neither on PATH nor an executable file. Make sure the CLI is installed, or set its full path in the settings.",
  "page.noEntryCommand": "Cannot infer a start command: the folder has no server.js / index.js / package.json(start script)",
  "page.metaParseFail": "Failed to parse container.json: {err}",
  "page.metaNoStart": "container.json is missing startCommand (required for kind=terminal)",
  "page.metaNoPort": "container.json is missing port (or set external=true / kind=terminal, or provide an inferable entry point)",
  "page.dirEnvLabel": "Page directory",
  "page.dirEnvDesc": "Auto-generated app install directory, injected into this page’s subprocess as an env var. Empty uses the imported directory.",
  "page.metaInvalid": "{entry} (invalid config)",
  "page.portNotReady": "Port {port} was not ready within {sec}s",
  "page.containerDesc": "Container main program (git update-check target)",
  "page.unknown": "Unknown page: {id}",
  "page.externalNoStart": "{name} is an external address project; no process to start",
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
  "dsh.profilePageDesc": 'Container-managed @deepseek-ai/dsh profile "{profile}"; plugins are managed in this machine’s userData profile directory',
  "dsh.invalidSpec": "Invalid package name / URL: {spec}",
  "dsh.gitNeedsUrl": "A git update requires a repository URL",
  "dsh.updatedTo": "Updated to {spec}",
  "dsh.npmUpdated": "Updated {spec} via npm",
  "dsh.illegalRepoChars": "The repository URL contains illegal characters",
  "dsh.lsRemoteFail": "git ls-remote failed",
  "dsh.remoteHeadFail": "Could not resolve the remote HEAD",
  "dsh.binMissing": "@deepseek-ai/dsh/lib/bin.js not found (run npm run setup:dsh first)",
  "openclaw.cliMissing": "openclaw CLI not found — run npm run setup:openclaw (or install openclaw@latest globally)",
  "openclaw.cliMissingShort": "openclaw CLI not found — run npm run setup:openclaw first",
  "openclaw.versionFail": "openclaw --version exited with code {code}",
  "openclaw.unavailable": "openclaw is unavailable: {err}",
  "openclaw.homeLabel": "OPENCLAW config dir",
  "openclaw.homeDesc": "Empty uses openclaw’s default ~/.openclaw — the same config store the CLI uses",
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
  "install.clonedNoEntry": "Cloned successfully but container.json is missing / no start command could be inferred: {err}. Edit that project’s container.json on the Settings page.",
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
  "upd.localNoAuto": "Local projects do not support auto-update; pull the new version in their repo, then reinstall/copy",
  "upd.builtinFollowsContainer": "Built-in container page — updates with the desktop container source",
  "upd.unknownChannel": "Unknown update channel"
};
const dictionaries = { zh, en };
let localeSource = () => "zh";
function registerLocaleSource(fn) {
  localeSource = fn;
}
const localeListeners = /* @__PURE__ */ new Set();
function onLocaleChanged(fn) {
  localeListeners.add(fn);
}
function notifyLocaleChanged() {
  for (const fn of localeListeners) fn();
}
function currentLocale() {
  return localeSource() === "en" ? "en" : "zh";
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
const LOG_LIMIT = 1e3;
const START_TIMEOUT_MS = Number(process.env.DSH_PAGE_START_TIMEOUT_MS || 3e4);
const OPENCLAW_READY_TIMEOUT_MS = Number(process.env.DSH_OPENCLAW_READY_TIMEOUT_MS || 12e4);
const ANNOUNCE_GRACE_MS = 1500;
const CRASH_RETRY_DELAYS_MS = [2e3, 5e3, 15e3];
const STABLE_RESET_MS = 5 * 6e4;
const BUILTIN_PAGE_IDS = /* @__PURE__ */ new Set(["dsh-web", "openclaw"]);
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
  const declaredSpecs = declared.filter((v) => Boolean(v?.key)).map((v) => {
    const { label, description: description2, ...rest } = v;
    return {
      ...rest,
      label: resolveText(label) || void 0,
      description: resolveText(description2) || void 0
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
    envVars
  };
}
function scanInstalledPages(pagesDir) {
  if (!existsSync(pagesDir)) return [];
  const out = [];
  for (const entry of readdirSync(pagesDir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(pagesDir, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
      out.push(readPageMeta(pagesDir, entry));
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
          reject(new Error(m("page.portNotReady", { port, sec: Math.round(timeoutMs / 1e3) })));
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
    const v = resolvePageEnv(meta.id, spec.key, spec.defaultPath, spec.legacyPath);
    if (!v) continue;
    if (spec.defaultPath) ensureEnvDir(v);
    out[spec.key] = v;
  }
  return out;
}
function expandStartCommand(cmd) {
  return cmd.replace(/(^|\s)~(?=[/\\]|$)/g, (_m, pre) => pre + expandHome("~"));
}
class PageRegistry extends EventEmitter {
  constructor(root) {
    super();
    this.root = root;
    this.reconcile();
  }
  root;
  entries = /* @__PURE__ */ new Map();
  quitting = false;
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
      else this.entries.set(meta.id, { meta, status: "stopped", logs: [], crashes: 0 });
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
      crashes: e.crashes || void 0,
      nextRestartAt: e.nextRestartAt
    };
  }
  logs(id2) {
    return [...this.entries.get(id2)?.logs ?? []];
  }
  async start(id2, opts) {
    const e = this.entries.get(id2);
    if (!e) throw new Error(m("page.unknown", { id: id2 }));
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
    this.emitProgress(e, "spawning");
    let proc;
    if (isDsh) {
      const { dshSpawnCommand: dshSpawnCommand2 } = await Promise.resolve().then(() => dsh);
      const spec = await dshSpawnCommand2(e.meta.dshProfile || "web", port);
      try {
        proc = spawn(spec.cmd, spec.args, {
          cwd: spec.cwd,
          env: spec.env,
          windowsHide: true,
          shell: false
        });
      } catch (err) {
        this.fail(e, m("page.dshStartFail", { err: err.message }));
        throw new Error(e.lastError);
      }
    } else if (isOpenclaw) {
      const { openclawSpawnSpec: openclawSpawnSpec2 } = await Promise.resolve().then(() => openclaw);
      const spec = openclawSpawnSpec2(port);
      try {
        proc = spawn(spec.cmd, spec.args, {
          cwd: spec.cwd,
          env: spec.env,
          windowsHide: true,
          shell: false
        });
      } catch (err) {
        this.fail(e, m("page.openclawStartFail", { err: err.message }));
        throw new Error(e.lastError);
      }
    } else {
      if (isTerminal) {
        this.setStatus(e, "stopped");
        throw new Error(m("page.cliNeedsTerminal", { name: e.meta.name }));
      }
      const [cmd, ...args] = expandStartCommand(e.meta.startCommand).split(/\s+/);
      const executable = cmd === "node" ? getNodeExePath() : cmd;
      try {
        proc = spawn(executable, args, {
          cwd: e.meta.dir,
          env: bundledEnv({ PORT: String(port), ...buildPageEnv(e.meta) }),
          windowsHide: true,
          shell: false
        });
      } catch (err) {
        this.fail(e, m("page.spawnFail", { err: err.message }));
        throw new Error(e.lastError);
      }
    }
    e.proc = proc;
    e.pid = proc.pid;
    e.startedAt = Date.now();
    proc.on("spawn", () => this.emitProgress(e, "process"));
    proc.stdout.on("data", (d) => this.appendLog(e, d));
    proc.stderr.on("data", (d) => this.appendLog(e, d));
    proc.on("error", (err) => this.fail(e, err.message));
    proc.on("close", (code2) => {
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
        e.crashes++;
        this.scheduleCrashRestart(e, code2);
      }
      e.proc = void 0;
      e.pid = void 0;
      this.emitChanged();
    });
    try {
      this.emitProgress(e, "port");
      const { port: port2, url } = await this.waitReady(e, proc, isDsh, isOpenclaw, isTerminal);
      e.resolvedPort = port2;
      let launchUrl = url;
      if (isOpenclaw) {
        this.emitProgress(e, "url");
        const { resolveOpenclawLaunchUrl: resolveOpenclawLaunchUrl2 } = await Promise.resolve().then(() => openclaw);
        launchUrl = await resolveOpenclawLaunchUrl2() || url;
      }
      e.launchUrl = launchUrl;
      e.logs.push(m("page.logReady", { port: port2 }));
      this.setStatus(e, "running");
      clearTimeout(e.stableTimer);
      e.stableTimer = setTimeout(() => {
        e.stableTimer = void 0;
        if (e.status === "running") e.crashes = 0;
      }, STABLE_RESET_MS);
      e.stableTimer.unref?.();
      this.emitProgress(e, "ready");
      this.emitChanged();
      return this.toState(e);
    } catch (err) {
      this.fail(e, err.message);
      if (e.proc) this.stop(id2);
      throw new Error(e.lastError);
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
    const timeoutMs = isOpenclaw ? OPENCLAW_READY_TIMEOUT_MS : START_TIMEOUT_MS;
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
                sec: Math.round(START_TIMEOUT_MS / 1e3),
                port: wantPort
              })
            )
          );
        }
      }, 5e3);
      const cleanup = () => {
        clearInterval(timer);
        proc.stdout.off("data", onChunk);
        proc.off("close", onExit);
      };
      proc.stdout.on("data", onChunk);
      proc.once("close", onExit);
      waitPortReady(wantPort, START_TIMEOUT_MS).then(
        (port) => setTimeout(() => {
          cleanup();
          resolve2({ port, url: announced?.url });
        }, ANNOUNCE_GRACE_MS),
        failWith
      );
    });
  }
  stop(id2) {
    const e = this.entries.get(id2);
    if (!e) return;
    this.clearRestartTimers(e);
    if (!e?.proc) return;
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
    if (!proc) return Promise.resolve();
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
  /** Kill leftover bundled-node openclaw gateways this registry no longer tracks (dev hot-reload
      orphans holding the state-dir ownership lock → exit 78). Best-effort; never throws. */
  async reclaimOrphanOpenclaw(selfId) {
    const tracked = /* @__PURE__ */ new Set();
    for (const [id2, e] of this.entries) {
      if (id2 !== selfId && e.meta.kind === "openclaw" && e.proc?.pid) tracked.add(e.proc.pid);
    }
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
  /** Kill dsh harnesses this registry no longer tracks (dev-reload orphans or a manually
      launched `dsh --profile <p>`) before spawning our own — two harnesses on one profile
      break terminal session ownership. Best-effort; never throws. */
  async reclaimOrphanDsh(profile, selfId) {
    const tracked = /* @__PURE__ */ new Set();
    for (const [id2, e] of this.entries) {
      if (id2 !== selfId && e.meta.kind === "dsh" && (e.meta.dshProfile || "web") === profile && e.proc?.pid) {
        tracked.add(e.proc.pid);
      }
    }
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
  async restart(id2) {
    await this.stopAndWait(id2);
    return this.start(id2);
  }
  /** auto-start configured pages; failures are logged, never thrown.
      Terminal-kind pages run in the embedded terminal and are opened by the renderer,
      so they are skipped here to avoid a spurious "run in terminal" error. Unknown ids
      (a retired builtin still listed in persisted settings) are skipped silently. */
  async autoStart(ids) {
    await Promise.all(
      ids.map(async (id2) => {
        const entry = this.entries.get(id2);
        if (!entry || entry.meta.kind === "terminal") return;
        try {
          await this.start(id2);
        } catch (err) {
          console.warn(`[pages] auto-start ${id2} failed:`, err.message);
        }
      })
    );
  }
  shutdownAll() {
    this.quitting = true;
    for (const id2 of [...this.entries.keys()]) this.stop(id2);
  }
  setStatus(e, status) {
    e.status = status;
    this.emitChanged();
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
  fail(e, message) {
    e.lastError = message;
    e.logs.push(`[container] ${message}`);
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
const INDEX_URLS = [
  "https://npmmirror.com/mirrors/node/index.json",
  "https://nodejs.org/dist/index.json"
];
const DIST_BASES = [
  "https://npmmirror.com/mirrors/node/%V%/node-%V%-win-x64.zip",
  "https://cdn.npmmirror.com/binaries/node/%V%/node-%V%-win-x64.zip",
  "https://nodejs.org/dist/%V%/node-%V%-win-x64.zip"
];
const MAX_VERSIONS = 50;
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
    req.setHeader("user-agent", "dsh-desktop-container");
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
async function listNodeVersions() {
  if (process.platform !== "win32") throw new Error(m("node.notWin"));
  let lastErr = "";
  for (const url of INDEX_URLS) {
    try {
      const { body } = await get(url, 25e3);
      const entries = JSON.parse(body);
      const out = [];
      for (const e of entries) {
        if (!isValidTag(e.version)) continue;
        if (e.files && !e.files.includes("win-x64-zip") && !e.files.includes("win-x64")) continue;
        if (!nodeVersionUsable(e.version)) continue;
        out.push({ version: e.version, date: e.date, lts: e.lts });
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
      { headers: { "user-agent": "dsh-desktop-container" }, timeout: 6e4 },
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
function extractZip$1(zip, dest) {
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
    DIST_BASES.map((b) => b.split("%V%").join(want)),
    zip,
    want,
    onProgress
  );
  onProgress({ name: "Node", phase: "extract", message: m("node.extracting") });
  await extractZip$1(zip, extracted);
  const nested = readdirSync(extracted).find((d) => d.startsWith(`node-${want}-win-x64`));
  const srcRoot = nested ? join(extracted, nested) : extracted;
  mkdirSync(staging, { recursive: true });
  for (const entry of readdirSync(srcRoot)) {
    renameSync(join(srcRoot, entry), join(staging, entry));
  }
  verifyRuntime(join(staging, "node.exe"), want);
  const dir = overrideNodeDir();
  const old = `${dir}.old`;
  if (existsSync(dir)) {
    rmSync(old, { recursive: true, force: true });
    try {
      renameSync(dir, old);
    } catch (err) {
      throw new Error(m("node.locked", { err: err.message }));
    }
  }
  renameSync(staging, dir);
  invalidateNodeRuntimeCache();
  rmSync(zip, { force: true });
  rmSync(extracted, { recursive: true, force: true });
  rmSync(old, { recursive: true, force: true });
  onProgress({ name: "Node", phase: "done", message: m("node.done", { v: want }) });
  return getNodeRuntimeInfo(true);
}
async function restoreBundledNode() {
  const dir = overrideNodeDir();
  if (existsSync(dir)) {
    const old = `${dir}.old`;
    rmSync(old, { recursive: true, force: true });
    try {
      renameSync(dir, old);
      rmSync(old, { recursive: true, force: true });
    } catch (err) {
      throw new Error(m("node.locked", { err: err.message }));
    }
  }
  invalidateNodeRuntimeCache();
  return getNodeRuntimeInfo(true);
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
function seedContainerManifest(pagesDir, dirName, port) {
  const dir = join(pagesDir, dirName);
  const metaFile = join(dir, "container.json");
  if (existsSync(metaFile)) return;
  const pkg = readPkgSafe(dir);
  const manifest = {
    name: dirName,
    description: {
      zh: msgIn("zh", "install.importedDesc"),
      en: msgIn("en", "install.importedDesc")
    }
  };
  if (pkg?.bin && !hasServerDependency(pkg)) {
    const start = cliStartCommand(dir, pkg);
    if (start) {
      manifest.kind = "terminal";
      manifest.startCommand = start;
    } else {
      manifest.kind = "page";
      if (isValidPort(port)) manifest.port = Number(port);
    }
  } else {
    manifest.kind = "page";
    if (isValidPort(port)) manifest.port = Number(port);
  }
  writeFileSync$1(metaFile, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}
function validateRepoUrl(url) {
  const trimmed = url.trim();
  if (!/^(https?:\/\/|git@)[^\s]+\.git$/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error(m("install.repoUrlInvalid"));
  }
  if (/[\s;`$&|]/.test(trimmed)) throw new Error(m("dsh.illegalRepoChars"));
  return trimmed;
}
async function installFromGit(pagesDir, repoUrl, name, port, originUrl, onProgress) {
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
  await cloneWithAuthFallback(
    target,
    url,
    (g) => emit({ phase: "receiving", percent: g.percent, message: gitCaption(g) })
  );
  emit({ phase: "validating" });
  applyPortOverride(dirName, port);
  seedContainerManifest(pagesDir, dirName, port);
  try {
    readPageMeta(pagesDir, dirName);
  } catch (err) {
    rmSync(target, { recursive: true, force: true });
    const { [dirName]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {};
    updateSettings({ pagePorts });
    throw new Error(m("install.clonedNoEntry", { err: err.message }));
  }
  emit({ phase: "finalizing" });
  emit({ phase: "done", percent: 100 });
  return dirName;
}
function gitCaption(g) {
  const cnt = g.total ? ` (${g.processed ?? 0}/${g.total})` : "";
  return `${g.stage}${cnt} ${g.percent}%`;
}
async function planCopy(root) {
  const entries = [];
  let totalBytes = 0;
  const walk = async (dir, relBase) => {
    const items2 = await readdir(dir, { withFileTypes: true });
    items2.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const it of items2) {
      if (it.name === "node_modules" || it.name === ".git") continue;
      const abs = join(dir, it.name);
      const rel = relBase ? `${relBase}/${it.name}` : it.name;
      if (it.isDirectory()) {
        entries.push({ abs, rel, dir: true, size: 0 });
        await walk(abs, rel);
      } else if (it.isFile()) {
        const s = await stat(abs);
        entries.push({ abs, rel, dir: false, size: s.size });
        totalBytes += s.size;
      }
    }
  };
  await walk(root, "");
  return { entries, totalBytes };
}
async function copyDirWithProgress(srcDir, target, emit) {
  const { entries, totalBytes } = await planCopy(srcDir);
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
  for (const e of entries) {
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
async function installFromLocalDir(pagesDir, srcDir, name, port, originUrl, onProgress) {
  if (!existsSync(srcDir) || !existsSync(join(srcDir, ".")))
    throw new Error(m("install.srcMissing", { dir: srcDir }));
  let dirName = (name || "").trim().replace(/[^\w.-]/g, "");
  if (!dirName) dirName = srcDir.split(/[\\/]/).filter(Boolean).pop() || "";
  if (!dirName) throw new Error(m("install.dirNameFail"));
  const target = join(pagesDir, dirName);
  if (existsSync(target)) throw new Error(m("dsh.pageExists", { id: dirName }));
  const emit = (p) => onProgress?.({ op: "dir", phase: "preparing", source: srcDir, target: dirName, ...p });
  emit({ phase: "preparing" });
  await copyDirWithProgress(srcDir, target, emit);
  emit({ phase: "validating" });
  applyPortOverride(dirName, port);
  seedContainerManifest(pagesDir, dirName, port);
  try {
    readPageMeta(pagesDir, dirName);
  } catch (err) {
    rmSync(target, { recursive: true, force: true });
    const { [dirName]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {};
    updateSettings({ pagePorts });
    throw err;
  }
  emit({ phase: "finalizing" });
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
  rmSync(target, { recursive: true, force: true });
  const { [id2]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {};
  updateSettings({ pagePorts });
}
var src = { exports: {} };
var browser = { exports: {} };
var ms;
var hasRequiredMs;
function requireMs() {
  if (hasRequiredMs) return ms;
  hasRequiredMs = 1;
  var s = 1e3;
  var m2 = s * 60;
  var h = m2 * 60;
  var d = h * 24;
  var w = d * 7;
  var y = d * 365.25;
  ms = function(val, options) {
    options = options || {};
    var type2 = typeof val;
    if (type2 === "string" && val.length > 0) {
      return parse(val);
    } else if (type2 === "number" && isFinite(val)) {
      return options.long ? fmtLong(val) : fmtShort(val);
    }
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
    );
  };
  function parse(str) {
    str = String(str);
    if (str.length > 100) {
      return;
    }
    var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
      str
    );
    if (!match) {
      return;
    }
    var n = parseFloat(match[1]);
    var type2 = (match[2] || "ms").toLowerCase();
    switch (type2) {
      case "years":
      case "year":
      case "yrs":
      case "yr":
      case "y":
        return n * y;
      case "weeks":
      case "week":
      case "w":
        return n * w;
      case "days":
      case "day":
      case "d":
        return n * d;
      case "hours":
      case "hour":
      case "hrs":
      case "hr":
      case "h":
        return n * h;
      case "minutes":
      case "minute":
      case "mins":
      case "min":
      case "m":
        return n * m2;
      case "seconds":
      case "second":
      case "secs":
      case "sec":
      case "s":
        return n * s;
      case "milliseconds":
      case "millisecond":
      case "msecs":
      case "msec":
      case "ms":
        return n;
      default:
        return void 0;
    }
  }
  function fmtShort(ms2) {
    var msAbs = Math.abs(ms2);
    if (msAbs >= d) {
      return Math.round(ms2 / d) + "d";
    }
    if (msAbs >= h) {
      return Math.round(ms2 / h) + "h";
    }
    if (msAbs >= m2) {
      return Math.round(ms2 / m2) + "m";
    }
    if (msAbs >= s) {
      return Math.round(ms2 / s) + "s";
    }
    return ms2 + "ms";
  }
  function fmtLong(ms2) {
    var msAbs = Math.abs(ms2);
    if (msAbs >= d) {
      return plural(ms2, msAbs, d, "day");
    }
    if (msAbs >= h) {
      return plural(ms2, msAbs, h, "hour");
    }
    if (msAbs >= m2) {
      return plural(ms2, msAbs, m2, "minute");
    }
    if (msAbs >= s) {
      return plural(ms2, msAbs, s, "second");
    }
    return ms2 + " ms";
  }
  function plural(ms2, msAbs, n, name) {
    var isPlural = msAbs >= n * 1.5;
    return Math.round(ms2 / n) + " " + name + (isPlural ? "s" : "");
  }
  return ms;
}
var common;
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
  function setup(env2) {
    createDebug.debug = createDebug;
    createDebug.default = createDebug;
    createDebug.coerce = coerce;
    createDebug.disable = disable;
    createDebug.enable = enable;
    createDebug.enabled = enabled;
    createDebug.humanize = requireMs();
    createDebug.destroy = destroy;
    Object.keys(env2).forEach((key) => {
      createDebug[key] = env2[key];
    });
    createDebug.names = [];
    createDebug.skips = [];
    createDebug.formatters = {};
    function selectColor(namespace) {
      let hash = 0;
      for (let i = 0; i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    }
    createDebug.selectColor = selectColor;
    function createDebug(namespace) {
      let prevTime;
      let enableOverride = null;
      let namespacesCache;
      let enabledCache;
      function debug(...args) {
        if (!debug.enabled) {
          return;
        }
        const self2 = debug;
        const curr = Number(/* @__PURE__ */ new Date());
        const ms2 = curr - (prevTime || curr);
        self2.diff = ms2;
        self2.prev = prevTime;
        self2.curr = curr;
        prevTime = curr;
        args[0] = createDebug.coerce(args[0]);
        if (typeof args[0] !== "string") {
          args.unshift("%O");
        }
        let index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format2) => {
          if (match === "%%") {
            return "%";
          }
          index++;
          const formatter = createDebug.formatters[format2];
          if (typeof formatter === "function") {
            const val = args[index];
            match = formatter.call(self2, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        createDebug.formatArgs.call(self2, args);
        const logFn = self2.log || createDebug.log;
        logFn.apply(self2, args);
      }
      debug.namespace = namespace;
      debug.useColors = createDebug.useColors();
      debug.color = createDebug.selectColor(namespace);
      debug.extend = extend;
      debug.destroy = createDebug.destroy;
      Object.defineProperty(debug, "enabled", {
        enumerable: true,
        configurable: false,
        get: () => {
          if (enableOverride !== null) {
            return enableOverride;
          }
          if (namespacesCache !== createDebug.namespaces) {
            namespacesCache = createDebug.namespaces;
            enabledCache = createDebug.enabled(namespace);
          }
          return enabledCache;
        },
        set: (v) => {
          enableOverride = v;
        }
      });
      if (typeof createDebug.init === "function") {
        createDebug.init(debug);
      }
      return debug;
    }
    function extend(namespace, delimiter2) {
      const newDebug = createDebug(this.namespace + (typeof delimiter2 === "undefined" ? ":" : delimiter2) + namespace);
      newDebug.log = this.log;
      return newDebug;
    }
    function enable(namespaces) {
      createDebug.save(namespaces);
      createDebug.namespaces = namespaces;
      createDebug.names = [];
      createDebug.skips = [];
      const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const ns of split) {
        if (ns[0] === "-") {
          createDebug.skips.push(ns.slice(1));
        } else {
          createDebug.names.push(ns);
        }
      }
    }
    function matchesTemplate(search, template) {
      let searchIndex = 0;
      let templateIndex = 0;
      let starIndex = -1;
      let matchIndex = 0;
      while (searchIndex < search.length) {
        if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
          if (template[templateIndex] === "*") {
            starIndex = templateIndex;
            matchIndex = searchIndex;
            templateIndex++;
          } else {
            searchIndex++;
            templateIndex++;
          }
        } else if (starIndex !== -1) {
          templateIndex = starIndex + 1;
          matchIndex++;
          searchIndex = matchIndex;
        } else {
          return false;
        }
      }
      while (templateIndex < template.length && template[templateIndex] === "*") {
        templateIndex++;
      }
      return templateIndex === template.length;
    }
    function disable() {
      const namespaces = [
        ...createDebug.names,
        ...createDebug.skips.map((namespace) => "-" + namespace)
      ].join(",");
      createDebug.enable("");
      return namespaces;
    }
    function enabled(name) {
      for (const skip of createDebug.skips) {
        if (matchesTemplate(name, skip)) {
          return false;
        }
      }
      for (const ns of createDebug.names) {
        if (matchesTemplate(name, ns)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) {
        return val.stack || val.message;
      }
      return val;
    }
    function destroy() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    createDebug.enable(createDebug.load());
    return createDebug;
  }
  common = setup;
  return common;
}
var hasRequiredBrowser;
function requireBrowser() {
  if (hasRequiredBrowser) return browser.exports;
  hasRequiredBrowser = 1;
  (function(module, exports) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m2;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m2 = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m2[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = requireCommon()(exports);
    const { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  })(browser, browser.exports);
  return browser.exports;
}
var node = { exports: {} };
var hasFlag;
var hasRequiredHasFlag;
function requireHasFlag() {
  if (hasRequiredHasFlag) return hasFlag;
  hasRequiredHasFlag = 1;
  hasFlag = (flag, argv = process.argv) => {
    const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
    const position = argv.indexOf(prefix + flag);
    const terminatorPosition = argv.indexOf("--");
    return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
  };
  return hasFlag;
}
var supportsColor_1;
var hasRequiredSupportsColor;
function requireSupportsColor() {
  if (hasRequiredSupportsColor) return supportsColor_1;
  hasRequiredSupportsColor = 1;
  const os2 = require$$0$1;
  const tty = require$$1$1;
  const hasFlag2 = requireHasFlag();
  const { env: env2 } = process;
  let forceColor;
  if (hasFlag2("no-color") || hasFlag2("no-colors") || hasFlag2("color=false") || hasFlag2("color=never")) {
    forceColor = 0;
  } else if (hasFlag2("color") || hasFlag2("colors") || hasFlag2("color=true") || hasFlag2("color=always")) {
    forceColor = 1;
  }
  if ("FORCE_COLOR" in env2) {
    if (env2.FORCE_COLOR === "true") {
      forceColor = 1;
    } else if (env2.FORCE_COLOR === "false") {
      forceColor = 0;
    } else {
      forceColor = env2.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env2.FORCE_COLOR, 10), 3);
    }
  }
  function translateLevel(level) {
    if (level === 0) {
      return false;
    }
    return {
      level,
      hasBasic: true,
      has256: level >= 2,
      has16m: level >= 3
    };
  }
  function supportsColor(haveStream, streamIsTTY) {
    if (forceColor === 0) {
      return 0;
    }
    if (hasFlag2("color=16m") || hasFlag2("color=full") || hasFlag2("color=truecolor")) {
      return 3;
    }
    if (hasFlag2("color=256")) {
      return 2;
    }
    if (haveStream && !streamIsTTY && forceColor === void 0) {
      return 0;
    }
    const min = forceColor || 0;
    if (env2.TERM === "dumb") {
      return min;
    }
    if (process.platform === "win32") {
      const osRelease = os2.release().split(".");
      if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
        return Number(osRelease[2]) >= 14931 ? 3 : 2;
      }
      return 1;
    }
    if ("CI" in env2) {
      if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env2) || env2.CI_NAME === "codeship") {
        return 1;
      }
      return min;
    }
    if ("TEAMCITY_VERSION" in env2) {
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env2.TEAMCITY_VERSION) ? 1 : 0;
    }
    if (env2.COLORTERM === "truecolor") {
      return 3;
    }
    if ("TERM_PROGRAM" in env2) {
      const version = parseInt((env2.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (env2.TERM_PROGRAM) {
        case "iTerm.app":
          return version >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    if (/-256(color)?$/i.test(env2.TERM)) {
      return 2;
    }
    if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env2.TERM)) {
      return 1;
    }
    if ("COLORTERM" in env2) {
      return 1;
    }
    return min;
  }
  function getSupportLevel(stream) {
    const level = supportsColor(stream, stream && stream.isTTY);
    return translateLevel(level);
  }
  supportsColor_1 = {
    supportsColor: getSupportLevel,
    stdout: translateLevel(supportsColor(true, tty.isatty(1))),
    stderr: translateLevel(supportsColor(true, tty.isatty(2)))
  };
  return supportsColor_1;
}
var hasRequiredNode;
function requireNode() {
  if (hasRequiredNode) return node.exports;
  hasRequiredNode = 1;
  (function(module, exports) {
    const tty = require$$1$1;
    const util2 = require$$1$2;
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util2.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = requireSupportsColor();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util2.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = requireCommon()(exports);
    const { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts);
    };
  })(node, node.exports);
  return node.exports;
}
var hasRequiredSrc;
function requireSrc() {
  if (hasRequiredSrc) return src.exports;
  hasRequiredSrc = 1;
  if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
    src.exports = requireBrowser();
  } else {
    src.exports = requireNode();
  }
  return src.exports;
}
var getStream = { exports: {} };
var once = { exports: {} };
var wrappy_1;
var hasRequiredWrappy;
function requireWrappy() {
  if (hasRequiredWrappy) return wrappy_1;
  hasRequiredWrappy = 1;
  wrappy_1 = wrappy;
  function wrappy(fn, cb) {
    if (fn && cb) return wrappy(fn)(cb);
    if (typeof fn !== "function")
      throw new TypeError("need wrapper function");
    Object.keys(fn).forEach(function(k) {
      wrapper[k] = fn[k];
    });
    return wrapper;
    function wrapper() {
      var args = new Array(arguments.length);
      for (var i = 0; i < args.length; i++) {
        args[i] = arguments[i];
      }
      var ret = fn.apply(this, args);
      var cb2 = args[args.length - 1];
      if (typeof ret === "function" && ret !== cb2) {
        Object.keys(cb2).forEach(function(k) {
          ret[k] = cb2[k];
        });
      }
      return ret;
    }
  }
  return wrappy_1;
}
var hasRequiredOnce;
function requireOnce() {
  if (hasRequiredOnce) return once.exports;
  hasRequiredOnce = 1;
  var wrappy = requireWrappy();
  once.exports = wrappy(once$1);
  once.exports.strict = wrappy(onceStrict);
  once$1.proto = once$1(function() {
    Object.defineProperty(Function.prototype, "once", {
      value: function() {
        return once$1(this);
      },
      configurable: true
    });
    Object.defineProperty(Function.prototype, "onceStrict", {
      value: function() {
        return onceStrict(this);
      },
      configurable: true
    });
  });
  function once$1(fn) {
    var f = function() {
      if (f.called) return f.value;
      f.called = true;
      return f.value = fn.apply(this, arguments);
    };
    f.called = false;
    return f;
  }
  function onceStrict(fn) {
    var f = function() {
      if (f.called)
        throw new Error(f.onceError);
      f.called = true;
      return f.value = fn.apply(this, arguments);
    };
    var name = fn.name || "Function wrapped with `once`";
    f.onceError = name + " shouldn't be called more than once";
    f.called = false;
    return f;
  }
  return once.exports;
}
var endOfStream;
var hasRequiredEndOfStream;
function requireEndOfStream() {
  if (hasRequiredEndOfStream) return endOfStream;
  hasRequiredEndOfStream = 1;
  var once2 = requireOnce();
  var noop = function() {
  };
  var qnt = commonjsGlobal.Bare ? queueMicrotask : process.nextTick.bind(process);
  var isRequest = function(stream) {
    return stream.setHeader && typeof stream.abort === "function";
  };
  var isChildProcess = function(stream) {
    return stream.stdio && Array.isArray(stream.stdio) && stream.stdio.length === 3;
  };
  var eos = function(stream, opts, callback) {
    if (typeof opts === "function") return eos(stream, null, opts);
    if (!opts) opts = {};
    callback = once2(callback || noop);
    var ws = stream._writableState;
    var rs = stream._readableState;
    var readable = opts.readable || opts.readable !== false && stream.readable;
    var writable = opts.writable || opts.writable !== false && stream.writable;
    var cancelled = false;
    var onlegacyfinish = function() {
      if (!stream.writable) onfinish();
    };
    var onfinish = function() {
      writable = false;
      if (!readable) callback.call(stream);
    };
    var onend = function() {
      readable = false;
      if (!writable) callback.call(stream);
    };
    var onexit = function(exitCode) {
      callback.call(stream, exitCode ? new Error("exited with error code: " + exitCode) : null);
    };
    var onerror = function(err) {
      callback.call(stream, err);
    };
    var onclose = function() {
      qnt(onclosenexttick);
    };
    var onclosenexttick = function() {
      if (cancelled) return;
      if (readable && !(rs && (rs.ended && !rs.destroyed))) return callback.call(stream, new Error("premature close"));
      if (writable && !(ws && (ws.ended && !ws.destroyed))) return callback.call(stream, new Error("premature close"));
    };
    var onrequest = function() {
      stream.req.on("finish", onfinish);
    };
    if (isRequest(stream)) {
      stream.on("complete", onfinish);
      stream.on("abort", onclose);
      if (stream.req) onrequest();
      else stream.on("request", onrequest);
    } else if (writable && !ws) {
      stream.on("end", onlegacyfinish);
      stream.on("close", onlegacyfinish);
    }
    if (isChildProcess(stream)) stream.on("exit", onexit);
    stream.on("end", onend);
    stream.on("finish", onfinish);
    if (opts.error !== false) stream.on("error", onerror);
    stream.on("close", onclose);
    return function() {
      cancelled = true;
      stream.removeListener("complete", onfinish);
      stream.removeListener("abort", onclose);
      stream.removeListener("request", onrequest);
      if (stream.req) stream.req.removeListener("finish", onfinish);
      stream.removeListener("end", onlegacyfinish);
      stream.removeListener("close", onlegacyfinish);
      stream.removeListener("finish", onfinish);
      stream.removeListener("exit", onexit);
      stream.removeListener("end", onend);
      stream.removeListener("error", onerror);
      stream.removeListener("close", onclose);
    };
  };
  endOfStream = eos;
  return endOfStream;
}
var pump_1;
var hasRequiredPump;
function requirePump() {
  if (hasRequiredPump) return pump_1;
  hasRequiredPump = 1;
  var once2 = requireOnce();
  var eos = requireEndOfStream();
  var fs2;
  try {
    fs2 = require2("fs");
  } catch (e) {
  }
  var noop = function() {
  };
  var ancient = typeof process === "undefined" ? false : /^v?\.0/.test(process.version);
  var isFn = function(fn) {
    return typeof fn === "function";
  };
  var isFS = function(stream) {
    if (!ancient) return false;
    if (!fs2) return false;
    return (stream instanceof (fs2.ReadStream || noop) || stream instanceof (fs2.WriteStream || noop)) && isFn(stream.close);
  };
  var isRequest = function(stream) {
    return stream.setHeader && isFn(stream.abort);
  };
  var destroyer = function(stream, reading, writing, callback) {
    callback = once2(callback);
    var closed = false;
    stream.on("close", function() {
      closed = true;
    });
    eos(stream, { readable: reading, writable: writing }, function(err) {
      if (err) return callback(err);
      closed = true;
      callback();
    });
    var destroyed = false;
    return function(err) {
      if (closed) return;
      if (destroyed) return;
      destroyed = true;
      if (isFS(stream)) return stream.close(noop);
      if (isRequest(stream)) return stream.abort();
      if (isFn(stream.destroy)) return stream.destroy();
      callback(err || new Error("stream was destroyed"));
    };
  };
  var call = function(fn) {
    fn();
  };
  var pipe = function(from, to) {
    return from.pipe(to);
  };
  var pump = function() {
    var streams = Array.prototype.slice.call(arguments);
    var callback = isFn(streams[streams.length - 1] || noop) && streams.pop() || noop;
    if (Array.isArray(streams[0])) streams = streams[0];
    if (streams.length < 2) throw new Error("pump requires two streams per minimum");
    var error;
    var destroys = streams.map(function(stream, i) {
      var reading = i < streams.length - 1;
      var writing = i > 0;
      return destroyer(stream, reading, writing, function(err) {
        if (!error) error = err;
        if (err) destroys.forEach(call);
        if (reading) return;
        destroys.forEach(call);
        callback(error);
      });
    });
    return streams.reduce(pipe);
  };
  pump_1 = pump;
  return pump_1;
}
var bufferStream;
var hasRequiredBufferStream;
function requireBufferStream() {
  if (hasRequiredBufferStream) return bufferStream;
  hasRequiredBufferStream = 1;
  const { PassThrough: PassThroughStream } = require$$6$1;
  bufferStream = (options) => {
    options = { ...options };
    const { array } = options;
    let { encoding } = options;
    const isBuffer = encoding === "buffer";
    let objectMode = false;
    if (array) {
      objectMode = !(encoding || isBuffer);
    } else {
      encoding = encoding || "utf8";
    }
    if (isBuffer) {
      encoding = null;
    }
    const stream = new PassThroughStream({ objectMode });
    if (encoding) {
      stream.setEncoding(encoding);
    }
    let length = 0;
    const chunks = [];
    stream.on("data", (chunk) => {
      chunks.push(chunk);
      if (objectMode) {
        length = chunks.length;
      } else {
        length += chunk.length;
      }
    });
    stream.getBufferedValue = () => {
      if (array) {
        return chunks;
      }
      return isBuffer ? Buffer.concat(chunks, length) : chunks.join("");
    };
    stream.getBufferedLength = () => length;
    return stream;
  };
  return bufferStream;
}
var hasRequiredGetStream;
function requireGetStream() {
  if (hasRequiredGetStream) return getStream.exports;
  hasRequiredGetStream = 1;
  const { constants: BufferConstants } = require$$0$2;
  const pump = requirePump();
  const bufferStream2 = requireBufferStream();
  class MaxBufferError extends Error {
    constructor() {
      super("maxBuffer exceeded");
      this.name = "MaxBufferError";
    }
  }
  async function getStream$1(inputStream, options) {
    if (!inputStream) {
      return Promise.reject(new Error("Expected a stream"));
    }
    options = {
      maxBuffer: Infinity,
      ...options
    };
    const { maxBuffer } = options;
    let stream;
    await new Promise((resolve2, reject) => {
      const rejectPromise = (error) => {
        if (error && stream.getBufferedLength() <= BufferConstants.MAX_LENGTH) {
          error.bufferedData = stream.getBufferedValue();
        }
        reject(error);
      };
      stream = pump(inputStream, bufferStream2(options), (error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolve2();
      });
      stream.on("data", () => {
        if (stream.getBufferedLength() > maxBuffer) {
          rejectPromise(new MaxBufferError());
        }
      });
    });
    return stream.getBufferedValue();
  }
  getStream.exports = getStream$1;
  getStream.exports.default = getStream$1;
  getStream.exports.buffer = (stream, options) => getStream$1(stream, { ...options, encoding: "buffer" });
  getStream.exports.array = (stream, options) => getStream$1(stream, { ...options, array: true });
  getStream.exports.MaxBufferError = MaxBufferError;
  return getStream.exports;
}
var yauzl = {};
var fdSlicer = {};
var pend;
var hasRequiredPend;
function requirePend() {
  if (hasRequiredPend) return pend;
  hasRequiredPend = 1;
  pend = Pend;
  function Pend() {
    this.pending = 0;
    this.max = Infinity;
    this.listeners = [];
    this.waiting = [];
    this.error = null;
  }
  Pend.prototype.go = function(fn) {
    if (this.pending < this.max) {
      pendGo(this, fn);
    } else {
      this.waiting.push(fn);
    }
  };
  Pend.prototype.wait = function(cb) {
    if (this.pending === 0) {
      cb(this.error);
    } else {
      this.listeners.push(cb);
    }
  };
  Pend.prototype.hold = function() {
    return pendHold(this);
  };
  function pendHold(self2) {
    self2.pending += 1;
    var called = false;
    return onCb;
    function onCb(err) {
      if (called) throw new Error("callback called twice");
      called = true;
      self2.error = self2.error || err;
      self2.pending -= 1;
      if (self2.waiting.length > 0 && self2.pending < self2.max) {
        pendGo(self2, self2.waiting.shift());
      } else if (self2.pending === 0) {
        var listeners = self2.listeners;
        self2.listeners = [];
        listeners.forEach(cbListener);
      }
    }
    function cbListener(listener) {
      listener(self2.error);
    }
  }
  function pendGo(self2, fn) {
    fn(pendHold(self2));
  }
  return pend;
}
var hasRequiredFdSlicer;
function requireFdSlicer() {
  if (hasRequiredFdSlicer) return fdSlicer;
  hasRequiredFdSlicer = 1;
  var fs2 = require$$0$3;
  var util2 = require$$1$2;
  var stream = require$$6$1;
  var Readable = stream.Readable;
  var Writable = stream.Writable;
  var PassThrough = stream.PassThrough;
  var Pend = requirePend();
  var EventEmitter2 = require$$4$1.EventEmitter;
  fdSlicer.createFromBuffer = createFromBuffer;
  fdSlicer.createFromFd = createFromFd;
  fdSlicer.BufferSlicer = BufferSlicer;
  fdSlicer.FdSlicer = FdSlicer;
  util2.inherits(FdSlicer, EventEmitter2);
  function FdSlicer(fd, options) {
    options = options || {};
    EventEmitter2.call(this);
    this.fd = fd;
    this.pend = new Pend();
    this.pend.max = 1;
    this.refCount = 0;
    this.autoClose = !!options.autoClose;
  }
  FdSlicer.prototype.read = function(buffer, offset, length, position, callback) {
    var self2 = this;
    self2.pend.go(function(cb) {
      fs2.read(self2.fd, buffer, offset, length, position, function(err, bytesRead, buffer2) {
        cb();
        callback(err, bytesRead, buffer2);
      });
    });
  };
  FdSlicer.prototype.write = function(buffer, offset, length, position, callback) {
    var self2 = this;
    self2.pend.go(function(cb) {
      fs2.write(self2.fd, buffer, offset, length, position, function(err, written, buffer2) {
        cb();
        callback(err, written, buffer2);
      });
    });
  };
  FdSlicer.prototype.createReadStream = function(options) {
    return new ReadStream(this, options);
  };
  FdSlicer.prototype.createWriteStream = function(options) {
    return new WriteStream(this, options);
  };
  FdSlicer.prototype.ref = function() {
    this.refCount += 1;
  };
  FdSlicer.prototype.unref = function() {
    var self2 = this;
    self2.refCount -= 1;
    if (self2.refCount > 0) return;
    if (self2.refCount < 0) throw new Error("invalid unref");
    if (self2.autoClose) {
      fs2.close(self2.fd, onCloseDone);
    }
    function onCloseDone(err) {
      if (err) {
        self2.emit("error", err);
      } else {
        self2.emit("close");
      }
    }
  };
  util2.inherits(ReadStream, Readable);
  function ReadStream(context, options) {
    options = options || {};
    Readable.call(this, options);
    this.context = context;
    this.context.ref();
    this.start = options.start || 0;
    this.endOffset = options.end;
    this.pos = this.start;
    this.destroyed = false;
  }
  ReadStream.prototype._read = function(n) {
    var self2 = this;
    if (self2.destroyed) return;
    var toRead = Math.min(self2._readableState.highWaterMark, n);
    if (self2.endOffset != null) {
      toRead = Math.min(toRead, self2.endOffset - self2.pos);
    }
    if (toRead <= 0) {
      self2.destroyed = true;
      self2.push(null);
      self2.context.unref();
      return;
    }
    self2.context.pend.go(function(cb) {
      if (self2.destroyed) return cb();
      var buffer = new Buffer(toRead);
      fs2.read(self2.context.fd, buffer, 0, toRead, self2.pos, function(err, bytesRead) {
        if (err) {
          self2.destroy(err);
        } else if (bytesRead === 0) {
          self2.destroyed = true;
          self2.push(null);
          self2.context.unref();
        } else {
          self2.pos += bytesRead;
          self2.push(buffer.slice(0, bytesRead));
        }
        cb();
      });
    });
  };
  ReadStream.prototype.destroy = function(err) {
    if (this.destroyed) return;
    err = err || new Error("stream destroyed");
    this.destroyed = true;
    this.emit("error", err);
    this.context.unref();
  };
  util2.inherits(WriteStream, Writable);
  function WriteStream(context, options) {
    options = options || {};
    Writable.call(this, options);
    this.context = context;
    this.context.ref();
    this.start = options.start || 0;
    this.endOffset = options.end == null ? Infinity : +options.end;
    this.bytesWritten = 0;
    this.pos = this.start;
    this.destroyed = false;
    this.on("finish", this.destroy.bind(this));
  }
  WriteStream.prototype._write = function(buffer, encoding, callback) {
    var self2 = this;
    if (self2.destroyed) return;
    if (self2.pos + buffer.length > self2.endOffset) {
      var err = new Error("maximum file length exceeded");
      err.code = "ETOOBIG";
      self2.destroy();
      callback(err);
      return;
    }
    self2.context.pend.go(function(cb) {
      if (self2.destroyed) return cb();
      fs2.write(self2.context.fd, buffer, 0, buffer.length, self2.pos, function(err2, bytes) {
        if (err2) {
          self2.destroy();
          cb();
          callback(err2);
        } else {
          self2.bytesWritten += bytes;
          self2.pos += bytes;
          self2.emit("progress");
          cb();
          callback();
        }
      });
    });
  };
  WriteStream.prototype.destroy = function() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.context.unref();
  };
  util2.inherits(BufferSlicer, EventEmitter2);
  function BufferSlicer(buffer, options) {
    EventEmitter2.call(this);
    options = options || {};
    this.refCount = 0;
    this.buffer = buffer;
    this.maxChunkSize = options.maxChunkSize || Number.MAX_SAFE_INTEGER;
  }
  BufferSlicer.prototype.read = function(buffer, offset, length, position, callback) {
    var end = position + length;
    var delta = end - this.buffer.length;
    var written = delta > 0 ? delta : length;
    this.buffer.copy(buffer, offset, position, end);
    setImmediate(function() {
      callback(null, written);
    });
  };
  BufferSlicer.prototype.write = function(buffer, offset, length, position, callback) {
    buffer.copy(this.buffer, position, offset, offset + length);
    setImmediate(function() {
      callback(null, length, buffer);
    });
  };
  BufferSlicer.prototype.createReadStream = function(options) {
    options = options || {};
    var readStream = new PassThrough(options);
    readStream.destroyed = false;
    readStream.start = options.start || 0;
    readStream.endOffset = options.end;
    readStream.pos = readStream.endOffset || this.buffer.length;
    var entireSlice = this.buffer.slice(readStream.start, readStream.pos);
    var offset = 0;
    while (true) {
      var nextOffset = offset + this.maxChunkSize;
      if (nextOffset >= entireSlice.length) {
        if (offset < entireSlice.length) {
          readStream.write(entireSlice.slice(offset, entireSlice.length));
        }
        break;
      }
      readStream.write(entireSlice.slice(offset, nextOffset));
      offset = nextOffset;
    }
    readStream.end();
    readStream.destroy = function() {
      readStream.destroyed = true;
    };
    return readStream;
  };
  BufferSlicer.prototype.createWriteStream = function(options) {
    var bufferSlicer = this;
    options = options || {};
    var writeStream = new Writable(options);
    writeStream.start = options.start || 0;
    writeStream.endOffset = options.end == null ? this.buffer.length : +options.end;
    writeStream.bytesWritten = 0;
    writeStream.pos = writeStream.start;
    writeStream.destroyed = false;
    writeStream._write = function(buffer, encoding, callback) {
      if (writeStream.destroyed) return;
      var end = writeStream.pos + buffer.length;
      if (end > writeStream.endOffset) {
        var err = new Error("maximum file length exceeded");
        err.code = "ETOOBIG";
        writeStream.destroyed = true;
        callback(err);
        return;
      }
      buffer.copy(bufferSlicer.buffer, writeStream.pos, 0, buffer.length);
      writeStream.bytesWritten += buffer.length;
      writeStream.pos = end;
      writeStream.emit("progress");
      callback();
    };
    writeStream.destroy = function() {
      writeStream.destroyed = true;
    };
    return writeStream;
  };
  BufferSlicer.prototype.ref = function() {
    this.refCount += 1;
  };
  BufferSlicer.prototype.unref = function() {
    this.refCount -= 1;
    if (this.refCount < 0) {
      throw new Error("invalid unref");
    }
  };
  function createFromBuffer(buffer, options) {
    return new BufferSlicer(buffer, options);
  }
  function createFromFd(fd, options) {
    return new FdSlicer(fd, options);
  }
  return fdSlicer;
}
var bufferCrc32;
var hasRequiredBufferCrc32;
function requireBufferCrc32() {
  if (hasRequiredBufferCrc32) return bufferCrc32;
  hasRequiredBufferCrc32 = 1;
  var Buffer2 = require$$0$2.Buffer;
  var CRC_TABLE = [
    0,
    1996959894,
    3993919788,
    2567524794,
    124634137,
    1886057615,
    3915621685,
    2657392035,
    249268274,
    2044508324,
    3772115230,
    2547177864,
    162941995,
    2125561021,
    3887607047,
    2428444049,
    498536548,
    1789927666,
    4089016648,
    2227061214,
    450548861,
    1843258603,
    4107580753,
    2211677639,
    325883990,
    1684777152,
    4251122042,
    2321926636,
    335633487,
    1661365465,
    4195302755,
    2366115317,
    997073096,
    1281953886,
    3579855332,
    2724688242,
    1006888145,
    1258607687,
    3524101629,
    2768942443,
    901097722,
    1119000684,
    3686517206,
    2898065728,
    853044451,
    1172266101,
    3705015759,
    2882616665,
    651767980,
    1373503546,
    3369554304,
    3218104598,
    565507253,
    1454621731,
    3485111705,
    3099436303,
    671266974,
    1594198024,
    3322730930,
    2970347812,
    795835527,
    1483230225,
    3244367275,
    3060149565,
    1994146192,
    31158534,
    2563907772,
    4023717930,
    1907459465,
    112637215,
    2680153253,
    3904427059,
    2013776290,
    251722036,
    2517215374,
    3775830040,
    2137656763,
    141376813,
    2439277719,
    3865271297,
    1802195444,
    476864866,
    2238001368,
    4066508878,
    1812370925,
    453092731,
    2181625025,
    4111451223,
    1706088902,
    314042704,
    2344532202,
    4240017532,
    1658658271,
    366619977,
    2362670323,
    4224994405,
    1303535960,
    984961486,
    2747007092,
    3569037538,
    1256170817,
    1037604311,
    2765210733,
    3554079995,
    1131014506,
    879679996,
    2909243462,
    3663771856,
    1141124467,
    855842277,
    2852801631,
    3708648649,
    1342533948,
    654459306,
    3188396048,
    3373015174,
    1466479909,
    544179635,
    3110523913,
    3462522015,
    1591671054,
    702138776,
    2966460450,
    3352799412,
    1504918807,
    783551873,
    3082640443,
    3233442989,
    3988292384,
    2596254646,
    62317068,
    1957810842,
    3939845945,
    2647816111,
    81470997,
    1943803523,
    3814918930,
    2489596804,
    225274430,
    2053790376,
    3826175755,
    2466906013,
    167816743,
    2097651377,
    4027552580,
    2265490386,
    503444072,
    1762050814,
    4150417245,
    2154129355,
    426522225,
    1852507879,
    4275313526,
    2312317920,
    282753626,
    1742555852,
    4189708143,
    2394877945,
    397917763,
    1622183637,
    3604390888,
    2714866558,
    953729732,
    1340076626,
    3518719985,
    2797360999,
    1068828381,
    1219638859,
    3624741850,
    2936675148,
    906185462,
    1090812512,
    3747672003,
    2825379669,
    829329135,
    1181335161,
    3412177804,
    3160834842,
    628085408,
    1382605366,
    3423369109,
    3138078467,
    570562233,
    1426400815,
    3317316542,
    2998733608,
    733239954,
    1555261956,
    3268935591,
    3050360625,
    752459403,
    1541320221,
    2607071920,
    3965973030,
    1969922972,
    40735498,
    2617837225,
    3943577151,
    1913087877,
    83908371,
    2512341634,
    3803740692,
    2075208622,
    213261112,
    2463272603,
    3855990285,
    2094854071,
    198958881,
    2262029012,
    4057260610,
    1759359992,
    534414190,
    2176718541,
    4139329115,
    1873836001,
    414664567,
    2282248934,
    4279200368,
    1711684554,
    285281116,
    2405801727,
    4167216745,
    1634467795,
    376229701,
    2685067896,
    3608007406,
    1308918612,
    956543938,
    2808555105,
    3495958263,
    1231636301,
    1047427035,
    2932959818,
    3654703836,
    1088359270,
    936918e3,
    2847714899,
    3736837829,
    1202900863,
    817233897,
    3183342108,
    3401237130,
    1404277552,
    615818150,
    3134207493,
    3453421203,
    1423857449,
    601450431,
    3009837614,
    3294710456,
    1567103746,
    711928724,
    3020668471,
    3272380065,
    1510334235,
    755167117
  ];
  if (typeof Int32Array !== "undefined") {
    CRC_TABLE = new Int32Array(CRC_TABLE);
  }
  function ensureBuffer(input) {
    if (Buffer2.isBuffer(input)) {
      return input;
    }
    var hasNewBufferAPI = typeof Buffer2.alloc === "function" && typeof Buffer2.from === "function";
    if (typeof input === "number") {
      return hasNewBufferAPI ? Buffer2.alloc(input) : new Buffer2(input);
    } else if (typeof input === "string") {
      return hasNewBufferAPI ? Buffer2.from(input) : new Buffer2(input);
    } else {
      throw new Error("input must be buffer, number, or string, received " + typeof input);
    }
  }
  function bufferizeInt(num) {
    var tmp = ensureBuffer(4);
    tmp.writeInt32BE(num, 0);
    return tmp;
  }
  function _crc32(buf, previous) {
    buf = ensureBuffer(buf);
    if (Buffer2.isBuffer(previous)) {
      previous = previous.readUInt32BE(0);
    }
    var crc = ~~previous ^ -1;
    for (var n = 0; n < buf.length; n++) {
      crc = CRC_TABLE[(crc ^ buf[n]) & 255] ^ crc >>> 8;
    }
    return crc ^ -1;
  }
  function crc32() {
    return bufferizeInt(_crc32.apply(null, arguments));
  }
  crc32.signed = function() {
    return _crc32.apply(null, arguments);
  };
  crc32.unsigned = function() {
    return _crc32.apply(null, arguments) >>> 0;
  };
  bufferCrc32 = crc32;
  return bufferCrc32;
}
var hasRequiredYauzl;
function requireYauzl() {
  if (hasRequiredYauzl) return yauzl;
  hasRequiredYauzl = 1;
  var fs2 = require$$0$3;
  var zlib = require$$1$3;
  var fd_slicer = requireFdSlicer();
  var crc32 = requireBufferCrc32();
  var util2 = require$$1$2;
  var EventEmitter2 = require$$4$1.EventEmitter;
  var Transform2 = require$$6$1.Transform;
  var PassThrough = require$$6$1.PassThrough;
  var Writable = require$$6$1.Writable;
  yauzl.open = open;
  yauzl.fromFd = fromFd;
  yauzl.fromBuffer = fromBuffer;
  yauzl.fromRandomAccessReader = fromRandomAccessReader;
  yauzl.dosDateTimeToDate = dosDateTimeToDate;
  yauzl.validateFileName = validateFileName;
  yauzl.ZipFile = ZipFile;
  yauzl.Entry = Entry;
  yauzl.RandomAccessReader = RandomAccessReader;
  function open(path2, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = null;
    }
    if (options == null) options = {};
    if (options.autoClose == null) options.autoClose = true;
    if (options.lazyEntries == null) options.lazyEntries = false;
    if (options.decodeStrings == null) options.decodeStrings = true;
    if (options.validateEntrySizes == null) options.validateEntrySizes = true;
    if (options.strictFileNames == null) options.strictFileNames = false;
    if (callback == null) callback = defaultCallback;
    fs2.open(path2, "r", function(err, fd) {
      if (err) return callback(err);
      fromFd(fd, options, function(err2, zipfile) {
        if (err2) fs2.close(fd, defaultCallback);
        callback(err2, zipfile);
      });
    });
  }
  function fromFd(fd, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = null;
    }
    if (options == null) options = {};
    if (options.autoClose == null) options.autoClose = false;
    if (options.lazyEntries == null) options.lazyEntries = false;
    if (options.decodeStrings == null) options.decodeStrings = true;
    if (options.validateEntrySizes == null) options.validateEntrySizes = true;
    if (options.strictFileNames == null) options.strictFileNames = false;
    if (callback == null) callback = defaultCallback;
    fs2.fstat(fd, function(err, stats) {
      if (err) return callback(err);
      var reader = fd_slicer.createFromFd(fd, { autoClose: true });
      fromRandomAccessReader(reader, stats.size, options, callback);
    });
  }
  function fromBuffer(buffer, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = null;
    }
    if (options == null) options = {};
    options.autoClose = false;
    if (options.lazyEntries == null) options.lazyEntries = false;
    if (options.decodeStrings == null) options.decodeStrings = true;
    if (options.validateEntrySizes == null) options.validateEntrySizes = true;
    if (options.strictFileNames == null) options.strictFileNames = false;
    var reader = fd_slicer.createFromBuffer(buffer, { maxChunkSize: 65536 });
    fromRandomAccessReader(reader, buffer.length, options, callback);
  }
  function fromRandomAccessReader(reader, totalSize, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = null;
    }
    if (options == null) options = {};
    if (options.autoClose == null) options.autoClose = true;
    if (options.lazyEntries == null) options.lazyEntries = false;
    if (options.decodeStrings == null) options.decodeStrings = true;
    var decodeStrings = !!options.decodeStrings;
    if (options.validateEntrySizes == null) options.validateEntrySizes = true;
    if (options.strictFileNames == null) options.strictFileNames = false;
    if (callback == null) callback = defaultCallback;
    if (typeof totalSize !== "number") throw new Error("expected totalSize parameter to be a number");
    if (totalSize > Number.MAX_SAFE_INTEGER) {
      throw new Error("zip file too large. only file sizes up to 2^52 are supported due to JavaScript's Number type being an IEEE 754 double.");
    }
    reader.ref();
    var eocdrWithoutCommentSize = 22;
    var maxCommentSize = 65535;
    var bufferSize = Math.min(eocdrWithoutCommentSize + maxCommentSize, totalSize);
    var buffer = newBuffer(bufferSize);
    var bufferReadStart = totalSize - buffer.length;
    readAndAssertNoEof(reader, buffer, 0, bufferSize, bufferReadStart, function(err) {
      if (err) return callback(err);
      for (var i = bufferSize - eocdrWithoutCommentSize; i >= 0; i -= 1) {
        if (buffer.readUInt32LE(i) !== 101010256) continue;
        var eocdrBuffer = buffer.slice(i);
        var diskNumber = eocdrBuffer.readUInt16LE(4);
        if (diskNumber !== 0) {
          return callback(new Error("multi-disk zip files are not supported: found disk number: " + diskNumber));
        }
        var entryCount = eocdrBuffer.readUInt16LE(10);
        var centralDirectoryOffset = eocdrBuffer.readUInt32LE(16);
        var commentLength = eocdrBuffer.readUInt16LE(20);
        var expectedCommentLength = eocdrBuffer.length - eocdrWithoutCommentSize;
        if (commentLength !== expectedCommentLength) {
          return callback(new Error("invalid comment length. expected: " + expectedCommentLength + ". found: " + commentLength));
        }
        var comment = decodeStrings ? decodeBuffer(eocdrBuffer, 22, eocdrBuffer.length, false) : eocdrBuffer.slice(22);
        if (!(entryCount === 65535 || centralDirectoryOffset === 4294967295)) {
          return callback(null, new ZipFile(reader, centralDirectoryOffset, totalSize, entryCount, comment, options.autoClose, options.lazyEntries, decodeStrings, options.validateEntrySizes, options.strictFileNames));
        }
        var zip64EocdlBuffer = newBuffer(20);
        var zip64EocdlOffset = bufferReadStart + i - zip64EocdlBuffer.length;
        readAndAssertNoEof(reader, zip64EocdlBuffer, 0, zip64EocdlBuffer.length, zip64EocdlOffset, function(err2) {
          if (err2) return callback(err2);
          if (zip64EocdlBuffer.readUInt32LE(0) !== 117853008) {
            return callback(new Error("invalid zip64 end of central directory locator signature"));
          }
          var zip64EocdrOffset = readUInt64LE(zip64EocdlBuffer, 8);
          var zip64EocdrBuffer = newBuffer(56);
          readAndAssertNoEof(reader, zip64EocdrBuffer, 0, zip64EocdrBuffer.length, zip64EocdrOffset, function(err3) {
            if (err3) return callback(err3);
            if (zip64EocdrBuffer.readUInt32LE(0) !== 101075792) {
              return callback(new Error("invalid zip64 end of central directory record signature"));
            }
            entryCount = readUInt64LE(zip64EocdrBuffer, 32);
            centralDirectoryOffset = readUInt64LE(zip64EocdrBuffer, 48);
            return callback(null, new ZipFile(reader, centralDirectoryOffset, totalSize, entryCount, comment, options.autoClose, options.lazyEntries, decodeStrings, options.validateEntrySizes, options.strictFileNames));
          });
        });
        return;
      }
      callback(new Error("end of central directory record signature not found"));
    });
  }
  util2.inherits(ZipFile, EventEmitter2);
  function ZipFile(reader, centralDirectoryOffset, fileSize, entryCount, comment, autoClose, lazyEntries, decodeStrings, validateEntrySizes, strictFileNames) {
    var self2 = this;
    EventEmitter2.call(self2);
    self2.reader = reader;
    self2.reader.on("error", function(err) {
      emitError(self2, err);
    });
    self2.reader.once("close", function() {
      self2.emit("close");
    });
    self2.readEntryCursor = centralDirectoryOffset;
    self2.fileSize = fileSize;
    self2.entryCount = entryCount;
    self2.comment = comment;
    self2.entriesRead = 0;
    self2.autoClose = !!autoClose;
    self2.lazyEntries = !!lazyEntries;
    self2.decodeStrings = !!decodeStrings;
    self2.validateEntrySizes = !!validateEntrySizes;
    self2.strictFileNames = !!strictFileNames;
    self2.isOpen = true;
    self2.emittedError = false;
    if (!self2.lazyEntries) self2._readEntry();
  }
  ZipFile.prototype.close = function() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.reader.unref();
  };
  function emitErrorAndAutoClose(self2, err) {
    if (self2.autoClose) self2.close();
    emitError(self2, err);
  }
  function emitError(self2, err) {
    if (self2.emittedError) return;
    self2.emittedError = true;
    self2.emit("error", err);
  }
  ZipFile.prototype.readEntry = function() {
    if (!this.lazyEntries) throw new Error("readEntry() called without lazyEntries:true");
    this._readEntry();
  };
  ZipFile.prototype._readEntry = function() {
    var self2 = this;
    if (self2.entryCount === self2.entriesRead) {
      setImmediate(function() {
        if (self2.autoClose) self2.close();
        if (self2.emittedError) return;
        self2.emit("end");
      });
      return;
    }
    if (self2.emittedError) return;
    var buffer = newBuffer(46);
    readAndAssertNoEof(self2.reader, buffer, 0, buffer.length, self2.readEntryCursor, function(err) {
      if (err) return emitErrorAndAutoClose(self2, err);
      if (self2.emittedError) return;
      var entry = new Entry();
      var signature = buffer.readUInt32LE(0);
      if (signature !== 33639248) return emitErrorAndAutoClose(self2, new Error("invalid central directory file header signature: 0x" + signature.toString(16)));
      entry.versionMadeBy = buffer.readUInt16LE(4);
      entry.versionNeededToExtract = buffer.readUInt16LE(6);
      entry.generalPurposeBitFlag = buffer.readUInt16LE(8);
      entry.compressionMethod = buffer.readUInt16LE(10);
      entry.lastModFileTime = buffer.readUInt16LE(12);
      entry.lastModFileDate = buffer.readUInt16LE(14);
      entry.crc32 = buffer.readUInt32LE(16);
      entry.compressedSize = buffer.readUInt32LE(20);
      entry.uncompressedSize = buffer.readUInt32LE(24);
      entry.fileNameLength = buffer.readUInt16LE(28);
      entry.extraFieldLength = buffer.readUInt16LE(30);
      entry.fileCommentLength = buffer.readUInt16LE(32);
      entry.internalFileAttributes = buffer.readUInt16LE(36);
      entry.externalFileAttributes = buffer.readUInt32LE(38);
      entry.relativeOffsetOfLocalHeader = buffer.readUInt32LE(42);
      if (entry.generalPurposeBitFlag & 64) return emitErrorAndAutoClose(self2, new Error("strong encryption is not supported"));
      self2.readEntryCursor += 46;
      buffer = newBuffer(entry.fileNameLength + entry.extraFieldLength + entry.fileCommentLength);
      readAndAssertNoEof(self2.reader, buffer, 0, buffer.length, self2.readEntryCursor, function(err2) {
        if (err2) return emitErrorAndAutoClose(self2, err2);
        if (self2.emittedError) return;
        var isUtf8 = (entry.generalPurposeBitFlag & 2048) !== 0;
        entry.fileName = self2.decodeStrings ? decodeBuffer(buffer, 0, entry.fileNameLength, isUtf8) : buffer.slice(0, entry.fileNameLength);
        var fileCommentStart = entry.fileNameLength + entry.extraFieldLength;
        var extraFieldBuffer = buffer.slice(entry.fileNameLength, fileCommentStart);
        entry.extraFields = [];
        var i = 0;
        while (i < extraFieldBuffer.length - 3) {
          var headerId = extraFieldBuffer.readUInt16LE(i + 0);
          var dataSize = extraFieldBuffer.readUInt16LE(i + 2);
          var dataStart = i + 4;
          var dataEnd = dataStart + dataSize;
          if (dataEnd > extraFieldBuffer.length) return emitErrorAndAutoClose(self2, new Error("extra field length exceeds extra field buffer size"));
          var dataBuffer = newBuffer(dataSize);
          extraFieldBuffer.copy(dataBuffer, 0, dataStart, dataEnd);
          entry.extraFields.push({
            id: headerId,
            data: dataBuffer
          });
          i = dataEnd;
        }
        entry.fileComment = self2.decodeStrings ? decodeBuffer(buffer, fileCommentStart, fileCommentStart + entry.fileCommentLength, isUtf8) : buffer.slice(fileCommentStart, fileCommentStart + entry.fileCommentLength);
        entry.comment = entry.fileComment;
        self2.readEntryCursor += buffer.length;
        self2.entriesRead += 1;
        if (entry.uncompressedSize === 4294967295 || entry.compressedSize === 4294967295 || entry.relativeOffsetOfLocalHeader === 4294967295) {
          var zip64EiefBuffer = null;
          for (var i = 0; i < entry.extraFields.length; i++) {
            var extraField = entry.extraFields[i];
            if (extraField.id === 1) {
              zip64EiefBuffer = extraField.data;
              break;
            }
          }
          if (zip64EiefBuffer == null) {
            return emitErrorAndAutoClose(self2, new Error("expected zip64 extended information extra field"));
          }
          var index = 0;
          if (entry.uncompressedSize === 4294967295) {
            if (index + 8 > zip64EiefBuffer.length) {
              return emitErrorAndAutoClose(self2, new Error("zip64 extended information extra field does not include uncompressed size"));
            }
            entry.uncompressedSize = readUInt64LE(zip64EiefBuffer, index);
            index += 8;
          }
          if (entry.compressedSize === 4294967295) {
            if (index + 8 > zip64EiefBuffer.length) {
              return emitErrorAndAutoClose(self2, new Error("zip64 extended information extra field does not include compressed size"));
            }
            entry.compressedSize = readUInt64LE(zip64EiefBuffer, index);
            index += 8;
          }
          if (entry.relativeOffsetOfLocalHeader === 4294967295) {
            if (index + 8 > zip64EiefBuffer.length) {
              return emitErrorAndAutoClose(self2, new Error("zip64 extended information extra field does not include relative header offset"));
            }
            entry.relativeOffsetOfLocalHeader = readUInt64LE(zip64EiefBuffer, index);
            index += 8;
          }
        }
        if (self2.decodeStrings) {
          for (var i = 0; i < entry.extraFields.length; i++) {
            var extraField = entry.extraFields[i];
            if (extraField.id === 28789) {
              if (extraField.data.length < 6) {
                continue;
              }
              if (extraField.data.readUInt8(0) !== 1) {
                continue;
              }
              var oldNameCrc32 = extraField.data.readUInt32LE(1);
              if (crc32.unsigned(buffer.slice(0, entry.fileNameLength)) !== oldNameCrc32) {
                continue;
              }
              entry.fileName = decodeBuffer(extraField.data, 5, extraField.data.length, true);
              break;
            }
          }
        }
        if (self2.validateEntrySizes && entry.compressionMethod === 0) {
          var expectedCompressedSize = entry.uncompressedSize;
          if (entry.isEncrypted()) {
            expectedCompressedSize += 12;
          }
          if (entry.compressedSize !== expectedCompressedSize) {
            var msg = "compressed/uncompressed size mismatch for stored file: " + entry.compressedSize + " != " + entry.uncompressedSize;
            return emitErrorAndAutoClose(self2, new Error(msg));
          }
        }
        if (self2.decodeStrings) {
          if (!self2.strictFileNames) {
            entry.fileName = entry.fileName.replace(/\\/g, "/");
          }
          var errorMessage = validateFileName(entry.fileName, self2.validateFileNameOptions);
          if (errorMessage != null) return emitErrorAndAutoClose(self2, new Error(errorMessage));
        }
        self2.emit("entry", entry);
        if (!self2.lazyEntries) self2._readEntry();
      });
    });
  };
  ZipFile.prototype.openReadStream = function(entry, options, callback) {
    var self2 = this;
    var relativeStart = 0;
    var relativeEnd = entry.compressedSize;
    if (callback == null) {
      callback = options;
      options = {};
    } else {
      if (options.decrypt != null) {
        if (!entry.isEncrypted()) {
          throw new Error("options.decrypt can only be specified for encrypted entries");
        }
        if (options.decrypt !== false) throw new Error("invalid options.decrypt value: " + options.decrypt);
        if (entry.isCompressed()) {
          if (options.decompress !== false) throw new Error("entry is encrypted and compressed, and options.decompress !== false");
        }
      }
      if (options.decompress != null) {
        if (!entry.isCompressed()) {
          throw new Error("options.decompress can only be specified for compressed entries");
        }
        if (!(options.decompress === false || options.decompress === true)) {
          throw new Error("invalid options.decompress value: " + options.decompress);
        }
      }
      if (options.start != null || options.end != null) {
        if (entry.isCompressed() && options.decompress !== false) {
          throw new Error("start/end range not allowed for compressed entry without options.decompress === false");
        }
        if (entry.isEncrypted() && options.decrypt !== false) {
          throw new Error("start/end range not allowed for encrypted entry without options.decrypt === false");
        }
      }
      if (options.start != null) {
        relativeStart = options.start;
        if (relativeStart < 0) throw new Error("options.start < 0");
        if (relativeStart > entry.compressedSize) throw new Error("options.start > entry.compressedSize");
      }
      if (options.end != null) {
        relativeEnd = options.end;
        if (relativeEnd < 0) throw new Error("options.end < 0");
        if (relativeEnd > entry.compressedSize) throw new Error("options.end > entry.compressedSize");
        if (relativeEnd < relativeStart) throw new Error("options.end < options.start");
      }
    }
    if (!self2.isOpen) return callback(new Error("closed"));
    if (entry.isEncrypted()) {
      if (options.decrypt !== false) return callback(new Error("entry is encrypted, and options.decrypt !== false"));
    }
    self2.reader.ref();
    var buffer = newBuffer(30);
    readAndAssertNoEof(self2.reader, buffer, 0, buffer.length, entry.relativeOffsetOfLocalHeader, function(err) {
      try {
        if (err) return callback(err);
        var signature = buffer.readUInt32LE(0);
        if (signature !== 67324752) {
          return callback(new Error("invalid local file header signature: 0x" + signature.toString(16)));
        }
        var fileNameLength = buffer.readUInt16LE(26);
        var extraFieldLength = buffer.readUInt16LE(28);
        var localFileHeaderEnd = entry.relativeOffsetOfLocalHeader + buffer.length + fileNameLength + extraFieldLength;
        var decompress;
        if (entry.compressionMethod === 0) {
          decompress = false;
        } else if (entry.compressionMethod === 8) {
          decompress = options.decompress != null ? options.decompress : true;
        } else {
          return callback(new Error("unsupported compression method: " + entry.compressionMethod));
        }
        var fileDataStart = localFileHeaderEnd;
        var fileDataEnd = fileDataStart + entry.compressedSize;
        if (entry.compressedSize !== 0) {
          if (fileDataEnd > self2.fileSize) {
            return callback(new Error("file data overflows file bounds: " + fileDataStart + " + " + entry.compressedSize + " > " + self2.fileSize));
          }
        }
        var readStream = self2.reader.createReadStream({
          start: fileDataStart + relativeStart,
          end: fileDataStart + relativeEnd
        });
        var endpointStream = readStream;
        if (decompress) {
          var destroyed = false;
          var inflateFilter = zlib.createInflateRaw();
          readStream.on("error", function(err2) {
            setImmediate(function() {
              if (!destroyed) inflateFilter.emit("error", err2);
            });
          });
          readStream.pipe(inflateFilter);
          if (self2.validateEntrySizes) {
            endpointStream = new AssertByteCountStream(entry.uncompressedSize);
            inflateFilter.on("error", function(err2) {
              setImmediate(function() {
                if (!destroyed) endpointStream.emit("error", err2);
              });
            });
            inflateFilter.pipe(endpointStream);
          } else {
            endpointStream = inflateFilter;
          }
          endpointStream.destroy = function() {
            destroyed = true;
            if (inflateFilter !== endpointStream) inflateFilter.unpipe(endpointStream);
            readStream.unpipe(inflateFilter);
            readStream.destroy();
          };
        }
        callback(null, endpointStream);
      } finally {
        self2.reader.unref();
      }
    });
  };
  function Entry() {
  }
  Entry.prototype.getLastModDate = function() {
    return dosDateTimeToDate(this.lastModFileDate, this.lastModFileTime);
  };
  Entry.prototype.isEncrypted = function() {
    return (this.generalPurposeBitFlag & 1) !== 0;
  };
  Entry.prototype.isCompressed = function() {
    return this.compressionMethod === 8;
  };
  function dosDateTimeToDate(date, time) {
    var day = date & 31;
    var month = (date >> 5 & 15) - 1;
    var year = (date >> 9 & 127) + 1980;
    var millisecond = 0;
    var second = (time & 31) * 2;
    var minute = time >> 5 & 63;
    var hour = time >> 11 & 31;
    return new Date(year, month, day, hour, minute, second, millisecond);
  }
  function validateFileName(fileName) {
    if (fileName.indexOf("\\") !== -1) {
      return "invalid characters in fileName: " + fileName;
    }
    if (/^[a-zA-Z]:/.test(fileName) || /^\//.test(fileName)) {
      return "absolute path: " + fileName;
    }
    if (fileName.split("/").indexOf("..") !== -1) {
      return "invalid relative path: " + fileName;
    }
    return null;
  }
  function readAndAssertNoEof(reader, buffer, offset, length, position, callback) {
    if (length === 0) {
      return setImmediate(function() {
        callback(null, newBuffer(0));
      });
    }
    reader.read(buffer, offset, length, position, function(err, bytesRead) {
      if (err) return callback(err);
      if (bytesRead < length) {
        return callback(new Error("unexpected EOF"));
      }
      callback();
    });
  }
  util2.inherits(AssertByteCountStream, Transform2);
  function AssertByteCountStream(byteCount) {
    Transform2.call(this);
    this.actualByteCount = 0;
    this.expectedByteCount = byteCount;
  }
  AssertByteCountStream.prototype._transform = function(chunk, encoding, cb) {
    this.actualByteCount += chunk.length;
    if (this.actualByteCount > this.expectedByteCount) {
      var msg = "too many bytes in the stream. expected " + this.expectedByteCount + ". got at least " + this.actualByteCount;
      return cb(new Error(msg));
    }
    cb(null, chunk);
  };
  AssertByteCountStream.prototype._flush = function(cb) {
    if (this.actualByteCount < this.expectedByteCount) {
      var msg = "not enough bytes in the stream. expected " + this.expectedByteCount + ". got only " + this.actualByteCount;
      return cb(new Error(msg));
    }
    cb();
  };
  util2.inherits(RandomAccessReader, EventEmitter2);
  function RandomAccessReader() {
    EventEmitter2.call(this);
    this.refCount = 0;
  }
  RandomAccessReader.prototype.ref = function() {
    this.refCount += 1;
  };
  RandomAccessReader.prototype.unref = function() {
    var self2 = this;
    self2.refCount -= 1;
    if (self2.refCount > 0) return;
    if (self2.refCount < 0) throw new Error("invalid unref");
    self2.close(onCloseDone);
    function onCloseDone(err) {
      if (err) return self2.emit("error", err);
      self2.emit("close");
    }
  };
  RandomAccessReader.prototype.createReadStream = function(options) {
    var start = options.start;
    var end = options.end;
    if (start === end) {
      var emptyStream = new PassThrough();
      setImmediate(function() {
        emptyStream.end();
      });
      return emptyStream;
    }
    var stream = this._readStreamForRange(start, end);
    var destroyed = false;
    var refUnrefFilter = new RefUnrefFilter(this);
    stream.on("error", function(err) {
      setImmediate(function() {
        if (!destroyed) refUnrefFilter.emit("error", err);
      });
    });
    refUnrefFilter.destroy = function() {
      stream.unpipe(refUnrefFilter);
      refUnrefFilter.unref();
      stream.destroy();
    };
    var byteCounter = new AssertByteCountStream(end - start);
    refUnrefFilter.on("error", function(err) {
      setImmediate(function() {
        if (!destroyed) byteCounter.emit("error", err);
      });
    });
    byteCounter.destroy = function() {
      destroyed = true;
      refUnrefFilter.unpipe(byteCounter);
      refUnrefFilter.destroy();
    };
    return stream.pipe(refUnrefFilter).pipe(byteCounter);
  };
  RandomAccessReader.prototype._readStreamForRange = function(start, end) {
    throw new Error("not implemented");
  };
  RandomAccessReader.prototype.read = function(buffer, offset, length, position, callback) {
    var readStream = this.createReadStream({ start: position, end: position + length });
    var writeStream = new Writable();
    var written = 0;
    writeStream._write = function(chunk, encoding, cb) {
      chunk.copy(buffer, offset + written, 0, chunk.length);
      written += chunk.length;
      cb();
    };
    writeStream.on("finish", callback);
    readStream.on("error", function(error) {
      callback(error);
    });
    readStream.pipe(writeStream);
  };
  RandomAccessReader.prototype.close = function(callback) {
    setImmediate(callback);
  };
  util2.inherits(RefUnrefFilter, PassThrough);
  function RefUnrefFilter(context) {
    PassThrough.call(this);
    this.context = context;
    this.context.ref();
    this.unreffedYet = false;
  }
  RefUnrefFilter.prototype._flush = function(cb) {
    this.unref();
    cb();
  };
  RefUnrefFilter.prototype.unref = function(cb) {
    if (this.unreffedYet) return;
    this.unreffedYet = true;
    this.context.unref();
  };
  var cp437 = "\0☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
  function decodeBuffer(buffer, start, end, isUtf8) {
    if (isUtf8) {
      return buffer.toString("utf8", start, end);
    } else {
      var result = "";
      for (var i = start; i < end; i++) {
        result += cp437[buffer[i]];
      }
      return result;
    }
  }
  function readUInt64LE(buffer, offset) {
    var lower32 = buffer.readUInt32LE(offset);
    var upper32 = buffer.readUInt32LE(offset + 4);
    return upper32 * 4294967296 + lower32;
  }
  var newBuffer;
  if (typeof Buffer.allocUnsafe === "function") {
    newBuffer = function(len) {
      return Buffer.allocUnsafe(len);
    };
  } else {
    newBuffer = function(len) {
      return new Buffer(len);
    };
  }
  function defaultCallback(err) {
    if (err) throw err;
  }
  return yauzl;
}
var extractZip;
var hasRequiredExtractZip;
function requireExtractZip() {
  if (hasRequiredExtractZip) return extractZip;
  hasRequiredExtractZip = 1;
  const debug = requireSrc()("extract-zip");
  const { createWriteStream: createWriteStream2, promises: fs2 } = require$$0$3;
  const getStream2 = requireGetStream();
  const path2 = require$$3$2;
  const { promisify: promisify2 } = require$$1$2;
  const stream = require$$6$1;
  const yauzl2 = requireYauzl();
  const openZip = promisify2(yauzl2.open);
  const pipeline2 = promisify2(stream.pipeline);
  class Extractor {
    constructor(zipPath, opts) {
      this.zipPath = zipPath;
      this.opts = opts;
    }
    async extract() {
      debug("opening", this.zipPath, "with opts", this.opts);
      this.zipfile = await openZip(this.zipPath, { lazyEntries: true });
      this.canceled = false;
      return new Promise((resolve2, reject) => {
        this.zipfile.on("error", (err) => {
          this.canceled = true;
          reject(err);
        });
        this.zipfile.readEntry();
        this.zipfile.on("close", () => {
          if (!this.canceled) {
            debug("zip extraction complete");
            resolve2();
          }
        });
        this.zipfile.on("entry", async (entry) => {
          if (this.canceled) {
            debug("skipping entry", entry.fileName, { cancelled: this.canceled });
            return;
          }
          debug("zipfile entry", entry.fileName);
          if (entry.fileName.startsWith("__MACOSX/")) {
            this.zipfile.readEntry();
            return;
          }
          const destDir = path2.dirname(path2.join(this.opts.dir, entry.fileName));
          try {
            await fs2.mkdir(destDir, { recursive: true });
            const canonicalDestDir = await fs2.realpath(destDir);
            const relativeDestDir = path2.relative(this.opts.dir, canonicalDestDir);
            if (relativeDestDir.split(path2.sep).includes("..")) {
              throw new Error(`Out of bound path "${canonicalDestDir}" found while processing file ${entry.fileName}`);
            }
            await this.extractEntry(entry);
            debug("finished processing", entry.fileName);
            this.zipfile.readEntry();
          } catch (err) {
            this.canceled = true;
            this.zipfile.close();
            reject(err);
          }
        });
      });
    }
    async extractEntry(entry) {
      if (this.canceled) {
        debug("skipping entry extraction", entry.fileName, { cancelled: this.canceled });
        return;
      }
      if (this.opts.onEntry) {
        this.opts.onEntry(entry, this.zipfile);
      }
      const dest = path2.join(this.opts.dir, entry.fileName);
      const mode = entry.externalFileAttributes >> 16 & 65535;
      const IFMT = 61440;
      const IFDIR = 16384;
      const IFLNK = 40960;
      const symlink = (mode & IFMT) === IFLNK;
      let isDir = (mode & IFMT) === IFDIR;
      if (!isDir && entry.fileName.endsWith("/")) {
        isDir = true;
      }
      const madeBy = entry.versionMadeBy >> 8;
      if (!isDir) isDir = madeBy === 0 && entry.externalFileAttributes === 16;
      debug("extracting entry", { filename: entry.fileName, isDir, isSymlink: symlink });
      const procMode = this.getExtractedMode(mode, isDir) & 511;
      const destDir = isDir ? dest : path2.dirname(dest);
      const mkdirOptions = { recursive: true };
      if (isDir) {
        mkdirOptions.mode = procMode;
      }
      debug("mkdir", { dir: destDir, ...mkdirOptions });
      await fs2.mkdir(destDir, mkdirOptions);
      if (isDir) return;
      debug("opening read stream", dest);
      const readStream = await promisify2(this.zipfile.openReadStream.bind(this.zipfile))(entry);
      if (symlink) {
        const link = await getStream2(readStream);
        debug("creating symlink", link, dest);
        await fs2.symlink(link, dest);
      } else {
        await pipeline2(readStream, createWriteStream2(dest, { mode: procMode }));
      }
    }
    getExtractedMode(entryMode, isDir) {
      let mode = entryMode;
      if (mode === 0) {
        if (isDir) {
          if (this.opts.defaultDirMode) {
            mode = parseInt(this.opts.defaultDirMode, 10);
          }
          if (!mode) {
            mode = 493;
          }
        } else {
          if (this.opts.defaultFileMode) {
            mode = parseInt(this.opts.defaultFileMode, 10);
          }
          if (!mode) {
            mode = 420;
          }
        }
      }
      return mode;
    }
  }
  extractZip = async function(zipPath, opts) {
    debug("creating target directory", opts.dir);
    if (!path2.isAbsolute(opts.dir)) {
      throw new Error("Target directory is expected to be absolute");
    }
    await fs2.mkdir(opts.dir, { recursive: true });
    opts.dir = await fs2.realpath(opts.dir);
    return new Extractor(zipPath, opts).extract();
  };
  return extractZip;
}
var extractZipExports = requireExtractZip();
const extract = /* @__PURE__ */ getDefaultExportFromCjs(extractZipExports);
const RELEASE_BRANCH = "release";
const PROGRESS_INTERVAL_MS = 150;
const MIN_ASAR_BYTES = 1024 * 1024;
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
    size = statSync(pending).size;
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
  await runGitAsync(
    ["--git-dir", gitDir(), "fetch", "--progress", "--depth", "1", "origin", RELEASE_BRANCH],
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
  const commit = runGit(["--git-dir", gitDir(), "rev-parse", "FETCH_HEAD"]).trim();
  const version = runGit(["--git-dir", gitDir(), "show", `${commit}:version.txt`]).split(/\r?\n/)[0].trim();
  return { version, commit };
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
function pruneOldReleases(root, keep) {
  try {
    for (const f of readdirSync(root)) {
      if (f === "release.git" || keep.has(f)) continue;
      const p = join(root, f);
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
  const root = updatesRoot();
  mkdirSync(root, { recursive: true });
  const rev = `${tip.commit}:app.zip`;
  const total = Number(runGit(["--git-dir", gitDir(), "cat-file", "-s", rev]).trim());
  if (!Number.isFinite(total) || total <= 0) throw new Error(m("git.asarSizeUnknown"));
  const dir = join(root, tip.commit);
  mkdirSync(dir, { recursive: true });
  const part = join(dir, "app.zip.part");
  let resumeFrom = 0;
  if (existsSync(part)) {
    const size = statSync(part).size;
    if (size > 0 && size < total) resumeFrom = size;
    else rmSync(part, { force: true });
  }
  await streamBlob(rev, part, resumeFrom, total, name, resumeFrom > 0, onProgress);
  if (statSync(part).size !== total)
    throw new Error(m("git.asarSizeMismatch", { want: total, got: statSync(part).size }));
  const zipPath = join(dir, "app.zip");
  rmSync(zipPath, { force: true });
  renameSync(part, zipPath);
  onProgress?.({ name, phase: "extract", percent: 100, message: m("git.zipUnpacking") });
  await extract(zipPath, { dir });
  const stagedAsar = join(dir, "app.asar");
  if (!existsSync(stagedAsar) || statSync(stagedAsar).size < MIN_ASAR_BYTES)
    throw new Error(m("git.asarExtractFailed"));
  const metaFile = join(root, "update-meta.json");
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
      commit: tip.commit
    })
  );
  const keep = /* @__PURE__ */ new Set([tip.commit]);
  if (prev.currentAsar) keep.add(String(prev.currentAsar).split(/[\\/]/)[0]);
  pruneOldReleases(root, keep);
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
    const current = app$1.getVersion();
    let staged = readStagedUpdate();
    if (staged && !isNewer(current, staged.version)) {
      clearStagedUpdate();
      staged = null;
    }
    if (staged) {
      return {
        ...base,
        ok: true,
        branch: RELEASE_BRANCH,
        localHead: current,
        remoteHead: staged.commit.slice(0, 8),
        currentVersion: current,
        latestVersion: staged.version,
        hasUpdate: false,
        pendingRestart: true
      };
    }
    const tip = await fetchTip(name);
    return {
      ...base,
      ok: true,
      branch: RELEASE_BRANCH,
      localHead: current,
      remoteHead: tip.commit.slice(0, 8),
      currentVersion: current,
      latestVersion: tip.version,
      // local ahead of the release branch (e.g. a locally-built 0.1.5 vs server 0.1.4) is
      // simply up-to-date: hasUpdate stays false and no action is offered.
      hasUpdate: isNewer(current, tip.version),
      pendingRestart: false
    };
  } catch (err) {
    return { ...base, error: err.message };
  }
}
async function applyAsarUpdate(name, onProgress) {
  try {
    const tip = await fetchTip(name, onProgress);
    await downloadAsar(tip, name, onProgress);
    return {
      name,
      ok: true,
      updated: true,
      message: m("git.asarDownloaded", { version: tip.version })
    };
  } catch (err) {
    return { name, ok: false, updated: false, error: err.message };
  }
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
    child.stdout?.on("data", (d) => stdout += String(d));
    child.stderr?.on("data", (d) => stderr += String(d));
    child.on("error", (err) => resolve2({ code: -1, stdout, stderr: stderr || err.message }));
    child.on("close", (code2) => resolve2({ code: code2 ?? -1, stdout, stderr }));
  });
}
function dshRoots() {
  return resolveDshRuntimeDirs();
}
function dshBinJs() {
  for (const root of dshRoots()) {
    const p = join(root, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (existsSync(p)) return p;
  }
  return null;
}
function dshBinCandidates() {
  const out = [];
  for (const root of dshRoots()) {
    const bin = join(root, "node_modules", ".bin");
    if (process.platform === "win32")
      out.push(join(bin, "dsh.cmd"), join(bin, "dsh"), join(root, "dsh.cmd"), join(root, "dsh"));
    else out.push(join(bin, "dsh"), join(root, "dsh"));
  }
  return out;
}
function dshPackageDir() {
  for (const root of dshRoots()) {
    const p = join(root, "node_modules", "@deepseek-ai", "dsh");
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
function repairPnpmCmd(root) {
  if (process.platform !== "win32") return;
  linkNativePnpm(root);
  const mjs = join(root, "node_modules", "pnpm", "bin", "pnpm.mjs");
  const cmd = join(root, "pnpm.cmd");
  if (!existsSync(mjs) || !existsSync(cmd)) return;
  const desired = '@ECHO off\r\nSETLOCAL\r\nIF EXIST "%~dp0node.exe" (\r\n  "%~dp0node.exe" "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n) ELSE (\r\n  node "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n)\r\nENDLOCAL\r\nEXIT /b %ERRORLEVEL%\r\n';
  try {
    if (readFileSync(cmd, "utf-8") === desired) return;
    writeFileSync$1(cmd, desired, "utf-8");
    pnpmDirsPromise = void 0;
  } catch {
  }
}
function linkNativePnpm(root) {
  const pkgDir = join(root, "node_modules", "pnpm");
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
  const native = join(root, "node_modules", ...target.split("/"), binFile);
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
    DSH_NODE_PATH: nodeExe
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
      timeoutMs: opts.timeoutMs ?? 10 * 6e4
    }
  );
  if (res.code !== 0)
    throw new Error(
      res.stderr.slice(-2e3) || res.stdout.slice(-2e3) || m("dsh.exitCode", { code: res.code })
    );
  return res.stdout;
}
async function dshPluginForward(pnpmArgs, profile = DEFAULT_PROFILE) {
  if (!(await pnpmBinDirs()).length) throw pnpmMissingError();
  return runDsh(["plugin", "--profile", profile, ...pnpmArgs], {
    timeoutMs: 15 * 6e4,
    profile
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
    out.push({ name: b, version: installedBundleVersion(b) || "(bundled)", source: "bundle" });
  }
  return out;
}
function installedBundleVersion(name) {
  for (const root of dshRoots()) {
    try {
      return JSON.parse(
        readFileSync(join(root, "node_modules", ...name.split("/"), "package.json"), "utf-8")
      ).version;
    } catch {
    }
  }
  return null;
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
  await dshPluginForward(["add", s], profile);
}
async function uninstallDshPlugin(name, profile = DEFAULT_PROFILE) {
  const s = validateNpmSpec(name);
  await dshPluginForward(["remove", s], profile);
}
async function updateDshPlugin(name, channel, gitUrl, profile = DEFAULT_PROFILE) {
  if (channel === "git") {
    if (!gitUrl) throw new Error(m("dsh.gitNeedsUrl"));
    const parsed = parseGitSpec(gitUrl);
    const repo = parsed ? parsed.repo : gitUrl;
    const ref2 = parsed?.ref;
    const installSpec = ref2 ? `${repo}#${ref2}` : `${repo}#${(await remoteHeadSha(repo)).slice(0, 8)}`;
    await dshPluginForward(["add", installSpec], profile);
    return m("dsh.updatedTo", { spec: installSpec });
  }
  const s = validateNpmSpec(name);
  await dshPluginForward(["update", s], profile);
  return m("dsh.npmUpdated", { spec: s });
}
async function updateAllDshPlugins(profile = DEFAULT_PROFILE) {
  return (await dshPluginForward(["update", "--latest"], profile)).slice(-2e3);
}
const NPM_REGISTRY_MIRROR = "https://registry.npmmirror.com";
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
  if (/[\s;`$&|]/.test(repo)) return null;
  const res = await runCli$1("git", ["ls-remote", "--tags", repo], { timeoutMs: 6e4 });
  if (res.code !== 0) return null;
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
  if (!bestName) return null;
  const sha = commitSha.get(bestName) || tagSha.get(bestName) || "";
  return { version: bestName, sha };
}
function isNewerVersion(installed2, latest) {
  const clean = (s) => s.replace(/^[\^~>=<*v]+/i, "").trim();
  if (!/^\d/.test(clean(installed2)) || !/^\d/.test(clean(latest))) return false;
  const seg = (s) => clean(s).split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const a = seg(installed2);
  const b = seg(latest);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) > (a[i] || 0);
  }
  return false;
}
async function npmLatestVersion(name) {
  const res = await runCli$1("npm", ["view", name, "version", "--registry", NPM_REGISTRY_MIRROR], {
    timeoutMs: 3e4,
    shell: process.platform === "win32"
  });
  return res.code === 0 ? res.stdout.trim().replace(/^v/, "") : "";
}
async function checkDshPluginUpdates(profile = DEFAULT_PROFILE) {
  const plugins = listDshPlugins(profile).filter((p) => p.source === "profile");
  return Promise.all(
    plugins.map(async (p) => {
      const git = parseGitSpec(p.version);
      try {
        if (git) {
          const tag = await latestGitTag(git.repo);
          if (!tag) return { name: p.name, updateAvailable: false, channel: "git" };
          let updateAvailable;
          if (git.isSha) updateAvailable = (git.ref || "").toLowerCase() !== tag.sha.toLowerCase();
          else if (git.ref) {
            const instVer = git.ref.replace(/^v/i, "");
            updateAvailable = /^\d/.test(instVer) ? isNewerVersion(instVer, tag.version) : (git.ref || "").toLowerCase() !== tag.sha.toLowerCase();
          } else updateAvailable = false;
          return { name: p.name, updateAvailable, latest: tag.version, channel: "git" };
        }
        const latest = await npmLatestVersion(p.name);
        if (latest && isNewerVersion(p.version, latest))
          return { name: p.name, updateAvailable: true, latest, channel: "npm" };
        return { name: p.name, updateAvailable: false, channel: "npm" };
      } catch {
        return { name: p.name, updateAvailable: false };
      }
    })
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
async function dshSpawnCommand(profile, port) {
  const status = await getDshStatus(profile);
  if (!status.installed) throw new Error(status.error || m("dsh.unavailable"));
  const binJs = dshBinJs();
  if (!binJs) throw new Error(m("dsh.binMissing"));
  mkdirSync(status.profileDir, { recursive: true });
  clearStaleDshLocks(join(status.profileDir, "..", ".."));
  return {
    cmd: resolveDshNodeExePath(),
    args: [binJs, "--profile", profile, "--host", "127.0.0.1", "--port", String(port), "--no-open"],
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
  listDshPlugins,
  pnpmBinDirs,
  repairPnpmCmd,
  uninstallDshPlugin,
  updateAllDshPlugins,
  updateDshPlugin
}, Symbol.toStringTag, { value: "Module" }));
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
  const entries = ["node_modules", join("lib", "node_modules")];
  const out = [];
  for (const root of roots)
    for (const e of entries) out.push(join(root, e, "openclaw", "openclaw.mjs"));
  return out;
}
function resolveOpenclawCommand() {
  const script = openclawEntryCandidates().find((p) => existsSync(p));
  if (!script) return null;
  return { cmd: getNodeExePath(), script };
}
function openclawEnv(extra = {}) {
  return bundledEnv({ OPENCLAW_STATE_DIR: resolveOpenclawHome(), ...extra });
}
function openclawVersion() {
  const roots = [
    join(app$1.getPath("userData"), "openclaw"),
    join(process.resourcesPath || "", "openclaw"),
    join(app$1.getAppPath(), "resources", "openclaw"),
    join(process.cwd(), "resources", "openclaw")
  ].filter(Boolean);
  for (const root of roots)
    for (const e of ["node_modules", join("lib", "node_modules")]) {
      try {
        return JSON.parse(readFileSync(join(root, e, "openclaw", "package.json"), "utf-8")).version ?? void 0;
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
function ensureDefaultOpenclawPage() {
  const metaFile = join(resolvePagesDir(), "openclaw", "container.json");
  if (existsSync(metaFile)) {
    try {
      const raw = JSON.parse(readFileSync(metaFile, "utf-8"));
      const vars = Array.isArray(raw.envVars) ? raw.envVars : [];
      const stale = !vars.length || vars.some((v) => v?.key === "OPENCLAW_HOME" && v?.defaultPath === "{envRoot}/openclaw");
      if (stale) {
        writeFileSync$1(metaFile, JSON.stringify({ ...raw, envVars: openclawEnvVars() }, null, 2));
      }
    } catch {
    }
    return;
  }
  try {
    createOpenclawPage(OPENCLAW_DEFAULT_PORT);
  } catch {
  }
}
function ensureBuiltinPages() {
  removeLegacyBuiltinPages();
  const destRoot = resolvePagesDir();
  const srcRoot = app$1.isPackaged ? join(process.resourcesPath || "", "pages") : destRoot;
  for (const id2 of ["dsh-web"]) {
    const src2 = join(srcRoot, id2);
    const dest = join(destRoot, id2);
    if (!existsSync(src2)) continue;
    if (existsSync(join(dest, "container.json"))) continue;
    try {
      mkdirSync(dest, { recursive: true });
      cpSync(src2, dest, { recursive: true });
    } catch {
    }
  }
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
}
function openclawSpawnSpec(port) {
  const resolved = resolveOpenclawCommand();
  if (!resolved) throw new Error(m("openclaw.cliMissingShort"));
  const home = resolveOpenclawHome();
  mkdirSync(home, { recursive: true });
  const p = Number(port) > 0 ? Number(port) : OPENCLAW_DEFAULT_PORT;
  ensureOpenclawConfig(home, p);
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
      throw new Error(m("openclaw.configUnreadable", { path: cfgPath, err: err.message }));
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
  openclawSpawnSpec,
  openclawVersion,
  resolveOpenclawLaunchUrl
}, Symbol.toStringTag, { value: "Module" }));
const REGISTRY = process.env.npm_config_registry || "https://registry.npmmirror.com/";
const DSH_PKG = "@deepseek-ai/dsh";
const OPENCLAW_PKG = "openclaw";
const containerName = () => m("app.title");
const CACHE_TTL_MS = 5 * 601e3;
let cache = null;
async function fetchNpmLatest(name) {
  const url = new URL(
    encodeURIComponent(name).replace(/^%40/, "@") + "/latest",
    REGISTRY
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
function isNewer(current, latest) {
  const a = semverTuple(current);
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
      canAutoUpdate: false
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
async function checkBuiltin(name, dir, packageName, currentVersion) {
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
  const latest = await fetchNpmLatest(packageName);
  if (!latest) return { ...base, currentVersion, error: m("upd.registryUnreachable") };
  return {
    ...base,
    ok: true,
    currentVersion,
    latestVersion: latest,
    hasUpdate: isNewer(currentVersion, latest)
  };
}
async function computeAll(pages) {
  const name = containerName();
  return Promise.all([
    // Both packaged and dev detect the container's own update the same way: compare the
    // running version against the `release` branch tip (over-the-air app.asar channel).
    // A packaged install swaps the asar at boot; a dev checkout downloads/stages it but
    // boot.cjs is not on its launch path, so applying takes effect only once packaged.
    checkAsarUpdate(name, resolveInstallDir()),
    ...pages.filter((p) => !p.id.startsWith("__")).map(checkPage),
    checkBuiltin(
      m("upd.dshName"),
      join(app$1.getPath("userData"), "dsh"),
      DSH_PKG,
      (await getDshStatus()).version
    ),
    checkBuiltin("OpenClaw", openclawRoot() || "", OPENCLAW_PKG, openclawVersion())
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
function bundledNpmCli() {
  return join(dirname(getNodeExePath()), "node_modules", "npm", "bin", "npm-cli.js");
}
async function runNpm(cmd, args, env2, timeoutMs) {
  const res = await new Promise((resolve2) => {
    const child = spawn(cmd, args, {
      env: env2,
      stdio: "ignore",
      windowsHide: true,
      shell: process.platform === "win32" && cmd !== getNodeExePath(),
      timeout: timeoutMs
    });
    let stderr = "";
    child.stderr?.on("data", (d) => stderr += String(d));
    child.on("error", (err) => resolve2({ code: -1, stderr: err.message }));
    child.on("close", (code2) => resolve2({ code: code2 ?? -1, stderr }));
  });
  if (res.code !== 0)
    throw new Error(
      `${res.stderr.slice(-500) || m("upd.npmExitCode", { code: res.code })}（${args.join(" ")}）`
    );
}
async function updateDshSelf() {
  const name = m("upd.dshName");
  const root = join(app$1.getPath("userData"), "dsh");
  const before = (await getDshStatus()).version;
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync$1(join(root, ".npmrc"), `registry=${REGISTRY}
`);
    const node2 = getNodeExePath();
    const npmCli = bundledNpmCli();
    if (!existsSync(npmCli)) throw new Error(m("upd.npmMissing", { npm: npmCli }));
    await runNpm(
      node2,
      [
        npmCli,
        "install",
        "-g",
        `${DSH_PKG}@alpha`,
        "--config.minimumReleaseAge=0",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund"
      ],
      { ...process.env, npm_config_prefix: root },
      15 * 6e4
    );
    if (!existsSync(join(root, "pnpm.cmd")))
      await runNpm(
        node2,
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
        { ...process.env, npm_config_prefix: root },
        15 * 6e4
      );
    repairPnpmCmd(root);
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
async function reprovisionOpenclaw() {
  const name = "OpenClaw";
  const root = openclawRoot();
  if (!root) return { name, ok: false, updated: false, error: m("upd.openclawDirMissing") };
  const before = openclawVersion();
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync$1(join(root, ".npmrc"), `registry=${REGISTRY}
`);
    const node2 = getNodeExePath();
    const npmCli = bundledNpmCli();
    if (!existsSync(npmCli)) throw new Error(m("upd.npmMissing", { npm: npmCli }));
    await runNpm(
      node2,
      [
        npmCli,
        "install",
        "-g",
        `${OPENCLAW_PKG}@latest`,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund"
      ],
      { ...process.env, npm_config_prefix: root },
      15 * 6e4
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
async function provisionBuiltin(kind) {
  return kind === "dsh" ? updateDshSelf() : reprovisionOpenclaw();
}
async function performUpdate(target, onProgress) {
  switch (target.action) {
    case "pull":
      return performUpdate$1({ name: target.name, dir: target.dir });
    case "apply-asar":
      return applyAsarUpdate(target.name, onProgress);
    case "reprovision":
      return target.packageName === DSH_PKG ? updateDshSelf() : reprovisionOpenclaw();
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
function defaultShell() {
  if (process.platform === "win32") return { shell: "powershell.exe", args: ["-NoLogo"] };
  return { shell: process.env.SHELL || "/bin/bash", args: ["-l"] };
}
let counter = 0;
const sessions = /* @__PURE__ */ new Map();
const WINPTY_BACKEND = process.platform === "win32" ? { useConpty: false } : {};
class PtyManager {
  /** Start a shell rooted at `cwd`, titled `title`; returns its session descriptor.
      With `run`, the session executes that command line instead of an interactive shell. */
  async start(cwd, title2, run) {
    const id2 = `pty-${Date.now().toString(36)}-${++counter}`;
    let shell2;
    let args;
    let env2 = await terminalEnv();
    if (run?.command.trim()) {
      const [cmd, ...rest] = expandTilde(run.command.trim()).split(/\s+/);
      env2 = { ...env2, ...run.env || {} };
      shell2 = cmd === "node" ? getNodeExePath() : whichOnPath(cmd, env2) ?? cmd;
      args = rest;
      if (cmd !== "node" && !existsSync(shell2)) {
        throw new Error(m("pty.commandNotFound", { cmd }));
      }
    } else {
      ({ shell: shell2, args } = defaultShell());
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
let surveyTimer = null;
const UPDATE_SURVEY_MS = 30 * 6e4;
function registerIpc(registry2) {
  const ok = (data) => ({ ok: true, data });
  const fail = (err) => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  });
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
  nativeTheme.on("updated", () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.OnNativeTheme, nativeTheme.shouldUseDarkColors);
    }
  });
  ipcMain$1.handle(IPC.GetNativeTheme, () => ok(nativeTheme.shouldUseDarkColors));
  ipcMain$1.handle(
    IPC.SetNativeTheme,
    (_e, source) => {
      if (source === "auto" || source === void 0 || source === null)
        nativeTheme.themeSource = "system";
      else if (typeof source === "boolean") nativeTheme.themeSource = source ? "dark" : "light";
      else nativeTheme.themeSource = source;
      return ok(true);
    }
  );
  ipcMain$1.handle(IPC.MinimizeWindow, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
    return ok(true);
  });
  ipcMain$1.handle(IPC.ToggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return ok(false);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return ok(win.isMaximized());
  });
  ipcMain$1.handle(IPC.CloseWindow, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
    return ok(true);
  });
  ipcMain$1.handle(
    IPC.GetIsMaximized,
    (e) => ok(Boolean(BrowserWindow.fromWebContents(e.sender)?.isMaximized()))
  );
  ipcMain$1.handle(IPC.GetNodeInfo, async () => {
    try {
      return ok(await getNodeRuntimeInfo());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.ListNodeVersions, async () => {
    try {
      return ok(await listNodeVersions());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.UpdateNodeRuntime, async (e, version) => {
    const sender = e.sender;
    const onProgress = (p) => {
      if (!sender.isDestroyed()) sender.send(IPC.OnNodeUpdateProgress, p);
    };
    try {
      return ok(await updateNodeRuntime(version, onProgress));
    } catch (err) {
      return fail(err);
    } finally {
      onProgress({ name: "Node", phase: "done" });
    }
  });
  ipcMain$1.handle(IPC.RestoreBundledNode, async () => {
    try {
      return ok(await restoreBundledNode());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.ProvisionBuiltin, async (_e, kind) => {
    try {
      const res = await provisionBuiltin(kind);
      clearUpdateCache();
      return ok(res);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.ListPages, async () => {
    registry2.reconcile();
    return ok(registry2.list());
  });
  ipcMain$1.handle(IPC.StartPage, async (_e, id2) => {
    try {
      return ok(await registry2.start(id2));
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.StopPage, async (_e, id2) => {
    registry2.stop(id2);
    return ok(registry2.get(id2));
  });
  ipcMain$1.handle(IPC.RestartPage, async (_e, id2) => {
    try {
      return ok(await registry2.restart(id2));
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.GetPageLogs, (_e, id2) => ok(registry2.logs(id2)));
  ipcMain$1.handle(
    IPC.InstallPageFromGit,
    async (_e, repoUrl, name, port) => {
      const sender = _e.sender;
      const onProgress = (p) => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p);
      };
      try {
        const dirName = await installFromGit(resolvePagesDir(), repoUrl, name, port, void 0, onProgress);
        registry2.reconcile();
        clearUpdateCache();
        return ok(dirName);
      } catch (err) {
        return fail(err);
      } finally {
        onProgress({ op: "git", phase: "done", percent: 100 });
      }
    }
  );
  ipcMain$1.handle(
    IPC.InstallPageFromDir,
    async (_e, srcDir, name, port, originUrl) => {
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
          onProgress
        );
        registry2.reconcile();
        clearUpdateCache();
        return ok(dirName);
      } catch (err) {
        return fail(err);
      } finally {
        onProgress({ op: "dir", phase: "done", percent: 100 });
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
      if (res.canceled || !res.filePaths.length) return ok(null);
      return ok(res.filePaths[0]);
    } catch (err) {
      return fail(err);
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
      return ok(true);
    } catch (err) {
      return fail(err);
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
      return ok(true);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.OpenPageExternal, async (_e, url) => {
    try {
      await shell$1.openExternal(url);
      return ok(true);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.GetSettings, () => ok(getSettings()));
  ipcMain$1.handle(IPC.OpenLogsDir, async () => {
    try {
      const err = await shell$1.openPath(logsDir());
      return err ? fail(new Error(err)) : ok(logsDir());
    } catch (e) {
      return fail(e);
    }
  });
  ipcMain$1.handle(
    IPC.UpdateSettings,
    (_e, partial) => {
      try {
        if (partial.defaultView) setDefaultView(partial.defaultView);
        const rest = { ...partial };
        delete rest.defaultView;
        if (Object.keys(rest).length) updateSettings(rest);
        if (typeof partial.launchAtStartup === "boolean") {
          applyLaunchAtStartup(partial.launchAtStartup);
        }
        if (partial.locale) {
          registry2.reconcile();
          notifyLocaleChanged();
          registry2.emitChanged();
        }
        return ok(getSettings());
      } catch (err) {
        return fail(err);
      }
    }
  );
  ipcMain$1.handle(
    IPC.EnvRoot,
    () => ok({
      envRoot: resolveEnvRoot(),
      installDir: resolveInstallDir(),
      custom: Boolean((getSettings().envRoot || "").trim())
    })
  );
  ipcMain$1.handle(
    IPC.DownloadDir,
    () => ok({
      downloadDir: resolveDownloadDir(),
      defaultDir: defaultDownloadDir(),
      custom: Boolean((getSettings().downloadDir || "").trim())
    })
  );
  ipcMain$1.handle(IPC.CheckUpdates, async (_e, force) => {
    try {
      return ok(await checkUpdates(registry2.list(), Boolean(force)));
    } catch (err) {
      return fail(err);
    }
  });
  if (surveyTimer) clearInterval(surveyTimer);
  const runSurvey = () => {
    checkUpdates(registry2.list(), true).then((results) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.OnUpdateResults, results);
      }
    }).catch(() => void 0);
  };
  setTimeout(runSurvey, 45e3).unref?.();
  surveyTimer = setInterval(runSurvey, UPDATE_SURVEY_MS);
  surveyTimer.unref?.();
  ipcMain$1.handle(IPC.PerformUpdate, async (_e, target) => {
    const sender = _e.sender;
    const onProgress = (p) => {
      if (!sender.isDestroyed()) sender.send(IPC.OnUpdateProgress, p);
    };
    try {
      const res = await performUpdate(target, onProgress);
      clearUpdateCache();
      return ok(res);
    } catch (err) {
      return fail(err);
    } finally {
      onProgress({ name: target.name, phase: "done", percent: 100 });
    }
  });
  ipcMain$1.handle(IPC.RelaunchApp, () => {
    const args = process.argv.slice(1).filter((a) => a !== "--autostart");
    app$1.relaunch({ args: [...args, "--dsh-relaunched"] });
    app$1.exit(0);
    return ok(true);
  });
  const ptyManager = new PtyManager();
  ipcMain$1.handle(IPC.PageRunSpec, (_e, id2) => {
    try {
      const meta = registry2.get(id2);
      if (!meta || meta.external) return ok(null);
      if (meta.kind === "dsh" || meta.kind === "openclaw") return ok(null);
      const port = meta.containerPort || meta.port;
      return ok({
        command: expandStartCommand(meta.startCommand),
        env: { ...port ? { PORT: String(port) } : {}, ...buildPageEnv(meta) }
      });
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.OpenTerminalPage, (_e, id2) => {
    try {
      const meta = registry2.get(id2);
      if (!meta || meta.kind !== "terminal") throw new Error(m("ipc.notTerminal", { id: id2 }));
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.OpenTerminalPage, id2);
      }
      return ok(true);
    } catch (err) {
      return fail(err);
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
  ipcMain$1.handle(
    IPC.PtyStart,
    async (e, target, opts) => {
      try {
        const cwd = terminalDirFor(target);
        const title2 = target === "container" ? m("ipc.containerRoot") : target;
        const info = await ptyManager.start(
          cwd,
          title2,
          opts?.command ? { command: opts.command, env: opts.env } : void 0
        );
        const session2 = ptyManager.get(info.id);
        if (session2) {
          const sender = e.sender;
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
            buf += String(chunk);
            if (buf.length >= FLUSH_MAX) flush();
            else if (!timer) timer = setTimeout(flush, FLUSH_MS);
          });
          session2.on("exit", (code2) => {
            flush();
            if (!sender.isDestroyed())
              sender.send(IPC.OnPtyExit, { id: info.id, code: Number(code2) });
          });
        }
        return ok(info);
      } catch (err) {
        return fail(err);
      }
    }
  );
  ipcMain$1.handle(IPC.PtyWrite, (_e, id2, data) => {
    try {
      ptyManager.write(id2, data);
      return ok(true);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.PtyResize, (_e, id2, cols, rows) => {
    try {
      ptyManager.resize(id2, cols, rows);
      return ok(true);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.PtyKill, (_e, id2) => {
    try {
      ptyManager.kill(id2);
      return ok(true);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.ToggleDevTools, (e, guestId) => {
    try {
      const guest = typeof guestId === "number" ? webContents.fromId(guestId) : void 0;
      if (typeof guestId === "number" && !guest) return fail(new Error(m("ipc.guestGone")));
      const target = guest ?? BrowserWindow.fromWebContents(e.sender)?.webContents ?? e.sender;
      if (target.isDevToolsOpened()) target.closeDevTools();
      else target.openDevTools({ mode: "detach" });
      return ok({ opened: target.isDevToolsOpened(), scope: guest ? "webview" : "window" });
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.DshStatus, async (_e, profile) => {
    try {
      return ok(await getDshStatus(profile));
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.DshListPlugins, (_e, profile) => {
    try {
      return ok(listDshPlugins(profile));
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.DshPluginUpdates, async (_e, profile) => {
    try {
      return ok(await checkDshPluginUpdates(profile));
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(
    IPC.DshInstallPlugin,
    async (_e, spec, profile) => {
      try {
        await installDshPlugin(spec, profile);
        return ok(true);
      } catch (err) {
        return fail(err);
      }
    }
  );
  ipcMain$1.handle(
    IPC.DshUninstallPlugin,
    async (_e, name, profile) => {
      try {
        await uninstallDshPlugin(name, profile);
        return ok(true);
      } catch (err) {
        return fail(err);
      }
    }
  );
  ipcMain$1.handle(
    IPC.DshUpdatePlugin,
    async (_e, name, channel, gitUrl, profile) => {
      try {
        return ok(await updateDshPlugin(name, channel, gitUrl, profile));
      } catch (err) {
        return fail(err);
      }
    }
  );
  ipcMain$1.handle(IPC.DshUpdateAll, async (_e, profile) => {
    try {
      return ok(await updateAllDshPlugins(profile));
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.DshCreatePage, (_e, profile, port) => {
    try {
      const id2 = createDshPage(profile, Number(port) || 5173);
      registry2.reconcile();
      return ok(id2);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.DshToken, (_e, profile) => {
    try {
      registry2.reconcile();
      return ok(resolveDshToken(registry2.list(), profile || ""));
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.OpenclawStatus, async () => {
    try {
      return ok(await getOpenclawStatus());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.OpenclawCreatePage, (_e, port) => {
    try {
      const id2 = createOpenclawPage(Number(port) || void 0);
      registry2.reconcile();
      return ok(id2);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.OpenclawToken, () => {
    try {
      return ok(getOpenclawGatewayToken());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain$1.handle(IPC.OpenclawInitToken, (_e, rotate) => {
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
      return ok({ token, created, restarted });
    } catch (err) {
      return fail(err);
    }
  });
}
let sequence = 0;
function nextId() {
  sequence += 1;
  return `dl-${Date.now().toString(36)}-${sequence}`;
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
  const snapshot = (state) => ({
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
    if (state === "progressing") broadcast(snapshot("progressing"));
    else if (state === "interrupted") broadcast(snapshot("progressing"));
  });
  item.once("done", (_e, state) => {
    if (state === "completed") {
      broadcast({ ...snapshot("completed"), received: item.getReceivedBytes(), percent: 100 });
      const savePath = item.getSavePath();
      if (savePath) notifyDone(basename(savePath), savePath);
    } else {
      broadcast({ ...snapshot("cancelled"), state: "cancelled" });
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
const icon = join$1(import.meta.dirname, "../../resources/icon.png");
function ensureAsciiUserData() {
  const asciiLeaf = "dsh-desktop-container";
  try {
    const current = app$1.getPath("userData");
    if (!/[^\x20-\x7e]/.test(current)) return;
    const target = join(app$1.getPath("appData"), asciiLeaf);
    if (/[^\x20-\x7e]/.test(target)) {
      console.warn("[container] no ASCII userData path available (Chinese username?):", target);
      return;
    }
    if (existsSync(target)) {
      app$1.setPath("userData", target);
      return;
    }
    if (!existsSync(current)) {
      app$1.setPath("userData", target);
      return;
    }
    try {
      renameSync(current, target);
      app$1.setPath("userData", target);
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
function appIconPath() {
  const candidates = [
    icon,
    join(process.resourcesPath || "", "icon.png"),
    join(app$1.getAppPath(), "resources", "icon.png")
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || icon;
}
let mainWindow = null;
let tray = null;
let registry = null;
let isQuitting = false;
let startHidden = false;
process.on("uncaughtException", (err) => {
  console.error("[container] uncaught exception:", err);
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
    const src2 = join(resources, "app.asar.unpacked");
    const dst = join(dirname(appPath), "app.asar.unpacked");
    if (existsSync(src2) && !existsSync(dst)) cpSync(src2, dst, { recursive: true });
  } catch (err) {
    console.warn("[container] unpacked-copy for update failed (ignored):", err.message);
  }
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
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
      sandbox: false,
      webviewTag: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    if (!startHidden) mainWindow?.show();
  });
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
    if (!isQuitting && getSettings().minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
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
function rebuildTrayMenu() {
  if (!tray || !registry) return;
  const running = registry.running();
  const stopped = registry.list().filter((p) => p.status !== "running" && !p.external);
  const template = [
    { label: m("tray.show"), click: showWindow },
    { type: "separator" },
    ...running.map((p) => ({
      label: m("tray.stop", { name: p.name }),
      click: () => registry?.stop(p.id)
    })),
    ...stopped.slice(0, 8).map((p) => ({
      label: m("tray.start", { name: p.name }),
      click: () => {
        registry?.start(p.id).catch((err) => console.warn("[tray] start failed:", err.message));
      }
    })),
    { type: "separator" },
    {
      label: m("tray.quit"),
      click: () => {
        const running2 = registry?.running().length ?? 0;
        dialog.showMessageBox({
          type: "warning",
          title: m("tray.quitConfirmTitle"),
          message: m("tray.quitConfirm"),
          detail: running2 ? `Running pages: ${running2}` : void 0,
          buttons: [m("tray.quitYes"), m("tray.quitNo")],
          defaultId: 1,
          // Enter lands on Cancel — quitting is the destructive branch
          cancelId: 1
        }).then(({ response }) => {
          if (response !== 0) return;
          isQuitting = true;
          app$1.quit();
        }).catch(() => void 0);
      }
    }
  ];
  tray.setToolTip(m("tray.tooltip", { n: running.length }));
  tray.setContextMenu(Menu.buildFromTemplate(template));
}
function createTray() {
  if (tray) return;
  const path2 = appIconPath();
  const image = existsSync(path2) ? nativeImage.createFromPath(path2) : nativeImage.createEmpty();
  tray = new Tray(image.isEmpty() ? image : image.resize({ width: 16, height: 16 }));
  tray.on("click", showWindow);
  rebuildTrayMenu();
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
const relaunched = process.argv.includes("--dsh-relaunched");
const gotLock = relaunched || app$1.requestSingleInstanceLock();
if (!gotLock) {
  app$1.quit();
} else {
  if (relaunched) {
    setTimeout(() => app$1.requestSingleInstanceLock(), 1e3);
  }
  app$1.on("second-instance", showWindow);
  app$1.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.dsh.desktop-container");
    ensureUnpackedForUpdate();
    markBootOk();
    startHidden = process.argv.includes("--autostart") || app$1.getLoginItemSettings().wasOpenedAtLogin;
    applyLaunchAtStartup(getSettings().launchAtStartup);
    app$1.on("browser-window-created", (_, window2) => optimizer.watchWindowShortcuts(window2));
    app$1.on("web-contents-created", (_e, contents) => {
      if (contents.getType() === "webview") {
        contents.setWindowOpenHandler(({ url }) => {
          contents.loadURL(url).catch(() => void 0);
          return { action: "deny" };
        });
      }
    });
    registerDownloadHandling();
    await verifyNodeRuntime();
    ensureDefaultOpenclawPage();
    ensureBuiltinPages();
    registry = new PageRegistry({ pagesDir: resolvePagesDir(), projectDir: resolveProjectDir() });
    registerIpc(registry);
    registry.on("changed", rebuildTrayMenu);
    createWindow();
    createTray();
    const settings = getSettings();
    if (settings.autoStartPages.length) {
      registry.autoStart(settings.autoStartPages).catch((err) => console.warn("[container] auto-start failed", err));
    }
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
  app$1.on("before-quit", (e) => {
    isQuitting = true;
    if (registry && !shutdownDone) {
      shutdownDone = true;
      e.preventDefault();
      registry.shutdownAll();
      setTimeout(() => {
        shutdownDone = false;
        app$1.exit(0);
      }, 800);
    }
  });
}
