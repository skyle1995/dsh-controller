# Wujin Windows Rust v1.30.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Windows-only Rust/Tauri `1.30.1` release, preserve existing CDK compatibility, add the pinned GPT-5.6 Instruct v5 asset only to the paid Codex configuration, add an activation-independent offline “强化环境配置” page, add an in-app bilingual disclaimer dialog, add safe update notifications, and hand the Rust source contract to the macOS developer.

**Architecture:** Keep `wujin-core` platform-neutral, keep Windows behavior in `wujin-windows`, and keep Tauri IPC thin. The existing paid `reverse-skill.zip` remains complete and gains one pinned Codex-only v5 asset that the CDK-gated `CodexAdapter` wires to `model_instructions_file` transactionally. Free Skills use a second embedded and independently verified `free-skills.zip`, a separate `%LOCALAPPDATA%\无限破甲\free-skills` state root, separate IPC/events, and client adapters that never touch CDK state or the paid reverse-skill transaction. The disclaimer is a UI-only accessible dialog with session-only state and no IPC, persistence, authorization, or workflow coupling. The updater is notification-only: it verifies a signed static manifest hosted by Cloudflare Pages and opens the existing official download page; it never downloads or installs a netdisk file.

**Tech Stack:** Rust workspace (edition 2024, rust-version 1.97), Tauri 2, React/Vite, Serde, ZIP/SHA-256, Ed25519, semantic-version comparison, PowerShell 5.1, Cargo tests, Node test runner, Cloudflare Pages static hosting.

## Global Constraints

- Product version is exactly `1.30.1`; current Rust/Tauri is `1.20.1`; legacy Python remains `1.1.0`.
- Product ID remains `wujin-reverse-skill`; historical `1.x` CDKs remain valid.
- Windows Rust/Tauri is the only implementation target. macOS code, Apple signing, DMG, and macOS CI are out of scope.
- Existing `Wujin-release-secrets` CDK files remain operational and unchanged. Their private key is never embedded in the client or payload.
- Update signing uses a separate Ed25519 key pair. The update private key stays outside both Git repositories.
- The customer binary contains only public keys and the embedded reverse-skill payload; never CDK CSV/TXT files or private keys.
- One-click configuration never installs, updates, downloads, or starts third-party tools.
- The paid Codex configuration vendors only `MDX-Tom/gpt-5.6-instruct` commit `014053fcd70677d2d392cc1cb4d2d14c03f41bb7` variant `v5`; it preserves every existing paid payload asset and is unreachable without valid CDK authorization.
- A non-Wujin `model_instructions_file` is user-owned and must return a conflict without overwrite. The v5 asset, source record, hashes, state, and configuration must never enter the free catalog, bundle, page, IPC, logs, or install root.
- “强化环境配置” is always reachable and never reads, writes, repairs, or infers CDK state.
- Free Skills are installed only from the embedded `free-skills.zip`; runtime GitHub, website, netdisk, package-manager, MCP, Python/npm, and toolchain access is forbidden.
- The free bundle contains exactly 11 approved Skill IDs and is installed under `%LOCALAPPDATA%\无限破甲\free-skills` with independent state, backup, logs, progress, and result data.
- Free and paid managed content use different files or the exact markers `BEGIN/END WUJIN FREE SKILLS` and `BEGIN/END WUJIN REVERSE-SKILL`; either flow must leave the other byte-for-byte unchanged.
- A pre-existing same-name Skill not recorded in `installed-state.json` is user-owned and must return `conflict`; it is never overwritten, merged, renamed, or deleted.
- Windows `1.30.1` supports free Skill install, idempotent repair, managed upgrade, cancellation, backup, and rollback; automatic uninstall is out of scope.
- The Help group contains an always-enabled “免责声明” entry that opens the exact approved bilingual text in an internal dialog; it never auto-opens, requests acceptance, records consent, navigates away, or changes paid/free/update state.
- After implementation and automated gates, launch the real local Rust/Tauri debug EXE for owner acceptance. The owner must be able to test every changed page, report UI defects or adjustment requests, receive a revised debug client, and repeat this acceptance loop until explicitly satisfied. Development launch and owner-directed UI adjustment are required; release packaging is forbidden until the owner explicitly says “出包”.
- Before that explicit approval, do not run `build-release.ps1`, `cargo build --release`, `cargo tauri build`, `cargo tauri bundle`, installer/signing commands, release-archive creation, or production website manifest publication.
- Do not use `git add -A`; preserve unrelated temporary directories.

## Update Boundary

The website repository is `G:\AI\GW\wujin-website-prototype`, a static Cloudflare Pages site with output directory `.` and production branch `main`.

- Manifest URL: `https://codexpojia.com/downloads/wujin/stable/latest.json`
- Detached signature: `https://codexpojia.com/downloads/wujin/stable/latest.json.sig`
- Download page: `https://codexpojia.com/#download`
- Release notes: `https://codexpojia.com/#a-updates`
- The website remains the download coordinator. Its buttons may point to Baidu, Quark, or Lanzou; the client never consumes those netdisk URLs directly.
- Cloudflare Pages serves the manifest as static files. No API server, database, Worker, login, or dynamic backend is required.
- A missing route currently falls back to homepage HTML and must be rejected. Production verification must prove that the deployed route returns JSON and detached signature bytes.
- `1.20.1` cannot prompt because it has no updater. The first automatic check is delivered in `1.30.1`; users on `1.20.1` upgrade manually once.
- Automatic download, installer replacement, updater rollback, and silent installation are deferred. Netdisk landing pages are not direct update packages.

Manifest contract:

```json
{
  "schema_version": 1,
  "product": "wujin-reverse-skill",
  "channel": "stable",
  "version": "1.30.1",
  "published_at": "2026-07-22T00:00:00Z",
  "download_page": "https://codexpojia.com/#download",
  "release_notes_url": "https://codexpojia.com/#a-updates"
}
```

## Free Environment Skills Boundary

The approved design is `docs/superpowers/specs/2026-07-22-free-environment-skills-design.md`. It is authoritative for product copy, conflict behavior, cancellation, rollback, catalog validation, client routing, and CDK isolation.

The embedded catalog contains exactly these IDs, in this order:

```text
frontend-design
skill-creator
ui-ux-pro-max
brainstorming
ppt-generation
grill-me
literature-review
scholar-evaluation
teach
article-writing
creative-ideation
```

The source-selection gate starts from the confirmed candidates below, then records the highest-star eligible Agent Skill at the time of vendoring. “Eligible” means a real `SKILL.md`, a redistributable license covering every bundled file, offline operation, and a complete directory that passes the bundle validator. If the highest-star result fails any gate, the audit records the rejection reason and selects the next eligible repository.

| Skill ID | First candidate |
|---|---|
| `frontend-design`, `skill-creator` | `anthropics/skills` |
| `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill` |
| `brainstorming` | `obra/superpowers` |
| `ppt-generation` | `fangyuanopus/literature-report-ppt-builder` |
| `grill-me`, `teach` | `mattpocock/skills` |
| `literature-review`, `scholar-evaluation` | `K-Dense-AI/claude-scientific-skills` |
| `article-writing` | `affaan-m/everything-claude-code` |
| `creative-ideation` | `yogsoth-ai/creative-ideation` |

Build/runtime resource split:

```text
reverse-skill.zip       paid reverse-skill payload; existing CDK-gated flow
free-skills.zip         exactly 11 offline Skills, catalog, source record, licenses
```

Runtime state split:

```text
%LOCALAPPDATA%\无限破甲\free-skills\
├── catalog.json
├── installed-state.json
├── skills\<skill-id>\...
├── backups\<client-id>\<timestamp>\...
└── staging\<operation-id>\...
```

Public IPC contracts:

```rust
get_free_skill_catalog() -> Result<FreeSkillCatalog, AppError>
install_free_skills(skill_ids: Vec<String>) -> Result<FreeSkillInstallSummary, AppError>
cancel_free_skill_install() -> Result<bool, AppError>
```

```text
event: free-skill-progress
busy flag: freeSkillsBusy
result status: installed | alreadyInstalled | updated | unsupported | conflict | failed | rolledBack
```

Client target policy:

| Client | Verified target strategy for `1.30.1` |
|---|---|
| Claude | Native complete directories at `%USERPROFILE%\.claude\skills\<skill-id>` |
| Codex | Native complete directories at `%USERPROFILE%\.codex\skills\<skill-id>` |
| Kiro | Skills remain under the free root; write only `.kiro\steering\wujin-free-skills.md` with Kiro frontmatter and free markers |
| Cursor | Skills remain under the free root; write only `.cursor\rules\wujin-free-skills.mdc` with Cursor frontmatter and free markers |
| Cline | Skills remain under the free root; write only `Documents\Cline\Rules\wujin-free-skills.md` with free markers |
| Windsurf | Skills remain under the free root; merge only the free-marker block in `.codeium\windsurf\memories\global_rules.md` |

