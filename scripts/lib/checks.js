/** Repository self-checks shared by `verify.js`, `add-skill.js` and the tests. */
import path from 'node:path'
import { loadConfig } from './config.js'
import { GENERATED, renderArtifacts } from './render.js'
import { readJsonIfExists, readTextIfExists } from './fsx.js'
import { readGitmodules } from './repo.js'
import { readSkill } from './skill.js'

const PORTABLE_FIELDS = new Set([
  '$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions',
])
const ICON_LIMIT = 256 * 1024

/**
 * Validate configuration, generated manifests, submodule wiring and skills.
 * @param {string} repoRoot absolute repository root
 * @param {{ requireSkills?: boolean }} options when true, uninitialized or empty skills are errors
 * @returns {Promise<{ errors: string[], warnings: string[], config?: object, skills: object[] }>}
 */
export async function checkRepository(repoRoot, options = {}) {
  const errors = []
  const warnings = []
  const skills = []
  let config
  try {
    config = await loadConfig(repoRoot)
  } catch (error) {
    return { errors: [error.message], warnings, skills }
  }

  await checkGenerated(repoRoot, config, errors)
  await checkSubmodules(repoRoot, config, errors, warnings)
  await checkSkills(repoRoot, config, { errors, warnings, skills, requireSkills: options.requireSkills === true })
  await checkComponents(repoRoot, config, errors, warnings)
  await checkAssets(repoRoot, errors, warnings)
  await checkDocs(repoRoot, errors, warnings)

  return { errors, warnings, config, skills }
}

async function checkGenerated(repoRoot, config, errors) {
  const artifacts = renderArtifacts(config)
  for (const [relative, expected] of artifacts) {
    const actual = await readTextIfExists(path.join(repoRoot, relative))
    if (actual === undefined) errors.push(`${relative} is missing; run node scripts/sync-manifests.js`)
    else if (actual !== expected) errors.push(`${relative} is out of date; run node scripts/sync-manifests.js`)
  }
  for (const relative of Object.values(GENERATED)) {
    if (artifacts.has(relative)) continue
    if (await readTextIfExists(path.join(repoRoot, relative)) !== undefined) {
      errors.push(`${relative} is stale; run node scripts/sync-manifests.js`)
    }
  }

  const portable = await readJsonIfExists(path.join(repoRoot, GENERATED.portable))
  if (!portable) return
  if (portable.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') {
    errors.push(`${GENERATED.portable} must declare the Agent Plugins 1.0.0 schema`)
  }
  for (const key of Object.keys(portable)) {
    if (!PORTABLE_FIELDS.has(key)) errors.push(`${GENERATED.portable} has a non-portable top-level field: ${key}`)
  }
  const marketplace = await readJsonIfExists(path.join(repoRoot, GENERATED.claudeMarketplace))
  if (marketplace && (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0)) {
    errors.push(`${GENERATED.claudeMarketplace} must list at least one plugin`)
  }
  if (marketplace?.plugins?.[0]?.source !== '.') {
    errors.push(`${GENERATED.claudeMarketplace}: plugins[0].source must be "." for a root plugin`)
  }

  const packageJson = await readJsonIfExists(path.join(repoRoot, 'package.json'))
  if (packageJson && packageJson.version !== config.plugin.version) {
    errors.push(`package.json version ${packageJson.version} does not match plugin version ${config.plugin.version}`)
  }
}

async function checkSubmodules(repoRoot, config, errors, warnings) {
  const declared = await readGitmodules(repoRoot)
  if (declared.size === 0) {
    warnings.push('no .gitmodules found; run node scripts/add-skill.js for each configured skill')
    return
  }
  const configured = new Set(config.skills.map(skill => skill.path))
  for (const skill of config.skills) {
    const entry = declared.get(skill.path)
    if (!entry) {
      errors.push(`${skill.path} is not declared in .gitmodules`)
      continue
    }
    if (entry.url && normalizeUrl(entry.url) !== normalizeUrl(skill.url)) {
      errors.push(`${skill.path}: .gitmodules url ${entry.url} does not match config url ${skill.url}`)
    }
    if ((entry.branch ?? undefined) !== (skill.branch ?? undefined)) {
      warnings.push(`${skill.path}: .gitmodules branch ${entry.branch ?? '(default)'} differs from config ${skill.branch ?? '(default)'}`)
    }
  }
  for (const relative of declared.keys()) {
    if (!configured.has(relative)) warnings.push(`${relative} is a submodule but is not listed in plugin.config.json`)
  }
}

