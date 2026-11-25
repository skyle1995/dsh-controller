# DSH Controller CLI

DeepSeek Harness 的**纯命令行管理器**。管理破甲补丁、红队/逆向技能包、dsh 插件与私有源访问。
零第三方依赖,只用 Node.js 内置模块。

仓库: <https://github.com/skyle1995/dsh-controller>(2026-11 由自建 Gitea 迁入,历史提交与 tag 完整保留;
克隆、安装与 issue 一律使用该地址,旧 Gitea 地址不再维护)

- 交互式 TUI:方向键移动、空格勾选、回车确认、q 返回,局部重绘不闪屏
- 非交互命令:可脚本化、可管道、带退出码
- 平台:Windows(官方桌面安装)、macOS；Linux 可用 `DSH_APP_ROOT` 指定桌面安装
- Node.js ≥ 18

---

## 一、安装

### Windows 环境

安装 Node.js 18 或以上版本及 Git，使用 PowerShell 或 Windows Terminal 运行上面的 Node/npm 命令。
安装定位优先使用显式配置，其次读取 PATH 中的 `dsh.cmd`、卸载注册表及常见用户安装目录。
中文、空格路径及插件来源中的 `&` 不会经过 shell 拼接。
CLI 兼容官方直接入口和插件生成的 `%entry%` 回退脚本，优先读取 `app.asar.unpacked` 或
`app` 中的实体入口；仅有 `app.asar` 时由 Electron 读取归档入口，不执行批处理脚本。

使用便携版、自定义目录或多实例时，可显式设置：

```powershell
$env:DSH_APP_ROOT = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek'
# 可选：指定独立数据目录，未设置时使用用户目录下的 .dsh
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh'
node cli/index.mjs status
```

请将 `DSH_APP_ROOT` 设置为实际安装根目录，其中应包含桌面 exe 和 `resources`。
显式指定的目录无效时会报告未找到安装，不会自动操作另一个实例。
Windows 卸载、换包前需要从托盘完全退出 DeepSeek；关闭窗口可能仅隐藏到托盘。
控制器不会自动强杀桌面应用。权限不足时应使用有安装目录写权限的终端，换包的管理员授权需要用户确认。

profile 的 `package.json` 若带 UTF-8 BOM，插件安装、卸载和版本豁免操作会在执行前后校验并修复。
修复只去掉 BOM，保留原始字节备份 `package.json.bom-bak`；非法 JSON 不会被自动改写。
这不能证明 BOM 一定由官方 CLI 产生，PowerShell、编辑器或其他脚本也可能写入 BOM。

若安装提示 `ENOENT`，请检查现有插件的 `file:` 来源。不要把发布来源放在
profile 的 `node_modules` 中：pnpm 重建目录时可能清掉源包，从而阻塞任何插件安装。
已安装文件仍完整且包具有明确发布清单时，可在完全退出桌面后运行：

```powershell
node cli/index.mjs plugins repair dsh-plugin-repo
```

恢复会保留现有版本，把发布文件打成持久 tarball，并备份 profile；
先只替换目标依赖的来源，再交给官方 CLI 同步锁文件。归档排除嵌套 `node_modules`。
若同步失败，持久来源与备份仍保留，不自动还原已失效路径。
遇到 `ERR_PNPM_EPERM` 时先完全退出桌面再试，不应直接删除插件目录或放宽系统权限。

Windows 下控制器会在插件安装、卸载或修复前检查桌面进程，要求完全退出后再操作。
在线目录的 Git 子目录插件会先在独立临时目录检出，校验已构建的发布文件后生成持久 tarball，
再交给官方 CLI 安装，不依赖 profile 的 `node_modules` 存放 Git 源码。
此过程记录检出的提交，不自动执行仓库构建脚本或修改 `allowBuilds`；发布文件缺失时停止并报告。
若日志先报 `ENOENT`，随后追加通用构建授权建议，控制器会优先报告文件来源错误。
更新控制器代码后请关闭旧的 `dshc` 界面，再运行 `node cli/index.mjs`，旧进程不会热加载修改。

### 方式 A:克隆 + 本地链接(推荐)