Every adapter reuses existing detection evidence. A missing client, unreadable version, or unverified target returns `unsupported` and does not create a client directory. Paid MCP files are never opened by the free installer.

## Disclaimer Dialog Boundary

The approved design is `docs/superpowers/specs/2026-07-22-disclaimer-dialog-design.md`. It is authoritative for placement, exact copy, non-persistence, keyboard behavior, focus return, scroll behavior, and isolation.

- Add one “免责声明” button after “运行日志” in the existing Help group.
- The button is never disabled by client selection, CDK, paid `busy`, `freeSkillsBusy`, update state, or connectivity.
- Clicking it opens `DisclaimerDialog` without changing `UiState.page` or invoking Tauri.
- The dialog does not auto-open, require a checkbox/acceptance, write storage/logs, or add a network request.
- Close paths are “我知道了”, the labeled close button, and `Escape`; backdrop clicks do not close it.
- The dialog traps focus, restores focus to the Help entry, exposes dialog ARIA relationships, and keeps the body scrollable inside the fixed `1120 × 720` window.
- The visible title and six body paragraphs must match the approved design verbatim; the source ASCII separator lines are represented by layout spacing, not displayed characters.

## Development Run and Packaging Gate

The normal completion path for implementation stops at a locally running debug client:

```text
resolved Node.js + node_modules/vite/bin/vite.js (hidden helper on 127.0.0.1:1420)
        ↓
temporary free-skills.zip + WUJIN_FREE_SKILLS_PATH
        ↓
cargo run -p wujin-launcher
        ↓
launcher-rs\target\debug\wujin-launcher.exe (visible local test client)
```

- The developer must launch this client after Tasks 0–11 and the non-packaging gates pass.
- Set `WUJIN_SOURCE_ROOT` to the resolved root of the current checkout/worktree so configuration tests use the code under test rather than another checkout.
- Set `WUJIN_ALLOW_DEVELOPMENT=1` only for this debug process; clear it when the client closes.
- Build `free-skills.zip` into an ignored temporary development directory, set `WUJIN_FREE_SKILLS_PATH` for the debug Cargo process, and remove both in `finally`; this resource is required to test the free Skill page and is not a release package.
- Resolve Node.js from PATH first, then from the Codex bundled runtime under `%USERPROFILE%\.cache\codex-runtimes`; invoke the checked-in Vite CLI directly because this workstation has Node but no global `npm.cmd`.
- The Vite helper is hidden and terminated in `finally`; the Tauri window remains visible for owner testing.
- Closing the local test client is not permission to package.
- “完成开发”, “测试通过”, “启动测试版”, or “给我看看” are not packaging approval. Only an explicit owner instruction containing “出包” unlocks Task 13.
- Before approval, `dist-rust` and installer output must remain unchanged. Temporary debug binaries under `launcher-rs\target\debug` and temporary test resources are allowed and are not release artifacts.
- The local development launch does not push website metadata, sign an installer, create a customer ZIP, or upload any executable.

## Task 0: Freeze Version and Public Contracts

**Files:** `launcher-rs/src-tauri/tauri.conf.json`, `launcher-rs/src-tauri/Cargo.toml`, `launcher-rs/ui/package.json`, `launcher-rs/ui/src/main.tsx`, `launcher-rs/ui/src/api.ts`, UI version tests, and `launcher-rs/crates/wujin-core/tests/license_compat.rs`.

- [ ] Record every `1.20.1`, `1.1.0`, and version surface before editing.
- [ ] Set every Rust/Tauri/UI/release-report surface to `1.30.1`; keep Python at `1.1.0`.
- [ ] Expose `appVersion` from Rust bootstrap state and render it in the title bar instead of hard-coding another value.
- [ ] Add failing tests for exact version agreement and legacy Python compatibility before implementation.
- [ ] Keep WJP1 canonical JSON, Ed25519 verification, product ID, `1.x` CDKs, and activation-cache behavior unchanged.
- [ ] Commit: `chore: freeze wujin windows v1.30.1 contract`.

## Task 1: Preserve Core, Windows, and Client Configuration Behavior

**Files:** `launcher-rs/crates/wujin-core/**`, `launcher-rs/crates/wujin-windows/**`, and their existing integration tests.

- [ ] Preserve valid, forged, truncated, oversized, wrong-product, wrong-version, expired, clock-rollback, tampered-cache, path-traversal, symlink, backup-restore, readback-failure, and selected-only tests.
- [ ] Verify all production CSV/TXT CDK material through `WUJIN_RELEASE_SECRETS` without printing token contents.
- [ ] Keep USERPROFILE/APPDATA/LOCALAPPDATA elevation behavior, ReplaceFileW/MoveFileExW, HTTPS-only links, WebView2 checks, and PowerShell quoting behavior.
- [ ] Keep JSON/TOML parser-based merges, managed Markdown markers, version gates, backups, atomic writes, readback, and rollback.
- [ ] Run Rust formatting, clippy, workspace tests, and production-material tests.
- [ ] Commit: `test: preserve rust core and windows safety contracts`.

## Task 2: Make Configuration Pages Reachable Before Activation

**Files:** `launcher-rs/ui/src/state/app-state.ts`, `launcher-rs/ui/src/components/Sidebar.tsx`, `launcher-rs/ui/src/pages/ConfigurePage.tsx`, `launcher-rs/ui/src/pages/ResultPage.tsx`, `launcher-rs/ui/src/main.tsx`, and UI tests.

- [ ] Add `configurationBlocker(state): "noClients" | "notActivated" | null`.
- [ ] Allow “一键配置” and “配置结果” navigation before CDK activation and before any result exists.
- [ ] On start configuration, show an accessible dialog for no clients or inactive CDK, then navigate to the appropriate page without calling the backend.
- [ ] Call `configure_selected(ids)` only when clients are selected and authorization is active.
- [ ] Empty result page keeps the yellow warning, displays “尚未执行一键配置”, hides the empty table, and offers return to “一键配置”.
- [ ] Dialogs support cancel, Escape, focus handling, `role="dialog"`, and `aria-modal="true"`.
- [ ] Commit: `feat: allow safe pre-activation configuration navigation`.

## Task 3: Implement Notification-Only Signed Update Checks

**Files:** create `launcher-rs/crates/wujin-update/`; modify Tauri `main.rs`, `commands.rs`, `state.rs`, `build.rs`, and `Cargo.toml`; add `launcher-rs/ui/src/pages/UpdatePage.tsx` and update UI state/API/tests.

Public result type:

```ts
type UpdateStatus = "checking" | "upToDate" | "available" | "failed";
type UpdateCheckResult = {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  publishedAt?: string;
  downloadPage?: string;
  releaseNotesUrl?: string;
  message?: string;
};
```

- [ ] Add `check_for_update(manual: bool)` Tauri command and `checkForUpdate(manual)` UI wrapper.
- [ ] Fetch manifest and `.sig` over HTTPS with an 8-second timeout, bounded response size, same-host redirect policy, and no credential forwarding.
- [ ] Verify detached Ed25519 signature before parsing fields; reject unknown fields, wrong product/channel, invalid timestamp, non-HTTPS URLs, and non-allowlisted hosts.
- [ ] Compare versions semantically; do not prompt for same-version or downgrade manifests.
- [ ] Run one asynchronous check after bootstrap and expose a manual “检查更新” help entry. Startup failures are silent; manual failures are visible and retryable.
- [ ] Show an accessible “发现新版本” dialog with “前往官网下载”, “查看更新内容”, and “稍后”. Open links through the existing HTTPS link guard.
- [ ] Do not add package download, installer execution, UAC update replacement, or CDK gating.
- [ ] Test valid signature, tampered bytes, HTML fallback, timeout, offline mode, redirect escape, wrong product, invalid version, same version, downgrade, and activation-independent checks.
- [ ] Commit: `feat: add signed static update notification`.

## Task 4: Synchronize Links, Context, and macOS Handoff Documentation

**Files:** `launcher/config/links.json`, Rust/Python parity tests, `PROJECT_CONTEXT.md`, and `Wujin-release-secrets/MACOS_DEVELOPMENT_VALIDATION.md`.

- [ ] Set `docs` to `https://codexpojia.com/%E5%9F%B9%E8%AE%AD%E6%96%87%E6%A1%88` and update all assertions.
- [ ] Document exact `1.30.1`, the Cloudflare manifest route, netdisk boundary, update-key separation, and macOS source handoff.
- [ ] Keep the macOS guide as a source-contract document only; do not claim a macOS client exists in this release.
- [ ] Commit: `docs: record v1.30.1 context and update boundary`.

## Task 5: Add Cloudflare Static Release Metadata

**Repository:** `G:\AI\GW\wujin-website-prototype`.

