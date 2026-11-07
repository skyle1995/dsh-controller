# 无限破甲 EXE 一键配置器方案

## 1. 项目目标

**无限破甲** 是面向付费用户正式销售的 Windows 桌面一键配置器，用于把 `reverse-skill` 项目部署到用户本机，并安全接入用户选定的 AI Agent。

本方案定义的是可交付、可签名、可销售和可售后的 **商业 v1**，不是内部原型。任何商业发布构建都必须通过本文规定的功能、兼容性、安全性和第三方许可证门禁。

核心目标不是“单纯解压资源包”，而是让用户输入第三方网站购买的 CDK 后，一键完成：

1. 部署 `reverse-skill` skill pack。
2. 生成本机 `tool-index.md` / `tool-index.json`。
3. 根据用户多选的 AI 客户端，备份并安全合并项目规则和 MCP 配置。
4. 验证 AI 客户端配置可解析、路径正确且能引用已安装的 `reverse-skill`。
5. 只读检测本机已有工具并给出使用说明，不下载、不安装、不更新任何第三方软件。
6. 展示详细配置状态、使用说明、日志和失败项修复指引。

---

## 2. 已确认决策

| 项目 | 决策 |
|---|---|
| 软件名称 | 无限破甲 |
| 交付形态 | 单文件 EXE |
| 目标系统 | Windows 10 / Windows 11 x64 |
| 技术栈 | Python + PySide6 + QML + Nuitka |
| GUI 框架 | zhuzichu520/FluentUI，发布版本固定 commit |
| UI 风格 | Win11 Fluent，无边框现代窗口 |
| CDK 来源 | 第三方网站售卖 CDK |
| CDK 校验 | 每单不同的永久 CDK，私钥签发、公钥离线验签，不绑定设备、不强防共享 |
| 更新策略 | v1 暂不做在线更新 |
| 权限策略 | v1 一键执行不提权；只写当前用户的 `%LOCALAPPDATA%`、`%USERPROFILE%`、`%APPDATA%` 配置 |
| 项目目标目录 | `%LOCALAPPDATA%\无限破甲\reverse-skill\` |
| AI 客户端 | Claude / Codex / Kiro / Cursor / Cline / Windsurf |
| AI 配置策略 | 允许多选客户端；先备份，再结构化合并项目规则和 MCP 配置，校验通过后原子替换 |
| 工具检测策略 | 仅生成项目所需的本机工具索引；不下载、不安装、不更新、不启动 |
| reverse-skill 文件 | 部署后可见、可修复、便于 AI 读取 |
| 配置结果 | GUI 展示项目部署、AI 配置、备份、验证状态和日志 |
| 恢复边界 | 管理安装器自身文件和它修改过的 AI 配置备份；不管理第三方软件 |
| 商业发布 | Windows 代码签名、许可证清单、SBOM、EULA 和隐私说明齐备后方可销售 |

---

## 3. 推荐 EXE 架构

虽然交付给用户是单文件：

```text
无限破甲.exe
```

但程序内部按多模式拆分：

```text
无限破甲.exe
  ├─ GUI Mode
  │  ├─ 激活页面
  │  ├─ 一键配置页面
  │  ├─ 配置结果页面
  │  ├─ AI 客户端配置页面
  │  ├─ 使用说明页面
  │  ├─ 日志页面
  │  └─ 设置 / 修复页面
  │
  ├─ Config Guide Mode
  │  ├─ 备份并配置 Claude
  │  ├─ 备份并配置 Codex
  │  ├─ 备份并配置 Kiro
  │  └─ 备份并配置 Cursor / Cline / Windsurf
  │
  └─ Verify Mode
     ├─ 校验项目文件和 tool-index
     ├─ 回读选定 AI 客户端配置
     ├─ 校验托管区块、路径和配置格式
     └─ 输出每个客户端的配置结果
