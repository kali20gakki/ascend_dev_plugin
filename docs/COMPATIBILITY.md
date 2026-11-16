# Compatibility

Verified against the tool versions available when the repository was tested; re-run
`node scripts/install.js doctor` and the host validators after upgrades.

| Host | Reads | Install path | Verified here |
| --- | --- | --- | --- |
| Claude Code 2.1.237 | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/` | `claude plugin marketplace add` + `claude plugin install` | `claude plugin validate` (plugin, marketplace, skills) and CLI install |
| Codex CLI 0.149.0 | root `plugin.json`, `skills/`, legacy `.claude-plugin/marketplace.json` | `codex plugin marketplace add` + `codex plugin add` | marketplace add/list/add/list in an isolated `CODEX_HOME` |
| Cursor | root `plugin.json`, `skills/` | copy to `~/.cursor/plugins/local/<name>` or the host's Agent Plugins flow | filesystem layout only; UI not verified |
| VS Code / GitHub Copilot | root `plugin.json`, `skills/` | host's Agent Plugins flow | not verified |
| Kiro / Hermes / OpenClaw / Antigravity / Perplexity | root `plugin.json`, `skills/` | host's Agent Plugins flow | not verified |
| DeepSeek Harness | `skills/` directory | copy/link into `~/.dsh/skills` or project `.dsh/skills` | installer copy path only |

## Component support

| Component | Claude Code | Codex | Cursor | Portable Agent Plugins |
| --- | --- | --- | --- | --- |
| Skills (`skills/<id>/SKILL.md`) | yes | yes | yes | yes |
| Commands | yes | no | Cursor Plugins only | no |
| Agents | yes | no | Cursor Plugins only | no |
| Hooks | yes | yes (`extensions.com.openai.hooks`) | Cursor Plugins only | no |
| MCP servers | yes (`.mcp.json`) | yes (`mcp.json`) | yes (`mcp.json`) | yes |

This repository currently ships skills only.

## Behavior differences worth knowing

- **Skill namespacing:** Claude Code exposes plugin skills as
  `ascend-dev-skills:<skill>`; a personal `~/.claude/skills/<skill>` with the same name
  is a separate skill and can coexist.
- **Submodule fetching:** Claude Code fetches the plugin's submodules when adding the
  marketplace. Codex snapshots a Git marketplace; if its snapshot lacks submodules,
  install from a local clone (see [INSTALL.md](INSTALL.md#codex)).
- **Marketplace file:** the repository ships the Claude marketplace file only. Codex
  accepts it as a legacy-compatible marketplace; if a future Codex release stops doing
  so, set `codex.repoMarketplace: true` in `plugin.config.json` and run `npm run sync` to
  emit `.agents/plugins/marketplace.json`.
- **Icons:** Claude Code ignores the `icon` field at load time on older versions (the
  manifest omits it). Cursor/Codex presentation comes from
  `extensions.com.openai.interface`, which is optional and never required for loading.
- **Skill frontmatter extensions:** `whenToUse`, `user-invocable`, and
  `disable-model-invocation` are portable/host-specific extensions. The repository
  validates only `name` and `description` and warns about nothing else.
