import { Notification, shell } from 'electron'
import { getSettings } from './store'
import { m } from './i18n'
import type { ToastLevel } from '../../shared/types'

/**
 * Out-of-band OS notifications for a tray-resident container.
 *
 * A minimized app misses time-based events entirely: the health guard spending its
 * restart budget on a hosted page, or a downloaded OTA update waiting for a restart.
 * These fire rarely and only when user action is needed, so they go straight to the
 * notification center rather than a dialog. Gated by `settings.systemNotifications`
 * (default on) — the user can move them back into "check the badge yourself" mode.
 *
 * Mirrors downloads.ts: never throws, no-op when the platform says no.
 */
export function notifyEvent(titleKey: string, bodyKey: string, params?: Record<string, string | number>, revealPath?: string): void {
  try {
    if (getSettings().systemNotifications === false) return
    if (!Notification.isSupported()) return
    const n = new Notification({ title: m(titleKey), body: m(bodyKey, params) })
    if (revealPath) n.on('click', () => shell.showItemInFolder(revealPath))
    n.show()
  } catch (err) {
    console.warn('[notify] failed (ignored):', (err as Error).message)
  }
}

/**
 * Route one renderer toast to the OS notification center, under the same
 * `systemNotifications` gate as {@link notifyEvent}. When the box is checked the renderer
 * suppresses its in-app corner toast and forwards the text here instead, so routine feedback
 * lands in the notification center rather than over the window. The message is already
 * localized by the renderer, so it is shown verbatim under the app title.
 *
 * Resolves whether the toast actually reached the screen — the renderer only suppresses its
 * corner toast once this is `true`, so a refused/dropped notification (notifications turned off
 * in Windows, Focus Assist, or an unpackaged app whose AppUserModelID has no Start-Menu shortcut
 * to bind to — see the Windows notes in main/index.ts) still paints the in-app toast and never
 * loses the message. We lean on the Notification lifecycle events rather than trusting `show()`:
 * `show()` returns without throwing even when the platform silently drops the toast, so a real
 * `show`/`click`/`close` within a short grace window is the only positive signal we have; no
 * event before the timeout means the platform refused it. Never throws.
 */
export function notifyToast(_level: ToastLevel, text: string): Promise<boolean> {
  if (getSettings().systemNotifications === false) return Promise.resolve(false)
  if (!Notification.isSupported()) return Promise.resolve(false)
  const body = (text || '').trim()
  if (!body) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (shown: boolean): void => {
      if (settled) return
      settled = true
      resolve(shown)
    }
    try {
      const n = new Notification({ title: m('app.title'), body })
      n.once('show', () => done(true))
      n.once('click', () => done(true))
      n.once('close', () => done(true))
      n.show()
      // Nothing acknowledged the toast in the grace window → the platform almost certainly
      // dropped it (unregistered AUMID / notifications off) → let the renderer show its toast.
      setTimeout(() => done(false), 1500)
    } catch (err) {
      console.warn('[notify] toast failed (ignored):', (err as Error).message)
      done(false)
    }
  })
}
