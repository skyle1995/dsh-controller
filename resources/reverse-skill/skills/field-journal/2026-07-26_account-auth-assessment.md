# 2026-07-26 账号认证迁移评估

## 场景分类

Windows Rust/Tauri / CDK activation / account identity and entitlement review

## 目标概述

评估把离线 WJP1 CDK 升级为购买服务 + OIDC 账号 + 订阅授权的可行度、技术边界和中国大陆合规关注点。

## 证据与结论

- `wujin-core` 使用 canonical JSON + Ed25519，license compatibility 11 tests、activation 4 tests 全部通过。
- 付费 `reverse-skill.zip` 在 release build 中写入 OUT_DIR 并由 Tauri `include_bytes!` 嵌入 EXE；账号体系改善撤销和运营，资源保密仍需改变分发边界。
- 本地 `ActivationStore::save` 在缓存读取失败时以当前时间重新设置 trial 起点；缓存写入采用 remove + rename，需补充重置试用和原子替换测试。
- 现有协议含授权边界和日志条款，但首页仍含主体/日期占位符；账号化前需要独立隐私政策、数据地图、供应商 DPA、退款/数字交付和账号申诉规则。

## 可复用方案

- 推荐“Authing 或自建 OIDC + 自有 entitlement API + Ed25519 短期 receipt + 本地 3–7 天 grace”。
- Windows 桌面客户端采用系统浏览器 Authorization Code + PKCE；token 存 Credential Manager/DPAPI；UI 不承载信任决策。
- 订单 webhook、计划、设备、公钥、撤销和审计归服务端；CDK 作为兼容/找回入口。
- 中国大陆首发优先境内存储或私有云；跨境场景按 PIPL 第三十九条和 CAC 2024 数据跨境规定做数据路径评估。

## 关键命令

```powershell
cargo test -p wujin-core --test license_compat --test activation
cargo test -p wujin-launcher --test build_keys
```

## 脱敏

未记录账号、token、私钥、完整 CDK、订单号或用户个人信息。
