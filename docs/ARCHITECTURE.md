# 架构

## 目标

1. 一个仓库可被多种 agent 宿主当作插件使用，不绑定单一宿主。
2. 技能以 git submodule 引用，插件仓不复制技能正文。
3. 新增技能或能力只需改配置，不需要写插件运行时代码。
4. 所有生成物可复现，并有漂移检查。

## 宿主格式

本仓库同时是：

- **Agent Plugins 1.0.0** 包：根 `plugin.json`、`skills/`、可选 `mcp.json`；
- **Claude Code 插件**：`.claude-plugin/plugin.json`；
- **Claude Code 市场**（Codex 作为兼容市场读取）：`.claude-plugin/marketplace.json`，
  其中 `plugins[0].source: "."` 表示市场根就是插件。

根 `plugin.json` 严格限定便携字段；宿主专属信息放在 `extensions`（目前是
`extensions.com.openai.interface`）。Claude 专属组件写在 `.claude-plugin/plugin.json`，
只有配置后才生成。

## 单一事实源

`plugin.config.json` 保存插件身份、市场身份、可选组件和技能清单。`scripts/lib/render.js`
生成：

```text
plugin.config.json
├── plugin.json                     (Agent Plugins)
├── .claude-plugin/plugin.json      (Claude Code)
├── .claude-plugin/marketplace.json (Claude 市场 / Codex 兼容市场)
├── .agents/plugins/marketplace.json (仅当 codex.repoMarketplace 为 true)
├── mcp.json / .mcp.json            (仅当配置了 mcpServers)
└── package.json#version            (与插件版本保持一致)
```

`npm run sync` 写入，`npm run check` 在提交物与生成结果不一致时失败。生成文件需要提交，
因为宿主直接从仓库读取。

## 技能以 submodule 引入

```text
skills/<id>/SKILL.md   ← submodule 根，版本由 gitlink 固定
```

- id 即目录名；技能的调度名来自 `SKILL.md` frontmatter。宿主只发现一层
  `skills/<child>/SKILL.md`，所以该布局同时满足 Claude Code 插件技能、Agent Plugins 和
  技能目录宿主。
- `.gitmodules` 与 `plugin.config.json` 必须一致；`verify` 校验 URL、分支和路径。
  `git submodule status` 就是版本记录。
- 市场根即插件根，Claude Code 会把 `skills/` 当作组件目录并在添加市场时拉取 submodule。

## 安装器

`scripts/install.js` 负责编排宿主自己的工具，而不是手写宿主配置：

```text
探测宿主 → 选择目标/范围/技能/方式 → 解析技能来源（checkout 或在线缓存）
→ 初始化 submodule → 逐宿主执行（市场命令或技能复制）→ 校验 → 提示
```

### 技能来源解析（在线安装）

npm/npx 安装包不含 submodule，因此 `scripts/lib/source.js` 负责：

1. 运行位置（`import.meta.url`）下有全部选中技能 → 视为 checkout 来源；
2. 否则使用缓存目录 `~/.cache/ascend-dev-skills/src`（Windows 为
   `%LOCALAPPDATA%\ascend-dev-skills\src`，可用 `--cache` 或 `ASCEND_DEV_SKILLS_HOME` 覆盖）；
3. 缓存不存在时 `git clone --depth 1 --recurse-submodules --shallow-submodules <repository>`；
   已存在时 `git fetch` + `checkout FETCH_HEAD` + `submodule update --init`；
4. `--dry-run` 只报告将克隆到哪里，不创建目录。

在线方式与源码方式共用同一套 `buildPlan/executePlan/verifyPlan`，因此行为一致。

### 计划与执行

- `scripts/lib/plan.js` 生成纯计划（`command`、`copy-skill`、`copy-plugin` 步骤 + 校验项），
  `--dry-run` 只打印，不产生副作用。
- `scripts/lib/installer.js` 用参数数组执行（Windows `.cmd` 经 `cmd.exe` 显式引用），并通过宿主
  CLI 与文件路径校验结果。
- 市场安装调用官方 CLI（`claude plugin …`、`codex plugin …`）；没有市场的宿主（Cursor、DSH、
  `skills-dir`）复制或链接技能目录。
- Cursor 复制便携包到 `~/.cursor/plugins/local/<name>`，因为它的本地插件目录不跟随指向目录外的软链。

## 校验分层

1. **配置**：结构、命名规则、URL、中英文文案、重复项。
2. **生成物**：与渲染结果逐字节一致、便携字段白名单、marketplace `source: "."`、与
   `package.json` 版本一致。
3. **submodule**：`.gitmodules` ↔ 配置、检出状态。
4. **技能**：frontmatter 可解析、kebab-case 名称、描述非空、调用开关合法；
   `--require-skills` 让缺失检出变为失败。
5. **组件**：配置的文件存在、hook JSON 可解析、MCP 占位符被拒绝。
6. **宿主**：`claude plugin validate`（插件、市场、技能）与隔离 `CODEX_HOME` 下的
   marketplace/install；安装后检查 `skills/<id>/SKILL.md` 是否真的落位。

## 设计决策

- **没有运行时代码**：宿主只读各自的原生插件格式，因此无需构建、打包或沙箱；仓库里的
  JavaScript 只服务维护与安装。
- **不建 `plugins/` 子目录**：插件即仓库根，submodule 路径保持 `skills/<id>`，同时命中所有宿主的
  默认扫描逻辑。
- **默认只出一个市场文件**：同一仓库同时输出 Claude 与 Codex 市场文件会让插件在 Codex 中出现两次；
  Codex 原生市场文件通过 `codex.repoMarketplace` 选择性开启。
- **技能目录兜底**：让没有插件机制的宿主（DSH、任意技能目录 agent）也能使用，同时作为
  Claude/Codex 的 `--method skills` 备份路径。
- **在线安装写缓存而非当前目录**：避免污染用户项目；缓存可删除，删除后下次自动重新克隆。
