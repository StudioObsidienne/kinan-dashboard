// Kinan Orchestre : version de l'appli et du plugin, vérification des mises à jour, mise à jour sûre par git. 0 jeton.
// Réseau : une seule origine, raw.githubusercontent.com (lecture d'un package.json / plugin.json publics), au démarrage si le cache
// a plus de 6 h, puis toutes les 6 h. Échec réseau = silence (on garde le cache). Cache : <dossier d'état>/mise-a-jour.json.
// Mise à jour : seulement si l'appli est la racine d'un dépôt git propre (aucune modification locale) avec une branche suivie ;
// toujours après confirmation ; uniquement « git pull --ff-only » (jamais de force, jamais de reset).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const HOTE = 'raw.githubusercontent.com';
const SOURCES = {
  appli: ['/StudioObsidienne/kinan-dashboard/main/package.json'],
  plugin: ['/StudioObsidienne/kinan-orchestre/main/.claude-plugin/plugin.json', '/StudioObsidienne/kinan-orchestre/main/package.json']
};
const PERIODE = 6 * 3600 * 1000;
const MAX_OCTETS = 64 * 1024;

const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const versionValide = (v) => (typeof v === 'string' && /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:[-+][0-9A-Za-z.-]{1,40})?$/.test(v) ? v : null);
// > 0 si a est plus récente que b. Une préversion (1.2.0-beta) est plus ancienne que la version finale (1.2.0).
function comparer(a, b) {
  const p = (s) => s.split(/[-+]/)[0].split('.').map(Number);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  const pa = /-/.test(a.split('+')[0]), pb = /-/.test(b.split('+')[0]);
  return pa === pb ? 0 : pa ? -1 : 1;
}

function telecharger(chemin) {
  return new Promise((fin) => {
    let fini = false; const rendre = (v) => { if (!fini) { fini = true; fin(v); } };
    try {
      const req = https.get({ hostname: HOTE, path: chemin, timeout: 8000, headers: { 'User-Agent': 'kinan-orchestre-maj' } }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return rendre(null); } // pas de redirection suivie
        let n = 0, txt = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { n += c.length; if (n > MAX_OCTETS) { req.destroy(); rendre(null); } else txt += c; });
        res.on('end', () => rendre(txt));
        res.on('error', () => rendre(null));
      });
      req.on('timeout', () => { req.destroy(); rendre(null); });
      req.on('error', () => rendre(null));
    } catch { rendre(null); }
  });
}
async function versionDistante(chemins) {
  for (const c of chemins) {
    const t = await telecharger(c);
    if (!t) continue;
    try { const v = versionValide(JSON.parse(t).version); if (v) return v; } catch { /* JSON illisible */ }
  }
  return null;
}

// Version locale du plugin : dossiers indiqués (plugin.json), puis plugin installé dans Claude Code (installed_plugins.json).
function versionPluginLocale(dossiers = []) {
  for (const d of dossiers) { const j = lireJson(path.join(d, '.claude-plugin', 'plugin.json')); if (j && versionValide(j.version)) return j.version; }
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const inst = lireJson(path.join(base, 'plugins', 'installed_plugins.json'));
  const liste = inst && typeof inst === 'object' ? (inst.plugins && typeof inst.plugins === 'object' ? inst.plugins : inst) : {};
  for (const [cle, val] of Object.entries(liste)) {
    if (!/^kinan-orchestre(@|$)/.test(cle)) continue;
    for (const e of Array.isArray(val) ? val : [val]) {
      if (!e || typeof e !== 'object') continue;
      if (typeof e.installPath === 'string') { const j = lireJson(path.join(e.installPath, '.claude-plugin', 'plugin.json')); if (j && versionValide(j.version)) return j.version; }
      if (versionValide(e.version)) return e.version;
    }
  }
  return null;
}

function git(dir, args, ms = 20000) {
  return new Promise((fin) => {
    try {
      execFile('git', args, { cwd: dir, timeout: ms, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
        (err, out, errTxt) => fin({ ok: !err, out: String(out || '').trim(), err: String(errTxt || (err && err.message) || '').trim() }));
    } catch (e) { fin({ ok: false, out: '', err: String(e && e.message) }); }
  });
}
// La mise à jour automatique est-elle sûre ? Racine d'un dépôt git, branche suivie, aucune modification locale (même non suivie).
async function etatGit(dir) {
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { possible: false, raison: "le dossier de l'appli n'est pas un dépôt git (ou git est introuvable)" };
  const norme = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
  if (norme(top.out) !== norme(dir)) return { possible: false, raison: "le dossier de l'appli n'est pas la racine d'un dépôt git" };
  const suivie = await git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!suivie.ok) return { possible: false, raison: "la branche locale ne suit aucune branche distante" };
  const st = await git(dir, ['status', '--porcelain']);
  if (!st.ok) return { possible: false, raison: 'état du dépôt illisible' };
  if (st.out) return { possible: false, raison: 'modifications locales présentes : mise à jour refusée, rien ne sera écrasé' };
  return { possible: true, branche: suivie.out };
}
async function mettreAJour(dir) {
  const e = await etatGit(dir);
  if (!e.possible) return { ok: false, message: 'Refusé : ' + e.raison + '.' };
  const avant = (await git(dir, ['rev-parse', 'HEAD'])).out;
  const p = await git(dir, ['pull', '--ff-only'], 120000);
  if (!p.ok) return { ok: false, message: 'git pull --ff-only a échoué : ' + p.err.split(/\r?\n/).slice(-2).join(' ').slice(0, 300) };
  const apres = (await git(dir, ['rev-parse', 'HEAD'])).out;
  if (!avant || avant === apres) return { ok: true, rien: true, message: 'Déjà à jour : rien à récupérer.' };
  const diff = await git(dir, ['diff', '--name-only', avant, apres]);
  const npm = /(^|\n)package(-lock)?\.json$/m.test(diff.out);
  return { ok: true, npm, message: 'Mise à jour récupérée.' + (npm ? ' Les dépendances ont changé : lance « npm install » dans le dossier, puis relance.' : ' Relance l\'appli pour l\'utiliser.') };
}

