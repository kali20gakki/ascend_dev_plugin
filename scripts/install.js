#!/usr/bin/env node
/**
 * Interactive installer for the Ascend dev skills plugin.
 *
 *   node scripts/install.js                 # interactive
 *   node scripts/install.js --yes --targets claude,codex
 *   node scripts/install.js --dry-run --json
 *   node scripts/install.js doctor
 *   node scripts/install.js uninstall
 */
import path from 'node:path'
import { loadConfig } from './lib/config.js'
import { boolFlag, listFlag, parseArgs, stringFlag } from './lib/args.js'
import { detectedHosts, hostContext, homeDir, localPluginDirFor, skillsDirFor, HOSTS } from './lib/hosts.js'
import { buildPlan, normalizeTargets, SKILLS_DIR_TARGET } from './lib/plan.js'
import { createPrompter, isInteractive } from './lib/prompt.js'
import { collectState, executePlan, formatPlan, prepareSubmodules, verifyPlan } from './lib/installer.js'
import { checkRepository } from './lib/checks.js'
import { repoRootFrom } from './lib/repo.js'
import { findCommand } from './lib/hosts.js'
import { runCommand } from './lib/run.js'
import { existsSync } from 'node:fs'
import { removeIfExists } from './lib/fsx.js'

const USAGE = `ascend-dev-skills — install the cross-agent skill plugin

Usage:
  node scripts/install.js [install] [options]
  node scripts/install.js doctor
  node scripts/install.js uninstall [options]

Options:
  --targets <list>       claude,codex,cursor,dsh,skills-dir,all (default: detected hosts)
  --scope <scope>        user | project (default: user)
  --method <method>      auto | marketplace | skills (default: auto)
  --skills <list>        all, ids, or indexes/ranges such as 1,3-5 (default: all)
  --source <source>      local (this checkout) | git (plugin.repository) | a git URL or path
  --target <dir>         destination directory for the skills-dir target
  --link                 link skill directories instead of copying (junction on Windows)
  --force                overwrite existing skill directories
  --yes                  skip prompts
  --dry-run              print the plan and change nothing
  --json                 machine-readable output
  --repo <path>          operate on another checkout
  --remove-marketplace   uninstall: also remove the marketplace registration
  --help                 show this help

Examples:
  node scripts/install.js --dry-run --targets all
  node scripts/install.js --yes --targets claude --scope user
  node scripts/install.js --targets codex --source git
  node scripts/install.js --targets skills-dir --target ~/.agents/skills --method skills
`

const rawArgv = process.argv.slice(2)
let command = 'install'
if (rawArgv[0] === '--help' || rawArgv[0] === '-h') {
  command = 'help'
  rawArgv.shift()
} else if (['install', 'doctor', 'uninstall', 'help'].includes(rawArgv[0])) {
  command = rawArgv.shift()
}
const { flags } = parseArgs(rawArgv)
if (flags.help) command = 'help'

const asJson = boolFlag(flags, 'json')
const dryRun = boolFlag(flags, 'dry-run')
const assumeYes = boolFlag(flags, 'yes') || boolFlag(flags, 'y')
const log = {
  step: message => (asJson ? console.error(message) : console.log(message)),
  info: message => (asJson ? console.error(message) : console.log(message)),
  warn: message => console.warn(`warning: ${message}`),
  error: message => console.error(`error: ${message}`),
  inherit: !asJson && !dryRun && Boolean(process.stdout.isTTY),
}

try {
  if (command === 'help') {
    console.log(USAGE)
    process.exit(0)
  }
  const repoRoot = stringFlag(flags, 'repo') ? path.resolve(stringFlag(flags, 'repo')) : repoRootFrom(import.meta.url)
  const config = await loadConfig(repoRoot)
  const ctx = hostContext(process.env)

  if (command === 'doctor') {
    const { errors, warnings } = await checkRepository(repoRoot)
    for (const warning of warnings) log.warn(warning)
    for (const error of errors) log.error(error)
    const state = collectState({ ctx, config, repoRoot })
    if (asJson) {
      console.log(JSON.stringify({ repoRoot, errors, warnings, ...state }, null, 2))
    } else {
      console.log(`\nRepository: ${repoRoot}`)
      console.log(`Plugin: ${config.plugin.name}@${config.plugin.version} (marketplace ${config.marketplace.name})`)
      console.log('\nSkills:')
      for (const skill of state.submodules) {
        console.log(`  ${skill.initialized ? '[x]' : '[ ]'} ${skill.id.padEnd(32)} ${skill.path}`)
      }
      console.log('\nHosts:')
      for (const host of state.hosts) {
        if (!host.detected) {
          console.log(`  - ${host.label.padEnd(20)} not detected`)
          continue
        }
        const status = host.installed ? 'plugin installed' : 'no plugin record'
        console.log(`  - ${host.label.padEnd(20)} ${status}${host.skillsTargets.length > 0 ? ` | copies: ${host.skillsTargets.join(', ')}` : ''}`)
      }
      console.log('\nRun: node scripts/install.js --dry-run --targets all')
    }
    process.exit(errors.length === 0 ? 0 : 1)
  }

  if (command === 'uninstall') {
    process.exit(await runUninstall({ repoRoot, config, ctx, flags, dryRun, assumeYes, asJson, log }))
  }

  process.exit(await runInstall({ repoRoot, config, ctx, flags, dryRun, assumeYes, asJson, log }))
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}

