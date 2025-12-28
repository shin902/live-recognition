/**
 * Electron preload script で contextBridge 経由で公開された API の型定義
 */
declare global {
  interface Window {
    electronAPI: {
      /**
       * アプリケーション設定情報を取得
       * @returns 設定オブジェクト
       */
      getConfig: () => Promise<{
        appVersion: string;
        nodeVersion: string;
        platform: string;
        hasElevenLabsKey: boolean;
        hasGroqKey: boolean;
      }>;
    };
  }
}

export {};
