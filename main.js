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

const { appliquerDelais } = require('./etat-delai');
const sessionsEtat = require('./sessions-etat');
const DOSSIER_SESSIONS = path.join(DOSSIER_ETAT, 'sessions'); // écrit par le plugin 0.3.0 ; absent avec le plugin 0.2.2
const ETAT_PAR_DEFAUT = { agents: Object.fromEntries(config.ids().map((id) => [id, { etat: 'repos', tache: '' }])) };
// Erreurs vues sans horodatage (etat-delai.js) : une Map par vue (« recente », « toutes », ou identifiant de conversation).
const erreursVues = new Map();
const vues = (cle) => { if (!erreursVues.has(cle)) erreursVues.set(cle, new Map()); return erreursVues.get(cle); };
// Conversation affichée : « recente » (défaut : suit la plus récente, comme en 0.3.1), « toutes », ou un identifiant du registre.
let sessionChoisie = 'recente';

// Cache mtime+taille (lecture-cache.js) : state.json, sessions.json, sessions/<sid>.json et reglages.json ne sont relus que s'ils changent.
const cacheLecture = require('./lecture-cache').creer();
const lireJson = (f) => { const r = cacheLecture.lire(f, JSON.parse); return r ? r.valeur : undefined; };
function lireRegistre() {
  const d = lireJson(path.join(DOSSIER_ETAT, 'sessions.json'));
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
}
// Conversations vivantes du registre, avec l'état de chacune (sessions/<sid>.json).
function sessionsVivantes(now = Date.now()) {
  const reg = lireRegistre(), etats = {};
  for (const id of Object.keys(reg)) { const e = sessionsEtat.etatSession(DOSSIER_ETAT, id, cacheLecture); if (e) etats[id] = e; }
  return { reg, etats, liste: sessionsEtat.listerSessions(reg, lireReglages().libellesSessions, now, etats) };
}
// Agents absents d'un fichier de conversation : au repos (sinon l'interface garderait l'état de la vue précédente).
const completer = (etat) => { for (const id of config.ids()) if (!etat.agents[id]) etat.agents[id] = { etat: 'repos', tache: '' }; return etat; };

// state.json : miroir de la dernière conversation active (plugin 0.3.0), ou état unique (plugin 0.2.2).
function lireEtatMiroir() {
  try {
    const etat = lireJson(FICHIER_ETAT); // copie : appliquerDelais la modifie, sans toucher au cache
    if (etat === undefined) return ETAT_PAR_DEFAUT; // absent ou illisible
    if (!etat || typeof etat !== 'object' || Array.isArray(etat)) return ETAT_PAR_DEFAUT; // fichier corrompu (null, tableau…)
    // Délais (erreur 20 s puis repos, abandon 15 min) : voir etat-delai.js ; calculés à chaque lecture, donc sans attendre un évènement.
    appliquerDelais(etat, Date.now(), vues('recente'));
    return etat;
  } catch {
    return ETAT_PAR_DEFAUT;
  }
}
// « Toutes » : fusion des conversations vivantes (le son et la fenêtre question l'utilisent toujours). Sans sessions/ : state.json.
function lireEtatFusion() {
  if (!fs.existsSync(DOSSIER_SESSIONS)) return lireEtatMiroir();
  const now = Date.now();
  const { etats, liste } = sessionsVivantes(now);
  const avecEtat = liste.filter((s) => etats[s.id]);
  if (!avecEtat.length) return lireEtatMiroir();
  const plusieurs = avecEtat.length > 1; // libellé de conversation sur la question seulement s'il y a un choix
  const fusion = sessionsEtat.fusionner(avecEtat.map((s) => ({ libelle: plusieurs ? s.libelle : '', etat: appliquerDelais(etats[s.id], now, vues(s.id)) })));
  return completer(appliquerDelais(fusion, now, vues('toutes')));
}
function lireEtat() {
  if (sessionChoisie === 'recente' || !fs.existsSync(DOSSIER_SESSIONS)) return lireEtatMiroir();
  if (sessionChoisie === 'toutes') return lireEtatFusion();
  const e = sessionsEtat.etatSession(DOSSIER_ETAT, sessionChoisie, cacheLecture) || { agents: {} };
  return completer(appliquerDelais(e, Date.now(), vues(sessionChoisie)));
}
// Conversation suivie par le relais : la choisie ; « Toutes » : la plus récente du registre ; sinon celle de state.json.
function conversationSuivie() {
  const reg = lireRegistre();
  let sid = sessionChoisie;
  if (sid === 'toutes') { const l = sessionsVivantes().liste.sort((a, b) => b.maj - a.maj); sid = l.length ? l[0].id : 'recente'; }
  if (sid === 'recente') { const m = lireEtatMiroir(); return { transcript: m.transcript, cwd: (reg[m.session] || {}).cwd || null }; }
  const s = reg[sid] || {};
  return { transcript: s.transcript, cwd: s.cwd || null };
}