```

这样既保持单文件交付，又避免所有逻辑塞进 GUI 主线程。

---

## 4. GUI 技术方案

### 4.1 GUI 技术栈

```text
Python 3.11 / 3.12
PySide6
QML
zhuzichu520/FluentUI
Nuitka
```

GUI 依赖：

- <https://github.com/zhuzichu520/FluentUI>

商业构建不得直接跟随 `main`。每个发布版本必须固定经过测试的 commit，并保存其 MIT `License`、`THIRD_PARTY_COPYRIGHT.txt`、源码地址和 commit 信息。构建时实际使用的 commit 必须记录在 SBOM 和“第三方许可证”页面中。

### 4.2 GUI 目录结构

```text
launcher/
  app/
    main.py
    bridge/
      installer_bridge.py
      license_bridge.py
      config_status_bridge.py
      client_config_bridge.py
      log_bridge.py
    qml/
      App.qml
      pages/
        ActivationPage.qml
        ConfigurePage.qml
        ConfigStatusPage.qml
        ClientsPage.qml
        GuidePage.qml
        LogsPage.qml
        SettingsPage.qml
    resources/
      reverse-skill.zip
      icons/
      fonts/
  build.ps1
  requirements.txt
```

### 4.3 页面设计

| 页面 | 功能 |
|---|---|
| 激活页 | 输入第三方网站购买的 CDK，离线校验 |
| 一键配置页 | 释放 reverse-skill、刷新 tool-index、备份并配置选定 AI 客户端 |
| AI 客户端页 | 展示 Claude / Codex / Kiro / Cursor / Cline / Windsurf 配置状态 |
| 配置结果页 | 展示项目路径、客户端配置目标、备份和回读验证结果 |
| 使用说明页 | 通过页内切换展示快速开始、AI 接入、项目用法和故障排查 |
| 日志页 | 实时 stdout / stderr / exit code / 日志文件路径 |
| 设置页 | 安装目录、恢复备份、重新检测、手动修复指引 |

### 4.4 使用说明页交互

“使用说明”必须是侧栏中的独立页面，激活前后都可访问，不能只提供外部文档链接。页面顶部使用页内切换控件，至少包含：

`docs/wujin-installer-prototype.html` 仅用于演示信息架构、页面切换和状态变化，不执行 CDK 验签、文件写入、配置合并、命令调用或系统操作，也不能作为真实安装能力的验收证据。

| 切页 | 必备内容 | 必备操作 |
|---|---|---|
| 快速开始 | 激活、选择客户端、一键配置、重启客户端、验证五步流程 | 跳转到当前未完成步骤 |
| AI 接入 | 所选客户端的规则文件、MCP 文件、备份路径和验证结果 | 打开配置、恢复备份、返回客户端选择 |
| 项目用法 | 如何触发项目路由、如何描述任务、工具缺失时的行为 | 复制示例任务、打开项目目录 |
| 故障排查 | 配置格式错误、权限不足、客户端版本不兼容和工具缺失的修复步骤 | 恢复备份、打开日志页、复制诊断、导出日志 |

交互规则：

- 用户完成一键配置后，主按钮切换为“查看使用说明”，进入“快速开始”并定位到“重启客户端并验证”。
- 使用说明根据实际安装状态显示“未开始 / 待处理 / 已完成”，不得展示与实际状态无关的静态成功标记。
- AI 接入切页展示安装器实际写入内容、备份路径和验证结果，并提供恢复备份操作。
- 外部官网、购买页、在线文档和售后地址由统一链接配置提供；链接缺失时按钮禁用并显示原因，不得跳到占位地址。
- 所有页内切换、客户端选择和图标按钮必须支持键盘焦点、可访问名称和 100% / 125% / 150% DPI。

---

## 5. 项目目录设计

默认目录：

```text
%LOCALAPPDATA%\无限破甲\
```

具体结构：

```text
%LOCALAPPDATA%\无限破甲\
  reverse-skill\
    README.md
    README_AI.md
    RULES.md
    skills\
    CTF-Sandbox-Orchestrator\
    burp-mcp-full\
    docs\
    kali\

  config\
    app.json
    clients.json

  license\
    activation.json

  backups\
    claude\
    codex\
    kiro\

  logs\
    install-yyyyMMdd-HHmmss.log
    configure-yyyyMMdd-HHmmss.log
    verify-yyyyMMdd-HHmmss.log
