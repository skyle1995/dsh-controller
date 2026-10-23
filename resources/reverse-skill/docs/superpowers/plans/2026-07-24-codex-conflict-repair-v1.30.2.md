# Codex Conflict Repair v1.30.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click, explicitly confirmed Codex `model_instructions_file` replacement flow, bump the debug product to `1.30.2`, and launch the local debug client without producing a release package.

**Architecture:** Preserve the existing protected default path and add one optional `ClientConfigurationOptions` value that flows from the existing Tauri command through `ConfiguratorService` and `ClientRegistry` to `CodexAdapter`. The result page recognizes only the existing exact Codex conflict, offers one retry button, and sends the boolean override; the backend computes all paths, creates the existing transactional backup, atomically rewrites TOML, and validates readback.

**Tech Stack:** Rust 2024 workspace, Tauri 2, React 19, TypeScript, Node test runner with happy-dom, `toml_edit`, existing `AtomicFileTransaction`, PowerShell debug launcher.

## Global Constraints

- Product debug version becomes exactly `1.30.2`; legacy Python remains `1.1.0`; historical `1.x` CDKs remain valid.
- Normal configuration must still reject and roll back a foreign string `model_instructions_file`.
- Only an explicit result-page click may set `replaceCodexModelInstructions=true`.
- Non-string values, invalid TOML, missing/corrupt v5 files, backup failures, write failures, and readback failures remain fail-closed.
- No new Tauri command, persistent conflict state, token system, arbitrary UI-provided path, free-Skill coupling, or runtime network behavior.
- This run is debug-only. Do not execute release, signing, installer, upload, website publication, `build-release.ps1`, `cargo build --release`, or `cargo tauri build/bundle`.

---

### Task 1: Add the core confirmed-replacement option

**Files:**
- Modify: `launcher-rs/crates/wujin-core/src/clients/mod.rs`
- Modify: `launcher-rs/crates/wujin-core/src/clients/codex.rs`
- Modify: `launcher-rs/crates/wujin-core/src/service.rs`
- Modify: `launcher-rs/crates/wujin-core/src/lib.rs`
- Test: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`

**Interfaces:**
- Produces: `ClientConfigurationOptions { replace_codex_model_instructions: bool }` with `Default=false`.
- Produces: `ClientAdapter::configure_with_options(&self, skill_root, options)` with a default implementation that calls the existing `configure`.
- Produces: `ConfiguratorService::run_with_progress_and_options(...)`; existing methods delegate with default options.

- [ ] **Step 1: Write the failing Codex replacement test**

Add a test that writes a foreign string path plus unrelated TOML and MCP content, then calls:

```rust
let result = adapter
    .configure_with_options(
        skill.path(),
        ClientConfigurationOptions {
            replace_codex_model_instructions: true,
        },
    )
    .unwrap();
