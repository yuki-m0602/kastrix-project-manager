# モーダル・競合 UX 改善計画

タスク詳細／編集の二重オーバーレイ、競合ダイアログの誤検知・表示不具合、競合解決時の一律モーダルクローズなどを整理し、`specs/kastrix_team_design.md` の「local vs local → ユーザー確認」に沿った**読み取れる UI**と**積み上がらない開閉**を目指す。

---

## 1. あるべき体験（理想フロー・要約）

- **同期**: 問題なければ裏で反映し、一覧は静かに更新される。
- **タスク**: 開いているオーバーレイは**常に主役が1つ**分かる。詳細→編集は「詳細を閉じて編集のみ」または**同一パネル内遷移**（二重の全画面 `fixed` を積まない）。
- **競合**: **本当に local vs local で内容が割れたときだけ**最前面に比較 UI。手元／受信の内容が読める。選んだあとは DB 仕様どおり（保持＋seq スキップ／受信で上書き）し、**データ再読込で画面と整合**。
- **解決のたびに無関係モーダルを一括で畳む**ことは理想ではない。普段から積み上がらない設計にし、対症の「全部 close」に依存しない。

---

## 2. 現状の問題と仮説（要検証）

| ID | 現象 | 仮の原因 |
|----|------|----------|
| A | 詳細の上に編集が乗る | `openEditTaskModal` が `closeTaskModal` しない。`history` は `task-edit` のみ `push` |
| B | 競合前後で他モーダルが一括クローズ | `showConflictDialog` / `resolveConflict` の明示的 `close*`（積み残り対症） |
| C | 競合してないのにダイアログ | `ts_source == local` × `last_update_source == local` が広い。`task_equal_for_conflict` がメタデータまで完全一致 |
| D | 競合 UI が `-` のみ | `team-conflict` ペイロードの形とフロント解釈の不一致、または IPC でネスト欠落（**ログで確定**） |
| E | `confirm` 後など操作不能 | A+B、`brieflyBlockMainPointerEvents` の重ね、`#main-area` 内 `overflow` + `fixed`（再現条件つきで切り分け） |

---

## 3. 原因究明（実施順）

1. **`team-conflict` ペイロードの固定**  
   - WebView: `listen` 内で受信オブジェクトを `JSON.stringify`（開発時のみ可）。  
   - Rust: `emit` 直前に `serde_json::to_string` をログ。  
   - 両者の一致で D を確定。

2. **誤検知 1 件のトレース**  
   - 該当 `task_update` の `operations.payload` と DB の `last_update_source`、両版タスクの差分を記録し C を確定。

3. **DOM 状態のスナップショット**  
   - 詳細→編集直後の `#task-modal` / `#task-edit-modal` の `display` と z-index。`confirm` 再現時も同様（E）。

4. **仕様対照表**  
   - 設計書 5-4 の衝突パターンと `apply_task_update` の分岐を 1 表にし、差分を列挙。

---

## 4. 修正方針（検証後の手）

### 4-1 A（必須）

- 編集開始時に**詳細を閉じる**（最短: `openEditTaskModal` 先頭で `closeTaskModal`）。  
- `history.back()` と `pushState` が二重になる場合は **`closeTaskModal` の履歴扱いを分離**（例: `skipHistory`）し、「詳細→編集」で履歴が不自然に増えないようにする。

### 4-2 B（推奨）

- `showConflictDialog` / `resolveConflict` から**無関係モーダルの一律 `close*` をやめる**。  
- 必要なら「**同一タスクを編集中**に競合したときだけ編集を閉じる／未保存の扱いを明示」など、**モーダル規約を 1 本の文章**で決めてから実装。

### 4-3 C（Rust・仕様確認後）

- 同一判定を**意味的フィールド中心**に緩める、または `is_local_vs_local` の条件を**仕様と整合**する形で狭める。  
- NTP 失敗で `ts_source` が常に `local` になる件と衝突判定の関係を整理（必要なら判定用フラグの分離）。