// Taille et position de la fenêtre principale : mémorisées dans reglages.json (clé « fenetre »).
const FICHIER_REGLAGES = path.join(DOSSIER_ETAT, 'reglages.json');
function lireReglages() { return lireJson(FICHIER_REGLAGES) || {}; } // copie : session:renommer la modifie avant de la réécrire
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
    show: false, // affichée à ready-to-show : pas d'icône Electron ni de fenêtre vide au lancement
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const montrer = () => { if (!fenetre.isDestroyed() && !fenetre.isVisible()) fenetre.show(); };
  fenetre.once('ready-to-show', montrer);
  setTimeout(montrer, 4000); // filet de sécurité si ready-to-show n'arrive pas
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
  // KINAN_TEST_ONGLET=notes (test seulement) : la fenêtre Gestion s'ouvre sur l'onglet Notes et c'est elle qui est surveillée.
  if (TEST_DEMARRAGE && process.env.KINAN_TEST_ONGLET === 'notes') surveillerDemarrage(gestion.ouvrirGestion('notes'), true);
  else if (TEST_DEMARRAGE) surveillerDemarrage(fenetre);
  fenetre.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Envoi de l'état une fois par seconde, seulement s'il a changé.
  let dernier = '';
  const envoyerEtat = () => {
    if (fenetre.isDestroyed()) return;
    const { transcript: _journal, ...pourRendu } = lireEtat(); // le rendu ne reçoit jamais le chemin du journal
    const brut = JSON.stringify(pourRendu);
    if (brut !== dernier) {
      dernier = brut;
      fenetre.webContents.send('etat', JSON.parse(brut));
    }
  };
  // Pause du minuteur fenêtre masquée ou réduite ; à la réapparition (show/restore/focus) : renvoi immédiat de l'état.
  // Le son, les alertes et la fenêtre question ont leurs propres lectures et ne dépendent pas de ce minuteur.
  let minuteur = null;
  const demarrerMinuteur = () => { if (!minuteur) minuteur = setInterval(envoyerEtat, 1000); };
  const arreterMinuteur = () => { clearInterval(minuteur); minuteur = null; };
  const reprendre = () => { if (fenetre.isDestroyed()) return; dernier = ''; demarrerMinuteur(); envoyerEtat(); };
  demarrerMinuteur();
  fenetre.on('hide', arreterMinuteur);
  fenetre.on('minimize', arreterMinuteur);
  fenetre.on('show', reprendre);
  fenetre.on('restore', reprendre);
  fenetre.on('focus', reprendre);
  // Fermer la fenêtre principale quitte vraiment l'appli (les fenêtres cachées du son et du détail ne la gardent plus en vie :
  // sinon un processus invisible gardait le verrou et empêchait de relancer Kinan Orchestre).
  fenetre.on('closed', () => { arreterMinuteur(); app.quit(); });
}

