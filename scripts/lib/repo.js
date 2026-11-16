/** Repository-root and git helpers. */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTextIfExists } from './fsx.js'

/**
 * Resolve the repository root from a top-level script in `scripts/`.
 * @param {string} metaUrl `import.meta.url` of the calling script
 * @returns {string} absolute repository root
 */
export function repoRootFrom(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..')
}

/**
 * Run git in the repository. Arguments are passed as an array so paths with
 * spaces never reach a shell.
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function git(repoRoot, args, options = {}) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', ...options })
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/** @returns {Promise<boolean>} whether the directory is inside a git work tree */
export async function isGitRepository(repoRoot) {
  return git(repoRoot, ['rev-parse', '--is-inside-work-tree']).code === 0
}

/**
 * Parse `.gitmodules` into a path-keyed map.
 * @param {string} repoRoot repository root
 * @returns {Promise<Map<string, { url?: string, branch?: string }>>} submodule declarations
 */
export async function readGitmodules(repoRoot) {
  const text = await readTextIfExists(path.join(repoRoot, '.gitmodules'))
  const out = new Map()
  if (!text) return out
  let current
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const section = /^\[submodule\s+"(.+)"\]$/.exec(line)
    if (section) {
      current = { path: section[1], url: undefined, branch: undefined }
      out.set(current.path, current)
      continue
    }
    const entry = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line)
    if (!entry || !current) continue
    if (entry[1] === 'path') {
      if (entry[2] !== current.path) {
        out.delete(current.path)
        current.path = entry[2]
        out.set(current.path, current)
      }
    } else if (entry[1] === 'url') {
      current.url = entry[2]
    } else if (entry[1] === 'branch') {
      current.branch = entry[2]
    }
  }
  return out
}

/** Summarize submodule checkout state for the configured paths. */
export function submoduleStatus(repoRoot, paths) {
  if (paths.length === 0) return []
  const result = git(repoRoot, ['submodule', 'status', '--', ...paths])
  return result.stdout.split(/\r?\n/).filter(Boolean)
}
