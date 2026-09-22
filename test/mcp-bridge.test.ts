import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'

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
  renderCodexBlock,
  syncCodexConfig
} from '../src/main/runtime/mcp-bridge'
import type { McpServerSpec, McpToolInfo } from '../src/shared/types'

function spec(over: Partial<McpServerSpec> & { id: string }): McpServerSpec {
  return { name: over.id, command: 'npx', args: [], enabled: true, autoStart: false, ...over }
}
const fsServer = { spec: spec({ id: 'fs', args: ['-y', 'server-fs', 'D:\\a b'] }), status: 'connected' as const }
const memServer = { spec: spec({ id: 'mem', env: { K: 'v' } }), status: 'stopped' as const }
const offServer = { spec: spec({ id: 'off', enabled: false }), status: 'stopped' as const }
const tools: McpToolInfo[] = [
  { serverId: 'fs', name: 'read_file', description: 'read', inputSchema: { type: 'object' } },
  { serverId: 'fs', name: 'list', title: 'Lister' },
  { serverId: 'mem', name: 'phantom' } // a stopped server never really has tools; catalogs must agree
]

describe('buildCatalog', () => {
  it('drops disabled specs and attaches each server its own tools', () => {
    const cat = buildCatalog([fsServer, memServer, offServer], tools)
    expect(cat.servers.map((s) => s.id)).toEqual(['fs', 'mem'])
    expect(cat.servers[0].tools.map((t) => t.name)).toEqual(['read_file', 'list'])
    expect(cat.servers[0].tools[0].inputSchema).toEqual({ type: 'object' })
    expect(cat.servers[1].tools).toEqual([])
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
