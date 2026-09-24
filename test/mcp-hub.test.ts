import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { McpCallEvent } from '../src/shared/types'

// mcp-hub imports the events/logger chain (electron app) at module level; stub it the
// same way pages.lifecycle.test.ts does so the pure helpers can be imported in node.
vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: () => join(tmpdir(), 'dsh-container-mcp-test'),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    ipcMain: { on: () => undefined },
    shell: { openPath: () => Promise.resolve('') }
  }
  return { ...stub, default: stub }
})

import { isValidMcpId, sanitizeMcpSpec, flattenToolContent } from '../src/main/runtime/mcp-hub'
import { mcpToolKey } from '../src/shared/types'

// electron-store gets constructed once the built-in rows are reconciled; back it with
// an in-memory map (same pattern as pages.lifecycle.test.ts) so no real userData is touched.
vi.mock('electron-store', () => ({
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
}))

import {
  LOCKED_MCP_IDS,
  SEED_MCP_IDS,
  CURATED_MCP_IDS,
  lockedMcpSpecs,
  listServers,
  removeServer,
  saveServer,
  callTool,
  getCalls,
  hubEvents
} from '../src/main/runtime/mcp-hub'

describe('curated MCP servers (one locked + seeded editable defaults)', () => {
  it('locks only filesystem as a read-only npx row', () => {
    const specs = lockedMcpSpecs()
    expect(specs.map((s) => s.id)).toEqual(['filesystem'])
    for (const s of specs) {
      expect(s.command).toBe('npx')
      expect(s.args?.[0]).toBe('-y')
      expect(s.builtin).toBe(true)
      expect(s.enabled).toBe(true)
      // the locked filesystem row is code-owned and auto-connects at boot
      expect(s.autoStart).toBe(true)
      expect(s.name).toBeTruthy()
    }
    // filesystem is the one row that needs an allowed root: the container's download dir
    const fs = specs.find((s) => s.id === 'filesystem')!
    expect(fs.args?.[1]).toBe('@modelcontextprotocol/server-filesystem')
    expect(fs.args?.[2]).toBeTruthy()
  })

  it('seeds the other curated servers as ordinary (non-locked) rows', () => {
    // ensureSeeded runs via listServers; only filesystem is locked, the rest are user-owned.
    expect([...LOCKED_MCP_IDS]).toEqual(['filesystem'])
    expect(CURATED_MCP_IDS.size).toBe(LOCKED_MCP_IDS.size + SEED_MCP_IDS.size)
    const byId = new Map(listServers().map((s) => [s.spec.id, s]))
    for (const id of SEED_MCP_IDS) {
      const row = byId.get(id)
      expect(row, `seed ${id} should be listed`).toBeTruthy()
      expect(row!.spec.builtin, `seed ${id} must stay editable`).toBeFalsy()
    }
    // credential-gated defaults are seeded disabled; the rest enabled
    expect(byId.get('github')!.spec.enabled).toBe(false)
    expect(byId.get('memory')!.spec.enabled).toBe(true)
  })

  it('lists exactly one row per curated id (locked one wins over a colliding user row)', () => {
    const ids = listServers().map((s) => s.spec.id)
    for (const id of CURATED_MCP_IDS) {
      expect(ids.filter((x) => x === id)).toHaveLength(1)
    }
  })

  it('cannot be forged: sanitize drops a user-supplied builtin flag', () => {
    const { spec } = sanitizeMcpSpec({ id: 'sneaky', command: 'c', builtin: true })
    expect(spec?.builtin).toBeUndefined()
  })

  it('refuses to edit or remove the locked filesystem row', async () => {
    await expect(saveServer({ id: 'filesystem', command: 'npx' })).rejects.toThrow(/内置|built-in/)
    await expect(removeServer('filesystem')).rejects.toThrow(/内置|built-in/)
    expect(listServers().map((s) => s.spec.id)).toContain('filesystem')
  })

  it('lets the user edit a seeded default outright', async () => {
    await saveServer({ id: 'memory', name: 'My Memory', command: 'node', args: ['mine.js'] })
    const row = listServers().find((s) => s.spec.id === 'memory')
    expect(row?.spec.command).toBe('node')
    expect(row?.spec.args).toEqual(['mine.js'])
  })

  it('never resurrects a deleted seed (tombstone)', async () => {
    await removeServer('everything')
    expect(listServers().map((s) => s.spec.id)).not.toContain('everything')
    // a later reconcile (any listServers call) must not re-add a dismissed seed
    expect(listServers().map((s) => s.spec.id)).not.toContain('everything')
  })

  it('persists user rows without leaking the locked row into the store', async () => {
    await saveServer({ id: 'user-own', name: 'Mine', command: 'node', args: ['s.js'] })
    expect(listServers().map((s) => s.spec.id)).toContain('user-own')
    await removeServer('user-own')
    const ids = listServers().map((s) => s.spec.id)
    expect(ids).not.toContain('user-own')
    expect(ids).toContain('filesystem')
  })
})

