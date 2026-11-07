# Provider Center 2.0 发布范围

## 状态

本文件是 `2.0.0 首发范围`的最终合同。原三客户端设计仍作为后续演进资料；与本文件冲突时，以本文件为准。

## 首发能力

- 客户端只覆盖 Claude、Codex。
- 支持保存多个 Provider Profile、编辑、删除，以及保存后应用到目标客户端。
- Tauri IPC 固定为：
  - `list_provider_profiles`
  - `save_provider_profile`
  - `delete_provider_profile`
  - `apply_provider_profile`
- API Key 只进入 Rust 后端阻塞任务，由 Windows DPAPI 加密保存；列表、UI 状态、日志、错误和普通元数据只暴露 `keyState`。
- Claude 单文件与 Codex 双文件写入均执行同目录暂存、原子替换、回读验证和失败恢复，并与一键配置共享写锁。

## 后续增量

- Cursor Provider capability adapter 放入后续版本，匹配真实版本 fixture 后再开放。
- 导入当前配置、独立连接测速和按 operation ID 恢复放入后续版本。
- 2.0.0 的官网与发布文案不宣传上述后续能力。

## 2.0 验收

- Claude/Codex Profile 保存、留空保留旧 Key、应用、删除和重复点击门禁通过。
- Codex 双文件第二步失败时恢复第一步；配置目录 junction 在写入前被拒绝。
- 元数据、密文、错误、IPC 与 UI 不回显 API Key。
- Rust workspace、UI、TypeScript、Vite 和非发布完整门禁通过。
