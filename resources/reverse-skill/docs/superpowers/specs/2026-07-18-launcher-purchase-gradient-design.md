# 无限破甲启动器官网链接与购买卡片渐变设计

## 目标

将启动器“官方网站”按钮指向 `https://codexpojia.com/?variant=A`，并让激活页的“7天激活 CDK”和“永久激活 CDK”购买卡片采用官网同款红橙渐变视觉，同时保持现有 CDK 生产、验签和激活行为不变。

## 设计

### 链接配置

- 仅更新 `launcher/config/links.json` 的 `website` 字段。
- QML 继续调用 `installer.openLink("website")`，不新增绕过安全链接加载器的路径。
- `trial_cdk`、`permanent_cdk`、`docs` 和其他配置保持原值。

### 购买卡片视觉

- 继续复用现有 `PurchaseCard` 组件，不新增独立业务组件。
- 卡片保留浅色背景和现有响应式布局。
- 增加红橙渐变顶部高光/边框强调，标题和购买提示使用渐变强调色。
- hover 状态增强渐变边框与柔和光晕；链接无效时保持现有降级透明度和不可点击行为。
- 不改变卡片标题、说明文字、跳转名称或点击事件。

### CDK 不变性

本次修改不触碰：

- `launcher/app/core/license.py`
- `launcher/app/bridge.py` 中的激活状态、CDK 验签和缓存逻辑
- CDK 签发脚本、版本规则和已有激活数据

## 验证

1. 链接测试确认官方网站地址精确为目标 URL，体验版/永久版链接保持不变。
2. 运行 launcher 现有单元测试，确认激活、CDK、适配器和 UI 流程回归通过。
3. 启动 `dist/start-dev.bat`，确认 QML 根窗口创建成功。
4. 人工检查激活页两张卡片的渐变、hover、点击行为及窄窗口单列布局。
5. 检查 git diff，确认未修改 CDK 核心逻辑文件。
