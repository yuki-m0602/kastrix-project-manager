# Kastrix 実装手順書

> 作成日: 2026-03-09  
> 最終精査: 2026-03-09  
> 前提: `plans/implementation-status.md` の調査結果に基づく  
> 参照: `specs/specification.md`

---

## 凡例

- ✅ 完了
- 🔲 未着手
- ⚠️ 注意点あり

---

## Phase 1: 基盤整備

> 目的: プロトタイプの品質を上げ、以降の開発ベースを安定させる

### 1-1. ダミーデータの分離 ✅

- [x] `ui/data/dummy.js` を作成（`projects`, `tasks`, `localProjects`, `activityLogs`, `langColors`）
- [x] `ui/index.html` からデータ定義を削除、`<script src="data/dummy.js">` を追加

### 1-2. UI バグ修正 ✅

- [x] AIチャットの文字化けメッセージを修正（`index.html` L797付近）
- [x] CSS の `@media (max-width: 1023px)` 重複ブロックを1つに統合
- [x] CSS `.touch-scroll` 重複定義を削除
- [x] `#tabs-list` のDOM要素を追加（`renderTabs()` の参照先が存在しない）
- [x] プロジェクトリストビュー（`#projects-list-body`）をハードコードHTML → `renderProjects()` で動的生成に変更

### 1-3. サイドバー修正（仕様 C-01） ✅

仕様では `Overview / Projects / Activity Logs / Inbox / Analytics / Settings` の6項目。  
現状は `Projects` メニューが欠落し、Overview タブ内に統合されている。

- [x] サイドバーに `Projects` ナビボタンを追加
- [x] `setActiveMenu('projects')` → Overview ビューを表示 + Projects タブに切替
- [x] モバイルでも Projects 選択時にサイドバーを自動で閉じる

> 方針: Overview 内の Projects/Tasks タブ構造を維持。サイドバーの Projects ボタンは Overview + Projects タブへのショートカットとして機能。

### 1-4. セキュリティ基盤 ✅

CSP（Content Security Policy）は後回しにせず早期に設定する。

- [x] `tauri.conf.json` の `"csp": null` を適切な値に変更

```json
"security": {
  "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
}
```

> ⚠️ Tailwind CSS の CDN 版（`vendor/tailwind.js`）は `'unsafe-inline'` で style を生成するため、`style-src 'unsafe-inline'` が必要。将来的にビルド済みCSSに移行すれば削除可能。

### 1-5. JS ファイル分割 ✅

現在 `index.html` 内のインラインJSを外部ファイルに分割済み。  
※ `mockup/js/` に既に分割案がある（`state.js`, `sidebar.js`, `tabs.js`, `tasks.js`, `projects.js`, `views.js`, `main.js`）。

```
ui/js/
├── state.js       … 状態変数
├── sidebar.js     … サイドバー制御
├── tabs.js        … タブ管理
├── tasks.js       … タスク表示・フィルタ・モーダル
├── projects.js    … プロジェクト表示・フィルタ・モーダル
├── ai-chat.js     … AIチャット制御
└── main.js        … 初期化・グローバルイベント
```

> ⚠️ 分割する場合、`<script>` タグの読み込み順序に注意。`dummy.js` → `state.js` → 各モジュール → `main.js` の順。

---

## Phase 2: バックエンド基盤 ✅

> 目的: フロントエンドのダミーデータを実データに置き換えるための基盤を構築する

### 2-1. クレート追加 ✅

`src-tauri/Cargo.toml` に以下を追加:

```toml
[dependencies]
# 既存
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# 新規追加
rusqlite = { version = "0.32", features = ["bundled"] }
uuid = { version = "1", features = ["v4"] }
git2 = "0.19"
notify = "7"
chrono = { version = "0.4", features = ["serde"] }
```

> ⚠️ `rusqlite` の `bundled` featureはSQLiteをソースからビルドするため、初回ビルド時間が増加する。  
> ⚠️ `git2` はネイティブ依存（`libgit2`）が必要。Windows では `bundled` featureで自動ビルドされるが、Linux/macOS ではシステムに `cmake` + `pkg-config` が必要な場合がある。

