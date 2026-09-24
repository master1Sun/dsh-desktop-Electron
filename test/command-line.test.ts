import { describe, expect, it } from 'vitest'
import { quoteForCreateProcess, splitCommandArgs, isJsLauncher } from '../src/main/runtime/command-line'

describe('splitCommandArgs', () => {
  it('strips the quotes a capability manifest wraps around its absolute entry path', () => {
    // The exact shape 更新检测's migrateCapability writes (and installFromNpm has always written):
    // node would otherwise receive the quotes as part of the file name and resolve it against cwd.
    const entry =
      'C:\\Users\\me\\AppData\\Roaming\\DesktopContainer\\capabilities\\codex\\node_modules\\@openai\\codex\\bin\\codex.js'
    expect(splitCommandArgs(`node "${entry}"`)).toEqual(['node', entry])
  })

  it('keeps a quoted path containing spaces in one argument', () => {
    expect(splitCommandArgs('node "D:\\My Projects\\codex bin\\cli.js" --verbose')).toEqual([
      'node',
      'D:\\My Projects\\codex bin\\cli.js',
      '--verbose'
    ])
  })

  it('handles single quotes and unquoted tokens the old split did', () => {
    expect(splitCommandArgs('  npm   run  dev --port 3000 ')).toEqual([
      'npm',
      'run',
      'dev',
      '--port',
      '3000'
    ])
    expect(splitCommandArgs("sh -c 'echo hello world'")).toEqual(['sh', '-c', 'echo hello world'])
  })

  it('returns nothing for a blank command', () => {
    expect(splitCommandArgs('')).toEqual([])
    expect(splitCommandArgs('   ')).toEqual([])
  })
})

describe('quoteForCreateProcess', () => {
  it('re-wraps only the arguments that need quoting', () => {
    // node-pty joins args into a CreateProcess command line without quoting them itself.
    expect(quoteForCreateProcess(['D:\\a b\\cli.js', '--flag', 'x y z'])).toEqual([
      '"D:\\a b\\cli.js"',
      '--flag',
      '"x y z"'
    ])
  })
})

describe('isJsLauncher', () => {
  it('is true only for a node-loadable JS module', () => {
    expect(isJsLauncher('C:\\codex\\bin\\codex.js')).toBe(true)
    expect(isJsLauncher('/cap/qwen/cli-entry.js')).toBe(true)
    expect(isJsLauncher('/cap/x/bundle/gemini.mjs')).toBe(true)
    expect(isJsLauncher('/cap/x/run.cjs')).toBe(true)
  })

  it('is false for a native binary or extensionless launcher', () => {
    expect(isJsLauncher('C:\\claude\\bin\\claude.exe')).toBe(false)
    expect(isJsLauncher('/cap/claude/bin/claude')).toBe(false)
    expect(isJsLauncher('C:\\x\\launcher.cmd')).toBe(false)
  })
})
