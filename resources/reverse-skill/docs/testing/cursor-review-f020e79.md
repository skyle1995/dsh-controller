Base: 8f5f8e2aaa9afda649ecfec3fd81cf5761971cc6
Head: f020e795aae9ce1a57a082b2a965e1ce075eac1f

 docs/testing/2026-07-26-wujin-2.0-release-audit.md |   3 +-
 docs/wujin-2.0-cursor-adapter.md                   |  31 ++
 launcher-rs/Cargo.lock                             |  15 +
 launcher-rs/Cargo.toml                             |   1 +
 launcher-rs/crates/wujin-cursor/Cargo.toml         |  16 +
 launcher-rs/crates/wujin-cursor/src/lib.rs         | 334 +++++++++++++++++++++
 launcher-rs/src-tauri/Cargo.toml                   |   2 +
 launcher-rs/src-tauri/src/commands.rs              | 128 ++++++--
 launcher-rs/src-tauri/src/state.rs                 |   2 +
 launcher-rs/ui/src/pages/ConfigurePage.tsx         |  10 +-
 launcher-rs/ui/tests/v2-navigation.test.js         |  10 +
 11 files changed, 529 insertions(+), 23 deletions(-)
diff --git a/docs/testing/2026-07-26-wujin-2.0-release-audit.md b/docs/testing/2026-07-26-wujin-2.0-release-audit.md
index 8fc3583..ebd0744 100644
--- a/docs/testing/2026-07-26-wujin-2.0-release-audit.md
+++ b/docs/testing/2026-07-26-wujin-2.0-release-audit.md
@@ -16,7 +16,7 @@
 | 管理端 | `cargo test --manifest-path services/license-admin/Cargo.toml` | 通过 |
 | 签发端 | `cargo test --manifest-path services/license-signer/Cargo.toml` | 通过 |
 | 来源锁定 | `launcher-rs/scripts/test-2.0-upstreams.ps1` | 2/2 通过；4 个来源锁定有效 |
-| UI 单元/DOM | `tsx --test tests/*.test.js tests/*.test.tsx` | 104/104 通过 |
+| UI 单元/DOM | `tsx --test tests/*.test.js tests/*.test.tsx` | 105/105 通过 |
 | UI 类型检查 | `tsc --noEmit` | 通过 |
 | UI 构建 | `vite build` | 通过 |
 | 浏览器响应式 | `v2-responsive-browser.mjs`，1120×720 与 390×844 | 通过；截图已保存到 `docs/testing/artifacts/ui/` |
@@ -32,6 +32,7 @@
 - Provider、中转站检测/模型切换、Codex/Claude 下载、Codex 换肤、免费 Skill 不读取 CDK 状态。
 - 激活前协议确认、设备公钥哈希机器码、WJP1/WJD1 离线票据、限时授权和时钟回拨均有测试。
 - 冲突流程覆盖检测、指纹、备份、定向修复、回读和回滚。
+- Cursor 适配器覆盖签名兼容目录、版本白名单、JSON 备份/恢复、原子写入和篡改失败；Tauri 与 UI 均有续杯/恢复入口。
 - NERV 托管包覆盖 manifest、Ed25519 签名、来源 hash、路径白名单、逐文件 SHA-256 和原子写入。
 - Provider API Key 不进入 React 状态、日志或返回的 Provider 状态。
 - 官网入口只允许 `https://codexpojia.com`，问卷入口在 Cloudflare 官网顶部菜单。
diff --git a/docs/wujin-2.0-cursor-adapter.md b/docs/wujin-2.0-cursor-adapter.md
new file mode 100644
index 0000000..c1911af
--- /dev/null
+++ b/docs/wujin-2.0-cursor-adapter.md
@@ -0,0 +1,31 @@
+# 无限破甲 2.0 Cursor 续杯适配器
+
+## 边界
+
+- Cursor 续杯属于付费能力，Tauri 端先执行 WJD1 付费授权门禁。
+- 未进入签名兼容目录的 Cursor 版本只读检测，不创建备份、不写文件、不改注册表或设备标识。
+- 适配器只处理显式允许的 JSON 存储文件，并在写入前备份、原子替换、回读验证；失败时恢复备份。
+
+## 运行配置
+
+| 环境变量 | 用途 |
+|---|---|
+| `WUJIN_CURSOR_CATALOG_PATH` | 签名兼容目录 JSON 文件 |
+| `WUJIN_CURSOR_CATALOG_PUBLIC_KEY` | 目录 Ed25519 公钥，URL-safe Base64 或标准 Base64，32 字节 |
+| `WUJIN_CURSOR_STORAGE_PATH` | 测试/托管环境的 JSON 存储路径；缺省使用 `%APPDATA%/Cursor/User/globalStorage/storage.json` |
+
+兼容目录条目必须包含版本、`json-v1` 存储 schema、进程名列表、适配器源码 SHA-256、`verified=true` 和管理员权限标志。目录签名覆盖 canonical `entries + schemaVersion`，签名或源码哈希不匹配时操作失败。
+
+## 用户流程
+
+1. 选择 Cursor 后进入“一键配置”。
+2. 点击“一键续杯”，客户端检测 Cursor 版本和签名目录。
+3. 兼容时创建带时间戳的备份，写入受控 marker，回读验证并显示结果。
+4. 页面提供“恢复备份”，仅恢复本次会话记录的备份路径。
+
+## 自动化证据
+
+- `wujin-cursor`：4 个 fixture 测试覆盖未知版本、备份/更新/恢复、坏 JSON、目录签名篡改。
+- `wujin-launcher`：Tauri command 编译、clippy 和全量 workspace 测试通过。
+- UI：Cursor 付费门禁、续杯和恢复入口均有源码契约测试，并纳入 `test-2.0-gate.ps1`。
+
diff --git a/launcher-rs/Cargo.lock b/launcher-rs/Cargo.lock
index c9e1f94..1849a06 100644
--- a/launcher-rs/Cargo.lock
+++ b/launcher-rs/Cargo.lock
@@ -4619,6 +4619,19 @@ dependencies = [
  "zip",
 ]

