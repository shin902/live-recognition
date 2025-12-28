# Design: add-floating-window

## Overview

Electronの`BrowserWindow`設定とCSSスタイリングを組み合わせて、
Voice Inkのようなフローティングバーを実現する。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      macOS Screen                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Other Apps                          │  │
│  │               (Browser, Editor, etc.)                  │  │
│  │                                                        │  │
│  │                                                        │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │░░░░░░░░░░░░░ Floating Bar (alwaysOnTop) ░░░░░░░░░░░░░│  │
│  └───────────────────────────────────────────────────────┘  │
│  └── 画面下部中央、固定サイズ (例: 600x60px)               │
└─────────────────────────────────────────────────────────────┘
```

## Technical Decisions

### 1. BrowserWindow 設定

```typescript
const win = new BrowserWindow({
  width: 600,           // 横幅
  height: 60,           // 高さ（細いバー）
  x: calculated,        // 画面中央に配置（計算で算出）
  y: calculated,        // 画面下部に配置（計算で算出）
  
  frame: false,         // ウィンドウ枠を削除
  transparent: true,    // 背景を透明化
  hasShadow: false,     // OS標準の影を削除
  alwaysOnTop: true,    // 常に最前面
  resizable: false,     // サイズ変更不可
  movable: false,       // 移動不可
  
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});
```

### 2. Dock非表示

macOSでDockアイコンを非表示にするため、`app.dock.hide()` を使用：

```typescript
if (process.platform === 'darwin') {
  app.dock.hide();
}
```

### 3. 画面位置の計算

`electron.screen` APIを使用してプライマリディスプレイのサイズを取得し、
ウィンドウを画面下部中央に配置：

```typescript
const { screen } = require('electron');
const primaryDisplay = screen.getPrimaryDisplay();
const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

const windowWidth = 600;
const windowHeight = 60;
const marginBottom = 20;

const x = Math.round((screenWidth - windowWidth) / 2);
const y = screenHeight - windowHeight - marginBottom;
```

### 4. CSSスタイリング

Electronの`transparent: true`により、HTMLの背景が透明になる。
CSSで角丸の半透明バーを作成：

```css
body {
  margin: 0;
  padding: 0;
  background-color: transparent;  /* 透明背景 */
  overflow: hidden;
}

.floating-bar {
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.85);  /* 半透明黒 */
  backdrop-filter: blur(10px);             /* ぼかし効果 */
  border-radius: 30px;                     /* 角丸 */
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3); /* ドロップシャドウ */
  
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  box-sizing: border-box;
  
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

## Trade-offs

### 選択: CSS `backdrop-filter: blur()` vs macOS native `vibrancy`

| 観点 | CSS blur | native vibrancy |
|------|----------|-----------------|
| 柔軟性 | ◎ 色調整、グラデーション等自由 | △ プリセットのみ |
| パフォーマンス | ○ 小さいウィンドウなら問題なし | ◎ GPUアクセラレーション |
| クロスプラットフォーム | ◎ 将来の展開が容易 | ✗ macOS専用 |
| 見た目 | ○ 十分に美しい | ◎ 完全にネイティブ |

**決定**: CSS blurを採用。将来の拡張性と柔軟性を重視。

### 選択: クリックスルー有無

| 観点 | クリックスルーあり | クリックスルーなし |
|------|-------------------|-------------------|
| UX | 透明部分で下アプリを操作可能 | 一貫した動作 |
| 実装複雑度 | 高（mouseenter/leave監視） | 低（追加実装不要） |
| 保守性 | イベント競合のデバッグが必要 | シンプル |

**決定**: クリックスルーなし。シンプルな実装を優先。

## Future Considerations

1. **フルスクリーン対応**: `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` と `setAlwaysOnTop(true, 'screen-saver')` で実現可能
2. **ドラッグ移動**: CSS `-webkit-app-region: drag` で実現可能
3. **複数ディスプレイ対応**: `screen.getAllDisplays()` で全ディスプレイ取得可能
