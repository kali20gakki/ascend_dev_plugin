import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
  assert.match(result.stdout, /Usage:/)
  assert.match(result.stdout, /--dry-run/)
})

test('dry run emits a JSON plan and creates nothing', () => {
  const target = path.join(os.tmpdir(), 'ascend-cli-dry-plan')
  const result = runInstall(['--dry-run', '--json', '--targets', 'skills-dir', '--target', target, '--skills', '1'])
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.dryRun, true)
  assert.deepEqual(output.plan.skillIds, ['scene-fuzz'])
  assert.equal(output.plan.steps[0].kind, 'copy-skill')
  assert.equal(output.plan.steps[0].to, path.join(target, 'scene-fuzz'))
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
