/** Execute an installation plan: submodules, host commands, copies, verification. */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { copyTree, mkdir, readTextIfExists, removeIfExists } from './fsx.js'
import { runCommand } from './run.js'
import { findCommand } from './hosts.js'
import { git, isGitRepository } from './repo.js'

/** Ensure the selected submodules are checked out; clone as a fallback outside git. */
export async function prepareSubmodules({ repoRoot, plan, config, log, dryRun }) {
  const selected = config.skills.filter(skill => plan.submodules.includes(skill.path))
  if (await isGitRepository(repoRoot)) {
    for (const skill of selected) {
      if (existsSync(path.join(repoRoot, skill.path, 'SKILL.md'))) continue
      const args = ['submodule', 'update', '--init', '--depth', '1', '--', skill.path]
      log.step(`git ${args.join(' ')}`)
      if (dryRun) continue
      const result = git(repoRoot, args, { stdio: 'inherit' })
      if (result.code !== 0) throw new Error(`git submodule update failed for ${skill.path}`)
    }
    return
  }
  log.warn('This checkout is not a git work tree; cloning missing skills directly.')
  for (const skill of selected) {
    if (existsSync(path.join(repoRoot, skill.path, 'SKILL.md'))) continue
    const args = ['clone', '--depth', '1']
    if (skill.branch) args.push('--branch', skill.branch)
    args.push(skill.url, path.join(repoRoot, skill.path))
    log.step(`git ${args.join(' ')}`)
    if (dryRun) continue
    const result = runCommand('git', args, { inherit: true })
    if (!result.ok) throw new Error(`git clone failed for ${skill.id}`)
  }
}

/**
 * Run the plan's steps.
 * @returns {Promise<{ ok: boolean, results: object[] }>}
 */
export async function executePlan({ repoRoot, plan, dryRun, force, log }) {
  const results = []
  for (const step of plan.steps) {
    if (step.kind === 'command') {
      const bin = findCommand(step.program)
      const display = `${step.program} ${step.argv.join(' ')}`
      if (dryRun) {
        log.step(`[dry-run] ${display}`)
        results.push({ label: step.label, ok: true, skipped: true })
        continue
      }
      if (!bin) {
        log.error(`无法运行 ${step.program}：PATH 中未找到`)
        results.push({ label: step.label, ok: false, detail: `${step.program} not found` })
        continue
      }
      log.step(display)
      const result = runCommand(bin, step.argv, { cwd: step.cwd, inherit: log.inherit })
      if (!result.ok) {
        log.error(`失败：${step.label}${result.stderr ? `\n${result.stderr.trim()}` : ''}`)
      }
      results.push({ label: step.label, ok: result.ok, detail: result.stderr?.trim() || undefined })
      continue
    }

    if (step.kind === 'copy-skill') {
      results.push(await copySkillStep(repoRoot, step, { dryRun, force, log }))
      continue
    }

    if (step.kind === 'copy-plugin') {
      results.push(await copyPluginStep(repoRoot, step, { dryRun, log }))
      continue
    }

    results.push({ label: step.kind, ok: false, detail: `unknown step kind ${step.kind}` })
  }
  return { ok: results.every(result => result.ok), results }
}

async function copySkillStep(repoRoot, step, { dryRun, force, log }) {
  const from = path.join(repoRoot, step.from)
  if (!existsSync(path.join(from, 'SKILL.md'))) {
    return { label: step.label, ok: false, detail: `${step.from} is not initialized` }
  }
  if (dryRun) {
    log.step(`[dry-run] ${step.link ? 'link' : 'copy'} ${step.from} -> ${step.to}`)
    return { label: step.label, ok: true, skipped: true }
  }
  if (step.link) {
    await removeIfExists(step.to)
    await mkdir(path.dirname(step.to), { recursive: true })
    const { symlink } = await import('node:fs/promises')
    await symlink(path.resolve(from), step.to, process.platform === 'win32' ? 'junction' : 'dir')
    log.step(`已链接 ${step.to}`)
    return { label: step.label, ok: true }
  }
  if (existsSync(step.to) && !force) {
    if (await sameSkill(from, step.to)) {
      log.step(`未变化 ${step.to}`)
      return { label: step.label, ok: true, skipped: true }
    }
    log.warn(`${step.to} 已存在且内容不同；如需覆盖请加 --force`)
    return { label: step.label, ok: true, skipped: true, detail: 'existing content kept' }
  }
  await removeIfExists(step.to)
  await copyTree(from, step.to)
  log.step(`已复制 ${step.to}`)
  return { label: step.label, ok: true }
}

