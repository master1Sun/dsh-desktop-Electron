import { describe, expect, it } from 'vitest'
import { isoShanghai } from '../src/main/shell/time'

/**
 * The whole point of isoShanghai is cross-machine consistency: a fixed UTC+8 render
 * that never depends on the host OS timezone. These guard that contract, not the
 * wall-clock itself.
 */
describe('isoShanghai', () => {
  it('renders a UTC instant as Asia/Shanghai wall-clock with a +08:00 offset', () => {
    expect(isoShanghai(new Date('2026-09-22T02:30:00.000Z'))).toBe('2026-09-22T10:30:00.000+08:00')
  })

  it('is independent of the host process TZ', () => {
    const instant = Date.UTC(2026, 0, 1, 0, 0, 0)
    expect(isoShanghai(new Date(instant))).toBe('2026-01-01T08:00:00.000+08:00')
  })

  it('keeps the toISOString shape so snapshot/diagnostic filename slicing still works', () => {
    const ts = isoShanghai(new Date('2026-09-22T02:30:00.000Z')).replace(/[:.]/g, '-').slice(0, 19)
    expect(ts).toBe('2026-09-22T10-30-00')
  })
})
