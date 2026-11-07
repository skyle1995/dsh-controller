# Free Tools Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the free tools page into a stable four-layer layout with readable text, category filtering, two-column cards, a fixed action dock, and a useful catalog failure state.

**Architecture:** Keep Rust and Tauri contracts unchanged. Add filter/retry selectors as pure functions in `app-state.ts`, split the page into three focused React view units, and use CSS grid plus one fixed-height action slot to prevent layout movement.

**Tech Stack:** React 19, TypeScript 5.8, CSS, Node test runner, happy-dom, Vite 6.

## Global Constraints

- Keep all 11 existing skills, five categories, selection order, cancellation, progress, result merge, and retry semantics.
- Keep the existing five-size typography scale; no rendered text below 12px.
- Keep the free module independent from CDK activation and paid configuration busy state.
- Keep the 1120×720 fixed-window layout usable and switch the card grid to one column below 900px.
- Do not create release artifacts or update the live manifest or website.

---

### Task 1: Category and retry state selectors

**Files:**
- Modify: `launcher-rs/ui/src/state/app-state.ts`
- Modify: `launcher-rs/ui/tests/free-skills-state.test.js`

**Interfaces:**
- Consumes: `FreeSkillCategory`, `FreeSkillInstallResult`, and the existing `UiState`.
- Produces: `FreeSkillFilter`, `setFreeSkillFilter`, `visibleFreeSkills`, `retryableFreeSkillIds`, and a filter field on `UiState`.

- [ ] **Step 1: Write failing state tests**

```js
test("free skill category filter keeps selection and catalog order", () => {
  const filtered = setFreeSkillFilter(stateWithCatalog, "creative");
  assert.deepEqual(filtered.selectedFreeSkills, stateWithCatalog.selectedFreeSkills);
  assert.deepEqual(visibleFreeSkills(filtered).map((skill) => skill.id), [
    "brainstorming", "creative-ideation", "grill-me",
  ]);
});

test("retry selector excludes successful units and preserves catalog order", () => {
  assert.deepEqual(retryableFreeSkillIds(stateWithMixedResults), ["grill-me"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:PATH='C:\Users\Anything001\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\Anything001\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;'+$env:PATH
pnpm.cmd exec tsx --test tests/free-skills-state.test.js
```

Expected: FAIL because the new selectors are not exported.

- [ ] **Step 3: Add the minimal pure state API**

```ts
export type FreeSkillFilter = "all" | FreeSkillCategory;

export function setFreeSkillFilter(state: UiState, filter: FreeSkillFilter): UiState {
  return { ...state, freeSkillCategoryFilter: filter };
}

export function visibleFreeSkills(state: UiState): FreeSkillDescriptor[] {
  const skills = state.freeSkillCatalog?.skills ?? [];
  return state.freeSkillCategoryFilter === "all"
    ? skills
    : skills.filter((skill) => skill.category === state.freeSkillCategoryFilter);
}
```

Implement `retryableFreeSkillIds` with the existing retryable statuses and catalog order. Initialize `freeSkillCategoryFilter` to `"all"`; catalog refresh keeps a valid filter and resets an absent category to `"all"`.

- [ ] **Step 4: Run focused tests and type checking**

Run the command from Step 2, then:

```powershell
pnpm.cmd exec tsc --noEmit
```

Expected: focused tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the state slice**

```powershell
git add -- launcher-rs/ui/src/state/app-state.ts launcher-rs/ui/tests/free-skills-state.test.js
git commit -m "feat: add free tool filtering state"
```

### Task 2: Stable four-layer page layout

