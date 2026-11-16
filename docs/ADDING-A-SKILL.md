# Add a skill

Skills are git submodules under `skills/`. A skill is valid when
`skills/<id>/SKILL.md` exists and starts with Agent Skills frontmatter (`name`,
`description`).

## One command

```bash
npm run add-skill -- https://github.com/owner/repo.git --id my-skill
```

The script:

1. derives or accepts a kebab-case id (`--id`), branch (`--branch`), titles
   (`--title-en/--title-zh`), and descriptions (`--description-en/--description-zh`);
2. runs `git submodule add -b <branch> <url> skills/<id>` (or updates an existing one);
3. reads `skills/<id>/SKILL.md` frontmatter;
4. appends or updates the `skills[]` entry in `plugin.config.json`;
5. regenerates host manifests and runs the repository checks.

It prints the skill's frontmatter name. Titles and descriptions default to the
frontmatter description; edit `plugin.config.json` to polish the bilingual copy.
Then review and commit:

```bash
git add .gitmodules plugin.config.json skills plugins 2>/dev/null || true
git add .gitmodules plugin.config.json skills
git commit -m "feat: add my-skill"
```

## Manual steps

```bash
git submodule add -b main https://github.com/owner/repo.git skills/my-skill
```

Add to `plugin.config.json`:

```json
{
  "id": "my-skill",
  "path": "skills/my-skill",
  "url": "https://github.com/owner/repo.git",
  "branch": "main",
  "title": { "en": "My skill", "zh": "我的技能" },
  "description": { "en": "What it does.", "zh": "它做什么。" },
  "tags": ["example"]
}
```

Then:

```bash
npm run sync     # regenerate plugin.json, .claude-plugin/*
npm run verify
```

## Requirements and pitfalls

- The id must be kebab-case and equal the directory name: `skills/<id>`.
- The frontmatter `name` may differ from the id; the validator warns when it does.
- One submodule = one skill. A repository containing several skills needs one
  submodule entry per skill directory, using a `:path` suffix in the submodule URL
  (`git submodule add <url> skills/<id>` with the URL pointing at the repository).
- Submodules are pinned by gitlink. To move a skill to a newer upstream commit:

  ```bash
  git submodule update --remote -- skills/my-skill
  git add skills/my-skill && git commit -m "chore: bump my-skill"
  ```

- To remove a skill: `git submodule deinit -f skills/<id>`, delete the entry from
  `plugin.config.json`, run `npm run sync`, then remove the staged gitlink and the
  `.git/modules/skills/<id>` directory.

## CI

`node scripts/verify.js --require-skills` fails when any configured skill is not
checked out, so CI must clone with submodules:

```bash
git submodule update --init --recursive
node scripts/ci.mjs
```