```bash
git clone https://github.com/skyle1995/dsh-controller.git
cd dsh-controller
npm link            # 注册 dshc 命令到 PATH
dshc                # 启动
```

### 方式 B:不安装,直接用

```bash
git clone https://github.com/skyle1995/dsh-controller.git
cd dsh-controller
node cli/index.mjs          # 交互界面
node cli/index.mjs status   # 单条命令
```

### 方式 C:安装到 Node.js 全局(推荐日常使用)

装进 Node 全局目录(`npm prefix -g`)。用本地目录安装时 npm 会建立目录链接(Windows 为 junction),仓库改动立即生效;需要脱离仓库独立运行请用下面的 tarball 方式:

```bash
# 1) 从本地目录安装
cd dsh-controller
npm install -g .

# 2) 直接从 GitHub 安装(公开仓库无需凭证)
npm install -g git+https://github.com/skyle1995/dsh-controller.git

# 3) 从 tarball 安装(离线/分发)
cd dsh-controller && npm pack          # 产出 dsh-controller-0.2.4.tgz
npm install -g ./dsh-controller-0.2.4.tgz
```

验证:

```bash
which dshc        # /opt/homebrew/bin/dshc(或 /usr/local/bin/dshc)
dshc status       # 应输出插件/技能版本
```

Windows 下用 `Get-Command dshc` 检查入口。PowerShell 执行策略阻止 `dshc.ps1` 时可运行
`dshc.cmd` 或 `node cli/index.mjs`，不需要修改系统执行策略。

升级(覆盖安装):

```bash
cd dsh-controller && git pull && npm install -g .
```

安装内容只有 `cli/` 与 README；技能包与插件在运行时从仓库拉取，不占全局包体积。

### 回归验证

```powershell
npm test
npm pack --dry-run
```

测试均位于 `demo-test/`，运行夹具放在其隔离目录并自动清理，不修改真实 dsh 配置。
Windows 用例覆盖安装定位、中文及特殊字符参数、官方 cmd 入口解析、BOM、失败退出码、
子进程清理、换包备份和非 TTY 行为。管理员 UAC、真实插件下载及完整桌面更新流程需要实际环境验证。
技能用例覆盖两个入口、完整嵌套资源、只读模块加载、越界拒绝、CRLF、
旧副本归档、已修改内容保留和失败安装不删除原包。
本机已解包的 DSH 安装还可执行 `node demo-test/skill-provider-smoke.mjs`，
用当前官方技能提供器只读验证入口发现与全部模块正文加载；此项不启动桌面或运行模块工具。

### 卸载

```bash
npm unlink -g dsh-controller
```

> 本仓库公开,克隆与匿名拉取不需要令牌。只有访问私有源或遇到 GitHub API 限流时,才需要在「设置 → 设置访问密钥」填入有 `repo` 读权限的 PAT;CLI 也会复用本机 github.com 的 git 凭证。

---

## 二、快速开始

```bash
dshc                    # 进入交互菜单
```

首次使用建议顺序:

1. **设置 → 设置访问密钥**(可选):公开仓库无需令牌;访问私有源或 API 限流时再填有 `repo` 读权限的 PAT
2. **设置 → 测试连接**:确认显示「连接正常 · v1.10.0」
3. **一键破甲 → 一键安装**:安装插件 → 解包 → 打补丁 → 换包 → 重启 dsh
4. **红队技能 / 逆向技能 → 更新**:拉取技能包到 `~/.dsh/skills/`

---

## 三、菜单详解

### 一键破甲

| 项 | 作用 | 底层动作 |
|---|---|---|
| 一键安装 | 全流程 | 拉仓库打包 → `dsh plugin add` → 去隔离 → 解包 → `--apply` → 换包改名 → 重启 |
| 仅应用补丁 | 不重启 | 去隔离 → 解包 → 权限预设 → `--apply` |
| 回滚补丁 | 还原宿主文件 | `dsh-purge.js --revert` |
| 卸载安装 | 移除插件与补丁 | 退出 dsh → `--uninstall`(EPERM 时管理员授权)→ `dsh plugin remove` |
| 还原签名 | 修官方更新失败 | `dsh-purge.js --reseal`(丢弃解包目录) |
| 重启 dsh | 拉起应用 | `open -a "DeepSeek Harness"` |

