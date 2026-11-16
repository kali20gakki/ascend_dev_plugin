#!/usr/bin/env node
/**
 * Add a skill as a git submodule, fill `plugin.config.json`, and validate.
 *
 *   npm run add-skill -- https://github.com/owner/repo.git --id my-skill
 *
 * Options: --id, --branch, --title-en, --title-zh, --description-en,
 * --description-zh, --tags a,b
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConfig, saveConfig } from './lib/config.js'
import { parseArgs, stringFlag, listFlag } from './lib/args.js'
import { exists, readTextIfExists } from './lib/fsx.js'
import { isGitRepository, repoRootFrom } from './lib/repo.js'
import { readSkill } from './lib/skill.js'
import { checkRepository } from './lib/checks.js'

const repoRoot = repoRootFrom(import.meta.url)
const { positionals, flags } = parseArgs(process.argv.slice(2))
const url = positionals[0]

if (!url) {
  console.error('usage: node scripts/add-skill.js <git-url> [--id <kebab-id>] [--branch <ref>]')
  process.exit(2)
}

const branch = stringFlag(flags, 'branch')
const id = stringFlag(flags, 'id') ?? deriveId(url)
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error(`skill id "${id}" must be kebab-case; pass --id explicitly`)
  process.exit(2)
}

const config = await loadConfig(repoRoot)
const skillPath = `skills/${id}`
const existing = config.skills.find(skill => skill.id === id)

if (!(await isGitRepository(repoRoot))) {
  console.error('This repository is not a git work tree, so a submodule cannot be added.')
  console.error('Run "git init" first, or clone the repository with git.')
  process.exit(1)
}

const targetDir = path.join(repoRoot, skillPath)
const gitmodules = await readTextIfExists(path.join(repoRoot, '.gitmodules'))
const alreadyDeclared = gitmodules !== undefined && new RegExp(`\\[submodule\\s+"${escapeRegExp(skillPath)}"\\]`).test(gitmodules)

if (!alreadyDeclared) {
  const args = ['-C', repoRoot, 'submodule', 'add']
  if (branch) args.push('-b', branch)
  args.push(url, skillPath)
  console.log(`git ${args.slice(2).join(' ')}`)
  const result = spawnSync('git', args, { stdio: 'inherit' })
  if ((result.status ?? 1) !== 0) {
    console.error('git submodule add failed; the skill was not added.')
    process.exit(1)
  }
} else if (!(await exists(path.join(targetDir, 'SKILL.md')))) {
  console.log(`git -C ${repoRoot} submodule update --init -- ${skillPath}`)
  const result = spawnSync('git', ['-C', repoRoot, 'submodule', 'update', '--init', '--', skillPath], { stdio: 'inherit' })
  if ((result.status ?? 1) !== 0) {
    console.error('git submodule update failed; initialize the submodule and retry.')
    process.exit(1)
  }
}

let skill
try {
  skill = await readSkill(targetDir)
} catch (error) {
  console.error(`Cannot read ${skillPath}/SKILL.md: ${error.message}`)
  process.exit(1)
}
for (const problem of skill.problems) console.error(`warning: ${problem}`)

const frontmatterDescription = skill.description ?? id
const titleEn = stringFlag(flags, 'title-en') ?? existing?.title?.en ?? titleFromId(id)
const titleZh = stringFlag(flags, 'title-zh') ?? existing?.title?.zh ?? titleEn
const descriptionEn = stringFlag(flags, 'description-en') ?? existing?.description?.en ?? frontmatterDescription
const descriptionZh = stringFlag(flags, 'description-zh') ?? existing?.description?.zh ?? frontmatterDescription
const tagsFlag = listFlag(flags, 'tags')
const tags = tagsFlag.length > 0 ? tagsFlag : (existing?.tags ?? [])

const entry = {
  id,
  path: skillPath,
  url,
  ...(branch ? { branch } : {}),
  title: { en: titleEn, zh: titleZh },
  description: { en: descriptionEn, zh: descriptionZh },
  tags,
}

const nextSkills = existing
  ? config.skills.map(skill => (skill.id === id ? { ...skill, ...entry } : skill))
  : [...config.skills, entry]
await saveConfig(repoRoot, { ...config, skills: nextSkills })

const sync = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-manifests.js')], { cwd: repoRoot, stdio: 'inherit' })

const { errors, warnings } = await checkRepository(repoRoot, { requireSkills: false })
for (const warning of warnings) console.warn(`warning: ${warning}`)
for (const error of errors) console.error(`error: ${error}`)

if (sync.status !== 0 || errors.length > 0) {
  console.error('Skill added, but validation reported problems above. Polish plugin.config.json, then run npm run verify.')
  process.exit(1)
}

console.log('')
console.log(`Added ${id} -> ${skillPath}${existing ? ' (updated metadata)' : ''}`)
console.log(`Skill name in frontmatter: ${skill.name ?? '(missing)'}`)
console.log('Titles and descriptions were derived from the skill; edit plugin.config.json to polish them.')
console.log('Next: git add .gitmodules plugin.config.json skills && git commit')

function deriveId(repoUrl) {
  const cleaned = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '')
  const last = cleaned.split(/[/:]/).filter(Boolean).pop() ?? 'skill'
  return last
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleFromId(value) {
  return value.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
