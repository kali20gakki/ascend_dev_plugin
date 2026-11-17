#!/usr/bin/env node
/**
 * Ascend dev skills 安装器。
 *
 *   npx ascend-dev-skills@latest            # 在线安装（推荐）
 *   npx ascend-dev-skills@latest --yes --targets claude,codex,dsh
 *   node scripts/install.js                # 源码 checkout 安装
 *   node scripts/install.js doctor
 *   node scripts/install.js uninstall
 */
import path from 'node:path'
import { existsSync } from 'node:fs'
import { loadConfig } from './lib/config.js'
import { boolFlag, listFlag, parseArgs, stringFlag } from './lib/args.js'
import { detectedHosts, findCommand, hostContext, homeDir, localPluginDirFor, skillsDirFor, HOSTS } from './lib/hosts.js'
import { buildPlan, normalizeTargets, SKILLS_DIR_TARGET } from './lib/plan.js'
import { createPrompter, isInteractive } from './lib/prompt.js'
import { collectState, executePlan, formatPlan, prepareSubmodules, verifyInstalledSkillFiles, verifyPlan } from './lib/installer.js'
import { checkRepository } from './lib/checks.js'
import { repoRootFrom } from './lib/repo.js'
import { defaultCacheDir, ensureSource, existingSource, skillsPresent } from './lib/source.js'
import { runCommand } from './lib/run.js'
import { removeIfExists } from './lib/fsx.js'

