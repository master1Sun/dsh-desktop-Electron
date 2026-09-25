import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = join(__dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-boot-'))
process.env.DSH_HOME = join(scratch, 'home')
process.env.DSH_PAGES_DIR = join(scratch, 'pages')
mkdirSync(process.env.DSH_HOME, { recursive: true })
mkdirSync(process.env.DSH_PAGES_DIR, { recursive: true })

vi.mock('electron', () => ({
  app: { getAppPath: () => repoRoot, getPath: () => scratch, isPackaged: false }
}))

const { PageRegistry } = await import('../src/main/runtime/pages/pages')
const { createDshPage } = await import('../src/main/runtime/cli/dsh')

function tcpOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port }, () => {
      sock.destroy()
      resolve(true)
    })
    sock.on('error', () => resolve(false))
  })
}

describe.skipIf(!process.env.E2E_DSH_BOOT)('boot a dsh web profile through the registry', () => {
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  it('reaches running and discovers the authenticated launch URL', async () => {
    const id = createDshPage('web', 8899)
    const registry = new PageRegistry({ pagesDir: process.env.DSH_PAGES_DIR, projectDir: repoRoot })
    registry.reconcile()

    const state = await registry.start(id)
    expect(state.status).toBe('running')
    expect(state.launchUrl).toMatch(/^http:\/\/127\.0\.0\.1:8899\/\?token=/)
    expect(await tcpOpen(8899)).toBe(true)

    registry.stop(id)
    await new Promise((r) => setTimeout(r, 1500))
    expect(registry.get(id)?.status).toBe('stopped')
    expect(await tcpOpen(8899)).toBe(false)
  }, 180_000)
})
