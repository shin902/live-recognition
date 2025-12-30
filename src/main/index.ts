import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  screen,
} from 'electron';
// lint-staged test

import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { computeWindowBounds } from './window-metrics';
import { getSpeechProvider } from '../config/speech-provider';

// 環境変数の読み込み
dotenv.config();

let mainWindow: BrowserWindow | null = null;
let isGetConfigHandlerRegistered = false;

const WINDOW_CONFIG = {
  WIDTH: 600,
  HEIGHT: 160,
  MARGIN_BOTTOM: 20,
} as const;

// Groq API設定
const GROQ_CONFIG = {
  TEMPERATURE: 0.3,
  MAX_TOKENS: 1024,
  DEFAULT_MODEL: 'meta-llama/llama-4-scout-17b-16e-instruct',
  MAX_PROMPT_LENGTH: 4000, // プロンプト長制限
} as const;

type ConfigResponse = {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  speechProvider: 'deepgram' | 'elevenlabs';
  deepgramKey: string;
  elevenLabsKey: string;
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
      // 環境変数からプロバイダーを取得（デフォルト: deepgram）
      const speechProvider = getSpeechProvider();
      const deepgramKey = process.env.DEEPGRAM_API_KEY || '';
      const elevenLabsKey = process.env.ELEVENLABS_API_KEY || '';

      console.log('🔍 Config Debug:', {
        speechProvider,
        deepgramKeyLength: deepgramKey.length,
        elevenLabsKeyLength: elevenLabsKey.length,
        deepgramKeyStart: deepgramKey.substring(0, 5),
        elevenLabsKeyStart: elevenLabsKey.substring(0, 5),
      });

      return {
        appVersion: app.getVersion(),
        nodeVersion: process.version,
        platform: process.platform,
        speechProvider,
        deepgramKey,
        elevenLabsKey,
        hasGroqKey: !!process.env.GROQ_API_KEY,
      };
    } catch (error) {
      console.error('Failed to get config:', error);
      return {
        error: 'Failed to retrieve configuration',
        appVersion: 'unknown',
        nodeVersion: process.version,
        platform: process.platform,
        speechProvider: 'deepgram',
        deepgramKey: '',
        elevenLabsKey: '',
        hasGroqKey: false,
      };
    }
  });
  isGetConfigHandlerRegistered = true;
};

// レンダラープロセスの初期化前にIPCハンドラーを登録して競合を防ぐ
registerGetConfigHandler();

/**
 * Groq APIでテキストを整形するIPCハンドラー
 */
let isGroqHandlerRegistered = false;
const registerGroqHandler = (): void => {
  if (isGroqHandlerRegistered) return;

  ipcMain.handle(
    'groq:refine-text',
    async (_event, text: string): Promise<{ success: boolean; text?: string; error?: string }> => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return { success: false, error: 'Groq APIキーが設定されていません' };
      }

      if (!text.trim()) {
        return { success: true, text };
      }

      // プロンプト長制限チェック
      if (text.length > GROQ_CONFIG.MAX_PROMPT_LENGTH) {
        console.warn(
          `Prompt too long (${text.length} chars), truncating to ${GROQ_CONFIG.MAX_PROMPT_LENGTH}`
        );
        text = text.slice(0, GROQ_CONFIG.MAX_PROMPT_LENGTH);
      }

      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || GROQ_CONFIG.DEFAULT_MODEL,
            messages: [
              {
                role: 'user',
                content: text,
              },
            ],
            temperature: GROQ_CONFIG.TEMPERATURE,
            max_tokens: GROQ_CONFIG.MAX_TOKENS,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMessage =
            errorData &&
            typeof errorData === 'object' &&
            'error' in errorData &&
            errorData.error &&
            typeof errorData.error === 'object' &&
            'message' in errorData.error
              ? String(errorData.error.message)
              : `API error: ${response.status}`;
          throw new Error(errorMessage);
        }

        const data = await response.json();

        // レスポンス構造の検証
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid API response: not an object');
        }

        if (!('choices' in data) || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error('Invalid API response: missing choices array');
        }

        const firstChoice = data.choices[0];
        if (!firstChoice || typeof firstChoice !== 'object' || !('message' in firstChoice)) {
          throw new Error('Invalid API response: missing message in choice');
        }

        const message = firstChoice.message;
        if (!message || typeof message !== 'object' || !('content' in message)) {
          throw new Error('Invalid API response: missing content in message');
        }

        const refinedText = typeof message.content === 'string' ? message.content.trim() : '';

        if (!refinedText) {
          throw new Error('整形結果が空です');
        }

        return { success: true, text: refinedText };
      } catch (error) {
        console.error('Groq refine error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '整形に失敗しました',
          text, // fallbackとして元のテキストを返す
        };
      }
    }
  );
  isGroqHandlerRegistered = true;
};

registerGroqHandler();

/**
 * 文字起こしテキストをコピーし、ウィンドウを閉じて、次のアクティブウィンドウに貼り付けてからアプリを終了
 */
