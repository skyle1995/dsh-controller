---
name: dotnet-unity-reverse
description: .NET 与 Unity 逆向：dnSpy/ILSpy 反编译、de4dot 去混淆、IL 修改与重编译、Unity IL2CPP（global-metadata + Il2CppDumper）、AssetBundle 解包（AssetStudio）、游戏反作弊识别与对抗思路
whenToUse: 目标是 .NET 程序或 Unity 游戏；需要看逻辑、改数值/校验、还原 IL2CPP 符号、拆资源包
---

# .NET / Unity 逆向

## 一、.NET 程序

~~~
# 反编译：dnSpy（可调试）/ ILSpy / dotPeek
file app.exe; strings -a app.exe | grep -i mscoree    # 判断是否 .NET
de4dot app.exe -o cleaned.exe                          # 去混淆
# 改 IL：dnSpy 里直接编辑方法体 → File → Save Module
~~~

要点：找 License / Validate / Check 命名的方法 → 直接改返回值；字符串常量在 #US 堆，可 grep。

## 二、Unity 游戏

### Mono 后端（Assembly-CSharp.dll）
~~~
# dnSpy 打开 Managed/Assembly-CSharp.dll
# 全局搜：PlayerPrefs、gold、damage、isVip、CheckLicense
~~~

### IL2CPP 后端（主流）
~~~
# 需要：libil2cpp.so 或 GameAssembly.dll + global-metadata.dat
Il2CppDumper GameAssembly.dll global-metadata.dat out/    # 产出 dump.cs 与 il2cpp.h
# 用 dump.cs 的 RVA 对到 so → IDA/Ghidra 分析
# Frida 挂钩：用 dump 出的偏移直接 hook
~~~

### 资源与配置

AssetStudio 打开 *.assets / *.bundle，导出贴图/文本/配置；加密 bundle 先找解密函数（常在 Assembly-CSharp 或 libil2cpp）。

## 三、反作弊面（识别与思路）

| 层 | 常见实现 | 观察点 |
|---|---|---|
| 用户态 | EAC/BattlEye 用户态校验 | 进程扫描、模块枚举、内存校验 |
| 内核态 | 驱动回调（PsSetLoadImageNotify）、Handle 保护 | 驱动加载、ObRegisterCallbacks |
| 完整性 | 代码段 CRC、签名校验 | 改一处即崩 |
| 反调试 | IsDebuggerPresent、NtQueryInformationProcess、时间检测 | 断点即退出 |

对抗思路（研究用途）：先定位校验函数（字符串/xref），再决定 patch 或 hook；内核层需在虚拟机内分析。细节见 reverse-engineering-tools。

## 红线

改后程序正常运行（数值/校验生效），或 IL2CPP 符号还原出可读方法名并通过 hook 验证。

## 衔接

native 层 → ida-ghidra-practice / windows-unpacking；动态 hook → frida-hook-mastery；协议 → protocol-reverse-engineering