describe('shared-context server row (code-owned, not a curated npm package)', () => {
  it('is listed as a builtin row while the switch is on, and cannot be edited or removed', async () => {
    const ws = listServers().find((s) => s.spec.id === 'dsh-workspace')
    expect(ws, 'dsh-workspace should be listed while sharedWorkspace is on').toBeTruthy()
    expect(ws!.spec.builtin).toBe(true)
    await expect(saveServer({ id: 'dsh-workspace', command: 'node' })).rejects.toThrow(/内置|built-in/)
    await expect(removeServer('dsh-workspace')).rejects.toThrow(/内置|built-in/)
    // it is code-owned but NOT part of the curated npm set (that would trigger a package download)
    expect(LOCKED_MCP_IDS.has('dsh-workspace')).toBe(false)
    expect(CURATED_MCP_IDS.has('dsh-workspace')).toBe(false)
  })
})

describe('isValidMcpId', () => {
  it('accepts slug-safe ids', () => {
    for (const id of ['fs', 'file-system', 'server_1', 'A2']) {
      expect(isValidMcpId(id)).toBe(true)
    }
  })
  it('rejects ids that could break namespacing or the store', () => {
    for (const id of ['', '-lead', '_lead', 'has space', 'has/slash', 'has.dot', 'x'.repeat(41)]) {
      expect(isValidMcpId(id)).toBe(false)
    }
  })
})

describe('sanitizeMcpSpec', () => {
  it('keeps a valid spec and applies defaults', () => {
    const { spec, errors } = sanitizeMcpSpec({
      id: ' fs ',
      command: ' npx',
      args: ['-y', 'pkg', 42],
      name: ''
    })
    expect(errors).toEqual([])
    expect(spec?.id).toBe('fs')
    expect(spec?.command).toBe('npx')
    // non-string args are dropped, name falls back to id, enabled defaults true
    expect(spec?.args).toEqual(['-y', 'pkg'])
    expect(spec?.name).toBe('fs')
    expect(spec?.enabled).toBe(true)
    expect(spec?.autoStart).toBe(false)
  })
  it('reports every problem instead of half-saving', () => {
    const { spec, errors } = sanitizeMcpSpec({ id: 'bad id', command: '' })
    expect(spec).toBeUndefined()
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })
  it('rejects malformed env keys loudly instead of silently dropping them', () => {
    const { spec, errors } = sanitizeMcpSpec({
      id: 'fs',
      command: 'node',
      env: { GOOD: 'x', '1BAD': 'y' }
    })
    expect(spec).toBeUndefined()
    expect(errors.length).toBe(1)
  })
  it('stringifies env values and drops nullish ones', () => {
    const { spec } = sanitizeMcpSpec({
      id: 'fs',
      command: 'node',
      env: { GOOD: 'x', NUM: 7, NIL: null }
    })
    expect(spec?.env).toEqual({ GOOD: 'x', NUM: '7' })
  })
  it('normalizes empty optional fields to undefined', () => {
    const { spec } = sanitizeMcpSpec({ id: 'fs', command: 'node', env: {}, cwd: '  ' })
    expect(spec?.env).toBeUndefined()
    expect(spec?.cwd).toBeUndefined()
  })
})

describe('flattenToolContent', () => {
  it('joins text blocks with newlines', () => {
    expect(
      flattenToolContent([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' }
      ])
    ).toBe('a\nb')
  })
  it('JSON-inlines non-text blocks so nothing is silently lost', () => {
    const out = flattenToolContent([{ type: 'image', data: 'x', mimeType: 'image/png' }])
    expect(JSON.parse(out)).toMatchObject({ type: 'image', data: 'x' })
  })
  it('tolerates shapes a misbehaving server may send', () => {
    expect(flattenToolContent('plain')).toBe('plain')
    expect(flattenToolContent(undefined)).toBe('')
    expect(flattenToolContent(null)).toBe('')
  })
})

describe('mcpToolKey', () => {
  it('namespaces a tool by its server', () => {
    expect(mcpToolKey('fs', 'read_file')).toBe('fs/read_file')
  })
})

describe('call feed (hub-forwarded tool-call ring buffer)', () => {
  it('records every hub call — a failed one lands as ok:false with the error text', async () => {
    const before = getCalls().length
    const res = await callTool({ serverId: 'no-such-server', tool: 'ping' })
    expect(res.ok).toBe(false)
    const after = getCalls()
    expect(after).toHaveLength(before + 1)
    const last: McpCallEvent = after[after.length - 1]
    expect(last).toMatchObject({ serverId: 'no-such-server', tool: 'ping', ok: false })
    expect(typeof last.err).toBe('string')
    expect(last.at).toBeTypeOf('number')
  })

  it('emits the whole buffered feed on the calls channel for the window broadcast', async () => {
    const seen: McpCallEvent[][] = []
    const listener = (calls: McpCallEvent[]): void => {
      seen.push(calls)
    }
    hubEvents.on('calls', listener)
    try {
      await callTool({ serverId: 'no-such-server', tool: 'x' })
    } finally {
      hubEvents.off('calls', listener)
    }
    expect(seen).toHaveLength(1)
    expect(seen[0][seen[0].length - 1].tool).toBe('x')
  })

  it('keeps the buffer bounded to the newest 200 entries', async () => {
    for (let i = 0; i < 250; i++) await callTool({ serverId: 'no-such-server', tool: `t${i}` })
    const buf = getCalls()
    expect(buf.length).toBeLessThanOrEqual(200)
    // the oldest were dropped: the last recorded call is the newest
    expect(buf[buf.length - 1].tool).toBe('t249')
  })
})
