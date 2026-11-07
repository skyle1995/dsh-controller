# Windows Auto Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让正式 Windows EXE 在非管理员启动时自动触发 UAC，并以管理员身份重新运行。

**Architecture:** 在 Qt 导入和窗口创建之前调用一个可独立测试的启动权限函数。函数跳过开发模式、非 Windows 和非打包进程；正式 EXE 使用 `IsUserAnAdmin` 检测权限，使用 `ShellExecuteW` 的 `runas` 动作重新启动，并用 `subprocess.list2cmdline` 安全保留参数。

**Tech Stack:** Python 3、Windows `ctypes` API、Python `unittest`

## Global Constraints

- 仅正式 Windows EXE 自动提权。
- 开发预览不弹出 UAC。
- 提权成功后原进程退出，提权失败时提示并退出。
- 不打包，不提交 Git。

---

### Task 1: 管理员检测与 UAC 重启

**Files:**
- Modify: `launcher/app/main.py`
- Create: `launcher/tests/test_admin_launch.py`

**Interfaces:**
- Produces: `ensure_admin_or_relaunch(development: bool, ...) -> int | None`
- Return `None`: 当前进程可继续启动；return `0`: 已发起管理员进程；return `1`: 提权失败。

- [x] **Step 1: Write failing tests**

覆盖开发模式跳过、管理员直接继续、非管理员以 `runas` 保留参数重启、UAC 取消或失败时显示消息。

- [x] **Step 2: Verify tests fail**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_admin_launch -v`

Expected: FAIL，因为 `ensure_admin_or_relaunch` 尚不存在。

- [x] **Step 3: Implement minimal launch guard**

在 `launcher/app/main.py` 添加可注入 Windows API 的 `ensure_admin_or_relaunch`，并在解析参数后、导入 Qt 前调用；返回非 `None` 时立即结束当前进程。

- [x] **Step 4: Verify targeted and full tests**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_admin_launch -v`

Run: `.\.venv\Scripts\python.exe -m unittest discover -s launcher\tests -v`

Expected: 新测试及完整测试全部通过。

- [x] **Step 5: Start development preview**

Run: `.\.venv\Scripts\python.exe -m launcher.app.main --development`

Expected: 开发预览正常启动且不弹出 UAC。
