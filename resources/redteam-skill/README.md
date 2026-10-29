# redteam-skill

红队技能包仓库源。技能按 **kill-chain 分类子目录**存放,控制器安装时递归拉取全部 `.md` 子技能,
生成统一入口 `~/.dsh/skills/redteam-skill/SKILL.md`(入口含子技能索引与分类)。

## 目录结构

| 分类 | 说明 | 内容 |
|---|---|---|
| `recon/` | 侦察 | passive/active 扫描、FOFA、指纹、管线、资产关联 |
| `vuln-scan/` | 漏洞发现 | nuclei、目录爆破、未授权、2023-2025 与 2026 漏洞包 |
| `exploit/` | 打点与利用 | 凭据攻击、免杀对抗、鱼叉投递、提权、浏览器自动化、工具大全 |
| `internal/` | 内网横向 | 横向、AD 域、内网扫描器、云容器、Shell/WebShell、C2、数据外带 |
| `tunnel/` | 隧道代理 | chisel/frp/suo5、代理池、VPS 反弹 |
| `plan/` | 管理交付 | 环境搭建、匿名化基建、报告复盘 |

## 约定

- 子技能文件:放进对应分类目录(frontmatter: name/description/whenToUse/role/enabled)
- `README.md` / `INDEX.md` / `CONTRIBUTING.md` 会被安装逻辑自动过滤,不会当技能
- 版本:`package.json` 的 `version`,控制器据此显示「可更新」
- 破甲插件内的 `dsh-purge-self/skills/redteam/`(平铺)是离线回退副本,与本目录同步维护
