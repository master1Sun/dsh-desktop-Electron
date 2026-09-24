import { ref, type Ref } from 'vue'

/**
 * A `Ref` that outlives the component that owns it.
 *
 * The menu/settings panels are mounted behind a `v-if`, so they are destroyed on close and rebuilt
 * from scratch on the next open. A component-scoped `ref(null)` therefore resets every time, and the
 * view blanks to its empty/loading state until the fresh fetch lands — the user stares at a hole that
 * used to hold data they can still see elsewhere. Registering the value here (a module singleton) lets
 * the panel paint the *previous* result the instant it appears and refresh it in the background, so an
 * open is never a blank-and-wait. This is stale-while-revalidate, not a cache of record: the truth
 * still comes from the fetch, this only keeps the last answer on screen while it runs.
 *
 * Values live for the whole app session and are shared by every caller using the same key, so pick a
 * key unique to the resource (e.g. 'settings.disk'), not to the component.
 */
const registry = new Map<string, Ref<unknown>>()

export function useStaleCache<T>(key: string, initial: T): Ref<T> {
  let existing = registry.get(key) as Ref<T> | undefined
  if (!existing) {
    existing = ref(initial) as Ref<T>
    registry.set(key, existing)
  }
  return existing
}
