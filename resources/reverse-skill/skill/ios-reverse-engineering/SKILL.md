---
name: ios-reverse-engineering
description: iOS 逆向：越狱环境搭建、砸壳（frida-ios-dump/bagbak）、class-dump 头文件、Logos/Theos 插件、Keychain/dump 决权与网络层分析
whenToUse: 需要 dump AppStore 加密 IPA、分析 iOS 应用类与方法、绕过越狱检测/证书锁定、读取 Keychain 凭据
---

# iOS 逆向全流程

## 一、环境(越狱设备优先)

- 推荐:checkra1n(_unc0ver/palera1n 按系统版本)越狱测试机 + Cydia/Sileo 装:
  ```
  OpenSSH、Frida、AFC2(全文件系统)、AppSync Unified(装未签名包)
  ```
- 非越狱路线:重打包注入(砸壳后的 IPA 用 insert_dylib 注入库 + 证书重签 + SideStore/Sideloadly 安装)

## 二、砸壳(拿到可分析 IPA)

```bash
# frida-ios-dump(最常用)
pip3 install frida-tools && git clone https://github.com/AloneMonkey/frida-ios-dump
./dump.py <bundleID>            # 拿到 decrypted-xxx.ipa
# 判定成功:otool -l Payload/App.app/App | grep -A5 LC_ENCRYPTION_INFO → cryptid 0

# 备选:bagbak(越狱机直接 dump)、Clutch(经典注入式)
```
砸壳后:\
- `class-dump -H Payload/App.app/App -o headers/`(ObjC 头)\
- Hopper/Ghidra(IDA)打开主二进制(FAT 需 lipo -thin arm64)

## 三、静态分析要点

```bash
# Info.plist:URL Scheme/权限/内嵌 H5
plutil -p Payload/App.app/Info.plist
# 字符串/接口
strings Payload/App.app/App | grep -iE 'https?://|api|key'
# ObjC 类方法快速定位(class-dump 结果里搜)
grep -rn 'sign\|encrypt\|token' headers/ | head
```
- Frameworks/ 目录:内嵌 dylib(业务常拆在这里,主二进制只是壳)
- Swift 混编:swift-demangle 还原符号

## 四、动态分析(Frida on iOS)

```js
// ObjC hook
if (ObjC.available) {
  var C = ObjC.classes.LoginVC;
  Interceptor.attach(C['- doLogin:pass:'].implementation, {
    onEnter: function (a) {
      console.log('user=' + ObjC.Object(a[2]).toString());
    }
  });
}
```
- 越狱检测对抗:hook `syscall ptrace\|sysctl\|filopen /Applications\|dyld 含 Substrate` 返回干净值
- SSL Pinning:`frida -U -f bundleID -l ios-ssl-bypass.js` 或 objection `ios sslpinning disable`

## 五、Keychain 与本地数据

```bash
# Keychain dump(越狱)
ssh root@iPhone "python /tmp/keychain-dump/keychain_dump.py"
# 沙盒数据定位
ssh root@iPhone "ls /var/mobile/Containers/Data/Application/<UUID>/"
# NSUserDefaults → plist;SQLite(聊_history 等)直接 sqlite3 打开
```

## 六、重打包(改逻辑/去检测)

```bash
# optool 插库
optool install -c load -p '@executable_path/hook.dylib' -t Payload/App.app/App
# codesign 重签(Entitlements 从原包抽)
codesign -f -s "iPhone Distribution: XXX" --entitlements ent.xml Payload/App.app/Frameworks/*
codesign -f -s "iPhone Distribution: XXX" --entitlements ent.xml Payload/App.app/App
# 打包 ipa → AppSync/Sideloadly 安装
```

## 红线(完成判定)
- cryptid=0 的可静态分析 IPA 已留存
- 关键方法(签名/加密/校验)实现定位(hook 打点验证)
- 越狱检测/证书锁定绕过后 App 业务功能正常

## 衔接
- hook/协议复用 → frida-hook-mastery
- 网络协议还原 → protocol-reverse-engineering
- 抓包链路(Charles/mitmproxy + 上述 pinning bypass)
