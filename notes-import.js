// Bloc-notes : import de fichiers texte (.txt, .md). 100 % local, aucun réseau. Les fichiers sont seulement LUS : jamais réécrits ni supprimés.
// Une note par fichier ; titre = nom du fichier sans extension (ajouté en tête du texte s'il n'y figure pas déjà).
// Encodage : UTF-8 (avec ou sans BOM), sinon Windows-1252. Refus signalés un par un, rien n'est coupé en silence.
'use strict';
const fs = require('fs');
const path = require('path');
const logique = require('./notes-logique');

const IMPORT = { octets: 1024 * 1024, fichiers: 100, extensions: ['.txt', '.md'] };
const RAISONS = {
  extension: 'format non pris en charge (.txt ou .md seulement)',
  gros: 'plus de 1 Mo',
  long: `plus de ${logique.LIMITES.texte.toLocaleString('fr-FR')} caractères`.replace(/ /g, ' '),
  vide: 'fichier vide',
  binaire: 'contenu non texte (binaire ou UTF-16) : enregistrez-le en UTF-8',
  illisible: 'fichier illisible',
  lot: `plus de ${IMPORT.fichiers} fichiers à la fois`
};

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nomAffiche = (x) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '') || '(sans nom)';

// UTF-8 strict (BOM retiré), sinon Windows-1252.
function decoderTexte(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  try { return { texte: new TextDecoder('utf-8', { fatal: true }).decode(b), encodage: 'utf-8' }; } catch { /* pas de l'UTF-8 valide */ }
  return { texte: new TextDecoder('windows-1252').decode(b), encodage: 'windows-1252' };
}

// Valide un fichier : { nom, taille?, octets? } -> { ok, texte, encodage } ou { ok: false, raison }.
function evaluer(f) {
  const nom = f && typeof f.nom === 'string' ? f.nom : '';
  const ext = path.extname(nom).toLowerCase();
  if (!IMPORT.extensions.includes(ext)) return { ok: false, raison: RAISONS.extension };
  const octets = f && Buffer.isBuffer(f.octets) ? f.octets : null;
  const taille = octets ? octets.length : (f && Number.isFinite(f.taille) ? f.taille : 0);
  if (taille > IMPORT.octets) return { ok: false, raison: RAISONS.gros };
  if (!octets) return { ok: false, raison: RAISONS.illisible };
  if (!octets.length) return { ok: false, raison: RAISONS.vide };
  const d = decoderTexte(octets);
  if (d.texte.includes('\u0000')) return { ok: false, raison: RAISONS.binaire };
  const contenu = d.texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
  if (!contenu) return { ok: false, raison: RAISONS.vide };
  const titre = path.basename(nom, ext).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, logique.LIMITES.titre);
  const premiere = logique.titreDe(contenu);
  const texte = !titre || norm(premiere) === norm(titre) ? contenu : titre + '\n\n' + contenu;
  if (texte.length > logique.LIMITES.texte) return { ok: false, raison: RAISONS.long };
  return { ok: true, texte, encodage: d.encodage };
}

// Lecture de chemins choisis par la boîte de dialogue : taille vérifiée AVANT lecture, lecture seule.
function lireFichiers(chemins) {
  return (Array.isArray(chemins) ? chemins : []).slice(0, IMPORT.fichiers + 1).map((c) => {
    const nom = path.basename(String(c));
    if (!IMPORT.extensions.includes(path.extname(nom).toLowerCase())) return { nom };
    try {
      const st = fs.statSync(c);
      if (!st.isFile()) return { nom, taille: 0 };
      if (st.size > IMPORT.octets) return { nom, taille: st.size };
      return { nom, taille: st.size, octets: fs.readFileSync(c) };
    } catch { return { nom, taille: 0 }; }
  });
}

// Fichier venant du rendu (glisser-déposer) : seul le contenu binaire compte, la taille annoncée n'est jamais crue si les octets sont là.
function entreeRendu(x) {
  const nom = x && typeof x.nom === 'string' ? x.nom.slice(0, 255) : '';
  const o = x && x.octets;
  let octets = null;
  if (o instanceof ArrayBuffer) octets = Buffer.from(o);
  else if (ArrayBuffer.isView(o)) octets = Buffer.from(o.buffer, o.byteOffset, o.byteLength);
  return { nom, octets, taille: octets ? octets.length : (x && Number.isFinite(x.taille) ? x.taille : 0) };
}

// Crée une note par fichier valide dans le lieu demandé ({ projet } ou { dossier } ; rien = sans dossier). Ne touche pas à `etat`.
function importer(etat, entrees, lieu, opts) {
  let e = etat;
  const ignorees = [], ids = [];
  const l = lieu && typeof lieu === 'object' ? { projet: lieu.projet == null ? null : lieu.projet, dossier: lieu.dossier == null ? null : lieu.dossier } : {};
  (Array.isArray(entrees) ? entrees : []).forEach((f, i) => {
    const nom = nomAffiche(f && f.nom);
    if (i >= IMPORT.fichiers) { ignorees.push({ nom, raison: RAISONS.lot }); return; }
    const v = evaluer(f);
    if (!v.ok) { ignorees.push({ nom, raison: v.raison }); return; }
    const r = logique.appliquer(e, { type: 'creerNote', ...l, texte: v.texte }, opts);
    if (!r.ok) { ignorees.push({ nom, raison: String(r.erreur || 'refusé').replace(/\.$/, '') }); return; }
    e = r.etat; ids.push(r.id);
  });
  return { etat: e, importees: ids.length, ignorees, ids, message: resume(ids.length, ignorees) };
}

// « 3 importées, 2 ignorées (plus de 1 Mo : a.txt, b.txt ; fichier vide : c.txt) »
function resume(importees, ignorees) {
  const pl = (n, s, p) => `${n} ${n > 1 ? p : s}`;
  const t = pl(importees, 'importée', 'importées');
  if (!ignorees.length) return importees ? t + '.' : 'Aucun fichier importé.';
  const groupes = new Map();
  for (const x of ignorees) groupes.set(x.raison, [...(groupes.get(x.raison) || []), x.nom]);
  const detail = [...groupes].map(([r, noms]) => `${r} : ${noms.slice(0, 3).join(', ')}${noms.length > 3 ? ` (+${noms.length - 3})` : ''}`).join(' ; ');
  return `${t}, ${pl(ignorees.length, 'ignorée', 'ignorées')} (${detail})`;
}

module.exports = { IMPORT, RAISONS, decoderTexte, evaluer, lireFichiers, entreeRendu, importer, resume };
