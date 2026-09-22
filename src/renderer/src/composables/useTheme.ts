import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * Reactive mirror of the `html.light` class that App.vue's applyTheme toggles.
 *
 * This exists because Vue cannot watch DOM properties: `watch(() => el.className)`
 * never re-evaluates (the getter has no reactive dependency), which is why the
 * xterm surfaces used to keep a stale theme after a day/night flip — the terminal
 * only picked up the new colors when it was next created. Components that need to
 * repaint on theme change (xterm background/foreground) watch this ref instead.
 */
export function useIsLight(): { isLight: Ref<boolean> } {
  const isLight = ref(document.documentElement.classList.contains('light'))
  const observer = new MutationObserver(() => {
    isLight.value = document.documentElement.classList.contains('light')
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  onScopeDispose(() => observer.disconnect())
  return { isLight }
}
