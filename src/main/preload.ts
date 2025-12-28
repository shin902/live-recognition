import { contextBridge, ipcRenderer } from 'electron';

// セキュアなAPI公開
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
});
