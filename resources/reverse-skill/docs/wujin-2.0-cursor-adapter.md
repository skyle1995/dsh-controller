# 无限破甲 2.0 Cursor 续杯适配器

## 边界

- Cursor 续杯属于付费能力，Tauri 端先执行 WJD1 付费授权门禁。
- 未进入签名兼容目录的 Cursor 版本只读检测，不创建备份、不写文件、不改注册表或设备标识。
- 适配器只处理显式允许的 JSON 存储文件，并在写入前备份、原子替换、回读验证；失败时恢复备份。

## 运行配置

| 环境变量 | 用途 |
|---|---|
| `WUJIN_CURSOR_CATALOG_PATH` | Debug fixture 的签名兼容目录 JSON 文件；Release 使用构建期内嵌目录 |
| `WUJIN_CURSOR_CATALOG_PUBLIC_KEY_PATH` | Debug fixture 的 32 字节 Ed25519 公钥文件；Release 使用构建期内嵌公钥 |
| `WUJIN_CURSOR_CATALOG_PUBLIC_KEY` | Debug 兼容入口，URL-safe Base64 或标准 Base64，32 字节 |
| `WUJIN_CURSOR_STORAGE_PATH` | 测试/托管环境的 JSON 存储路径；缺省使用 `%APPDATA%/Cursor/User/globalStorage/storage.json` |

兼容目录条目必须包含版本、`json-v1` 存储 schema、进程名列表、适配器源码 SHA-256、`verified=true` 和管理员权限标志。目录签名覆盖 canonical `entries + schemaVersion`，签名或源码哈希不匹配时操作失败。

## 用户流程

1. 选择 Cursor 后进入“一键配置”。
2. 点击“一键续杯”，客户端检测 Cursor 版本和签名目录。
3. 兼容时创建带时间戳的备份，写入受控 marker，回读验证并显示结果。
4. 页面始终提供“恢复上次状态”；重启后从 app-owned `latest.json` 恢复，并校验精确目标路径、备份目录边界和 SHA-256。

## 自动化证据

- `wujin-cursor`：13 个测试覆盖未知版本、备份/更新/跨重启恢复、坏 JSON、目录签名篡改、未知字段、进程 allowlist、权限门、目标绑定、路径越界和备份篡改。
- `wujin-launcher`：Tauri command 编译、clippy 和全量 workspace 测试通过。
- UI：Cursor 付费门禁、续杯和恢复入口均有源码契约测试，并纳入 `test-2.0-gate.ps1`。
