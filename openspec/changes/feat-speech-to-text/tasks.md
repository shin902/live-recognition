# 実装タスク

- [ ] `App.tsx` にDeepgramのAPIキー受け渡し処理を追加（メインプロセス側は環境変数を読むだけなので変更不要の可能性大） <!-- id: api-key -->
- [ ] `src/renderer/hooks/use-deepgram.ts` の実装（WebSocket管理） <!-- id: hook-deepgram -->
- [ ] `useVoiceInput` を改修し、音声データをリアルタイムで外部に流せるようにする <!-- id: mod-voice-input -->
- [ ] `App.tsx` で `useVoiceInput` と `useDeepgram` を連携させる <!-- id: integration -->
- [ ] テキスト表示用のUIエリアを作成 <!-- id: ui-text-area -->
- [ ] 動作確認: リアルタイムに文字が出ることを確認 <!-- id: verify -->
