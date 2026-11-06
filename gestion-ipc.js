// Kinan Orchestre : fenêtre Gestion (tâches, historique, jetons). 0 jeton, 0 réseau.
const { BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const config = require('./config');
const os = require('os');
const path = require('path');

const DOSSIER = config.DOSSIER;
const F_ETAT = path.join(DOSSIER, 'state.json');
const F_TACHES = path.join(DOSSIER, 'taches.json');
const F_HISTO = path.join(DOSSIER, 'historique.jsonl');
const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return defaut; } };

// Verrou par fichier (même protocole que hooks/etat.js : state.lock, création exclusive, verrou périmé repris après 3 s).
const F_VERROU = path.join(DOSSIER, 'state.lock');
// Renommage atomique avec 3 essais espacés de 50 ms (EPERM/EBUSY/EACCES fréquents sous Windows).
function renommerSur(tmp, cible) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(tmp, cible); } catch (e) {
      if (i >= 2 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch { /* ignoré */ } throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

let jetonVerrou = null;
function prendreVerrou() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (let i = 0; i < 80; i++) {
    try {
      const fd = fs.openSync(F_VERROU, 'wx');
      jetonVerrou = process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      try { fs.writeSync(fd, jetonVerrou); } catch { // verrou sans propriétaire : on le retire et on réessaie
        try { fs.closeSync(fd); } catch { /* ignoré */ } try { fs.unlinkSync(F_VERROU); } catch { /* ignoré */ } jetonVerrou = null; pause(25); continue;
      }
      return fd;
    } catch {
      try { // verrou périmé : repris seulement si son contenu n'a pas changé entre-temps
        if (Date.now() - fs.statSync(F_VERROU).mtimeMs > 3000) { const avant = fs.readFileSync(F_VERROU, 'utf8'); if (fs.readFileSync(F_VERROU, 'utf8') === avant) fs.unlinkSync(F_VERROU); }
      } catch { /* repris par un autre */ }
      pause(25);
    }
  }
  return null;
}
function libererVerrou(fd) {
  if (fd === null || fd === undefined) return;
  try { fs.closeSync(fd); } catch { /* ignoré */ }
  try { if (fs.readFileSync(F_VERROU, 'utf8') === jetonVerrou) fs.unlinkSync(F_VERROU); } catch { /* pas le nôtre ou déjà repris */ }
}
const nettoyerTache = (t) => ({
  id: Number(t.id) || 0, titre: String(t.titre || '').slice(0, 300), agent: String(t.agent || '').slice(0, 20),
  statut: ['à faire', 'en cours', 'fait'].includes(t.statut) ? t.statut : 'à faire', cree: String(t.cree || '').slice(0, 10)
});
// fichier : paramètre pour les tests. modifies : ids changés par la page (null = tous).
function ecrireTaches(pageTaches, modifies, fichier = F_TACHES, verrouActif = true) {
  const fd = verrouActif ? prendreVerrou() : null;
  if (verrouActif && fd === null) return false; // verrou non obtenu à temps : on n'écrase jamais sans verrou (la page dit « réessaie »)
  const tmp = fichier + '.' + process.pid + '.' + Date.now() + '.tmp';
  try {
    const actuel = lireJson(fichier, { taches: [] });
    const liste = Array.isArray(actuel.taches) ? actuel.taches.slice() : [];       // relecture juste avant écriture
    const ids = new Set(modifies === null ? pageTaches.map((t) => Number(t.id)) : modifies.map(Number));
    for (const brut of pageTaches.slice(0, 500)) {
      if (!ids.has(Number(brut.id))) continue;                                     // inchangé côté page : on garde la version du fichier
      const t = nettoyerTache(brut);
      const i = liste.findIndex((x) => Number(x.id) === t.id);
      if (i === -1) liste.push(t);
      else if (liste[i].titre === t.titre && liste[i].agent === t.agent) liste[i] = { ...liste[i], ...t };   // même tâche : statut de la page
      else { t.id = liste.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1; liste.push(t); }          // id pris entre-temps par une autre tâche
    }
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ taches: liste.slice(-500) }, null, 2));
    renommerSur(tmp, fichier);
    return true;
  } catch { return false; } finally { try { fs.unlinkSync(tmp); } catch { /* absent : renommé */ } libererVerrou(fd); }
}

