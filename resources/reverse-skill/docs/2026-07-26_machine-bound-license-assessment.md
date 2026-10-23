# CDK 静默机器绑定与授权服务器最终方案

- 日期：2026-07-26
- 产品：无限破甲 Windows 客户端
- 当前版本：Rust / Tauri 1.30.3
- 现有授权：`WJP1 + Ed25519`
- 文档审查：主项目 tracked 文档 555/555，官网项目文档同步复核

## 1. 最终目标

保留现有购买、发码和客户端 CDK 输入方式，在用户输入 `WJP1` CDK 后，由客户端静默完成设备密钥生成、服务器绑定和设备授权票据保存。

用户全程停留在软件激活页面，只会看到“正在激活”“激活成功”或明确的重试提示。

## 2. 用户看到的流程

```text
购买软件
→ 获得现有 WJP1 CDK
→ 打开无限破甲
→ 输入 CDK
→ 点击激活
→ 显示激活成功
→ 后续直接进入软件
```

## 3. 客户端后台静默流程

```text
用户输入 WJP1 CDK
→ 客户端本地执行 Ed25519 验签
→ 在 TPM 2.0 中生成不可导出的设备私钥
→ TPM 缺失时使用 Windows DPAPI 保护软件密钥
→ device_id = SHA256(device_public_key)
→ 通过 HTTPS 调用 api.codexpojia.com
→ 提交完整 WJP1、设备公钥和随机 challenge
→ 服务器独立验证 WJP1 和签发记录
→ 首次原子绑定 license_id + device_id
→ 服务器签发 WJD1 设备授权票据
→ 客户端保存并验证 WJD1
→ 显示“激活成功”
```

首次激活需要网络连接。激活完成后，客户端通过本地 `WJD1` 验签和设备私钥持有证明支持离线启动。

## 4. 协议兼容

- 用户输入的仍然是现有 `WJP1` CDK。
- 老用户和历史 `version_rule=1.x` CDK继续兼容。
- `WJP1` 严格字段保持原样，设备信息放入服务器绑定记录和内部 `WJD1`。
- `WJD1` 仅供客户端内部使用，用户界面隐藏其内容。
- 已有两份生产 CDK 清单各包含 1,000 条结构有效且序列号唯一的授权，可用于建立服务器签发记录。

## 5. 服务器购买配置

### 推荐配置

| 项目 | 配置 |
|---|---|
| CPU | 2 核 |
| 内存 | 4 GB |
| 系统盘 | 80 GB SSD |
| 公网带宽 | 5 Mbps |
| 操作系统 | Ubuntu 24.04 LTS |
| 云产品 | 腾讯云轻量应用服务器或阿里云轻量应用服务器 |

2 核 2 GB 也可用于首个测试版本；正式运行推荐 2 核 4 GB。授权请求主要发生在首次激活，这套配置可覆盖数万名用户的激活规模。

## 6. 服务器部署结构

```text
客户端
   ↓ HTTPS
api.codexpojia.com
   ↓
Caddy / Nginx
   ↓
Rust Axum 授权 API
   ↓
PostgreSQL 16
```

建议组件：

- Rust + Axum：授权 API，与现有 Rust 客户端技术栈一致；
- PostgreSQL 16：保存许可证、设备和激活记录；
- Caddy：自动申请和续期 HTTPS 证书；
- systemd 或 Docker Compose：进程管理与自动启动；
- 云对象存储：保存每日加密数据库备份。

`codexpojia.com` 继续作为现有 Cloudflare Pages 静态官网。`api.codexpojia.com` 只承担客户端后台授权请求，用户没有访问新页面的操作。

## 7. 服务端最小接口

### `POST /v1/activate`

客户端提交：

```json
{
  "cdk": "WJP1.PAYLOAD.SIGNATURE",
  "device_public_key": "BASE64URL_PUBLIC_KEY",
  "device_id": "SHA256_HEX",
  "challenge": "BASE64URL_RANDOM_NONCE",
  "device_signature": "BASE64URL_SIGNATURE"
}
```

服务器执行：

1. 验证请求大小、时间窗口和限速状态；
2. 独立验证 `WJP1` Ed25519 签名和产品字段；
3. 核对 CDK 序列号是否属于签发记录；
4. 验证 `device_id` 是否与设备公钥匹配；
5. 验证设备私钥对 challenge 的签名；
6. 在数据库事务中完成首次设备绑定；
7. 返回签名 `WJD1` 设备授权票据。

### `POST /v1/status`

供客户端在有网络时静默检查授权记录，响应只返回授权状态和服务器时间。

## 8. 数据库最小结构

### `licenses`

- `license_id`
- `serial`
- `product`
- `license_type`
- `version_rule`
- `status`
- `created_at`

### `devices`

- `device_id`
- `license_id`
- `device_public_key`
- `activated_at`
- `last_seen_at`

### `activation_events`

- `event_id`
- `license_id`
- `device_id`
- `result_code`
- `created_at`

日志记录序列号哈希和结果码，完整 CDK、设备私钥、访问令牌及签名密钥均排除在日志内容之外。

## 9. 密钥划分

| 密钥 | 保存位置 | 用途 |
|---|---|---|
| WJP1 CDK 私钥 | 离线签发环境 | 生成 CDK |
| WJP1 CDK 公钥 | 客户端与授权服务器 | 验证 CDK |
| WJD1 私钥 | 云 KMS或授权服务器受限密钥存储 | 签发设备票据 |
| WJD1 公钥 | 客户端 | 验证设备票据 |
| 更新签名私钥 | 独立离线发布环境 | 签名更新清单和安装包 |

三条信任链保持隔离。服务器只接触 WJD1 在线签名能力和 WJP1 验签公钥。

## 10. 服务器安全配置

- 安全组仅开放 `80/443`；
- PostgreSQL只监听 `127.0.0.1`；
- SSH 使用密钥登录并限制管理 IP；
- 激活接口设置 IP、CDK 序列号和设备三级限速；
- 每个请求使用随机 challenge，并设置短有效期；
- 数据库每日加密备份到独立对象存储；
- 备份至少保留 30 天并定期执行恢复测试；
- 管理入口启用双因素认证；
- 服务异常时保留结构化结果码，日志隐藏授权敏感内容。

## 11. 客户端状态

客户端激活界面只需要以下状态：

```text
idle
validating_local
registering_device
active
invalid_cdk
already_bound
network_error
server_error
storage_error
```

界面文案示例：

- `validating_local`：正在验证激活码；
- `registering_device`：正在完成设备激活；
- `active`：激活成功；
- `network_error`：网络连接失败，请检查网络后重试；
- `already_bound`：该激活码已绑定其他设备；
- `server_error`：激活服务暂时繁忙，请稍后重试。

## 12. 最终实施顺序

1. 购买 2 核 4 GB Ubuntu 24.04 云服务器；
2. 配置 `api.codexpojia.com`、HTTPS和服务器安全组；
3. 建立 PostgreSQL 数据库和 CDK 签发记录；
4. 实现 Rust Axum `/v1/activate` 接口；
5. 建立独立 WJD1 签名密钥；
6. 在客户端实现 TPM / DPAPI 设备密钥；
7. 将现有 CDK 激活按钮接入静默设备绑定；
8. 增加首次激活、重复激活、断网、并发绑定和票据篡改测试；
9. 小范围测试后再切换正式客户端。

## 13. 最终决定

采用现有 `WJP1` CDK输入方式，首次联网时静默绑定 TPM / DPAPI 设备密钥，由授权服务器签发内部 `WJD1` 设备票据。用户只操作客户端现有激活页面，官网购买和发码流程保持原样。
