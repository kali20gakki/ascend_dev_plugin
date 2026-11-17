# Compatibility

Verified against the tool versions available when the repository was tested; re-run
`node scripts/install.js doctor` and the host validators after upgrades.

| Host | Reads | Install path | Verified here |
| --- | --- | --- | --- |
| Claude Code 2.1.237 | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/` | `claude plugin marketplace add` + `claude plugin install` | strict validation; install from a local path **and from GitHub** (submodules fetched, 6 skills in the cache) |
| Codex CLI 0.149.0 | root `plugin.json`, `skills/`, legacy `.claude-plugin/marketplace.json` | `codex plugin marketplace add` + `codex plugin add` | marketplace add/list/add/list in an isolated `CODEX_HOME` from a local path; GitHub source installs the plugin but **not** the submodules |
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
- **Submodule fetching (verified):** Claude Code fetches the plugin's submodules when adding the
  marketplace from GitHub. Codex 0.149.0 clones a Git marketplace **without** its submodules, so
  `skills/*` arrive empty; install Codex from a local clone (`--source local`) or use
  `--method skills`. The installer warns when Codex is combined with a Git source and checks the
  installed plugin's skill files after every marketplace install.
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
