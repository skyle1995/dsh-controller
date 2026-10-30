---
name: wasm-reverse
description: WebAssembly 逆向：wasm 提取与模块结构、wabt 工具链（wasm2wat/wat2wasm）、wasm-decompile、导入导出与内存模型、JS glue 分析、Emscripten/Rust 特征、补丁与重打包
whenToUse: 目标用 wasm 做核心算法（加密/校验/游戏逻辑/播放器 DRM）；需要还原算法或打补丁
---

# WebAssembly 逆向

## 一、提取

~~~
grep -oE "[a-zA-Z0-9_./-]+\.wasm" page.html app.js
curl -O https://TARGET/app.wasm
grep -oE "data:application/wasm;base64,[A-Za-z0-9+/=]+" app.js | cut -d, -f2 | base64 -d > app.wasm
binwalk -e firmware.bin | grep wasm
~~~

## 二、工具链

~~~
wasm2wat app.wasm -o app.wat
wasm-decompile app.wasm -o app.dcmp      # 伪 C，可读性最好
wasm-objdump -x app.wasm                 # 段/导入导出/函数表
wasm-validate app.wasm
wat2wasm app.wat -o patched.wasm
~~~

浏览器：DevTools → Sources → 打开 .wasm → 可下断点做指令级调试。

## 三、结构速读

- import：env.memory、env.abort、js 回调（glue 挂钩点）
- export：_start、malloc、自定义名（Rust 保符号）
- 线性内存 + __stack_pointer
- table：间接调用（虚函数/回调分发）

## 四、语言特征

| 特征 | 判断 |
|---|---|
| env.emscripten_* / __cxa_* | Emscripten（C/C++）|
| rust_eh_personality / __rust_alloc | Rust |
| 短名 + br_table 密集 | 剥离或 AssemblyScript |
| data 段连续可读字符串 | 未混淆 |

## 五、算法还原

~~~
grep -oE "i32.const 0x[0-9a-f]+" app.wat | sort | uniq -c | sort -rn | head
wasm-objdump -d app.wasm | grep -A 20 "func\[.*\] <entry>"
~~~

配合 glue：找 exports.xxx( 调用点，确定输入输出格式。

## 六、补丁与重打包

~~~
# wasm2wat 改逻辑 → wat2wasm → wasm-validate
# 替换文件，或用 Service Worker 拦截 .wasm 请求返回补丁版
~~~

## 红线

算法输出与原实现一致（≥20 组样本），或补丁版在目标环境正常运行。

## 衔接

JS 混淆 → js-reverse；算法细节 → crypto-recovery；Electron 内嵌 → electron-app-reverse
