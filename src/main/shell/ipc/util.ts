import type { IpcResult } from '../../../shared/types'
import type { PageRegistry } from '../../runtime/pages'

/**
 * The shared plumbing every ipc/<domain> registrar gets: the page registry plus the
 * ok/fail envelope helpers, so the extracted handlers read exactly as they did inline in
 * registerIpc. Domains never import each other for this — ctx is passed in, which keeps
 * the module graph acyclic (settings→updates/logs are the only deliberate edges).
 */
export interface IpcCtx {
  registry: PageRegistry
  ok: <T>(data?: T) => IpcResult<T>
  fail: <T = unknown>(err: unknown) => IpcResult<T>
}

export const ok = <T>(data?: T): IpcResult<T> => ({ ok: true, data })
// Generic so a handler annotated `IpcResult<Foo>` can still `return fail(err)` and keep its type.
export const fail = <T = unknown>(err: unknown): IpcResult<T> => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err)
})
