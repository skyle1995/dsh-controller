# Six-Client Conflict Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Claude, Codex, Kiro, Cursor, Cline, and Windsurf an explicit per-client MCP conflict repair path that backs up and replaces only Wujin-owned entries after confirmation.

**Architecture:** Add structured conflict metadata to `ClientResult`, split request-wide repair authorization from adapter-local replacement flags, and preflight MCP conflicts before any rule or MCP write. Five JSON clients reuse one repair-aware merger; Codex implements the same contract for TOML while retaining its independent model-instructions replacement switch.

**Tech Stack:** Rust 2024, serde/serde_json, toml/toml_edit, Tauri v2 commands, atomic file transactions, Cargo integration tests.

## Global Constraints

- Do not modify `launcher-rs/ui/**`; the adjacent UI task owns those live files.
- Default configuration remains protective and never overwrites a foreign same-name MCP entry.
- Repair authorization is per client ID and cannot expand to other selected clients.
- Repair replaces only `anything-analyzer`, `idapro`, and `burpsuite` while preserving unrelated configuration.
- Codex MCP repair and `model_instructions_file` repair remain independent.
- Invalid JSON/TOML or a non-object/non-table MCP container remains a non-repairable error.
- Every write uses `AtomicFileTransaction`, returns the backup path, performs readback, and restores on failure.
- Do not change CDK validation, payload contents, free Skills, update behavior, client detection paths, or release packaging.
- Every production-code change follows a witnessed RED → GREEN cycle.

---

### Task 1: Add structured conflict and scoped repair contracts

**Files:**
- Modify: `launcher-rs/crates/wujin-core/src/models.rs`
- Modify: `launcher-rs/crates/wujin-core/src/clients/mod.rs`
- Modify: `launcher-rs/crates/wujin-core/src/service.rs`
- Modify: `launcher-rs/crates/wujin-core/src/lib.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/models_contract.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`
- Modify: `launcher-rs/src-tauri/src/commands.rs` only where existing test fixtures construct `ClientResult`

**Interfaces:**
- Produces: `ConfigurationConflictKind`, `ConfigurationConflict`, `ConfigurationRepairOptions::from_request`, and adapter-local `ClientConfigurationOptions`.
- Consumes: the existing six `ClientId::ALL` values and `ClientRegistry` selection order.

- [ ] **Step 1: Write failing serialization and request-validation tests**

Add to `models_contract.rs`:

```rust
use wujin_core::{ConfigurationConflict, ConfigurationConflictKind};

#[test]
fn configuration_conflict_uses_stable_camel_case_contract() {
    let conflict = ConfigurationConflict {
        kind: ConfigurationConflictKind::Mcp,
        target: PathBuf::from(r"C:\Users\tester\.claude\mcp.json"),
        keys: vec!["idapro".to_owned(), "burpsuite".to_owned()],
        repairable: true,
    };
    assert_eq!(
        serde_json::to_value(conflict).unwrap(),
        serde_json::json!({
            "kind": "mcp",
            "target": r"C:\Users\tester\.claude\mcp.json",
            "keys": ["idapro", "burpsuite"],
            "repairable": true,
        })
    );
}
```

Add tests in `client_adapters.rs` that call `ConfigurationRepairOptions::from_request` and require rejection of duplicate repair IDs, unknown repair IDs, and repair IDs absent from `selected`; require `{"claude"}` to be accepted only when `claude` is selected.

- [ ] **Step 2: Run the focused tests and witness RED**

```powershell
cd launcher-rs
cargo test -p wujin-core --test models_contract configuration_conflict_uses_stable_camel_case_contract -- --nocapture
cargo test -p wujin-core --test client_adapters repair_request_ -- --nocapture
```

Expected: compilation fails because the new conflict and repair option types do not exist.

- [ ] **Step 3: Implement the data contracts**