function enregistrer() {
  enregistrerJetons();
  ipcMain.handle('gestion:etat', () => lireJson(F_ETAT, { agents: {} }));
  ipcMain.handle('gestion:taches-lire', () => lireJson(F_TACHES, { taches: [] }));
  // Écriture des tâches : verrou partagé avec hooks/etat.js, relecture, fusion par id, écriture atomique.
  ipcMain.handle('gestion:taches-ecrire', (_e, donnees) => {
    if (!donnees || !Array.isArray(donnees.taches)) return false;
    return ecrireTaches(donnees.taches, Array.isArray(donnees.modifies) ? donnees.modifies : null);
  });
  ipcMain.handle('gestion:historique', () => {
    try {
      return fs.readFileSync(F_HISTO, 'utf8').split('\n').filter(Boolean).slice(-2000)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  });
}

// ----- Jetons : lecture des journaux locaux de Claude Code (0 réseau, cache par fichier) -----
const readline = require('readline');
const D_LOGS = path.join(os.homedir(), '.claude', 'projects');
const F_REGLAGES = path.join(DOSSIER, 'reglages.json');
const cacheFichiers = new Map(); // chemin -> { taille, mtime, recs }

function listerJsonl(dir, sortie = []) {
  let entrees = [];
  try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch { return sortie; }
  for (const e of entrees) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listerJsonl(p, sortie);
    else if (e.name.endsWith('.jsonl')) sortie.push(p);
  }
  return sortie;
}

function lireFichier(chemin) {
  return new Promise((resolve) => {
    const recs = new Map();
    let noLigne = 0;
    let flux;
    try { flux = fs.createReadStream(chemin, { encoding: 'utf8' }); } catch { return resolve([]); }
    flux.on('error', () => resolve([...recs.values()]));
    const rl = readline.createInterface({ input: flux, crlfDelay: Infinity });
    rl.on('line', (l) => {
      if (!l.includes('"usage"')) return;
      try {
        const o = JSON.parse(l), m = o.message;
        if (!m || !m.usage || m.role !== 'assistant') return;
        const u = m.usage, t = Date.parse(o.timestamp);
        if (!t) return;
        const avecId = !!(m.id && o.requestId);
        const cle = avecId ? m.id + '|' + o.requestId : 'ligne|' + chemin + '|' + (++noLigne) + '|' + t; // sans id : clé unique par ligne
        recs.set(cle, { k: avecId ? cle : null, t, m: String(m.model || ''), i: u.input_tokens | 0, o: u.output_tokens | 0,
          r: u.cache_read_input_tokens | 0, c: u.cache_creation_input_tokens | 0, side: !!o.isSidechain });
      } catch { /* ligne invalide ignorée */ }
    });
    rl.on('close', () => resolve([...recs.values()]));
    rl.on('error', () => resolve([...recs.values()]));
  });
}

const famille = (m) => (/haiku/i.test(m) ? 'haiku' : /sonnet/i.test(m) ? 'sonnet' : /opus/i.test(m) ? 'opus' : 'autre');
const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vide = () => ({ entree: 0, sortie: 0, cacheLu: 0, cacheCree: 0 });
const ajouter = (a, r) => { a.entree += r.i; a.sortie += r.o; a.cacheLu += r.r; a.cacheCree += r.c; };

