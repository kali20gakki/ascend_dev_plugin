import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGitmodules } from '../scripts/lib/repo.js'
import { checkRepository } from '../scripts/lib/checks.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the repository declares six submodules with urls', async () => {
  const modules = await readGitmodules(repoRoot)
  assert.equal(modules.size, 6)
  assert.equal(modules.get('skills/scene-fuzz')?.url, 'https://github.com/kali20gakki/sence_fuzz.git')
  assert.equal(modules.get('skills/scene-fuzz')?.branch, 'main')
})

test('readGitmodules handles url before path and missing branch', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ascend-gitmodules-'))
  try {
    await writeFile(path.join(directory, '.gitmodules'), [
      '[submodule "skills/a"]',
      '\turl = https://example.com/a.git',
      '\tpath = skills/a',
      '[submodule "skills/b"]',
      '\tpath = skills/b',
      '\turl = https://example.com/b.git',
      '\tbranch = develop',
      '',
    ].join('\n'))
    const modules = await readGitmodules(directory)
    assert.equal(modules.get('skills/a')?.url, 'https://example.com/a.git')
    assert.equal(modules.get('skills/b')?.branch, 'develop')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('repository self-checks report no errors', async () => {
  const { errors, warnings } = await checkRepository(repoRoot)
  assert.deepEqual(errors, [])
  assert.equal(warnings.filter(warning => warning.includes('SKILL.md is missing')).length, 0)
})
