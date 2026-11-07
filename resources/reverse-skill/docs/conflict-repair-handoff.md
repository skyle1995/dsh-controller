# Conflict repair handoff

已实现并验证：
- wujin_core::models::ClientResult 新增 conflicts: Vec<ConflictDescriptor>（serde default）。
- JSON adapter（Claude/VersionGated 六客户端）先生成 existing/desired 指纹，普通配置冲突回滚并返回列表；repair_conflicts=true 才允许 managed MCP 覆盖。
- Codex TOML 同样支持 repair_conflicts=true，并保留 model instructions 强制替换。
- Tauri repair_conflicts IPC（已注册 main.rs）要求付费授权，独立于普通配置，原子备份后执行并更新结果/进度。
- wujin-core 全量测试通过；wujin-launcher cargo check 通过。

注意：提交 232a3ea 已包含 clients/mod.rs 与 commands.rs 主要内容；当前 commands.rs 还有 join-error 后 busy 清理修复未提交。未提交修改还包括 models.rs、claude.rs、codex.rs、version_gated.rs、main.rs。请保留并合并。

Commit: a9bfd4a
