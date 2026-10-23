# Version-Gated Client Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Cursor、Cline、Windsurf 的静态占位检测替换为带安装检测、版本解析和零写入门禁的真实适配器。

**Architecture:** 新增共享 `VersionGatedAdapter`，从稳定的可执行程序资源清单或扩展 `package.json` 读取版本，并以精确版本白名单决定 `supported`。三个具体适配器只声明安装标记、版本清单候选和客户端名称；白名单当前为空，因此检测到安装后仍拒绝配置且不写文件。

**Tech Stack:** Python 3、JSON、`pathlib`、Python `unittest`

## Global Constraints

- 不修改 SQLite、扩展 global storage 或未确认格式的内部文件。
- 当前三个客户端的已验收版本白名单均为空。
- 未验收版本执行配置必须返回 `UNSUPPORTED` 且零写入。
- 不打包，不提交 Git。

---

### Task 1: 版本门禁数据模型与共享适配器

**Files:**
- Modify: `launcher/app/core/models.py`
- Create: `launcher/app/adapters/version_gated.py`
- Modify: `launcher/tests/test_adapters.py`

**Interfaces:**
- `Detection.version: str = ""`
- `VersionGatedAdapter.detect() -> Detection`
- `VersionGatedAdapter.configure(skill_root: Path) -> ClientResult`

- [x] **Step 1: Write failing shared behavior tests**

测试版本清单解析、未验收版本不可支持、配置调用零写入。

- [x] **Step 2: Verify tests fail**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_adapters -v`

- [x] **Step 3: Implement version-gated base behavior**

从候选 JSON 清单读取字符串 `version`；未安装、版本未知、版本未在白名单中分别返回明确原因。`configure` 对非支持状态直接返回 `UNSUPPORTED`。

- [x] **Step 4: Verify adapter tests pass**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_adapters -v`

---

### Task 2: Cursor、Cline、Windsurf 适配器与服务注册

**Files:**
- Create: `launcher/app/adapters/cursor.py`
- Create: `launcher/app/adapters/cline.py`
- Create: `launcher/app/adapters/windsurf.py`
- Modify: `launcher/app/adapters/__init__.py`
- Modify: `launcher/app/core/service.py`
- Modify: `launcher/tests/test_adapters.py`
- Modify: `launcher/tests/test_service.py`

**Interfaces:**
- `CursorAdapter`：检测 `%USERPROFILE%\AppData\Local\Programs\cursor\resources\app\package.json`
- `WindsurfAdapter`：检测 `%USERPROFILE%\AppData\Local\Programs\Windsurf\resources\app\package.json`
- `ClineAdapter`：检测 `.vscode\extensions` 与 `.cursor\extensions` 下 Cline 扩展 `package.json`

- [x] **Step 1: Write failing concrete adapter tests**

用临时目录模拟三个客户端安装，断言版本可读取但 `supported` 为 false；服务检测结果来自适配器且配置零写入。

- [x] **Step 2: Verify concrete tests fail**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_adapters launcher.tests.test_service -v`

- [x] **Step 3: Implement and register three adapters**

删除服务中的静态 `UNSUPPORTED` 列表，将三个适配器加入 `self.adapters`。

- [x] **Step 4: Verify targeted and full suite**

Run: `.\.venv\Scripts\python.exe -m unittest launcher.tests.test_adapters launcher.tests.test_service -v`

Run: `.\.venv\Scripts\python.exe -m unittest discover -s launcher\tests -v`

Expected: 全部测试通过。

- [x] **Step 5: Restart development preview**

Run: `.\.venv\Scripts\python.exe -m launcher.app.main --development`

Expected: 三个客户端由真实适配器报告状态，本机未安装时仍不可选择。
