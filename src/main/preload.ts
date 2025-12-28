import { contextBridge, ipcRenderer } from 'electron';

// セキュアなAPI公開
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
});

// TypeScript用の型定義
declare global {
  interface Window {
    electronAPI: {
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