- [ ] Add `downloads/wujin/stable/latest.json` and `latest.json.sig` to the static site.
- [ ] Add cache and MIME headers; use `no-cache, must-revalidate` so releases are not hidden by long-lived edge caching.
- [ ] Keep the existing `#download` modal and netdisk URLs; add the `1.30.1` update-log record.
- [ ] Create an offline signing script that reads the update private key from outside both repositories and writes deterministic JSON plus detached signature.
- [ ] Publish the manifest only after all netdisk links are tested. Cloudflare Pages deployment is the only hosting step.
- [ ] Verify production manifest JSON, signature availability, HTTPS, and signature validity with the embedded public key.
- [ ] Commit and push website changes to its `main` independently of the Rust repository.

## Task 5A: Vendor and Wire Paid Codex GPT-5.6 Instruct v5

**Files:**
- Create: `assets/codex/gpt-5.6-instruct-v5/gpt-5.6-sol-unrestricted-v5.md`
- Create: `assets/codex/gpt-5.6-instruct-v5/LICENSE-MIT.txt`
- Create: `assets/codex/gpt-5.6-instruct-v5/SOURCE.json`
- Create: `launcher-rs/scripts/test-paid-codex-v5.ps1`
- Modify: `launcher-rs/crates/wujin-core/src/clients/codex.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/client_adapters.rs`
- Modify: `launcher-rs/crates/wujin-core/tests/one_click_deploy.rs`
- Create: `launcher-rs/crates/wujin-core/tests/release_contracts.rs`
- Modify: `launcher-rs/scripts/test-full-gate.ps1`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: the existing CDK-gated `configure_selected(ids)`, `ConfiguratorService`, paid `reverse-skill.zip`, `AtomicFileTransaction`, `CodexAdapter`, and the exact contract in `docs/superpowers/specs/2026-07-22-paid-codex-gpt-5.6-v5-design.md`.
- Produces: a paid-only `CodexAdapter` configuration of top-level TOML `model_instructions_file` to the exact deployed v5 Markdown path; no new Tauri command, UI page, free catalog item, network installer, or executable script.

Use these exact supply-chain values:

```text
repository = https://github.com/MDX-Tom/gpt-5.6-instruct.git
commit = 014053fcd70677d2d392cc1cb4d2d14c03f41bb7
variant = v5
archive = gpt-5.6-sol-unrestricted-v5.zip
archive_sha256 = E55293314A3F789D7D19CDA22D60E2D5BE306B850A9C17A015A836943B691AFB
runtime_file = gpt-5.6-sol-unrestricted-v5.md
runtime_sha256 = 02C018E5FAC85500D4EB17904769A32B8B22971499C7F94E9CCC8BD6CC9E9104
license = MIT
license_sha256 = 0323ADA93559CAEAA847315FD7BA5F15D6BBAFEC9EFE346F13771AC72385D6E8
```

- [ ] **Step 1: Write the failing paid-v5 supply-chain and isolation test.**

Create `test-paid-codex-v5.ps1` to parse `SOURCE.json`, require every exact value above, hash the vendored runtime and license files, and fail if `.git`, Python files, ZIP files, Actions, images, evaluation fixtures, `v35`, or any file outside the three-file allowlist exists under `assets/codex/gpt-5.6-instruct-v5`. The same test must inspect the free catalog/source tree and built test free bundle, when present, and reject the repository name, commit, variant path, runtime filename, or either v5 hash.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-paid-codex-v5.ps1
```

Expected: FAIL because the paid v5 source record and runtime files do not exist.

- [ ] **Step 2: Vendor only the approved runtime file, license, and immutable source record.**

Copy the audited `gpt-5.6-sol-unrestricted-v5.md` bytes from commit `014053fcd70677d2d392cc1cb4d2d14c03f41bb7`, copy the upstream MIT license verbatim to `LICENSE-MIT.txt`, and write `SOURCE.json` as strict UTF-8 JSON containing only the exact repository, commit, variant, filenames, hashes, and license identity above. Do not copy either upstream ZIP, `.git`, README, Python, workflow, docs, image, script, or evaluation file. Do not edit the runtime Markdown.

Re-run `test-paid-codex-v5.ps1`.

Expected: PASS and print `PAID CODEX V5 SUPPLY CHAIN PASSED`.

- [ ] **Step 3: Write failing Codex TOML behavior tests.**

Extend `client_adapters.rs` with executable cases for:

1. absent `model_instructions_file` inserts the exact absolute deployed paid v5 path;
2. exact expected path is idempotent;
3. any other string is a conflict and leaves `config.toml` byte-for-byte unchanged;
4. a non-string value is rejected without rewrite;
5. missing or hash-mismatched deployed v5 Markdown fails closed;
6. comments, unrelated TOML, user MCP entries, existing Wujin MCP entries, and `AGENTS.md` remain valid;
7. a forced failure after the earlier rules write restores every Codex file committed in the call.

Run:

```powershell
cd launcher-rs
cargo test -p wujin-core --test client_adapters codex_
```

Expected: the new cases FAIL because `CodexAdapter` does not yet validate or configure the v5 model instructions.

- [ ] **Step 4: Extend the existing Codex transaction with strict v5 validation.**

In `codex.rs`, resolve only:

```text
<skill_root>\assets\codex\gpt-5.6-instruct-v5\gpt-5.6-sol-unrestricted-v5.md
```

Before any Codex commit, require a regular file and canonical-LF SHA-256 `02C018E5FAC85500D4EB17904769A32B8B22971499C7F94E9CCC8BD6CC9E9104`. Merge top-level `model_instructions_file` into the same `DocumentMut` used for the existing MCP update. Treat absent/exact/foreign/non-string values exactly as the design specifies. Commit the combined TOML once, validate the exact path and existing MCP values on readback, and keep all rule/TOML records in the existing reverse-order rollback list. Never execute or log the Markdown content.

Re-run the Step 3 command.

Expected: every new Codex test passes and the pre-existing adapter tests remain green.

- [ ] **Step 5: Prove the CDK gate and old paid/free behavior remain intact.**

Extend `one_click_deploy.rs` and `release_contracts.rs` so that:

- no CDK, expired CDK, corrupt cache, and clock rollback reject before `ConfiguratorService` can touch the v5 path;
- authorized Codex configuration includes v5 while authorized non-Codex adapters keep their previous outputs;
- paid deployment still contains existing sentinels `RULES.md`, `README_AI.md`, `skills/`, and `burp-mcp-full/` in addition to the three v5 files;
- adding v5 never turns `reverse-skill.zip` into a v5-only payload;
- the free page/catalog/bundle/install command never mentions or writes v5 or `model_instructions_file`.

Run:

```powershell
cd launcher-rs
cargo test -p wujin-core --test one_click_deploy --test release_contracts --test client_adapters
```

Expected: paid compatibility, authorization failure, conflict preservation, rollback, and free isolation all pass.

- [ ] **Step 6: Add the new contract test to the non-packaging full gate and document it.**

Call `test-paid-codex-v5.ps1` from `test-full-gate.ps1` before any optional release build. Update `PROJECT_CONTEXT.md` with the pinned source values, paid-only path, `model_instructions_file` conflict rule, unchanged existing paid content, and free isolation. The full gate must still require `-SkipReleaseBuild` during development.

- [ ] **Step 7: Run the complete debug-only verification and commit.**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-paid-codex-v5.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
git diff --check
git add -- assets/codex/gpt-5.6-instruct-v5 launcher-rs/crates/wujin-core/src/clients/codex.rs launcher-rs/crates/wujin-core/tests/client_adapters.rs launcher-rs/crates/wujin-core/tests/one_click_deploy.rs launcher-rs/crates/wujin-core/tests/release_contracts.rs launcher-rs/scripts/test-paid-codex-v5.ps1 launcher-rs/scripts/test-full-gate.ps1 PROJECT_CONTEXT.md
git commit -m "feat: add paid codex gpt-5.6 v5 instructions"
```

Expected: all Rust/UI/security/parity gates pass without release build, packaging, signing, publication, or EXE upload.

## Task 6: Audit, Pin, and Vendor the 11 Free Skills

**Files:**
- Create: `launcher-rs/free-skills/catalog.source.json`
- Create: `launcher-rs/free-skills/upstreams.lock.json`
- Create: `launcher-rs/free-skills/vendor/<skill-id>/**`
- Create: `launcher-rs/free-skills/licenses/<repository>.LICENSE`
- Create: `launcher-rs/free-skills/THIRD_PARTY_NOTICES.md`
- Create: `launcher-rs/scripts/sync-free-skills.ps1`
- Create: `launcher-rs/scripts/build-free-skills.ps1`
- Create: `launcher-rs/scripts/test-free-skills-bundle.ps1`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the 11 IDs and first candidates in “Free Environment Skills Boundary”.
- Produces: reviewed, complete Skill directories plus a lock file consumed only by the deterministic bundle builder.

