// Minimal Electron preload: expose only the minimum bridge surface.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('_ftDesktop', {
  platform: () => ipcRenderer.invoke('env:platform'),
});
