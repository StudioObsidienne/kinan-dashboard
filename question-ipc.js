// Kinan Orchestre : petite fenêtre « question » quand Kinan attend une réponse de l'utilisateur. 0 jeton, 0 réseau.
const { BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const DOSSIER = require('./config').DOSSIER;
const F_REGLAGES = path.join(DOSSIER, 'reglages.json');
const DUREE_MAX = 10 * 60 * 1000;

const lireReglages = () => { try { return JSON.parse(fs.readFileSync(F_REGLAGES, 'utf8')) || {}; } catch { return {}; } };
function ecrireReglage(cle, valeur) {
  try { // fusion : n'écrase jamais les autres clés
    const r = lireReglages(); r[cle] = valeur;
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(F_REGLAGES, JSON.stringify(r, null, 2));
  } catch { /* silencieux */ }
}

let fenetre = null, minuteurMax = null, cleAffichee = null, cleFermee = null, enregistre = false;

function fermer() {
  clearTimeout(minuteurMax);
  if (fenetre && !fenetre.isDestroyed()) fenetre.destroy();
  fenetre = null;
}

function ouvrir(q, cacher) {
  const zone = screen.getPrimaryDisplay().workArea;
  const L = 380, H = 220, marge = 16;
  fenetre = new BrowserWindow({
    width: L, height: H, x: zone.x + zone.width - L - marge, y: zone.y + zone.height - H - marge,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
    backgroundColor: '#14121c', title: 'Kinan Orchestre : question',
    webPreferences: {
      preload: path.join(__dirname, 'preload-question.js'), contextIsolation: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  const f = fenetre;
  f.loadFile(path.join(__dirname, 'src', 'question.html'));
  f.webContents.once('did-finish-load', () => {
    if (f.isDestroyed()) return;
    f.webContents.send('question:donnees', { texte: q.texte, options: q.options, session: q.session || '', son: lireReglages().son !== false });
    if (!cacher) f.showInactive(); // sans voler le focus
  });
  f.on('closed', () => { clearTimeout(minuteurMax); if (fenetre === f) fenetre = null; });
  minuteurMax = setTimeout(fermer, DUREE_MAX);
}

// lireEtat : fonction qui renvoie l'état des agents (même source que la fenêtre principale).
function demarrer({ lireEtat, cacher = false }) {
  if (!enregistre) {
    enregistre = true;
    ipcMain.on('question:fermer', (e) => { if (fenetre && e.sender === fenetre.webContents) { cleFermee = cleAffichee; fermer(); } });
    ipcMain.handle('question:son', (_e, actif) => { ecrireReglage('son', !!actif); return !!actif; });
  }
  return setInterval(() => {
    try {
      const k = (lireEtat().agents || {}).kinan || {};
      const q = k.question;
      if (k.etat === 'doute' && q && q.texte) {
        const cle = JSON.stringify([q.texte, q.options || []]);
        if (cle === cleFermee) return;                 // fermée par l'utilisateur : pas de répétition
        if (fenetre && !fenetre.isDestroyed()) return; // déjà affichée
        if (cle === cleAffichee && !fenetre) return;   // expirée (10 min) : pas de répétition
        cleAffichee = cle;
        ouvrir({ texte: String(q.texte).slice(0, 600), options: (Array.isArray(q.options) ? q.options : []).slice(0, 8).map((o) => String(o).slice(0, 80)), session: typeof q.session === 'string' ? q.session.slice(0, 40) : '' }, cacher); // session : libellé de la conversation (plusieurs ouvertes)
      } else {
        cleAffichee = null; cleFermee = null;
        if (fenetre) fermer();
      }
    } catch { /* ne jamais planter */ }
  }, 1000);
}

module.exports = { demarrer };