- [ ] **Step 1: Write the source-selection and lock schemas before fetching content.**

`catalog.source.json` contains customer-facing copy only; `upstreams.lock.json` contains repository provenance. Each lock entry has this exact shape:

```json
{
  "id": "frontend-design",
  "repository": "anthropics/skills",
  "subdirectory": "skills/frontend-design",
  "commit": "40 lowercase hexadecimal characters",
  "license": "SPDX identifier or LicenseRef-<name>",
  "licenseFile": "licenses/anthropics-skills.LICENSE",
  "starsAtReview": 0,
  "reviewedAt": "RFC 3339 UTC timestamp",
  "sourceTreeSha256": "64 lowercase hexadecimal characters",
  "locallyAdapted": false,
  "rejectedCandidates": []
}
```

The final file must contain exactly 11 unique entries. `starsAtReview` is the value observed during the audit, not a runtime dependency; `rejectedCandidates` records repository, observed stars, and a concrete rejection reason.

- [ ] **Step 2: Implement the verifier first and prove an incomplete fixture fails.**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-free-skills-bundle.ps1 -Fixture incomplete
```

Expected: non-zero exit with `SKILL.md is missing`, `license is missing`, or `catalog IDs do not match the approved set`.

- [ ] **Step 3: Audit GitHub candidates and pin immutable commits.**

For each ID, compare same-name public Agent Skill implementations by GitHub stars, reject non-Skill repositories and repositories without redistribution rights, resolve the selected repository to a full 40-character commit, copy the complete directory, and preserve every required `agents/`, `scripts/`, `references/`, `assets/`, and attribution file. Do not copy `.git`, caches, generated examples, credentials, or unrelated monorepo directories.

Run after each vendored Skill:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\sync-free-skills.ps1 -VerifyOnly -SkillId frontend-design
```

Expected: `PASS frontend-design: pinned source, license, SKILL.md, paths, and tree hash verified`.

- [ ] **Step 4: Build `free-skills.zip` deterministically.**

`build-free-skills.ps1` must sort entries by normalized `/` path, set every ZIP timestamp to `1980-01-01T00:00:00Z`, reject duplicate/case-folded paths and symlinks, and generate `catalog.json` inside the archive. Each catalog Skill contains `id`, `displayName`, `summary`, `category`, `repository`, `subdirectory`, `commit`, `license`, `relativePath`, `treeSha256`, and a sorted `files` array of `{relativePath, bytes, sha256}`.

Run twice:

```powershell
$a = launcher-rs\src-tauri\resources\free-skills-a.zip
$b = launcher-rs\src-tauri\resources\free-skills-b.zip
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\build-free-skills.ps1 -Output $a
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\build-free-skills.ps1 -Output $b
if ((Get-FileHash $a).Hash -ne (Get-FileHash $b).Hash) { throw 'free bundle is not deterministic' }
```

Expected: both SHA-256 values are identical and the verifier reports exactly 11 Skills.

- [ ] **Step 5: Run the clean-source and redistribution gate.**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-free-skills-bundle.ps1 -Bundle launcher-rs\src-tauri\resources\free-skills-a.zip
```

Expected: `FREE SKILLS BUNDLE PASSED: 11 skills, licenses present, no forbidden entries` and zero matches for `.git`, private keys, tokens, absolute source paths, caches, or missing catalog files.

- [ ] **Step 6: Commit only the reviewed source inputs and scripts.**

```powershell
git add -- .gitignore launcher-rs/free-skills launcher-rs/scripts/sync-free-skills.ps1 launcher-rs/scripts/build-free-skills.ps1 launcher-rs/scripts/test-free-skills-bundle.ps1
git commit -m "build: vendor approved free skills"
```

Do not commit the temporary `free-skills-a.zip` or `free-skills-b.zip`.

## Task 7: Add Strict Free-Skill Catalog and Bundle Validation

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/free_skills/mod.rs`
- Create: `launcher-rs/crates/wujin-core/src/free_skills/models.rs`
- Create: `launcher-rs/crates/wujin-core/src/free_skills/catalog.rs`
- Create: `launcher-rs/crates/wujin-core/src/free_skills/bundle.rs`
- Create: `launcher-rs/crates/wujin-core/tests/free_skill_catalog.rs`
- Create: `launcher-rs/crates/wujin-core/tests/free_skill_bundle.rs`
- Modify: `launcher-rs/crates/wujin-core/src/lib.rs`

**Interfaces:**
- Consumes: bytes generated by `build-free-skills.ps1`.
- Produces: `FreeSkillBundle::from_zip_bytes(bytes)` and the serializable catalog/result types used by the installer and Tauri.

Use these exact public contracts:

```rust
pub const APPROVED_FREE_SKILL_IDS: [&str; 11];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FreeSkillCatalog {
    pub schema_version: u32,
    pub bundle_version: String,
    pub skills: Vec<FreeSkillDescriptor>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FreeSkillInstallStatus {
    Installed,
    AlreadyInstalled,
    Updated,
    Unsupported,
    Conflict,
    Failed,
    RolledBack,
}

pub struct FreeSkillBundle {
    catalog: FreeSkillCatalog,
    entries: BTreeMap<String, Vec<u8>>,
}
impl FreeSkillBundle {
    pub fn from_zip_bytes(bytes: &[u8]) -> Result<Self, CoreError>;
    pub fn catalog(&self) -> &FreeSkillCatalog;
    pub fn extract_selected(&self, ids: &[String], staging: &Path) -> Result<(), CoreError>;
}
```

- [ ] **Step 1: Write failing catalog tests.**

Cover exact 11-ID equality and order, duplicate IDs, unknown fields, invalid category, absolute or `..` relative paths, malformed commit/license/hash, duplicate file paths after Windows case folding, and IDs outside `APPROVED_FREE_SKILL_IDS`.

Run:

```powershell
cd launcher-rs
cargo test -p wujin-core --test free_skill_catalog
```

Expected: FAIL because `free_skills` and `FreeSkillCatalog` do not exist.

- [ ] **Step 2: Implement strict models and catalog validation.**

Allowed categories are exactly `design`, `creative`, `contentPresentation`, `research`, and `capabilityBuilding`. Require `schemaVersion == 1`, `bundleVersion == "1.30.1"`, sorted file lists, lowercase SHA-256, relative `/` paths, non-empty customer copy, and an exact one-to-one match with the approved IDs.

- [ ] **Step 3: Write failing hostile-ZIP tests.**

Construct in-memory ZIPs for traversal, absolute paths, symlinks, duplicate names, duplicate case-folded names, undeclared files, missing declared files, altered bytes, a second `catalog.json`, and oversized entry/count limits.

Run:

```powershell
cargo test -p wujin-core --test free_skill_bundle
```

Expected: FAIL before `FreeSkillBundle` is implemented.

- [ ] **Step 4: Implement bounded extraction and hash verification.**

Accept only `catalog.json`, `source-record.json`, `licenses/**`, and `skills/<approved-id>/**`; reject symlinks and any entry not declared in the catalog; cap the archive at 10,000 entries and 256 MiB uncompressed; verify byte count and SHA-256 before writing; ensure each selected directory contains a regular `SKILL.md`.

- [ ] **Step 5: Run focused tests and commit.**

```powershell
cargo test -p wujin-core --test free_skill_catalog --test free_skill_bundle
git add -- launcher-rs/crates/wujin-core/src/free_skills launcher-rs/crates/wujin-core/src/lib.rs launcher-rs/crates/wujin-core/tests/free_skill_catalog.rs launcher-rs/crates/wujin-core/tests/free_skill_bundle.rs
git commit -m "feat: validate embedded free skill bundle"
```

Expected: all catalog and hostile-ZIP tests pass.

## Task 8: Implement Transactional Free-Skill Installation and Client Adapters

**Files:**
- Create: `launcher-rs/crates/wujin-core/src/free_skills/state.rs`
- Create: `launcher-rs/crates/wujin-core/src/free_skills/managed_markdown.rs`
- Create: `launcher-rs/crates/wujin-core/src/free_skills/transaction.rs`
- Create: `launcher-rs/crates/wujin-core/src/free_skills/adapters.rs`
- Create: `launcher-rs/crates/wujin-core/src/free_skills/service.rs`
- Create: `launcher-rs/crates/wujin-core/tests/free_skill_install.rs`
- Create: `launcher-rs/crates/wujin-core/tests/free_skill_isolation.rs`
- Modify: `launcher-rs/crates/wujin-core/src/free_skills/mod.rs`

**Interfaces:**
- Consumes: `FreeSkillBundle`, `ClientRegistry::detect_clients()`, the free root, user profile, and a cancellation callback.
- Produces: `FreeSkillService::catalog()` and `FreeSkillService::install()` without accepting arbitrary paths from UI/Tauri.

