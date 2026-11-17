# 昇腾开发技能包（Ascend dev skills）

[English](README.en.md) | 中文

一个**跨 agent 的通用插件**：把 6 个昇腾/GitCode 开发常用技能打包，供 Claude Code、Codex、
Cursor、DeepSeek Harness（DSH）以及所有支持 [Agent Plugins](https://agent-plugins.org) 标准的宿主加载。

一份仓库，多种宿主形态：

| 宿主 | 产物 | 加载方式 |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` | `/plugin marketplace add` → `/plugin install` |
| Codex / ChatGPT | 根 `plugin.json`（Agent Plugins 1.0.0） | `codex plugin marketplace add` → `codex plugin add` |
| Cursor | 根 `plugin.json` | 复制到 `~/.cursor/plugins/local` 或宿主 Agent Plugins 入口 |
| DeepSeek Harness | `skills/` | 安装器复制到 `~/.dsh/skills` 或项目 `.dsh/skills` |
| VS Code / Copilot / Kiro 等 | 根 `plugin.json` | 宿主自带的 Agent Plugins 安装入口 |
| 任意有技能目录的 agent | `skills/` | 复制/链接技能目录 |

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

## 在线安装（推荐）

```bash
npx ascend-dev-skills@latest
```

安装器会：

1. 探测本机的 Claude Code、Codex、Cursor、DSH；
2. 让你选择宿主、安装范围、技能和安装方式；
3. 首次运行时把仓库及 submodule 克隆到缓存（`~/.cache/ascend-dev-skills/src`，Windows 为
   `%LOCALAPPDATA%\ascend-dev-skills\src`），后续复用；
4. 调用各宿主官方插件命令，或把技能复制到宿主技能目录；
5. 安装后校验插件记录与技能文件是否真的落位。

常用非交互命令：

```bash
npx ascend-dev-skills@latest --dry-run --targets all
npx ascend-dev-skills@latest --yes --targets claude,codex,dsh
npx ascend-dev-skills@latest --yes --targets cursor --skills 1,3-5
npx ascend-dev-skills@latest --targets skills-dir --target ~/.agents/skills --method skills
npx ascend-dev-skills@latest doctor
npx ascend-dev-skills@latest uninstall --targets all --remove-marketplace
```

> **尚未发布到 npm 时**，可直接从 GitHub 运行同样的安装器：
>
> ```bash
> npx -y github:kali20gakki/ascend_dev_plugin
> ```
>
> 发布命令（维护者，需要先登录 npmjs）：
>
> ```bash
> npm login --registry https://registry.npmjs.org/
> npm publish --registry https://registry.npmjs.org/
> ```

## 源码安装（次要方式）

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
cd ascend_dev_plugin
node scripts/install.js
```

源码方式的参数、校验与在线方式完全一致；区别只是技能直接来自当前 checkout，不会写缓存。

## 各宿主安装

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

- 插件内技能以 `/ascend-dev-skills:<技能名>` 命名，在 `/plugin` 中启用/禁用/卸载。
- 已验证：Claude Code 从 GitHub 添加 marketplace 时会自动拉取 `skills/` 下的 submodule。
- 本地克隆可把来源换成路径：`claude plugin marketplace add ./ascend_dev_plugin`。

### Codex

```bash
codex plugin marketplace add kali20gakki/ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
codex /plugins
```

⚠️ **Codex 从 Git 市场源安装时不会拉取 git submodule**（已实测），从 GitHub URL 安装会得到
空的 `skills/`。请改用本地克隆：

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
codex plugin marketplace add ./ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
```

安装器也会在 `--targets codex --source git` 时告警，并在安装后检查技能文件。

按项目启用（写入该仓库的 `.codex/config.toml`）：

```toml
[plugins."ascend-dev-skills@ascend-dev"]
enabled = true
```

### Cursor

Cursor 支持 Agent Plugins 便携包。用安装器或手动复制到本地插件目录后重载窗口：

```bash
npx ascend-dev-skills@latest --yes --targets cursor
# 或
cp -r . ~/.cursor/plugins/local/ascend-dev-skills
```

然后在 **Customize → Plugins** 中启用。Cursor 不会跟随指向该目录之外的软链，因此要复制。

### DeepSeek Harness（DSH）

DSH 通过技能目录加载，安装器支持用户级和项目级：

```bash
npx ascend-dev-skills@latest --yes --targets dsh --scope user
# 安装到 ~/.dsh/skills/<skill>

npx ascend-dev-skills@latest --yes --targets dsh --scope project
# 安装到 <当前目录>/.dsh/skills/<skill>
```

安装后在新的 DSH 会话中即可看到这些技能；卸载用
`npx ascend-dev-skills@latest uninstall --targets dsh`。

### 其他 Agent Plugins 宿主

VS Code、GitHub Copilot、Kiro、Hermes、OpenClaw、Perplexity Computer、Google Antigravity
等兼容客户端读取根 `plugin.json` + `skills/`。按宿主自己的 Agent Plugins 安装说明指向本仓库
或本地克隆即可，参见 [Agent Plugins 兼容客户端](https://agent-plugins.org/compatible-clients)。

## 安装参数

| 参数 | 含义 |
| --- | --- |
| `--targets <list>` | `claude`、`codex`、`cursor`、`dsh`、`skills-dir`、`all`（默认：已探测到的宿主） |
| `--scope <scope>` | `user` 或 `project`（默认 `user`） |
| `--method <method>` | `auto`、`marketplace`、`skills`（默认 `auto`） |
| `--skills <list>` | `all`、技能 id，或序号/区间如 `1,3-5` |
| `--source <source>` | `local`（使用已解析的技能来源，默认）、`git`（plugin.repository）或 git URL/路径 |
| `--target <dir>` | `skills-dir` 目标目录 |
| `--link` | 链接而非复制（Windows 用 junction） |
| `--force` | 覆盖已存在的技能目录 |
| `--yes` | 跳过交互 |
| `--dry-run` | 只打印计划，不做任何修改 |
| `--json` | 机器可读输出 |
| `--repo <path>` | 使用指定 checkout 作为技能来源 |
| `--ref <ref>` | 在线安装使用的分支/标签（默认 `main`） |
| `--cache <dir>` | 在线安装缓存目录（默认 `~/.cache/ascend-dev-skills`） |

## 验证与排障

```bash
npx ascend-dev-skills@latest doctor
```

输出安装包位置、技能来源（checkout/在线缓存）、6 个技能的初始化状态、各宿主探测与安装状态。

常见问题：

| 现象 | 处理 |
| --- | --- |
| `SKILL.md is missing` | 源码方式执行 `git submodule update --init --recursive`；在线方式重跑安装器（会更新缓存） |
| Codex 安装后没有技能 | 用本地克隆安装，避免 Git 源不拉 submodule |
| `claude plugin install` 找不到插件 | `claude plugin marketplace list`，再 `claude plugin marketplace update ascend-dev` |
| 与 `~/.claude/skills` 下同名技能重复 | 二者不冲突（插件技能带命名空间）；如需清理，删除个人技能副本或卸载插件 |

## 仓库结构

```text
.
├── plugin.config.json          # 唯一事实源：元数据、技能清单、可选组件
├── plugin.json                 # 生成：Agent Plugins 1.0.0 清单
├── .claude-plugin/             # 生成：Claude Code 插件 + 市场
├── skills/                     # 6 个 git submodule
├── scripts/                    # 安装器、在线缓存、生成器、校验
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

## 开发与发布

```bash
npm test                 # 单元/集成测试
npm run verify           # 配置、清单、submodule、技能校验
npm run check            # 生成文件漂移检查（CI）
npm run sync             # 重新生成宿主清单
npm run ci               # verify + tests

npm publish --registry https://registry.npmjs.org/
```

CI 中请在 `git submodule update --init --recursive` 之后运行
`npm run verify -- --require-skills`。

## 许可证

插件壳（清单、脚本、文档、图标）为 MIT；6 个 submodule 各自保留其许可证，详见
[NOTICES.md](NOTICES.md)。
