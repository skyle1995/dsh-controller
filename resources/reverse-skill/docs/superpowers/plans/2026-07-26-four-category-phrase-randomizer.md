# Four-Category Phrase Randomizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing flat phrase pool with four 50-item categories sourced exactly from `C:\Users\Anything001\Downloads\200条.txt`, with category-scoped display, random selection, highlighting, and copying.

**Architecture:** Keep the deliverable as one standalone HTML file. Embed the parsed source data as a JSON-compatible `phraseCategories` array, render category tabs and phrase cards from that array, and isolate random-index selection in a pure function so it can be contract-tested without a browser.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, Node.js built-in `assert`/`vm`, Playwright browser smoke test.

## Global Constraints

- Keep the deliverable as one standalone HTML file with no framework, build step, or external asset.
- Preserve all 200 phrase bodies exactly after removing source numbering and surrounding whitespace.
- Provide four categories with exactly 50 phrases each.
- Default to the first category, “技术极客”.
- Random selection operates only within the active category and avoids an immediate repeat.
- Preserve card-click copy, clipboard fallback, mobile safe-area styling, and responsive layout.

---

### Task 1: Add a deterministic data and behavior contract test

**Files:**
- Create: `运营文案和视频/tests/phrase-selector.test.mjs`
- Read: `运营文案和视频/破甲话术话术.html`
- Read: `C:\Users\Anything001\Downloads\200条.txt`

**Interfaces:**
- Consumes: source TXT category headers and numbered phrase lines.
- Produces: assertions for `phraseCategories`, `pickRandomIndex(length, previousIndex, randomValue)`, category controls, and total-count markup.

