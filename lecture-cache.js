// Cache de lecture de fichiers JSON fondé sur mtime + taille (module pur, testé dans test/lecture-cache.test.js).
// Le fichier n'est relu et analysé que s'il a changé. Chaque appel rend une COPIE : l'appelant peut la modifier
// (appliquerDelais, etat-delai.js, modifie l'état en place et doit rester calculé à chaque lecture, hors cache).
'use strict';
const nodeFs = require('fs');

// Un fichier modifié il y a moins de MARGE_MS peut encore bouger sans que mtime change (résolution du disque) : on ne le mémorise pas.
const MARGE_MS = 30;

function creer({ fs = nodeFs, maintenant = Date.now } = {}) {
  const memo = new Map(); // chemin -> { mtimeMs, size, resultat }
  const stats = { lectures: 0, verifications: 0 };
  // analyser(texte) -> valeur (peut lever). Rend { valeur } (copie) ou null si absent/illisible/invalide.
  function lire(fichier, analyser) {
    stats.verifications++;
    let st;
    try { st = fs.statSync(fichier); } catch { memo.delete(fichier); return null; }
    const m = memo.get(fichier);
    if (m && m.mtimeMs === st.mtimeMs && m.size === st.size) return copie(m.resultat);
    let resultat = null;
    stats.lectures++;
    try { resultat = { valeur: analyser(fs.readFileSync(fichier, 'utf8')) }; } catch { resultat = null; }
    if (maintenant() - st.mtimeMs > MARGE_MS) memo.set(fichier, { mtimeMs: st.mtimeMs, size: st.size, resultat });
    else memo.delete(fichier);
    return copie(resultat);
  }
  const copie = (r) => (r ? { valeur: structuredClone(r.valeur) } : null);
  return { lire, stats, vider: () => memo.clear() };
}

// Analyse JSON tolérante au BOM.
const jsonBrut = (texte) => JSON.parse(texte.replace(/^﻿/, ''));

module.exports = { creer, jsonBrut, MARGE_MS };
