Task 5 追加：镜像目录 `parse_signed_catalog` 现使用 Ed25519 公钥验签（支持 raw/base64url 64-byte signature），再执行 schema/host/hash 校验。`cargo test -p wujin-install` 与 clippy -D warnings 均通过。提交 da2c423。
