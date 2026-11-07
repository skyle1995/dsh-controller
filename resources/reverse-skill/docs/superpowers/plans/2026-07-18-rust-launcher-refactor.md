# Rust Launcher Refactor and Package Slimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python/PySide6/Nuitka launcher with a Rust/Tauri launcher while preserving current activation, deployment, client configuration, rollback, logging, and UI behavior.

**Architecture:** A modular monolith with `wujin-core` for platform-independent business logic, `wujin-windows` for Windows APIs and filesystem behavior, a thin Tauri IPC layer, and a React/TypeScript UI. The final customer artifact remains one versioned EXE.

**Tech Stack:** Rust stable MSVC x64, Tauri 2, React, TypeScript, Vite, Serde, `ed25519-dalek`, `toml_edit`, `zip`, `sha2`, `windows-sys`, Cargo tests, Playwright/Tauri Driver.

## Execution Ledger (2026-07-19)

- Tasks 1–5: implemented and committed; Rust CDK verification accepts the production public key at `G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin` and preserves the WJP1/Python contract.
- Task 6: implemented and committed as `fff1b5c`; typed IPC, background configuration, progress events, busy guard, CSP and minimal capabilities are present. `cargo tauri dev` remains an environment check because `cargo-tauri` is not installed on this workstation.
- Task 7: implemented and committed as `694bd0f`; React/Vite UI mirrors the QML page order and interaction gates. UI tests, `tsc --noEmit`, and Vite build pass. Screenshot/DPI/VM parity remains a Task 9 release gate.
- Task 8: implemented and committed as `5298bb4`; the `-TestBuild` release path embeds the public key and allowlisted payload into one EXE. Latest verified artifact: `26,106,880` bytes, SHA-256 `F0A63FFC01A04C76C928A5FECF9EAE47AC31B7B3F97C57CC7E981A48737F5AF8`; forbidden-marker scan is empty. SBOM and component size reports are generated in `dist-rust/`. Final bundled installer signing still requires `cargo-tauri` and VM validation.
- Task 9: pending clean-profile, Python/Rust parity, screenshot/DPI, and Windows 10/11 VM acceptance; no release cutover has occurred.

## Product Contract

`无限破甲` is a Windows customer-facing configuration installer, not a reverse-engineering runtime and not a third-party tool manager. Its single product journey is:

```text
user enters CDK
  → offline signature verification
  → detect installed AI clients
  → user selects one or more clients
  → unlock one-click configuration
  → deploy reverse-skill payload
  → refresh local tool index (read-only detection)
  → write rules and MCP configuration for selected clients
  → backup, validate, atomically commit, or rollback
  → show evidence and next steps
```

The activation gate protects deployment/configuration; client detection and selection can be viewed before activation. A successful result means the selected AI client can reference the deployed `reverse-skill` path, not that third-party tools were installed or that an AI task was executed.

### In Scope

- Offline CDK activation using the frozen `WJP1` protocol.
- Deployment of the bundled `reverse-skill` payload to `%LOCALAPPDATA%\无限破甲\reverse-skill`.
- Read-only `tool-index` generation through the shipped PowerShell script.
- Detecting and configuring only the user-selected Claude, Codex, Kiro, Cursor, Cline, or Windsurf clients.
- Structured merge, user-content preservation, backups, atomic replacement, readback validation, rollback, logs, and recovery guidance.

### Out of Scope

- Downloading, installing, updating, or launching jadx, Frida, radare2, Nmap, MCP services, package managers, or other third-party tools.
- Executing reverse-engineering tasks or acting as the AI client itself.
- Online license validation, device binding, reliable CDK revocation, or anti-sharing enforcement in v1.
- Modifying unselected client configuration or writing system-wide configuration.

## Global Constraints

