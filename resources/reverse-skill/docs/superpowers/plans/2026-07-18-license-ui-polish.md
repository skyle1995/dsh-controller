# 1.1.0 激活页视觉增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 CDK 验签和缓存边界的前提下，完成品牌图标、红色文档按钮、7 天/永久卡片动态镭射光效和激活结果弹窗。

**Architecture:** 所有视觉变化集中在现有 `App.qml` 组件内，品牌 SVG 作为静态资源打包。激活弹窗只消费 `installer.activate(cdk)` 的布尔结果；服务层继续负责真实验签和缓存写入，QML 不解析 CDK。

**Tech Stack:** Qt Quick/QML, FluentUI 1.0, Python unittest, PowerShell/Nuitka build.

## Global Constraints

- 不改变 CDK token 格式、Ed25519 验签、公钥或缓存结构。
- 不改变正式包的开发模式禁用规则。
- 光效只使用 QML `Gradient`、`Rectangle` 和 `NumberAnimation`，不引入 `ShaderEffect`。
- 正式构建继续使用正式公钥，并输出 `无限破甲-v<版本>.exe`。
- 激活弹窗不读取或显示完整 CDK。

---

### Task 1: Lock the requested UI behavior with failing tests

**Files:**
- Modify: `G:\AI\520reverse-skill\launcher\tests\test_ui_flow.py`
- Test: `G:\AI\520reverse-skill\launcher\tests\test_ui_flow.py`

**Interfaces:**
- Consumes: `App.qml` source text loaded by the existing `UiFlowTests.setUp`.
- Produces: assertions that later QML edits must satisfy.

- [ ] **Step 1: Add failing assertions for the docs button, brand asset, animated cards, and activation dialog.**

Add these methods to `UiFlowTests`:

```python
def test_break_guide_docs_button_is_primary_red(self):
    self.assertRegex(
        self.qml,
        r'AppButton\s*\{\s*text:\s*"查看完整文档";\s*primary:\s*true',
    )

def test_brand_gradient_asset_is_used(self):
    self.assertIn('"../resources/brand-gradient.svg"', self.qml)

def test_purchase_cards_define_laser_sweep_animation(self):
    self.assertIn('NumberAnimation', self.qml)
    self.assertIn('laserSweep', self.qml)
    self.assertIn('trial_cdk', self.qml)
    self.assertIn('permanent_cdk', self.qml)

def test_activation_shows_success_and_failure_dialog(self):
    self.assertIn('activationDialog.open()', self.qml)
    self.assertIn('激活成功', self.qml)
    self.assertIn('激活失败', self.qml)
    self.assertIn('cdk.text.trim().length === 0', self.qml)
```

- [ ] **Step 2: Run the new tests and confirm they fail for the expected missing UI markers.**

Run:

```powershell
G:\AI\520reverse-skill\.venv\Scripts\python.exe -m unittest \
  launcher.tests.test_ui_flow.UiFlowTests.test_break_guide_docs_button_is_primary_red \
  launcher.tests.test_ui_flow.UiFlowTests.test_brand_gradient_asset_is_used \
  launcher.tests.test_ui_flow.UiFlowTests.test_purchase_cards_define_laser_sweep_animation \
  launcher.tests.test_ui_flow.UiFlowTests.test_activation_shows_success_and_failure_dialog -v
```

Expected: the new assertions fail because the current QML uses the old logo path, a non-primary docs button, no `laserSweep`, and no activation dialog.

- [ ] **Step 3: Commit the red tests.**

```powershell
git add launcher/tests/test_ui_flow.py
git commit -m "test: specify activation page visual feedback"
```

### Task 2: Add and wire the gradient brand asset

**Files:**
- Create: `G:\AI\520reverse-skill\launcher\app\resources\brand-gradient.svg`
- Modify: `G:\AI\520reverse-skill\launcher\app\qml\App.qml:449-455`
- Test: `G:\AI\520reverse-skill\launcher\tests\test_ui_flow.py`

**Interfaces:**
- Consumes: user asset `C:\Users\Anything001\OneDrive\桌面\brand-gradient.svg`.
- Produces: a bundled SVG at the stable resource path `../resources/brand-gradient.svg`.

- [ ] **Step 1: Copy the user-provided SVG without changing its vector contents.**

