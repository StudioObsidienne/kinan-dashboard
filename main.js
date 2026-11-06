// Kinan Orchestre (édition publique) : processus principal.
// Lit les fichiers d'état locaux écrits par les hooks du plugin et les transmet à l'interface.
// Par défaut, aucun appel à Claude (0 jeton) et aucune connexion réseau : toute requête http(s)/ws de Chromium est bloquée (voir bloquerReseau).
// Options désactivées par défaut : vérification des mises à jour (mise-a-jour.js) et courrier (courrier-ipc.js -> courrier.js).
const { app, BrowserWindow, Menu, screen, Notification, ipcMain, clipboard, session, dialog } = require('electron');
const config = require('./config');
const gestion = require('./gestion-ipc');
const question = require('./question-ipc');
const son = require('./son-ipc');
const tokenout = require('./tokenout');
const relais = require('./relais');
const agentFenetre = require('./agent-ipc');
const fs = require('fs');
const path = require('path');

const DOSSIER_ETAT = config.DOSSIER;
const FICHIER_ETAT = path.join(DOSSIER_ETAT, 'state.json');

const ETAT_PAR_DEFAUT = { agents: Object.fromEntries(config.ids().map((id) => [id, { etat: 'repos', tache: '' }])) };

function lireEtat() {
  try {
    const etat = JSON.parse(fs.readFileSync(FICHIER_ETAT, 'utf8'));
    // Un agent « au travail » sans nouvelle depuis 15 min est considéré au repos (hook manqué).
    for (const a of Object.values(etat.agents || {})) {
      if (a.etat !== 'repos' && a.maj && Date.now() - a.maj > 15 * 60 * 1000) { a.etat = 'repos'; a.tache = ''; }
      // Une erreur d'outil est ponctuelle : le rouge disparaît après 20 s (le prochain message le remettra au travail).
      if (a.etat === 'erreur' && a.maj && Date.now() - a.maj > 20 * 1000) { a.etat = 'repos'; a.tache = ''; }
    }
    return etat;
  } catch {
    return ETAT_PAR_DEFAUT;
  }
}

// Taille et position de la fenêtre principale : mémorisées dans reglages.json (clé « fenetre »).
const FICHIER_REGLAGES = path.join(DOSSIER_ETAT, 'reglages.json');
function lireReglages() { try { return JSON.parse(fs.readFileSync(FICHIER_REGLAGES, 'utf8')) || {}; } catch { return {}; } }
function boundsMemorises() {
  try { return boundsMemorisesBrut(); } catch { return {}; }
}
function boundsMemorisesBrut() {
  const f = lireReglages().fenetre;
  if (!f || ![f.width, f.height].every(Number.isFinite) || f.width < 760 || f.height < 520) return {};
  const res = { width: Math.round(f.width), height: Math.round(f.height) };
  // Garde-fou : la position n'est reprise que si la fenêtre reste bien visible sur un écran actuel.
  if (Number.isFinite(f.x) && Number.isFinite(f.y)) {
    const visible = screen.getAllDisplays().some((d) => {
      const z = d.workArea;
      const l = Math.min(f.x + f.width, z.x + z.width) - Math.max(f.x, z.x);
      const h = Math.min(f.y + f.height, z.y + z.height) - Math.max(f.y, z.y);
      return l >= 200 && h >= 150 && f.y >= z.y - 10;
    });
    if (visible) { res.x = Math.round(f.x); res.y = Math.round(f.y); }
  }
  return res;
}
function memoriserBounds(fenetre) {
  try {
    const b = fenetre.getNormalBounds();
    const r = lireReglages(); r.fenetre = { x: b.x, y: b.y, width: b.width, height: b.height, maximisee: fenetre.isMaximized() };
    fs.writeFileSync(FICHIER_REGLAGES, JSON.stringify(r, null, 2));
  } catch { /* silencieux */ }
}

