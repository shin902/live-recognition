# 実装タスク

- [x] 依存ライブラリのインストール (`@ricky0123/vad-web`, `onnxruntime-web`) <!-- id: install-deps -->
- [x] Float32からWAVへの変換用ユーティリティ `wav-utils.ts` の作成 <!-- id: install-deps -->
- [x] VAD制御とWAV変換を行う `useVoiceInput` フックの実装 <!-- id: hook-impl -->
- [x] `App.tsx` でのマイク権限ハンドリングとエラー状態の追加 <!-- id: mic-perm -->
- [x] `App.tsx` へのフック統合と、生成されたWAVのコンソール出力確認 <!-- id: app-integ -->
- [x] 手動テスト: VADが正しく反応し、WAVファイルが生成されることを確認 <!-- id: verify -->
