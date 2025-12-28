import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  screen,
} from 'electron';
import dotenv from 'dotenv';
import path from 'path';
import { computeWindowBounds } from './window-metrics';

// 環境変数の読み込み
dotenv.config();

let mainWindow: BrowserWindow | null = null;
let isGetConfigHandlerRegistered = false;

const WINDOW_CONFIG = {
  WIDTH: 600,
  HEIGHT: 60,
  MARGIN_BOTTOM: 20,
} as const;

type ConfigResponse = {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  hasElevenLabsKey: boolean;
  hasGroqKey: boolean;
  error?: string;
};

/**
 * get-config IPCハンドラーを登録する
 * レンダラープロセスからの設定取得リクエストに応答する
 * 重複登録を防ぐガード付き
 */
const registerGetConfigHandler = (): void => {
  if (isGetConfigHandlerRegistered) return;

  ipcMain.handle('get-config', async (): Promise<ConfigResponse> => {
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
};

/**
 * アプリ終了用のグローバルショートカットを登録する
 * 登録に失敗した場合はエラーログを出力するが、アプリは継続動作する
 * @param accelerator - ショートカットキー（例: 'CommandOrControl+Q'）
 */
const registerQuitShortcut = (accelerator: string): void => {
  const registered = globalShortcut.register(accelerator, () => {
    app.quit();
  });
  if (!registered) {
    console.error(`Failed to register global shortcut: ${accelerator}. Continuing without it.`);
  }
};

// レンダラープロセスの初期化前にIPCハンドラーを登録して競合を防ぐ
registerGetConfigHandler();

/**
 * フローティングウィンドウを生成し、画面下部中央に配置する
 */
const createWindow = (): void => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = computeWindowBounds(primaryDisplay, WINDOW_CONFIG);

  mainWindow = new BrowserWindow({
    width,
    height,
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
      sandbox: true,
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

  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: 'Live Recognition を終了',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
    { label: 'ウィンドウを閉じる', accelerator: 'CommandOrControl+W', click: () => app.quit() },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

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

/**
 * ディスプレイ変更時にウィンドウ位置を再計算する
 */
const updateWindowPosition = (): void => {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y } = computeWindowBounds(primaryDisplay, WINDOW_CONFIG);
  mainWindow.setPosition(x, y);
};

app
  .whenReady()
  .then(() => {
    // macOSでDockアイコンを非表示化
    if (process.platform === 'darwin' && app.dock) {
      app.dock.hide();
    }

    // フレームレスなので明示的に終了できるショートカットを用意
    registerQuitShortcut('CommandOrControl+Q');
    registerQuitShortcut('CommandOrControl+W');

    createWindow();

    // ディスプレイ変更時にウィンドウ位置を更新
    screen.on('display-metrics-changed', updateWindowPosition);
    screen.on('display-added', updateWindowPosition);
    screen.on('display-removed', updateWindowPosition);
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

// ログ出力: 環境変数の確認（開発環境かつDEBUG_CONFIG有効時のみ）
if (process.env.NODE_ENV === 'development' && process.env.DEBUG_CONFIG) {
  console.info('API Keys status:');
  console.info(`- ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? 'configured' : 'missing'}`);
  console.info(`- Groq: ${process.env.GROQ_API_KEY ? 'configured' : 'missing'}`);
}
