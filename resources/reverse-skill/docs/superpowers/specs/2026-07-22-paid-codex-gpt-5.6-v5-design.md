# Wujin 付费 Codex GPT-5.6 Instruct v5 设计

## 目标

在 Windows Rust/Tauri `1.30.1` 的既有付费一键配置中，为已通过 CDK 授权且选择 Codex 的用户增量安装 `MDX-Tom/gpt-5.6-instruct` 的 `v5` 指令文件。原有 `reverse-skill.zip`、规则注入、MCP 配置、其他客户端 adapter 和 CDK 行为必须保留；本功能不是免费 Skill，也不得进入“强化环境配置”页面或 `free-skills.zip`。

## 已确认方案

采用最小、离线、可复现的方案：只供应运行时需要的 `gpt-5.6-sol-unrestricted-v5.md`、MIT 许可证和来源记录，由现有 Rust `CodexAdapter` 在同一个付费事务中配置 `model_instructions_file`。不内置整个 Git 仓库，不内置或执行上游 Python 脚本，不在运行时访问 GitHub、Git、Python、npm、官网或网盘。

## 固定上游与完整性

- Repository: `https://github.com/MDX-Tom/gpt-5.6-instruct.git`
- Commit: `014053fcd70677d2d392cc1cb4d2d14c03f41bb7`
- Selected variant: `v5`
- Upstream archive: `gpt-5.6-sol-unrestricted-v5.zip`
- Archive SHA-256: `E55293314A3F789D7D19CDA22D60E2D5BE306B850A9C17A015A836943B691AFB`
- Runtime file: `gpt-5.6-sol-unrestricted-v5.md`
- Runtime file SHA-256 (canonical LF bytes): `02C018E5FAC85500D4EB17904769A32B8B22971499C7F94E9CCC8BD6CC9E9104`
- License: MIT; license SHA-256 (canonical LF bytes) `0323ADA93559CAEAA847315FD7BA5F15D6BBAFEC9EFE346F13771AC72385D6E8`

The vendoring audit must prove that the selected ZIP contains exactly the single runtime Markdown file. The public source record must contain the repository, commit, selected variant, all hashes, original filenames, and license identity. It must not contain credentials, private keys, CDKs, machine paths, or network-fetched mutable references.

## Bundle and runtime boundary

The paid payload gains these source-controlled files:

```text
assets/codex/gpt-5.6-instruct-v5/
├── gpt-5.6-sol-unrestricted-v5.md
├── LICENSE-MIT.txt
└── SOURCE.json
```

They are included only through the existing paid `reverse-skill.zip` and deploy to:

```text
%LOCALAPPDATA%\无限破甲\reverse-skill\assets\codex\gpt-5.6-instruct-v5\
```

The free payload remains exactly:

```text
free-skills.zip = the approved 11 free Skill IDs only
```

The paid Codex v5 files must never occur in `free-skills.zip`, the free catalog, free install state, free backup root, free IPC/events, or the “强化环境配置” UI. Conversely, adding v5 must leave all pre-existing paid payload files present and must not replace the paid payload with a v5-only archive.

## Authorization and data flow

The only entry remains `configure_selected(ids)`. The existing Tauri backend checks active CDK authorization before resolving or deploying the paid payload. If authorization is missing, expired, corrupt, or clock-rollback locked, the call fails before `ConfiguratorService`, `CodexAdapter`, or any v5 path is touched.

For an authorized request containing `codex`:

1. Deploy and verify the complete paid `reverse-skill.zip` as today.
2. Confirm the pinned v5 runtime file exists under the deployed paid root and matches the compiled/source-record SHA-256.
3. Run the existing Codex rule and MCP merge.
4. Parse `%USERPROFILE%\.codex\config.toml` without discarding comments or unrelated keys.
5. Apply the conflict rule below for top-level `model_instructions_file`.
6. Commit one TOML payload atomically through `AtomicFileTransaction`.
7. Re-read TOML and require the exact absolute deployed v5 path, existing required MCP entries, and all unrelated values to remain valid.
8. If any Codex step fails, restore every Codex file already committed in this adapter call and return `rolledBack` with no raw instruction contents.