async function runInstall({ repoRoot, config, ctx, flags, dryRun, assumeYes, asJson, log }) {
  const detected = detectedHosts(ctx)
  const interactive = isInteractive() && !assumeYes && !dryRun
  if (!interactive && !assumeYes && !dryRun) {
    throw new Error('stdin is not a terminal; pass --yes to install unattended or --dry-run to review the plan')
  }
  const prompter = interactive ? createPrompter() : undefined

  try {
    let targets = listFlag(flags, 'targets')
    if (targets.length === 0) {
      if (interactive) {
        targets = await prompter.chooseMany(
          'Install targets',
          Object.values(HOSTS).map(host => ({
            value: host.id,
            label: host.label,
            note: detected.includes(host.id) ? 'detected' : 'not detected',
          })),
          detected.length > 0 ? detected : ['claude'],
        )
      } else {
        targets = detected
        if (targets.length === 0) {
          throw new Error('no agent host detected; pass --targets claude,codex,cursor,dsh,skills-dir')
        }
      }
    }
    if (targets.length === 0) throw new Error('no install target selected')
    targets = normalizeTargets(targets, ctx, detected)

    const skillTokens = listFlag(flags, 'skills')
    let chosenSkills
    if (skillTokens.length > 0) {
      chosenSkills = resolveSkillIds(config, skillTokens)
    } else if (interactive) {
      chosenSkills = await prompter.chooseMany(
        'Skills',
        config.skills.map(skill => ({ value: skill.id, label: skill.id, note: skill.title.en })),
        config.skills.map(skill => skill.id),
      )
    } else {
      chosenSkills = config.skills.map(skill => skill.id)
    }
    if (!chosenSkills || chosenSkills.length === 0) throw new Error('no skills selected')

    let scope = stringFlag(flags, 'scope') ?? 'user'
    if (interactive && flags.scope === undefined && targets.some(target => ['claude', 'dsh'].includes(target))) {
      scope = await prompter.chooseOne('Install scope', [
        { value: 'user', label: 'user', note: 'available in every project' },
        { value: 'project', label: 'project', note: 'written into the current directory' },
      ], 0)
    }
    if (!['user', 'project'].includes(scope)) throw new Error('--scope must be user or project')

    let method = stringFlag(flags, 'method') ?? 'auto'
    if (interactive && flags.method === undefined && targets.some(target => ctx.hosts[target]?.marketplace)) {
      method = await prompter.chooseOne('Install method', [
        { value: 'marketplace', label: 'marketplace', note: 'host-managed plugin (recommended)' },
        { value: 'skills', label: 'skills directory', note: 'copy skill folders directly' },
      ], 0)
    }
    if (!['auto', 'marketplace', 'skills'].includes(method)) throw new Error('--method must be auto, marketplace or skills')

    let targetDir = stringFlag(flags, 'target')
    if (targets.includes(SKILLS_DIR_TARGET) && !targetDir) {
      const fallback = path.join(homeDir(process.env), '.agents', 'skills')
      targetDir = interactive ? await prompter.ask('Skills directory', fallback) : fallback
    }

    const plan = buildPlan({ config, repoRoot, ctx, targets, scope, method, skillIds: chosenSkills, source: stringFlag(flags, 'source') ?? 'local', link: boolFlag(flags, 'link'), targetDir })

    for (const warning of plan.warnings) log.warn(warning)
    if (asJson) console.error(`\n${formatPlan(plan)}\n`)
    else console.log(`\n${formatPlan(plan)}\n`)

    if (dryRun) {
      if (asJson) console.log(JSON.stringify({ dryRun: true, plan }, null, 2))
      else console.log('Dry run: nothing was changed.')
      return 0
    }

    const force = boolFlag(flags, 'force')
    if (interactive) {
      const proceed = await prompter.confirm('Proceed with this plan?', true)
      if (!proceed) {
        console.log('Aborted.')
        return 0
      }
    }

    await prepareSubmodules({ repoRoot, plan, config, log, dryRun })
    const execution = await executePlan({ repoRoot, plan, dryRun, force, log })
    const verification = await verifyPlan({ plan, log })

    for (const note of plan.notes) console.log(`\nnote: ${note}`)

    const ok = execution.ok && verification.ok
    if (asJson) {
      console.log(JSON.stringify({ ok, targets, scope, method, plan, execution, verification }, null, 2))
    } else if (ok) {
      console.log('\nInstalled successfully. Start a new agent session to load the skills.')
    } else {
      console.log('\nInstallation finished with problems; review the output above.')
    }
    return ok ? 0 : 1
  } finally {
    prompter?.close()
  }
}