```rust
pub struct FreeSkillInstallRequest { pub skill_ids: Vec<String> }
pub struct FreeSkillInstallResult {
    pub skill_id: String,
    pub client_id: String,
    pub status: FreeSkillInstallStatus,
    pub target: Option<PathBuf>,
    pub backup: Option<PathBuf>,
    pub message: String,
}
pub struct FreeSkillLogEntry {
    pub phase: String,
    pub operation: String,
    pub skill_id: Option<String>,
    pub client_id: Option<String>,
    pub target: Option<PathBuf>,
    pub status: Option<FreeSkillInstallStatus>,
    pub message: String,
}
pub struct FreeSkillInstallSummary {
    pub results: Vec<FreeSkillInstallResult>,
    pub logs: Vec<FreeSkillLogEntry>,
    pub complete: bool,
}

impl FreeSkillService {
    pub fn catalog(&self) -> &FreeSkillCatalog;
    pub fn install<F, C>(
        &self,
        request: FreeSkillInstallRequest,
        progress: F,
        cancelled: C,
    ) -> Result<FreeSkillInstallSummary, CoreError>
    where
        F: FnMut(FreeSkillProgress),
        C: Fn() -> bool;
}
```

- [ ] **Step 1: Write failing ownership, idempotency, and rollback tests.**

Use temporary USERPROFILE/free roots and fixtures for: first install, same hash `alreadyInstalled`, managed hash change `updated`, user-owned same-name `conflict`, route-file backup, native-directory backup, readback failure `rolledBack`, partial success, cancellation between units, and cancellation during commit. Assert a failed unit rolls back only that Skill/client pair.

Run:

```powershell
cd launcher-rs
cargo test -p wujin-core --test free_skill_install
```

Expected: FAIL because `FreeSkillService` is not implemented.

- [ ] **Step 2: Implement independent ownership state.**

Write `%LOCALAPPDATA%\无限破甲\free-skills\installed-state.json` only after successful readback. Each record contains `skillId`, `bundleVersion`, `sourceSha256`, `clientId`, `targetPath`, `backupPath`, `installedAt`, and `readbackSha256`. Parse with `deny_unknown_fields`; reject duplicate ownership keys and paths outside the free root, known native Skill roots, or the exact verified route files.

- [ ] **Step 3: Implement directory and route transactions.**

For native directories, copy into a sibling staging directory, verify every catalog file, rename the Wujin-owned old directory into the free backup root, rename staging into place, then read back every file. For route files, use a free-only block:

```text
<!-- BEGIN WUJIN FREE SKILLS -->
# Wujin optional environment skills
- `<absolute free root>\skills\<selected-id>\SKILL.md`
<!-- END WUJIN FREE SKILLS -->
```

The merger accepts zero or one free block, rejects malformed/duplicate free markers, and treats the paid marker block as opaque bytes. Restore the backup or remove a first-created target on validator failure.

- [ ] **Step 4: Implement the six adapter targets exactly as specified.**

Claude/Codex receive complete selected directories. Kiro/Cursor/Cline/Windsurf receive only a route update and keep the complete Skill under the free root. Kiro and Cursor render their required frontmatter. Reuse detection evidence and return `unsupported` without creating directories when the client is absent or the target is not verified. Never open any MCP path.

- [ ] **Step 5: Implement orchestration and cancellation.**

Validate all requested IDs before any write, reject empty/duplicate selections, validate and stage the embedded bundle, redetect all six clients, then process deterministic `skill_ids × ClientId::ALL` units. Check cancellation before starting every unit. Once a transaction begins, finish commit+readback or rollback before returning; preserve earlier successful units and report remaining units as not started through progress rather than inventing result rows.

- [ ] **Step 6: Prove free/paid byte isolation.**

In `free_skill_isolation.rs`, seed files containing both markers, run free install twice, and assert the paid block, paid backup directory, activation files, paid `ClientResult`, and MCP JSON/TOML bytes are unchanged. Then run a paid managed-block merge and assert free bytes remain unchanged.

Run:

```powershell
cargo test -p wujin-core --test free_skill_install --test free_skill_isolation
```

Expected: all transactional and isolation cases pass.

- [ ] **Step 7: Commit.**

```powershell
git add -- launcher-rs/crates/wujin-core/src/free_skills launcher-rs/crates/wujin-core/tests/free_skill_install.rs launcher-rs/crates/wujin-core/tests/free_skill_isolation.rs
git commit -m "feat: install free skills transactionally"
```

## Task 9: Wire Windows Paths, Embedded Resource, Tauri IPC, and Progress

**Files:**
- Modify: `launcher-rs/crates/wujin-windows/src/paths.rs`
- Modify: `launcher-rs/src-tauri/build.rs`
- Modify: `launcher-rs/src-tauri/src/main.rs`
- Modify: `launcher-rs/src-tauri/src/state.rs`
- Modify: `launcher-rs/src-tauri/src/events.rs`
- Modify: `launcher-rs/src-tauri/src/commands.rs`
- Modify: `launcher-rs/scripts/build-release.ps1`
- Modify: `launcher-rs/scripts/test-full-gate.ps1`

**Interfaces:**
- Consumes: `WUJIN_FREE_SKILLS_PATH` at build time and `FreeSkillService` at runtime.
- Produces: the three public commands and the `free-skill-progress` event without changing `configure_selected`.

- [ ] **Step 1: Write failing path and command-contract tests.**

Add path assertions for `free_skill_root == app_root.join("free-skills")`. Add serialization tests proving camelCase fields and exact statuses. Add source-level regression assertions that all three commands are registered and `free-skill-progress` is distinct from `configuration-progress`.

Run:

```powershell
cd launcher-rs
cargo test -p wujin-windows paths::tests::derives_product_paths_from_original_user_roots
cargo test -p wujin-launcher command_response_contracts_use_camel_case
```

Expected: FAIL until the new path and contracts exist.

- [ ] **Step 2: Embed `free-skills.zip` independently.**

`build.rs` reads `WUJIN_FREE_SKILLS_PATH`, writes `OUT_DIR/free-skills.zip`, emits `cargo:rerun-if-env-changed=WUJIN_FREE_SKILLS_PATH`, and fails a release build if the resource is empty. `main.rs` uses a separate `EMBEDDED_FREE_SKILLS` constant. Do not append the free archive to `reverse-skill.zip`.

- [ ] **Step 3: Add isolated runtime state.**

Add `embedded_free_skills: Option<Vec<u8>>`, `free_skills_busy: AtomicBool`, `free_skills_cancel: AtomicBool`, `free_skill_results: Mutex<Vec<FreeSkillInstallResult>>`, and `free_skill_logs: Mutex<Vec<FreeSkillLogEntry>>` to `AppStateInner`. Keep existing `busy`, `selected`, `results`, `logs`, `activation_store`, and `activation_record` untouched. Construct `FreeSkillService` from embedded bytes and `paths.free_skill_root`; its constructor has no activation argument.

- [ ] **Step 4: Add IPC and progress/cancel behavior.**

`get_free_skill_catalog()` validates and returns the embedded catalog even with no CDK. `install_free_skills(skill_ids)` acquires only `free_skills_busy`, resets only `free_skills_cancel`, executes on `spawn_blocking`, emits `{phase, skillId, clientId, completed, total, message, cancellable}` on `free-skill-progress`, and stores only free results/logs. Every free log uses a `freeSkill.*` phase and never enters the paid `logs` vector. `cancel_free_skill_install()` sets the free cancel flag only when a free operation is busy. A simultaneous paid operation is allowed because the state and target files do not overlap.

- [ ] **Step 5: Add release-script resource lifecycle.**

`build-release.ps1` requires both the CDK public key and a separate update-signing public key, rejects missing/invalid/same-key input, assigns `WUJIN_UPDATE_PUBLIC_KEY_PATH`, and removes it in `finally`. It also invokes `build-free-skills.ps1`, assigns `WUJIN_FREE_SKILLS_PATH`, adds `freeSkillsSha256`, `freeSkillsBytes`, and 11-entry catalog evidence to `release-report.json`/`size-report.json`, and removes the environment variable and temporary archive in `finally`. `test-full-gate.ps1` enforces the same two-key contract and builds the same resource before a raw release candidate.

- [ ] **Step 6: Verify CDK-independent IPC and commit.**

```powershell
cd launcher-rs
cargo test -p wujin-launcher
cargo test -p wujin-core --test license_compat --test free_skill_isolation
git add -- launcher-rs/crates/wujin-windows/src/paths.rs launcher-rs/src-tauri launcher-rs/scripts/build-release.ps1 launcher-rs/scripts/test-full-gate.ps1
git commit -m "feat: expose isolated free skill installer ipc"
```

Expected: catalog/install tests pass for no CDK, expired CDK, corrupt CDK cache, and active CDK; paid `configure_selected` remains rejected without authorization.

## Task 10: Build the “强化环境配置” Page

