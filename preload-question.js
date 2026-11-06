// Préchargement minimal de la fenêtre « question ».
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('question', {
  surDonnees: (rappel) => ipcRenderer.on('question:donnees', (_e, d) => rappel(d)),
  fermer: () => ipcRenderer.send('question:fermer'),
  reglerSon: (actif) => ipcRenderer.invoke('question:son', actif)
});
