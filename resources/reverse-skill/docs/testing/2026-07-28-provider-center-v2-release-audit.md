# Provider Center 2.0 发布验收

## 发布范围

- 首发客户端：Claude、Codex。
- 首发操作：列表、保存、删除、应用。
- Cursor、导入、测速与 operation restore 顺延到后续版本。
- 范围合同：`docs/superpowers/specs/2026-07-28-provider-center-v2-release-scope.md`。

## 已验证行为

- Profile 元数据不包含 API Key；Key 由 Windows DPAPI 文件保存。
- 留空保存保留现有 Key，旧 revision 被拒绝。
- Claude 配置保留未知 JSON 字段；Codex 配置保留注释、MCP 与无关 Provider table。
- Codex 双文件写入任一步失败时执行反向恢复；配置目录 junction 在写入前被拒绝。
- UI 只提供密码输入框，重复点击在原生写入完成前只触发一次 IPC。
- 保存并应用后展示后端回读验证结果；删除使用 revision guard。

## 自动化证据

```powershell
cargo test -p wujin-core --test provider_store --test provider_claude --test provider_codex
cargo test -p wujin-windows --test provider_service --test secret_store
node node_modules/tsx/dist/cli.mjs --test tests/provider-profiles-dom.test.tsx
node --test tests/provider-api-ui.test.js
```

专项结果：Rust Provider/DPAPI 测试与 UI Provider 合同、DOM 流程全部通过。最终发布结论以同一 HEAD 的 `test-full-gate.ps1 -SkipReleaseBuild` 为准。
