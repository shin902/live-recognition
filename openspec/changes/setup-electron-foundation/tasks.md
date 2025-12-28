# Implementation Tasks

## 1. プロジェクト初期化とパッケージ設定
- [ ] 1.1 `package.json`を作成し、プロジェクトメタデータとスクリプトを定義
- [ ] 1.2 `pnpm install`で依存パッケージをインストール
  - electron, react, react-dom, typescript, vite
  - electron-builder (macOSビルド用)
  - dotenv (環境変数読み込み)
  - eslint, prettier (コード品質)
- [ ] 1.3 `.gitignore`を作成（node_modules, dist, .env等を除外）

## 2. TypeScriptとビルド環境の構成
- [ ] 2.1 `tsconfig.json`を作成（strict mode有効化）
- [ ] 2.2 `vite.config.ts`を作成（Electron用にmain/renderer分離設定）
- [ ] 2.3 `.eslintrc.json`と`.prettierrc`を作成
- [ ] 2.4 pnpmスクリプトで`dev`, `build`, `lint`コマンドを動作確認

## 3. Electronメインプロセスの実装
- [ ] 3.1 `src/main/index.ts`を作成
  - アプリケーション起動処理
  - メインウィンドウ作成（800x600、macOS専用設定）
  - 開発時のDevTools自動オープン
- [ ] 3.2 環境変数読み込み処理を実装（dotenvでprocess.env経由）
- [ ] 3.3 IPC通信の基本的なハンドラーを実装（設定取得用）

## 4. Reactレンダラープロセスの実装
- [ ] 4.1 `src/renderer/index.html`をエントリーポイントとして作成
- [ ] 4.2 `src/renderer/App.tsx`を作成（Hello Worldレベルの最小UI）
- [ ] 4.3 `src/renderer/index.tsx`を作成（Reactのルートマウント）
- [ ] 4.4 Tailwind CSS（オプション）またはシンプルなCSSでスタイル適用

## 5. 環境変数管理の実装
- [ ] 5.1 `.env.example`を作成（APIキーのテンプレート）
  - ELEVENLABS_API_KEY=
  - GROQ_API_KEY=
- [ ] 5.2 README.mdに環境変数設定手順を記載
- [ ] 5.3 メインプロセスで環境変数が読み込めることをログで確認

## 6. 動作確認とドキュメント整備
- [ ] 6.1 `pnpm dev`でアプリケーションが起動することを確認
- [ ] 6.2 ウィンドウが表示され、Hello World UIが描画されることを確認
- [ ] 6.3 README.mdを更新
  - セットアップ手順（pnpm install、.envファイル作成）
  - 開発サーバー起動方法（pnpm dev）
  - ビルド方法（pnpm build）
- [ ] 6.4 ライセンスファイル（LICENSE）を追加（必要に応じて）

## 7. コード品質チェック
- [ ] 7.1 `pnpm lint`を実行してESLintエラーがないことを確認
- [ ] 7.2 Prettierで全ファイルをフォーマット
- [ ] 7.3 TypeScriptのコンパイルエラーがないことを確認（`tsc --noEmit`）

## Validation Criteria

すべてのタスクが完了したとき、以下が満たされていること：

- `pnpm dev`でElectronアプリが起動し、Hello World UIが表示される
- `.env`ファイルから環境変数が正しく読み込まれる
- TypeScriptの型チェックがすべて通る
- ESLint/Prettierのルール違反がない
- README.mdに明確なセットアップ手順が記載されている
