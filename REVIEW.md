# コードレビュードキュメント

## 変更の概要

この変更は、モックアップのJavaScriptをモノリシックなファイルからモジュール化的構造へとリファクタリングし、Tauri（Rust + Web）フレームワークへの移行を開始する大規模な変更です。

### 変更内容

| 区分 | ファイル | 説明 |
|------|---------|------|
| 削除 | `mockup/app.js` | モノリシックなJSファイル（bakに移動） |
| 削除 | `mockup/project-dashboard.html` | 別ダッシュボードHTML（bakに移動） |
| 変更 | `mockup/index.html` | モジュラーJSを使用するように修正 |
| 新規 | `mockup/js/` | 8つのモジュールファイル |
| 新規 | `Cargo.toml` | Tauriプロジェクト設定 |
| 新規 | `src/main.rs` | Rustメインエントリーポイント |
| 新規 | `README.md` | プロジェクトドキュメント |
| 新規 | `ui/index.html` | Tauri用UIファイル |
| 新規 | `mockup/bak/` | 旧ファイルのバックアップ |

### 新しいJSモジュール構造

```
mockup/js/
├── index.js      # エントリーポイント、windowへのエクスポート
├── main.js      # 初期化ロジック
├── state.js     # 状態管理・初期データ
├── sidebar.js   # サイドバー機能
├── tabs.js      # タブ管理
├── views.js     # ビュー切り替え
├── tasks.js     # タスク管理
└── projects.js  # プロジェクト管理
```

---

## 発見された問題

### 1. CRITICAL: state.jsからのインポートエラー

**ファイル:** `mockup/js/main.js:4-14`  
**信頼度:** 95%

**問題内容:**
`main.js` で以下の関数を `./state.js` からインポートしているが、`state.js` ではこれらの関数がエクスポートされていない。

- `initIcons()`
- `initMobileFix()`
- `setupEventListeners()`
- `init()`
- `loadInitialData()`

**影響:**
アプリケーションの初期化時にJavaScriptエラーが発生し、機能が動作しない。

**現在のstate.js:**
```javascript
// エクスポートされていない
function initIcons() { ... }
function initMobileFix() { ... }
function setupEventListeners() { ... }
function init() { ... }
function loadInitialData() { ... }
```

**推奨修正:**
```javascript
export function initIcons() { ... }
export function initMobileFix() { ... }
export function setupEventListeners() { ... }
export function init() { ... }
export function loadInitialData() { ... }
export { state };
```

---

### 2. CRITICAL: main.jsでのエクスポート缺失

**ファイル:** `mockup/js/index.js:8`  
**信頼度:** 95%

**問題内容:**
`index.js` は `main.js` から `init` をインポートしているが、`main.js` では何もエクスポートされていない。

**現在のindex.js:**
```javascript
import { init } from './main.js';  // main.jsはinitをエクスポートしていない
```

**影響:**
エントリーポイントが失敗し、アプリケーションが初期化されない。

**推奨修正:**
`main.js` または `index.js` を修正して正しいインポートチェーンを構築する。

---

### 3. WARNING: 重複した初期化

**ファイル:** 
- `mockup/js/main.js:20-23`
- `mockup/js/state.js:105-108`

**信頼度:** 90%

**問題内容:**
両方のファイルがDOMContentLoadedイベントリスナーを登録し、`init()`を呼び出している。

