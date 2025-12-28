# Capability: build-tooling

## ADDED Requirements

### Requirement: TypeScriptによる型安全な開発環境
システムは、TypeScriptのstrict modeを有効にした型安全な開発環境を提供しなければならない (SHALL)。

#### Scenario: TypeScript設定
- **WHEN** プロジェクトをセットアップする
- **THEN** `tsconfig.json`が作成される
- **AND** `strict: true`が有効化される
- **AND** メインプロセスとレンダラープロセスで適切なコンパイラオプションが設定される

#### Scenario: 型チェック実行
- **WHEN** `pnpm run type-check`を実行する
- **THEN** TypeScriptコンパイラが全ファイルの型チェックを行う
- **AND** 型エラーがある場合、明確なエラーメッセージが表示される

### Requirement: Viteによる高速ビルドとホットリロード
システムは、Viteを使用した高速なビルド環境とホットリロードを提供しなければならない (SHALL)。

#### Scenario: 開発サーバーの起動
- **WHEN** `pnpm dev`を実行する
- **THEN** Vite開発サーバーが起動する
- **AND** Electronアプリケーションが自動的に起動する
- **AND** ソースコード変更時にホットリロードが実行される

#### Scenario: 本番ビルド
- **WHEN** `pnpm build`を実行する
- **THEN** TypeScriptコードがJavaScriptにコンパイルされる
- **AND** メインプロセスとレンダラープロセスが`dist/`ディレクトリに出力される
- **AND** ビルド成果物がElectronで実行可能な形式になる

### Requirement: パッケージマネージャーとしてpnpmを使用
システムは、pnpmをパッケージマネージャーとして使用し、高速なインストールとディスク効率を実現しなければならない (SHALL)。

#### Scenario: 依存パッケージのインストール
- **WHEN** `pnpm install`を実行する
- **THEN** `pnpm-lock.yaml`が作成される
- **AND** `node_modules/`に依存パッケージがインストールされる
- **AND** `package.json`に定義されたすべての依存関係が解決される

#### Scenario: 依存パッケージの定義
- **WHEN** `package.json`を確認する
- **THEN** 以下の依存パッケージが含まれる:
  - electron（本番依存）
  - react, react-dom（本番依存）
  - typescript, vite（開発依存）
  - electron-builder（開発依存）
  - dotenv（本番依存）
  - eslint, prettier（開発依存）

### Requirement: ESLintとPrettierによるコード品質管理
システムは、ESLintとPrettierを使用してコード品質とフォーマットを統一しなければならない (SHALL)。

#### Scenario: ESLintによる静的解析
- **WHEN** `pnpm lint`を実行する
- **THEN** ESLintが全TypeScriptファイルを検査する
- **AND** ルール違反がある場合、エラーまたは警告が表示される
- **AND** 自動修正可能な問題は`pnpm lint:fix`で修正される

#### Scenario: Prettierによるコードフォーマット
- **WHEN** `pnpm format`を実行する
- **THEN** Prettierが全ファイルをフォーマットする
- **AND** 一貫したコードスタイル（インデント、引用符、セミコロンなど）が適用される
- **AND** `.prettierrc`に定義されたルールに従う

#### Scenario: ESLintとPrettierの統合
- **WHEN** コードを編集する
- **THEN** ESLintとPrettierのルールが競合しない
- **AND** `eslint-config-prettier`で競合ルールが無効化される

### Requirement: Git管理とビルド成果物の除外
システムは、Gitで適切にバージョン管理を行い、不要なファイルを除外しなければならない (SHALL)。

#### Scenario: .gitignoreの設定
- **WHEN** プロジェクトを初期化する
- **THEN** `.gitignore`ファイルが作成される
- **AND** 以下がGit管理対象外となる:
  - `node_modules/`
  - `dist/`
  - `.env`
  - `.DS_Store`
  - ビルド成果物

#### Scenario: .env.exampleのバージョン管理
- **WHEN** Gitリポジトリを確認する
- **THEN** `.env.example`はバージョン管理される
- **AND** `.env`はバージョン管理されない

### Requirement: 開発者向けスクリプトの提供
システムは、`package.json`に開発者向けスクリプトを定義しなければならない (SHALL)。

#### Scenario: スクリプトの定義
- **WHEN** `package.json`を確認する
- **THEN** 以下のスクリプトが定義されている:
  - `dev`: 開発サーバー起動
  - `build`: 本番ビルド
  - `type-check`: TypeScript型チェック
  - `lint`: ESLint実行
  - `lint:fix`: ESLint自動修正
  - `format`: Prettier実行

#### Scenario: スクリプトの実行
- **WHEN** 各スクリプトを実行する
- **THEN** 期待される動作が正しく実行される
- **AND** エラーが発生した場合、明確なエラーメッセージが表示される
