# Free Skills Beginner Vertical List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the “强化环境配置” page into a high-impact, all-Chinese, beginner-friendly vertical list without changing free-Skill installation behavior or paid CDK isolation.

**Architecture:** Keep all backend catalog IDs and install contracts unchanged. Add a UI-only Chinese copy table keyed by the 11 approved IDs, map client IDs and result states to friendly Chinese text, and render category contents as one-column selectable rows. Raw catalog English, paths, and backend messages remain available to internal logic/logs but are not rendered on this page.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner with tsx, happy-dom, Vite.

## Global Constraints

- Product version remains exactly `1.30.1`; legacy Python remains `1.1.0`.
- Page title remains “强化环境配置”.
- Keep “无需激活 · 可选安装”, “全选”, “取消全选”, and “安装选中的强化能力”.
- All user-visible page copy, ability names, buttons, statuses, prompts, and accessible labels use Simplified Chinese.
- Do not render catalog English names/summaries, internal IDs, repository metadata, raw paths, or raw backend English messages.
- Keep the existing 11 IDs, five categories, selection state, IPC, progress events, cancellation, retry, rollback, and paid/free isolation unchanged.
- Do not modify Rust, Tauri, free bundle sources, CDK behavior, update behavior, release scripts, or website files.
- Do not run release build, packaging, signing, installer, publication, or executable upload commands.

---

### Task 1: Add Executable Beginner-Copy and Vertical-Layout Contracts

**Files:**
- Modify: `launcher-rs/ui/tests/free-skills-ui.test.js`
- Modify: `launcher-rs/ui/tests/free-skills-dom.test.tsx`

**Interfaces:**
- Consumes: the approved design in `docs/superpowers/specs/2026-07-23-free-skills-beginner-vertical-list-design.md`.
- Produces: failing source and DOM behavior tests that constrain the implementation in Task 2.

- [ ] **Step 1: Add the failing source contract test**

Add a test named `free skill page uses beginner Chinese copy in a vertical ability list`. It must read `FreeSkillsPage.tsx` and `free-skills.css` and assert:

```js
assert.match(page, /给你的智能助手，一次装上 11 项实用本领/);
assert.match(page, /不会设置也没关系，选中需要的能力，剩下的全部交给软件/);
assert.match(page, /已找到 \{compatibleClientCount\} 个可以强化的智能助手/);
for (const label of [
  "界面美化助手", "体验优化助手", "灵感梳理助手", "创意爆发助手",
  "方案追问助手", "演示文稿助手", "文章写作助手", "资料研究助手",
  "学术评估助手", "能力制作助手", "学习教练",
]) assert.match(page, new RegExp(label));
assert.match(page, /free-skill-card-index/);
assert.match(page, /free-skill-card-state/);
assert.match(css, /\.free-skill-grid\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
assert.doesNotMatch(css, /\.free-skill-grid\s*\{[^}]*grid-template-columns/s);
```

Update the existing fixed-copy assertions so they require “智能助手” instead of the old page-level “AI 客户端” marketing copy. Internal type names and test descriptions may remain English.

- [ ] **Step 2: Add the failing rendered-English isolation assertions**

In the existing happy-dom test, keep the English fixtures `Frontend Design`, `Design interfaces`, `Claude`, `Codex`, `Cursor`, and `cancel unavailable`. After navigation to the free page, assert the rendered body contains the Chinese mapping and excludes the fixture strings:

```ts
const visible = window.document.body.textContent ?? "";
assert.match(visible, /界面美化助手/);
for (const leaked of [
  "Frontend Design", "Design interfaces", "Claude", "Codex", "Cursor",
]) assert.doesNotMatch(visible, new RegExp(leaked));
assert.equal(window.document.querySelectorAll(".free-skill-card").length, 1);
assert.equal(window.document.querySelector(".free-skill-card-index")?.textContent, "01");
```

After the first cancel failure, replace the old raw error assertion with:

```ts
assert.match(window.document.body.textContent ?? "", /取消没有完成，请再试一次/);
assert.doesNotMatch(window.document.body.textContent ?? "", /cancel unavailable/);
```

- [ ] **Step 3: Run RED and record the expected failure**

Run from `launcher-rs/ui`:

```powershell
& 'C:\Users\Anything001\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\tsx\dist\cli.mjs --test tests\free-skills-ui.test.js tests\free-skills-dom.test.tsx
```

