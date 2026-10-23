PERSISTENCE UPDATE
- f0e6e52: license-api LicenseService now optional durable atomic JSON ledger via LICENSE_STATE_PATH / with_state_path.
- Ledger stores token_sha256 instead of plaintext CDKs; state survives restart; activation/generation/refresh/revoke persist.
- Added services/license-api/tests/persistence.rs, cargo test full pass.
- .env.example documents LICENSE_STATE_PATH (encrypted persistent volume recommended).
Parent shared tree already contains commits.
