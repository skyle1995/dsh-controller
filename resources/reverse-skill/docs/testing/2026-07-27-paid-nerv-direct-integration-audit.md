# 付费 NERV 离线直连接入验证审计

- 日期：2026-07-27
- 分支：`codex/wujin-v2.0-windows`
- 基线：`86c9400`
- 验证终点：`586866b`

## 接入范围

- 上游：`https://github.com/lingbol088-spec/5.6-JAILBREAK-NERV-codex-instruct-5.6.git`
- 固定提交：`8fd1ffb069f7ada3e17b72c6e70bd003f2faeeb0`
- 模式：付费 CDK 门控、Codex 离线直连、单 EXE、无新增运行时依赖
- 资产：`bridge.md`、28 个 Skill 目录、66 个 `skills/**` 文件、67 条固定 manifest 记录
- Codex 指令：现有 GPT-5.6 Instruct v5 与 NERV bridge 的确定性组合文件
- 本任务提交范围未包含 `launcher-rs/ui/**`；界面修改由相邻任务维护

## 固定哈希

| 资产 | SHA-256 |
|---|---|
| `bridge.md` | `4acd1798c9a60bfc91b8daacdf0be8a6337052e3486a2ec725d3d6a4b511894f` |
| `combined-instructions.md` | `6670571d9ac9f331c53301616fb68a81ba3c4be9c3c3e7c9ae4ea32b13369bec` |
| `FILE-MANIFEST.json` | `7b34bc74d671c56e57922ef83b9f8d53158d783b522feb417a1c84358c166a27` |
| `ROUTING.md` | `f14e48c8a97ae063b4010b05b4f91e3ce2a8a0f4f34b931e3eaa98ec011dcd40` |

## 专项验证

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `cargo test -p wujin-core --test release_contracts -- --nocapture` | 0 | 3 passed |
| `test-paid-nerv-direct.ps1 -RequireFreeIsolation`，使用 `wujin-free-skills-nerv-test.zip` | 0 | `FREE NERV DIRECT ISOLATION PASSED`；`PAID NERV DIRECT SUPPLY CHAIN PASSED` |
| `test-paid-nerv-direct.ps1 -RequireFreeIsolation -PaidPayloadZip launcher-rs\target\paid-nerv-payload-test-7bca76a088934de89c6124e3416995cc.zip` | 0 | 付费 ZIP 内 67 条 manifest 记录逐项大小与 SHA-256 校验通过 |
| `cargo fmt --all -- --check` | 0 | 格式检查通过 |
| `cargo clippy --workspace --all-targets -- -D warnings` | 0 | 零 warning |
| `git diff --check` | 0 | 无 whitespace error |
| `cargo test -p wujin-core --test license_compat -- --nocapture`，设置生产 secrets 路径 | 0 | 11 passed；非 CDK 迁移报告已按 CSV 表头排除 |

## 完整门禁

最终命令在独立 Cargo 目标目录运行，避免占用中的界面调试程序锁定默认 `target\debug\wujin-launcher.exe`：

```powershell
$env:WUJIN_RELEASE_SECRETS = 'G:\AI\520reverse-skill\Wujin-release-secrets'
$env:CARGO_TARGET_DIR = 'G:\AI\520reverse-skill\.worktrees\wujin-v2.0-windows\launcher-rs\target\nerv-full-gate'
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
```

退出码：`0`

- NERV 供应链与免费隔离：通过
- GPT-5.6 v5 供应链与免费隔离：通过
- Python：76 passed，20 subtests passed
- Rust workspace：173 passed，0 failed
- UI：102 passed，0 failed
- TypeScript：通过
- Vite：62 modules transformed，生产前端构建通过
- 临时 `free-skills-full-gate-*.zip`：门禁结束后已清理

## 范围审计

- `git diff --name-only 86c9400..HEAD | Select-String '^launcher-rs/ui/'`：无输出
- 正式发布 EXE：不存在
- 相邻界面任务的未提交文件保持原状，未纳入本任务提交

**LOCAL DEVELOPMENT VERIFICATION; NO RELEASE PACKAGE BUILT**
