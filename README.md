# DSH Controller

DeepSeek Harness 桌面控制器 —— 一个独立的 Electron 桌面应用,在桌面端管理 dsh 服务进程。

## 功能

- **dsh 服务管理**:一键启动 / 停止 / 重启,一键打开 Web 界面
- **实时状态监控**:每 2 秒自动轮询运行状态(窗口聚焦时立即刷新)
- **状态详情**:进程 PID、运行时长、CPU / 内存占用、Web UI 响应延迟、dsh 版本、监听端口、启动方式(本应用 / 外部进程)
- **版本管理**:检测当前版本与 npm 最新版,一键安装 / 更新 / 卸载 dsh(npm 全局包 `@deepseek-ai/dsh`)
- **插件中心**:浏览 [hub.ifunx.com/skyle1995/dsh-plugins](https://hub.ifunx.com/skyle1995/dsh-plugins) 插件仓库目录,一键安装 / 更新 / 卸载插件(等价于 `dsh plugin --profile web add/remove`,操作日志实时可见)
- **事件记录**:记录本次会话内的服务启停事件
- **托盘常驻**:点 X 关窗不退出,驻留系统菜单栏 / 托盘(macOS / Windows),防误关

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