- Preserve `WJP1.<payload>.<signature>`, activation cache fields, client IDs, target paths, MCP values, managed Markdown markers, backup layout, and status strings.
- The one-click flow must not call `winget`, `pip`, `npm`, `npx`, `git`, `go`, or `docker`, and must not download, install, update, or start third-party tools.
- Do not embed Python, Qt, Nuitka, Node, WebView2 Runtime, private keys, or issued CDK CSV files in the customer EXE.
- WebView2 is a Windows prerequisite; if absent, show a native diagnostic message and exit without downloading it.
- The active release public key is `G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin`; the same directory's private key and issued CDK files must never enter customer artifacts.
- The frozen cross-language protocol is documented in `docs/superpowers/specs/2026-07-18-cdk-cross-language-compatibility.md`; every Rust issuer/verifier change must pass Python→Rust, Rust→Rust, and Rust→Python compatibility gates.
- Keep `launcher/` runnable as the rollback implementation until the Rust version passes all parity and VM gates.
- Current uncommitted workspace changes are user-owned and must remain untouched.
- Use `106.34 MiB` as the current EXE baseline and track `≤30 MiB` as the optimization target; functional parity has priority.

---

### Task 1: Create the Rust Workspace and Shared Contracts

**Files:**
- Create: `launcher-rs/Cargo.toml`
- Create: `launcher-rs/crates/wujin-core/Cargo.toml`
- Create: `launcher-rs/crates/wujin-core/src/lib.rs`
- Create: `launcher-rs/crates/wujin-core/src/models.rs`
- Create: `launcher-rs/crates/wujin-core/src/error.rs`
- Create: `launcher-rs/crates/wujin-windows/Cargo.toml`
- Create: `launcher-rs/src-tauri/Cargo.toml`
- Create: `launcher-rs/ui/package.json`
- Modify: `.gitignore`

**Interfaces:**

```rust
pub enum Status { Success, Warning, Failed, RolledBack, Unsupported }
pub struct ClientDetection { pub client_id: String, pub display_name: String, pub supported: bool, pub detected: bool, pub reason: String, pub rule_path: Option<PathBuf>, pub mcp_path: Option<PathBuf>, pub version: String }
pub struct FileResult { pub target: PathBuf, pub backup: Option<PathBuf>, pub write_status: Status, pub verification: String, pub backup_status: String, pub write_method: String, pub original_sha256: Option<String> }
pub struct ClientResult { pub client_id: String, pub display_name: String, pub status: Status, pub rules: Option<FileResult>, pub mcp: Option<FileResult>, pub message: String, pub restored: Vec<PathBuf> }
```

- [ ] Install and pin the MSVC Rust toolchain; run `rustc --version` and `cargo --version`.
- [ ] Create the workspace and crates without importing Tauri into `wujin-core`.
- [ ] Add Serde contract tests for enum values and `camelCase` JSON fields.
- [ ] Run `cargo test --workspace`; expected result: all tests pass.
- [ ] Run `cargo fmt --all -- --check` and `cargo clippy --workspace --all-targets -- -D warnings`.
- [ ] Ignore Rust targets, UI dependencies, temporary payloads, and release outputs.
- [ ] Commit with `git commit -m "chore: scaffold rust launcher workspace"`.

