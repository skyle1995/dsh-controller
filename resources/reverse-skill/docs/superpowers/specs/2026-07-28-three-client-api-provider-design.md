# Claude、Codex、Cursor API Provider 中心设计

> **2.0.0 发布范围以 [`2026-07-28-provider-center-v2-release-scope.md`](./2026-07-28-provider-center-v2-release-scope.md) 为准。** 本文保留为后续三客户端完整形态设计，不再作为 2.0.0 首发阻断条件。

## 目标与范围

在无限破甲 2.0 内原生实现类似 CC Switch 的 API Provider 管理体验，首版只覆盖 Claude、Codex、Cursor：导入当前配置、保存多个 Provider、编辑、删除、一键启用、连接测速、默认模型、操作备份和恢复。功能与现有 MCP/NERV 一键配置共享写入纪律，但保持独立页面、状态和命令。

参考项目为 MIT 许可的 `farion1231/cc-switch`。本项目只复刻 Provider/Profile、导入、切换、测速和恢复的产品能力与交互，不复制第三方源码、预设供应商数据、推广内容、本地代理或 OAuth 流程。

## 已确认的客户端边界

### Claude

目标文件：`%USERPROFILE%\.claude\settings.json`。

- Base URL：`env.ANTHROPIC_BASE_URL`
- Key：`env.ANTHROPIC_AUTH_TOKEN` 或 `env.ANTHROPIC_API_KEY`
- 默认模型：`env.ANTHROPIC_MODEL`

内部保存 `authMode=authToken|apiKey`，避免把两种不同请求头语义合并。导入时保留实际模式；新建时由协议模板决定。

### Codex

目标文件：`%USERPROFILE%\.codex\config.toml` 和 `%USERPROFILE%\.codex\auth.json`。

- `model`
- `model_provider`
- `[model_providers.<stable_id>]` 中的 `name/base_url/wire_api/requires_openai_auth`
- Key：`auth.json.OPENAI_API_KEY`

TOML 表名使用后端生成的稳定 ID，例如 `wujin_a1b2c3d4`，不使用用户输入名称。编辑必须保留注释、MCP 表、指令文件配置和其他用户字段。

### Cursor

CC Switch 当前没有 Cursor adapter，Cursor 也没有跨版本稳定的公开 Provider 配置文件契约。因此 Cursor 采用显式 capability adapter：

1. 检测安装版本和可识别配置入口。
2. 只有版本适配器通过“读取、构造、解析、隔离 fixture 回读”验证后才开放导入和启用。
3. 未匹配版本仍可保存 Provider 和执行独立连接测试，但启用返回 `unsupported_version`，零文件写入，界面不报告成功。
4. Cursor 首个可写适配器必须以真实版本样本和集成测试单独通过验收；不通过修改通用 VS Code 环境变量冒充 Cursor Provider 已生效。

这保证首版页面覆盖三个客户端，同时把 Cursor 的真实写入能力绑定到可证明的版本契约。

## 页面与交互

侧边栏“配置API”从禁用占位改为真实 `providers` 页面。页面结构：

1. 顶部客户端标签：Claude、Codex、Cursor，显示检测和 capability 状态。
2. 左侧 Provider 列表：名称、Base URL 主机、模型、当前启用标识、最近测速结果。
3. 右侧编辑面板：Provider 名称、协议、Base URL、API Key、默认模型和客户端特有选项。
4. 顶部动作：`导入当前配置`、`新建 Provider`。
5. 表单动作：`保存`、`测试连接`、`设为当前`、`删除`。
6. 最近一次切换失败或成功后提供按 `operationId` 绑定的 `恢复切换前配置`。

API Key 始终使用密码框。已保存时只显示“已安全保存”，不显示尾号、长度或可复制明文。留空保存表示保留旧 Key；显式“移除 Key”使用独立确认动作。

## 领域模型与存储

Provider 元数据保存到：

`%LOCALAPPDATA%\无限破甲\providers\profiles.json`

最小模型：

```text
ProviderProfile {
  id, revision, clientId, name, protocol,
  baseUrl, defaultModel, authMode,
  secretRef, extraConfig, createdAt, updatedAt
}
```

- `profiles.json` 是 Provider 元数据事实源，不含 Key。
- Key 由 Windows DPAPI 加密保存到 `providers\secrets\<profile-id>.dpapi`。
- 当前启用关系保存为 `activeByClient: clientId -> providerId`，只在所有客户端文件写入并回读成功后更新。
- Profile 更新使用 `expectedRevision` 乐观并发，防止旧页面覆盖新状态。
- 导出默认排除 Key；首版不提供含密钥导出。

## 核心与平台边界

新增 `wujin-core::providers`：

- 纯领域模型、输入校验、Provider store、连接测试协议和客户端 adapter trait。
- Claude/Codex 配置解析与保留式变换。
- Cursor capability 探测契约。

新增 `wujin-windows::secret_store`：

