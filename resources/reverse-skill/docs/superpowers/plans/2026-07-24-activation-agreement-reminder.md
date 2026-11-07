# Activation Agreement Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an activated user to acknowledge one reminder before the activation page can navigate to configuration, automatically checking the agreement when the reminder appears.

**Architecture:** Keep both agreement and reminder visibility as local React state in `ActivationPage`. A single next-step handler either opens the reminder and checks the agreement or navigates, while the existing activation and purchase flows remain unchanged.

**Tech Stack:** React 19, TypeScript, Node test runner, happy-dom, Vite, Tauri 2.

## Global Constraints

- The agreement is initially unchecked on every `ActivationPage` mount.
- The first activated next-step click opens the reminder, checks the agreement, and does not navigate.
- Dismissing the reminder stays on the activation page; the next click navigates to `configure`.
- Activation remains a prerequisite; purchase and agreement links remain independent.
- Do not persist agreement state or change CDK/backend behavior.

---

### Task 1: Lock the agreement reminder behavior with tests

**Files:**
- Create: `launcher-rs/ui/tests/activation-agreement-dom.test.tsx`
- Modify: `launcher-rs/ui/tests/ui-regression.test.js`

**Interfaces:**
- Consumes: `ActivationPage({ state, setState, onNavigate })` and `initialState(bootstrap)`.
- Produces: a DOM behavior contract and source-level regression contract for the reminder flow.

- [ ] **Step 1: Write the failing DOM test**

```tsx
await act(async () => button(container, "下一步：开始配置")?.click());
assert.deepEqual(navigations, []);
assert.equal(agreement.checked, true);
assert.match(container.textContent ?? "", /请先阅读并同意用户使用协议/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& $node '.\node_modules\tsx\dist\cli.mjs' --test tests\activation-agreement-dom.test.tsx
```

Expected: FAIL because the current checkbox starts checked and the current next-step action navigates immediately.

- [ ] **Step 3: Keep the source regression contract aligned**

```js
assert.match(activationPage, /type="checkbox"[^>]*checked=\{agreementAccepted\}/);
assert.doesNotMatch(activationPage, /type="checkbox"[^>]*defaultChecked/);
assert.match(activationPage, /请先阅读并同意用户使用协议/);
assert.match(activationPage, /setAgreementAccepted\(true\)/);
```

### Task 2: Implement the minimal local-state reminder flow

**Files:**
- Modify: `launcher-rs/ui/src/pages/ActivationPage.tsx`

**Interfaces:**
- Consumes: local React state and `onNavigate("configure")`.
- Produces: `agreementAccepted`, `agreementReminderOpen`, and `continueToConfigure()` behavior.

- [ ] **Step 1: Add local state and the guarded handler**

```tsx
const [agreementAccepted, setAgreementAccepted] = useState(false);
const [agreementReminderOpen, setAgreementReminderOpen] = useState(false);
const continueToConfigure = () => {
  if (!agreementAccepted) {
    setAgreementAccepted(true);
    setAgreementReminderOpen(true);
    return;
  }
  onNavigate("configure");
};
```

- [ ] **Step 2: Make the checkbox controlled and route the button through the handler**

```tsx
<input
  type="checkbox"
  checked={agreementAccepted}
  onChange={(event) => setAgreementAccepted(event.target.checked)}
  aria-label="已了解用户使用协议"
/>
<Button primary disabled={!state.bootstrap.activated} onClick={continueToConfigure}>
  下一步：开始配置
</Button>
```

- [ ] **Step 3: Render the reminder with the existing modal styles**

```tsx
{agreementReminderOpen && (
  <div className="modal-backdrop">
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-icon error">!</div>
      <h2>请确认用户使用协议</h2>
      <p>请先阅读并同意用户使用协议。</p>
      <Button primary onClick={() => setAgreementReminderOpen(false)}>知道了</Button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
& $node '.\node_modules\tsx\dist\cli.mjs' --test tests\activation-agreement-dom.test.tsx tests\ui-regression.test.js
```

Expected: both test files PASS.

### Task 3: Verify and launch the Debug client

**Files:**
- Modify only if a verification failure identifies a defect in the scoped feature.

**Interfaces:**
- Consumes: completed UI implementation.
- Produces: passing UI suite, clean type check/build, and a running Debug client.

- [ ] **Step 1: Run the full UI suite**

```powershell
& $node '.\node_modules\tsx\dist\cli.mjs' --test tests\*.test.js tests\*.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 2: Run type checking and the production UI build**

```powershell
& $node '.\node_modules\typescript\bin\tsc' --noEmit
& $node '.\node_modules\vite\bin\vite.js' build
```

Expected: both commands exit 0.

- [ ] **Step 3: Run non-release Windows gates**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-dev-client-launch.ps1
```

Expected: both scripts exit 0.

- [ ] **Step 4: Start the Debug client**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1
```

Expected: the “无限破甲” Debug window is visible and responsive for manual testing.
