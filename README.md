# DSH Controller

DeepSeek Harness 桌面控制器 —— 一个独立的 Electron 桌面应用,**只支持桌面版 DeepSeek Harness**(插件中心 / 破甲管理 / 技能包;桌面版进程由 DeepSeek Harness 自身管理)。

## 功能

- **版本管理**:检测当前版本与 npm 最新版,一键安装 / 更新 / 卸载 dsh(npm 全局包 `@deepseek-ai/dsh`);**dsh 升级成功后自动把已装插件迁移到最新版**(重新拉取插件 git spec),避免旧插件 peer 版本与新运行时冲突导致 profile 拒绝挂载
- **插件中心**:浏览 [hub.ifunx.com/skyle1995/dsh-plugins](https://hub.ifunx.com/skyle1995/dsh-plugins) 插件仓库目录,一键安装 / 更新 / 卸载插件(等价于 `dsh plugin --profile web add/remove`,操作日志实时可见);「全部更新」可手动批量迁移;兼容性按 **semver 范围**判断(与 dsh 运行时一致,支持 `>=0.2.0-rc.2`、`^`、`workspace:` 等写法),不满足时显示不兼容标记,可一键「授权兼容」(等价于 `dsh plugin allow-version`,精确到插件版本 + dsh 版本,可撤销)
- **破甲管理**:一键安装 / 更新破甲插件;应用 / 回滚宿主补丁(写入前自动备份,支持「应用并重启」一键串联);25 层自检、备份列表与一键回滚、旧备份清理;运行时开关(强化尾段 / 拒绝重试 / 回退按钮 / 注入位置,下一轮对话生效,无需重启);最近动作审计视图。控制器只做外部编排,补丁逻辑全部由插件自身完成
  - 来源:社区版 [dsh-purge-community](https://github.com/kingcharleslzy-ai/dsh-purge)(MIT,官方市场固定版本 tarball),衍生自原版 [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)(Apache-2.0,二开需署名)
- **破甲技能包**(红队 + 逆向统一管理):**红队技能集**一键提取(测绘 / 隧道 / 横向 / WebShell 等,标准 skill frontmatter),所有会话可用、不依赖红队预设,版本跟随破甲插件;**逆向技能包 reverse-skill**(逆向 / CTF / 安全研究路由)独立检测更新;两者独立安装 / 更新 / 卸载
  - 来源:红队技能内置于破甲插件;逆向技能包 [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill)(main 分支 tarball,commit 作版本)
- **破甲限制管理**:一键解除插件手动加的公网 / 银行域名拦截(region gate,`agent/pre-step` 钩子直接拒绝攻击任务里的 CN/HK/MO 与银行域名)——对插件 `lib/net-scope.js` 打补丁(自动备份、可一键恢复),**插件更新后按持久标记自动重打**;红队演练台一键授权(免每次启动确认)
- **事件记录**:记录本次会话内的服务启停事件

## 技术栈

- Electron 44 + React 19 + electron-vite 5 + electron-builder

## 开发

```bash
npm install    # 安装依赖(含 Electron 二进制)
npm run dev    # 开发模式(热更新)
```

## 打包

```bash
npm run dist   # 按当前平台打包
```

- macOS:生成 `dist/mac-arm64/DSH Controller.app` 与 `dist/DSH Controller-0.1.0-arm64.dmg`
- Windows:生成 `dist/DSH Controller Setup 0.1.0.exe`(NSIS 安装包)

> 说明:当前未做代码签名,macOS 首次打开需右键 App →「打开」,Windows 安装时会提示 SmartScreen;暂用默认 Electron 图标。

## 仓库私有化与更新

仓库已设为**私有**。控制器获取更新的方式(零配置):

- **git 操作**(插件安装/技能包安装):控制器调用系统 `git`,自动复用本机 keychain 里保存的 hub.ifunx.com 凭证(与你 `git push` 用的是同一套)
- **版本检测**(Gitea contents API):匿名请求收到 401 时,控制器自动用 `git credential fill` 读取本机凭证重试

因此:只要这台机器执行过一次 `git pull/push`(凭证已存),控制器在私有状态下所有更新功能照常工作。
换新机器时:先 `git clone https://hub.ifunx.com/skyle1995/dsh-controller.git` 输一次账密(勾选钥匙串保存),控制器即可正常更新。

> 控制器安装包(DMG/EXE)为本地构建产物,不入库、不受私有化影响。

## CLI(菜单式,推荐)

无需图形界面,终端里完成全部管理(无 Electron/TCC 依赖):

```bash
node cli/index.mjs          # 进入菜单
node cli/index.mjs status   # 概览
# 或安装为本机命令:
npm link && dshc            # 之后直接 dshc 进入菜单
```

菜单结构:

```
╭ DSH Controller CLI ╮
  破甲插件 v1.1.19 · 宿主 app(已应用)
  红队技能 38 个 · v1.7.0
  逆向技能 12 模块 · v1.3.0
  宿主版本 0.2.1-rc.3

  1) 一键破甲    去隔离 → 解包 → 应用 → 换包改名 → 重启(全自动)
  2) 红队技能    安装/更新/清单(分类子目录递归拉取)
  3) 逆向技能    安装/更新/清单
  4) 插件商店    已装列表 / 安装 / 卸载
  5) 工具设置    密钥 / 连接测试 / 原始宿主快照 / 日志位置
  q) 退出
```

非交互命令(可脚本化):

```bash
dshc status
dshc purge oneclick            # 一键破甲
dshc purge apply | revert | reseal | backup | prune | selfcheck
dshc purge rollback <备份ID>
dshc skills redteam | reverse  # 技能包安装/更新
dshc plugins list | install <spec> | remove <name>
dshc settings token [令牌] | test
dshc originals list | create | restore <ID>
```

要点:
- **换包改名**在普通权限被 macOS 拒绝(EPERM)时自动弹**管理员密码框**(osascript with administrator privileges),以 root 完成
- 私有仓库访问:密钥存 `~/.dsh/dsh-controller/hub.json`(设置菜单可改),或自动复用本机 git 凭证
- 图形界面(`npm run dev` / electron-builder)保留为可选入口

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

- 「停止 dsh」会停掉占用 3080 端口的进程(包括终端手动启动的 dsh)
- 外部启动的 dsh 若进程权限不足,CPU / 内存等详情可能无法读取,显示为「—」
