# CDK 跨语言兼容性协议

## 目标

Rust 客户端必须继续接受历史 Python 签发的 CDK；Rust 后续签发的 CDK 必须同时被 Rust 客户端和迁移期 Python 客户端接受。CDK 协议在 Rust 重构期间冻结，不允许因语言迁移改变 token 字节格式。

## 冻结的 Token 格式

```text
WJP1.<payload_base64url_without_padding>.<signature_base64url_without_padding>
```

- `payload_base64url_without_padding` 是 canonical JSON 的原始 UTF-8 字节。
- `signature_base64url_without_padding` 是 Ed25519 对 payload 原始字节的签名。
- 公钥和私钥均为 32 字节 raw Ed25519 key。
- payload JSON 必须使用 ASCII 转义、字典序 key、紧凑分隔符 `,` 和 `:`，不能出现额外字段。

## 冻结的 Claims Schema

```json
{
  "duration_days": null,
  "license_type": "permanent",
  "product": "wujin-reverse-skill",
  "serial": "0123456789ABCDEF0123456789ABCDEF",
  "version_rule": "1.x"
}
```

- `product` 固定为 `wujin-reverse-skill`。
- `serial` 为至少 16 个字符；当前签发 CLI 使用 32 位大写十六进制字符。
- `version_rule` 支持 `*`、精确三段版本和 `<major>.x`。
- `permanent` 必须使用 `duration_days: null`。
- `trial` 必须使用大于等于 1 的整数 `duration_days`。

## 双向兼容门禁

每次 Rust CDK 代码或构建流程变更都必须通过：

1. Python 签发的历史 CDK → Rust verifier：全部通过。
2. Rust issuer 签发的 permanent/trial CDK → Rust verifier：全部通过。
3. Rust issuer 签发的 CDK → 旧 Python verifier：全部通过。
4. 固定私钥和固定 claims 的 golden vector：payload 字节、token 三段和签名完全一致。
5. Rust issuer 输出的 CSV 使用 `serial,license_type,duration_days,cdk` 列，旧 Python 工具可以读取其 token 列。
6. 伪造、截断、篡改、错误产品、错误版本和非法 license 组合在两种 verifier 中都拒绝。

## 生产材料验证

当前生产公钥固定为：

```text
G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin
```

该目录中的私钥和已签发 CDK 只用于受控发布验证，不提交到仓库、不复制进 Rust 构建目录、不嵌入客户 EXE。历史 CDK 验证脚本只输出数量、类型、版本规则和失败摘要，不输出 token 内容。

## 版本升级规则

Rust 客户端升级到 `1.x` 内的任意版本时，历史 `1.x` CDK 必须继续有效。若未来改变 product、token 前缀、canonical JSON、签名算法或 claims 字段，必须创建新的协议版本和迁移策略，不能静默改变 `WJP1` verifier。
