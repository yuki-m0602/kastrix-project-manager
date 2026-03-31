# Kastrix 仕様書

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | Kastrix |
| 種別 | デスクトップアプリケーション |
| 対象ユーザー | ソフトウェア開発者 |
| 目的 | ローカル開発プロジェクトの一元管理とタスク追跡 |

## 2. 技術仕様

| 項目 | 内容 |
|------|------|
| フレームワーク | Tauri |
| フロントエンド | HTML/CSS/JavaScript |
| バックエンド | Rust |
| 対象プラットフォーム | Windows / macOS / Linux |
| UIスタイル | ダークテーマ（GitHub風） |

## 3. 機能要件

### 3.1 プロジェクト管理

| ID | 機能 | 説明 |
|----|------|------|
| P-01 | ディレクトリ監視 | 指定したディレクトリを監視し、Gitリポジトリを自動検出 |
| P-02 | プロジェクト一覧 | 検出したプロジェクトをグリッド/リスト表示 |
| P-03 | プロジェクト詳細 | パス、言語、最終更新日、Gitコミット情報を表示 |
| P-04 | IDE連携 | VSCode / Cursor / OpenCode から選択して起動 |
| P-05 | README表示 | プロジェクトのREADME.mdをプレビュー |
| P-06 | 言語フィルタ | JavaScript/TypeScript/Python/Rust/Goなどでフィルタ |
| P-07 | ソート機能 | 名前/ローカル更新日/Git更新日/言語でソート |

### 3.2 タスク管理

| ID | 機能 | 説明 |
|----|------|------|
| T-01 | タスク一覧 | プロジェクト別または全タスクを表示 |
| T-02 | ビュー切替 | リストビュー / カンバンボードビュー |
| T-03 | ステータス管理 | Todo / In Progress / Done の3状態 |
| T-04 | タスク詳細 | タイトル、担当者、期限、優先度、説明を表示 |
| T-05 | タブ機能 | 複数プロジェクトのタスクをタブで切替 |
| T-06 | フィルタ | プロジェクト別、ステータス別にフィルタ |

### 3.3 アクティビティログ

| ID | 機能 | 説明 |
|----|------|------|
| L-01 | 履歴表示 | タスク操作履歴を時系列（タイムライン）で表示 |
| L-02 | アクション種別 | 作成/開始/完了などの状態変化を記録 |
| L-03 | CSV出力 | ログをCSV形式でダウンロード |

### 3.4 AI機能

| ID | 機能 | 説明 |
|----|------|------|
| A-01 | Log Analyzer | アクティビティログをAIで分析・要約 |
| A-02 | チャットUI | フローティングチャットボックスで対話 |

### 3.5 共通機能

| ID | 機能 | 説明 |
|----|------|------|
| C-01 | サイドバー | Overview/Projects/Activity Logs/Inbox/Analytics/Settings |
| C-02 | サイドバー折りたたみ | アイコン表示に切り替え可能 |
| C-03 | 検索 | プロジェクト名、タスク名で検索 |

## 4. データモデル

### 4.1 Project

```
Project {
  id: string
  name: string
  path: string
  language: string
  localModified: DateTime
  gitModified: DateTime
  lastCommit: string
  hasReadme: boolean
  readmeContent: string
}
```

### 4.2 Task

```
Task {
  id: string
  projectId: string
  title: string
  status: "todo" | "in-progress" | "done"
  priority: "high" | "medium" | "low"
  dueDate: DateTime
  assignee: string
  description: string
  createdAt: DateTime
  updatedAt: DateTime
}
```

### 4.3 ActivityLog

```
ActivityLog {
  id: string
  taskId: string
  projectId: string
  action: "created" | "started" | "completed" | "updated"
  taskTitle: string
  projectName: string
  modifiedBy: string
  timestamp: DateTime
}
```

## 5. UI仕様

### 5.1 カラースキーム

| 要素 | カラー |
|------|--------|
| 背景（メイン） | #0d1117 |
| 背景（セカンダリ） | #161b22 |
| ボーダー | #30363d |
| テキスト（メイン） | #c9d1d9 |
| テキスト（セカンダリ） | #8b949e |
| テキスト（無効） | #484f58 |
| アクセント | #6366f1（インディゴ） |
| 成功 | #10b981（エメラルド） |
| 警告 | #f59e0b（アンバー） |
| 情報 | #3b82f6（ブルー） |

### 5.2 言語バッジカラー

| 言語 | バッジ色 |
|------|----------|
| JavaScript | #f1e05a |
| TypeScript | #2b7489 |
| Python | #3572A5 |
| Rust | #dea584 |
| Go | #00ADD8 |
| HTML | #e34c26 |
| CSS | #563d7c |
| Java | #b07219 |
| Shell | #89e051 |

### 5.3 画面構成

```
+------------------+------------------------+
|                  |                        |
|   Sidebar        |     Main Content       |
|   (224px)        |     (flexible)         |
|                  |                        |
|  - Overview      +------------------------+
|  - Projects      |     Tabs               |
|  - Logs          +------------------------+  
|  - Inbox         |                        |
|  - Analytics     |     View Content       |
|  - Settings      |     (List/Kanban/Grid) |
|                  |                        |
+------------------+------------------------+
```

## 6. 非機能要件

| 項目 | 要件 |
|------|------|
| パフォーマンス | プロジェクト100件まで3秒以内に表示 |
| データ永続化 | SQLiteでローカル保存 |
| ファイル監視 | OSネイティブAPI使用（notifyクレート） |
| Git連携 | git2クレートでリポジトリ情報取得 |
| セキュリティ | ローカルファイルアクセスのみ、外部通信はAI機能のみ |

### 6.1 APIキー管理

AI機能（Log Analyzer）で使用するAPIキーの管理方式：

| 項目 | 内容 |
|------|------|
| 保存先 | OSネイティブキーストア（keyring crate使用） |
| 対応プロバイダー | OpenAI, Anthropic |
| フロー | 1. クライアントでAPIキー入力 → 2. Rustコマンド経由で暗号化保存 → 3. 使用時はRust経由で復号取得 |
| セキュリティ | 平文はクライアントに残らない、メモリ上のみ保持 |

**OS別保存先：**
- Windows: Credential Manager
- macOS: Keychain
- Linux: Secret Service API (libsecret)

## 7. 今後の拡張（アイデア）

チーム機能の**同期方式・アーキテクチャ**（サーバーレス P2P、[iroh](https://github.com/n0-computer/iroh)、QUIC/TLS、NAT 越えなど）は、本書では詳述せず **[`kastrix_team_design.md`](kastrix_team_design.md)** に集約する。

- [ ] Inbox機能（通知センター）
- [ ] Analytics機能（統計グラフ）
- [ ] Settings画面（設定）
- [ ] 複数ディレクトリ監視
- [ ] タスクの追加・編集機能
- [ ] チーム共有機能（方式・詳細は上記チーム設計ドキュメントを参照）

---

**作成日**: 2024年
**バージョン**: 1.0.0
