# Kastrix

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

デスクトップ向けのプロジェクト管理アプリです。バックエンドは [Tauri](https://tauri.app/)（Rust）、フロントは HTML / CSS / JavaScript で構成しています。

## 主な機能

- **プロジェクト管理** — 複数プロジェクトの登録と状態の把握
- **タスク管理** — 作成・編集・状態（Todo / In Progress / Done など）
- **ダッシュボード** — プロジェクト全体の俯瞰
- **IDE 連携** — VS Code / Cursor / OpenCode などでの作業との連携
- **AI アシスタント** — ログの参照やプロジェクトに関する問い合わせへの対応
- **リアルタイム更新** — 変更内容の反映

詳細な仕様は [`specs/`](specs/) を参照してください。

## 必要な環境

- [Rust](https://www.rust-lang.org/tools/install)（stable）
- [Node.js](https://nodejs.org/)（npm 同梱）
- OS ごとの Tauri 前提条件（ビルドツール、WebView2 など）は [Tauri の Prerequisites](https://v2.tauri.app/start/prerequisites/) を確認してください。

## セットアップと実行

リポジトリをクローンしたあと、リポジトリのルートで次を実行します。

```bash
npm install
```

初回および `ui/` 内の HTML / JS を変更してスタイルを反映するときは、Tailwind のビルドが必要です。

```bash
npm run css:build
```

開発モードでアプリを起動する例です。

```bash
npx tauri dev
```

別ターミナルでスタイルのウォッチとローカルプレビュー用サーバを動かす場合は `package.json` の `dev` / `start` スクリプトも利用できます。

Tauri CLI を Cargo でインストール済みの場合は、`cargo tauri dev` / `cargo tauri build` も利用できます。

Windows では [`scripts/windows/dev.bat`](scripts/windows/dev.bat) から、Tailwind のウォッチと `npx tauri dev` をまとめて起動できます。ビルド用バッチは同じフォルダにあります。

## ビルド（本番用）

`beforeBuildCommand` で CSS がビルドされたうえで、インストーラ／バンドルを生成します。

```bash
npx tauri build
```

（`cargo install tauri-cli` 等で CLI を入れている場合は `cargo tauri build` でも可。）

UI の CSS ビルドと Rust の `release` コンパイルのみ行う場合は `npm run build:exe` を参照してください（`package.json` の定義どおり）。


## テスト

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## プロジェクト構成

```
.
├── src-tauri/          # Tauri（Rust）アプリ・コマンド・設定
├── ui/                 # フロントエンド（HTML / JS / スタイル）
├── specs/              # 仕様書
├── plans/              # 設計メモ
├── mockup/             # UI モックアップ
├── agent_docs/         # 開発者向け手順（エージェント・ワークフロー用）
├── AGENTS.md           # リポジトリ内開発のガイドライン
├── package.json        # フロント用スクリプト・開発依存
├── scripts/windows/    # Windows 向け開発・デバッグ用バッチ
└── Cargo.toml          # ワークスペース定義
```

## 開発でよく使うコマンド

| 用途 | コマンド |
|------|----------|
| ESLint | `npm run lint` |
| Rust フォーマット | `npm run rustfmt` |
| Clippy | `npm run clippy` |

## ライセンス

このプロジェクトは **MIT License** の下で公開されています。全文は [LICENSE](LICENSE) を参照してください。

著作権表示をプロダクトに含める場合は、上記ファイルの Copyright 行に従ってください。権利者名を特定の個人・組織に変更する場合は、`LICENSE` 内の Copyright 表記を更新してください。

## コントリビューション

Issue やプルリクエストを歓迎します。大きな変更を加える前に、方針のすり合わせがあるとスムーズです。
