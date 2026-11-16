/** Detect installed agent hosts and resolve their per-scope directories. */
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Host capabilities used by the installer and the docs generator. */
export const HOSTS = Object.freeze({
  claude: {
    id: 'claude',
    label: 'Claude Code',
    binary: 'claude',
    marketplace: true,
    scopes: ['user', 'project'],
    configEnv: 'CLAUDE_CONFIG_DIR',
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    binary: 'codex',
    marketplace: true,
    scopes: ['user'],
    configEnv: 'CODEX_HOME',
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    binary: 'cursor',
    marketplace: false,
    scopes: ['user'],
    configEnv: 'CURSOR_HOME',
  },
  dsh: {
    id: 'dsh',
    label: 'DeepSeek Harness',
    binary: 'dsh',
    marketplace: false,
    scopes: ['user', 'project'],
    configEnv: 'DSH_HOME',
  },
})

/** Locate an executable on PATH without invoking a shell. */
export function findCommand(name, env = process.env) {
  if (name.includes('/') || name.includes('\\')) return existsSync(name) ? name : undefined
  const extensions = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']
  for (const directory of String(env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue
    for (const extension of extensions) {
      const candidate = path.join(directory, name + extension)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

/** @returns {string} the user's home directory */
export function homeDir(env = process.env) {
  return env.HOME ?? env.USERPROFILE ?? os.homedir()
}

/**
 * Resolve host config directories and binaries for one environment.
 * @param {NodeJS.ProcessEnv} env process environment
 * @returns {object} host context
 */
export function hostContext(env = process.env) {
  const home = homeDir(env)
  const configDir = (host, fallback) => (env[HOSTS[host].configEnv] ? path.resolve(env[HOSTS[host].configEnv]) : path.join(home, fallback))
  return {
    home,
    cwd: env.DSH_CWD ?? process.cwd(),
    hosts: {
      claude: { ...HOSTS.claude, configDir: configDir('claude', '.claude'), bin: findCommand('claude', env) },
      codex: { ...HOSTS.codex, configDir: configDir('codex', '.codex'), bin: findCommand('codex', env) },
      cursor: { ...HOSTS.cursor, configDir: configDir('cursor', '.cursor'), bin: findCommand('cursor', env) },
      dsh: { ...HOSTS.dsh, configDir: configDir('dsh', '.dsh'), bin: findCommand('dsh', env) },
    },
  }
}

/** @returns {string[]} hosts whose CLI or config directory is present */
export function detectedHosts(ctx) {
  return Object.values(ctx.hosts).filter(host => host.bin !== undefined || existsSync(host.configDir)).map(host => host.id)
}

/** Directory where a host loads skills for a scope. */
export function skillsDirFor(hostId, scope, ctx) {
  const host = ctx.hosts[hostId]
  switch (hostId) {
    case 'claude':
      return scope === 'project' ? path.join(ctx.cwd, '.claude', 'skills') : path.join(host.configDir, 'skills')
    case 'codex':
      return path.join(host.configDir, 'skills')
    case 'cursor':
      return path.join(host.configDir, 'skills')
    case 'dsh':
      return scope === 'project' ? path.join(ctx.cwd, '.dsh', 'skills') : path.join(host.configDir, 'skills')
    default:
      throw new Error(`unknown host ${hostId}`)
  }
}

/** Directory where the installer copies the portable package for Cursor. */
export function localPluginDirFor(name, ctx) {
  return path.join(ctx.hosts.cursor.configDir, 'plugins', 'local', name)
}