### 2-2. Tauri Capabilities 更新 ✅

`src-tauri/capabilities/default.json` を更新:

```json
{
  "identifier": "default",
  "description": "Default capability for Kastrix",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-open",
    "shell:allow-execute",
    "dialog:default"
  ]
}
```

必要に応じて追加するプラグインの `Cargo.toml` + `tauri.conf.json` 登録も忘れないこと:

```toml
tauri-plugin-dialog = "2"
```

### 2-3. ファイル構成 ✅

```
src-tauri/src/
├── lib.rs            … Tauri app 構築・State管理・コマンド登録
├── main.rs           … エントリポイント（変更なし）
├── db.rs             … DB 初期化・マイグレーション・接続管理
├── models.rs         … データモデル（Project, Task, ActivityLog）
├── git_util.rs       … Git リポジトリ情報取得
├── watcher.rs        … ディレクトリ監視
├── lang_detect.rs    … プロジェクト言語の自動検出
└── commands/
    ├── mod.rs
    ├── projects.rs   … プロジェクト系コマンド
    ├── tasks.rs      … タスク系コマンド
    └── logs.rs       … ログ系コマンド
```

### 2-4. データベース設計 ✅

#### テーブル定義

```sql
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  path            TEXT NOT NULL UNIQUE,
  language        TEXT,
  local_modified  TEXT,
  git_modified    TEXT,
  last_commit     TEXT,
  has_readme      INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT CHECK(status IN ('todo','in-progress','done')) DEFAULT 'todo',
  priority    TEXT CHECK(priority IN ('high','medium','low')) DEFAULT 'medium',
  due_date    TEXT,
  assignee    TEXT,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id            TEXT PRIMARY KEY,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  action        TEXT CHECK(action IN ('created','started','completed','updated')),
  task_title    TEXT,
  project_name  TEXT,
  modified_by   TEXT,
  timestamp     TEXT DEFAULT (datetime('now'))
);
```

> ⚠️ `ON DELETE CASCADE` / `ON DELETE SET NULL` を追加。プロジェクト削除時にタスクも連鎖削除、ログは参照を NULL にして残す。  
> ⚠️ ID は `uuid` crate の `Uuid::new_v4().to_string()` で生成する。  
> ⚠️ 仕様書の `readmeContent` は DB に保存しない。`get_readme` コマンドでファイルから都度読み込む（巨大な README の DB 肥大化を防ぐ）。

#### データモデルとダミーデータの不一致

| フィールド | 仕様書 (§4) | ダミーデータ (`dummy.js`) | DB カラム |
|-----------|-------------|-------------------------|-----------|
| 期日 | `dueDate` | `date` | `due_date` |
| アクション | — | `action`（tasks内に混在） | activity_logs テーブルに分離 |

Phase 3 でフロントエンドを接続する際に `date` → `dueDate` のフィールド名を統一すること。

#### 実装手順

1. `db.rs` を作成 — `init_db()` でテーブル作成、`Mutex<Connection>` を返す
2. `models.rs` を作成 — `Project`, `Task`, `ActivityLog`, `CreateTaskInput`, `UpdateTaskInput` を `Serialize`/`Deserialize` で定義
3. `lib.rs` の `setup` で `init_db()` を呼び、`app.manage()` で State 登録

### 2-5. Tauri コマンド定義 ✅

#### コマンド一覧

