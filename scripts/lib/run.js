/** Command execution that works with Windows `.cmd` shims and POSIX binaries. */
import { spawnSync } from 'node:child_process'

/**
 * Run a logical command. Windows `.cmd`/`.bat` shims go through `cmd.exe` with
 * an explicitly quoted command line; everything else is spawned with an argv
 * array, so paths with spaces never reach a shell parser.
 *
 * @param {string} bin absolute path or command name
 * @param {string[]} argv arguments
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, inherit?: boolean }} options
 * @returns {{ ok: boolean, status: number | null, stdout: string, stderr: string, error?: string }}
 */
export function runCommand(bin, argv, options = {}) {
  const inherit = options.inherit === true
  const env = options.env ?? process.env
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
    const line = [quoteWindows(bin), ...argv.map(quoteWindows)].join(' ')
    const result = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', line], {
      cwd: options.cwd,
      env,
      encoding: 'utf8',
      stdio: inherit ? 'inherit' : 'pipe',
      windowsHide: true,
    })
    return finish(result)
  }
  const result = spawnSync(bin, argv, {
    cwd: options.cwd,
    env,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    windowsHide: true,
  })
  return finish(result)
}

function finish(result) {
  if (result.error) {
    return { ok: false, status: null, stdout: '', stderr: '', error: result.error.message }
  }
  return {
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/** Quote one argument for a `cmd.exe` command line. */
export function quoteWindows(value) {
  const text = String(value)
  if (text === '') return '""'
  if (!/[\s"&|<>^()]/.test(text)) return text
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
}

/** Run a command and return its captured output. */
export function capture(bin, argv, options = {}) {
  return runCommand(bin, argv, { ...options, inherit: false })
}