Use a binary-safe file copy from the user asset to the project resource path. Do not recreate or rasterize the SVG.

- [ ] **Step 2: Change only the title-bar `Image.source`.**

```qml
source: Qt.resolvedUrl("../resources/brand-gradient.svg")
```

Keep the existing `24×24`, `Image.PreserveAspectFit`, and title-bar layout.

- [ ] **Step 3: Run the brand-specific test.**

```powershell
G:\AI\520reverse-skill\.venv\Scripts\python.exe -m unittest \
  launcher.tests.test_ui_flow.UiFlowTests.test_brand_gradient_asset_is_used -v
```

Expected: PASS.

- [ ] **Step 4: Commit the asset and path change.**

```powershell
git add launcher/app/resources/brand-gradient.svg launcher/app/qml/App.qml launcher/tests/test_ui_flow.py
git commit -m "feat: use gradient brand mark in launcher"
```

### Task 3: Add low-intensity animated laser gradients to purchase cards

**Files:**
- Modify: `G:\AI\520reverse-skill\launcher\app\qml\App.qml:268-337,638-647`
- Test: `G:\AI\520reverse-skill\launcher\tests\test_ui_flow.py`

**Interfaces:**
- Consumes: existing `PurchaseCard` properties `gradientStart`, `gradientEnd`, `linkEnabled`, and `cardHover`.
- Produces: per-card `laserSweep` animation that does not alter card size or purchase link behavior.

- [ ] **Step 1: Add explicit theme properties to `PurchaseCard`.**

Add `property color laserColor`, `property int sweepDuration`, and `property bool laserEnabled: card.linkEnabled`. Set the 7-day instance to warm red/orange/pink colors and the permanent instance to red/purple/blue colors.

- [ ] **Step 2: Add a clipped diagonal light band inside the card.**

Place this after `cardSurface`, before the content column:

```qml
Rectangle {
    id: laserSweep
    width: card.width * 0.24
    height: card.height * 1.8
    x: -width
    y: -card.height * 0.4
    z: 2
    rotation: 18
    color: card.laserColor
    opacity: card.laserEnabled ? (cardHover.containsMouse ? 0.18 : 0.09) : 0
    visible: card.laserEnabled

    NumberAnimation on x {
        from: -laserSweep.width
        to: card.width + laserSweep.width
        duration: card.sweepDuration
        loops: Animation.Infinite
        running: laserSweep.visible
        easing.type: Easing.InOutQuad
    }
}
```

Set `clip: true` on the card so the band cannot draw outside rounded corners. Keep content at `z: 3` so text remains readable.

- [ ] **Step 3: Configure the two themes.**

Use explicit values:

```qml
PurchaseCard {
    title: "7天激活 CDK"
    description: "适合先体验使用"
    linkName: "trial_cdk"
    gradientStart: "#ff5d62"
    gradientEnd: "#ffad52"
    laserColor: "#ffd8ef"
    sweepDuration: 6200
}
PurchaseCard {
    title: "永久激活 CDK"
    description: "一次激活，永久使用"
    linkName: "permanent_cdk"
    gradientStart: "#f0445d"
    gradientEnd: "#8158e8"
    laserColor: "#d6e5ff"
    sweepDuration: 7200
}
```

- [ ] **Step 4: Run the purchase-card test and the existing UI tests.**

```powershell
G:\AI\520reverse-skill\.venv\Scripts\python.exe -m unittest \
  launcher.tests.test_ui_flow.UiFlowTests.test_purchase_cards_define_laser_sweep_animation \
  launcher.tests.test_ui_flow.UiFlowTests.test_activation_has_responsive_trial_and_permanent_purchase_cards -v
```

Expected: PASS with no layout test regressions.

- [ ] **Step 5: Commit the card visual change.**

```powershell
git add launcher/app/qml/App.qml launcher/tests/test_ui_flow.py
git commit -m "feat: add animated purchase card gradients"
```

### Task 4: Add success and failure activation confirmation popup

**Files:**
- Modify: `G:\AI\520reverse-skill\launcher\app\qml\App.qml:150-209,575-625`
- Test: `G:\AI\520reverse-skill\launcher\tests\test_ui_flow.py`

