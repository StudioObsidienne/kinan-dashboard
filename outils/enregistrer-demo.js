// Enregistre la vidéo de démonstration du tableau de bord : assets/demo/demo.webm (+ poster.png).
// Usage (depuis le dossier de l'appli) : node_modules/.bin/electron outils/enregistrer-demo.js
// Outil de développement : jamais chargé par l'appli. Aucun réseau, aucune IA, aucune donnée personnelle :
//  - dossier d'état, profil Electron et « maison » (~/.claude) TEMPORAIRES, supprimés à la fin (jamais ~/.kinan-os ni ~/.claude réels) ;
//  - état des agents et des conversations simulé par des fichiers écrits dans ce dossier temporaire (scénario ci-dessous) ;
//  - sons coupés (--mute-audio), raccourci Bureau neutralisé, aucune vérification réseau (cache de versions récent, voir ci-dessous), boîte « Importer » remplacée par deux faux fichiers texte.
// Capture : webContents.beginFrameSubscription (image par image, 30 i/s max) -> fenêtre cachée -> canvas -> MediaRecorder (VP9, WebM).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(RACINE, 'assets', 'demo');
const L = 1280, H = 720, IPS = 30, DEBIT = 1800000;
const VITESSE_SOMMEIL = 200; // ?egg-vitesse : l'horloge des easter eggs va 200 fois plus vite (10 min d'inactivité = 3 s)

// ---------- dossiers temporaires et environnement (avant tout require de l'appli) ----------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kinan-demo-'));
const ETAT = path.join(TMP, 'etat'), MAISON = path.join(TMP, 'maison'), PROFIL = path.join(TMP, 'profil'), TEXTES = path.join(TMP, 'textes');
for (const d of [ETAT, path.join(ETAT, 'sessions'), path.join(MAISON, '.claude', 'plugins'), PROFIL, TEXTES, SORTIE]) fs.mkdirSync(d, { recursive: true });
process.env.KINAN_OS_DOSSIER = ETAT;
process.env.USERPROFILE = MAISON; process.env.HOME = MAISON; process.env.CLAUDE_CONFIG_DIR = path.join(MAISON, '.claude');
const journal = (m) => { try { process.stdout.write(m + '\n'); } catch { /* ignoré */ } };

const ecrireJson = (f, o) => {
  const tmp = f + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, f); } catch { try { fs.writeFileSync(f, JSON.stringify(o)); } catch { /* ignoré */ } }
};
const VERSION_APPLI = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).version;
const VERSION_PLUGIN = '0.3.0';
// Versions : cache « à jour » récent (aucune vérification réseau) + plugin déclaré installé dans la fausse maison.
ecrireJson(path.join(ETAT, 'kinan.config.json'), { miseAJour: { verifier: true }, sons: { actif: true } });
ecrireJson(path.join(ETAT, 'mise-a-jour.json'), { verifie: Date.now(), appli: VERSION_APPLI, plugin: VERSION_PLUGIN });
ecrireJson(path.join(MAISON, '.claude', 'plugins', 'installed_plugins.json'), { plugins: { 'kinan-orchestre@kinan': [{ version: VERSION_PLUGIN }] } });
fs.writeFileSync(path.join(TEXTES, 'compte-rendu-reunion.md'), '# Compte rendu de réunion\n\n- Valider la maquette de la page d\'accueil\n- Relire les textes de la page « Tarifs »\n- Prévoir une recette avant la mise en ligne\n');
fs.writeFileSync(path.join(TEXTES, 'idees-fonctionnalites.txt'), 'Idées de fonctionnalités\n\nUn mode sombre pour la documentation.\nUn bouton pour copier les commandes.\n');

// Raccourci Bureau / menu Démarrer : non touché.
const racc = require.resolve('../raccourci-demarrage');
require.cache[racc] = { id: racc, filename: racc, loaded: true, exports: { lancer() {} } };

const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, nativeImage } = electron;
app.commandLine.appendSwitch('mute-audio');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluding-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setPath('userData', PROFIL);
app.setPath('documents', TEXTES);
// Boîte « Importer des fichiers texte » : deux fichiers factices, sans ouvrir de fenêtre système.
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(TEXTES, 'compte-rendu-reunion.md'), path.join(TEXTES, 'idees-fonctionnalites.txt')] });

require('../main.js');

