import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultCacheDir, ensureSource, existingSource, skillsPresent } from '../scripts/lib/source.js'

const config = {
  plugin: { repository: 'https://github.com/example/repo.git' },
  skills: [
    { id: 'a', path: 'skills/a' },
    { id: 'b', path: 'skills/b' },
  ],
}

async function writeSkill(root, id) {
  await mkdir(path.join(root, 'skills', id), { recursive: true })
  await writeFile(path.join(root, 'skills', id, 'SKILL.md'), `---\nname: ${id}\ndescription: demo\n---\n`)
}

test('defaultCacheDir follows the platform and environment', () => {
  assert.equal(defaultCacheDir({ HOME: '/home/u' }, 'linux'), path.join('/home/u', '.cache', 'ascend-dev-skills'))
  assert.equal(defaultCacheDir({ HOME: '/home/u', XDG_CACHE_HOME: '/cache' }, 'linux'), path.join('/cache', 'ascend-dev-skills'))
  assert.equal(defaultCacheDir({ USERPROFILE: 'C:\\Users\\u', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32'), path.join('C:\\Users\\u\\AppData\\Local', 'ascend-dev-skills'))
  assert.equal(defaultCacheDir({ ASCEND_DEV_SKILLS_HOME: '/tmp/x' }, 'linux'), path.resolve('/tmp/x'))
})

test('skillsPresent and existingSource prefer the checkout, then the cache', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ascend-source-'))
  try {
    const checkout = path.join(root, 'checkout')
    const cacheDir = path.join(root, 'cache')
    await writeSkill(checkout, 'a')
    assert.equal(skillsPresent(checkout, config, ['a']), true)
    assert.equal(skillsPresent(checkout, config, ['a', 'b']), false)
    assert.deepEqual(existingSource({ scriptRoot: checkout, config, skillIds: ['a'], cacheDir }), {
      root: checkout, kind: 'checkout', initialized: true,
    })
    const missing = existingSource({ scriptRoot: checkout, config, skillIds: ['a', 'b'], cacheDir })
    assert.equal(missing.kind, 'cache')
    assert.equal(missing.initialized, false)
    await writeSkill(path.join(cacheDir, 'src'), 'a')
    await writeSkill(path.join(cacheDir, 'src'), 'b')
    assert.equal(existingSource({ scriptRoot: checkout, config, skillIds: ['a', 'b'], cacheDir }).initialized, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureSource dry run reports the clone without touching disk', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ascend-source-dry-'))
  try {
    const scriptRoot = path.join(root, 'package')
    await mkdir(scriptRoot, { recursive: true })
    const cacheDir = path.join(root, 'cache')
    const messages = []
    const log = { info: message => messages.push(message), step: message => messages.push(message), warn() {}, error() {} }
    const source = await ensureSource({ scriptRoot, config, skillIds: ['a'], cacheDir, log, dryRun: true })
    assert.equal(source.kind, 'cache')
    assert.equal(source.willClone, true)
    assert.equal(existsSync(cacheDir), false)
    assert.ok(messages.some(message => message.includes('将克隆')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
