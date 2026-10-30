---
name: ida-ghidra-practice
description: IDA/Ghidra 实战：IDAPython 与 pyghidra 脚本化、FLIRT/函数签名识别库函数、结构体类型重建、调试脚本（脱壳）、批量分析与 diff
whenToUse: 需要大规模/批量分析样本；自动识别库函数、还原结构体；调试器自动化（脱壳、断点脚本）
---

# IDA / Ghidra 实战脚本化

## 一、IDAPython 常用
```python
import ida_funcs, ida_bytes, ida_name, idautils, idc
for ea in idautils.Functions():
    if 'sub_' in ida_funcs.get_func_name(ea):
        ida_name.set_name(ea, 'candidate_%x' % ea)
for s in idautils.Strings():
    for x in idautils.XrefsTo(s.ea):
        idc.set_cmt(x.frm, 'ref:%s' % str(s), 0)
```
- 批量伪代码：ida_hexrays.decompile(ea)（需 Hex-Rays）
- diff：BinDiff / Diaphora（补丁前后函数级比对）

## 二、Ghidra 脚本（headless 批量）
```bash
analyzeHeadless /tmp/proj MyProj -import sample.exe -postScript MyScript.py -deleteProject
```
- DecompInterface().decompileFunction(f, 60, monitor) 导出伪代码
- 批量流水线：import → 脚本导出 JSON（函数/字符串/xref）→ 汇总打标签

## 三、FLIRT / 函数签名（剥离库符号后恢复可读性）
- IDA：载入官方 .sig（vcruntime/openssl/libc）
- Ghidra：Function ID（.fidb）create → apply
- 自建：已知库编译 → 抽签名 → sigmake（IDA）
- 效果：sub_401000 → memcpy/SSL_read

## 四、结构体/类型重建
- IDA：Local Types 导入 C 头；Create struct from selection
- Ghidra：Auto Create Structure + Data Type Manager；有 DWARF 优先
- 技巧：从协议字段长度反推布局（与 protocol-reverse-engineering 交叉）

## 五、调试脚本（脱壳/反调试）
- IDA debugger 脚本：add_bpt/改寄存器跳过检测
- x64dbg：bp/run/r eax=1（详见 windows-unpacking 的 ESP 定律流水线）
- 脱壳：OEP 脚本 → dump → Scylla IAT 修复

## 六、批量样本
```bash
yara -r rule.yar samples/                          # 初筛
for f in samples/*.exe; do analyzeHeadless /tmp/p P -import "$f" -postScript export.py -deleteProject; done
```

## 红线
- 批量脚本可复跑（输入→JSON 稳定）
- 关键库函数识别率 ≥80%
- 结构体字段与动态观测一致

## 衔接
- 脱壳 → windows-unpacking；算法 → crypto-recovery
- 动态 → frida-hook-mastery / emulation-unidbg
