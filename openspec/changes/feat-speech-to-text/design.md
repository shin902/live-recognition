# アーキテクチャ設計

## コンポーネント構造

### `DeepgramService` (または `useDeepgram` Hook)
- **役割**: WebSocket接続の管理、音声データの送信、メッセージ受信。
- **メソッド**: `connect()`, `disconnect()`, `sendAudio(chunk)`。
- **イベント**: `onTranscript(text, isFinal)`。

### `useVoiceInput` の改修
- 以前の「WAVを貯めて最後に返す」ロジックから、「随時 `onAudioData` コールバックでデータを流す」ロジックへ変更。
- Deepgramへの接続トリガーとしてVADイベントを利用。

## データフロー
1.  **VAD**: `onSpeechStart` -> Deepgramへ接続開始 (または音声送信フラグON)。
2.  **VAD**: `onFrameProcessed` -> 音声データ(Float32)を取得 -> Int16に変換 -> Deepgramへ送信。
3.  **Deepgram**: WebSocket経由で認識結果(JSON)を受信。
4.  **UI**: 
    - `is_final: false` の場合 -> グレー文字で表示（暫定）。
    - `is_final: true` の場合 -> 黒文字で確定表示。
5.  **VAD**: `onSpeechEnd` -> Deepgramへ「発話終了」シグナル送信 (または接続維持)。

## 注意点
- **サンプリングレート**: Deepgramは様々なレートに対応していますが、VADから来るデータ形式(16kHz Float32)に合わせてヘッダ無しRawデータを送るか、Deepgram側で指定する必要があります。
