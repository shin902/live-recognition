# Tasks: add-floating-window

## Task List

### Phase 1: メインプロセス修正

- [x] **Task 1.1**: `src/main/index.ts` の `BrowserWindow` 設定を変更
  - `frame: false`, `transparent: true`, `hasShadow: false` を追加
  - `alwaysOnTop: true`, `resizable: false`, `movable: false` を追加
  - ウィンドウサイズを `600 x 60` に変更
  - **依存**: なし
  - **検証**: アプリ起動時にフレームレスウィンドウが表示される

- [x] **Task 1.2**: ウィンドウ位置を画面下部中央に計算・設定
  - `electron.screen` APIで画面サイズを取得
  - `x`, `y` 座標を計算して `BrowserWindow` に設定
  - **依存**: Task 1.1
  - **検証**: ウィンドウが画面下部中央に表示される

- [x] **Task 1.3**: macOS Dockアイコンを非表示化
  - `app.dock.hide()` を追加（darwin プラットフォームの場合のみ）
  - **依存**: なし（Task 1.1と並行可能）
  - **検証**: Dockにアプリアイコンが表示されない

### Phase 2: CSSスタイリング

- [x] **Task 2.1**: `src/renderer/App.css` にフローティングバー用スタイルを追加
  - `body` の背景を `transparent` に設定
  - `.floating-bar` クラスに半透明黒背景、blur、角丸、シャドウを設定
  - **依存**: なし（Phase 1と並行可能）
  - **検証**: CSSが正しく適用される

- [x] **Task 2.2**: `src/renderer/App.tsx` のレイアウトを更新
  - 既存のカード型UIを削除またはシンプル化
  - フローティングバー用のシンプルなコンテナに変更
  - **依存**: Task 2.1
  - **検証**: フローティングバーとして適切なUIが表示される

### Phase 3: 統合テスト

- [x] **Task 3.1**: 手動動作確認
  - アプリ起動で画面下部にフローティングバーが表示される
  - ウィンドウが他のアプリより上に表示される
  - ウィンドウのサイズ変更・移動ができない
  - Dockにアイコンが表示されない
  - **依存**: Phase 1, Phase 2 完了
  - **検証**: 全ての成功基準を満たす

## Parallelization

```
Phase 1 (Main Process)          Phase 2 (CSS/UI)
├── Task 1.1 ───────────┐       ├── Task 2.1 ────┐
│        │              │       │       │        │
│        v              │       │       v        │
│   Task 1.2            │       │   Task 2.2     │
│        │              │       │       │        │
│        v              │       │       v        │
└── Task 1.3 ───────────┴───────┴───────┴────────┘
                        │
                        v
                   Phase 3 (Integration)
                        │
                    Task 3.1
```

**Phase 1 と Phase 2 は並行して実行可能**

## Estimated Effort

| Phase | 見積もり |
|-------|---------|
| Phase 1 | 30分 |
| Phase 2 | 20分 |
| Phase 3 | 10分 |
| **合計** | **1時間** |