Expected: non-zero exit because the page lacks the new Chinese hero copy/list markers, CSS still uses grid columns, and the English fixture strings are visible.

### Task 2: Implement the All-Chinese Vertical Ability List

**Files:**
- Modify: `launcher-rs/ui/src/pages/FreeSkillsPage.tsx`
- Modify: `launcher-rs/ui/src/styles/free-skills.css`
- Modify: `launcher-rs/ui/src/main.tsx`
- Test: `launcher-rs/ui/tests/free-skills-ui.test.js`
- Test: `launcher-rs/ui/tests/free-skills-dom.test.tsx`

**Interfaces:**
- Consumes: `FreeSkillDescriptor.id`, existing category order, `UiState`, and unchanged install/cancel callbacks.
- Produces: `BEGINNER_SKILL_COPY`, `CLIENT_LABELS`, `beginnerSkillCopy()`, `friendlyResultMessage()`, and a one-column rendered list.

- [ ] **Step 1: Add exact Chinese copy tables**

Add these module constants above the component:

```ts
const BEGINNER_SKILL_COPY: Record<string, { name: string; summary: string }> = {
  "frontend-design": { name: "界面美化助手", summary: "把普通页面变得更好看、更有重点，也更像完整成品。" },
  "ui-ux-pro-max": { name: "体验优化助手", summary: "帮你调整颜色、排版、按钮和操作流程，让界面更顺手。" },
  brainstorming: { name: "灵感梳理助手", summary: "把零散想法整理成清晰方案，减少反复纠结。" },
  "creative-ideation": { name: "创意爆发助手", summary: "从不同角度快速扩展点子，找到更有新意的做法。" },
  "grill-me": { name: "方案追问助手", summary: "主动发现方案中的遗漏和矛盾，提前补齐关键细节。" },
  "ppt-generation": { name: "演示文稿助手", summary: "根据现有资料整理结构，制作风格统一的演示文稿。" },
  "article-writing": { name: "文章写作助手", summary: "帮你完成文章、教程、说明和长篇内容的组织与表达。" },
  "literature-review": { name: "资料研究助手", summary: "系统整理相关资料和引用，快速看清一个主题的全貌。" },
  "scholar-evaluation": { name: "学术评估助手", summary: "从多个角度检查研究内容的质量、逻辑和可信度。" },
  "skill-creator": { name: "能力制作助手", summary: "帮你制作、改进和检查可以反复使用的新能力。" },
  teach: { name: "学习教练", summary: "把陌生知识拆成容易理解的小步骤，陪你逐步学会。" },
};

const CLIENT_LABELS: Record<string, string> = {
  claude: "克劳德助手", codex: "代码助手", kiro: "基罗助手",
  cursor: "光标助手", cline: "编程助手", windsurf: "风帆助手",
};
```

`beginnerSkillCopy(skill)` must return the table entry by `skill.id`; unknown catalog IDs are already rejected by the backend, but the UI fallback must be `{ name: "实用能力", summary: "帮助智能助手完成更多日常任务。" }` so it never leaks English.

- [ ] **Step 2: Replace raw user-visible values with Chinese summaries**

Use the mapped ability name in the row, checkbox `aria-label`, progress, and result heading. `clientName` must return `CLIENT_LABELS[clientId] ?? "智能助手"`. Replace “当前 Skill” with “正在强化的能力” and “当前客户端” with “正在处理的智能助手”. Replace card aggregates with “智能助手”.

Add a `friendlyResultMessage(status)` switch returning only:

```text
installed          已完成安装，可以直接使用。
alreadyInstalled   已经是最新状态，无需重复安装。
updated            已完成更新，可以继续使用。
unsupported        暂时无法为这个智能助手安装。
conflict           发现已有同名内容，为保护原文件没有覆盖。
failed             安装没有完成，请重新选择后再试。
rolledBack         安装未完成，原来的设置已经恢复。
```

Render target and backup presence as “已自动完成安装”/“本次无需写入” and “已创建安全备份”/“本次无需备份”. Do not render `result.message`, raw target, or raw backup.

In `main.tsx`, replace the free-page error-producing branches with fixed Chinese copy so thrown English text never reaches the page:

```ts
freeSkillError: "强化能力暂时无法加载，请稍后重试"
```

