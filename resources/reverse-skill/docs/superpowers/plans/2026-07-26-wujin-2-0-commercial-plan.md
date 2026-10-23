# 无限破甲 2.0 商业版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以现有无限破甲 `1.30.3` Windows Rust/Tauri 版本为唯一升级基线，通过界面优化和功能升级交付面向商业用户的无限破甲 2.0：白色一键式界面、付费 CDK 保护破甲核心、Provider/客户端安装/换肤免费开放，并接入服务器授权、官网协议和完整自动化验收。

**Architecture:** 本计划不是新建另一套客户端，而是在 `1.30.3` 已有源码、页面、IPC、CDK、配置事务、免费 Skill、更新检查和发布门禁上增量升级。保留现有 `wujin-core` 的 WJP1 Ed25519 信任根和付费配置事务，将首次激活升级为“客户端本地验签 + 服务器发行台账核验 + 单 CDK 原子绑定一个设备公钥哈希 + 服务端签发 WJD1 设备票据”；免费工具在 UI、Tauri IPC、磁盘目录和状态机上与付费配置隔离；官网继续使用 Cloudflare Pages，授权 API 独立部署到 `api.codexpojia.com`。

**Tech Stack:** Rust 1.80+、Tauri 2、React 18、TypeScript、Vite、Axum、PostgreSQL 16、Caddy、Windows DPAPI/TPM 2.0、Ed25519、PowerShell、Playwright。

## Global Constraints

- 2.0 必须从当前 `1.30.3` 的 `launcher-rs` 代码和行为契约增量演进；复用并扩展现有 Rust/Tauri/React 工程，不平行维护第二套 Launcher。
- `1.30.3` 已有的 AI 客户端检测、CDK 本地验签、付费配置、备份恢复、免费 Skill、免责声明、运行日志、检查更新和开发/出包门禁必须继续通过回归测试。
- 界面升级以优化信息架构、视觉层级和一键交互为目标；底层功能升级以增加 Provider、客户端安装、换肤、Cursor、NERV 和服务器设备授权为目标。
- 产品版本统一为 `2.0.0`；已导入迁移台账的旧 WJP1 `version_rule=1.x` 允许在 2.0 完成兼容激活，新生成 Key 使用 `version_rule=2.x`，未进入迁移台账的旧 Key 不进入 2.0 在线绑定。
- 现有 1.30.3 Key 保留 WJP1 格式和签名，通过一次性库存迁移进入 2.0 授权服务器；2.0 首次使用旧 Key 时同样执行联网发行台账核验和单机器码绑定，新生成 Key 使用 `version_rule=2.x`。
- 付费 CDK 只控制破甲核心、一键部署、NERV、Cursor 一键续杯和付费 payload；Provider、客户端下载、Codex 换肤和免费 Skill 始终可用。
- UI 默认白色主题；免费入口不可因 CDK 未激活而隐藏或锁定。
- 激活前必须展示并确认《用户协议》《隐私政策》《商业授权条款》；复选框默认未选中。
- 每个已发行 WJP1 CDK 只能绑定一个 `device_id = SHA256(device_public_key)`；同一设备重复激活幂等成功，其他设备提交同一 CDK 返回稳定的已绑定错误。
- WJP1 由服务器上的隔离签发服务生成；公开授权 API、PostgreSQL 和管理页面进程均不直接读取私钥。签发服务通过本机 Unix socket 接收受限的批量签名请求，私钥使用 systemd credential 注入并与数据库分离。
- Key 首次绑定后永久锁定该机器码；换机、主板更换、设备密钥丢失或系统重装导致机器码变化时，原 Key 保持原绑定并购买新 Key。
- 限时 Key 的时间锚点由管理员在生成批次时手动指定；服务器保存 `starts_at`，并按 `expires_at = starts_at + duration_days` 计算固定到期时间。`starts_at` 不阻止提前激活，首次激活时间也不改变固定到期时间。
- 首次联网激活并保存 WJD1 后不设置周期性联网要求；永久授权的 WJD1 使用 `expires_at=null`，限时授权由客户端离线验证签名 `expires_at`。发现本机时间回拨时暂停付费命令并要求联网校时。
- 管理后台可撤销 Key；撤销状态在客户端下次联网激活、手动刷新或时间校正时生效。离线期间继续按本地 WJD1 工作。
- Claude、Codex、Kiro、Cursor、Cline、Windsurf 的付费一键配置必须使用统一冲突描述和修复协议；任何客户端检测到用户自有 MCP、规则或指令字段冲突时先回滚本次单元，再提供可审计的修复入口。
- 付费部署范围始终显示 Claude、Codex、Kiro、Cursor、Cline、Windsurf 六个客户端选项；窗口右上角始终保留通过系统默认浏览器打开 `https://codexpojia.com` 的“官网”入口。
- 客户端日志不得包含完整 CDK、API Key、access token、refresh token、设备私钥、协议正文或用户配置正文。
- 所有写入操作都必须备份、原子替换、回读验证，并对失败单元回滚。
- UI 不直接访问用户文件、注册表或网络；所有系统和网络操作走 Rust typed IPC。
- 不运行第三方上游的安装脚本；上游代码、发布包、主题素材和 commit 必须写入来源锁与许可证清单。
- 用户未明确说“出包”前，只允许源码、测试和本机 debug EXE；禁止 release 打包、签名、安装器、发布 ZIP、官网生产清单发布和上传 EXE。
- 官网生产域名为 `https://codexpojia.com`，授权 API 为 `https://api.codexpojia.com`；客户端激活不跳转授权网页。
- 2.0 按完整实施计划持续执行；UI 组件契约优先落地，但界面验收不阻断后续 Rust、授权 API 和第三方组件开发。
- 开发、测试、部署和服务器运维脚本统一使用 PowerShell 7；当前基准为 `pwsh 7.6.3`。Windows PowerShell 5.1 只用于明确列出的兼容性测试。

---

## 0. 主人确认的产品决策

