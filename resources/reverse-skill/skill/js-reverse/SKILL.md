---
name: js-reverse
description: JS 逆向实战：webpack 解包与模块还原、AST 反混淆、JSVMP/自定义虚拟机还原、加密参数定位（hook 链）、sign 复现
whenToUse: 前端加密参数（sign/token）需要逆出算法；代码被 obfuscator/JSVMP 混淆；webpack 打包产物需要还原模块
---

# JS 逆向（前端加密 / 混淆 / JSVMP）

## 一、快速定位加密入口
```js
// 浏览器控制台 hook 常见出口
const orig = JSON.stringify; JSON.stringify = function(o){ console.log('JSON:', new Error().stack, o); return orig.apply(this, arguments) }
const _open = XMLHttpRequest.prototype.open
XMLHttpRequest.prototype.open = function(m,u){ this.addEventListener('load',()=>console.log('XHR', u, this.responseText)); return _open.apply(this, arguments) }
// 关键字：encrypt, sign, md5, CryptoJS, JSEncrypt, _0x（混淆特征）
```
- 断点：XHR/fetch 断点 + 事件监听断点；调用栈回溯到加密函数
- 三段式确认：入参 → 加密函数 → 密文（hook 三个位置对齐）

## 二、webpack 解包
```js
// 控制台 dump 模块源码
for (const id of Object.keys(__webpack_require__.m)) {
  const src = __webpack_require__.m[id].toString()
  if (/sign|encrypt/.test(src)) console.log('module', id, src)
}
```
- 还原后放到本地跑（补 window/document 桩）；webpack5 按 chunk 映射还原

## 三、AST 反混淆（obfuscator.io 系）
```bash
npm i @babel/parser @babel/traverse @babel/generator
npx webcrack input.js -o out/      # 字符串数组还原/控制流平坦化/死代码删除
```
- 手写变换：字符串数组解密 → 常量折叠；`_0xabc[0x12]()` → 直调；IIFE 展开
- 验证：变换后 node out.js 与混淆版 sign 输出一致

## 四、JSVMP / 自定义虚拟机
特征：单函数 + 大数组 + while(switch) + 单字母变量驱动
```js
function vm_run(code, input) { let pc = 0; while (true) { const op = code[pc++]; switch (op) { /* ... */ } } }
```
- 路径1（语义还原）：插桩 switch 记录 op/操作数 → 轨迹还原成等价 JS
- 路径2（黑盒调用）：抽出 VM 函数 + Node 补环境，当 sign 服务（与 crypto-recovery 的 RPC 同思路）
- 判定：还原/黑盒对 ≥20 组随机输入与线上一致

## 五、环境补全
```bash
npm i jsdom    # DOM 桩；注意 canvas 指纹/Timer/location
node --experimental-vm-modules run.js
```

## 红线
- sign/加密函数已定位（栈回溯证据）
- 本地复现与线上全量样本一致
- JSVMP：黑盒调用可用或语义还原完成

## 衔接
- 算法细节 → crypto-recovery；协议级 → protocol-reverse-engineering
- 移动端 hook → frida-hook-mastery