const USAGE = `ascend-dev-skills — 跨 agent 技能插件安装器

用法:
  npx ascend-dev-skills@latest [install] [选项]   # 在线安装（推荐）
  node scripts/install.js [install] [选项]        # 源码安装
  npx ascend-dev-skills@latest doctor
  npx ascend-dev-skills@latest uninstall [选项]

选项:
  --targets <list>       claude,codex,cursor,dsh,skills-dir,all（默认：已检测到的宿主）
  --scope <scope>        user | project（默认 user）
  --method <method>      auto | marketplace | skills（默认 auto）
  --skills <list>        all、技能 id，或 1,3-5 形式的序号
  --source <source>      local（使用已解析的技能来源，默认）| git（plugin.repository）| git URL/路径
  --target <dir>         skills-dir 目标目录
  --link                 以链接代替复制（Windows 使用 junction）
  --force                覆盖已存在的技能目录
  --yes                  跳过交互
  --dry-run              只打印计划，不做任何修改
  --json                 机器可读输出
  --repo <path>          使用指定 checkout 作为技能来源
  --ref <ref>            在线安装时使用的 git 分支/标签（默认 main）
  --cache <dir>          在线安装的缓存目录（默认 ~/.cache/ascend-dev-skills）
  --remove-marketplace   uninstall：同时移除 marketplace 注册
  --help                 显示帮助

示例:
  npx ascend-dev-skills@latest
  npx ascend-dev-skills@latest --dry-run --targets all
  npx ascend-dev-skills@latest --yes --targets claude,codex,dsh
  npx ascend-dev-skills@latest --targets skills-dir --target ~/.agents/skills --method skills
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
  const scriptRoot = repoRootFrom(import.meta.url)
  const config = await loadConfig(scriptRoot)
  const ctx = hostContext(process.env)

  if (command === 'doctor') {
    const cacheDir = stringFlag(flags, 'cache') ?? defaultCacheDir(process.env)
    const allSkills = config.skills.map(skill => skill.id)
    const source = existingSource({ scriptRoot, config, skillIds: allSkills, cacheDir })
    const checkRoot = source.initialized ? source.root : scriptRoot
    const { errors, warnings } = await checkRepository(checkRoot)
    for (const warning of warnings) log.warn(warning)
    for (const error of errors) log.error(error)
    const state = collectState({ ctx, config, repoRoot: source.root })
    if (asJson) {
      console.log(JSON.stringify({ scriptRoot, source, cacheDir, errors, warnings, ...state }, null, 2))
    } else {
      console.log(`\n安装包: ${scriptRoot}`)
      console.log(`技能来源: ${source.initialized ? (source.kind === 'checkout' ? '本地 checkout' : '在线缓存') : '未初始化（执行 install 时自动克隆）'}`)
      if (source.kind === 'cache') console.log(`缓存目录: ${source.root}`)
      console.log(`插件: ${config.plugin.name}@${config.plugin.version} (marketplace ${config.marketplace.name})`)
      console.log('\n技能:')
      for (const skill of state.submodules) {
        console.log(`  ${skill.initialized ? '[x]' : '[ ]'} ${skill.id.padEnd(32)} ${skill.path}`)
      }
      console.log('\n宿主:')
      for (const host of state.hosts) {
        if (!host.detected) {
          console.log(`  - ${host.label.padEnd(20)} 未检测到`)
          continue
        }
        const status = host.installed ? '已安装插件' : '无插件记录'
        console.log(`  - ${host.label.padEnd(20)} ${status}${host.skillsTargets.length > 0 ? ` | 已复制: ${host.skillsTargets.join(', ')}` : ''}`)
      }
      console.log('\n可用: npx ascend-dev-skills@latest --dry-run --targets all')
    }
    process.exit(errors.length === 0 ? 0 : 1)
  }

  if (command === 'uninstall') {
    process.exit(await runUninstall({ config, ctx, flags, dryRun, assumeYes, asJson, log }))
  }

  process.exit(await runInstall({ scriptRoot, config, ctx, flags, dryRun, assumeYes, asJson, log }))
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}

async function runInstall({ scriptRoot, config, ctx, flags, dryRun, assumeYes, asJson, log }) {
  const detected = detectedHosts(ctx)
  const interactive = isInteractive() && !assumeYes && !dryRun
  if (!interactive && !assumeYes && !dryRun) {
    throw new Error('stdin is not a terminal; 非交互环境请加 --yes 安装，或加 --dry-run 只查看计划')
  }
  const prompter = interactive ? createPrompter() : undefined

  try {
    let targets = listFlag(flags, 'targets')
    if (targets.length === 0) {
      if (interactive) {
        targets = await prompter.chooseMany(
          '选择安装目标',
          Object.values(HOSTS).map(host => ({
            value: host.id,
            label: host.label,
            note: detected.includes(host.id) ? '已检测到' : '未检测到',
          })),
          detected.length > 0 ? detected : ['claude'],
        )
      } else {
        targets = detected
        if (targets.length === 0) {
          throw new Error('未检测到任何宿主；请用 --targets claude,codex,cursor,dsh,skills-dir 指定')
        }
      }
    }
    if (targets.length === 0) throw new Error('未选择安装目标')
    targets = normalizeTargets(targets, ctx, detected)

    const skillTokens = listFlag(flags, 'skills')
    let chosenSkills
    if (skillTokens.length > 0) {
      chosenSkills = resolveSkillIds(config, skillTokens)
    } else if (interactive) {
      chosenSkills = await prompter.chooseMany(
        '选择技能',
        config.skills.map(skill => ({ value: skill.id, label: skill.id, note: skill.title.zh })),
        config.skills.map(skill => skill.id),
      )
    } else {
      chosenSkills = config.skills.map(skill => skill.id)
    }
    if (!chosenSkills || chosenSkills.length === 0) throw new Error('未选择技能')

    let scope = stringFlag(flags, 'scope') ?? 'user'
    if (interactive && flags.scope === undefined && targets.some(target => ['claude', 'dsh'].includes(target))) {
      scope = await prompter.chooseOne('选择安装范围', [
        { value: 'user', label: 'user', note: '当前用户的所有项目可用' },
        { value: 'project', label: 'project', note: '写入当前目录' },
      ], 0)
    }
    if (!['user', 'project'].includes(scope)) throw new Error('--scope 只能是 user 或 project')

    let method = stringFlag(flags, 'method') ?? 'auto'
    if (interactive && flags.method === undefined && targets.some(target => ctx.hosts[target]?.marketplace)) {
      method = await prompter.chooseOne('选择安装方式', [
        { value: 'marketplace', label: '插件市场', note: '由宿主管理插件（推荐）' },
        { value: 'skills', label: '技能目录', note: '直接复制技能文件夹' },
      ], 0)
    }
    if (!['auto', 'marketplace', 'skills'].includes(method)) throw new Error('--method 只能是 auto、marketplace 或 skills')

    let targetDir = stringFlag(flags, 'target')
    if (targets.includes(SKILLS_DIR_TARGET) && !targetDir) {
      const fallback = path.join(homeDir(process.env), '.agents', 'skills')
      targetDir = interactive ? await prompter.ask('技能目录', fallback) : fallback
    }

    const cacheDir = stringFlag(flags, 'cache') ?? defaultCacheDir(process.env)
    const explicitRepo = stringFlag(flags, 'repo')
    let source
    if (explicitRepo) {
      const root = path.resolve(explicitRepo)
      source = { root, kind: 'checkout', initialized: skillsPresent(root, config, chosenSkills) }
    } else {
      source = await ensureSource({
        scriptRoot, config, skillIds: chosenSkills, cacheDir,
        ref: stringFlag(flags, 'ref'), log, dryRun,
      })
    }
    const repoRoot = source.root
    log.info(`技能来源: ${source.kind === 'checkout' ? '本地 checkout' : '在线缓存'} (${repoRoot})`)

    const plan = buildPlan({
      config, repoRoot, ctx, targets, scope, method, skillIds: chosenSkills,
      source: stringFlag(flags, 'source') ?? 'local', link: boolFlag(flags, 'link'), targetDir,
    })
    if (source.willClone) plan.notes.push(`首次在线安装会把仓库与子模块克隆到 ${repoRoot}，之后复用该缓存。`)

    if (asJson) console.error(`\n${formatPlan(plan)}\n`)
    else console.log(`\n${formatPlan(plan)}\n`)

    if (dryRun) {
      if (asJson) console.log(JSON.stringify({ dryRun: true, source, plan }, null, 2))
      else console.log('Dry run：未做任何修改。')
      return 0
    }

    const force = boolFlag(flags, 'force')
    if (interactive) {
      const proceed = await prompter.confirm('按以上计划开始安装？', true)
      if (!proceed) {
        console.log('已取消。')
        return 0
      }
    }

    await prepareSubmodules({ repoRoot, plan, config, log, dryRun })
    const execution = await executePlan({ repoRoot, plan, dryRun, force, log })
    const verification = await verifyPlan({ plan, log })
    const marketplaceHosts = targets.filter(target => plan.steps.some(step =>
      step.kind === 'command' && step.host === target && step.argv[0] === 'plugin'
      && (step.argv[1] === 'install' || step.argv[1] === 'add')))
    if (marketplaceHosts.length > 0) {
      const installed = await verifyInstalledSkillFiles({ ctx, config, hosts: marketplaceHosts, skillIds: plan.skillIds, log })
      verification.checks.push(...installed.checks)
      verification.ok = verification.ok && installed.ok
    }

    for (const note of plan.notes) console.log(`\n提示: ${note}`)

    const ok = execution.ok && verification.ok
    if (asJson) {
      console.log(JSON.stringify({ ok, source, targets, scope, method, plan, execution, verification }, null, 2))
    } else if (ok) {
      console.log('\n安装完成。请启动新的 agent 会话以加载技能。')
    } else {
      console.log('\n安装完成但存在问题，请查看上面的输出。')
    }
    return ok ? 0 : 1
  } finally {
    prompter?.close()
  }
}

async function runUninstall({ config, ctx, flags, dryRun, assumeYes, asJson, log }) {
  const pluginId = `${config.plugin.name}@${config.marketplace.name}`
  const targets = normalizeTargets(listFlag(flags, 'targets'), ctx, detectedHosts(ctx))
  const scope = stringFlag(flags, 'scope') ?? 'user'
  const interactive = isInteractive() && !assumeYes && !dryRun
  if (!interactive && !assumeYes && !dryRun) {
    throw new Error('stdin is not a terminal; 非交互环境请加 --yes 卸载，或加 --dry-run 只查看')
  }
  const prompter = interactive ? createPrompter() : undefined
  const results = []
  try {
    if (interactive) {
      const proceed = await prompter.confirm('确认卸载插件并删除已复制的技能目录？', false)
      if (!proceed) return 0
    }
    for (const target of targets) {
      if (target === SKILLS_DIR_TARGET) {
        const directory = stringFlag(flags, 'target')
        if (!directory) throw new Error('卸载 skills-dir 目标需要 --target <dir>')
        for (const skill of config.skills) {
          const candidate = path.join(directory, skill.id)
          if (!existsSync(candidate)) continue
          log.step(`删除 ${candidate}`)
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
          log.step(`删除 ${candidate}`)
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
      if (!skill) throw new Error(`技能序号 ${token} 超出范围`)
      out.push(skill.id)
      continue
    }
    if (!config.skills.some(skill => skill.id === token)) throw new Error(`未知技能 "${token}"`)
    out.push(token)
  }
  return [...new Set(out)]
}
