export interface ElectronAPI {
  getConfig: () => Promise<{
    appVersion: string;
    nodeVersion: string;
    platform: string;
    hasElevenLabsKey: boolean;
    hasGroqKey: boolean;
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