**現在の状態:**
```javascript
// main.js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// state.js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

**影響:**
重複した初期化が発生する可能性がある。

**推奨修正:**
いずれか一方のファイルのみにDOMContentLoadedリスナーを残す。

---

## 修正アクションアイテム

- [ ] **state.js**: 関数を`export`に追加する
- [ ] **main.js**: インポートを修正する
- [ ] **index.js** または **main.js**: initのエクスポート/インポートを修正する
- [ ] **main.js** または **state.js**: 重複したDOMContentLoadedリスナーを削除する

---

## 仕様書との整合性確認

### 機能要件との照合

| 機能ID | 機能名 | 実装状況 | 備考 |
|--------|--------|----------|------|
| P-01 | ディレクトリ監視 | ⚠️ 未実装 | モックデータ使用 |
| P-02 | プロジェクト一覧 | ✅ 実装済 | grid/list表示対応 |
| P-03 | プロジェクト詳細 | ✅ 実装済 | モーダル表示 |
| P-04 | IDE連携 | ⚠️ 部分的 | alert出力のみ |
| P-05 | README表示 | ❌ 未実装 | - |
| P-06 | 言語フィルタ | ✅ 実装済 | filterProjectsByLang() |
| P-07 | ソート機能 | ✅ 実装済 | sortProjects() |
| T-01 | タスク一覧 | ✅ 実装済 | - |
| T-02 | ビュー切替 | ✅ 実装済 | list/kanban |
| T-03 | ステータス管理 | ✅ 実装済 | todo/in-progress/done |
| T-04 | タスク詳細 | ✅ 実装済 | モーダル表示 |
| T-05 | タブ機能 | ✅ 実装済 | - |
| T-06 | フィルタ | ✅ 実装済 | ステータス別 |
| L-01 | 履歴表示 | ⚠️ 未実装 | UIは存在する |
| L-02 | アクション種別 | ⚠️ 未実装 | - |
| L-03 | CSV出力 | ❌ 未実装 | - |
| A-01 | Log Analyzer | ❌ 未実装 | - |
| A-02 | チャットUI | ⚠️ UIのみ | 仮実装 |
| C-01 | サイドバー | ✅ 実装済 | - |
| C-02 | サイドバー折りたたみ | ✅ 実装済 | - |
| C-03 | 検索 | ❌ 未実装 | - |

### データモデルとの照合

#### Taskモデル
| フィールド | 仕様 | 実装 | 備考 |
|------------|------|------|------|
| id | string | ✅ | - |
| projectId | string | ✅ | - |
| title | string | ✅ | - |
| status | "todo" / "in-progress" / "done" | ✅ | - |
| priority | "high" / "medium" / "low" | ✅ | - |
| dueDate | DateTime | ⚠️ | dateとして実装 |
| assignee | string | ✅ | - |
| description | string | ❌ | 未実装 |
| createdAt | DateTime | ❌ | 未実装 |
| updatedAt | DateTime | ❌ | 未実装 |

#### Projectモデル
| フィールド | 仕様 | 実装 | 備考 |
|------------|------|------|------|
| id | string | ⚠️ | 数値IDを使用 |
| name | string | ✅ | - |
| path | string | ✅ | - |
| language | string | ✅ | - |
| localModified | DateTime | ✅ | - |
| gitModified | DateTime | ✅ | - |
| lastCommit | string | ✅ | - |
| hasReadme | boolean | ❌ | 未実装 |
| readmeContent | string | ❌ | 未実装 |

### UI仕様との照合

| 項目 | 仕様 | 実装 | 備考 |
|------|------|------|------|
| 背景（メイン） | #0d1117 | ✅ | 正確 |
| 背景（セカンダリ） | #161b22 | ✅ | 正確 |
| ボーダー | #30363d | ✅ | 正確 |
| テキスト（メイン） | #c9d1d9 | ✅ | 正確 |
| アクセント | #6366f1 | ✅ | 正確 |
| サイドバー幅 | 224px | ✅ | 正確 |
| フォント | Inter | ✅ | 正確 |

---

## HTML圧縮・最適化調査 (mockup/index.html)

### ファイルサイズ
- **mockup/index.html**: 1286行, 65KB
- **ui/index.html**: 65KB

### 不必要な部分的

#### 1. 空のプレースホルダービュー（要削除候補）

| ビュー | サイズ | 状態 |
|--------|--------|------|
| Logs | ~564文字 | プレースホルダーのみ |
| Inbox | ~584文字 | プレースホルダーのみ |
| Analytics | ~520文字 | プレースホルダーのみ |
| Settings | 数行 | プレースホルダーのみ |

これらは仕様書（P-05, L-01, L-02, A-01相当）で未実装の機能。

#### 2. HTMLコメント（約74件）
```html
<!-- Mobile Overlay -->
<!-- Sidebar (fixed, completely outside layout flow) -->
<!-- Fix for Tailwind CSS responsive issues -->
```
→ 約3KB削減可能

#### 3. インラインスクリプト（749行〜）
```javascript
// Initialize Lucide icons
lucide.createIcons();
// Force filter/sort icon sizes after lucide renders
function fixFilterIconSizes() { ... }
```
→ JSファイルに移動可能（保守性向上）

#### 4. 重複パターン
- `custom-scrollbar`: 13回使用
- `border-b border-[#30363d]`: 14回使用
→ Tailwind設定でユーティリティクラス化可能

### 推奨アクション

| 優先度 | アクション | 削減効果 |
|--------|-----------|----------|
| 中 | 空ビュー削除 | ~2KB |
| 低 | HTMLコメント削除 | ~3KB |
| 低 | インラインJS移動 | 圧縮効果なし（保守性のみ） |

### bakディレクトリの重複
- `mockup/bak/index.html`: 61KB（ほぼ同じ内容）
- `mockup/bak/project-dashboard.html`: 24KB
- `mockup/bak/app.js`: 15KB

これらは削除候補だが、バックアップとして保持も合理적。

---

## レビューの結論

**判定:** NEEDS CHANGES

**理由:**
CRITICALレベルの問題が2件あり、アプリケーションが正しく動作しません。上記の修正を適用する必要があります。

**仕様書との整合性:**
- 一部の機能は未実装ですが、フロントエンドのモックアップとしては十分な進捗
- バックエンド（Rust）側の実装が必要
- データ永続化（SQLite）は未実装

**その他のコメント:**
- Tauriプロジェクト構造の追加は適切なスタートです
- モジュラーJSへの分割は良い設計判断です
- バックアップファイルの配置も適切です

---

*作成日: 2026-03-06*
*レビュアー: Kilo Code*
