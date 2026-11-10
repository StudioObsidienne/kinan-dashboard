// Enregistre la vidéo de démonstration du tableau de bord : assets/demo/demo.webm (+ poster.png).
// Usage (depuis le dossier de l'appli) : node_modules/.bin/electron outils/enregistrer-demo.js
// Outil de développement : jamais chargé par l'appli. Aucun réseau, aucune IA, aucune donnée personnelle :
//  - dossier d'état, profil Electron et « maison » (~/.claude) TEMPORAIRES, supprimés à la fin (jamais ~/.kinan-os ni ~/.claude réels) ;
//  - état des agents et des conversations simulé par des fichiers écrits dans ce dossier temporaire (scénario ci-dessous) ;
//  - sons de l'appli coupés (--mute-audio ; la bande son de la vidéo est synthétisée à part, dans la page d'encodage), raccourci Bureau neutralisé, aucune vérification réseau (cache de versions récent, voir ci-dessous), boîte « Importer » remplacée par deux faux fichiers texte.
// Capture : webContents.beginFrameSubscription (image par image, 30 i/s max) -> fenêtre cachée -> canvas -> MediaRecorder (VP9 + Opus, WebM).
// Bande son : Web Audio (AudioContext -> MediaStreamDestination ajouté au flux du MediaRecorder) : effets synthétisés calés sur le scénario,
// pas de fond musical (effets seulement). Vidéo courte (~28 s) : légendes courtes, zooms animés (CSS sur le body), curseur simulé.
// Carton de fin : dessiné dans le canvas de la page d'encodage (fondu depuis la dernière scène) ; versions lues dans package.json et ../kinan-plugin.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(RACINE, 'assets', 'demo');
const L = 1280, H = 720, IPS = 30, DEBIT = 1500000, DEBIT_AUDIO = 64000;
const DUREE_CARTON_S = 3.6, GAIN_GLOBAL = 0.62;
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
const lireVersion = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).version || defaut; } catch { return defaut; } };
const VERSION_PLUGIN = lireVersion(path.join(RACINE, '..', 'kinan-plugin', '.claude-plugin', 'plugin.json'), '0.3.0');
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
const fsr = require('fs');
const cv = document.createElement('canvas'); cv.width = ${L}; cv.height = ${H};
const cx = cv.getContext('2d', { alpha: false });
const flux = cv.captureStream(0), piste = flux.getVideoTracks()[0];

