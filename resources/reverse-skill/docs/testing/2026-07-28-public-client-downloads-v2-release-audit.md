# AI 客户端下载 2.0 发布验收

## 产品决策

2.0.0 下载完成不以 Authenticode 或 SHA-256 作为放行条件。程序执行以下边界：

- 仅固定 HTTPS 来源和逐跳 host allowlist。
- 限制重定向次数、连接/总超时与最大文件大小。
- 校验响应长度、实际下载完整性及 EXE/MSIX 容器文件头。
- 失败源的临时文件被删除后才切换下一来源。
- 成功后只允许在 Windows Downloads 根目录中定位现有普通文件，并调用 Explorer 选择文件；不执行安装包。

## 自动化证据

```powershell
cargo test -p wujin-windows client_download -- --nocapture
node --test tests/client-downloads-ui.test.js
```

覆盖 Claude、Codex、Cursor 固定来源、HTTPS 重定向边界、镜像到官方源顺序、临时扩展名、代理解析、单下载 busy、进度、失败重试和受限文件定位。最终发布结论以同一 HEAD 的完整非发布门禁为准。
