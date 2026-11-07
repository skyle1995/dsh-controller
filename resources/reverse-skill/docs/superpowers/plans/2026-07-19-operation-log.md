# 一键配置文件操作日志 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Rust/Tauri 一键配置期间记录真实阶段和文件操作，并在运行日志页显示。

**Architecture:** 扩展 Tauri `LogEntry` 的可选结构化字段；`configure_selected` 在阶段回调和 `ClientResult` 返回后生成日志；React 日志页渲染阶段、操作、客户端、目标路径和状态。核心事务与配置文件格式不变。

**Tech Stack:** Rust、Serde、Tauri IPC、React/TypeScript、Node test runner。

## Global Constraints

- 不记录 CDK 内容、私钥或用户文件内容。
- 不改变部署、备份、写入、回读和回滚顺序。
- 不新增安装器或打包流程。
- 保持现有 camelCase IPC 字段和中文 UI 交互。

---

### Task 1: 为结构化日志写失败测试

**Files:**
- Modify: `launcher-rs/src-tauri/src/commands.rs`
- Modify: `launcher-rs/ui/tests/python-parity.test.js`

- [ ] 添加 Rust 单测，要求 `LogEntry` 序列化包含 `phase`、`operation`、`clientId`、`target`、`status`。
- [ ] 添加 Rust 单测，给定成功 `ClientResult` 时生成规则文件和 MCP 文件的 file log。
- [ ] 添加 Rust 单测，给定回滚 `ClientResult` 时生成 restore log。
- [ ] 添加 UI 回归测试，要求 `LogsPage` 源码渲染目标路径、操作和状态字段。
- [ ] 运行 `cargo test -p wujin-launcher commands::tests` 和 `npm.cmd test`，确认新测试先失败。

### Task 2: 实现后端阶段和文件日志

**Files:**
- Modify: `launcher-rs/src-tauri/src/commands.rs`
- Modify: `launcher-rs/src-tauri/src/state.rs`

- [ ] 扩展 `LogEntry`：增加 `phase`、`operation`、`client_id`、`target`、`status`，并保持 `#[serde(rename_all = "camelCase")]`。
- [ ] 添加纯函数 `file_log_entries(client, role, file_result)` 和 `result_log_entries(result)`，只读取 `FileResult`/`ClientResult` 证据字段。
- [ ] 在配置开始、进度回调、错误返回和最终完成分支写入阶段日志。
- [ ] 在结果分支为规则文件、MCP 文件及 restored 路径写入日志。
- [ ] 确保日志锁失败或日志构造异常不会改变配置结果。
- [ ] 运行 Rust 新增单测，确认失败测试变绿。

### Task 3: 实现日志页展示

**Files:**
- Modify: `launcher-rs/ui/src/api.ts`
- Modify: `launcher-rs/ui/src/pages/LogsPage.tsx`
- Modify: `launcher-rs/ui/src/styles/app.css`

- [ ] 同步 `LogEntry` TypeScript 类型的可选结构化字段。
- [ ] 在每条日志中展示时间、级别、阶段/操作、客户端、目标路径和消息。
- [ ] 对目标路径使用可换行样式，避免 Windows 长路径撑破布局。
- [ ] 保持无日志时的“暂无日志”状态和现有颜色等级。
- [ ] 运行 UI 回归和 TypeScript 检查。

### Task 4: 集成验证与文档

**Files:**
- Modify: `docs/testing/2026-07-19-rust-release-test-audit.md`

- [ ] 运行 `cargo fmt --all -- --check`。
- [ ] 运行 `cargo clippy --workspace --all-targets -- -D warnings`。
- [ ] 运行 `cargo test --workspace --all-targets`。
- [ ] 运行 `npm.cmd test`、`npm.cmd exec -- tsc --noEmit` 和 `npm.cmd run build`。
- [ ] 更新测试报告，记录日志字段、文件级回读和回滚验证。
