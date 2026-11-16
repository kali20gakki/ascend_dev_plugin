import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../scripts/lib/config.js'
import { readSkill } from '../scripts/lib/skill.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = await loadConfig(repoRoot)

for (const entry of config.skills) {
  test(`skill ${entry.id} is a valid Agent Skill`, async t => {
    const directory = path.join(repoRoot, entry.path)
    if (!existsSync(path.join(directory, 'SKILL.md'))) {
      t.skip('submodule not initialized; run git submodule update --init --recursive')
      return
    }
    const skill = await readSkill(directory)
    assert.deepEqual(skill.problems, [], `${entry.id} frontmatter problems`)
    assert.equal(skill.name, entry.id)
    assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(skill.description.length > 20)
    assert.ok(skill.body.trim().length > 100)
    assert.equal(skill.invocation.modelInvocable, true)
  })
}
