# 插件版本范围适配指南(服务器端)

适用于:托管在 GitHub / 自建 Git 上的 DSH 插件仓库。目标是把插件对 dsh 运行时的
**精确版本要求**放宽为 **semver 范围**(如 `>=0.2.0-rc.2`),避免 dsh 小版本升级后
插件被 profile 拒绝挂载。

---

## 1. 先理解 DSH 的校验规则

`dsh` 在安装插件和启动 profile 时,读取插件 `package.json`,按以下顺序检查:

1. 若声明了 **`engines.dsh`** → 只校验它,**忽略** `peerDependencies`(优先级更高)
2. 否则校验**所有** `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 的 peer 范围
   - 注意:`@deepseek-ai/dsh-mcp-client` 这类 peer 也会被当成"运行时版本要求"来校验
3. 匹配规则:`semver.satisfies(运行时版本, 范围, { includePrerelease: true })`
   - 预发布版本参与匹配:`0.2.1-rc.2` **满足** `>=0.2.0-rc.2`
   - `workspace:^` / `workspace:~` / `workspace:*` 视为满足
4. 不满足 → 插件被拒绝挂载;用户需用 `dsh plugin allow-version`(或控制器的
   「授权兼容」)按「插件版本 + dsh 版本」精确豁免

> 结论:插件只需要把版本声明从 `0.2.0-rc.2` 改成 `>=0.2.0-rc.2`,dsh 升级到
> `0.2.1-rc.2` 甚至 `0.x` 后续版本都不再被卡住。

---

## 2. 每个插件包要改什么

编辑 `packages/<插件名>/package.json`:

```diff
 {
   "name": "dsh-plugin-xxx",
-  "version": "0.3.2",
+  "version": "0.3.3",
   ...
   "peerDependencies": {
-    "@deepseek-ai/dsh": "0.2.0-rc.2",
+    "@deepseek-ai/dsh": ">=0.2.0-rc.2",
     "@deepseek-ai/cordis": "~4.0.4",
     "@deepseek-ai/schemastery": "~3.18.4"
   }
 }
```

规则:

| 项目 | 要求 |
|---|---|
| 主 peer | `@deepseek-ai/dsh` 改为范围,**推荐 `>=0.2.0-rc.2`** |
| 其它 dsh-* peer | 同样改为同一范围(如 `@deepseek-ai/dsh-mcp-client`) |
| 非 dsh 的 peer | `@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 不用改 |
| `engines.dsh` | 若已存在,改它即可(优先级更高);不要与 peer 混用两套说法 |
| 版本号 | **patch +1**(如 0.3.2 → 0.3.3),让「全部更新」能体现变化 |
| README | 同步更新"版本兼容"说明(精确版本 → semver 范围) |

可选的范围写法:

```jsonc
">=0.2.0-rc.2"          // 推荐:之后所有版本都允许
"^0.2.0-rc.2"           // 只允许 0.2.x
">=0.2.0-rc.2 <1.0.0"   // 限制大版本
```

> ⚠️ 如果某个插件已经写了范围(例如 `>=0.1.7-rc.1 <0.3.0-0`),**不要**改成
> `>=0.2.0-rc.2` —— 那是收窄支持范围。只把「精确版本」改成范围即可。

---

## 3. 手动修改(少量插件)

1. 在 GitHub 打开 `packages/<插件名>/package.json` → 「编辑」
2. 按上面的 diff 修改 `peerDependencies`(和版本号)
3. 提交信息建议:`chore: 放宽 @deepseek-ai/dsh peer 版本范围为 >=0.2.0-rc.2`
4. 同样方式更新其它插件包和 README

---

## 4. 批量修改(脚本,适合服务器上多个插件/多个仓库)

仓库自带脚本 `scripts/relax-plugin-ranges.mjs`(只依赖 Node 18+,无第三方包)。
**它只放宽精确版本,已有的范围一律保持不动**,可安全重复执行。

```bash
# 1) 先 dry-run 扫描服务器上还有哪些插件钉着精确版本(不提交)
GITHUB_TOKEN=你的令牌 node scripts/relax-plugin-ranges.mjs \
  --api https://api.github.com \
  --owner skyle1995 --repo dsh-plugins --branch main \
  --bump-patch

# 2) 确认无误后加 --apply 真正提交
GITHUB_TOKEN=你的令牌 node scripts/relax-plugin-ranges.mjs \
  --api https://api.github.com \
  --owner skyle1995 --repo dsh-plugins --branch main \
  --bump-patch --apply
```