Add to `models.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigurationConflictKind {
    Mcp,
    ModelInstructions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationConflict {
    pub kind: ConfigurationConflictKind,
    pub target: PathBuf,
    pub keys: Vec<String>,
    pub repairable: bool,
}
```

Append `pub conflicts: Vec<ConfigurationConflict>` to `ClientResult` and initialize it to `Vec::new()` in every existing constructor and test fixture.

Replace the option declaration in `clients/mod.rs` with:

```rust
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ClientConfigurationOptions {
    pub replace_mcp_conflicts: bool,
    pub replace_codex_model_instructions: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConfigurationRepairOptions {
    pub repair_mcp_client_ids: BTreeSet<String>,
    pub replace_codex_model_instructions: bool,
}
```

Implement `ConfigurationRepairOptions::from_request(selected, repair_ids, replace_codex_model_instructions)` so repair IDs must be unique, appear in `selected`, and match a member of `ClientId::ALL`.

Re-export the new contracts from `lib.rs`:

```rust
pub use clients::{ClientConfigurationOptions, ConfigurationRepairOptions};
pub use models::{
    ClientDetection, ClientId, ClientResult, ConfigurationConflict,
    ConfigurationConflictKind, FileResult, Status,
};
```

Change `ClientRegistry::configure_with_options` to receive `ConfigurationRepairOptions` and derive these local options for each adapter:

```rust
let local = ClientConfigurationOptions {
    replace_mcp_conflicts: options.repair_mcp_client_ids.contains(client_id),
    replace_codex_model_instructions: client_id == "codex"
        && options.replace_codex_model_instructions,
};
results.push(adapter.configure_with_options(skill_root, local)?);
```

Change `ConfiguratorService::run_with_progress_and_options` to receive the request-wide type. Keep `run`, `run_with_progress`, and `ClientRegistry::configure` on `ConfigurationRepairOptions::default()`.

- [ ] **Step 4: Run focused tests and witness GREEN**

Run both commands from Step 2. Expected: both pass with zero failures.

- [ ] **Step 5: Commit the contract slice**

```powershell
git add -- launcher-rs/crates/wujin-core/src/models.rs launcher-rs/crates/wujin-core/src/clients/mod.rs launcher-rs/crates/wujin-core/src/service.rs launcher-rs/crates/wujin-core/src/lib.rs launcher-rs/crates/wujin-core/tests/models_contract.rs launcher-rs/crates/wujin-core/tests/client_adapters.rs launcher-rs/src-tauri/src/commands.rs
git diff --cached --check
git commit -m "feat: define scoped configuration conflict repair"
```

### Task 2: Implement repair for the five JSON clients

**Files:**
- Modify: `launcher-rs/crates/wujin-core/src/clients/mod.rs`
- Modify: `launcher-rs/crates/wujin-core/src/clients/claude.rs`
- Modify: `launcher-rs/crates/wujin-core/src/clients/kiro.rs`
- Modify: `launcher-rs/crates/wujin-core/src/clients/version_gated.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`

**Interfaces:**
- Consumes: adapter-local `replace_mcp_conflicts` from Task 1.
- Produces: shared JSON preflight, structured conflict result, and repair-aware merge used by Claude, Kiro, Cursor, Cline, and Windsurf.

- [ ] **Step 1: Add a five-client failing behavior test**

Create helpers in `client_adapters.rs` that prepare each detected JSON client and return its MCP/rule paths. For every ID in `claude`, `kiro`, `cursor`, `cline`, and `windsurf`, write this logical document to the appropriate MCP path:

```json
{
  "userSetting": 7,
  "mcpServers": {
    "custom": { "url": "http://keep" },
    "idapro": { "url": "http://user-owned" }
  }
}
```

The test must assert:

```rust
assert_eq!(protected.status, Status::RolledBack);
assert_eq!(protected.conflicts.len(), 1);
assert_eq!(protected.conflicts[0].kind, ConfigurationConflictKind::Mcp);
assert_eq!(protected.conflicts[0].keys, ["idapro"]);
assert_eq!(fs::read(&mcp_path).unwrap(), original);
assert!(!rule_path.exists());
```

