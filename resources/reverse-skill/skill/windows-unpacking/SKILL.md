---
name: windows-unpacking
description: Windows 壳分析与脱壳：UPX/VMP/Themida/Safengine 通用流程、ESP 定律/单向遍历脱壳、Dump 与 IAT 重建、OEP 定位、x64dbg 脚本化脱壳
whenToUse: 分析被壳保护的 Windows 样本或目标程序；需要拿到脱壳后的可静态分析 PE；需要定位 OEP 与重建导入表
---

# Windows 脱壳实战

## 一、壳识别

```bash
# PEiE/DIE(Detect It Easy)首选
die.exe target.exe            # 给出壳与版本
# 手工:区段名(UPX0/Themida/.vmp0)、入口点所在区段异常、熵>7 的区段=加密
```

## 二、通用脱壳流程(x64dbg)

### ESP 定律(最通用)
1. 载入 → 系统断点后 **F8 单步**,观察 ESP/RSP 首次变化
2. 对该值下 **硬件访问断点**(右键 ESP → Watch)
3. F9 运行,断在 OEP 附近的 stub 代码
4. 特征:代码变成正常业务(有完整函数序言 push rbp;mov rbp,rsp)

### 一次性内存断点法
- 在**入口点所在区段**下内存执行断点(一次性),F9 直接停在壳解密完跳 OEP 处

### 常见壳速查
| 壳 | 套路 |
|---|---|
| UPX | `upx -d` 直接脱 |
| ASPack | ESP 定律一次过 |
| VMP(部分) | 只脱带壳函数:Stolen bytes 多则不脱,用 VM 分析(见下) |
| Themida | 反调试强:先过反调试(ScyllaHide),分段 dump;WinLicense 特征 |
| Safengine | SEH 混淆 + 虚拟化;常配合 trace + unlicense |

### 反调试对抗
```bash
# x64dbg 插件 ScyllaHide 全勾(PEB/BeingDebugged/NtQueryInformationProcess/时间差)
# 反 VM:VirtualBox/VMware 特征注册表/驱动;本机分析或 patch 检测函数
```

## 三、Dump 与修复

```bash
# 停在 OEP 后:
# 1) Scylla(或 x64dbg 插件)dump 进程 → dumped.exe
# 2) IAT 重建:Autosearch IAT → Get Imports → Fix Dump
#    (部分壳 IAT 混淆(加密调用),用 Universal Import Fixer / 手工)
# 3) 修复后:IDA/Ghidra 打开 dumped.exe 静态分析
```
- VMProtect 虚拟化函数不适用脱壳思路:定位 VM 入口 → vitis/vmpdump 或人工 trace opcode(见 reverse-engineering 的 ollvm-deobfuscation 类似方法论)

## 四、脱壳后校验
- 入口点代码非 stub(正常序言)
- 导入表干净(无大量 Thunk 乱址)
- 字符串/关键逻辑可见(与运行时行为一致)

## 红线(完成判定)
- 脱壳产物在 IDA 中可 F5 出业务伪代码
- 与动态行为(hook 观察)互相印证

## 衔接
- 静态分析 → ghidra/ida 技能;动态 → frida-hook-mastery
- 样本恶意性分诊 → 上游 malware/jadx 技能
