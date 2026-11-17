import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, rm, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const installScript = path.join(repoRoot, 'scripts', 'install.js')

function runInstall(args, options = {}) {
  return spawnSync(process.execPath, [installScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

test('installer refuses an unattended install without --yes', () => {
  const result = runInstall(['--targets', 'claude'])
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /not a terminal/)
})

test('installer help prints usage without touching the profile', () => {
  const result = runInstall(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /用法:/)
  assert.match(result.stdout, /--dry-run/)
})

test('dry run emits a JSON plan and creates nothing', () => {
  const target = path.join(os.tmpdir(), 'ascend-cli-dry-plan')
  const result = runInstall(['--dry-run', '--json', '--targets', 'skills-dir', '--target', target, '--skills', '1'])
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.dryRun, true)
  assert.equal(output.source.kind, 'checkout')
  assert.deepEqual(output.plan.skillIds, ['scene-fuzz'])
  assert.equal(output.plan.steps[0].kind, 'copy-skill')
  assert.equal(output.plan.steps[0].to, path.join(target, 'scene-fuzz'))
})

test('an npx-style package directory resolves an online cache source without cloning on dry run', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ascend-npx-'))
  try {
    const packageDir = path.join(root, 'package')
    await cp(path.join(repoRoot, 'scripts'), path.join(packageDir, 'scripts'), { recursive: true })
    await copyFile(path.join(repoRoot, 'plugin.config.json'), path.join(packageDir, 'plugin.config.json'))
    const cache = path.join(root, 'cache')
    const result = spawnSync(process.execPath, [
      path.join(packageDir, 'scripts', 'install.js'),
      '--dry-run', '--json', '--targets', 'skills-dir', '--target', path.join(root, 'skills'), '--skills', '1',
    ], {
      cwd: packageDir,
      encoding: 'utf8',
      env: { ...process.env, ASCEND_DEV_SKILLS_HOME: cache },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.source.kind, 'cache')
    assert.equal(output.source.willClone, true)
    assert.equal(existsSync(cache), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify script passes on the repository', () => {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'verify.js')], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /0 error\(s\)/)
})
