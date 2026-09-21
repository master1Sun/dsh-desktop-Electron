import { Notification, shell } from 'electron'
import { getSettings } from './store'
import { m } from './i18n'

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
