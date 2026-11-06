const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('son', { surJouer: (r) => ipcRenderer.on('son:jouer', (_e, d) => r(d)) });
