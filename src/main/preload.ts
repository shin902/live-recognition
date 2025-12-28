import { contextBridge, ipcRenderer } from 'electron';

// セキュアなAPI公開
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  pasteToActiveWindow: (text: string) => ipcRenderer.invoke('paste-to-active-window', text),
  groqRefineText: (text: string) => ipcRenderer.invoke('groq:refine-text', text),
});
