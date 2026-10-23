# Rust CDK 购买卡片视觉对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 将 Rust 激活页的 7 天/永久 CDK 购买卡片恢复到 Python/QML 的渐变描边、顶部强调线和镭射扫光视觉，同时保持现有链接交互和固定窗口约束。

**Architecture:** 保持 `PurchaseCard` React 组件及其 `onClick`/禁用逻辑不变，通过独立的 `purchase-cards.css` 添加渐变边框、内层面板、顶部强调线和 `.laser` 光带。回归测试通过源码断言验证结构、色板、动画和 reduced-motion 规则，TypeScript 与现有 UI 状态测试作为行为门禁。

**Tech Stack:** React 18, TypeScript, CSS animations, Node built-in test runner, TypeScript compiler.

## Global Constraints

- 7 天卡使用 `#ff6a5f → #ff9f43`，永久卡使用 `#f0445d → #8158e8`。
- 卡片标题为 14px，描述与购买提示为 11px，保持 Python/QML 原始像素值。
- 保持现有 `openLink` 调用、disabled 状态、固定 `1120×720` 窗口和 `Microsoft YaHei` 字体。
- `prefers-reduced-motion: reduce` 时停止镭射动画，但保留静态渐变描边。
- 不修改 CDK 验签、公钥、客户端部署和外链白名单逻辑。

---

### Task 1: Add failing visual regression assertions

**Files:**
- Modify: `launcher-rs/ui/tests/ui-regression.test.js`

**Interfaces:**
- Consumes: `launcher-rs/ui/src/styles/purchase-cards.css`, `launcher-rs/ui/src/styles/typography.css`.
- Produces: Test names that lock the QML parity requirements before CSS changes.

- [ ] **Step 1: Add assertions for gradients, border layers, laser animation, and reduced motion**

```js
test("purchase cards match the QML gradient-border laser treatment", () => {
  const cardsCss = readUi("src/styles/purchase-cards.css");
  assert.match(cardsCss, /purchase-card::before/);
  assert.match(cardsCss, /purchase-card::after/);
  assert.match(cardsCss, /#ff6a5f/);
  assert.match(cardsCss, /#ff9f43/);
  assert.match(cardsCss, /#f0445d/);
  assert.match(cardsCss, /#8158e8/);
  assert.match(cardsCss, /\.laser[\s\S]*animation/);
  assert.match(cardsCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(cardsCss, /purchase-card:hover:not\(:disabled\)/);
});
```

- [ ] **Step 2: Run only the new test and confirm it fails against the current solid-gradient cards**

Run from `G:\AI\520reverse-skill\launcher-rs\ui`:

```powershell
npm.cmd test -- --test-name-pattern="purchase cards match"
```

Expected: FAIL because `purchase-cards.css` does not exist yet.

### Task 2: Implement the card surface and animation

**Files:**
- Create: `launcher-rs/ui/src/styles/purchase-cards.css`
- Modify: `launcher-rs/ui/src/main.tsx`
- Modify: `launcher-rs/ui/src/styles/typography.css`

**Interfaces:**
- Consumes: Existing `PurchaseCard` classes `.purchase-card`, `.orange`, `.purple`, `.laser` and existing disabled/hover selectors.
- Produces: CSS-only visual parity with unchanged DOM and link behavior.

- [ ] **Step 1: Replace the filled gradients with a layered light surface and gradient border**

Use the following focused rules in `purchase-cards.css` and import the file after the existing style imports in `main.tsx`:

```css
.purchase-card {
  position: relative;
  isolation: isolate;
  min-height: 104px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 16px;
  text-align: left;
  color: #1f2933;
  background: #fff;
  overflow: hidden;
}
.purchase-card::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -2;
  border-radius: inherit;
  padding: 1px;
  background: var(--purchase-gradient);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: .72;
}
.purchase-card::after {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  right: 1px;
  height: 3px;
  z-index: 0;
  border-radius: 2px;
  background: var(--purchase-gradient);
  opacity: .9;
}
.purchase-card.orange { --purchase-gradient: linear-gradient(120deg, #ff6a5f, #ff9f43); }
.purchase-card.purple { --purchase-gradient: linear-gradient(120deg, #f0445d, #8158e8); }
.purchase-card strong,
.purchase-card span:not(.laser),
.purchase-card small { position: relative; z-index: 2; }
.purchase-card .laser {
  position: absolute;
  inset: -45% -18%;
  z-index: 1;
  width: 24%;
  height: 190%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.52), transparent);
  transform: translateX(-260%) rotate(18deg);
  animation: purchase-laser 6.2s ease-in-out infinite;
  opacity: .10;
  pointer-events: none;
}
@keyframes purchase-laser {
  from { transform: translateX(-260%) rotate(18deg); }
  to { transform: translateX(700%) rotate(18deg); }
}
@media (prefers-reduced-motion: reduce) {
  .purchase-card .laser { animation: none; transform: translateX(0) rotate(18deg); opacity: .08; }
}
```

- [ ] **Step 2: Align hover/active states without hiding text**

Define the following later-loaded rules in `purchase-cards.css` so hover only strengthens the border and laser, and active preserves readable dark text:

```css
.purchase-card:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(31, 41, 51, .14);
}
.purchase-card:hover:not(:disabled)::before { opacity: 1; }
.purchase-card:hover:not(:disabled) .laser { opacity: .26; }
.purchase-card:active:not(:disabled) { filter: brightness(.98); }
```

- [ ] **Step 3: Keep QML typography values in the dedicated stylesheet**

Ensure `typography.css` contains:

```css
.purchase-card { min-height: 104px; }
.purchase-card strong { font-size: 14px; }
.purchase-card span:not(.laser),
.purchase-card small { font-size: 11px; }
```

### Task 3: Run the visual and existing regression gates

**Files:**
- No additional files.

**Interfaces:**
- Consumes: Updated CSS and tests from Tasks 1–2.
- Produces: Passing UI regression evidence for the design and existing flow.

- [ ] **Step 1: Run all UI tests**

```powershell
cd G:\AI\520reverse-skill\launcher-rs\ui
npm.cmd test
```

Expected: all tests pass, including the new purchase-card test.

- [ ] **Step 2: Run TypeScript checking**

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
```

Expected: exit code 0 with no diagnostics.

- [ ] **Step 3: Inspect the diff for scope**

```powershell
git diff -- launcher-rs/ui/src/main.tsx launcher-rs/ui/src/styles/purchase-cards.css launcher-rs/ui/src/styles/typography.css launcher-rs/ui/tests/ui-regression.test.js
```

Expected: only card visual rules and regression assertions changed; no CDK, API, link, or window behavior changes.