### 运行配置

| 项 | 作用 |
|---|---|
| 域名拦截 | region gate 状态查看 / 解除 / 恢复(补丁 `lib/net-scope.js`) |
| 能力自检 | 逐层证据(host / runtime / layout),未知层标 `?` |
| 运行开关 | boost / retry / rewind 勾选,inject 循环(head→tail→both);写 `tuning.json`,下一轮对话生效 |
| 授权管理 | 演练台授权 / 撤销(`drill-grant.json`) |

### 备份与恢复

| 项 | 作用 |
|---|---|
| 立即备份 | 可输入原因,生成 `~/.dsh/dsh-purge-community/backups/<ID>` |
| 刷新列表 | 重读插件状态 |
| 回滚到备份 | 列表显示 `ID · 时间 · 原因 · dsh 版本 · 大小` |
| 删除备份 | 单条删除(二次确认) |
| 清理旧备份 | 插件保留策略 `prune` |
| 占用统计 | 标题栏显示总占用 |

### 红队技能 / 逆向技能

| 项 | 作用 |
|---|---|
| 安装 / 更新 | 复制完整源包，保留分类、参考资料和脚本，只生成一个对外入口 |
| 重装 | 新包准备后替换，旧包保留可恢复备份，不先清空 |
| 刷新入口 | 更新分类索引，归档已确认的旧散装副本 |
| 加载验证 | 逐个读取完整正文与资源基目录，不执行模块脚本 |
| 卸载 | 将入口及完整包归档到备份，保留无法确认的自定义技能 |
| 查看清单 | 查看分类索引中的稳定模块 ID |

安装位置:`~/.dsh/skills/redteam-skill/`、`~/.dsh/skills/reverse-skill/`

DSH 只扫描技能根目录下一层，因此这两个包在宿主中只显示两个入口；
完整子模块留在包内，不再复制成顶层独立技能。其他用户自定义技能不受影响。

```text
skills/
  redteam-skill/
    SKILL.md                  # 红队分类入口
    .dshc-index.json           # 模块 ID、路径、内容签名
    .dshc-load.mjs             # 独立只读加载器
    recon/ ...                # 完整分类及配套资源
  reverse-skill/
    SKILL.md                  # 逆向分类入口
    .dshc-index.json
    .dshc-load.mjs
    skill/ skills/ scripts/ ... # 保留原始资源布局
```

先通过宿主 `skill` 工具加载包入口，再按入口索引读取目标模块正文。
子模块 ID 不是顶层技能名，不能直接传给宿主 `skill(name=...)`。
也可运行包内加载器的 `list` / `read <模块ID>`；
返回 `content`、`packRoot`、`resourceBase.path`，相对资源按模块基目录解析。
正文修改会返回 `changed: true`，可刷新索引；被修改的生成入口不会自动覆盖。

旧布局迁移命令为 `dshc skills migrate`，验证命令为 `dshc skills verify`。
仅当状态记录、模块名称、正文签名匹配且目录只有 `SKILL.md` 时，
旧散装副本才会移入 `$DSH_HOME/dsh-controller/skill-backups/`；仅 CRLF 差异视为相同正文，
备份仍保留原始字节。修改过、包含额外资源或无法确认的目录保留并报告。
迁移不自动安装外部工具、连接 MCP 或修改全局规则；正文可加载不代表工具依赖已就绪。

### Purge 演练台

演练台优先读取已安装包的 `.dshc-index.json`，分别展示红队、逆向和官方用户技能；
安装红队索引包后不再重复统计旧随包红队目录，两个包入口也不计作内部模块。
点击模块可读取完整正文、包入口、模块 ID 和资源基目录；重名模块用包名与模块 ID 区分。
预检共用该模块目录，支持稳定名称及兼容旧别名；缺文件或越界路径会报告不可用。

演练模式发现红队索引包后，只移除预设中标准的旧平铺技能根，
保留入口根和用户自定义目录，因此不会重新把子模块登记为宿主顶层技能。
未安装红队包时仍可回退插件自带技能。安装或更新包后可在演练台点击“刷新”重新读取索引。
本机链接安装的插件在修改后需要重启 DSH，以同时重新加载后端、预设及客户端。

