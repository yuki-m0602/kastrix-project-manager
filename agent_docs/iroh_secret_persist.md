# iroh SecretKey 永続化の設定手順（A 方式）

## 概要

`app_data_dir/iroh_secret.bin` に 32 バイトの秘密鍵を保存し、再起動後も同じ EndpointID を維持する。

## 変更ファイル

### 1. `src-tauri/src/team/iroh_node.rs`

**変更内容:**

1. **import 追加**
   ```rust
   use iroh_base::SecretKey;
   use rand::rngs::OsRng;
   use std::path::Path;
   ```

2. **`load_or_create_secret_key` 関数を追加**
   ```rust
   const SECRET_FILENAME: &str = "iroh_secret.bin";

   fn load_or_create_secret_key(app_data_dir: &Path) -> Result<SecretKey, String> {
       let path = app_data_dir.join(SECRET_FILENAME);
       if path.exists() {
           let bytes: [u8; 32] = std::fs::read(&path)?
               .try_into()
               .map_err(|_| "invalid length")?;
           Ok(SecretKey::from_bytes(&bytes))
       } else {
           let mut bytes = [0u8; 32];
           getrandom::getrandom(&mut bytes)?;
           let key = SecretKey::from_bytes(&bytes);
           std::fs::write(&path, &bytes)?;
           Ok(key)
       }
   }
   ```
   ※ rand と iroh-base の rand_core バージョン競合を避けるため getrandom を使用

3. **`init` のシグネチャと実装を変更**
   ```rust
   /// iroh ノードを初期化（Endpoint, Gossip, Router）
   /// secret_path: 秘密鍵を保存するディレクトリ（app_data_dir）
   pub async fn init(app_data_dir: &Path) -> Result<Self, String> {
       let secret_key = load_or_create_secret_key(app_data_dir)?;
       let endpoint = Endpoint::builder()
           .secret_key(secret_key)
           .alpns(vec![ALPN.to_vec()])
           .discovery_n0()
           .bind()
           .await
           .map_err(|e| format!("iroh bind failed: {}", e))?;
       // ... 以下既存のまま
   }
   ```

### 2. `src-tauri/src/lib.rs`

**変更内容:** `init` に `app_data_dir` を渡す

```rust
tauri::async_runtime::spawn(async move {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    match team::IrohNodeState::init(&app_data_dir).await {
        // ...
    }
});
```

## 保存先

| 環境 | パス例 |
|------|--------|
| Windows | `%APPDATA%\com.kastrix.app\iroh_secret.bin` |
| macOS | `~/Library/Application Support/com.kastrix.app/iroh_secret.bin` |
| Linux | `~/.local/share/com.kastrix.app/iroh_secret.bin` |

※ 実際のパスは `app.path().app_data_dir()` の戻り値による。

## セキュリティ

- 秘密鍵は 32 バイトのバイナリで保存
- ファイルのパーミッションは OS のデフォルト（アプリのデータディレクトリ）
- 将来的に keyring 連携も検討可能

## 動作確認

1. 初回起動後、`app_data_dir` に `iroh_secret.bin` が作成される
2. 再起動後、同じ EndpointID が表示される（デバッグパネルで確認）
3. チーム参加・承認後、再起動してもメンバーとして認識される