// ---------- encodeur : fenêtre cachée (canvas + MediaRecorder) ----------
const CODE_ENCODEUR = `
const { ipcRenderer } = require('electron');
const cv = document.createElement('canvas'); cv.width = ${L}; cv.height = ${H};
const cx = cv.getContext('2d', { alpha: false });
const flux = cv.captureStream(0), piste = flux.getVideoTracks()[0];
const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
const rec = new MediaRecorder(flux, { mimeType: mime, videoBitsPerSecond: ${DEBIT} });
const morceaux = [];
rec.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
let derniere = null, images = 0, t0 = 0, t1 = 0, minuterie = null;
ipcRenderer.on('demo:image', async (_e, jpeg) => { try { derniere = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' })); } catch (e) { /* image ignorée */ } });
ipcRenderer.on('demo:debut', () => {
  rec.start(1000); t0 = performance.now();
  minuterie = setInterval(() => { if (!derniere) return; cx.drawImage(derniere, 0, 0, ${L}, ${H}); piste.requestFrame(); images++; t1 = performance.now(); }, ${Math.round(1000 / IPS)});
});
ipcRenderer.on('demo:fin', () => {
  clearInterval(minuterie);
  rec.onstop = async () => {
    const b = new Blob(morceaux, { type: mime });
    ipcRenderer.send('demo:fini', new Uint8Array(await b.arrayBuffer()), images, Math.round(t1 - t0), mime);
  };
  rec.stop();
});
ipcRenderer.send('demo:pret', mime);
`;

// ---------- WebM : ajoute l'élément Duration (absent des fichiers de MediaRecorder) pour que le lecteur affiche la durée ----------
function lireVint(b, p, garderMarque) {
  const o = b[p]; let n = 1; while (n <= 8 && !(o & (0x80 >> (n - 1)))) n++;
  if (n > 8) return null;
  let v = garderMarque ? BigInt(o) : BigInt(o & (0xff >> n));
  for (let i = 1; i < n; i++) v = (v << 8n) | BigInt(b[p + i]);
  const inconnue = !garderMarque && v === (1n << BigInt(7 * n)) - 1n;
  return { n, v, inconnue };
}
function ecrireTaille(v) { let n = 1; while (v >= (1 << (7 * n)) - 1) n++; const o = Buffer.alloc(n); let x = v; for (let i = n - 1; i >= 0; i--) { o[i] = x & 0xff; x = Math.floor(x / 256); } o[0] |= 0x80 >> (n - 1); return o; }
function ajouterDuree(buf, dureeMs) {
  let p = 0;
  const ent = lireVint(buf, p, true); p += ent.n; const te = lireVint(buf, p, false); p += te.n + Number(te.v); // en-tête EBML
  const idSeg = lireVint(buf, p, true); if (idSeg.v !== 0x18538067n) throw new Error('segment absent');
  const debutSeg = p; p += idSeg.n; const tSeg = lireVint(buf, p, false); const posTailleSeg = p; p += tSeg.n;
  const finSeg = tSeg.inconnue ? buf.length : p + Number(tSeg.v);
  let q = p; const vus = [];
  while (q < finSeg) {
    const id = lireVint(buf, q, true), t = lireVint(buf, q + id.n, false);
    vus.push(id.v.toString(16));
    if (id.v === 0x1549a966n) { // Info
      const debut = q + id.n + t.n, fin = debut + Number(t.v);
      if (buf.subarray(debut, fin).includes(Buffer.from([0x44, 0x89]))) return { buf, vus, deja: true };
      const echelle = (() => { // TimecodeScale (2AD7B1), défaut 1 000 000 ns
        let r = debut; while (r < fin) { const i2 = lireVint(buf, r, true), t2 = lireVint(buf, r + i2.n, false); if (i2.v === 0x2ad7b1n) { let x = 0n; for (let k = 0; k < Number(t2.v); k++) x = (x << 8n) | BigInt(buf[r + i2.n + t2.n + k]); return Number(x); } r += i2.n + t2.n + Number(t2.v); }
        return 1000000;
      })();
      const d = Buffer.alloc(8); d.writeDoubleBE(dureeMs * 1e6 / echelle);
      const el = Buffer.concat([Buffer.from([0x44, 0x89, 0x88]), d]);
      const nouvelleTaille = ecrireTaille(Number(t.v) + el.length);
      let sortie = Buffer.concat([buf.subarray(0, q + id.n), nouvelleTaille, buf.subarray(debut, fin), el, buf.subarray(fin)]);
      const delta = nouvelleTaille.length - t.n + el.length;
      if (!tSeg.inconnue) { // taille du segment connue : à corriger (même longueur de codage, sinon refus)
        const nt = ecrireTaille(Number(tSeg.v) + delta);
        if (nt.length !== tSeg.n) throw new Error('taille du segment : codage à élargir');
        nt.copy(sortie, posTailleSeg);
      }
      return { buf: sortie, vus, deja: false };
    }
    if (t.inconnue) break;
    q += id.n + t.n + Number(t.v);
  }
  throw new Error('élément Info introuvable (' + vus.join(',') + ')');
}