```rust
// ── projects ──────────────────────────────────────────────
#[tauri::command]
fn scan_directory(path: String, state: State<DbState>) -> Result<Vec<Project>, String>

#[tauri::command]
fn get_projects(state: State<DbState>) -> Result<Vec<Project>, String>

#[tauri::command]
fn get_project(id: String, state: State<DbState>) -> Result<Project, String>

#[tauri::command]
fn get_readme(path: String) -> Result<String, String>
// README.md をファイルシステムから直接読み込む

#[tauri::command]
async fn open_in_ide(app: AppHandle, ide: String, path: String) -> Result<(), String>
// tauri_plugin_shell::ShellExt を使用

// ── tasks ─────────────────────────────────────────────────
#[tauri::command]
fn get_tasks(project_id: Option<String>, state: State<DbState>) -> Result<Vec<Task>, String>

#[tauri::command]
fn create_task(input: CreateTaskInput, state: State<DbState>) -> Result<Task, String>
// activity_logs にも自動で "created" を記録

#[tauri::command]
fn update_task(id: String, input: UpdateTaskInput, state: State<DbState>) -> Result<Task, String>
// activity_logs にも自動で "updated" を記録

#[tauri::command]
fn delete_task(id: String, state: State<DbState>) -> Result<(), String>

#[tauri::command]
fn update_task_status(id: String, status: String, state: State<DbState>) -> Result<Task, String>
// status 変化に応じて "started" or "completed" を記録

// ── logs ──────────────────────────────────────────────────
#[tauri::command]
fn get_activity_logs(project_id: Option<String>, state: State<DbState>) -> Result<Vec<ActivityLog>, String>

#[tauri::command]
fn export_logs_csv(project_id: Option<String>, state: State<DbState>) -> Result<String, String>
// CSV 文字列を返却。フロントエンドで Blob → ダウンロードリンク生成、
// または tauri-plugin-dialog の保存ダイアログを使用してファイル保存
```

> ⚠️ すべてのコマンドに `State<DbState>` を渡す。`DbState` は `Mutex<rusqlite::Connection>` のラッパー。  
> ⚠️ タスク操作系コマンド（create/update/delete/status変更）は内部で activity_logs へ自動記録する。フロントからログ記録の二重呼び出しは不要。

#### フロントエンド接続

`tauri.conf.json` で `"withGlobalTauri": true` が設定済みのため、バンドラなしで以下の API が使える:

```javascript
const { invoke } = window.__TAURI__.core;

// 例: タスク一覧取得
const tasks = await invoke('get_tasks', { projectId: null });

// 例: タスク作成
const newTask = await invoke('create_task', {
  input: { title: 'New Task', projectId: 'proj-1', priority: 'medium' }
});

// 例: イベントリスニング（ディレクトリ監視）
const { listen } = window.__TAURI__.event;
await listen('project-changed', (event) => {
  renderProjects();
});
```

### 2-6. 言語自動検出 ✅

`lang_detect.rs` — プロジェクトディレクトリ内のファイルから言語を判定する:

| 検出ファイル | 言語 |
|-------------|------|
| `package.json` | → 内部に `typescript` 依存があれば TypeScript、なければ JavaScript |
| `Cargo.toml` | → Rust |
| `go.mod` | → Go |
| `pyproject.toml` / `setup.py` / `requirements.txt` | → Python |
| `pom.xml` / `build.gradle` | → Java |
| `*.sh` のみ | → Shell |

> ⚠️ 複数の言語ファイルが存在する場合は優先度ルール（主要なビルドファイルを優先）で判定する。

### 2-7. ディレクトリ監視 ✅

`watcher.rs`:

1. 指定ディレクトリを再帰走査し `.git` フォルダを持つものを `Project` として検出
2. 各プロジェクトで `lang_detect` + `git_util` を呼んで情報を付与
3. `notify` crate で変更を監視 → `app.emit("project-changed", payload)` でフロントへ通知
4. フロントエンドで `listen("project-changed")` → `renderProjects()` 再描画

### 2-8. Git 連携 ✅

`git_util.rs`:

1. `git2::Repository::open()` でリポジトリを開く
2. `repo.head()` → 最新コミットの日時・メッセージ・作者を取得
3. ブランチ名を取得
4. `scan_directory` コマンド内で呼び出し

---

## Phase 3: コア機能実装 ✅

> 目的: 仕様書の主要機能（§3.1〜§3.3, §3.5 C-03）をバックエンド接続付きで実装する  
> 前提: Phase 2 完了（DB + コマンド定義済み）

### 3-1. プロジェクト一覧のバックエンド接続 ✅