```

Assert success, exact deployed v5 path, preserved unrelated values, a real `result.mcp.backup`, backup bytes equal to the original config, and no change to the foreign referenced file.

- [ ] **Step 2: Run RED**

Run:

```powershell
cd launcher-rs
cargo test -p wujin-core --test client_adapters codex_confirmed_model_instructions_replacement -- --exact
```

Expected: compilation fails because `ClientConfigurationOptions` and `configure_with_options` do not exist.

- [ ] **Step 3: Implement the smallest core option flow**

Add:

```rust
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ClientConfigurationOptions {
    pub replace_codex_model_instructions: bool,
}
```

Extend `ClientAdapter` with a default `configure_with_options`. In `CodexAdapter`, keep `configure` as the protected default and route both methods into one private implementation. Pass the boolean into `merge_toml_mcp` and `validate_existing_model_instructions`; permit replacement only when the current value is a string. Insert the backend-computed expected value into `DocumentMut` when the option is true. Export the options type from `wujin-core`.

Add `ClientRegistry::configure_with_options` and `ConfiguratorService::run_with_progress_and_options`; preserve all existing public methods by delegating with `ClientConfigurationOptions::default()`.

- [ ] **Step 4: Run GREEN and preservation tests**

Run:

```powershell
cargo test -p wujin-core --test client_adapters codex_confirmed_model_instructions_replacement -- --exact
cargo test -p wujin-core --test client_adapters codex_foreign_model_instructions_conflict_restores_rules_and_config codex_non_string_model_instructions_is_rejected_without_rewrite
```

Expected: confirmed replacement passes; protected conflict and non-string behavior remain green.

- [ ] **Step 5: Commit the core slice**

```powershell
git add -- launcher-rs/crates/wujin-core/src/clients/mod.rs launcher-rs/crates/wujin-core/src/clients/codex.rs launcher-rs/crates/wujin-core/src/service.rs launcher-rs/crates/wujin-core/src/lib.rs launcher-rs/crates/wujin-core/tests/client_adapters.rs
git commit -m "feat: add confirmed codex instruction replacement"
```

### Task 2: Thread the option through Tauri and expose the repair UI

**Files:**
- Modify: `launcher-rs/src-tauri/src/commands.rs`
- Modify: `launcher-rs/ui/src/api.ts`
- Modify: `launcher-rs/ui/src/pages/ResultPage.tsx`
- Modify: `launcher-rs/ui/src/styles/app.css`
- Create: `launcher-rs/ui/tests/codex-conflict-repair.test.js`

**Interfaces:**
- Consumes: `ClientConfigurationOptions` from Task 1.
- Produces: `configureSelected(ids, replaceCodexModelInstructions = false)`.
- Produces: result-page retry that calls the same command with `true`.

- [ ] **Step 1: Write failing UI/API contract tests**

Create a Node test that requires:

```js
assert.match(api, /configureSelected\(ids: string\[\], replaceCodexModelInstructions = false\)/);
assert.match(api, /replaceCodexModelInstructions/);
assert.match(resultPage, /model_instructions_file conflict/);
assert.match(resultPage, /备份并替换后重试/);
assert.match(resultPage, /configureSelected\(state\.selected, true\)/);
assert.match(resultPage, /正在修复/);
```

Also inspect `commands.rs` for an optional/default-false replacement argument and `run_with_progress_and_options`.

- [ ] **Step 2: Run RED**

Run:

```powershell
cd launcher-rs\ui
npm.cmd test -- tests/codex-conflict-repair.test.js
```

Expected: FAIL because the API option and repair UI do not exist.

- [ ] **Step 3: Implement the Tauri option**

Extend `configure_selected` with:

```rust
replace_codex_model_instructions: Option<bool>,
```

Build `ClientConfigurationOptions { replace_codex_model_instructions: replace_codex_model_instructions.unwrap_or(false) }` inside the trusted backend and call `run_with_progress_and_options`. Keep authorization and busy checks before service execution.

- [ ] **Step 4: Implement the compact result-page repair action**

Update the API wrapper to invoke with `{ ids, replaceCodexModelInstructions }`. In `ResultPage`, derive the exact conflict only when `clientId === "codex"`, `status === "rolled_back"`, and `message.includes("model_instructions_file conflict")`.

Add component-local `repairing` state and a `repair` async function. It must set paid busy, call `configureSelected(state.selected, true)`, refresh `bootstrap()`, replace results/logs, update progress, and remain on the result page. On failure it must restore busy=false and show the existing error surface. Render “保留当前配置” and “备份并替换后重试”; disable retry while busy and label it “正在修复”.

Add only a small `.result-repair` and `.result-actions` style block using existing panel, warning, button, spacing, and focus conventions.

- [ ] **Step 5: Run GREEN, TypeScript, and UI suite**

Run:

```powershell
npm.cmd test -- tests/codex-conflict-repair.test.js
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
```

Expected: all Node tests pass, TypeScript has zero errors, and Vite builds `ui/dist`.

- [ ] **Step 6: Commit the UI/Tauri slice**

```powershell
git add -- launcher-rs/src-tauri/src/commands.rs launcher-rs/ui/src/api.ts launcher-rs/ui/src/pages/ResultPage.tsx launcher-rs/ui/src/styles/app.css launcher-rs/ui/tests/codex-conflict-repair.test.js
git commit -m "feat: add codex conflict repair action"
```

### Task 3: Bump debug product surfaces to 1.30.2

**Files:**
- Modify: `launcher-rs/crates/wujin-core/src/license.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/license_compat.rs`
- Modify: `launcher-rs/src-tauri/Cargo.toml`
- Modify: `launcher-rs/src-tauri/tauri.conf.json`
- Modify: `launcher-rs/Cargo.lock`
- Modify: `launcher-rs/ui/package.json`
- Modify: `launcher-rs/ui/package-lock.json`
- Modify: `launcher-rs/ui/tests/ui-regression.test.js`
- Modify: `launcher-rs/ui/tests/python-parity.test.js`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Produces: runtime/title/bootstrap product version `1.30.2`.
- Preserves: Python `1.1.0`, CDK `1.x`, free-Skill bundle version `1.30.1`, and historical `1.30.1` audit documents.

- [ ] **Step 1: Change version assertions first and run RED**

Update only the exact product-version assertions in `ui-regression.test.js`, `python-parity.test.js`, and `license_compat.rs` from `1.30.1` to `1.30.2`; leave update-check fixtures and free-Skill bundle fixtures unchanged.

Run:

```powershell
cd launcher-rs\ui
npm.cmd test -- tests/ui-regression.test.js tests/python-parity.test.js
cd ..
cargo test -p wujin-core --test license_compat app_version_and_legacy_rule_are_compatible -- --exact
```

Expected: FAIL because production version surfaces still report `1.30.1`.

- [ ] **Step 2: Update production version surfaces**

Set `APP_VERSION`, Tauri package/config version, UI package/lock version, and the `wujin-launcher` lock entry to `1.30.2`. Update `PROJECT_CONTEXT.md` current delivery version and add a short `1.30.2` conflict-repair note; retain historical plan/audit references as historical `1.30.1` records.

- [ ] **Step 3: Run GREEN and compatibility tests**

Run:

```powershell
cd launcher-rs\ui
npm.cmd test -- tests/ui-regression.test.js tests/python-parity.test.js
cd ..
cargo test -p wujin-core --test license_compat
```

Expected: product version is `1.30.2`, Python remains `1.1.0`, and `1.x` CDKs pass.

- [ ] **Step 4: Commit the version slice**

```powershell
git add -- PROJECT_CONTEXT.md launcher-rs/crates/wujin-core/src/license.rs launcher-rs/crates/wujin-core/tests/license_compat.rs launcher-rs/src-tauri/Cargo.toml launcher-rs/src-tauri/tauri.conf.json launcher-rs/Cargo.lock launcher-rs/ui/package.json launcher-rs/ui/package-lock.json launcher-rs/ui/tests/ui-regression.test.js launcher-rs/ui/tests/python-parity.test.js
git commit -m "chore: bump debug client to v1.30.2"
```

### Task 4: Verify all debug gates and launch owner testing

**Files:**
- Modify: `docs/testing/2026-07-24-windows-v1.30.2-debug-audit.md`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: verified `launcher-rs/target/debug/wujin-launcher.exe` running for owner testing.

- [ ] **Step 1: Run Rust and UI verification**

```powershell
cd launcher-rs
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cd ui
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
cd ..\..
```

Expected: all commands exit 0.

- [ ] **Step 2: Run non-packaging project gates**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-paid-codex-v5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-dev-client-launch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1 -CheckOnly
git diff --check
```

Expected: every gate passes and `dist-rust` remains unchanged.

- [ ] **Step 3: Record debug evidence**

Create the audit with commands, exit results, exact debug EXE path, feature test cases, version evidence, and the label `LOCAL DEBUG ACCEPTANCE — NOT A RELEASE PACKAGE`.

- [ ] **Step 4: Commit the audit**

```powershell
git add -- docs/testing/2026-07-24-windows-v1.30.2-debug-audit.md
git commit -m "test: record v1.30.2 debug verification"
```

- [ ] **Step 5: Launch the visible debug client**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1
```

Expected: `launcher-rs\target\debug\wujin-launcher.exe` opens for the owner. Keep the process available for testing. Do not run any release command.

## Plan self-review

- Every production change starts with a failing test.
- Protected conflict, confirmed replacement, invalid configuration, CDK, busy, paid/free isolation, version compatibility, and debug-only release boundaries are covered.
- The free-Skill bundle remains `1.30.1` because its immutable contents do not change; only the product client becomes `1.30.2`.
- No placeholders, release steps, website mutation, arbitrary path input, or unapproved refactor are included.
