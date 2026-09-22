import { DISPLAY_TIME_ZONE } from '../../shared/types'

/**
 * Single source of truth for human-facing timestamps.
 *
 * Every emitted time — log stamps, exported bundle fields, snapshot/diagnostic file
 * names, migration markers — renders in {@link DISPLAY_TIME_ZONE} regardless of the
 * host OS timezone, so field reports from different machines line up. The zone id is
 * shared with the renderer, so main and UI never drift.
 *
 * The result keeps `Date#toISOString`'s `YYYY-MM-DDTHH:mm:ss.sss±HH:mm` shape, so the
 * existing `.replace(/[:.]/g, '-').slice(0, 19)` filename transforms keep working
 * unchanged while the wall-clock they encode is the display zone's.
 */

/** Whole-minute UTC offset of {@link DISPLAY_TIME_ZONE} at instant `d`, via Intl (DST-safe). */
function zoneOffsetMs(d: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value
  const hour = p.hour === '24' ? 0 : Number(p.hour) // Intl can render midnight as 24
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second)
  // Floor to whole seconds so sub-second noise never skews a minute-granularity offset.
  return asUTC - Math.floor(d.getTime() / 1000) * 1000
}

/** ISO-8601 timestamp expressed in {@link DISPLAY_TIME_ZONE}, e.g. `2026-09-22T10:30:00.123+08:00`. */
export function isoShanghai(d: Date = new Date()): string {
  const offset = zoneOffsetMs(d)
  const shifted = new Date(d.getTime() + offset)
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const hh = String(Math.floor(abs / 3_600_000)).padStart(2, '0')
  const mm = String(Math.floor((abs % 3_600_000) / 60_000)).padStart(2, '0')
  return `${shifted.toISOString().replace('Z', '')}${sign}${hh}:${mm}`
}
