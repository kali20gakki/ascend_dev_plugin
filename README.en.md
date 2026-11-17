# Ascend dev skills

English | [中文](README.md)

A **cross-agent plugin** that packages six Ascend/GitCode developer skills for Claude Code,
Codex, Cursor, DeepSeek Harness (DSH), and any host that supports the
[Agent Plugins](https://agent-plugins.org) standard.

One repository, several host formats:

| Host | Artifact | How it loads |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` | `/plugin marketplace add` → `/plugin install` |
| Codex / ChatGPT | root `plugin.json` (Agent Plugins 1.0.0) | `codex plugin marketplace add` → `codex plugin add` |
| Cursor | root `plugin.json` | copy to `~/.cursor/plugins/local` or the host's Agent Plugins flow |
| DeepSeek Harness | `skills/` | installer copies into `~/.dsh/skills` or project `.dsh/skills` |
| VS Code / Copilot / Kiro / others | root `plugin.json` | the host's Agent Plugins install flow |
| Any agent with a skills directory | `skills/` | copy or link skill folders |

Skills are **git submodules**: this repository pins them by commit and never stores their
bodies. Adding a skill means adding a submodule, not editing plugin code.

## Skills

| Skill | What it does |
| --- | --- |
| [`scene-fuzz`](skills/scene-fuzz) | Scenario-driven white-box fuzz testing with real run evidence. |
| [`gitcode-cli`](skills/gitcode-cli) | End-to-end GitCode work from the terminal with the `gitcode` CLI. |
| [`ascend-interface-auditor`](skills/ascend-interface-auditor) | Audit northbound/southbound interfaces of Ascend repositories into Excel. |
| [`gitcode-code-reviewer`](skills/gitcode-code-reviewer) | Deep GitCode PR review with repository context and inline comments. |
| [`gitcode-release-note-generator`](skills/gitcode-release-note-generator) | Formal release notes from real GitCode repository data. |
| [`document-ux-review`](skills/document-ux-review) | Follow a README/quick start as a first-time user and report onboarding gaps. |

## Online install (recommended)

```bash
npx ascend-dev-skills@latest
```

The installer:

1. detects Claude Code, Codex, Cursor, and DSH;
2. asks for targets, scope, skills, and install method;
3. clones the repository with submodules into a cache on first use
   (`~/.cache/ascend-dev-skills/src`; `%LOCALAPPDATA%\ascend-dev-skills\src` on Windows) and
   reuses it afterwards;
4. runs each host's official plugin commands or copies skills into the host's skills directory;
5. verifies the plugin record and the installed skill files.

Unattended examples:

```bash
npx ascend-dev-skills@latest --dry-run --targets all
npx ascend-dev-skills@latest --yes --targets claude,codex,dsh
npx ascend-dev-skills@latest --yes --targets cursor --skills 1,3-5
npx ascend-dev-skills@latest --targets skills-dir --target ~/.agents/skills --method skills
npx ascend-dev-skills@latest doctor
npx ascend-dev-skills@latest uninstall --targets all --remove-marketplace
```

> **Before the package is published to npm**, run the same installer from GitHub:
>
> ```bash
> npx -y github:kali20gakki/ascend_dev_plugin
> ```
>
> Maintainers publish with:
>
> ```bash
> npm publish --registry https://registry.npmjs.org/
> ```

## Source install (secondary)

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
cd ascend_dev_plugin
node scripts/install.js
```

Flags, prompts, and verification are identical; the only difference is that skills come from
the current checkout and no cache is written.

## Per-host install

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

- Skills appear as `/ascend-dev-skills:<skill>`; manage enablement from `/plugin`.
- Verified: adding this marketplace from GitHub fetches the `skills/` submodules.
- Local checkout: `claude plugin marketplace add ./ascend_dev_plugin`.

### Codex

```bash
codex plugin marketplace add kali20gakki/ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
codex /plugins
```

**Codex does not fetch git submodules from a Git marketplace source** (verified), so a
GitHub-URL install yields an empty `skills/`. Use a local clone:

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
codex plugin marketplace add ./ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
```

The installer warns about `--targets codex --source git` and checks the installed skill files.

Enable it for one repository in `.codex/config.toml`:

```toml
[plugins."ascend-dev-skills@ascend-dev"]
enabled = true
```

### Cursor

Cursor supports the portable Agent Plugins package. Copy it (or let the installer do it) into
Cursor's local plugin folder and reload the window:

```bash
npx ascend-dev-skills@latest --yes --targets cursor
# or
cp -r . ~/.cursor/plugins/local/ascend-dev-skills
```

Then enable it from **Customize → Plugins**. Cursor does not follow symlinks that point outside
that folder, so copy rather than link.

### DeepSeek Harness (DSH)

DSH loads skills from a skills directory; the installer supports user and project scope:

```bash
npx ascend-dev-skills@latest --yes --targets dsh --scope user
# ~/.dsh/skills/<skill>

npx ascend-dev-skills@latest --yes --targets dsh --scope project
# <current dir>/.dsh/skills/<skill>
```

Start a new DSH session to load them. Uninstall with
`npx ascend-dev-skills@latest uninstall --targets dsh`.

### Other Agent Plugins hosts

VS Code, GitHub Copilot, Kiro, Hermes, OpenClaw, Perplexity Computer, and Google Antigravity
read the root `plugin.json` + `skills/`. Point your host's Agent Plugins install flow at this
repository or a local clone; see
[Agent Plugins compatible clients](https://agent-plugins.org/compatible-clients).

## Install flags

| Flag | Meaning |
| --- | --- |
| `--targets <list>` | `claude`, `codex`, `cursor`, `dsh`, `skills-dir`, `all` (default: detected hosts) |
| `--scope <scope>` | `user` or `project` (default `user`) |
| `--method <method>` | `auto`, `marketplace`, or `skills` (default `auto`) |
| `--skills <list>` | `all`, skill ids, or indexes/ranges such as `1,3-5` |
| `--source <source>` | `local` (resolved source, default), `git` (plugin.repository), or a git URL/path |
| `--target <dir>` | destination for the `skills-dir` target |
| `--link` | link skills instead of copying (junction on Windows) |
| `--force` | overwrite existing skill directories |
| `--yes` | skip prompts |
| `--dry-run` | print the plan and change nothing |
| `--json` | machine-readable output |
| `--repo <path>` | use a specific checkout as the skill source |
| `--ref <ref>` | branch/tag for the online cache (default `main`) |
| `--cache <dir>` | online cache directory (default `~/.cache/ascend-dev-skills`) |

## Verify and troubleshoot

```bash
npx ascend-dev-skills@latest doctor
```

It reports the package location, skill source (checkout or online cache), the six skills'
initialization state, and each host's detection and install state.

| Symptom | Fix |
| --- | --- |
| `SKILL.md is missing` | Source install: `git submodule update --init --recursive`; online install: rerun the installer to refresh the cache |
| Codex lists no skills | Install from a local clone (Git sources skip submodules) |
| `claude plugin install` cannot find the plugin | `claude plugin marketplace list`, then `claude plugin marketplace update ascend-dev` |
| Duplicates with `~/.claude/skills` copies | They do not conflict (plugin skills are namespaced); remove the copy or uninstall the plugin |

## Repository layout

```text
.
├── plugin.config.json          # single source of truth (metadata, skills, components)
├── plugin.json                 # generated: Agent Plugins 1.0.0 manifest
├── .claude-plugin/             # generated: Claude Code plugin + marketplace
├── skills/                     # six git submodules
├── scripts/                    # installer, online cache, generators, validation
├── tests/                      # node:test suites
├── docs/                       # install, extension, compatibility, architecture
└── assets/icon.svg
```

## Extend

- **New skill**: `npm run add-skill -- https://github.com/owner/repo.git --id my-skill`
  adds the submodule, fills `plugin.config.json`, regenerates manifests, and validates.
- **New capability** (command, agent, hook, MCP server):
  `npm run add-component -- command my-command`.
- **Host support matrix**: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Development and publishing

```bash
npm test                 # node:test suites
npm run verify           # config, manifests, submodules, skills
npm run check            # fail when generated files drift
npm run sync             # regenerate host manifests
npm run ci               # verify + tests

npm publish --registry https://registry.npmjs.org/
```

CI should run `npm run verify -- --require-skills` after
`git submodule update --init --recursive`.

## License

Plugin wrapper: MIT. Submodule skills keep their own licenses; see
[NOTICES.md](NOTICES.md).