let fenetrePrincipale = null;
function creerFenetre() {
  const memo = boundsMemorises();
  const fenetre = new BrowserWindow({
    width: 1180,
    height: 760,
    ...memo,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#14121c',
    title: 'Kinan Orchestre',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (lireReglages().fenetre && lireReglages().fenetre.maximisee) fenetre.maximize();
  let minuterieBounds = null;
  const planifier = () => { clearTimeout(minuterieBounds); minuterieBounds = setTimeout(() => { if (!fenetre.isDestroyed()) memoriserBounds(fenetre); }, 800); };
  fenetre.on('resize', planifier); fenetre.on('move', planifier);
  fenetre.on('close', () => memoriserBounds(fenetre));
  fenetrePrincipale = fenetre;
  // Windows : l'épinglage à la barre des tâches relance « electron.exe <dossier de l'appli> » avec l'icône Kinan (sinon l'écran d'accueil d'Electron s'ouvre).
  if (process.platform === 'win32') {
    try { fenetre.setAppDetails({ appId: 'kinan-os.dashboard', appIconPath: path.join(__dirname, 'assets', 'icon.ico'), appIconIndex: 0, relaunchCommand: `"${process.execPath}" "${__dirname}"`, relaunchDisplayName: 'Kinan Orchestre' }); } catch { /* sans effet */ }
  }
  fenetre.on('closed', () => { if (fenetrePrincipale === fenetre) fenetrePrincipale = null; });
  if (TEST_DEMARRAGE) surveillerDemarrage(fenetre);
  fenetre.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Envoi de l'état une fois par seconde, seulement s'il a changé.
  let dernier = '';
  const minuteur = setInterval(() => {
    if (fenetre.isDestroyed()) return;
    const brut = JSON.stringify(lireEtat());
    if (brut !== dernier) {
      dernier = brut;
      fenetre.webContents.send('etat', JSON.parse(brut));
    }
  }, 1000);
  // Fermer la fenêtre principale quitte vraiment l'appli (les fenêtres cachées du son et du détail ne la gardent plus en vie :
  // sinon un processus invisible gardait le verrou et empêchait de relancer Kinan Orchestre).
  fenetre.on('closed', () => { clearInterval(minuteur); app.quit(); });
}

// Test de démarrage (test/demarrage.test.js) : KINAN_TEST_DEMARRAGE=1 ouvre la fenêtre, attend le chargement de la page,
// écrit « DEMARRAGE OK » (ou les erreurs relevées) sur la sortie standard puis quitte. Profil Electron isolé dans le dossier
// d'état (KINAN_OS_DOSSIER, temporaire pendant le test) : ni l'appli ouverte de l'utilisateur ni ses réglages ne sont touchés.
const TEST_DEMARRAGE = process.env.KINAN_TEST_DEMARRAGE === '1';
const erreursDemarrage = [];
if (TEST_DEMARRAGE) {
  app.setPath('userData', path.join(DOSSIER_ETAT, 'profil-electron-test'));
  process.on('uncaughtException', (e) => erreursDemarrage.push('processus principal : ' + String((e && e.stack) || e).slice(0, 400)));
  setTimeout(() => { process.stdout.write(['DEMARRAGE ERREUR', 'délai dépassé (45 s)', ...erreursDemarrage, ''].join('\n')); app.exit(2); }, 45000).unref();
}
function surveillerDemarrage(fenetre) {
  const wc = fenetre.webContents;
  wc.on('console-message', (ev) => { if (ev && ev.level === 'error') erreursDemarrage.push('page : ' + String(ev.message).slice(0, 400)); });
  wc.on('preload-error', (_e, f, err) => erreursDemarrage.push('preload ' + path.basename(String(f)) + ' : ' + String(err && err.message).slice(0, 300)));
  wc.on('did-fail-load', (_e, code, desc) => erreursDemarrage.push(`chargement : ${code} ${desc}`));
  wc.on('render-process-gone', (_e, d) => erreursDemarrage.push('rendu arrêté : ' + (d && d.reason)));
  wc.once('did-finish-load', () => setTimeout(() => { // laisse aux scripts de la page le temps de s'exécuter
    const ok = !erreursDemarrage.length;
    process.stdout.write([ok ? 'DEMARRAGE OK' : 'DEMARRAGE ERREUR', ...erreursDemarrage, ''].join('\n'));
    app.exit(ok ? 0 : 1);
  }, 2500));
}

// Une seule fenêtre : un second lancement (par le hook de démarrage) se ferme sans rien faire.
if (!app.requestSingleInstanceLock()) app.quit();
// Second lancement (le hook SessionStart relance l'appli à chaque session) : on ne vole pas le focus.
// Fenêtre réduite : restaurée ; cachée : montrée sans focus ; déjà visible : rien.
app.on('second-instance', () => {
  const w = fenetrePrincipale;
  if (!w || w.isDestroyed()) { if (app.isReady()) creerFenetre(); return; } // fenêtre principale absente : on la recrée

  if (w.isMinimized()) w.restore();
  else if (!w.isVisible()) w.showInactive();
});

// Zéro réseau : toute requête http, https, ws ou wss est annulée ; aucune fenêtre ne peut en ouvrir une autre ni naviguer ailleurs.
function bloquerReseau() {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, rappel) => rappel({ cancel: true }));
  session.defaultSession.setPermissionRequestHandler((_w, _p, rappel) => rappel(false));
}
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (ev, url) => { if (!url.startsWith('file:')) ev.preventDefault(); });
});

