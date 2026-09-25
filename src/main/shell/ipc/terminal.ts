import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type IpcResult } from '../../../shared/types'
import { expandStartCommand, buildPageEnv } from '../../runtime/pages/pages'
import { PtyManager, listShells } from '../../runtime/terminal/pty'
import { logPageLine } from '../logger'
import { resolveSpawnableRoot, resolveDshProfileDir, resolveDshHome, resolveOpenclawHome } from '../store'
import { m } from '../i18n'
import { type IpcCtx } from './util'

export function registerTerminalIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

  // ---- built-in terminal (embedded PTY) ----
  const ptyManager = new PtyManager()
  /**
   * pageId → the PTY session running that CLI page. The registry's stop() can only
   * kill `e.proc`, which terminal pages never have — it reaches the real process
   * through this hook instead. A kill is recorded as intentional so the exit event
   * reads as a clean stop (code 0), not a red error dot from a signal-kill code.
   */
  const cliPtyByPage = new Map<string, string>()
  const intentionalKills = new Set<string>()
  registry.onKillTerminal = (id): void => {
    const sid = cliPtyByPage.get(id)
    if (!sid || !ptyManager.get(sid)) {
      // Nothing alive to kill — flip the status now rather than await an exit that never comes.
      registry.reportTerminal(id, 'exit', 0)
      return
    }
    intentionalKills.add(sid)
    ptyManager.kill(sid)
  }

  /** How a CLI page (no web surface) should run inside the embedded terminal. */
  ipcMain.handle(IPC.PageRunSpec, (_e, id: string): IpcResult => {
    try {
      const meta = registry.get(id)
      if (!meta || meta.external) return ok(null)
      if (meta.kind === 'dsh' || meta.kind === 'openclaw') return ok(null)
      const port = meta.containerPort || meta.port
      return ok({
        command: expandStartCommand(meta.startCommand),
        env: { ...(port ? { PORT: String(port) } : {}), ...buildPageEnv(meta) }
      })
    } catch (err) {
      return fail(err)
    }
  })

  /** Fired from the pages-manager dialog: tell every window to show this CLI page's
      full-surface terminal (only the main window renders one; others ignore it). */
  ipcMain.handle(IPC.OpenTerminalPage, (_e, id: string): IpcResult => {
    try {
      const meta = registry.get(id)
      if (!meta || meta.kind !== 'terminal') throw new Error(m('ipc.notTerminal', { id }))
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.OpenTerminalPage, id)
      }
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  const terminalDirFor = (target: string): string => {
    // 'container' is the drawer's default shell: it needs a real folder, so packaged builds get the
    // container's userData rather than the asar path (see resolveSpawnableRoot).
    if (target === 'container') return resolveSpawnableRoot()
    if (target === 'openclaw') return resolveOpenclawHome()
    if (target === 'dsh-root') return resolveDshHome()
    if (target.startsWith('dsh:')) return resolveDshProfileDir(target.slice(4))
    const page = registry.get(target)
    if (!page) throw new Error(m('ipc.unknownTarget', { target }))
    return page.dir
  }

  /** Make PTY bytes log-friendly: drop ANSI escape sequences (CSI / OSC / two-char) and
      turn carriage returns — bare ones are TUI row redraws — into line breaks, so the
      plain-text viewer gets one readable line per rendered line instead of escape noise. */
  const ptyTextForLog = (chunk: string): string =>
    chunk
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b[@-Z\\-_]/g, '')
      .replace(/\r\n?/g, '\n')

  ipcMain.handle(
    IPC.PtyStart,
    async (
      e,
      target: string,
      opts?: { command?: string; env?: Record<string, string>; shell?: string }
    ): Promise<IpcResult> => {
      try {
        const cwd = terminalDirFor(target)
        const title = target === 'container' ? m('ipc.containerRoot') : target
        const info = await ptyManager.start(cwd, title, {
          run: opts?.command ? { command: opts.command, env: opts.env } : undefined,
          shell: opts?.shell
        })
        const session = ptyManager.get(info.id)
        if (session) {
          const sender = e.sender
          // A CLI page (codex & friends) runs its whole life inside this PTY — the
          // registry never spawns terminal-kind pages. Mirror the lifecycle onto the
          // page (traffic lights) and the output into logs/pages/<id>.log (viewer +
          // live stream). Shell tabs share this handler but pass no command; skip them.
          const boundPage = opts?.command ? registry.get(target) : undefined
          const cliId = boundPage?.kind === 'terminal' ? boundPage.id : null
          if (cliId) {
            cliPtyByPage.set(cliId, info.id)
            registry.reportTerminal(cliId, 'running')
          }
          // Coalesce output before it crosses the process boundary. A full-screen TUI
          // repaints in hundreds of tiny chunks per second; sending each one as its own
          // IPC message floods the renderer's event loop until the window stops
          // responding. Flush at most once per frame (or when the buffer gets big).
          let buf = ''
          let timer: NodeJS.Timeout | null = null
          const FLUSH_MS = 16
          const FLUSH_MAX = 64 * 1024
          const flush = (): void => {
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            if (!buf) return
            const data = buf
            buf = ''
            if (!sender.isDestroyed()) sender.send(IPC.OnPtyData, { id: info.id, data })
          }
          session.on('data', (chunk) => {
            const text = String(chunk)
            if (cliId) logPageLine(cliId, ptyTextForLog(text))
            buf += text
            if (buf.length >= FLUSH_MAX) flush()
            else if (!timer) timer = setTimeout(flush, FLUSH_MS)
          })
          session.on('exit', (code) => {
            flush()
            // Always consume the mark — a shell-tab session that was killed would otherwise
            // leak its id. A user-initiated stop's signal-kill code (often 1) reads as
            // 已停止, not a crash.
            const intentional = intentionalKills.delete(info.id)
            if (cliId) {
              if (cliPtyByPage.get(cliId) === info.id) cliPtyByPage.delete(cliId)
              registry.reportTerminal(cliId, 'exit', intentional ? 0 : Number(code))
            }
            if (!sender.isDestroyed())
              sender.send(IPC.OnPtyExit, { id: info.id, code: Number(code) })
          })
        }
        return ok(info)
      } catch (err) {
        return fail(err)
      }
    }
  )

  /** The shells the terminal picker may run, discovered by the main process (default first). */
  ipcMain.handle(IPC.PtyShells, (): IpcResult => {
    try {
      return ok(listShells())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.PtyWrite, (_e, id: string, data: string): IpcResult => {
    try {
      ptyManager.write(id, data)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.PtyResize, (_e, id: string, cols: number, rows: number): IpcResult => {
    try {
      ptyManager.resize(id, cols, rows)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.PtyKill, (_e, id: string): IpcResult => {
    try {
      // Renderer-initiated kills (leaving a CLI surface, re-running it) are stops too:
      // mark them so the page's exit lands as 已停止, not a signal-code 启动失败.
      intentionalKills.add(id)
      ptyManager.kill(id)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })
}
