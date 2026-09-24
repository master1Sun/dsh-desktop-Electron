import { ref, type Ref } from 'vue'
import type { Terminal } from '@xterm/xterm'
import { copyToClipboard } from '@renderer/askAi'

/**
 * Copy / paste for an xterm surface, shared by the split-pane terminal (TerminalPane) and the
 * full-page CLI view (CliTerminalView) — both own a separate xterm instance and neither inherits
 * the other's handlers.
 *
 * Why it exists: xterm v6 wires copy/paste to the *native* `copy`/`paste` DOM events and the
 * browser's built-in right-click menu. None of those reach the user inside Electron — there is no
 * native context menu, and the PTY runs in raw mode so Ctrl+C / Ctrl+V are delivered to the CLI as
 * SIGINT / verbatim-insert instead of letting Chromium run its copy/paste command. So we own the
 * chords: intercept the terminal shortcuts before xterm sees them and drive `navigator.clipboard` +
 * `term.paste` directly. Ctrl+Shift+C / Ctrl+Shift+V are the unambiguous terminal chords; Ctrl+C
 * copies only when text is selected (otherwise the shell still gets its interrupt), Ctrl+V pastes.
 * A right-click menu (rendered by the host component from the returned state) covers discoverability.
 */
export interface TerminalClipboard {
  onTerminalKey: (e: KeyboardEvent) => boolean
  copySelection: () => Promise<void>
  pasteClipboard: () => Promise<void>
  menu: Ref<{ x: number; y: number } | null>
  menuHasSel: Ref<boolean>
  openMenu: (e: MouseEvent) => void
  closeMenu: () => void
  menuCopy: () => Promise<void>
  menuPaste: () => Promise<void>
  menuSelectAll: () => void
}

export function useTerminalClipboard(getTerm: () => Terminal | null): TerminalClipboard {
  async function copySelection(): Promise<void> {
    const text = getTerm()?.getSelection()
    if (!text) return
    // navigator.clipboard first (needs focus/secure context); execCommand fallback otherwise.
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      await copyToClipboard(text)
    }
  }

  async function pasteClipboard(): Promise<void> {
    const term = getTerm()
    if (!term) return
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      return /* clipboard-read denied: nothing sensible to insert */
    }
    // term.paste honours bracketed-paste mode, so a multi-line clipboard lands correctly in the CLI.
    if (text) term.paste(text)
  }

  /**
   * xterm custom key handler: return false to swallow the event (we handled it), true to let
   * xterm/PTY process it as usual. Only keydown is claimed; keyup always falls through so the
   * browser doesn't see a dangling modifier.
   */
  function onTerminalKey(e: KeyboardEvent): boolean {
    if (e.type !== 'keydown') return true
    const ctrlOrMeta = e.ctrlKey || e.metaKey
    const key = (e.key || '').toLowerCase()
    const handled = (fn: () => Promise<void>): false => {
      // Cancel the keystroke's default action too: xterm returns early on a false from us without
      // preventDefault, so Chromium would still fire a native paste/copy and double the insert.
      e.preventDefault()
      void fn()
      return false
    }
    if (ctrlOrMeta && e.shiftKey && key === 'c') return handled(copySelection)
    if (ctrlOrMeta && e.shiftKey && key === 'v') return handled(pasteClipboard)
    // Ctrl+Insert copy / Shift+Insert paste — the classic terminal chords, harmless to add.
    if (key === 'insert' && ctrlOrMeta) return handled(copySelection)
    if (key === 'insert' && e.shiftKey) return handled(pasteClipboard)
    if (ctrlOrMeta && !e.shiftKey && key === 'c' && getTerm()?.hasSelection()) {
      return handled(copySelection)
    }
    if (ctrlOrMeta && !e.shiftKey && key === 'v') return handled(pasteClipboard)
    return true
  }

  /* Right-click menu state; the host component renders it (see .term-pane-menu markup). */
  const menu = ref<{ x: number; y: number } | null>(null)
  const menuHasSel = ref(false)
  function openMenu(e: MouseEvent): void {
    e.preventDefault()
    menuHasSel.value = !!getTerm()?.hasSelection()
    // Keep the (approx) 180x120 menu fully on-screen near the right/bottom edges.
    const x = Math.min(e.clientX, window.innerWidth - 190)
    const y = Math.min(e.clientY, window.innerHeight - 130)
    menu.value = { x: Math.max(0, x), y: Math.max(0, y) }
  }
  function closeMenu(): void {
    menu.value = null
  }
  async function menuCopy(): Promise<void> {
    await copySelection()
    closeMenu()
  }
  async function menuPaste(): Promise<void> {
    await pasteClipboard()
    closeMenu()
  }
  function menuSelectAll(): void {
    getTerm()?.selectAll()
    closeMenu()
  }

  return {
    onTerminalKey,
    copySelection,
    pasteClipboard,
    menu,
    menuHasSel,
    openMenu,
    closeMenu,
    menuCopy,
    menuPaste,
    menuSelectAll
  }
}