```ts
message: retryable
  ? "安装已结束，部分能力可以重新选择后再试"
  : "强化能力安装完成"
```

```ts
setState((old) => failFreeSkillInstall(
  old,
  "安装没有完成，请重新选择后再试",
));
```

Replace `restoreCancelRetry(message)` with a zero-argument helper that stores “取消没有完成，请再试一次” in both `freeSkillError` and `freeSkillProgress.message`; call it for both a rejected cancel request and a thrown cancel request. Do not append the original exception text.

In `FreeSkillsPage.tsx`, add `friendlyProgressMessage(phase)` returning “等待选择需要的能力”, “正在自动完成设置，请稍候”, “正在安全结束，请稍候”, “全部处理完成”, or “安装没有完成，请重新选择后再试” for idle, active/default, cancelled, complete, and failed states. Render this helper instead of `state.freeSkillProgress.message`.

- [ ] **Step 3: Render exact beginner hero and row structure**

Use the exact lead:

```tsx
<p className="lead free-skill-hero-copy">
  给你的智能助手，一次装上 11 项实用本领。不会设置也没关系，选中需要的能力，剩下的全部交给软件。
</p>
```

For each ability row, compute its approved catalog position and render:

```tsx
<span className="free-skill-card-index" aria-hidden="true">
  {String(skills.findIndex((item) => item.id === skill.id) + 1).padStart(2, "0")}
</span>
<span className="free-skill-card-copy">
  <strong>{copy.name}</strong>
  <span>{copy.summary}</span>
</span>
<span className="free-skill-card-state">{skillStatus(skill, state.freeSkillResults)}</span>
<span className="free-skill-card-choice">
  <input aria-label={`选择${copy.name}`} ... />
  <span aria-hidden="true">选择</span>
</span>
```

Keep the entire `<label>` clickable and preserve all existing state handlers.

- [ ] **Step 4: Convert CSS to one-column rows**

Set `.free-skill-grid` to `display: flex; flex-direction: column; gap: 8px`. Make `.free-skill-card` a horizontal row with centered alignment and a minimum height around 78px. Give the sequence number a fixed 42px column, copy `flex: 1`, state a bounded right column, and choice a fixed end column. At `max-width: 900px`, let `.free-skill-card` wrap and make `.free-skill-card-copy` use the remaining width while state/choice move below. Preserve hover, selected, disabled, focus-visible, and reduced-motion rules.

- [ ] **Step 5: Run GREEN focused tests**

Run the same focused command from Task 1. Expected: both files pass, including no raw English fixture leakage.

- [ ] **Step 6: Run the complete UI gate**

From `launcher-rs/ui` run:

```powershell
& 'C:\Users\Anything001\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\tsx\dist\cli.mjs --test tests\*.test.js tests\*.test.tsx
& 'C:\Users\Anything001\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\typescript\bin\tsc --noEmit
& 'C:\Users\Anything001\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vite\bin\vite.js build
```

Expected: all UI tests pass, TypeScript reports zero errors, and Vite builds successfully. Do not use `npm.cmd`.

- [ ] **Step 7: Record and launch local acceptance**

Update `docs/testing/2026-07-22-windows-v1.30.1-release-audit.md` with focused RED/GREEN, full UI counts, typecheck/build results, and the new no-English/vertical-list manual matrix. Then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-dev-client-launch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1
```

Expected: policy and preflight pass; the visible debug client starts for owner review; no release package is produced.

- [ ] **Step 8: Commit scoped changes when Git metadata is writable**

```powershell
git add -- docs/superpowers/specs/2026-07-23-free-skills-beginner-vertical-list-design.md docs/superpowers/plans/2026-07-23-free-skills-beginner-vertical-list.md launcher-rs/ui/src/main.tsx launcher-rs/ui/src/pages/FreeSkillsPage.tsx launcher-rs/ui/src/styles/free-skills.css launcher-rs/ui/tests/free-skills-ui.test.js launcher-rs/ui/tests/free-skills-dom.test.tsx docs/testing/2026-07-22-windows-v1.30.1-release-audit.md
git commit -m "feat: redesign free skills for beginners"
```

If the managed sandbox still denies `.git/worktrees/.../index.lock`, leave the verified files unstaged and report the exact error instead of changing permissions or using another checkout.