**Files:**
- Modify: `launcher-rs/ui/src/api.ts`
- Modify: `launcher-rs/ui/src/state/app-state.ts`
- Modify: `launcher-rs/ui/src/main.tsx`
- Modify: `launcher-rs/ui/src/components/Sidebar.tsx`
- Create: `launcher-rs/ui/src/pages/FreeSkillsPage.tsx`
- Create: `launcher-rs/ui/src/styles/free-skills.css`
- Create: `launcher-rs/ui/tests/free-skills-state.test.js`
- Create: `launcher-rs/ui/tests/free-skills-ui.test.js`
- Modify: `launcher-rs/ui/tests/ui-regression.test.js`

**Interfaces:**
- Consumes: `getFreeSkillCatalog()`, `installFreeSkills(ids)`, `cancelFreeSkillInstall()`, and `onFreeSkillProgress()`.
- Produces: a permanently reachable `freeSkills` page with isolated selection/progress/results.

Use these exact UI state fields:

```ts
export type Page =
  | "clients"
  | "activation"
  | "configure"
  | "result"
  | "freeSkills"
  | "guide"
  | "breakGuide"
  | "contactService"
  | "logs";

export type UiState = {
  page: Page;
  selected: string[];
  bootstrap: BootstrapState;
  cdk: string;
  activationMessage: string;
  activationSucceeded: boolean;
  configureStarted: boolean;
  progress: ProgressEvent;
  error: string;
  freeSkillCatalog: FreeSkillCatalog | null;
  selectedFreeSkills: string[];
  freeSkillsBusy: boolean;
  freeSkillProgress: FreeSkillProgress;
  freeSkillResults: FreeSkillInstallResult[];
  freeSkillError: string;
};
```

- [ ] **Step 1: Write failing pure-state tests.**

Cover individual toggle, select all, clear all, exact catalog order, selection pruning after catalog refresh, zero-selection disabled state, paid `busy` not affecting `freeSkillsBusy`, free progress not changing paid `progress/results`, and navigation with no/expired CDK.

Run:

```powershell
cd launcher-rs\ui
npm.cmd test -- --test-name-pattern="free skill"
```

Expected: FAIL because the free fields/helpers do not exist.

- [ ] **Step 2: Add typed API wrappers and independent event subscription.**

Map Rust camelCase fields exactly. `onFreeSkillProgress` listens only to `free-skill-progress`; the existing `onProgress` keeps listening only to `configuration-progress`. API failure sets `freeSkillError` and does not overwrite bootstrap/CDK/configuration state.

- [ ] **Step 3: Add sidebar and routing.**

Add a sidebar group “环境强化” with one entry “强化环境配置”. Never disable it based on selected clients, CDK, paid busy, results, or connectivity. Do not add a CDK/purchase/activation badge to this entry. Keep the paid “配置流程” group and numbering unchanged.

- [ ] **Step 4: Implement page behavior and copy.**

Render:

1. Title “强化环境配置” and copy “为已安装的 AI 客户端补充常用设计、研究、写作和学习能力”.
2. Badge “无需激活 · 可选安装” plus compatible-client count; no client checkboxes.
3. “全选”, “取消全选”, and selected count.
4. Five category groups and 11 cards with title, summary, installation status, and checkbox.
5. Primary action “安装选中的强化能力”; disabled with a visible reason when zero are selected.
6. Progress with current Skill/client, completed/total, and “取消安装”.
7. Results grouped by Skill with client status, target, backup, and error summary.

The page must not contain “购买 CDK”, “激活”, “解锁全部”, reverse-skill/MCP/toolchain installation claims, or GitHub implementation details.

- [ ] **Step 5: Implement cancellation, retry, and accessibility.**

Disable selection and start controls only while `freeSkillsBusy`. Cancel sends `cancel_free_skill_install` once and shows “正在安全结束当前安装单元”. Partial success remains visible. Conflict/failed/rolledBack units can be retried by selecting the Skill again. All checkbox labels are programmatic; status changes use `aria-live="polite"`; buttons have focus-visible states; reduced-motion rules cover progress animation.

- [ ] **Step 6: Write structural UI regression tests.**

Assert the sidebar entry is not CDK-gated, all 11 IDs and five categories are represented from catalog data, forbidden purchase copy is absent, only Skill selection exists, free and paid event names differ, zero-selection is disabled, and grouped result fields are rendered.

Run:

```powershell
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
```

Expected: Node tests pass, TypeScript reports no errors, and Vite produces `ui/dist`.

- [ ] **Step 7: Commit.**

```powershell
git add -- launcher-rs/ui/src/api.ts launcher-rs/ui/src/state/app-state.ts launcher-rs/ui/src/main.tsx launcher-rs/ui/src/components/Sidebar.tsx launcher-rs/ui/src/pages/FreeSkillsPage.tsx launcher-rs/ui/src/styles/free-skills.css launcher-rs/ui/tests/free-skills-state.test.js launcher-rs/ui/tests/free-skills-ui.test.js launcher-rs/ui/tests/ui-regression.test.js
git commit -m "feat: add free environment skills page"
```

## Task 11: Add the Accessible Bilingual Disclaimer Dialog

**Files:**
- Create: `launcher-rs/ui/src/components/DisclaimerDialog.tsx`
- Modify: `launcher-rs/ui/src/components/Sidebar.tsx`
- Modify: `launcher-rs/ui/src/main.tsx`
- Create: `launcher-rs/ui/src/styles/disclaimer.css`
- Create: `launcher-rs/ui/tests/disclaimer-dialog.test.js`
- Modify: `launcher-rs/ui/tests/ui-regression.test.js`
- Modify: `docs/testing/2026-07-22-windows-v1.30.1-release-audit.md`

**Interfaces:**
- Consumes: the exact text and interaction boundary in `docs/superpowers/specs/2026-07-22-disclaimer-dialog-design.md`.
- Produces: `DisclaimerDialog`, `onOpenDisclaimer`, and `disclaimerTriggerRef`; it does not consume or produce Tauri IPC, `UiState`, CDK, paid/free progress, or persistence.

Use these exact component contracts:

```tsx
export type DisclaimerDialogProps = {
  open: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
};

export function DisclaimerDialog(props: DisclaimerDialogProps): React.JSX.Element | null;

export type SidebarProps = {
  state: UiState;
  onNavigate: (page: Page) => void;
  onOpenDisclaimer: () => void;
  disclaimerTriggerRef: React.RefObject<HTMLButtonElement | null>;
};
```

- [ ] **Step 1: Write the failing content and wiring regression tests.**

`disclaimer-dialog.test.js` reads `DisclaimerDialog.tsx`, `Sidebar.tsx`, `main.tsx`, and `disclaimer.css` as UTF-8. Assert the approved title and all six body paragraphs occur exactly once in the component source; the Help entry follows “运行日志”; `onOpenDisclaimer` is not guarded by `activated`, `busy`, `freeSkillsBusy`, selected clients, or links; and no `invoke`, `localStorage`, `sessionStorage`, cookie, external URL, acceptance checkbox, or startup auto-open exists.

Run:

```powershell
cd launcher-rs\ui
npm.cmd test -- --test-name-pattern="disclaimer"
```

Expected: FAIL because `DisclaimerDialog.tsx` and the sidebar entry do not exist.

- [ ] **Step 2: Implement the exact content as immutable UI data.**

Define the body once in `DisclaimerDialog.tsx` so rendering and regression checks cannot drift:

```tsx
export const DISCLAIMER_PARAGRAPHS = [
  "本文件夹内的所有内容（包括但不限于代码、脚本、文档、工具）仅供安全学习与研究使用。",
  "使用者必须遵守所在国家/地区的法律法规，在合法授权范围内进行安全测试与研究。严禁将本内容用于任何非法用途，包括但不限于未授权的入侵、攻击、窃取数据等行为。",
  "使用即表示您同意：一切后果由使用者自行承担，作者不承担任何责任。",
  "All content in this directory is for security learning and research purposes only.",
  "Users must comply with local laws and regulations. Unauthorized use is strictly prohibited.",
  "By using this content, you agree that all consequences are borne by the user, and the author assumes no responsibility.",
] as const;
```

The visible title `免责声明 / Disclaimer` is the seventh approved text unit. Render the Chinese and English groups as paragraphs with a semantic separator; do not render the source `========================================` lines.

- [ ] **Step 3: Implement close and focus behavior inside the component.**

When `open` becomes true, save `document.activeElement`, focus the close button, and register a keydown handler. `Escape` calls `onClose`; `Tab` and `Shift+Tab` wrap between focusable elements inside the dialog. On close/unmount, remove the handler and focus `returnFocusRef.current` when available. The backdrop has no close handler. The dialog uses these exact relationships:

```tsx
<section
  role="dialog"
  aria-modal="true"
  aria-labelledby="disclaimer-title"
  aria-describedby="disclaimer-body"
>
```