| 编号 | 决策 | 计划约束 |
|---|---|---|
| D-001 | Cursor 一键续杯归入付费核心 | 页面可以展示能力说明；执行 `run_cursor_renewal()` 和 `restore_cursor_backup()` 前必须通过 Rust 端有效 CDK/WJD1 门禁，免费工具状态不得受 Cursor 状态影响 |
| D-002 | NERV 默认包含在“一键破甲”中 | 标准模式自动部署 NERV；高级设置允许取消。检测到已有 NERV 配置时先备份并按托管边界合并，失败时回滚 NERV 单元且保留用户原配置 |
| D-003 | 首次联网认证，单 Key 单机器码 | 服务端只接受已进入发行台账的 WJP1；首次激活在数据库事务中绑定一个 device_id；同机重试返回相同授权，不同机器提交同一 Key 返回 `device_already_bound` |
| D-004 | 新 CDK 由服务器管理后台按批次生成 | 管理员设置生成数量和自定义使用期限；隔离签发服务生成 WJP1，数据库在同一批次事务中写入 serial/token_sha256，后台导出包含完整 Key 的 CSV，由主人自行上架发卡网 |
| D-005 | Key 绑定后永久锁定原机器 | 官网和客户端不设置自助解绑、人工换绑或机器迁移流程；机器码变化后使用新 Key，原 Key 与原 device_id 的绑定记录永久保留 |
| D-006 | 发卡网销售流程属于项目外部 | 2.0 只负责后台生成、CSV 下载、在线激活和时间验证；主人自行完成发卡网上架、付款配置和发码管理 |
| D-007 | 后台支持自定义批量数量和使用期限 | 每个批次设置 `count`、`license_type`、`duration_days` 和 `version_rule`；永久授权使用 `duration_days=null`，限时授权使用正整数天数 |
| D-008 | 限时 Key 由后台手动指定时间锚点 | 生成限时批次时管理员填写 `starts_at`；服务器计算并冻结 `expires_at = starts_at + duration_days`，首次激活时间不重算到期时间 |
| D-009 | Key 可以在 `starts_at` 之前立即激活 | 提前输入 Key 时立即完成机器绑定并开放付费功能；`starts_at` 仅作为计算 `expires_at` 的时间锚点，服务器只按最终到期时间关闭限时授权 |
| D-010 | 自定义使用期限统一使用整数天数 | 沿用 WJP1 `duration_days`；后台接受正整数天数，拒绝 0、负数、小数和超出 `u32` 的数值，所有时间计算使用 UTC |
| D-011 | 管理后台公开访问但强制账号密码和二次验证 | 使用 `https://api.codexpojia.com/admin`，登录需要用户名、Argon2id 密码哈希和 TOTP；会话使用 Secure、HttpOnly、SameSite cookies，所有签发操作写入管理员审计日志 |
| D-012 | 现有 1.30.3 Key 迁移到 2.0 台账 | 旧 WJP1 先离线验签并导入服务器；永久 Key 保持永久，限时 Key 由管理员补充 `starts_at` 与 `duration_days`；2.0 首次使用旧 Key 时完成联网绑定 |
| D-013 | 旧 Key 的第一台 2.0 激活机器获得永久绑定 | 旧 Key 不保留多机特例；迁移后第一次成功事务写入唯一 device_id，其他机器随后使用该 Key 返回 `device_already_bound` 并提示使用新的 Key |
| D-014 | 首次联网激活后支持长期离线 | 永久 WJD1 长期离线有效；限时 WJD1 离线检查固定到期时间；客户端保存 DPAPI 保护的 `last_trusted_time`，检测到时间回拨时只锁定付费命令并要求联网校时，免费工具继续可用 |
| D-015 | 后台撤销 Key 在客户端下次联网时生效 | 管理后台记录撤销原因和时间；`activate`/`refresh` 返回 `revoked`，客户端删除或隔离本地 WJD1并锁定付费命令；长期离线期间继续使用当前票据 |
| D-016 | 所有付费 AI 客户端支持冲突修复流程 | 将 1.30.3 的 Codex 定点修复扩展到 Claude、Kiro、Cursor、Cline、Windsurf；统一检测冲突、回滚、展示差异类别、确认修复、备份、定点替换、回读验证和失败恢复 |
| D-017 | 冲突统一使用一次“一键修复全部冲突” | 首次付费配置遇到冲突时回滚对应客户端并汇总 ConflictDescriptor；结果页只提供一个批量修复主按钮，不要求用户逐项选择；后端仍按客户端分别备份、校验指纹、定点修复和回滚 |
| D-018 | 2.0 首版 Provider 只支持 Codex | 复用 Codex-X 已审计的 Codex Provider 语义；Provider 页面只检测和修改 Codex `config.toml`，不修改 Claude、Kiro、Cursor、Cline 或 Windsurf 配置 |
| D-019 | 客户端安装采用官方源优先、国内镜像自动回退 | 先调用 Store/winget 官方源；连接失败、超时或下载失败时自动读取签名镜像目录并切换到 `downloads.codexpojia.com`。镜像只保存官方原包，安装前验证目录签名、SHA-256和 Authenticode发布者 |
| D-020 | Codex 换肤常驻为显式开关且默认关闭 | 点击主题卡只执行一次安装、应用和验证；用户开启“常驻保持主题”后才创建后台启动项，关闭开关时移除启动项但保留当前主题，恢复原生界面时同时关闭常驻 |
| D-021 | Cursor 一键续杯只开放已验证版本 | 使用签名兼容目录维护允许的 Cursor 版本、文件布局和变换规则；未知版本只读检测并禁用续杯按钮，不启动 UAC、不创建备份、不修改文件、注册表或设备标识 |
| D-022 | 付费一键破甲只处理已安装客户端 | 缺失客户端不触发自动下载、安装或 UAC；部署范围页显示缺失状态和 `前往免费安装`，安装完成后重新检测并由用户选择，再进入付费配置 |
| D-023 | 完整 Key CSV 加密永久保存 | 每个批次生成独立数据密钥并加密 CSV，后台允许长期重新下载；解密只在内存中进行，每次下载要求有效管理员会话并写入审计日志，普通数据库字段和应用日志只保存 token SHA-256 |
| D-024 | 诊断日志由用户主动脱敏上传 | 默认日志只保存在本机；用户点击“发送诊断”并确认预览后，客户端按字段白名单移除 CDK/WJD1、API Key、配置正文、用户名路径、设备公钥和图片名称，只上传版本、客户端类型、阶段、错误码、哈希和恢复结果；服务器保存30天后删除 |
| D-025 | 2.0 只提示软件更新，上游只生成变更报告 | 客户端验证 Cloudflare 签名更新清单，发现新版后显示提示并打开官网；客户端不下载或安装更新包。Codex-X、换肤、Cursor、NERV 等上游变化只生成审计报告，经过人工差异、许可证、素材和测试审查后进入后续版本 |
| D-026 | 2.0 保留六客户端选择和右上角官网入口 | 付费一键破甲的目标选择器始终列出 Claude、Codex、Kiro、Cursor、Cline、Windsurf，并分别显示已安装、缺失或不兼容状态；窗口右上角始终显示“官网”链接，通过受控后端命令使用系统默认浏览器打开 `https://codexpojia.com` |
| D-027 | 按完整 2.0 计划持续实施并设置用户层自动化门禁 | UI、Rust、授权 API、官网和第三方组件按任务依赖持续推进；每项可见功能都必须有用户操作层自动化测试，覆盖正常、失败、冲突、取消、回滚和免费/付费隔离。未获得“出包”指令时 Task 12 保持锁定 |

---

## 1. 产品边界与用户流程

### 1.1 付费能力

付费 CDK 激活后开放：

- 破甲中心；
- 一键破甲；
- 一键部署 `reverse-skill`；
- `lingbol088-spec/5.6-JAILBREAK-NERV` 受控部署包；
- Cursor 一键续杯、备份与恢复；
- 付费客户端适配器、MCP 和专业规则；
- 付费 payload 的配置、回读和恢复。

### 1.2 免费能力

无需 CDK即可进入和使用：

- Codex Provider / API 中转站添加、检测、获取模型和切换；
- Codex、Claude Desktop 下载与安装检查；
- Codex 换肤、原创主题、本地图片主题；
- 现有“强化环境配置”11 个免费 Skill；
- 使用说明、免责声明、运行日志和版本检查。

### 1.3 一键流程

```text
打开软件
→ 直接查看免费工具或进入破甲中心
→ 破甲中心输入 WJP1 CDK
→ 勾选协议
→ 本地验签并静默完成设备绑定
→ 服务端签发 WJD1
→ 点击一键部署
→ 自动备份、部署 reverse-skill、默认部署 NERV、写入配置、回读验证
→ 显示每个客户端的结果和恢复入口
```

标准模式不再询问是否部署 NERV；只有进入高级设置的用户可以取消该部署项。

免费工具的流程不读取付费 CDK、付费 payload 或付费配置状态。

### 1.4 新 CDK 的后台生产流程

```text
管理员进入服务器管理后台
→ 设置生成数量 count
→ 选择永久授权或限时授权
→ 限时授权填写 duration_days
→ 限时授权手动填写 starts_at
→ 设置 version_rule
→ 管理后台向本机隔离签发服务提交批次请求
→ 签发服务生成 WJP1 并返回 serial + token
→ 后台在数据库事务中写入 batch、serial、token_sha256 和时间规则
→ 后台加密永久保存批次 CSV，并立即提供首次下载
→ 主人自行把 CSV 中的 Key 上架到发卡网
→ 发卡网的付款和发码流程由主人管理
→ 用户在无限破甲输入 WJP1
→ api.codexpojia.com 验证签名、token_sha256、发行状态和绑定状态
→ 首次绑定 license_id + device_id
→ 签发 WJD1
```

公开授权 API 与管理后台隔离：`/v1/activate` 只处理客户端激活，`/admin` 只允许管理员访问，签发服务只监听本机 Unix socket。数据库业务表保存 `serial`、`token_sha256`、批次参数和绑定状态；完整 Key 只存在于加密批次归档，以及通过管理员验证后的内存解密下载响应中，不写入普通 API 日志。发卡网集成、订单 webhook 和自动上架不属于 2.0 项目范围。

---

## 2. 文件与模块地图

### 2.1 Launcher 现有文件

- `launcher-rs/ui/src/main.tsx`：页面路由、Tauri 事件订阅和付费/免费状态编排。
- `launcher-rs/ui/src/state/app-state.ts`：页面联合类型、激活状态、免费状态和付费配置阻断器。
- `launcher-rs/ui/src/components/Sidebar.tsx`：白色双区域导航。
- `launcher-rs/ui/src/pages/ActivationPage.tsx`：CDK、协议确认、激活状态和授权错误。
- `launcher-rs/ui/src/pages/ClientsPage.tsx`：付费部署范围选择。
- `launcher-rs/ui/src/pages/ConfigurePage.tsx`：付费一键部署和 NERV 进度。
- `launcher-rs/ui/src/pages/ResultPage.tsx`：付费部署结果、备份和恢复入口。
- `launcher-rs/ui/src/pages/FreeSkillsPage.tsx`：现有免费 Skill 页面。
- `launcher-rs/ui/src/styles/*.css`：白色主题、导航、页面和弹窗样式。
- `launcher-rs/ui/src/api.ts`：typed IPC 和远端授权调用的唯一 UI 边界。
- `launcher-rs/src-tauri/src/commands.rs`：Tauri command 编排和付费授权门禁。
- `launcher-rs/src-tauri/src/state.rs`：运行期授权、busy、日志和链接状态。
- `launcher-rs/crates/wujin-core/src/license.rs`：WJP1 解析、Ed25519 验签和版本匹配。
- `launcher-rs/crates/wujin-core/src/activation.rs`：本地激活票据存储和恢复。
- `launcher-rs/crates/wujin-core/src/transaction.rs`：配置事务、备份、原子替换和回滚。
- `launcher-rs/crates/wujin-windows/src/`：DPAPI、TPM、注册表、UAC、进程和 Windows 路径。

