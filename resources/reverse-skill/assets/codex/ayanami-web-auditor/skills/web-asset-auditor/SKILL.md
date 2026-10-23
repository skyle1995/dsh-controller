---
name: web-asset-auditor
description: Trace browser-side parameters through network evidence, JavaScript execution, AST clarification, CDP telemetry, and control-flow parity verification.
---

# Web Asset Auditor

Use this workflow when the task concerns an undocumented browser asset,
minified JavaScript, client-generated signature, request parameter, WebSocket
message, or a behavior change that must preserve the original execution flow.

## Evidence order

Resolve conflicting evidence in this order:

1. Live runtime behavior and memory state.
2. Captured network traffic and initiator stacks.
3. Assets actively served to the browser.
4. Process and browser configuration.
5. Persisted state, extracted artifacts, source, and comments.

Record concrete requests, functions, scripts, offsets, hashes, inputs, and
outputs. Mark an inference explicitly until a runtime observation validates it.

## Workflow

### 0. Network baseline

- Capture the smallest request sequence that contains the target parameter.
- Record method, URL template, initiator stack, headers, payload fields, and
  the response transition that proves the request matters.
- Identify the earliest application-owned frame and exclude framework transport
  wrappers from the candidate generation path.

### 1. Execution-flow tracing

- Trace the parameter from its request sink toward assignments and inputs.
- Stop following a generic dependency after 50 irrelevant lines and pivot to
  its application-owned caller.
- Build a compact source-to-sink chain with file, symbol, and observed value at
  each boundary.

### 2. AST clarification

- Parse or format the smallest relevant module instead of rewriting the whole
  bundle.
- Recover computed properties, array lookups, flattened branches, closure
  captures, and asynchronous transitions that influence the target value.
- Identify plaintext inputs, key or seed initialization, transform order, and
  serialization boundaries.

### 3. CDP telemetry

- Instrument the narrowest browser primitive that observes the value before
  transmission, such as `fetch`, `XMLHttpRequest`, `WebSocket.send`, Web Crypto,
  or a confirmed application function.
- Preserve original arguments, return values, exceptions, `this` binding, and
  promise behavior.
- Emit bounded structured records and provide an explicit uninstall function
  for every probe.

### 4. Parity verification

- Replay the same baseline input before and after any probe or refactor.
- Compare request order, transformed bytes, state transitions, asynchronous
  completion, error behavior, and observable output.
- Report `[PARITY VERIFIED]` only when all compared evidence matches. Otherwise
  report `[PARITY BROKEN: <boundary>]` with the first divergent value or event.

## Output contract

Return these fields in order:

```text
[TARGET ASSET]: request field, script, function, or message under review
[CURRENT CONTEXT]: file and symbol or runtime boundary
[EVIDENCE]: decisive trace, values, and reproduction command
[HYPOTHESIS]: current source-to-sink explanation and confidence
[TELEMETRY OR CODE]: focused parser, probe, replay, or patch
[PARITY AUDIT]: verified, broken at a named boundary, or pending with reason
[NEXT TRANSITION]: the next workflow stage and exact evidence needed
```

Keep the original artifact unchanged. Put generated probes and transformed
copies in a separate working directory, and verify removal or rollback after
the parity run.
