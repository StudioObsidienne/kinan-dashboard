// Kinan OS : sons discrets (synthèse Web Audio, aucun fichier). Joués par une fenêtre cachée,
// donc audibles même si la fenêtre principale est réduite. 0 jeton, 0 réseau.
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DOSSIER = require('./config').DOSSIER;
const F_REGLAGES = path.join(DOSSIER, 'reglages.json');
const lireReglages = () => { try { return JSON.parse(fs.readFileSync(F_REGLAGES, 'utf8')) || {}; } catch { return {}; } };

// Réglage de la fenêtre (bouton Sons) prioritaire ; sinon « sons.actif » de kinan.config.json.
const actif = () => { const r = lireReglages().son; return r === undefined ? require('./config').charger().sons.actif : r !== false; };
function regler(valeur) {
  try { // fusion : n'écrase pas les autres clés
    const r = lireReglages(); r.son = !!valeur;
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(F_REGLAGES, JSON.stringify(r, null, 2));
  } catch { /* silencieux */ }
}

let fenetreAudio = null;
function jouerReel(type, agent) {
  if (!actif()) return;
  if (!fenetreAudio || fenetreAudio.isDestroyed()) {
    fenetreAudio = new BrowserWindow({
      show: false, width: 100, height: 100,
      webPreferences: { preload: path.join(__dirname, 'preload-son.js'), contextIsolation: true, nodeIntegration: false,
        backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
    });
    // Journal de diagnostic ~/.kinan-os/son.log (état audio, erreurs, plantage de la fenêtre cachée).
    const noter = (t) => { try { fs.appendFileSync(path.join(DOSSIER, 'son.log'), new Date().toISOString() + ' ' + t + '\n'); } catch { /* ignoré */ } };
    fenetreAudio.webContents.on('console-message', (e, ...a) => noter(typeof e.message === 'string' ? e.message : String(a[1])));
    fenetreAudio.webContents.on('render-process-gone', (_e, d) => noter('fenetre audio plantee : ' + (d && d.reason)));
    fenetreAudio.webContents.on('did-fail-load', (_e, code, desc) => noter('chargement echoue : ' + code + ' ' + desc));
    fenetreAudio.loadFile(path.join(__dirname, 'src', 'son.html'));
  }
  const w = fenetreAudio;
  const envoyer = () => { if (!w.isDestroyed()) w.webContents.send('son:jouer', { type, agent }); };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', envoyer); else envoyer();
}

// Détection des clones : nombre d'exemplaires actifs par agent (0 si au repos).
function comptesClones(agents) {
  const c = {};
  for (const [nom, a] of Object.entries(agents || {})) {
    c[nom] = a && a.etat !== 'repos' && Array.isArray(a.instances) ? a.instances.length : 0;
  }
  return c;
}
// precedent : comptes du relevé d'avant (null = premier relevé : rien à signaler, on mémorise en silence).
// Renvoie les apparitions : un exemplaire de plus, à partir de 2 (une seule entrée par agent et par relevé).
function detecterClones(precedent, agents) {
  const comptes = comptesClones(agents);
  const nouveaux = [];
  if (precedent) {
    for (const [nom, n] of Object.entries(comptes)) {
      if (n >= 2 && n > (precedent[nom] || 0)) {
        const inst = agents[nom].instances;
        nouveaux.push({ agent: nom, n, tache: String((inst[inst.length - 1] || {}).tache || '').trim() });
      }
    }
  }
  return { comptes, nouveaux };
}

// lireEtat : même source que la fenêtre principale. jouer(type, agent) : remplaçable pour les tests.
function demarrer({ lireEtat, jouer = jouerReel, surClone = null }) {
  let precedent = null, comptes = null;       // null : le premier relevé ne joue rien (pas de son au démarrage)
  let cleQuestion = null, dernierFin = 0;
  return setInterval(() => {
    try {
      const agents = (lireEtat() || {}).agents || {};
      const k = agents.kinan || {};
      const cle = k.etat === 'doute' && k.question && k.question.texte ? JSON.stringify([k.question.texte, k.question.options || []]) : null;
      if (precedent) {
        if (cle && cle !== cleQuestion) jouer('question', 'kinan');
        for (const [nom, a] of Object.entries(agents)) {
          if (precedent[nom] === 'travail' && a.etat === 'repos' && Date.now() - dernierFin >= 3000) {
            dernierFin = Date.now(); jouer('fin', nom);
          }
        }
      }
      const det = detecterClones(comptes, agents);
      comptes = det.comptes;
      for (const c of det.nouveaux) { jouer('clone', c.agent); if (surClone) surClone(c); }
      cleQuestion = cle;
      precedent = Object.fromEntries(Object.entries(agents).map(([n, a]) => [n, a.etat]));
    } catch { /* ne jamais planter */ }
  }, 1000);
}

module.exports = { demarrer, actif, regler, jouerReel, detecterClones };
