# Customer Service Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在帮助分类下新增可复制客服 QQ 的“联系客服”页面。

**Architecture:** 沿用单文件 QML 页面组件结构，在现有 `StackLayout` 和帮助导航中注册 `contactService` 页面。通过 QML `TextEdit` 的剪贴板能力复制固定 QQ，避免增加 Python 桥接或外部链接依赖。

**Tech Stack:** Qt Quick/QML、Qt Quick Controls、Python `unittest`

## Global Constraints

- 页面说明固定为 `可以添加客服购买 CDK`。
- 客服 QQ 固定为 `1606654577`。
- 不配置网页、QQ 协议或浏览器跳转链接。
- 不打包，不提交 Git。

---

### Task 1: 联系客服页面与复制交互

**Files:**
- Modify: `launcher/app/qml/App.qml`
- Test: `launcher/tests/test_ui_flow.py`

**Interfaces:**
- Consumes: 现有 `NavItem`、`PageLayout`、`PageTitle`、`PageLead`、`Panel`、`AppButton`
- Produces: `pageId: "contactService"` 和 `ContactServicePage`

- [x] **Step 1: Write the failing test**

在 `UiFlowTests` 中断言帮助导航、StackLayout 页面、说明文字、QQ 和复制行为存在。

- [x] **Step 2: Run test to verify it fails**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_help_has_customer_service_page_with_copyable_qq -v`

Expected: FAIL，因为 `contactService` 页面尚不存在。

- [x] **Step 3: Write minimal implementation**

在帮助导航加入 `NavItem { text: "联系客服"; mark: "@"; pageId: "contactService" }`，在 StackLayout 注册 `ContactServicePage {}`。页面显示说明、QQ，并用隐藏 `TextEdit` 配合 `selectAll()`、`copy()` 完成复制。

- [x] **Step 4: Run test to verify it passes**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_help_has_customer_service_page_with_copyable_qq -v`

Expected: PASS。

- [x] **Step 5: Verify full suite and preview**

Run: `.\.venv\Scripts\python.exe -m unittest discover -s launcher\tests -v`

Expected: 全部测试通过。随后以 `python -m launcher.app.main --development` 重启开发预览。
