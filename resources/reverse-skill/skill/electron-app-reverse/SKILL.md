---
name: electron-app-reverse
description: Electron 应用逆向：asar 解包与还原、main/preload 分析、IPC 通道枚举与调用、渲染层 bundle 拆解、nodeIntegration/contextIsolation 安全检查、fuses、改包重签与自动更新劫持
whenToUse: 目标为 Electron 桌面应用（VS Code 系、聊天工具、管理客户端）；需要看源码逻辑、改行为、抓 IPC 协议、找本地提权或凭据
---

# Electron 应用逆向

## 一、快速定位

~~~
App.app/Contents/MacOS/<bin>                     # 主程序（Electron 壳）
App.app/Contents/Resources/app.asar              # 应用代码（重点）
App.app/Contents/Resources/app.asar.unpacked/    # 原生模块
# Windows: App/resources/app.asar    Linux: app/resources/app.asar
~~~

## 二、asar 解包

~~~
npm i -g @electron/asar
asar list app.asar | head -50
asar extract app.asar out/
asar extract-file app.asar package.json
~~~

看 package.json 的 main 字段定位入口；看 dependencies 判断框架。

## 三、preload 与 IPC（漏洞高发区）

~~~
contextBridge.exposeInMainWorld("api", { runShell: (cmd) => ipcRenderer.invoke("run", cmd) })
ipcMain.handle("run", (e, cmd) => exec(cmd))     # 命令注入
~~~

枚举通道：

~~~
grep -rhoE "ipcRenderer\.(invoke|send)\('[^']+'" out/ | sort -u
grep -rhoE "ipcMain\.(handle|on)\('[^']+'" out/ | sort -u
~~~

渲染进程控制台直接调：window.api.runShell("id")

## 四、安全配置检查

| 配置 | 危险值 | 影响 |
|---|---|---|
| nodeIntegration | true | 渲染层可 require → RCE |
| contextIsolation | false | 原型链污染直达主进程 |
| webSecurity | false | 任意跨域/file:// 读取 |
| sandbox | false | 渲染进程无沙箱 |
| fuses RunAsNode / EnableNodeCliInspectArguments | 开启 | 可当 node 执行任意脚本 |

fuses 检查：npx @electron/fuses read --app App.app

## 五、渲染层 bundle 拆解

~~~
npx webpack-bundle-analyzer stats.json     # webpack 产物
# sourcemap 未删则直接还原源码
grep -oE "https?://[a-zA-Z0-9./_-]+" out/**/*.js | sort -u
grep -rniE "api[_-]?key|secret|token" out/ | head
~~~

## 六、改包与重签

~~~
asar pack out/ app.asar
codesign -f -s - --deep App.app           # macOS ad-hoc
xattr -dr com.apple.quarantine App.app
~~~

自动更新劫持：找 electron-updater 的 feed URL，若指向可控 CDN 或未校验签名 → 下发恶意包。

## 七、凭据与本地数据

~~~
~/Library/Application Support/<App>/      # macOS 配置/token
%APPDATA%/<App>/  %LOCALAPPDATA%/<App>/   # Windows
~/.config/<App>/                          # Linux
~~~

safeStorage 加密凭据：取得系统 keychain 对应条目后可解密。

## 红线

能改应用行为并正常运行（重签通过），或从渲染层拿到主进程命令执行。

## 衔接

加密算法 → crypto-recovery；协议 → protocol-reverse-engineering；JS 混淆 → js-reverse