### 2.2 新增 Launcher 模块

- `launcher-rs/crates/wujin-provider/`：Provider URL、模型读取、DPAPI 凭据和 Codex TOML 合并。
- `launcher-rs/crates/wujin-skin/`：固定换肤引擎、主题清单、CDP 生命周期和回读验证。
- `launcher-rs/crates/wujin-install/`：官方客户端检测、winget/Store 安装器和安装结果。
- `launcher-rs/crates/wujin-cursor/`：Cursor 续杯适配器、备份、恢复和版本兼容检查。
- `launcher-rs/src-tauri/resources/providers/`：Provider 默认配置和来源信息。
- `launcher-rs/src-tauri/resources/skins/`：原创主题和皮肤引擎发行包。
- `launcher-rs/src-tauri/resources/sources/`：第三方来源锁、许可证和 SHA-256。

### 2.3 授权 API 与官网

- `services/license-api/Cargo.toml`：Axum 授权 API。
- `services/license-api/src/main.rs`：HTTP 路由、认证、限流和错误映射。
- `services/license-api/src/domain.rs`：license、order、device、receipt 和 consent 领域模型。
- `services/license-api/migrations/`：PostgreSQL schema 和索引。
- `services/license-api/docker-compose.yml`：本地测试 API、PostgreSQL 和 Caddy。
- `G:\AI\GW\wujin-website-prototype/terms.html`：用户协议。
- `G:\AI\GW\wujin-website-prototype/privacy.html`：隐私政策。
- `G:\AI\GW\wujin-website-prototype/license.html`：商业授权条款。
- `G:\AI\GW\wujin-website-prototype/index.html`：顶部导航、有奖问卷和购买入口。

---

## Task 0: 建立 2.0 基线与来源锁

**Files:**
- Modify: `launcher-rs/crates/wujin-core/src/license.rs`
- Modify: `launcher-rs/Cargo.toml`, `launcher-rs/ui/package.json`, `launcher-rs/src-tauri/tauri.conf.json`
- Create: `launcher-rs/src-tauri/resources/sources/upstreams.lock.json`
- Create: `launcher-rs/src-tauri/resources/sources/THIRD_PARTY_NOTICES.md`
- Create: `docs/testing/2026-07-26-wujin-2.0-baseline.md`

**Interfaces:**
- Produces `APP_VERSION = "2.0.0"` and a single version value consumed by Rust, UI title and update checks.
- Produces source records with `repository`, `version`, `commit`, `releaseSha256`, `license`, `importedComponents`, `excludedComponents`.
- Produces a `1.30.3 → 2.0.0` regression baseline proving the upgrade preserves existing launcher behavior before new modules are introduced.

- [ ] **Step 1: Freeze the 1.30.3 upgrade baseline.**

Record the current `1.30.3` source commit, Rust/UI test totals, existing page list, Tauri IPC list, WJP1 compatibility vectors, paid/free state boundaries and debug launch command in `docs/testing/2026-07-26-wujin-2.0-baseline.md`. This evidence is the regression reference for every later 2.0 task.

- [ ] **Step 2: Add a failing version-contract test.**

Add a Rust test asserting `APP_VERSION == "2.0.0"` and a UI test asserting the rendered title and bootstrap version use `2.0.0`.

- [ ] **Step 3: Run the targeted tests and record the old-version failure.**

```powershell
cd G:\AI\520reverse-skill\launcher-rs
cargo test -p wujin-core --test release_contracts version -- --nocapture
cd ui
npm.cmd test -- --runInBand tests/ui-regression.test.js
```

Expected: the tests report the current `1.30.3` value.

- [ ] **Step 4: Change the single source of truth and metadata.**

Set the version to `2.0.0` in Rust package metadata, Tauri metadata and UI package metadata. Keep the historical WJP1 parser separate from the application version.

- [ ] **Step 5: Add the upstream lock records.**

Record the audited fixed values:

```json
{
  "codex-x": {
    "repository": "https://github.com/yynxxxxx/Codex-X",
    "version": "0.3.3",
    "commit": "f64848ca9cac61e068e0e91150b2645459059f13",
    "license": "MIT",
    "importedComponents": ["provider URL normalization", "models endpoint", "model selection"]
  },
  "heige-codex-skin-studio": {
    "repository": "https://github.com/HeiGeAi/heige-codex-skin-studio",
    "version": "5.4.10",
    "commit": "7712c1f4c34f7802e00d72900311d15242480995",
    "releaseSha256": "C40923F507F148416F1A15DD29446A934DE973E1FDBFC1F1CF445EE063CE4268",
    "license": "MIT"
  },
  "nerv": {
    "repository": "https://github.com/lingbol088-spec/5.6-JAILBREAK-NERV",
    "commitSource": "git rev-parse HEAD",
    "licenseSource": "upstream repository LICENSE"
  },
  "cursor-help": {
    "repository": "https://github.com/yuaotian/go-cursor-help",
    "commitSource": "git rev-parse HEAD",
    "license": "MIT"
  }
}
```

The source audit script must resolve the two `commitSource` values and write the resulting commit and SHA-256 before an implementation branch accepts the dependency.

- [ ] **Step 6: Run the 1.30.3 regression baseline and 2.0 version gate.**

Before accepting the version change, run the complete existing `1.30.3` Rust/UI non-packaging suites. Record any intentional 2.0 expectation changes separately; unchanged behavior must remain green.

- [ ] **Step 7: Commit the baseline.**

```powershell
cd G:\AI\520reverse-skill\launcher-rs
cargo fmt --all -- --check
cargo test -p wujin-core --test release_contracts
cd ..\..
git add -- launcher-rs docs/testing/2026-07-26-wujin-2.0-baseline.md
git commit -m "chore: establish wujin 2.0 baseline"
```

---

## Task 1: 白色双区域 UI 与付费/免费导航

**Files:**
- Modify: `launcher-rs/ui/src/state/app-state.ts`
- Modify: `launcher-rs/ui/src/main.tsx`, `launcher-rs/ui/src/components/Sidebar.tsx`
- Modify: `launcher-rs/ui/src/pages/ActivationPage.tsx`, `ClientsPage.tsx`, `ConfigurePage.tsx`, `ResultPage.tsx`
- Create: `launcher-rs/ui/src/pages/ProviderPage.tsx`, `InstallClientsPage.tsx`, `SkinPage.tsx`
- Modify: `launcher-rs/ui/src/styles/app.css`, `shell.css`, `interaction.css`
- Create: `launcher-rs/ui/tests/v2-navigation.test.js`, `launcher-rs/ui/tests/v2-free-tools-dom.test.tsx`

**Interfaces:**
- Extend `Page` with `provider`, `installClients`, and `skin`.
- `canNavigate(state, page)` returns `true` for all free pages and for paid pages as read-only before activation.
- Free page callbacks call typed APIs and do not inspect `state.bootstrap.activated`.
- Paid client selection always renders the fixed ordered set `Claude`, `Codex`, `Kiro`, `Cursor`, `Cline`, `Windsurf`; each card exposes a typed `installed`, `missing`, or `unsupported` state. Only `installed` and supported cards can be selected for paid configuration; missing Codex or Claude cards expose `onNavigate("installClients")`, while other missing cards remain visible with installation guidance.
- The shell header always renders a top-right `官网` action. React passes only link ID `website`; the Rust/Tauri backend resolves it from signed or packaged `links.json` and opens `https://codexpojia.com` in the system default browser after HTTPS host validation.

- [ ] **Step 1: Write navigation tests.**

Assert that a fresh state can navigate to Provider, client installation and skin pages; `configure_selected` remains blocked by the Rust command before activation; the free page copy contains `无需激活` and no purchase control. Assert the paid target selector contains exactly Claude, Codex, Kiro, Cursor, Cline and Windsurf in the approved order even when some are missing, and that only installed/supported cards are selectable. Assert the top-right `官网` action exists on every page, submits only link ID `website`, and never accepts a renderer-supplied URL.

- [ ] **Step 2: Run the tests to capture the missing pages.**

```powershell
cd G:\AI\520reverse-skill\launcher-rs\ui
npm.cmd test -- --runInBand tests/v2-navigation.test.js tests/v2-free-tools-dom.test.tsx
```

- [ ] **Step 3: Implement the white shell and grouped sidebar.**

Use the approved prototype as the visual reference: white canvas, graphite text, restrained red action color, left groups `付费核心 · CDK`, `免费工具`, and `帮助`. Put the activation state only on the paid group; free entries stay enabled. Keep all six paid-client cards visible with compact installation/compatibility badges, and keep the `官网` action fixed at the window header's top-right without covering title-bar controls at narrow widths.

- [ ] **Step 4: Implement the three free pages as working UI surfaces.**

Provider page has `Provider URL`, `API Key`, `一键接入`, model list and `一键切换`. Install page has Codex and Claude cards with `一键安装`. Skin page has current preview, three original themes, local image import and `恢复原生界面`.