// ----- bande son : Web Audio -> flux du MediaRecorder (indépendant de --mute-audio) -----
const ctx = new AudioContext({ latencyHint: 'playback' });
const dest = ctx.createMediaStreamDestination();
flux.addTrack(dest.stream.getAudioTracks()[0]);
const master = ctx.createGain(); master.gain.value = ${GAIN_GLOBAL};
const lim = ctx.createDynamicsCompressor();
lim.threshold.value = -12; lim.knee.value = 6; lim.ratio.value = 14; lim.attack.value = 0.003; lim.release.value = 0.2;
master.connect(lim); lim.connect(dest);
const bus = ctx.createGain(); bus.connect(master);        // effets
const bufBruit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
{ const d = bufBruit.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
const filtreBuzz = ctx.createBiquadFilter(); filtreBuzz.type = 'lowpass'; filtreBuzz.frequency.value = 650; filtreBuzz.connect(bus);

function tonalite(type, f0, f1, t, a, d, pic, sortie) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pic, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  o.connect(g); g.connect(sortie || bus); o.start(t); o.stop(t + a + d + 0.05);
}
function bruit(t, dur, type, f0, f1, q, pic, a) {
  const s = ctx.createBufferSource(); s.buffer = bufBruit; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pic, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
let dernierPop = -1, bufRonflement = null;
const SONS = {
  clic: (t) => { tonalite('sine', 950, 520, t, 0.003, 0.07, 0.34); bruit(t, 0.035, 'bandpass', 3200, 0, 1, 0.07, 0.002); },
  pop: (t, f) => { t = Math.max(t, dernierPop + 0.07); dernierPop = t; tonalite('sine', f * 1.45, f, t, 0.004, 0.11, 0.4); },
  ding: (t) => { tonalite('sine', 1318.5, 0, t, 0.004, 0.9, 0.22); tonalite('sine', 1975.5, 0, t + 0.01, 0.004, 0.65, 0.1); tonalite('sine', 2637, 0, t + 0.02, 0.004, 0.4, 0.04); },
  buzz: (t) => { tonalite('sawtooth', 112, 88, t, 0.012, 0.3, 0.2, filtreBuzz); tonalite('sawtooth', 118, 92, t, 0.012, 0.3, 0.2, filtreBuzz); },
  touche: (t) => { bruit(t, 0.02, 'highpass', 3500 + Math.random() * 1500, 0, 0.7, 0.13, 0.001); tonalite('sine', 170 + Math.random() * 40, 95, t, 0.002, 0.035, 0.1); },
  impact: (t) => { tonalite('sine', 110, 38, t, 0.003, 0.55, 0.5); bruit(t, 0.3, 'lowpass', 900, 150, 0.7, 0.18, 0.003); },
  whoosh: (t) => { bruit(t, 0.6, 'bandpass', 350, 2800, 0.9, 0.2, 0.2); },
  ronfler: (t) => {
    const b = bufRonflement; if (!b) return;
    const s = ctx.createBufferSource(); s.buffer = b;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1400;
    const g = ctx.createGain(); const dur = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14, t + 1); g.gain.setValueAtTime(0.14, t + dur - 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.max(0, Math.min(1.5, b.duration - dur - 0.1))); s.stop(t + dur + 0.05);
  }
};
ipcRenderer.on('demo:son', (_e, nom, arg, delai) => { if (SONS[nom]) SONS[nom](ctx.currentTime + 0.02 + (delai || 0), arg); });

// ----- carton de fin : fondu depuis la dernière scène -----
let carton = null; // { debut, lignes, duree }
const borne = (x) => Math.max(0, Math.min(1, x));
function dessinerCarton() {
  const ms = performance.now() - carton.debut, e = borne(ms / 900), f = e * e * (3 - 2 * e);
  cx.globalAlpha = f;
  const g = cx.createRadialGradient(${L / 2}, ${H / 2 - 30}, 40, ${L / 2}, ${H / 2}, ${L * 0.62}); g.addColorStop(0, '#211d2f'); g.addColorStop(1, '#14121c');
  cx.fillStyle = g; cx.fillRect(0, 0, ${L}, ${H});
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  const police = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
  const ligne = (txt, y, taille, poids, couleur, retard) => {
    const p = borne((ms - retard) / 600);
    cx.globalAlpha = p; cx.font = poids + ' ' + taille + 'px ' + police; cx.fillStyle = couleur; cx.fillText(txt, ${L / 2}, y + (1 - p) * 10);
  };
  cx.globalAlpha = borne((ms - 250) / 500);
  ['#8f88a8', '#5fd3a0', '#ffd166', '#ff6b6b'].forEach((c, i) => { cx.fillStyle = c; cx.beginPath(); cx.arc(${L / 2} - 33 + i * 22, 200, 6, 0, 6.2832); cx.fill(); });
  ligne(carton.lignes[0], 285, 72, 700, '#ece8f5', 300);
  ligne(carton.lignes[1], 352, 30, 600, '#a78bfa', 700);
  cx.globalAlpha = borne((ms - 1000) / 500); cx.fillStyle = '#2c2740'; cx.fillRect(${L / 2} - 60, 396, 120, 2);
  ligne(carton.lignes[2], 444, 24, 500, '#ece8f5', 1100);
  ligne(carton.lignes[3], 484, 22, 400, '#a29bba', 1400);
  { const p = borne((ms - 1700) / 500); cx.globalAlpha = p; cx.fillStyle = '#a78bfa'; const w = 330, h = 58, x = ${L / 2} - w / 2, y = 530 + (1 - p) * 8; cx.beginPath(); cx.roundRect(x, y, w, h, 29); cx.fill(); cx.font = '700 26px ' + police; cx.fillStyle = '#14121c'; cx.fillText(carton.lignes[4], ${L / 2}, y + h / 2 + 1); }
  cx.globalAlpha = 1;
}