Buttons are labeled “关闭免责声明” and “我知道了”. Background interaction is blocked by the modal backdrop while the dialog is mounted.

- [ ] **Step 4: Wire the Help entry without changing page state.**

In `App`, add only session-local UI state and a trigger ref:

```tsx
const [disclaimerOpen, setDisclaimerOpen] = useState(false);
const disclaimerTriggerRef = useRef<HTMLButtonElement>(null);
```

Pass `onOpenDisclaimer={() => setDisclaimerOpen(true)}` and the ref to `Sidebar`, and mount `DisclaimerDialog` with `onClose={() => setDisclaimerOpen(false)}`. Do not add `disclaimer` to the `Page` union and do not call `setState`; opening and closing must leave `state.page` and the entire paid/free/update state object unchanged.

- [ ] **Step 5: Add bounded, selectable, reduced-motion-compatible styles.**

Import `styles/disclaimer.css` from `main.tsx`. The overlay covers the content, uses existing colors and radii, and keeps the dialog within `min(720px, calc(100vw - 64px))` width and `calc(100vh - 96px)` height. The header and footer remain fixed inside the dialog; `#disclaimer-body` owns `overflow-y: auto`; its paragraphs use `user-select: text`. Add `:focus-visible` styling and ensure `prefers-reduced-motion: reduce` disables any transition introduced by this stylesheet.

- [ ] **Step 6: Run automated and manual accessibility verification.**

```powershell
cd launcher-rs\ui
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
```

Expected: Node tests pass, TypeScript reports no errors, and Vite produces `ui/dist`.

Record the manual matrix in `docs/testing/2026-07-22-windows-v1.30.1-release-audit.md`: open from every existing page; verify no auto-open after restart; verify scroll at `1120 × 720`; verify Tab/Shift+Tab containment; verify `Escape`, close button, and “我知道了”; verify backdrop click does nothing; verify focus returns to “免责声明”; and compare snapshots of `state.page`, CDK, selected clients, both busy/progress/results sets, and update state before/after.

- [ ] **Step 7: Commit.**

```powershell
git add -- launcher-rs/ui/src/components/DisclaimerDialog.tsx launcher-rs/ui/src/components/Sidebar.tsx launcher-rs/ui/src/main.tsx launcher-rs/ui/src/styles/disclaimer.css launcher-rs/ui/tests/disclaimer-dialog.test.js launcher-rs/ui/tests/ui-regression.test.js docs/testing/2026-07-22-windows-v1.30.1-release-audit.md
git commit -m "feat: add in-app disclaimer dialog"
```

## Task 12: Launch the Local Debug EXE for Owner Acceptance — No Packaging

**Files:**
- Modify: `.gitignore`
- Create: `launcher-rs/scripts/start-dev-client.ps1`
- Create: `launcher-rs/scripts/test-dev-client-launch.ps1`
- Modify: `docs/testing/2026-07-22-windows-v1.30.1-release-audit.md`
- Modify as owner feedback requires: `launcher-rs/ui/src/main.tsx`, `launcher-rs/ui/src/components/Sidebar.tsx`, `launcher-rs/ui/src/pages/FreeSkillsPage.tsx`, `launcher-rs/ui/src/pages/UpdatePage.tsx`, `launcher-rs/ui/src/components/UpdateDialog.tsx`, `launcher-rs/ui/src/components/DisclaimerDialog.tsx`, and their directly corresponding files under `launcher-rs/ui/src/styles/` and `launcher-rs/ui/tests/`

**Interfaces:**
- Consumes: completed Tasks 0–11, installed Node dependencies, Cargo, port `1420`, and the repository working tree.
- Produces: a visible `launcher-rs\target\debug\wujin-launcher.exe` connected to a hidden local Vite helper. It must not produce or modify `dist-rust`, an installer, a release ZIP, signing output, or website release metadata.

Use this exact script interface:

```powershell
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [ValidateRange(10, 180)][int]$StartupTimeoutSeconds = 60
)
```

- [ ] **Step 1: Write the failing launch-policy test.**

`test-dev-client-launch.ps1` reads `.gitignore` and `start-dev-client.ps1`; it fails unless `launcher-rs/tmp-dev/` is ignored and the script contains direct Node/Vite startup, `build-free-skills.ps1`, `WUJIN_FREE_SKILLS_PATH`, `cargo run -p wujin-launcher`, `WUJIN_SOURCE_ROOT`, `WUJIN_ALLOW_DEVELOPMENT`, hidden `Start-Process`, port-1420 readiness, a read-only before/after `dist-rust` snapshot, and `finally` cleanup. It also fails if the script contains `build-release.ps1`, `--release`, `cargo tauri build`, `cargo tauri bundle`, any create/copy/remove/write operation targeting `dist-rust`, installer/signing commands, `git push`, or website publication.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-dev-client-launch.ps1
```

Expected: FAIL because `start-dev-client.ps1` does not exist.

- [ ] **Step 2: Implement preflight and `-CheckOnly`.**

Resolve the repository and launcher roots with `Resolve-Path`; require `cargo`, a Node executable from PATH or the Codex bundled runtime, `launcher-rs\ui\node_modules\vite\bin\vite.js`, `launcher-rs\scripts\build-free-skills.ps1`, `launcher-rs\src-tauri\Cargo.toml`, and a free `127.0.0.1:1420`. Capture a recursive path/length/SHA-256 snapshot of existing `dist-rust` files. With `-CheckOnly`, validate that the free bundle source inputs exist, print `DEV CLIENT PREFLIGHT PASSED — NO PACKAGE CREATED`, and exit without starting processes or changing files.

- [ ] **Step 3: Start the hidden frontend helper and wait for readiness.**

Create an ignored `launcher-rs\tmp-dev` directory, run `build-free-skills.ps1 -Output launcher-rs\tmp-dev\free-skills.zip`, and set `WUJIN_FREE_SKILLS_PATH` to that file. Then use `Start-Process` with `-WindowStyle Hidden`, the resolved Node executable, `-WorkingDirectory launcher-rs\ui`, and arguments `node_modules/vite/bin/vite.js --host 127.0.0.1`. Poll `http://127.0.0.1:1420` until HTTP response or timeout; if the helper exits or the timeout expires, throw with the Vite log path. Do not open a browser.

- [ ] **Step 4: Run the visible Rust/Tauri debug client in the foreground.**

Set only for the child-development session:

```powershell
$env:WUJIN_SOURCE_ROOT = $repoRoot
$env:WUJIN_ALLOW_DEVELOPMENT = '1'
$env:WUJIN_FREE_SKILLS_PATH = $freeBundle
Push-Location $launcherRoot
& cargo run -p wujin-launcher
```

Expected: Cargo builds/runs `target\debug\wujin-launcher.exe`; the “无限破甲” Tauri window is visible and remains available for owner interaction. This is not a release build and does not require `cargo-tauri`.

- [ ] **Step 5: Clean helpers and prove release outputs did not change.**

In `finally`, restore the previous directory, remove all three Wujin environment variables, stop only the Vite child process started by this script, remove the generated `tmp-dev\free-skills.zip`, and preserve its diagnostic log on failure. Recompute the `dist-rust` snapshot and throw if any path, byte count, or SHA-256 changed. Do not delete or rewrite owner files.

