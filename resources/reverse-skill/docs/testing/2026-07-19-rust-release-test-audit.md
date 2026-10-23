# Rust 1.20.1 发布前测试审计

日期：2026-07-19  
范围：`launcher-rs` Rust/Tauri 客户端、CDK 激活、客户端检测、一键部署、备份回滚、UI 回归。  
生产公钥：`G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin`

## 2026-07-19 12:51 打包前复审

本次复审针对日志刷新、六步配置进度和本机授权清理后的最新源码执行，命令为：

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File G:\AI\520reverse-skill\launcher-rs\scripts\test-full-gate.ps1 `
  -SkipReleaseBuild
```

结果：

- Python 兼容基线：`76 passed, 20 subtests passed`。
- Rust workspace：59 项通过，0 失败；生产历史 CDK 兼容测试通过。
- UI 回归：39 项通过，0 失败。
- `cargo fmt --check`、`cargo clippy -D warnings`、TypeScript 类型检查和 Vite production build 全部通过。
- 使用中的生产公钥存在且长度为 32 字节；路径为 `G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin`。
- 本轮审计没有执行 EXE、MSI 或 NSIS 打包；自动化审计通过后才允许进入单文件测试 EXE 构建。

审计判定：允许生成仅供主人进行人工验收的 v1.20.1 单文件测试 EXE。该判定不等同于正式发布批准；Windows 10/11、DPI、真实客户端、真实 CDK 激活和备份恢复仍属于人工验收项。

源码状态：分支 `codex/wujin-test-package`，HEAD `b14ebdd`，构建会包含当前工作区修改；该人工验收产物不是已提交的正式发布快照。

## 2026-07-19 12:55 单文件测试 EXE 审计

构建命令：

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File G:\AI\520reverse-skill\launcher-rs\scripts\build-release.ps1 `
  -PublicKeyPath G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin `
  -Version 1.20.1 `
  -TestBuild
```

产物：`G:\AI\520reverse-skill\dist-rust\无限破甲-v1.20.1.exe`

- EXE 大小：`26,567,680` bytes。
- EXE SHA-256：`09100422F9E897A716D4040EFC9E62109F773F6D502D63AB94F6BAB6BCD9813D`。
- 内嵌 payload 大小：`22,580,014` bytes。
- payload SHA-256：`E63997DE32A4B832B0C3C757413E8B45EBC9E621A2175C2C1EFF0AB557FF637F`。
- `release-report.json` 与 `verify-report.json` 哈希一致；SBOM 和 3 项组件体积报告已生成。
- 生产公钥原始字节在 EXE 中出现 1 次；生产私钥原始字节出现 0 次。
- `Wujin-release-secrets`、`cdks.csv`、private-key、Python、PySide6、Nuitka、Node、Qt 等禁止标记扫描为空。
- `--development` 与 `--public-key` 覆盖参数均以退出码 2 被拒绝。
- Authenticode 状态：`NotSigned`；该文件仅用于人工测试，不是已签名正式版本。
- 仅生成单文件 EXE，没有生成 MSI、NSIS 或其他安装器。

打包后审计判定：该文件可以交给主人进行人工验收。正式发布仍需完成真实 CDK、真实客户端、备份恢复、Windows 10/11、DPI、UAC/WebView2 和干净用户目录测试。

## 结论摘要

原 Python 版本的 76 个自动化场景已完整执行并通过；Rust 核心、Windows 平台层和 Tauri UI 的等价回归也已通过。当前源码已生成单文件测试 EXE，可继续人工验收；没有生成 MSI/NSIS，且该测试 EXE 尚未签名，不属于正式发布版本。

本轮发现并已修复 5 项问题：

1. Rust 核心 CDK 版本常量仍为 `1.1.0`，与 Rust/Tauri `1.20.1` 不一致；已改为 `1.20.1`，并保留 `1.x` 历史卡兼容性。
2. CDK 验签没有输入长度上限；已增加 16 KiB 上限，超长输入在解码前拒绝。
3. 激活缓存允许未知字段；已启用 `serde(deny_unknown_fields)`，篡改或扩展缓存不会恢复授权。
4. 开发目录部署会复制构建目录和发布密钥目录；已加入排除规则，并增加回归测试。
5. 7 天/永久 CDK 卡片仍是整块高饱和渐变；已按旧 Python/QML 视觉恢复白色内层、渐变描边、顶部强调线和镭射扫光。

## 自动化测试证据

### Rust

命令：

```powershell
cd G:\AI\520reverse-skill\launcher-rs
$env:PATH="C:\Users\Anything001\.cargo\bin;$env:PATH"
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
```

结果：

