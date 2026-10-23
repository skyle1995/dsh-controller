# Wujin v1.30.1 强化环境配置设计

## 目标

在 Windows Rust/Tauri `1.30.1` 客户端中新增独立的“强化环境配置”页面。用户无需激活 CDK，只选择需要的 Skill，即可把随 EXE 内置的强化能力安装到本机已检测到的受支持 AI 客户端。

该功能是可选的免费基础能力，不改变付费 reverse-skill 的 CDK、完整 payload、一键配置、MCP、工具链或结果状态。

## 固定产品边界

- 页面名称固定为“强化环境配置”。
- 页面显示“无需激活 · 可选安装”，不使用“破解免费版”等表达。
- 用户只选择 Skill，不选择客户端。
- 程序自动检测并适配 EXE 当前支持的 Claude、Codex、Kiro、Cursor、Cline、Windsurf。
- 用户逐个勾选 Skill；页面提供全选、取消全选和“安装选中的强化能力”。
- 11 个 Skill 随 EXE 内置，安装时不访问 GitHub、官网或其他下载源。
- 免费安装不读取 CDK 状态，不激活产品，也不解锁付费流程。
- 免费安装不部署完整 reverse-skill，不配置 MCP，不下载或启动第三方工具。
- `configure_selected(ids)` 继续保持 CDK 后端门禁；免费安装使用独立命令、状态、日志和结果。

## 内置 Skill 清单与上游规则

| Skill ID | 首选上游 |
|---|---|
| `frontend-design` | `anthropics/skills` |
| `skill-creator` | `anthropics/skills` |
| `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill` |
| `brainstorming` | `obra/superpowers` |
| `ppt-generation` | `fangyuanopus/literature-report-ppt-builder` |
| `grill-me` | `mattpocock/skills` |
| `literature-review` | `K-Dense-AI/claude-scientific-skills` |
| `scholar-evaluation` | `K-Dense-AI/claude-scientific-skills` |
| `teach` | `mattpocock/skills` |
| `article-writing` | `affaan-m/everything-claude-code` |
| `creative-ideation` | `yogsoth-ai/creative-ideation` |

来源选择规则固定为：同名且确实提供 Agent Skill 的公开仓库中，选择 GitHub 收藏数最高、具有可再分发许可证且能通过结构校验的实现。如果收藏最高者不是 Agent Skill、缺少明确许可证或不能离线运行，则按收藏数顺延到下一名合格仓库。

发布时不得跟随远端 `main`。每个 Skill 必须记录仓库、上游目录、固定 commit、许可证、文件哈希和是否经过本地适配。缺少许可证、`SKILL.md` 或必要资源时，发布构建失败。

Skill 必须作为完整目录进入免费 bundle，包括实际存在的 `SKILL.md`、`agents/`、`scripts/`、`references/`、`assets/` 和许可证要求的归属文件；不能只复制 `SKILL.md`。不得打包上游 `.git`、测试缓存、示例生成物、私钥、token 或无关仓库文件。

## 资源与安装根目录

付费 payload 和免费 bundle 分开构建：

```text
reverse-skill.zip       付费完整 reverse-skill payload
free-skills.zip         11 个强化 Skill、catalog 和许可证
```

免费安装根目录固定为：

```text
%LOCALAPPDATA%\无限破甲\free-skills\
├─ catalog.json
├─ installed-state.json
└─ skills\<skill-id>\...
```

`catalog.json` 为构建期生成的严格清单，至少包含 `id`、显示名称、简介、分类、上游、commit、license、相对目录和 SHA-256。运行时只接受 catalog 中的 11 个 ID，不接受任意路径或前端提交的源目录。

`installed-state.json` 只记录 Wujin 管理的安装证据，包括 Skill ID、bundle 版本、源哈希、目标客户端、目标路径、备份路径、安装时间和回读结果。它不是授权文件，不能影响 CDK。

## 客户端适配策略

安装时自动重新检测全部受支持客户端，不沿用“选择 AI 客户端”页面的选择状态。

优先级固定为：

1. 客户端存在且已验证原生 Skill 目录时，把完整 Skill 目录安装到该客户端的原生目录。
2. 客户端没有稳定的原生 Skill 目录，但支持规则/steering 时，在 Wujin 免费根目录保留 Skill，并写入独立的免费路由文件或托管区块。
3. 客户端未安装、版本不支持或目标路径未经验证时，不猜测路径，返回 `unsupported`，不创建客户端配置目录。

免费路由和付费路由必须使用不同文件或标记：

```text
BEGIN/END WUJIN FREE SKILLS
BEGIN/END WUJIN REVERSE-SKILL
```

两种区块可以同时存在，更新其中一个不能改变另一个。免费流程不得写入 MCP 配置。

