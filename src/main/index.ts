import { app, BrowserWindow, ipcMain } from 'electron';
import dotenv from 'dotenv';
import path from 'path';

// 環境変数の読み込み
dotenv.config();

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 開発時はDevToolsを自動オープン
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // レンダラープロセスをロード
  // __dirname = dist/main なので、../renderer/index.html で dist/renderer/index.html を指す
  const rendererPath = path.join(__dirname, '..', 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app
  .whenReady()
  .then(createWindow)
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
  ipcMain.removeHandler('get-config');
});

app.on('activate', () => {
  // macOSでアプリケーションアイコンがクリックされた際、ウィンドウを再作成
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC通信: 設定情報を取得
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

// ログ出力: 環境変数の確認（開発環境のみ）
if (process.env.NODE_ENV === 'development') {
  console.info('Environment variables loaded:');
  console.info(`- ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? '設定済み' : '未設定'}`);
  console.info(`- GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '設定済み' : '未設定'}`);
}
