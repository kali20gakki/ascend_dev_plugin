/**
 * Resolve where the plugin's skills come from. A source checkout uses its own
 * `skills/`; an npm/npx install has no submodules, so the repository is cloned
 * into a cache directory and used as the install source.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { git, isGitRepository } from './repo.js'
import { removeIfExists } from './fsx.js'
import { runCommand } from './run.js'

export const CACHE_ENV = 'ASCEND_DEV_SKILLS_HOME'

/**
 * Cache root for the cloned repository.
 * @param {NodeJS.ProcessEnv} env process environment
 * @param {NodeJS.Platform} platform node platform
 * @returns {string} absolute cache directory
 */
export function defaultCacheDir(env = process.env, platform = process.platform) {
  if (env[CACHE_ENV]) return path.resolve(env[CACHE_ENV])
  const home = env.HOME ?? env.USERPROFILE ?? os.homedir()
  if (platform === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'ascend-dev-skills')
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'ascend-dev-skills')
  return path.join(env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'ascend-dev-skills')
}

/** @returns {boolean} whether every selected skill has a checked-out SKILL.md */
export function skillsPresent(root, config, skillIds) {
  return skillIds.every(id => {
    const skill = config.skills.find(entry => entry.id === id)
    return skill !== undefined && existsSync(path.join(root, skill.path, 'SKILL.md'))
  })
}

/**
 * Describe the source without changing anything.
 * @returns {{ root: string, kind: 'checkout' | 'cache', initialized: boolean }}
 */
export function existingSource({ scriptRoot, config, skillIds, cacheDir }) {
  if (skillsPresent(scriptRoot, config, skillIds)) return { root: scriptRoot, kind: 'checkout', initialized: true }
  const root = path.join(cacheDir, 'src')
  return { root, kind: 'cache', initialized: skillsPresent(root, config, skillIds) }
}

/**
 * Ensure a usable source checkout. Clones or refreshes the repository in the
 * cache when the running package has no submodules (npm/npx installs).
 * @returns {Promise<{ root: string, kind: string, initialized: boolean, willClone?: boolean }>}
 */
export async function ensureSource({ scriptRoot, config, skillIds, cacheDir, ref, log, dryRun }) {
  const existing = existingSource({ scriptRoot, config, skillIds, cacheDir })
  if (existing.initialized) return existing

  if (dryRun) {
    log.info(`在线安装：将克隆 ${config.plugin.repository} 到 ${existing.root}`)
    return { ...existing, willClone: true }
  }

  const url = config.plugin.repository
  if (!url) throw new Error('plugin.repository 为空；请使用 --repo <本地 checkout>')

  if (await isGitRepository(existing.root)) {
    const branch = ref ?? 'main'
    log.step(`git -C ${existing.root} fetch --depth 1 origin ${branch}`)
    const fetched = git(existing.root, ['fetch', '--depth', '1', 'origin', branch], { stdio: 'inherit' })
    if (fetched.code !== 0) throw new Error(`git fetch 失败：${existing.root}`)
    const checked = git(existing.root, ['checkout', '--force', 'FETCH_HEAD'], { stdio: 'inherit' })
    if (checked.code !== 0) throw new Error(`git checkout 失败：${existing.root}`)
  } else {
    await removeIfExists(existing.root)
    await mkdir(path.dirname(existing.root), { recursive: true })
    const args = ['clone', '--depth', '1']
    if (ref) args.push('--branch', ref)
    args.push('--recurse-submodules', '--shallow-submodules', url, existing.root)
    log.step(`git ${args.join(' ')}`)
    const cloned = runCommand('git', args, { inherit: true })
    if (!cloned.ok) throw new Error(`git clone 失败：${url}`)
  }

  const paths = config.skills.filter(skill => skillIds.includes(skill.id)).map(skill => skill.path)
  const updated = git(existing.root, ['submodule', 'update', '--init', '--depth', '1', '--', ...paths], { stdio: 'inherit' })
  if (updated.code !== 0) throw new Error('git submodule update 失败')

  return existingSource({ scriptRoot, config, skillIds, cacheDir })
}
