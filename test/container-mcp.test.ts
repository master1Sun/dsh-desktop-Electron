import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// container-mcp-server reaches live main-process objects and pulls in the store / logger /
// events / bridge path chain at module load, so stub electron + electron-store exactly like
// disk-usage.test.ts does and point every named dir at one throwaway userData.
const base = mkdtempSync(join(tmpdir(), 'dsh-cmcp-'))
const P = {
  userData: join(base, 'userData'),
  logs: join(base, 'userData', 'logs'),
  bridge: join(base, 'userData', 'mcp-bridge'),
  workspace: join(base, 'userData', 'workspace')
}

vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: (name: string) => {
        const ud = process.env.DSH_TEST_USERDATA as string
        return name === 'userData' ? ud : join(ud, name)
      },
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    ipcMain: { on: () => undefined, handle: () => undefined, removeAllListeners: () => undefined },
    BrowserWindow: { getAllWindows: () => [] },
    shell: { openPath: () => Promise.resolve('') },
    session: { defaultSession: { cookies: { get: async () => [] } } }
  }
  return { ...stub, default: stub }
})

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    get(): unknown {
      return undefined
    }
    set(): void {
      /* not exercised here */
    }
    get store(): Record<string, unknown> {
      return {}
    }
  }
}))

process.env.DSH_TEST_USERDATA = P.userData
process.env.DSH_WORKSPACE_DIR = P.workspace

import {
  startContainerMcpServer,
  stopContainerMcpServer,
  isContainerMcpServerRunning,
  getContainerMcpServerInfo
} from '../src/main/runtime/container-mcp-server'
import { getContainerEndpoint } from '../src/main/runtime/container-endpoint'
import { buildMcpServersJson } from '../src/main/runtime/mcp-bridge'

const TOOL_NAMES = [
  'container_list_pages',
  'container_get_logs',
  'container_workspace_read',
  'container_workspace_submit',
  'container_workspace_complete',
  'container_list_mcp_tools',
  'container_call_mcp_tool',
  'container_start_page',
  'container_stop_page',
  'container_restart_page'
]

beforeAll(() => {
  mkdirSync(P.logs, { recursive: true })
  mkdirSync(P.bridge, { recursive: true })
  mkdirSync(P.workspace, { recursive: true })
})

afterAll(async () => {
  await stopContainerMcpServer()
  rmSync(base, { recursive: true, force: true })
})

/** A real protocol client against the running server (faithful handshake, bearer in a header). */
async function connectClient(token: string): Promise<Client> {
  const info = getContainerMcpServerInfo()
  expect(info).not.toBeNull()
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(info!.url), {
    requestInit: { headers: { authorization: `Bearer ${token}` } }
  })
  await client.connect(transport)
  return client
}

describe('#11 container MCP server — gating', () => {
  it('starts dark: no listener, no endpoint, and the bridge export excludes the container row', async () => {
    expect(isContainerMcpServerRunning()).toBe(false)
    expect(getContainerMcpServerInfo()).toBeNull()
    expect(getContainerEndpoint()).toBeNull()
    expect(buildMcpServersJson([]).mcpServers['dsh-container']).toBeUndefined()
  })

  it('publishes the endpoint + bearer so the bridge export now carries an authenticated HTTP row', async () => {
    const info = await startContainerMcpServer(() => undefined)
    expect(isContainerMcpServerRunning()).toBe(true)
    expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    expect(existsSync(info.tokenFile)).toBe(true)

    const ep = getContainerEndpoint()
    expect(ep).not.toBeNull()
    const row = buildMcpServersJson([]).mcpServers['dsh-container']
    expect(row?.url).toBe(info.url)
    expect(row?.headers?.authorization).toBe(`Bearer ${ep!.bearerToken}`)
    // The row is HTTP-shaped, not a stdio command.
    expect(row?.command).toBeUndefined()
  })

  it('is idempotent: a second start returns the same live info without a new listener', async () => {
    const again = await startContainerMcpServer(() => undefined)
    expect(again.url).toBe(getContainerMcpServerInfo()!.url)
  })
})

describe('#11 container MCP server — HTTP guard + protocol', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await fetch(getContainerMcpServerInfo()!.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
    expect(res.status).toBe(401)
  })

  it('advertises exactly the container_* toolset over a real handshake', async () => {
    const token = readFileSync(getContainerMcpServerInfo()!.tokenFile, 'utf8')
    const client = await connectClient(token)
    try {
      const { tools } = await client.listTools()
      expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort())
    } finally {
      await client.close()
    }
  })

  it('answers a tool call, and a guarded write path degrades to isError when no registry is ready', async () => {
    const token = readFileSync(getContainerMcpServerInfo()!.tokenFile, 'utf8')
    const client = await connectClient(token)
    try {
      const pages = await client.callTool({ name: 'container_list_pages', arguments: {} })
      expect((pages as { isError?: boolean }).isError).toBe(true)

      const unknown = await client.callTool({ name: 'container_nope', arguments: {} })
      expect((unknown as { isError?: boolean }).isError).toBe(true)
    } finally {
      await client.close()
    }
  })
})

describe('#11 container MCP server — teardown', () => {
  it('stops: clears the listener, endpoint, token file, and prunes the bridge row', async () => {
    await stopContainerMcpServer()
    expect(isContainerMcpServerRunning()).toBe(false)
    expect(getContainerMcpServerInfo()).toBeNull()
    expect(getContainerEndpoint()).toBeNull()
    expect(existsSync(join(P.bridge, 'container-server.token'))).toBe(false)
    expect(buildMcpServersJson([]).mcpServers['dsh-container']).toBeUndefined()
  })
})
