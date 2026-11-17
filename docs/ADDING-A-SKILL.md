# 新增技能

技能以 submodule 形式放在 `skills/` 下。只要 `skills/<id>/SKILL.md` 存在且带 Agent Skills
frontmatter（`name`、`description`），该技能就会被宿主发现。

## 一条命令

```bash
npm run add-skill -- https://github.com/owner/repo.git --id my-skill
```

脚本会：

1. 推导或接受 kebab-case id（`--id`）、分支（`--branch`）、标题
   （`--title-en/--title-zh`）、描述（`--description-en/--description-zh`）；
2. 执行 `git submodule add -b <branch> <url> skills/<id>`（已存在则更新）；
3. 读取 `skills/<id>/SKILL.md` 的 frontmatter；
4. 在 `plugin.config.json` 的 `skills[]` 中追加或更新条目；
5. 重新生成宿主清单并运行仓库校验。

脚本会打印技能的 frontmatter 名称。标题和描述默认取 frontmatter 描述，建议之后编辑
`plugin.config.json` 打磨中英文文案。检查后提交：

```bash
git add .gitmodules plugin.config.json skills
git commit -m "feat: add my-skill"
```

## 手动步骤

```bash
git submodule add -b main https://github.com/owner/repo.git skills/my-skill
```

在 `plugin.config.json` 中追加：

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

然后：

```bash
npm run sync
npm run verify
```

## 约束与常见问题

- id 必须是 kebab-case，且与目录名一致：`skills/<id>`。
- frontmatter 的 `name` 可以与 id 不同；不同时校验器会给出 warning。
- 一个 submodule 对应一个技能。若一个仓库里有多个技能目录，需要为每个技能各建一个
  submodule 条目（URL 指向同一仓库，路径指向不同技能目录）。
- submodule 由 gitlink 固定版本。升级上游：

  ```bash
  git submodule update --remote -- skills/my-skill
  git add skills/my-skill && git commit -m "chore: bump my-skill"
  ```

- 删除技能：`git submodule deinit -f skills/<id>`，从 `plugin.config.json` 删除条目，
  执行 `npm run sync`，再移除 gitlink 与 `.git/modules/skills/<id>`。

## CI

`node scripts/verify.js --require-skills` 会在任一配置技能未检出时失败，因此 CI 必须先：

```bash
git submodule update --init --recursive
node scripts/ci.mjs
```