- [ ] **Step 5: Run UI gates and capture a desktop/mobile screenshot.**

```powershell
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
```

Use Playwright at `1120x720` and `390x844`; assert no overflow, visible focus, white background and no overlapping text.

Keep the formal UI running with typed mock responses for owner review. Record the accepted navigation, copy, six-client layout, free/paid boundaries, top-right website action and responsive screenshots before starting Task 2; owner-requested visual changes remain inside Task 1.

- [ ] **Step 6: Commit the shell.**

```powershell
git add -- launcher-rs/ui/src launcher-rs/ui/tests
git commit -m "feat: add wujin 2.0 white paid-free shell"
```

---

## Task 2: WJP1 + WJD1 付费 CDK 激活与协议留痕

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/device_identity.rs`
- Create: `launcher-rs/crates/wujin-core/src/entitlement.rs`
- Modify: `launcher-rs/crates/wujin-core/src/lib.rs`, `activation.rs`, `license.rs`
- Modify: `launcher-rs/crates/wujin-windows/src/` with DPAPI/TPM implementation
- Modify: `launcher-rs/src-tauri/src/commands.rs`, `state.rs`, `api` bindings
- Modify: `launcher-rs/ui/src/pages/ActivationPage.tsx`, `ui/src/api.ts`
- Create: `launcher-rs/crates/wujin-core/tests/device_entitlement.rs`, `launcher-rs/ui/tests/v2-activation.test.js`

**Interfaces:**
- `DeviceIdentity::load_or_create() -> Result<DeviceIdentity, CoreError>` returns `public_key`, `device_id` and a private signing handle; private key never leaves the platform store.
- `EntitlementReceipt::verify(bytes, public_key, device_id, app_version, trusted_time) -> Result<EntitlementClaims, CoreError>` verifies WJD1, device binding, permanent/timed validity and clock rollback.
- Tauri commands: `activate_license(cdk, consent)`, `refresh_entitlement()`, `get_entitlement_state()`.

- [ ] **Step 1: Add failing tests for device and receipt rules.**

Cover deterministic `device_id = SHA256(device_public_key)`, TPM/DPAPI fallback, WJD1 signature failure, wrong product, wrong device, permanent offline startup, timed offline startup before and after `expires_at`, forward clock movement, clock rollback, imported legacy `version_rule=1.x` activation and rejection of a legacy serial absent from the migration ledger.

- [ ] **Step 2: Run the core tests and confirm missing types.**

```powershell
cd G:\AI\520reverse-skill\launcher-rs
cargo test -p wujin-core --test device_entitlement
```

- [ ] **Step 3: Implement platform-independent WJD1 verification.**

Keep the existing WJP1 verifier; define a canonical receipt payload containing `license_id`, `serial`, `device_id`, `issued_at`, `starts_at`, nullable `expires_at`, `version_rule`, `entitlement`, and `key_id`. `starts_at` is the administrator-defined calculation anchor rather than a not-before restriction; the client accepts a valid receipt before that timestamp and rejects it at or after `expires_at`. Permanent receipts use `expires_at=null`. Persist the greatest trusted server/local timestamp with DPAPI; when the wall clock moves behind it, return `clock_rollback` until an online refresh establishes a new trusted time. Use a separate server signing public key from the WJP1 public key.

- [ ] **Step 4: Implement Windows key storage.**

Use TPM 2.0 when available; store the fallback private key with DPAPI under the current user profile. Reject export requests and record only the public key hash in logs.

- [ ] **Step 5: Gate only paid commands.**

`configure_selected`, NERV deployment and paid payload resolution call `require_paid_authorization`. Provider, install, skin and free Skill commands never call that guard.

- [ ] **Step 6: Add consent state and activation UI.**

The activation checkbox starts unchecked. The button remains disabled until all three document links are opened or acknowledged through the explicit checkbox. Save `consent_version`, `document_hash`, `accepted_at` and `license_id`; do not save CDK plaintext.

- [ ] **Step 7: Run Rust/UI tests and commit.**

```powershell
cargo test --workspace --all-targets
cd ui
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
git add -- ../crates ../src-tauri ui
git commit -m "feat: add device-bound wjd1 entitlement activation"
```

---

## Task 3: 授权 API、数据库与服务器部署

**Files:**
- Create: `services/license-api/Cargo.toml`, `src/main.rs`, `src/domain.rs`, `src/auth.rs`, `src/receipt.rs`, `src/rate_limit.rs`
- Create: `services/license-api/migrations/001_initial.sql`, `002_consents.sql`
- Create: `services/license-api/docker-compose.yml`, `Caddyfile`, `.env.example`
- Create: `services/license-api/tests/activate.rs`, `tests/refresh.rs`, `tests/rate_limit.rs`, `tests/admin_auth.rs`
- Create: `services/license-admin/Cargo.toml`, `src/main.rs`, `src/routes.rs`, `src/generate.rs`, `src/export.rs`, `tests/batch_generation.rs`
- Create: `services/license-signer/Cargo.toml`, `src/main.rs`, `src/protocol.rs`, `tests/signing_policy.rs`
- Modify: `docs/2026-07-26_machine-bound-license-assessment.md` with deployed endpoint evidence

**Interfaces:**
- `POST /v1/activate`: accepts WJP1, device public key, device proof, consent version/hash and client version; returns signed WJD1.
- `POST /v1/refresh`: accepts a valid WJD1 and device proof; returns a replacement receipt and trusted server time. It is used for manual refresh and clock-rollback recovery rather than periodic mandatory validation.
- `POST /v1/diagnostics`: accepts a user-confirmed, schema-validated diagnostic envelope up to 256 KiB; returns a support reference ID and stores the envelope for 30 days.
- `GET /v1/health`: returns service and database readiness without license data.
- Database tables: `license_batches`, `licenses`, `orders`, `devices`, `entitlements`, `consents`, `audit_events`. `licenses.serial` and `licenses.token_sha256` are unique; `devices.license_id` is unique to enforce one license binding; `(license_id, device_id)` is unique for idempotent retry.
- Admin backend: `POST /admin/login`, `POST /admin/logout`, `GET /admin/session`, `POST /admin/license-batches`, `GET /admin/license-batches`, `GET /admin/license-batches/{batch_id}/download`, `POST /admin/licenses/{license_id}/revoke`; create input contains `count`, `licenseType`, `durationDays`, `startsAt`, and `versionRule`. Batch download decrypts the permanent encrypted CSV archive after rechecking the administrator session and TOTP freshness.
- Local signer: `license-signer` listens only on a root-owned Unix socket, accepts canonical batch-sign requests from `license-admin`, and returns signed WJP1 values without exposing the private key.

- [ ] **Step 1: Write API and one-Key-one-device contract tests.**

Cover issued first bind, same-device repeat bind, concurrent first activation, unissued but cryptographically valid WJP1, different-device reuse, wrong CDK, wrong device proof, successful activation before a future `starts_at`, a fixed expired `expires_at`, revoked order, missing consent, malformed JSON, rate-limit response and idempotent retry. Add a migrated legacy-key concurrency fixture in which DEVICE_A and DEVICE_B submit the same imported 1.x Key simultaneously; exactly one receives WJD1 and the other receives `device_already_bound`. Batch validation covers `durationDays` values `1`, `7`, `30`, `365`, `0`, `-1`, `1.5`, and values above `u32::MAX`; only positive integers within `u32` pass. CSV archive tests cover encryption-at-rest, wrong wrapping key, modified ciphertext, permanent re-download, TOTP freshness, no-store headers, absence of plaintext temporary files and audit insertion. Freeze the test clock and prove early activation binds immediately while activation time never shifts the administrator-defined `expires_at`.

- [ ] **Step 2: Run the API test suite against disposable PostgreSQL.**

```powershell
cd G:\AI\520reverse-skill\services\license-api
docker compose up -d postgres
cargo test
```

- [ ] **Step 3: Implement the schema and atomic binding handlers.**

Validate WJP1 independently on the server, calculate the canonical token SHA-256, require an exact serial/hash match in the server-generated issuance record, and lock the license row with `SELECT ... FOR UPDATE`. When no device exists, insert the first binding; when the same device exists, return an idempotent success; when another device exists, return `device_already_bound`. Sign WJD1 with a server receipt key separate from WJP1. Use stable codes: `invalid_cdk`, `unissued_cdk`, `device_already_bound`, `consent_required`, `revoked`, `temporarily_unavailable`.

- [ ] **Step 4: Implement the server management backend and isolated signer.**

The admin form requires a batch name, `count` from 1 to 10,000, `licenseType` of `permanent` or `trial`, `durationDays=null` for permanent or a positive `u32` integer for timed use, `startsAt=null` for permanent or an administrator-selected UTC timestamp for timed use, and an explicit `versionRule`. Reject zero, negative, fractional, overflow and locale-formatted duration values. The backend calculates `expiresAt = startsAt + durationDays` once with checked UTC arithmetic and persists both timestamps. `license-admin` generates unique serials, submits canonical claims to the local signer, verifies every returned WJP1 with the public key, and writes `license_batches` plus `licenses` in one transaction. It creates CSV bytes with `serial,cdk,license_type,duration_days,starts_at,expires_at,version_rule,batch_id`, encrypts them before persistent storage, and streams a decrypted copy to the authenticated owner for manual upload to the card-key website.

The CSV archive uses a random 256-bit data-encryption key per batch and authenticated encryption. A separate key-encryption key supplied through a systemd credential wraps each batch key; PostgreSQL stores only the wrapped key, nonces, ciphertext location, ciphertext SHA-256 and metadata. Re-download decrypts in bounded memory, sets `Cache-Control: no-store`, never writes plaintext to a server temporary file, and records administrator ID, batch ID, download time, IP and ciphertext hash. Encrypted backups include the ciphertext archive and wrapped key but exclude the key-encryption credential.

- [ ] **Step 5: Add signing-key, CSV and inventory controls.**

Keep the WJP1 private key outside the public API, PostgreSQL, Git repository, CI and release output. Inject it only into `license-signer` with a root-readable systemd credential. The admin backend authenticates the owner, applies CSRF protection and rate limits, connects to the signer through the Unix socket, and offers the complete CSV as a one-time response. PostgreSQL stores serial and token SHA-256 rather than full WJP1. Record administrator ID, batch parameters, count, CSV SHA-256 and timestamp without recording full WJP1 values.

- [ ] **Step 6: Implement public admin authentication.**

Serve the management UI at `https://api.codexpojia.com/admin` with username/password plus TOTP. Store only an Argon2id password hash and encrypted TOTP secret; rotate sessions after login, reject stale sessions, require CSRF tokens on every state-changing request, set Secure/HttpOnly/SameSite cookies, and disable caching for HTML, CSV and API responses. Add a lockout/backoff after repeated failures and a separate audit event for login success, login failure, batch generation, every CSV re-download, Key revocation and logout. CSV download requires a recently verified TOTP challenge. Revocation requires a non-empty reason, records `revoked_at`/`revoked_by`, and is returned by later `activate` and `refresh` calls without deleting the original device binding or audit history.

