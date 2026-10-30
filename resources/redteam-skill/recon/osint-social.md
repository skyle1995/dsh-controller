---
name: osint-social
description: OSINT 与社会工程情报：企业工商/ICP/招聘情报、人员定位（邮箱格式/社交账号）、泄露库关联档案、个性化字典生成、钓鱼话术素材
whenToUse: 打点前需要摸清目标组织与关键人；需要为钓鱼定制可信话术；需要把零散泄露数据关联成完整身份
role: recon
enabled: true
---

# OSINT 与社会工程情报（人员侧）

产出：组织画像 + 关键人档案 → 喂给 phishing-delivery（话术）与 credential-attack（字典）。
**红线：形成 ≥3 名关键人的可用档案（岗位/邮箱/手机/习惯），支撑一条可信话术。**

## 一、企业面
```bash
# 工商股权：企查查/天眼查/爱企查（股权穿透→实控人→关联公司=供应链跳板）
# ICP 备案 + 子域
subfinder -d corp.com -all && httpx -l subs.txt -title
# 招聘 JD：暴露技术栈（Jenkins/K8s/中间件版本线索）
```

## 二、人员定位
```bash
# 邮箱格式一次确定（格式=员工名拼音）
theHarvester -d corp.com -b all -l 500
# hunter.io / phonebook.cz：历史泄露邮箱
# 脉脉/LinkedIn：岗位+部门 → 组织架构（CTO/运维/财务三角）
```

## 三、泄露数据关联
```bash
# HIBP 单点查询
curl -s -H "hibp-api-key: $KEY" "https://haveibeenpwned.com/api/v3/breachedaccount/x@corp.com" | jq
# DeHashed / Snusbase 批量（目标邮箱清单 → 明文/哈希）
# 关联成档案示例：
#   张三(IT运维) → corp邮箱 zp@corp.com（格式验证）→ 个人邮箱 → 2019 泄露 md5（已解）
#   → 社交 ID → 手机前缀 → 活跃时段 22:00-24:00（投递时机）
```

## 四、个性化字典
```bash
# 姓名拼音+出生年+后缀模板
python3 gen.py -t 'zhangsan' -y 1990 -s '!,@,123,Qq' > zs.dic
# 企业撞库清单：corp 邮箱 × (泄露密码 + 个性化字典)
```

## 五、钓鱼素材
- 关键人档案 → 定制发件人（其上级/IT）与场景（其负责系统）
- 时间点：发薪日/报销期/系统迁移公告
- 二轮：未点击者换话术（见 phishing-delivery）

## 六、工具矩阵
| 场景 | 工具 |
|---|---|
| 邮箱聚合 | theHarvester / hunter.io |
| 泄露查询 | HIBP / DeHashed / Snusbase |
| 人员情报 | 脉脉/企查查/历史社工库 |
| 元数据 | exiftool（回收文件抽 EXIF 定位） |
| 社交图谱 | spiderfoot / maltego CE |

## 红线（完成判定）
- 组织架构图 ≥1 页（关键岗位标注）
- ≥3 份人员档案（邮箱 + 至少一条泄露凭据或习惯）
- 1 条钓鱼话术与 phishing-delivery 对齐留档

## 衔接
- 话术落地 → phishing-delivery
- 字典 → credential-attack
- 技术面 → passive-recon / fofa-recon
