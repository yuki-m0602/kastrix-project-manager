# ホスト退出・CO-HOST 自動移譲 仕様書

> 作成日: 2026-03  
> 参照: `kastrix_team_design.md` 4-5 共同ホスト  
> 目的: 「ホストが退出した場合は次のCO-HOSTに自動移譲」の具体仕様

---

## 1. 確定仕様

### 1-1. 「退出」の定義

**決定**: ホストが `team_leave`（unsubscribe + DB 削除）を実行したとき。

- ユーザーが「チームを退出」ボタンを押す
- アプリ終了時も `beforeunload` 等で unsubscribe を呼ぶ前提
- iroh-gossip の `Event::NeighborDown` で離脱を検知可能

### 1-2. 移譲条件

| 条件 | 動作 |
|------|------|
| CO-HOST が 1 人以上いる | 最古の CO-HOST を新 HOST に昇格 |
| CO-HOST が 0 人 | チーム解散 |

### 1-3. 複数 CO-HOST 時の新ホスト選定

**決定**: `members` の `joined_at` が早い CO-HOST を新ホストとする。

### 1-4. CO-HOST が 0 人の場合

**決定**: チーム解散。全員が unsubscribe + DB クリア。

### 1-5. 退出のトリガー

**決定**: 基本は退出者自身が `permission_change` または `team_disband` をブロードキャストしてから退出。クラッシュ時は NeighborDown フォールバックで補完。

---

## 2. エッジケース・フォールバック

### 2-1. 想定される問題と対策

| 問題 | 発生条件 | 対策 |
|------|----------|------|
| クラッシュ・強制終了 | ホストがアプリを正常終了せず落ちた | **フォールバック**: 残存メンバーが NeighborDown を検知したら移譲処理を実行 |
| ネットワーク断 | 退出時にオフライン | ブロードキャスト後に 1〜2 秒待機してから unsubscribe。送信失敗時はリトライ |
| タイミング | ブロードキャスト直後に unsubscribe | ブロードキャスト後に 1〜2 秒待機してから unsubscribe |
| オフライン復帰 | 退出時にオフラインだったメンバー | 起動時の `restore_team_subscriptions` で members を DB から復元 |

### 2-2. NeighborDown フォールバック

**採用**: 残存メンバーが `Event::NeighborDown(node_id)` を検知したとき、以下を実行。

1. 離脱した `node_id` が `members` の `host` の `endpoint_id` と一致するか判定
2. 一致する場合のみ移譲処理を実行（`permission_change` が先に届いていれば既に更新済みのため、離脱 node_id は旧ホストで members にいない → 何もしない）
3. 移譲処理の実行者: **CO-HOST のみ**（MEMBER は実行しない。CO-HOST 0 の場合は 2-4 参照）

### 2-3. 二重実行の防止

| 対策 | 内容 |
|------|------|
| 冪等性 | permission_change / team_disband は同じ内容を複数回受信しても結果は同じ |
| 送信者制限 | NeighborDown 検知時の移譲は CO-HOST のみ。team_disband は 2-4 参照 |
| ホスト判定 | 離脱 node_id が members の host と一致する場合のみ処理。permission_change 済みなら一致しない |

### 2-4. CO-HOST 0 でホストがクラッシュした場合

残りは MEMBER のみ。**最古の MEMBER**（`joined_at` が早い人）が NeighborDown を検知したら `team_disband` をブロードキャストする。複数人が送っても冪等なので問題なし。

### 2-5. チーム解散フロー

| パターン | 発行者 | 内容 |
|----------|--------|------|
| 正常退出（CO-HOST 0） | ホスト自身 | `team_disband` をブロードキャストしてから unsubscribe |
| クラッシュ（CO-HOST 0） | 最古の MEMBER | NeighborDown 検知時に `team_disband` をブロードキャスト |

受信者は `team_disband` を受信 → unsubscribe + team_subscriptions / members 等を DB からクリア。

---

## 3. フロー概要

### 3-1. 正常退出（ホストが team_leave 実行）

```
ホストが「チームを退出」を実行
  ↓
CO-HOST がいる？
  YES → 最古の CO-HOST を新 HOST に指定した permission_change をブロードキャスト
  NO  → team_disband をブロードキャスト
  ↓
1〜2 秒待機（配信を待つ）
  ↓
自分自身: unsubscribe + DB から team_subscriptions 削除
  ↓
他メンバー: permission_change または team_disband 受信 → members 更新 / 解散処理
```

### 3-2. クラッシュ時フォールバック（NeighborDown 検知）

```
誰かが NeighborDown(node_id) を検知
  ↓
離脱 node_id が members の host と一致？
  NO  → 何もしない（単なるメンバー離脱）
  YES → 以下へ
  ↓
CO-HOST がいる？
  YES → 最古の CO-HOST が permission_change をブロードキャスト
  NO  → 最古の MEMBER が team_disband をブロードキャスト
  ↓
受信者: members 更新 / 解散処理
```

---

## 4. 必要な Operation 種別

| type | 用途 | 発行者 |
|------|------|--------|
| `permission_change` | 新ホストの指定（旧 host を削除、最古 co_host を host に昇格） | 退出ホスト または NeighborDown 検知した CO-HOST |
| `team_disband` | チーム解散の通知 | 退出ホスト または NeighborDown 検知した最古 MEMBER |

---

## 5. 実装上の注意点

1. **NeighborDown のリッスン**: 現状はホストのみ NeighborUp を処理。**全メンバー（ホスト・CO-HOST・MEMBER）** が NeighborDown をリッスンする必要がある。`spawn_topic_listener` の `is_host` に関係なく NeighborDown を処理する。

2. **team_leave コマンド**: ホスト・CO-HOST・MEMBER 全員が「チームを退出」できる。ホストの場合は上記フローで移譲または解散を実行してから unsubscribe。

3. **アプリ終了時**: Tauri の `on_window_event` や `beforeunload` で、チーム参加中なら `team_leave` 相当の処理（permission_change / team_disband 送信 → 待機 → unsubscribe）を呼ぶ。

---

## 6. ペイロード形式（仕様化済み）

### permission_change

```json
{
  "type": "permission_change",
  "version": "1.0",
  "old_host_endpoint_id": "退出するホストのEndpointID",
  "new_host_endpoint_id": "昇格するCO-HOST（最古）のEndpointID"
}
```

- 受信時: `members` から `old_host_endpoint_id` を削除、`new_host_endpoint_id` の role を `host` に更新
- 新ホストのノード: `team_subscriptions.is_host` を 1 に更新

### team_disband

```json
{
  "type": "team_disband",
  "version": "1.0"
}
```

- 受信時: unsubscribe + `team_subscriptions` / `members` を DB からクリア

---

## 7. 次のステップ

- `team_leave` コマンドの実装