### 4-4 D（観測結果で分岐）

- ペイロードが正しく届いている → フロントを**その形に一本化**（テストで固定）。  
- 届き方が不安定 → Rust 側に**表示用フラットフィールド**を載せる。

### 4-5 E（A・B 後に再現が残る場合）

- `brieflyBlockMainPointerEvents` の重ね掛け対策。  
- 長期: タスク系モーダルを `#main-area` 外へ（競合モーダルと同様の配置方針）。

---

## 5. 推奨実装順序

1. 観測（セクション 3）と A の DOM 確認  
2. A 実装（1 枚化 + 履歴整理）  
3. D 確定修正  
4. B 実装（規約に沿って一律 close 削除）  
5. C 実装  
6. E（再現が残る場合のみ）

---

## 6. 成果物

- [ ] 本書の更新（検証結果・決定したモーダル規約を追記）  
- [ ] 競合 1 件分の再現ログ（Rust JSON + 該当 operation + 必要なら DB スナップショット）

---

## 7. 参照

- `specs/kastrix_team_design.md`（5-2 タイムスタンプ、5-4 衝突パターン）  
- `ui/js/tasks.js`（`openEditTaskModal` / `closeTaskModal`）  
- `ui/js/main.js`（`showConflictDialog` / `resolveConflict`）  
- `src-tauri/src/team/task_sync.rs`（`apply_task_update`）  
- `src-tauri/src/commands/team/mod.rs`（`team_resolve_conflict`）

---

## 8. 原因調査ツール（実装済み）

### 8-1. `team-conflict` ペイロード（Rust ↔ WebView の突き合わせ）

**Rust（stderr）**

- 起動前に環境変数を付与: `KASTRIX_DEBUG_TEAM_CONFLICT=1`  
  （Windows PowerShell 例: `$env:KASTRIX_DEBUG_TEAM_CONFLICT='1'; npx tauri dev`）
- 競合が emit されると:
  - 差分フィールド一覧（`unequal_fields`）と local/incoming の title・status
  - 続けて **`team-conflict emit JSON:`** ＋ `ConflictInfo` 全体の JSON 1 行

**WebView（コンソール）**

- `localStorage.setItem('kastrixDebugTeamEvents', '1')` を実行してからページ再読込（またはアプリ再起動）
- または `window.__KASTRIX_DEBUG_TEAM_EVENTS = true`
- `team-conflict` 受信時に **raw 引数** と **`unwrapTeamConflictArg` 後の JSON** を `console.info`

→ **同じ操作で Rust の JSON 行と Web の `unwrapped JSON` を並べて比較**し、D（`-` 表示）の原因が「届いていない」「キー解釈」「そもそも空」かを確定する。

### 8-2. モーダル DOM スナップショット（A / E）

- DevTools コンソールで `__kastrixDumpModalState()` を実行
- `task-modal` / `task-edit-modal` / `conflict-modal` などの **computed display / pointer-events / z-index** が表形式で出る
- 詳細→編集直後や `confirm` 直後に実行し、**二重に `display` が効いていないか**を記録する

### 8-3. 既存の応急

- `__kastrixResetModals()` — 取り残しオーバーレイの手動解除（`main.js`）

---

## 9. 仕様対照（§3-4 調査結果）— `kastrix_team_design` 5-2 / 5-4 vs `apply_task_update`

**調査対象:** `src-tauri/src/team/task_sync.rs` の `apply_task_update`（create/update 分岐、約 L267–L343）。

### 9-1. 実装が使う条件（コード）

1. `incoming_ts_local` = `payload.ts_source.as_deref() == Some("local")`
2. `local_source` = 既存行の `tasks.last_update_source`（行なし・取得失敗時は `None`）
3. `is_local_vs_local` = `incoming_ts_local && local_source.as_deref() == Some("local")`