Then authorize only the current ID through `ConfigurationRepairOptions`, rerun, and assert success, empty conflicts, a backup whose bytes equal `original`, preserved `userSetting` and `custom`, and the expected three Wujin MCP entries.

- [ ] **Step 2: Run the five-client test and witness RED**

```powershell
cd launcher-rs
cargo test -p wujin-core --test client_adapters json_clients_offer_scoped_mcp_conflict_repair -- --nocapture
```

Expected: the protected results lack conflict metadata or the repair run remains `rolled_back`.

- [ ] **Step 3: Implement JSON preflight and replacement**

Change `merge_json_mcp` to receive `replace_conflicts: bool`. Add a collector that preserves `MCP_ENTRIES` order followed by `burpsuite`:

```rust
fn json_mcp_conflicts(
    existing: &Map<String, Value>,
    desired: &Map<String, Value>,
) -> Result<Vec<String>, CoreError> {
    let Some(container) = existing.get("mcpServers") else {
        return Ok(Vec::new());
    };
    let servers = container
        .as_object()
        .ok_or_else(|| CoreError::InvalidInput("mcpServers must be an object".into()))?;
    Ok(desired
        .iter()
        .filter(|(name, expected)| {
            servers.get(*name).is_some_and(|current| {
                current != *expected
                    && !(*name == "burpsuite" && is_managed_burpsuite_json(current))
            })
        })
        .map(|(name, _)| name.clone())
        .collect())
}
```

Move MCP loading and preflight ahead of the first rule transaction in `configure_json`. When conflicts exist and replacement is false, return a `ClientResult` with `Status::RolledBack`, empty file results/restored paths, and one repairable `Mcp` conflict targeting `mcp_path`.

When replacement is true, `merge_json_mcp` must insert the desired value even when a conflicting same-name value exists. It must not replace the whole `mcpServers` object.

Override `configure_with_options` in `ClaudeAdapter`, `KiroAdapter`, and `VersionGatedAdapter`; each passes `options.replace_mcp_conflicts` into `configure_json`. Their plain `configure` methods continue using defaults.

- [ ] **Step 4: Run focused and existing JSON adapter tests**

```powershell
cargo test -p wujin-core --test client_adapters json_clients_offer_scoped_mcp_conflict_repair -- --nocapture
cargo test -p wujin-core --test client_adapters claude_ -- --nocapture
cargo test -p wujin-core --test client_adapters unverified_build_ -- --nocapture
```

Expected: all pass; the original Claude protection and managed Burp migration tests remain green.

- [ ] **Step 5: Commit the JSON slice**

```powershell
git add -- launcher-rs/crates/wujin-core/src/clients/mod.rs launcher-rs/crates/wujin-core/src/clients/claude.rs launcher-rs/crates/wujin-core/src/clients/kiro.rs launcher-rs/crates/wujin-core/src/clients/version_gated.rs launcher-rs/crates/wujin-core/tests/client_adapters.rs
git diff --cached --check
git commit -m "feat: repair MCP conflicts for JSON clients"
```

### Task 3: Implement independent Codex TOML conflict repair

**Files:**
- Modify: `launcher-rs/crates/wujin-core/src/clients/codex.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`

**Interfaces:**
- Consumes: both adapter-local booleans and the structured conflict types.
- Produces: Codex MCP repair that does not implicitly authorize model-instructions replacement, and vice versa.

- [ ] **Step 1: Add failing Codex independence tests**

Add one test with both conflicts present:

```toml
# preserve this user comment
model_instructions_file = "C:\\user\\instructions.md"

[user]
name = "keep"

[mcp_servers.custom]
url = "http://keep"

[mcp_servers.idapro]
url = "http://user-owned"
```

Assertions proceed in three runs:

