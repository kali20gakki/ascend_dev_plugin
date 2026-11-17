# Ascend dev skills

English | [中文](README.zh.md)

A **cross-agent plugin** that packages six Ascend/GitCode developer skills for
Claude Code, Codex, Cursor, and any host that supports the
[Agent Plugins](https://agent-plugins.org) standard.

One repository, three host formats:

| Host | Artifact | How it loads |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` | `/plugin marketplace add` → `/plugin install` |
| Codex / ChatGPT | root `plugin.json` (Agent Plugins 1.0.0) | `codex plugin marketplace add` → `codex plugin add` |
| Cursor / VS Code / Copilot / Kiro / others | root `plugin.json` | host's Agent Plugins install flow |
| Any agent with a skills directory | `skills/` | copy/link skill folders |

Skills are **git submodules**: this repository pins them by commit and never stores
their bodies. Adding a skill means adding a submodule, not editing plugin code.

## Skills

| Skill | What it does |
| --- | --- |
| [`scene-fuzz`](skills/scene-fuzz) | Scenario-driven white-box fuzz testing with real run evidence. |
| [`gitcode-cli`](skills/gitcode-cli) | End-to-end GitCode work from the terminal with the `gitcode` CLI. |
| [`ascend-interface-auditor`](skills/ascend-interface-auditor) | Audit northbound/southbound interfaces of Ascend repositories into Excel. |
| [`gitcode-code-reviewer`](skills/gitcode-code-reviewer) | Deep GitCode PR review with repository context and inline comments. |
| [`gitcode-release-note-generator`](skills/gitcode-release-note-generator) | Formal release notes from real GitCode repository data. |
| [`document-ux-review`](skills/document-ux-review) | Follow a README/quick start as a first-time user and report onboarding gaps. |

## Quick start

### Interactive installer (recommended)

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
cd ascend_dev_plugin
node scripts/install.js
```

The installer detects Claude Code, Codex, Cursor, and DeepSeek Harness, lets you pick
targets, scope, and skills, then runs the host's official plugin commands. It never
edits agent configuration files by hand.

```bash
node scripts/install.js --dry-run --targets all     # show the plan, change nothing
node scripts/install.js --yes --targets claude,codex
node scripts/install.js --targets skills-dir --target ~/.agents/skills --method skills
node scripts/install.js doctor                      # what is initialized/installed
node scripts/install.js uninstall --targets claude --remove-marketplace
```

### Claude Code

```text
/plugin marketplace add kali20gakki/ascend_dev_plugin
/plugin install ascend-dev-skills@ascend-dev
```

Or from a shell:

```bash
claude plugin marketplace add kali20gakki/ascend_dev_plugin
claude plugin install ascend-dev-skills@ascend-dev --scope user
```

Skills are namespaced as `/ascend-dev-skills:<skill-name>`; manage the plugin from `/plugin`.
For a local checkout, replace the source with its path: `claude plugin marketplace add ./ascend_dev_plugin`.

### Codex

```bash
codex plugin marketplace add kali20gakki/ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
codex /plugins
```

To enable it for one repository, add to that repo's `.codex/config.toml`:

```toml
[plugins."ascend-dev-skills@ascend-dev"]
enabled = true
```

Codex installs from a local path as well: `codex plugin marketplace add ./ascend_dev_plugin`.
**Codex does not fetch git submodules from a Git marketplace source**, so installing from the
GitHub URL yields an empty `skills/`. Use a local clone (`git clone --recurse-submodules`, then
`codex plugin marketplace add ./ascend_dev_plugin`) or `--method skills`; the installer warns
about this combination and checks the installed skill files
(see [docs/INSTALL.md](docs/INSTALL.md#codex)).

### Cursor

Cursor supports the portable Agent Plugins package. Copy the package (or let the
installer do it) into Cursor's local plugin folder and reload the window:

```text
~/.cursor/plugins/local/ascend-dev-skills/
```

Then enable it from **Customize → Plugins**. Cursor does not follow symlinks that point
outside that folder, so copy rather than link.

### Other Agent Plugins hosts

VS Code, GitHub Copilot, Kiro, Hermes, OpenClaw, Antigravity, and other compatible
clients load the root `plugin.json` package. Follow your host's Agent Plugins install
instructions and point it at this repository or a local clone; see
[Agent Plugins compatible clients](https://agent-plugins.org/compatible-clients).

## Requirements

- Node.js ≥ 20 for the installer and repository tooling (the plugin itself has no runtime).
- Git with submodule support.
- Verified in this repository: Claude Code 2.1.237 and Codex CLI 0.149.0.

## Install methods and flags

| Flag | Meaning |
| --- | --- |
| `--targets <list>` | `claude`, `codex`, `cursor`, `dsh`, `skills-dir`, `all` (default: detected) |
| `--scope <scope>` | `user` or `project` (default: `user`) |
| `--method <method>` | `auto`, `marketplace`, or `skills` (default: `auto`) |
| `--skills <list>` | `all`, skill ids, or indexes/ranges such as `1,3-5` |
| `--source <source>` | `local` (this checkout), `git` (plugin.repository), or a git URL/path |
| `--target <dir>` | destination for the `skills-dir` target |
| `--link` | link skills instead of copying (junction on Windows) |
| `--force` | overwrite existing skill directories |
| `--yes` | skip prompts |
| `--dry-run` | print the plan and change nothing |
| `--json` | machine-readable output |

## Repository layout

```text
.
├── plugin.config.json          # single source of truth (metadata, skills, components)
├── plugin.json                 # generated: Agent Plugins 1.0.0 manifest
├── .claude-plugin/             # generated: Claude Code plugin + marketplace
├── skills/                     # six git submodules
├── scripts/                    # installer, generators, validation
├── tests/                      # node:test suites
├── docs/                       # install, extension, compatibility, architecture
└── assets/icon.svg
```

## Extend

- **New skill**: `npm run add-skill -- https://github.com/owner/repo.git --id my-skill`
  adds the submodule, fills `plugin.config.json`, regenerates manifests, and validates.
  See [docs/ADDING-A-SKILL.md](docs/ADDING-A-SKILL.md).
- **New capability** (command, agent, hook, MCP server):
  `npm run add-component -- command my-command`. See
  [docs/ADDING-A-CAPABILITY.md](docs/ADDING-A-CAPABILITY.md).
- **Host support matrix**: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Development

```bash
npm test                 # node:test suites
npm run verify           # config, manifests, submodules, skills
npm run check            # fail when generated files drift
npm run sync             # regenerate host manifests
npm run ci               # verify + tests (any CI)
```

`npm run verify -- --require-skills` fails when submodules are not initialized, which is
what CI should use after `git submodule update --init --recursive`.

## License

Plugin wrapper: MIT. Submodule skills keep their own licenses; see
[NOTICES.md](NOTICES.md).
