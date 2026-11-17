/** Build an installation plan without touching disk, so `--dry-run` and tests share it. */
import path from 'node:path'
import { localPluginDirFor, skillsDirFor } from './hosts.js'

export const BUILTIN_TARGETS = ['claude', 'codex', 'cursor', 'dsh']
export const SKILLS_DIR_TARGET = 'skills-dir'

/**
 * Expand `all` and validate target names.
 * @param {string[]} requested targets from the command line
 * @param {object} ctx host context
 * @param {string[]} detected detected host ids
 * @returns {string[]} target ids
 */
export function normalizeTargets(requested, ctx, detected) {
  if (requested.length === 0) return detected
  const out = []
  for (const target of requested) {
    if (target === 'all') {
      for (const host of detected) if (!out.includes(host)) out.push(host)
      continue
    }
    if (!BUILTIN_TARGETS.includes(target) && target !== SKILLS_DIR_TARGET) {
      throw new Error(`未知目标 "${target}"；可用：${[...BUILTIN_TARGETS, SKILLS_DIR_TARGET, 'all'].join(', ')}`)
    }
    if (!out.includes(target)) out.push(target)
  }
  return out
}

/**
 * Build the full plan.
 * @param {object} options plan inputs
 * @returns {{ skillIds: string[], submodules: string[], steps: object[], verify: object[], notes: string[], warnings: string[] }}
 */
export function buildPlan(options) {
  const {
    config, repoRoot, ctx, targets, scope = 'user', method = 'auto', skillIds, source = 'local', link = false, targetDir,
  } = options
  const selected = config.skills.filter(skill => !skillIds?.length || skillIds.includes(skill.id))
  if (selected.length === 0) throw new Error('未选择技能')

  const plan = {
    skillIds: selected.map(skill => skill.id),
    submodules: selected.map(skill => skill.path),
    steps: [],
    verify: [],
    notes: [],
    warnings: [],
  }

  const marketplaceSource = resolveMarketplaceSource(source, repoRoot, config)
  const pluginId = `${config.plugin.name}@${config.marketplace.name}`

  for (const target of targets) {
    if (target === SKILLS_DIR_TARGET) {
      if (!targetDir) throw new Error('skills-dir 目标需要 --target <dir>')
      addSkillCopies(plan, selected, targetDir, 'skills-dir', link, `技能目录 ${targetDir}`)
      continue
    }

    const host = ctx.hosts[target]
    let mode
    if (method === 'skills') mode = 'skills'
    else if (method === 'marketplace') {
      mode = host.marketplace ? 'marketplace' : 'skills'
      if (!host.marketplace) plan.warnings.push(`${host.label} has no marketplace CLI; copying skills instead.`)
    } else {
      mode = host.marketplace ? 'marketplace' : (target === 'cursor' ? 'plugin' : 'skills')
    }

    if (mode === 'marketplace') {
      if (host.bin === undefined) {
        plan.warnings.push(`${host.label} CLI not found on PATH; skipping ${host.label}.`)
        continue
      }
      if (target === 'codex' && scope === 'project') {
        plan.warnings.push('Codex 以用户级安装插件；如需按项目启用，请在 .codex/config.toml 中开启。')
      }
      if (target === 'codex' && /^(https?:\/\/|git@|ssh:\/\/)/i.test(marketplaceSource)) {
        plan.warnings.push('Codex 从 Git 市场源安装时不会拉取 git submodule，插件里的 skills 可能为空。请使用 --source local（本地 checkout/缓存）或 --method skills。')
      }
      plan.steps.push(
        {
          kind: 'command', host: target, label: `${host.label}：添加 marketplace`,
          program: host.binary, argv: ['plugin', 'marketplace', 'add', marketplaceSource],
        },
        {
          kind: 'command', host: target, label: `${host.label}：安装插件`,
          program: host.binary,
          argv: target === 'claude'
            ? ['plugin', 'install', pluginId, '--scope', scope]
            : ['plugin', 'add', pluginId],
          cwd: target === 'claude' && scope === 'project' ? ctx.cwd : undefined,
        },
      )
      plan.verify.push({
        kind: 'command', host: target, label: `${host.label}：插件列表`,
        program: host.binary, argv: ['plugin', 'list', '--json'], expect: config.plugin.name,
      })
      if (target === 'codex') {
        plan.notes.push(`Codex 按项目启用（写入 .codex/config.toml）：\n[plugins."${pluginId}"]\nenabled = true`)
      }
      if (target === 'claude' && scope === 'project') {
        plan.notes.push('Claude Code 的 project 范围会把 .claude/settings.json 写入当前目录，按团队惯例提交或忽略。')
      }
      continue
    }

    if (mode === 'plugin' && target === 'cursor') {
      const to = localPluginDirFor(config.plugin.name, ctx)
      plan.steps.push({
        kind: 'copy-plugin', host: 'cursor', label: 'Cursor：复制便携插件',
        from: repoRoot, to,
        include: ['plugin.json', 'assets', 'mcp.json', ...selected.map(skill => skill.path)],
      })
      plan.verify.push({ kind: 'path', host: 'cursor', path: to })
      continue
    }

    addSkillCopies(plan, selected, skillsDirFor(target, scope, ctx), target, link, host.label)
  }

  return plan
}

/** Resolve the marketplace source argument for `plugin marketplace add`. */
export function resolveMarketplaceSource(source, repoRoot, config) {
  if (!source || source === 'local') return repoRoot
  if (source === 'git') {
    if (!config.plugin.repository) throw new Error('plugin.repository 为空，无法使用 --source git')
    return config.plugin.repository
  }
  if (/^(https?:\/\/|git@|ssh:\/\/)/i.test(source)) return source
  return path.resolve(source)
}

function addSkillCopies(plan, skills, directory, host, link, label) {
  for (const skill of skills) {
    const to = path.join(directory, skill.id)
    plan.steps.push({
      kind: 'copy-skill', host, label: `${label}：复制 ${skill.id}`, from: skill.path, to, link,
    })
    plan.verify.push({ kind: 'path', host, path: path.join(to, 'SKILL.md') })
  }
}