// ---------- état simulé : deux conversations, écrites comme le fait le plugin ----------
const MAINTENANT = Date.now();
const CONV = {
  'conv-site': { projet: 'site-vitrine', debut: MAINTENANT - 300000, maj: MAINTENANT, agents: {} },
  'conv-docs': { projet: 'documentation', debut: MAINTENANT - 200000, maj: MAINTENANT - 1000, agents: {} }
};
function ecrireEtat() {
  const reg = {};
  for (const [id, c] of Object.entries(CONV)) {
    const e = Object.values(c.agents).map((a) => a.etat);
    reg[id] = { projet: c.projet, debut: c.debut, maj: c.maj, etat: e.includes('erreur') ? 'erreur' : e.includes('travail') ? 'travail' : 'repos' };
    ecrireJson(path.join(ETAT, 'sessions', id + '.json'), { session: id, agents: c.agents });
  }
  ecrireJson(path.join(ETAT, 'sessions.json'), reg);
  const [sid, rec] = Object.entries(CONV).sort((a, b) => b[1].maj - a[1].maj)[0];
  ecrireJson(path.join(ETAT, 'state.json'), { session: sid, agents: rec.agents });
}
// poser('conv-site', 'skyze', 'travail', 'tâche', ageMs) : ageMs > 0 fait « vieillir » l'horodatage (l'erreur retombe plus tôt que 20 s).
function poser(conv, agent, etat, tache, age = 0) {
  const c = CONV[conv];
  c.agents[agent] = { etat, tache: tache || '', maj: Date.now() - age };
  if (conv === 'conv-site') c.maj = Date.now(); // la conversation « site-vitrine » reste la plus récente
  ecrireEtat();
}

// ---------- pilotage de l'interface ----------
const attendre = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const js = (win, code) => win.webContents.executeJavaScript(code, true);

const CODE_DECOR = `(() => {
  if (document.getElementById('demo-curseur')) return;
  const cu = document.createElement('div'); cu.id = 'demo-curseur';
  Object.assign(cu.style, { position: 'fixed', left: '0', top: '0', width: '26px', height: '26px', marginLeft: '-13px', marginTop: '-13px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.35)', border: '2px solid #fff', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: '99998', opacity: '0', transform: 'translate(640px,360px)' });
  document.body.appendChild(cu);
  const lg = document.createElement('div'); lg.id = 'demo-legende';
  Object.assign(lg.style, { position: 'fixed', left: '50%', transform: 'translateX(-50%)', maxWidth: '86%', padding: '9px 20px', borderRadius: '999px',
    background: 'rgba(20,18,28,0.92)', color: '#fff', font: '600 17px system-ui, "Segoe UI", sans-serif', letterSpacing: '0.2px', border: '1px solid rgba(167,139,250,0.7)',
    boxShadow: '0 6px 24px rgba(0,0,0,0.45)', pointerEvents: 'none', zIndex: '99999', opacity: '0', transition: 'opacity .35s', whiteSpace: 'nowrap' });
  if (document.getElementById('scene')) lg.style.top = '78px'; else Object.assign(lg.style, { top: '16px', right: '24px', left: 'auto', transform: 'none' }); // bureau : au-dessus de la scène ; Gestion : en haut à droite (le bas porte les messages de l'appli)
  document.body.appendChild(lg);
  const st = document.createElement('style'); st.textContent = '.sb-plus[hidden] { display: none !important; }'; document.head.appendChild(st); // bouton « +0 » : l'attribut hidden est écrasé par display:inline-flex
  window.__demoLegende = (t) => { if (!t) { lg.style.opacity = '0'; return; } lg.textContent = t; lg.style.opacity = '1'; };
  window.__demoCurseur = (x, y) => { cu.style.opacity = '1'; cu.animate([{ transform: cu.style.transform || 'translate(640px,360px)' }, { transform: 'translate(' + x + 'px,' + y + 'px)' }], { duration: 650, easing: 'ease-in-out', fill: 'forwards' }); cu.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
  window.__demoClic = () => { cu.animate([{ boxShadow: '0 0 0 0 rgba(167,139,250,0.9)', background: 'rgba(167,139,250,0.7)' }, { boxShadow: '0 0 0 22px rgba(167,139,250,0)', background: 'rgba(255,255,255,0.35)' }], { duration: 450 }); };
})()`;
const legende = (win, t) => js(win, `window.__demoLegende(${JSON.stringify(t)})`);

