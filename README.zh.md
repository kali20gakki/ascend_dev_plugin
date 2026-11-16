# 昇腾开发技能包（Ascend dev skills）

[English](README.md) | 中文

一个**跨 agent 的通用插件**：把 6 个昇腾/GitCode 开发常用技能打包，供 Claude Code、Codex、Cursor
以及所有支持 [Agent Plugins](https://agent-plugins.org) 标准的宿主加载。

一份仓库，三种宿主形态：

| 宿主 | 产物 | 加载方式 |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` | `/plugin marketplace add` → `/plugin install` |
| Codex / ChatGPT | 根 `plugin.json`（Agent Plugins 1.0.0） | `codex plugin marketplace add` → `codex plugin add` |
| Cursor / VS Code / Copilot / Kiro 等 | 根 `plugin.json` | 宿主自带的 Agent Plugins 安装入口 |
| 任何有技能目录的 agent | `skills/` | 复制/链接技能目录 |

技能全部以 **git submodule** 引入：插件仓只锁定提交，不存放技能正文。新增技能 = 加一个
submodule，不需要改插件代码。

## 技能清单

| 技能 | 用途 |
| --- | --- |
| [`scene-fuzz`](skills/scene-fuzz) | 场景化白盒 fuzz：先画像、再设计用例、真实运行取证。 |
| [`gitcode-cli`](skills/gitcode-cli) | 用 `gitcode` CLI 完成 GitCode 端到端研发操作。 |
| [`ascend-interface-auditor`](skills/ascend-interface-auditor) | 梳理昇腾仓南北向接口并输出 Excel。 |
| [`gitcode-code-reviewer`](skills/gitcode-code-reviewer) | 结合仓库上下文的 GitCode PR 深度审查。 |
| [`gitcode-release-note-generator`](skills/gitcode-release-note-generator) | 基于真实数据生成正式 Release Note。 |
| [`document-ux-review`](skills/document-ux-review) | 按 README/quick start 以新人视角走查文档体验。 |

## 快速开始

### 交互式安装器（推荐）

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
cd ascend_dev_plugin
node scripts/install.js
```

安装器会探测 Claude Code、Codex、Cursor、DeepSeek Harness，让你选择宿主、作用域和技能，
然后调用各宿主官方插件命令完成安装；不会手写 agent 配置文件。

```bash
node scripts/install.js --dry-run --targets all     # 只打印计划
node scripts/install.js --yes --targets claude,codex
node scripts/install.js --targets skills-dir --target ~/.agents/skills --method skills
node scripts/install.js doctor                      # 查看初始化/安装状态
node scripts/install.js uninstall --targets claude --remove-marketplace
```

### Claude Code

```text
/plugin marketplace add kali20gakki/ascend_dev_plugin
/plugin install ascend-dev-skills@ascend-dev
```

或命令行：

```bash
claude plugin marketplace add kali20gakki/ascend_dev_plugin
claude plugin install ascend-dev-skills@ascend-dev --scope user
```

插件内技能以 `/ascend-dev-skills:<技能名>` 命名；在 `/plugin` 中启用、禁用或卸载。
本地克隆时把来源换成路径即可：`claude plugin marketplace add ./ascend_dev_plugin`。

### Codex

```bash
codex plugin marketplace add kali20gakki/ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
codex /plugins
```

如需在单个仓库启用，编辑该仓库的 `.codex/config.toml`：

```toml
[plugins."ascend-dev-skills@ascend-dev"]
enabled = true
```

也支持本地路径：`codex plugin marketplace add ./ascend_dev_plugin`。若从 Git URL 安装后
技能为空，请改用本地克隆（见 [docs/INSTALL.md](docs/INSTALL.md#codex)）。

### Cursor

Cursor 支持 Agent Plugins 便携包。把包复制到 Cursor 的本地插件目录后重载窗口：

```text
~/.cursor/plugins/local/ascend-dev-skills/
```

然后在 **Customize → Plugins** 中启用。Cursor 不会跟随指向该目录之外的软链，因此要复制而不是链接。

### 其他 Agent Plugins 宿主

VS Code、GitHub Copilot、Kiro、Hermes、OpenClaw、Antigravity 等兼容客户端读取根
`plugin.json`。按宿主自己的 Agent Plugins 安装说明指向本仓库或本地克隆即可，参见
[Agent Plugins 兼容客户端](https://agent-plugins.org/compatible-clients)。

## 环境要求

- Node.js ≥ 20（仅安装器与仓库工具需要；插件运行时无依赖）。
- 支持 submodule 的 git。
- 本仓库已实测：Claude Code 2.1.237、Codex CLI 0.149.0。

## 安装参数

| 参数 | 含义 |
| --- | --- |
| `--targets <list>` | `claude`、`codex`、`cursor`、`dsh`、`skills-dir`、`all`（默认：已探测到的宿主） |
| `--scope <scope>` | `user` 或 `project`（默认 `user`） |
| `--method <method>` | `auto`、`marketplace`、`skills`（默认 `auto`） |
| `--skills <list>` | `all`、技能 id，或序号/区间如 `1,3-5` |
| `--source <source>` | `local`（当前 checkout）、`git`（plugin.repository）或 git URL/路径 |
| `--target <dir>` | `skills-dir` 目标目录 |
| `--link` | 链接而非复制（Windows 用 junction） |
| `--force` | 覆盖已存在的技能目录 |
| `--yes` | 跳过交互 |
| `--dry-run` | 只打印计划，不做任何修改 |
| `--json` | 机器可读输出 |

## 仓库结构

```text
.
├── plugin.config.json          # 唯一事实源：元数据、技能清单、可选组件
├── plugin.json                 # 生成：Agent Plugins 1.0.0 清单
├── .claude-plugin/             # 生成：Claude Code 插件 + 市场
├── skills/                     # 6 个 git submodule
├── scripts/                    # 安装器、生成器、校验
├── tests/                      # node:test
├── docs/                       # 安装、扩展、兼容性、架构
└── assets/icon.svg
```

## 扩展

- **新增技能**：`npm run add-skill -- https://github.com/owner/repo.git --id my-skill`
  会添加 submodule、回填 `plugin.config.json`、重新生成清单并校验。详见
  [docs/ADDING-A-SKILL.md](docs/ADDING-A-SKILL.md)。
- **新增能力**（command / agent / hook / MCP server）：
  `npm run add-component -- command my-command`，详见
  [docs/ADDING-A-CAPABILITY.md](docs/ADDING-A-CAPABILITY.md)。
- **宿主支持矩阵**：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

## 开发

```bash
npm test                 # 单元/集成测试
npm run verify           # 配置、清单、submodule、技能校验
npm run check            # 生成文件漂移检查（CI）
npm run sync             # 重新生成宿主清单
npm run ci               # verify + tests
```

CI 中请在 `git submodule update --init --recursive` 之后运行
`npm run verify -- --require-skills`。

## 许可证

插件壳（清单、脚本、文档、图标）为 MIT；6 个 submodule 各自保留其许可证，详见
[NOTICES.md](NOTICES.md)。
