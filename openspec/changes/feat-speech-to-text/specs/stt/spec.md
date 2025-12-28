# 仕様書: リアルタイム音声認識

## ADDED Requirements

### Requirement: リアルタイム音声送信
アプリケーションは、VADが発話を検知している間、音声データをリアルタイムでDeepgram APIに送信しなければならない（MUST）。

#### Scenario: 発話中の送信
- Given マイク入力が有効である
- When ユーザーが話し始める
- Then 音声データがチャンクとしてWebSocket経由で送信される

### Requirement: 認識結果の表示
アプリケーションは、APIから受信した認識結果を即座に画面に表示しなければならない（MUST）。

#### Scenario: 暫定結果の表示
- Given ユーザーが話している途中である
- When APIから `is_final: false` の認識結果を受信する
- Then そのテキストを「認識中」のスタイル（例: 薄い色）で表示する

#### Scenario: 確定結果の表示
- Given ユーザーが話し終えた、または文の区切りに達した
- When APIから `is_final: true` の認識結果を受信する
- Then そのテキストを「確定」スタイルで表示し、表示内容を更新する
