/**
 * Route every in-app toast to the OS notification center while `systemNotifications` is on.
 *
 * The container raises ~150 `ElMessage.success/error/warning/info(...)` calls across the
 * renderer. Rather than touch each one, we wrap the four `ElMessage` shortcuts ONCE at
 * startup: with the setting on, a message is forwarded to the main process (which pops the
 * system notification) and the in-app corner toast is suppressed; with it off — or when the
 * platform can't notify, so the forward resolves `false` — the original toast still shows, so
 * no message is ever silently dropped.
 *
 * Every module imports the same `ElMessage` singleton (auto-imported from 'element-plus'), and
 * we only mutate its method properties — never rebind the import — so the swap is seen
 * everywhere. `installToastRouting()` must run before any toast fires; App.vue's setup is early
 * enough (toasts are user-action driven). The enabled flag is pushed in by App.vue's watcher so
 * this module stays free of a circular Pinia import.
 */
import { ElMessage } from 'element-plus'
import type { ToastLevel } from '../../shared/types'

type MessageArg = string | { message?: string; title?: string }

let enabled = false
let installed = false

/** App.vue mirrors `settings.systemNotifications !== false` in here on every change. */
export function setToastSystemRouting(on: boolean): void {
  enabled = on
}

function textOf(arg: MessageArg): string {
  if (typeof arg === 'string') return arg
  return arg?.message || arg?.title || ''
}

/**
 * Wrap the four severity shortcuts once. The originals are captured first so the fallback
 * (setting raced off mid-toggle, or the OS refusing to notify) still paints a real toast.
 */
export function installToastRouting(): void {
  if (installed) return
  installed = true
  const original = {
    success: ElMessage.success,
    error: ElMessage.error,
    warning: ElMessage.warning,
    info: ElMessage.info
  }
  const forward = (level: ToastLevel, arg: MessageArg): void => {
    const text = textOf(arg)
    if (!text) return
    // Fire-and-forget: on a "not shown" result (or a bridge error) fall back to the toast.
    window.container
      ?.showSystemToast(level, text)
      .then((shown) => {
        if (!shown) original[level](arg as never)
      })
      .catch(() => original[level](arg as never))
  }
  ;(['success', 'error', 'warning', 'info'] as const).forEach((level) => {
    ElMessage[level] = ((arg: MessageArg) => {
      if (enabled) {
        forward(level, arg)
        return undefined as never
      }
      return original[level](arg as never)
    }) as never
  })
}
