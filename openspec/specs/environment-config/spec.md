# environment-config Specification

## Purpose
TBD - created by archiving change setup-electron-foundation. Update Purpose after archive.
## Requirements
### Requirement: 環境変数ファイルによる設定管理
システムは、`.env`ファイルから環境変数を読み込み、アプリケーション設定として利用しなければならない (SHALL)。

#### Scenario: .envファイルからの読み込み
- **WHEN** アプリケーションが起動する
- **THEN** ルートディレクトリの`.env`ファイルが読み込まれる
- **AND** 環境変数が`process.env`を介してアクセス可能になる

#### Scenario: .envファイルが存在しない場合
- **WHEN** `.env`ファイルが存在しない状態でアプリケーションが起動する
- **THEN** アプリケーションは警告ログを出力する
- **AND** デフォルト値（空文字列または未定義）で動作を継続する

### Requirement: APIキーの管理
システムは、外部API（ElevenLabs、Groq）のAPIキーを環境変数で管理しなければならない (SHALL)。

#### Scenario: APIキーの読み込み
- **WHEN** アプリケーションがAPI通信を行う
- **THEN** `ELEVENLABS_API_KEY`と`GROQ_API_KEY`が環境変数から取得される
- **AND** APIキーが設定されていない場合、エラーメッセージが表示される

#### Scenario: APIキーのセキュアな取り扱い
- **WHEN** 環境変数が読み込まれる
- **THEN** APIキーはログに出力されない
- **AND** `.env`ファイルは`.gitignore`に含まれる
- **AND** リポジトリにAPIキーがコミットされない

### Requirement: 環境変数テンプレートの提供
システムは、`.env.example`ファイルをテンプレートとして提供しなければならない (SHALL)。

#### Scenario: 新規ユーザーのセットアップ
- **WHEN** 新規ユーザーがプロジェクトをクローンする
- **THEN** `.env.example`ファイルが存在する
- **AND** 必要な環境変数のキー名とコメントが記載されている
- **AND** ユーザーは`.env.example`をコピーして`.env`を作成できる

#### Scenario: テンプレートの内容
- **WHEN** `.env.example`ファイルを開く
- **THEN** 以下の環境変数が定義されている:
  - `ELEVENLABS_API_KEY=`（コメント: ElevenLabs Realtime APIキー）
  - `GROQ_API_KEY=`（コメント: Groq API (gpt-oss-120b) キー）

### Requirement: 環境変数のバリデーション
システムは、起動時に必要な環境変数が設定されているかを検証しなければならない (SHALL)。

#### Scenario: 必須環境変数の検証（将来的な拡張）
- **WHEN** アプリケーションが起動する
- **THEN** 必須環境変数のリストをチェックする
- **AND** 未設定の環境変数がある場合、警告ログを出力する
- **AND** 基本セットアップ段階では、警告のみで起動を継続する（API機能は未実装のため）