async function cliquer(win, sel) {
  const r = await js(win, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  if (!r) throw new Error('élément introuvable : ' + sel);
  await js(win, `window.__demoCurseur(${r.x}, ${r.y})`);
  await attendre(760);
  const wc = win.webContents;
  wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
  await attendre(120);
  js(win, 'window.__demoClic()');
  wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
}
async function taper(win, texte, pas = 38) {
  for (const c of texte) { await win.webContents.insertText(c); await attendre(pas + (c === ' ' ? 25 : 0)); }
}

// ---------- capture ----------
let encodeur = null, cible = null, derniereImage = null, dernierEnvoi = 0, nbEnvoyees = 0;
function capter(win) {
  if (cible && !cible.isDestroyed()) { try { cible.webContents.endFrameSubscription(); } catch { /* ignoré */ } }
  cible = win;
  win.webContents.beginFrameSubscription(false, (img) => {
    derniereImage = img;
    const t = Date.now();
    if (t - dernierEnvoi < 1000 / IPS - 3 || !encodeur) return;
    dernierEnvoi = t; nbEnvoyees++;
    encodeur.webContents.send('demo:image', img.toJPEG(90));
  });
}
function dimensionner(win) {
  win.setContentSize(L, H);
  win.center();
  const [cw, ch] = win.getContentSize();
  journal(`fenêtre : contenu ${cw}x${ch}`);
}

async function trouverFenetre(titre, delaiMs = 8000) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle().includes(titre));
    if (w) return w;
    await attendre(200);
  }
  throw new Error('fenêtre introuvable : ' + titre);
}

