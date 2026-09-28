import { describe, expect, it } from 'vitest'
import { parseNetstatListen, parseLsofList } from '../src/main/runtime/diagnostics/port-holder'

/**
 * The two pure parsers behind the port / process manager (see port-table.ts / PortTable.vue). They
 * take the raw stdout of `netstat -ano -p tcp` / `lsof -nP -iTCP -sTCP:LISTEN` and fold it into
 * per-port LISTENing entries. Keeping them pure (no spawn, no electron) is the whole point of the
 * extraction, so the OS quirks — v4 + v6 rows for one socket, the header line, an ESTABLISHED row,
 * a truncated/garbage line — are locked down here without ever running a command.
 */

describe('parseNetstatListen', () => {
  const SAMPLE = [
    '',
    'Active Connections',
    '',
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1080',
    '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       4321',
    '  TCP    [::]:3000              [::]:0                 LISTENING       4321',
    '  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4',
    // Not a listener: must never appear.
    '  TCP    127.0.0.1:5000         127.0.0.1:5001         ESTABLISHED     9999',
    // A LISTENING row with a non-numeric / absent PID column: skipped.
    '  TCP    LISTENING'
  ].join('\r\n')

  it('collects every LISTENING port and ignores header / established / malformed rows', () => {
    const out = parseNetstatListen(SAMPLE)
    const ports = out.map((e) => e.port).sort((a, b) => a - b)
    expect(ports).toEqual([135, 445, 3000])
    expect(out.find((e) => e.port === 5000)).toBeUndefined()
  })

  it('merges the v4 and v6 rows of one socket into a single entry with the shared pid', () => {
    const e = parseNetstatListen(SAMPLE).find((x) => x.port === 3000)
    expect(e).toBeTruthy()
    expect(e!.pids).toEqual([4321])
    // The first row pushed (127.0.0.1) fixes the family/address for the merged entry.
    expect(e!.family).toBe(4)
    expect(e!.address).toBe('127.0.0.1:3000')
  })

  it('derives family 6 for a bracketed IPv6-only listener', () => {
    const out = parseNetstatListen('  TCP    [::]:8080    [::]:0    LISTENING    77')
    expect(out[0]).toMatchObject({ port: 8080, family: 6, pids: [77] })
  })

  it('narrows to one port when onlyPort is given', () => {
    const out = parseNetstatListen(SAMPLE, 445)
    expect(out).toHaveLength(1)
    expect(out[0].port).toBe(445)
    expect(out[0].pids).toEqual([4])
  })

  it('returns nothing for empty / whitespace-only output', () => {
    expect(parseNetstatListen('')).toEqual([])
    expect(parseNetstatListen('   \r\n  \r\n')).toEqual([])
  })

  it('drops a row whose pid is 0 or non-numeric', () => {
    expect(parseNetstatListen('  TCP    0.0.0.0:99    0.0.0.0:0    LISTENING    0')).toEqual([])
  })
})

describe('parseLsofList', () => {
  const SAMPLE = [
    'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
    'node    12345 user   18u  IPv4 0x1111      0t0  TCP *:3000 (LISTEN)',
    'node    12345 user   19u  IPv6 0x2222      0t0  TCP [::1]:3000 (LISTEN)',
    'Python   2222 user    3u  IPv4 0x3333      0t0  TCP 127.0.0.1:8000 (LISTEN)',
    // A non-listener row (no "(LISTEN)") is filtered by the caller's -sTCP, but the parser guards too.
    'curl     555 user    4u  IPv4 0x4444      0t0  TCP 127.0.0.1:9:127.0.0.1:8000'
  ].join('\n')

  it('skips the header and yields each LISTENing port', () => {
    const out = parseLsofList(SAMPLE)
    expect(out.map((e) => e.port).sort((a, b) => a - b)).toEqual([3000, 8000])
  })

  it('merges duplicate pids for the same port (v4 + v6 sockets)', () => {
    const e = out3000()
    expect(e.pids).toEqual([12345])
    // '*:3000' has a single colon → treated as family 4 by the shared push rule.
    expect(e.family).toBe(4)
  })

  it('honors onlyPort', () => {
    const out = parseLsofList(SAMPLE, 8000)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ port: 8000, pids: [2222] })
  })

  it('returns nothing for empty output and for header-only output', () => {
    expect(parseLsofList('')).toEqual([])
    expect(parseLsofList('COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME')).toEqual([])
  })

  function out3000(): { port: number; family: 4 | 6; pids: number[] } {
    const e = parseLsofList(SAMPLE).find((x) => x.port === 3000)
    if (!e) throw new Error('no 3000 entry')
    return e
  }
})