- [ ] **Step 7: Add HTTP security controls.**

Require HTTPS behind Caddy, request body limit 32 KiB, per-IP and per-serial rate limits, request IDs, no CDK/API-key logging, encrypted database backups, rotation-ready receipt key IDs and an admin-only migration path for support operations.

Diagnostics use a separate 256 KiB route limit, per-installation rate limit and a strict JSON schema. Reject unknown fields, raw log text, absolute paths, CDK/WJD1 prefixes, bearer tokens and high-entropy secret-like values. Store `diagnostic_id`, consent timestamp, app version, structured events and `delete_after`; run a daily deletion job and audit deleted counts.

- [ ] **Step 8: Import the existing production CDK inventory.**

Read the existing permanent and trial CSV inventories from the local release-secrets directory, verify every WJP1 with the production public key, calculate token SHA-256, reject duplicate serials, and import their batch/serial/time rules into staging. Permanent records retain `duration_days=null`; trial records receive administrator-selected `starts_at` values and retain their signed `duration_days`. Compare imported permanent/trial counts to the source inventories without copying full CDKs into logs or server backups. Add a migration report mapping each serial to `legacy_import_batch_id`.

- [ ] **Step 9: Deploy staging on the supplied server.**

Use Ubuntu 24.04, 2 vCPU, 4 GB RAM, 80 GB SSD and 5 Mbps as the commercial baseline. Install Docker, Caddy and PostgreSQL through the deployment script; place the service behind `api.codexpojia.com`; verify only ports 22 and 443 are exposed. Rotate the previously shared root password and use an SSH key before deployment.

- [ ] **Step 10: Run production-flow smoke tests and record evidence.**

```powershell
curl.exe -fsS https://api.codexpojia.com/v1/health
cargo test
```

Generate a synthetic staging batch through the admin backend, download its CSV, activate one CDK on DEVICE_A, repeat on DEVICE_A, then submit it from DEVICE_B and assert `device_already_bound`. Generate a second limited-time batch and verify its duration fields. Record response status, batch ID, migration version, backup test and certificate renewal check without recording the test CDK.

- [ ] **Step 11: Commit the API, admin backend, signer and deployment manifests.**

```powershell
git add -- services/license-api services/license-admin services/license-signer docs/2026-07-26_machine-bound-license-assessment.md
git commit -m "feat: add license entitlement api"
```

---

## Task 4: 免费 Provider / API 中转站

**Files:**
- Create: `launcher-rs/crates/wujin-provider/src/lib.rs`, `src/models.rs`, `src/http.rs`, `src/config.rs`, `src/secret_store.rs`
- Modify: `launcher-rs/Cargo.toml`, `src-tauri/src/commands.rs`, `src-tauri/src/state.rs`, `ui/src/api.ts`
- Create: `ui/src/pages/ProviderPage.tsx`, `ui/src/styles/provider.css`
- Create: `crates/wujin-provider/tests/models.rs`, `tests/config_merge.rs`, `ui/tests/provider.test.js`

**Interfaces:**
- 2.0 scope is Codex only; every Provider command resolves the detected Codex profile and rejects other client IDs at the typed boundary.
- `list_provider_profiles() -> Vec<ProviderProfile>` returns `id`, `name`, `baseUrl`, `model`, `wireApi`, `isActive`, `hasApiKey`, `lastTestStatus`, `lastLatencyMs`.
- `probe_provider(input) -> ProviderProbeResult` calls `${baseUrl}/models` with timeout, size and model-count limits.
- `save_and_activate_provider(input) -> ProviderProfile` backs up and atomically merges only Provider fields.
- `activate_official_provider()`, `refresh_provider_models(id)`, `delete_provider(id)`.

- [ ] **Step 1: Copy the audited Codex-X algorithms into failing tests.**

Test URL normalization, HTTPS enforcement, `/v1/models` parsing, duplicate model removal, natural sorting, timeout, oversized response and malformed JSON.

- [ ] **Step 2: Implement the Rust module with commercial constraints.**

Store API keys with Windows DPAPI; return only `hasApiKey` to React; preserve `model_instructions_file`, `mcp_servers`, comments and unrelated TOML fields; keep a backup before every write.

- [ ] **Step 3: Add the typed Tauri commands and UI.**

The primary action is `一键接入 Codex`; after a successful probe, automatically choose a recommended model and show `Codex 接入成功`. The page states `当前仅配置 Codex` and never enumerates or modifies other AI clients. Advanced TOML editing and cc-switch import stay outside the first 2.0 surface.

- [ ] **Step 4: Run Provider tests and live fixture tests.**

```powershell
cargo test -p wujin-provider
cd G:\AI\520reverse-skill\launcher-rs\ui
npm.cmd test -- --runInBand tests/provider.test.js
```

- [ ] **Step 5: Commit with source notice.**

```powershell
git add -- launcher-rs/crates/wujin-provider launcher-rs/src-tauri launcher-rs/ui
git commit -m "feat: add free provider configuration"
```

---

## Task 5: 免费 Codex / Claude Desktop 安装器

**Files:**
- Create: `launcher-rs/crates/wujin-install/src/lib.rs`, `src/catalog.rs`, `src/winget.rs`, `src/store.rs`
- Create: `launcher-rs/crates/wujin-install/src/mirror.rs`, `launcher-rs/src-tauri/resources/installers/official-sources.lock.json`
- Modify: `launcher-rs/crates/wujin-windows/src/` for process, UAC and installed-app detection
- Modify: `launcher-rs/src-tauri/src/commands.rs`, `events.rs`
- Create: `launcher-rs/ui/src/pages/InstallClientsPage.tsx`, `ui/src/styles/install.css`
- Create: `launcher-rs/crates/wujin-install/tests/catalog.rs`, `tests/install_policy.rs`, `ui/tests/install-clients.test.js`
- Create: `launcher-rs/scripts/sync-official-installers.ps1`, `launcher-rs/scripts/test-installer-mirror.ps1`

**Interfaces:**
- Catalog IDs: `9PLM9XGG6VKS` for Codex Store, `Anthropic.Claude` for Claude Desktop, `OpenAI.Codex` for Codex CLI.
- Commands: `detect_installers()`, `install_client(client_id)`, `cancel_install(client_id)`, progress event `install-progress`.
- Fallback catalog: `https://codexpojia.com/downloads/installers/stable/catalog.json` plus detached signature; immutable packages are downloaded from `https://downloads.codexpojia.com/{product}/{version}/{filename}` backed by domestic object storage.

Current official-source evidence recorded on 2026-07-26:

