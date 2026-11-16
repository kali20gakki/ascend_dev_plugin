/**
 * Render the host manifests from the normalized configuration. Nothing here
 * touches disk; `sync-manifests.js` owns reading and writing.
 */
import { text } from './config.js'

export const PORTABLE_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

/** Repository-relative paths generated from the configuration. */
export const GENERATED = Object.freeze({
  portable: 'plugin.json',
  claude: '.claude-plugin/plugin.json',
  claudeMarketplace: '.claude-plugin/marketplace.json',
  codexMarketplace: '.agents/plugins/marketplace.json',
  portableMcp: 'mcp.json',
  claudeMcp: '.mcp.json',
})

/**
 * Build every generated artifact.
 * @param {object} config normalized configuration
 * @returns {Map<string, string>} repository-relative path to file content
 */
export function renderArtifacts(config) {
  const artifacts = new Map()
  artifacts.set(GENERATED.portable, renderPortableManifest(config))
  artifacts.set(GENERATED.claude, renderClaudeManifest(config))
  artifacts.set(GENERATED.claudeMarketplace, renderClaudeMarketplace(config))
  if (config.codex.repoMarketplace) artifacts.set(GENERATED.codexMarketplace, renderCodexMarketplace(config))
  const mcp = renderMcpArtifacts(config)
  for (const [file, content] of mcp) artifacts.set(file, content)
  return artifacts
}

/** Portable Agent Plugins manifest read by Codex, Cursor, VS Code and others. */
export function renderPortableManifest(config) {
  const { plugin, codex, components } = config
  const extensions = {
    'com.openai': {
      interface: {
        displayName: text(plugin.displayName),
        shortDescription: text(plugin.description),
        category: codex.category,
        composerIcon: './assets/icon.svg',
        logo: './assets/icon.svg',
      },
    },
  }
  if (components.hooks) extensions['com.openai'].hooks = `./${stripDotSlash(components.hooks)}`
  const manifest = {
    $schema: PORTABLE_SCHEMA,
    name: plugin.name,
    version: plugin.version,
    description: text(plugin.description),
    author: compact(plugin.author),
    ...(plugin.homepage ? { homepage: plugin.homepage } : {}),
    ...(plugin.repository ? { repository: plugin.repository } : {}),
    ...(plugin.license ? { license: plugin.license } : {}),
    ...(plugin.keywords.length > 0 ? { keywords: plugin.keywords } : {}),
    extensions,
  }
  return json(manifest)
}

/** Claude Code plugin manifest. */
export function renderClaudeManifest(config) {
  const { plugin, components } = config
  const manifest = {
    name: plugin.name,
    displayName: text(plugin.displayName),
    version: plugin.version,
    description: text(plugin.description),
    author: compact(plugin.author),
    ...(plugin.homepage ? { homepage: plugin.homepage } : {}),
    ...(plugin.repository ? { repository: plugin.repository } : {}),
    ...(plugin.license ? { license: plugin.license } : {}),
    ...(plugin.keywords.length > 0 ? { keywords: plugin.keywords } : {}),
  }
  if (components.commands.length > 0) manifest.commands = components.commands.map(file => `./${stripDotSlash(file)}`)
  if (components.agents.length > 0) manifest.agents = components.agents.map(file => `./${stripDotSlash(file)}`)
  if (components.hooks) manifest.hooks = `./${stripDotSlash(components.hooks)}`
  if (components.mcpServers.length > 0) manifest.mcpServers = `./${GENERATED.claudeMcp}`
  return json(manifest)
}

/** Claude Code marketplace entry; Codex also accepts this file as a legacy marketplace. */
export function renderClaudeMarketplace(config) {
  const { plugin, marketplace } = config
  return json({
    name: marketplace.name,
    owner: compact(marketplace.owner),
    description: text(marketplace.description),
    plugins: [{
      name: plugin.name,
      source: '.',
      description: text(plugin.description),
      version: plugin.version,
      tags: plugin.keywords,
    }],
  })
}

/** Codex-native repo marketplace used only when the legacy file is not picked up. */
export function renderCodexMarketplace(config) {
  const { plugin, codex } = config
  return json({
    name: config.marketplace.name,
    interface: { displayName: text(config.marketplace.displayName) },
    plugins: [{
      name: plugin.name,
      source: { source: 'local', path: './' },
      policy: {
        installation: codex.installation,
        authentication: codex.authentication,
      },
      category: codex.category,
    }],
  })
}

/** Generate `mcp.json` (portable, typed) and `.mcp.json` (Claude) when servers are configured. */
export function renderMcpArtifacts(config) {
  const artifacts = new Map()
  const servers = config.components.mcpServers
  if (servers.length === 0) return artifacts
  const portable = {}
  const claude = {}
  for (const server of servers) {
    const { name, type, description, ...rest } = server
    if (!name || typeof name !== 'string') throw new Error('components.mcpServers entries need a name')
    portable[name] = { type: type ?? 'stdio', ...rest }
    claude[name] = rest
  }
  artifacts.set(GENERATED.portableMcp, json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: portable }))
  artifacts.set(GENERATED.claudeMcp, json({ mcpServers: claude }))
  return artifacts
}

function compact(object) {
  return Object.fromEntries(Object.entries(object ?? {}).filter(([, value]) => value !== undefined && value !== ''))
}

function stripDotSlash(file) {
  return file.replace(/^\.\//, '')
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