// Agent d'un journal : sous-agent = type lu dans le fichier compagnon .meta.json (agentType) ; session principale = Kinan.
// Type « kinan-orchestre:<base> » : premier agent configuré de cette base ; sinon identifiant direct.
function aliasAgent(t) {
  const s = String(t || '').replace(/^kinan-orchestre:/, '');
  if (s === 'kinan') return 'kinan';
  const ag = config.charger().agents;
  const d = ag.find((a) => a.id === s) || ag.find((a) => a.base === s);
  return d ? d.id : null;
}
function agentDuJournal(chemin) {
  if (!/[\\/]subagents[\\/]/.test(chemin)) return 'kinan';
  try {
    const meta = JSON.parse(fs.readFileSync(chemin.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return aliasAgent(meta.agentType) || 'autres';
  } catch { return 'autres'; }
}
// Tarifs de l'API Claude (USD par million de jetons), modifiables dans reglages.json (clé « tarifs », fusion sans écraser le reste).
// Source des valeurs par défaut : skill « claude-api » (tableau des modèles en cache au 2026-10-06) ; cache lu Opus/Sonnet 5.5 : 0,20 $ ;
// écriture de cache = 1,25 x l'entrée (TTL 5 min). Haiku 5.5 : tarif jusqu'à 100 000 jetons de prompt (au-delà : 0,50 / 2,50), lecture de cache déduite (0,1 x) : à confirmer.
const TARIFS_DEFAUT = {
  maj: '2026-10-06', usdEur: 0.92,
  modeles: {
    haiku: { entree: 0.10, sortie: 0.50, cacheEcriture: 0.125, cacheLecture: 0.01, aConfirmer: true },
    sonnet: { entree: 2, sortie: 10, cacheEcriture: 2.5, cacheLecture: 0.20, aConfirmer: false },
    opus: { entree: 4, sortie: 20, cacheEcriture: 5, cacheLecture: 0.20, aConfirmer: false }
  }
};
function lireTarifs() {
  const t = lireJson(F_REGLAGES, {}).tarifs || {};
  const res = { maj: typeof t.maj === 'string' ? t.maj : TARIFS_DEFAUT.maj, usdEur: Number(t.usdEur) > 0 ? Number(t.usdEur) : TARIFS_DEFAUT.usdEur, modeles: {} };
  for (const [f, d] of Object.entries(TARIFS_DEFAUT.modeles)) {
    const u = (t.modeles && t.modeles[f]) || {};
    res.modeles[f] = { ...d };
    for (const k of ['entree', 'sortie', 'cacheEcriture', 'cacheLecture']) if (Number.isFinite(Number(u[k])) && Number(u[k]) >= 0 && u[k] !== '' && u[k] !== null) res.modeles[f][k] = Number(u[k]);
    if (typeof u.aConfirmer === 'boolean') res.modeles[f].aConfirmer = u.aConfirmer;
  }
  return res;
}
// Coût estimé en euros : jetons par type et par modèle x tarif. Un modèle inconnu (« autre ») est compté au tarif Sonnet.
function coutEuros(modeles, tarifs) {
  let usd = 0;
  for (const [f, m] of Object.entries(modeles)) {
    const p = tarifs.modeles[f] || tarifs.modeles.sonnet;
    usd += (m.entree * p.entree + m.sortie * p.sortie + m.cacheCree * p.cacheEcriture + m.cacheLu * p.cacheLecture) / 1e6;
  }
  return usd * tarifs.usdEur;
}
async function calculerJetons() {
  const fichiers = listerJsonl(D_LOGS);
  const stats = [];
  for (const f of fichiers) {
    try { const s = fs.statSync(f); stats.push({ f, taille: s.size, mtime: s.mtimeMs }); } catch { /* ignoré */ }
  }
  for (const k of cacheFichiers.keys()) if (!stats.some((s) => s.f === k)) cacheFichiers.delete(k);
  for (const s of stats) {
    const c = cacheFichiers.get(s.f);
    if (c && c.taille === s.taille && c.mtime === s.mtime) continue;
    cacheFichiers.set(s.f, { taille: s.taille, mtime: s.mtime, recs: await lireFichier(s.f) });
  }
  // Dédoublonnage global par fichier : un même message peut figurer dans plusieurs journaux.
  const maintenant = new Date();
  // « Aujourd'hui » = journée de travail : démarre à l'heure réglée (reglages.json, clé debutJournee, 5 h par défaut), pas à minuit.
  // Avant cette heure, on reste sur la journée de la veille (à 1 h du matin, c'est encore « hier soir »).
  const hDebut = (() => { const h = Number(lireJson(F_REGLAGES, {}).debutJournee); return Number.isFinite(h) && h >= 0 && h < 24 ? h : 5; })();
  let debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate(), hDebut).getTime();
  if (maintenant.getTime() < debutJour) debutJour -= 86400000;
  const lundi = new Date(debutJour); lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const debutSemaine = lundi.getTime();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).getTime();
  const tarifs = lireTarifs();
  const periode = () => ({ total: vide(), modeles: {} });
  const jour = periode(), semaine = periode(), mois = periode();
  const vus = new Set();
  for (const [, c] of cacheFichiers) {
    for (const r of c.recs) {
      const cle = r.k || (r.t + '|' + r.m + '|' + r.i + '|' + r.o + '|' + r.r + '|' + r.c);
      if (vus.has(cle)) continue; vus.add(cle);
      const cible = (z) => { ajouter(z.total, r); const f = famille(r.m); ajouter(z.modeles[f] = z.modeles[f] || vide(), r); };
      if (r.t >= debutMois) cible(mois);
      if (r.t >= debutSemaine) cible(semaine);
      if (r.t >= debutJour) cible(jour);
    }
  }
  for (const z of [jour, semaine, mois]) z.euros = coutEuros(z.modeles, tarifs);
  // Session la plus récente : fichier principal modifié en dernier, dernier message hors sous-agent.
  let contexte = null;
  const recents = stats.filter((s) => !/[\\/]subagents[\\/]/.test(s.f)).sort((a, b) => b.mtime - a.mtime);
  for (const s of recents) {
    const recs = (cacheFichiers.get(s.f) || { recs: [] }).recs.filter((r) => !r.side);
    if (!recs.length) continue;
    const dernier = recs.reduce((a, b) => (b.t >= a.t ? b : a));
    contexte = { tokens: dernier.i + dernier.c + dernier.r, modele: dernier.m, fichier: path.basename(s.f), t: dernier.t };
    break;
  }
  const reg = lireJson(F_REGLAGES, {});
  return { contexte, contexteMax: Number(reg.contexteMax) > 0 ? Number(reg.contexteMax) : 1000000,
    jour, semaine, mois, tarifs, nbFichiers: stats.length };
}

