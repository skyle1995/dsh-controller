# 无限破甲 2.0 Key 明文管理、时间筛选与复制设计

日期：2026-07-27

## 目标

扩展现有无限破甲 2.0 管理后台，使管理员能够按生成时间筛选 Key，并直接复制新生成或历史可用的完整 WJP1 Key。用户明确选择完整 Key 明文保存在服务器数据库中的方案。

## 范围

- 新生成的 Key 自动写入 PostgreSQL，保存完整 WJP1、SHA-256、生成时间、批次、授权类型、期限、绑定机器和撤销状态。
- 管理后台增加生成时间起止筛选、状态筛选、关键字筛选。
- 管理后台支持复制单个完整 Key、复制筛选结果、复制当前批次。
- 旧迁入记录继续兼容；缺少完整 WJP1 的记录显示“历史迁入，未保存明文”，仍可按 serial、机器码、状态和期限管理。
- 不改变客户端激活协议、一机一码逻辑、生产 Ed25519 信任根和现有 2,000 条旧 Key 哈希。

## 数据模型

新增 PostgreSQL migration `005_admin_plaintext_inventory.sql`：

```sql
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS cdk TEXT NULL;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS licenses_generated_at_idx ON licenses (generated_at DESC);
```

运行态 `License` 同步增加：

- `cdk: Option<String>`：新生成 Key 为完整 WJP1，旧迁入记录为 `None`。
- `generated_at: u64`：Unix 秒。
- `batch_id: Option<String>`：后台批次标识。

反序列化旧 PostgreSQL 状态时使用兼容默认值；启动导入旧库存时补齐迁入时间，但不伪造旧 Key 明文。

## API 契约

认证后的 `GET /admin/licenses` 为每条记录增加：

```json
{
  "serial": "SERIAL",
  "cdk": "WJP1.PAYLOAD.SIGNATURE",
  "generatedAt": 1785157200,
  "batchId": "batch-1785157200-3",
  "deviceId": null,
  "revoked": false,
  "expiresAt": null
}
```

旧迁入记录的 `cdk` 和 `batchId` 可为 `null`。该字段只出现在管理员认证路由；激活、健康检查、配置和诊断接口不返回完整 Key。普通日志不记录请求体、CDK 或管理员列表响应。

批次生成继续通过 `POST /admin/license-batches`；事务成功后，完整 Key、哈希、批次和生成时间一次性持久化。持久化失败时整个批次失败，不返回部分 Key。

## 后台交互

### 筛选区

库存表上方增加：

- 关键字：匹配 serial、完整 CDK、机器码或 batch ID。
- 开始时间：`datetime-local`，按 `generatedAt >= start`。
- 结束时间：`datetime-local`，按 `generatedAt <= end`。
- 状态：全部、未使用、已绑定、已撤销、历史迁入。
- 重置按钮。

筛选在浏览器内完成，现有单次库存接口保持不变；当前规模和单批次上限 10,000 条适合此方式。

### 复制操作

- 每行提供“复制 Key”；`cdk=null` 时按钮禁用并显示“无明文”。
- 工具栏提供“复制筛选结果”，每行格式为 `serial,cdk`。
- 新批次生成成功后显示本批结果和“复制本批全部 Key”。
- 使用 `navigator.clipboard.writeText`；浏览器拒绝剪贴板权限时使用隐藏 textarea + `document.execCommand('copy')` 回退。
- 成功或失败均显示就地状态，不使用阻塞式弹窗。

## 安全与权限边界

- 完整 Key 只通过已认证的 `/admin` 会话返回；会话仍为 Secure、HttpOnly、SameSite=Strict，TTL 3,600 秒。
- 登录仍要求管理员用户名、密码和验证码。
- CSV 历史下载仍二次要求 `X-Admin-TOTP`。
- PostgreSQL 不映射公网端口；完整 Key 不写普通日志、诊断响应、部署报告或审计 metadata。
- 数据库备份现在包含完整 Key，备份沿用加密存储和受限访问策略。

## 兼容与迁移

1. migration 使用 `IF NOT EXISTS`，重复部署幂等。
2. 现有 2,000 条旧记录保持 hash 验证和一机一码能力。
3. 已生成的两个 smoke Key 若旧状态中没有 WJP1 明文，显示为无明文记录。
4. 新部署版本首次启动读取旧运行态时补齐 `generated_at`；不会改变 serial、hash、绑定、receipt 或撤销状态。
5. 客户端 `/v1/activate` 和 `/v1/refresh` JSON 契约保持不变。

## 错误处理

- 数据库保存失败：批次返回 `temporarily_unavailable`，内存状态回滚，不展示未落库 Key。
- 剪贴板失败：保留页面数据并显示“复制失败，请重试”。
- 时间输入无效或开始晚于结束：不执行筛选并在筛选区显示错误。
- 旧记录没有明文：复制按钮禁用，不影响撤销和机器码查询。

## 测试与验收

1. migration 测试验证 `cdk`、`generated_at` 和索引存在且可重复执行。
2. domain 测试验证新批次完整 Key、时间和 batch ID 持久化并在重启后恢复。
3. 兼容测试验证旧状态缺少新字段仍能加载，旧 Key 仍可激活。
4. API 测试验证未认证请求看不到库存，认证库存返回新增字段，其他接口不泄露 CDK。
5. 管理页面测试覆盖时间控件、状态筛选、单条复制、筛选复制和批次复制。
6. 浏览器行为测试覆盖时间边界、无明文旧记录和剪贴板回退。
7. 运行三个 Rust crate 的完整测试、格式检查和生产 smoke。
8. 在线生成一条测试 Key，确认服务器重启后仍可查询复制，再完成同机、异机和撤销验证。

## 交付边界

本次只修改 `services/license-api`、对应测试、部署文档和实施报告；不修改隔壁任务正在维护的 `launcher-rs/ui/**`。
