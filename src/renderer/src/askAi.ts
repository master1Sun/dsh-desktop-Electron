import { ElMessage } from 'element-plus'
import { t } from './i18n'

/**
 * Shared "问 AI" plumbing.
 *
 * The container has no URL protocol to hand a prompt to OpenClaw (or any other hosted agent)
 * with, so the contract is deliberately dumb: put a ready-to-send context block on the
 * clipboard, then move the user to the page they should paste it into. Keeping that here —
 * rather than threading emits up from the log viewer / palette / panels — means every entry
 * point produces byte-identical context, so support answers look the same wherever the
 * question was raised from.
 */

/** What App.vue registers: jump to (and start, if needed) the page the user should ask in. */
let jumpHandler: (() => void | Promise<void>) | null = null

export function registerAskAiJump(fn: () => void | Promise<void>): void {
  jumpHandler = fn
}

export function unregisterAskAiJump(): void {
  jumpHandler = null
}

/**
 * Best-effort clipboard write. `navigator.clipboard` needs a focused, secure context; the
 * hidden-textarea + execCommand path keeps working when it is unavailable (an embedded page
 * stole focus, a dev server served over a plain host). Resolves an error string, or null on
 * success — callers surface it verbatim, since the reason is what a user reports back.
 */
export async function copyToClipboard(text: string): Promise<string | null> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return null
    }
  } catch {
    /* fall through to the legacy path below */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok ? null : 'clipboard unavailable'
  } catch (err) {
    return (err as Error).message || String(err)
  }
}

/**
 * Copy a context block and (by default) bring the user to the page to ask in, toast included.
 * `jump: false` is for the case where the caller already sits on the target page.
 */
export async function askAiWith(text: string, opts?: { jump?: boolean }): Promise<void> {
  const err = await copyToClipboard(text)
  if (err) {
    ElMessage.error(t('app.askAiFail', { err }))
    return
  }
  ElMessage.success(t('app.askAiCopied'))
  if (opts?.jump === false) return
  try {
    await jumpHandler?.()
  } catch {
    /* the context is already copied — a failed jump costs the user one manual click, not the text */
  }
}
