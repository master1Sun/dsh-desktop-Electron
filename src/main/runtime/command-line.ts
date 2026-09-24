/**
 * Quote-aware command-line tokenizer shared by both page launch paths: the plain `spawn` in
 * pages.ts and the node-pty terminal session in pty.ts.
 *
 * Why it exists: the npm capability importer (and the 更新检测 migration that reproduces its
 * layout) writes `node "<absolute entry path>"` — an absolute Windows path that may contain
 * spaces. A naive `split(/\s+/)` then either (a) leaves the quote characters glued to the token,
 * so node receives `"C:\…\codex.js"` literally, resolves it against the cwd and dies with
 * MODULE_NOT_FOUND, or (b) shreds a spaced path into several arguments. Tokens wrapped in matching
 * "…" / '…' come out unquoted as exactly one argument here, which is what both launchers meant to
 * receive all along.
 */
export function splitCommandArgs(raw: string): string[] {
  const out: string[] = []
  const chars: string[] = []
  let quote: '"' | "'" | null = null
  let started = false
  for (const ch of raw) {
    if (quote) {
      if (ch === quote) quote = null
      else chars.push(ch)
      continue
    }
    if (ch === '"' || ch === "'") {
      // Opening a quote starts a token even when nothing precedes it (`""` is an empty argument).
      quote = ch
      started = true
      continue
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(chars.join(''))
        chars.length = 0
        started = false
      }
      continue
    }
    chars.push(ch)
    started = true
  }
  if (started) out.push(chars.join(''))
  return out
}

/**
 * Re-wrap any argument containing whitespace so node-pty's CreateProcess command line keeps it as
 * one token: node-pty joins `args` with spaces and does not quote on our behalf. `spawn` (libuv)
 * quotes correctly by itself, so only the pty path calls this.
 */
export function quoteForCreateProcess(args: string[]): string[] {
  return args.map((a) => (/\s/.test(a) ? `"${a}"` : a))
}

/**
 * True for a JS module that must be loaded by a `node` process (`.js`/`.cjs`/`.mjs`). Anything else
 * — a native binary like `@anthropic-ai/claude-code`'s `bin/claude.exe`, or an extensionless unix
 * launcher — is exec'd directly. Shared by the capability importer (which builds the startCommand)
 * and the pty launcher (which heals a stale `node "<native-binary>"` command) so the two never
 * disagree on when `node` is the right interpreter.
 */
export function isJsLauncher(entry: string): boolean {
  return /\.(c|m)?js$/i.test(entry)
}
