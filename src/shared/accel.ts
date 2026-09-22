/**
 * Accelerator parsing/matching, shared by the shell window (which matches a real `keydown`)
 * and the main process (which matches an Electron `before-input-event` on a webview guest).
 *
 * Deliberately free of DOM and Electron types: both sides can only agree on a plain
 * `{ key, ctrl, shift, alt, meta }` shape, and `src/shared` is compiled into the main-process
 * bundle too, where the DOM lib is not available.
 *
 * Spelling follows Electron's own accelerator format (`Ctrl+Shift+Enter`, `F12`, `` Ctrl+` ``)
 * so a value stored here can be handed straight to `Menu`/`localShortcut` later without a
 * second vocabulary.
 */

export interface AccelParts {
  /** normalized key: lowercase, `'esc'`, `'space'`, `` '`' ``, `'f12'` … */
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

/** Modifier names accepted in an accelerator, in either spelling. */
const MODIFIERS: Record<string, keyof AccelParts> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  super: 'meta',
  win: 'meta',
  winkeys: 'meta',
  alt: 'alt',
  option: 'alt',
  shift: 'shift'
}

/** Key names whose `event.key` is too verbose to store as-is. */
const KEY_ALIASES: Record<string, string> = {
  escape: 'esc',
  ' ': 'space',
  spacebar: 'space',
  delete: 'del',
  insert: 'ins',
  pageup: 'pgup',
  pagedown: 'pgdn',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  backquote: '`',
  graveaccent: '`',
  plus: '+',
  numpadadd: '+'
}

/** Normalize one `KeyboardEvent.key` / `input.key` value to the stored spelling. */
export function normalizeKey(raw: string | undefined): string {
  // Look the alias table up *before* trimming: the space key's `event.key` is a literal ' ', and
  // trimming first would drop the only value that maps to 'space'.
  const lowered = (raw || '').toLowerCase()
  return KEY_ALIASES[lowered] ?? lowered.trim()
}

/** Normalize a `KeyboardEvent.code` (`` 'KeyK' ``, `` 'Digit3' ``, `` 'Backquote' ``) as a fallback. */
export function normalizeCode(code: string | undefined): string {
  const c = (code || '').trim()
  if (!c) return ''
  const mm = c.match(/^Key([A-Z])$/)
  if (mm) return mm[1].toLowerCase()
  const num = c.match(/^Digit(\d)$/)
  if (num) return num[1]
  return normalizeKey(c)
}

/**
 * Split `'Ctrl+Shift+Enter'` into its parts. Returns null for an empty or unusable string —
 * an unset binding (and `eventsTimeline`, which ships without one) then simply never matches,
 * rather than matching every keypress.
 *
 * A trailing `+` inside a key name is preserved (`'Ctrl++'` → key `'+'`), which is how a
 * user rebinding to plus-sign arrives here.
 */
export function parseAccelerator(accel: string | undefined | null): AccelParts | null {
  const text = (accel || '').trim()
  if (!text) return null
  const parts = text.split(/\+(?=\S)/)
  const key = normalizeKey(parts.pop())
  if (!key) return null
  const out: AccelParts = { key, ctrl: false, shift: false, alt: false, meta: false }
  for (const raw of parts) {
    const name = raw.trim().toLowerCase()
    // 'CmdOrCtrl' / 'CommandOrControl' — the container is Windows-first, treat as Ctrl.
    if (name === 'cmdorctrl' || name === 'commandorcontrol' || name === 'ctrlorcommand') {
      out.ctrl = true
      continue
    }
    const slot = MODIFIERS[name]
    if (slot === 'ctrl' || slot === 'shift' || slot === 'alt' || slot === 'meta') out[slot] = true
    else return null // an unknown modifier means the string isn't a shortcut we understand
  }
  // A bare modifier is not a shortcut, and a lone unmodified letter would eat every keystroke
  // of the hosted page — require at least one modifier unless it's a dedicated key.
  const dedicated = /^f\d{1,2}$/.test(key) || ['esc', 'space', 'tab', 'enter', 'up', 'down', 'left', 'right'].includes(key)
  if (!out.ctrl && !out.alt && !out.meta && !dedicated) return null
  return out
}

export interface KeyEventLike {
  key?: string
  code?: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}

/** True when a key event carries exactly this accelerator (release/echo keyups are filtered upstream). */
export function matchesAccelerator(
  accel: string | undefined | null,
  e: KeyEventLike
): boolean {
  const parts = parseAccelerator(accel)
  if (!parts) return false
  const key = normalizeKey(e.key) || normalizeCode(e.code)
  if (!key || key !== parts.key) return false
  return (
    Boolean(e.ctrl) === parts.ctrl &&
    Boolean(e.shift) === parts.shift &&
    Boolean(e.alt) === parts.alt &&
    Boolean(e.meta) === parts.meta
  )
}

/** Render an accelerator for display: canonical casing, `'—'` for the unset placeholder. */
export function formatAccelerator(accel: string | undefined | null): string {
  const text = (accel || '').trim()
  if (!text) return ''
  const parts = text.split(/\+(?=\S)/)
  const key = parts.pop() || ''
  const mods = parts.map((raw) => {
    const name = raw.trim().toLowerCase()
    if (name === 'cmdorctrl' || name === 'commandorcontrol' || name === 'ctrlorcommand') return 'Ctrl'
    if (name === 'meta' || name === 'cmd' || name === 'command' || name === 'super' || name === 'win') return 'Meta'
    if (name === 'option') return 'Alt'
    return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase()
  })
  const keyLabel = key === 'esc' ? 'Esc' : key === '`' ? '`' : key.length === 1 ? key.toUpperCase() : key
  return [...mods, keyLabel].join('+')
}

/**
 * Collapse a user's keydown into the stored string, so the Settings recorder and the matcher
 * speak the same language. Returns '' for a bare modifier press (nothing to bind yet).
 */
export function acceleratorFromEvent(e: KeyEventLike): string {
  const key = normalizeKey(e.key) || normalizeCode(e.code)
  if (!key) return ''
  if (['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd', 'option'].includes(key)) return ''
  const mods: string[] = []
  if (e.ctrl) mods.push('Ctrl')
  if (e.alt) mods.push('Alt')
  if (e.shift) mods.push('Shift')
  if (e.meta) mods.push('Meta')
  const label = key === 'esc' ? 'Esc' : key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1)
  return [...mods, label].join('+')
}
