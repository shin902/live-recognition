import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } from 'electron';
import dotenv from 'dotenv';
import path from 'path';

// 環境変数の読み込み
dotenv.config();

let mainWindow: BrowserWindow | null = null;
let isGetConfigHandlerRegistered = false;

const WINDOW_CONFIG = {
  WIDTH: 600,
  HEIGHT: 60,
  MARGIN_BOTTOM: 20,
} as const;

const createWindow = (): void => {
  // プライマリディスプレイの情報を取得
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // ウィンドウを画面下部中央に配置
  const x = Math.round((screenWidth - WINDOW_CONFIG.WIDTH) / 2);
  const y = screenHeight - WINDOW_CONFIG.HEIGHT - WINDOW_CONFIG.MARGIN_BOTTOM;

  mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.WIDTH,
    height: WINDOW_CONFIG.HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const shouldOpenDevTools =
    process.env.NODE_ENV === 'development' && process.env.ELECTRON_OPEN_DEVTOOLS === 'true';
  if (shouldOpenDevTools) {
    mainWindow.webContents.openDevTools();
  }

  // レンダラープロセスをロード
  // __dirname = dist/main なので、../renderer/index.html で dist/renderer/index.html を指す
  const rendererPath = path.join(__dirname, '..', 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath);

  mainWindow.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Live Recognition を終了', click: () => app.quit() },
    ]);
    menu.popup();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app
  .whenReady()
  .then(() => {
    // macOSでDockアイコンを非表示化
    if (process.platform === 'darwin' && app.dock) {
      app.dock.hide();
    }

    // フレームレスなので明示的に終了できるショートカットを用意
    const registered = globalShortcut.register('CommandOrControl+Q', () => {
      app.quit();
    });
    if (!registered) {
      console.warn('Failed to register global shortcut: CommandOrControl+Q');
    }

    ipcMain.handle('get-config', async () => {
      try {
        return {
          appVersion: app.getVersion(),
          nodeVersion: process.version,
          platform: process.platform,
          hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
          hasGroqKey: !!process.env.GROQ_API_KEY,
        };
      } catch (error) {
        console.error('Failed to get config:', error);
        return {
          error: 'Failed to retrieve configuration',
          appVersion: 'unknown',
          nodeVersion: process.version,
          platform: process.platform,
          hasElevenLabsKey: false,
          hasGroqKey: false,
        };
      }
    });
    isGetConfigHandlerRegistered = true;

    createWindow();
  })
  .catch((error: Error) => {
    console.error('Failed to create window:', error);
  });

app.on('window-all-closed', () => {
  // macOSでは、ユーザーが明示的に終了するまでアプリケーションをアクティブに保つ
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // IPCハンドラーのクリーンアップ
  if (isGetConfigHandlerRegistered) {
    ipcMain.removeHandler('get-config');
    isGetConfigHandlerRegistered = false;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  // macOSでアプリケーションアイコンがクリックされた際、ウィンドウを再作成
  if (mainWindow === null) {
    createWindow();
  }
});

// ログ出力: 環境変数の確認（開発環境のみ）
if (process.env.NODE_ENV === 'development') {
  console.info('Environment variables loaded:');
  console.info(`- ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? '設定済み' : '未設定'}`);
  console.info(`- GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '設定済み' : '未設定'}`);
}
