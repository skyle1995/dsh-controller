# dsh-purge 功能盘点 → DSH Controller 借鉴清单

> 调研对象:[kingcharleslzy-ai/dsh-purge](https://github.com/kingcharleslzy-ai/dsh-purge)
> (Purge Community v1.6.50,MIT,原作者 小杨/YuJunZhiXue,社区维护 kingcharleslzy-ai)
> 调研日期:2026-10-24 · 目的:给 DSH Controller(Electron 桌面控制器)加更多功能

## 一、它是什么

dsh-purge 不是控制器这类独立应用,而是一个 **DSH 插件**(跑在 dsh 运行时里),
社区俗称「破甲」。核心价值:80 条宿主补丁 + 提示词注入 + 完整的可观测性工程
(自检/审计/备份/更新校验)。**它的工程配套比核心功能更值得控制器借鉴**。

| 维度 | dsh-purge | DSH Controller |
|---|---|---|
| 形态 | DSH 插件(进程内) | 独立 Electron 应用(进程外) |
| 与 dsh 交互 | 运行时注入/补丁宿主源码 | 调 `dsh` CLI + 读写 `~/.dsh` |
| 依赖 | cordis peer | electron/react/semver |

## 二、功能全景(源码位置)

| 功能 | 实现位置 | 说明 |
|---|---|---|
| 宿主补丁(80 条) | `lib/core.js`(351K) | 改 DSH 源码策略;锚点定位 + 漂移检测 |
| 锚点诊断/重锚 | `lib/anchors.js`、CLI `reanchor` | 补丁锚点漂移时给候选行号,确认后写本地覆盖 |
| 提示词注入 | `lib/core.js` + `default-prompt-inject.md` | 注入位置 head/tail/both 可调,`excludePresets` 按预设排除 |
| 尾部强化段 | `lib/boost.js` | 长上下文抗漂移,开关式 |
| 运行时探针 | `lib/probe.js` | 一次性 nonce + 回显指令,证明「注入真的到模型」 |
| 拒绝检测+重试 | `lib/refusal-retry.js` | llm/stream 钩子,中英文推脱正则,单次加固重试 |
| 预设系统 | `lib/presets*.js` | unrestricted / redteam 预设,安装/诊断/兼容 |
| 规则管理 | `lib/rules.js` | 规则 ID 校验、256K 上限、hash 对账、原子写 |
| 技能管理 | `lib/skills.js`(28K) | 与官方 dsh-skill 一致:kebab-case、zip 导入、限额校验 |
| 审计日志 | `lib/audit.js` | JSONL、1MB×2 轮转、0600、防软硬链接、失败不打断主流程 |
| 备份/回滚 | `lib/rollback-transaction.js` 等 | 动作前自动快照、事务式回滚、usage/prune 清理 |
| 更新系统 | `lib/update-*.js`(9 个模块) | 检查/安装分离、间隔 1-168h、SHA256、代理、断点恢复 |
| 市场索引 | `scripts/build-market.mjs` | **DSH 官方市场 format 1**,GitHub Releases 生成,固定 commit |
| 实例定位 | `lib/instance.js` | DSH_HOME/DSH_APP,realpath 规范化,不做全局扫描 |
| 分层自检 | `lib/selfcheck.js`(25 层) | host/runtime/config 三类,逐层给证据,not_needed ≠ 失败 |
| Web 面板 | `packages/purge-panel`(React) | 注入 DSH 左侧栏整页,折叠分区 + `?` 说明 + 可隐藏入口 |
| 红队演练 | `lib/redteam/`(约 800K) | 靶场/评分/工具,独立子模块 |
| 跨平台安装器 | `scripts/install.sh` / `install.ps1` | dry-run 先行、分阶段诊断、curl 兜底、asar 换包 |
| 原子写/解包 | `lib/atomic-files.js`、`zip-extract.js`、`extract-asar.js` | 基础设施 |

## 三、A. 可直接克隆(代码可搬,标注 MIT 来源)

### A1. 审计日志(替代控制器内存态「事件记录」)⭐ 最高性价比
- **搬什么**:`lib/audit.js` 的 JSONL 追加 + 1MB 轮转保留 2 份 + 权限收紧
- **控制器落地**:`事件记录` 目前刷新即丢;改为 `~/.dsh-controller/audit.jsonl`,
  记录 start/stop/restart/install/update/plugin add/remove/exemption,面板加「最近动作」视图
- 直接可用,`logAudit(event, data)` 接口极简

### A2. 更新偏好与状态(升级控制器「版本管理」)
- **搬什么**:`lib/update-policy.js` —— autoCheck / autoInstall / intervalHours(1-168 整数校验)
  + 独立 update-status.json 记录上次检查结果
- **控制器落地**:dsh 新版本检测从「打开页面时查一次」升级为可配置自动检查
  (默认只检查不安装,与 purge 的保守默认一致)

### A3. DSH 市场索引 format 1 支持(升级「插件中心」)⭐ 战略价值最高
- **搬什么**:`scripts/build-market.mjs` 里的 format 1 结构:
  `{ format: 1, plugins: [{ name, versions: [{ version, source: { type: "git", url, commit }, engines }] }] }`
- **控制器落地**:插件中心目前硬编码抓 Gitea `contents/packages` 遍历;增加
  「自定义市场源」页签,可添加任意 format 1 索引(如 purge 官方源
  `https://kingcharleslzy-ai.github.io/dsh-purge/index.json`),
  **控制器从此能一键安装破甲、Qwen Studio 等 GitHub 生态插件**
- 现有 semver 兼容判断逻辑(`dshRequirementsOf`)对 `engines.dsh` 已兼容,直接复用

### A4. 技能管理页(控制器新页签)
- **搬什么**:`lib/skills.js` 的校验规则(kebab-case、256K/skill、zip 12M/200 文件、
  跳过 .git/node_modules 等)+ zip 导入流程
- **控制器落地**:新「技能」页签:列出 `~/.dsh/skills`(名称/描述/大小/来源),
  查看 SKILL.md、从 zip 导入、删除;与现有 reverse-skill 页签合并管理

### A5. 原子文件写入
- **搬什么**:`lib/atomic-files.js` / `core.js` 的 atomicWriteSync
- **控制器落地**:所有写 `~/.dsh` 下文件的场景(授权豁免写 compatibility.json 等)套一层

## 四、B. 借鉴思路重新实现

### B1. dsh 升级前自动备份 profile + 一键回滚
- **借鉴**:purge 的「应用/安装/回滚前自动快照 + backup_id + 事务回滚」
- **落地**:控制器 `dsh:install` 现在直接 npm install + 迁移插件;加前置
  `backup profile web`(package.json + compatibility.json + 插件清单),失败可回滚。
  这是上次会话「升级后自动迁移插件」功能的自然补全

### B2. 一键自检面板
- **借鉴**:selfcheck 的分层证据思维(每层给 ok/fail/skipped/not_needed + why)
- **落地**:控制器加「自检」按钮:node/dsh 版本 → 端口占用 → profile package.json
  完整性 → 已装插件挂载状态(semver 校验)→ Web UI 可达 → 各插件 node_modules 存在性。
  把现在散落的红色不兼容标记收敛成一屏结论

### B3. 破甲插件集成入口
- **借鉴**:purge 的 CLI(`purge-community status/selfcheck/audit/backup`)已自带 JSON 输出
- **落地**:控制器检测 `dsh-purge-community` 是否在已装插件列表,在则显示
  「破甲状态」卡片(调 purge-community CLI 拿 JSON),提供 应用/回滚/自检 三个按钮。
  控制器不实现破甲逻辑,只做外部编排 —— 与控制器现有 runOp 模式完全一致

### B4. 多实例(DSH_HOME)支持
- **借鉴**:`lib/instance.js` 的实例定位 + realpath 规范化
- **落地**:控制器目前假定默认 `~/.dsh`;加实例选择器(默认/自定义路径),
  插件中心、技能页、备份都按所选实例走

### B5. 面板信息架构
- **借鉴**:purge 面板的「顶部一句话状态 + 主操作;其余折叠;说明收进 ?;
  维护页(最近动作/备份占用/更新偏好);可隐藏入口」
- **落地**:控制器加「设置/维护」页签承载 A1/A2/A5 的产物,主界面保持现在的清爽

### B6. 安装器工程实践
- **借鉴**:dry-run 先行、分阶段错误码、双通道下载(curl 兜底)、SHA256 校验
- **落地**:控制器未来做「修复 dsh 安装/重装」功能时的质量底线

## 五、C. 不建议搬

| 项 | 原因 |
|---|---|
| 80 条宿主补丁本体 | 直接改 DSH 安装目录源码,控制器作为外部应用做这件事越界;purge 的锚点/审计/回滚配套缺一不可,搬一半很危险 |
| 提示词注入/boost/refusal-retry | 依赖运行时 llm/stream 钩子,只能在插件进程内实现;控制器要做得先装破甲(B3 路线) |
| redteam 模块(约 800K) | 场景特定(靶场演练/评分),体积大;除非明确要做安全训练功能 |
| rewind/steering | 依赖宿主内部会话 API,跨版本易碎 |

## 六、建议路线

| 阶段 | 内容 | 预估 |
|---|---|---|
| **P0** | A1 审计持久化 + A2 更新偏好 + A3 市场源支持(含 purge 官方源) | 主进程 + 渲染层各一个页签,复用现有 runOp/hubFetch |
| **P1** | B1 升级前备份/回滚 + A4 技能管理页 + B2 自检面板 | 中等 |
| **P2** | B3 破甲集成 + B4 多实例 + B5 设置页重构 | 较大 |

## 七、合规注意

- 仓库 MIT LICENSE,克隆代码需保留版权声明(原作者 小杨,社区版 kingcharleslzy-ai)
- `NOTICE.md` 列了第三方来源(redteam 上游另有 LICENSE/DISCLOSURE,若搬那部分要单独看)
- build-market、audit、update-policy、skills 均为独立小模块,依赖极少,适合摘取

## 八、原版 vs 社区版(2026-10-24 补充调研)

> 原版:[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) v1.1.77 · Apache-2.0 + 商业条款

| 维度 | 原版 dsh-purge | 社区版 dsh-purge-community |
|---|---|---|
| 许可 | Apache-2.0,**不允许倒卖,二开必须署名**,另有商业授权 | MIT |
| 发行 | **2026-10-27 起新版本改走 Telegram 频道,GitHub Releases 停更**;master tarball 仍可装 | GitHub Releases + 官方市场索引,持续维护 |
| CLI | dsh-purge.js:--status/--apply/--revert/--uninstall/--edit(文本输出) | 社区 CLI 全家桶(status/selfcheck --json/audit/backup/rollback/reanchor/diagnose/boost/retry/rewind/inject/preset/probe)+ 转发原版动作 |
| 工程配套 | 无(无自检/审计/备份体系) | 25 层自检、JSONL 审计、事务备份回滚、更新校验 |
| 独有 | 不同模型换提示词(默认「小码酱」)、beta 分支测试版、聊天命令 /purge /rules /rewind、模型工具 purge_* | 按预设排除注入(excludePresets)、市场索引、独立安装器 |
| 安装 | codeload master tarball;postinstall 自动写 bundles | Releases 固定版本 tgz;官方市场索引 format 1 |

**结论**:控制器集成以社区版为主线(MIT 合规清晰、GitHub 持续可装、CLI 带 JSON);兼容检测原版包名(dsh-purge / dsh-purge-panel)。

## 九、实施记录:B3 破甲集成(2026-10-24 已落地)

- 主进程(`src/main/index.js`):PURGE 集成区——安装检测(三包名)、市场索引(5 分钟缓存)、
  tuning/audit 只读、purge CLI 编排(`purge:state/install/apply/revert/uninstall/selfcheck/backup/rollback/prune/tune` IPC);
  status 结果 60 秒短缓存避免频繁 spawn
- 渲染层(`App.jsx` PurgePanel):「破甲」页签——状态卡(已装/最新/兼容级别)、操作区
  (应用并重启 / 应用 / 回滚补丁 / 自检 / 备份 / 更新 / 卸载)、运行时开关四项、自检 25 层视图
  (含待核实/损坏层计数)、备份列表 + 一键回滚、审计尾部
- 已验证:市场索引解析(1.6.50)、tarball URL 拼装、隔离 DSH_HOME 安装、CLI status/selfcheck --json/
  boost off 写 tuning + 审计、构建通过
- 未在本会话执行(留给用户在控制器 UI 里操作):对真实 ~/.dsh 安装、apply 补丁、重启 dsh
  (会话沙箱禁止写 ~/.dsh;apply 需重启 dsh 生效,不宜在运行中的会话里做)

## 十、第二轮实施记录(2026-10-24)

**1. 技能包 → 破甲技能包**(替换原 reverse-skill 页签)
- 源:已装破甲插件内 `skills/redteam/*.md`(23 个,标准 skill frontmatter 平铺文件)
- 转换:逐个提取为 `~/.dsh/skills/<name>/SKILL.md`,所有会话可用,不依赖红队预设
- 版本跟随插件(插件经官方市场固定版本 tarball 安装,即「安装方式向 dsh-purge 靠拢」)
- 安装时自动迁移移除旧 reverse-skill 技能包;打包配置移除 34M reverse-skill 资源

**2. 解除破甲限制**(「破甲」页签新增「限制管理」区)
- region gate:插件 `lib/net-scope.js` 的 `agent/pre-step` 钩子,攻击任务里
  CN/HK/MO 域名与银行域名直接落拒绝消息(私网/本机/裸 IP 不拦)
- 解除 = 对 `installRegionGate` 打 return 补丁(锚点逐字匹配,写入前备份,
  可一键恢复);持久标记 `~/.dsh/dsh-purge-community/controller-unrestrict.json`,
  **插件更新后自动重打**
- 演练台授权:一键写 `~/.dsh/dsh-purge/drill-grant.json` granted,免每次启动确认
- 白名单通道(插件自带):`~/.dsh/net-scope-allow.txt` 精确主机放行

**3. 已验证**:23 技能解析与转换、锚点匹配、补丁写入/恢复逐字节一致、
补丁后 net-scope.js 语法有效、drill-grant 写入、双平台打包产物含全部新代码。
(注:pnpm 11.5 的 minimumReleaseAge 供应链策略会偶发拦截 GitHub tarball 依赖安装,
与控制器无关;真实安装走控制器 UI 在沙箱外执行。)

## 十一、第三轮实施:技能包合并(2026-10-24)

reverse-skill 逆向技能包并回「破甲技能包」页签,与红队技能集统一管理:
- **红队技能集**:现有逻辑不变(插件提取,版本跟随插件);移除"自动删除旧 reverse-skill"的迁移逻辑
- **逆向技能包 reverse-skill**:安装源改为 GitHub 固定地址
  `codeload.github.com/zhaoxuya520/reverse-skill/tar.gz/refs/heads/main`(3.6M,
  56 个子技能),以 GitHub API 最新 commit 作版本(5 分钟缓存);开发环境优先本地
  `resources/reverse-skill` 兜底;入口 SKILL.md 路由文案保留
- UI:一张卡两个技能源行,各自安装/更新/卸载;状态卡显示 红队 N/M 个、
  逆向 已装·最新/可更新、插件版本
- 验证:codeload 下载 + tar strip 1 解压 + RULES.md 校验 + 布局链路全通;
  双平台产物含 reverseSkill:install/uninstall IPC

## 十二、ZiPengWei/dsh-purge 调研 + 「是否修改 dsh 客户端」结论(2026-10-24)

**ZiPengWei/dsh-purge**(v1.0.0,2026-08-19 停更):原版最早发布地(commit 记录显示
后迁移至 YuJunZhiXue/dsh-purge)。仅 8 个补丁,走「不改宿主源码」的配置层路线
(shim 注入 + prompt-inject.md + cordis.patch.yml);能力是社区版(v1.6.50,80+ 补丁)
的严格子集,无独有可移植功能。其「npm 升级后自动重洗」思想暴露了控制器缺口,
已补:dsh 升级流程返回 purgeReapplyNeeded 并在界面提醒重新应用;插件「全部更新」
重装破甲后按持久标记自动重打「解除限制」补丁。

**是否修改 dsh 客户端**(当前 web profile 实现):
- 不改用户侧浏览器/客户端:破甲面板经 dsh.client.inject 运行时注入 Web UI
- apply 会修改本机 dsh 安装目录(npm 全局包)文件:agent-loop / system-prompt /
  agent-instructions 等宿主源码,以及 dsh-web-app 的 presets 与 cordis.patch.yml、
  dsh 命令 shim;写入前自动备份(.dshpurge.bak),revert 可还原
- 桌面版才涉及真正"客户端文件":asar 解包换包(handoff 流程);web 模式不涉及
- 控制器本身不修改任何 dsh 文件,只做编排;升级 dsh 会覆盖宿主补丁 → 界面提醒重应用

## 十三、用户须知弹窗清理(2026-10-24)

插件首次安装的「用户须知」弹窗里有源码仓库链接;按需求去掉:
- 补丁点(打包后的 client.js):welcome.body 尾部「,源码仓库:」→「。」;
  WelcomeNotice 的 `<a href={repo}>` 链接节点整体删除(repo fallback 与 releases
  链接不受影响,其余须知文字保留)
- 控制器集成:`applyClientNoticePatch()` 幂等清理 + 备份(client.js.controller-bak),
  在破甲「安装/更新」与插件「全部更新」后自动重放,不依赖解除标记;
  purge:state 增加 noticeCleaned 诊断字段
- 已对本机已装插件应用(631947 → 631677 字节,语法校验通过);刷新 Web UI 生效


## 十四、CLI(npm 全局)安装的宿主定位兼容(2026-10-24)

症状:破甲页签显示「未定位到宿主 @deepseek-ai 目录」,compatibility.level = no-host。
根因:终端 npm 全局安装时,@deepseek-ai 各宿主包**嵌套**在 dsh 包内部
(`<npm root -g>/@deepseek-ai/dsh/node_modules/@deepseek-ai`),purge 的自动探测
覆盖不到该布局(桌面版 asar / 扁平全局装它能找到)。
修复:purge 官方显式入口就是 `DSH_BASE` 环境变量(currentHost 第一步检查)。
控制器 `detectDshBase()` 自动探测(`npm root -g` → 扁平 `@deepseek-ai` →
嵌套 `@deepseek-ai/dsh/node_modules/@deepseek-ai`,验证其下有
`dsh-agent-instructions/lib`,5 分钟缓存),在**所有** purge CLI 调用
(status/selfcheck/apply/revert/uninstall/backup/rollback/tune)注入
`runOp extraEnv`;purge:state 透出 dshBase,界面显示「宿主目录(CLI 版自动定位)」。
实测:注入后 compatibility 从 no-host → **qualified**("DSH 0.2.1-rc.2:逐条补丁
锚点已回归验证,可直接应用")。桌面版场景探测不到时不注入,行为不变。


## 十五、控制器转桌面版专用(2026-10-24)

移除 dsh web(npm CLI)支持,控制器只管桌面版:
- 服务管理重写:进程发现(ps/wmic 主进程 + --expose-internals 服务进程)、
  Web 端口动态发现(lsof/netstat by pid,桌面版每次启动端口随机)、
  启动(open -a / exe)、退出(osascript quit 优雅 + SIGTERM 兜底)、重启
- 移除:3080 端口假设、spawn dsh web、npm 版本管理页签(install/uninstall/registry 检测)、
  DSH_PORT/killPort/portInUse 等旧机制;dsh 命令固定解析到桌面版自带 runtime CLI
- profile 固定 desktop;插件中心 / 破甲 / 技能源全部指向 desktop profile
- 技能包按钮:已装且最新 → 显示「重装」(有更新才显示「更新」)
- 修复:region gate 补丁标记缺 // 注释符导致插件文件语法错误的问题

## 十六、完全自主:dsh-purge-self fork(2026-10-24)

目标:破甲完全自主,不依赖 GitHub / 社区版任何外部服务,只用自建 git。
- **fork 源码**:项目内 `dsh-purge-self/`(自社区版 v1.6.50,MIT;LICENSE/NOTICE 保留)
- **改名去标识**:package name `dsh-purge-self`、面板/CLI 显示 "Purge Self"、界面与源码 kingcharleslzy 零残留
- **外部依赖移除**:GitHub 更新源源码级禁用(releasedVersions → []);面板「检查社区版更新」按钮与「发行记录」链接删除;region gate **源码级禁用**(不再需要控制器补丁);用户须知链接清理进包
- **安装源**:自建 git `hub.ifunx.com/skyle1995/dsh-purge-self`(Gitea contents API 读版本 + git spec 安装);tarball 兜底 `dsh-purge-self-1.0.0.tgz`
- **控制器**:PURGE_PACKAGES 优先 self;detectDshBase 新增桌面版宿主路径(app/ 解包目录与 app.asar,修「未定位宿主」);界面改「自建源最新」
- **已换装**:desktop profile 移除 community → 装入 self 1.0.0,tuning/提示词/演练台授权数据全继承,宿主 63 条补丁不受影响

## 附:purge 官方市场源(仅作上游参考,不再使用)

```
https://kingcharleslzy-ai.github.io/dsh-purge/index.json
```

另配套 Qwen Studio(本机出图插件)市场:
`https://kingcharleslzy-ai.github.io/dsh-qwen-studio/index.json`