- 从现有设备身份 DPAPI 实现抽取通用保护/解密能力。
- 原子写入、大小上限、损坏密文拒绝、临时缓冲清零。

新增 `src-tauri/provider_commands.rs`，只暴露：

```text
get_provider_state
import_current_provider
save_provider_profile
delete_provider_profile
enable_provider_profile
test_provider_connection
restore_provider_operation
```

所有序列化输出只返回 `keyState=missing|present`，不返回 Key。恢复命令只接受后端生成的 `operationId`，不接受任意文件路径。

## 写入事务与恢复

Provider 启用与现有一键配置共享 `configuration_write_lock`，避免同时修改 `.codex\config.toml` 等文件。

一次启用采用操作级事务：

1. 校验 Profile、revision、客户端 capability、Base URL 和 Key 状态。
2. 读取全部目标文件，记录原始 SHA-256。
3. 在内存中构造全部新内容，并用对应 JSON/TOML 解析器验证。
4. 敏感目标的原文件整份 DPAPI 加密后备份；非敏感目标使用现有原子事务。
5. 逐文件临时写入、原子替换、重新解析和字段回读。
6. 全部成功后更新 `activeByClient` 并写操作记录。
7. 任一步失败，按相反顺序恢复所有已提交文件；恢复错误返回 `rollback_failed` 和具体目标。

Claude `settings.json` 与 Codex `auth.json` 可能包含密钥，禁止复制到现有明文备份目录。操作记录只保存目标、密文备份引用、原始哈希、提交哈希和状态。

## 连接测试

- Base URL 统一正规化，拒绝 userinfo、query 和 fragment。
- 正式构建默认只允许 HTTPS；开发构建可显式测试 loopback HTTP fixture。
- 禁止自动重定向，限制 DNS、连接、总超时和响应体大小。
- Claude 按 `authMode` 请求 `/v1/models`。
- Codex/OpenAI-compatible 请求正规化后的 `/models`，使用 Bearer Key。
- Cursor Provider 使用其协议字段对应的 Claude 或 OpenAI-compatible 探测；连接成功不等于 Cursor 本地启用成功。
- 返回 `latencyMs`、归一化状态和可选模型是否存在；日志只记录主机和状态。
- 错误分类固定为 `dns/tls/timeout/auth/not_found/rate_limited/model_missing/protocol/server`。

## 错误与脱敏

- Key 不进入 UI state、Bootstrap、运行日志、panic、错误字符串、提交、测试快照或普通备份。
- 服务端响应只截取归一化错误类型，不记录完整响应体。
- 导入当前配置时，后端直接把发现的 Key 转存 DPAPI，WebView 只收到 `keyState=present`。
- Base URL 日志只保留 scheme、host 和显式端口，不记录 userinfo、query、fragment。
- Profile 文件损坏时停止写入并保留原字节；不使用空默认值覆盖。

## 增量交付顺序

1. Provider 模型、无密钥元数据 store、DPAPI secret store。
2. Claude 导入、保存、启用、回滚和连接测试纵向切片。
3. Codex 双文件联合事务纵向切片。
4. Cursor capability 探测与真实版本适配器验证。
5. 三客户端统一页面、操作历史和恢复动作。

每个切片均采用 RED → GREEN → 全量验证 → 原子提交；未完成的客户端通过 capability 明确锁定，不暴露假成功路径。

## 测试与验收

### 存储与脱敏

- DPAPI 文件和元数据不含 sentinel Key 明文。
- 损坏密文、旧 revision 和损坏元数据不覆盖现有状态。
- 所有 IPC 序列化、日志和错误不含 Key。

### Claude

- 导入识别两种 Key 字段和 authMode。
- 启用保留未知 JSON 字段。
- 写入或回读失败时原字节恢复，备份为密文。

### Codex

- 导入联合解析 provider 表、模型和 `auth.json`。
- 启用保留 TOML 注释、MCP、指令与无关设置。
- 第二个文件失败时恢复第一个文件和 active 状态。

### Cursor

- 未匹配版本返回 `unsupported_version` 且零写入。
- 匹配版本必须以脱敏真实 fixture 证明导入、启用和读回。
- Provider 连接测试与本地启用结果分别展示。

### UI 与集成

- 侧边栏入口真实可用，页面覆盖三客户端。
- Key 留空保存保留旧值；重复点击只触发一次 IPC。
- 成功、认证失败、配置冲突、完整回滚和回滚失败均有确定状态。
- UI、TypeScript、Vite、Rust workspace、Tauri command 和脱敏扫描门禁通过。

## 非目标

- 首版不覆盖 Gemini、OpenCode、Claude Desktop、Grok、OpenClaw 或 Hermes Agent。
- 不引入本地 HTTP 代理、协议转换、故障转移、熔断、请求内容记录或用量脚本。
- 不复制 CC Switch Provider 预设、推广链接或明文 SQLite 密钥模型。
- 不更新官网、线上 manifest 或正式发布物。