// Branche le module : IPC « maj:lire », « maj:appliquer », événement « maj:maj ». active=false : aucune requête, aucun git.
function demarrer({ ipcMain, BrowserWindow, dialog, app, Notification, dossierEtat, dossierAppli, active = true, dossiersPlugin = [] }) {
  const FICHIER = path.join(dossierEtat, 'mise-a-jour.json');
  const versionAppli = versionValide((lireJson(path.join(dossierAppli, 'package.json')) || {}).version) || '0.0.0';
  const etat = {
    active, verifie: null,
    appli: { locale: versionAppli, distante: null, nouvelle: false },
    plugin: { locale: versionPluginLocale(dossiersPlugin), distante: null, nouvelle: false },
    git: { possible: false, raison: active ? 'vérification en cours' : 'vérification désactivée' }
  };
  let cache = lireJson(FICHIER) || {};
  const diffuser = () => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('maj:maj', etat); };
  const appliquerCache = () => {
    etat.verifie = Number.isFinite(cache.verifie) ? cache.verifie : null;
    for (const k of ['appli', 'plugin']) {
      const d = versionValide(cache[k]);
      etat[k].distante = d;
      etat[k].nouvelle = !!(d && etat[k].locale && comparer(d, etat[k].locale) > 0);
    }
  };
  const notifier = () => {
    try {
      cache.notifie = cache.notifie || {};
      const nouv = ['appli', 'plugin'].filter((k) => etat[k].nouvelle && cache.notifie[k] !== etat[k].distante);
      if (!nouv.length) return;
      for (const k of nouv) cache.notifie[k] = etat[k].distante;
      if (Notification && Notification.isSupported()) {
        new Notification({ title: 'Kinan Orchestre : mise à jour disponible',
          body: nouv.map((k) => `${k === 'appli' ? 'Appli' : 'Plugin'} v${etat[k].locale} → v${etat[k].distante}`).join('\n') }).show();
      }
    } catch { /* silencieux */ }
  };
  const ecrireCache = () => {
    try { fs.mkdirSync(dossierEtat, { recursive: true }); const tmp = FICHIER + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache, null, 2)); fs.renameSync(tmp, FICHIER); } catch { /* silencieux */ }
  };
  let enCours = false;
  async function verifier() {
    if (!active || enCours) return;
    enCours = true;
    try {
      const [a, p] = await Promise.all([versionDistante(SOURCES.appli), versionDistante(SOURCES.plugin)]);
      if (a || p) { // échec réseau complet : silence, le cache est conservé
        cache = { ...cache, verifie: Date.now(), appli: a || cache.appli || null, plugin: p || cache.plugin || null };
        appliquerCache(); notifier(); ecrireCache(); diffuser();
      }
    } catch { /* silencieux */ } finally { enCours = false; }
  }
  const majGit = async () => { try { etat.git = await etatGit(dossierAppli); } catch { etat.git = { possible: false, raison: 'git indisponible' }; } diffuser(); };

  ipcMain.handle('maj:lire', () => etat);
  ipcMain.handle('maj:appliquer', async (e) => {
    if (!active) return { ok: false, message: 'Vérification des mises à jour désactivée.' };
    await majGit();
    if (!etat.git.possible) return { ok: false, message: 'Mise à jour automatique impossible : ' + etat.git.raison + '.' };
    const fen = BrowserWindow.fromWebContents(e.sender);
    const c = await dialog.showMessageBox(fen, { type: 'question', buttons: ['Mettre à jour', 'Annuler'], defaultId: 1, cancelId: 1, noLink: true,
      title: 'Mise à jour', message: 'Mettre à jour Kinan Orchestre ?',
      detail: `Commande : git pull --ff-only\nDossier : ${dossierAppli}\nJamais de force ; refusé s'il y a des modifications locales.` });
    if (c.response !== 0) return { ok: false, annule: true, message: 'Mise à jour annulée.' };
    const r = await mettreAJour(dossierAppli);
    await majGit();
    if (r.ok && !r.rien && !r.npm) {
      const q = await dialog.showMessageBox(fen, { type: 'info', buttons: ['Relancer maintenant', 'Plus tard'], defaultId: 0, cancelId: 1, noLink: true,
        title: 'Mise à jour', message: r.message });
      if (q.response === 0) { app.relaunch(); app.exit(0); }
    }
    return r;
  });

  appliquerCache();
  if (active) {
    majGit();
    if (!etat.verifie || Date.now() - etat.verifie >= PERIODE) setTimeout(verifier, 5000);
    // Contrôle toutes les 30 min : nouvelle requête seulement si la dernière vérification a 6 h (robuste à la mise en veille).
    setInterval(() => { if (!etat.verifie || Date.now() - etat.verifie >= PERIODE) verifier(); }, 30 * 60000);
  }
  return { etat, verifier };
}

module.exports = { demarrer, comparer, versionValide, versionPluginLocale, etatGit, mettreAJour };
