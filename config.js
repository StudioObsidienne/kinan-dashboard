// Configuration du tableau de bord : lecture et validation de <dossier d'état>/kinan.config.json.
// Mêmes règles que le plugin kinan-orchestre (hooks/lib/config.js). Le fichier n'est jamais lu dans le projet ouvert.
// Dossier d'état : variable KINAN_OS_DOSSIER, sinon ~/.kinan-os. Toute valeur invalide est ignorée et signalée. Ne lève jamais d'exception.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DOSSIER = process.env.KINAN_OS_DOSSIER ? path.resolve(process.env.KINAN_OS_DOSSIER) : path.join(os.homedir(), '.kinan-os');
const F_UTILISATEUR = path.join(DOSSIER, 'kinan.config.json');
const MAX_AGENTS = 8;

const DEFAUT_AGENTS = {
  drafion: { nom: 'Drafion', base: 'lecture', modele: 'haiku', role: 'Lectures, recherches, vérifications' },
  skyze: { nom: 'Skyze', base: 'production', modele: 'sonnet', role: 'Production courante' },
  johms: { nom: 'Johms', base: 'expert', modele: 'opus', role: 'Difficultés réelles' },
  courrier: { nom: 'Courrier', base: 'kinan-orchestre:courrier', modele: 'haiku', role: 'Mails : résumés et brouillons', option: 'courrier' },
  devis: { nom: 'Devis', base: 'kinan-orchestre:devis', modele: 'sonnet', role: 'Devis : brouillons à valider', option: 'courrier' }
};
const MODELES = ['haiku', 'sonnet', 'opus', 'inherit'];
const PAR_BASE = { lecture: 'haiku', production: 'sonnet', expert: 'opus' };
// Modèle du juge : celui de agents/kinan.md du plugin (« model: sonnet »), verrouillé. test/config-modele.test.js vérifie l'accord.
const MODELE_JUGE = 'sonnet';
// Modèle saisi : casse et espaces ignorés (« Sonnet », « claude-sonnet-5-5 » -> « sonnet »). Sinon null. Mêmes règles que le plugin.
function normModele(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (MODELES.includes(s)) return s;
  const m = /^claude-(haiku|sonnet|opus)(?:-|$)/.exec(s);
  return m ? m[1] : null;
}

const propre = (t, n) => String(t == null ? '' : t).replace(/[\r\n\t]+/g, ' ').replace(/[<>`]/g, '').trim().slice(0, n);
const couleur = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null);
const couleurTheme = (v) => (typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v.toLowerCase() : null);
const policeTheme = (v) => (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/.test(v) ? v : null);
function urlHttps(v) {
  if (typeof v !== 'string' || v.length > 300 || /[\s"'<>`\\^{}|();]/.test(v)) return null;
  try { const u = new URL(v); return u.protocol === 'https:' && u.hostname && !u.username && !u.password ? u.href : null; } catch { return null; }
}
const CHAMPS_COULEUR = ['fond', 'surface', 'texte', 'accent', 'accentSecondaire'];
const CHAMPS_POLICE = ['policeTitre', 'policeTexte'];
const CHAMPS_URL = ['logo', 'source'];
const CHAMPS_THEME = [...CHAMPS_COULEUR, ...CHAMPS_POLICE, ...CHAMPS_URL];
const VALIDEUR = (k) => (CHAMPS_COULEUR.includes(k) ? couleurTheme : CHAMPS_POLICE.includes(k) ? policeTheme : urlHttps);

