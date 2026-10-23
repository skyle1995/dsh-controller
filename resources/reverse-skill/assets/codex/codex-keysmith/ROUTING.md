# Codex Keysmith paid routing

This paid module is bundled into Wujin and is available only after CDK-gated
Codex configuration. Read `codex-instruct.py` and the selected scenario package
contract before using it.

- CLI deployment and recovery: `codex-instruct.py`
- Scenario library: `scenarios/`
- Regression tests: `tests/`
- Maintenance scripts: `scripts/`

Wujin deploys this module as a managed paid payload. It does not launch the
upstream GUI, isolate `hooks.json`, or replace Wujin's managed
`model_instructions_file` transaction.
