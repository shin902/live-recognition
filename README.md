# Live Recognition

リアルタイム音声認識とLLM文章整形を組み合わせたmacOSデスクトップアプリケーション。

## 主な機能

- **リアルタイム音声入力**: マイクから音声を取得し、VAD（Voice Activity Detection）で発話区間を検出
- **音声認識**: ElevenLabs Realtime APIで音声をテキスト化
- **文章整形**: Groq APIでテキストを整形・校正
- **自動入力**: 整形されたテキストをアクティブなアプリケーションに自動的にキー入力

## 必要な環境

- **OS**: macOS
- **Node.js**: pnpmがサポートするバージョン（推奨: 20系以上）
- **pnpm**: 9.0.0以上（miseまたはcorepackで管理）

## セットアップ手順

### 1. プロジェクトのクローン

```bash
git clone <repository-url>
cd live-recognition
```

### 2. 環境変数の設定

`.env.example`をコピーして`.env`を作成します：

```bash
cp .env.example .env
```

その後、`.env`ファイルをテキストエディタで開き、APIキーを設定します：

```
ELEVENLABS_API_KEY=your_elevenlabs_api_key
GROQ_API_KEY=your_groq_api_key
```

APIキーの取得方法：
- **ElevenLabs**: https://elevenlabs.io/
- **Groq**: https://console.groq.com/

### 3. 依存パッケージのインストール

miseを使用してツールをインストール：

```bash
mise install
```

その後、pnpmで依存パッケージをインストール：

```bash
pnpm install
```

## 開発

### 開発サーバーの起動

```bash
pnpm dev
```

このコマンドでViteビルドサーバーが起動し、その後Electronアプリケーションが自動的に起動します。

### ビルド

本番用にビルド：

```bash
pnpm build
```

ビルド成果物は`dist/`ディレクトリに出力されます。

## コード品質

### 型チェック

```bash
pnpm type-check
```

TypeScriptのコンパイルエラーを確認します。

### Linting

```bash
pnpm lint
```

ESLintでコードの静的解析を実行します。

自動修正：

```bash
pnpm lint:fix
```

### フォーマット

```bash
pnpm format
```

Prettierでコードフォーマットを実行します。

## プロジェクト構造

```
live-recognition/
├── src/
│   ├── main/              # Electronメインプロセス
│   │   ├── index.ts
│   │   └── preload.ts
│   └── renderer/          # Reactレンダラープロセス
│       ├── index.html
│       ├── index.tsx
│       ├── App.tsx
│       └── App.css
├── dist/                  # ビルド成果物
├── .env.example           # 環境変数テンプレート
├── .mise.toml             # mise設定
├── tsconfig.json          # TypeScript設定
├── vite.config.ts         # Vite設定
├── .eslintrc.json         # ESLint設定
├── .prettierrc             # Prettier設定
└── package.json           # プロジェクト設定
```

## 開発規約

詳細は `openspec/project.md` を参照してください。

### コードスタイル
- **TypeScript strict mode** 有効化
- **ESLint + Prettier** で自動フォーマット
- **命名規則**:
  - コンポーネント: PascalCase (`VoiceRecorder.tsx`)
  - 関数・変数: camelCase (`handleVoiceInput`)
  - 定数: UPPER_SNAKE_CASE (`MAX_RECORDING_DURATION`)
  - ファイル名: kebab-case (`voice-recognition-service.ts`)

### テスト
- **Unit Tests**: ビジネスロジック、ユーティリティ関数（Jest/Vitest）
- **Integration Tests**: IPC通信、API統合
- **E2E Tests**: 主要フロー（Playwright）

## トラブルシューティング

### 開発サーバーが起動しない

1. miseのツールがインストールされているか確認：
   ```bash
   mise install
   ```

2. pnpmでパッケージがインストールされているか確認：
   ```bash
   pnpm install
   ```

### APIキーが読み込まれない

1. `.env`ファイルがプロジェクトルートに存在するか確認
2. `.env`の形式が正しいか確認（`KEY=value`形式）
3. 開発サーバーを再起動

### Electronが起動しない

1. TypeScript型チェック：
   ```bash
   pnpm type-check
   ```

2. ESLintエラー：
   ```bash
   pnpm lint
   ```

## ライセンス

MIT

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を説明してください。

### Git Workflow

- **ブランチ戦略**: GitHub Flow（main + feature branches）
- **コミット規約**: Conventional Commits
  - `feat:` - 新機能
  - `fix:` - バグ修正
  - `docs:` - ドキュメント更新
  - `test:` - テスト追加・修正
  - `refactor:` - リファクタリング
  - `chore:` - ビルド・ツール設定など
