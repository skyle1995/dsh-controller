# Customer-Facing Guide Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简客户可见的“使用说明”和“激活”文案，只保留完成配置所需的操作信息。

**Architecture:** 只调整 React UI 文案和源码契约测试，不改变 Tauri IPC、CDK 验证、客户端配置、日志或导航状态。客户页面统一使用“激活码/配置流程”等产品语言，不暴露离线验证、上传策略或内部实现细节。

**Tech Stack:** React、TypeScript、Node.js `node:test`、Vite。

## Global Constraints

- 保留三步顺序：选择客户端 → 输入激活码 → 一键配置。
- 不在客户可见的使用说明或激活页出现“离线”“offline”“无需联网”“不会上传激活码”等实现细节。
- 保留购买入口、在线文档、售后支持和返回配置流程按钮。
- 不修改激活服务、CDK 格式、客户端配置和文件日志行为。

### Task 1: Add the failing UI copy regression

**Files:**
- Modify: `launcher-rs/ui/tests/python-parity.test.js`

- [ ] Add a test that rejects the internal activation/network wording from `GuidePage` and `ActivationPage`, while requiring customer-facing activation and configuration copy.
- [ ] Run the focused Node test and confirm it fails against the current wording.

### Task 2: Apply the minimal customer-facing copy

**Files:**
- Modify: `launcher-rs/ui/src/pages/GuidePage.tsx`
- Modify: `launcher-rs/ui/src/pages/ActivationPage.tsx`

- [ ] Reduce the guide to the three required steps and remove the extra “better results” panel.
- [ ] Replace the activation lead with neutral customer copy that does not mention network or upload behavior.
- [ ] Keep existing navigation, purchase links, support link, and activation/configuration gates unchanged.

### Task 3: Verify the UI contract

- [ ] Run the focused copy test and confirm it passes.
- [ ] Run `npm.cmd test`, `npm.cmd exec -- tsc --noEmit`, and `npm.cmd run build`.
- [ ] Start the current test EXE so the customer can inspect the shortened pages.

## Self-review

- The only production files are two UI page components; no activation or deployment behavior changes.
- The regression test checks both forbidden internal wording and required customer actions.
- Manual review remains necessary for visual spacing after the content reduction.
