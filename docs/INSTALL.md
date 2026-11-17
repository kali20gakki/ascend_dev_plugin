# 安装指南

## 环境要求

- Node.js ≥ 20（仅安装器需要；插件运行时不依赖 Node）。
- 支持 submodule 的 git（源码方式需要；在线方式由安装器自动克隆）。
- 已实测：Claude Code 2.1.237、Codex CLI 0.149.0、Node.js 24。

## 在线安装（推荐）

```bash
npx ascend-dev-skills@latest
```

安装器会依次完成：

1. 探测本机的 Claude Code、Codex、Cursor、DSH（PATH 中的 CLI 或配置目录存在即视为已安装）；
2. 交互选择宿主、作用域、技能子集和安装方式；
3. 首次运行时把仓库与 submodule 克隆到缓存，之后复用：

   - Linux/macOS：`~/.cache/ascend-dev-skills/src`
   - Windows：`%LOCALAPPDATA%\ascend-dev-skills\src`
   - 可用 `--cache <dir>` 或环境变量 `ASCEND_DEV_SKILLS_HOME` 覆盖

4. 调用各宿主官方插件命令，或把技能复制到宿主技能目录；
5. 校验插件记录以及安装目录里的 `skills/<id>/SKILL.md`。

常用非交互命令：

```bash
npx ascend-dev-skills@latest --dry-run --targets all
npx ascend-dev-skills@latest --yes --targets claude,codex,dsh
npx ascend-dev-skills@latest --yes --targets cursor --skills 1,3-5
npx ascend-dev-skills@latest --targets skills-dir --target ~/.agents/skills --method skills
npx ascend-dev-skills@latest --targets codex --source git      # 会警告 submodule 缺失
npx ascend-dev-skills@latest doctor
npx ascend-dev-skills@latest uninstall --targets claude --remove-marketplace
```

- `--method marketplace`：使用宿主插件管理器（Claude Code、Codex）。
- `--method skills`：把 `skills/<id>` 复制到宿主技能目录；`--link` 改为链接（Windows 用 junction）。
- `--ref <ref>`：在线缓存使用的分支/标签，默认 `main`。
- `--repo <path>`：改用指定 checkout 作为技能来源（不写缓存）。

> 包尚未发布到 npm 时，可直接从 GitHub 运行：
>
> ```bash
> npx -y github:kali20gakki/ascend_dev_plugin
> ```
>
> 维护者发布：`npm publish --registry https://registry.npmjs.org/`。

## 源码安装（次要方式）

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
cd ascend_dev_plugin
node scripts/install.js
```

zip 下载或忘记 `--recursive` 时，`skills/` 为空；安装器会按 `plugin.config.json` 中的
`url`/`branch` 自动 `git submodule update --init` 或 `git clone` 补齐。

## Claude Code

市场方式（推荐）：

```bash
claude plugin marketplace add kali20gakki/ascend_dev_plugin
claude plugin install ascend-dev-skills@ascend-dev --scope user
```

会话内：

```text
/plugin marketplace add kali20gakki/ascend_dev_plugin
/plugin install ascend-dev-skills@ascend-dev
```

- 作用域：`user`（所有项目）、`project`（写入当前目录 `.claude/settings.json`）、`local`。
- 技能以 `/ascend-dev-skills:<技能名>` 出现；`/plugin` 管理启停与卸载。
- 提交前校验：`claude plugin validate .`、`claude plugin validate .claude-plugin/marketplace.json`。
- 已验证：Claude Code 从 GitHub 添加市场时会自动拉取 `skills/` 下的 submodule。
- 本地 checkout：`claude plugin marketplace add ./ascend_dev_plugin`。

技能目录兜底（不使用市场）：

```bash
npx ascend-dev-skills@latest --targets claude --method skills --scope user
# 复制到 ~/.claude/skills/<skill>；--scope project 则写入 ./.claude/skills
```

## Codex

```bash
codex plugin marketplace add kali20gakki/ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
codex /plugins
```

⚠️ **已实测：Codex 从 Git 市场源安装时不会拉取 submodule**，GitHub URL 安装后 `skills/`
是空的。请使用本地克隆：

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
codex plugin marketplace add ./ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
```

其它说明：

- 固定版本：`codex plugin marketplace add kali20gakki/ascend_dev_plugin --ref main`。
- 按项目启用（写入该仓库的 `.codex/config.toml`）：

  ```toml
  [plugins."ascend-dev-skills@ascend-dev"]
  enabled = true
  ```

- 根 `plugin.json` 遵循 Agent Plugins 1.0.0；OpenAI 专属展示信息在
  `extensions.com.openai` 下。Codex 同时兼容本仓生成的 `.claude-plugin/marketplace.json`。
- 技能目录兜底：`npx ascend-dev-skills@latest --targets codex --method skills`
  会复制到 `~/.codex/skills/<skill>`。

## Cursor

Cursor 从本地插件目录加载 Agent Plugins：

```bash
npx ascend-dev-skills@latest --targets cursor --yes
# 或手动
cp -r . ~/.cursor/plugins/local/ascend-dev-skills
```

重载窗口后在 **Customize → Plugins** 中启用。Cursor 会跳过指向 `~/.cursor/plugins/local`
之外的软链，因此请复制目录。

## DeepSeek Harness（DSH）

DSH 从技能目录加载，安装器支持用户级与项目级：

```bash
npx ascend-dev-skills@latest --yes --targets dsh --scope user
# ~/.dsh/skills/<skill>

npx ascend-dev-skills@latest --yes --targets dsh --scope project
# <当前目录>/.dsh/skills/<skill>
```

安装后新开 DSH 会话即可看到技能；卸载：

```bash
npx ascend-dev-skills@latest uninstall --targets dsh
```

## 其他 Agent Plugins 宿主

VS Code、GitHub Copilot、Kiro、Hermes、OpenClaw、Perplexity Computer、Google Antigravity
等兼容客户端读取根 `plugin.json` + `skills/`。使用宿主自带的 Agent Plugins 安装流程，或把
本 checkout 指向其本地插件目录；具体位置见
<https://agent-plugins.org/compatible-clients>。

## 卸载

```bash
npx ascend-dev-skills@latest uninstall --targets all
npx ascend-dev-skills@latest uninstall --targets claude --remove-marketplace
```

或按宿主手动卸载：

```bash
claude plugin uninstall ascend-dev-skills@ascend-dev --scope user
codex plugin remove ascend-dev-skills@ascend-dev
```

复制方式安装的目录（`~/.cursor/plugins/local/ascend-dev-skills`、各技能目录）由卸载命令清理。

## 排障

| 现象 | 处理 |
| --- | --- |
| `skills/*/SKILL.md is missing` | 源码方式：`git submodule update --init --recursive`；在线方式：重跑安装器刷新缓存 |
| `claude plugin install` 找不到插件 | `claude plugin marketplace list`，再 `claude plugin marketplace update ascend-dev` |
| Codex 安装后没有技能 | Git 源不拉 submodule；改用本地克隆或 `--method skills` |
| Claude Code 看不到技能 | 在 `/plugin` 确认插件已启用，然后新开会话 |
| 与 `~/.claude/skills` 副本重名 | 不冲突（插件技能带命名空间）；清理副本或卸载插件 |
