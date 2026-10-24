# redteam-skill

红队技能包仓库源。控制器安装时从本目录拉取全部 `*.md` 子技能，
生成统一入口 `~/.dsh/skills/redteam-skill/SKILL.md`（入口含子技能索引）。

- 子技能文件：直接放在本目录（frontmatter: name/description）
- 版本：`package.json` 的 `version`，控制器据此显示「可更新」
- 与破甲插件内的 `dsh-purge-self/skills/redteam/` 同源；插件侧保留一份用于面板展示