async function sameSkill(from, to) {
  const [left, right] = await Promise.all([readTextIfExists(path.join(from, 'SKILL.md')), readTextIfExists(path.join(to, 'SKILL.md'))])
  return left !== undefined && left === right
}

async function copyPluginStep(repoRoot, step, { dryRun, log }) {
  if (dryRun) {
    log.step(`[dry-run] copy plugin ${step.from} -> ${step.to}`)
    return { label: step.label, ok: true, skipped: true }
  }
  await removeIfExists(step.to)
  await mkdir(step.to, { recursive: true })
  for (const include of step.include) {
    const source = path.join(repoRoot, include)
    if (!existsSync(source)) continue
    await copyTree(source, path.join(step.to, include))
  }
  log.step(`已复制插件到 ${step.to}`)
  return { label: step.label, ok: true }
}

/**
 * Verify the installed result. Command checks look for the plugin name in the
 * host's JSON/text output; path checks require the SKILL.md file.
 */
export async function verifyPlan({ plan, log }) {
  const checks = []
  for (const check of plan.verify) {
    if (check.kind === 'path') {
      const ok = existsSync(check.path)
      checks.push({ label: `${check.host}: ${check.path}`, ok })
      log.info(`${ok ? '通过' : '缺失'} ${check.path}`)
      continue
    }
    const bin = findCommand(check.program)
    if (!bin) {
      checks.push({ label: check.label, ok: false, detail: `${check.program} not found` })
      continue
    }
    const result = runCommand(bin, check.argv, { inherit: false })
    const text = `${result.stdout}\n${result.stderr}`
    const ok = result.ok && mentions(text, check.expect)
    checks.push({ label: check.label, ok, detail: result.stderr.trim() || undefined })
    log.info(`${ok ? '通过' : '未找到'} ${check.label}`)
  }
  return { ok: checks.every(check => check.ok), checks }
}

function mentions(text, name) {
  try {
    return JSON.stringify(JSON.parse(text)).includes(name)
  } catch {
    return text.includes(name)
  }
}

/** Check that the installed plugin copy actually contains the selected skills. */
export async function verifyInstalledSkillFiles({ ctx, config, hosts, skillIds, log }) {
  const checks = []
  const pluginId = `${config.plugin.name}@${config.marketplace.name}`
  for (const hostId of hosts) {
    const host = ctx.hosts[hostId]
    const bin = host?.bin ? findCommand(host.binary) : undefined
    if (!bin) continue
    const result = runCommand(bin, ['plugin', 'list', '--json'], { inherit: false })
    if (!result.ok) {
      checks.push({ label: `${host.label}: installed skill files`, ok: false, detail: 'plugin list failed' })
      log?.info(`缺失 ${host.label}：插件列表读取失败`)
      continue
    }
    let root
    try {
      const data = JSON.parse(result.stdout)
      if (hostId === 'claude') {
        const list = Array.isArray(data) ? data : data.installed ?? []
        const entry = list.find(item => item.id === pluginId || item.pluginId === pluginId)
        root = entry?.installPath
      } else {
        const entry = (data.installed ?? []).find(item => item.pluginId === pluginId)
        root = entry?.source?.path
      }
    } catch {
      root = undefined
    }
    if (!root) {
      checks.push({ label: `${host.label}: installed skill files`, ok: false, detail: 'plugin not found in plugin list' })
      log?.info(`缺失 ${host.label}：插件列表中没有该插件`)
      continue
    }
    const missing = missingSkillFiles(root, skillIds)
    checks.push({
      label: `${host.label}: skill files in ${root}`,
      ok: missing.length === 0,
      detail: missing.length > 0 ? `missing ${missing.join(', ')}` : undefined,
    })
    log?.info(`${missing.length === 0 ? '通过' : '缺失'} ${host.label}：技能文件${missing.length > 0 ? `（缺少 ${missing.join(', ')}）` : ''}`)
  }
  return { ok: checks.every(check => check.ok), checks }
}

/** Return the selected skill ids whose SKILL.md is absent from a plugin root. */
export function missingSkillFiles(pluginRoot, skillIds) {
  return skillIds.filter(id => !existsSync(path.join(pluginRoot, 'skills', id, 'SKILL.md')))
}