**Files:**
- Modify: `launcher-rs/ui/src/pages/FreeSkillsPage.tsx`
- Modify: `launcher-rs/ui/src/styles/free-skills.css`
- Modify: `launcher-rs/ui/tests/free-skills-ui.test.js`
- Modify: `launcher-rs/ui/tests/free-skills-dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 selectors and existing `onInstall`, `onCancel`, and `onReloadCatalog` callbacks.
- Produces: `FreeSkillOverview`, `FreeSkillGrid`, and `FreeSkillActionDock` view units inside `FreeSkillsPage.tsx`.

- [ ] **Step 1: Write failing structure tests**

```js
test("free tools page has one summary, a category filter, and one action dock", () => {
  assert.equal(source.match(/className="free-skill-overview"/g)?.length, 1);
  assert.match(source, /free-skill-category-filter/);
  assert.equal(source.match(/className="free-skill-action-dock/g)?.length, 1);
  assert.doesNotMatch(source, /free-skill-access-summary|free-skill-free-notice/);
});
```

Add a DOM test that clicks `创意`, verifies three cards, and verifies selected IDs survive returning to `全部`.

- [ ] **Step 2: Run UI tests and verify RED**

```powershell
pnpm.cmd exec tsx --test tests/free-skills-ui.test.js tests/free-skills-dom.test.tsx
```

Expected: FAIL because the new structure and category controls are absent.

- [ ] **Step 3: Replace the repeated header blocks**

```tsx
<FreeSkillOverview
  clientCount={compatibleClientCount}
  selectedCount={state.selectedFreeSkills.length}
  filter={state.freeSkillCategoryFilter}
  disabled={state.freeSkillsBusy}
  onFilter={(filter) => setState((old) => setFreeSkillFilter(old, filter))}
  onSelectAll={() => setState((old) => selectAllFreeSkills(old))}
  onClear={() => setState((old) => clearFreeSkills(old))}
/>
```

Render one catalog slot: skeleton during first load, one centered error panel when no catalog exists, otherwise `FreeSkillGrid`. Keep the previous catalog visible when a refresh fails.

- [ ] **Step 4: Build the two-column grid and fixed action dock**

```css
.free-skill-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.free-skill-action-dock {
  position: sticky;
  bottom: 0;
  min-height: 76px;
}

@media (max-width: 900px) {
  .free-skill-grid { grid-template-columns: 1fr; }
}
```

Use 14px names, 13px descriptions/actions, and 12px auxiliary statuses through existing CSS variables. Use the same dock for idle, installing, cancelling, completed, and retry states.

- [ ] **Step 5: Run focused UI tests, full UI tests, type check, and build**

```powershell
pnpm.cmd exec tsx --test tests/free-skills-ui.test.js tests/free-skills-dom.test.tsx
pnpm.cmd test
pnpm.cmd exec tsc --noEmit
pnpm.cmd run build
```

Expected: all 114 existing tests plus new tests PASS, type checking exits 0, and Vite build exits 0.

- [ ] **Step 6: Commit the visual slice**

```powershell
git add -- launcher-rs/ui/src/pages/FreeSkillsPage.tsx launcher-rs/ui/src/styles/free-skills.css launcher-rs/ui/tests/free-skills-ui.test.js launcher-rs/ui/tests/free-skills-dom.test.tsx
git commit -m "feat: restructure the free tools page"
```

### Task 3: Manual runtime verification

**Files:**
- Modify only if a verified regression requires a focused fix in the Task 2 files.

**Interfaces:**
- Consumes: the completed UI build and the curated debug payload.
- Produces: a verified owner-test client without release output.

- [ ] **Step 1: Verify the correct runtime prerequisites**

```powershell
Test-NetConnection 127.0.0.1 -Port 1420 -InformationLevel Quiet
Test-Path G:\AI\.wujin-keygate-deploy\reverse-skill-test-payload-20260728.zip
Remove-Item Env:WUJIN_SOURCE_ROOT -ErrorAction SilentlyContinue
$env:WUJIN_ALLOW_DEVELOPMENT='1'
```

Expected: both checks return `True`.

- [ ] **Step 2: Start only the curated debug client**

```powershell
& G:\AI\.wujin-keygate-deploy\start-wujin-test-client.ps1
```

Expected: the process path is `launcher-rs\target\debug\wujin-launcher.exe`, version is `2.0.0`, and the free tools page renders the new layout.

- [ ] **Step 3: Verify runtime states**

Check all categories, select/clear, catalog retry fixture, start/cancel, successful completion, partial retry, 1120×720 layout, and keyboard focus. Record only status and paths; do not record sensitive values.

- [ ] **Step 4: Verify repository state**

```powershell
git diff --check
git status --short --branch
```

Expected: no uncommitted files after any focused fix has been tested and committed.
