# Three-Client API Provider Center Implementation Plan

> **2.0.0 发布范围以 [`2026-07-28-provider-center-v2-release-scope.md`](../specs/2026-07-28-provider-center-v2-release-scope.md) 为准。** 本计划未落地的 Cursor、测速、导入和 operation restore 任务顺延到后续版本。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Provider import, encrypted secret storage, editing, connection testing, transactional enablement, and restoration for Claude, Codex, and capability-verified Cursor versions.

**Architecture:** Store secret-free Provider metadata in `wujin-core`, protect keys and sensitive backups with a reusable Windows DPAPI store, and keep each client format behind a pure adapter. Tauri exposes narrow commands that never return keys; React renders one provider page for the three adapters.

**Tech Stack:** Rust 1.97, serde/serde_json, toml_edit, reqwest with rustls, Windows DPAPI, Tauri 2, React 19, TypeScript, Node test runner.

## Global Constraints

- First version covers only Claude, Codex, and Cursor.
- API keys never enter UI state, bootstrap data, logs, errors, ordinary backups, fixtures, commits, or exports.
- Provider metadata lives under `%LOCALAPPDATA%\无限破甲\providers`; key material uses DPAPI files referenced by opaque IDs.
- Claude and Codex writes are atomic, read back after commit, and restored in reverse order on failure.
- Cursor enablement requires a version adapter backed by a verified configuration fixture; unmatched versions return `unsupported_version` with zero file writes.
- Provider enablement and one-click configuration share one write lock.
- Production connectivity allows HTTPS only, blocks redirects, and bounds time and response size.
- No live website, manifest, package, or release changes belong to this plan.

---

### Task 1: Provider metadata and DPAPI secret stores

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/providers/mod.rs`
- Create: `launcher-rs/crates/wujin-core/src/providers/models.rs`
- Create: `launcher-rs/crates/wujin-core/src/providers/store.rs`
- Modify: `launcher-rs/crates/wujin-core/src/lib.rs`
- Create: `launcher-rs/crates/wujin-core/tests/provider_store.rs`
- Create: `launcher-rs/crates/wujin-windows/src/secret_store.rs`
- Modify: `launcher-rs/crates/wujin-windows/src/lib.rs`
- Create: `launcher-rs/crates/wujin-windows/tests/secret_store.rs`

**Interfaces:**
- Produces: `ProviderProfile`, `ProviderProfileInput`, `ProviderProfileSummary`, `ProviderStore`, and `DpapiSecretStore::{save,load,remove}`.

- [ ] **Step 1: Write RED storage tests**

```rust
#[test]
fn provider_metadata_never_contains_the_api_key() {
    let saved = store.save(profile_with_secret_ref("secret-profile-a")).unwrap();
    assert_eq!(saved.key_state, KeyState::Present);
    let metadata = std::fs::read_to_string(store.path()).unwrap();
    assert!(!metadata.contains("apiKey"));
    assert!(metadata.contains("secret-profile-a"));
}

#[test]
fn dpapi_ciphertext_does_not_contain_plaintext() {
    secrets.save("profile-a", b"SENTINEL_PROVIDER_KEY").unwrap();
    assert!(!std::fs::read(secrets.path_for_test("profile-a")).unwrap()
        .windows(21).any(|part| part == b"SENTINEL_PROVIDER_KEY"));
}
```

- [ ] **Step 2: Run storage tests and verify RED**

```powershell
cargo test -p wujin-core --test provider_store
cargo test -p wujin-windows --test secret_store
```

Expected: compile failure because provider and secret store modules are absent.

- [ ] **Step 3: Add stable models and optimistic revision**

```rust
pub struct ProviderProfile {
    pub id: String,
    pub revision: u64,
    pub client_id: ProviderClient,
    pub name: String,
    pub protocol: ProviderProtocol,
    pub base_url: String,
    pub default_model: String,
    pub auth_mode: AuthMode,
    pub secret_ref: Option<String>,
}
```

Normalize and validate names, HTTPS URLs, model length, unique IDs, and `expected_revision`. Serialize metadata through a same-directory temporary file and read it back before replacement.

- [ ] **Step 4: Extract a reusable DPAPI secret store**

```rust
pub struct DpapiSecretStore { root: PathBuf }