```

说明：

- `reverse-skill` 项目本身支持放任意目录。
- 项目会通过 `README_AI.md` / `RULES.md` 所在路径识别 `<SKILL_ROOT>`。
- 安装器不会向 `%USERPROFILE%\Tools\...` 或系统程序目录安装任何第三方软件。

---

## 6. CDK 激活方案

### 6.1 流程

1. 用户在第三方网站购买 CDK。
2. 打开 `无限破甲.exe`。
3. 输入 CDK。
4. 软件离线校验 CDK 是否有效。
5. 激活成功后写入带完整性校验的本机激活缓存。
6. 解锁“一键配置”功能。

### 6.2 纯离线限制

纯离线 CDK 无法可靠阻止同一个 CDK 被复制给多人使用。

v1 接受该限制，目标是降低普通未授权使用门槛，而不是强防共享。

### 6.3 CDK 签发边界

商业 v1 使用非对称签名：

- 运营侧批量签发 CLI 持有私钥，私钥不得进入用户 EXE、源码发布包或构建日志。
- 每笔订单生成不同的随机永久 CDK，CDK 携带产品标识、版本规则、唯一序列号和签名。
- 用户端 EXE 只内置公钥并执行离线验签，不能生成有效 CDK。
- 签发 CLI 输出第三方销售网站可批量上传的 TXT/CSV，并另存订单追踪清单。
- v1 不支持联网撤销、设备绑定或可靠防共享；不得在销售页面宣传这些能力。

### 6.4 后续可升级方向

如果未来需要防共享，可升级为：

```text
首次联网绑定 Machine ID，之后离线使用
```

---

## 7. 一键配置流程

用户点击“一键配置”后，按顺序执行：

### 7.1 安装 reverse-skill

1. 检查 CDK 激活状态。
2. 解压内嵌 `reverse-skill.zip` 到：

```text
%LOCALAPPDATA%\无限破甲\reverse-skill\
```

3. 如已有旧版本，采用原地覆盖：覆盖同名项目文件并保留额外文件。
4. 覆盖前生成版本与文件清单；关键文件内容与上一安装版本不一致时先备份，再覆盖。

### 7.2 校验 skill payload

仓库中的 manifest 路径为：

```text
G:\AI\520reverse-skill\skills\scripts\bootstrap-manifest.json
```

`tool-index` 读取 bootstrap manifest 展示本机能力，因此构建和运行前仍必须执行阻断式 JSON 和必填字段校验。安装器不得调用 manifest 中的安装命令。

构建和运行前都必须校验：

```powershell
Get-Content "<SKILL_ROOT>\skills\scripts\bootstrap-manifest.json" -Raw | ConvertFrom-Json
```

如果失败，GUI 显示具体错误并阻止继续写 AI 配置。

Windows 10 / 11 自带的是 Windows PowerShell 5.1。所有包含非 ASCII 字符且会由 `powershell.exe` 调用的 `.ps1` 必须保存为 UTF-8 BOM，或者构建产物必须内置并显式调用经过验证的 PowerShell 7；商业 v1 当前采用 UTF-8 BOM 兼容 Windows PowerShell 5.1。

### 7.3 生成 tool-index

执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<SKILL_ROOT>\skills\scripts\refresh-tool-index.ps1"
```

预期生成：

```text
<SKILL_ROOT>\skills\tool-index.md
<SKILL_ROOT>\skills\tool-index.json
```

### 7.4 备份并配置 AI 客户端

用户可多选一个或多个客户端。安装器只处理被选中的客户端，并使用客户端 adapter 执行 `detect → backup → apply → validate → commit/rollback`。一键成功要求每个选中客户端都得到明确结果，不能以“已生成模板”冒充“已配置”。

通用写入规则：