// Test de démarrage (test/demarrage.test.js) : KINAN_TEST_DEMARRAGE=1 ouvre la fenêtre, attend le chargement de la page,
// écrit « DEMARRAGE OK » (ou les erreurs relevées) sur la sortie standard puis quitte. Profil Electron isolé dans le dossier
// d'état (KINAN_OS_DOSSIER, temporaire pendant le test) : ni l'appli ouverte de l'utilisateur ni ses réglages ne sont touchés.
const TEST_DEMARRAGE = process.env.KINAN_TEST_DEMARRAGE === '1';
const erreursDemarrage = [];
if (TEST_DEMARRAGE) {
  app.setPath('userData', path.join(DOSSIER_ETAT, 'profil-electron-test'));
  // Test : aucune fenêtre ne doit apparaître, passer au premier plan ni voler le focus (ex. pendant que l'utilisateur joue) :
  // transparente, non focalisable, absente de la barre des tâches. Le chargement de la page et les scénarios se déroulent normalement.
  app.on('browser-window-created', (_e, w) => { try { w.setFocusable(false); w.setOpacity(0); w.setSkipTaskbar(true); } catch { /* ignoré */ } });
  process.on('uncaughtException', (e) => erreursDemarrage.push('processus principal : ' + String((e && e.stack) || e).slice(0, 400)));
  setTimeout(() => { process.stdout.write(['DEMARRAGE ERREUR', 'délai dépassé (45 s)', ...erreursDemarrage, ''].join('\n')); app.exit(2); }, 45000).unref();
}
function surveillerDemarrage(fenetre, scenarioNotes) {
  const wc = fenetre.webContents;
  // Scénario Notes : Ctrl+N crée une note, le texte est saisi dans l'éditeur ; l'enregistrement automatique doit écrire notes.json.
  if (scenarioNotes) wc.once('did-finish-load', () => setTimeout(() => wc.executeJavaScript(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true}));" +
    "setTimeout(()=>{const t=document.activeElement;if(!t||t.id!=='n-texte')console.error('focus absent de l\\'éditeur');else{t.value='Idée test démarrage\\nligne 2';t.dispatchEvent(new Event('input',{bubbles:true}));}},800)"
  ).catch((e) => erreursDemarrage.push('scénario notes : ' + e.message)), 300));
  wc.on('console-message', (ev) => { if (ev && ev.level === 'error') erreursDemarrage.push('page : ' + String(ev.message).slice(0, 400)); });
  wc.on('preload-error', (_e, f, err) => erreursDemarrage.push('preload ' + path.basename(String(f)) + ' : ' + String(err && err.message).slice(0, 300)));
  wc.on('did-fail-load', (_e, code, desc) => erreursDemarrage.push(`chargement : ${code} ${desc}`));
  wc.on('render-process-gone', (_e, d) => erreursDemarrage.push('rendu arrêté : ' + (d && d.reason)));
  wc.once('did-finish-load', () => setTimeout(() => { // laisse aux scripts de la page le temps de s'exécuter
    const ok = !erreursDemarrage.length;
    process.stdout.write([ok ? 'DEMARRAGE OK' : 'DEMARRAGE ERREUR', ...erreursDemarrage, ''].join('\n'));
    app.exit(ok ? 0 : 1);
  }, 4000));
}

