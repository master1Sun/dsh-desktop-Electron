import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
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

describe('B1 sha512 content verification', () => {
  // verifyStagedIntegrity resolves through updatesRoot() — the same fixed temp root as above.
  const root = join(dirname(exePath), 'resources', 'updates')
  const commit = 'deadbeefcafebabe'
  const stagedZip = () => join(root, commit, 'app.zip')

  function writeStaged(zipBody: Buffer, meta: Record<string, unknown>): void {
    rmSync(root, { recursive: true, force: true })
    mkdirSync(join(root, commit), { recursive: true })
    writeFileSync(stagedZip(), zipBody)
    // A real staged asar would sit beside the zip; verifyStagedIntegrity only reads the zip.
    writeFileSync(join(root, 'update-meta.json'), JSON.stringify({ pendingAsar: join(commit, 'app.asar'), ...meta }))
  }

  it('sha512OfFile streams the same digest node:crypto computes in one shot', async () => {
    mkdirSync(root, { recursive: true })
    const body = Buffer.from('dsh asar payload '.repeat(10_000))
    const p = join(root, 'hash-me.bin')
    writeFileSync(p, body)
    const want = createHash('sha512').update(body).digest('hex')
    expect(await asar.sha512OfFile(p)).toBe(want)
    rmSync(root, { recursive: true, force: true })
  })

  it('verifyStagedIntegrity passes when the staged zip matches meta.sha512', async () => {
    const body = Buffer.from('good zip bytes')
    writeStaged(body, { sha512: createHash('sha512').update(body).digest('hex'), version: '9.9.9' })
    expect(await asar.verifyStagedIntegrity()).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('verifyStagedIntegrity fails on a tampered or missing zip', async () => {
    const body = Buffer.from('good zip bytes')
    writeStaged(body, { sha512: 'f'.repeat(128), version: '9.9.9' })
    expect(await asar.verifyStagedIntegrity()).toBe(false)
    rmSync(stagedZip(), { force: true }) // zip deleted after staging: also unverifiable
    expect(await asar.verifyStagedIntegrity()).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('verifyStagedIntegrity lets pre-hash releases through (no meta.sha512 = legacy contract)', async () => {
    writeStaged(Buffer.from('legacy zip'), { version: '9.9.8' })
    expect(await asar.verifyStagedIntegrity()).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})
