/**
 * #11: a tiny, dependency-free holder for the *running* container-side MCP server's endpoint.
 *
 * It exists only to break what would otherwise be an import cycle: `mcp-bridge.ts` (which every
 * hub change re-exports to the hosted agents) needs the live URL + bearer token to append the
 * container's own server to those exports, while the server itself needs the hub to answer its
 * tools. Both sides depend on this leaf instead of on each other — the server *writes* it on
 * start/stop, the bridge *reads* it when compiling exports. When the server is off (the default)
 * this holds null, so the bridge behaves exactly as before #11.
 */
export interface ContainerEndpoint {
  /** the Streamable HTTP endpoint agents connect to, e.g. http://127.0.0.1:54321/mcp */
  url: string
  /** loopback port the ephemeral listener actually bound */
  port: number
  /** absolute path of the bearer-token file (under userData/mcp-bridge) */
  tokenFile: string
  /** the live bearer token, so the bridge can inline it as an Authorization header */
  bearerToken: string
}

let current: ContainerEndpoint | null = null

export function setContainerEndpoint(v: ContainerEndpoint | null): void {
  current = v
}

export function getContainerEndpoint(): ContainerEndpoint | null {
  return current
}
