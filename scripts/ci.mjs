#!/usr/bin/env node
/** Run every repository check; suitable for any CI system (`node scripts/ci.mjs`). */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const steps = [
  ['scripts/sync-manifests.js', ['--check']],
  ['scripts/verify.js', ['--require-skills']],
  [null, ['--test']],
]

let failed = false
for (const [script, args] of steps) {
  const label = script === null ? `node ${args.join(' ')}` : `node ${script} ${args.join(' ')}`
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(process.execPath, script === null ? args : [path.join(repoRoot, script), ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if ((result.status ?? 1) !== 0) {
    failed = true
    break
  }
}
process.exit(failed ? 1 : 0)
