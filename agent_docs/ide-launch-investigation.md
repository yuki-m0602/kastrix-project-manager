# IDE起動コマンド 調査レポート

> 調査日: 2026-03-11  
> 対象: `src-tauri/src/commands/projects.rs` の `open_in_ide` 実装  
> **更新**: URLプロトコル方式で実装済み（`opener` クレート使用）

---

## 1. 現状の実装（2026-03-11 更新後）

`vscode://file/{path}/` および `cursor://file/{path}/` を `opener` クレートで開く方式。  
PATH に依存せず、OS が登録したプロトコルハンドラで起動する。

---

## 2. 問題点

### 2-1. PATH の継承問題（最重要）

**Tauri アプリを GUI から起動した場合、ユーザーの PATH が継承されない。**

- **macOS**: ダブルクリックで `.app` を起動すると、シェルの PATH が渡らない
- **Windows**: Explorer 経由で起動した場合、レジストリのシステム/ユーザー PATH は継承されるが、**ターミナルで追加した PATH は反映されない**
- 結果: `code` / `cursor` / `opencode` が「見つからない」エラーになる可能性が高い

**参考**: [tauri-apps/plugins-workspace#1406](https://github.com/tauri-apps/plugins-workspace/issues/1406)  
→ 解決策として `fix-path-env` クレートの利用が提案されている（macOS/Linux向け）

---

### 2-2. 各 IDE のコマンド・パス

| IDE | 想定コマンド | Windows の一般的なパス | 備考 |
|-----|--------------|-------------------------|------|
| **VSCode** | `code` | `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`<br>または `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd` | User セットアップ時。`code` は `code.cmd` のラッパー |
| **Cursor** | `cursor` | `%LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor.cmd` | 「Shell Command: Install 'cursor' command in PATH」を実行しないと PATH に載らない |
| **OpenCode** | `opencode` | **要確認** | opencode.ai は AI コーディングエージェントであり、VSCode/Cursor 用拡張。スタンドアロン IDE の `opencode` コマンドは一般的でない |

---

### 2-3. OpenCode の扱い

- **opencode.ai**: VSCode/Cursor 用の AI 拡張。`opencode` はターミナル用 CLI（IDE 起動用ではない）
- **mockup の想定**: `C:\Users\%USERNAME%\AppData\Local\Programs\OpenCode\OpenCode.exe`  
  → 別製品か、OpenCode デスクトップアプリ（ベータ）の可能性
- **implementation-guide.md**: 「`opencode` の CLI コマンド名は要確認」と記載済み

---

### 2-4. Windows での `code.cmd` の挙動

- `code` は実体として `code.cmd`（バッチ）を実行
- `code.cmd` 実行時に CMD ウィンドウが一瞬表示される場合がある
- 直接 `Code.exe` を起動する方が自然な場合がある

---

## 3. 推奨対応案

### 案 A: 絶対パス指定（推奨）

PATH に依存せず、一般的なインストール先を順に試す。

```rust
// Windows の典型的なパス（環境変数で展開）
// VSCode: %LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe
// Cursor: %LOCALAPPDATA%\Programs\cursor\Cursor.exe
// OpenCode: 要ユーザー設定 or 削除
```

- メリット: PATH 非依存で安定
- デメリット: インストール先が異なる環境では失敗する可能性

### 案 B: URL プロトコル（`vscode://`, `cursor://`）

`vscode://file/C:/path/to/project` や `cursor://file/C:/path/to/project` を `shell.open()` で開く。

- メリット: インストール先に依存しない。OS が登録ハンドラで起動
- デメリット: プロトコル登録が必要。OpenCode の `opencode://` は未確認

### 案 C: fix-path-env の利用

`fix-path-env` で GUI 起動時も PATH を補正する。

- メリット: `code` / `cursor` をそのまま使える可能性
- デメリット: macOS/Linux 向け。Windows 対応は要確認

### 案 D: 設定でパスを指定可能にする

Settings の IDE 設定で、各 IDE の実行パスをユーザーが指定できるようにする。

- メリット: あらゆる環境に対応可能
- デメリット: 設定 UI と永続化の実装が必要

---

## 4. 推奨実装方針

1. **短期的**: 案 A を採用し、Windows の一般的なパスを試す。失敗時は `code` / `cursor` にフォールバック
2. **中期的**: 案 D を導入し、Settings で IDE パスをカスタム指定可能にする
3. **OpenCode**: 仕様が固まるまで、一時的に UI から外すか、案 D でユーザー指定のみとする

---

## 5. 参考リンク

- [VS Code CLI](https://code.visualstudio.com/docs/configure/command-line)
- [Cursor CLI](https://cursor.com/docs/cli/overview)
- [Tauri shell PATH issue #1406](https://github.com/tauri-apps/plugins-workspace/issues/1406)
- [fix-path-env-rs](https://github.com/tauri-apps/fix-path-env-rs)