1. 目标文件不存在时创建父目录和新文件。
2. 目标文件存在时先复制到 `%LOCALAPPDATA%\无限破甲\backups\<client>\<timestamp>\`，记录原文件 SHA-256、大小和路径。
3. Markdown 类规则文件使用 `BEGIN/END WUJIN REVERSE-SKILL` 托管区块；重复执行只更新该区块，不重复追加。
4. JSON / TOML 只能通过对应解析器结构化合并，不允许字符串拼接。现有文件无法解析时，该客户端失败并保留原文件。
5. 新内容先写同目录临时文件，回读校验后通过原子替换提交；校验失败立即恢复备份。
6. 不删除、不重排安装器托管区块之外的用户内容，并尽量保留原编码和换行风格。
7. 写入后验证文件可解析、托管区块唯一、`<SKILL_ROOT>` 为绝对路径且目标文件存在。
8. 配置结果必须显示目标路径、备份路径、写入方式、验证结果和恢复按钮。

#### Claude

在以下规则文件中创建或更新安装器托管区块：

```text
%USERPROFILE%\.claude\CLAUDE.md
```

托管区块要求 Claude 在逆向、安全和 CTF 任务中先读取 `<SKILL_ROOT>\RULES.md` 与 `<SKILL_ROOT>\README_AI.md`。项目 MCP 条目结构化合并到：

```text
%USERPROFILE%\.claude\mcp.json
```

#### Codex

在以下规则文件中创建或更新安装器托管区块：

```text
%USERPROFILE%\.codex\AGENTS.md
```

项目 MCP 条目通过 TOML 解析器结构化合并到：

```text
%USERPROFILE%\.codex\config.toml
```

#### Kiro

创建或更新以下独立 steering 文件，并保持 `inclusion: auto` frontmatter：

```text
%USERPROFILE%\.kiro\steering\reverse-routing.md
%USERPROFILE%\.kiro\settings\mcp.json
```

#### Cursor / Cline / Windsurf

这些客户端的全局规则可能由设置 UI、扩展 global storage 或版本相关文件管理。商业 v1 必须为每个固定版本建立经过实机验证的 adapter：

- adapter 能稳定解析目标格式时，执行同样的备份、结构化合并、回读验证和回滚流程。
- adapter 无法确认稳定路径或格式时，不得猜测路径、修改 SQLite/global storage 或宣称配置成功。
- 发布版本只允许用户勾选已通过 adapter 实机验收的客户端版本；检测到不支持版本时禁用该选项并显示支持范围。
- Cursor / Cline / Windsurf 若任一项没有可重复验证的一键配置 adapter，就不能在商业 v1 销售页面宣称支持该客户端。

### 7.5 MCP 配置边界

一键配置可以向所选 AI 客户端写入项目需要的 MCP 配置，但配置与运行必须严格分离：

- 安装器只合并配置文件，不执行 MCP command，不探测拉起进程，不启动本地服务。
- `anything-analyzer`、`idapro` 等本地 HTTP 条目可以写入固定地址，但状态明确显示“仅已配置，服务是否可用未验证”。
- `burpsuite` 等项目内 bridge 可以写入 `<SKILL_ROOT>` 下的绝对路径，但不执行 `node`。
- `npx -y ...@latest` 等可能在客户端启动时下载包的条目默认不自动启用；只在使用说明中生成待确认片段，避免用户重启 AI 后发生隐式下载。
- 现有同名 MCP 条目与安装器模板不一致时不得静默覆盖；该客户端标记为“存在冲突”，由用户选择保留现有配置或使用产品配置。
- 一键结果必须分别显示“规则已配置”和“MCP 已配置 / 待确认 / 冲突”，不能合并成模糊的成功状态。

### 7.6 基础配置能力门禁

基础门禁验证项目 payload 能否离线部署、建立索引并供后续 AI adapter 使用。构建前必须执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<SOURCE_ROOT>\scripts\validate-wujin-base-install.ps1"
```

脚本必须在隔离的 `%TEMP%` staging 中完成以下检查：

1. 核对全部交付 payload，包括各语言 README、`RULES.md`、`CLAUDE.md`、`scripts/`、`skills/`、项目图片、GPLv3 对应源码和其他必需目录。
2. 解析 `bootstrap-manifest.json`，校验 capability 唯一性和生成工具索引所需的必填字段。
3. 使用 Windows PowerShell 5.1 解析索引生成所需 `.ps1`，阻断编码或语法不兼容。
4. 生成 `reverse-skill.zip`，解压到模拟安装目录，并逐文件比较 SHA-256；文件数和内容必须一致。
5. 从模拟安装目录执行 `refresh-tool-index.ps1`，并解析生成的 Markdown / JSON。
6. 校验 `tool-index.json` 的 `tools` 和 `capabilities` 结构及数量关系。
7. 扫描安装器一键执行路径，确认不调用 `bootstrap-reverse.ps1`、`winget`、`pip`、`npm`、`npx`、`git`、`go` 或 `docker`。
8. 在隔离假用户目录中验证每个 AI adapter 的创建、合并、幂等、备份、回滚和仅处理已选客户端。
9. 无论成功或失败都清理 staging；只有显式诊断参数才允许保留现场。

基础门禁成功只能说明 skill pack 可正确打包、释放、读取和建立索引。一键配置成功还要求所有选中且支持自动写入的 AI adapter 验证通过。GUI 必须分别展示：