- `cargo fmt --check`：通过
- `cargo clippy -D warnings`：通过
- workspace 测试：59 passed，0 failed
- 覆盖激活缓存、CDK 兼容、6 个客户端一键部署、路径穿越、恶意目录排除、备份恢复、事务回滚和 JSON/TOML 合同。

新增关键测试：

- `crates/wujin-core/tests/one_click_deploy.rs`
- `crates/wujin-core/tests/restore_backup.rs`
- `crates/wujin-core/tests/activation.rs`
- `crates/wujin-core/tests/license_compat.rs`
- `crates/wujin-core/tests/payload_service.rs`
- `crates/wujin-core/tests/client_adapters.rs`（13 个 Python adapter 场景的 Rust 等价回归）
- `crates/wujin-core/src/links.rs`（链接配置校验回归）
- `crates/wujin-windows/src/elevation.rs`、`links.rs`（发布参数和 HTTPS/UAC 策略回归）

### Python 76 场景基线

命令：

```powershell
cd G:\AI\520reverse-skill
& .\.venv\Scripts\python.exe -m pytest launcher/tests -q
```

结果：`76 passed, 20 subtests passed`。这组测试覆盖旧 Python 的 adapter、激活、CDK 签发、链接、服务、回滚、启动策略和 QML UI 合同；它作为 Rust 重构的行为基线保留，不把旧实现的通过结果冒充 Rust 测试。

### 生产 CDK 与历史兼容性

命令：

```powershell
cd G:\AI\520reverse-skill\launcher-rs
$env:PATH="C:\Users\Anything001\.cargo\bin;$env:PATH"
$env:WUJIN_RELEASE_SECRETS="G:\AI\520reverse-skill\Wujin-release-secrets"
cargo test -p wujin-core --test license_compat
Remove-Item Env:WUJIN_RELEASE_SECRETS
```

结果：10 passed。生产目录统计如下（只记录数量，不记录卡密内容）：

| 文件 | 数量 | claims 摘要 |
|---|---:|---|
| `wujin-permanent-1000.csv` | 1000 | `permanent`, `1.x`, 无期限 |
| `wujin-permanent-1000.txt` | 1000 | `permanent`, `1.x`, 无期限 |
| `wujin-trial-7days-1000.csv` | 1000 | `trial`, `1.x`, 7 天 |
| `wujin-trial-7days-1000.txt` | 1000 | `trial`, `1.x`, 7 天 |

结论：历史生产 CDK 使用 `1.x`，升级核心版本常量到 `1.20.1` 不会破坏旧卡；未来可以签发精确 `1.20.1` 规则的 Rust 客户端 CDK。

### 一键部署与回滚

隔离临时目录中模拟了 Claude、Codex、Kiro、Cursor、Cline、Windsurf 六个客户端，执行完整流程：

1. payload 校验与部署；
2. `refresh-tool-index.ps1` 调用及 JSON 回读；
3. 六客户端规则文件写入；
4. JSON/TOML MCP 配置写入和回读校验；
5. 结果状态与目标文件校验。

结果：`one_click_deploy_configures_every_detected_client_and_verifies_readback` 通过。

另外已通过：

- ZIP `../escape.txt` 路径穿越拒绝；
- symlink payload 拒绝逻辑保留；
- `launcher-rs`、`dist-rust`、`Wujin-release-secrets`、`.venv`、`node_modules`、`target`、`build` 等目录不会从开发源目录复制到用户 payload；
- 备份恢复只允许 backup 根目录和用户目录范围内的路径；
- 配置验证失败会回滚原始文件并保留用户内容。

### UI 与真实浏览器检查

命令：

```powershell
cd G:\AI\520reverse-skill\launcher-rs\ui
npm.cmd test
.\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run build
```

结果：

- UI 回归：40 passed，0 failed（包含日志刷新和六步配置进度回归）；
- TypeScript：通过；
- Vite production frontend build：通过；
- 真实浏览器截图：`G:\AI\520reverse-skill\output\playwright\cdk-purchase-cards-fixed.png`；
- 实际计算样式确认：`purchase-laser`，`6.2s`，悬停透明度 `0.26`，reduced-motion 规则生效。

卡片视觉已与 QML 基准对齐：

- 7 天：`#ff6a5f → #ff9f43`；
- 永久：`#f0445d → #8158e8`；
- 白色内层、渐变描边、顶部 3px 强调线；
- 斜向镭射动画；
- disabled、hover、active、focus-visible 状态保持原交互。

## 发布候选二进制审计

执行了 `build-release.ps1 -Version 1.20.1 -TestBuild` 单文件测试构建，没有执行 MSI/NSIS 安装器生成。