function enregistrerJetons() {
  ipcMain.handle('gestion:jetons', async () => { try { return await calculerJetons(); } catch { return null; } });
  ipcMain.handle('gestion:tarifs-regler', (_e, t) => {
    try {
      const nombre = (v) => { const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) && x >= 0 && x < 100000 ? x : null; };
      const usdEur = nombre(t && t.usdEur);
      if (!usdEur) return false;
      const modeles = {};
      for (const f of Object.keys(TARIFS_DEFAUT.modeles)) {
        const u = (t.modeles && t.modeles[f]) || {};
        const m = {};
        for (const k of ['entree', 'sortie', 'cacheEcriture', 'cacheLecture']) { const v = nombre(u[k]); if (v === null) return false; m[k] = v; }
        m.aConfirmer = false; // saisi dans Gestion : plus « à confirmer »
        modeles[f] = m;
      }
      const reg = lireJson(F_REGLAGES, {}); // fusion : les autres clés du fichier restent intactes
      reg.tarifs = { maj: new Date().toISOString().slice(0, 10), usdEur, modeles };
      fs.mkdirSync(DOSSIER, { recursive: true });
      fs.writeFileSync(F_REGLAGES, JSON.stringify(reg, null, 2)); return true;
    } catch { return false; }
  });
  ipcMain.handle('gestion:tarifs-defaut', () => { try { const reg = lireJson(F_REGLAGES, {}); delete reg.tarifs; fs.writeFileSync(F_REGLAGES, JSON.stringify(reg, null, 2)); return true; } catch { return false; } });
  ipcMain.handle('gestion:reglage-contexte', (_e, n) => {
    n = Math.round(Number(n));
    if (!(n >= 1000 && n <= 10000000)) return false;
    try {
      const reg = lireJson(F_REGLAGES, {}); reg.contexteMax = n;
      fs.mkdirSync(DOSSIER, { recursive: true });
      fs.writeFileSync(F_REGLAGES, JSON.stringify(reg, null, 2)); return true;
    } catch { return false; }
  });
}

let fenetre = null;
function ouvrirGestion(onglet) {
  const ok = ['taches', 'histo', 'jetons'].includes(onglet) ? onglet : null; // onglet validé côté main
  if (fenetre && !fenetre.isDestroyed()) {
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
    if (ok) fenetre.webContents.send('gestion:onglet', ok);
    return;
  }
  fenetre = new BrowserWindow({
    width: 1000, height: 720, minWidth: 700, minHeight: 500,
    backgroundColor: '#14121c', title: 'Kinan Orchestre : Gestion',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  fenetre.loadFile(path.join(__dirname, 'src', 'gestion.html'), ok ? { query: { onglet: ok } } : undefined);
  fenetre.on('closed', () => { fenetre = null; });
}

module.exports = { enregistrer, ouvrirGestion, ecrireTaches, agentDuJournal, calculerJetons, coutEuros, lireTarifs };
