# Kastrix 大規模リファクタリング計画

> 作成日: 2026-03-31  
> 前提: `plans/code-quality-improvement.md` の Phase 0–3 はすべて完了済み  
> 参照: `agent_docs/refactoring.md`（実施時は必ず確認）

---

## 1. 現状サマリ

### 1-1. 完了済み作業（前計画）

| Phase | 内容 |
|-------|------|
| 0-1 | テスト基盤（tasks.rs / projects.rs） |
| 0-2 | Lint 導入（ESLint + rustfmt） |
| 0-3 | DB マイグレーション（ALTER TABLE → `ensure_column`） |
| 1   | XSS 対策（escapeHtml）、db.rs の expect 削除 |
| 2   | DRY（同期ブロック・ブロードキャスト・権限ヘルパー・API ラッパー） |
| 3   | 責務分離（settings.js → 4 モジュール）、alert 削除、定数化、言語統一 |

### 1-2. 新規検出の問題点

以下が**前計画では対応しなかった**残債・新規課題。

| # | カテゴリ | 場所 | 問題 |
|---|----------|------|------|
| A | **DRY** | `tasks.rs` + `task_sync.rs` | タスク行マッピング（SELECT 列 + `Ok(Task{..})` クロージャ）が 3 箇所で重複 |
| B | **DRY / 安定性** | `lib.rs` — setup クロージャ内 | iroh 初期化の `db_state.0.lock().unwrap()`（lock 失敗時パニック） |
| C | **安定性** | `commands/team/invite.rs` — `restore_team_subscriptions` 内 | `topic_id_hex.unwrap()` — None 時パニック |
| D | **安定性** | `commands/team/leave.rs` — `team_leave` 内 | `oldest_co.unwrap()` — None 時パニック |
| E | **仕様未達** | `team/task_sync.rs` | ntp vs ntp の LWW（タイムスタンプ比較）未実装（`plans/modal_conflict_ux_plan.md` §9-3） |
| F | **UX バグ** | `ui/js/tasks.js` + `main.js` | タスク詳細→編集の二重オーバーレイ（同 §4-1 A） |
| G | **UX バグ** | `ui/js/conflict.js` + `main.js` | 競合ダイアログ内で無関係モーダルを一律 close（同 §4-2 B） |
| H | **設計** | `src-tauri/src/db.rs` | `init_db` と `create_test_db` でスキーマが二重定義（DRY 違反） |
| I | **設計** | `ui/js/` 全体 | `typeof fn === 'function'` ガードが 56 箇所（グローバル名前空間依存） |
| J | **保守性** | `ui/js/settings_team.js` | 690 行—`ui/team/*.js` 分割後も元ファイルが大部分残存 |
| K | **保守性** | `src-tauri/src/team/event_handler.rs` | 497 行・多様なイベントを 1 ファイルで処理 |
| L | **保守性** | `ui/js/init.js` | retry を `setTimeout` 多段で実装（1000/2000/3000 ms）— 可読性・信頼性に難 |
| M | **テスト** | JS 全体 | フロントエンドのユニットテストがゼロ |
| N | **アーキテクチャ** | `ui/` 全体 | ES modules 未導入。グローバルスクリプト連鎖で `<script>` 順序に強く依存 |

---

## 2. 改善方針（4 フェーズ）

### Phase 1: 残債整理（1〜2 日）— クイックウィン

**目的**: パニック・UX バグ・DRY 違反の最小手術

| # | 項目 | 対象 | 内容 | 優先度 |
|---|------|------|------|--------|
| 1-1 | タスク行マッピング共通化 | `models.rs` + `tasks.rs` + `task_sync.rs` | `Task::from_row(row)` を `models.rs` に定義し、`query_task` / `query_local_task` / `get_tasks_from_db` から呼び出す | ★★★★★ |
| 1-2 | パニック撲滅 | `lib.rs` / `invite.rs` / `leave.rs` | `.unwrap()` を `?` / `map_err` / `ok_or_else` に置き換え | ★★★★★ |
| 1-3 | DB スキーマ DRY | `db.rs` | `create_test_db` に共通スキーマ定数を使い、`init_db` との二重定義を解消 | ★★★☆☆ |
| 1-4 | `settings_team.js` スリム化 | `ui/js/settings_team.js` | `ui/team/*.js` へ移行済みの関数を元ファイルから削除し 200 行以下を目指す | ★★★☆☆ |

