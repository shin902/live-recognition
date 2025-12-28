import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import dotenv from 'dotenv';

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
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(rendererPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  // macOSでは、ユーザーが明示的に終了するまでアプリケーションをアクティブに保つ
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOSでアプリケーションアイコンがクリックされた際、ウィンドウを再作成
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC通信: 設定情報を取得
ipcMain.handle('get-config', async () => {
  return {
    appVersion: app.getVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
    hasGroqKey: !!process.env.GROQ_API_KEY,
  };
});

// ログ出力: 環境変数の確認
console.info('Environment variables loaded:');
console.info(`- ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? '設定済み' : '未設定'}`);
console.info(`- GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '設定済み' : '未設定'}`);