### Task 2: Port License Verification, Activation Cache, and Issuer CLI

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/license.rs`
- Create: `launcher-rs/crates/wujin-core/src/activation.rs`
- Create: `launcher-rs/crates/wujin-core/tests/license_compat.rs`
- Create: `launcher-rs/crates/wujin-issuer/src/main.rs`

**Interfaces:**

```rust
pub fn version_matches(rule: &str, version: &str) -> Result<bool, CoreError>;
pub struct LicenseVerifier;
impl LicenseVerifier { pub fn verify(&self, token: &str) -> Result<LicenseClaims, CoreError>; }
pub struct ActivationStore;
impl ActivationStore {
    pub fn save(&self, token: &str) -> Result<ActivationRecord, CoreError>;
    pub fn load(&self) -> Result<Option<ActivationRecord>, CoreError>;
}
```

- [ ] Write failing tests for valid, forged, truncated, wrong-product, wrong-version, invalid trial, expired, tampered-cache, and clock-rollback cases.
- [ ] Implement URL-safe base64 without padding, canonical JSON, Ed25519 verification, version rules, and activation timestamps compatible with Python.
- [ ] Implement `wujin-issuer` with explicit 32-byte private-key input; never read keys from implicit locations.
- [ ] Verify a Python-issued CDK with Rust and a Rust-issued CDK with the existing Python verifier.
- [ ] Add a fixed Ed25519 golden vector and assert identical canonical payload bytes, token segments, and signature for both languages.
- [ ] Add a controlled release-material verification command that reads the production public key and historical CDK files without printing token contents; all historical tokens must pass Rust verification.
- [ ] Make Rust issuer CSV output use the legacy `serial,license_type,duration_days,cdk` columns so existing operational tooling remains usable.
- [ ] Run `cargo test -p wujin-core --test license_compat`; expected result: all compatibility cases pass.
- [ ] Commit with `git commit -m "feat: add rust license and activation compatibility"`.

### Task 3: Port Payload Deployment and Tool-Index Orchestration

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/payload.rs`
- Create: `launcher-rs/crates/wujin-core/src/manifest.rs`
- Create: `launcher-rs/crates/wujin-core/src/runner.rs`
- Create: `launcher-rs/crates/wujin-core/src/service.rs`
- Create: `launcher-rs/crates/wujin-core/tests/payload_service.rs`

**Interfaces:**

```rust
pub enum PayloadSource { Directory(PathBuf), Zip(PathBuf) }
pub trait CommandRunner { fn run_powershell(&self, script: &Path) -> Result<(), CoreError>; }
pub struct ConfiguratorService<R, A>;
impl<R, A> ConfiguratorService<R, A> {
    pub fn run(&self, source: PayloadSource, selected: &[ClientId]) -> Result<Vec<ClientResult>, CoreError>;
}
```

- [ ] Add tests for directory deployment, ZIP deployment, missing required files, manifest validation, path traversal, and preservation of extra target files.
- [ ] Implement rejection of absolute paths, `..` escapes, symlinks, and writes outside the staging directory.
- [ ] Preserve the Python exclusion set: `.git`, `launcher`, `dist`, `work`, `reports`, and `__pycache__`.
- [ ] Implement the fixed sequence `deploy → refresh-tool-index.ps1 → configure selected clients`.
- [ ] Enforce the product gate: an unactivated session may detect and select clients but cannot deploy payloads or write client configuration; activation must be checked again immediately before `run`.
- [ ] Mark missing local tools as diagnostic `available=false` results without changing deployment or client-configuration success.
- [ ] Use a fake `CommandRunner` in tests and assert that no package manager command is invoked.
- [ ] Run `cargo test -p wujin-core --test payload_service`.
- [ ] Commit with `git commit -m "feat: migrate payload deployment service"`.

### Task 4: Port Client Adapters, Structured Merge, and Rollback

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/managed_markdown.rs`
- Create: `launcher-rs/crates/wujin-core/src/transaction.rs`
- Create: `launcher-rs/crates/wujin-core/src/clients/mod.rs`
- Create: `launcher-rs/crates/wujin-core/src/clients/{claude,codex,kiro,version_gated,cursor,cline,windsurf}.rs`
- Create: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`

**Interfaces:**

```rust
pub trait ClientAdapter {
    fn detect(&self) -> Result<ClientDetection, CoreError>;
    fn configure(&self, skill_root: &Path) -> Result<ClientResult, CoreError>;
}
pub fn merge_managed_block(existing: &str, block: &str) -> Result<String, CoreError>;
pub fn configuration_succeeded(results: &[ClientResult], selected: &[ClientId]) -> bool;
```

