# 兼容性

以下结果基于本仓库测试时的工具版本；升级宿主后请重新运行
`npx ascend-dev-skills@latest doctor` 与各宿主校验命令。

| 宿主 | 读取 | 安装路径 | 本仓验证情况 |
| --- | --- | --- | --- |
| Claude Code 2.1.237 | `.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`skills/` | `claude plugin marketplace add` + `claude plugin install` | `--strict` 校验通过；本地路径与 GitHub 源安装均通过（GitHub 源会拉取 submodule，6 个技能进入缓存） |
| Codex CLI 0.149.0 | 根 `plugin.json`、`skills/`、兼容的 `.claude-plugin/marketplace.json` | `codex plugin marketplace add` + `codex plugin add` | 隔离 `CODEX_HOME` 下本地路径安装通过；GitHub 源可安装插件但 **不拉取 submodule**（技能目录为空） |
| Cursor | 根 `plugin.json`、`skills/` | 复制到 `~/.cursor/plugins/local/<name>` 或宿主 Agent Plugins 流程 | 仅验证文件落位；UI 未验证 |
| DeepSeek Harness（DSH） | `skills/` | 复制/链接到 `~/.dsh/skills` 或项目 `.dsh/skills` | 隔离 `DSH_HOME` 下安装/卸载通过；会话实际加载未在隔离环境验证 |
| VS Code / GitHub Copilot | 根 `plugin.json`、`skills/` | 宿主 Agent Plugins 流程 | 未验证 |
| Kiro / Hermes / OpenClaw / Antigravity / Perplexity | 根 `plugin.json`、`skills/` | 宿主 Agent Plugins 流程 | 未验证 |

## 组件支持矩阵

| 组件 | Claude Code | Codex | Cursor | 便携 Agent Plugins | DSH |
| --- | --- | --- | --- | --- | --- |
| 技能（`skills/<id>/SKILL.md`） | 支持 | 支持 | 支持 | 支持 | 支持 |
| commands | 支持 | 不支持 | 仅 Cursor Plugins | 不支持 | 不适用 |
| agents | 支持 | 不支持 | 仅 Cursor Plugins | 不支持 | 不适用 |
| hooks | 支持 | 支持（`extensions.com.openai.hooks`） | 仅 Cursor Plugins | 不支持 | 不适用 |
| MCP servers | 支持（`.mcp.json`） | 支持（`mcp.json`） | 支持（`mcp.json`） | 支持 | 不适用 |

当前仓库仅发布技能。

## 需要了解的行为差异

- **技能命名空间**：Claude Code 以 `ascend-dev-skills:<技能名>` 暴露插件技能；`~/.claude/skills`
  下的同名个人技能是另一份技能，可以共存。
- **submodule 拉取（已实测）**：Claude Code 在添加市场时会拉取插件 submodule；Codex 0.149.0
  克隆 Git 市场源时不拉 submodule，`skills/*` 为空。Codex 请用本地克隆（`--source local`）或
  `--method skills`。安装器会在 Codex + Git 源组合时告警，并在安装后检查技能文件。
- **市场文件**：仓库只生成 Claude 市场文件，Codex 将其作为兼容市场读取。若未来 Codex 不再兼容，
  可在 `plugin.config.json` 设置 `codex.repoMarketplace: true`，执行 `npm run sync` 生成
  `.agents/plugins/marketplace.json`。
- **图标**：Claude Code 旧版本加载时忽略 `icon` 字段（当前清单未写该字段）；Cursor/Codex 的展示
  信息来自 `extensions.com.openai.interface`，可选且不影响加载。
- **技能 frontmatter 扩展**：`whenToUse`、`user-invocable`、`disable-model-invocation`
  属于扩展字段；本仓库只强校验 `name` 与 `description`，其余不告警。
- **在线安装缓存**：npm/npx 安装没有 submodule，安装器会把仓库克隆到
  `~/.cache/ascend-dev-skills/src`（Windows 为 `%LOCALAPPDATA%\ascend-dev-skills\src`）。删除该
  目录即可强制下次重新克隆。
