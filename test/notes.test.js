// Bloc-notes : logique pure (notes-logique.js) et stockage (notes-stockage.js : écriture atomique, .bak, lecture tolérante).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../notes-logique');
const S = require('../notes-stockage');

let compteur = 0;
const opts = (now = Date.parse('2026-11-10T10:00:00Z')) => ({ now, genId: () => 'id' + String(++compteur).padStart(4, '0') });
const faire = (etat, op, o) => { const r = L.appliquer(etat, op, o || opts()); assert.ok(r.ok, r.erreur); return r; };

test('note rapide : Boîte de réception, titre tiré de la première ligne', () => {
  let r = faire(L.vide(), { type: 'creerNote', texte: '' });
  const id = r.id;
  r = faire(r.etat, { type: 'modifierNote', id, texte: '\n  ## Idée de site\nsuite' });
  const n = r.etat.notes[0];
  assert.strictEqual(n.titre, 'Idée de site');
  assert.strictEqual(n.projet, null); assert.strictEqual(n.dossier, null);
  assert.strictEqual(L.vue(r.etat).notes[0].titre, 'Idée de site');
  assert.strictEqual(L.titreDe(''), 'Sans titre');
});

test('projet > dossier > note, déplacement validé, recherche sans accents', () => {
  let e = L.vide();
  const p = faire(e, { type: 'creerProjet', nom: '  Client   Dupont ' }); e = p.etat;
  assert.strictEqual(e.projets[0].nom, 'Client Dupont');
  const d = faire(e, { type: 'creerDossier', projet: p.id, nom: 'Devis' }); e = d.etat;
  const n = faire(e, { type: 'creerNote', dossier: d.id, texte: 'Rappeler pour la tôle émaillée' }); e = n.etat;
  assert.strictEqual(e.notes[0].projet, p.id, 'le projet suit le dossier');
  assert.strictEqual(L.rechercher(e, 'TOLE emaillee').length, 1);
  assert.strictEqual(L.rechercher(e, 'tole absent').length, 0);
  assert.strictEqual(L.appliquer(e, { type: 'deplacerNote', id: n.id, dossier: 'inexistant' }, opts()).ok, false);
  e = faire(e, { type: 'deplacerNote', id: n.id }).etat;
  assert.deepStrictEqual([e.notes[0].projet, e.notes[0].dossier], [null, null]);
  e = faire(e, { type: 'renommerDossier', id: d.id, nom: 'Factures' }).etat;
  assert.strictEqual(e.dossiers[0].nom, 'Factures');
});

test('valeurs refusées côté main : type inconnu, nom vide, texte trop long, limite de notes', () => {
  const e = L.vide();
  assert.strictEqual(L.appliquer(e, null, opts()).ok, false);
  assert.strictEqual(L.appliquer(e, { type: '__proto__' }, opts()).ok, false);
  assert.strictEqual(L.appliquer(e, { type: 'creerProjet', nom: '   ' }, opts()).ok, false);
  assert.strictEqual(L.appliquer(e, { type: 'creerNote', texte: 'x'.repeat(L.LIMITES.texte + 1) }, opts()).ok, false);
  const r = faire(e, { type: 'creerNote', texte: 'a' });
  assert.strictEqual(L.appliquer(r.etat, { type: 'modifierNote', id: r.id, texte: 'x'.repeat(L.LIMITES.texte + 1) }, opts()).ok, false);
  assert.strictEqual(L.appliquer(r.etat, { type: 'modifierNote', id: r.id, texte: 42 }, opts()).ok, false);
  const plein = { ...L.vide(), notes: Array.from({ length: L.LIMITES.notes }, (_, i) => ({ id: 'n' + String(i).padStart(5, '0') })) };
  assert.strictEqual(L.appliquer(plein, { type: 'creerNote', texte: '' }, opts()).ok, false);
  assert.strictEqual(e.notes.length, 0, 'état d\'entrée jamais modifié');
});

test('corbeille : suppression d\'un projet avec ses notes, restauration groupée, purge à 30 jours', () => {
  let e = L.vide();
  const p = faire(e, { type: 'creerProjet', nom: 'P' }); e = p.etat;
  const d = faire(e, { type: 'creerDossier', projet: p.id, nom: 'D' }); e = d.etat;
  const n1 = faire(e, { type: 'creerNote', dossier: d.id, texte: 'un' }); e = n1.etat;
  const n2 = faire(e, { type: 'creerNote', texte: 'deux' }); e = n2.etat;
  e = faire(e, { type: 'supprimerProjet', id: p.id }).etat;
  let v = L.vue(e);
  assert.deepStrictEqual([v.projets.length, v.dossiers.length, v.notes.length], [0, 0, 1]);
  assert.deepStrictEqual(v.corbeille.map((c) => c.type), ['projet'], 'contenu du projet non listé à part');
  e = faire(e, { type: 'restaurer', cible: 'projet', id: p.id }).etat;
  v = L.vue(e);
  assert.deepStrictEqual([v.projets.length, v.dossiers.length, v.notes.length], [1, 1, 2]);
  // note supprimée seule, puis son dossier : restaurer la note la renvoie en Boîte de réception
  e = faire(e, { type: 'supprimerNote', id: n1.id }).etat;
  e = faire(e, { type: 'supprimerDossier', id: d.id }, opts(Date.parse('2026-11-11T10:00:00Z'))).etat;
  e = faire(e, { type: 'restaurer', cible: 'note', id: n1.id }).etat;
  assert.strictEqual(e.notes.find((n) => n.id === n1.id).projet, null);
  e = faire(e, { type: 'supprimerNote', id: n2.id }).etat;
  const purge = L.purger(e, Date.parse('2026-12-11T10:00:01Z'));
  assert.ok(!purge.notes.some((n) => n.id === n2.id), 'note de plus de 30 jours purgée');
  assert.ok(!purge.dossiers.length, 'dossier de plus de 30 jours purgé');
  assert.ok(purge.notes.some((n) => n.id === n1.id), 'note restaurée conservée');
  assert.ok(L.purger(e, Date.parse('2026-12-01T00:00:00Z')).notes.some((n) => n.id === n2.id), 'moins de 30 jours : conservée');
});