let isPasteHandlerRegistered = false;
const registerPasteHandler = (): void => {
  if (isPasteHandlerRegistered) return;

  ipcMain.handle(
    'paste-to-active-window',
    async (_event, text: string): Promise<{ success: boolean; error?: string }> => {
      try {
        // クリップボードにテキストをコピー
        clipboard.writeText(text);

        // macOSの場合
        if (process.platform === 'darwin') {
          // ウィンドウを閉じる（次のウィンドウが自動的にアクティブになる）
          if (mainWindow) {
            mainWindow.hide();
          }

          // 少し待ってから次のアクティブウィンドウにCmd+Vを送信
          return new Promise((resolve) => {
            setTimeout(() => {
              exec(
                `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
                (error) => {
                  if (error) {
                    console.error('Paste simulation error:', error);
                    resolve({ success: false, error: error.message });
                  } else {
                    // 貼り付け成功後、アプリを終了
                    setTimeout(() => {
                      app.quit();
                    }, 100);
                    resolve({ success: true });
                  }
                }
              );
            }, 150); // ウィンドウ切り替えを待つ
          });
        }

        // Windows/Linuxの場合（未実装）
        return { success: false, error: 'このプラットフォームではサポートされていません' };
      } catch (error) {
        console.error('Paste handler error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );
  isPasteHandlerRegistered = true;
};

registerPasteHandler();

/**
 * ウィンドウの高さをリサイズするIPCハンドラー
 */
let isResizeHandlerRegistered = false;
const registerResizeHandler = (): void => {
  if (isResizeHandlerRegistered) return;

  ipcMain.handle(
    'resize-window',
    async (_event, height: number): Promise<{ success: boolean; error?: string }> => {
      try {
        // 入力値の検証（型・範囲・有限数）
        const MAX_REASONABLE_HEIGHT = 10000; // 10000px以上は異常値
        if (
          typeof height !== 'number' ||
          !isFinite(height) ||
          height < 0 ||
          height > MAX_REASONABLE_HEIGHT
        ) {
          console.warn('Invalid resize attempt:', { height, type: typeof height });
          return { success: false, error: 'Invalid height parameter' };
        }

        if (!mainWindow) {
          return { success: false, error: 'Window not found' };
        }

        const primaryDisplay = screen.getPrimaryDisplay();
        const { height: screenHeight } = primaryDisplay.workAreaSize;
        const width = WINDOW_CONFIG.WIDTH;

        // 最小・最大高さの制約
        const MIN_HEIGHT = 160;
        const MAX_HEIGHT = Math.floor(screenHeight * 0.8);
        const constrainedHeight = Math.max(MIN_HEIGHT, Math.min(height, MAX_HEIGHT));

        // Y座標を再計算（画面下部中央を維持）
        const x = Math.round((primaryDisplay.workAreaSize.width - width) / 2);
        const y = Math.max(0, screenHeight - constrainedHeight - WINDOW_CONFIG.MARGIN_BOTTOM);

        mainWindow.setBounds({ width, height: constrainedHeight, x, y });

        return { success: true };
      } catch (error) {
        console.error('Resize handler error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );
  isResizeHandlerRegistered = true;
};

registerResizeHandler();

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

  // デバッグ用：常に開発者ツールを開く
  mainWindow.webContents.openDevTools();

  // レンダラープロセスのコンソールログをターミナルに出力
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const logPrefix = '[Renderer]';
    const location = sourceId ? ` (${sourceId}:${line})` : '';

    switch (level) {
      case 0: // verbose/debug
        console.log(`${logPrefix} ${message}${location}`);
        break;
      case 1: // info
        console.info(`${logPrefix} ${message}${location}`);
        break;
      case 2: // warning
        console.warn(`${logPrefix} ${message}${location}`);
        break;
      case 3: // error
        console.error(`${logPrefix} ${message}${location}`);
        break;
      default:
        console.log(`${logPrefix} ${message}${location}`);
    }
  });

  // レンダラープロセスをロード
  // __dirname = dist/main/main なので、../../renderer/index.html で dist/renderer/index.html を指す
  const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
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
  if (isPasteHandlerRegistered) {
    ipcMain.removeHandler('paste-to-active-window');
    isPasteHandlerRegistered = false;
  }
  if (isGroqHandlerRegistered) {
    ipcMain.removeHandler('groq:refine-text');
    isGroqHandlerRegistered = false;
  }
  if (isResizeHandlerRegistered) {
    ipcMain.removeHandler('resize-window');
    isResizeHandlerRegistered = false;
  }
});

app.on('activate', () => {
  // macOSでアプリケーションアイコンがクリックされた際、ウィンドウを再作成
  if (mainWindow === null) {
    createWindow();
  }
});

// ログ出力: 環境変数の確認（開発環境かつDEBUG_CONFIG有効時のみ）
if (process.env.NODE_ENV === 'development' && process.env.DEBUG_CONFIG) {
  console.debug('API Keys status:');
  console.debug(`- ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? 'configured' : 'missing'}`);
  console.debug(`- Groq: ${process.env.GROQ_API_KEY ? 'configured' : 'missing'}`);
}
