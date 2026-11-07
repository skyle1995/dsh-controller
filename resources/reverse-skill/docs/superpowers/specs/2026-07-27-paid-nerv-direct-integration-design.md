# Wujin 2.0 付费 NERV 离线直连能力设计

## 目标

把 `lingbol088-spec/5.6-JAILBREAK-NERV-codex-instruct-5.6` 的离线直连能力加入现有 CDK 授权后的 Codex 一键配置：启用上游 `bridge.md`，供应其 28 个 Skill，并与现有 GPT-5.6 Instruct v5 指令共同生效。

## 固定上游

- Repository: `https://github.com/lingbol088-spec/5.6-JAILBREAK-NERV-codex-instruct-5.6.git`
- Branch: `main`
- Commit: `8fd1ffb069f7ada3e17b72c6e70bd003f2faeeb0`
- Bridge SHA-256: `4acd1798c9a60bfc91b8daacdf0be8a6337052e3486a2ec725d3d6a4b511894f`
- Skill count: `28`
- License evidence: pinned upstream `README.md` states `MIT`; the pinned tree has no standalone `LICENSE`, `COPYING`, or `NOTICE` file. The source record must preserve that fact instead of inventing stronger evidence.

## 范围

### 接入

1. 精确供应 pinned commit 的 `bridge.md`。
2. 精确供应 pinned commit 的 `skills/**`，包括 28 个 `SKILL.md` 及其相对脚本。
3. 生成逐文件 SHA-256 清单、来源记录和许可证声明记录。
4. 生成固定字节的组合指令文件：现有 v5 指令在前，NERV bridge 在后，中间使用稳定分隔标题。
5. Codex 付费配置把 `model_instructions_file` 指向组合指令文件。
6. Codex 的 Wujin managed block 增加 NERV 路由文件绝对路径，使 Skill 保留在付费 payload 内即可按需读取，无需覆盖 `%USERPROFILE%\.codex\skills`。

### 排除

- `proxy_relay.py`、`direct_setup.py`、`deploy.py`、`mcp_server.py`、工具下载器、图片、文档和启动脚本不进入离线直连资产。
- 不启动常驻 HTTP 代理，不修改 `base_url`、provider、API key 或 relay 配置。
- 不要求客户机安装 Python、pip、Node、WSL、Docker 或 Kali。
- 不执行上游 Skill 脚本；一键配置只供应文件和路由。
- 不修改免费 Skill bundle、免费 IPC、免费状态或当前 UI。

## 目录和边界

```text
assets/codex/nerv-break-5.6/
├── bridge.md
├── combined-instructions.md
├── ROUTING.md
├── SOURCE.json
├── FILE-MANIFEST.json
├── LICENSE-CLAIM.md
└── skills/
    └── <28 pinned upstream skill directories>
```

这些文件只通过现有 `reverse-skill.zip` 进入付费 payload；`free-skills.zip`、免费 catalog、免费 ownership state 和免费备份目录不得包含其路径、文件名、hash 或内容。

## Codex 配置与迁移

设新期望路径为部署后 `assets/codex/nerv-break-5.6/combined-instructions.md` 的规范化绝对路径。

- `model_instructions_file` 缺失：写入新路径。
- 已是新路径：幂等成功。
- 恰好指向 Wujin 旧版 pinned v5 路径：视为 Wujin-owned，自动迁移到新路径。
- 指向任意其他字符串：保持现有 conflict 行为，除非用户在现有修复流程中明确选择替换。
- 非字符串或无效 TOML：失败并回滚。
- 新组合文件、bridge、routing、source record、manifest 或任一 Skill hash 不匹配：失败并回滚。

现有 `AGENTS.md` 用户内容、Wujin managed block 唯一性、MCP 表、注释和无关 TOML 值必须保持。

## 数据流

```text
有效 CDK + 选择 Codex
  -> 部署并验证完整 paid payload
  -> CodexAdapter 校验 NERV 资产与组合指令 hash
  -> 合并 AGENTS.md 的 Wujin/NERV 绝对路由
  -> 迁移或写入 model_instructions_file
  -> 合并现有 MCP
  -> 原子提交并回读
  -> 成功；任一步失败则倒序恢复本次 Codex 写入
```

## 测试

1. 供应链测试锁定 repository、commit、bridge hash、28 个 Skill、逐文件 hash 和严格 allowlist。
2. 组合指令测试锁定 v5 与 bridge 的顺序、分隔符和最终 SHA-256。
3. Adapter 测试覆盖首次写入、幂等、旧 Wujin 路径迁移、外部路径冲突、显式替换、hash 错误和回滚。
4. managed block 测试验证 NERV routing 使用部署后的绝对路径且用户内容保留。
5. paid payload 测试证明新资产存在，free isolation 测试证明免费 bundle 不含任何 NERV marker。
6. 运行 `test-paid-codex-v5.ps1`、相关 `wujin-core` 测试、`license_compat` 和完整 `test-full-gate.ps1 -SkipReleaseBuild`。

## 验收标准

- 有效 CDK 的 Codex 一键配置一次完成 bridge、28 Skills 路由、v5 组合指令和现有 MCP 配置。
- 历史 Wujin v5 用户无手工冲突即可迁移。
- 用户自有 `model_instructions_file` 不被静默覆盖。
- 免费路径和其他客户端行为不变。
- 客户端继续保持离线、单 EXE、无新增运行时依赖。
