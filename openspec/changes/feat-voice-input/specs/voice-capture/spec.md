# 仕様書: 音声キャプチャとVAD

## ADDED Requirements

### Requirement: マイクへのアクセス
アプリケーションは、初期化時またはユーザーの操作に応じて、マイクへのアクセスをリクエスト MUST しなければならない。

#### Scenario: 許可された場合
- Given アプリケーションが起動している
- When ユーザーがマイクへのアクセスを許可する
- Then アプリケーションはVADエンジンを初期化する
- And ステータス表示が「待機中（Listening）」になる

#### Scenario: 拒否された場合
- Given アプリケーションが起動している
- When ユーザーがマイクへのアクセスを拒否する
- Then ステータス表示が「マイク使用不可」になる
- And 音声入力が必要である旨のエラーメッセージを表示する

### Requirement: 発話区間検出 (VAD)
アプリケーションは、ユーザーが話し始めたときと話し終えたときを検知 MUST しなければならない。

#### Scenario: 発話開始
- Given アプリケーションが「待機中」の状態である
- When ユーザーが話し始める
- Then UIの状態が即座に「発話検知（Speech Detected）」に更新される

#### Scenario: 発話終了
- Given ユーザーが話している
- When ユーザーが一定時間（例: 500ms）沈黙する
- Then アプリケーションは音声セグメントを確定させる
- And UIの状態が「処理中（Processing）」に遷移する

### Requirement: 音声フォーマットの変換
キャプチャされた音声は、Groq APIに適した形式に変換 MUST されなければならない。

#### Scenario: WAV形式への変換
- Given 発話セグメントが Float32Array としてキャプチャされた
- When VADの `onSpeechEnd` イベントが発生する
- Then システムは音声データを WAV Blob (16kHz, mono) に変換する
- And 検証のためにコンソールに Blob のサイズを出力する
