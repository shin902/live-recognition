# app-foundation Specification

## Purpose
TBD - created by archiving change setup-electron-foundation. Update Purpose after archive.
## Requirements
### Requirement: Electronアプリケーション起動
システムは、macOS上でElectronアプリケーションを起動し、メインウィンドウを表示しなければならない (SHALL)。

#### Scenario: アプリケーション正常起動
- **WHEN** ユーザーがアプリケーションを起動する
- **THEN** Electronメインプロセスが初期化される
- **AND** 800x600ピクセルのメインウィンドウが表示される
- **AND** macOS専用の設定（タイトルバースタイルなど）が適用される

#### Scenario: 開発モードでのDevTools自動オープン
- **WHEN** 開発モード（NODE_ENV=development）でアプリケーションを起動する
- **THEN** DevToolsが自動的に開かれる
- **AND** ホットリロードが有効になる

### Requirement: メインプロセスとレンダラープロセスの分離
システムは、Electronのメインプロセスとレンダラープロセスを明確に分離しなければならない (SHALL)。

#### Scenario: メインプロセスの責務
- **WHEN** アプリケーションが起動する
- **THEN** メインプロセスがウィンドウ管理、ライフサイクル管理、IPC通信のハンドリングを担当する
- **AND** レンダラープロセスとの通信はIPCを介して行われる

#### Scenario: レンダラープロセスの責務
- **WHEN** ウィンドウが作成される
- **THEN** レンダラープロセスがReactによるUI描画を担当する
- **AND** メインプロセスとの通信はpreloadスクリプトを介して行われる

### Requirement: IPC通信の基本実装
システムは、メインプロセスとレンダラープロセス間でIPC通信を提供しなければならない (SHALL)。

#### Scenario: レンダラーからメインへのリクエスト
- **WHEN** レンダラープロセスがメインプロセスに設定情報を要求する
- **THEN** IPCハンドラーが設定情報を返す
- **AND** レンダラープロセスは返された設定を受け取れる

#### Scenario: セキュアなIPC実装
- **WHEN** IPC通信が行われる
- **THEN** preloadスクリプトを使用してcontextBridgeで安全にAPIを公開する
- **AND** nodeIntegrationは無効化される
- **AND** contextIsolationは有効化される

### Requirement: 最小限のUI表示
システムは、アプリケーション起動時に最小限の動作確認用UIを表示しなければならない (SHALL)。

#### Scenario: Hello World UI表示
- **WHEN** アプリケーションが起動する
- **THEN** Reactで実装されたHello World UIが表示される
- **AND** UIにはアプリケーション名とバージョン情報が含まれる
- **AND** スタイルは最小限（CSS または Tailwind CSS）が適用される

