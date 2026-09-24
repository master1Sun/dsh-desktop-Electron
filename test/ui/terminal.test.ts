import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTerminalStore } from '../../src/renderer/src/stores/terminal'

/**
 * Store-level contract for the VSCode-style terminal: tabs are groups, each holding a split tree of
 * sessions (one PTY per pane). Covers start = new group, split = add a pane (reusing the source's
 * target/shell), close = prune the leaf / collapse a single-child split / drop an emptied group /
 * re-point the active group, the global data buffer that keeps background groups repaintable, the
 * exited-status marker, and the shell id threading through to ptyStart. Nothing is persisted across
 * launches anymore, so the tests assert only in-memory behavior. A minimal preload bridge stands in
 * for the IPC surface.
 */

let ptySeq = 0
let exitCb: ((e: { id: string; code: number }) => void) | null = null
let dataCb: ((e: { id: string; data: string }) => void) | null = null
let started: Array<{ target: string; opts?: { shell?: string } }> = []

function makeContainerMock(): Record<string, unknown> {
  const ok = <T>(data: T): { ok: boolean; data: T } => ({ ok: true, data })
  return {
    ptyStart: (target: string, opts?: { shell?: string }) => {
      started.push({ target, opts })
      return Promise.resolve(ok({ id: `pty-${++ptySeq}`, title: target, cwd: '/tmp' }))
    },
    ptyKill: () => Promise.resolve(ok(true)),
    ptyShells: () => Promise.resolve(ok([])),
    onPtyData: (cb: (e: { id: string; data: string }) => void) => {
      dataCb = cb
      return () => (dataCb = null)
    },
    onPtyExit: (cb: (e: { id: string; code: number }) => void) => {
      exitCb = cb
      return () => (exitCb = null)
    }
  }
}

beforeEach(() => {
  ptySeq = 0
  started = []
  exitCb = null
  dataCb = null
  ;(window as unknown as { container: unknown }).container = makeContainerMock()
  setActivePinia(createPinia())
})

describe('terminal store groups & splits', () => {
  it('start opens a one-leaf group and marks the drawer open', async () => {
    const store = useTerminalStore()
    await store.start('container', 'Shell A')
    expect(store.groups.length).toBe(1)
    expect(store.groups[0].root.kind).toBe('leaf')
    expect(store.open).toBe(true)
    expect(store.activeSession?.title).toBe('Shell A')
  })

  it('start makes independent groups; closing a lone session removes its group', async () => {
    const store = useTerminalStore()
    await store.start('container', 'A')
    await store.start('dsh', 'B')
    expect(store.groups.length).toBe(2)
    store.close(store.groups[0].activeSessionId as string)
    expect(store.groups.length).toBe(1)
    expect(store.sessions.map((s) => s.title)).toEqual(['B'])
  })

  it('split adds a pane inside the same group and reuses its target/shell', async () => {
    const store = useTerminalStore()
    const a = await store.start('container', 'A', 'pwsh')
    await store.split(a.id, 'h')
    expect(store.groups.length).toBe(1)
    expect(store.sessions.length).toBe(2)
    expect(store.groups[0].root.kind).toBe('split')
    expect(started[1]).toEqual({ target: 'container', opts: { shell: 'pwsh' } })
  })

  it('closing one pane of a split collapses back to a leaf and keeps the group', async () => {
    const store = useTerminalStore()
    const a = await store.start('container', 'A')
    const b = await store.split(a.id, 'h')
    store.close(b!.id)
    expect(store.groups.length).toBe(1)
    expect(store.sessions.length).toBe(1)
    expect(store.groups[0].root.kind).toBe('leaf')
    expect(store.activeSession?.title).toBe('A')
  })

  it('closing the active group falls back to another group', async () => {
    const store = useTerminalStore()
    await store.start('container', 'A')
    await store.start('dsh', 'B') // B's group is now active
    store.close(store.activeSession!.id)
    expect(store.groups.length).toBe(1)
    expect(store.activeGroupId).toBe(store.groups[0].id)
    expect(store.activeSession?.title).toBe('A')
  })

  it('closing the last session hides the drawer and clears the active group', async () => {
    const store = useTerminalStore()
    const a = await store.start('container', 'A')
    store.close(a.id)
    expect(store.sessions.length).toBe(0)
    expect(store.groups.length).toBe(0)
    expect(store.open).toBe(false)
    expect(store.activeGroupId).toBeNull()
  })

  it('an exited session is marked exited but kept until closed', async () => {
    const store = useTerminalStore()
    const a = await store.start('container', 'A')
    exitCb?.({ id: a.id, code: 0 })
    expect(a.status).toBe('exited')
    expect(store.sessions.length).toBe(1)
  })

  it('buffers every session stream globally so background groups keep scrollback', async () => {
    const store = useTerminalStore()
    const a = await store.start('container', 'A')
    dataCb?.({ id: a.id, data: 'hello' })
    expect(store.sessionById(a.id)?.buffer).toContain('hello')
  })

  it('trims a background group buffer to the hidden cap while the active one runs full', async () => {
    const store = useTerminalStore()
    const a = await store.start('container', 'A')
    await store.start('dsh', 'B') // B's group becomes active; A is now a background group
    const chunk = 'x'.repeat(2048)
    // Feed far past both caps; A must settle near the hidden ceiling, B near the full one.
    for (let i = 0; i < 400; i++) {
      dataCb?.({ id: a.id, data: chunk })
      dataCb?.({ id: store.activeSession!.id, data: chunk })
    }
    const hiddenLen = store.sessionById(a.id)!.buffer.length
    const activeLen = store.sessionById(store.activeSession!.id)!.buffer.length
    expect(hiddenLen).toBeLessThan(80 * 1024) // MAX_BUFFER_HIDDEN (64K) + one chunk slack
    expect(activeLen).toBeGreaterThan(hiddenLen)
    expect(activeLen).toBeLessThan(300 * 1024) // MAX_BUFFER (256K) + one chunk slack
  })

  it('passes the chosen shell id through to ptyStart (default = none)', async () => {
    const store = useTerminalStore()
    await store.start('container', 'PS', 'powershell')
    expect(started[0]).toEqual({ target: 'container', opts: { shell: 'powershell' } })
    await store.start('container', 'Default')
    expect(started[1].opts).toBeUndefined()
  })
})
