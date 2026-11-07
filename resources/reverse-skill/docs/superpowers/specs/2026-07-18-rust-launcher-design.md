# Rust 启动器重构设计

## 目标

将当前 `launcher` 的 Python + PySide6 + QML + Nuitka 实现迁移到 Rust + Tauri 2 + React/TypeScript，同时保持现有用户可见功能和配置契约：CDK 离线激活、payload 部署、tool-index 生成、六类 AI 客户端配置、备份、原子写入、回读验证、失败回滚、日志和帮助页面。

产品定位是 Windows 一键配置器：用户输入 CDK 激活产品，选择自己已安装的 AI 客户端，软件把 bundled `reverse-skill` 部署到用户目录，并只为所选客户端写入规则与 MCP 配置。它不安装第三方工具、不启动 MCP 服务、不执行逆向任务，也不替代 AI 客户端。Rust 版不得借重构机会重新设计界面；现有 QML 界面和交互是唯一产品基准。

当前正式 EXE 为约 `106.34 MiB`，主要体积来自 Qt/PySide6 运行时和 QML 插件树，而不是业务代码。Rust 版以明显小于当前产物为目标，暂按 `≤30 MiB` 追踪；功能等价优先于绝对体积。

## 决策

- UI 使用 Tauri 2 + React + TypeScript + Vite，不引入重量级 UI 组件库。
- Rust 使用模块化单体：纯业务核心、Windows 平台层、Tauri IPC 层和 UI 分离，最终仍交付一个 EXE。
- WebView2 作为 Windows 前置条件，不把 Runtime 打进 EXE，也不在一键流程中自动下载；缺失时启动前显示明确错误。
- Rust 版与 Python 版并行迁移，旧版在全部兼容门禁通过前保持可回退。
- 当前发布公钥文件固定为 `G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin`；同目录中的私钥和已签发 CDK 文件不得进入客户构建。
- 现有 `WJP1` CDK token、激活缓存、客户端路径、MCP 值、托管 Markdown 区块、备份目录和状态字符串保持兼容。
- CDK 协议单独冻结在 `docs/superpowers/specs/2026-07-18-cdk-cross-language-compatibility.md`；Rust verifier/issuer 必须通过 Python→Rust、Rust→Rust、Rust→Python 三向兼容门禁。

## 分层架构

```text
launcher-rs/
├── crates/wujin-core       纯 Rust 业务：许可证、payload、adapter、事务、模型
├── crates/wujin-windows    Windows 路径、UAC、原子替换、PowerShell、WebView2 检查
├── crates/wujin-issuer     运营侧 CDK 签发 CLI，不进入客户 EXE
├── crates/wujin-xtask      确定性 payload、SBOM 和发行构建辅助命令
├── src-tauri               Tauri 状态、命令、事件和启动组合层
└── ui                      React 页面、状态机、样式和端到端测试
```

`wujin-core` 不依赖 Tauri 或 Windows API，通过 `CommandRunner` 和 `AtomicReplacer` 等端口抽象平台行为。`src-tauri` 只暴露类型化命令，UI 不直接访问文件系统、环境变量或密钥。

## 数据流与接口

启动顺序固定为：解析参数 → 检查 WebView2 → 必要时 `runas` 重启 → 加载链接、公钥和激活缓存 → 检测客户端 → 创建 Tauri 窗口。用户流程固定为：检测并选择客户端 → 输入 CDK 离线激活 → 解锁一键配置 → 部署 payload → 刷新只读 tool-index → 配置所选客户端 → 回读验证并展示结果。

## UI 兼容硬门禁

- `launcher/app/qml/App.qml`、现有资源 SVG 和 `launcher/tests/test_ui_flow.py` 是 UI 的唯一事实来源。
- React 版必须保持同样的窗口结构、无边框标题栏、侧栏顺序、页面顺序、按钮文案、颜色、字体层级、间距、图标、渐变、laser sweep 动画、弹窗、滚动区域和日志布局。
- 必须保持同样的状态转移：客户端选择可在激活前完成；激活页的成功/失败弹窗、购买卡片、客服 QQ 复制、配置进度、结果页、帮助页和日志页行为不可改变。
- 不允许以“更现代”“更简洁”“更适合 Web”为理由改变布局、文案、导航、控件状态或交互路径。
- 每个现有 UI 测试必须有 React 状态测试或 Tauri 端到端测试对应；通过截图差异、尺寸/DPI、键盘焦点和动画状态门禁后才能切换构建入口。

Tauri 命令固定为：

```text
get_bootstrap_state() -> BootstrapState
activate_license(cdk: String) -> ActivationState
redetect_clients() -> Vec<ClientDetection>
configure_selected(ids: Vec<String>) -> ConfigurationSummary
restore_backup(request: RestoreRequest) -> RestoreResult
open_external_link(name: String) -> bool
```

配置过程通过 `configuration-progress` 事件发送阶段、客户端、日志级别、消息和进度。后台任务禁止并发执行；激活前、空选择、重复选择和未知客户端均拒绝。

配置编排固定为：

```text
deploy payload
  → refresh-tool-index.ps1
  → selected adapter: detect → backup → merge → validate → atomic commit
  → failure: restore backup
  → configuration summary
```

## 安全与兼容

- CDK 使用 Ed25519、URL-safe base64 无 padding、canonical JSON、版本规则和试用/永久授权校验。
- ZIP 解压拒绝绝对路径、`..` 穿越路径、符号链接和目标目录外写入。
- 备份必须位于 `%LOCALAPPDATA%\无限破甲\backups`，恢复目标必须位于原始用户目录。
- JSON/TOML 通过解析器合并，MCP 冲突不覆盖用户值。
- 写入先临时文件和回读验证，再使用 Windows 原子替换。
- CSP 只允许本地资源，外链只允许配置文件中的 HTTPS URL。

## 测试与发布验收

当前 Python 版本的 76 个测试场景转为 Rust 兼容测试和固定 fixture，覆盖许可证、payload、路径穿越、六类 adapter、幂等、冲突、回滚、权限和 UI 状态机。

发布构建必须执行 `cargo fmt`、`cargo clippy -D warnings`、workspace tests、payload 往返哈希、manifest 校验、SBOM/许可证生成、SHA-256 和依赖排除扫描。Win10/11 需要额外验证 WebView2、UAC、完全断网、DPI、失败注入和恢复备份。
