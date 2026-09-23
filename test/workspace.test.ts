import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// workspace.ts → store.ts reads `app.getPath('userData')` for the default root and via
// {envRoot}/{userData} templates; the electron-store mock keeps settings in memory. One scratch
// dir for both, exactly like test/page-env.test.ts.
const scratch = join(tmpdir(), `dsh-container-ws-test-${process.pid}`)
vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => scratch,
      getPath: (name: string) => (name === 'userData' ? scratch : scratch),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    nativeTheme: { shouldUseDarkColors: false },
    ipcMain: { on: () => undefined },
    shell: { openPath: () => Promise.resolve('') }
  }
  return { ...stub, default: stub }
})

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
    delete(key: string): void {
      this.data.delete(key)
    }
    get store(): Record<string, unknown> {
      return Object.fromEntries(this.data)
    }
  }
}))

import { updateSettings } from '../src/main/shell/store'
import {
  normalizeContext,
  workspaceDir,
  workspaceFile,
  workspaceEnvVars,
  readWorkspace,
  writeWorkspace,
  appendWorkspaceNote,
  broadcastWorkspace,
  isSharedWorkspaceEnabled,
  workspaceInfo
} from '../src/main/runtime/workspace'

/**
 * Priority ① — the shared workspace / context layer. The container owns one directory + one
 * `context.json` that every hosted agent discovers through pointer env vars; this covers the
 * contract that has to hold no matter what an agent writes into the shared file.
 */

beforeEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  updateSettings({ workspaceRoot: '', sharedWorkspace: true })
})

describe('normalizeContext', () => {
  it('degrades anything untrustworthy to an empty shape instead of throwing', () => {
    for (const bad of [null, undefined, 42, 'nope', [], {}]) {
      const ctx = normalizeContext(bad)
      expect(ctx.version).toBe(1)
      expect(ctx.task).toBe('')
      expect(ctx.notes).toEqual([])
    }
  })

  it('drops blank notes and fills in defaults on the survivors', () => {
    const ctx = normalizeContext({
      task: 'ship it',
      notes: [
        { text: '  ' },
        { text: 'hello', author: 'codex' },
        { text: 'ts only', ts: 123 },
        'garbage',
        null
      ]
    })
    expect(ctx.task).toBe('ship it')
    expect(ctx.notes).toHaveLength(2)
    expect(ctx.notes[0].author).toBe('codex')
    expect(ctx.notes[0].id).toMatch(/^n/)
    expect(ctx.notes[1].ts).toBe(123)
    expect(ctx.notes[1].author).toBe('agent')
  })
})

describe('workspace paths', () => {
  it('defaults under userData and honors a workspaceRoot override', () => {
    expect(workspaceDir()).toBe(join(scratch, 'workspace'))
    expect(workspaceFile()).toBe(join(scratch, 'workspace', 'context.json'))
    // An absolute override passes through expansion unchanged and wins over the default.
    updateSettings({ workspaceRoot: join(scratch, 'shared') })
    expect(workspaceDir()).toBe(join(scratch, 'shared'))
    expect(workspaceEnvVars().DSH_WORKSPACE_DIR).toBe(join(scratch, 'shared'))
  })
})

describe('read / write round-trip', () => {
  it('read on a fresh workspace yields an empty context and ensures the dir', () => {
    const ctx = readWorkspace()
    expect(ctx.task).toBe('')
    expect(ctx.notes).toEqual([])
  })

  it('writeWorkspace persists a task and stamps updatedAt', () => {
    const saved = writeWorkspace({ task: 'build ①' })
    expect(saved.task).toBe('build ①')
    expect(existsSync(workspaceFile())).toBe(true)
    expect(readWorkspace().task).toBe('build ①')
    expect(JSON.parse(readFileSync(workspaceFile(), 'utf8')).updatedAt).toBeTypeOf('string')
  })

  it('an undefined patch field leaves the stored value untouched', () => {
    writeWorkspace({ task: 'keep me', notes: [{ id: 'a', author: 'x', text: 'note', ts: 1 }] })
    const next = writeWorkspace({ task: 'changed' })
    expect(next.task).toBe('changed')
    expect(next.notes).toHaveLength(1)
  })

  it('appendWorkspaceNote trims, ignores blanks, and attributes the container', () => {
    writeWorkspace({ task: 't', notes: [] })
    const withNote = appendWorkspaceNote({ text: '  shared fact  ' })
    expect(withNote.notes).toHaveLength(1)
    expect(withNote.notes[0].text).toBe('shared fact')
    expect(withNote.notes[0].author).toBe('container')
    // A blank never reaches the shared log.
    expect(appendWorkspaceNote({ text: '   ' }).notes).toHaveLength(1)
  })
})

describe('env injection', () => {
  it('workspaceEnvVars names both pointers and creates the directory', () => {
    const env = workspaceEnvVars()
    expect(env.DSH_WORKSPACE_DIR).toBe(join(scratch, 'workspace'))
    expect(env.DSH_WORKSPACE_FILE).toBe(join(scratch, 'workspace', 'context.json'))
    expect(existsSync(env.DSH_WORKSPACE_DIR)).toBe(true)
  })

  it('workspaceInfo returns locations plus the live context for the panel', () => {
    writeWorkspace({ task: 'visible' })
    const info = workspaceInfo()
    expect(info.dir).toBe(workspaceDir())
    expect(info.file).toBe(workspaceFile())
    expect(info.context.task).toBe('visible')
  })
})

describe('broadcast', () => {
  it('bumps revision, stamps broadcastAt and mirrors the task into the notes', () => {
    writeWorkspace({ task: 'do the thing', notes: [] })
    const before = readWorkspace()
    const after = broadcastWorkspace()
    expect(after.revision).toBe(before.revision + 1)
    expect(after.broadcastAt).toBeTypeOf('string')
    expect(after.notes).toHaveLength(1)
    expect(after.notes[0].text).toContain('do the thing')
    expect(after.notes[0].author).toBe('container')
    // A second broadcast keeps stacking revision + a fresh note.
    expect(broadcastWorkspace().revision).toBe(after.revision + 1)
  })

  it('leaves the revision alone on a plain edit, so only broadcasts move it', () => {
    const b1 = broadcastWorkspace()
    const after = writeWorkspace({ task: 'retitled' })
    expect(after.revision).toBe(b1.revision)
    expect(after.broadcastAt).toBe(b1.broadcastAt)
  })
})

describe('master switch', () => {
  it('is on by default and reads an install predating the setting as on', () => {
    expect(isSharedWorkspaceEnabled()).toBe(true)
    expect(Object.keys(workspaceEnvVars())).toContain('DSH_WORKSPACE_DIR')
  })

  it('withholds both pointers when shared context is disabled', () => {
    updateSettings({ sharedWorkspace: false })
    expect(isSharedWorkspaceEnabled()).toBe(false)
    expect(workspaceEnvVars()).toEqual({})
  })
})
