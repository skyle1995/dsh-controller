# 2026-07-18 Wujin 1.1.0 正式 CDK 发布构建

## 场景分类

Windows Qt/QML / CDK activation / Nuitka release build

## 目标概述

使用 `G:\\AI\\Wujin-release-secrets` 的正式 Ed25519 公钥重打包 1.1.0，确认正式清单 CDK 可验证，并确保冻结 EXE 不接受开发参数。

## 完整执行链路

1. 运行 activation inspection，确认项目为 Qt/QML，激活逻辑位于 Python service/core 层。
2. 使用正式公钥和固定 FluentUI commit 运行 `launcher/build.ps1`。
3. 生产门禁通过：467 个 payload 文件、21 个 capability、29 个工具索引，归档往返无差异。
4. Nuitka onefile 构建成功，输出 `dist/无限破甲.exe`，复制为 `dist/无限破甲-v1.1.0.exe`。
5. 用正式永久和 7 天清单首条 CDK 验证，均通过；运行 66 项 unittest，全部通过。
6. 冻结包的 `--development` 与 `--public-key=ignored` 均返回退出码 2；无参数启动日志出现 `GUI root object created`。

## 踩坑记录

| 问题 | 原因 | 解决方案 | 耗时 |
|------|------|---------|------|
| PowerShell 直接执行 inspection 脚本被拦截 | 当前执行策略限制脚本加载 | 使用 `powershell.exe -ExecutionPolicy Bypass -File` | 短 |
| onefile EXE 原始字节查不到公钥 | Nuitka 对 payload 做了压缩 | 核对最终 `main.dist` 中 32 字节资源与正式公钥逐字节一致 | 短 |
| `.venv` 没有 pytest | 项目测试使用标准 unittest | 使用 `python -m unittest discover -s launcher/tests -p 'test_*.py'` | 短 |

## 工具链发现

- Python 3.12、Nuitka 2.7.12、MSVC `cl 14.3`。
- `launcher/build.ps1` 在 finally 中清理临时公钥和 payload，正式私钥未进入构建输入。
- 公钥资源在最终 `main.dist/launcher/app/resources/public_key.bin` 中为 32 字节，并与正式公钥匹配。

## 关键命令

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File G:\AI\520reverse-skill\launcher\build.ps1 `
  -PythonPath G:\AI\520reverse-skill\.venv\Scripts\python.exe `
  -PublicKeyPath G:\AI\Wujin-release-secrets\wujin-ed25519-public.bin `
  -FluentUiRoot G:\AI\520reverse-skill\launcher\third_party\FluentUI `
  -FluentUiCommit 4e4016ae3fed7d1a3534760b44313e8fb0b8fd29
```

## 可复用模式

- 发行构建只读取 release public key；CDK private key 只留在发行方密钥目录。
- 对 onefile 包验证资源时，优先检查 Nuitka 保留的 `main.dist`，不要假设压缩包内资源以原始字节出现。
- 发布验收同时覆盖正式 CDK、完整测试、冻结参数和实际 GUI 启动日志。

## 脱敏要求

- 未记录任何私钥内容、完整 CDK、签名或密钥字节。
- 仅记录密钥目录结构用途、验证结果和产物哈希。
