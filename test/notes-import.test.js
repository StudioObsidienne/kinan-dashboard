// Bloc-notes : import de fichiers texte (.txt, .md) : encodages, limites, résumé, lecture seule.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../notes-logique');
const I = require('../notes-import');

let compteur = 0;
const opts = () => ({ now: Date.parse('2026-11-10T10:00:00Z'), genId: () => 'imp' + String(++compteur).padStart(4, '0') });
const fichier = (nom, octets) => ({ nom, octets: Buffer.isBuffer(octets) ? octets : Buffer.from(octets, 'utf8') });

test('import UTF-8 : une note par fichier, titre = nom sans extension, texte intact', () => {
  const r = I.importer(L.vide(), [fichier('Idées de site.txt', 'Premier jet\r\nsuite éàç'), fichier('notes.md', '# Plan\n\n- a\n- b')], {}, opts());
  assert.strictEqual(r.importees, 2);
  assert.strictEqual(r.ignorees.length, 0);
  const [a, b] = r.etat.notes;
  assert.strictEqual(a.titre, 'Idées de site');
  assert.strictEqual(a.texte, 'Idées de site\n\nPremier jet\nsuite éàç');
  assert.strictEqual(b.titre, 'notes');
  assert.ok(b.texte.endsWith('# Plan\n\n- a\n- b'));
  assert.strictEqual(r.message, '2 importées.');
});

test('import : le titre n\'est pas dupliqué si la première ligne est déjà le nom du fichier', () => {
  const r = I.importer(L.vide(), [fichier('Plan.md', '# Plan\n\ncorps')], {}, opts());
  assert.strictEqual(r.etat.notes[0].texte, '# Plan\n\ncorps');
  assert.strictEqual(r.etat.notes[0].titre, 'Plan');
});

test('import UTF-8 avec BOM : BOM retiré', () => {
  const r = I.importer(L.vide(), [fichier('bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Été chaud', 'utf8')]))], {}, opts());
  assert.strictEqual(r.importees, 1);
  assert.ok(!r.etat.notes[0].texte.includes('﻿'));
  assert.ok(r.etat.notes[0].texte.endsWith('Été chaud'));
});

