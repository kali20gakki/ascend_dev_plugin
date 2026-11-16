# Architecture

## Goals

1. One repository usable as a plugin by several agent hosts, not tied to one.
2. Skills referenced as git submodules; the plugin repository never copies skill bodies.
3. Adding a skill or a capability needs configuration changes only, not plugin runtime code.
4. Every generated artifact is reproducible and drift-checked.

## Formats

The repository is simultaneously:

- an **Agent Plugins 1.0.0** package — root `plugin.json`, `skills/`, optional `mcp.json`;
- a **Claude Code plugin** — `.claude-plugin/plugin.json`;
- a **Claude Code marketplace** (also read by Codex as a legacy marketplace) —
  `.claude-plugin/marketplace.json`, with `plugins[0].source: "."` because the
  marketplace root is the plugin.

Root `plugin.json` is intentionally closed to the portable fields; host-specific data
lives under `extensions` (currently `com.openai.interface`). Claude-specific components
live in `.claude-plugin/plugin.json` and are emitted only when configured.

## Single source of truth

`plugin.config.json` holds plugin identity, marketplace identity, optional components,
and the skill inventory. `scripts/lib/render.js` turns it into the generated files:

```text
plugin.config.json
├── plugin.json                     (Agent Plugins)
├── .claude-plugin/plugin.json      (Claude Code)
├── .claude-plugin/marketplace.json (Claude marketplace / Codex legacy)
├── .agents/plugins/marketplace.json (only when codex.repoMarketplace is true)
├── mcp.json / .mcp.json            (only when mcpServers are configured)
└── package.json#version            (kept equal to the plugin version)
```

`npm run sync` writes them; `npm run check` fails when a committed file differs. The
generated files are committed because hosts read them directly from the repository.

## Skills as submodules

```
skills/<id>/SKILL.md   ← submodule root, pinned by gitlink
```

- The id is the directory name; the skill's routing name comes from `SKILL.md`
  frontmatter. Hosts discover `skills/<child>/SKILL.md` at one level, so this layout is
  valid for Claude Code plugin skills, Agent Plugins, and skills-directory hosts.
- `.gitmodules` and `plugin.config.json` must agree; `verify` enforces URL, branch, and
  path. `git submodule status` is the version record.
- Because the plugin root is the marketplace root, Claude Code treats `skills/` as a
  component directory and fetches the submodules when adding the marketplace.

## Installer

`scripts/install.js` orchestrates the hosts' own tooling instead of writing their
configuration:

```text
detect hosts → choose targets/scope/skills/method → initialize submodules
→ per-host steps (marketplace command or skill copy) → verify → notes
```

- `scripts/lib/plan.js` builds a pure plan (`command`, `copy-skill`, `copy-plugin` steps
  plus verification); `--dry-run` prints it and changes nothing.
- `scripts/lib/installer.js` executes the plan with argv arrays (Windows `.cmd` shims are
  invoked through `cmd.exe` with explicit quoting) and verifies via host CLIs and paths.
- Marketplace installs use the host CLI (`claude plugin …`, `codex plugin …`); hosts
  without a marketplace (Cursor, DSH, `skills-dir`) get copied or linked skill folders.
- Cursor gets a copy of the portable package in `~/.cursor/plugins/local/<name>` because
  its local plugin folder ignores symlinks that point outside it.

## Verification layers

1. **Config** — shape, name rules, URLs, localized text, duplicates.
2. **Generated files** — byte equality with rendered output, allowed portable fields,
   `.` marketplace source, version agreement with `package.json`.
3. **Submodules** — `.gitmodules` ↔ config, checkout presence.
4. **Skills** — frontmatter parses, kebab-case name, description present, invocation
   flags valid; `--require-skills` makes missing checkouts fatal.
5. **Components** — configured files exist, hook JSON parses, MCP placeholders rejected.
6. **Hosts** — `claude plugin validate` (plugin, marketplace, skills) and Codex
   marketplace/install in an isolated `CODEX_HOME` (see `docs/COMPATIBILITY.md`).

## Decisions

- **No runtime plugin code.** Every host only needs its native plugin format, so there is
  nothing to build, bundle, or sandbox. The only JavaScript is maintainer tooling.
- **No `plugins/` subdirectory.** The plugin is the repository root so submodule paths
  stay `skills/<id>` and every host's default scan applies.
- **One marketplace file by default.** Emitting both the Claude and Codex marketplace
  files in one repository can surface the plugin twice; the Codex-native file is opt-in
  via `codex.repoMarketplace`.
- **Skills-directory fallback.** It keeps older hosts and non-standard clients usable
  without inventing per-host adapters, and it doubles as a DSH install path.
