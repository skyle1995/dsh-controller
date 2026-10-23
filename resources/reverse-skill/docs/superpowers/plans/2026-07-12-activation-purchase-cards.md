# Activation Purchase Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在激活页底部加入分别绑定 7 天与永久 CDK 网页链接的响应式购买卡片。

**Architecture:** 扩展现有安全链接白名单与空链接配置，加入 `trial_cdk`、`permanent_cdk`。QML 新增可复用 `PurchaseCard` 组件，两张卡片通过 `GridLayout` 在窄窗口自动单列，并通过现有 `installer.openLink` 打开已配置的 HTTP/HTTPS 地址。

**Tech Stack:** Qt Quick/QML、Python、Python `unittest`

## Global Constraints

- 当前两个链接保持空字符串，不配置实际网址。
- 未配置链接时卡片禁用。
- 正常宽度双列，窄窗口单列，激活页可滚动。
- 不打包，不提交 Git。

---

### Task 1: 安全链接键

**Files:**
- Modify: `launcher/app/core/links.py`
- Modify: `launcher/config/links.json`
- Modify: `launcher/tests/test_links.py`

**Interfaces:**
- Produces: `links["trial_cdk"]` 与 `links["permanent_cdk"]`

- [x] **Step 1: Write failing link tests**

断言缺失配置返回两个空链接，并验证两个 HTTPS 链接可加载。

- [x] **Step 2: Verify link tests fail**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_links -v`

- [x] **Step 3: Add link keys and empty config values**

将两个键加入 `LINK_NAMES` 与 `launcher/config/links.json`，继续复用现有 HTTP/HTTPS 校验。

- [x] **Step 4: Verify link tests pass**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_links -v`

---

### Task 2: 响应式购买卡片

**Files:**
- Modify: `launcher/app/qml/App.qml`
- Modify: `launcher/tests/test_ui_flow.py`

**Interfaces:**
- Consumes: `root.links.trial_cdk`、`root.links.permanent_cdk`、`installer.openLink(name)`
- Produces: 激活页两张 `PurchaseCard`

- [x] **Step 1: Write failing UI test**

断言卡片文字、两个链接键、整卡点击、响应式单列和激活页滚动设置存在。

- [x] **Step 2: Verify UI test fails**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_activation_has_responsive_trial_and_permanent_purchase_cards -v`

- [x] **Step 3: Implement PurchaseCard and activation layout**

新增 `PurchaseCard` 组件；激活页使用 `GridLayout` 放置两张卡片，并显式绑定 ScrollView 的内容高度。

- [x] **Step 4: Verify targeted and full tests**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_activation_has_responsive_trial_and_permanent_purchase_cards -v`

Run: `.\.venv\Scripts\python.exe -m unittest discover -s launcher\tests -v`

Expected: 全部测试通过。

- [x] **Step 5: Start development preview**

Run: `.\.venv\Scripts\python.exe -m launcher.app.main --development`

Expected: 页面正常启动且卡片在空链接状态下禁用。
