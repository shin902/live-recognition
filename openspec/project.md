# Project Context

## Purpose

**live-recognition** は、リアルタイム音声認識とLLM文章整形を組み合わせたmacOSデスクトップアプリケーションです。

### 主要機能
1. **リアルタイム音声入力**: マイクから音声を取得し、VAD（Voice Activity Detection）で発話区間を検出
2. **音声認識**: OpenAI Realtime APIまたはWhisper APIで音声をテキスト化
3. **文章整形**: Claude APIまたはGPT APIでテキストを整形・校正
4. **自動入力**: 整形されたテキストをアクティブなアプリケーションに自動的にキー入力

### ゴール
- 音声入力による効率的な文章作成
- 低レイテンシでスムーズなUX
- macOSネイティブアプリとしての高い統合性

## Tech Stack

### フレームワーク
- **Electron** (推奨) - デスクトップアプリケーション基盤
  - AIエージェントとの相性、学習データの豊富さ、macOS機能実装例の多さから選定
  - 代替案: Tauri（軽量性重視の場合、ただしRustコードが必要になる可能性）

### フロントエンド
- **TypeScript** - 型安全性を確保
- **React** - UI構築
- **Tailwind CSS** - スタイリング（オプション）

### 音声処理
- **Web Audio API** - マイク入力
- **VAD (Voice Activity Detection)**
  - `@ricky0123/vad-web` - ブラウザベースVAD（推奨）
  - または Silero VAD
- **音声認識API**
  - OpenAI Realtime API（推奨・低レイテンシ）
  - OpenAI Whisper API
  - Azure Speech Services
  - Google Cloud Speech-to-Text

### LLM統合
- **Claude API** または **OpenAI GPT API**
- 文章整形・校正プロンプト実装

### Electronモジュール
- `electron` - アプリケーション基盤
- `robotjs` または `nut-js` - 自動キー入力（macOSアクセシビリティ権限必要）

### 開発ツール
- **パッケージマネージャ**: pnpm（推奨）または npm
- **ビルドツール**: Vite または Webpack
- **バージョン管理**: Git
- **コード品質**: ESLint, Prettier
- **型チェック**: TypeScript Compiler
- **テストフレームワーク**: Jest/Vitest (Unit), Playwright (E2E)

## Project Conventions

### Code Style
- **TypeScript strict mode** 有効化
- **ESLint + Prettier** で自動フォーマット
- **命名規則**:
  - コンポーネント: PascalCase (`VoiceRecorder.tsx`)
  - 関数・変数: camelCase (`handleVoiceInput`)
  - 定数: UPPER_SNAKE_CASE (`MAX_RECORDING_DURATION`)
  - ファイル名: kebab-case (`voice-recognition-service.ts`)
- **インポート順序**: 外部ライブラリ → 内部モジュール → 型定義
- **コメント**: 複雑なロジックには日本語コメントで意図を説明

### Architecture Patterns
- **レイヤードアーキテクチャ**:
  - Presentation Layer (React Components)
  - Application Layer (Electron IPC, State Management)
  - Domain Layer (音声認識、LLM統合ロジック)
  - Infrastructure Layer (API Client, OS Integration)
- **依存性注入**: サービスクラスは依存を明示的に受け取る
- **状態管理**: React Context API またはZustand
- **エラーハンドリング**: 例外は適切にキャッチし、ユーザーフレンドリーなメッセージを表示

### Testing Strategy
- **Unit Tests**: ビジネスロジック、ユーティリティ関数（Jest/Vitest）
- **Integration Tests**: IPC通信、API統合（Jest/Vitest）
- **E2E Tests**: 主要な音声入力→整形→自動入力フロー（Playwright）
- **カバレッジ目標**: 主要ロジックは80%以上
- **モック戦略**: 外部API（音声認識、LLM）はモック化

### Git Workflow
- **ブランチ戦略**: GitHub Flow（main + feature branches）
- **コミット規約**: Conventional Commits
  - `feat:` - 新機能
  - `fix:` - バグ修正
  - `docs:` - ドキュメント更新
  - `test:` - テスト追加・修正
  - `refactor:` - リファクタリング
  - `chore:` - ビルド・ツール設定など
- **コミットメッセージ**: 日本語で記述（例: `feat: リアルタイム音声認識機能を追加`）
- **プルリクエスト**: 機能実装時は必ずPRでレビュー

## Domain Context

### 音声認識の基礎知識
- **VAD (Voice Activity Detection)**: 発話区間を検出し、無音部分を除外
- **ストリーミング認識**: リアルタイム性を確保するためチャンク単位で処理
- **レイテンシ要件**: ユーザー体感では500ms以下が望ましい

### LLM文章整形
- **プロンプト設計**:
  - 音声認識結果には誤認識やフィラー（えー、あのー）が含まれる
  - 句読点の適切な挿入、誤字脱字の修正、文章の自然な整形が必要
- **ストリーミング応答**: 可能であればLLMもストリーミングで処理しレイテンシ削減

### macOS自動化
- **アクセシビリティ権限**: `robotjs`や`nut-js`でキー入力するには必須
- **アクティブウィンドウ取得**: フォーカス中のアプリケーションにテキスト挿入
- **セキュリティ考慮**: ユーザーの明示的な許可なしに自動入力しない

## Important Constraints

### 技術的制約
- **macOS専用**: 初期バージョンはmacOSのみサポート
- **アクセシビリティ権限**: 自動キー入力にはユーザーが明示的に許可する必要がある
- **レイテンシ**: 音声認識→整形→入力の全体で2秒以内を目標
- **オフライン動作**: 音声認識・LLMはクラウドAPIに依存（完全オフラインは不可）

### ビジネス制約
- **APIコスト**: OpenAI/Claude APIの使用量に応じた課金
- **プライバシー**: 音声データはローカル処理が望ましいが、認識精度とのトレードオフ

### 規制・セキュリティ
- **個人情報保護**: 音声データやAPIキーの適切な管理
- **APIキー管理**: 環境変数で管理、ハードコード禁止
- **エラーログ**: 機密情報（APIレスポンス詳細など）をログに含めない

## External Dependencies

### 音声認識サービス
- **OpenAI Realtime API** (推奨)
  - WebSocket接続でリアルタイム音声認識
  - 低レイテンシ
- **OpenAI Whisper API**
  - REST API、音声ファイルをPOST
  - Realtime APIより高レイテンシだが安定
- **代替**: Azure Speech Services, Google Cloud Speech-to-Text

### LLM API
- **Claude API** (Anthropic)
  - 文章整形・校正に優れる
  - ストリーミングレスポンス対応
- **OpenAI GPT API**
  - GPT-4/GPT-3.5
  - Function Calling対応

### パッケージ依存
- `@ricky0123/vad-web`: VAD実装
- `robotjs` / `nut-js`: 自動キー入力
- `electron-store`: 設定の永続化
- `axios` / `fetch`: API通信