- [ ] Convert the existing 76 Python scenarios into Rust fixtures and tests.
- [ ] Implement Claude/Kiro JSON merge with MCP conflict rejection.
- [ ] Implement Codex TOML merge with `toml_edit`, preserving unrelated user tables.
- [ ] Implement version-gated Cursor, Cline, and Windsurf detection and unsupported-version behavior.
- [ ] Implement unique managed Markdown boundaries, idempotency, backup creation, atomic commit, readback validation, and rollback.
- [ ] Verify that only selected clients are changed in an isolated user profile.
- [ ] Run `cargo test -p wujin-core --test client_adapters`.
- [ ] Commit with `git commit -m "feat: migrate client adapters and rollback transactions"`.

### Task 5: Implement the Windows Platform Layer

**Files:**
- Create: `launcher-rs/crates/wujin-windows/src/paths.rs`
- Create: `launcher-rs/crates/wujin-windows/src/elevation.rs`
- Create: `launcher-rs/crates/wujin-windows/src/atomic.rs`
- Create: `launcher-rs/crates/wujin-windows/src/powershell.rs`
- Create: `launcher-rs/crates/wujin-windows/src/links.rs`
- Create: `launcher-rs/crates/wujin-windows/src/webview2.rs`
- Create: `launcher-rs/crates/wujin-windows/tests/windows_integration.rs`

- [ ] Resolve original `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA` without substituting the elevated account’s profile.
- [ ] Port `ShellExecuteW("runas")` argument preservation and failure message behavior.
- [ ] Implement `ReplaceFileW` for existing targets and `MoveFileExW` for new targets with write-through flags.
- [ ] Invoke PowerShell 5.1 using `-NoProfile -ExecutionPolicy Bypass -File`.
- [ ] Validate HTTPS-only external links and reject `file:`/`command:` schemes.
- [ ] Detect WebView2 before Tauri initialization and show a native message if missing.
- [ ] Test administrator, non-administrator, cancelled UAC, failed elevation, and WebView2-present/absent cases on Windows.
- [ ] Commit with `git commit -m "feat: add windows platform and webview2 preflight"`.

### Task 6: Add Tauri 2 State, Commands, and Events

**Files:**
- Create: `launcher-rs/src-tauri/src/main.rs`
- Create: `launcher-rs/src-tauri/src/state.rs`
- Create: `launcher-rs/src-tauri/src/commands.rs`
- Create: `launcher-rs/src-tauri/src/events.rs`
- Create: `launcher-rs/src-tauri/tauri.conf.json`
- Create: `launcher-rs/src-tauri/capabilities/default.json`

**Commands:**

```text
get_bootstrap_state() -> BootstrapState
activate_license(cdk: String) -> ActivationState
redetect_clients() -> Vec<ClientDetection>
configure_selected(ids: Vec<String>) -> ConfigurationSummary
restore_backup(request: RestoreRequest) -> RestoreResult
open_external_link(name: String) -> bool
```

- [ ] Add typed request/response serialization tests for every command.
- [ ] Keep command handlers thin; delegate all file and license behavior to `wujin-core`.
- [ ] Add a mutex/atomic busy guard that rejects concurrent configuration.
- [ ] Model the product states explicitly: `DetectingClients`, `AwaitingActivation`, `ReadyToConfigure`, `Configuring`, `Completed`, and `FailedRecoverable`.
- [ ] Keep the UI order consistent with the product journey: client selection may precede activation, while configuration remains locked until activation succeeds.
- [ ] Run configuration in a background task and emit `configuration-progress` events.
- [ ] Configure strict local-only CSP and minimal Tauri capabilities.
- [ ] Run `cargo tauri dev`; expected result: the UI receives bootstrap state and can activate a test CDK.
- [ ] Commit with `git commit -m "feat: expose typed tauri installer commands"`.

### Task 7: Rebuild the UI in React and TypeScript

