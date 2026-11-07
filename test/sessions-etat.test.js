'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listerSessions, etatSession, fusionner, chargeRendu, choixValide } = require('../sessions-etat.js');

const NOW = 1e12;
const dossier = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kinan-sess-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('fusion « Toutes » : erreur > doute > travail > repos, tâche la plus récente, exemplaires concaténés', () => {
  const A = { agents: { kinan: { etat: 'travail', tache: 'a', maj: 5 }, skyze: { etat: 'travail', tache: 'page A', maj: 10, instances: [{ id: 'x1' }] }, drafion: { etat: 'repos', tache: '', maj: 50 } } };
  const B = { agents: { kinan: { etat: 'doute', tache: 'q', maj: 1, question: { texte: 'Oui ?', options: [] } }, skyze: { etat: 'travail', tache: 'page B', maj: 20, instances: [{ id: 'x2' }] }, drafion: { etat: 'erreur', tache: 'oups', maj: 2 } } };
  const f = fusionner([{ libelle: 'site', etat: A }, { libelle: 'api', etat: B }]);
  assert.strictEqual(f.agents.kinan.etat, 'doute');
  assert.strictEqual(f.agents.kinan.question.session, 'api', 'la question porte le libellé de sa conversation');
  assert.strictEqual(f.agents.drafion.etat, 'erreur');
  assert.strictEqual(f.agents.skyze.tache, 'page B', 'à priorité égale : la plus récente');
  assert.deepStrictEqual(f.agents.skyze.instances.map((i) => i.id), ['x1', 'x2']);
  assert.ok(!('transcript' in f) && !('session' in f));
  assert.deepStrictEqual(fusionner([null, { agents: null }, 'x']), { agents: {} });
});

test('libellés : nom du dossier, doublon « projet · 2 », renommage, jamais de chemin', () => {
  const reg = {
    a: { projet: 'site', cwd: 'C:/x/site', transcript: 'C:/t/a.jsonl', etat: 'travail', maj: NOW - 1000, debut: 1 },
    b: { projet: 'site', cwd: 'D:/y/site', etat: 'doute', maj: NOW - 2000, debut: 2 },
    c: { projet: 'api', etat: 'repos', maj: NOW - 1000, debut: 3 },
    d: { projet: 'vieux', etat: 'repos', maj: NOW - 16 * 60000, debut: 4 },
    e: { projet: 'fini', etat: 'travail', maj: NOW, debut: 5, fin: NOW },
    '../x': { projet: 'piege', etat: 'travail', maj: NOW }
  };
  const etats = { a: { agents: { kinan: { etat: 'travail' }, skyze: { etat: 'travail', instances: [{}, {}] }, drafion: { etat: 'travail' } } } };
  const l = listerSessions(reg, { c: '  Ma conversation  ' }, NOW, etats);
  assert.deepStrictEqual(l.map((s) => s.libelle), ['site', 'site · 2', 'Ma conversation']);
  assert.deepStrictEqual(l.map((s) => s.id), ['a', 'b', 'c'], 'terminée, repos depuis 15 min et identifiant invalide : masqués');
  assert.strictEqual(l[0].actifs, 3, 'exemplaires comptés, juge exclu');
  for (const s of l) assert.deepStrictEqual(Object.keys(s).sort(), ['actifs', 'etat', 'id', 'libelle', 'maj']);
  assert.ok(!JSON.stringify(l).includes(':/'));
  assert.deepStrictEqual(listerSessions(null, null, NOW), []);
});

test('repli sans sessions/ : etatSession rend null (le tableau de bord lit alors state.json)', (t) => {
  const d = dossier(t);
  assert.strictEqual(etatSession(d, 'conv-A'), null);
  fs.mkdirSync(path.join(d, 'sessions'));
  fs.writeFileSync(path.join(d, 'sessions', 'conv-A.json'), JSON.stringify({ agents: { skyze: { etat: 'travail' } } }));
  fs.writeFileSync(path.join(d, 'sessions', 'conv-B.json'), 'null');
  assert.strictEqual(etatSession(d, 'conv-A').agents.skyze.etat, 'travail');
  assert.strictEqual(etatSession(d, 'conv-B'), null);
  assert.strictEqual(etatSession(d, '../state'), null);
  assert.strictEqual(etatSession(d, { toString: () => 'conv-A' }), null);
});

test('repli : conversation choisie disparue -> « recente » ; « toutes » et « recente » conservés ; choix validé', () => {
  const s = (id) => ({ id, libelle: id, etat: 'travail', actifs: 1, maj: 1, cwd: 'C:/x', transcript: 'C:/t.jsonl' });
  const liste = [s('a'), s('b')];
  assert.deepStrictEqual(chargeRendu(liste, 'a'), { choisie: 'a', repli: false, sessions: ['a', 'b'].map((id) => ({ id, libelle: id, etat: 'travail', actifs: 1, maj: 1 })) });
  assert.deepStrictEqual([chargeRendu([s('b'), s('c')], 'a').choisie, chargeRendu([s('b'), s('c')], 'a').repli], ['recente', true]);
  assert.strictEqual(chargeRendu(liste, 'toutes').choisie, 'toutes');
  assert.strictEqual(chargeRendu([s('a')], 'toutes').choisie, 'recente', 'une seule conversation : affichage de 0.3.1');
  assert.strictEqual(chargeRendu([s('a')], 'a').repli, false);
  assert.strictEqual(chargeRendu([], 'recente').repli, false);
  assert.strictEqual(chargeRendu(liste, '../x').choisie, 'recente');
  assert.ok(choixValide('a', liste) && choixValide('toutes', []) && choixValide('recente', []));
  for (const x of ['z', '../a', '', null, 3, { id: 'a' }]) assert.ok(!choixValide(x, liste), String(x));
});

test('charge IPC limitée aux 5 clés : aucun cwd ni transcript envoyé au rendu', () => {
  const reg = { a: { projet: 'site', cwd: 'C:/secret/site', transcript: 'C:/secret/a.jsonl', etat: 'travail', maj: NOW, debut: 1, tache: 'skyze : x' } };
  const d = chargeRendu(listerSessions(reg, {}, NOW, {}), 'recente');
  for (const s of d.sessions) assert.deepStrictEqual(Object.keys(s).sort(), ['actifs', 'etat', 'id', 'libelle', 'maj']);
  assert.ok(!JSON.stringify(d).includes('secret'));
});