Other selected client adapters continue unchanged. A Codex conflict may make the overall multi-client summary incomplete, but it must not silently redirect or overwrite the user's model instructions.

## `model_instructions_file` conflict contract

Let the expected value be the exact normalized absolute path to the deployed pinned v5 Markdown file.

- Key absent: insert the expected value.
- Key present with the exact expected value: idempotent success.
- Key present with any other string: return a user-owned configuration conflict; do not overwrite it.
- Key present with a non-string value: return invalid configuration; do not rewrite the file.
- Invalid TOML: retain current failure and rollback behavior.

No suffix-only, filename-only, repository-name-only, or directory-prefix heuristic may classify an arbitrary value as Wujin-managed. `model_instructions_file` is a single Codex setting, so this design does not append, merge, concatenate, or edit the user's referenced file.

## UI and logging

No new free page card, checkbox, activation offer, purchase badge, or separate installer is added. In paid configuration results, Codex may state that the v5 model instructions were configured and verified. Logs may record target path, backup path, write/readback status, source commit, variant, and expected hash; they must not log the full instruction text, CDK, private material, or the previous user-owned file contents.

## Failure behavior

- Missing or hash-mismatched embedded/deployed v5 file: Codex configuration fails closed and rolls back.
- Existing user-owned `model_instructions_file`: report conflict, leave it byte-for-byte unchanged, and do not copy over the referenced file.
- TOML write/readback failure: restore the pre-configuration `config.toml` and any earlier Codex file changes from the same call.
- Paid payload deploy failure: no adapter runs.
- Free Skill installation: never reads or writes the paid v5 asset or Codex `model_instructions_file`.

## Required tests

1. Supply-chain fixture verifies repository, commit, v5 archive hash, runtime hash, MIT license, and exact vendored file allowlist.
2. Paid payload test proves the v5 runtime, license, and source record are present while every pre-existing paid payload sentinel remains present.
3. Free bundle validator proves none of the paid v5 IDs, filenames, hashes, source paths, or content occur in `free-skills.zip` or its catalog.
4. Tauri authorization tests prove no CDK, expired CDK, corrupt cache, and clock rollback all reject before the service/adapter touches v5.
5. Codex adapter tests cover absent key, exact idempotent key, foreign string conflict, non-string conflict, invalid TOML, missing runtime file, hash mismatch, successful readback, and rollback after a later failure.
6. Preservation tests prove comments, unrelated top-level TOML, user MCP entries, existing Wujin MCP entries, `AGENTS.md`, and other paid assets remain intact.
7. Multi-client tests prove non-Codex paid adapters retain existing behavior and adding v5 does not change their output.
8. Full debug gates run without release packaging; the owner verifies paid Codex success with a test CDK and confirms the free page never exposes v5.

## Out of scope

- Changing CDK format, issuer key, product ID, version rule, activation UI, or paid/free entitlement model.
- Installing v5 without a valid paid authorization.
- Adding v5 to Claude, Kiro, Cursor, Cline, Windsurf, or any free Skill adapter.
- Executing `codex-instruct.py`, any upstream archive script, or any runtime network installation.
- Modifying the v5 instruction text, combining it with another variant, automatically migrating a foreign `model_instructions_file`, or adding v35.
- Release build, signing, installer creation, upload, website manifest publication, or package release before the owner explicitly says “出包”.

## Acceptance

This feature is accepted only when it is an additive part of the existing CDK-gated paid Codex transaction, all old paid functionality remains, every free path is isolated, user-owned model instructions are never overwritten, executable tests cover rollback and authorization, and the local debug EXE passes owner UI testing without producing a release package.
