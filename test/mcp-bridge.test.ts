import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// mcp-bridge imports electron (app.getPath) + the store chain at module level; stub it
// the same way mcp-hub.test.ts does so the pure helpers run in plain node.
vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: () => join(tmpdir(), 'dsh-container-bridge-test'),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    ipcMain: { on: () => undefined },
    shell: { openPath: () => Promise.resolve('') }
  }
  return { ...stub, default: stub }
})

vi.mock('electron-store', () => {
  return {
    default: class MemoryStore {
      private data = new Map<string, unknown>()
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        for (const [k, v] of Object.entries(opts?.defaults ?? {})) this.data.set(k, v)
      }
      get(key: string): unknown {
        return this.data.get(key)
      }
      set(key: string, value: unknown): void {
        this.data.set(key, value)
      }
      get store(): Record<string, unknown> {
        return Object.fromEntries(this.data)
      }
    }
  }
})

import {
  bridgeCatalogFile,
  buildCatalog,
  buildMcpServersJson,
  detectMcpAgent,
  exportBridgeFiles,
  mergeCodexToml,
  mergeOpenclawMcpConfig,
  renderCodexBlock,
  renderDshMcpPatch,
  syncCodexConfig,
  syncDshMcpPatch,
  syncOpenclawMcpConfig,
  dshMcpPatchFile,
  OPENCLAW_MCP_PREFIX
} from '../src/main/runtime/mcp-bridge'
import type { McpServerSpec, McpToolInfo } from '../src/shared/types'

function spec(over: Partial<McpServerSpec> & { id: string }): McpServerSpec {
  return { name: over.id, command: 'npx', args: [], enabled: true, autoStart: false, ...over }
}
const fsServer = { spec: spec({ id: 'fs', autoStart: true, args: ['-y', 'server-fs', 'D:\\a b'] }), status: 'connected' as const }
const memServer = { spec: spec({ id: 'mem', autoStart: true, env: { K: 'v' } }), status: 'stopped' as const }
const offServer = { spec: spec({ id: 'off', autoStart: true, enabled: false }), status: 'stopped' as const }
// enabled but NOT auto-start: injection now follows `enabled` alone, so this row reaches agents too
const lazyServer = { spec: spec({ id: 'lazy', autoStart: false }), status: 'connected' as const }
const tools: McpToolInfo[] = [
  { serverId: 'fs', name: 'read_file', description: 'read', inputSchema: { type: 'object' } },
  { serverId: 'fs', name: 'list', title: 'Lister' },
  { serverId: 'mem', name: 'phantom' } // a stopped server never really has tools; catalogs must agree
]

describe('buildCatalog', () => {
  it('keeps every enabled spec (auto-start no longer gates injection) and attaches each server its own tools', () => {
    const cat = buildCatalog([fsServer, memServer, offServer, lazyServer], tools)
    // 'off' is disabled → excluded; 'lazy' is enabled-but-not-auto-start → now included.
    expect(cat.servers.map((s) => s.id)).toEqual(['fs', 'mem', 'lazy'])
    expect(cat.servers[0].tools.map((t) => t.name)).toEqual(['read_file', 'list'])
    expect(cat.servers[0].tools[0].inputSchema).toEqual({ type: 'object' })
    expect(cat.servers[1].tools).toEqual([])
    expect(cat.servers[2].tools).toEqual([])
  })
})

describe('buildMcpServersJson', () => {
  it('emits the --mcp-config shape and omits empty optionals', () => {
    const cat = buildCatalog([fsServer, memServer], tools)
    const json = buildMcpServersJson(cat.servers)
    expect(json.mcpServers.fs).toEqual({ command: 'npx', args: ['-y', 'server-fs', 'D:\\a b'] })
    expect(json.mcpServers.mem).toEqual({ command: 'npx', env: { K: 'v' } })
  })
})

describe('detectMcpAgent', () => {
  it('recognizes codex launch lines only', () => {
    expect(detectMcpAgent('node bin/codex.js')).toBe('codex')
    expect(detectMcpAgent('codex --model gpt')).toBe('codex')
    expect(detectMcpAgent('codex.cmd')).toBe('codex')
    expect(detectMcpAgent('node server.js')).toBeNull()
    expect(detectMcpAgent('')).toBeNull()
  })
})