---

### Phase 2: アーキテクチャ改善（3〜5 日）— 設計の整合性

**目的**: 依存関係を整理し、テスト・変更容易性を高める

| # | 項目 | 対象 | 内容 | 優先度 |
|---|------|------|------|--------|
| 2-1 | グローバル名前空間の整理 | `ui/js/` 全体 | `window.App = { loadData, reloadTasks, refreshTeamUiFromBackend, ... }` を `data.js` に定義し、`typeof fn === 'function'` ガードを `window.App.*` 参照に一本化。56 箇所を大幅削減 | ★★★★☆ |
| 2-2 | iroh retry の設計改善 | `ui/js/init.js` | `setTimeout` 多段を `team-iroh-ready` イベントの `listen` + 1 回のフォールバックに変更 | ★★★☆☆ |
| 2-3 | `event_handler.rs` 分割 | `src-tauri/src/team/event_handler.rs` | NeighborUp 処理・NeighborDown 処理・Received メッセージ処理を別関数ファイルに分割（各 ~150 行） | ★★★☆☆ |
| 2-4 | JS フロントのユニットテスト基盤 | `ui/js/` | `vitest` または `jest` で `escapeHtml` / `invokeWithDefault` / `refreshTeamUiFromBackend` 等の純粋ロジックにテスト追加 | ★★★☆☆ |

---

### Phase 3: 仕様完成・UX 修正（3〜7 日）— 未実装仕様の実装

**目的**: `plans/modal_conflict_ux_plan.md` の未解決項目を実装する

| # | 項目 | 対象 | 内容 | 優先度 |
|---|------|------|------|--------|
| 3-1 | ntp vs ntp LWW 実装 | `team/task_sync.rs` | `apply_task_update` に「両方 ntp の場合はタイムスタンプ比較で LWW」を追加（仕様 §5-4 対応） | ★★★★☆ |
| 3-2 | 詳細→編集の二重オーバーレイ解消 | `ui/js/tasks.js` | `openEditTaskModal` 先頭で `closeTaskModal({ skipHistory: true })` を呼び、詳細と編集を共存させない | ★★★★☆ |
| 3-3 | 競合解決時の一律モーダル close 廃止 | `ui/js/conflict.js` / `main.js` | `showConflictDialog` / `resolveConflict` から無関係モーダルの `close*` を削除し、モーダル規約を `plans/modal_spec.md` として文書化 | ★★★☆☆ |
| 3-4 | `task_equal_for_conflict` の緩和 | `team/task_sync.rs` | 時刻メタデータ（`created_at`・`updated_at`）を除いた意味フィールドのみで同一判定（誤検知削減） | ★★★☆☆ |

---

### Phase 4: 長期的構造刷新（1〜2 週間）— 根本的な技術負債

**目的**: 将来の機能追加・チーム開発を持続可能にする

| # | 項目 | 対象 | 内容 | 優先度 |
|---|------|------|------|--------|
| 4-1 | ES Modules 移行 | `ui/` 全体 | `type="module"` + `import/export` で `<script>` 順序依存・グローバル汚染を根絶。`index.html` に `<script type="module" src="js/app.js">` を 1 本化 | ★★☆☆☆ |
| 4-2 | Rust エラー型の統一 | `src-tauri/src/` 全体 | `String` エラーを `thiserror` ベースの `AppError` に統一し、エラー情報の構造化と Tauri へのシリアライズを整理 | ★★☆☆☆ |
| 4-3 | DB マイグレーション正式化 | `db.rs` / `migrations/` | `refinery` / `rusqlite_migration` 等を導入し、ALTER TABLE の `ensure_column` を宣言的マイグレーションに置き換え | ★★☆☆☆ |
| 4-4 | 状態管理の一元化 | `ui/js/state.js` | `localProjects`, `tasks`, `openTabs` 等のグローバル配列を `state.js` の単一オブジェクト（`AppState`）に集約し、mutation は専用関数経由のみ | ★★☆☆☆ |

---

## 3. 実施ルール

