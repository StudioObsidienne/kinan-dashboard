// Pont sécurisé entre le processus principal et l'interface.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kinan', {
  // Configuration validée par le processus principal (thème, agents, sous-titre) : lecture seule, synchrone au chargement.
  config: (() => { try { return ipcRenderer.sendSync('config:lire'); } catch { return null; } })(),
  surEtat: (rappel) => ipcRenderer.on('etat', (_e, etat) => rappel(etat)),
  // Ouvre la petite fenêtre de détail d'un agent (clé validée côté main).
  ouvrirAgent: (cle) => ipcRenderer.send('agent:ouvrir', String(cle)),
  // Détail (Fait / En cours / À venir) affiché directement dans la page principale.
  detailAgent: (cle) => ipcRenderer.invoke('agent:detail', String(cle))
});

// Boutons de l'en-tête (Gestion, sons).
contextBridge.exposeInMainWorld('kinanUI', {
  ouvrirGestion: () => ipcRenderer.send('ui:gestion'),
  ouvrirLegende: () => ipcRenderer.send('ui:legende'),
  sonActif: () => ipcRenderer.invoke('ui:son-lire'),
  reglerSon: (actif) => ipcRenderer.send('ui:son-regler', !!actif),
  testerSon: () => ipcRenderer.send('ui:son-test'),
  tokenOutLire: () => ipcRenderer.invoke('tokenout:lire'),
  surTokenOut: (r) => ipcRenderer.on('tokenout:maj', (_e, e) => r(e)),
  relaisLire: () => ipcRenderer.invoke('relais:lire'),
  surRelais: (r) => ipcRenderer.on('relais:maj', (_e, e) => r(e)),
  relaisReporter: () => ipcRenderer.invoke('relais:reporter'),
  relaisCopier: () => ipcRenderer.invoke('relais:copier'),
  sessionsLire: () => ipcRenderer.invoke('sessions:lire'),
  economiesLire: () => ipcRenderer.invoke('economies:lire'),
  surSessions: (r) => ipcRenderer.on('sessions:maj', (_e, e) => r(e)),
  majLire: () => ipcRenderer.invoke('maj:lire'),
  surMaj: (r) => ipcRenderer.on('maj:maj', (_e, e) => r(e)),
  majAppliquer: () => ipcRenderer.invoke('maj:appliquer'),
  limitesLire: () => ipcRenderer.invoke('limites:lire'),
  surLimites: (r) => ipcRenderer.on('limites:maj', (_e, e) => r(e))
});

// Fenêtre Gestion : accès limité aux fichiers de Kinan Orchestre.
contextBridge.exposeInMainWorld('gestion', {
  etat: () => ipcRenderer.invoke('gestion:etat'),
  surOnglet: (r) => ipcRenderer.on('gestion:onglet', (_e, o) => r(o)),
  tachesLire: () => ipcRenderer.invoke('gestion:taches-lire'),
  tachesEcrire: (d) => ipcRenderer.invoke('gestion:taches-ecrire', d),
  historique: () => ipcRenderer.invoke('gestion:historique'),
  jetons: () => ipcRenderer.invoke('gestion:jetons'),
  reglerTarifs: (t) => ipcRenderer.invoke('gestion:tarifs-regler', t),
  tarifsDefaut: () => ipcRenderer.invoke('gestion:tarifs-defaut'),
  reglerContexte: (n) => ipcRenderer.invoke('gestion:reglage-contexte', n)
});
