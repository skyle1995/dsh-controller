# Codex 模型指令冲突一键修复设计

## 目标

将 Windows Rust/Tauri 客户端从 `1.30.1` 更新为 `1.30.2`，让遇到 `model_instructions_file conflict` 的付费 Codex 用户无需手工编辑 `%USERPROFILE%\.codex\config.toml`。软件在默认配置失败并完成回滚后，于“配置结果”页提供一个明确的“备份并替换后重试”按钮；只有用户点击该按钮时，后端才允许替换现有字符串值。

本设计由用户于 2026-07-24 批准采用最简单实现。用户随后明确撤销出包要求，本轮只实现功能并启动本地 debug 客户端供用户测试。它只修复 Codex 模型指令字符串冲突，不改变 CDK、免费 Skill、更新检查、其他客户端或上游 v5 资产。

## 已选方案

复用现有 `configure_selected` 调用和 `AtomicFileTransaction`，不增加新的 Tauri 命令、一次性令牌、持久化状态或复杂冲突状态机：

1. 普通一键配置继续使用保护模式。
2. 当 Codex 结果为 `rolled_back`，且消息精确包含 `model_instructions_file conflict` 时，结果页显示冲突说明和“备份并替换后重试”。
3. 点击按钮后，UI 重新调用 `configure_selected`，并传入布尔选项 `replaceCodexModelInstructions=true`。
4. Rust 后端重新执行现有 CDK、busy、payload、运行文件哈希和 TOML 校验，不信任 UI 提供的路径或文件内容。
5. 仅 Codex adapter 使用该选项；其他客户端保持原逻辑。
6. Codex adapter 读取当时最新的 `config.toml`，由现有事务备份文件，把顶层 `model_instructions_file` 替换为后端计算的精确部署路径，原子提交并回读验证。
7. 任一步失败时恢复事务中已经提交的 Codex 文件，并返回真实失败结果。

用户点击按钮本身就是本次覆盖确认，不再增加第二层确认弹窗。

## 接口变化

现有 UI 包装扩展为：

```ts
configureSelected(ids: string[], replaceCodexModelInstructions?: boolean)
```

Tauri 命令扩展为可选布尔参数，缺失时必须等价于 `false`。旧调用方和普通“一键配置”行为保持不变。

Core 使用显式配置选项把覆盖意图传到 `CodexAdapter`。覆盖选项不得改变 Claude、Kiro、Cursor、Cline 或 Windsurf adapter。

## 冲突和替换规则

- Key 缺失：普通模式写入目标值。
- Key 等于目标值：普通模式幂等成功。
- Key 是其他字符串：普通模式回滚并返回现有冲突消息；显式替换模式备份并替换。
- Key 不是字符串：继续作为无效配置拒绝，不显示一键替换按钮。
- TOML 无效：继续拒绝，不自动修复。
- v5 运行文件缺失或哈希不匹配：继续失败关闭。
- 配置文件在用户点击按钮前发生变化：后端始终重新读取并备份最新字节；不会使用首次失败时缓存的内容。

覆盖模式只替换顶层 `model_instructions_file`，保留注释、无关顶层键、用户 MCP 和现有 Wujin MCP。不得删除用户原指令文件，也不得记录其正文。

## UI 行为

“配置结果”页在精确 Codex 冲突时增加一个紧凑修复区：

- 标题：`Codex 已有模型指令配置`
- 说明：`无限破甲没有覆盖现有设置。点击后将先备份 Codex 配置，再替换模型指令并重新验证。`
- 次要操作：`保留当前配置`，不执行写入并返回“一键配置”页。
- 主要操作：`备份并替换后重试`，执行带覆盖选项的现有配置调用。

重试期间按钮禁用并显示 `正在修复`，防止重复调用。成功后刷新 bootstrap 状态并显示正常成功结果；失败后保留结果页和日志入口。非精确冲突、非 Codex 失败和空结果页不显示该按钮。

## 安全与事务边界

- 有效 CDK 仍是覆盖重试的必要条件，不能只靠 UI。
- UI 不能传入任意路径、TOML 内容、备份位置或目标文件。
- 后端只计算固定的已部署 v5 路径，并继续验证固定 SHA-256。
- 替换前必须由现有 `AtomicFileTransaction` 创建备份；备份失败则不得写入。
- 写入必须原子提交、TOML 回读并验证精确目标值及现有 MCP 表。
- 回滚日志可以记录配置目标和备份路径，但不得记录旧指令文件正文、CDK 或私钥。
- 免费 Skill 流程不得读取该布尔选项或 `model_instructions_file`。

## 版本与发布

- Rust/Tauri/UI/发布报告中的产品版本从 `1.30.1` 更新为 `1.30.2`。
- 旧 Python 客户端继续为 `1.1.0`。
- `1.x` CDK 兼容规则、产品 ID 和公钥保持不变。
- 完成专项测试、工作区测试、UI 测试、TypeScript、Vite 构建和非发布门禁后，启动本地 debug 客户端验证修复入口。
- 本轮发布门禁保持锁定：不得执行 `build-release.ps1`、`cargo build --release`、`cargo tauri build/bundle`、安装器、签名、发布 ZIP、网站清单或 EXE 上传。
- 自动化验证通过后只启动 `launcher-rs\target\debug\wujin-launcher.exe` 供用户测试；只有用户后续再次明确说“出包”才能进入发布流程。

## 测试要求

1. Core RED/GREEN 测试证明默认模式仍拒绝外部字符串并逐字节恢复文件。
2. Core 测试证明显式替换模式创建备份、写入精确 v5 路径、保留无关 TOML/MCP，并通过回读。
3. Core 测试证明非字符串、无效 TOML、缺失或损坏 v5 文件仍不会被强制覆盖。
4. Service/Tauri 测试证明缺省布尔值为 `false`，覆盖模式仍受 CDK 和 busy guard 保护。
5. UI 测试证明按钮只对精确 Codex 冲突显示，点击时传递 `true`，执行期间禁用，成功和失败状态可恢复。
6. 版本一致性测试证明所有 Rust/Tauri/UI 发布表面为 `1.30.2`，Python 保持 `1.1.0`。
7. 非发布完整门禁证明 debug 流程不修改 `dist-rust`，不产生安装器、签名文件、发布 ZIP、网站清单或客户 EXE。

## 不在范围内

- 合并两个模型指令文件或修改用户原指令文件。
- 自动修复任意 TOML 语法错误或非字符串值。
- 静默覆盖、启动时自动迁移或无用户点击的替换。
- 新增卸载、恢复备份 UI 或通用配置编辑器。
- 更改 v5 指令内容、上游 commit、哈希或许可证。
- 修改免费 Skill、自动更新下载、网站发布或上传发布物。

## 验收标准

在具有外部字符串 `model_instructions_file` 的 Codex 配置上，第一次普通配置必须继续安全回滚；用户点击“备份并替换后重试”后，软件必须自动备份最新 `config.toml`、写入固定 v5 路径、保留其他配置并回读成功。取消、非字符串、无效 TOML、备份失败、写入失败或回读失败时不得留下部分修改。所有版本表面为 `1.30.2`，非发布测试门禁通过，并启动本地 debug 客户端供用户验收；不得生成发布包。
