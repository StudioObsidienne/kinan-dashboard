// Pont sécurisé entre le processus principal et l'interface.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kinan', {
  // Configuration validée par le processus principal (thème, agents, sous-titre) : lecture seule, synchrone au chargement.
  config: (() => { try { return ipcRenderer.sendSync('config:lire'); } catch { return null; } })(),
  surEtat: (rappel) => ipcRenderer.on('etat', (_e, etat) => rappel(etat)),
  // Ouvre la petite fenêtre de détail d'un agent (clé validée côté main).
  ouvrirAgent: (cle) => ipcRenderer.send('agent:ouvrir', String(cle)),
  // Détail (Fait / En cours / À venir) affiché directement dans la page principale.
  detailAgent: (cle) => ipcRenderer.invoke('agent:detail', String(cle)),
  // Logo de l'utilisateur pour le tableau au mur : fichier local logo.png / .jpg / .webp du dossier d'état (data URL validée) ou null.
  logo: () => ipcRenderer.invoke('logo:lire')
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
  // Conversation affichée : « recente », « toutes » ou identifiant (validé côté main contre le registre).
  sessionChoisir: (id) => ipcRenderer.invoke('session:choisir', String(id)),
  sessionCourante: () => ipcRenderer.invoke('session:courante'),
  sessionRenommer: (id, libelle) => ipcRenderer.invoke('session:renommer', String(id), String(libelle == null ? '' : libelle).slice(0, 40)),
  majLire: () => ipcRenderer.invoke('maj:lire'),
  surMaj: (r) => ipcRenderer.on('maj:maj', (_e, e) => r(e)),
  majAppliquer: () => ipcRenderer.invoke('maj:appliquer'),
  majVu: () => ipcRenderer.invoke('maj:vu'),
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

// Courrier (option désactivée par défaut). Les identifiants peuvent être définis ou effacés, jamais relus par la page.
const typeRecap = (t) => (t === 'devis' ? 'devis' : 'mails');
contextBridge.exposeInMainWorld('courrier', {
  option: () => ipcRenderer.invoke('courrier:option'),
  activer: () => ipcRenderer.invoke('courrier:activer'),
  desactiver: () => ipcRenderer.invoke('courrier:desactiver'),
  statut: () => ipcRenderer.invoke('courrier:statut'),
  enregistrer: (d) => ipcRenderer.invoke('courrier:enregistrer', d),
  oublier: () => ipcRenderer.invoke('courrier:oublier'),
  tester: () => ipcRenderer.invoke('courrier:tester'),
  relever: () => ipcRenderer.invoke('courrier:relever'),
  aValider: () => ipcRenderer.invoke('courrier:a-valider'),
  decider: (f, action, modifs) => ipcRenderer.invoke('courrier:decider', String(f), action === 'valider' ? 'valider' : 'refuser', modifs || null),
  valides: () => ipcRenderer.invoke('courrier:valides'),
  envoyer: (fichiers) => ipcRenderer.invoke('courrier:envoyer', Array.isArray(fichiers) ? fichiers.map(String) : []),
  classer: (f, d) => ipcRenderer.invoke('courrier:classer', String(f), d === 'envoye' ? 'envoye' : 'non-envoye'),
  copierRecap: (t) => ipcRenderer.invoke('courrier:copier-recap', typeRecap(t)),
  enregistrerRecap: (t) => ipcRenderer.invoke('courrier:enregistrer-recap', typeRecap(t)),
  recapLancer: (t) => ipcRenderer.invoke('courrier:recap-lancer', typeRecap(t)),
  recapEtat: () => ipcRenderer.invoke('courrier:recap-etat'),
  surMaj: (r) => ipcRenderer.on('courrier:maj', () => r())
});
