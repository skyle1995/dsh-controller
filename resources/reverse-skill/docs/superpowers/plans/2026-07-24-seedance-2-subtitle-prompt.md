# Seedance 2.0 Subtitle Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变任何旁白、字幕正文及既有视频内容的前提下，为 Seedance 2.0 增加清晰、稳定、逐字准确的字幕生成约束。

**Architecture:** 直接在现有 TXT 中增加一个全局字幕硬约束区，并在每个分镜后增加对应的字幕执行提示。修改前后分别提取 `旁白：` 与 `字幕：` 行进行逐项比较，并检查新增约束关键词，避免依赖人工目测。

**Tech Stack:** UTF-8 纯文本、PowerShell 7、Git

## Global Constraints

- 所有 `旁白：` 后的正文逐字保持不变。
- 所有 `字幕：` 后的正文逐字保持不变。
- 原有时长、分镜、标题、发布文案和剪辑提示保持不变。
- 仅增加全局字幕硬约束和四段分镜字幕执行提示。
- 文件继续使用 UTF-8 文本编码。

---

### Task 1: 增加并验证 Seedance 2.0 字幕辅助提示

**Files:**
- Modify: `运营文案和视频/抖音15秒v1.30.1版本更新脚本-合规版.txt`

**Interfaces:**
- Consumes: 原文件中的四条 `旁白：` 正文和四条 `字幕：` 正文。
- Produces: 保持原文不变、可直接提交给 Seedance 2.0 的完整视频提示词。

- [ ] **Step 1: 记录不可变文本基线**

```powershell
$target = 'G:\AI\520reverse-skill\运营文案和视频\抖音15秒v1.30.1版本更新脚本-合规版.txt'
$before = Get-Content -Encoding UTF8 -LiteralPath $target
$beforeVoice = @($before | Where-Object { $_ -like '旁白：*' })
$beforeSubtitle = @($before | Where-Object { $_ -like '字幕：*' })
```

Expected: `$beforeVoice.Count -eq 4` 且 `$beforeSubtitle.Count -eq 4`。

- [ ] **Step 2: 添加最小辅助提示**

在定位信息后加入 `【Seedance 2.0 字幕生成硬约束】`，内容覆盖逐字照抄、只显示指定字幕、禁止额外文字、简体中文、统一高对比样式、安全区、最多两行和静止显示。

在每条现有 `字幕：` 后加入一条 `Seedance字幕执行：`，逐字重复该段唯一允许显示的字幕，并禁止模型在该分镜生成其他文字。

- [ ] **Step 3: 比较修改前后的旁白与字幕原文**

```powershell
$after = Get-Content -Encoding UTF8 -LiteralPath $target
$afterVoice = @($after | Where-Object { $_ -like '旁白：*' })
$afterSubtitle = @($after | Where-Object { $_ -like '字幕：*' })
if (Compare-Object $beforeVoice $afterVoice -SyncWindow 0) { throw '旁白正文发生变化' }
if (Compare-Object $beforeSubtitle $afterSubtitle -SyncWindow 0) { throw '字幕正文发生变化' }
```

Expected: 无输出且无异常。

- [ ] **Step 4: 验证约束覆盖和文本格式**

```powershell
$required = @('逐字照抄','禁止生成任何其他文字','简体中文','高对比','安全区','最多两行','保持静止')
$missing = @($required | Where-Object { -not ($after -match [regex]::Escape($_)) })
if ($missing.Count) { throw "缺少字幕约束：$($missing -join '、')" }
$executionLines = @($after | Where-Object { $_ -like 'Seedance字幕执行：*' })
if ($executionLines.Count -ne 4) { throw "分镜字幕执行提示数量错误：$($executionLines.Count)" }
```

Expected: 无输出且无异常；分镜字幕执行提示数量为 4。

- [ ] **Step 5: 检查最终差异**

```powershell
git diff --check -- '运营文案和视频/抖音15秒v1.30.1版本更新脚本-合规版.txt'
Get-Content -Encoding UTF8 -LiteralPath $target
```

Expected: `git diff --check` 无报错；文件可正常显示中文，新增内容仅为字幕辅助提示。
