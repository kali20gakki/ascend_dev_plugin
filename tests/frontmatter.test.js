import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseFrontmatter, readSkill } from '../scripts/lib/skill.js'

test('parses flat scalar frontmatter', () => {
  const { data, body } = parseFrontmatter('---\nname: demo\ndescription: A demo skill: with a colon\n---\n\n# Body\n')
  assert.equal(data.name, 'demo')
  assert.equal(data.description, 'A demo skill: with a colon')
  assert.equal(body, '# Body\n')
})

test('parses quoted values and CRLF input', () => {
  const { data } = parseFrontmatter('---\r\nname: "demo"\r\ndescription: \'quoted value\'\r\n---\r\nbody\r\n')
  assert.equal(data.name, 'demo')
  assert.equal(data.description, 'quoted value')
})

test('parses folded and literal block scalars', () => {
  const folded = parseFrontmatter('---\ndescription: >\n  first line\n  second line\n---\nbody\n')
  assert.equal(folded.data.description, 'first line second line')
  const literal = parseFrontmatter('---\ndescription: |\n  first\n  second\n---\nbody\n')
  assert.equal(literal.data.description, 'first\nsecond')
})

test('keeps nested metadata out of top-level scalars', () => {
  const { data } = parseFrontmatter('---\nname: demo\nmetadata:\n  version: "1.0.0"\n  upstream: https://example.com\n---\nbody\n')
  assert.equal(data.name, 'demo')
  assert.equal(data.metadata.version, '1.0.0')
})

test('returns the whole document when frontmatter is absent', () => {
  const { data, body } = parseFrontmatter('# Just markdown\n')
  assert.deepEqual(data, {})
  assert.equal(body, '# Just markdown\n')
})

test('readSkill reports invocation flags and missing fields', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ascend-skill-'))
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, 'SKILL.md'), [
      '---',
      'name: demo-skill',
      'description: Demo description',
      'whenToUse: when testing',
      'disable-model-invocation: true',
      'user-invocable: no',
      '---',
      '',
      'Body text',
      '',
    ].join('\n'))
    const skill = await readSkill(directory)
    assert.equal(skill.name, 'demo-skill')
    assert.equal(skill.description, 'Demo description')
    assert.equal(skill.whenToUse, 'when testing')
    assert.deepEqual(skill.invocation, { modelInvocable: false, userInvocable: false })
    assert.deepEqual(skill.problems, [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('readSkill rejects invalid booleans and missing name', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ascend-skill-'))
  try {
    await writeFile(path.join(directory, 'SKILL.md'), '---\ndescription: no name\ndisable-model-invocation: maybe\n---\nbody\n')
    const skill = await readSkill(directory)
    assert.ok(skill.problems.some(problem => problem.includes('missing frontmatter "name"')))
    assert.ok(skill.problems.some(problem => problem.includes('disable-model-invocation')))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
