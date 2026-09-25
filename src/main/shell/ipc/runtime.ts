import { ipcMain } from 'electron'
import { IPC, type BuiltinKind, type IpcResult, type UpdateProgress } from '../../../shared/types'
import { getNodeRuntimeInfo } from '../../runtime/cli/node-runtime'
import { listNodeVersions, updateNodeRuntime, restoreBundledNode } from '../../update/node-updater'
import { clearUpdateCache, provisionBuiltin } from '../../update/update-service'
import { refreshBuiltinPackages } from '../../runtime/mcp/mcp-hub'
import { type IpcCtx } from './util'

export function registerRuntimeIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

  ipcMain.handle(IPC.GetNodeInfo, async (): Promise<IpcResult> => {
    try {
      return ok(await getNodeRuntimeInfo())
    } catch (err) {
      return fail(err)
    }
  })

  // Bundled-Node runtime upgrade (关于与更新): list eligible versions, download+install
  // one as the userData override, or drop the override to fall back to the shipped one.
  ipcMain.handle(IPC.ListNodeVersions, async (_e, includeIncompatible?: boolean): Promise<IpcResult> => {
    try {
      return ok(await listNodeVersions(!!includeIncompatible))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.UpdateNodeRuntime, async (e, version: string): Promise<IpcResult> => {
    // Stream progress back to the requesting window only (mirrors PerformUpdate).
    const sender = e.sender
    const onProgress = (p: UpdateProgress): void => {
      if (!sender.isDestroyed()) sender.send(IPC.OnNodeUpdateProgress, p)
    }
    try {
      return ok(await updateNodeRuntime(version, onProgress))
    } catch (err) {
      return fail(err)
    } finally {
      // Guaranteed terminal event. updateNodeRuntime only emits 'done' on success, but the
      // window-level top progress bar (stores/tasks) is fed purely by these events — an error
      // or abort would otherwise leave its row stuck at the last percentage forever. The
      // panels clear their own inline bars via their awaited promise's finally, so this extra
      // 'done' is an idempotent cleanup that only drops the persistent top-bar row.
      onProgress({ name: 'Node', phase: 'done' })
    }
  })

  ipcMain.handle(IPC.RestoreBundledNode, async (): Promise<IpcResult> => {
    try {
      return ok(await restoreBundledNode())
    } catch (err) {
      return fail(err)
    }
  })

  // First-run / on-demand install of a built-in agent runtime (dsh / openclaw). Streams
  // nothing (a 15-min `npm install -g` has no byte progress), so the renderer tracks it as an
  // indeterminate top-bar task; clear the cache so the panel re-reads the now-present version.
  ipcMain.handle(
    IPC.ProvisionBuiltin,
    async (_e, kind: BuiltinKind, version?: string): Promise<IpcResult> => {
      try {
        const res = await provisionBuiltin(kind, version)
        clearUpdateCache()
        // A fresh MCP package download changes what the built-in rows launch — rebuild them
        // (npx fallback → bundled node + local entry) and re-export the agent bridge.
        if (kind === 'mcp') refreshBuiltinPackages()
        // Provisioning clears the `runtimeMissing` badge on the hosted page. Nudge every window to
        // re-list (onStateChanged -> pagesStore.refresh -> ListPages re-probes presence) so the row
        // becomes startable now, without the renderer having to await an install-status IPC itself.
        registry.emitChanged()
        return ok(res)
      } catch (err) {
        return fail(err)
      }
    }
  )
}
