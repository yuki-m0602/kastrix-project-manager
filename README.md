# Kastrix

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/yuki-m0602/kastrix-project-manager?logo=github&label=release)](https://github.com/yuki-m0602/kastrix-project-manager/releases/latest)

デスクトップ向けのプロジェクト管理アプリです。バックエンドは [Tauri](https://tauri.app/)（Rust）、フロントは HTML / CSS / JavaScript で構成しています。

## 主な機能

- **プロジェクト管理** — 複数プロジェクトの登録と状態の把握
- **タスク管理** — 作成・編集・状態（Todo / In Progress / Done など）
- **ダッシュボード** — プロジェクト全体の俯瞰
- **IDE 連携** — VS Code / Cursor / OpenCode などでの作業との連携
- **AI アシスタント** — ログの参照やプロジェクトに関する問い合わせへの対応
- **リアルタイム更新** — 変更内容の反映

詳細な仕様は [`specs/`](specs/) を参照してください。

## ダウンロード（Windows）

**[Releases（最新版）](https://github.com/yuki-m0602/kastrix-project-manager/releases/latest)** の **Assets** から **単体の実行ファイル（`.exe`）** を取得してください。MSI などのインストーラは配布していません（配置したフォルダでそのまま起動できます）。

- **`main` または `master` へ push するたび**、GitHub Actions（`.github/workflows/release.yml`）が Windows 用 exe をビルドし、リリース **`continuous`** を更新します。`/releases/latest` はビルド成功後、この rolling リリースを「最新」として指すようにしています（その後に `v*` タグで版付きリリースを公開した場合は、一時的にそちらが「最新」になることがあります。次に `main` / `master` へ push すると再び `continuous` が最新になります）。
- 版付きのリリースが欲しいときは、`src-tauri/tauri.conf.json` の `version` に合わせて **`v0.1.0` 形式のタグ** を push してください（同じワークフローが版付きリリースも作成します）。
- ローカルビルド時は `npx tauri build` のあと、`src-tauri/target/release/kastrix.exe` が生成されます。
- 実行には **WebView2** が必要です。[ランタイムの入手先（Microsoft）](https://developer.microsoft.com/ja-jp/microsoft-edge/webview2/) を参照してください。Windows 10 / 11 の多くの環境では既に入っています。

> 初回だけ Actions の権限に注意: リポジトリの **Settings → Actions → General → Workflow permissions** で **Read and write** が有効になっている必要がある場合があります（組織リポジトリでは管理者設定次第です）。

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

`beforeBuildCommand` で CSS をビルドしたうえで、**単体 exe**（インストーラなし）を生成します。成果物は `src-tauri/target/release/kastrix.exe` です。

```bash
npx tauri build
```

（`cargo install tauri-cli` 等で CLI を入れている場合は `cargo tauri build` でも可。）

UI の CSS ビルドと Rust の `release` コンパイルのみ行う場合は `npm run build:exe` を参照してください（バンドルは行わず exe のみのビルドに近い用途向け）。


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
