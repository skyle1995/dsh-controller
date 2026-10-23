# Wujin Test Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the current launcher source to the private Aireves repository and produce a locally testable CDK-activated EXE without treating it as a commercial release.

**Architecture:** Source, tests, and documentation are committed on a dedicated branch. Ed25519 private material and issued CDKs stay outside the repository; only the public key is embedded transiently during the Nuitka test build. Build output remains local and is verified by hashes and automated gates.

**Tech Stack:** Git, PowerShell 5.1, Python 3.12, PySide6 6.8.3, Nuitka, Ed25519.

## Global Constraints

- Do not commit private keys, issued CDKs, virtual environments, Nuitka intermediates, crash reports, or EXE files.
- Mark the output as a test build; it is unsigned and is not a commercial v1 release.
- Push source to `https://github.com/AAnything001/Aireves.git` on `codex/wujin-test-package`.

---

### Task 1: Repository Boundary

**Files:**
- Modify: `.gitignore`
- Create: `docs/superpowers/plans/2026-07-12-wujin-test-release.md`

- [ ] Confirm build output and signing material are ignored.
- [ ] Review the complete staged file list before committing.

### Task 2: Test CDK Material

**Files:**
- Read: `launcher/tools/issue_cdks.py`
- Read: `launcher/app/core/license.py`
- Create outside repository: `G:\AI\520reverse-skill-test-secrets\wujin-test-ed25519-private.bin`
- Create outside repository: `G:\AI\520reverse-skill-test-secrets\wujin-test-ed25519-public.bin`
- Create outside repository: `G:\AI\520reverse-skill-test-secrets\test-cdks.csv`

- [ ] Generate a 32-byte Ed25519 key pair with Python 3.12.
- [ ] Issue permanent `1.x` test CDKs with the existing CLI.
- [ ] Verify an issued CDK with the generated public key.

### Task 3: Test Build And Verification

**Files:**
- Execute: `launcher/build.ps1`
- Execute: `scripts/validate-wujin-base-install.ps1`

- [ ] Run all launcher unit tests under `.venv` Python 3.12.
- [ ] Run the staging validation gate.
- [ ] Build the one-file EXE with `-TestBuild` and the generated public key.
- [ ] Record EXE SHA-256 and Authenticode status.

### Task 4: Private Repository Publication

**Files:**
- Stage only source, tests, documentation, and verification scripts.

- [ ] Create branch `codex/wujin-test-package`.
- [ ] Commit the reviewed source set.
- [ ] Add `aireves` remote for the private repository.
- [ ] Push the branch and verify the remote branch commit.
