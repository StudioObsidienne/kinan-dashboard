// Status line de Claude Code pour Kinan Orchestre : écrit <dossier d'état>/limites.json à partir du champ officiel « rate_limits »
// (five_hour / seven_day : used_percentage, resets_at), puis affiche une ligne courte. Lancé par Claude Code, jamais par l'appli.
// Ne plante jamais, écriture atomique (fichier temporaire puis renommage). Rien n'est écrit si « rate_limits » est absent
// (abonnés Pro/Max seulement, et seulement après la 1re réponse de la session).
// Chaînage : --suite-b64 <commande> (base64) : la status line précédente est relancée avec la même entrée et sa sortie est affichée telle quelle.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DOSSIER = process.env.KINAN_OS_DOSSIER ? path.resolve(process.env.KINAN_OS_DOSSIER) : path.join(os.homedir(), '.kinan-os');
let entree = '', fait = false;

function ecrire(d) {
  const rl = d && d.rate_limits;
  if (!rl || typeof rl !== 'object') return;
  const o = { maj: Date.now() };
  for (const k of ['five_hour', 'seven_day']) {
    const w = rl[k];
    if (!w || typeof w !== 'object' || !Number.isFinite(Number(w.used_percentage))) continue;
    o[k] = { used_percentage: Number(w.used_percentage), resets_at: Number.isFinite(Number(w.resets_at)) ? Number(w.resets_at) : null };
  }
  const tmp = path.join(DOSSIER, 'limites.json.' + process.pid + '.tmp');
  try {
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(o));
    fs.renameSync(tmp, path.join(DOSSIER, 'limites.json'));
  } catch { try { fs.unlinkSync(tmp); } catch { /* ignoré */ } }
}

function ligne(d) {
  const parts = [];
  const m = d && d.model && d.model.display_name;
  if (m) parts.push(String(m).slice(0, 40));
  const rl = (d && d.rate_limits) || {};
  for (const [k, lib] of [['five_hour', '5 h'], ['seven_day', 'semaine']]) {
    const u = rl[k] && Number(rl[k].used_percentage);
    if (Number.isFinite(u)) parts.push(`${lib} : ${Math.max(0, Math.round(100 - u))} % restant`);
  }
  return parts.join(' · ');
}

function fin() {
  if (fait) return;
  fait = true;
  let d = {};
  try { d = JSON.parse(entree) || {}; } catch { d = {}; }
  try { ecrire(d); } catch { /* ignoré */ }
  let sortie = '';
  try {
    const i = process.argv.indexOf('--suite-b64');
    if (i > 0 && process.argv[i + 1]) {
      const cmd = Buffer.from(process.argv[i + 1], 'base64').toString('utf8');
      const r = require('child_process').spawnSync(cmd, { shell: true, input: entree, encoding: 'utf8', timeout: 5000, windowsHide: true });
      sortie = String(r.stdout || '').replace(/\s+$/, '');
    } else sortie = ligne(d);
  } catch { sortie = ''; }
  try { process.stdout.write(sortie + '\n'); } catch { /* ignoré */ }
}

try {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { if (entree.length < 2e6) entree += c; });
  process.stdin.on('end', fin);
  process.stdin.on('error', fin);
} catch { fin(); }
setTimeout(fin, 3000).unref(); // garde-fou : entrée jamais fermée
