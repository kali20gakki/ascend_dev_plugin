# Install guide

## Before you start

```bash
git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
cd ascend_dev_plugin
node --version   # must be >= 20
```

If you downloaded a zip instead of cloning, the `skills/` directories are empty. Either
clone with submodules or let the installer clone them:

```bash
node scripts/install.js --targets skills-dir --target ~/.agents/skills --method skills
```

## Interactive installer

```bash
node scripts/install.js
```

The installer:

1. detects Claude Code, Codex, Cursor, and DeepSeek Harness (CLI on `PATH` or config directory present);
2. asks for targets, scope, skills, and install method;
3. initializes only the selected submodules;
4. runs each host's official plugin commands (or copies skills when a host has no marketplace);
5. verifies the result and prints anything it could not check.

Useful variants:

```bash
node scripts/install.js --dry-run --targets all          # review the plan
node scripts/install.js --yes --targets claude           # unattended
node scripts/install.js --targets skills-dir --target /path/to/skills --method skills
node scripts/install.js --targets claude,codex --source git   # install from plugin.repository
node scripts/install.js doctor
node scripts/install.js uninstall --targets claude --remove-marketplace
```

`--method marketplace` uses the host plugin manager; `--method skills` copies the
`skills/<id>` directories into the host's skills root. `--link` creates junctions/symlinks
instead of copies where the host accepts them.

## Claude Code

Marketplace flow (recommended):

```bash
claude plugin marketplace add kali20gakki/ascend_dev_plugin
claude plugin install ascend-dev-skills@ascend-dev --scope user
```

From inside a session:

```text
/plugin marketplace add kali20gakki/ascend_dev_plugin
/plugin install ascend-dev-skills@ascend-dev
```

- Scopes: `user` (all projects), `project` (writes `.claude/settings.json` in the current directory), `local`.
- Skills appear as `/ascend-dev-skills:<skill>`; `/plugin` manages enablement.
- Validate before installing from a fork: `claude plugin validate .` and
  `claude plugin validate .claude-plugin/marketplace.json`.
- When Claude Code adds this marketplace from Git, it fetches the submodules that hold
  plugin files (`skills/`), so the skills arrive with the plugin.
- Local checkout instead of GitHub: `claude plugin marketplace add ./ascend_dev_plugin`.

Skills-directory fallback (no marketplace):

```bash
node scripts/install.js --targets claude --method skills --scope user
# copies to ~/.claude/skills/<skill> (or ./.claude/skills with --scope project)
```

## Codex

```bash
codex plugin marketplace add kali20gakki/ascend_dev_plugin
codex plugin add ascend-dev-skills@ascend-dev
codex /plugins
```

- Local path: `codex plugin marketplace add ./ascend_dev_plugin`.
- Pin a ref: `codex plugin marketplace add kali20gakki/ascend_dev_plugin --ref main`.
- Project enablement: `.codex/config.toml`

  ```toml
  [plugins."ascend-dev-skills@ascend-dev"]
  enabled = true
  ```

- **Submodules (verified):** a Git marketplace source does **not** bring Codex the submodules.
  `codex plugin marketplace add kali20gakki/ascend_dev_plugin` installs the plugin, but
  `skills/*` is empty. Use a local clone instead (or let the installer copy the skills):

  ```bash
  git clone --recurse-submodules https://github.com/kali20gakki/ascend_dev_plugin.git
  codex plugin marketplace add ./ascend_dev_plugin
  codex plugin add ascend-dev-skills@ascend-dev
  ```

  The installer emits a warning for `--targets codex --source git` and verifies the installed
  plugin's `skills/<id>/SKILL.md` files after installing.

- The root `plugin.json` follows Agent Plugins 1.0.0; OpenAI-specific presentation lives
  under `extensions.com.openai`. Codex also accepts the legacy
  `.claude-plugin/marketplace.json` file this repository generates.
- Skills-directory fallback: the installer can copy into `~/.codex/skills/<skill>` with
  `--method skills`.

## Cursor

Cursor loads Agent Plugins from its local plugin folder:

```bash
node scripts/install.js --targets cursor --yes
# or manually:
cp -r . ~/.cursor/plugins/local/ascend-dev-skills
```

Then reload the window and enable the plugin in **Customize → Plugins**. Cursor skips
symlinks that point outside `~/.cursor/plugins/local`, so copy the directory.

## Other Agent Plugins hosts

VS Code, GitHub Copilot, Kiro, Hermes, OpenClaw, Perplexity Computer, Google Antigravity,
and other compatible clients read the root `plugin.json` + `skills/`. Use the host's
Agent Plugins installation flow (or point its local plugin directory at this checkout) and
consult <https://agent-plugins.org/compatible-clients> for the exact location.

## DeepSeek Harness (optional)

The installer can copy or link the skills into DSH's user or project skill root:

```bash
node scripts/install.js --targets dsh --scope user
# ~/.dsh/skills/<skill>
```

## Uninstall

```bash
node scripts/install.js uninstall --targets all
node scripts/install.js uninstall --targets claude --remove-marketplace
```

Or per host:

```bash
claude plugin uninstall ascend-dev-skills@ascend-dev --scope user
codex plugin remove ascend-dev-skills@ascend-dev
```

Remove `~/.cursor/plugins/local/ascend-dev-skills` and any copied `skills/<id>` folders
if you installed with copy mode.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `skills/*/SKILL.md is missing` | `git submodule update --init --recursive`, or rerun the installer |
| `claude plugin install` cannot find the plugin | `claude plugin marketplace list`, then `claude plugin marketplace update ascend-dev` |
| Codex installs but lists no skills | Install from a local clone (submodules) instead of a Git URL |
| Claude Code shows no skills | Check `/plugin` for the plugin row, then start a new session |
| Skills are duplicated with `~/.claude/skills` copies | Remove the copy or uninstall the plugin; plugin skills are namespaced |
