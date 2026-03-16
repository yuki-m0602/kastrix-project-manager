# チーム機能 実装手順書

> 作成日: 2026-03-12  
> 参照: `specs/kastrix_team_design.md`  
> 前提: `agent_docs/workflow.md` の作業フローに従う

---

## 凡例

- 🔲 未着手
- ⚠️ 注意点・確認事項
- 📌 仕様書との対応

---

## 事前確認事項

実装着手前に以下を確認すること。

| 項目 | 内容 |
|------|------|
| スコープ | チーム機能は `kastrix_team_design.md` の Phase 1〜5 に従う |
| 既存DBとの関係 | 現行の `projects` / `tasks` / `activity_logs` は維持。`operations` / `members` / `sync_state` を新規追加 |
| プロジェクトの扱い | 仕様書ではタスク同期が中心。プロジェクト（ディレクトリ監視）がチーム同期対象かどうか、実装前にユーザーと合意する |
| 外部依存 | iroh クレート（Rust）、NTP 取得（pool.ntp.org）、keyring（既存） |

---

## Phase 1: iroh接続 + 部屋コード参加 + Operation基本同期

> 目標: 最小限の同期が動く状態

### 1-1. iroh クレートの導入

- [ ] `src-tauri/Cargo.toml` に iroh 関連クレートを追加
- [ ] iroh のバージョン・feature は公式ドキュメントを確認して決定
- [ ] ビルドが通ることを確認

> ⚠️ iroh は活発に開発中。採用時点の最新 stable を確認すること。

### 1-2. DB スキーマ拡張

- [ ] `db.rs` に以下テーブルを追加

| テーブル | 主なカラム |
|----------|-------------|
| operations | id, seq, prev_id, type, payload, member_id, signature, timestamp, ts_source, synced |
| members | id, endpoint_id, role, status, joined_at |
| sync_state | member_id, last_seq, last_synced_at |

- [ ] `operations` の `type` は `task_update` / `member_join` など（仕様 5-1 参照）
- [ ] 既存の `tasks` テーブルはそのまま維持（Operation 適用結果のキャッシュとして利用）

### 1-3. iroh 接続基盤

- [ ] iroh Node の初期化・終了処理を実装
- [ ] EndpointID の取得・表示用の Tauri コマンドを用意
- [ ] TopicID（チームID）の生成・管理

### 1-4. 部屋コード（招待コード）の生成

- [ ] 招待コード形式: `KASTRIX-XXXX-XXXX`（仕様 4-1）
- [ ] TopicID から招待コードを生成するロジック
- [ ] 招待コードから TopicID を復元するロジック

### 1-5. 参加フロー（コード入力 → subscribe）

- [ ] メンバー側: 招待コード入力 UI
- [ ] コード入力 → TopicID 復元 → iroh で subscribe 申請
- [ ] ホスト側: 参加申請の受信（承認は Phase 2 で実装）

### 1-6. Operation の基本同期

- [ ] `task_update` Operation の生成（タスク作成・更新・削除時）
- [ ] iroh-gossip で TopicID に publish
- [ ] subscribe 側で受信 → ローカル DB に適用
- [ ] タスク一覧が双方向で同期されることを確認

### Phase 1 修正・改善

- [ ] **再起動後に参加状態がリセットされる** — アプリ再起動後、メンバー・ホストの参加状態（subscribe）が保持されない。DB に参加情報を保存し、起動時に自動で subscribe を復元する処理が必要

### Phase 1 完了定義

- 2台の Kastrix で、招待コードを介して接続できる
- 片方でタスクを変更すると、もう片方に反映される

---

## Phase 2: NTPタイムスタンプ + WAL + 連番 + ホスト承認

> 目標: 整合性と認証の基盤

### 2-1. NTP タイムスタンプ取得

- [ ] pool.ntp.org から NTP 時刻を取得する処理を実装
- [ ] Operation 生成時に `timestamp` と `ts_source`（ntp / local）を設定
- [ ] オフライン時は `ts_source: "local"` でフォールバック

### 2-2. Operation 連番とチェーン

- [ ] `seq` の採番（単調増加）
- [ ] `prev_id` で 1 つ前の Operation を参照
- [ ] 受信時に seq 順で適用することを保証

### 2-3. WAL モード

- [ ] 既に `db.rs` で `PRAGMA journal_mode=WAL` が設定済み → 確認のみ
- [ ] トランザクションで複数テーブルを一括更新するパターンを徹底

### 2-4. ホスト承認フロー

- [ ] 参加申請（pending）の受信・一覧表示
- [ ] ホストが承認 → `member_join` Operation を生成・配信
- [ ] 承認されたメンバーの `members.status` を `active` に更新
- [ ] 拒否時は申請を破棄（必要に応じて `member_reject` Operation）

### 2-5. 招待コードの有効期限

- [ ] 発行時に有効期限を選択（15分 / 1時間 / 24時間 / 無期限）
- [ ] デフォルトは 1 時間
- [ ] 期限切れコードでの参加申請は拒否

### Phase 2 完了定義