app.setAppUserModelId('kinan-os.dashboard');
app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return; // second lancement : on quitte sans rien exécuter
  bloquerReseau();
  // Configuration (lecture seule) : thème, noms et couleurs des agents, sous-titre. Relue à chaque chargement de page.
  ipcMain.on('config:lire', (e) => { e.returnValue = config.charger(true); });
  // Logo du tableau au mur : fichier local de l'utilisateur (aucun téléchargement de theme.logo : zéro réseau).
  // PNG, JPEG ou WebP reconnus à leur signature, 2 Mo au plus ; sinon null (motif neutre dessiné par la scène).
  ipcMain.handle('logo:lire', () => {
    const SIG = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
    for (const nom of ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp']) {
      try {
        const f = path.join(DOSSIER_ETAT, nom);
        if (!fs.existsSync(f) || fs.statSync(f).size > 2 * 1024 * 1024) continue;
        const b = fs.readFileSync(f);
        const type = Object.keys(SIG).find((t) => SIG[t].every((o, i) => b[i] === o) && (t !== 'image/webp' || b.toString('latin1', 8, 12) === 'WEBP'));
        if (type) return 'data:' + type + ';base64,' + b.toString('base64');
      } catch { /* fichier suivant */ }
    }
    return null;
  });
  fs.mkdirSync(DOSSIER_ETAT, { recursive: true });
  if (!fs.existsSync(FICHIER_ETAT)) {
    fs.writeFileSync(FICHIER_ETAT, JSON.stringify(ETAT_PAR_DEFAUT, null, 2));
  }
  gestion.enregistrer();
  // Courrier : option désactivée par défaut. courrier-ipc.js ne charge courrier.js (IMAP/SMTP, Claude Code) qu'après activation explicite.
  require('./courrier-ipc').enregistrer();
  require('./economies').enregistrer(ipcMain); // coche verte : rapport des 3 dernières heures (0 jeton)
  require('./ui-ipc').enregistrer({ gestion, son });
  // Clone déployé (un exemplaire de plus, à partir de 2) : notification système ; le petit son est joué par son-ipc.js.
  const notifierClone = ({ agent, n, tache }) => {
    if (!Notification.isSupported()) return;
    const note = new Notification({ title: 'Kinan Orchestre : clone', body: `${config.nomDe(agent)} n°${n} déployé${tache ? ' : ' + tache : ''}` });
    note.on('click', () => { const w = fenetrePrincipale; if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } });
    note.show();
  };
  son.demarrer({ lireEtat, surClone: notifierClone });
  agentFenetre.enregistrer(lireEtat);
  question.demarrer({ lireEtat }); // fenêtre « question » quand Kinan est en doute
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Kinan Orchestre', submenu: [
      { label: 'Gestion (tâches, historique, jetons)', accelerator: 'CmdOrCtrl+G', click: () => gestion.ouvrirGestion() },
      { id: 'sons', label: 'Sons', type: 'checkbox', checked: son.actif(), click: (item) => son.regler(item.checked) },
      { type: 'separator' }, { role: 'reload', label: 'Recharger' }, { role: 'quit', label: 'Quitter' }
    ] }
  ]));
  // La case Sons suit le réglage même changé ailleurs (bouton Sons de la fenêtre).
  setInterval(() => { try { const it = Menu.getApplicationMenu().getMenuItemById('sons'); if (it) it.checked = son.actif(); } catch { /* ignoré */ } }, 2000);
  // TOKEN OUT : limite d'utilisation Claude atteinte, détectée dans la fin des journaux (toutes les 30 s, cache par fichier).
  const cacheTokenOut = new Map();
  let etatTokenOut = { actif: false };
  ipcMain.handle('tokenout:lire', () => etatTokenOut);
  const releverTokenOut = () => {
    try {
      const n = tokenout.detecter({ cache: cacheTokenOut });
      const cle = (e) => JSON.stringify([e.actif, e.type, e.reprise, e.depuis]);
      const change = cle(n) !== cle(etatTokenOut);
      etatTokenOut = n;
      if (change) for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('tokenout:maj', n);
    } catch { /* ne jamais planter */ }
  };
  releverTokenOut(); setInterval(releverTokenOut, 30000);
  // Limites 5 h / hebdomadaire (écrites par la status line de Claude Code, outils/statusline-limites.js) : bulle rouge à 10 % ou moins. Lecture locale.
  require('./limites').enregistrer({ ipcMain, BrowserWindow, dossierEtat: DOSSIER_ETAT });
  // Version et mises à jour : DÉSACTIVÉ par défaut (zéro réseau). Activé seulement par « miseAJour.verifier: true » dans kinan.config.json ;
  // le module réseau n'est alors chargé qu'à ce moment. Sinon : version locale seule, aucune requête, aucun git.
  const lancerMaj = () => { if (config.charger(true).miseAJour.verifier !== true) return false; ['maj:lire', 'maj:appliquer', 'maj:vu'].forEach((c) => ipcMain.removeHandler(c)); if (config.charger().miseAJour.verifier === true) require('./mise-a-jour').demarrer({ ipcMain, BrowserWindow, dialog, app, Notification, dossierEtat: DOSSIER_ETAT, dossierAppli: __dirname, active: true }); return true; };
  if (!lancerMaj()) {
    let v = '0.0.0'; try { v = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || v; } catch { /* ignoré */ }
    const etatMaj = { active: false, verifie: null, appli: { locale: v, distante: null, nouvelle: false }, plugin: { locale: null, distante: null, nouvelle: false }, git: { possible: false, raison: 'vérification désactivée' }, aAnnoncer: [] };
    ipcMain.handle('maj:lire', () => etatMaj);
    ipcMain.handle('maj:appliquer', () => ({ ok: false, message: 'Vérification des mises à jour désactivée (voir README).' }));
    ipcMain.handle('maj:vu', () => false);
  }
  // Premier lancement, réglage absent de kinan.config.json : une seule question. Aucune requête avant un « Oui ».
  // La réponse (Oui ou Non) est écrite dans kinan.config.json (miseAJour.verifier) et la question n'est plus posée.
  if (!config.charger().miseAJour.explicite) {
    setTimeout(async () => {
      const w = fenetrePrincipale;
      const options = { type: 'question', buttons: ['Oui', 'Non'], defaultId: 1, cancelId: 1, noLink: true, title: 'Mises à jour',
        message: 'Vérifier automatiquement les nouvelles versions ?',
        detail: 'Une requête vers raw.githubusercontent.com toutes les 30 min (lecture du numéro de version publié). Sans « Oui », aucune connexion.\nModifiable ensuite dans kinan.config.json : « miseAJour.verifier ».' };
      try {
        const rep = await (w && !w.isDestroyed() ? dialog.showMessageBox(w, options) : dialog.showMessageBox(options));
        const oui = rep.response === 0;
        config.memoriserMiseAJour(oui);
        if (oui) lancerMaj();
      } catch { /* question reposée au prochain lancement */ }
    }, 1500);
  }
  // REFAIRE CONVERSATION : conversation la plus récente trop longue (toutes les 60 s, cache par chemin+taille+mtime).
  const cacheRelais = new Map();
  let etatRelais = { actif: false }, reporteJusqua = 0, derniereNotifRelais = 0;
  const etatRelaisComplet = () => ({ ...etatRelais, reporteJusqua });
  ipcMain.handle('relais:lire', etatRelaisComplet);
  ipcMain.handle('relais:reporter', () => { reporteJusqua = Date.now() + 20 * 60000; diffuserRelais(); return reporteJusqua; });
  ipcMain.handle('relais:copier', () => { try { clipboard.writeText('/relais'); return { ok: true }; } catch { return { ok: false }; } });
  const diffuserRelais = () => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('relais:maj', etatRelaisComplet()); };
  const releverRelais = () => {
    try {
      const n = relais.detecter({ cache: cacheRelais, fichier: (lireEtat() || {}).transcript });
      // Dossier de la conversation suivie (registre des sessions tenu par les hooks) : sert à adapter le sous-titre de la fenêtre.
      try { const sid = (lireEtat() || {}).session; const reg = JSON.parse(fs.readFileSync(path.join(DOSSIER_ETAT, 'sessions.json'), 'utf8')); n.cwd = (reg[sid] || {}).cwd || null; } catch { n.cwd = null; }
      n.hors = config.horsTravail(n.cwd);
      const cle = (e) => JSON.stringify([e.actif, e.id, e.titre, e.cwd, e.minutes, e.ctx && Math.round(e.ctx / 1000)]);
      const change = cle(n) !== cle(etatRelais);
      etatRelais = n;
      const now = Date.now();
      if (n.actif && !etatTokenOut.actif && now >= reporteJusqua && now - derniereNotifRelais >= 3600000 && Notification.isSupported()) {
        derniereNotifRelais = now;
        const h = Math.floor(n.minutes / 60);
        new Notification({ title: 'Kinan Orchestre : refaire la conversation', body: `Ouverte depuis ${h} h ${String(n.minutes % 60).padStart(2, '0')} · contexte ${Math.round(n.ctx / 1000)} k jetons. Tape /relais dans Claude.` }).show();
      }
      if (change) diffuserRelais();
    } catch { /* ne jamais planter */ }
  };
  releverRelais(); setInterval(releverRelais, 5000);
  // Autres conversations (projets) en cours : ~/.kinan-os/sessions.json, mis à jour par les hooks. Toutes les 2 s, envoyé si changé.
  const lireSessions = () => {
    let d = {}; try { d = JSON.parse(fs.readFileSync(path.join(DOSSIER_ETAT, 'sessions.json'), 'utf8')); } catch { return {}; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {}; // fichier corrompu (null, tableau…) : rien à afficher, pas d'exception
    for (const id of Object.keys(d)) { const s = d[id]; if (!s || typeof s !== 'object') { delete d[id]; continue; } s.titre = (s.transcript && relais.titreConversation(s.transcript)) || ('Conversation ' + id.slice(0, 8)); }
    return d;
  };
  let dernieresSessions = '';
  ipcMain.handle('sessions:lire', lireSessions);
  setInterval(() => {
    const brut = JSON.stringify(lireSessions());
    if (brut === dernieresSessions) return;
    dernieresSessions = brut;
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('sessions:maj', JSON.parse(brut));
  }, 2000);
  creerFenetre();
});

app.on('window-all-closed', () => app.quit());
