#!/usr/bin/env node
/**
 * Scaffold an additional capability and wire it into the manifests.
 *
 *   node scripts/add-component.js command <name> [--description "..."]
 *   node scripts/add-component.js agent <name>
 *   node scripts/add-component.js hook
 *   node scripts/add-component.js mcp-server <name> [--transport stdio]
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConfig, saveConfig } from './lib/config.js'
import { boolFlag, parseArgs, stringFlag } from './lib/args.js'
import { readJsonIfExists, writeText } from './lib/fsx.js'
import { repoRootFrom } from './lib/repo.js'
import { checkRepository } from './lib/checks.js'

const repoRoot = repoRootFrom(import.meta.url)
const { positionals, flags } = parseArgs(process.argv.slice(2))
const [type, name] = positionals

if (!['command', 'agent', 'hook', 'mcp-server'].includes(type)) {
  console.error('usage: node scripts/add-component.js <command|agent|hook|mcp-server> <name> [--description ...]')
  process.exit(2)
}
if (type !== 'hook' && (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))) {
  console.error(`${type} name must be kebab-case`)
  process.exit(2)
}

const config = await loadConfig(repoRoot)
const description = stringFlag(flags, 'description') ?? `TODO: describe when to use the ${name ?? 'hook'} capability.`
const dryRun = boolFlag(flags, 'dry-run')

switch (type) {
  case 'command': {
    const relative = `commands/${name}.md`
    await writeText(path.join(repoRoot, relative), commandTemplate(name, description))
    config.components.commands = unique([...config.components.commands, relative])
    console.log(`created ${relative}`)
    break
  }
  case 'agent': {
    const relative = `agents/${name}.md`
    await writeText(path.join(repoRoot, relative), agentTemplate(name, description))
    config.components.agents = unique([...config.components.agents, relative])
    console.log(`created ${relative}`)
    break
  }
  case 'hook': {
    const relative = 'hooks/hooks.json'
    const existing = await readJsonIfExists(path.join(repoRoot, relative))
    if (existing) {
      console.log(`${relative} already exists; edit it to add events.`)
    } else {
      await writeText(path.join(repoRoot, relative), `${JSON.stringify({ hooks: {} }, null, 2)}\n`)
      console.log(`created ${relative} (no events yet; add them before relying on it)`)
    }
    config.components.hooks = relative
    break
  }
  case 'mcp-server': {
    if (config.components.mcpServers.some(server => server.name === name)) {
      console.error(`mcp server "${name}" already exists in plugin.config.json`)
      process.exit(1)
    }
    config.components.mcpServers = [...config.components.mcpServers, {
      name,
      type: stringFlag(flags, 'transport') ?? 'stdio',
      command: 'TODO',
      args: [],
      description,
    }]
    console.log(`added mcp server "${name}" with a TODO command; fill it in before committing`)
    break
  }
}

await saveConfig(repoRoot, config)

if (!dryRun) {
  const sync = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-manifests.js')], { cwd: repoRoot, stdio: 'inherit' })
  const { errors, warnings } = await checkRepository(repoRoot)
  for (const warning of warnings) console.warn(`warning: ${warning}`)
  for (const error of errors) console.error(`error: ${error}`)
  if (sync.status !== 0 || errors.length > 0) process.exit(1)
}

console.log('')
console.log('Next steps: fill in the component, run "npm run verify", then review the regenerated manifests.')

function commandTemplate(id, text) {
  return `---
description: ${JSON.stringify(text)}
---

# ${title(id)}

TODO: instructions for /${config.plugin.name}:${id}.
`
}

function agentTemplate(id, text) {
  return `---
name: ${id}
description: ${JSON.stringify(text)}
tools: Read, Grep, Glob
---

You are ${title(id)}. TODO: describe the agent's job, inputs, and expected output.
`
}

function title(value) {
  return value.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function unique(values) {
  return [...new Set(values)]
}
