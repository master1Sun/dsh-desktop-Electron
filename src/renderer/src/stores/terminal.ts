import { reactive, ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { t } from '../i18n'

export interface TerminalSession {
  id: string
  target: string
  title: string
  cwd: string
  status: 'open' | 'exited'
  exitCode?: number
  /** Raw bytes this tab received; capped, used to repaint the shared xterm surface on switch. */
  buffer: string
}

const MAX_BUFFER = 256 * 1024

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || t('common.terminalStartFail'))
  return res.data as T
}

/**
 * Owns the embedded-terminal sessions (one PTY per tab) and the drawer visibility.
 * The renderer subscribes to OnPtyData/OnPtyExit once at boot and routes chunks to xterm.
 */
export const useTerminalStore = defineStore('terminal', () => {
  const sessions = reactive<TerminalSession[]>([])
  const activeId = ref<string | null>(null)
  const open = ref(false)

  const activeSession = computed(() => sessions.find((s) => s.id === activeId.value) || null)

  function sessionById(id: string): TerminalSession | undefined {
    return sessions.find((s) => s.id === id)
  }

  /** Accumulate output for every tab — the shared surface only shows one at a time. */
  function feed(id: string, data: string): void {
    const s = sessionById(id)
    if (!s) return
    if (s.buffer.length > MAX_BUFFER) s.buffer = s.buffer.slice(-MAX_BUFFER / 2)
    s.buffer += data
  }

  async function start(target: string, title: string): Promise<TerminalSession> {
    const info = await unwrap<{ id: string; title: string; cwd: string }>(
      window.container.ptyStart(target)
    )
    const session: TerminalSession = {
      id: info.id,
      target,
      title: title || info.title,
      cwd: info.cwd,
      status: 'open',
      buffer: ''
    }
    sessions.push(session)
    activeId.value = session.id
    open.value = true
    return session
  }

  function focus(id: string): void {
    activeId.value = id
    open.value = true
  }

  function close(id: string): void {
    const idx = sessions.findIndex((s) => s.id === id)
    if (idx < 0) return
    window.container.ptyKill(id).catch(() => undefined)
    sessions.splice(idx, 1)
    if (activeId.value === id) activeId.value = sessions.at(-1)?.id ?? null
    if (!sessions.length) open.value = false
  }

  function toggle(): void {
    open.value = !open.value
  }

  /** Hide the panel and terminate every shell — used by the floating window's close button. */
  function closeAll(): void {
    for (const s of [...sessions]) window.container.ptyKill(s.id).catch(() => undefined)
    sessions.splice(0, sessions.length)
    activeId.value = null
    open.value = false
  }

  // Mark a session exited when its shell process ends; keep it for scrolling/review until closed.
  window.container?.onPtyExit?.(({ id, code }) => {
    const s = sessions.find((x) => x.id === id)
    if (s) {
      s.status = 'exited'
      s.exitCode = code
    }
  })

  return {
    sessions,
    activeId,
    open,
    activeSession,
    start,
    focus,
    close,
    closeAll,
    toggle,
    feed,
    sessionById
  }
})
