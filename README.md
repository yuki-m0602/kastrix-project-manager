# Kastrix - Project Manager

Kastrixは、Rust + Tauriで構築されたプロジェクト管理アプリケーションです。

## 機能概要

- **プロジェクト管理**: 複数のプロジェクトを管理し、状態を一元管理
- **タスク管理**: タスクの作成・編集・状態管理（Todo/InProgress/Done）
- **ダッシュボード**: プロジェクトの全体像を一目で把握
- **IDE連携**: VSCode/Cursor/OpenCodeなど主要IDEとの連携
- **AIアシスタント**: ログ分析やプロジェクト情報の質問対応
- **リアルタイム更新**: プロジェクトの変更を即座に反映

## 開発環境

- **言語**: Rust + HTML/CSS/JS
- **フレームワーク**: Tauri
- **UIライブラリ**: Tailwind CSS + Lucide React
- **フォント**: Inter

## プロジェクト構造

```
project-root/
├── src/
│   └── main.rs              # メインアプリケーション
├── ui/
│   └── index.html          # メイン画面 (kastrix_fixed-40.html)
├── AGENTS.md              # 開発ガイドライン
├── README.md              # このファイル
└── Cargo.toml             # Rustパッケージ管理
```

## ビルド方法

```bash
# 依存関係のインストール
cargo tauri init

# 開発モードで起動
cargo tauri dev

# 本番ビルド
cargo tauri build
```

## 起動方法

```bash
# 開発モード
cargo tauri dev

# 本番モード
cargo tauri build
```

## 機能詳細

### 1. プロジェクト管理
- プロジェクトの追加・削除
- プロジェクトの状態管理（Gitリポジトリの状態）
- プロジェクトの詳細情報表示

### 2. タスク管理
- タスクの作成・編集・削除
- 状態管理（Todo/In Progress/Done）
- 優先度設定（High/Medium/Low）
- 担当者割り当て
- 期限設定

### 3. ダッシュボード
- プロジェクトの全体像表示
- タスクの進捗状況
- アクティビティログ
- 分析チャート

### 4. IDE連携
- VSCode、Cursor、OpenCodeとの連携
- プロジェクトの直接起動
- 設定ファイルの自動読み込み

### 5. AIアシスタント
- ログ分析
- プロジェクト情報の質問対応
- タスクの提案

## ライセンス

MIT License