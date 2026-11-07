# Public Client Mirror Downloads Design

> **2.0.0 发布决策：2.0.0 不设置 Authenticode 或 SHA-256 放行门禁。** 下载完成仅要求 HTTPS/重定向域约束、大小、完整性与容器文件头检查；客户端只打开文件所在目录，不执行安装包。
>
> Release contract marker: `WUJIN_2_0_DOWNLOAD_SUCCESS_GATE=transport_size_integrity_container_only`.

## Goal

Make the Claude, Codex, and Cursor Windows download cards usable without a VPN while keeping the owner's API server and website out of the installer data path. Show real download progress and turn a completed card into an “打开文件位置” action.

## Source policy

- Use only independently operated public HTTPS mirrors that are verified reachable at implementation time. The verified initial mirror endpoints are `claudeapp.agentsmirror.com` for Claude MSIX and `codexapp.agentsmirror.com` for Codex MSIX. Cursor keeps its reachable vendor CDN path until a comparable independently operated mirror is verified.
- Keep each vendor's official endpoint as the final fallback.
- Never proxy an installer through `api.codexpojia.com`, `codexpojia.com`, the Rainyun host, Cloudflare Pages, Cloudflare Tunnel, or Keygate.
- Keep an explicit per-client/per-architecture allowlist. Redirects remain HTTPS-only and are revalidated after every hop.
- A source failure, timeout, invalid response, or incomplete body advances to the next source. Partial files are deleted before retrying another source.
- Public-mirror content is treated as transport data. Every completed file must pass the size bound, completeness check and EXE/MSIX container header check before its directory can be revealed.
- If research finds no suitable public mirror for a client, that client uses the official endpoint rather than adding an unverifiable download host.

## Native download contract

`download_client(clientId)` returns the saved absolute path; `sha256` remains optional and is empty in 2.0.0. Progress events add a source label and phase so the UI can distinguish connection, download and source fallback. Only one client download runs at a time, preserving the existing operation guard.

Add `reveal_downloaded_file(path)` as a separate Tauri command. It accepts only an existing regular file whose canonical parent is the Windows Downloads directory, then launches `explorer.exe /select,<path>`. It never executes the installer.

## UI behavior

- Each card displays an accessible progress bar during transfer. Known totals show an integer percentage; unknown totals show an indeterminate bar and downloaded byte count.
- Status copy communicates source connection/fallback without displaying raw URLs.
- While one download is active, all download actions remain disabled as today.
- Success stores the path returned by native code. The primary button changes to “打开文件位置”; selecting it invokes `reveal_downloaded_file(path)`.
- Failure changes the button to “重试下载”. Retrying starts from a clean state.
- The download note says the program tries a public mirror and then the official source. It does not claim publisher identity verification.

## Verification

Use RED → GREEN for source selection/fallback, path reveal validation, and UI state. Run targeted Rust and UI tests, then the UI suite, TypeScript, Vite build, Rust formatting, clippy, and workspace tests. Finally launch only the local debug client for owner acceptance. Release packaging, website publication, executable upload, and live manifest changes remain locked until the owner says “出包”.