- [ ] **Step 1: Write the failing contract test**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const htmlPath = new URL('../破甲话术话术.html', import.meta.url);
const sourcePath = 'C:\\Users\\Anything001\\Downloads\\200条.txt';
const html = fs.readFileSync(htmlPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8');

const expected = [];
let current = null;
for (const rawLine of source.split(/\r?\n/)) {
  const header = rawLine.match(/^【(.+?)】（共(\d+)条）$/);
  if (header) {
    current = { name: header[1], phrases: [] };
    expected.push(current);
    continue;
  }
  const phrase = rawLine.match(/^\s*\d{2}\.\s*(.+?)\s*$/);
  if (phrase && current) current.phrases.push(phrase[1]);
}

const dataMatch = html.match(/const phraseCategories = (\[[\s\S]*?\n    \]);/);
assert.ok(dataMatch, 'phraseCategories data block must exist');
const actual = JSON.parse(dataMatch[1]);
assert.deepEqual(actual, expected);
assert.equal(actual.length, 4);
assert.deepEqual(actual.map(({ phrases }) => phrases.length), [50, 50, 50, 50]);
assert.equal(actual.flatMap(({ phrases }) => phrases).length, 200);

const fnMatch = html.match(/function pickRandomIndex\([\s\S]*?\n    }/);
assert.ok(fnMatch, 'pickRandomIndex must exist');
const context = {};
vm.runInNewContext(`${fnMatch[0]}; this.pickRandomIndex = pickRandomIndex;`, context);
assert.equal(context.pickRandomIndex(50, -1, 0), 0);
assert.equal(context.pickRandomIndex(50, 0, 0), 1);
assert.equal(context.pickRandomIndex(1, 0, 0.75), 0);

assert.match(html, /id="categoryTabs"/);
assert.match(html, /id="randomButton"/);
assert.match(html, /50 \/ 200 条/);
console.log('phrase-selector contract: PASS');
```

- [ ] **Step 2: Run the test and verify the old page fails the new contract**

Run:

```powershell
node "G:\AI\520reverse-skill\运营文案和视频\tests\phrase-selector.test.mjs"
```

Expected: failure containing `phraseCategories data block must exist`.

### Task 2: Embed the four categories and implement category-scoped rendering

**Files:**
- Modify: `运营文案和视频/破甲话术话术.html`

**Interfaces:**
- Consumes: exact categories parsed from `200条.txt`.
- Produces: `phraseCategories: Array<{name: string, phrases: string[]}>`, `activeCategoryIndex`, `renderTabs()`, and `renderCategory()`.

- [ ] **Step 1: Parse the source with an exact extraction rule**

```python
import json, re
from pathlib import Path

source = Path(r"C:\Users\Anything001\Downloads\200条.txt").read_text(encoding="utf-8")
categories = []
current = None
for raw_line in source.splitlines():
    header = re.match(r"^【(.+?)】（共(\d+)条）$", raw_line)
    if header:
        current = {"name": header.group(1), "phrases": []}
        categories.append(current)
        continue
    phrase = re.match(r"^\s*\d{2}\.\s*(.+?)\s*$", raw_line)
    if phrase and current is not None:
        current["phrases"].append(phrase.group(1))

assert len(categories) == 4
assert [len(item["phrases"]) for item in categories] == [50, 50, 50, 50]
print(json.dumps(categories, ensure_ascii=False, indent=2))
```

- [ ] **Step 2: Replace the flat data and render tabs/list from active category**

Use these exact state and rendering interfaces:

```js
let activeCategoryIndex = 0;
const lastIndexes = new Array(phraseCategories.length).fill(-1);

function renderTabs() {
  categoryTabs.innerHTML = phraseCategories.map((category, index) => `
    <button class="category-tab" type="button" data-category="${index}"
      aria-pressed="${index === activeCategoryIndex}"></button>
  `).join('');
  categoryTabs.querySelectorAll('.category-tab').forEach((tab, index) => {
    tab.textContent = phraseCategories[index].name.split(' / ')[0];
    tab.addEventListener('click', () => {
      activeCategoryIndex = index;
      renderTabs();
      renderCategory();
    });
  });
}

function renderCategory() {
  const phrases = phraseCategories[activeCategoryIndex].phrases;
  count.textContent = `${phrases.length} / ${totalPhraseCount} 条`;
  list.innerHTML = phrases.map((phrase, index) => `
    <button class="card" type="button" data-index="${index}" aria-label="复制第 ${index + 1} 条话术">
      <span class="number">${String(index + 1).padStart(2, '0')}</span>
      <span class="text"></span>
    </button>
  `).join('');
  list.querySelectorAll('.card').forEach((card, index) => {
    card.querySelector('.text').textContent = phrases[index];
    card.addEventListener('click', () => copyPhrase(index, card));
  });
}
```

- [ ] **Step 3: Add responsive category-tab styling**

```css
.category-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 12px;
}
.category-tab {
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--muted);
  background: var(--panel);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.category-tab[aria-pressed="true"] {
  border-color: var(--accent);
  color: #21140a;
  background: linear-gradient(135deg, #ffbd6e, var(--accent-strong));
}
@media (min-width: 640px) {
  .category-tabs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
```

### Task 3: Implement scoped random selection and pass automated verification

**Files:**
- Modify: `运营文案和视频/破甲话术话术.html`
- Test: `运营文案和视频/tests/phrase-selector.test.mjs`

**Interfaces:**
- Consumes: `phraseCategories`, `activeCategoryIndex`, `lastIndexes`.
- Produces: `pickRandomIndex(length, previousIndex, randomValue)` and current-category copy behavior.

- [ ] **Step 1: Add the pure random-index function and wire the button**

```js
function pickRandomIndex(length, previousIndex, randomValue = Math.random()) {
  if (length <= 1) return 0;
  const index = Math.floor(randomValue * length);
  return index === previousIndex ? (index + 1) % length : index;
}

randomButton.addEventListener('click', () => {
  const phrases = phraseCategories[activeCategoryIndex].phrases;
  const index = pickRandomIndex(phrases.length, lastIndexes[activeCategoryIndex]);
  lastIndexes[activeCategoryIndex] = index;
  const card = list.querySelector(`[data-index="${index}"]`);
  copyPhrase(index, card, true);
});
```

- [ ] **Step 2: Make copying read from the active category**

```js
async function copyPhrase(index, card, isRandom = false) {
  document.querySelectorAll('.card.selected').forEach(item => item.classList.remove('selected'));
  card.classList.add('selected');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const text = phraseCategories[activeCategoryIndex].phrases[index];
  const ok = await copyText(text);
  showToast(ok ? (isRandom ? '当前分类随机一句已复制' : '已复制，可直接粘贴') : '已选中，请长按复制');
}
```

- [ ] **Step 3: Run the contract test**

Run:

```powershell
node "G:\AI\520reverse-skill\运营文案和视频\tests\phrase-selector.test.mjs"
```

Expected: `phrase-selector contract: PASS`.

- [ ] **Step 4: Run browser smoke checks**

Open the absolute file URL, verify four tabs, switch through every tab, click random once per tab, and confirm each click leaves exactly one selected card. Expected browser console errors: `0`.

- [ ] **Step 5: Commit the deliverable and test**

```powershell
git -C "G:\AI\520reverse-skill" add -- "运营文案和视频/破甲话术话术.html" "运营文案和视频/tests/phrase-selector.test.mjs"
git -C "G:\AI\520reverse-skill" commit -m "feat: categorize phrase randomizer"
```
