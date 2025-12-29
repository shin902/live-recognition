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
        speechProvider: 'deepgram' | 'elevenlabs';
        deepgramKey: string;
        elevenLabsKey: string;
        hasGroqKey: boolean;
        error?: string;
      }>;
      /**
       * テキストをアクティブウィンドウに貼り付ける
       * @param text 貼り付けるテキスト
       * @returns 結果オブジェクト
       */
      pasteToActiveWindow: (text: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      /**
       * Groq APIでテキストを整形する
       * @param text 整形するテキスト
       * @returns 整形結果
       */
      groqRefineText: (text: string) => Promise<{
        success: boolean;
        text?: string;
        error?: string;
      }>;
      /**
       * ウィンドウの高さをリサイズする
       * @param height 新しい高さ（ピクセル）
       * @returns 結果オブジェクト
       */
      resizeWindow: (height: number) => Promise<{
        success: boolean;
        error?: string;
      }>;
    };
  }
}

export {};