test('épinglage : note épinglée en tête ; export Markdown d\'un projet', () => {
  let e = L.vide();
  const p = faire(e, { type: 'creerProjet', nom: 'Site Été' }); e = p.etat;
  const a = faire(e, { type: 'creerNote', projet: p.id, texte: 'Ancienne' }, opts(1000)); e = a.etat;
  const b = faire(e, { type: 'creerNote', projet: p.id, texte: 'Récente' }, opts(2000)); e = b.etat;
  e = faire(e, { type: 'epinglerNote', id: a.id, valeur: true }).etat;
  assert.strictEqual(L.vue(e).notes[0].id, a.id);
  const d = faire(e, { type: 'creerDossier', projet: p.id, nom: 'Idées' }); e = d.etat;
  e = faire(e, { type: 'creerNote', dossier: d.id, texte: 'Dans le dossier' }).etat;
  const md = L.versMarkdown(e, { type: 'projet', id: p.id });
  assert.strictEqual(md.nomFichier, 'notes-site-ete.md');
  assert.strictEqual(md.nb, 3);
  assert.match(md.contenu, /^# Site Été\n/);
  assert.match(md.contenu, /## Ancienne \(épinglée\)/);
  assert.match(md.contenu, /## Idées\n\n### Dans le dossier/);
  assert.strictEqual(L.versMarkdown(e, { type: 'dossier', id: 'inconnu' }), null);
});

test('normaliser : fichier hostile ou abîmé lu sans exception', () => {
  for (const brut of [null, 42, 'x', [], { notes: 'x' }, { notes: [null, { id: '../x', texte: 'a' }, { id: 'abcd', texte: 5 }] }]) {
    assert.deepStrictEqual(L.normaliser(brut).notes, []);
  }
  const e = L.normaliser({ projets: [{ id: 'pppp', nom: 'P' }], notes: [{ id: 'abcd', texte: 'ok', projet: 'inconnu', dossier: 'inconnu', epinglee: 'oui' }, { id: 'abcd', texte: 'doublon' }] });
  assert.strictEqual(e.notes.length, 1);
  assert.deepStrictEqual([e.notes[0].projet, e.notes[0].dossier, e.notes[0].epinglee], [null, null, false]);
});

// ----- Stockage : non-régression écriture atomique et corruption -----
function dossierTemp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kinan-notes-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return path.join(d, 'notes.json');
}

test('écriture atomique : aucun .tmp restant, .bak = version précédente', (t) => {
  const f = dossierTemp(t);
  let e = faire(L.vide(), { type: 'creerNote', texte: 'v1' }).etat;
  S.ecrire(f, e);
  assert.ok(!fs.existsSync(f + '.bak'), 'pas de .bak sans version précédente');
  e = faire(e, { type: 'modifierNote', id: e.notes[0].id, texte: 'v2' }).etat;
  S.ecrire(f, e);
  assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).notes[0].texte, 'v2');
  assert.strictEqual(JSON.parse(fs.readFileSync(f + '.bak', 'utf8')).notes[0].texte, 'v1');
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)).filter((x) => x.endsWith('.tmp')), []);
  const r = S.lire(f);
  assert.strictEqual(r.source, 'fichier'); assert.strictEqual(r.etat.notes[0].texte, 'v2');
});

test('fichier corrompu : reprise du .bak, copie du fichier abîmé, .bak jamais écrasé par le fichier abîmé', (t) => {
  const f = dossierTemp(t);
  let e = faire(L.vide(), { type: 'creerNote', texte: 'bonne' }).etat;
  S.ecrire(f, e); S.ecrire(f, e); // .bak valide
  fs.writeFileSync(f, '{"notes":[{tronqué');
  const r = S.lire(f);
  assert.strictEqual(r.source, 'sauvegarde');
  assert.strictEqual(r.etat.notes[0].texte, 'bonne');
  assert.ok(r.corrompu && fs.readFileSync(r.corrompu, 'utf8').startsWith('{"notes":[{tronqué'), 'copie du fichier abîmé conservée');
  e = faire(r.etat, { type: 'creerNote', texte: 'après' }).etat;
  S.ecrire(f, e);
  assert.strictEqual(JSON.parse(fs.readFileSync(f + '.bak', 'utf8')).notes[0].texte, 'bonne', '.bak conservé');
  assert.strictEqual(S.lire(f).etat.notes.length, 2);
});

test('fichier corrompu sans sauvegarde, ou absent : état vide sans exception', (t) => {
  const f = dossierTemp(t);
  assert.strictEqual(S.lire(f).source, 'vide');
  fs.writeFileSync(f, 'null');
  const r = S.lire(f);
  assert.strictEqual(r.source, 'vide'); assert.deepStrictEqual(r.etat.notes, []); assert.ok(r.corrompu);
});
