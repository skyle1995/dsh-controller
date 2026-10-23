# 六客户端冲突修复验证审计

- 日期：2026-07-27
- 分支：`codex/wujin-v2.0-windows`
- 设计：`639612a`
- 计划：`9992b69`
- 功能提交：`95810db`、`5e29976`、`95df51f`、`5d34ab7`

## 实现范围

- Claude、Codex、Kiro、Cursor、Cline、Windsurf 统一返回结构化冲突：`kind`、`target`、`keys`、`repairable`。
- MCP 修复授权按客户端 ID 精确生效；重复、未知、未选择的修复 ID 在部署及文件写入前被拒绝。
- Claude、Kiro、Cursor、Cline、Windsurf 在规则文件写入前预检 JSON MCP 冲突。默认保护原文件；确认后只替换 `anything-analyzer`、`idapro`、`burpsuite`，保留其他顶层字段和 MCP。
- Codex TOML 一次报告全部未授权冲突；MCP 修复与 `model_instructions_file` 修复互不扩大权限，并保留注释、无关表和无关 MCP。
- 修复写入继续使用原子事务、备份和读回校验；冲突日志仅包含客户端、类型、目标和键名，不记录原 MCP 值。
- Tauri `configure_selected` 新增可选 `repair_mcp_client_ids`，对应前端 camelCase `repairMcpClientIds`；省略时保持保护模式。
- 本任务的四个功能提交未包含 `launcher-rs/ui/**`；完整门禁使用了相邻界面任务在共享工作树中的 IPC 对接修改。

## 专项验证

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `cargo fmt --all -- --check` | 0 | 格式通过 |
| `cargo clippy --workspace --all-targets -- -D warnings` | 0 | 零 warning |
| `cargo test -p wujin-core --test client_adapters -- --nocapture` | 0 | 31 passed |
| `cargo test -p wujin-core --test one_click_deploy -- --nocapture` | 0 | 3 passed |
| `cargo test -p wujin-core --test models_contract -- --nocapture` | 0 | 4 passed |
| `cargo test -p wujin-launcher -- --nocapture`，独立 `CARGO_TARGET_DIR` | 0 | 21 + 9 + 3 passed |
| `cargo test -p wujin-core --test license_compat -- --nocapture`，设置生产 secrets 路径 | 0 | 11 passed；未打印 CDK 值 |
| `node --test ui/tests/codex-conflict-repair.test.js`，使用 Codex bundled Node | 0 | 2 passed |
| `git diff --check` | 0 | 无 whitespace error |

## 行为证据

- `json_clients_offer_scoped_mcp_conflict_repair` 表驱动覆盖五个 JSON 客户端：未授权时 MCP 原字节不变且规则文件不存在；授权后备份字节等于原文件，无关配置保留，三个 Wujin MCP 完成读回。
- `codex_mcp_and_model_repairs_are_independent` 与 `codex_model_repair_does_not_authorize_mcp_replacement` 证明 Codex 两类修复权限独立，未批准的冲突阻止所有用户目标写入。
- `repair_authorization_is_scoped_to_one_selected_client` 同批选择 Claude 与 Kiro，只授权 Claude：Claude 成功并生成原字节备份，Kiro 保持 `rolled_back` 且文件不变。
- `command_repair_request_is_scoped_and_validated` 覆盖命令层允许列表、重复 ID、未知 ID 和未选择 ID。
- `configuration_conflict_uses_stable_camel_case_contract` 固定 IPC 序列化契约。

## 完整门禁

使用独立 Cargo target，避开相邻界面 Debug EXE：

```powershell
$env:WUJIN_RELEASE_SECRETS = 'G:\AI\520reverse-skill\Wujin-release-secrets'
$env:CARGO_TARGET_DIR = 'G:\AI\520reverse-skill\.worktrees\wujin-v2.0-windows\launcher-rs\target\conflict-repair-full-gate'
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
```

最终退出码：`0`

- Free Skills bundle、GPT-5.6 Instruct v5 与 NERV 离线直连供应链及免费隔离：通过。
- Python legacy：76 passed，20 subtests passed。
- Rust workspace：180 passed，0 failed；format 与 clippy 通过。
- UI：106 passed，0 failed，其中六客户端结构化冲突修复 IPC/入口专项 2 passed。
- TypeScript typecheck：通过。
- Vite production frontend build：64 modules transformed，通过。
- 临时 `free-skills-full-gate-*.zip` 已由门禁清理。

## 范围审计

- 四个功能提交路径仅包含 `wujin-core` 与 `src-tauri/src/commands.rs`，没有 `launcher-rs/ui/**`。
- 相邻任务的 UI、链接配置和服务端工作树修改保持未暂存，未纳入本任务提交。
- 完整门禁使用 `-SkipReleaseBuild`，未构建正式发布包。

**LOCAL DEVELOPMENT VERIFICATION; NO RELEASE PACKAGE BUILT**