+[[package]]
+name = "wujin-cursor"
+version = "2.0.0"
+dependencies = [
+ "base64 0.22.1",
+ "ed25519-dalek",
+ "serde",
+ "serde_json",
+ "sha2",
+ "tempfile",
+ "thiserror 2.0.18",
+]
+
 [[package]]
 name = "wujin-install"
 version = "2.0.0"
@@ -4635,6 +4648,7 @@ dependencies = [
 name = "wujin-launcher"
 version = "2.0.0"
 dependencies = [
+ "base64 0.22.1",
  "chrono",
  "ed25519-dalek",
  "reqwest 0.12.28",
@@ -4645,6 +4659,7 @@ dependencies = [
  "tauri-build",
  "tempfile",
  "wujin-core",
+ "wujin-cursor",
  "wujin-install",
  "wujin-update",
  "wujin-windows",
diff --git a/launcher-rs/Cargo.toml b/launcher-rs/Cargo.toml
index 6b455ab..3023c7f 100644
--- a/launcher-rs/Cargo.toml
+++ b/launcher-rs/Cargo.toml
@@ -5,6 +5,7 @@ members = [
     "crates/wujin-windows",
     "src-tauri",
     "crates/wujin-install",
+    "crates/wujin-cursor",
 ]
 default-members = ["crates/wujin-core"]
 resolver = "2"
diff --git a/launcher-rs/crates/wujin-cursor/Cargo.toml b/launcher-rs/crates/wujin-cursor/Cargo.toml
new file mode 100644
index 0000000..a4b72a3
--- /dev/null
+++ b/launcher-rs/crates/wujin-cursor/Cargo.toml
@@ -0,0 +1,16 @@
+[package]
+name = "wujin-cursor"
+version = "2.0.0"
+edition = "2024"
+license = "Proprietary"
+
+[dependencies]
+base64 = "0.22"
+ed25519-dalek = "2"
+serde = { version = "1", features = ["derive"] }
+serde_json = "1"
+sha2 = "0.10"
+thiserror = "2"
+
+[dev-dependencies]
+tempfile = "3"
diff --git a/launcher-rs/crates/wujin-cursor/src/lib.rs b/launcher-rs/crates/wujin-cursor/src/lib.rs
new file mode 100644
index 0000000..6dd9b80
--- /dev/null
+++ b/launcher-rs/crates/wujin-cursor/src/lib.rs
@@ -0,0 +1,334 @@
+//! Cursor renewal storage adapter.
+//!
+//! The adapter only touches an explicitly allow-listed JSON storage file after
+//! a detached-signed compatibility entry has been verified. It never changes
+//! Windows identifiers or unrelated client configuration.
+
+use std::{
+    collections::BTreeMap,
+    fs,
+    path::{Path, PathBuf},
+    time::{SystemTime, UNIX_EPOCH},
+};
+
+use base64::Engine;
+use ed25519_dalek::{Signature, Verifier, VerifyingKey};
+use serde::{Deserialize, Serialize};
+use serde_json::Value;
+use sha2::{Digest, Sha256};
+use thiserror::Error;
+
+#[derive(Debug, Error)]
+pub enum CursorError {
+    #[error("cursor compatibility catalog is invalid: {0}")]
+    Catalog(String),
+    #[error("cursor storage error: {0}")]
+    Io(#[from] std::io::Error),
+    #[error("cursor storage JSON is invalid: {0}")]
+    Json(#[from] serde_json::Error),
+    #[error("cursor storage root must be an object")]
+    RootNotObject,
+    #[error("cursor storage verification failed")]
+    Verification,
+}
+
+#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
+#[serde(rename_all = "camelCase")]
+pub struct CompatibilityEntry {
+    pub version: String,
+    pub storage_schema: String,
+    #[serde(default)]
+    pub process_names: Vec<String>,
+    pub adapter_sha256: String,
+    pub verified: bool,
+    pub requires_admin: bool,
+}
+
+#[derive(Debug, Clone, Serialize, Deserialize)]
+#[serde(rename_all = "camelCase")]
+struct SignedCatalog {
+    schema_version: u32,
+    entries: Vec<CompatibilityEntry>,
+    signature: String,
+}
+
+#[derive(Debug, Clone, Default)]
+pub struct CompatibilityCatalog {
+    entries: BTreeMap<String, CompatibilityEntry>,
+}
+
+impl CompatibilityCatalog {
+    pub fn from_entries(
+        entries: impl IntoIterator<Item = CompatibilityEntry>,
+    ) -> Result<Self, CursorError> {
+        let mut map = BTreeMap::new();
+        for entry in entries {
+            if entry.version.trim().is_empty()
+                || !entry.verified
+                || entry
+                    .process_names
+                    .iter()
+                    .any(|name| name.trim().is_empty())
+                || entry.adapter_sha256.len() != 64
+                || !entry
+                    .adapter_sha256
+                    .bytes()
+                    .all(|byte| byte.is_ascii_hexdigit())
+                || map.insert(entry.version.clone(), entry).is_some()
+            {
+                return Err(CursorError::Catalog(
+                    "entry is not verified or is duplicated".into(),
+                ));
+            }
+        }
+        Ok(Self { entries: map })
+    }
+
+    pub fn verified_entry(&self, version: &str) -> Option<&CompatibilityEntry> {
+        self.entries.get(version)
+    }
+
+    pub fn load_signed(bytes: &[u8], public_key: &[u8; 32]) -> Result<Self, CursorError> {
+        let signed: SignedCatalog = serde_json::from_slice(bytes)
+            .map_err(|error| CursorError::Catalog(error.to_string()))?;
+        if signed.schema_version != 1 {
+            return Err(CursorError::Catalog("unsupported schema".into()));
+        }
+        let key = VerifyingKey::from_bytes(public_key)
+            .map_err(|error| CursorError::Catalog(error.to_string()))?;
+        let signature_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
+            .decode(signed.signature.as_bytes())
+            .map_err(|_| CursorError::Catalog("signature is not base64".into()))?;
+        let signature = Signature::from_slice(&signature_bytes)
+            .map_err(|error| CursorError::Catalog(error.to_string()))?;
+        let payload = serde_json::to_vec(&serde_json::json!({
+            "entries": signed.entries,
+            "schemaVersion": signed.schema_version,
+        }))
+        .map_err(|error| CursorError::Catalog(error.to_string()))?;
+        key.verify(&payload, &signature)
+            .map_err(|_| CursorError::Catalog("signature verification failed".into()))?;
+        Self::from_entries(signed.entries)
+    }
+}
+
+#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
+#[serde(rename_all = "camelCase")]
+pub struct RenewalResult {
+    pub backup_created: bool,
+    pub backup_path: Option<PathBuf>,
+    pub backup_created_at: Option<u64>,
+    pub changed: bool,
+    pub verified: bool,
+    pub needs_admin: bool,
+    pub unsupported: bool,
+    pub restored: bool,
+    pub failed: bool,
+    pub detail: String,
+}
+
+pub fn renew_storage(
+    target: &Path,
+    backup_root: &Path,
+    version: &str,
+    catalog: &CompatibilityCatalog,
+    nonce: &str,
+) -> Result<RenewalResult, CursorError> {
+    let Some(entry) = catalog.verified_entry(version) else {
+        return Ok(RenewalResult {
+            backup_created: false,
+            backup_path: None,
+            backup_created_at: None,
+            changed: false,
+            verified: false,
+            needs_admin: false,
+            unsupported: true,
+            restored: false,
+            failed: false,
+            detail: format!("Cursor {version} 未进入已签名兼容目录"),
+        });
+    };
+    if entry.storage_schema != "json-v1" {
+        return Err(CursorError::Catalog("unsupported storage schema".into()));
+    }
+    if entry.adapter_sha256 != adapter_hash() {
+        return Err(CursorError::Catalog(
+            "adapter hash does not match catalog".into(),
+        ));
+    }
+    let original = fs::read(target)?;
+    let mut object: serde_json::Map<String, Value> =
+        serde_json::from_slice::<Option<serde_json::Map<String, Value>>>(&original)?
+            .ok_or(CursorError::RootNotObject)?;
+    fs::create_dir_all(backup_root)?;
+    let backup_created_at = SystemTime::now()
+        .duration_since(UNIX_EPOCH)
+        .map_err(|error| CursorError::Catalog(error.to_string()))?
+        .as_secs();
+    let backup = backup_root.join(format!(
+        "cursor-{}-{backup_created_at}.storage.json.bak",
+        filesystem_name(version)
+    ));
+    fs::write(&backup, &original)?;
+    object.insert("wujinRenewalMarker".into(), Value::String(nonce.into()));
+    let changed = serde_json::to_vec_pretty(&object)?;
+    let temporary = target.with_extension("wujin.tmp");
+    fs::write(&temporary, &changed)?;
+    fs::rename(&temporary, target)?;
+    let readback: serde_json::Map<String, Value> =
+        serde_json::from_slice::<Option<serde_json::Map<String, Value>>>(&fs::read(target)?)?
+            .ok_or(CursorError::RootNotObject)?;
+    if readback.get("wujinRenewalMarker").and_then(Value::as_str) != Some(nonce) {
+        let _ = fs::copy(&backup, target);
+        return Err(CursorError::Verification);
+    }
+    Ok(RenewalResult {
+        backup_created: true,
+        backup_path: Some(backup),
+        backup_created_at: Some(backup_created_at),
+        changed: original != changed,
+        verified: true,
+        needs_admin: entry.requires_admin,
+        unsupported: false,
+        restored: false,
+        failed: false,
+        detail: format!("Cursor {version} 已完成受控存储更新"),
+    })
+}
+
+pub fn restore_storage(target: &Path, backup: &Path) -> Result<RenewalResult, CursorError> {
+    let bytes = fs::read(backup)?;
+    let _: serde_json::Map<String, Value> =
+        serde_json::from_slice::<Option<serde_json::Map<String, Value>>>(&bytes)?
+            .ok_or(CursorError::RootNotObject)?;
+    let temporary = target.with_extension("wujin.restore.tmp");
+    fs::write(&temporary, &bytes)?;
+    fs::rename(&temporary, target)?;
+    Ok(RenewalResult {
+        backup_created: false,
+        backup_path: Some(backup.to_path_buf()),
+        backup_created_at: None,
+        changed: true,
+        verified: fs::read(target)? == bytes,
+        needs_admin: false,
+        unsupported: false,
+        restored: true,
+        failed: false,
+        detail: "Cursor 已恢复上次备份".into(),
+    })
+}
+
+pub fn adapter_hash() -> String {
+    let source = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"));
+    Sha256::digest(source)
+        .iter()
+        .map(|byte| format!("{byte:02x}"))
+        .collect()
+}
+
+fn filesystem_name(value: &str) -> String {
+    value
+        .chars()
+        .map(|character| {
+            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
+                character
+            } else {
+                '_'
+            }
+        })
+        .collect()
+}
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+    use ed25519_dalek::{Signer, SigningKey};
+    use tempfile::tempdir;
+
+    fn entry(version: &str) -> CompatibilityEntry {
+        CompatibilityEntry {
+            version: version.into(),
+            storage_schema: "json-v1".into(),
+            process_names: vec!["Cursor.exe".into()],
+            adapter_sha256: adapter_hash(),
+            verified: true,
+            requires_admin: false,
+        }
+    }
+
+    #[test]
+    fn unknown_version_does_not_create_backup_or_mutate_storage() {
+        let dir = tempdir().unwrap();
+        let target = dir.path().join("storage.json");
+        fs::write(&target, br#"{"user":"fixture"}"#).unwrap();
+        let before = fs::read(&target).unwrap();
+        let catalog = CompatibilityCatalog::from_entries([entry("1.0.0")]).unwrap();
+        let result =
+            renew_storage(&target, &dir.path().join("backup"), "2.0.0", &catalog, "N").unwrap();
+        assert!(result.unsupported);
+        assert_eq!(fs::read(&target).unwrap(), before);
+        assert!(!dir.path().join("backup").exists());
+    }
+
+    #[test]
+    fn supported_storage_is_backed_up_updated_and_restored() {
+        let dir = tempdir().unwrap();
+        let target = dir.path().join("storage.json");
+        fs::write(&target, br#"{"user":"fixture"}"#).unwrap();
+        let original = fs::read(&target).unwrap();
+        let catalog = CompatibilityCatalog::from_entries([entry("1.0.0")]).unwrap();
+        let result =
+            renew_storage(&target, &dir.path().join("backup"), "1.0.0", &catalog, "N").unwrap();
+        assert!(result.backup_created && result.changed && result.verified);
+        let backup = result.backup_path.unwrap();
+        assert!(
+            serde_json::from_slice::<Value>(&fs::read(&target).unwrap())
+                .unwrap()
+                .get("wujinRenewalMarker")
+                .is_some()
+        );
+        let restored = restore_storage(&target, &backup).unwrap();
+        assert!(restored.restored && restored.verified);
+        assert_eq!(fs::read(&target).unwrap(), original);
+    }
+
+    #[test]
+    fn malformed_storage_fails_before_backup() {
+        let dir = tempdir().unwrap();
+        let target = dir.path().join("storage.json");
+        fs::write(&target, b"not-json").unwrap();
+        let catalog = CompatibilityCatalog::from_entries([entry("1.0.0")]).unwrap();
+        assert!(matches!(
+            renew_storage(&target, &dir.path().join("backup"), "1.0.0", &catalog, "N"),
+            Err(CursorError::Json(_))
+        ));
+        assert!(
+            !dir.path()
+                .join("backup/cursor-1.0.0.storage.json.bak")
+                .exists()
+        );
+    }
+
+    #[test]
+    fn signed_catalog_rejects_tampering() {
+        let signing = SigningKey::from_bytes(&[9_u8; 32]);
+        let entries = vec![entry("1.0.0")];
+        let payload =
+            serde_json::to_vec(&serde_json::json!({"entries": entries, "schemaVersion": 1}))
+                .unwrap();
+        let signature = base64::engine::general_purpose::URL_SAFE_NO_PAD
+            .encode(signing.sign(&payload).to_bytes());
+        let bytes = serde_json::to_vec(&serde_json::json!({"schemaVersion":1,"entries":[entry("1.0.0")],"signature":signature})).unwrap();
+        assert!(
+            CompatibilityCatalog::load_signed(&bytes, &signing.verifying_key().to_bytes()).is_ok()
+        );
+        let tampered = bytes
+            .iter()
+            .map(|byte| if *byte == b'1' { b'2' } else { *byte })
+            .collect::<Vec<_>>();
+        assert!(
+            CompatibilityCatalog::load_signed(&tampered, &signing.verifying_key().to_bytes())
+                .is_err()
+        );
+    }
+}
diff --git a/launcher-rs/src-tauri/Cargo.toml b/launcher-rs/src-tauri/Cargo.toml
index f03f976..41e6c19 100644
--- a/launcher-rs/src-tauri/Cargo.toml
+++ b/launcher-rs/src-tauri/Cargo.toml
@@ -11,6 +11,7 @@ workspace = true
 [dependencies]
 serde = { version = "1.0", features = ["derive"] }
 serde_json = "1.0"
+base64 = "0.22"
 reqwest = { version = "0.12", default-features = false, features = ["blocking", "json", "rustls-tls"] }
 chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }
 tauri = { version = "2.0", default-features = false, features = ["wry"] }
@@ -18,6 +19,7 @@ wujin-core = { path = "../crates/wujin-core" }
 wujin-windows = { path = "../crates/wujin-windows" }
 wujin-update = { path = "../crates/wujin-update" }
 wujin-install = { path = "../crates/wujin-install" }
+wujin-cursor = { path = "../crates/wujin-cursor" }
 sha2 = "0.10"

 [build-dependencies]
diff --git a/launcher-rs/src-tauri/src/commands.rs b/launcher-rs/src-tauri/src/commands.rs
index 279fc8f..c2ad3db 100644
--- a/launcher-rs/src-tauri/src/commands.rs
+++ b/launcher-rs/src-tauri/src/commands.rs
@@ -2,6 +2,7 @@ use std::fs;
 use std::path::PathBuf;
 use std::sync::{Arc, atomic::Ordering};

+use base64::Engine;
 use serde::Serialize;
 use tauri::{AppHandle, State};
 use wujin_core::ClientConfigurationOptions;
@@ -17,6 +18,7 @@ use wujin_core::license::MigrationLedger;
 use wujin_core::models::{ClientDetection, ClientId, ClientResult, FileResult, Status};
 use wujin_core::payload::PayloadSource;
 use wujin_core::service::restore_backup as restore_backup_file;
+use wujin_cursor::{CompatibilityCatalog, renew_storage, restore_storage};
 use wujin_windows::device_key_store::WindowsDeviceIdentityStore;
 use wujin_windows::links::{open_https_link, open_website_link};

@@ -2109,51 +2111,139 @@ pub struct CursorRenewalState {
     pub detail: String,
 }

-#[tauri::command]
-pub fn detect_cursor_renewal(state: State<'_, AppState>) -> Result<CursorRenewalState, AppError> {
-    let manifest = state
-        .inner
+fn cursor_manifest_path(state: &AppStateInner) -> PathBuf {
+    state
         .paths
         .user_profile
-        .join("AppData/Local/Programs/cursor/resources/app/package.json");
+        .join("AppData/Local/Programs/cursor/resources/app/package.json")
+}
+
+fn cursor_storage_path(state: &AppStateInner) -> PathBuf {
+    std::env::var_os("WUJIN_CURSOR_STORAGE_PATH")
+        .map(PathBuf::from)
+        .unwrap_or_else(|| {
+            state
+                .paths
+                .user_profile
+                .join("AppData/Roaming/Cursor/User/globalStorage/storage.json")
+        })
+}
+
+fn cursor_catalog(_state: &AppStateInner) -> Result<CompatibilityCatalog, AppError> {
+    let catalog_path = std::env::var_os("WUJIN_CURSOR_CATALOG_PATH")
+        .map(PathBuf::from)
+        .ok_or_else(|| AppError("当前构建未配置 Cursor 签名兼容目录".into()))?;
+    let key_text = std::env::var("WUJIN_CURSOR_CATALOG_PUBLIC_KEY")
+        .map_err(|_| AppError("当前构建未配置 Cursor 兼容目录公钥".into()))?;
+    let key_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
+        .decode(key_text.trim())
+        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(key_text.trim()))
+        .map_err(|_| AppError("Cursor 兼容目录公钥编码无效".into()))?;
+    let key: [u8; 32] = key_bytes
+        .try_into()
+        .map_err(|_| AppError("Cursor 兼容目录公钥长度无效".into()))?;
+    let bytes = std::fs::read(catalog_path).map_err(|error| AppError(error.to_string()))?;
+    CompatibilityCatalog::load_signed(&bytes, &key)
+        .map_err(|error| AppError(format!("Cursor 兼容目录校验失败: {error}")))
+}
+
+fn cursor_version(state: &AppStateInner) -> Result<Option<String>, AppError> {
+    let manifest = cursor_manifest_path(state);
     if !manifest.is_file() {
-        return Ok(CursorRenewalState {
-            detected: false,
-            supported: false,
-            version: None,
-            detail: "未检测到 Cursor".into(),
-        });
+        return Ok(None);
     }
     let value: serde_json::Value = serde_json::from_slice(
         &std::fs::read(manifest).map_err(|error| AppError(error.to_string()))?,
     )
     .map_err(|_| AppError("Cursor 版本清单格式无效".into()))?;
-    let version = value
+    Ok(value
         .get("version")
         .and_then(|v| v.as_str())
-        .map(str::to_owned);
+        .map(str::to_owned))
+}
+
+#[tauri::command]
+pub fn detect_cursor_renewal(state: State<'_, AppState>) -> Result<CursorRenewalState, AppError> {
+    let version = cursor_version(&state.inner)?;
+    let Some(version) = version.clone() else {
+        return Ok(CursorRenewalState {
+            detected: false,
+            supported: false,
+            version: None,
+            detail: "未检测到 Cursor".into(),
+        });
+    };
+    let storage = cursor_storage_path(&state.inner);
+    let catalog = match cursor_catalog(&state.inner) {
+        Ok(catalog) => catalog,
+        Err(error) => {
+            return Ok(CursorRenewalState {
+                detected: true,
+                supported: false,
+                version: Some(version),
+                detail: error.0,
+            });
+        }
+    };
+    let supported = catalog.verified_entry(&version).is_some() && storage.is_file();
     Ok(CursorRenewalState {
         detected: true,
-        supported: false,
-        version,
-        detail: "当前版本未进入签名兼容目录，续杯保持只读".into(),
+        supported,
+        version: Some(version),
+        detail: if supported {
+            "当前 Cursor 版本已通过签名兼容目录校验".into()
+        } else if !storage.is_file() {
+            "已检测 Cursor，但未找到受控存储文件".into()
+        } else {
+            "当前版本未进入签名兼容目录，续杯保持只读".into()
+        },
     })
 }

 #[tauri::command]
 pub fn run_cursor_renewal(state: State<'_, AppState>) -> Result<CursorRenewalState, AppError> {
     require_paid_authorization(&state.inner)?;
-    let result = detect_cursor_renewal(state)?;
+    let result = detect_cursor_renewal(state.clone())?;
     if !result.supported {
         return Err(AppError(result.detail));
     }
-    Ok(result)
+    let version = result
+        .version
+        .clone()
+        .ok_or_else(|| AppError("Cursor 版本缺失".into()))?;
+    let catalog = cursor_catalog(&state.inner)?;
+    let storage = cursor_storage_path(&state.inner);
+    let backup_root = state.inner.paths.backup_root.join("cursor");
+    let nonce = format!("wujin-{}", chrono::Utc::now().timestamp_millis());
+    let renewal = renew_storage(&storage, &backup_root, &version, &catalog, &nonce)
+        .map_err(|error| AppError(format!("Cursor 续杯失败: {error}")))?;
+    if let Some(path) = renewal.backup_path {
+        *state
+            .inner
+            .cursor_backup
+            .lock()
+            .map_err(|_| AppError("Cursor 备份状态锁定失败".into()))? = Some(path);
+    }
+    Ok(CursorRenewalState {
+        detail: renewal.detail,
+        ..result
+    })
 }

 #[tauri::command]
 pub fn restore_cursor_backup(state: State<'_, AppState>) -> Result<bool, AppError> {
     require_paid_authorization(&state.inner)?;
-    Ok(false)
+    let backup = state
+        .inner
+        .cursor_backup
+        .lock()
+        .map_err(|_| AppError("Cursor 备份状态锁定失败".into()))?
+        .clone()
+        .ok_or_else(|| AppError("没有可恢复的 Cursor 备份".into()))?;
+    let target = cursor_storage_path(&state.inner);
+    let result = restore_storage(&target, &backup)
+        .map_err(|error| AppError(format!("Cursor 恢复失败: {error}")))?;
+    Ok(result.restored && result.verified)
 }

 #[derive(Debug, Clone, Serialize)]
diff --git a/launcher-rs/src-tauri/src/state.rs b/launcher-rs/src-tauri/src/state.rs
index c2616bf..a948d9f 100644
--- a/launcher-rs/src-tauri/src/state.rs
+++ b/launcher-rs/src-tauri/src/state.rs
@@ -39,6 +39,7 @@ pub struct AppStateInner {
     pub logs: Mutex<Vec<LogEntry>>,
     pub free_skill_results: Mutex<Vec<FreeSkillInstallResult>>,
     pub free_skill_logs: Mutex<Vec<FreeSkillLogEntry>>,
+    pub cursor_backup: Mutex<Option<PathBuf>>,
     pub links: BTreeMap<String, String>,
 }

@@ -177,6 +178,7 @@ impl AppState {
                 logs: Mutex::new(Vec::new()),
                 free_skill_results: Mutex::new(Vec::new()),
                 free_skill_logs: Mutex::new(Vec::new()),
+                cursor_backup: Mutex::new(None),
                 links,
             }),
         }
diff --git a/launcher-rs/ui/src/pages/ConfigurePage.tsx b/launcher-rs/ui/src/pages/ConfigurePage.tsx
index fdd7366..72806d9 100644
--- a/launcher-rs/ui/src/pages/ConfigurePage.tsx
+++ b/launcher-rs/ui/src/pages/ConfigurePage.tsx
@@ -1,5 +1,5 @@
 import { useEffect, useRef, useState, type KeyboardEvent } from "react";
-import { bootstrap, configureSelected, runCursorRenewal } from "../api";
+import { bootstrap, configureSelected, restoreCursorBackup, runCursorRenewal } from "../api";
 import { configurationBlocker, configureSteps } from "../state/app-state";
 import { nextDialogFocusIndex } from "../state/dialog-focus";
 import { Button, PageHeader, Panel } from "./shared";
@@ -10,6 +10,7 @@ export function ConfigurePage({ state, setState, onNavigate }: PageProps) {
   const progress = Math.min(Math.max(state.progress.completed, 0), totalSteps);
   const [blocker, setBlocker] = useState<ReturnType<typeof configurationBlocker>>(null);
   const [cursorMessage, setCursorMessage] = useState("");
+  const [cursorBackupReady, setCursorBackupReady] = useState(false);
   const previousFocus = useRef<HTMLElement | null>(null);
   const dialogRef = useRef<HTMLDivElement | null>(null);
   const dismissBlocker = () => {
@@ -38,7 +39,10 @@ export function ConfigurePage({ state, setState, onNavigate }: PageProps) {
   };
   const renewCursor = () => {
     setCursorMessage("正在检测兼容版本…");
-    void runCursorRenewal().then((result) => setCursorMessage(result.detail)).catch((error: unknown) => setCursorMessage(error instanceof Error ? error.message : "Cursor 续杯未执行"));
+    void runCursorRenewal().then((result) => { setCursorMessage(result.detail); setCursorBackupReady(true); }).catch((error: unknown) => { setCursorBackupReady(false); setCursorMessage(error instanceof Error ? error.message : "Cursor 续杯未执行"); });
+  };
+  const restoreCursor = () => {
+    void restoreCursorBackup().then((restored) => setCursorMessage(restored ? "Cursor 已恢复续杯前备份" : "Cursor 备份恢复未完成")).catch((error: unknown) => setCursorMessage(error instanceof Error ? error.message : "Cursor 备份恢复失败"));
   };
   const continueFromBlocker = () => {
     const page = blocker === "noClients" ? "clients" : "activation";
@@ -62,5 +66,5 @@ export function ConfigurePage({ state, setState, onNavigate }: PageProps) {
   const blockerTitle = blocker === "noClients" ? "请先选择 AI 客户端" : "请先激活产品";
   const blockerMessage = blocker === "noClients" ? "选择至少一个已检测到的 AI 客户端后，才能开始一键配置。" : "激活成功后，才能开始一键配置所选客户端。";
   const blockerAction = blocker === "noClients" ? "去选择客户端" : "去激活";
-  return <div className="page"><PageHeader eyebrow="步骤 03 / 03" title="一键配置项目环境" lead="程序会准备项目文件，并自动连接到你刚才选择的 AI 客户端。"/><div className="info-banner">本流程不会下载第三方软件，不安装工具链，不启动服务，不申请 UAC。</div>{state.selected.includes("cursor") && <Panel><div className="page-actions"><span>Cursor 一键续杯</span><Button onClick={renewCursor}>一键续杯</Button></div>{cursorMessage && <div className="field-help" aria-live="polite">{cursorMessage}</div>}</Panel>}<div className="configure-grid"><Panel><div className="progress-head"><span>{state.bootstrap.busy ? state.progress.message : state.configureStarted ? "配置完成" : "等待开始"}</span><strong>{Math.round((progress / totalSteps) * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${(progress / totalSteps) * 100}%` }}/></div><div className="steps">{configureSteps.map((step, index) => <div className="step" key={step}><span className={index < progress ? "step-number done" : "step-number"}>{index < progress ? "✓" : index + 1}</span><span className={index <= progress ? "step-label current" : "step-label"}>{step}</span><small>{index < progress ? "完成" : index === progress && state.bootstrap.busy ? "执行中" : "等待"}</small></div>)}</div><Button primary disabled={state.bootstrap.busy} onClick={start}>{state.bootstrap.busy ? "正在配置" : state.configureStarted ? "重新配置" : "开始一键配置"}</Button></Panel><Panel className="summary-panel"><div className="summary-number">{state.selected.length}</div><span>选定 AI 客户端</span><hr/><div className="summary-number green">0</div><span>第三方软件下载</span><hr/><div className="summary-number green">无需</div><span>管理员权限</span></Panel></div>{state.error && <div className="error-banner">{state.error}</div>}{blocker && <div className="modal-backdrop"><div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="configuration-blocker-title" aria-describedby="configuration-blocker-message" tabIndex={-1} onKeyDown={handleBlockerKeyDown}><div className="modal-icon error">!</div><h2 id="configuration-blocker-title">{blockerTitle}</h2><p id="configuration-blocker-message">{blockerMessage}</p><div className="modal-actions"><button id="configuration-blocker-cancel" className="button" autoFocus onClick={dismissBlocker}>取消</button><Button primary onClick={continueFromBlocker}>{blockerAction}</Button></div></div></div>}</div>;
+  return <div className="page"><PageHeader eyebrow="步骤 03 / 03" title="一键配置项目环境" lead="程序会准备项目文件，并自动连接到你刚才选择的 AI 客户端。"/><div className="info-banner">本流程不会下载第三方软件，不安装工具链，不启动服务，不申请 UAC。</div>{state.selected.includes("cursor") && <Panel><div className="page-actions"><span>Cursor 一键续杯</span><Button onClick={renewCursor}>一键续杯</Button>{cursorBackupReady && <Button onClick={restoreCursor}>恢复备份</Button>}</div>{cursorMessage && <div className="field-help" aria-live="polite">{cursorMessage}</div>}</Panel>}<div className="configure-grid"><Panel><div className="progress-head"><span>{state.bootstrap.busy ? state.progress.message : state.configureStarted ? "配置完成" : "等待开始"}</span><strong>{Math.round((progress / totalSteps) * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${(progress / totalSteps) * 100}%` }}/></div><div className="steps">{configureSteps.map((step, index) => <div className="step" key={step}><span className={index < progress ? "step-number done" : "step-number"}>{index < progress ? "✓" : index + 1}</span><span className={index <= progress ? "step-label current" : "step-label"}>{step}</span><small>{index < progress ? "完成" : index === progress && state.bootstrap.busy ? "执行中" : "等待"}</small></div>)}</div><Button primary disabled={state.bootstrap.busy} onClick={start}>{state.bootstrap.busy ? "正在配置" : state.configureStarted ? "重新配置" : "开始一键配置"}</Button></Panel><Panel className="summary-panel"><div className="summary-number">{state.selected.length}</div><span>选定 AI 客户端</span><hr/><div className="summary-number green">0</div><span>第三方软件下载</span><hr/><div className="summary-number green">无需</div><span>管理员权限</span></Panel></div>{state.error && <div className="error-banner">{state.error}</div>}{blocker && <div className="modal-backdrop"><div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="configuration-blocker-title" aria-describedby="configuration-blocker-message" tabIndex={-1} onKeyDown={handleBlockerKeyDown}><div className="modal-icon error">!</div><h2 id="configuration-blocker-title">{blockerTitle}</h2><p id="configuration-blocker-message">{blockerMessage}</p><div className="modal-actions"><button id="configuration-blocker-cancel" className="button" autoFocus onClick={dismissBlocker}>取消</button><Button primary onClick={continueFromBlocker}>{blockerAction}</Button></div></div></div>}</div>;
 }
diff --git a/launcher-rs/ui/tests/v2-navigation.test.js b/launcher-rs/ui/tests/v2-navigation.test.js
index 8f953a0..593b911 100644
--- a/launcher-rs/ui/tests/v2-navigation.test.js
+++ b/launcher-rs/ui/tests/v2-navigation.test.js
@@ -48,3 +48,13 @@ test("mobile entrypoint enables viewport-based responsive layout", () => {
   assert.match(index, /name="viewport"/);
   assert.match(index, /width=device-width/);
 });
+
+test("Cursor one-click renewal stays behind the paid command boundary", () => {
+  const api = readUi("src/api.ts");
+  const configure = readUi("src/pages/ConfigurePage.tsx");
+  assert.match(api, /run_cursor_renewal/);
+  assert.match(api, /restore_cursor_backup/);
+  assert.match(configure, /state\.selected\.includes\("cursor"\)/);
+  assert.match(configure, /一键续杯/);
+  assert.match(configure, /恢复备份/);
+});