Codex 与 Claude 优先使用各自经过验证的原生 Skill 目录。Kiro、Cursor、Cline、Windsurf 必须通过版本化 adapter 和实机验证决定原生目录或兼容路由；未验证前只报告不支持。

## 写入、冲突与恢复

- 所有目录和路由写入都使用 staging、路径边界检查、备份、原子提交和回读验证。
- 目标同名目录不存在：正常安装。
- 目标由 Wujin 管理且源哈希相同：返回 `alreadyInstalled`，不重复写入。
- 目标由 Wujin 管理但版本不同：先备份，再升级并回读。
- 目标存在但不在 `installed-state.json` 中：返回 `conflict`，不得覆盖或合并未知内容。
- 单个 Skill 在单个客户端失败，只回滚该安装单元；其他已成功单元保留并报告。
- 用户取消安装时停止开始新的单元；正在提交的原子写入完成或回滚后结束。
- `1.30.1` 提供安装、升级和修复，不提供自动卸载；用户文件不会因取消勾选而被删除。

## 后端接口与状态隔离

新增命令：

```text
get_free_skill_catalog()
install_free_skills(skill_ids)
```

`install_free_skills` 的后端顺序固定为：校验 ID → 验证内嵌 bundle/catalog → 自动检测客户端 → 为每个 Skill/客户端建立安装单元 → staging/备份/提交/回读 → 汇总结果。

返回结果按 `Skill × 客户端` 展开，状态固定为：

```text
installed
alreadyInstalled
updated
unsupported
conflict
failed
rolledBack
```

免费流程使用独立 `freeSkillsBusy`、`free-skill-progress` 事件、结果集合和日志 phase。它不能复用或修改付费 `busy`、配置进度、`results`、激活状态和 CDK 缓存。

## 界面设计

左侧新增独立分类“环境强化”，其中只有“强化环境配置”入口。它始终可进入，不受客户端选择、CDK、付费配置结果或联网状态影响。

页面结构：

1. 页头：标题“强化环境配置”，说明“为已安装的 AI 客户端补充常用设计、研究、写作和学习能力”。
2. 状态条：徽标“无需激活 · 可选安装”，同时显示自动检测到的兼容客户端数量；用户不能在此选择客户端。
3. 工具条：全选、取消全选、已选择数量。
4. Skill 卡片网格：名称、简短用途、分类、安装状态和选择框；不显示 GitHub 技术细节。
5. 主操作：“安装选中的强化能力”；零选择时禁用并说明原因。
6. 进度区：当前 Skill、当前客户端、完成单元数和总单元数，支持取消。
7. 结果区：按 Skill 分组展示每个客户端的状态、目标路径、备份和错误摘要。

卡片分类固定为：

- 设计：`frontend-design`、`ui-ux-pro-max`
- 创意：`brainstorming`、`creative-ideation`、`grill-me`
- 内容与演示：`ppt-generation`、`article-writing`
- 研究：`literature-review`、`scholar-evaluation`
- 能力构建：`skill-creator`、`teach`

页面不出现 CDK 购买按钮、激活按钮或“解锁全部”提示。付费激活页也不把免费 Skill 安装状态当成激活成功。

## 测试与验收

- 未激活、CDK 过期、CDK 缓存损坏和完全无 CDK 时，免费 catalog 与安装命令都可用。
- 付费 `configure_selected` 在未激活时仍被 Rust 后端拒绝。
- 每个 catalog ID 都能在 bundle 中解析出完整目录并通过 `SKILL.md` frontmatter、路径、symlink 和哈希验证。
- 非 catalog ID、重复 ID、绝对路径、父目录逃逸、symlink 和篡改 bundle 被拒绝。
- 覆盖六种客户端：原生安装、兼容路由、未安装、版本不支持、用户同名冲突和 Wujin 管理升级。
- 免费/付费托管区块同时存在时，任一流程重复执行都保持幂等，另一流程内容和备份不变。
- UI 覆盖逐个选择、全选、取消全选、零选择、安装中禁用、取消、部分成功、冲突和重试。
- 发布扫描确认 `free-skills.zip` 不含 `.git`、私钥、token、构建缓存或上游无关文件，并生成独立 SBOM、许可证清单、字节数和 SHA-256。

## 不在本功能范围

- 不提供在线 Skill 商店、运行时 GitHub 下载或远端 catalog。
- 不允许用户导入任意 Skill ZIP 或自定义路径。
- 不为免费 Skill 安装第三方运行时、Python/npm 包、MCP 或外部工具。
- 不改变 CDK 格式、签发材料、激活缓存或付费版本规则。
- 不在 Windows `1.30.1` 中实现 macOS Skill 安装。