// Une seule fenêtre : un second lancement (par le hook de démarrage) se ferme sans rien faire.
if (!app.requestSingleInstanceLock()) app.quit();
// Second lancement (le hook SessionStart relance l'appli à chaque session) : on ne vole pas le focus.
// Fenêtre réduite : restaurée ; cachée : montrée sans focus ; déjà visible : rien.
app.on('second-instance', () => {
  const w = fenetrePrincipale;
  if (!w || w.isDestroyed()) { if (app.isReady()) creerFenetre(); return; } // fenêtre principale absente : on la recrée

  // Déjà lancé : on ne touche à rien (ni restauration, ni focus). Seule une fenêtre cachée par erreur est remontrée, sans focus.
  if (!w.isVisible() && !w.isMinimized()) w.showInactive();
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
  // Raccourci Bureau / menu Démarrer (AUMID kinan-os.dashboard) : recréé en silence à chaque démarrage (idempotent), sans bloquer, erreurs ignorées.
  if (!TEST_DEMARRAGE) require('./raccourci-demarrage').lancer(process.platform, __dirname);
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
  require('./notes-ipc').enregistrer(); // bloc-notes local (notes.json), aucun réseau
  require('./economies').enregistrer(ipcMain); // coche verte : rapport des 3 dernières heures (0 jeton)
  require('./ui-ipc').enregistrer({ gestion, son });
  // Clone déployé (un exemplaire de plus, à partir de 2) : notification système ; le petit son est joué par son-ipc.js.
  const notifierClone = ({ agent, n, tache }) => {
    if (!Notification.isSupported()) return;
    const note = new Notification({ title: 'Kinan Orchestre : clone', body: `${config.nomDe(agent)} n°${n} déployé${tache ? ' : ' + tache : ''}` });
    note.on('click', () => { const w = fenetrePrincipale; if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } });
    note.show();
  };
  son.demarrer({ lireEtat: lireEtatFusion, surClone: notifierClone }); // clones et sons de toutes les conversations
  // Détail d'agent : historique et tâches de la conversation choisie (tout en « recente » et « toutes »).
  agentFenetre.enregistrer(lireEtat, () => (sessionsEtat.estSession(sessionChoisie) ? sessionChoisie : null));
  question.demarrer({ lireEtat: lireEtatFusion }); // fenêtre « question » quand Kinan est en doute, dans n'importe quelle conversation
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
  const lancerMaj = () => { if (config.charger(true).miseAJour.verifier !== true) return false; ['maj:lire', 'maj:appliquer', 'maj:vu', 'maj:verifier'].forEach((c) => ipcMain.removeHandler(c)); if (config.charger().miseAJour.verifier === true) require('./mise-a-jour').demarrer({ ipcMain, BrowserWindow, dialog, app, Notification, dossierEtat: DOSSIER_ETAT, dossierAppli: __dirname, active: true }); return true; };
  if (!lancerMaj()) {
    let v = '0.0.0'; try { v = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || v; } catch { /* ignoré */ }
    const etatMaj = { active: false, verifie: null, appli: { locale: v, distante: null, nouvelle: false }, plugin: { locale: null, distante: null, nouvelle: false }, git: { possible: false, raison: 'vérification désactivée' }, aAnnoncer: [] };
    ipcMain.handle('maj:lire', () => etatMaj);
    ipcMain.handle('maj:appliquer', () => ({ ok: false, message: 'Vérification des mises à jour désactivée (voir README).' }));
    ipcMain.handle('maj:vu', () => false);
    ipcMain.handle('maj:verifier', () => etatMaj);
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
  const etatRelaisComplet = () => { const { id: _chemin, ...r } = etatRelais; return { ...r, reporteJusqua }; }; // sans le chemin du journal
  ipcMain.handle('relais:lire', etatRelaisComplet);
  ipcMain.handle('relais:reporter', () => { reporteJusqua = Date.now() + 20 * 60000; diffuserRelais(); return reporteJusqua; });
  ipcMain.handle('relais:copier', () => { try { clipboard.writeText('/relais'); return { ok: true }; } catch { return { ok: false }; } });
  const diffuserRelais = () => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('relais:maj', etatRelaisComplet()); };
  const releverRelais = () => {
    try {
      const suivie = conversationSuivie();
      const n = relais.detecter({ cache: cacheRelais, fichier: suivie.transcript });
      // Dossier de la conversation suivie (registre des sessions tenu par les hooks) : sert à adapter le sous-titre ; jamais envoyé au rendu.
      n.hors = config.horsTravail(suivie.cwd);
      const cle = (e) => JSON.stringify([e.actif, e.id, e.titre, e.hors, e.minutes, e.ctx && Math.round(e.ctx / 1000)]);
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
  // Conversations en cours (plugin 0.3.0) : barre de pastilles. Toutes les 2 s, envoyé si changé. Sans sessions/ : liste vide.
  // Le rendu ne reçoit que { id, libelle, etat, actifs, maj } par conversation (sessions-etat.js, chargeRendu) : ni chemin, ni journal.
  const lireSessions = () => {
    let liste = [];
    try { if (fs.existsSync(DOSSIER_SESSIONS)) liste = sessionsVivantes().liste; } catch { liste = []; }
    const d = sessionsEtat.chargeRendu(liste, sessionChoisie);
    sessionChoisie = d.choisie; // conversation choisie disparue : retour à la plus récente
    return d;
  };
  let dernieresSessions = '';
  const diffuserSessions = () => {
    const d = lireSessions(), brut = JSON.stringify(d);
    if (brut === dernieresSessions) return;
    dernieresSessions = brut;
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('sessions:maj', d);
  };
  ipcMain.handle('sessions:lire', () => lireSessions());
  ipcMain.handle('session:courante', () => sessionChoisie);
  ipcMain.handle('session:choisir', (_e, id) => {
    let liste = [];
    try { if (fs.existsSync(DOSSIER_SESSIONS)) liste = sessionsVivantes().liste; } catch { liste = []; }
    const ok = sessionsEtat.choixValide(id, liste);
    if (ok) { sessionChoisie = id; diffuserSessions(); }
    return { ok, choisie: sessionChoisie };
  });
  // Renommage par Jean (double-clic sur une pastille) : reglages.json, clé libellesSessions. Texte vide : nom du dossier.
  ipcMain.handle('session:renommer', (_e, id, libelle) => {
    if (typeof id !== 'string' || !sessionsEtat.estSession(id) || !Object.prototype.hasOwnProperty.call(lireRegistre(), id)) return false;
    try {
      const r = lireReglages(), t = String(libelle == null ? '' : libelle).replace(/\s+/g, ' ').trim().slice(0, 40);
      r.libellesSessions = r.libellesSessions && typeof r.libellesSessions === 'object' && !Array.isArray(r.libellesSessions) ? r.libellesSessions : {};
      if (t) r.libellesSessions[id] = t; else delete r.libellesSessions[id];
      fs.writeFileSync(FICHIER_REGLAGES, JSON.stringify(r, null, 2));
    } catch { return false; }
    diffuserSessions();
    return true;
  });
  setInterval(diffuserSessions, 2000);
  creerFenetre();
});

app.on('window-all-closed', () => app.quit());
