# Public Client Mirror Downloads Implementation Plan

> **2.0.0 发布决策：2.0.0 不设置 Authenticode 或 SHA-256 放行门禁。** 相关旧步骤由大小、完整性、容器文件头与受限“打开所在文件夹”验收替代。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add verified public-mirror fallback, an accessible progress bar, and an “打开文件位置” completion action for Claude, Codex, and Cursor downloads.

**Architecture:** Keep source selection and container checks in `wujin-windows`, keep Tauri IPC thin, and keep UI state local to the download page. Public mirrors use an explicit HTTPS allowlist; official vendor endpoints remain fallback sources. The application reveals the completed file in Explorer and does not execute it.

**Tech Stack:** Rust 2024, reqwest blocking client, Tauri 2, React/TypeScript, Node test runner, PowerShell 5.1.

## Global Constraints

- Installer bytes never traverse owner-operated API, website, Rainyun, Pages, Tunnel, or Keygate infrastructure.
- Only independently operated public HTTPS mirrors verified reachable during implementation may be added. Claude uses `claudeapp.agentsmirror.com`, Codex uses `codexapp.agentsmirror.com`, and Cursor retains its reachable vendor CDN path until a comparable independent mirror is verified.
- Redirects are bounded and every redirect host is allowlisted.
- Every downloaded installer passes size, completeness and EXE/MSIX container-header checks before the path is returned.
- Secrets, credentials, raw production keys, and environment values stay outside source and commits.
- Release packaging, upload, website publication, and live manifest modification remain locked until “出包”.
- Preserve unrelated worktree changes and stage only named files.

---

### Task 1: Source selection and fallback

**Files:**
- Modify: `launcher-rs/crates/wujin-windows/src/client_download.rs`

**Interfaces:**
- Consumes: `DownloadClient`, existing official URL resolver, existing installer verification.
- Produces: ordered source candidates and fallback behavior consumed by `ClientDownloader::download`.

- [ ] Add unit tests asserting each accepted mirror is HTTPS and allowlisted, official URLs are last, unknown hosts are rejected, and failed candidates advance without preserving partial data.
- [ ] Run `cargo test -p wujin-windows client_download -- --nocapture` and record the expected failing assertions.
- [ ] Implement the smallest ordered candidate model and per-source retry loop; preserve redirect validation and the existing content checks.
- [ ] Run the targeted test and `cargo fmt --all -- --check`; require green output.
- [ ] Commit only the Rust source with message `feat: add verified public client download fallback`.

### Task 2: Reveal downloaded file IPC

**Files:**
- Modify: `launcher-rs/src-tauri/src/commands.rs`
- Modify: `launcher-rs/src-tauri/src/main.rs`
- Modify: `launcher-rs/ui/src/api.ts`

**Interfaces:**
- Consumes: the absolute `path` returned by `download_client`.
- Produces: `reveal_downloaded_file(path: string): Promise<boolean>`.

- [ ] Add Rust tests requiring registration, canonical Downloads-directory containment, regular-file validation, and `explorer.exe /select,` without executing the file.
- [ ] Run `cargo test -p wujin-launcher commands::tests::download -- --nocapture` and confirm RED.
- [ ] Implement the command and TypeScript wrapper with path validation before process launch.
- [ ] Re-run the targeted tests and TypeScript typecheck; require green output.
- [ ] Commit the three named files with message `feat: reveal completed client downloads`.

### Task 3: Accessible progress and completion UI

**Files:**
- Modify: `launcher-rs/ui/src/pages/ClientDownloadsPage.tsx`
- Modify: `launcher-rs/ui/src/styles/client-downloads.css`
- Modify: `launcher-rs/ui/tests/client-downloads-ui.test.js`

**Interfaces:**
- Consumes: progress events, `ClientDownloadResult.path`, and `revealDownloadedFile(path)`.
- Produces: per-card progress/status UI and “打开文件位置” button state.

- [ ] Extend the UI test to require `role="progressbar"`, percentage/byte status, fallback copy, stored result path, `revealDownloadedFile`, and “打开文件位置”.
- [ ] Run `node --test tests/client-downloads-ui.test.js` from `launcher-rs/ui` and confirm RED.
- [ ] Implement the minimal state/UI/CSS behavior, retaining the single-download busy rule and retry state.
- [ ] Run the targeted test, full UI tests, `tsc --noEmit`, and Vite build; require green output.
- [ ] Commit the three named files with message `feat: show client download progress and file location`.

### Task 4: Integrated verification and local owner build

**Files:**
- Modify only if evidence recording is already required: `docs/testing/2026-07-22-windows-v1.30.1-release-audit.md`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: non-release acceptance evidence and a running local debug EXE.

- [ ] Run `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace --all-targets` from `launcher-rs`.
- [ ] Run UI tests, TypeScript, and Vite production build.
- [ ] Download each client through the implemented source chain into a repository-external smoke directory and verify size, completeness, container header and restricted reveal behavior.
- [ ] Run `launcher-rs/scripts/start-dev-client.ps1` to open the debug client; leave release output and live publication surfaces unchanged.
- [ ] Commit only new acceptance evidence, if changed, with message `test: verify public client download fallback`.