1. Defaults return two conflicts (`mcp` with `idapro`, then `model_instructions`) and preserve exact bytes.
2. `replace_mcp_conflicts=true` alone still returns only `model_instructions` conflict and preserves exact bytes.
3. Both booleans true return success; `user`, `custom`, and TOML comments remain; the backup equals the original; MCP and combined instruction path read back correctly.

Add a second test proving `replace_codex_model_instructions=true` alone still returns the MCP conflict and preserves exact bytes.

- [ ] **Step 2: Run Codex tests and witness RED**

```powershell
cd launcher-rs
cargo test -p wujin-core --test client_adapters codex_mcp_and_model_repairs_are_independent -- --nocapture
cargo test -p wujin-core --test client_adapters codex_model_repair_does_not_authorize_mcp_replacement -- --nocapture
```

Expected: the first run exposes only the first text error and MCP replacement has no effect.

- [ ] **Step 3: Implement TOML conflict collection and repair-aware merge**

Parse the existing TOML once before committing `AGENTS.md`. Collect all differing desired MCP names without treating a recognized old Wujin Burp bridge as foreign. Collect `model_instructions_file` separately; a non-string value remains `CoreError::InvalidInput`.

Return both structured conflicts when their corresponding option is false. Do not write either target while any unapproved conflict remains.

Extend `merge_toml_mcp` with `replace_mcp_conflicts: bool`. In the MCP insertion loop, preserve a conflicting table only when replacement is false; otherwise replace that named table with the desired table. Continue using `toml_edit::DocumentMut` so unrelated comments and decoration survive.

Pass both booleans from `self.options`:

```rust
merge_toml_mcp(
    &existing,
    skill_root,
    &nerv.combined_path,
    &nerv.legacy_v5_path,
    self.options.replace_mcp_conflicts,
    self.options.replace_codex_model_instructions,
)?;
```

- [ ] **Step 4: Run all Codex adapter and rollback tests**

```powershell
cargo test -p wujin-core --test client_adapters codex_ -- --nocapture
cargo test -p wujin-core --test transaction_markdown -- --nocapture
```

Expected: all pass; the NERV validator, legacy migration, comments, invalid TOML, and rollback tests remain green.

- [ ] **Step 5: Commit the Codex slice**

```powershell
git add -- launcher-rs/crates/wujin-core/src/clients/codex.rs launcher-rs/crates/wujin-core/tests/client_adapters.rs
git diff --cached --check
git commit -m "feat: repair Codex MCP conflicts independently"
```

### Task 4: Expose and validate the Tauri repair request

**Files:**
- Modify: `launcher-rs/src-tauri/src/commands.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/one_click_deploy.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/models_contract.rs`

**Interfaces:**
- Consumes: `ConfigurationRepairOptions::from_request` and structured `ClientResult.conflicts`.
- Produces: optional `repair_mcp_client_ids` in `configure_selected`; omission preserves old callers.

- [ ] **Step 1: Write failing command and registry-scope tests**

In `commands.rs` tests, construct request-wide options through the same helper used by the command and assert `["claude"]` repair with selected `["claude", "kiro"]` succeeds, while `["windsurf"]`, duplicate `["claude", "claude"]`, and `["unknown"]` fail.

In `one_click_deploy.rs`, prepare Claude and Kiro with different foreign `idapro` values, authorize only Claude, and assert Claude succeeds with a backup while Kiro returns structured `rolled_back` and preserves its original bytes.

- [ ] **Step 2: Run tests and witness RED**

```powershell
cd launcher-rs
cargo test -p wujin-launcher command_repair_request_ -- --nocapture
cargo test -p wujin-core --test one_click_deploy repair_authorization_is_scoped_to_one_selected_client -- --nocapture
```

Expected: the command has no repair list parameter and the service cannot scope replacement per selected client.

- [ ] **Step 3: Wire the command without breaking existing callers**

Change the command signature to:

