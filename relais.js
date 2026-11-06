// Kinan OS : détection d'une conversation Claude trop longue (« REFAIRE CONVERSATION »). 0 jeton, 0 réseau.
// Mêmes seuils et même lecture que hooks/rappel-relais.js : ≥ 120 min OU contexte ≥ 300 000 jetons.
// Lit seulement la tête (1er horodatage) et la queue (dernier usage assistant) du journal .jsonl le plus récent.
const fs = require('fs');
const os = require('os');
const path = require('path');

const RACINE = path.join(os.homedir(), '.claude', 'projects');
const RE_TITRE = /"customTitle":"((?:[^"\\]|\\.)*)"/g;
// Seuils : section « relais » de kinan.config.json (120 min et 300 000 jetons par défaut).
const config = require('./config');
let SEUIL_MIN = 120, SEUIL_CTX = 300000;
const INACTIF_MS = 6 * 3600 * 1000; // journal non modifié depuis 6 h : conversation abandonnée, pas de bandeau

function lireTete(f, n = 64 * 1024) {
  const fd = fs.openSync(f, 'r');
  try { const b = Buffer.alloc(n); const lu = fs.readSync(fd, b, 0, n, 0); return b.slice(0, lu).toString('utf8'); } finally { fs.closeSync(fd); }
}
function lireQueue(f, taille, n = 512 * 1024) {
  const debut = Math.max(0, taille - n), fd = fs.openSync(f, 'r');
  try { const b = Buffer.alloc(taille - debut); fs.readSync(fd, b, 0, b.length, debut); return b.toString('utf8'); } finally { fs.closeSync(fd); }
}

function lire(f, taille) {
  let debut = null, ctx = 0;
  try {
    for (const l of lireTete(f).split('\n')) { if (!l) continue; try { const o = JSON.parse(l); if (o.timestamp) { debut = Date.parse(o.timestamp); break; } } catch { /* ligne coupée */ } }
    const lignes = lireQueue(f, taille).split('\n');
    for (let i = lignes.length - 1; i >= 0; i--) {
      if (!lignes[i] || lignes[i].indexOf('"usage"') < 0) continue;
      try { const o = JSON.parse(lignes[i]); const u = o.message && o.message.usage;
        if (o.type === 'assistant' && u && o.message.model !== '<synthetic>') { ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); break; } } catch { /* ignoré */ }
    }
  } catch { /* illisible */ }
  let titre = '';
  try {
    const m = [...lireQueue(f, taille).matchAll(RE_TITRE)].pop() || [...lireTete(f).matchAll(RE_TITRE)].pop();
    if (m) titre = JSON.parse('"' + m[1] + '"');
  } catch { /* titre absent */ }
  return { debut: Number.isFinite(debut) ? debut : null, ctx, titre };
}

function plusRecent(dir, rec) {
  let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return rec; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'subagents') rec = plusRecent(p, rec); }
    else if (e.name.endsWith('.jsonl')) { try { const s = fs.statSync(p); if (!rec || s.mtimeMs > rec.mtime) rec = { p, taille: s.size, mtime: s.mtimeMs }; } catch { /* ignoré */ } }
  }
  return rec;
}

// Renvoie { actif, id, minutes, ctx }. cache : Map partagé (clé = chemin, valide si taille+mtime identiques).
function detecter({ racine = RACINE, maintenant = Date.now(), cache = new Map(), fichier = null } = {}) {
  // Conversation suivie par les hooks (state.json) en priorité ; sinon la plus récemment modifiée.
  let f = null;
  if (fichier) { try { const s = fs.statSync(fichier); f = { p: fichier, taille: s.size, mtime: s.mtimeMs }; } catch { /* absent */ } }
  if (!f) f = plusRecent(racine, null);
  if (!f) return { actif: false };
  let c = cache.get(f.p);
  if (!c || c.taille !== f.taille || c.mtime !== f.mtime) { c = { taille: f.taille, mtime: f.mtime, ...lire(f.p, f.taille) }; cache.clear(); cache.set(f.p, c); }
  const nom = path.basename(f.p, '.jsonl');
  const titre = c.titre || ('Conversation ' + nom.slice(0, 8));
  if (!c.debut) return { actif: false, id: f.p, titre };
  const minutes = Math.max(0, Math.round((maintenant - c.debut) / 60000));
  const inactive = maintenant - f.mtime > INACTIF_MS;
  ({ minutes: SEUIL_MIN, jetons: SEUIL_CTX } = config.charger().relais);
  return { seuilMin: SEUIL_MIN, seuilCtx: SEUIL_CTX, actif: !inactive && (minutes >= SEUIL_MIN || c.ctx >= SEUIL_CTX), id: f.p, titre, minutes, ctx: c.ctx, inactive };
}

const cacheTitres = new Map();
// Titre d'une conversation (par son journal .jsonl), mis en cache par taille + date.
function titreConversation(fichier) {
  try {
    const s = fs.statSync(fichier), c = cacheTitres.get(fichier);
    if (c && c.taille === s.size && c.mtime === s.mtimeMs) return c.titre;
    const t = lire(fichier, s.size).titre || '';
    cacheTitres.set(fichier, { taille: s.size, mtime: s.mtimeMs, titre: t });
    return t;
  } catch { return ''; }
}

module.exports = { detecter, titreConversation, SEUIL_MIN, SEUIL_CTX };
