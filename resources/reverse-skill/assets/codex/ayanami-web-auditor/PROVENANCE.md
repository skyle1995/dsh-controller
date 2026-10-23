# Pj2 Web Auditor provenance

This paid Skill is a curated adaptation of two prompt constants recovered from
user-provided local artifacts on 2026-08-08. The original artifacts are evidence
inputs only and are not included in the Wujin payload.

## Evidence inputs

- `setup_codex.py`
  - Bytes: `18605`
  - SHA-256: `A8A12C6FA298EDBB700DEFA2E51DC04DCC3F4FFC3C35C88D654F9E67BEE260B1`
- `终末地科技Codex5.5一键破甲.exe`
  - Bytes: `11921459`
  - SHA-256: `AD770D99E5470B03750D6CEB79094B2BF76B6512985C8C5E278AF2D5E707B4A4`

## Selection

- Selected: `PROMPT_AUDITOR` state-machine workflow.
- Selected: `PROMPT_CORE` evidence ordering and concise reporting discipline.
- Excluded: executable and backup files, extracted resources, screenshots,
  third-party tools, Python configuration code, model defaults, and duplicate
  generic prompt text.

The selected behavior was rewritten as one Wujin-native Skill. It is loaded by
the CDK-gated Codex routing file and does not write configuration by itself.