const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
const rec = new MediaRecorder(flux, { mimeType: mime, videoBitsPerSecond: ${DEBIT}, audioBitsPerSecond: ${DEBIT_AUDIO} });
const morceaux = [];
rec.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
let derniere = null, images = 0, t0 = 0, t1 = 0, minuterie = null;
ipcRenderer.on('demo:image', async (_e, jpeg) => { try { derniere = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' })); } catch (e) { /* image ignorée */ } });
ipcRenderer.on('demo:debut', async () => {
  await ctx.resume();
  rec.start(1000); t0 = performance.now();
  minuterie = setInterval(() => {
    if (!derniere) return;
    cx.globalAlpha = 1; cx.drawImage(derniere, 0, 0, ${L}, ${H});
    if (carton) dessinerCarton();
    piste.requestFrame(); images++; t1 = performance.now();
  }, ${Math.round(1000 / IPS)});
});
ipcRenderer.on('demo:carton', (_e, lignes, duree) => {
  carton = { debut: performance.now(), lignes, duree };
  const t = ctx.currentTime, g = master.gain.value;
  master.gain.setValueAtTime(g, t + duree - 1.6); master.gain.linearRampToValueAtTime(0.0001, t + duree); // fondu de sortie de 1,6 s
});
ipcRenderer.on('demo:fin', () => {
  clearInterval(minuterie);
  rec.onstop = async () => {
    const b = new Blob(morceaux, { type: mime });
    ipcRenderer.send('demo:fini', new Uint8Array(await b.arrayBuffer()), images, Math.round(t1 - t0), mime);
    ctx.close();
  };
  rec.stop();
});
(async () => {
  try { const fb = fsr.readFileSync(${JSON.stringify(path.join(RACINE, 'assets', 'sons', 'ronflement.mp3'))}); bufRonflement = await ctx.decodeAudioData(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.length)); } catch (e) { bufRonflement = null; }
  ipcRenderer.send('demo:pret', mime + ' | audio ' + ctx.state + ' | ronflement ' + (bufRonflement ? bufRonflement.duration.toFixed(1) + ' s' : 'absent'));
})();
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
  // L'appli relit l'état chaque seconde : le son suit le changement visible avec ~0,5 s de retard.
  if (etat === 'erreur') son('buzz', null, 0.5);
  else son('pop', etat === 'travail' ? 660 : 400, 0.5);
}

// ---------- pilotage de l'interface ----------
const attendre = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
let encodeur = null;
const son = (nom, arg, delai) => { if (encodeur && !encodeur.isDestroyed()) encodeur.webContents.send('demo:son', nom, arg === undefined ? null : arg, delai || 0); };
const js = (win, code) => win.webContents.executeJavaScript(code, true);

const CODE_DECOR = `(() => {
  if (document.getElementById('demo-curseur')) return;
  const racine = document.documentElement; // curseur et légende hors du body : le zoom du body ne les touche pas
  racine.style.overflow = 'hidden';
  const cu = document.createElement('div'); cu.id = 'demo-curseur';
  Object.assign(cu.style, { position: 'fixed', left: '0', top: '0', width: '30px', height: '30px', marginLeft: '-15px', marginTop: '-15px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.4)', border: '3px solid #fff', boxShadow: '0 3px 14px rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: '99998', opacity: '0', transform: 'translate(640px,360px)' });
  racine.appendChild(cu);
  const lg = document.createElement('div'); lg.id = 'demo-legende';
  Object.assign(lg.style, { position: 'fixed', left: '50%', transform: 'translateX(-50%)', maxWidth: '94%', padding: '10px 28px', borderRadius: '999px',
    background: 'rgba(20,18,28,0.94)', color: '#fff', font: '700 30px system-ui, "Segoe UI", sans-serif', letterSpacing: '0.2px', border: '2px solid rgba(167,139,250,0.85)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: '99999', opacity: '0', whiteSpace: 'nowrap', top: document.getElementById('scene') ? '66px' : '588px' });
  racine.appendChild(lg);
  const st = document.createElement('style'); st.textContent = '.sb-plus[hidden] { display: none !important; } body { transition: transform 0.7s cubic-bezier(.45,0,.2,1); }'; document.head.appendChild(st); // bouton « +0 » : l'attribut hidden est écrasé par display:inline-flex
  window.__demoLegende = (t) => {
    if (!t) { lg.style.opacity = '0'; return; }
    lg.textContent = t; lg.style.opacity = '1';
    lg.animate([{ opacity: 0, transform: 'translateX(-50%) translateY(18px) scale(0.9)' }, { opacity: 1, transform: 'translateX(-50%) translateY(0) scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  };
  window.__demoZoom = (s, x, y) => { document.body.style.transformOrigin = x + 'px ' + y + 'px'; document.body.style.transform = s === 1 ? 'none' : 'scale(' + s + ')'; };
  window.__demoCurseur = (x, y) => { cu.style.opacity = '1'; cu.animate([{ transform: cu.style.transform || 'translate(640px,360px)' }, { transform: 'translate(' + x + 'px,' + y + 'px)' }], { duration: 420, easing: 'ease-in-out', fill: 'forwards' }); cu.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
  window.__demoClic = () => { cu.animate([{ boxShadow: '0 0 0 0 rgba(167,139,250,0.9)', background: 'rgba(167,139,250,0.7)' }, { boxShadow: '0 0 0 26px rgba(167,139,250,0)', background: 'rgba(255,255,255,0.4)' }], { duration: 400 }); };
})()`;
const zoom = (win, s, x, y) => js(win, `window.__demoZoom(${s}, ${x}, ${y})`);
const legende = (win, t) => { if (t) son('whoosh'); return js(win, `window.__demoLegende(${JSON.stringify(t)})`); };

async function cliquer(win, sel) {
  await js(win, "new Promise((ok) => { const a = document.getAnimations().filter((x) => x.effect && x.effect.getComputedTiming().iterations !== Infinity); Promise.all(a.map((x) => x.finished.catch(() => 0))).then(ok); setTimeout(ok, 900); })"); // attend la fin d'un zoom en cours (animations finies seulement)
  const r = await js(win, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  if (!r) throw new Error('élément introuvable : ' + sel);
  await js(win, `window.__demoCurseur(${r.x}, ${r.y})`);
  await attendre(470);
  const wc = win.webContents;
  wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
  await attendre(60);
  js(win, 'window.__demoClic()');
  son('clic');
  wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
}
async function taper(win, texte, pas = 30) {
  for (const c of texte) { await win.webContents.insertText(c); if (c !== ' ') son('touche'); await attendre(pas + (c === ' ' ? 25 : 0)); }
}

// ---------- capture ----------
let cible = null, derniereImage = null, dernierEnvoi = 0, nbEnvoyees = 0;
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
  encodeur = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
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
  const ctrl = process.env.KINAN_DEMO_CTRL;
  const photo = (nom) => { if (ctrl && derniereImage) { try { fs.writeFileSync(path.join(ctrl, nom + '.png'), derniereImage.toPNG()); } catch { /* ignoré */ } } };
  const sc = await js(principale, "(() => { const b = document.getElementById('scene').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()");
  const pa = await js(principale, "(() => { const b = document.querySelector('.sb-pastille').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()");

  // 1) accroche (0 à 4 s)
  await legende(principale, 'Chaque tâche au bon agent.'); son('impact');
  poser(A, 'kinan', 'travail', 'Répartition des tâches');
  poser(A, 'drafion', 'travail', 'Lecture des fichiers du projet');
  await zoom(principale, 1.22, sc.x, sc.y);
  await jusqua(1.1);
  poser(A, 'skyze', 'travail', 'Harmonisation des styles');
  poser(B, 'skyze', 'travail', 'Rédaction de la documentation');
  await jusqua(2.3);
  poser(A, 'johms', 'travail', 'Bug d\'animation au défilement');
  await jusqua(3.9); photo('c1-accroche');
  // 2) le juge (4 à 7,5 s)
  await zoom(principale, 1.4, sc.x - 120, sc.y - 60);
  await legende(principale, 'Un juge vérifie le résultat.');
  poser(A, 'kinan', 'travail', 'Vérification du résultat');
  await jusqua(5);
  poser(A, 'johms', 'repos', '');
  await jusqua(6);
  poser(A, 'drafion', 'repos', '');
  await jusqua(7.3); photo('c2-juge');
  // 3) erreur rattrapée (7,5 à 11 s)
  await zoom(principale, 1.25, sc.x, sc.y);
  await legende(principale, 'Une erreur ? Il la rattrape.');
  poser(A, 'skyze', 'erreur', 'Lien cassé détecté', 17000); // retombe au repos ~3 s plus tard (accéléré)
  await jusqua(9); photo('c3-erreur');
  await jusqua(10.6);
  son('pop', 400); poser(A, 'kinan', 'repos', '');
  await jusqua(11);
  // 4) plusieurs conversations (11 à 17 s)
  await zoom(principale, 1, sc.x, sc.y);
  await legende(principale, 'Plusieurs conversations, un seul bureau.');
  poser(A, 'drafion', 'travail', 'Vérification des tests');
  await jusqua(12);
  poster = derniereImage ? derniereImage.resize({ width: L, height: H, quality: 'best' }).toPNG() : null;
  photo('c4-pastilles');
  await zoom(principale, 1.5, pa.x + 60, pa.y);
  await attendre(500);
  await cliquer(principale, `.sb-pastille[data-id="${B}"]`);
  await jusqua(14.3);
  await cliquer(principale, '.sb-pastille[data-id="toutes"]');
  await jusqua(15.8);
  await cliquer(principale, '.sb-pastille[data-id="recente"]');
  await jusqua(17);
  // 5) notes (17 à ~24 s)
  await zoom(principale, 1, sc.x, sc.y);
  await legende(principale, 'Vos idées au même endroit.');
  await cliquer(principale, '#btn-gestion');
  const gestion = await trouverFenetre('Gestion');
  dimensionner(gestion);
  await new Promise((ok) => (gestion.webContents.isLoading() ? gestion.webContents.once('did-finish-load', ok) : ok()));
  await js(gestion, CODE_DECOR);
  await legende(gestion, 'Vos idées au même endroit.');
  gestion.show(); gestion.focus();
  capter(gestion);
  await attendre(250);
  await cliquer(gestion, '[data-onglet="notes"]');
  await attendre(350);
  await cliquer(gestion, '#n-nouvelle');
  await attendre(250);
  await taper(gestion, 'Idée : un guide de démarrage.');
  await attendre(300);
  await cliquer(gestion, '#n-importer');
  await attendre(1500); photo('c5-notes');
  await cliquer(gestion, '#n-liste li:nth-child(2) .n-ouvrir');
  await attendre(900);
  gestion.close();
  principale.show(); principale.focus();
  capter(principale);
  await js(principale, "window.__demoLegende('')");

  // Carton de fin : fondu depuis la dernière scène, fondu sonore sur les 2 dernières secondes.
  const lignes = ['Kinan Orchestre', 'Open source (Apache-2.0) · local par défaut', `Dashboard ${VERSION_APPLI} · Plugin ${VERSION_PLUGIN}`, 'github.com/StudioObsidienne', 'À essayer maintenant'];
  journal('carton : ' + lignes.join(' | '));
  encodeur.webContents.send('demo:carton', lignes, DUREE_CARTON_S);
  son('whoosh'); son('impact', null, 0.4);
  await attendre(DUREE_CARTON_S * 1000 - 400); photo('c6-carton');
  await attendre(400);

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