- `true` → 競合分岐（同一タスクなら no-op、異なれば `team-conflict` 候補）
- `false` → **無条件 upsert**（`payload.timestamp` は **未使用**）

### 9-2. 真理表（受信 × 行）

| 受信 `ts_source` | 行なし / `last_update_source` ≠ `local` | `last_update_source == 'local'` |
|------------------|----------------------------------------|----------------------------------|
| `ntp`（`Some("local")` 以外） | upsert | upsert（local×local に入らない） |
| `local` | upsert | local×local → 全フィールド一致で no-op、不一致で `team-conflict` |

行が無いとき `local_source` は `None` のため local×local にならず insert/upsert 側へ進む。

### 9-3. 仕様 5-4 との対応

| 仕様 5-4 | 実装 | 一致度 |
|----------|------|--------|
| 衝突なし → 順番適用 | gossip 受信順に apply、非 local×local は upsert | 概ね一致 |
| ntp vs local → ntp 優先 | 受信が `ntp` なら常に upsert（行が local でも上書き） | 意図に近い |
| local vs local → ユーザー確認 | 9-1 の条件＋`task_equal_for_conflict`（時刻・`created_by` 等まで完全一致要求） | 入口・同一判定が厳しすぎると誤検知 |
| **ntp vs ntp → 時刻 LWW** | **未実装**。両方 `ntp` でも **適用順のみ**（最後のメッセージが勝つ）。`timestamp` 比較なし | **仕様未達** |

### 9-4. 仕様 5-2 との関係

5-2 の「ntp は信頼度高」は、実装上 **「受信が ntp なら競合分岐をスキップして上書き」**として間接的に反映。ただし **「両方 ntp の更新を時刻で比較」は無い**。

### 9-5. その他リスク

- `is_local_vs_local` かつ `query_local_task` が失敗: emit も upsert もせず `Ok(())`（稀）。
- `team_resolve_conflict` の `incoming` は `ts_source: None` → 通常 upsert（意図どおり）。

### 9-6. 調査 4 の結論

- **明確なギャップ:** **ntp vs ntp の LWW（5-4）が未実装**。
- **ダイアログ異常の調査軸:** **local×local 条件**と **`task_equal_for_conflict`**。
- **dev / exe の差**は真理表（9-1〜9-3）だけでは説明できない。**§12** にコード根拠と切り分け手順を置く。

**旧・簡易表**

| 仕様（5-4） | 実装（要約） |
|-------------|--------------|
| ntp vs ntp LWW | 未実装（順番 upsert） |
| ntp vs local | 受信 ntp で upsert |
| local vs local | 条件一致時のみ `team-conflict` |
| 衝突なし | 順次適用 |

---

## 10. 誤検知 1 件のトレース手順（operations + DB）

1. 競合が出た直後、Rust ログ（`KASTRIX_DEBUG_TEAM_CONFLICT=1`）から **`task_id` と `seq`** を控える。  
2. アプリの SQLite（`app_data_dir` 配下の DB）を外部ツールで開くか、`sqlite3` で:
   - `SELECT seq, ts_source, payload FROM operations WHERE seq = ?`（控えた seq）  
   - `SELECT id, title, status, last_update_source, updated_at FROM tasks WHERE id = ?`（task_id）  
3. `payload` の JSON 内 `ts_source` と、DB の `last_update_source`、および local / incoming の title 差をメモする。

これで C（本当に二重 local か、メタデータだけずれているか）を切り分ける。

---

## 11. 調査 TODO の状態

| 項目 | 状態 |
|------|------|
| §3-1 ペイロード固定 | §8-1 のログで実施可能 |
| §3-2 誤検知トレース | §10 の手順で実施可能 |
| §3-3 DOM | §8-2 `__kastrixDumpModalState` |
| §3-4 対照表 | **完了** — §9（9-1〜9-6）に根拠付きで記載 |

---

