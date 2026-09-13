# DSH Controller

DeepSeek Harness 桌面控制器 —— 一个独立的 Electron 桌面应用,脱离终端管理 dsh 进程与其数据。

## 功能

- **dsh 进程管理**:一键启动 / 停止 / 重启 dsh,显示运行状态与端口,一键打开会话界面
- **会话管理**:按项目分组、折叠 / 展开、归档 / 还原 / 删除(改完自动重启 dsh 让网页端同步)
- **Skills 管理**:新建 + 导入(`.zip` / `.tar.gz` / `.md` / 目录,兼容 Claude SKILL.md 格式)
- **提示词管理**:编辑系统提示词(persona),dsh 热加载
- **托盘常驻**:点 X 关窗不退出,驻留 macOS 菜单栏,防误关

## 技术栈

- Electron 44 + React 19 + electron-vite 5 + electron-builder

## 开发

```bash
npm install    # 安装依赖(含 Electron 二进制)
npm run dev    # 开发模式(热更新)
```

## 打包

```bash
npm run dist   # 生成 dist/mac-arm64/DSH Controller.app 与 dist/DSH Controller-0.1.0-arm64.dmg
```

> 说明:当前未做代码签名,首次打开需右键 App →「打开」;暂用默认 Electron 图标。

## 数据存储

控制器直接读写 `~/.dsh/` 下的数据(不修改 dsh 源码):

| 数据 | 位置 |
|------|------|
| 工作区 + 归档标记 | `~/.dsh/storages/workspace.json` |
| 会话日志 | `~/.dsh/sessions/` |
| Skills | `~/.dsh/skills/` |
| 系统提示词(persona) | `~/.dsh/cordis.patch.yml` |

## 已知限制

- 「停止 dsh」会停掉占用 3080 端口的进程(包括终端手动启动的 dsh)
- 归档 / 删除会话后会自动重启 dsh,使网页端立即同步(会更换访问 token)
