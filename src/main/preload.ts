import { contextBridge, ipcRenderer } from 'electron';

// セキュアなAPI公開
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getElevenLabsToken: () => ipcRenderer.invoke('elevenlabs:get-token'),
  pasteToActiveWindow: (text: string) => ipcRenderer.invoke('paste-to-active-window', text),
  groqRefineText: (text: string) => ipcRenderer.invoke('groq:refine-text', text),
  resizeWindow: (height: number) => ipcRenderer.invoke('resize-window', height),
});
