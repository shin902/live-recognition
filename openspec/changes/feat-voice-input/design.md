# アーキテクチャ設計

## コンポーネント構造

音声処理の遅延を最小限にするため、VADロジックは **レンダラープロセス** に配置します。

### `VoiceInputManager` (カスタムフック: `useVoiceInput`)
- **役割**: `MicVAD` インスタンスを管理し、音声ストリームのライフサイクルを制御、状態をUIに公開する。
- **依存関係**: `@ricky0123/vad-web`, `onnxruntime-web`。
- **状態**: `status` ('idle', 'listening', 'speech_detected', 'processing', 'error')。
- **出力**: 発話終了時のコールバック `onSpeechEnd` を通じてWAV形式の `audioBlob` を返す。

### 音声処理ユーティリティ
- **目的**: VADから得られる Float32Array のデータを、Groq APIが受け付ける有効な WAV Blob に変換する。
- **実装**: ユーティリティ関数 `convertFloat32ToWav(audioData: Float32Array, sampleRate: number): Blob`。

## データフロー
1.  **ユーザー** が「録音開始」をクリック。
2.  **アプリ** が `navigator.mediaDevices.getUserMedia` をリクエスト。
3.  **VAD** がストリームをフレーム単位で解析。
4.  **発話開始**: 状態 -> `speech_detected`。UIで視覚的フィードバック（色変更など）。
5.  **発話終了**:
    -   VADが完了した音声バッファを返す。
    -   アプリがバッファを WAV Blob に変換。
    -   状態 -> `processing` (デモ用)。
    -   （将来的に）Blob を Groq API に送信。
    -   状態 -> `listening` に戻る。

## 技術的決定
-   **なぜ `@ricky0123/vad-web` か？**: ブラウザ/レンダラー内で完結し（WASM/ONNX）、低レイテンシかつプライバシーに配慮されているため。
-   **WAV変換**: Groq Whisper APIはファイルオブジェクト（WAV/MP3等）を必要とするため、クライアントサイドでWAVを生成し、バックエンドをステートレスに保つ。