```text
Skill Pack：安装成功 / 校验失败
AI 配置：已配置 / 版本不支持 / 失败并已回滚
本机工具：已检测 / 未检测到（只读，不负责安装）
```

2026-07-11 当前仓库基线已在 Windows PowerShell 5.1 完成一次隔离验证：payload 打包解压哈希一致，并成功生成 29 项工具索引。上述数量仅为本次验证证据，不得硬编码为未来版本断言。AI adapter 的隔离测试必须在 launcher 实现后加入同一门禁。

---

## 8. tool-index 诊断边界

商业 v1 不调用 `bootstrap-reverse.ps1`，不执行任何包管理器或下载器，也不提供工具安装页面。`refresh-tool-index.ps1` 只生成供项目路由和诊断使用的本机索引。

`tool-index` 的产品边界：

- 已检测到的命令只记录版本、解析路径和关联 skill。
- 未检测到的命令标记为不可用，不影响项目部署和 AI 配置成功状态。
- 使用说明可以解释工具缺失对具体任务的影响，但不提供自动安装按钮。
- 修复或重新配置时可以重新生成索引，但不得触发下载、更新、安装或服务启动。

安装器进程及其子进程出现 `winget`、`pip`、`npm`、`npx`、`git clone`、`go install`、`docker pull` 或网络下载行为时，一键流程测试必须失败。

---

## 9. 权限与执行策略

### 9.1 最小权限

一键配置只写当前登录用户可写目录，不申请 UAC，不启动管理员 worker。任何需要管理员权限的路径都不在商业 v1 支持范围内。

### 9.2 原始用户上下文

配置、日志和激活缓存必须写入当前登录用户目录。

需要保存并传递：

```text
原始 USERPROFILE
原始 APPDATA
原始 LOCALAPPDATA
```

否则会写错配置位置。

---

## 10. Nuitka 构建方案

### 10.1 requirements.txt

建议：

```text
PySide6
Nuitka
ordered-set
zstandard
cryptography
```

如使用 FluentUI Python/QML 包装，根据实际项目补充依赖。

### 10.2 build.ps1

构建脚本职责：

1. 校验 Python 版本。
2. 安装依赖。
3. 生成 `reverse-skill.zip`。
4. 校验 `bootstrap-manifest.json`。
5. 调用 Nuitka 构建。
6. 输出 `dist\无限破甲.exe`。
7. 运行 smoke test。

### 10.3 输出

```text
G:\AI\520reverse-skill\dist\无限破甲.exe
```

---

## 11. 测试计划

### 11.1 激活测试

| 场景 | 预期 |
|---|---|
| 正确 CDK | 激活成功 |
| 错误 CDK | 拒绝激活 |
| 过期 CDK | 拒绝激活 |
| 篡改激活缓存 | 拒绝加载 |

### 11.2 基础配置测试

| 场景 | 预期 |
|---|---|
| 干净 Win10 x64 | 可离线部署项目并配置所选 AI |
| 干净 Win11 x64 | 可离线部署项目并配置所选 AI |
| 已存在旧 reverse-skill | 关键改动文件备份后原地覆盖同名文件，保留额外文件 |
| PowerShell 执行策略受限 | 使用 `-ExecutionPolicy Bypass` 正常执行 |
| Windows PowerShell 5.1 | 含中文的关键 `.ps1` 可解析并运行，无编码 `ParserError` |
| 基础 staging 门禁 | ZIP 解压前后文件数及 SHA-256 一致，索引 JSON 可解析 |
| 完全断网 | 项目释放和 AI 配置仍可完成，无第三方软件下载请求 |
| 未勾选客户端 | 该客户端任何文件均不创建、不修改、不备份 |

基础 staging 通过后，仍必须在干净 Win10 / Win11 VM 中分别执行 AI 客户端配置测试。测试机没有任何逆向工具也必须能完成一键配置。

### 11.3 客户端配置测试

| 客户端 | 预期 |
|---|---|
| Claude | 备份并幂等更新 `CLAUDE.md` 托管区块，用户原内容保持不变 |
| Codex | 备份并幂等更新 `AGENTS.md` 托管区块，用户原内容保持不变 |
| Kiro | 创建或更新独立 steering 文件，frontmatter 和路径验证通过 |
| Cursor | 支持范围内版本自动写入并验证；范围外版本不可勾选 |
| Cline | 支持范围内版本自动写入并验证；范围外版本不可勾选 |
| Windsurf | 支持范围内版本自动写入并验证；范围外版本不可勾选 |

