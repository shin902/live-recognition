# Change: Electronアプリケーションの基本セットアップ

## Why

live-recognitionプロジェクトを開始するために、Electronベースのデスクトップアプリケーションの基盤が必要です。現在、プロジェクトにはソースコードが存在せず、開発環境やビルドツールも未構成です。

この変更により、以下が可能になります：
- TypeScriptとReactによる型安全なUI開発
- pnpmとViteによる高速なビルドとホットリロード
- 環境変数による設定管理（APIキーなど）
- macOSで動作する最小限のデスクトップアプリケーション

## What Changes

- **app-foundation**: Electronアプリケーションの起動、メインプロセス、レンダラープロセス、IPCの基本構造
- **environment-config**: `.env`ファイルによる環境変数管理と設定読み込み機構
- **build-tooling**: TypeScript、Vite、pnpm、ESLint、Prettierによるビルド環境とコード品質管理

これらはすべて新規追加であり、既存機能への影響はありません。

## Impact

- 影響を受ける既存仕様: なし（初期セットアップ）
- 影響を受けるコード: なし（新規作成）
- 新規追加される仕様:
  - `specs/app-foundation/spec.md`
  - `specs/environment-config/spec.md`
  - `specs/build-tooling/spec.md`

## Dependencies

なし（このプロジェクトの最初の変更提案）

## Risks

- macOS以外のプラットフォームでは動作保証なし（プロジェクト制約に従う）
- Electronのバージョンアップに伴う互換性リスク（安定版を選定して緩和）