- [ ] **Step 6: Run automated preflight and launch the local client.**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-dev-client-launch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1
```

Expected: policy test and preflight pass, then the visible debug EXE opens. Keep it running for the owner to test; closing it triggers helper cleanup and leaves `dist-rust` unchanged.

- [ ] **Step 7: Run the owner UI test and adjustment loop.**

Keep the debug client and its hidden Vite helper running while the owner checks the actual window. Test at minimum: startup layout; sidebar grouping and navigation; pre-activation access to “一键配置” and “配置结果”; blocked paid execution without a valid CDK; “强化环境配置” selection, progress, cancellation, results, retry, narrow-window layout, keyboard focus, and reduced motion; update checking, retry, latest-version feedback, update dialog focus, and both fixed website links; disclaimer open, scrolling, Escape, focus trap, and focus return.

For every owner-reported UI adjustment:

1. Add or update the smallest executable UI regression test that expresses the requested behavior.
2. Run that test and record the failing output before editing the implementation.
3. Modify only the directly affected component/style/state files; do not change CDK, free-Skill, update-signature, IPC, or release boundaries unless the owner explicitly changes those requirements.
4. Run the targeted test, the complete Node UI suite, TypeScript, and Vite build.
5. Restart only the local debug client/Vite helper through `start-dev-client.ps1`; do not create a package.
6. Present the revised live window to the owner and repeat until the owner explicitly confirms the UI.

Use these verification commands after each adjustment wave:

```powershell
cd launcher-rs\ui
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
cd ..\..
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1
```

Expected: all automated UI gates pass, the revised debug EXE opens for another owner test, and no release output changes.

- [ ] **Step 8: Record owner-visible development acceptance.**

In `docs/testing/2026-07-22-windows-v1.30.1-release-audit.md`, record the exact debug EXE path, launch command, start time, tested pages, CDK-gated behavior, free Skill page behavior, disclaimer behavior, update-check behavior, each owner feedback item, its regression test, adjustment result, owner retest status, final owner confirmation, and `dist-rust` before/after snapshot. Label the result `LOCAL DEBUG ACCEPTANCE — NOT A RELEASE PACKAGE`.

- [ ] **Step 9: Commit the development launcher and accepted UI adjustments only.**

```powershell
git add -- .gitignore launcher-rs/scripts/start-dev-client.ps1 launcher-rs/scripts/test-dev-client-launch.ps1 launcher-rs/ui/src launcher-rs/ui/tests docs/testing/2026-07-22-windows-v1.30.1-release-audit.md
git commit -m "test: record owner-approved local client ui"
```

Stop here unless the owner explicitly says “出包”.

## Task 13: Reproducible Windows Release and Skill Synchronization — Conditional on “出包”

**Execution gate:** This task is locked. Do not execute any step until the owner explicitly instructs “出包”. Approval to develop, test, launch, commit, merge, or push source does not unlock packaging.

**Files:** release scripts, `docs/testing/2026-07-22-windows-v1.30.1-release-audit.md`, `skills/upstream-lock.json`, `skills/scripts/check-skill-upstreams.ps1`, `launcher-rs/free-skills/upstreams.lock.json`, and free-bundle reports.

- [ ] Build deterministic payload and raw test EXE using explicit CDK and update public-key paths.
- [ ] Generate release report, SBOM, size report, hashes, and version evidence; clean temporary payload and environment variables in `finally` blocks.
- [ ] Forbidden-marker scan finds no private key, CDK inventory, `Wujin-release-secrets` path, Python/Qt/Nuitka/Node runtime, or build cache in customer artifacts.
- [ ] Pin `reverse-api-engineer` at `40c46184cb51b3ba362f1bde35db0a672bde684c`; keep current `ghidra-rpc` functional files; mark other unverified origins `local`.
- [ ] Run the skill upstream check without overwriting local enhancements.
- [ ] Build and verify `free-skills.zip`; require exactly 11 approved IDs, pinned commits, preserved licenses, complete Skill directories, per-file hashes, deterministic archive hash, and no network access during runtime tests.
- [ ] Run a no-CDK acceptance matrix for Claude, Codex, Kiro, Cursor, Cline, and Windsurf: native install or verified route, absent-client `unsupported`, user-owned conflict, Wujin upgrade, cancellation, readback failure, and rollback.
- [ ] Run a CDK isolation matrix: missing, expired, corrupt-cache, and active CDK produce identical free catalog/install behavior; paid configuration remains gated and paid markers/MCP/backups/results remain byte-identical after free operations.
- [ ] Verify the Help “免责声明” entry and bilingual dialog on clean Windows 10/11: exact copy, no startup auto-open, no acceptance persistence, bounded scrolling, keyboard focus trap/return, three close paths, inert backdrop, and no paid/free/update state changes.
- [ ] Run full Windows gate, UI tests/typecheck/build, Rust tests, production CDK tests, PE check, and clean Windows 10/11 install/configuration/rollback audit.
- [ ] Commit: `build: close windows v1.30.1 release gate`.

## Task 14: Source Handoff and Main-Branch Cutover

**Files:** create `docs/releases/v1.30.1-source-handoff.md` and `docs/releases/v1.30.1.md`; update architecture and platform docs.

- [ ] Document launcher entry points, shared-core contracts, Windows-only modules, paid/free resource separation, free Skill catalog and adapters, disclaimer UI boundary, IPC, update boundary, commands, toolchain, hashes, licenses, and limitations.
- [ ] State that macOS implementation and Apple signing belong to the friend’s independent branch.
- [ ] Exclude `target`, `dist-rust`, `node_modules`, screenshots, caches, temporary directories, and customer secrets from the handoff archive.
- [ ] Review all scoped source/document changes, stage explicitly, merge the feature branch into `main`, and push the Rust repository; source push is allowed before packaging approval and must not include a built EXE, installer, release ZIP, signing output, or production manifest.
- [ ] Only after the owner says “出包” and Task 13 passes, publish website release metadata and verify the website `main` deployment and production manifest.

## Required Non-Packaging Verification Commands

```powershell
cd G:\AI\520reverse-skill\launcher-rs
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-free-skills.ps1 -Output src-tauri\resources\free-skills.zip
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-free-skills-bundle.ps1 -Bundle src-tauri\resources\free-skills.zip
cd ui
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run build
cd ..\..

cd launcher-rs
$env:WUJIN_RELEASE_SECRETS = 'G:\AI\520reverse-skill\Wujin-release-secrets'
cargo test -p wujin-core --test license_compat -- --nocapture
Remove-Item Env:WUJIN_RELEASE_SECRETS
cd ..

powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-full-gate.ps1 -SkipReleaseBuild
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\test-dev-client-launch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\start-dev-client.ps1
```

The final command keeps the local debug client in the foreground for owner testing. It does not create a release artifact.

## Conditional Packaging Commands — Run Only After the Owner Says “出包”

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\build-release.ps1 -PublicKeyPath G:\AI\520reverse-skill\Wujin-release-secrets\wujin-ed25519-public.bin -UpdatePublicKeyPath G:\AI\520reverse-skill\Wujin-release-secrets\wujin-update-ed25519-public.bin -Version 1.30.1 -TestBuild
powershell -NoProfile -ExecutionPolicy Bypass -File launcher-rs\scripts\verify-release.ps1 -Executable dist-rust\无限破甲-v1.30.1.exe
```

## Development Hold Point Before “出包”

- [ ] Tasks 0–11 implementation and all non-packaging automated gates pass.
- [ ] Task 5A preserves the complete paid payload, adds v5 only to authorized Codex configuration, rejects user-owned `model_instructions_file` conflicts, and remains absent from every free Skill surface.
- [ ] Task 12 launches `launcher-rs\target\debug\wujin-launcher.exe` and the owner can test the real local window.
- [ ] The launch audit is labeled `LOCAL DEBUG ACCEPTANCE — NOT A RELEASE PACKAGE`.
- [ ] `dist-rust`, installer files, signing output, release archives, Cloudflare manifest, and website release metadata remain unchanged.
- [ ] Task 13 and the website-release step of Task 14 remain unexecuted until the owner explicitly says “出包”; source documentation, commits, merge, and source push may proceed without packaging artifacts.

## Definition of Done

- [ ] Every approved Rust/Tauri/UI/release surface reports `1.30.1`; Python remains `1.1.0`.
- [ ] One-click configuration and empty-result navigation behave safely before activation.
- [ ] Documentation links point to the codexpojia training document.
- [ ] Existing paid reverse-skill content and every existing paid client adapter remain operational; the pinned GPT-5.6 Instruct v5 asset is an additive, CDK-gated Codex-only configuration and never appears in the free bundle or page.
- [ ] The Help group exposes one always-enabled “免责声明” entry after “运行日志”; it opens the exact bilingual title and six paragraphs in a scrollable accessible dialog without auto-opening, requiring acceptance, persisting state, invoking Tauri, or changing the current page/paid/free/update state.
- [ ] “强化环境配置” is always reachable, exposes exactly 11 individually selectable bundled Skills, and never presents CDK purchase/activation as part of the free flow.
- [ ] Free catalog/install/cancel IPC, `freeSkillsBusy`, `free-skill-progress`, results, managed markers, state root, backups, and logs remain independent from the paid flow.
- [ ] Claude and Codex receive complete native Skill directories; Kiro, Cursor, Cline, and Windsurf receive only their verified free route; absent or unverified targets remain untouched and report `unsupported`.
- [ ] User-owned same-name Skills return `conflict`; Wujin-owned Skills install idempotently, upgrade with backup, survive cancellation, verify readback, and roll back only the failed unit.
- [ ] `free-skills.zip` is deterministic, contains exactly the approved pinned sources and licenses, passes hostile ZIP/path/hash checks, has its own SBOM/notices/hash/size evidence, and installs offline.
- [ ] Missing, expired, corrupt, or active CDK state produces identical free installation behavior while paid `configure_selected` remains protected.
- [ ] Signed Cloudflare static manifest prompts only on a newer valid version.
- [ ] Netdisk downloads remain website-controlled and are never auto-installed by the client.
- [ ] Production CDKs pass without token disclosure; customer artifacts contain no secrets.
- [ ] Before packaging approval, development ends at the owner-tested debug EXE and produces no distributable package; after explicit “出包” approval, Task 13 release evidence is generated and verified.
- [ ] Rust/UI/release gates and Windows 10/11 acceptance pass.
- [ ] Source handoff and macOS validation document are complete, while macOS implementation remains out of scope.