impl DpapiSecretStore {
    pub fn save(&self, secret_ref: &str, secret: &[u8]) -> Result<(), CoreError>;
    pub fn load(&self, secret_ref: &str) -> Result<Vec<u8>, CoreError>;
    pub fn remove(&self, secret_ref: &str) -> Result<(), CoreError>;
}
```

Reuse `CryptProtectData`/`CryptUnprotectData`, the Wujin header convention, atomic replacement, a 64 KiB limit, opaque reference validation, and volatile zeroing.

- [ ] **Step 5: Run tests and commit**

```powershell
cargo test -p wujin-core --test provider_store
cargo test -p wujin-windows --test secret_store
cargo fmt --all -- --check
git add -- launcher-rs/crates/wujin-core/src/providers launcher-rs/crates/wujin-core/src/lib.rs launcher-rs/crates/wujin-core/tests/provider_store.rs launcher-rs/crates/wujin-windows/src/secret_store.rs launcher-rs/crates/wujin-windows/src/lib.rs launcher-rs/crates/wujin-windows/tests/secret_store.rs
git commit -m "feat: store provider profiles with protected secrets"
```

### Task 2: Claude import and configuration transform

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/providers/adapters/mod.rs`
- Create: `launcher-rs/crates/wujin-core/src/providers/adapters/claude.rs`
- Create: `launcher-rs/crates/wujin-core/tests/provider_claude.rs`

**Interfaces:**
- Consumes: Task 1 models.
- Produces: `ClaudeProviderAdapter::{import,render,verify}` using byte slices and no filesystem access.

- [ ] **Step 1: Write RED transform tests**

```rust
#[test]
fn claude_render_preserves_unknown_fields_and_auth_mode() {
    let output = adapter.render(original_json, &profile, b"secret").unwrap();
    let value: serde_json::Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(value["custom"], 7);
    assert_eq!(value["env"]["ANTHROPIC_AUTH_TOKEN"], "secret");
    assert!(value["env"].get("ANTHROPIC_API_KEY").is_none());
}
```

- [ ] **Step 2: Run and verify RED**

```powershell
cargo test -p wujin-core --test provider_claude
```

Expected: compile failure because `ClaudeProviderAdapter` is absent.

- [ ] **Step 3: Implement pure import/render/verify**

```rust
pub struct ImportedProvider {
    pub base_url: String,
    pub default_model: String,
    pub auth_mode: AuthMode,
    pub secret: Option<Vec<u8>>,
}
```

Preserve unknown root and `env` fields, select exactly one auth field from `auth_mode`, and verify the written Base URL, model, and auth-field presence without returning its value.

- [ ] **Step 4: Run tests and commit**

```powershell
cargo test -p wujin-core --test provider_claude
cargo fmt --all -- --check
git add -- launcher-rs/crates/wujin-core/src/providers/adapters launcher-rs/crates/wujin-core/tests/provider_claude.rs
git commit -m "feat: adapt Claude provider configuration"
```