**Files:**
- Create: `launcher-rs/ui/src/main.tsx`
- Create: `launcher-rs/ui/src/api.ts`
- Create: `launcher-rs/ui/src/state/app-state.ts`
- Create: `launcher-rs/ui/src/components/{Sidebar,StatusCards}.tsx`
- Create: `launcher-rs/ui/src/pages/{Clients,Activation,Configure,Result,Guide,BreakGuide,Contact,Logs}Page.tsx`
- Create: `launcher-rs/ui/src/styles/app.css`
- Create: `launcher-rs/ui/tests/app-state.test.ts`
- Create: `launcher-rs/ui/tests/navigation.spec.ts`

- [ ] Write state-machine tests for activation gating, multi-selection, progress, success, failure, and rollback.
- [ ] Freeze an inventory from `launcher/app/qml/App.qml`: title bar/window buttons, sidebar sections and badges, client selection page, activation page/dialogs/purchase cards, configuration progress page, result page, guide page, break-guide page, contact-service page, logs page, and every reusable button/card/navigation component.
- [ ] Reproduce the current page order, exact Chinese copy, activation dialogs, purchase cards, gradient border, laser sweep animation, help pages, QQ copy, links, logs, and all enabled/disabled/visible conditions without redesign.
- [ ] Preserve client detection paths, version text, disabled states, result evidence, and configuration status.
- [ ] Use local CSS components rather than a heavyweight UI library.
- [ ] Port every assertion in `launcher/tests/test_ui_flow.py` into React state tests or Tauri end-to-end tests before visual polishing is considered complete.
- [ ] Add screenshot baselines for each page in inactive, activated, configuring, success, failure, and empty-client states; compare against a captured Python/QML baseline at the same window size.
- [ ] Add pixel-diff thresholds, window-size checks, 100/125/150% DPI checks, keyboard focus/activation checks, title-bar drag/minimize/maximize/close checks, scroll checks, and animation-presence checks.
- [ ] Reject any screenshot or interaction mismatch; do not update baselines to hide a difference without documenting the exact Python/QML reference behavior.
- [ ] Run `npm run test` and `npm run build`; expected result: both pass.
- [ ] Run Playwright/Tauri Driver smoke tests for startup, activation, selection, configuration progress, failure display, and link handling.
- [ ] Commit with `git commit -m "feat: migrate launcher ui to react and tauri"`.

### Task 8: Create Deterministic Release Build and Size Gates

**Files:**
- Create: `launcher-rs/scripts/build-release.ps1`
- Create: `launcher-rs/scripts/verify-release.ps1`
- Create: `launcher-rs/src-tauri/build.rs`
- Create: `launcher-rs/crates/wujin-xtask/src/main.rs`
- Modify: `launcher-rs/Cargo.toml`
- Modify: `launcher-rs/src-tauri/tauri.conf.json`

- [ ] Generate deterministic `reverse-skill.zip` with fixed ordering and timestamps.
- [ ] Validate manifest, required files, public-key length, third-party licenses, and payload round-trip hashes before compiling.
- [ ] Inject only the public key through an explicit `-PublicKeyPath`; clean temporary copies after build.
- [ ] Configure release profile with `lto = "fat"`, `opt-level = "z"`, `codegen-units = 1`, `panic = "abort"`, and symbol stripping.
- [ ] Build `dist-rust/无限破甲-v1.1.0.exe`.
- [ ] Generate SHA-256, SBOM, license list, and a component size report.
- [ ] Scan the final artifact and staging tree for Python, Qt, Nuitka, Node, private-key, and CDK CSV content.
- [ ] Run:

```powershell
powershell -File launcher-rs\scripts\build-release.ps1 -PublicKeyPath G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin -Version 1.1.0 -TestBuild
powershell -File launcher-rs\scripts\verify-release.ps1 -Executable dist-rust\无限破甲-v1.1.0.exe
```

- [ ] Expected result: tests pass, forbidden dependency scan is empty, hash and size reports are produced.
- [ ] Commit with `git commit -m "build: add rust release and size verification"`.

### Task 9: Cross-Check, VM Acceptance, and Release Cutover

