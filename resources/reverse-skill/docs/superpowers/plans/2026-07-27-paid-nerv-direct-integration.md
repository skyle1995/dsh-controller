# Paid NERV Direct Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the pinned NERV `bridge.md` and 28 upstream Skills to the CDK-gated paid Codex one-click configuration while preserving the existing GPT-5.6 v5 instruction, user-owned configuration, paid/free isolation, and the single-EXE offline runtime contract.

**Architecture:** Vendor only the upstream offline-direct surface under `assets/codex/nerv-break-5.6`, generate a deterministic combined v5+NERV instruction file, and let `CodexAdapter` validate the pinned asset manifest before atomically updating `AGENTS.md` and `config.toml`. Existing Wujin v5 paths are migrated as Wujin-owned state; every other foreign `model_instructions_file` remains protected by the existing conflict flow.

**Tech Stack:** Rust 2024, `serde`/`serde_json`, `toml_edit`, SHA-256, PowerShell 5.1-compatible supply-chain tests, Tauri paid payload ZIP, Cargo integration tests.

## Global Constraints

- Upstream repository is `https://github.com/lingbol088-spec/5.6-JAILBREAK-NERV-codex-instruct-5.6.git` pinned to commit `8fd1ffb069f7ada3e17b72c6e70bd003f2faeeb0`.
- Vendor only exact `bridge.md` and `skills/**` bytes; upstream proxy, MCP server, deploy scripts, documentation, images, and tool downloaders stay excluded.
- The NERV direct asset contains exactly 28 Skill directories, 28 `SKILL.md` files, 38 relative scripts, and 66 files under `skills/`.
- Do not modify `launcher-rs/ui/**`; that directory contains another task's live changes.
- Do not change CDK format, keys, product ID, version rule, activation cache, update flow, or non-Codex adapters.
- Do not copy NERV assets into `free-skills.zip`, the free catalog, free state, free backups, or free IPC.
- Do not require Python, Node, WSL, Docker, Kali, a local proxy, or runtime network access.
- Preserve user-owned `AGENTS.md`, TOML comments, unrelated TOML values, and foreign `model_instructions_file` values.
- Every production-code change follows a witnessed RED → GREEN test cycle.

---

### Task 1: Pin and validate the NERV offline-direct supply chain

**Files:**
- Create: `launcher-rs/scripts/test-paid-nerv-direct.ps1`
- Create: `assets/codex/nerv-break-5.6/bridge.md`
- Create: `assets/codex/nerv-break-5.6/skills/**`
- Create: `assets/codex/nerv-break-5.6/FILE-MANIFEST.json`
- Create: `assets/codex/nerv-break-5.6/SOURCE.json`
- Create: `assets/codex/nerv-break-5.6/LICENSE-CLAIM.md`
- Create: `assets/codex/nerv-break-5.6/ROUTING.md`
- Test: `launcher-rs/scripts/test-paid-nerv-direct.ps1`

**Interfaces:**
- Consumes: pinned checkout at commit `8fd1ffb069f7ada3e17b72c6e70bd003f2faeeb0` during development only.
- Produces: immutable paid asset root with a strict JSON hash inventory consumed by Rust runtime validation and release tests.

- [ ] **Step 1: Write the failing supply-chain test**

Create a PowerShell test that requires the asset root, strict top-level allowlist, exact source URL/commit/mode, bridge SHA-256 `4ACD1798C9A60BFC91B8DAACDF0BE8A6337052E3486A2EC725D3D6A4B511894F`, exactly 28 immediate Skill directories, exactly 28 `SKILL.md` files, exactly 66 files beneath `skills`, no reparse points, and a manifest record matching every vendored upstream file byte-for-byte. It must reject the omitted filenames `proxy_relay.py`, `direct_setup.py`, `deploy.py`, `mcp_server.py`, `requirements.txt`, `tools`, `scripts`, and `images` anywhere in the NERV asset root.