```text
Claude Desktop 1.24012.1
URL: https://downloads.claude.ai/releases/win32/x64/1.24012.1/Claude-0adcaed55041a881be363f2c4a4729f67a8b27d7.exe
SHA-256: 0AB794DFDF15837E8E399DC48EE05367E655178F09563219C2115F413B72EAAB
Offline distribution: supported by winget metadata

Codex CLI 0.145.0
URL: https://github.com/openai/codex/releases/download/rust-v0.145.0/codex-x86_64-pc-windows-msvc.exe.zip
SHA-256: BC6AE808BF5A9CDF113364AC281594D6DA76DC103C19129E9D32CAED54EC3CDA
Offline distribution: supported by winget metadata

Codex/ChatGPT Windows Store
Product ID: 9PLM9XGG6VKS
Offline distribution: supported by Microsoft Store metadata
```

- [ ] **Step 1: Add tests for official-source selection.**

Test installed, missing, winget unavailable, Store unavailable, official timeout, official hash mismatch, signed mirror fallback, mirror catalog signature failure, mirror package hash mismatch, Authenticode publisher mismatch, cancelled, non-zero exit and UAC-required results. Every automated test uses a fake executable provider and never invokes a real installer.

- [ ] **Step 2: Implement catalog and detection.**

Prefer official Store/winget IDs and show the source/version in the progress detail. Use bounded connection and download timeouts; when the official path returns a network-class failure, automatically fetch the signed Cloudflare catalog and switch to the domestic mirror without asking the user. A signature, SHA-256 or Authenticode failure stops that package and records the exact failed verification stage.

- [ ] **Step 3: Implement one-click install and recovery.**

The Rust command starts the resolved official or verified-mirror installer, streams bounded output, handles UAC, re-detects after completion and returns `installed`, `alreadyInstalled`, `cancelled` or `failed`. The downloaded file is stored under an app-owned temporary directory and removed after successful installation or explicit cleanup.

- [ ] **Step 4: Implement the mirror synchronization pipeline.**

`sync-official-installers.ps1` reads current winget/MS Store metadata, downloads the official package once on the release machine, verifies the upstream hash and Authenticode publisher, uploads the unchanged bytes to domestic object storage behind `downloads.codexpojia.com`, creates a versioned catalog entry, and signs the catalog with the update-signing key. `test-installer-mirror.ps1` downloads every catalog entry and rechecks signature, hash, content length and publisher before publication.

- [ ] **Step 5: Implement the free UI.**

Each card has one main action, an explicit source label and a compact status line. The page never checks CDK state and never writes Codex/Claude configuration.

- [ ] **Step 6: Run tests and commit.**

```powershell
cargo test -p wujin-install
cd G:\AI\520reverse-skill\launcher-rs\ui
npm.cmd test -- --runInBand tests/install-clients.test.js
git add -- ../crates/wujin-install ../crates/wujin-windows ../src-tauri ui
git commit -m "feat: add free official client installer"
```

---

## Task 6: 免费 Codex 换肤

**Files:**
- Create: `launcher-rs/crates/wujin-skin/src/lib.rs`, `src/engine.rs`, `src/themes.rs`, `src/cdp.rs`
- Modify: `launcher-rs/crates/wujin-windows/src/` for process and loopback CDP lifecycle
- Create: `launcher-rs/src-tauri/resources/skins/manifest.json`, `themes/white.json`, `themes/deep-sea.json`, `themes/silver-lab.json`
- Create: `launcher-rs/ui/src/pages/SkinPage.tsx`, `ui/src/styles/skin.css`
- Create: `launcher-rs/crates/wujin-skin/tests/lifecycle.rs`, `tests/themes.rs`, `ui/tests/skin.test.js`

**Interfaces:**
- Commands: `get_skin_state`, `list_skin_themes`, `install_and_apply_skin(theme_id)`, `apply_custom_skin(path)`, `restore_native_skin`.
- Persistence command: `set_skin_persistence(enabled)` creates or removes the Wujin-owned startup entry and returns the read-back persistence state.
- Progress phases: `detecting`, `installing`, `stoppingCodex`, `startingCodex`, `injecting`, `verifying`, `complete`, `failed`.

- [ ] **Step 1: Add lifecycle and asset validation tests.**

Cover Codex closed/running, CDP port `127.0.0.1:9341`, port conflict, Node runtime mismatch, Store/MSIX path, theme hash mismatch, invalid local image, default persistence off, persistence enable/disable, foreign startup-entry conflict, crash recovery and restore-native cleanup.

- [ ] **Step 2: Vendor only the audited engine.**

Use HeiGeAi release `v5.4.10`, commit `7712c1f4c34f7802e00d72900311d15242480995`, release SHA-256 `C40923F507F148416F1A15DD29446A934DE973E1FDBFC1F1CF445EE063CE4268`. Exclude upstream character images and use three original themes.

- [ ] **Step 3: Implement the one-click engine lifecycle.**

Extract to `%LOCALAPPDATA%\无限破甲\components\codex-skin`, detect the installed Codex process, inject through loopback CDP, restart only when required, verify the active theme, and restore the previous state on error.

- [ ] **Step 4: Implement the free skin page and local image path.**

Theme cards apply immediately; local PNG/JPG/WebP is size-limited, copied to an app-owned directory and transformed into a theme manifest. Add a default-off `常驻保持主题` switch with a plain-language background behavior description. Enabling it creates only a Wujin-owned startup entry after explicit user action; disabling it removes that entry; `恢复原生界面` restores the native theme and disables persistence in one transaction.

- [ ] **Step 5: Run Windows-specific tests and commit.**

```powershell
cargo test -p wujin-skin
cd G:\AI\520reverse-skill\launcher-rs\ui
npm.cmd test -- --runInBand tests/skin.test.js
git add -- ../crates/wujin-skin ../crates/wujin-windows ../src-tauri/resources/skins ui
git commit -m "feat: add free codex skin studio"
```

---

## Task 7: Cursor 一键续杯适配器

**Files:**
- Create: `launcher-rs/crates/wujin-cursor/src/lib.rs`, `src/storage.rs`, `src/compat.rs`, `src/rollback.rs`
- Modify: `launcher-rs/crates/wujin-windows/src/` for process/UAC and Windows identity paths
- Modify: `launcher-rs/src-tauri/src/commands.rs`, `events.rs`
- Create: `launcher-rs/ui/src/pages/CursorPage.tsx`, `ui/src/styles/cursor.css`
- Create: `launcher-rs/crates/wujin-cursor/tests/backup_restore.rs`, `tests/version_matrix.rs`, `ui/tests/cursor.test.js`

**Interfaces:**
- Commands: `get_cursor_status()`, `run_cursor_renewal()`, `restore_cursor_backup()`.
- Results: `detected`, `backupCreated`, `changed`, `verified`, `restored`, `needsAdmin`, `unsupported`, `failed`.
- `get_cursor_status()` may return read-only detection before activation; `run_cursor_renewal()` and `restore_cursor_backup()` call `require_paid_authorization` in Rust before process, file, registry or identity operations.
- Compatibility catalog: a detached-signature JSON maps exact Cursor versions to supported storage schema, process names, required privileges and adapter hash; only entries marked `verified` can reach mutation code.

- [ ] **Step 1: Pin and audit the source.**

Clone `https://github.com/yuaotian/go-cursor-help`, resolve the commit with `git rev-parse HEAD`, compute SHA-256, preserve MIT text and record the result in `upstreams.lock.json`.

- [ ] **Step 2: Write fixture tests before system integration.**

Use synthetic `storage.json` and Windows identity fixtures to verify backup, deterministic changes, restore, malformed JSON, locked file, verified-version match, unknown version, catalog signature failure, adapter hash mismatch and cancellation. Tests must prove that every unsupported or unverified path exits before UAC, backup creation or mutation, and that a failed supported unit restores its own backup.

- [ ] **Step 3: Implement the adapter behind an explicit compatibility check.**

Detect Cursor version and paths, verify the signed compatibility entry and adapter hash, create a timestamped backup, run the pinned transformation, re-read the affected values and return a compact result. A UAC prompt is surfaced only when the verified entry requires it. Unknown versions return `unsupported` with the detected version and leave every target byte unchanged.

- [ ] **Step 4: Add paid one-click UI and backend authorization tests.**

Show a single `一键续杯` button, current detection state, backup timestamp and a `恢复上次状态` action. Before activation the page shows `需要付费 CDK` and routes the primary action to the activation page. After activation it invokes the paid Rust command. Add tests proving UI-state manipulation cannot bypass the Rust authorization guard and that Cursor operations do not modify Codex, Claude or free-tool state.

- [ ] **Step 5: Run tests and commit.**

```powershell
cargo test -p wujin-cursor
cd G:\AI\520reverse-skill\launcher-rs\ui
npm.cmd test -- --runInBand tests/cursor.test.js
git add -- ../crates/wujin-cursor ../crates/wujin-windows ../src-tauri ui
git commit -m "feat: add cursor renewal adapter"
```

---