**Files:**
- Create: `launcher-rs/tests/parity/`
- Create: `scripts/compare-launchers.ps1`
- Modify: `launcher/build.ps1`
- Modify: `launcher/README.md`
- Modify: `docs/wujin-pojia-exe-plan.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] Run Python and Rust against the same isolated payload, CDK fixtures, client fixtures, and failure injections.
- [ ] Compare activation status, detection output, paths, MCP semantics, backups, rollback, and completion gate.
- [ ] Execute the complete customer journey in a clean profile: start unactivated, detect/select a client, activate with a historical CDK, run one-click configuration, restart the selected AI client, and verify the managed rule/MCP paths point to the deployed payload.
- [ ] Run the UI parity suite at identical window sizes against Python/QML and Rust/Tauri: compare page screenshots, text, control bounds, visibility, enabled states, navigation, keyboard actions, dialogs, scrolling, title-bar actions, and animation presence.
- [ ] Test UI parity at 100%, 125%, and 150% DPI on Windows 10 and Windows 11; any clipping, reflow, missing focus, or changed click target blocks release.
- [ ] Verify that no activation, payload, or client-configuration success indicator appears merely because a template was generated; each selected client needs write and readback evidence.
- [ ] Run the existing Python suite; expected result: `Ran 76 tests ... OK`.
- [ ] Run all Rust workspace tests, UI tests, and release verification.
- [ ] On clean Windows 10/11 x64 VMs, test WebView2 presence/absence, full offline mode, UAC, DPI, first run, repeat run, malformed configs, write interruption, and backup restoration.
- [ ] Monitor child processes and filesystem writes; assert no package manager, downloader, service startup, system-directory write, or unintended client modification.
- [ ] Switch the official build entry to `launcher-rs/scripts/build-release.ps1` only after every gate passes.
- [ ] Keep Python launcher as a rollback build for one release cycle, then remove it in a separate reviewed change.
- [ ] Commit with `git commit -m "feat: switch release launcher to rust tauri build"`.

## Acceptance Criteria

- Rust and Python behavior matches across all current 76 scenarios.
- CDK, activation cache, client paths, MCP semantics, backups, atomic writes, readback, and rollback remain compatible.
- The primary customer journey works end-to-end: historical CDK activation unlocks deployment, selected AI clients receive the payload path and configuration, and the result page shows verifiable evidence.
- The Rust UI is behaviorally and visually equivalent to the Python/QML UI at all documented states and tested DPI levels; this is a release-blocking criterion, not a best-effort target.
- Only explicitly selected clients are changed.
- The offline flow performs no third-party download, install, update, or service startup.
- WebView2 absence is diagnosed before the application crashes.
- The Rust EXE is materially smaller than `106.34 MiB` and has an auditable size report.
- No private key, issued CDK CSV, Python, Qt, Nuitka, or Node runtime enters the customer artifact.
- Win10/Win11, UAC, DPI, offline, failure injection, and restore workflows pass.
- Python launcher remains a verified rollback path during the migration release.

## Assumptions

- Tauri 2 is accepted with WebView2 as a system prerequisite.
- The final product remains a single EXE rather than a Tauri sidecar architecture.
- React/TypeScript/Vite is used for UI migration without a heavyweight component library.
- `≤30 MiB` is an optimization target, not a reason to remove required behavior.
- The Rust issuer CLI is operational tooling only and is never embedded in the customer EXE.
- The installer never claims that third-party tools were installed; it only reports the read-only tool-index state.

## UI Parity Gate

The Rust UI is a compatibility port, not a redesign. `launcher/app/qml/App.qml`, its SVG resources, and the existing UI test contract are the only source of truth. The Rust implementation must preserve the existing window chrome, sidebar order, page order, text, colors, typography, spacing, icons, gradients, laser-sweep animation, dialogs, scroll behavior, button enabled states, navigation guards, logs, and customer-service copy interaction.

No UI change is accepted under this refactor. A difference in visual layout, copy, state transition, keyboard behavior, DPI behavior, animation presence, or click target blocks release cutover until the Python/QML behavior is reproduced.
