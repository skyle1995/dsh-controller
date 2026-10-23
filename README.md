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

## 已知限制

- 「停止 dsh」会停掉占用 3080 端口的进程(包括终端手动启动的 dsh)
- 外部启动的 dsh 若进程权限不足,CPU / 内存等详情可能无法读取,显示为「—」
