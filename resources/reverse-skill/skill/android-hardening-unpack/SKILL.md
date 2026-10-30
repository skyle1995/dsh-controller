---
name: android-hardening-unpack
description: Android 加固脱壳：加固特征识别（360/爱加密/梆梆/腾讯乐固/娜迦）、FART/Youpk/BlackDex 主动调用脱壳、frida-dexdump 内存 dump、dex 修复与重建、so 加固与 VMP、root/frida 检测绕过
whenToUse: APK 反编译出来是壳（业务代码缺失）；需要拿到真实 dex/so；需要绕过加固的运行时检测
---

# Android 加固脱壳

## 一、识别加固厂商

~~~
# 特征是这几个方向：Application 类、so 名、多 dex、assets 里的壳文件
unzip -l app.apk | grep -E "lib/|assets/" | head -30
apkanalyzer manifest application-id app.apk
# 常见壳
libjiagu.so / libjiagu_art.so        → 360
libexec.so / libexecmain.so          → 爱加密
libsecexe.so / libsecmain.so         → 梆梆
libshell*.so / libtosprotection      → 腾讯乐固
libchaosvmp.so / libddog.so          → 娜迦
# Application 被指向壳类：com.stub.StubApp / com.secneo.apkwrapper.ApplicationWrapper
~~~

## 二、脱壳（按可行性排序）

### 1) frida-dexdump（最快，动态）
~~~
frida-dexdump -U -f com.target.app        # 内存里搜 dex magic 全量 dump
# 产物：多个 .dex，用 jadx 直接打开
~~~

### 2) BlackDex（免 root 环境友好）
- 手机上装 BlackDex → 选择目标 App → 一键 dump → 导出 dex
- 适合加固较弱或可调试包

### 3) FART / Youpk（主动调用，抗 VMP 抽取）
~~~
# FART：刷入定制 ROM，运行目标 App，自动遍历类方法触发解密并 dump
# Youpk（基于 ART 修改）：同样需定制 ROM
# 产物：dex + 方法体（可修复抽取掉的 code item）
~~~

### 4) FRIDA 脚本定点 dump
~~~
# 在 ClassLoader 加载后遍历 DexFile，dump cookie 指向的内存
Java.perform(function () {
  Java.enumerateClassLoaders({
    onMatch: function (loader) {
      try {
        var dexFiles = loader.getDexFiles ? loader.getDexFiles() : null;
      } catch (e) {}
    }, onComplete: function () {}
  });
});
~~~

## 三、dex 修复

- 抽取壳（方法体被抽空）：用 FART 的修复工具 或 dexfixer 把 dump 的 code item 回填
- 多 dex 合并：jadx 支持多文件同时打开；或 apktool 回编
- 校验失败：改 AndroidManifest 去掉签名校验、或 hook 校验函数返回 true

## 四、so 加固与 VMP

~~~
# 1) 判断 so 是否加固：节区异常、导出函数少、字符串加密
readelf -S lib/arm64-v8a/libtarget.so | head -20
strings -a libtarget.so | head -20
# 2) 动态 dump：在解密后从内存 dump so
frida -U -f com.target.app -l dump_so.js    # 找 dlopen 后的 base，按 program header 写回
# 3) VMP：函数被虚拟化 → 需要 trace 执行流还原（见 emulation-unidbg + unicorn）
# 4) unidbg 直接跑 so 的关键函数（签名/加密）
~~~

## 五、绕过运行时检测

| 检测 | 绕过 |
|---|---|
| root 检测（su 路径、build tags）| Magisk + Zygisk + Shamiko；hook 检测函数返回 false |
| frida 检测（端口 27042、线程名、maps 里的 frida）| 改端口（frida-server -l）、重命名 so、spawn 模式早期 hook |
| 调试检测（ptrace、TracerPid）| hook /proc/self/status 返回 0 |
| 模拟器检测 | 真机 + 改 build.prop 指纹 |
| 完整性校验（签名/自身 hash）| hook PackageManager.getPackageInfo 返回原签名 |

## 六、常见坑

1. 只 dump 到壳 dex（业务 dex 还没加载）→ 先触发业务入口再 dump
2. dump 出的 dex 打不开 → code item 被抽取，需要修复
3. 反调试让 frida attach 失败 → 用 spawn 模式 + 早期 hook 关检测
4. 加固更新换代（如 360 新版本）→ 换 FART/Youpk 路线

## 红线

能反编译出业务类与方法体（非壳代码），或 so 关键函数可被调用/还原。

## 衔接

静态分析 → android-reverse-engineering / reverse-engineering-android-malware-with-jadx；动态 hook → frida-hook-mastery；so 模拟 → emulation-unidbg