所有客户端必须覆盖：空目录首次配置、已有用户内容、重复执行幂等、只选单个客户端、目标文件只读、非法结构化配置、写入中断、回读失败和一键恢复备份。

### 11.4 禁止软件下载测试

| 场景 | 预期 |
|---|---|
| 监控子进程 | 不出现 `winget`、`pip`、`npm`、`npx`、`git`、`go`、`docker` |
| 监控文件写入 | 不写 `%ProgramFiles%`、系统目录或 `%USERPROFILE%\Tools` |
| 监控网络 | 除用户主动点击官网、购买或售后链接外，一键配置无下载请求 |
| 本机没有逆向工具 | 一键配置仍成功，`tool-index` 将工具标记为不可用 |
| 已有本机工具 | 只读记录路径和版本，不更新、不启动、不修改工具配置 |

工具是否存在不得改变项目文件和 AI 配置的成功状态。

### 11.5 GUI 测试

- Win10 / Win11。
- 100% / 125% / 150% DPI。
- 无边框窗口拖动、缩放、最大化、最小化。
- 深色主题。
- 日志实时滚动。
- 使用说明可从侧栏独立进入，四个页内切页均可键盘操作。
- 配置完成后“查看使用说明”定位到重启客户端和验证步骤。
- 官网、购买、在线文档和售后链接由发布配置注入，不含 `example.com` 等占位地址。
- Nuitka 单文件打包后 QML / 字体 / 图标不丢失。

---

## 12. 商业发布门禁与履约要求

### 12.1 FluentUI 商业分发

GUI 使用：

```text
https://github.com/zhuzichu520/FluentUI.git
```

当前核验为 MIT License，允许商业使用和闭源分发。正式构建必须：

- 固定并记录实际使用的 commit，不允许构建时追踪 `main`。
- 在安装目录和“第三方许可证”页面保留 MIT `License` 与 `THIRD_PARTY_COPYRIGHT.txt`。
- 在每次升级依赖时重新核验许可证和第三方版权文件。
- 如发布前核验结果不再满足商业分发条件，构建必须失败，不得发布。

### 12.2 GPLv3 子项目履约

商业 EXE 内嵌完整仓库，其中 `CTF-Sandbox-Orchestrator/` 采用 GPLv3。商业收费不免除 GPLv3 义务。正式 v1 必须：

- 随安装内容提供所分发 GPLv3 组件的完整对应源码。
- 保留 GPLv3 许可证、原始版权声明和第三方声明。
- 对发行方修改过的 GPLv3 文件提供清晰修改记录和构建说明。
- 不对对应源码施加额外的访问限制或禁止再分发条款。
- 在 EULA 中明确第三方开源组件仍适用各自许可证，EULA 不覆盖其权利。

### 12.3 许可证清单和 SBOM

构建脚本必须生成机器可读 SBOM 和人类可读的第三方许可证清单，至少记录组件名称、版本或 commit、来源 URL、许可证、是否内嵌、修改状态和对应源码位置。任何内嵌组件缺少许可证、版本、来源或必要源码时，商业构建必须失败。

### 12.4 基础 payload 防回归

构建和运行前必须验证 payload ZIP 往返哈希、关键文件、PowerShell 5.1 索引生成、manifest 基础字段和 `tool-index.json` 结构。失败时阻止 AI 配置并显示日志路径。`scripts\validate-wujin-base-install.ps1` 是构建阻断门禁，不得仅作为人工检查命令保留。

### 12.5 纯离线 CDK 防共享弱

v1 接受此限制。

如要防共享，后续改成：

```text
首次联网绑定 Machine ID
```

### 12.6 AI 配置写入风险

不同客户端版本可能改变配置路径和格式。安装器必须采用版本化 adapter、写前备份、结构化合并、原子替换和回读验证。无法确认格式时标记“版本不支持”并禁止勾选，不得猜测路径或覆盖用户内容。修复和卸载只恢复安装器托管区块或用户选择的备份，不删除其他配置。

### 12.7 正式销售材料

销售构建必须具备：

