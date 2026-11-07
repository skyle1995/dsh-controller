# 六客户端配置冲突修复设计

## 目标

为 Claude、Codex、Kiro、Cursor、Cline、Windsurf 提供一致的显式 MCP 冲突修复流程，同时保留首次配置的保护模式、Codex 独立的 `model_instructions_file` 修复开关、原子备份、回读验证和失败恢复。

本设计只修改 Rust 核心、Tauri 命令契约和相应测试，不修改 `launcher-rs/ui/**`。界面任务通过本设计定义的输入和返回字段完成确认交互。

## 行为流程

### 首次配置

1. 读取目标客户端的规则文件和 MCP 配置。
2. 计算 Wujin 需要管理的三个 MCP 条目：`anything-analyzer`、`idapro`、`burpsuite`。
3. 若现有同名条目与期望值不同，且不属于可自动迁移的旧 Wujin `burpsuite` 路径，则停止该客户端写入。
4. 返回 `rolled_back` 结果及结构化冲突信息；配置文件和规则文件保持原字节。
5. 未冲突客户端仍按原有顺序独立配置，不受其他客户端冲突影响。

### 用户确认修复

1. 界面只提交需要修复的客户端 ID，不使用作用于全部已选客户端的全局覆盖开关。
2. 后端验证修复 ID 无重复、属于六个已知客户端，并且同时存在于本次 `ids` 中。
3. 对获准修复的客户端，先由 `AtomicFileTransaction` 备份目标 MCP 文件。
4. 只替换三个 Wujin 同名 MCP 条目，保留其他 MCP、顶层 JSON/TOML 字段和 Codex TOML 注释。
5. 写入后重新解析并逐项回读三个 MCP 条目。
6. 写入或回读失败时恢复原文件；成功时在 `FileResult.backup` 中返回备份路径。

## 后端契约

### 命令输入

Tauri 命令 `configure_selected` 新增：

```rust
repair_mcp_client_ids: Option<Vec<String>>
```

现有参数继续保留：

```rust
replace_codex_model_instructions: Option<bool>
```

两者相互独立。MCP 修复授权只作用于 `repair_mcp_client_ids` 中列出的客户端；Codex 指令文件只在现有布尔值为 `true` 时替换。

服务层使用两个层级的选项：

```rust
pub struct ConfigurationRepairOptions {
    pub repair_mcp_client_ids: BTreeSet<String>,
    pub replace_codex_model_instructions: bool,
}

pub struct ClientConfigurationOptions {
    pub replace_mcp_conflicts: bool,
    pub replace_codex_model_instructions: bool,
}
```

`ClientRegistry` 根据当前 adapter 的 `client_id` 生成客户端局部选项，防止一次确认扩大到其他客户端。

### 命令输出

`ClientResult` 新增：

```rust
pub conflicts: Vec<ConfigurationConflict>
```

结构定义：

```rust
pub struct ConfigurationConflict {
    pub kind: ConfigurationConflictKind,
    pub target: PathBuf,
    pub keys: Vec<String>,
    pub repairable: bool,
}

pub enum ConfigurationConflictKind {
    Mcp,
    ModelInstructions,
}
```

序列化采用现有 camelCase 结构；枚举值为 `mcp` 和 `model_instructions`。普通成功、失败和不支持结果返回空数组。

MCP 冲突一次返回全部冲突名称，并按 `anything-analyzer`、`idapro`、`burpsuite` 的固定顺序输出，界面无需解析错误文本。

## 适配器实现

### JSON 客户端

Claude、Kiro、Cursor、Cline、Windsurf 共用 `configure_json`：

- 保护模式调用冲突收集器，发现冲突后在任何文件写入前返回结构化结果。
- 修复模式允许覆盖冲突的三个同名条目。
- `mcpServers` 不是对象、JSON 无效或根节点不是对象时仍按不可修复输入错误处理，不用修复模式覆盖整个用户容器。
- 可自动识别的旧 Wujin `burpsuite` bridge 路径继续原地迁移，不要求用户确认。

### Codex

Codex 使用同一语义处理 TOML：

- `mcp_servers` 中三个同名表的冲突受 `replace_mcp_conflicts` 控制。
- 外部 `model_instructions_file` 仍受 `replace_codex_model_instructions` 单独控制。
- MCP 修复不会顺带替换外部指令文件；指令修复也不会顺带替换 MCP 条目。
- `mcp_servers` 不是 TOML table、配置无法解析或指令字段不是字符串时保持不可修复错误。
- 原有 TOML 注释装饰、无关表和无关 MCP server 保持不变。

## 数据与错误边界

- 修复请求不接受未选中的客户端 ID、未知 ID 或重复 ID。
- 每个客户端独立提交；一个客户端冲突或修复失败不撤销其他客户端已经成功的事务。
- 冲突检测不创建备份，因为没有发生写入。
- 用户确认修复后，即使最终内容与期望值相同，也必须通过真实读回验证后才返回成功。
- 日志不记录用户原有 MCP 值，只记录客户端、目标路径、冲突名称、备份路径和最终状态。
- CDK 校验、payload 部署、免费 Skill 安装、更新服务和非 MCP 配置规则不改变。

## 测试策略

1. 表驱动覆盖六个客户端：默认配置遇到 MCP 冲突时返回 `rolled_back`、结构化冲突、原文件字节不变。
2. 表驱动覆盖六个客户端：只授权当前客户端后修复成功，三个期望条目回读一致，其他 MCP 和顶层字段保留，备份内容等于原文件。
3. 验证修复 ID 的未知、重复和未选择输入在 payload/adapter 写入前被拒绝。
4. 验证一个获准修复客户端不会授权同批次中的另一个冲突客户端。
5. Codex 分别覆盖仅 MCP 修复、仅指令修复、两类冲突同时存在的两阶段确认。
6. 验证 JSON/TOML 非法结构在修复模式下仍保持原文件。
7. 更新序列化契约、Tauri 命令请求契约、一键部署和全量门禁测试。

## 验收条件

- 六个客户端均具备“保护检测 → 显示冲突 → 指定客户端确认 → 备份并替换 → 回读验证”的完整后台流程。
- 默认调用不覆盖任何用户拥有的同名 MCP 配置。
- 修复调用不修改未明确授权的客户端或无关配置。
- Codex 现有指令冲突修复能力无回归。
- `cargo fmt`、workspace clippy、workspace tests、Tauri command tests、UI 契约测试和 Vite 构建通过。