- ホストが参加申請を承認しないとメンバーが参加できない
- Operation に NTP タイムスタンプが付与され、連番で順序が保証される

---

## Phase 3: SQLCipher暗号化 + keyring連携 + チェックサム突合

> 目標: セキュリティ強化

### 3-1. SQLCipher 導入

- [ ] `rusqlite` を `sqlcipher` 相当に移行、または SQLCipher 対応の Rust クレートを検討
- [ ] DB ファイルを AES-256 で暗号化
- [ ] 既存 DB のマイグレーション（平文 → 暗号化）手順を用意

> ⚠️ rusqlite は標準 SQLite。SQLCipher は別クレート（例: `sqlx` + SQLCipher ビルド）が必要。調査してから方針を決定する。

### 3-2. 暗号化キーと keyring 連携

- [ ] DB 暗号化キーを OS キーストア（keyring）に保存
- [ ] 初回起動: キー生成 → keyring に保存 → 暗号化 DB 作成
- [ ] 2回目以降: keyring からキー取得 → DB 復号
- [ ] 終了時にメモリ上のキーを破棄

### 3-3. Linux フォールバック

- [ ] Secret Service API が使えない環境では、起動時にパスワード入力を求める
- [ ] PBKDF2 で DB キーを導出

### 3-4. チェックサム突合

- [ ] 定期的に他メンバーと Operation のチェックサムを突合
- [ ] 不一致時に警告を表示

### Phase 3 完了定義

- DB が暗号化され、keyring でキー管理される
- チェックサムで改ざんを検知できる

---

## Phase 4: 同期モード設定 + CO-HOST + 衝突ダイアログ

> 目標: UX と権限管理の完成

### 4-1. 同期モード設定

- [ ] Settings に「自動同期 / 手動同期」を追加
- [ ] 手動同期時: 未配信 Operation 数をサイドバーにバッジ表示
- [ ] Push ボタンで一括送信
- [ ] 設定はローカルのみ（チームには同期しない）

### 4-2. CO-HOST ロール

- [ ] `members.role`: `HOST` / `CO-HOST` / `MEMBER`
- [ ] CO-HOST はメンバー承認・キックが可能
- [ ] ホスト退出時は次の CO-HOST に自動移譲
- [ ] ロール変更は `permission_change` Operation で配信

### 4-3. 衝突時のダイアログ

- [ ] `local vs local` の衝突時にユーザーに確認ダイアログを表示
- [ ] どちらを採用するか選択できる UI

### 4-4. 招待コード管理 UI

- [ ] Settings > チーム > 招待コード一覧
- [ ] 発行済みコードの一覧表示、残り時間、手動無効化ボタン

### Phase 4 完了定義

- 手動同期モードで Push まで保留できる
- CO-HOST が承認・キックできる
- 衝突時にユーザーが選択できる

---

## Phase 5: キック・ブロック + バージョン管理 + 強制アップデート通知

> 目標: 運用品質の向上

### 5-1. キックとブロック

- [ ] `member_kick` Operation（CO-HOST 以上）
- [ ] `member_block` Operation（HOST 限定、`priority: high`）
- [ ] `members.status`: `kicked` / `blocked` の扱い
- [ ] ブロックされたメンバーは新コードでも参加不可
- [ ] ブロック解除フロー（status を `kicked` に変更 → 新コード発行）

### 5-2. 参加申請のキャンセル

- [ ] 申請者が `member_cancel` Operation で取り消し
- [ ] 承認前のみキャンセル可能

### 5-3. Operation の version フィールド

- [ ] 全 Operation に `version: "1.0"` を付与
- [ ] 知らない `type` はスキップ
- [ ] 知らない `version` は「アップデートが必要です」と表示してスキップ

### 5-4. 強制アップデート通知

- [ ] チーム内でバージョンが混在する場合、古いクライアントに通知
- [ ] 破壊的変更時は強制アップデートを促す

### 5-5. Inbox との統合

- [ ] 参加申請を Inbox に表示（仕様 4-7 の UI イメージ）
- [ ] 承認・拒否ボタン

### Phase 5 完了定義

- キック・ブロックが動作する
- バージョン管理で後方互換を維持できる
- Inbox で参加申請を処理できる

---

## 実装時の共通ルール

| ルール | 内容 |
|--------|------|
| 1機能ずつ | 1 つの機能を実装・動作確認してから次へ進む |
| プロトタイプ優先 | まず動く状態を目指し、細部は後回し |
| 仕様との整合 | 変更が発生したら `specs/kastrix_team_design.md` も更新 |
| 確認 | 触れる・見れる状態になったらユーザーに確認を取る |

---

## 参照ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| `specs/kastrix_team_design.md` | チーム機能の設計・仕様 |
| `mockup/team-feature.html` | チーム機能の追加UIモックアップ（実装前に確認） |
| `agent_docs/workflow.md` | 作業フロー（設計確認 → 実装 → レビュー） |
| `agent_docs/ui.md` | UI 実装時のモックアップ・コンポーネント方針 |
| `specs/specification.md` | 全体仕様（データモデル・UI 仕様） |

---

*Kastrix Team Feature Implementation Guide — 2026.03*