describe('renderCodexBlock', () => {
  it('renders one table per server with TOML-escaped strings', () => {
    const cat = buildCatalog([fsServer, memServer], tools)
    const block = renderCodexBlock(cat.servers)
    expect(block).toContain('[mcp_servers.fs]')
    expect(block).toContain('command = "npx"')
    expect(block).toContain('args = ["-y", "server-fs", "D:\\\\a b"]')
    expect(block).toContain('[mcp_servers.mem.env]')
    expect(block).toContain('K = "v"')
    expect(block).not.toContain('mcp_servers.off')
  })
})

describe('mergeCodexToml', () => {
  const cat = buildCatalog([fsServer, memServer], tools)

  it('appends the block to a user file and keeps their content', () => {
    const out = mergeCodexToml('model = "gpt-5"\n', cat.servers)
    expect(out).toContain('model = "gpt-5"')
    expect(out).toContain('[mcp_servers.fs]')
  })

  it('replaces only the managed block on the next sync', () => {
    const first = mergeCodexToml('model = "gpt-5"\n', cat.servers)
    const second = mergeCodexToml(first, buildCatalog([fsServer], tools).servers)
    expect(second.match(/model = "gpt-5"/g)).toHaveLength(1)
    expect(second).toContain('[mcp_servers.fs]')
    expect(second).not.toContain('[mcp_servers.mem]')
    expect(second.match(/dsh-mcp-bridge >>>/g)).toHaveLength(1)
  })

  it('creates the block for an empty file', () => {
    const out = mergeCodexToml('', cat.servers)
    expect(out).toContain('[mcp_servers.fs]')
    expect(out.match(/dsh-mcp-bridge >>>/g)).toHaveLength(1)
  })

  it('drops generated tables the user defined by hand outside the block', () => {
    const user = '[mcp_servers.fs]\ncommand = "custom"\n\n'
    const out = mergeCodexToml(user, cat.servers)
    expect(out.match(/\[mcp_servers\.fs\]/g)).toHaveLength(1)
    expect(out).toContain('command = "custom"')
    expect(out).toContain('[mcp_servers.mem]')
  })
})

describe('bridge IO', () => {
  it('exportBridgeFiles writes both catalog documents', () => {
    exportBridgeFiles([fsServer, memServer, offServer], tools)
    const cat = JSON.parse(readFileSync(bridgeCatalogFile(), 'utf8')) as {
      servers: Array<{ id: string; tools: unknown[] }>
    }
    expect(cat.servers.map((s) => s.id)).toEqual(['fs', 'mem'])
    expect(existsSync(join(tmpdir(), 'dsh-container-bridge-test', 'mcp-bridge', 'mcp-servers.json'))).toBe(
      true
    )
  })

  it('syncCodexConfig writes config.toml into the given home', () => {
    const home = join(tmpdir(), 'dsh-container-bridge-test', 'codex-home')
    const file = syncCodexConfig(buildCatalog([fsServer], tools).servers, home)
    expect(file).toBe(join(home, 'config.toml'))
    expect(readFileSync(file, 'utf8')).toContain('[mcp_servers.fs]')
  })
})

describe('mergeOpenclawMcpConfig', () => {
  const cat = buildCatalog([fsServer, memServer], tools)
  it('writes namespaced stdio entries and preserves unrelated + user servers', () => {
    const base = {
      gateway: { mode: 'local', port: 18789 },
      mcp: { servers: { mything: { command: 'custom' } } }
    }
    const out = mergeOpenclawMcpConfig(base, cat.servers) as {
      gateway: unknown
      mcp: { servers: Record<string, { command: string; args?: string[]; env?: Record<string, string>; enabled: boolean }> }
    }
    expect(out.gateway).toEqual({ mode: 'local', port: 18789 })
    expect(out.mcp.servers.mything).toEqual({ command: 'custom' })
    expect(out.mcp.servers[`${OPENCLAW_MCP_PREFIX}fs`]).toEqual({
      command: 'npx',
      args: ['-y', 'server-fs', 'D:\\a b'],
      enabled: true
    })
    expect(out.mcp.servers[`${OPENCLAW_MCP_PREFIX}mem`].env).toEqual({ K: 'v' })
  })
  it('prunes only the managed set on re-sync, so a dropped hub server disappears', () => {
    const first = mergeOpenclawMcpConfig({}, cat.servers)
    const second = mergeOpenclawMcpConfig(first, buildCatalog([fsServer], tools).servers) as {
      mcp: { servers: Record<string, unknown> }
    }
    expect(Object.keys(second.mcp.servers).sort()).toEqual([`${OPENCLAW_MCP_PREFIX}fs`])
  })
  it('strips a redundant leading dsh- so dsh-workspace lands as dsh__workspace', () => {
    const ws = buildCatalog(
      [{ spec: spec({ id: 'dsh-workspace', autoStart: true }), status: 'stopped' as const }],
      []
    )
    const out = mergeOpenclawMcpConfig({}, ws.servers) as { mcp: { servers: Record<string, unknown> } }
    expect(Object.keys(out.mcp.servers)).toEqual([`${OPENCLAW_MCP_PREFIX}workspace`])
  })
})

