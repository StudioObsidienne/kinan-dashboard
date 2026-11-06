const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('agent', {
  donnees: () => ipcRenderer.invoke('agent:donnees'),
  surCle: (r) => ipcRenderer.on('agent:cle', (_e, c) => r(c))
});
