import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../scripts/lib/config.js'
import { buildPlan } from '../scripts/lib/plan.js'
import { executePlan, prepareSubmodules, verifyPlan } from '../scripts/lib/installer.js'
import { HOSTS } from '../scripts/lib/hosts.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = await loadConfig(repoRoot)
const silent = { step() {}, info() {}, warn() {}, error() {}, inherit: false }

function ctx(root) {
  return {
    home: root,
    cwd: root,
    hosts: {
      claude: { ...HOSTS.claude, configDir: path.join(root, '.claude'), bin: undefined },
      codex: { ...HOSTS.codex, configDir: path.join(root, '.codex'), bin: undefined },
      cursor: { ...HOSTS.cursor, configDir: path.join(root, '.cursor'), bin: undefined },
      dsh: { ...HOSTS.dsh, configDir: path.join(root, '.dsh'), bin: undefined },
    },
  }
}

test('copy plan installs skills and verifies them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ascend-install-'))
  try {
    const plan = buildPlan({
      config, repoRoot, ctx: ctx(root), targets: ['skills-dir'],
      targetDir: path.join(root, 'skills'), skillIds: ['scene-fuzz', 'gitcode-cli'],
    })
    await prepareSubmodules({ repoRoot, plan, config, log: silent, dryRun: false })
    const execution = await executePlan({ repoRoot, plan, dryRun: false, force: false, log: silent })
    assert.equal(execution.ok, true)
    const verification = await verifyPlan({ plan, log: silent })
    assert.equal(verification.ok, true)
    assert.ok(existsSync(path.join(root, 'skills', 'scene-fuzz', 'SKILL.md')))
    assert.ok((await readFile(path.join(root, 'skills', 'gitcode-cli', 'SKILL.md'), 'utf8')).length > 100)

    const second = await executePlan({ repoRoot, plan, dryRun: false, force: false, log: silent })
    assert.equal(second.ok, true)
    assert.ok(second.results.every(result => result.skipped), 'second run should skip unchanged copies')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dry run creates nothing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ascend-dry-'))
  try {
    const plan = buildPlan({ config, repoRoot, ctx: ctx(root), targets: ['skills-dir'], targetDir: path.join(root, 'skills'), skillIds: ['scene-fuzz'] })
    const execution = await executePlan({ repoRoot, plan, dryRun: true, force: false, log: silent })
    assert.equal(execution.ok, true)
    assert.equal(existsSync(path.join(root, 'skills')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('--force replaces a modified copy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ascend-force-'))
  try {
    const plan = buildPlan({ config, repoRoot, ctx: ctx(root), targets: ['skills-dir'], targetDir: path.join(root, 'skills'), skillIds: ['scene-fuzz'] })
    await executePlan({ repoRoot, plan, dryRun: false, force: false, log: silent })
    const target = path.join(root, 'skills', 'scene-fuzz', 'SKILL.md')
    await writeFile(target, 'modified\n')
    const skipped = await executePlan({ repoRoot, plan, dryRun: false, force: false, log: silent })
    assert.equal(skipped.ok, true)
    assert.equal(await readFile(target, 'utf8'), 'modified\n')
    const forced = await executePlan({ repoRoot, plan, dryRun: false, force: true, log: silent })
    assert.equal(forced.ok, true)
    assert.notEqual(await readFile(target, 'utf8'), 'modified\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
