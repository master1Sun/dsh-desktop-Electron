import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type IpcResult, type ContainerMcpInfo, type McpCallToolArgs, type McpCallToolResult, type McpCallEvent, type McpServerSpec, type McpServerState, type McpToolInfo, type WorkspaceContext, type WorkspaceNote, type WorkspaceTask } from '../../../shared/types'
import { listServers as mcpListServers, saveServer as mcpSaveServer, removeServer as mcpRemoveServer, connect as mcpConnect, disconnect as mcpDisconnect, listTools as mcpListTools, callTool as mcpCallTool, getCalls as mcpGetCalls, hubEvents } from '../../runtime/mcp/mcp-hub'
import { bridgeCatalogFile, bridgeConfigFile, bridgeDir } from '../../runtime/mcp/mcp-bridge'
import { getContainerMcpServerInfo, isContainerMcpServerRunning } from '../../runtime/mcp/container-mcp-server'
import { getSettings } from '../store'
import { workspaceInfo, writeWorkspace, broadcastWorkspace } from '../../runtime/mcp/workspace'
import { mcpPackagesStatus } from '../../runtime/mcp/mcp-packages'
import { type IpcCtx } from './util'

export function registerMcpIpc(ctx: IpcCtx): void {
  const { ok, fail } = ctx

  /* ---- MCP Client Hub ----
   * The hub lives independent of the page registry: servers are spawned on
   * demand, their state arrives via hubEvents, and every handler below is a
   * thin pass-through so the panel can manage the whole registry. */
  hubEvents.removeAllListeners('changed') // dev-HMR: one broadcaster wins
  hubEvents.on('changed', (states: McpServerState[]) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnMcpStateChanged, states)
    }
  })

  // The call feed broadcasts the whole ring on each call so a panel opened mid-session and one
  // already open converge on the same view (bounded at 200, so the payload stays small).
  hubEvents.removeAllListeners('calls')
  hubEvents.on('calls', (calls: McpCallEvent[]) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnMcpCalls, calls)
    }
  })

  ipcMain.handle(IPC.McpListServers, (): IpcResult<McpServerState[]> => {
    try {
      return ok(mcpListServers())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.McpSaveServer, async (_e, spec: McpServerSpec): Promise<IpcResult<McpServerState[]>> => {
    try {
      return ok(await mcpSaveServer(spec))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.McpRemoveServer, async (_e, id: string): Promise<IpcResult<McpServerState[]>> => {
    try {
      return ok(await mcpRemoveServer(id))
    } catch (err) {
      return fail(err)
    }
  })

  // Connect failures surface as IpcResult errors *and* as a state broadcast, so the
  // row flips to 失败 even when the panel's own await swallows the rejection.
  ipcMain.handle(IPC.McpConnect, async (_e, id: string): Promise<IpcResult> => {
    try {
      await mcpConnect(id)
      return ok()
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.McpDisconnect, async (_e, id: string): Promise<IpcResult> => {
    try {
      await mcpDisconnect(id)
      return ok()
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.McpListTools, (_e, serverId?: string): IpcResult<McpToolInfo[]> => {
    try {
      return ok(mcpListTools(serverId))
    } catch (err) {
      return fail(err)
    }
  })

  /** Cold-read the buffered call feed for a freshly-opened panel (live updates ride OnMcpCalls). */
  ipcMain.handle(IPC.GetMcpCalls, (): IpcResult<McpCallEvent[]> => {
    try {
      return ok(mcpGetCalls())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(
    IPC.McpCallTool,
    async (_e, args: McpCallToolArgs): Promise<IpcResult<McpCallToolResult>> => {
      try {
        return ok(await mcpCallTool(args))
      } catch (err) {
        return fail(err)
      }
    }
  )

  /** Where the agent-facing bridge exports live, for the panel's footer hint. */
  ipcMain.handle(IPC.McpBridgeInfo, (): IpcResult => {
    try {
      return ok({ dir: bridgeDir(), catalogFile: bridgeCatalogFile(), configFile: bridgeConfigFile() })
    } catch (err) {
      return fail(err)
    }
  })

  /** #11: whether the container's OWN MCP server is enabled/running, plus its live connection info. */
  ipcMain.handle(IPC.GetContainerMcpInfo, (): IpcResult<ContainerMcpInfo> => {
    try {
      const running = isContainerMcpServerRunning()
      const info = getContainerMcpServerInfo()
      return ok({
        enabled: !!getSettings().containerMcpServer,
        running,
        ...(running && info ? { url: info.url, tokenFile: info.tokenFile } : {})
      })
    } catch (err) {
      return fail(err)
    }
  })

  /** Built-in MCP packages: on-disk provisioning state, so the panel can offer a download. */
  ipcMain.handle(IPC.McpPackagesStatus, (): IpcResult => {
    try {
      return ok(mcpPackagesStatus())
    } catch (err) {
      return fail(err)
    }
  })

  /** Shared workspace: locations + the live container-owned context, for the panel. */
  ipcMain.handle(IPC.WorkspaceGet, (): IpcResult => {
    try {
      return ok(workspaceInfo())
    } catch (err) {
      return fail(err)
    }
  })

  /** Shared workspace: persist a partial edit ({ task?, notes?, tasks? }) and return the stored doc. */
  ipcMain.handle(
    IPC.WorkspaceSave,
    (_e, patch: { task?: string; notes?: WorkspaceNote[]; tasks?: WorkspaceTask[] }): IpcResult<WorkspaceContext> => {
      try {
        return ok(writeWorkspace(patch || {}))
      } catch (err) {
        return fail(err)
      }
    }
  )

  /** Shared workspace: push the current task to running agents (bump revision + log a note). */
  ipcMain.handle(IPC.WorkspaceBroadcast, (): IpcResult<WorkspaceContext> => {
    try {
      return ok(broadcastWorkspace())
    } catch (err) {
      return fail(err)
    }
  })
}
