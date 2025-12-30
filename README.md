# Live Recognition

リアルタイム音声認識とLLM文章整形を組み合わせたmacOSデスクトップアプリケーション。

## 主な機能

- **リアルタイム音声入力**: マイクから音声を取得し、VAD（Voice Activity Detection）で発話区間を検出
- **音声認識**: 以下のプロバイダーから選択可能
  - Deepgram Nova-2 API（デフォルト）
  - ElevenLabs Scribe v2 Realtime API
- **文章整形**: Groq API（GPT-OSS-120B相当）でテキストを整形・校正
  - フィラー（えー、あのー等）の削除
  - 適切な句読点の挿入
  - 誤認識の修正
- **自動入力**: 整形されたテキストをアクティブなアプリケーションに自動的にキー入力

## 必要な環境

- **OS**: macOS
- **Node.js**: pnpmがサポートするバージョン（推奨: 20系以上）
- **pnpm**: 9.0.0以上（miseまたはcorepackで管理）

## 使い方

1. アプリケーションを起動すると、画面下部にフローティングバーが表示されます
2. マイクアイコンをクリックして音声入力を開始（または自動開始）
3. 話した内容がリアルタイムで文字起こしされます
4. 発話が終わると自動的にGroq APIで整形されます
5. `Enter`キーを押すと、整形されたテキストがアクティブウィンドウに貼り付けられ、アプリが終了します

### プロンプトのカスタマイズ

整形用のプロンプトは `src/renderer/prompts/refine-text.txt` で管理されています。
必要に応じて編集してください。

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
# 音声認識プロバイダー (deepgram または elevenlabs、デフォルト: elevenlabs)
SPEECH_PROVIDER=elevenlabs

# Deepgram API キー（音声認識用）
DEEPGRAM_API_KEY=your_deepgram_api_key

# ElevenLabs API キー（音声認識用）
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Groq API キー（テキスト整形用）
GROQ_API_KEY=your_groq_api_key

# オプション: Groq モデル名（デフォルト: meta-llama/llama-4-scout-17b-16e-instruct）
# GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# 開発時のみ: ElectronのDevToolsを開く場合はtrueに設定
# ELECTRON_OPEN_DEVTOOLS=true
```

APIキーの取得方法：

- **Deepgram**: https://console.deepgram.com/ (無料枠: 月200時間)
- **ElevenLabs**: https://elevenlabs.io/ (Scribe v2 Realtime)
- **Groq**: https://console.groq.com/ (無料枠: 月1000万トークン)

**音声認識プロバイダーの選択**:

- `SPEECH_PROVIDER=deepgram`: Deepgram Nova-2を使用
  - バイナリデータを直接送信（低オーバーヘッド）
  - 月200時間の無料枠
- `SPEECH_PROVIDER=elevenlabs`: ElevenLabs Scribe v2 Realtimeを使用（デフォルト）
  - Base64エンコードが必要（ペイロードサイズが約33%増加）
  - 長時間の文字起こしセッションでは帯域幅とメモリ使用量に注意

⚠️ **セキュリティ注意**:

- 音声認識APIキー（Deepgram/ElevenLabs）はレンダラープロセスに直接渡されています（プロトタイプ段階）
- Groq APIキーはメインプロセスで安全に管理されています
- 本番環境では全てのAPIキーをメインプロセスで管理することを推奨します

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

- **Unit Tests**: ビジネスロジック、ユーティリティ関数（Vitest）
- **Integration Tests**: IPC通信、API統合

```bash
pnpm test          # テスト実行
pnpm test:watch    # ウォッチモード
```

**テストフレームワークについて**:

- Vitest 2.1.4を使用しています
- React 18とViteとの互換性のため、安定版の2.xシリーズを採用
- 将来的にはVitest 4.x以降への更新を検討予定
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
