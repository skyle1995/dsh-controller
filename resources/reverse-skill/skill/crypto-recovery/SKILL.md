---
name: crypto-recovery
description: 加密算法还原：魔改 AES/DES/RC4 识别、自定义流密码定位、密钥与 IV 提取、白盒密码破解、签名算法复现与一致性校验
whenToUse: 逆向中遇到加密数据(抓包密文/本地存储加密)需要还原明文；需要把 APP 内签名算法在本地复现；识别算法被魔改的位置并还原
---

# 加密算法还原(逆向实战)

## 一、定位加密点

### 动态(Frida 优先)
```js
// Java 层:枚举常见类
['javax.crypto.Cipher','javax.crypto.Mac','javax.crypto.spec.SecretKeySpec'].forEach(cn=>{
  Java.use(cn).$init.overload('byte[]','java.lang.String').implementation=function(k,alg){
    console.log(cn, alg, JSON.stringify(k)); return this.$init(k,alg);
  }
})
// Native 层:hook 加密导出符号
Interceptor.attach(Module.findExportByName('libt.so','AES_encrypt'),{onEnter:a=>console.log(hexdump(a[0],{length:32}))})
```
- 抓到 **算法名+密钥+IV+明文样本** 四件套即完成定位

### 静态特征
| 特征 | 算法 |
|---|---|
| 常量 0x67452301/0xEFCDAB89 | MD5/SHA1 |
| S 盒 63 7C 77 7B | AES |
| 表 0x9E3779B9 | TEA/XXTEA |
| 密钥流异或特征 | RC4(初始化 256 循环) |
| base64 变体(-_ / 无=) | 自定义 Alphabet(提取字母表) |

## 二、魔改识别与还原

```python
# 魔改点三处:AES 的 S 盒/Rijndael 轮常量、初始向量生成、分组模式(GCM→CCM/CBC 变体)
# 验证:拿标准库加密同输入比对
from Crypto.Cipher import AES
std = AES.new(key, AES.MODE_ECB).encrypt(b'A'*16)
print(std == dump_out)     # False → 逐字节 diff 定位魔改层
```
- **S 盒替换**:从二进制 dump S 盒(256字节表)替换 python 实现里的
- **轮数魔改**(10→12):数 rounds 次数改实现
- **自定义流密码**:hook 每步输出,还原 LFSR/状态机;常见=RC4 变体(KSA 改步长)

## 三、白盒密码(WBC)

- 特征:大查找表(几十 KB~MB)、无显式密钥
- 破法:DCA(差分计算分析,trace 相关性)或 BGE 攻击;工具 SideChannelMarvels/Deadpool
- 实用替代:**不还原密钥,直接调用**(frida RPC 调白盒函数当黑盒签名服务,见 frida-hook-mastery 第六节)

## 四、签名算法复现(协议还原常用)

```python
# 目标:本地算出的 sign 与服务端校验一致
# 1) hook 抓 N 组 (params, sign) 样本
# 2) 按定位结果实现(hmac/md5(a+b+ts) / AES 加密后取前16hex)
# 3) 回归验证
def sign(params, ts): return hashlib.md5(f"{params}|{ts}|{SALT}".encode()).hexdigest()
assert all(sign(p,t)==s for p,t,s in samples)    # 全量样本通过才算还原
```

## 五、本地存储加密
- Android:EncryptedSharedPreferences 主密钥在 KeyStore(hook 后导出);SQLite 加密(SQLCipher,密钥 hook 打开函数)
- iOS:Keychain dump(见 ios-reverse-engineering)

## 红线(完成判定)
- 还原实现通过**全量样本回归**(≥20 组随机样本一致)
- 密文可解回明文(往返验证)

## 衔接
- hook 基建 → frida-hook-mastery;协议级 → protocol-reverse-engineering
- Web 前端加密(webpack 混淆)→ js-reverse(上游路由)
