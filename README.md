# DSH Controller CLI

DeepSeek Harness 的**纯命令行管理器**(无图形界面)。管理破甲补丁、技能包、插件与私有源访问。

## 安装

```bash
git clone https://hub.ifunx.com/skyle1995/dsh-controller.git
cd dsh-controller
npm link          # 之后可直接用 dshc
# 或无需安装,直接运行
node cli/index.mjs
```

要求:Node.js ≥ 18,macOS(桌面版 DeepSeek Harness 位于 `/Applications`)。

## 使用

不带参数进入交互式 TUI(方向键移动 / 空格勾选 / 回车确认 / q 返回):

```
  DSH CONTROLLER  ·  插件 v1.1.19  ·  宿主 app ok  ·  备份 2  ·  dsh 0.2.1-rc.5

    -- 破甲 ----------------
  ❯ 一键破甲                安装 / 卸载 / 还原签名
    运行配置                域名拦截 / 自检 / 开关 / 授权
    备份与恢复              备份 / 回滚 / 删除
    -- 扩展 ----------------
    红队技能                38 个 · v1.7.0
    逆向技能                14 模块 · v1.3.0
    -- 管理 ----------------
    插件商店                在线目录 / 安装 / 卸载
    设置                    密钥 / 连接 / 日志
    退出
```

### 菜单结构

| 一级 | 二级 |
|---|---|
| **一键破甲** | 一键安装(插件 → 解包 → 应用 → 换包 → 重启)、仅应用补丁、回滚补丁、卸载安装、还原签名、重启 dsh |
| **运行配置** | 域名拦截(region gate 解除/恢复)、能力自检(逐层)、运行开关(boost/retry/rewind/inject)、授权管理(演练台) |
| **备份与恢复** | 立即备份、刷新、回滚、删除单个、清理旧备份、占用统计 |
| **红队技能** | 安装/更新(分类子目录递归拉取 → 统一入口)、查看清单 |
| **逆向技能** | 安装/更新(仓库子目录)、查看清单 |
| **插件商店** | 在线目录、已安装、安装、卸载、更新全部、版本豁免(授权/撤销)、重启 dsh |
| **设置** | 访问密钥、测试连接、查看审计日志、查看换包日志、清空审计、清理全部日志 |

### 非交互命令

```bash
dshc status                              # 概览
dshc purge oneclick                      # 一键破甲(全流程)
dshc purge apply|revert|reseal|backup|prune|selfcheck
dshc purge rollback <备份ID>
dshc skills redteam|reverse              # 技能包安装/更新
dshc plugins list|install <spec>|remove <name>
dshc settings token [令牌]|test
dshc help
```

## 关键机制

**换包改名与权限**:macOS App 管理(TCC)只允许应用修改自己的 bundle。CLI 的换包改名先尝试普通 rename,遇到 `EPERM` 会自动通过 `osascript … with administrator privileges` 弹**系统管理员密码框**,以 root 完成改名(root 不受该限制)。

**宿主解包**:dsh 升级后宿主回到 `app.asar` 形态,此时 `dsh-purge.js --apply` 会因 `ai_base` 缺失拒绝执行。CLI 在 apply 前调用插件的 `openSealedDesktopHost({forApply:true})` 把 asar 解到 `Resources/app`,再应用补丁。

**隔离属性**:dsh 升级包通常带 `com.apple.quarantine`,会导致 dsh 二进制无法执行(表现为 ENOENT)。CLI 在每次操作前自动 `xattr -dr` 去除。

**私有源访问**:密钥存于 `~/.dsh/dsh-controller/hub.json`(设置菜单可改);未配置时自动复用本机 git 凭证(keychain)。

## 目录

```
cli/index.mjs        交互入口(菜单 + 非交互命令)
cli/lib/ui.mjs       TUI 渲染(局部重绘、分组、勾选)
cli/lib/core.mjs     环境探测、执行、认证、解包、改名
cli/lib/ops.mjs      破甲 / 技能 / 插件 / 备份 / 日志等操作
dsh-purge-self/      破甲插件源码(随仓库发布)
resources/           红队技能包 / 逆向技能包源
```

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