## Task 8: 付费一键破甲与 NERV 受控部署

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/nerv.rs`
- Create: `launcher-rs/crates/wujin-core/src/conflict.rs`
- Modify: `launcher-rs/crates/wujin-core/src/models.rs`, `payload.rs`, `service.rs`, `transaction.rs`
- Modify: `launcher-rs/crates/wujin-core/src/clients/claude.rs`, `codex.rs`, `kiro.rs`, `cursor.rs`, `cline.rs`, `windsurf.rs`, `mod.rs`
- Modify: `launcher-rs/src-tauri/src/commands.rs`, `events.rs`
- Modify: `launcher-rs/ui/src/pages/ConfigurePage.tsx`, `ResultPage.tsx`
- Create: `launcher-rs/crates/wujin-core/tests/nerv_deploy.rs`, `tests/paid_free_isolation_2_0.rs`, `tests/all_client_conflict_repair.rs`, `ui/tests/paid-deploy-v2.test.js`, `ui/tests/all-client-conflict-repair.test.js`

**Interfaces:**
- `NervManifest::load(bytes) -> Result<NervManifest, CoreError>` validates a signed manifest, path allowlist and source hash.
- `run_paid_deploy(ids, options) -> ConfigurationSummary` performs reverse-skill and NERV in one transaction with per-phase progress; `options.install_nerv` defaults to `true` and is changed only through the advanced settings control.
- Existing `configure_selected(ids)` remains the only paid entry point; it calls `require_paid_authorization` in Rust.
- `ConflictDescriptor` contains `conflictId`, `clientId`, `resourceKind`, `targetPath`, `managedKey`, `currentFingerprint`, `proposedFingerprint`, and `repairStrategies`; it never contains the user's existing value.
- `repair_client_conflicts(requests) -> ConfigurationSummary` requires paid authorization, matches the current file fingerprint, creates a fresh backup, applies only approved conflicting keys or managed blocks, and verifies readback.

- [ ] **Step 1: Add failing tests for paid/free isolation.**

With no CDK, active CDK, expired CDK and corrupt receipt, assert that Provider, installer, skin and free Skill states are identical while paid deployment is blocked or allowed as expected. Add missing-client fixtures proving paid deployment never invokes installer commands, the UI routes to the free installation page, and re-detection is required before the newly installed client becomes selectable.

- [ ] **Step 2: Convert NERV into a managed deployment package.**

Audit `deploy.py`, convert its file list into a manifest, copy only approved files into the paid payload, preserve the upstream license, and route every write through existing transaction and rollback helpers. Do not execute upstream Python at runtime.

- [ ] **Step 3: Add NERV progress phases and result rows.**

Show `部署 reverse-skill` and `部署 NERV` as separate phases, include source version and hash in the logs, and show backup/recovery actions for each changed target. Standard mode always sends `install_nerv=true`; advanced mode exposes an opt-out control. Add fixtures for an existing user-owned NERV configuration and prove backup, managed merge, readback and failure rollback preserve the original.

- [ ] **Step 4: Define the unified paid conflict protocol.**

Replace the Codex-only boolean `replace_codex_model_instructions` with per-conflict repair requests. Configuration remains protected by default: detection reports a typed conflict and rolls back that client's current transaction. A repair request is valid only when `conflictId`, `clientId`, target fingerprint and selected strategy match the latest detection; stale requests trigger a fresh detection rather than overwriting a changed file.

- [ ] **Step 5: Implement targeted repair for all six clients.**

- Claude: repair only conflicting entries under `mcpServers` in `.claude/mcp.json`; preserve unrelated JSON keys and user MCP entries.
- Codex: repair a conflicting `model_instructions_file` or named `mcp_servers` entry; preserve comments, unrelated TOML, user MCP tables and free-skill blocks.
- Kiro: repair only conflicting MCP entries and malformed Wujin steering markers; preserve other steering files and settings.
- Cursor: repair only conflicting MCP entries and the Wujin managed rules block; preserve user settings and unrelated rules.
- Cline: repair only conflicting entries in `cline_mcp_settings.json` and the Wujin managed instructions block.
- Windsurf: repair only conflicting entries in `mcp_config.json` and the Wujin managed rules block.

Every adapter creates a backup before repair, writes atomically, re-parses the native format, verifies only the requested managed keys and restores the backup on any failure.

- [ ] **Step 6: Generalize the Result page with one repair action.**

Remove the Codex-specific message substring check. Render typed conflict cards for every selected client with resource type and protected-file explanation, then provide one primary action labeled `一键修复全部冲突`. Clicking it submits all current ConflictDescriptor IDs with their adapter-defined targeted repair strategy. The user does not select strategies or confirm conflicts one by one. Keep full existing values out of React state and logs.

- [ ] **Step 7: Add the cross-client repair matrix.**

For Claude, Codex, Kiro, Cursor, Cline and Windsurf test: no conflict, user-owned named MCP conflict, malformed managed markers, malformed native JSON/TOML, stale fingerprint, one-click batch repair, mixed success/failure, readback failure and per-client rollback. Assert one UI action submits every current conflict, successful clients remain repaired when another client rolls back, and unrelated user content/free-skill managed blocks remain byte-for-byte identical. The Rust paid guard must reject repair requests without valid WJD1.

- [ ] **Step 8: Run core and UI isolation gates.**

```powershell
cd G:\AI\520reverse-skill\launcher-rs
cargo test -p wujin-core --test nerv_deploy --test paid_free_isolation_2_0 --test all_client_conflict_repair --test one_click_deploy
cd ui
npm.cmd test -- --runInBand tests/paid-deploy-v2.test.js tests/all-client-conflict-repair.test.js
```

- [ ] **Step 9: Commit the paid deployment slice.**

```powershell
git add -- launcher-rs/crates/wujin-core launcher-rs/src-tauri launcher-rs/ui
git commit -m "feat: add paid nerv one click deployment"
```

---

## Task 9: Cloudflare 官网、协议和问卷入口

**Files:**
- Create: `G:\AI\GW\wujin-website-prototype\terms.html`
- Create: `G:\AI\GW\wujin-website-prototype\privacy.html`
- Create: `G:\AI\GW\wujin-website-prototype\license.html`
- Modify: `G:\AI\GW\wujin-website-prototype\index.html`, shared CSS and navigation
- Create: `G:\AI\GW\wujin-website-prototype\tests/legal-links.spec.js`
- Modify: `launcher-rs/config/links.json`

**Interfaces:**
- Static pages expose versioned `documentVersion`, `effectiveDate`, operator information, contact, refund, device binding, software scope, third-party services and data retention.
- Top navigation includes `有奖问卷调查` linking to `https://v.wjx.cn/vm/w9R7hCc.aspx`.
- Launcher links map `terms`, `privacy`, `license`, `purchase`, `docs`, `support`, and `website` to HTTPS URLs.

- [ ] **Step 1: Add website link tests.**

Assert every legal link returns a static page, the survey URL is exact, purchase copy says `当前授权版本永久使用`, and prohibited high-risk promotional phrases are absent.

- [ ] **Step 2: Write the three documents with fixed versions.**

Use real business主体、营业执照信息、联系方式和生效日期 before production publication. Explain that device public-key hashes and order/license IDs are used for activation, retention and deletion requests. Document the optional diagnostic upload fields, user-triggered consent, 30-day retention and deletion schedule. State free/paid boundaries separately.

- [ ] **Step 3: Add Cloudflare navigation and update links.**

Keep the website static on Cloudflare Pages. Do not add an authorization webpage or a Worker; the desktop client calls `api.codexpojia.com` directly during activation.

- [ ] **Step 4: Run website checks and commit the website repository separately.**

```powershell
cd G:\AI\GW\wujin-website-prototype
npm.cmd test -- tests/legal-links.spec.js
git add -- index.html terms.html privacy.html license.html tests
git commit -m "feat: add 2.0 legal pages and survey link"
```

---

## Task 10: 来源、许可证、上游变更报告与客户端更新提示

**Files:**
- Modify: `launcher-rs/src-tauri/resources/sources/upstreams.lock.json`
- Create: `launcher-rs/scripts/check-2.0-upstreams.ps1`
- Modify: `launcher-rs/free-skills/UPSTREAM_AUDIT.md`, `THIRD_PARTY_NOTICES.md`
- Modify: `launcher-rs/crates/wujin-core/src/update.rs`, `launcher-rs/ui/src/pages/UpdatePage.tsx`, `launcher-rs/ui/tests/update-page.test.js`
- Modify: `docs/ARCHITECTURE.md`, `docs/OVERVIEW_zh.md`

**Interfaces:**
- `check-2.0-upstreams.ps1 -RepositoryRoot <path>` exits non-zero when a pinned commit, license, release hash, or source file hash changes.
- The report includes repository URL, commit, release hash, imported files, excluded assets, license and last audit date.
- `check_for_update()` verifies the detached signature and exact schema of Cloudflare `latest.json`, compares semantic versions and returns only `upToDate` or `available` plus the packaged `website` link ID; there is no package-download or installer command in the 2.0 update surface.

- [ ] **Step 1: Add lock-file validation tests.**

Use local fixtures to detect missing license, changed hash, unpinned commit and forbidden runtime script.

- [ ] **Step 2: Implement the source checker.**