async function checkSkills(repoRoot, config, { errors, warnings, skills, requireSkills }) {
  for (const entry of config.skills) {
    const directory = path.join(repoRoot, entry.path)
    const file = path.join(directory, 'SKILL.md')
    const text = await readTextIfExists(file)
    if (text === undefined) {
      const message = `${entry.path}/SKILL.md is missing; run "git submodule update --init --recursive"`
      if (requireSkills) errors.push(message)
      else warnings.push(message)
      continue
    }
    let skill
    try {
      skill = await readSkill(directory)
    } catch (error) {
      errors.push(`${entry.path}: cannot read SKILL.md: ${error.message}`)
      continue
    }
    skills.push({ ...skill, id: entry.id })
    for (const problem of skill.problems) errors.push(problem)
    if (skill.name && skill.name !== entry.id) {
      warnings.push(`${entry.path}: frontmatter name "${skill.name}" differs from skill id "${entry.id}"`)
    }
    if (skill.invocation.modelInvocable === false && skill.invocation.userInvocable === false) {
      warnings.push(`${entry.path}: skill is neither model- nor user-invocable`)
    }
  }
}

async function checkComponents(repoRoot, config, errors, warnings) {
  for (const [field, expectedExtension] of [['commands', '.md'], ['agents', '.md']]) {
    for (const relative of config.components[field]) {
      if (!relative.endsWith(expectedExtension)) errors.push(`components.${field} entry ${relative} must be a ${expectedExtension} file`)
      if (await readTextIfExists(path.join(repoRoot, relative)) === undefined) {
        errors.push(`components.${field} entry ${relative} does not exist`)
      }
    }
  }
  if (config.components.hooks) {
    const file = path.join(repoRoot, config.components.hooks)
    const text = await readTextIfExists(file)
    if (text === undefined) errors.push(`components.hooks file ${config.components.hooks} does not exist`)
    else {
      try {
        const parsed = JSON.parse(text)
        if (typeof parsed.hooks !== 'object' || parsed.hooks === null || Object.keys(parsed.hooks).length === 0) {
          warnings.push(`${config.components.hooks} declares no hook events yet`)
        }
      } catch (error) {
        errors.push(`${config.components.hooks} is not valid JSON: ${error.message}`)
      }
    }
  }
  for (const server of config.components.mcpServers) {
    if (!server || typeof server.name !== 'string') {
      errors.push('components.mcpServers entries need a name')
      continue
    }
    for (const [key, value] of Object.entries(server)) {
      if (value === 'TODO') errors.push(`mcp server "${server.name}" still has a TODO ${key}`)
      if (Array.isArray(value) && value.includes('TODO')) errors.push(`mcp server "${server.name}" still has a TODO ${key} entry`)
    }
  }
}

async function checkAssets(repoRoot, errors, warnings) {
  const icon = path.join(repoRoot, 'assets', 'icon.svg')
  const text = await readTextIfExists(icon)
  if (text === undefined) {
    warnings.push('assets/icon.svg is missing')
    return
  }
  if (text.length > ICON_LIMIT) errors.push('assets/icon.svg exceeds the 256 KiB icon limit')
  if (!/<svg[\s>]/i.test(text)) errors.push('assets/icon.svg does not look like an SVG document')
  if (/<script[\s>]/i.test(text) || /<foreignObject[\s>]/i.test(text)) {
    warnings.push('assets/icon.svg contains script or foreignObject markup; keep icons self-contained')
  }
}

async function checkDocs(repoRoot, errors, warnings) {
  for (const file of ['README.md', 'LICENSE']) {
    if (await readTextIfExists(path.join(repoRoot, file)) === undefined) errors.push(`${file} is missing`)
  }
  if (await readTextIfExists(path.join(repoRoot, 'NOTICES.md')) === undefined) {
    warnings.push('NOTICES.md is missing; list submodule licenses before publishing')
  }
}

function normalizeUrl(url) {
  return url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase()
}