生产公钥嵌入扫描：

- executable bytes：`26,567,680`
- 生产公钥出现次数：`1`
- 私钥出现次数：`0`
- `Wujin-release-secrets` 字符串：`0`
- `node_modules` 字符串：`0`

`launcher-rs/scripts/verify-release.ps1`：通过。候选二进制 SHA-256：

```text
09100422F9E897A716D4040EFC9E62109F773F6D502D63AB94F6BAB6BCD9813D
```

另外直接运行该 release EXE 传入 `--development` 或 `--public-key`，退出码均为 `2`；发布版不会接受外部开发模式或公钥覆盖参数。

### 一键全量自动化门禁

后续每次改动可直接运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File G:\AI\520reverse-skill\launcher-rs\scripts\test-full-gate.ps1
```

该门禁已实际通过，顺序执行 Python 76 场景、Rust `fmt`/`clippy`/workspace 测试、UI 40 项、TypeScript、Vite 构建、原始 release EXE 构建和禁止依赖扫描；它不会生成安装包，也不会写入真实客户端配置。

独立审计 target 目录因环境删除策略未自动清理，位于：
`G:\AI\520reverse-skill\launcher-rs\target-audit-release`

## 明日人工验收清单

以下项目需要在主人明天查看时重点确认：

- [ ] 在当前 Rust 测试窗口中实际拖动标题栏、最小化、关闭，确认固定尺寸仍为 `1120×720`；
- [ ] 选择实际已安装的 Claude/Codex/Kiro/Cursor/Cline/Windsurf，逐个执行一次配置并检查真实文件；
- [ ] 对至少一个已有配置执行覆盖，确认备份路径、回读结果和恢复按钮均正确；
- [ ] 用一张真实生产永久 CDK 和一张 7 天 CDK 完成 UI 激活，重启后再次读取缓存；
- [ ] 确认官方网站、购买、文档按钮在真实 Tauri 窗口中打开正确 HTTPS 地址；
- [ ] 确认卡片悬停时镭射光带可见，未悬停时文字仍清晰；
- [ ] 主人完成本次单文件 EXE 人工验收后，另行决定是否制作签名正式版本。

## 仍未执行的项目

- 没有执行正式安装包生成、签名、安装或升级安装；
- 没有对主人真实客户端配置做不可逆写入，全部部署验证使用隔离临时目录；
- 没有进行旧安装包到 1.20 候选版本的 VM 升级测试。

以上属于人工/虚拟机发布验收，不计入自动化门禁通过数。

## 已生成测试版 EXE

本次按生产公钥执行了 `launcher-rs/scripts/build-release.ps1 -TestBuild`，已生成带内嵌 payload、公钥、链接配置和前端资源的测试版 EXE：

`G:\AI\520reverse-skill\dist-rust\无限破甲-v1.20.1.exe`

- 文件大小：`26,567,680 bytes`
- SHA-256：`09100422F9E897A716D4040EFC9E62109F773F6D502D63AB94F6BAB6BCD9813D`
- 使用 Tauri `custom-protocol`，不依赖 `localhost:1420`；直接启动后窗口标题为“无限破甲”，进程保持响应
- 内嵌 payload：`22,580,014 bytes`，SHA-256：`E63997DE32A4B832B0C3C757413E8B45EBC9E621A2175C2C1EFF0AB557FF637F`
- 公钥出现：1 次；私钥、密钥目录、Python、Node 标记：0
- `verify-release.ps1`：通过
- `--development` 与 `--public-key` 参数退出码：`2`

该文件是独立 EXE 测试版，没有生成 MSI/NSIS 安装器。

## 2026-07-19 自动化单元测试复跑（不打包）

按本审计文档执行：

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File G:\AI\520reverse-skill\launcher-rs\scripts\test-full-gate.ps1 `
  -SkipReleaseBuild
```

结果：

- Python 旧版行为基线：`76 passed, 20 subtests passed`；
- Rust workspace：`59 passed, 0 failed`，覆盖激活缓存、历史 CDK、六类客户端、一键部署、备份恢复、事务回滚、日志合同和 Windows 平台合同；
- UI 回归：`40 passed, 0 failed`；
- `cargo fmt --check`、`cargo clippy -D warnings`、TypeScript 类型检查和 Vite production build：全部通过；
- 本轮没有重新打包，也没有写入真实客户端目录。

自动化单元/回归测试当前没有新的失败项。文档中剩余的真实客户端、真实 CDK、干净用户目录、DPI、Windows 10/11、UAC/WebView2 和 VM 升级项目，仍需人工或虚拟机验收，不能由单元测试替代。