- [ ] **Step 2: Run the supply-chain test and witness RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-paid-nerv-direct.ps1
```

Expected: non-zero exit with `Paid NERV direct asset directory is missing`.

- [ ] **Step 3: Vendor exact upstream bytes and generate records**

Copy only `bridge.md` and `skills/**` from the pinned checkout. Generate `FILE-MANIFEST.json` with schema version `1` and sorted records `{ path, bytes, sha256 }` for `bridge.md` plus all 66 `skills/**` files. Generate `SOURCE.json` with the fixed repository, commit, branch `main`, mode `offline-direct`, counts, bridge hash, manifest filename/hash, README hash as license evidence, `standalone_license_file: false`, and an explicit omitted-component array. Generate `ROUTING.md` from each `SKILL.md` frontmatter name/description without changing upstream Skill bytes. `LICENSE-CLAIM.md` records only the pinned README's MIT claim and absence of a standalone license file.

- [ ] **Step 4: Run the supply-chain test and witness GREEN**

Run the command from Step 2. Expected final line: `PAID NERV DIRECT SUPPLY CHAIN PASSED`.

- [ ] **Step 5: Commit the supply-chain slice**

```powershell
git add -- launcher-rs/scripts/test-paid-nerv-direct.ps1 assets/codex/nerv-break-5.6
git diff --cached --check
git commit -m "feat: vendor paid NERV direct assets"
```

### Task 2: Build and lock the combined v5 + NERV instruction artifact

**Files:**
- Modify: `launcher-rs/scripts/test-paid-nerv-direct.ps1`
- Create: `assets/codex/nerv-break-5.6/combined-instructions.md`
- Modify: `assets/codex/nerv-break-5.6/SOURCE.json`
- Test: `launcher-rs/scripts/test-paid-nerv-direct.ps1`

**Interfaces:**
- Consumes: exact existing `assets/codex/gpt-5.6-instruct-v5/gpt-5.6-sol-unrestricted-v5.md` and exact NERV `bridge.md`.
- Produces: canonical UTF-8/LF `combined-instructions.md` and its SHA-256 in `SOURCE.json` for `CodexAdapter`.

- [ ] **Step 1: Extend the test for deterministic composition**

Require the combined file bytes to equal the UTF-8-no-BOM result of this exact composition, followed by exactly one LF:

```powershell
$expected = "# Wujin Codex combined instructions`n`n" +
    "## GPT-5.6 Instruct v5`n`n" +
    (($v5Text -replace "`r`n", "`n").TrimEnd("`n")) +
    "`n`n## NERV-BREAK-5.6 offline bridge`n`n" +
    (($bridgeText -replace "`r`n", "`n").TrimEnd("`n")) + "`n"
```

Require `SOURCE.json.combined.sha256` to match those bytes and reject BOM/CRLF.

- [ ] **Step 2: Run the test and witness RED**

Run the Task 1 command. Expected: non-zero exit identifying missing `combined-instructions.md` or missing `combined` source metadata.

- [ ] **Step 3: Generate the combined artifact and update the source record**

Read both inputs as UTF-8, normalize only line endings to LF, compose with the fixed headings above, write UTF-8 without BOM, calculate SHA-256, and store `{ filename, sha256 }` in `SOURCE.json.combined`.

- [ ] **Step 4: Run the test and witness GREEN**

Expected final line: `PAID NERV DIRECT SUPPLY CHAIN PASSED`.

- [ ] **Step 5: Commit the composition slice**

```powershell
git add -- launcher-rs/scripts/test-paid-nerv-direct.ps1 assets/codex/nerv-break-5.6/combined-instructions.md assets/codex/nerv-break-5.6/SOURCE.json
git diff --cached --check
git commit -m "feat: compose NERV and GPT-5.6 instructions"
```

### Task 3: Validate NERV assets and configure Codex atomically

**Files:**
- Modify: `launcher-rs/crates/wujin-core/src/clients/codex.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/one_click_deploy.rs`
- Test: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`
- Test: `launcher-rs/crates/wujin-core/tests/one_click_deploy.rs`

**Interfaces:**
- Consumes: `SOURCE.json`, `FILE-MANIFEST.json`, `combined-instructions.md`, `ROUTING.md`, and exact legacy v5 path.
- Produces: `validate_nerv_runtime(&Path) -> Result<NervRuntime, CoreError>`, where `NervRuntime` carries canonical combined-instruction and routing paths used by the Codex transaction.

- [ ] **Step 1: Add failing adapter behavior tests**

Add tests proving: a fresh config uses the combined path; the exact combined path is idempotent; the exact historical Wujin v5 path migrates automatically; a foreign path conflicts; explicit replacement still works; malformed manifest, path traversal in a manifest record, missing Skill, Skill hash mismatch, missing routing, and combined hash mismatch all fail with `Status::RolledBack`; successful `AGENTS.md` contains the exact absolute `ROUTING.md` path while retaining user text.

- [ ] **Step 2: Run the focused tests and witness RED**

```powershell
cargo test -p wujin-core --test client_adapters codex_ -- --nocapture
cargo test -p wujin-core --test one_click_deploy -- --nocapture
```

Expected: assertions fail because the adapter still points to `gpt-5.6-instruct-v5` and has no NERV route/manifest validation.

- [ ] **Step 3: Implement the minimal runtime validator and migration**

In `codex.rs`, deserialize the strict manifest, canonicalize each relative path under the NERV root, reject absolute/parent/reparse paths, require exact size and SHA-256, require the source-record combined hash to match the combined file, and return canonical paths. Render the standard Wujin managed block plus one absolute NERV routing reference before its existing end marker. Treat only the canonical legacy v5 path and the new combined path as Wujin-owned automatic migration values; keep the existing explicit repair option for all other strings.

- [ ] **Step 4: Run focused tests and witness GREEN**

Run both commands from Step 2. Expected: all tests pass with zero failures.

- [ ] **Step 5: Run the existing Codex rollback and deploy suites**

```powershell
cargo test -p wujin-core --test client_adapters -- --nocapture
cargo test -p wujin-core --test one_click_deploy -- --nocapture
cargo test -p wujin-core --test transaction_markdown -- --nocapture
```

Expected: all pass; no user-content or rollback regression.

- [ ] **Step 6: Commit the adapter slice**

```powershell
git add -- launcher-rs/crates/wujin-core/src/clients/codex.rs launcher-rs/crates/wujin-core/tests/client_adapters.rs launcher-rs/crates/wujin-core/tests/one_click_deploy.rs
git diff --cached --check
git commit -m "feat: activate paid NERV direct mode for Codex"
```

### Task 4: Enforce paid payload presence and free-bundle isolation

**Files:**
- Modify: `launcher-rs/crates/wujin-core/tests/release_contracts.rs`
- Modify: `launcher-rs/scripts/test-paid-nerv-direct.ps1`
- Modify: `launcher-rs/scripts/test-full-gate.ps1`
- Test: `launcher-rs/crates/wujin-core/tests/release_contracts.rs`
- Test: `launcher-rs/scripts/test-paid-nerv-direct.ps1`

**Interfaces:**
- Consumes: release staging ZIP arguments already used by `test-paid-codex-v5.ps1` and full-gate orchestration.
- Produces: paid ZIP presence/hash assertions and negative free ZIP marker assertions wired into every client full gate.

- [ ] **Step 1: Add failing release and isolation tests**

Require paid payload source/ZIP to contain all NERV allowlisted files with exact manifest hashes. Add NERV markers—repository, commit, asset directory, bridge hash, `combined-instructions.md`, `FILE-MANIFEST.json`, and every NERV Skill ID—to the forbidden free-bundle scan. Add a full-gate invocation of `test-paid-nerv-direct.ps1` adjacent to `test-paid-codex-v5.ps1`.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
cargo test -p wujin-core --test release_contracts -- --nocapture
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-paid-nerv-direct.ps1 -RequireFreeIsolation
```

Expected: release contract or wiring assertion fails before the new production/test integration is present.

- [ ] **Step 3: Complete the paid/free contract wiring**

Update release marker lists and full-gate invocation without changing free source/catalog generation. Reuse the existing ZIP path normalization and entry-byte hashing rules; do not introduce a second ZIP parser.

- [ ] **Step 4: Run focused tests and witness GREEN**

Run both commands from Step 2. Expected: `release_contracts` passes and the PowerShell test reports both `PAID NERV DIRECT PAYLOAD ZIP PASSED` when a paid ZIP is supplied by the gate and `FREE NERV DIRECT ISOLATION PASSED`.

- [ ] **Step 5: Commit the isolation slice**

```powershell
git add -- launcher-rs/crates/wujin-core/tests/release_contracts.rs launcher-rs/scripts/test-paid-nerv-direct.ps1 launcher-rs/scripts/test-full-gate.ps1
git diff --cached --check
git commit -m "test: enforce paid NERV bundle isolation"
```

### Task 5: Run compatibility and complete verification gates

**Files:**
- Modify only if verification exposes a task-scoped defect; add a failing regression test before each fix.
- Verify: all files committed by Tasks 1-4.

**Interfaces:**
- Consumes: the finished paid NERV direct integration.
- Produces: fresh test evidence for CDK compatibility, Rust quality, paid/free supply chains, UI compatibility, TypeScript, and Vite without creating a release package.

- [ ] **Step 1: Run formatting and static checks**

```powershell
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Run the controlled historical CDK compatibility test**

```powershell
$env:WUJIN_RELEASE_SECRETS = 'G:\AI\520reverse-skill\Wujin-release-secrets'
cargo test -p wujin-core --test license_compat -- --nocapture
Remove-Item Env:WUJIN_RELEASE_SECRETS
```

Expected: production fixture counts pass without printing CDK contents.

- [ ] **Step 3: Run the complete development gate**

```powershell
$env:WUJIN_RELEASE_SECRETS = 'G:\AI\520reverse-skill\Wujin-release-secrets'
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
Remove-Item Env:WUJIN_RELEASE_SECRETS
```

Expected: paid v5, paid NERV, free isolation, Rust fmt/clippy/tests, license compatibility, UI tests, TypeScript, and Vite all pass; no release EXE is built.

- [ ] **Step 4: Audit final scope and staged content**

```powershell
git status --short
git diff --stat 86c9400..HEAD
git diff --name-only 86c9400..HEAD | Select-String '^launcher-rs/ui/'
```

Expected: no implementation commit from this task changes `launcher-rs/ui/**`; pre-existing live UI modifications remain unstaged and untouched.

- [ ] **Step 5: Record final verification evidence**

Add a concise audit under `docs/testing/` containing commands, exit codes, test counts, pinned upstream commit, generated asset hashes, and the explicit statement `LOCAL DEVELOPMENT VERIFICATION; NO RELEASE PACKAGE BUILT`, then commit only that audit.
