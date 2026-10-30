---
name: emulation-unidbg
description: 模拟执行：unidbg 跑 Android so（JNI 签名/加密黑盒）、qemu-user 跨架构、unicorn 指令级模拟、反模拟对抗
whenToUse: 目标 so 无法在真机跑（反调试/加固/无设备）；需要批量调用 so 内函数做 sign/解密；跨架构（ARM/MIPS）样本
---

# 模拟执行（unidbg / qemu-user / unicorn）

## 一、unidbg（Android so 黑盒执行）
```java
public class SignEmu {
  static AndroidEmulator emu = new AndroidEmulatorBuilder.for64Bit().build();
  public static void main(String[] a) {
    emu.getMemory().setLibraryResolver(new AndroidResolver(23));
    Module module = emu.loadLibrary("libsign.so", true);
    Number addr = module.findSymbolByName("Java_com_x_Sign_nativeSign", true).getAddress();
    // jstring 需 env.newString；trace: emu.traceCode(0x..., 0x...)
    Object[] out = emu.eFunc(addr, ...);
  }
}
```
- 坑：JNI env 用 emulator.createJni()；getStringUTFChars 补内存；导出符号找不到就按偏移调
- **批量签名服务**：unidbg 套 HTTP（Spring Boot）→ APP 请求代签，无需设备

## 二、qemu-user 跨架构
```bash
qemu-arm -L /usr/arm-linux-gnueabihf ./sample_arm
qemu-arm-static -strace ./sample        # 系统调用跟踪
sudo chroot ./rootfs qemu-arm ./bin/daemon   # 固件根文件系统
```
- 场景：IoT 固件（路由/摄像头 daemon）逆向

## 三、unicorn 指令级
```python
from unicorn import Uc, UC_ARCH_ARM64, UC_MODE_ARM
mu = Uc(UC_ARCH_ARM64, UC_MODE_ARM)
mu.mem_map(0x1000, 0x10000); mu.mem_write(0x1000, code_bytes)
mu.emu_start(0x1000, 0x1000 + len(code_bytes))
# 轨迹：mu.hook_add(UC_HOOK_CODE, cb)
```
- 场景：VM/壳解码函数、算法片段重放

## 四、反模拟对抗
- 检测：/proc/self/maps 缺真机特征、进程名、JNI 栈异常
- 对策：造 fake /proc maps、hide root、hook 检测函数 return true；qemu 下 patch /proc/cpuinfo 判定

## 红线
- 模拟结果与真机一致（≥10 组）
- 批量签名服务并发 100 次稳定
- 跨架构样本执行到关键逻辑

## 衔接
- so 静态 → android-reverse / ida-ghidra-practice；hook → frida-hook-mastery
- 算法 → crypto-recovery