此仓库未附带完整面板构建源码；演练台变更同时维护兼容组件和实际 `dsh-purge-self/client.js`
分发组件，并由回归测试验证分类、统计与详情显示，不以旧构建脚本替代完整前端构建。

### 插件商店

| 项 | 作用 |
|---|---|
| 在线插件目录 | 从同源 `dsh-plugins/packages`(GitHub)拉取,显示版本/说明/是否已装 |
| 已安装插件 | 列表含来源 spec |
| 安装插件 | 输入包名 / 本地路径 / tarball(`dsh plugin add`) |
| 卸载插件 | `dsh plugin remove` |
| 更新全部插件 | 按在线目录最新 spec 逐个重装 |
| 版本豁免 | 查看 / 授权 / 撤销(`dsh plugin allow-version`、`revoke-version`) |
| 重启 dsh | 拉起重启 |

### 设置

| 项 | 作用 |
|---|---|
| 设置访问密钥 | 写 `~/.dsh/dsh-controller/hub.json`(600 权限);输入 `-` 清除 |
| 测试连接 | 拉一次红队包版本验证链路 |
| 查看审计日志 | `~/.dsh/dsh-purge-community/audit.jsonl` 最近 30 行(JSON 解析成 时间·动作·详情) |
| 查看换包日志 | `/tmp/dsh-controller-handoff.log` |
| 清空审计日志 | 删除 audit.jsonl |
| 清理全部日志 | 含换包日志与 4 类 worker 日志 |

---

## 四、非交互命令

```bash
dshc status                                  # 概览(插件/布局/备份/技能版本)
dshc help                                    # 帮助

# 破甲
dshc purge oneclick                          # 一键破甲(全流程,含重启)
dshc purge apply                             # 仅应用补丁
dshc purge revert                            # 回滚补丁
dshc purge reseal                            # 还原签名
dshc purge backup                            # 立即备份
dshc purge prune                             # 清理旧备份
dshc purge rollback <备份ID>                  # 回滚到指定备份
dshc purge selfcheck                         # 逐层自检

# 技能包
dshc skills redteam                          # 安装/更新红队技能包
dshc skills reverse                          # 安装/更新逆向技能包
dshc skills migrate                          # 迁移旧布局，只保留包入口
dshc skills verify                           # 验证全部模块正文及资源基目录

# 插件
dshc plugins list                            # 已安装列表
dshc plugins install <spec>                  # 安装(包名/路径/tarball/git spec)
dshc plugins remove <name>                   # 卸载

# 设置
dshc settings token                          # 查询密钥状态
dshc settings token <令牌>                    # 设置密钥
dshc settings test                           # 测试托管源连接
```

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 操作失败(输出含具体原因) |

---

## 五、配置文件与路径

| 路径 | 用途 |
|---|---|
| `~/.dsh/dsh-controller/hub.json` | 托管源访问密钥(600,可选) |
| `~/.dsh/dsh-purge/tuning.json` | 运行开关(boost / refusalRetry / rewind / injectPosition) |
| `~/.dsh/dsh-purge/drill-grant.json` | 演练台授权 |
| `~/.dsh/dsh-purge-community/backups/` | 插件备份目录 |
| `~/.dsh/dsh-purge-community/audit.jsonl` | 操作审计日志 |
| `~/.dsh/skills/redteam-skill/` | 红队技能包安装位置 |
| `~/.dsh/skills/reverse-skill/` | 逆向技能包安装位置 |
| `~/.dsh/profiles/desktop/cordis.patch.yml` | 权限预设(danger-never 写入处) |
| `/tmp/dsh-controller-handoff.log` | 换包/改名日志 |

---

## 六、关键机制

### 换包改名与管理员授权

macOS 的 App 管理(TCC)只允许应用修改自己的 bundle。控制器/终端/launchd 去 rename `app.asar` 都会被 `EPERM` 拒绝。

CLI 的策略:先尝试普通 rename;命中 `EPERM` 时通过

```bash
osascript -e 'do shell script "..." with administrator privileges'
```

