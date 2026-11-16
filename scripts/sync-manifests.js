#!/usr/bin/env node
/**
 * Regenerate every host manifest from `plugin.config.json`.
 *
 *   node scripts/sync-manifests.js          write the files
 *   node scripts/sync-manifests.js --check  fail when a file is out of date
 */
import path from 'node:path'
import { loadConfig } from './lib/config.js'
import { GENERATED, renderArtifacts } from './lib/render.js'
import { readJsonIfExists, readTextIfExists, removeIfExists, writeText } from './lib/fsx.js'
import { repoRootFrom } from './lib/repo.js'

const repoRoot = repoRootFrom(import.meta.url)
const check = process.argv.includes('--check')

const config = await loadConfig(repoRoot)
const artifacts = renderArtifacts(config)
const drift = []

for (const [relative, content] of artifacts) {
  const file = path.join(repoRoot, relative)
  const current = await readTextIfExists(file)
  if (current === content) continue
  drift.push(relative)
  if (!check) {
    await writeText(file, content)
    console.log(`wrote ${relative}`)
  }
}

// A generated file that is no longer produced (for example after disabling the
// Codex repo marketplace) must not linger: hosts would keep reading it.
for (const relative of Object.values(GENERATED)) {
  if (artifacts.has(relative)) continue
  const file = path.join(repoRoot, relative)
  const current = await readTextIfExists(file)
  if (current === undefined) continue
  drift.push(`${relative} (stale)`)
  if (!check) {
    await removeIfExists(file)
    console.log(`removed stale ${relative}`)
  }
}

// Keep the npm/tooling manifest version equal to the plugin version.
const packageFile = path.join(repoRoot, 'package.json')
const packageJson = await readJsonIfExists(packageFile)
if (packageJson && packageJson.version !== config.plugin.version) {
  drift.push('package.json#version')
  if (!check) {
    packageJson.version = config.plugin.version
    await writeText(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`)
    console.log(`updated package.json version to ${config.plugin.version}`)
  }
}

if (check) {
  if (drift.length > 0) {
    console.error('Generated files are out of date:')
    for (const item of drift) console.error(`  - ${item}`)
    console.error('Run: node scripts/sync-manifests.js')
    process.exit(1)
  }
  console.log('Generated files are up to date.')
} else if (drift.length === 0) {
  console.log('Generated files are already up to date.')
}