/** Inspect per-host installation state for `doctor`. */
export function collectState({ ctx, config, repoRoot }) {
  const hosts = Object.values(ctx.hosts).map(host => {
    const detected = host.bin !== undefined || existsSync(host.configDir)
    if (!detected) return { id: host.id, label: host.label, detected: false }
    let installed = false
    let detail
    if (host.bin) {
      const result = runCommand(findCommand(host.binary), ['plugin', 'list', '--json'], { inherit: false })
      installed = result.ok && mentions(result.stdout, config.plugin.name)
      detail = result.ok ? undefined : result.stderr.trim() || undefined
    }
    const skillsTargets = host.id === 'cursor'
      ? [path.join(host.configDir, 'plugins', 'local', config.plugin.name), path.join(host.configDir, 'skills')]
      : [path.join(host.configDir, 'skills')]
    const present = skillsTargets.filter(target => existsSync(target))
    return { id: host.id, label: host.label, detected: true, installed, detail, skillsTargets: present }
  })
  const submodules = config.skills.map(skill => ({
    id: skill.id,
    path: skill.path,
    initialized: existsSync(path.join(repoRoot, skill.path, 'SKILL.md')),
  }))
  return { hosts, submodules }
}

/** Remove installed copies and ask each host CLI to uninstall the plugin. */
export async function uninstall({ ctx, config, plan, log, dryRun }) {
  const results = []
  const pluginId = `${config.plugin.name}@${config.marketplace.name}`
  for (const step of plan.steps) {
    const host = ctx.hosts[step.host]
    if (!host) continue
    if (host.marketplace && host.bin) {
      const args = host.id === 'claude'
        ? ['plugin', 'uninstall', pluginId, '-s', plan.scope ?? 'user']
        : ['plugin', 'remove', pluginId]
      log.step(`${host.binary} ${args.join(' ')}`)
      if (!dryRun) {
        const result = runCommand(findCommand(host.binary), args, { inherit: log.inherit })
        results.push({ label: `${host.label}: uninstall`, ok: result.ok, detail: result.stderr.trim() || undefined })
      }
      continue
    }
    if (step.kind === 'copy-skill' || step.kind === 'copy-plugin') {
      log.step(`remove ${step.to}`)
      if (!dryRun) await removeIfExists(step.to)
      results.push({ label: `remove ${step.to}`, ok: true })
    }
  }
  if (plan.removeMarketplace && ctx.hosts.claude?.bin) {
    const args = ['plugin', 'marketplace', 'remove', config.marketplace.name]
    log.step(`claude ${args.join(' ')}`)
    if (!dryRun) {
      const result = runCommand(findCommand('claude'), args, { inherit: log.inherit })
      results.push({ label: 'Claude Code: remove marketplace', ok: result.ok, detail: result.stderr.trim() || undefined })
    }
  }
  if (plan.removeMarketplace && ctx.hosts.codex?.bin) {
    const args = ['plugin', 'marketplace', 'remove', config.marketplace.name]
    log.step(`codex ${args.join(' ')}`)
    if (!dryRun) {
      const result = runCommand(findCommand('codex'), args, { inherit: log.inherit })
      results.push({ label: 'Codex: remove marketplace', ok: result.ok, detail: result.stderr.trim() || undefined })
    }
  }
  return { ok: results.every(result => result.ok), results }
}

/** Render a plan for confirmation and `--dry-run` output. */
export function formatPlan(plan) {  const lines = []
  lines.push(`Skills (${plan.skillIds.length}): ${plan.skillIds.join(', ')}`)
  if (plan.warnings.length > 0) {
    lines.push('Warnings:')
    for (const warning of plan.warnings) lines.push(`  - ${warning}`)
  }
  lines.push('Steps:')
  for (const step of plan.steps) {
    if (step.kind === 'command') lines.push(`  - ${step.program} ${step.argv.join(' ')}`)
    else if (step.kind === 'copy-skill') lines.push(`  - ${step.link ? 'link' : 'copy'} ${step.from} -> ${step.to}`)
    else if (step.kind === 'copy-plugin') lines.push(`  - copy plugin ${step.from} -> ${step.to}`)
  }
  if (plan.notes.length > 0) {
    lines.push('Notes:')
    for (const note of plan.notes) lines.push(`  - ${note.replace(/\n/g, '\n    ')}`)
  }
  return lines.join('\n')
}