参数说明:

| 参数 | 说明 |
|---|---|
| `--api` | 托管源 REST 根(GitHub 为 `https://api.github.com`;自建实例换成自己的地址) |
| `--owner` / `--repo` | 仓库坐标;其它仓库直接换 |
| `--branch` | 默认 `main` |
| `--range` | 可选。不填时按 `>=<原版本>` 放宽(保留原版本作下限);填了则把精确版本统一改成该范围 |
| `--paths` | 只处理指定文件(可多个/逗号分隔),默认自动遍历 `packages/*/package.json` |
| `--bump-patch` | 改动后 patch +1(推荐) |
| `--apply` | 真正提交;不加则 dry-run |
| 环境变量 | `GITHUB_TOKEN`(推荐),或 `GITEA_USER` + `GITEA_PASSWORD`(Gitea 兼容实例) |

脚本行为:

- 只处理**精确版本**(`x.y.z` / `x.y.z-rc.n`):`engines.dsh` 优先,否则
  `@deepseek-ai/dsh` 和所有 `@deepseek-ai/dsh-*` peer
- 已有范围(`>=`、`^`、`~`、`<`、`workspace:` 等)原样保留,不会被覆盖或收窄
- 无改动的包跳过(幂等,可重复执行)
- 每个文件一次 commit;`--bump-patch` 只在确实有改动时 bump

> 提示:如果插件不在 `packages/` 目录下,用 `--paths` 明确告诉脚本文件路径。
> 其它服务器/仓库:换 `--api`、`--owner`、`--repo` 即可。

实测(2026-10-20):对 `skyle1995/dsh-plugins` 运行时,dry-run 会指出
`packages/dsh-connect-workbuddy` 仍钉着 `@deepseek-ai/dsh: 0.2.0-rc.2`;
其余 3 个插件已是范围,自动跳过。

---

## 5. 改完后的验证

```bash
# 1) 确认 manifest 已更新
curl -s "https://api.github.com/repos/<owner>/<repo>/contents/packages/<插件>/package.json?ref=main" \
  | python3 -c 'import json,sys,base64; p=json.loads(base64.b64decode(json.load(sys.stdin)["content"])); print(p["version"], p["peerDependencies"].get("@deepseek-ai/dsh"))'

# 2) 用当前 dsh 版本实测(WEB profile)
dsh plugin --profile web add "<插件 git spec>"
```

控制器侧:

1. 打开「插件中心」→ 点「全部更新」拉取新版本
2. 已安装列表应显示 `要求 dsh >=0.2.0-rc.2`,不再出现红色不兼容标记
3. 重启 dsh 生效

如果仍有不兼容标记:

- 检查是否漏改某个 `@deepseek-ai/dsh-*` peer
- 确认插件实际拉到的版本是新 commit(`dsh plugin` 输出里会打印版本)
- 实在无法兼容时,用「授权兼容」做精确豁免(会写入 profile 的 `compatibility.json`)

---

## 6. 常见坑

- **只改主 peer,漏了 `@deepseek-ai/dsh-*`**:例如 `dsh-plugin-mcp` 的
  `@deepseek-ai/dsh-mcp-client` 也会被校验
- **忘记 bump 版本**:控制器「全部更新」仍会拉新 commit,但界面看不出变化,
  容易误判"没更新"
- **范围写错**:`>= 0.2.0`(带空格)、`0.2.x` 之类非标准写法会被 semver 判为
  不满足;用标准 semver 写法
- **engines 与 peer 混用**:两者同时存在时 `engines.dsh` 优先,peer 被忽略,
  容易造成"改了 peer 却没生效"的误解
- **低于范围的预发布**:`>=0.2.0-rc.2` 不匹配 `0.2.0-beta.1`;需要覆盖更早的
  预发布时用 `>=0.2.0-0`
- **只看控制器 UI 不实测**:DSH 运行时才是最终裁判,改完用 `dsh plugin add`
  或重启一次 profile 验证

---

## 7. 回滚

插件仓库是普通 git,直接 revert 对应 commit 即可:

```bash
git revert <commit>   # 或 GitHub 网页 Revert
```

控制器侧不需要为"放宽范围"做回滚(范围本身向后兼容)。
