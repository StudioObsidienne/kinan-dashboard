// Kinan Orchestre : petite fenêtre de détail d'un agent (fichiers locaux uniquement, 0 jeton).
const { BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const DOSSIER = config.DOSSIER;
// Agents connus : le juge puis les agents de la configuration (nom, modèle).
const agentsConnus = () => {
  const c = config.charger();
  return Object.fromEntries([['kinan', ['Kinan', 'opus']], ...c.agents.map((a) => [a.id, [a.nom, a.modele]])]);
};
const lireJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

function donnees(cle, lireEtat, dossier = DOSSIER) {
  const [nom, modele] = agentsConnus()[cle] || [cle, ''];
  const a = ((lireEtat() || {}).agents || {})[cle] || { etat: 'repos', tache: '' };
  // Historique : missions terminées = passage travail -> repos, avec le texte de la tâche en cours à ce moment.
  let lignes = [];
  try { lignes = fs.readFileSync(path.join(dossier, 'historique.jsonl'), 'utf8').split('\n').filter(Boolean).slice(-2000); } catch { /* aucun */ }
  // « Fait » : missions terminées de l'historique (un 'repos' sans 'travail' compte, titre de repli)
  // + tâches 'fait' de taches.json pour cet agent.
  const faits = [];
  let tacheEnCours = '', actif = false;
  for (const l of lignes) {
    let h;
    try { h = JSON.parse(l); } catch { continue; }
    if (h.agent !== cle) continue;
    if (h.etat === 'travail') { actif = true; if (h.tache && (!tacheEnCours || !/^(Au travail|Mission reçue)/.test(h.tache))) tacheEnCours = h.tache; }
    else if (h.etat === 'repos') {
      if (actif) faits.push({ t: h.t, tache: (tacheEnCours && !/^(Au travail|Mission reçue)/.test(tacheEnCours)) ? tacheEnCours : 'Mission terminée', source: 'historique' });
      else faits.push({ t: h.t, tache: 'Mission terminée (début non journalisé)', source: 'historique' });
      actif = false; tacheEnCours = '';
    }
  }
  const taches = (lireJson(path.join(dossier, 'taches.json'), {}).taches) || [];
  for (const t of taches) {
    if (t.agent === cle && t.statut === 'fait') faits.push({ t: Date.parse(t.cree) || 0, tache: String(t.titre), source: 'tache' });
  }
  // Fusion sans doublon plus récents d'abord, 2 maximum.
  const repli = (f) => /^Mission terminée/.test(f.tache);
  const vus = new Set(), fusion = [];
  const norm = (x) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const f of [...faits].sort((x, y) => y.t - x.t)) {
    const k = repli(f) ? f.tache + f.t : norm(f.tache);
    if (vus.has(k)) continue;
    vus.add(k); fusion.push(f);
  }
  const avenir = taches
    .filter((t) => t.agent === cle && t.statut !== 'fait').slice(0, 3).map((t) => ({ titre: String(t.titre), statut: String(t.statut) }));
  // Exemplaires (clones) actifs en même temps : seulement si l'agent n'est pas au repos.
  const instances = (a.etat && a.etat !== 'repos' && Array.isArray(a.instances) ? a.instances : [])
    .filter((i) => i && typeof i === 'object')
    .map((i) => ({ id: String(i.id || ''), tache: String(i.tache || ''), depuis: Number(i.depuis) || 0, maj: Number(i.maj) || 0 }));
  return { cle, nom, modele, etat: a.etat || 'repos', tache: a.tache || '', depuis: a.maj || null,
    faits: fusion.slice(0, 2), avenir, instances, maintenant: Date.now() };
}

let fenetre = null, cleCourante = null;
function enregistrer(lireEtat) {
  ipcMain.handle('agent:donnees', () => (cleCourante ? donnees(cleCourante, lireEtat) : null));
  ipcMain.on('agent:ouvrir', (_e, cle) => ouvrirAgent(cle));
  ipcMain.handle('agent:detail', (_e, cle) => (typeof cle === 'string' && Object.prototype.hasOwnProperty.call(agentsConnus(), cle) ? donnees(cle, lireEtat) : null));
}

function ouvrirAgent(cle, cacher = false) {
  if (typeof cle !== 'string' || !Object.prototype.hasOwnProperty.call(agentsConnus(), cle)) return false; // clé validée côté main
  cleCourante = cle;
  if (fenetre && !fenetre.isDestroyed()) {
    fenetre.webContents.send('agent:cle', cle);
    if (fenetre.isMinimized()) fenetre.restore();
    if (!cacher) { fenetre.show(); fenetre.focus(); }
    return true;
  }
  fenetre = new BrowserWindow({
    width: 360, height: 300, resizable: false, show: !cacher, backgroundColor: '#14121c', title: 'Kinan Orchestre : agent',
    icon: path.join(__dirname, 'assets', 'icon.png'), autoHideMenuBar: true, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload-agent.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  fenetre.loadFile(path.join(__dirname, 'src', 'agent.html'));
  fenetre.on('closed', () => { fenetre = null; cleCourante = null; });
  return true;
}

module.exports = { enregistrer, ouvrirAgent, donnees };