```rust
pub async fn configure_selected(
    app: AppHandle<tauri::Wry>,
    state: State<'_, AppState>,
    ids: Vec<String>,
    repair_mcp_client_ids: Option<Vec<String>>,
    replace_codex_model_instructions: Option<bool>,
) -> Result<ConfigurationSummary, AppError>
```

After paid authorization and before acquiring the paid busy guard or resolving the payload, call:

```rust
let options = ConfigurationRepairOptions::from_request(
    &ids,
    repair_mcp_client_ids.unwrap_or_default(),
    replace_codex_model_instructions.unwrap_or(false),
)?;
```

Pass that request-wide value into `run_with_progress_and_options`. An omitted list is empty, so the existing frontend continues to compile and remains in protected mode.

Update result logging to add one entry per structured conflict containing only client ID, conflict kind, target, and key names; do not include the previous user values.

- [ ] **Step 4: Run command, deploy, and model contracts**

```powershell
cargo test -p wujin-launcher -- --nocapture
cargo test -p wujin-core --test one_click_deploy -- --nocapture
cargo test -p wujin-core --test models_contract -- --nocapture
```

Expected: all pass with zero failures.

- [ ] **Step 5: Commit the IPC slice**

```powershell
git add -- launcher-rs/src-tauri/src/commands.rs launcher-rs/crates/wujin-core/tests/one_click_deploy.rs launcher-rs/crates/wujin-core/tests/models_contract.rs
git diff --cached --check
git commit -m "feat: expose scoped MCP conflict repair command"
```

### Task 5: Run compatibility gates and record verification

**Files:**
- Create: `docs/testing/2026-07-27-six-client-conflict-repair-audit.md`
- Verify: all files committed by Tasks 1-4

**Interfaces:**
- Consumes: completed backend repair flow and the adjacent UI task's optional use of `repairMcpClientIds`.
- Produces: reproducible evidence without creating a release package.

- [ ] **Step 1: Run formatting, lint, and focused suites**

```powershell
cd launcher-rs
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -p wujin-core --test client_adapters -- --nocapture
cargo test -p wujin-core --test one_click_deploy -- --nocapture
cargo test -p wujin-core --test models_contract -- --nocapture
cargo test -p wujin-launcher -- --nocapture
```

Expected: every command exits `0`.

- [ ] **Step 2: Run historical CDK compatibility**

```powershell
$env:WUJIN_RELEASE_SECRETS = 'G:\AI\520reverse-skill\Wujin-release-secrets'
cargo test -p wujin-core --test license_compat -- --nocapture
Remove-Item Env:WUJIN_RELEASE_SECRETS
```

Expected: 11 passed, zero CDK values printed.

- [ ] **Step 3: Run the complete gate in an isolated Cargo target**

```powershell
cd ..
$env:WUJIN_RELEASE_SECRETS = 'G:\AI\520reverse-skill\Wujin-release-secrets'
$env:CARGO_TARGET_DIR = 'G:\AI\520reverse-skill\.worktrees\wujin-v2.0-windows\launcher-rs\target\conflict-repair-full-gate'
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
Remove-Item Env:WUJIN_RELEASE_SECRETS
Remove-Item Env:CARGO_TARGET_DIR
```

Expected: full automated gate passes; the running adjacent UI debug executable remains untouched.

- [ ] **Step 4: Audit scope**

```powershell
git diff --check
git diff --name-only 639612a..HEAD | Select-String '^launcher-rs/ui/'
git status --short
```

Expected: no committed `launcher-rs/ui/**` path from this plan; adjacent UI and service work remains unstaged and unchanged.

- [ ] **Step 5: Write and commit the audit**

Record commands, exit codes, test counts, six-client behavior coverage, backup/readback evidence, final commit range, and the exact statement `LOCAL DEVELOPMENT VERIFICATION; NO RELEASE PACKAGE BUILT`.

```powershell
git add -- docs/testing/2026-07-27-six-client-conflict-repair-audit.md
git diff --cached --check
git commit -m "docs: record six-client conflict repair verification"
```