弹出**系统管理员密码框**,以 root 执行改名(root 不受该限制)。输一次密码即完成,不需要手动 sudo。

### 宿主解包

dsh 升级后宿主回到 `app.asar` 形态,此时 `dsh-purge.js --apply` 会以「ai_base 缺失」拒绝执行(该 CLI 从不自行解包)。本工具在 apply 前调用插件的

```js
openSealedDesktopHost({ forApply: true })
```

把 asar 解到 `Contents/Resources/app`,再应用补丁。

### 隔离属性

dsh 升级包通常带 `com.apple.quarantine`,会导致 dsh 二进制执行失败(表现为诡异的 `ENOENT`)。CLI 在每次操作前自动 `xattr -dr` 去除。

### 托管源认证

默认托管源是公开的 GitHub 仓库,匿名即可读取;令牌只用于私有源、私有 fork 或更高的 API 配额。
三级顺序:显式密钥(`hub.json`)→ 本机 git 凭证(keychain)→ 匿名。
私有仓库的匿名请求返回 404(隐藏存在性),CLI 对 401/404 都会尝试凭证重试。

---

## 七、故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `[ERROR] DSH_BASE ... 不是有效的插件根` | 宿主处于 asar 态,未解包 | 一键安装会自动解包;或先跑「仅应用补丁」 |
| `EPERM: rename app.asar` | App 管理限制 | 让提示的管理员密码框出现并输入密码;或 `sudo dshc purge oneclick` |
| `spawn ... ENOENT` / dsh 起不来 | bundle 带 quarantine | `xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"` |
| 「插件根未找到」 | 缺 `DSH_SURFACE=desktop` | 已内置,若手动调插件 CLI 需自行加 |
| 安装插件 `allowBuilds` 报错 | pnpm 阻止 git 插件 prepare | 按提示在 `~/.dsh/profiles/desktop/pnpm-workspace.yaml` 的 `allowBuilds` 加入对应键 |
| `Repository not found` | 私有源未授权 | 设置 → 设置访问密钥 → 测试连接 |
| 换包后 dsh 仍加载 asar | 改名未完成 | 查看 `/tmp/dsh-controller-handoff.log`,重跑一键安装 |
| `Unknown agent preset: unrestricted`，旧会话无法恢复 | 预设未成功注册，崩溃可能损坏 `preset.yml` | 先备份损坏文件，再用已校验的原始备份恢复；不要删除会话。重开 DSH 重新注册预设 |
| DSH 0.2.2 中红队预设报 `tool-subagent-list-agents: never started` | 发现工具已合并进主控制插件，旧子入口不再导出 | 更新控制器并重开 DSH；注册时按宿主文件证据迁移，保留自定义正文及原有子会话预设 ID |
| 提示“未检测到 Kali，且工具未配置” | 红队环境检查尚未就绪，不是会话日志损坏 | 在弹窗选择“暂不配置”并确认，或填写真实工具路径；不安装 Kali 也可先进行对话 |
| 点击对话“回退”后，选项落在屏幕外 | 输入框祖先的变换影响 fixed 定位，且旧菜单未约束窗口边界 | 更新客户端并重开 DSH；菜单挂到 body 并按实际尺寸选择上下位置，窗口或外部滚动时关闭 |

本机链接安装的源码修改需要重开 DSH 才会载入。`purge selfcheck` 只核对补丁和配置，
不等同于真实会话发送成功；涉及会话恢复的修复仍须验证旧会话恢复、新会话创建和发送。
预设安装使用先刷盘后替换的单文件原子写入，不保证整套预设或所有会话数据在断电时都不受损。

### macOS 兼容判断

已只读对照官方仓库标签 `dsh-v0.2.1-rc.5`（`b830ec9`）与
`dsh-v0.2.2-rc.1`（`66491b0`），不使用最新分支推断历史版本：

