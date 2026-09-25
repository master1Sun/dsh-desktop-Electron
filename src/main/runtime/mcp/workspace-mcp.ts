/**
 * The container-owned "dsh-workspace" MCP server: the read/write face of the shared context.
 *
 * runtime/workspace.ts owns the document and hands agents a *pointer* to it; this module turns
 * that pointer into a callable contract by shipping a dependency-free stdio MCP server that any
 * MCP-speaking agent spawns from the bridge (mcp-servers.json / codex config.toml). Keeping the
 * two apart means the file format and the wire protocol can evolve independently, and the hub
 * stays agnostic of what this particular server does.
 *
 * It is deliberately NOT one of the curated npm servers (mcp-hub LOCKED/SEED + BUILTIN_MCP_PKG):
 * those are downloaded packages launched through the bundled node. This is a script the container
 * writes next to the bridge files, so it bypasses the package-provisioning machinery entirely and
 * is gated by the same sharedWorkspace master switch the env pointers use.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getNodeExePath } from '../cli/node-runtime'
import { bridgeDir } from './mcp-bridge'
import { isSharedWorkspaceEnabled, workspaceDir, workspaceFile } from './workspace'
import { m } from '../../shell/i18n'
import type { McpServerSpec } from '../../../shared/types'
// Vite inlines the server source as a string at build time; we write it to userData at runtime
// because the bundled node.exe cannot read into app.asar (see workspace-server.mjs header).
import WORKSPACE_SERVER_SOURCE from './workspace-server.mjs?raw'

/** Stable slug id; also the tool-namespace prefix agents see (dsh-workspace/workspace_read…). */
export const WORKSPACE_MCP_ID = 'dsh-workspace'

/** Where the embedded server is materialized so a plain node.exe can run it (outside the asar). */
export function workspaceServerFile(): string {
  return join(bridgeDir(), 'workspace-server.mjs')
}

/** Content last written; the source is static, so this makes the write happen at most once. */
let writtenSource = ''

/**
 * Write the server script into the bridge dir when it is missing or changed, returning its path.
 * Best-effort: a read-only userData still yields a path, and the row simply fails to connect.
 */
export function ensureWorkspaceServerScript(): string {
  const file = workspaceServerFile()
  if (writtenSource !== WORKSPACE_SERVER_SOURCE || !existsSync(file)) {
    try {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, WORKSPACE_SERVER_SOURCE, 'utf8')
      writtenSource = WORKSPACE_SERVER_SOURCE
    } catch {
      /* leave the row present but unconnectable; export stays best-effort like the env pointers */
    }
  }
  return file
}

/**
 * The code-owned hub row for the shared-context server, or null when the master switch is off
 * (then agents get neither the env pointers nor this server, so they never see the shared memory).
 * The command is the bundled node when provisioned, else a PATH `node` for a first run before the
 * runtime download — a connect failure then just flags the row, it never breaks the spawn path.
 */
export function workspaceMcpSpec(): McpServerSpec | null {
  if (!isSharedWorkspaceEnabled()) return null
  const script = ensureWorkspaceServerScript()
  let command = 'node'
  try {
    command = getNodeExePath()
  } catch {
    /* bundled runtime not provisioned yet: fall back to a PATH node */
  }
  return {
    id: WORKSPACE_MCP_ID,
    name: m('mcp.builtin.dsh-workspace.name'),
    command,
    args: [script],
    env: { DSH_WORKSPACE_FILE: workspaceFile(), DSH_WORKSPACE_DIR: workspaceDir() },
    enabled: true,
    autoStart: true,
    builtin: true
  }
}
