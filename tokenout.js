// Kinan Orchestre : détection de la limite d'utilisation Claude atteinte (« TOKEN OUT »).
// Lit la FIN des journaux ~/.claude/projects/**/*.jsonl (modifiés récemment), cache par chemin + taille + mtime. 0 jeton, 0 réseau.
// Fonctions pures et testables sans Electron.
const fs = require('fs');
const os = require('os');
const path = require('path');

const RACINE = path.join(os.homedir(), '.claude', 'projects');
const FENETRE_MS = 8 * 24 * 3600 * 1000; // journaux modifiés depuis 8 jours (limite hebdomadaire incluse)
const FIN_OCTETS = 256 * 1024;           // seule la fin de chaque fichier est lue
const FUSEAU = 'Europe/Paris';
const MOIS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function decalage(tz, utcMs) { // décalage (ms) du fuseau tz à l'instant utcMs
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}
function localVersUtc(tz, y, mo, d, h, mi) { // heure murale du fuseau tz -> instant UTC (ms)
  const approx = Date.UTC(y, mo - 1, d, h, mi);
  return approx - decalage(tz, approx - decalage(tz, approx));
}
function dateLocale(tz, utcMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(utcMs)).map((x) => [x.type, +x.value]));
  return { y: p.year, mo: p.month, d: p.day };
}

// Texte d'une erreur de limite -> { type, reprise (ms ou null) }. Robuste : tout ce qui est illisible -> reprise null.
function analyserTexte(texte, tErreur) {
  const t = String(texte || '');
  const type = /5[\s-]?hour|five[\s-]?hour/i.test(t) ? '5 h' : /week/i.test(t) ? 'semaine' : 'autre';
  let reprise = null;
  try {
    const m = t.match(/resets?\s+(?:(?:on\s+)?([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (m) {
      let tz = FUSEAU;
      const z = t.match(/\(([A-Za-z_]+\/[A-Za-z_]+)\)/);
      if (z) { try { new Intl.DateTimeFormat('en-US', { timeZone: z[1] }); tz = z[1]; } catch { /* fuseau inconnu : Paris */ } }
      let h = (+m[3]) % 12; if (/pm/i.test(m[5])) h += 12;
      const mi = m[4] ? +m[4] : 0;
      const loc = dateLocale(tz, tErreur);
      if (m[1] && MOIS[m[1].toLowerCase()]) {
        let y = loc.y; let r = localVersUtc(tz, y, MOIS[m[1].toLowerCase()], +m[2], h, mi);
        if (r < tErreur - 120 * 24 * 3600 * 1000) r = localVersUtc(tz, y + 1, MOIS[m[1].toLowerCase()], +m[2], h, mi); // passage d'année
        reprise = r;
      } else {
        let r = localVersUtc(tz, loc.y, loc.mo, loc.d, h, mi);
        if (r <= tErreur) r = localVersUtc(tz, loc.y, loc.mo, loc.d + 1, h, mi); // prochaine occurrence de cette heure
        reprise = r;
      }
      if (!Number.isFinite(reprise)) reprise = null;
    }
  } catch { reprise = null; }
  return { type, reprise };
}

// Lecture de la fin d'un fichier : dernière erreur de limite et dernier message assistant normal.
function lireFin(chemin, taille) {
  const res = { erreur: null, normal: 0 };
  let fd;
  try {
    fd = fs.openSync(chemin, 'r');
    const debut = Math.max(0, taille - FIN_OCTETS), n = taille - debut;
    const buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, debut);
    const lignes = buf.toString('utf8').split('\n'); if (debut > 0) lignes.shift(); // 1re ligne probablement coupée
    for (const l of lignes) {
      if (!l || l.indexOf('"assistant"') < 0) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.type !== 'assistant') continue;
      const t = Date.parse(o.timestamp); if (!t) continue;
      const m = o.message || {};
      const texte = Array.isArray(m.content) ? m.content.map((c) => (c && c.text) || '').join(' ') : String(m.content || '');
      if (o.isApiErrorMessage === true && (o.error === 'rate_limit' || /hit your .*limit|limit reached/i.test(texte))) {
        if (!res.erreur || t > res.erreur.t) res.erreur = { t, texte };
      } else if (o.isApiErrorMessage !== true && m.model !== '<synthetic>' && Array.isArray(m.content) && m.content.length) {
        if (t > res.normal) res.normal = t;
      }
    }
  } catch { /* fichier illisible : ignoré */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignoré */ } }
  return res;
}

function lister(dir, depuis, sortie = []) {
  let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return sortie; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) lister(p, depuis, sortie);
    else if (e.name.endsWith('.jsonl')) { try { const s = fs.statSync(p); if (s.mtimeMs >= depuis) sortie.push({ p, taille: s.size, mtime: s.mtimeMs }); } catch { /* ignoré */ } }
  }
  return sortie;
}

// cache : Map partagé entre appels. Renvoie { actif, type, reprise, repriseInconnue, depuis, texte }.
function detecter({ racine = RACINE, maintenant = Date.now(), cache = new Map() } = {}) {
  let erreur = null, normal = 0;
  const vus = new Set();
  for (const f of lister(racine, maintenant - FENETRE_MS)) {
    vus.add(f.p);
    let c = cache.get(f.p);
    if (!c || c.taille !== f.taille || c.mtime !== f.mtime) { c = { taille: f.taille, mtime: f.mtime, ...lireFin(f.p, f.taille) }; cache.set(f.p, c); }
    if (c.erreur && (!erreur || c.erreur.t > erreur.t)) erreur = c.erreur;
    if (c.normal > normal) normal = c.normal;
  }
  for (const k of cache.keys()) if (!vus.has(k)) cache.delete(k);
  if (!erreur) return { actif: false };
  const a = analyserTexte(erreur.texte, erreur.t);
  const inconnue = a.reprise === null;
  const reprise = inconnue ? erreur.t + (a.type === 'semaine' ? 7 * 24 * 3600 * 1000 : 5 * 3600 * 1000) : a.reprise;
  const actif = reprise > maintenant && normal <= erreur.t; // reprise passée, ou message normal plus récent : l'utilisation a repris
  return { actif, type: a.type, reprise, repriseInconnue: inconnue, depuis: erreur.t, texte: erreur.texte };
}

module.exports = { detecter, analyserTexte, lireFin, localVersUtc };
