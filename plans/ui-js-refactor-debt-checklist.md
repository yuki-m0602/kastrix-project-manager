# UI JavaScript リファクタ残債・チェックリスト

> 目的: `main.js` 分割後に繰り返し指摘された問題を **1か所に集約**し、作業の抜け漏れを防ぐ。  
> **優先スコープ: ロジック層**（データの流れ・初期化・イベント購読・状態の単一性）。マークアップや見た目の整理は本書の主目的ではない。  
> 最終更新: 2026-03-29

---

## ロジック層とは（このプロジェクトでの境界）

| 含める | 含めない（別タスク） |
|--------|----------------------|
| いつ・何回 `loadData` / `reloadTasks` が走るか | `index.html` の巨大化・`onclick` の数 |
| `init` の一本化と副作用の順序 | Tailwind クラス・余白・アイコン |
| Tauri `listen` の登録場所と重複 | `settings_team.js` のファイルサイズそのもの（中の**重複ロジック**は対象） |
| `refreshTeamUiFromBackend` 等の**単一実装** | 画面デザインの刷新 |
| グローバルと `window.*` の参照の一致 | `dummy.js` の要否（データ源の方針はロジックに関わるが、モックの中身は別） |

**簡略化の到達イメージ（ロジック）**

1. **初期化**は入口が1つ（`DOMContentLoaded` と `window.init` が同じ処理を指す）。
2. **データ取得・再読込**は `loadData` / `reloadTasks` が1経路（再定義・`window` ズレなし）。
3. **バックエンドイベント**は購読が重複しない（チーム系は原則1ファイルに表を集約）。
4. **チームUIの再描画**は `refreshTeamUiFromBackend`（または後継）が1実装。

---

## 使い方

- **ロジック層**の整理から着手する（下記セクション I）。
- 作業後はセクション **III. 検証** を実行する。
- 項目を完了したら `[ ]` を `[x]` にする。

---

## I. ロジック層（優先）

### 初期化

| 状態 | 項目 |
|------|------|
| [x] | **`init` を1つに統一**（`main.js` と `init.js` の役割マージ、`DOMContentLoaded` と `window.init` の参照を一致） |
| [x] | ウィンドウ制御・`loadData`・ビュー初期化・iroh リトライ等を **1本の順序**で並べ、重複呼び出しを削除 |

### データパイプライン

| 状態 | 項目 |
|------|------|
| [x] | **`loadData` / `reloadTasks` の二重定義を解消**（`data.js` のみ。`apiScanAllWatchedDirs`・`localProjects`/`projects` 組み立てを含む） |
| [x] | `window.reloadTasks` / `window.loadData` / `window.refreshTeamUiFromBackend` を **`data.js` 定義と同期** |
| [x] | **`refreshTeamUiFromBackend` を1実装に**（`data.js` に `renderTeam*`・サイドバー・Inbox を統合） |

### Tauri イベント（購読）

| 状態 | 項目 |
|------|------|
| [x] | `team-conflict` の二重購読解消（`conflict.js` の `initConflictUi` に集約） |
| [x] | **`team-members-updated` / `team-pending-join` / `team-pending-join-cancelled`** を **`registerTauriTeamEventListeners`（`events.js`）に1箇所化**（`init.js` から削除） |
| [x] | チーム関連の `listen`（`team-conflict` 除く）を **`events.js` の `registerTauriTeamEventListeners`** に集約し、`init` 末尾で1回だけ登録 |

### 競合（状態は集約済み・残りは一貫性）

| 状態 | 項目 |
|------|------|
| [x] | 競合状態・`team-conflict`・Escape を **`conflict.js` に集約**、`index.html` で読み込み |
| [x] | 開閉で `display` / `hidden` を **`showConflictDialog` / `closeConflictModal` で揃える** |

### 重複モジュール（真実を1つに）

| 状態 | 項目 |
|------|------|
| [x] | **`search.js` / `logs.js` を削除**し検索・ログは **`main.js` のみ**（未使用の二重実装を解消） |
| [x] | ログ表示は **`main.js` の `renderLogs`**（既存 API フィールド）を正とする |

### ロジックの載せ方（中長期）

| 状態 | 項目 |
|------|------|
| [ ] | グローバル乱立と `typeof fn === 'function'` を減らす（例: **`window.App = { loadData, refreshTeamUiFromBackend, ... }`** または ES modules） |
| [ ] | **`settings_team.js` と `ui/team/*.js`** の間で同じことをする関数がないか洗い、**呼び出し関係を1方向**に |

---

## II. 付随（ロジック層以外・短時間でよい）

| 状態 | 項目 |
|------|------|
| [x] | `ui/js/events.js` 末尾の **`;""`** を削除 |
| [x] | `.eslintrc.json` の **`globals` 重複キー**を整理（`renderLogs` / `loadData` 等の二重記載を削除） |

---

## III. 検証（ロジック変更後）

| 状態 | 項目 |
|------|------|
| [ ] | `npx eslint ui/js`（またはプロジェクト既定） |
| [ ] | 起動〜タブ切替・チーム画面・（可能なら）競合・検索・ログ |
| [ ] | 同一 Tauri イベントで **ハンドラが二重実行されていないか**（ログや描画の二度呼び出し） |

---

## 参照

- 分割方針: `plans/file-split-design.md`
- リファクタ手順: `agent_docs/refactoring.md`
- 広い品質方針: `plans/code-quality-improvement.md`
