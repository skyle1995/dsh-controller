# 无限破甲启动器购买卡片渐变 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新启动器官方网站链接，并为 7 天/永久 CDK 购买卡片加入官网同款红橙渐变视觉，同时保持既有 CDK 行为不变。

**Architecture:** 官网地址继续由 `launcher/config/links.json` 提供，QML 继续通过 `installer.openLink("website")` 打开。购买卡片只在 `launcher/app/qml/App.qml` 的现有 `PurchaseCard` 组件中增加视觉层，不改变链接名称、点击处理或激活桥接。回归验证覆盖链接配置、QML 结构、CDK 核心测试和开发模式启动。

**Tech Stack:** Python 3.11, PySide6, Qt Quick/QML, FluentUI, `unittest`, PowerShell.

## Global Constraints

- 官方网站地址必须精确为 `https://codexpojia.com/?variant=A`。
- `trial_cdk` 与 `permanent_cdk` 当前值保持不变。
- 不修改 `launcher/app/core/license.py`、`launcher/app/bridge.py`、CDK 签发脚本或激活缓存逻辑。
- 卡片保留浅色背景、现有响应式双列/单列布局和无效链接降级行为。

---

### Task 1: 锁定链接与 CDK 不变性回归

**Files:**
- Modify: `launcher/config/links.json`
- Modify: `launcher/tests/test_ui_flow.py:118-125`
- Test: `launcher/tests/test_links.py`

**Interfaces:** `load_links()` continues to load the JSON configuration; tests produce exact website and unchanged CDK URL assertions.

- [ ] **Step 1:** Update `test_official_website_uses_purchase_page` to assert `https://codexpojia.com/?variant=A`.
- [ ] **Step 2:** Run `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_official_website_uses_purchase_page -v`; expected result is FAIL against the old URL.
- [ ] **Step 3:** Change only the `website` field in `launcher/config/links.json`; preserve `trial_cdk`, `permanent_cdk`, `purchase`, `docs`, and `support`.
- [ ] **Step 4:** Run `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_links launcher.tests.test_ui_flow.UiFlowTests.test_official_website_uses_purchase_page launcher.tests.test_ui_flow.UiFlowTests.test_activation_purchase_cards_use_configured_item_pages -v`; expected result is PASS.
- [ ] **Step 5:** Commit with `git add launcher/config/links.json launcher/tests/test_ui_flow.py; git commit -m "feat: point launcher website button to codexpojia"`.

### Task 2: Add the官网-style gradient to `PurchaseCard`

**Files:**
- Modify: `launcher/app/qml/App.qml:268-296`
- Test: `launcher/tests/test_ui_flow.py:36-47`

**Interfaces:** The component continues consuming `root` colors, `root.links`, `cardHover`, and `installer.openLink(card.linkName)`; it produces the same two cards with only visual changes.

- [ ] **Step 1:** Extend the purchase-card test with assertions for `gradientAccent`, `gradientBorder`, `cardHover.containsMouse`, and `installer.openLink(card.linkName)`.
- [ ] **Step 2:** Run `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_activation_has_responsive_trial_and_permanent_purchase_cards -v`; expected result is FAIL because the new identifiers are absent.
- [ ] **Step 3:** In `PurchaseCard`, retain existing properties, dimensions, opacity, `MouseArea`, and click handler. Add a rounded `gradientBorder` using stops `#ff6a5f` → `#ff9f43` behind an inset light card body, plus a 3 px `gradientAccent` top highlight. Show the layers only when `card.linkEnabled`, increase border opacity on hover, and keep title/link text readable.
- [ ] **Step 4:** Run the focused UI test, then start `dist\start-dev.bat`; expected result is PASS, a QML root object in the startup log, and both cards visibly using the approved gradient while retaining responsive layout.
- [ ] **Step 5:** Commit with `git add launcher/app/qml/App.qml launcher/tests/test_ui_flow.py; git commit -m "feat: style activation purchase cards with gradient accents"`.

### Task 3: Full regression and CDK protection check

**Files:**
- No source changes expected.
- Verify unchanged: `launcher/app/core/license.py`, `launcher/app/bridge.py`, `launcher/tools/issue_cdks.py`.

**Interfaces:** Consumes the two implementation slices and produces test evidence plus a scoped diff.

- [ ] **Step 1:** Run `.\.venv\Scripts\python.exe -m unittest discover -s launcher/tests -p 'test_*.py' -v`; expected result is all launcher tests PASS.
- [ ] **Step 2:** Run `git diff HEAD~2..HEAD --stat` and inspect `git diff HEAD~2..HEAD -- launcher/config/links.json launcher/app/qml/App.qml launcher/tests/test_ui_flow.py`.
- [ ] **Step 3:** Run `git diff HEAD~2..HEAD --exit-code -- launcher/app/core/license.py launcher/app/bridge.py launcher/tools/issue_cdks.py`; expected result is no differences.
- [ ] **Step 4:** Confirm a process with command line `launcher.app.main --development` exists and `%LOCALAPPDATA%\无限破甲\logs\startup.log` contains `GUI root object created`; then show the running development window and report the exact URL and unchanged CDK files.