1. **事前確認**: `agent_docs/refactoring.md` に従い、対象・理由・影響範囲を提示してから着手する  
2. **段階実施**: Phase 1 → 2 → 3 → 4 の順で進める（Phase 間の前後は不可）  
3. **テスト**: 各変更後に `cargo test`（Rust）および `npx eslint ui/js`（JS）を実行  
4. **粒度**: 1 項目ずつ実施し、まとめて変更しない  
5. **ブランチ**: 項目ごとに feature ブランチを切る（例: `refactor/task-row-mapping`）

---

## 4. 優先度マトリクス

```
重要度
  ↑
  │  [1-1]タスク行  [1-2]unwrap   [3-1]LWW     [3-2]モーダル
  │  ★★★★★        ★★★★★       ★★★★☆       ★★★★☆
  │
  │  [2-1]グローバル [1-3]スキーマ  [2-3]handler [3-3]競合規約
  │  ★★★★☆        ★★★☆☆       ★★★☆☆       ★★★☆☆
  │
  │  [2-2]retry     [1-4]settings  [2-4]JSテスト [3-4]equal緩和
  │  ★★★☆☆        ★★★☆☆       ★★★☆☆       ★★★☆☆
  │
  │  [4-1]ESM       [4-2]エラー型  [4-3]migration [4-4]状態管理
  │  ★★☆☆☆        ★★☆☆☆       ★★☆☆☆        ★★☆☆☆
  │
  └─────────────────────────────────────→ 工数
```

---

## 5. 推奨着手順

1. **1-2** `lib.rs` / `invite.rs` / `leave.rs` の `.unwrap()` 撲滅（最も安全で即効性が高い）
2. **1-1** タスク行マッピングの `Task::from_row` 共通化
3. **1-3** DB スキーマの DRY 化
4. **1-4** `settings_team.js` スリム化
5. **2-1** グローバル名前空間整理（`window.App`）
6. **2-2** iroh retry 設計改善
7. **3-2** + **3-3** モーダル UX 修正（セットで実施）
8. **3-1** NTP LWW 実装
9. **3-4** 競合同一判定の緩和
10. Phase 4 の各項目を工数・優先度に応じて実施

---

## 6. 各項目の影響範囲とリスク

| # | 影響ファイル | リスク | 軽減策 |
|---|-------------|--------|--------|
| 1-1 | `models.rs`, `tasks.rs`, `task_sync.rs` | テスト済みコマンドへの影響 | `cargo test` で既存テストが通ることを確認 |
| 1-2 | `lib.rs`, `invite.rs`, `leave.rs` | エラー型変更により呼び出し元 return が必要になる場合がある | 修正後 `cargo build` + `cargo test` を実行 |
| 1-3 | `db.rs` | `create_test_db` の変更でテストが壊れるリスク | テスト全件 pass を確認してからマージ |
| 1-4 | `settings_team.js` | 削除した関数を team/*.js が提供していない場合 UI が壊れる | ブラウザ + Tauri 両環境で手動確認 |
| 2-1 | `ui/js/` ほぼ全体 | 広範囲—段階的に移行しないと動作しなくなる | `window.App.*` と従来グローバルの**両方を一時並存**させて1ファイルずつ移行 |
| 3-1 | `task_sync.rs` | 同期の挙動が変わる—既存の DB には影響なし | チーム機能の結合テストを追加してから実施 |
| 3-2 | `tasks.js`, `main.js` | 履歴・スクロール位置に副作用の可能性 | E2E で詳細→編集→閉じる→詳細 の動線を確認 |
| 4-1 | `ui/` 全体 + `index.html` | 最大リスク—スクリプト順序依存の全廃が必要 | 機能ブランチで段階移行、全画面の回帰テスト |

---

## 7. 参照

- `agent_docs/refactoring.md` — リファクタリング手順
- `plans/code-quality-improvement.md` — 前計画（Phase 0–3 完了）
- `plans/modal_conflict_ux_plan.md` — モーダル・競合 UX 問題の詳細分析
- `plans/ui-js-refactor-debt-checklist.md` — JS ロジック層残債チェックリスト
- `plans/file-split-design.md` — ファイル分割設計
- `specs/kastrix_team_design.md` — チーム同期仕様（LWW / 衝突パターン）