1. `renderProjects()` を `invoke('get_projects')` ベースに書き換え
2. Grid ビュー: 現行の動的生成ロジックを流用（データソースのみ差し替え）
3. List ビュー: `#projects-list-body` も `renderProjects()` 内で動的生成
4. 言語フィルタ: 現行のフロントフィルタを維持（データ量が少ないため）
5. ソートに「Language」を追加（仕様 P-07: 名前/ローカル更新日/Git更新日/**言語**）

### 3-2. タスク CRUD ✅

**バックエンド**: Phase 2-5 で定義済みのコマンドを使用

**フロントエンド**:

| 機能 | UI実装 |
|------|--------|
| 作成 | ヘッダーに「+ New Task」ボタン → 作成モーダル（タイトル, プロジェクト, 優先度, 担当者, 期日, 説明） → `invoke('create_task')` |
| 編集 | 既存詳細モーダルの「Edit Task」ボタン → 表示を編集フォームに切替 → `invoke('update_task')` |
| 削除 | 詳細モーダルに「Delete」ボタン追加 → 確認ダイアログ → `invoke('delete_task')` |
| ステータス変更 | リスト行 / カンバンカードにステータスボタン or ドロップダウン追加 → `invoke('update_task_status')` |

> ⚠️ ダミーデータの `date` フィールドを仕様準拠の `dueDate` に統一する。`dummy.js` も併せて修正。

### 3-3. アクティビティログ ✅

1. ログ記録: タスクCRUD コマンド内で自動記録（バックエンド側で完結、Phase 2-5 参照）
2. ログ表示: `view-logs` にタイムラインUIを実装
   - アクションアイコン（created: ➕, started: ▶️, completed: ✅, updated: ✏️）
   - タイムスタンプ + プロジェクト名 + タスク名 + 操作者
   - `invoke('get_activity_logs')` で取得
3. CSV エクスポート: ヘッダーにエクスポートボタン追加
   - `invoke('export_logs_csv')` で CSV 文字列取得
   - `Blob` + `URL.createObjectURL` でダウンロード、または `tauri-plugin-dialog` の保存ダイアログ使用

### 3-4. 検索機能（仕様 C-03） ✅

1. ヘッダー右側にインクリメンタルサーチ入力欄を追加
2. 入力に応じて `projects` と `tasks` をフロントエンド側でフィルタ（名前の部分一致）
3. 検索結果をドロップダウンまたは現在のビュー内でハイライト表示
4. 将来的にバックエンドの `LIKE` 検索に移行可能な構造にする

---

## Phase 4: UX 改善 ✅

> 目的: 操作性の向上。Phase 3 の各機能とは独立して実装可能なものが多い。

### 4-1. IDE 起動（仕様 P-04） ✅

`tauri_plugin_shell` は既に導入済み。コマンドは Phase 2-5 で定義済み。

```rust
use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn open_in_ide(app: tauri::AppHandle, ide: String, path: String) -> Result<(), String> {
    let cmd = match ide.as_str() {
        "vscode" => "code",
        "cursor" => "cursor",
        "opencode" => "opencode",
        _ => return Err("Unsupported IDE".into()),
    };
    app.shell().command(cmd).arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
```

フロントエンド側: 現在の `alert()` を `invoke('open_in_ide', { ide, path })` に置き換え。

> ⚠️ `"opencode"` の CLI コマンド名は要確認。インストール環境によって異なる可能性がある。  
> ⚠️ Capabilities に `shell:allow-execute` が必要（Phase 2-2 で追加済み）。

### 4-2. カンバン D&D ✅

- HTML5 Drag and Drop API を使用
- カンバンカードに `draggable="true"` を付与
- `dragstart` → タスクIDを `dataTransfer` に格納
- `dragover` → ドロップ先カラムのハイライト
- `drop` → `invoke('update_task_status')` で永続化 + 再描画
- タスク順序の並び替えは将来対応（DB に `sort_order` カラム追加が必要）

### 4-3. README 表示（仕様 P-05） ✅

- プロジェクト詳細モーダル内の README セクションで `invoke('get_readme', { path })` を呼び出し
- Markdown → HTML レンダリングは フロントエンドで実施（`marked.js` 等の軽量ライブラリ、または簡易的なプレーンテキスト表示）

---

## Phase 5: 拡張機能 ✅

> 目的: 仕様書 §3.4 + §7 の拡張アイデアを実装する

### 5-1. AI 連携（仕様 A-01, A-02）

**追加クレート**:

```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
keyring = "3"
tokio = { version = "1", features = ["full"] }
```

**実装手順**:

1. `src-tauri/src/ai.rs` を作成
2. Settings 画面に API キー入力フォーム追加
3. `keyring` crate で OS ネイティブキーストアに安全に保存（Windows: Credential Manager, macOS: Keychain, Linux: Secret Service）
4. Tauri コマンド: `save_api_key(provider, key)` / `get_api_key(provider)` / `analyze_logs(prompt)`
5. アクティビティログを集約してプロンプトに含め、AIで分析・要約
6. チャットUIの `onsubmit` にメッセージ送信・レスポンス表示ロジックを実装

> ⚠️ API キーは Rust 側でのみ扱い、フロントエンドには返さない。  
> ⚠️ `reqwest` の TLS は `rustls-tls` を推奨（OpenSSL 依存を避けるため）。

### 5-2. Inbox / Analytics / Settings（仕様 §7）

| 画面 | 内容 | 優先度 |
|------|------|--------|
| Settings | 監視ディレクトリ設定・IDE設定・APIキー管理 | 高（他の拡張の前提） |
| Analytics | タスク完了率・プロジェクト別統計 | 中 |
| Inbox | タスク期限通知・ステータス変更通知 | 低 |

### 5-3. 複数ディレクトリ監視（仕様 §7）

- Settings 画面で監視ディレクトリを複数登録可能にする
- DB に `watched_directories` テーブルを追加
- `watcher.rs` を複数パス対応に拡張

---

## 依存関係マップ

```
Phase 1（基盤整備）
  ├── 1-1 ダミーデータ分離 ✅ ─────────────────────────┐
  ├── 1-2 UI バグ修正 ─────────────────────────────────┤
  ├── 1-3 サイドバー修正 ──────────────────────────────┤
  ├── 1-4 CSP 設定 ────────────────────────────────────┤
  └── 1-5 JS 分割（任意）─────────────────────────────┤
                                                       ▼
Phase 2（バックエンド基盤）
  ├── 2-1 クレート追加 ────────────────┐
  ├── 2-2 Capabilities 更新 ──────────┤
  ├── 2-3 ファイル構成 ───────────────┤
  ├── 2-4 DB 設計・実装 ──────────────┤
  ├── 2-5 コマンド定義 ───────────────┤（2-4 に依存）
  ├── 2-6 言語自動検出 ───────────────┤
  ├── 2-7 ディレクトリ監視 ───────────┤（2-6, 2-8 に依存）
  └── 2-8 Git 連携 ───────────────────┘
                    │
                    ▼
Phase 3（コア機能）──── 並列実装可能 ────
  ├── 3-1 プロジェクト接続 ───（2-5, 2-7 に依存）
  ├── 3-2 タスク CRUD ────────（2-5 に依存）
  ├── 3-3 アクティビティログ ─（2-5, 3-2 に依存）
  └── 3-4 検索 ───────────────（3-1, 3-2 に依存）
                    │
                    ▼
Phase 4（UX 改善）──── 各項目独立 ────
  ├── 4-1 IDE 起動 ───────────（2-5 のみに依存、Phase 3 と並列可）
  ├── 4-2 カンバン D&D ───────（3-2 に依存）
  └── 4-3 README 表示 ────────（2-5 のみに依存、Phase 3 と並列可）
                    │
                    ▼
Phase 5（拡張機能）
  ├── 5-1 AI 連携 ────────────（3-3 に依存）
  ├── 5-2 Settings/Analytics/Inbox
  └── 5-3 複数ディレクトリ監視 ─（2-7 に依存）
```

> ⚠️ Phase 4-1（IDE起動）と 4-3（README表示）は Phase 2 完了時点で着手可能。Phase 3 完了を待つ必要はない。
