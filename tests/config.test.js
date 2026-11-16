import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, normalizeConfig, validateConfig } from '../scripts/lib/config.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function rawConfig() {
  return JSON.parse(await readFile(path.join(repoRoot, 'plugin.config.json'), 'utf8'))
}

test('repository configuration loads with six skills', async () => {
  const config = await loadConfig(repoRoot)
  assert.equal(config.plugin.name, 'ascend-dev-skills')
  assert.equal(config.plugin.version, '0.1.0')
  assert.equal(config.marketplace.name, 'ascend-dev')
  assert.equal(config.skills.length, 6)
  assert.deepEqual(config.skills.map(skill => skill.id), [
    'scene-fuzz',
    'gitcode-cli',
    'ascend-interface-auditor',
    'gitcode-code-reviewer',
    'gitcode-release-note-generator',
    'document-ux-review',
  ])
  for (const skill of config.skills) {
    assert.equal(skill.path, `skills/${skill.id}`)
    assert.match(skill.url, /^https:\/\/github\.com\/kali20gakki\//)
    assert.ok(skill.title.en && skill.title.zh)
    assert.ok(skill.description.en && skill.description.zh)
  }
})

test('validation rejects bad plugin names', async () => {
  const raw = await rawConfig()
  raw.plugin.name = 'Ascend_Dev'
  const problems = validateConfig(raw)
  assert.ok(problems.some(problem => problem.includes('plugin.name')))
})

test('validation rejects double hyphens and reserved names', async () => {
  const raw = await rawConfig()
  raw.plugin.name = 'ascend--dev'
  assert.ok(validateConfig(raw).some(problem => problem.includes('plugin.name')))
  raw.plugin.name = 'claude-tools'
  assert.ok(validateConfig(raw).some(problem => problem.includes('reserved')))
})

test('validation rejects a marketplace reserved by Claude', async () => {
  const raw = await rawConfig()
  raw.marketplace.name = 'claude-code-marketplace'
  assert.ok(validateConfig(raw).some(problem => problem.includes('reserved')))
})

test('validation rejects duplicate skills and wrong paths', async () => {
  const raw = await rawConfig()
  raw.skills.push({ ...raw.skills[0] })
  const problems = validateConfig(raw)
  assert.ok(problems.some(problem => problem.includes('duplicated')))
  raw.skills = [raw.skills[0]]
  raw.skills[0].path = 'skills/elsewhere'
  assert.ok(validateConfig(raw).some(problem => problem.includes('skills[0].path')))
})

test('validation rejects missing localized text and bad urls', async () => {
  const raw = await rawConfig()
  delete raw.plugin.description.zh
  raw.skills[0].url = 'not-a-url'
  const problems = validateConfig(raw)
  assert.ok(problems.some(problem => problem.includes('plugin.description.zh')))
  assert.ok(problems.some(problem => problem.includes('skills[0].url')))
})

test('normalization fills codex and component defaults', async () => {
  const config = normalizeConfig(await rawConfig())
  assert.equal(config.codex.installation, 'AVAILABLE')
  assert.equal(config.codex.authentication, 'ON_INSTALL')
  assert.equal(config.codex.repoMarketplace, false)
  assert.deepEqual(config.components, { commands: [], agents: [], hooks: null, mcpServers: [] })
})