// Couleurs de l'interface par défaut (src/index.html) : servent au contrôle de contraste quand le thème est partiel.
const BASE_UI = { fond: '#14121c', surface: '#1a1725', texte: '#ece8f5', accent: '#a78bfa', accentSecondaire: '#5fd3a0' };
function rvb(h) { const s = h.length === 4 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); }
function luminance(h) { return rvb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); }
function contraste(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// Contrôle de lisibilité (WCAG) : texte 4,5:1 sur le fond et sur la surface ; accents 3:1 sur le fond.
function lisible(t) {
  const c = { ...BASE_UI }; for (const k of CHAMPS_COULEUR) if (t[k]) c[k] = t[k];
  const tests = [['texte', 'fond', 4.5], ['texte', 'surface', 4.5], ['accent', 'fond', 3], ['accentSecondaire', 'fond', 3]];
  const echecs = tests.filter(([a, b, min]) => contraste(c[a], c[b]) < min).map(([a, b, min]) => `${a}/${b} ${contraste(c[a], c[b]).toFixed(2)} < ${min}`);
  return { ok: !echecs.length, echecs };
}

function titreParDefaut() {
  const langue = String((Intl.DateTimeFormat().resolvedOptions().locale) || process.env.LANG || 'en').toLowerCase();
  return langue.startsWith('fr') ? 'Bureau des agents' : 'Agents desk';
}

const courrierActif = () => { try { return JSON.parse(fs.readFileSync(path.join(DOSSIER, 'courrier-option.json'), 'utf8')).actif === true; } catch { return false; } };
function lire() {
  const alertes = [];
  let u = {};
  try { if (fs.existsSync(F_UTILISATEUR)) u = JSON.parse(fs.readFileSync(F_UTILISATEUR, 'utf8').replace(/^﻿/, '')); } catch { alertes.push('kinan.config.json illisible : valeurs par défaut utilisées'); }
  if (!u || typeof u !== 'object' || Array.isArray(u)) u = {};

  const uj = u.juge && typeof u.juge === 'object' ? u.juge : {};
  if (uj.nom !== undefined || uj.role !== undefined) alertes.push('juge : nom et rôle verrouillés, valeurs ignorées');
  const juge = { id: 'kinan', nom: 'Kinan', modele: MODELE_JUGE, couleur: couleur(uj.couleur) };

  const source = u.agents && typeof u.agents === 'object' && !Array.isArray(u.agents) ? u.agents : DEFAUT_AGENTS;
  const agents = [];
  for (const [id, a] of Object.entries(source)) {
    if (agents.length >= MAX_AGENTS) { alertes.push(`plus de ${MAX_AGENTS} agents : les suivants sont ignorés`); break; }
    if (id === 'kinan') { alertes.push('« kinan » est réservé au juge'); continue; }
    if (!/^[a-z][a-z0-9-]{0,23}$/.test(id)) { alertes.push(`identifiant d'agent invalide : ${propre(id, 30)}`); continue; }
    if (!a || typeof a !== 'object' || a.actif === false) continue;
    if ((a.option || (DEFAUT_AGENTS[id] || {}).option) === 'courrier' && !courrierActif()) continue; // option courrier désactivée : agent masqué
    const def = DEFAUT_AGENTS[id] || {};
    const base = typeof a.base === 'string' ? a.base : def.base || 'production';
    // Choix explicite (clé présente et valide) conservé ; clé absente : défaut de l'agent, de la base, puis Sonnet (plus de repli « inherit »).
    const modele = normModele(a.modele) || def.modele || PAR_BASE[base] || 'sonnet';
    agents.push({ id, base, modele, nom: propre(a.nom || def.nom || id, 24), role: propre(a.role || def.role || '', 160), couleur: couleur(a.couleur) });
  }

  const ut0 = u.theme;
  if (ut0 !== undefined && (!ut0 || typeof ut0 !== 'object' || Array.isArray(ut0))) alertes.push('theme : objet attendu, valeur ignorée');
  const uth = ut0 && typeof ut0 === 'object' && !Array.isArray(ut0) ? ut0 : {};
  let theme = {};
  for (const k of CHAMPS_THEME) {
    const v = VALIDEUR(k)(uth[k]);
    if (uth[k] !== undefined && uth[k] !== null && v === null) alertes.push(`theme.${k} : valeur invalide, ignorée`);
    theme[k] = v;
  }
  for (const k of Object.keys(uth)) if (!CHAMPS_THEME.includes(k)) alertes.push(`theme.${propre(k, 30)} : champ inconnu, ignoré`);
  const l = lisible(theme);
  if (!l.ok) { alertes.push('theme : contraste insuffisant (' + l.echecs.join(', ') + '), thème ignoré'); theme = Object.fromEntries(CHAMPS_THEME.map((k) => [k, null])); }

  const titreBureau = propre(u.titreBureau, 60) || titreParDefaut();
  const entier = (v, min, max, d) => (Number.isInteger(v) && v >= min && v <= max ? v : d);
  const ur = u.relais && typeof u.relais === 'object' ? u.relais : {};
  const relais = { minutes: entier(ur.minutes, 10, 1440, 120), jetons: entier(ur.jetons, 50000, 2000000, 300000) };
  // Dossier de travail (facultatif) : conversation suivie dans ce dossier -> sous-titre « titreBureau » ; ailleurs -> « Agent · conversation ».
  let dossierTravail = null;
  if (typeof u.dossierTravail === 'string' && u.dossierTravail.length <= 260 && !/[\u0000-\u001f]/.test(u.dossierTravail) && path.isAbsolute(u.dossierTravail)) dossierTravail = path.resolve(u.dossierTravail);
  else if (u.dossierTravail !== undefined && u.dossierTravail !== null) alertes.push('dossierTravail : chemin absolu attendu, ignoré');
  const sons = { actif: !(u.sons && typeof u.sons === 'object' && u.sons.actif === false) };
  // Vérification des mises à jour (réseau : raw.githubusercontent.com, toutes les 30 min) : désactivée sauf « miseAJour.verifier: true ».
  // « explicite » : true ou false écrit dans le fichier (par l'utilisateur ou par sa réponse à la question du premier lancement).
  const miseAJour = { verifier: !!(u.miseAJour && typeof u.miseAJour === 'object' && u.miseAJour.verifier === true),
    explicite: !!(u.miseAJour && typeof u.miseAJour === 'object' && typeof u.miseAJour.verifier === 'boolean') };
  return { dossier: DOSSIER, juge, agents, theme, themeApplique: l.ok, titreBureau, relais, dossierTravail, sons, miseAJour, alertes };
}

// Lecture mise en cache (la configuration est lue au démarrage ; « Recharger » relit le fichier).
let cache = null;
function charger(forcer) { if (!cache || forcer) cache = lire(); return cache; }
// Identifiants connus : le juge puis les agents configurés.
const ids = () => ['kinan', ...charger().agents.map((a) => a.id)];
const nomDe = (id) => (id === 'kinan' ? 'Kinan' : (charger().agents.find((a) => a.id === id) || {}).nom || id);

// Vrai si le dossier de la conversation est hors du dossier de travail configuré (ou si aucun n'est configuré).
function horsTravail(cwd) {
  if (!cwd) return false;
  const d = charger().dossierTravail;
  if (!d) return true;
  const n = (x) => path.resolve(String(x)).replace(/[\\/]+$/, '').toLowerCase();
  const c = n(cwd), r = n(d);
  return !(c === r || c.startsWith(r + path.sep.toLowerCase()) || c.startsWith(r + '/'));
}

// Mémorise la réponse à « Vérifier automatiquement les nouvelles versions ? » : seule la clé miseAJour.verifier est écrite,
// le reste du fichier est conservé tel quel. Fichier présent mais illisible : rien n'est écrit (la question sera reposée).
function memoriserMiseAJour(oui) {
  let u = {};
  try {
    if (fs.existsSync(F_UTILISATEUR)) u = JSON.parse(fs.readFileSync(F_UTILISATEUR, 'utf8').replace(/^﻿/, ''));
    if (!u || typeof u !== 'object' || Array.isArray(u)) return false;
    const m = u.miseAJour && typeof u.miseAJour === 'object' && !Array.isArray(u.miseAJour) ? u.miseAJour : {};
    u.miseAJour = { ...m, verifier: oui === true };
    fs.mkdirSync(DOSSIER, { recursive: true });
    const tmp = F_UTILISATEUR + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(u, null, 2) + '\n');
    fs.renameSync(tmp, F_UTILISATEUR);
    charger(true);
    return true;
  } catch { return false; }
}

module.exports = { horsTravail, DOSSIER, F_UTILISATEUR, charger, ids, nomDe, contraste, lisible, memoriserMiseAJour, normModele, MODELE_JUGE };
