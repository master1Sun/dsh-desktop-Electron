/**
 * Ambient typing for vite's `?raw` import in the main process. electron-vite's node types
 * declare `?asset` but not `?raw`, and the main tsconfig limits `types` to `electron-vite/node`
 * (so vite/client is not pulled in). The shared-workspace MCP server is embedded as text and
 * written to userData at runtime, which needs this declaration.
 */
declare module '*?raw' {
  const content: string
  export default content
}
