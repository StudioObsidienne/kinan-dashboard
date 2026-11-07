// Socle des easter eggs (src/egg-core.js) avec faux localStorage et fausse scène, plus contrôle statique des sources.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { creer } = require('../src/egg-core.js');

function fauxStockage(extra) {
  const m = new Map(Object.entries(extra || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m
  };
}
function fausseScene(etats) {
  const dessins = [];
  return {
    dessins,
    agents: () => Object.keys(etats).map((cle) => ({ cle, cx: 70, haut: 138, s: 1 })),
    etat: (k) => ({ ...etats[k] }), calme: () => false, dim: { W: 400, H: 270, DY: 18 }, ID_DE: { drafion: 'drafion' },
    surDessin: (fn) => dessins.push(fn), salir() {}
  };
}
const sansBruit = { warn() {} };
function env(extra) {
  return Object.assign({ localStorage: fauxStockage(), location: { search: '' }, document: null,
    KinanEquipe: fausseScene({ drafion: { etat: 'repos', maj: 1 } }), console: sansBruit, maintenant: () => 1000 }, extra);
}

test('stock : préfixe kinan-os.egg. appliqué', () => {
  const ls = fauxStockage();
  const egg = creer(env({ localStorage: ls }));
  let st;
  egg.module('essai', (api) => { st = api.stock; });
  st.set('a', { x: 1 });
  assert.ok(ls._m.has('kinan-os.egg.essai.a'));
  assert.deepStrictEqual(st.get('a', null), { x: 1 });
  assert.strictEqual(st.get('absent', 42), 42);
});

test('stock : défaut si la clé est corrompue ou si localStorage lève', () => {
  const ls = fauxStockage({ 'kinan-os.egg.essai.cassee': '{pas du json' });
  let egg = creer(env({ localStorage: ls }));
  let st;
  egg.module('essai', (api) => { st = api.stock; });
  assert.strictEqual(st.get('cassee', 'defaut'), 'defaut');
  const bloque = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, length: 1 };
  egg = creer(env({ localStorage: bloque }));
  egg.module('essai', (api) => { st = api.stock; });
  assert.strictEqual(st.get('k', 7), 7);
  assert.strictEqual(st.set('k', 1), false);
  assert.strictEqual(egg.muet(), true, 'muet par défaut même sans stockage');
});

test('un module qui lève dans init n\'empêche pas les suivants', () => {
  const egg = creer(env());
  const vus = [];
  assert.strictEqual(egg.module('casse', () => { throw new Error('boum'); }), false);
  assert.strictEqual(egg.module('bon', () => { vus.push('bon'); }), true);
  assert.deepStrictEqual(vus, ['bon']);
  assert.deepStrictEqual(egg.modules(), { actifs: ['bon'], desactives: ['casse'] });
});

test('module désactivé par kinan-os.egg.<nom>.actif', () => {
  const egg = creer(env({ localStorage: fauxStockage({ 'kinan-os.egg.coupe.actif': 'false' }) }));
  let appele = false;
  assert.strictEqual(egg.module('coupe', () => { appele = true; }), false);
  assert.strictEqual(appele, false);
});

test('muet par défaut ; levé seulement par ?egg-son=1 (session) ou par muet(false)', () => {
  assert.strictEqual(creer(env()).muet(), true);
  assert.strictEqual(creer(env({ location: { search: '?egg-son=1' } })).muet(), false);
  const ls = fauxStockage();
  const egg = creer(env({ localStorage: ls }));
  egg.muet(false);
  assert.strictEqual(egg.muet(), false);
  assert.strictEqual(ls.getItem('kinan-os.egg.muet'), '0');
});

test('vitesse : ?egg-vitesse=60 accélère l\'horloge, plage 1..600, sinon 1', () => {
  let maintenant = 1000;
  const egg = creer(env({ location: { search: '?egg-vitesse=60' }, maintenant: () => maintenant }));
  assert.strictEqual(egg.vitesse(), 60);
  maintenant = 1000 + 10000;
  assert.strictEqual(egg.horloge(), 1000 + 600000);
  for (const q of ['?egg-vitesse=0', '?egg-vitesse=601', '?egg-vitesse=abc', '', '?egg-vitesse=']) {
    assert.strictEqual(creer(env({ location: { search: q } })).vitesse(), 1, q);
  }
});

test('egg-reset=1 efface kinan-os.egg.* seulement avec egg-vitesse, et jamais les autres clés', () => {
  const base = { 'kinan-os.egg.a.b': '1', 'kinan-os.egg.muet': '0', 'kinan-os.eco-vu': '123', autre: 'x' };
  const ls = fauxStockage(base);
  creer(env({ localStorage: ls, location: { search: '?egg-reset=1' } }));
  assert.strictEqual(ls._m.size, 4, 'reset seul : rien n\'est effacé');
  creer(env({ localStorage: ls, location: { search: '?egg-vitesse=60&egg-reset=1' } }));
  assert.deepStrictEqual([...ls._m.keys()].sort(), ['autre', 'kinan-os.eco-vu']);
});

test('etats : copie gelée ; surChangement signale les passages d\'état via la scène', () => {
  const etats = { drafion: { etat: 'repos', maj: 1 } };
  const scene = fausseScene(etats);
  const egg = creer(env({ KinanEquipe: scene }));
  const recus = [];
  egg.module('obs', (api) => {
    const copie = api.etats();
    assert.ok(Object.isFrozen(copie) && Object.isFrozen(copie.drafion));
    assert.strictEqual(copie.drafion.etat, 'repos');
    api.surChangement((cle, avant, apres) => recus.push([cle, avant, apres]));
  });
  const verif = scene.dessins[scene.dessins.length - 1];
  verif(null, 0);
  assert.deepStrictEqual(recus, []);
  etats.drafion.etat = 'travail'; verif(null, 0);
  etats.drafion.etat = 'travail'; verif(null, 0);
  etats.drafion.etat = 'repos'; verif(null, 0);
  assert.deepStrictEqual(recus, [['drafion', 'repos', 'travail'], ['drafion', 'travail', 'repos']]);
});

test('un dessin qui lève est coupé seul, sans propager l\'erreur', () => {
  const scene = fausseScene({ drafion: { etat: 'repos', maj: 1 } });
  const egg = creer(env({ KinanEquipe: scene }));
  let appels = 0;
  egg.module('dessine', (api) => { api.dessin(() => { appels++; throw new Error('x'); }); });
  const fn = scene.dessins[0];
  assert.doesNotThrow(() => { fn({}, 0); fn({}, 1); });
  assert.strictEqual(appels, 1);
});

test('contrôle statique : aucun réseau, aucun fichier d\'état dans le socle et les modules', () => {
  const dossier = path.join(__dirname, '..', 'src');
  const fichiers = [path.join(dossier, 'egg-core.js'),
    ...fs.readdirSync(path.join(dossier, 'eggs')).filter((f) => f.endsWith('.js')).map((f) => path.join(dossier, 'eggs', f))];
  assert.ok(fichiers.length >= 3);
  const interdits = ['fet' + 'ch(', 'XMLHttp' + 'Request', 'Web' + 'Socket', 'state' + '.json', 'ht' + 'tp://', 'ht' + 'tps://'];
  for (const f of fichiers) {
    const src = fs.readFileSync(f, 'utf8');
    for (const mot of interdits) assert.ok(!src.includes(mot), `${path.basename(f)} contient ${mot}`);
    assert.ok(!/window\.kinan\.(?!surEtat)\w+\s*\(/.test(src), `${path.basename(f)} appelle un IPC autre que surEtat`);
  }
});
