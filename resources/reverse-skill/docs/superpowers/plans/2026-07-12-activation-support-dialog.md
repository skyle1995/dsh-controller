# Activation Support Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置激活页在线文档地址，并将售后支持按钮改为带复制 QQ 功能的应用内模态弹窗。

**Architecture:** `docs` 继续通过现有安全链接加载器和 `installer.openLink` 打开。售后支持使用根窗口级 Qt Quick `Popup`，内部通过隐藏只读 `TextEdit` 执行剪贴板复制，并用本地布尔状态显示“已复制”。

**Tech Stack:** Qt Quick/QML、JSON、Python `unittest`

## Global Constraints

- 文档地址固定为 `https://docs.qq.com/doc/DV3VIeWxUZXFVb3dj`。
- 客服 QQ 固定为 `1606654577`。
- 售后弹窗不打开外部链接。
- 不打包，不提交 Git。

---

### Task 1: 在线文档配置

**Files:**
- Modify: `launcher/config/links.json`
- Modify: `launcher/tests/test_ui_flow.py`

- [x] **Step 1: Write failing config test**
- [x] **Step 2: Verify it fails**
- [x] **Step 3: Set the `docs` HTTPS URL**
- [x] **Step 4: Verify it passes**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_online_docs_uses_configured_tencent_document -v`

---

### Task 2: 售后支持弹窗

**Files:**
- Modify: `launcher/app/qml/App.qml`
- Modify: `launcher/tests/test_ui_flow.py`

- [x] **Step 1: Write failing dialog test**

断言售后按钮打开 `supportDialog`，弹窗显示说明和 QQ，复制按钮调用 `selectAll()` 与 `copy()`，并显示“已复制”。

- [x] **Step 2: Verify it fails**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_ui_flow.UiFlowTests.test_after_sales_support_opens_copy_qq_dialog -v`

- [x] **Step 3: Implement modal Popup**

在根窗口加入模态 `Popup`，将激活页售后按钮改为 `onClicked: supportDialog.open()`。

- [x] **Step 4: Verify targeted and full suite**

Run: `.\.venv\Scripts\python.exe -m unittest discover -s launcher\tests -v`

Expected: 全部测试通过。

- [x] **Step 5: Restart development preview**

Run: `.\.venv\Scripts\python.exe -m launcher.app.main --development`

Expected: 应用正常启动，售后弹窗可打开和关闭。