async function runUninstall({ repoRoot, config, ctx, flags, dryRun, assumeYes, asJson, log }) {
  const pluginId = `${config.plugin.name}@${config.marketplace.name}`
  const targets = normalizeTargets(listFlag(flags, 'targets'), ctx, detectedHosts(ctx))
  const scope = stringFlag(flags, 'scope') ?? 'user'
  const interactive = isInteractive() && !assumeYes && !dryRun
  if (!interactive && !assumeYes && !dryRun) {
    throw new Error('stdin is not a terminal; pass --yes to uninstall unattended or --dry-run to review')
  }
  const prompter = interactive ? createPrompter() : undefined
  const results = []
  try {
    if (interactive) {
      const proceed = await prompter.confirm('Remove the plugin and its copied skill directories?', false)
      if (!proceed) return 0
    }
    for (const target of targets) {
      if (target === SKILLS_DIR_TARGET) {
        const directory = stringFlag(flags, 'target')
        if (!directory) throw new Error('--target <dir> is required to uninstall the skills-dir target')
        for (const skill of config.skills) {
          const candidate = path.join(directory, skill.id)
          if (!existsSync(candidate)) continue
          log.step(`remove ${candidate}`)
          if (!dryRun) await removeIfExists(candidate)
          results.push({ label: `remove ${candidate}`, ok: true })
        }
        continue
      }
      const host = ctx.hosts[target]
      if (!host) continue
      if (host.marketplace && host.bin) {
        const args = host.id === 'claude' ? ['plugin', 'uninstall', pluginId, '-s', scope] : ['plugin', 'remove', pluginId]
        log.step(`${host.binary} ${args.join(' ')}`)
        if (!dryRun) {
          const result = runCommand(findCommand(host.binary), args, { inherit: log.inherit })
          results.push({ label: `${host.label}: uninstall`, ok: result.ok, detail: result.stderr.trim() || undefined })
        }
      }
      const copyDirs = target === 'cursor'
        ? [localPluginDirFor(config.plugin.name, ctx), skillsDirFor('cursor', scope, ctx)]
        : [skillsDirFor(target, scope, ctx)]
      for (const directory of copyDirs) {
        const skillDirectories = config.skills.map(skill => path.join(directory, skill.id))
        const cursorPlugin = target === 'cursor' && directory === localPluginDirFor(config.plugin.name, ctx)
        const candidates = cursorPlugin ? [directory] : skillDirectories
        for (const candidate of candidates) {
          if (!existsSync(candidate)) continue
          log.step(`remove ${candidate}`)
          if (!dryRun) await removeIfExists(candidate)
          results.push({ label: `remove ${candidate}`, ok: true })
        }
      }
    }
    if (boolFlag(flags, 'remove-marketplace')) {
      for (const host of [ctx.hosts.claude, ctx.hosts.codex]) {
        if (!host?.bin) continue
        const args = ['plugin', 'marketplace', 'remove', config.marketplace.name]
        log.step(`${host.binary} ${args.join(' ')}`)
        if (!dryRun) {
          const result = runCommand(findCommand(host.binary), args, { inherit: log.inherit })
          results.push({ label: `${host.label}: remove marketplace`, ok: result.ok, detail: result.stderr.trim() || undefined })
        }
      }
    }
    const ok = results.every(result => result.ok)
    if (asJson) console.log(JSON.stringify({ ok, results }, null, 2))
    return ok ? 0 : 1
  } finally {
    prompter?.close()
  }
}

function resolveSkillIds(config, tokens) {
  if (tokens.length === 0 || tokens.includes('all')) return config.skills.map(skill => skill.id)
  const out = []
  for (const token of tokens) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token)
    if (range) {
      const from = Number.parseInt(range[1], 10)
      const to = Number.parseInt(range[2], 10)
      for (let value = Math.min(from, to); value <= Math.max(from, to); value += 1) {
        const skill = config.skills[value - 1]
        if (skill) out.push(skill.id)
      }
      continue
    }
    if (/^\d+$/.test(token)) {
      const skill = config.skills[Number.parseInt(token, 10) - 1]
      if (!skill) throw new Error(`skill index ${token} is out of range`)
      out.push(skill.id)
      continue
    }
    if (!config.skills.some(skill => skill.id === token)) throw new Error(`unknown skill "${token}"`)
    out.push(token)
  }
  return [...new Set(out)]
}