test('import Windows-1252 : accents et euro décodés', () => {
  // « café à 5 € » en Windows-1252 : é = E9, à = E0, € = 80
  const r = I.importer(L.vide(), [fichier('ancien.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0xe0, 0x20, 0x35, 0x20, 0x80]))], {}, opts());
  assert.strictEqual(r.importees, 1);
  assert.ok(r.etat.notes[0].texte.endsWith('café à 5 €'), r.etat.notes[0].texte);
  assert.strictEqual(I.decoderTexte(Buffer.from([0xe9])).encodage, 'windows-1252');
  assert.strictEqual(I.decoderTexte(Buffer.from('é', 'utf8')).encodage, 'utf-8');
});

test('import : trop gros, trop long, vide, binaire, mauvais format sont ignorés et signalés', () => {
  const gros = Buffer.alloc(I.IMPORT.octets + 1, 0x61);
  const long = Buffer.from('a'.repeat(L.LIMITES.texte + 1));
  const limite = Buffer.from('a'.repeat(L.LIMITES.texte - 'limite'.length - 2));
  const r = I.importer(L.vide(), [
    fichier('gros.txt', gros), fichier('long.txt', long), fichier('vide.txt', ''), fichier('blancs.md', ' \r\n\t \n'),
    fichier('image.txt', Buffer.from([0x89, 0x50, 0x00, 0x47])), fichier('doc.docx', 'x'), fichier('ok.txt', 'bon'), fichier('limite.txt', limite)
  ], {}, opts());
  assert.strictEqual(r.importees, 2, 'ok.txt et le fichier pile à la limite');
  const raisons = Object.fromEntries(r.ignorees.map((x) => [x.nom, x.raison]));
  assert.strictEqual(raisons['gros.txt'], I.RAISONS.gros);
  assert.strictEqual(raisons['long.txt'], I.RAISONS.long);
  assert.strictEqual(raisons['vide.txt'], I.RAISONS.vide);
  assert.strictEqual(raisons['blancs.md'], I.RAISONS.vide);
  assert.strictEqual(raisons['image.txt'], I.RAISONS.binaire);
  assert.strictEqual(raisons['doc.docx'], I.RAISONS.extension);
  assert.ok(r.etat.notes.every((n) => n.texte.length <= L.LIMITES.texte));
  assert.match(r.message, /^2 importées, 6 ignorées \(/);
  assert.match(r.message, /plus de 1 Mo : gros\.txt/);
  assert.match(r.message, /plus de 100 000 caractères : long\.txt/);
});

test('import : taille annoncée sans contenu = refusée, jamais crue en silence', () => {
  const e = I.entreeRendu({ nom: 'enorme.txt', taille: 5 * 1024 * 1024, octets: null });
  assert.strictEqual(I.evaluer(e).raison, I.RAISONS.gros);
  assert.strictEqual(I.evaluer(I.entreeRendu({ nom: 'x.txt', taille: 10, octets: 'pas un buffer' })).raison, I.RAISONS.illisible);
  const faux = I.entreeRendu({ nom: 'menteur.txt', taille: 3, octets: new Uint8Array(I.IMPORT.octets + 1).fill(97).buffer });
  assert.strictEqual(I.evaluer(faux).raison, I.RAISONS.gros, 'la taille réelle des octets prime sur la taille annoncée');
  assert.strictEqual(I.evaluer(I.entreeRendu(null)).ok, false);
});

test('import : rangé dans le dossier courant ; lieu inconnu = rien d\'importé', () => {
  let e = L.vide();
  const p = L.appliquer(e, { type: 'creerProjet', nom: 'Client' }, opts()); e = p.etat;
  const d = L.appliquer(e, { type: 'creerDossier', projet: p.id, nom: 'Devis' }, opts()); e = d.etat;
  const r = I.importer(e, [fichier('a.txt', 'A')], { dossier: d.id }, opts());
  assert.strictEqual(r.etat.notes[0].dossier, d.id);
  assert.strictEqual(r.etat.notes[0].projet, p.id);
  const mauvais = I.importer(e, [fichier('a.txt', 'A')], { dossier: 'inconnu1' }, opts());
  assert.strictEqual(mauvais.importees, 0);
  assert.strictEqual(mauvais.etat.notes.length, 0);
  assert.strictEqual(mauvais.ignorees.length, 1);
  assert.strictEqual(e.notes.length, 0, 'l\'état d\'origine n\'est pas modifié');
});

test('import : maximum de notes respecté, reste signalé', () => {
  const etat = L.vide();
  etat.notes = Array.from({ length: L.LIMITES.notes - 1 }, (_, i) => ({ id: 'plein' + String(i).padStart(5, '0'), projet: null, dossier: null, titre: 't', texte: 't', cree: '2026-01-01T00:00:00.000Z', modif: '2026-01-01T00:00:00.000Z', epinglee: false, supprime: null }));
  const r = I.importer(etat, [fichier('un.txt', 'un'), fichier('deux.txt', 'deux'), fichier('trois.txt', 'trois')], {}, opts());
  assert.strictEqual(r.importees, 1);
  assert.strictEqual(r.etat.notes.length, L.LIMITES.notes);
  assert.strictEqual(r.ignorees.length, 2);
  assert.match(r.message, /1 importée, 2 ignorées \(Limite de 5000 notes atteinte/);
});

test('import : au plus 100 fichiers par lot', () => {
  const r = I.importer(L.vide(), Array.from({ length: 103 }, (_, i) => fichier(`f${i}.txt`, 'x' + i)), {}, opts());
  assert.strictEqual(r.importees, 100);
  assert.strictEqual(r.ignorees.length, 3);
  assert.strictEqual(r.ignorees[0].raison, I.RAISONS.lot);
});

test('import depuis le disque : fichiers lus seulement, jamais réécrits ni supprimés', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kinan-import-'));
  t.after(() => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignoré */ } });
  const f1 = path.join(d, 'a.txt'), f2 = path.join(d, 'grand.md'), f3 = path.join(d, 'x.exe'), f4 = path.join(d, 'absent.txt');
  fs.writeFileSync(f1, 'Bonjour');
  fs.writeFileSync(f2, Buffer.alloc(I.IMPORT.octets + 1, 0x62));
  fs.writeFileSync(f3, 'MZ');
  const avant = [f1, f2, f3].map((f) => [fs.readFileSync(f), fs.statSync(f).mtimeMs]);
  const lus = I.lireFichiers([f1, f2, f3, f4, d]);
  assert.strictEqual(lus[1].octets, undefined, 'fichier trop gros : jamais lu');
  const r = I.importer(L.vide(), lus, {}, opts());
  assert.strictEqual(r.importees, 1);
  assert.strictEqual(r.ignorees.length, 4);
  [f1, f2, f3].forEach((f, i) => { assert.ok(fs.existsSync(f)); assert.ok(fs.readFileSync(f).equals(avant[i][0])); assert.strictEqual(fs.statSync(f).mtimeMs, avant[i][1]); });
  assert.deepStrictEqual(fs.readdirSync(d).sort(), ['a.txt', 'grand.md', 'x.exe']);
});

test('non-régression : début de note pour la liste, titre inchangé', () => {
  assert.strictEqual(L.debutDe('# T\n\nsuite  a\nb'), 'suite a b');
  assert.strictEqual(L.debutDe('seul'), '');
  assert.strictEqual(L.debutDe(''), '');
  const r = L.appliquer(L.vide(), { type: 'creerNote', texte: 'Titre\nle début du texte' }, opts());
  const v = L.vue(r.etat).notes[0];
  assert.strictEqual(v.titre, 'Titre');
  assert.strictEqual(v.debut, 'le début du texte');
});