async function scenario() {
  const principale = await trouverFenetre('Kinan Orchestre');
  dimensionner(principale);
  principale.show(); principale.focus();
  // Rechargement avec l'horloge des easter eggs accélérée (sommeil de Drafion), page propre.
  await new Promise((ok) => { principale.webContents.once('did-finish-load', ok); principale.loadFile(path.join(RACINE, 'src', 'index.html'), { search: 'egg-vitesse=' + VITESSE_SOMMEIL }); });
  ecrireEtat(); // deux conversations, tout le monde au repos
  await attendre(3500);
  await js(principale, CODE_DECOR);
  encodeur = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  const pret = new Promise((ok) => ipcMain.once('demo:pret', (_e, mime) => ok(mime)));
  await encodeur.loadURL('about:blank');
  await encodeur.webContents.executeJavaScript(CODE_ENCODEUR);
  const mime = await pret; journal('encodeur : ' + mime);
  capter(principale);
  await attendre(400);

  const fini = new Promise((ok) => ipcMain.once('demo:fini', (_e, octets, images, dureeMs, m) => ok({ octets: Buffer.from(octets), images, dureeMs, mime: m })));
  encodeur.webContents.send('demo:debut');
  const t0 = Date.now();
  const jusqua = async (s) => { await attendre(t0 + s * 1000 - Date.now()); journal('t=' + ((Date.now() - t0) / 1000).toFixed(1) + ' s'); };
  const A = 'conv-site', B = 'conv-docs';
  let poster = null;

  await legende(principale, 'Kinan Orchestre : vos agents Claude Code, en direct');
  await jusqua(3);
  poser(A, 'kinan', 'travail', 'Répartition des tâches');
  poser(A, 'drafion', 'travail', 'Lecture des fichiers du projet');
  await legende(principale, 'Chaque agent passe du repos au travail');
  await jusqua(7);
  poser(A, 'skyze', 'travail', 'Harmonisation des styles');
  poser(B, 'skyze', 'travail', 'Rédaction de la documentation');
  await jusqua(9.5);
  poser(A, 'johms', 'travail', 'Bug d\'animation au défilement');
  await jusqua(12.5);
  poser(A, 'skyze', 'erreur', 'Lien cassé détecté', 13000); // l'appli remet l'agent au repos 20 s après l'erreur : ici 7 s
  await legende(principale, 'Une erreur s\'affiche, puis l\'agent retourne au repos');
  await jusqua(14);
  poster = derniereImage ? derniereImage.resize({ width: L, height: H, quality: 'best' }).toPNG() : null;
  await jusqua(15);
  poser(A, 'johms', 'repos', '');
  await jusqua(17);
  poser(A, 'kinan', 'repos', '');
  await jusqua(19.8);
  poser(A, 'skyze', 'repos', '');
  poser(A, 'drafion', 'travail', 'Vérification des tests');
  await jusqua(20.5);
  await legende(principale, 'Plusieurs conversations : une pastille chacune');
  await attendre(500);
  await cliquer(principale, `.sb-pastille[data-id="${B}"]`);
  await jusqua(24);
  await cliquer(principale, '.sb-pastille[data-id="toutes"]');
  await jusqua(26.8);
  await cliquer(principale, '.sb-pastille[data-id="recente"]');
  await jusqua(29.5);
  await legende(principale, 'Un bouton pour couper ou rétablir les sons');
  await cliquer(principale, '#btn-son');
  await jusqua(32);
  await cliquer(principale, '#btn-son');
  await jusqua(34);
  await legende(principale, 'Gestion : un bloc-notes 100 % local');
  await cliquer(principale, '#btn-gestion');

  // Fenêtre Gestion, onglet Notes
  const gestion = await trouverFenetre('Gestion');
  dimensionner(gestion);
  await new Promise((ok) => (gestion.webContents.isLoading() ? gestion.webContents.once('did-finish-load', ok) : ok()));
  await attendre(500);
  await js(gestion, CODE_DECOR);
  await legende(gestion, 'Gestion : un bloc-notes 100 % local');
  gestion.show(); gestion.focus();
  capter(gestion);
  await attendre(700);
  await cliquer(gestion, '[data-onglet="notes"]');
  await attendre(900);
  await cliquer(gestion, '#n-nouvelle');
  await attendre(500);
  await taper(gestion, 'Idée : un guide de démarrage rapide.');
  await attendre(700);
  await legende(gestion, 'Import de fichiers texte (.txt, .md)');
  await cliquer(gestion, '#n-importer');
  await attendre(2600);
  await cliquer(gestion, '#n-liste li:nth-child(2) .n-ouvrir');
  await attendre(1500);
  poser(A, 'drafion', 'repos', ''); // Drafion n'a plus rien à faire : l'horloge de son sommeil démarre (ici 200 fois plus vite)
  gestion.close();
  await attendre(300);
  principale.show(); principale.focus();
  capter(principale);
  await legende(principale, 'Drafion s\'endort quand il n\'a plus rien à faire (temps accéléré)');
  await attendre(9500);
  await legende(principale, '');
  await attendre(500);

  encodeur.webContents.send('demo:fin');
  const res = await fini;
  try { principale.webContents.endFrameSubscription(); } catch { /* ignoré */ }
  journal(`capture : ${nbEnvoyees} images envoyées, ${res.images} images encodées, ${res.dureeMs} ms, ${res.octets.length} octets (${res.mime})`);
  const { buf, vus, deja } = ajouterDuree(res.octets, res.dureeMs);
  journal('segment : ' + vus.join(',') + (deja ? ' (durée déjà présente)' : ''));
  fs.writeFileSync(path.join(SORTIE, 'demo.webm'), buf);
  if (poster) fs.writeFileSync(path.join(SORTIE, 'poster.png'), poster);
  journal(`écrit : ${path.join(SORTIE, 'demo.webm')} (${buf.length} octets, ${(res.dureeMs / 1000).toFixed(1)} s)`);
}

app.whenReady().then(async () => {
  try { await scenario(); journal('OK'); } catch (e) { journal('ERREUR : ' + ((e && e.stack) || e)); process.exitCode = 1; }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignoré : dossier temporaire résiduel */ }
  app.exit(process.exitCode || 0);
});
