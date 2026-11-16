import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { HOSTS, skillsDirFor, localPluginDirFor } from '../scripts/lib/hosts.js'
import { buildPlan, normalizeTargets, resolveMarketplaceSource } from '../scripts/lib/plan.js'
import { loadConfig } from '../scripts/lib/config.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = path.join(os.tmpdir(), 'ascend-fake-home')
const cwd = path.join(os.tmpdir(), 'ascend-fake-project')

function fakeCtx({ claudeBin = 'claude', codexBin = 'codex' } = {}) {
  return {
    home,
    cwd,
    hosts: {
      claude: { ...HOSTS.claude, configDir: path.join(home, '.claude'), bin: claudeBin },
      codex: { ...HOSTS.codex, configDir: path.join(home, '.codex'), bin: codexBin },
      cursor: { ...HOSTS.cursor, configDir: path.join(home, '.cursor'), bin: undefined },
      dsh: { ...HOSTS.dsh, configDir: path.join(home, '.dsh'), bin: undefined },
    },
  }
}

async function config() {
  return loadConfig(repoRoot)
}

test('claude and codex use the marketplace flow', async () => {
  const cfg = await config()
  const ctx = fakeCtx()
  const plan = buildPlan({ config: cfg, repoRoot, ctx, targets: ['claude', 'codex'], scope: 'user' })
  const commands = plan.steps.filter(step => step.kind === 'command').map(step => `${step.program} ${step.argv.join(' ')}`)
  assert.deepEqual(commands, [
    `claude plugin marketplace add ${repoRoot}`,
    'claude plugin install ascend-dev-skills@ascend-dev --scope user',
    `codex plugin marketplace add ${repoRoot}`,
    'codex plugin add ascend-dev-skills@ascend-dev',
  ])
  assert.equal(plan.verify.filter(check => check.kind === 'command').length, 2)
  assert.ok(plan.notes.some(note => note.includes('[plugins."ascend-dev-skills@ascend-dev"]')))
})

test('method=skills copies skills instead of using marketplaces', async () => {
  const cfg = await config()
  const ctx = fakeCtx()
  const plan = buildPlan({ config: cfg, repoRoot, ctx, targets: ['claude'], scope: 'project', method: 'skills', skillIds: ['scene-fuzz'] })
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0].kind, 'copy-skill')
  assert.equal(plan.steps[0].to, path.join(cwd, '.claude', 'skills', 'scene-fuzz'))
  assert.equal(plan.submodules[0], 'skills/scene-fuzz')
})

test('cursor defaults to copying the portable plugin', async () => {
  const cfg = await config()
  const ctx = fakeCtx()
  const plan = buildPlan({ config: cfg, repoRoot, ctx, targets: ['cursor'], scope: 'user' })
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0].kind, 'copy-plugin')
  assert.equal(plan.steps[0].to, localPluginDirFor(cfg.plugin.name, ctx))
  assert.ok(plan.steps[0].include.includes('plugin.json'))
  assert.ok(plan.steps[0].include.includes('skills/scene-fuzz'))
})

test('dsh copies skills into its user skills root', async () => {
  const cfg = await config()
  const ctx = fakeCtx()
  const plan = buildPlan({ config: cfg, repoRoot, ctx, targets: ['dsh'], scope: 'user', skillIds: ['gitcode-cli'] })
  assert.equal(plan.steps[0].to, path.join(ctx.hosts.dsh.configDir, 'skills', 'gitcode-cli'))
})

test('skills-dir requires a target directory', async () => {
  const cfg = await config()
  const ctx = fakeCtx()
  assert.throws(() => buildPlan({ config: cfg, repoRoot, ctx, targets: ['skills-dir'] }), /--target/)
  const plan = buildPlan({ config: cfg, repoRoot, ctx, targets: ['skills-dir'], targetDir: path.join(home, 'custom'), skillIds: ['scene-fuzz'] })
  assert.equal(plan.steps[0].to, path.join(home, 'custom', 'scene-fuzz'))
})

test('marketplace source resolution', async () => {
  const cfg = await config()
  assert.equal(resolveMarketplaceSource('local', repoRoot, cfg), repoRoot)
  assert.equal(resolveMarketplaceSource('git', repoRoot, cfg), cfg.plugin.repository)
  assert.equal(resolveMarketplaceSource('https://example.com/x.git', repoRoot, cfg), 'https://example.com/x.git')
  assert.equal(resolveMarketplaceSource('./local-market', repoRoot, cfg), path.resolve('./local-market'))
})

test('normalizeTargets expands all and rejects unknown targets', async () => {
  const ctx = fakeCtx()
  assert.deepEqual(normalizeTargets([], ctx, ['claude']), ['claude'])
  assert.deepEqual(normalizeTargets(['all'], ctx, ['claude', 'codex']), ['claude', 'codex'])
  assert.deepEqual(normalizeTargets(['codex', 'claude', 'codex'], ctx, []), ['codex', 'claude'])
  assert.throws(() => normalizeTargets(['vim'], ctx, []), /unknown target/)
})

test('repository config exposes the same host paths the installer uses', async () => {
  const cfg = await config()
  const ctx = fakeCtx()
  assert.equal(skillsDirFor('codex', 'user', ctx), path.join(home, '.codex', 'skills'))
  assert.equal(skillsDirFor('cursor', 'user', ctx), path.join(home, '.cursor', 'skills'))
  assert.ok(cfg.skills.length === 6)
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'plugin.json'), 'utf8'))
  assert.equal(manifest.name, cfg.plugin.name)
})