describe('syncOpenclawMcpConfig', () => {
  it('merges into an existing openclaw.json and keeps the gateway block', () => {
    const dir = join(tmpdir(), 'dsh-container-bridge-test', 'oc-home')
    const file = join(dir, 'openclaw.json')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify({ gateway: { mode: 'local' } }), 'utf8')
    syncOpenclawMcpConfig(buildCatalog([fsServer], tools).servers, file)
    const cfg = JSON.parse(readFileSync(file, 'utf8')) as { gateway: unknown; mcp: { servers: Record<string, unknown> } }
    expect(cfg.gateway).toEqual({ mode: 'local' })
    expect(cfg.mcp.servers[`${OPENCLAW_MCP_PREFIX}fs`]).toBeTruthy()
  })
  it('never clobbers an unparseable (JSON5/comment) config', () => {
    const dir = join(tmpdir(), 'dsh-container-bridge-test', 'oc-json5')
    const file = join(dir, 'openclaw.json')
    mkdirSync(dir, { recursive: true })
    const raw = '{ /* hand edit */ "gateway": { "mode": "local" } }\n'
    writeFileSync(file, raw, 'utf8')
    syncOpenclawMcpConfig(buildCatalog([fsServer], tools).servers, file)
    expect(readFileSync(file, 'utf8')).toBe(raw)
  })
})

describe('dsh --patch overlay', () => {
  const cat = buildCatalog([fsServer, memServer, offServer], tools)
  it('wraps entries in a single insert patch so dsh adds (not modifies) them', () => {
    const patches = renderDshMcpPatch(cat.servers) as Array<{
      id?: string
      insert?: Array<{ id: string; name: string; config: Record<string, unknown> }>
    }>
    // top level must be one id-less `insert` patch (a bare [{id}] array = "not found")
    expect(patches).toHaveLength(1)
    expect(patches[0].id).toBeUndefined()
    const entries = patches[0].insert!
    expect(entries.map((e) => e.id)).toEqual(['dsh-mcp-fs', 'dsh-mcp-mem'])
    expect(entries[0].name).toBe('@deepseek-ai/dsh-mcp-client')
    expect(entries[0].config).toEqual({
      serverName: 'dsh_fs',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-fs', 'D:\\a b']
    })
    expect(entries[1].config.env).toEqual({ K: 'v' })
    // serverName contract: [A-Za-z0-9_-]{1,32}
    for (const e of entries) expect(String(e.config.serverName)).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
  })
  it('drops a redundant leading dsh- so dsh-workspace becomes dsh_workspace, not dsh_dsh-workspace', () => {
    const cat = buildCatalog([{ spec: spec({ id: 'dsh-workspace', autoStart: true }), status: 'stopped' as const }], [])
    const entries = (renderDshMcpPatch(cat.servers) as Array<{ insert: Array<{ id: string; config: Record<string, unknown> }> }>)[0]
      .insert
    expect(entries[0].id).toBe('dsh-mcp-workspace')
    expect(entries[0].config.serverName).toBe('dsh_workspace')
  })
  it('syncDshMcpPatch writes the overlay file, or null when nothing is enabled', () => {
    expect(renderDshMcpPatch([])).toEqual([])
    expect(syncDshMcpPatch([])).toBeNull()
    const file = syncDshMcpPatch(cat.servers)
    expect(file).toBe(dshMcpPatchFile())
    const parsed = JSON.parse(readFileSync(file as string, 'utf8')) as Array<{ insert: unknown[] }>
    expect(parsed).toHaveLength(1)
    expect(parsed[0].insert).toHaveLength(2)
  })
})
