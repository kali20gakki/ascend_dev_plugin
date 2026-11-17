# 新增能力

技能放在 `skills/`（submodule）；其余能力作为**组件**声明在 `plugin.config.json`，由生成器写入
各宿主清单：

| 组件 | 文件 | Claude Code | Agent Plugins 宿主（Codex/Cursor/…） |
| --- | --- | --- | --- |
| command | `commands/<name>.md` | `commands` 字段 | 不可移植，仅 Claude |
| agent | `agents/<name>.md` | `agents` 字段 | 不可移植，仅 Claude |
| hook | `hooks/hooks.json` | `hooks` 字段 | `extensions.com.openai.hooks` |
| MCP server | 生成的 `mcp.json` + `.mcp.json` | `mcpServers` | 根 `mcp.json`（带 `type`） |

唯一事实源是 `plugin.config.json` 的 `components`；`npm run sync` 重新生成清单，
`npm run check` 在生成物漂移时失败。

## command

```bash
npm run add-component -- command my-command --description "什么时候使用 /my-command"
```

生成 `commands/my-command.md`，写入 `components.commands`，并更新 Claude 清单
（`commands: ["./commands/my-command.md"]`）。调用方式：`/ascend-dev-skills:my-command`。

## agent

```bash
npm run add-component -- agent reviewer --description "审查变更文件"
```

生成 `agents/reviewer.md`，写入 `components.agents`。Claude Code 中的名字是
`ascend-dev-skills:reviewer`。

## hook

```bash
npm run add-component -- hook
```

生成 `hooks/hooks.json`（`{"hooks": {}}`），设置 `components.hooks`，同时更新 Claude 的
`hooks` 字段和 `extensions.com.openai.hooks`。请按 Claude Code / Codex 的 hooks 文档补充真实事件；
空 hook 文件会产生校验 warning。

## MCP server

```bash
npm run add-component -- mcp-server docs --transport streamable-http
```

在 `components.mcpServers` 中追加一个 `command: "TODO"` 的条目。补齐 `command`/`url` 等字段后：

```bash
npm run sync && npm run verify
```

生成器会写出：

- `mcp.json`：Agent Plugins 格式（`{"mcpServers": {"docs": {"type": "streamable-http", ...}}}`）；
- `.mcp.json`：Claude Code 格式（不含 `type`）。

`verify` 会拒绝仍含 `TODO` 的 MCP 条目，未完成的能力不会被误发布。只有技能、没有 MCP 时，
两个文件都不会生成。

## 各宿主注意点

- **Claude Code** 接受 `commands`（路径/数组/映射）、`agents`（`.md` 文件数组）、`hooks`
  （路径/对象）、`mcpServers`（路径/对象）。`skills/` 默认扫描，无需在清单里列出。
- **Agent Plugins** 只标准化 `skills/` 和 `mcp.json`；其它组件请放在 Claude 清单，或使用
  `extensions` 命名空间。
- **Cursor** 读取根 `plugin.json`；Cursor 专属的 rules/hooks 需要另建 `.cursor-plugin/` 包。

## 校验

```bash
npm run sync
npm run check
npm run verify
claude plugin validate .
claude plugin validate .claude-plugin/marketplace.json
```

组件变更提交前必须通过上述校验。
