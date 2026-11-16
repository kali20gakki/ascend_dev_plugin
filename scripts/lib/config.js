/**
 * Load and validate `plugin.config.json`, the single source of truth for every
 * generated host manifest.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const CONFIG_FILE = 'plugin.config.json'
export const SKILLS_ROOT = 'skills'

/** Claude Code plugin names must be simple kebab-case. */
const CLAUDE_PLUGIN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Agent Plugins: 1-64 lowercase alphanumerics, hyphens, periods; alnum ends; no `--` or `..`. */
const AGENT_PLUGIN_NAME = /^[a-z0-9](?:[a-z0-9.-]{0,62})[a-z0-9]$/
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const CLAUDE_RESERVED_PLUGIN_PREFIXES = ['claude-', 'anthropic-', 'anthropics-', 'cc-plugin-']
const CLAUDE_RESERVED_PLUGIN_NAMES = new Set(['claude', 'anthropic', 'anthropics', 'claude-code', 'claude-mods'])
const RESERVED_MARKETPLACE_NAMES = new Set([
  'claude-code-marketplace', 'claude-code-plugins', 'claude-plugins-official', 'anthropic-marketplace',
  'anthropic-plugins', 'agent-skills', 'anthropic-agent-skills', 'life-sciences', 'knowledge-work-plugins',
  'claude-for-legal', 'claude-for-financial-services', 'financial-services-plugins', 'first-party-plugins',
  'claude-tag-plugins', 'claude-community', 'claude-plugins-community', 'healthcare',
  'anthropic-plugin-directory', 'claude-plugin-directory', 'inline', 'builtin', 'skills-dir', 'synced',
  'claude-plugin-test',
])

/**
 * Read and normalize the configuration.
 * @param {string} repoRoot absolute repository root
 * @returns {Promise<object>} normalized configuration
 */
