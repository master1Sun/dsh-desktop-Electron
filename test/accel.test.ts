import { describe, it, expect } from 'vitest'
import {
  acceleratorFromEvent,
  formatAccelerator,
  matchesAccelerator,
  normalizeCode,
  normalizeKey,
  parseAccelerator
} from '../src/shared/accel'

/**
 * C1's shared vocabulary. The shell matches a real `KeyboardEvent`, the main process matches a
 * webview's `before-input-event`, and Settings writes what the user recorded — all three go
 * through these helpers, so the parsing rules are the contract that keeps them agreeing.
 */

describe('parseAccelerator', () => {
  it('splits modifiers from the key in any order', () => {
    expect(parseAccelerator('Ctrl+K')).toEqual({ key: 'k', ctrl: true, shift: false, alt: false, meta: false })
    expect(parseAccelerator('Shift+Ctrl+Enter')).toEqual({
      key: 'enter',
      ctrl: true,
      shift: true,
      alt: false,
      meta: false
    })
  })

  it('accepts the Electron spellings a user can type or a menu can publish', () => {
    expect(parseAccelerator('CmdOrCtrl+Shift+P')?.ctrl).toBe(true)
    expect(parseAccelerator('Command+K')?.meta).toBe(true)
    expect(parseAccelerator('Option+J')?.alt).toBe(true)
    expect(parseAccelerator('ctrl+`')?.key).toBe('`')
  })

  it('refuses anything that would eat the hosted page’s keyboard', () => {
    // A bare modifier, a lone letter, an unknown word: none are usable, so none may be bound.
    expect(parseAccelerator('Ctrl')).toBeNull()
    expect(parseAccelerator('K')).toBeNull()
    expect(parseAccelerator('Hyper+K')).toBeNull()
    expect(parseAccelerator('')).toBeNull()
    expect(parseAccelerator(null)).toBeNull()
  })

  it('allows an unmodified dedicated key', () => {
    expect(parseAccelerator('F12')?.key).toBe('f12')
    expect(parseAccelerator('Esc')?.key).toBe('esc')
  })

  it('keeps a trailing + as the key', () => {
    expect(parseAccelerator('Ctrl++')).toEqual({ key: '+', ctrl: true, shift: false, alt: false, meta: false })
  })
})

describe('matchesAccelerator', () => {
  it('requires an exact modifier set, not a superset', () => {
    const accel = 'Ctrl+K'
    expect(matchesAccelerator(accel, { key: 'k', ctrl: true })).toBe(true)
    expect(matchesAccelerator(accel, { key: 'k' })).toBe(false)
    expect(matchesAccelerator(accel, { key: 'k', ctrl: true, shift: true })).toBe(false)
  })

  it('consults event.code only when the event carries no key', () => {
    expect(matchesAccelerator('Ctrl+2', { key: '', code: 'Digit2', ctrl: true })).toBe(true)
    // A shifted symbol is matched by the character it produced, not by the physical digit — which
    // is also what the Settings recorder stores for that press, so both sides keep agreeing.
    expect(matchesAccelerator('Ctrl+2', { key: '@', code: 'Digit2', ctrl: true })).toBe(false)
    expect(matchesAccelerator('Ctrl+@', { key: '@', code: 'Digit2', ctrl: true })).toBe(true)
  })

  it('never matches an unbound action', () => {
    // '' is a deliberate unbind; `eventsTimeline` ships without a key. Both must be inert rather
    // than matching every keystroke.
    expect(matchesAccelerator('', { key: 'k', ctrl: true })).toBe(false)
    expect(matchesAccelerator(undefined, { key: 'Escape' })).toBe(false)
  })
})

describe('normalize', () => {
  it('maps the verbose DOM key/code spellings onto the stored vocabulary', () => {
    expect(normalizeKey('Escape')).toBe('esc')
    // The space key's `event.key` is a literal space, and it has to survive as a name.
    expect(normalizeKey(' ')).toBe('space')
    expect(normalizeKey('ArrowUp')).toBe('up')
    expect(normalizeCode('KeyQ')).toBe('q')
    expect(normalizeCode('Digit7')).toBe('7')
    expect(normalizeCode('Backquote')).toBe('`')
    expect(normalizeCode('')).toBe('')
    expect(normalizeKey('')).toBe('')
  })
})

describe('acceleratorFromEvent', () => {
  it('round-trips a recorded combo through parse and format', () => {
    const accel = acceleratorFromEvent({ key: 'P', code: 'KeyP', ctrl: true, shift: true })
    expect(accel).toBe('Ctrl+Shift+p')
    expect(parseAccelerator(accel)?.key).toBe('p')
    expect(parseAccelerator(accel)?.shift).toBe(true)
    expect(formatAccelerator(accel)).toBe('Ctrl+Shift+P')
  })

  it('returns nothing for a bare modifier press', () => {
    expect(acceleratorFromEvent({ key: 'Control', ctrl: true })).toBe('')
    expect(acceleratorFromEvent({ key: 'Shift', shift: true })).toBe('')
  })

  it('keeps a dedicated key unmodified binding recordable', () => {
    expect(acceleratorFromEvent({ key: 'F9' })).toBe('F9')
    expect(acceleratorFromEvent({ key: 'Escape' })).toBe('Esc')
  })
})