### Task 3: Codex dual-file configuration transform

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/providers/adapters/codex.rs`
- Create: `launcher-rs/crates/wujin-core/tests/provider_codex.rs`

**Interfaces:**
- Consumes: Task 1 models.
- Produces: `CodexProviderAdapter::{import,render_config,render_auth,verify}` and stable table IDs.

- [ ] **Step 1: Write RED Codex tests**

```rust
#[test]
fn codex_render_keeps_comments_mcp_and_unrelated_provider_tables() {
    let rendered = adapter.render_config(original_toml, &profile).unwrap();
    assert!(rendered.contains("# user comment"));
    assert!(rendered.contains("[mcp_servers.anything-analyzer]"));
    assert!(rendered.contains("[model_providers.external]"));
    assert!(rendered.contains("model_provider = \"wujin_a1b2c3d4\""));
}
```

- [ ] **Step 2: Run and verify RED**

```powershell
cargo test -p wujin-core --test provider_codex
```

Expected: compile failure because the Codex provider adapter is absent.

- [ ] **Step 3: Implement preserve-style TOML and auth JSON transforms**

```rust
pub struct CodexRenderedConfiguration {
    pub config_toml: Vec<u8>,
    pub auth_json: Vec<u8>,
    pub provider_table_id: String,
}
```

Use `toml_edit::DocumentMut`; update only `model`, `model_provider`, and the Wujin-owned provider table. Preserve every unrelated table and comment. Update only `OPENAI_API_KEY` in the auth JSON object.

- [ ] **Step 4: Run tests and commit**

```powershell
cargo test -p wujin-core --test provider_codex
cargo fmt --all -- --check
git add -- launcher-rs/crates/wujin-core/src/providers/adapters/codex.rs launcher-rs/crates/wujin-core/tests/provider_codex.rs launcher-rs/crates/wujin-core/src/providers/adapters/mod.rs
git commit -m "feat: adapt Codex provider configuration"
```

### Task 4: Encrypted operation transaction

**Files:**
- Create: `launcher-rs/crates/wujin-windows/src/provider_transaction.rs`
- Modify: `launcher-rs/crates/wujin-windows/src/lib.rs`
- Create: `launcher-rs/crates/wujin-windows/tests/provider_transaction.rs`

**Interfaces:**
- Consumes: `DpapiSecretStore` and rendered adapter bytes.
- Produces: `ProviderOperationTransaction::{commit,finish,rollback}` and opaque `ProviderOperationRecord`.

- [ ] **Step 1: Write RED rollback tests**

```rust
#[test]
fn second_file_failure_restores_the_first_and_encrypts_backups() {
    let result = transaction.commit_many(vec![valid_first, failing_second]);
    assert!(result.is_err());
    assert_eq!(std::fs::read(first_path).unwrap(), original_first);
    assert!(!backup_bytes.contains_subslice(b"SENTINEL_PROVIDER_KEY"));
}
```

- [ ] **Step 2: Run and verify RED**

```powershell
cargo test -p wujin-windows --test provider_transaction
```

Expected: compile failure because the operation transaction is absent.

- [ ] **Step 3: Implement reverse-order restoration**

```rust
pub struct ProviderOperationRecord {
    pub operation_id: String,
    pub client_id: String,
    pub files: Vec<EncryptedCommitRecord>,
    pub status: ProviderOperationStatus,
}
```

Stage all bytes first, encrypt full original files before writing, atomically replace and verify each target, and propagate a distinct `RollbackFailed` error with its target.

- [ ] **Step 4: Run tests and commit**

```powershell
cargo test -p wujin-windows --test provider_transaction
cargo fmt --all -- --check
git add -- launcher-rs/crates/wujin-windows/src/provider_transaction.rs launcher-rs/crates/wujin-windows/src/lib.rs launcher-rs/crates/wujin-windows/tests/provider_transaction.rs
git commit -m "feat: transact sensitive provider configuration"
```

### Task 5: Connectivity tester and Cursor capability

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/providers/connectivity.rs`
- Create: `launcher-rs/crates/wujin-core/src/providers/adapters/cursor.rs`
- Create: `launcher-rs/crates/wujin-core/tests/provider_connectivity.rs`
- Create: `launcher-rs/crates/wujin-core/tests/provider_cursor.rs`

**Interfaces:**
- Produces: `ProviderConnectionTester::test`, `ConnectionTestResult`, and `CursorProviderAdapter::capability`.

- [ ] **Step 1: Write RED protocol and capability tests**

```rust
#[test]
fn connectivity_rejects_redirects_and_never_echoes_the_key() {
    let error = tester.test(&profile, b"SENTINEL_PROVIDER_KEY").unwrap_err();
    assert_eq!(error.kind(), ConnectionErrorKind::Protocol);
    assert!(!error.to_string().contains("SENTINEL_PROVIDER_KEY"));
}

#[test]
fn unknown_cursor_versions_perform_zero_writes() {
    assert_eq!(adapter.capability(&fixture), CursorCapability::UnsupportedVersion);
}
```

- [ ] **Step 2: Run and verify RED**

