import { describe, it, expect, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import * as asar from '../src/main/update/asar-updates'

// updatesRoot() = dirname(app.getPath('exe'))/resources/updates; point it at a temp dir.
const exePath = join(mkdtempSync(join(tmpdir(), 'asar-upd-')), 'electron.exe')
process.env.ASAR_TEST_EXE = exePath

vi.mock('electron', () => ({
  app: {
    getPath: (n: string) => (n === 'exe' ? process.env.ASAR_TEST_EXE! : ''),
    getVersion: () => '0.1.5'
  }
}))

describe('staged asar update clearing', () => {
  const root = join(dirname(exePath), 'resources', 'updates')

  it('clearStagedUpdate drops a pending entry that would otherwise downgrade the app', () => {
    mkdirSync(root, { recursive: true })
    // A size-verified pending asar (>= MIN_ASAR_BYTES) so readStagedUpdate accepts it.
    writeFileSync(join(root, 'app.asar.pending'), Buffer.alloc(1.2 * 1024 * 1024))
    writeFileSync(
      join(root, 'update-meta.json'),
      JSON.stringify({ pendingAsar: 'app.asar.pending', version: '0.1.2', commit: 'abc123' })
    )

    expect(asar.readStagedUpdate()).toEqual({ version: '0.1.2', commit: 'abc123' })

    asar.clearStagedUpdate()

    expect(asar.readStagedUpdate()).toBeNull()
    const meta = JSON.parse(readFileSync(join(root, 'update-meta.json'), 'utf-8'))
    // Only the pending pointer is cleared; the rollback/record fields survive.
    expect(meta.pendingAsar).toBeNull()
    expect(meta.version).toBe('0.1.2')

    rmSync(root, { recursive: true, force: true })
  })
})