## 12. dev と exe の挙動差（なぜ「dev では競合モーダルが出ず exe だけ出る」と感じるか）

### 12-1. コード上、debug / release で変わるもの

| 箇所 | 内容 |
|------|------|
| `src-tauri/src/main.rs` | `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` のみ。**release ではコンソール無しウィンドウ**、debug ではコンソール付き。 |
| `Cargo.toml` `[profile.release]` | `lto` / `strip` / `opt-level` など。**チーム同期・競合分岐の有無は変えない**（タイミングの微差は理論上あり得るが、「モーダルが出る／出ない」を反転させるような分岐は想定しにくい）。 |
| チーム系 Rust（`task_sync` / `event_handler` / `lib.rs` の iroh 初期化） | `cfg(debug_assertions)` による **競合抑制・emit スキップは無い**（`grep` で確認）。 |

→ **「同じソースをビルドした debug バイナリと release バイナリ」なら、競合モーダル表示の条件は同一**とみなしてよい。

### 12-2. `tauri dev` とインストール済み exe で変わりうるもの

| 要因 | 説明 |
|------|------|
| **読み込むフロント** | `tauri.conf.json` に `devUrl` が無く、`frontendDist` は `../ui`。dev はディスク上の `ui/` を参照、インストーラ版はバンドル。**インストール版が古い UI のまま**なら、`listen` やペイロード解釈が dev と食い違う（モーダルが出ない／`-` だけ、等）。 |
| **iroh / 同期の成否** | Rust ロジックは同じだが、**ファイアウォール・AV が `target/debug/...` と `Program Files\...` を別扱い**する例はある。片方だけ init 失敗 → 受信ゼロ → **競合分岐に到達しない**。 |
| **コンソールの有無** | init 失敗時 `eprintln!("iroh init failed ...")`（`lib.rs`）は **dev ではターミナルに見える**。**subsystem windows の exe では標準エラーが見えない**ため、「同期オフなのに気づいていない」状態になりやすい。挙動差というより**観測差**。 |
| **同時起動・DB** | identifier `com.kastrix.desktop` により **app_data_dir は通常同一**。dev と exe を**同時に**動かすと SQLite のロックや不整合のリスクがある。比較実験では **どちらか一方だけ**を起動する。 |
| **検証手順** | dev では「一人・オフライン気味」、exe では「別端末と同時編集」など、**操作条件が違う**と受信の有無が変わり、モーダルの有無も変わる（これはバグではなく入力の違い）。 |

### 12-3. モーダルが出るまでの経路（差が入り込むポイント）

1. 別端末（または同一ネットワーク上のピア）から **gossip で `task_update` が届く**  
2. `apply_task_update` が **local×local** かつ内容不一致と判定  
3. **`team-conflict` が emit される**  
4. WebView が `listen` で受け **`showConflictDialog` が動く**

**dev でモーダルが出ない**とき、まず切るのは:

- **3 が起きていない**（＝1 または 2 が満たされない）か  
- **4 だけ失敗**（CSP / イベント / 古い JS）か  

`KASTRIX_DEBUG_TEAM_CONFLICT=1` で **3 の有無を stderr に出す**（§8-1）。**Rust に JSON 行が出ているのに Web にログが無い**なら 4 側。**Rust に一行も出ない**なら 1〜2（同期・DB・操作条件）。

### 12-4. 揃えた比較のやり方（推奨）

1. **単一起動**（dev か exe のどちらか一方）。  
2. `invoke('team_debug_status')` または UI から同等の確認で、**iroh OK・購読あり**まで揃える。  
3. **同一シナリオ**（同じプロジェクト・同じ「別端末からの更新」手順）で、dev と exe を**別々のセッション**で繰り返す。  
4. 両方で §8-1 を有効にし、**`team-conflict emit JSON` が出る／出ない**を記録する。

これで「ビルド種別のバグ」か「環境・手順・フロントの版ずれ」かを切れる。