export async function loadConfig(repoRoot) {
  const file = path.join(repoRoot, CONFIG_FILE)
  let raw
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${CONFIG_FILE}: ${error.message}`)
  }
  const problems = validateConfig(raw)
  if (problems.length > 0) {
    throw new Error(`Invalid ${CONFIG_FILE}:\n- ${problems.join('\n- ')}`)
  }
  return normalizeConfig(raw)
}

/**
 * Validate the raw configuration shape without filling defaults.
 * @param {unknown} raw parsed JSON
 * @returns {string[]} human-readable problems; empty when valid
 */
export function validateConfig(raw) {
  const problems = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return ['configuration must be a JSON object']
  }
  if (raw.schemaVersion !== 1) problems.push('schemaVersion must be 1')

  const plugin = raw.plugin
  if (typeof plugin !== 'object' || plugin === null) {
    problems.push('plugin must be an object')
  } else {
    checkName(plugin.name, 'plugin.name', problems)
    if (typeof plugin.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(plugin.version)) {
      problems.push('plugin.version must be a semantic version such as 1.2.3')
    }
    checkLocalizedText(plugin.displayName, 'plugin.displayName', problems)
    checkLocalizedText(plugin.description, 'plugin.description', problems)
    if (typeof plugin.author?.name !== 'string' || plugin.author.name.trim() === '') {
      problems.push('plugin.author.name must be a non-empty string')
    }
    for (const field of ['homepage', 'repository', 'license']) {
      if (plugin[field] !== undefined && typeof plugin[field] !== 'string') {
        problems.push(`plugin.${field} must be a string`)
      }
    }
    if (plugin.keywords !== undefined && !isStringArray(plugin.keywords)) {
      problems.push('plugin.keywords must be an array of strings')
    }
  }

  const marketplace = raw.marketplace
  if (typeof marketplace !== 'object' || marketplace === null) {
    problems.push('marketplace must be an object')
  } else {
    checkMarketplaceName(marketplace.name, problems)
    if (typeof marketplace.owner?.name !== 'string' || marketplace.owner.name.trim() === '') {
      problems.push('marketplace.owner.name must be a non-empty string')
    }
    checkLocalizedText(marketplace.displayName, 'marketplace.displayName', problems)
    checkLocalizedText(marketplace.description, 'marketplace.description', problems)
  }

  if (raw.codex !== undefined) {
    const codex = raw.codex
    if (typeof codex !== 'object' || codex === null) problems.push('codex must be an object')
    else {
      if (codex.category !== undefined && typeof codex.category !== 'string') problems.push('codex.category must be a string')
      if (codex.installation !== undefined && !['AVAILABLE', 'INSTALLED_BY_DEFAULT', 'NOT_AVAILABLE'].includes(codex.installation)) {
        problems.push('codex.installation must be AVAILABLE, INSTALLED_BY_DEFAULT or NOT_AVAILABLE')
      }
      if (codex.authentication !== undefined && !['ON_INSTALL', 'ON_FIRST_USE'].includes(codex.authentication)) {
        problems.push('codex.authentication must be ON_INSTALL or ON_FIRST_USE')
      }
      if (codex.repoMarketplace !== undefined && typeof codex.repoMarketplace !== 'boolean') {
        problems.push('codex.repoMarketplace must be a boolean')
      }
    }
  }

  const components = raw.components
  if (components !== undefined) {
    if (typeof components !== 'object' || components === null) problems.push('components must be an object')
    else {
      for (const field of ['commands', 'agents']) {
        if (components[field] !== undefined && !isStringArray(components[field])) {
          problems.push(`components.${field} must be an array of strings`)
        }
      }
      if (components.hooks !== undefined && components.hooks !== null && typeof components.hooks !== 'string') {
        problems.push('components.hooks must be a string path or null')
      }
      if (components.mcpServers !== undefined && !Array.isArray(components.mcpServers)) {
        problems.push('components.mcpServers must be an array')
      }
    }
  }

  if (!Array.isArray(raw.skills)) {
    problems.push('skills must be an array')
    return problems
  }
  const ids = new Set()
  const paths = new Set()
  raw.skills.forEach((skill, index) => {
    const at = `skills[${index}]`
    if (typeof skill !== 'object' || skill === null) {
      problems.push(`${at} must be an object`)
      return
    }
    if (typeof skill.id !== 'string' || !KEBAB_ID.test(skill.id)) problems.push(`${at}.id must be kebab-case`)
    else if (ids.has(skill.id)) problems.push(`${at}.id is duplicated: ${skill.id}`)
    else ids.add(skill.id)
    const expectedPath = `${SKILLS_ROOT}/${skill.id}`
    if (skill.path !== expectedPath) problems.push(`${at}.path must be ${expectedPath}`)
    else if (paths.has(skill.path)) problems.push(`${at}.path is duplicated: ${skill.path}`)
    else paths.add(skill.path)
    if (typeof skill.url !== 'string' || !/^(https?:\/\/|git@|ssh:\/\/)\S+$/i.test(skill.url)) {
      problems.push(`${at}.url must be an http(s), git@ or ssh git URL`)
    }
    if (skill.branch !== undefined && typeof skill.branch !== 'string') problems.push(`${at}.branch must be a string`)
    checkLocalizedText(skill.title, `${at}.title`, problems)
    checkLocalizedText(skill.description, `${at}.description`, problems)
    if (skill.tags !== undefined && !isStringArray(skill.tags)) problems.push(`${at}.tags must be an array of strings`)
  })

  return problems
}

function checkName(name, at, problems) {
  if (typeof name !== 'string' || name === '') {
    problems.push(`${at} must be a non-empty string`)
    return
  }
  if (!AGENT_PLUGIN_NAME.test(name) || name.includes('--') || name.includes('..')) {
    problems.push(`${at} "${name}" violates the Agent Plugins name rules (1-64 lowercase letters, digits, hyphens or periods; no "--" or "..")`)
  }
  if (!CLAUDE_PLUGIN_NAME.test(name)) {
    problems.push(`${at} "${name}" must be kebab-case for Claude Code`)
  }
  if (CLAUDE_RESERVED_PLUGIN_PREFIXES.some(prefix => name.startsWith(prefix)) || CLAUDE_RESERVED_PLUGIN_NAMES.has(name)) {
    problems.push(`${at} "${name}" is reserved by Anthropic`)
  }
}

function checkMarketplaceName(name, problems) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) {
    problems.push('marketplace.name must start alphanumeric and use letters, digits, ".", "_" or "-" (no "..")')
    return
  }
  if (RESERVED_MARKETPLACE_NAMES.has(name)) problems.push(`marketplace.name "${name}" is reserved by Claude Code`)
}

function checkLocalizedText(value, at, problems) {
  if (typeof value !== 'object' || value === null) {
    problems.push(`${at} must be an object with en/zh strings`)
    return
  }
  for (const lang of ['en', 'zh']) {
    if (typeof value[lang] !== 'string' || value[lang].trim() === '') problems.push(`${at}.${lang} must be a non-empty string`)
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim() !== '')
}

/**
 * Fill defaults so renderers and the installer can read optional fields directly.
 * @param {object} raw validated configuration
 * @returns {object} normalized configuration
 */
export function normalizeConfig(raw) {
  return {
    schemaVersion: 1,
    plugin: {
      keywords: [],
      ...raw.plugin,
    },
    marketplace: {
      ...raw.marketplace,
    },
    codex: {
      category: 'Productivity',
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
      repoMarketplace: false,
      ...raw.codex,
    },
    components: {
      commands: [],
      agents: [],
      hooks: null,
      mcpServers: [],
      ...raw.components,
    },
    skills: raw.skills.map(skill => ({
      branch: undefined,
      tags: [],
      ...skill,
    })),
  }
}

/** Localized text for a host manifest: English is the portable default. */
export function text(value, lang = 'en') {
  if (typeof value === 'string') return value
  return value?.[lang] ?? value?.en ?? ''
}

/**
 * Write the configuration back with stable formatting.
 * @param {string} repoRoot repository root
 * @param {object} config normalized configuration
 */
export async function saveConfig(repoRoot, config) {
  const { writeText } = await import('./fsx.js')
  await writeText(path.join(repoRoot, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`)
}