The checker reads the lock file, verifies local vendored files, records upstream changes without overwriting local code and produces a human-readable report. A new upstream commit never edits vendored code, changes a source lock, applies a theme, runs a script or alters a release build automatically.

- [ ] **Step 3: Lock the signed update-prompt contract.**

Use a signed exact-schema `latest.json` containing `schemaVersion`, `product`, `channel`, `version`, `publishedAt`, `releasePage` and no executable package URL. The client verifies the detached Ed25519 signature, product, stable channel, semantic version and HTTPS allowlisted release page, then renders `发现新版本` with one `前往官网更新` action. That action passes only link ID `website` to the Rust backend. Add tests proving invalid signatures, wrong products, downgrades, renderer-supplied URLs and package-shaped fields are rejected, and proving the client exposes no download, install, silent-update or third-party auto-merge command.

- [ ] **Step 4: Update architecture and notices.**

Document paid/free boundaries, API endpoints, WJD1, DPAPI/TPM, Provider, Skin, Installer, Cursor and NERV ownership. Preserve MIT notices for Codex-X and HeiGe sources and the licenses for existing free Skills. State that launcher updates are notice-only and third-party upstream changes are report-only until an audited source revision is explicitly selected for a later product release.

- [ ] **Step 5: Run the checker, update tests and commit.**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\check-2.0-upstreams.ps1 -RepositoryRoot G:\AI\520reverse-skill
cd launcher-rs\ui
npm.cmd test -- --runInBand tests/update-page.test.js
cd ..\..
git add -- launcher-rs docs
git commit -m "docs: lock wujin 2.0 third party sources"
```

---

## Task 11: 全量自动化验证与本机 Debug 验收

**Files:**
- Create: `launcher-rs/ui/tests/v2-commercial-flow.test.tsx`
- Create: `launcher-rs/ui/tests/diagnostic-upload.test.tsx`, `launcher-rs/crates/wujin-core/tests/diagnostic_redaction.rs`
- Modify: `launcher-rs/ui/src/pages/LogsPage.tsx`, `launcher-rs/ui/src/api.ts`
- Create: `launcher-rs/crates/wujin-core/src/diagnostics.rs`
- Create: `launcher-rs/crates/wujin-core/tests/v2_contracts.rs`
- Create: `launcher-rs/scripts/test-2.0-gate.ps1`
- Create: `launcher-rs/scripts/start-2.0-dev-client.ps1`
- Create: `docs/testing/2026-07-26-wujin-2.0-release-audit.md`

**Interfaces:**
- `test-2.0-gate.ps1 -SkipReleaseBuild` runs all Rust, UI, source-lock, API contract and website link tests without creating a distributable package.
- `start-2.0-dev-client.ps1 -CheckOnly` performs preflight; without the switch it starts hidden Vite and foreground `cargo run -p wujin-launcher`.

- [ ] **Step 1: Add the full matrix.**

Cover Windows 10/11 x64, 1120x720 and 390x844, fresh state, active WJP1, invalid WJP1, permanent offline WJD1, timed WJD1 before/after expiry, clock rollback, revoked license on next online refresh, no detected client, every supported client's user-owned config conflict, repair, rollback, cancellation, free-tool use without CDK, and agreement focus behavior. In every fixture, assert the paid selector retains exactly Claude, Codex, Kiro, Cursor, Cline and Windsurf with correct availability states; assert the top-right `官网` action remains visible and opens only the packaged `website` URL through the backend allowlist.

Add diagnostic fixtures containing WJP1/WJD1 tokens, Provider keys, bearer tokens, Windows usernames, absolute paths, device public keys, custom image names, raw config bodies and benign error events. Assert the preview/upload payload contains only allowlisted structured fields, is capped at 256 KiB, requires an explicit user click and returns a support reference ID. Server tests prove 30-day `delete_after` calculation and scheduled deletion.

- [ ] **Step 2: Run focused suites.**

```powershell
cd G:\AI\520reverse-skill\launcher-rs
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cd ui
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
```

- [ ] **Step 3: Run the 2.0 gate and source scan.**

```powershell
cd G:\AI\520reverse-skill
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-2.0-gate.ps1 -SkipReleaseBuild
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\check-2.0-upstreams.ps1 -RepositoryRoot G:\AI\520reverse-skill
```

The gate fails on private keys, complete CDK inventories, API tokens, Node runtime copies, unsigned theme assets, unpinned sources or modified `dist-rust` output.

- [ ] **Step 4: Start the local debug client.**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-2.0-dev-client.ps1
```

Keep the debug EXE open for owner testing. It must not run release packaging or update Cloudflare.

- [ ] **Step 5: Record owner acceptance.**

Record every page tested, all six AI-client cards and their availability states, the top-right `官网` action, every free/paid boundary, activation result, protocol version, Provider result, installer source, skin result, Cursor backup result, NERV result, error recovery and screenshot path in `docs/testing/2026-07-26-wujin-2.0-release-audit.md`.

- [ ] **Step 6: Commit the non-packaging gate.**

```powershell
git add -- launcher-rs/scripts launcher-rs/ui/tests launcher-rs/crates/wujin-core/tests docs/testing
git commit -m "test: close wujin 2.0 debug acceptance gate"
```

---

## Task 12: Release and handoff gate, only after “出包”

**Files:**
- Modify: `launcher-rs/scripts/build-release.ps1`, `verify-release.ps1`
- Create: `docs/releases/2.0.0.md`, `docs/releases/2.0.0-source-handoff.md`
- Modify: Cloudflare stable manifest only after owner approval

- [ ] **Step 1: Confirm the owner has explicitly said `出包`.**

No release command is valid before that exact approval.

- [ ] **Step 2: Build with separate public keys.**

Embed the WJP1 public key and WJD1 receipt public key separately from their private signing materials. Embed the update public key separately from both. Fail preflight on missing, duplicate or wrong-length keys.

- [ ] **Step 3: Generate release evidence.**

Produce EXE hash, SBOM, third-party notices, source lock report, payload hash, license compatibility report, Windows 10/11 install report and website manifest signature.

- [ ] **Step 4: Verify the release package.**

Scan for private keys, CDK inventories, `.env`, API tokens, `node_modules`, caches, debug paths and upstream unapproved assets. Run the complete paid/free isolation matrix against the built EXE.

- [ ] **Step 5: Publish only approved static metadata.**

Cloudflare Pages publishes the signed `latest.json` and `.sig`; the website remains responsible for Baidu, Quark and LZ download links. The client never downloads or executes a netdisk file.

- [ ] **Step 6: Write source handoff.**

Document launcher entry points, API contract, WJP1/WJD1, device identity, free/paid directories, third-party sources, license notices, Windows-only boundaries and the macOS handoff boundary.

---

## Definition of Done

- [ ] Every visible and runtime version surface reports `2.0.0`.
- [ ] White UI matches the approved prototype at desktop and mobile widths.
- [ ] The paid target selector always shows exactly Claude、Codex、Kiro、Cursor、Cline、Windsurf and prevents selection only for missing or unsupported clients without hiding their cards.
- [ ] A persistent top-right `官网` action is visible on every page and opens only `https://codexpojia.com` in the system default browser through the backend link allowlist.
- [ ] Free tools are reachable and usable before activation.
- [ ] Paid deployment is blocked in Rust before valid WJP1/WJD1 authorization and remains independent from free state.
- [ ] Agreement links, consent version and document hash are recorded before activation.
- [ ] TPM/DPAPI device identity is stable, private and represented server-side by `SHA256(device_public_key)`.
- [ ] `api.codexpojia.com` signs WJD1 receipts, supports idempotent activation and has backups, rate limits and health checks.
- [ ] Admin Key revocation is audited and takes effect on the client's next online activation/refresh while long-term offline behavior remains as documented.
- [ ] Claude、Codex、Kiro、Cursor、Cline、Windsurf all expose typed paid conflict detection and targeted repair with backup, fingerprint validation, readback and rollback.
- [ ] Provider secrets are DPAPI-protected and never returned to React or logs.
- [ ] Codex/Claude installation uses fixed official IDs and has deterministic detection and recovery.
- [ ] Skin engine and themes are pinned, licensed, original or user-provided, and verified after application.
- [ ] Cursor adapter has fixture coverage, backups, restore and version compatibility results.
- [ ] NERV is a signed managed package and never runs upstream deployment scripts at runtime.
- [ ] Third-party sources and licenses are reproducibly checked.
- [ ] The client validates a signed version-only update manifest, shows one website action for a newer version, and contains no software-update download or installation path; third-party upstream changes produce reports without modifying vendored code.
- [ ] Rust, UI, API, website, Playwright and Windows debug gates pass.
- [ ] No release package or Cloudflare release metadata is created before explicit `出包` approval.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-26-wujin-2-0-commercial-plan.md`. Two execution options:

1. **Subagent-Driven (recommended):** dispatch a fresh subagent per task and review after each independent slice.
2. **Inline Execution:** execute this plan in the current session with checkpoints.


