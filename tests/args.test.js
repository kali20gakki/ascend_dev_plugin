import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSelection } from '../scripts/lib/prompt.js'
import { parseArgs, listFlag, stringFlag, boolFlag } from '../scripts/lib/args.js'

test('parseSelection accepts lists, ranges, all and none', () => {
  assert.deepEqual(parseSelection('1,3-5', 6), [0, 2, 3, 4])
  assert.deepEqual(parseSelection('all', 3), [0, 1, 2])
  assert.deepEqual(parseSelection('none', 3), [])
  assert.deepEqual(parseSelection('', 3), [])
  assert.deepEqual(parseSelection('3-1', 3), [0, 1, 2])
  assert.deepEqual(parseSelection('0,9,2', 3), [1])
})

test('parseArgs handles flags, equals form and positionals', () => {
  const { positionals, flags } = parseArgs(['install', '--targets', 'claude,codex', '--scope=user', '--dry-run', '--skills', '1', '--skills', '2'])
  assert.deepEqual(positionals, ['install'])
  assert.deepEqual(listFlag(flags, 'targets'), ['claude', 'codex'])
  assert.equal(stringFlag(flags, 'scope'), 'user')
  assert.equal(boolFlag(flags, 'dry-run'), true)
  assert.deepEqual(listFlag(flags, 'skills'), ['1', '2'])
})

test('parseArgs treats a following flag as a boolean', () => {
  const { flags } = parseArgs(['--yes', '--targets', 'claude'])
  assert.equal(boolFlag(flags, 'yes'), true)
  assert.equal(stringFlag(flags, 'targets'), 'claude')
})
