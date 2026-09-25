import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { IPC, type ImportOptions, type ImportPreflight, type InstallProgress, type IpcResult, type PortCheckResult } from '../../../shared/types'
import { BUILTIN_PAGE_IDS } from '../../runtime/pages/pages'
import { installFromGit, installFromLocalDir, installFromNpm, removePage } from '../../runtime/pages/installer'
import { classifyProject, probeRemoteTier, npmSuggestionFor } from '../../runtime/pages/project-classify'
import { clearUpdateCache } from '../../update/update-service'
import { killPortHolder, findPortHolder, probePortBind } from '../../runtime/diagnostics/port-holder'
import { setDefaultView, getSettings, updateSettings, resolvePagesDir, isValidPort, resolveEnvRoot, resolveInstallDir, resolveDownloadDir, defaultDownloadDir, resolveCapabilitiesDir } from '../store'
import { ensureDefaultOpenclawPage, ensureBuiltinPages } from '../../runtime/cli/openclaw'
import { m } from '../i18n'
import { type IpcCtx } from './util'

export function registerPagesIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

  ipcMain.handle(IPC.ListPages, async (): Promise<IpcResult> => {
    registry.reconcile()
    // Re-probe on-demand runtime presence (cheap existsSync) before listing, so each PageState's
    // `runtimeMissing` is current when the renderer draws its badges — an install clears the row
    // on the very next refresh without a dedicated signal.
    await registry.refreshRuntimePresence().catch(() => undefined)
    return ok(registry.list())
  })

  ipcMain.handle(IPC.StartPage, async (_e, id: string): Promise<IpcResult> => {
    try {
      // Deps-first: a page declaring `dependsOn` starts its chain (cycle-checked) before spawning.
      return ok(await registry.startWithDeps(id))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.StopPage, async (_e, id: string): Promise<IpcResult> => {
    registry.stop(id)
    return ok(registry.get(id))
  })

  ipcMain.handle(IPC.RestartPage, async (_e, id: string): Promise<IpcResult> => {
    try {
      return ok(await registry.restartWithDeps(id))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.GetPageLogs, (_e, id: string): IpcResult => ok(registry.logs(id)))

  ipcMain.handle(
    IPC.InstallPageFromGit,
    async (
      _e,
      repoUrl: string,
      name?: string,
      port?: number,
      opts?: ImportOptions
    ): Promise<IpcResult> => {
      // Stream import progress back to the requesting window (see InstallProgress).
      const sender = _e.sender
      const onProgress = (p: InstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p)
      }
      try {
        const dirName = await installFromGit(
          resolvePagesDir(),
          repoUrl,
          name,
          port,
          undefined,
          onProgress,
          opts
        )
        registry.reconcile()
        clearUpdateCache()
        return ok(dirName)
      } catch (err) {
        return fail(err)
      } finally {
        // See UpdateNodeRuntime: guarantee a terminal event so the top bar never sticks on error.
        onProgress({ op: 'git', phase: 'done', percent: 100 })
      }
    }
  )

  ipcMain.handle(
    IPC.InstallPageFromDir,
    async (
      _e,
      srcDir: string,
      name?: string,
      port?: number,
      originUrl?: string,
      opts?: ImportOptions
    ): Promise<IpcResult> => {
      const sender = _e.sender
      const onProgress = (p: InstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p)
      }
      try {
        const dirName = await installFromLocalDir(
          resolvePagesDir(),
          srcDir,
          name,
          port,
          originUrl,
          onProgress,
          opts
        )
        registry.reconcile()
        clearUpdateCache()
        return ok(dirName)
      } catch (err) {
        return fail(err)
      } finally {
        // See UpdateNodeRuntime: guarantee a terminal event so the top bar never sticks on error.
        onProgress({ op: 'dir', phase: 'done', percent: 100 })
      }
    }
  )

  ipcMain.handle(
    IPC.InstallPageFromNpm,
    async (_e, spec: string, name?: string): Promise<IpcResult> => {
      const sender = _e.sender
      const onProgress = (p: InstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p)
      }
      try {
        const dirName = await installFromNpm(
          resolvePagesDir(),
          spec,
          name,
          onProgress,
          resolveCapabilitiesDir()
        )
        registry.reconcile()
        clearUpdateCache()
        return ok(dirName)
      } catch (err) {
        return fail(err)
      } finally {
        // See UpdateNodeRuntime: guarantee a terminal event so the top bar never sticks on error.
        onProgress({ op: 'npm', phase: 'done', percent: 100 })
      }
    }
  )

  ipcMain.handle(
    IPC.PreflightImport,
    async (_e, source: string, isDir: boolean): Promise<IpcResult> => {
      // Same verdict the import gate uses, exposed early so the dialog can restrict the
      // project type / warn before any bytes move. Failures are "unknown", never a false block.
      try {
        const cls = isDir
          ? classifyProject(String(source || '').trim())
          : await probeRemoteTier(String(source || '').trim())
        if (!cls) return ok({ tier: null } as ImportPreflight)
        return ok({
          tier: cls.tier,
          kind: cls.kind,
          needsInstall: cls.needsInstall,
          reason: cls.reason ? m(cls.reason, cls.reasonParams) : undefined,
          // a rejected well-known repo (codex & friends) has a runnable npm CLI: offer it.
          suggestNpm:
            cls.tier === 'red' ? (npmSuggestionFor(String(source || '')) ?? undefined) : undefined
        } as ImportPreflight)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(IPC.ChooseDirectory, async (e, title?: string): Promise<IpcResult> => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender)
      const opts: Electron.OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
        title: title || m('dialog.chooseDir')
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || !res.filePaths.length) return ok(null)
      return ok(res.filePaths[0])
    } catch (err) {
      return fail(err)
    }
  })

  // Switch a page off/on. Disabled = hidden from the page switcher and never (auto)started;
  // the registry entry and its files stay intact, so re-enabling is instant. Any managed page
  // qualifies — built-in dsh/openclaw as well as imported web/CLI rows. External addresses are
  // excluded: they live in (and can be removed from) the 外部地址 manager instead.
  // autoStartPages is left untouched on purpose: re-enabling should restore the page's
  // previous launch behavior, not a defaulted-off one.
  ipcMain.handle(IPC.SetPageDisabled, (_e, id: string, disabled: boolean): IpcResult => {
    try {
      const state = registry.get(id)
      if (!state) return fail(new Error(m('page.unknown', { id })))
      if (state.external) return fail(new Error(m('page.disableExternal')))
      const s = getSettings()
      const set = new Set(s.disabledPages || [])
      if (disabled) set.add(id)
      else set.delete(id)
      updateSettings({ disabledPages: [...set] })
      if (disabled && (state.status === 'running' || state.status === 'starting'))
        registry.stop(id) // the status transition broadcasts the fresh list itself
      else registry.announceChange()
      return ok(registry.get(id))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.RemovePage, (_e, id: string): IpcResult => {
    try {
      registry.stop(id)
      removePage(resolvePagesDir(), id)
      registry.reconcile()
      const s = getSettings()
      if (s.autoStartPages.includes(id))
        updateSettings({ autoStartPages: s.autoStartPages.filter((x) => x !== id) })
      if (s.defaultView.kind === 'page' && s.defaultView.pageId === id)
        setDefaultView({ kind: 'none' })
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  /**
   * Restore a builtin page (dsh-web / openclaw) the user broke in userData: stop it, drop the
   * whole pages/<id> folder and re-seed from the bundled originals (both ensure* are no-ops while
   * the dir exists, so calling them after the delete is exactly a factory re-install). Port and
   * env overrides live in settings, not in the page dir — they deliberately survive a reset.
   */
  ipcMain.handle(IPC.ResetBuiltinPage, (_e, id: string): IpcResult => {
    try {
      if (!BUILTIN_PAGE_IDS.has(id)) return fail(new Error(m('ipc.resetNotBuiltin')))
      const wasRunning = registry.get(id)?.status === 'running'
      registry.stop(id)
      rmSync(join(resolvePagesDir(), id), { recursive: true, force: true })
      ensureDefaultOpenclawPage()
      ensureBuiltinPages()
      registry.reconcile()
      // A reset of a RUNNING page should land back where the user left it, not in 已停止.
      if (wasRunning) {
        registry
          .start(id)
          .catch((err) => console.error(`[page:${id}] reset auto-start failed:`, err))
      }
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.SetPagePort, (_e, id: string, port?: number): IpcResult => {
    try {
      const clear = port === undefined || port === null || Number(port) === 0
      if (!clear && !isValidPort(port)) return { ok: false, error: m('ipc.portRange') }
      const pagePorts = { ...getSettings().pagePorts }
      if (clear) delete pagePorts[id]
      else pagePorts[id] = Number(port)
      updateSettings({ pagePorts })
      registry.reconcile()
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  // #4: override a page's dependency list without touching its container.json. Rejects a set
  // that would introduce a cycle across the whole registry (the saved graph, not just this row),
  // so `startWithDeps` can never be handed a loop by panel wiring.
  ipcMain.handle(IPC.SetPageDeps, (_e, id: string, deps?: string[]): IpcResult => {
    try {
      const pageDeps = { ...getSettings().pageDeps }
      const next = Array.isArray(deps)
        ? [...new Set(deps.map((d) => String(d).trim()).filter((d) => d && d !== id))]
        : []
      const cleaned: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(pageDeps)) if (k !== id && Array.isArray(v)) cleaned[k] = v
      if (next.length) cleaned[id] = next
      // Build the effective graph from current metas (whose dependsOn already reflects prior
      // overrides) and swap in the proposed row, then DFS for any back-edge.
      const graph: Record<string, string[]> = {}
      for (const p of registry.list()) graph[p.id] = p.id === id ? next : [...(p.dependsOn ?? [])]
      // Guarantee the edited node exists even when it is not (yet) in the registry — otherwise a DFS
      // from `id` reads `graph[id] ?? []`, finds no edges and silently skips the cycle check, letting
      // a loop be written into settings for a page mid-uninstall / not-yet-reconciled / IPC-direct.
      graph[id] = next
      const cycle = findDepCycle(graph, id)
      if (cycle) return { ok: false, error: m('ipc.depsCycle', { chain: cycle.join(' → ') }) }
      updateSettings({ pageDeps: cleaned })
      registry.reconcile()
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.OpenPageExternal, async (_e, url: string): Promise<IpcResult> => {
    try {
      await shell.openExternal(url)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  // Port-conflict recovery: the failed start named its holder (PageState.portHolder), so the
  // panel offers a one-click "kill it and retry" — kill returns whether anything was found.
  ipcMain.handle(IPC.KillPortHolder, async (_e, port: number): Promise<IpcResult> => {
    try {
      const n = Number(port)
      if (!Number.isFinite(n) || n < 1 || n > 65535) return fail(new Error(m('ipc.portRange')))
      return ok(await killPortHolder(n))
    } catch (err) {
      return fail(err)
    }
  })

  // Port pre-flight for the page config dialog: ask the OS whether the port can be bound before
  // the user starts the page. `pageId` is the page being edited — when that page is itself
  // running on the port, the listener is its own and there is no conflict to warn about.
  ipcMain.handle(
    IPC.CheckPortFree,
    async (_e, port: number, pageId?: string): Promise<IpcResult<PortCheckResult>> => {
      try {
        const n = Number(port)
        if (!isValidPort(n)) return fail(new Error(m('ipc.portRange')))
        const bind = await probePortBind(n)
        if (bind === 'free') return ok({ port: n, free: true })
        const holder = await findPortHolder(n)
        if (bind === 'error' && !holder) return ok({ port: n, free: false, probeError: true })
        if (holder && pageId && registry.get(pageId)?.pid === holder.pid) {
          return ok({ port: n, free: true })
        }
        return ok({ port: n, free: false, ...(holder ? { holder } : {}), ...(bind === 'error' ? { probeError: true } : {}) })
      } catch (err) {
        return fail(err)
      }
    }
  )

  // Env-root facts for the 环境目录 rows: the fixed root every '@install' dir lands under,
  // plus the OS home so the renderer can expand `~` in declared defaults.
  ipcMain.handle(IPC.EnvRoot, (): IpcResult => {
    return ok({
      envRoot: resolveEnvRoot(),
      installDir: resolveInstallDir(),
      home: homedir()
    })
  })

  // The effective webview download folder + the OS default an empty override falls back to,
  // so the Settings panel can show a real placeholder and a "reveal current" value.
  ipcMain.handle(IPC.DownloadDir, (): IpcResult =>
    ok({
      downloadDir: resolveDownloadDir(),
      defaultDir: defaultDownloadDir(),
      custom: Boolean((getSettings().downloadDir || '').trim())
    })
  )
}

/**
 * Depth-first search for a dependency cycle reachable from `start` in the effective graph.
 * Returns the offending chain (e.g. [a, b, a]) when re-visiting a node still on the current
 * path, else null. Deps pointing at unknown/uninstalled ids are ignored (they can't close a
 * loop here, and `ensureDeps` already tolerates an optional dep that is simply absent).
 */
export function findDepCycle(graph: Record<string, string[]>, start: string): string[] | null {
  const path: string[] = []
  const onPath = new Set<string>()
  const visited = new Set<string>()
  const walk = (node: string): string[] | null => {
    if (onPath.has(node)) return [...path, node]
    if (visited.has(node)) return null
    visited.add(node)
    onPath.add(node)
    path.push(node)
    for (const dep of graph[node] ?? []) {
      if (graph[dep] === undefined) continue // unknown dep id: no edges out of it here
      const found = walk(dep)
      if (found) return found
    }
    path.pop()
    onPath.delete(node)
    return null
  }
  return walk(start)
}