- [子任务控制包](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/subagent/tool-subagent-control/package.json) 移除了 `/list-agents` 导出，[主入口](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/subagent/tool-subagent-control/src/index.ts) 直接注册发现工具，没有按操作系统区分。Mac 使用同版本组件和旧预设时也会遇到入口失效；现有注册迁移不限定 Windows。
- 版本差异确认了编辑观察策略重构、提示词工具集合独立、Agent 首步使用本轮工具集合、PTC 独立执行器和拆分审批流水线；这些改动位于共用后端源码，不是 Windows 分支。
- [依赖闭包选择](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/apps/desktop/scripts/prepare-package-set.ts) 为两端选择相同的必需后端包，仅按目标筛选可选原生依赖。[桌面打包工厂](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/apps/desktop/scripts/electron-builder-config.mjs) 共用 DSH 树与 `runtime` 资源，分别处理 Mac 签名和 Windows 安装/PE 解包。

因此 Mac 同版本旧插件也存在这些源码级兼容问题，但源码核对不能替代对实际发行包的补丁命中验证。

已在 Windows 上通过 Mac `.app/Contents/Resources` 布局、无扩展名 CLI、归档入口定位、
两个预设迁移及 Kali 判断的模拟测试。未运行 macOS 实机，尚未验证真实 ASAR 读取、
APFS 断电恢复、桌面启动和会话发送。全零元数据损坏目前仅在本机确认；
`.cmd` 解析故障是 Windows 特有问题；Mac 没有 Kali 时仍可选择“暂不配置”并确认。

---

## 八、目录结构

```
cli/index.mjs        交互入口(菜单 + 非交互命令分发)
cli/lib/ui.mjs       TUI 渲染(局部重绘 / 分组 / 勾选 / EOF 保护)
cli/lib/core.mjs     环境探测 / 执行 / 认证 / 解包 / 改名 / 重启
cli/lib/ops.mjs      破甲 / 技能 / 插件 / 备份 / 日志 / 权限预设
dsh-purge-self/      破甲插件源码(随仓库发布)
resources/           红队 / 逆向完整技能源（子模块、参考资料和脚本）
docs/                设计记录与版本范围指南
```

## 九、开发

```bash
node --check cli/index.mjs     # 语法检查
node cli/index.mjs status      # 冒烟
npm link                       # 本地链接测试
```

零第三方依赖:只用 `node:fs`、`node:path`、`node:os`、`node:child_process`、`node:readline`、全局 `fetch`。

## 致谢与上游项目

本项目站在以下上游项目之上,感谢原作者的付出(相关 LICENSE / NOTICE 已随包保留):

| 上游项目 | 贡献内容 | 协议 |
|---|---|---|
| [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)(原版) | 破甲补丁引擎(dsh-purge.js)、宿主补丁体系(72/74 条)、提示词注入、apply/revert/uninstall 流程 | MIT |
| [kingcharleslzy-ai/dsh-purge](https://github.com/kingcharleslzy-ai/dsh-purge)(社区维护版,即 dsh-purge-community v1.6.50) | 本项目 `dsh-purge-self/` 的直接 fork 来源;演练台(红队模式)、SQLite 资产库、红队/无限制 Agent 预设、备份回滚体系、Purge 面板 UI、25 层自检 | MIT |
| [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill) | `resources/reverse-skill/` 完整上游(43 个子技能、CTF-Sandbox、burp-mcp 等 1063 个文件) | MIT © 2026 zhaoxuya520 |

另有 [ZiPengWei/dsh-purge](https://github.com/ZiPengWei/dsh-purge)(社区分支)在早期调研中做过对比参考,未直接采用代码。

演变关系:**原版(YuJunZhiXue)→ 社区版(kingcharleslzy-ai,融合演练台)→ 本项目自研版 dsh-purge-self**;逆向技能包独立来自 zhaoxuya520,红队技能包(23 个子技能)随社区版带出后统一在 `resources/redteam-skill/` 自主维护。

## 已知限制

- 仅支持 macOS + 桌面版 DeepSeek Harness(路径固定 `/Applications/DeepSeek Harness.app`)
- 换包改名依赖系统管理员授权(弹密码框);无 GUI 管理员权限的环境需手动 sudo
- 技能包内容体积较大(克隆仓库约 600MB)
- 在线插件目录来自同源 `dsh-plugins` 仓库(默认 `github.com/skyle1995/dsh-plugins`,可用 `DSHC_PLUGINS_API`/`DSHC_PLUGINS_GIT` 改指);该源不可达时只能装本地/tarball

