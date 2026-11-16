#!/usr/bin/env node
/**
 * Validate configuration, generated manifests, submodules and skills.
 *
 *   node scripts/verify.js [--require-skills] [--quiet]
 */
import { checkRepository } from './lib/checks.js'
import { repoRootFrom } from './lib/repo.js'

const repoRoot = repoRootFrom(import.meta.url)
const requireSkills = process.argv.includes('--require-skills')
const quiet = process.argv.includes('--quiet')

const { errors, warnings, skills } = await checkRepository(repoRoot, { requireSkills })

for (const warning of warnings) console.warn(`warning: ${warning}`)
for (const error of errors) console.error(`error: ${error}`)

if (!quiet) {
  console.log(`Checked ${skills.length} skill(s), ${errors.length} error(s), ${warnings.length} warning(s).`)
}

process.exit(errors.length === 0 ? 0 : 1)