```powershell
cargo test -p wujin-core --test provider_connectivity --test provider_cursor
```

Expected: compile failure because both modules are absent.

- [ ] **Step 3: Implement bounded HTTPS testing and capability-only Cursor adapter**

```rust
pub struct ConnectionTestResult {
    pub status: ConnectionStatus,
    pub latency_ms: u64,
    pub model_present: Option<bool>,
}
```

Disable redirects, cap response bytes, normalize paths, and expose only fixed error categories. Cursor returns detected version, configuration source, and capability; it performs no write until a version fixture is registered.

- [ ] **Step 4: Run tests and commit**

```powershell
cargo test -p wujin-core --test provider_connectivity --test provider_cursor
cargo fmt --all -- --check
git add -- launcher-rs/crates/wujin-core/src/providers/connectivity.rs launcher-rs/crates/wujin-core/src/providers/adapters/cursor.rs launcher-rs/crates/wujin-core/tests/provider_connectivity.rs launcher-rs/crates/wujin-core/tests/provider_cursor.rs
git commit -m "feat: test provider endpoints and detect Cursor support"
```

### Task 6: Provider service and Tauri IPC

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/providers/service.rs`
- Create: `launcher-rs/src-tauri/src/provider_commands.rs`
- Modify: `launcher-rs/src-tauri/src/state.rs`
- Modify: `launcher-rs/src-tauri/src/main.rs`
- Test in: `launcher-rs/src-tauri/src/provider_commands.rs`

**Interfaces:**
- Consumes: Tasks 1–5 stores, adapters, transaction, and connectivity tester.
- Produces: seven camelCase Tauri commands named in the design specification.

- [ ] **Step 1: Write RED IPC serialization tests**

```rust
#[test]
fn provider_state_and_errors_never_serialize_secrets() {
    let json = serde_json::to_string(&provider_state_with_secret()).unwrap();
    assert!(!json.contains("SENTINEL_PROVIDER_KEY"));
    assert!(json.contains("\"keyState\":\"present\""));
}
```

- [ ] **Step 2: Run and verify RED**

```powershell
cargo test -p wujin-launcher --test provider_commands
```

Expected: compile failure because provider commands are absent.

- [ ] **Step 3: Add state, shared write lock, and commands**

```rust
pub struct ProviderStateResponse {
    pub clients: Vec<ProviderClientState>,
    pub profiles: Vec<ProviderProfileSummary>,
    pub active_by_client: BTreeMap<String, String>,
}
```

Register `get_provider_state`, `import_current_provider`, `save_provider_profile`, `delete_provider_profile`, `enable_provider_profile`, `test_provider_connection`, and `restore_provider_operation`. Keep secrets inside blocking backend tasks and use one `configuration_write_lock` for provider enablement and `configure_selected`.

- [ ] **Step 4: Run tests and commit**

```powershell
cargo test -p wujin-launcher --test provider_commands
cargo test -p wujin-core --tests
cargo test -p wujin-windows --tests
cargo fmt --all -- --check
git add -- launcher-rs/crates/wujin-core/src/providers/service.rs launcher-rs/src-tauri/src/provider_commands.rs launcher-rs/src-tauri/src/state.rs launcher-rs/src-tauri/src/main.rs
git commit -m "feat: expose provider management commands"
```

### Task 7: Three-client Provider page

**Files:**
- Create: `launcher-rs/ui/src/pages/ProviderPage.tsx`
- Create: `launcher-rs/ui/src/styles/providers.css`
- Modify: `launcher-rs/ui/src/api.ts`
- Modify: `launcher-rs/ui/src/state/app-state.ts`
- Modify: `launcher-rs/ui/src/components/Sidebar.tsx`
- Modify: `launcher-rs/ui/src/main.tsx`
- Create: `launcher-rs/ui/tests/provider-page.test.tsx`
- Create: `launcher-rs/ui/tests/provider-state.test.js`

**Interfaces:**
- Consumes: Task 6 camelCase IPC.
- Produces: real `providers` route and `ProviderPage` for Claude, Codex, and Cursor.

- [ ] **Step 1: Write RED route and DOM tests**

```tsx
assert.equal(screen.getAllByRole("tab").map((node) => node.textContent).join(","), "Claude,Codex,Cursor");
assert.equal(screen.queryByDisplayValue("SENTINEL_PROVIDER_KEY"), null);
fireEvent.click(screen.getByRole("button", { name: "设为当前" }));
assert.equal(enableCalls.length, 1);
```

- [ ] **Step 2: Run and verify RED**

```powershell
pnpm.cmd exec tsx --test tests/provider-page.test.tsx tests/provider-state.test.js
```

Expected: FAIL because the route, API types, and page are absent.

- [ ] **Step 3: Add API contracts and isolated provider state**

```ts
export type ProviderProfileSummary = {
  id: string;
  revision: number;
  clientId: "claude" | "codex" | "cursor";
  name: string;
  baseUrl: string;
  defaultModel: string;
  keyState: "missing" | "present";
  active: boolean;
};
```

Add guarded request state so save, test, enable, import, delete, and restore each permit one in-flight command.

- [ ] **Step 4: Implement the Provider page**

```tsx
<ProviderTabs clients={state.provider.clients} selected={state.provider.selectedClient}/>
<ProviderList profiles={visibleProfiles} activeId={activeId}/>
<ProviderEditor profile={selectedProfile} keyValue="" keyState={selectedProfile?.keyState}/>
```

Show capability separately from connection status. For unsupported Cursor versions, retain save/test actions and disable only import/enable with the backend reason.

- [ ] **Step 5: Run UI gates and commit**

```powershell
pnpm.cmd exec tsx --test tests/provider-page.test.tsx tests/provider-state.test.js
pnpm.cmd test
pnpm.cmd exec tsc --noEmit
pnpm.cmd run build
git add -- launcher-rs/ui/src/pages/ProviderPage.tsx launcher-rs/ui/src/styles/providers.css launcher-rs/ui/src/api.ts launcher-rs/ui/src/state/app-state.ts launcher-rs/ui/src/components/Sidebar.tsx launcher-rs/ui/src/main.tsx launcher-rs/ui/tests/provider-page.test.tsx launcher-rs/ui/tests/provider-state.test.js
git commit -m "feat: add the three-client provider center"
```

### Task 8: Integrated verification and owner test client

**Files:**
- Create: `docs/testing/2026-07-28-three-client-provider-center-audit.md`
- Modify only files tied to a reproduced regression.

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: complete local verification evidence and the correct debug client.

- [ ] **Step 1: Run Rust and UI gates**

```powershell
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
pnpm.cmd test
pnpm.cmd exec tsc --noEmit
pnpm.cmd run build
```

Expected: every command exits 0.

- [ ] **Step 2: Run a sentinel secret scan**

```powershell
rg -n --hidden --glob '!target/**' --glob '!node_modules/**' 'SENTINEL_PROVIDER_KEY|ANTHROPIC_AUTH_TOKEN\s*[=:]\s*[^"<]' launcher-rs docs
```

Expected: only test source literals designed for negative assertions appear; no generated state, logs, report values, or snapshots appear.

- [ ] **Step 3: Build and start the curated debug client**

```powershell
Remove-Item Env:WUJIN_SOURCE_ROOT -ErrorAction SilentlyContinue
$env:WUJIN_ALLOW_DEVELOPMENT='1'
& G:\AI\.wujin-keygate-deploy\start-wujin-test-client.ps1 -Rebuild
```

Expected: only `launcher-rs\target\debug\wujin-launcher.exe` starts and Vite remains reachable at `127.0.0.1:1420`.

- [ ] **Step 4: Verify end-to-end behavior and write the audit**

Verify Claude import/save/test/enable/restore, Codex dual-file rollback, Cursor capability display, masked keys, duplicate-click guards, and coexistence with one-click configuration. Record file hashes, operation IDs in truncated form, statuses, and commands; exclude all credentials and full keys.

- [ ] **Step 5: Commit the audit**

```powershell
git add -- docs/testing/2026-07-28-three-client-provider-center-audit.md
git commit -m "docs: verify the provider center"
```