**Interfaces:**
- Consumes: `installer.activate(cdk.text)` returning `bool` and `installer.activated`.
- Produces: QML-only `activationDialog` state with `activationSucceeded` and `activationMessage`.

- [ ] **Step 1: Add a modal popup with success/failure bindings.**

The popup must define:

```qml
property bool activationSucceeded: false
property string activationMessage: ""
```

Use `activationSucceeded` to select green or red status colors and show `activationMessage`; add a single “确定” button that calls `activationDialog.close()`.

- [ ] **Step 2: Route the activation button through one result handler.**

Replace the current one-line handler with:

```qml
onClicked: {
    var token = cdk.text.trim()
    if (token.length === 0) {
        activationDialog.activationSucceeded = false
        activationDialog.activationMessage = "请输入有效的 CDK 后重试。"
    } else {
        activationDialog.activationSucceeded = installer.activate(token)
        activationDialog.activationMessage = activationDialog.activationSucceeded
            ? "授权已保存，可以继续配置所选客户端。"
            : "CDK 验证失败，请检查内容后重试。"
    }
    activationDialog.open()
}
```

Do not write cache data from QML and do not display the token in the popup.

- [ ] **Step 3: Run the activation dialog test and bridge/license regression tests.**

```powershell
G:\AI\520reverse-skill\.venv\Scripts\python.exe -m unittest \
  launcher.tests.test_ui_flow.UiFlowTests.test_activation_shows_success_and_failure_dialog \
  launcher.tests.test_bridge_license \
  launcher.tests.test_license -v
```

Expected: PASS; CDK behavior remains service-owned.

- [ ] **Step 4: Commit the activation popup change.**

```powershell
git add launcher/app/qml/App.qml launcher/tests/test_ui_flow.py
git commit -m "feat: show activation result dialog"
```

### Task 5: Run UI smoke verification in development mode

**Files:**
- Modify: none
- Test: `G:\AI\520reverse-skill\launcher\app\qml\App.qml`, `C:\Users\Anything001\AppData\Local\无限破甲\logs\startup.log`

**Interfaces:**
- Consumes: development launcher `G:\AI\520reverse-skill\launcher\app\main.py --development`.
- Produces: runtime evidence that the updated QML loads and the root object is created.

- [ ] **Step 1: Restart the running development process after code changes.**

Close the previous source-mode process, then run:

```powershell
$env:WUJIN_PYTHON = 'G:\AI\520reverse-skill\.venv\Scripts\python.exe'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File G:\AI\520reverse-skill\launcher\run-dev.ps1
```

- [ ] **Step 2: Verify the startup log points to source QML.**

Expected log entries include:

```text
module_dir=G:\AI\520reverse-skill\launcher\app
loading_qml=G:\AI\520reverse-skill\launcher\app\qml\App.qml; exists=True
GUI root object created
```

- [ ] **Step 3: Manually exercise the visual states.**

Confirm the docs button is red, both purchase cards show distinct low-intensity moving light bands, the gradient brand icon appears in the title bar, empty CDK shows the failure popup, and non-empty development input shows the success popup.

### Task 6: Full regression verification and package handoff

**Files:**
- Modify: none until the UI changes are approved for packaging.
- Test: `G:\AI\520reverse-skill\launcher\tests\`, `G:\AI\520reverse-skill\dist\无限破甲-v1.1.0.exe`

**Interfaces:**
- Consumes: all source changes from Tasks 1-5 and formal release public key at `G:\AI\Wujin-release-secrets\wujin-ed25519-public.bin`.
- Produces: verified source state ready for a separately requested release build.

- [ ] **Step 1: Run the complete standard-library test suite.**

```powershell
G:\AI\520reverse-skill\.venv\Scripts\python.exe -m unittest discover -s launcher/tests -p 'test_*.py' -q
```

Expected: all tests pass.

- [ ] **Step 2: Run the production build only when the user requests “出包”.**

Before building, clear `C:\Users\Anything001\AppData\Local\无限破甲\license\activation.json`, then invoke the pinned build with the formal public key. Keep the output versioned as `无限破甲-v1.1.0.exe`.

- [ ] **Step 3: Verify the release package.**

Confirm the formal permanent and trial CDKs verify, `--development` and `--public-key` return exit code 2, the package starts without arguments, and record its SHA-256. Do not distribute the private key.
