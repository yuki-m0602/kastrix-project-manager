# Kastrix ファイル分割設計図

## 概要
巨大ファイル（main.js: 444行, settings_team.js: 45KB）の保守性を改善するため、機能ベースの分割を実施。

## ✅ 完了した分割

### main.js 分割 ✅

| ファイル | 状態 |
|---------|------|
| [ui/js/init.js](ui/js/init.js) | ✅ 作成済み |
| [ui/js/events.js](ui/js/events.js) | ✅ 作成済み |
| ~~ui/js/search.js~~ | 削除（検索は `main.js` に統一） |
| ~~ui/js/logs.js~~ | 削除（ログは `main.js` に統一） |
| [ui/js/conflict.js](ui/js/conflict.js) | ✅ 作成済み |
| [ui/js/data.js](ui/js/data.js) | ✅ 作成済み |

### settings_team.js 分割 ✅

| ファイル | 状態 |
|---------|------|
| [ui/team/members.js](ui/team/members.js) | ✅ 作成済み |
| [ui/team/invites.js](ui/team/invites.js) | ✅ 作成済み |
| [ui/team/sync.js](ui/team/sync.js) | ✅ 作成済み |
| [ui/team/settings.js](ui/team/settings.js) | ✅ 作成済み |
| [ui/team/debug.js](ui/team/debug.js) | ✅ 作成済み |
| [ui/team/view.js](ui/team/view.js) | ✅ 作成済み |

## 依存関係
- 各モジュールはapi.js, constants.js, toast.jsに依存
- チーム関連はteam/配下のモジュール間で依存
- イベント関連は `data.js`（データ・チーム整合）・`events.js`（Tauri listen）・`main.js`（検索・ログUI）に依存

## 移行順序
1. ✅ 空のモジュールファイル作成
2. ✅ 機能単位で関数移動
3. ✅ インポート文追加 (index.html)
4. ⏳ テスト実行 (要確認)
5. ⏳ 元ファイルから重複削除 (テスト後に実施)

## リスク対策
- ⏳ 各分割後にフルテスト実行 (必須)
- ✅ バックアップブランチ作成 (feature/team-ui-refinement)
- ⏳ エラー発生時は即時ロールバック

## 残作业
- ビルドテスト実行
- main.jsから重複コードを削除
- settings_team.jsから重複コードを削除