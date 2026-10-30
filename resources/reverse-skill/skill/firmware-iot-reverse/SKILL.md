---
name: firmware-iot-reverse
description: 固件与 IoT 逆向：固件获取（官网/OTA 抓包/SPI Flash）、binwalk 提取、squashfs/jffs2 挂载、硬编码凭据与启动脚本、qemu/FirmAE 模拟、UART/JTAG 识别、命令注入与溢出定位、改固件回刷
whenToUse: 目标为路由器/摄像头/NVR/工控设备；需要从固件找凭据、后门、漏洞；需要模拟运行固件服务
---

# 固件与 IoT 逆向

## 一、获取固件

~~~
curl -O https://vendor/firmware_v1.2.bin        # 官网
dd if=/dev/mtd0 of=/tmp/mtd0.bin                # 设备上 dump
flashrom -p ch341a_spi -r dump.bin              # SPI Flash 硬件读取
~~~

## 二、提取与挂载

~~~
binwalk -e firmware.bin
binwalk -Me firmware.bin                        # 递归（含签名头）
unsquashfs -d rootfs squashfs-root.sqsh
jefferson -d rootfs rootfs.jffs2                # jffs2
ubireader_extract_images firmware.ubi           # ubifs
~~~

## 三、凭据与后门速查

~~~
grep -rniE "passwd|password|admin|root:" rootfs/etc/ | head -30
cat rootfs/etc/shadow                           # 有 hash 就 john/hashcat
grep -rn "httpd|telnetd|dropbear" rootfs/etc/init.d/ rootfs/etc/rc*
grep -rn "backdoor|debug|telnet" rootfs/usr/sbin/ 2>/dev/null | head
find rootfs -name "*.cgi" -o -name "*.lua" | head
~~~

## 四、模拟运行

~~~
qemu-mipsel -L rootfs rootfs/usr/sbin/httpd     # 单程序
./run.sh -r TARGET firmware.bin                 # FirmAE / firmadyne 全系统
nmap -p- 127.0.0.1                              # 起服务后扫本地
~~~

## 五、硬件接口

| 接口 | 识别 | 用途 |
|---|---|---|
| UART | 4 pin（GND/TX/RX/VCC），上电看输出 | 拿 shell / uboot |
| JTAG | 10/20 pin 排针 | 调试 / 读 flash |
| SPI NOR | 8 pin SOP | flashrom 直读 |

UART：baudrate 常见 115200，picocom/minicom 连接；看到 uboot 提示符可按 Ctrl+C 中断。

## 六、漏洞定位

~~~
grep -rn "system(|popen(" rootfs/usr/ | head          # 命令注入
grep -rn "strcpy|sprintf" rootfs/usr/sbin/* 2>/dev/null | head   # 栈溢出
# 管理 CGI 是否校验 session / 是否有未授权接口
~~~

## 七、改固件回刷

~~~
unsquashfs → 改 rootfs → mksquashfs rootfs new.sqsh -comp xz -b 128K
# 按原结构拼回（注意头部签名/校验和）；有校验则逆向升级程序
~~~

## 红线

模拟服务可访问（Web/CLI），或改后固件成功回刷并启动。

## 衔接

二进制分析 → ida-ghidra-practice；模拟执行 → emulation-unidbg；漏洞利用 → recent-exploit-pack
