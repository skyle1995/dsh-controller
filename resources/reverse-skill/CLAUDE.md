# CLAUDE.md

This repository is a **task skill router** for authorized research and analysis workflows.

## On Any Task

`RULES.md` is the single source of truth. Read it immediately before doing anything — it contains the complete behavior chain, routing matrix, authorization pre-declaration, and tool registry.

For product development tasks, read `PROJECT_CONTEXT.md` immediately after `RULES.md`, then read `docs/superpowers/plans/2026-07-22-wujin-v1-3-windows-plan.md` for the authoritative Windows Rust v1.30.1 implementation plan. For the activation-independent “强化环境配置” feature, also read `docs/superpowers/specs/2026-07-22-free-environment-skills-design.md`; for the in-app disclaimer, read `docs/superpowers/specs/2026-07-22-disclaimer-dialog-design.md` before changing code. These files define the project map, paid/free isolation, embedded Skill bundle contract, disclaimer copy and state boundary, Cloudflare/netdisk update boundary, version contract, test commands, release rules, and macOS handoff scope. After implementation, launch the local debug EXE for owner testing, but do not run release packaging, signing, installer, release archive, manifest publication, or executable upload until the owner explicitly says “出包”.

## First-Run Setup

`skills/tool-index.md` is not included in fresh clones. Generate it before starting:

```bash
# macOS / Linux
bash skills/scripts/refresh-tool-index.sh

# Kali Linux
bash kali/scripts/refresh-tool-index.sh
```

Read `README_AI.md` for the full bootstrap sequence.
