---
name: frida-hook-mastery
description: Frida 实战：动态 hook、Android/iOS 脱壳、反调试/反 Frida 对抗、SSL Pinning 绕过、native 层插桩、RPC 长会话
whenToUse: 需要动态分析 APP（hook 关键函数抓参数/改返回值）、脱壳加固应用、绕过证书锁定抓包、对抗客户端的反调试与反 Frida 检测
---

# Frida Hook 实战（动态插桩全流程）

## 一、环境部署

```bash
# PC 端
pip install frida-tools
frida --version                        # 与 server 大版本必须一致

# Android:按架构推 server(模拟器 x86_64,真机 arm64)
adb push frida-server-<ver>-android-arm64 /data/local/tmp/fs
adb shell "chmod 755 /data/local/tmp/fs && /data/local/tmp/fs &"

# iOS(越狱):Cydia/Sileo 装 Frida(自动运行);非越狱 → 重打包注入(见 ios-reverse-engineering)
```

验证:`frida-ps -U | head`(能列进程即通)。

## 二、基础 Hook(JS)

### Java 层(Android)
```js
Java.perform(function () {
  var C = Java.use('com.t.app.Login');
  // 抓参数
  C.a.overload('java.lang.String', 'java.lang.String').implementation = function (u, p) {
    console.log('login: ' + u + ' / ' + p);
    return this.a(u, p);
  };
  // 改返回值
  C.check.implementation = function () { return true; };
  // 主动调静态方法
  var Util = Java.use('com.t.app.Util');
  console.log(Util.sign('test'));
});
```

### Native 层
```js
// 导出函数
Interceptor.attach(Module.findExportByName('libt.so', 't_sign'), {
  onEnter: function (a) { console.log('in', a[0].readUtf8String()); },
  onLeave: function (r) { console.log('out', r); }
});
// 未导出函数:基址+偏移
var base = Module.findBaseAddress('libt.so');
Interceptor.attach(base.add(0x1234), { onEnter: ... });
// 主动调用
var f = new NativeFunction(base.add(0x1234), 'int', ['pointer','int']);
```

### 枚举辅助
```js
Java.enumerateLoadedClasses({ onMatch: n => (n.includes('sign') && console.log(n)), onComplete: () => {} })
Module.enumerateExports('libt.so').forEach(e => console.log(e.name))
Java.choose(Java.use('com.t.User'), { onMatch: i => console.log(i.pass.value), onComplete: () => {} })  // 堆搜索实例
```

## 三、脱壳(加固应用 dump DEX)

```bash
# 通用法一:FART/frida-dexdump(内存搜 dex 魔数整体导出)
pip install frida-dexdump
frida-dexdump -U -f com.t.app            # 全部 dex 落地后 jadx 打开

# 通用法二:hook ClassLoader 逐个 load 后 dump(对抗函数抽取壳需 FART 主动调用补齐)
```
- 判定脱壳成功:jadx 能看到完整业务类与方法体(不是一堆 native stub)

## 四、对抗(反调试/反 Frida)

### 常见检测与破法
| 检测 | 破法 |
|---|---|
| 遍历 /proc 找 frida-server 名 | 改名推送:`mv fs kd; /data/local/tmp/kd &` |
| 扫 27042/27043 端口 | `fs -l 0.0.0.0:6666` + `frida -H` 连 |
| maps 里找 frida/gadget/linjector | early instrumentation(-f spawn + resume 前已注入) |
| ptrace 自占(反调试) | `frida -U -f --no-pause`;或 hook ptrace 返回 0 |
| JNI 检测(gum 库特征) | 用 gadget 模式注入(改 so 名) |

```js
// 反反调试:ptrace/hook 掉
Interceptor.attach(Module.findExportByName(null, 'ptrace'), { onLeave: r => r.replace(0) })
// 隐藏端口特征:spawn 时即 patch(在 agent 最顶部执行)
```

## 五、SSL Pinning 绕过(抓包前置)

```bash
# 一把梭脚本
frida -U -f com.t.app -l ssl-pinning-bypass.js --no-pause
# 或 objection
pip install objection
objection -g com.t.app explore
> android sslpinning disable
> ios sslpinning disable
```
- hook 点:OkHttp CertificatePinner / TrustManagerImpl.verifyTrusted / BoringSSL   (native 层 pinning → hook ssl_verify_peer_cert 返回 1)

## 六、RPC 长会话(把 frida 当服务用)
```js
rpc.exports = { sign: function (s) { /* 调 app 内签名并返回 */ return ret; } };
```
```python
import frida
s = frida.get_usb_device().attach('com.t.app')
api = s.create_script(open('a.js').read()); api.load()
print(api.exports_sync.sign('abc'))     # 外部脚本/协议还原复用同一签名实现
```

## 红线(完成判定)
- 目标函数的入参/返回已抓到并记录(含调用栈 backtrack)
- 脱壳:dump 出的 dex 在 jadx 中业务方法体完整
- 反检测:目标 APP 正常运行不闪退

## 衔接
- 抓到的加密参数 → 加密算法还原(hook 点回溯到实现函数)
- Android 整体流程 → android-reverse-engineering / jadx 模块
- iOS → ios-reverse-engineering
