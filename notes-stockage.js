// Bloc-notes : lecture tolérante et écriture atomique de notes.json (fs seul, aucun réseau, aucune dépendance Electron).
// Écriture : fichier temporaire puis renommage (3 essais sous Windows) ; avant chaque écriture, la version valide en place est copiée en notes.json.bak.
// Lecture : notes.json, sinon notes.json.bak ; un fichier illisible est conservé à part (notes.json.corrompu-<date>), jamais écrasé sans copie.
'use strict';
const fs = require('fs');
const path = require('path');
const logique = require('./notes-logique');

function renommerSur(tmp, cible) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(tmp, cible); } catch (e) {
      if (i >= 2 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

// JSON valide et de la bonne forme (objet avec un tableau notes) : sinon null.
function lireValide(f) {
  try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return o && typeof o === 'object' && Array.isArray(o.notes) ? o : null; } catch { return null; }
}

// Renvoie { etat, source: 'fichier' | 'sauvegarde' | 'vide', corrompu: chemin | null }.
function lire(fichier) {
  const existe = fs.existsSync(fichier);
  const brut = existe ? lireValide(fichier) : null;
  if (brut) return { etat: logique.normaliser(brut), source: 'fichier', corrompu: null };
  let corrompu = null;
  if (existe) { // illisible : copie conservée pour ne rien perdre
    corrompu = fichier + '.corrompu-' + new Date().toISOString().replace(/[:.]/g, '-');
    try { fs.copyFileSync(fichier, corrompu); } catch { corrompu = null; }
  }
  const bak = lireValide(fichier + '.bak');
  if (bak) return { etat: logique.normaliser(bak), source: 'sauvegarde', corrompu };
  return { etat: logique.vide(), source: 'vide', corrompu };
}

function ecrire(fichier, etat) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  if (lireValide(fichier)) fs.copyFileSync(fichier, fichier + '.bak'); // jamais de .bak écrasé par un fichier corrompu
  const tmp = fichier + '.' + process.pid + '.' + Date.now() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(etat));
    renommerSur(tmp, fichier);
  } catch (e) { try { fs.unlinkSync(tmp); } catch { /* absent */ } throw e; }
}

module.exports = { lire, ecrire };
