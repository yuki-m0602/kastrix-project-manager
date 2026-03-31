# Kastrix

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/yuki-m0602/kastrix-project-manager?logo=github&label=release)](https://github.com/yuki-m0602/kastrix-project-manager/releases/latest)

デスクトップ向けのプロジェクト管理アプリです。バックエンドは [Tauri](https://tauri.app/)（Rust）、フロントエンドは HTML / CSS / JavaScript で構成しています。

## 機能

- **プロジェクト管理** — 複数プロジェクトの登録と状態管理
- **タスク管理** — タスクの作成・編集・状態管理（Todo / In Progress / Done など）
- **ダッシュボード** — プロジェクト全体の俯瞰
- **IDE 連携** — VS Code / Cursor / OpenCode との連携
- **AI アシスタント** — ログの参照やプロジェクトに関する問い合わせへの対応
- **チーム同期** — P2P によるメンバー間のリアルタイム同期（[iroh](https://github.com/n0-computer/iroh) / QUIC）

詳細な仕様は [`specs/`](specs/) を参照してください。

## ダウンロード（Windows）

**[Releases](https://github.com/yuki-m0602/kastrix-project-manager/releases/latest)** の Assets から単体の実行ファイル（`.exe`）を取得してください。インストーラは不要で、配置したフォルダからそのまま起動できます。

実行には **WebView2** が必要です。Windows 10 / 11 の多くの環境には既にインストールされています。未インストールの場合は [Microsoft の配布ページ](https://developer.microsoft.com/ja-jp/microsoft-edge/webview2/) から取得してください。

## 必要な環境

- [Rust](https://www.rust-lang.org/tools/install)（stable）
- [Node.js](https://nodejs.org/)（npm 同梱）
- Tauri の前提条件については [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) を参照してください。

## セットアップ

```bash
# 依存関係のインストール
npm install

# CSS のビルド（初回、および ui/ 内のスタイル変更時）
npm run css:build

# 開発モードで起動
npx tauri dev
```

Windows では [`scripts/windows/dev.bat`](scripts/windows/dev.bat) を使うと、Tailwind のウォッチと開発サーバをまとめて起動できます。

## ビルド（本番用）

```bash
npx tauri build
```

成果物はリポジトリルートの `target/release/kastrix.exe` に生成されます。

## テスト

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## プロジェクト構成

```
.
├── src-tauri/      # Tauri（Rust）アプリ・コマンド・設定
├── ui/             # フロントエンド（HTML / JS / スタイル）
├── specs/          # 仕様書
└── package.json    # フロントエンド用スクリプト・開発依存
```

## 開発コマンド

| 用途 | コマンド |
|------|----------|
| ESLint | `npm run lint` |
| Rust フォーマット | `npm run rustfmt` |
| Clippy | `npm run clippy` |

## コントリビューション

Issue やプルリクエストを歓迎します。大きな変更を加える前に、Issue で方針をご相談いただけるとスムーズです。

## ライセンス

[MIT License](LICENSE)