- 受信任证书生成的 Windows Authenticode 签名和可验证时间戳。
- 产品版本、发布说明、SHA-256 和可追溯构建记录。
- EULA、隐私说明、第三方许可证页面和 GPLv3 对应源码入口。
- 明确说明 CDK 为永久离线授权，但不支持撤销、设备绑定或可靠防共享。
- 明确说明一键配置不会下载、安装、更新或启动任何第三方软件。
- 可从 Windows“已安装的应用”调用卸载入口；卸载范围仅限产品文件和安装器托管的 AI 配置区块。

---

## 13. 商业 v1 实施顺序

1. 固定 FluentUI commit，建立第三方许可证清单、SBOM 和对应源码归档流程。
2. 接入 `validate-wujin-base-install.ps1`，为 payload、PowerShell 5.1、ZIP 哈希和 tool-index 增加构建门禁。
3. 新建 `launcher/` Python 项目并跑通 PySide6 + FluentUI QML。
4. 实现运营侧批量 CDK 签发 CLI、测试向量和用户端公钥离线验签。
5. 实现 reverse-skill 内嵌、文件清单、关键文件备份和原地覆盖。
6. 实现 `refresh-tool-index.ps1` 调用、结构校验和日志输出。
7. 实现 AI 客户端多选、版本化 adapter、备份、幂等合并、原子写入、回读验证和恢复。
8. 实现“使用说明”独立页面及快速开始、AI 接入、项目用法、故障排查四个切页。
9. 实现配置结果页，区分 skill pack、已配置客户端、版本不支持客户端和已回滚失败。
10. 实现只读 `tool-index.json` 生成，不提供第三方软件下载或服务启动入口。
11. 实现自身修复、AI 配置备份恢复、卸载和日志导出。
12. 使用 Nuitka 构建并生成版本信息、SBOM、许可证清单、SHA-256 和发布归档。
13. 接入 Authenticode 代码签名及可信时间戳，验证安装与卸载入口。
14. 在干净 Windows 10/11 x64 VM 完成断网端到端、DPI、失败注入、配置合并和回滚测试。
15. 完成 EULA、隐私说明、第三方许可证页面、发布说明和售后修复文档。

## 14. 商业 v1 发布验收

只有以下条件全部满足，产物才允许标记和销售为正式商业 v1：

1. CDK 签发私钥未进入用户 EXE、源码归档、日志或 CI 构建产物。
2. 正确、错误、伪造、截断及篡改 CDK 测试全部通过。
3. 安装器只修改用户明确勾选的 AI 客户端，并为每次修改生成可恢复备份。
4. 所有自动写入 adapter 通过结构化合并、幂等、原子写入、回读验证和失败回滚测试。
5. 基础 staging 门禁通过：payload ZIP 往返哈希一致、Windows PowerShell 5.1 兼容、索引可生成。
6. FluentUI MIT 文件、GPLv3 完整对应源码、许可证和修改记录随产品可访问。
7. SBOM 与实际 EXE、内嵌仓库和 Python/QML 依赖一致。
8. EXE 具有有效 Authenticode 签名和可信时间戳，发布 SHA-256 已记录。
9. 干净 Windows 10/11 x64 VM 的部署、配置、修复、覆盖升级和卸载测试通过。
10. 100%、125%、150% DPI 下无文字溢出、控件重叠或无法操作的问题。
11. 完全断网且没有任何逆向工具时，一键项目配置仍可完成。
12. 一键流程没有第三方软件下载、安装、更新、服务启动或 UAC 提权行为。
13. 使用说明独立页面、四个切页、复制操作和状态跳转均通过键盘与 DPI 验收。
14. EULA、隐私说明、第三方许可证、GPLv3 源码入口和售后指引均可从 GUI 查看。

任一门禁未通过时，构建只能标记为测试版，不得对外销售为正式 v1。

---

## 15. 结论

最终方案：

```text
无限破甲.exe
= Python + PySide6 + FluentUI/QML + Nuitka
+ 第三方 CDK 离线激活
+ reverse-skill 项目文件一键部署
+ 选定 AI 客户端的一键安全配置
+ 配置备份、回读验证与失败回滚
+ 第三方软件零下载、零安装、零启动
+ 内置使用说明与状态化操作指引
+ 详细状态页和日志
```

优先保证：

1. 用户体验一键化。
2. AI 客户端能真实读取 `reverse-skill`。
3. 配置失败可诊断、可恢复、可售后。
4. 后续能扩展在线更新和联网授权。
5. 满足第三方许可证、代码签名、SBOM、EULA、隐私说明和双系统验收要求，可作为正式商业 v1 销售。
