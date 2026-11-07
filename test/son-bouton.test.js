// Logique du bouton « son » des easter eggs, avec le vrai socle et un faux localStorage.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../src/eggs/son-bouton-logique.js');
const { creer } = require('../src/egg-core.js');

function stockage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
}
const faire = (ls) => creer({ localStorage: ls, location: { search: '' }, document: null, KinanEquipe: null, console: { warn() {} }, maintenant: () => 1000 });

test('etat reflète muet', () => {
  assert.deepStrictEqual(L.etat(true), { actif: false, pressed: 'false', label: L.TEXTES.coupe });
  assert.deepStrictEqual(L.etat(false), { actif: true, pressed: 'true', label: L.TEXTES.actif });
});
test('muet par défaut, bascule active puis coupe, persistance entre lancements', () => {
  const ls = stockage();
  const a = faire(ls);
  assert.strictEqual(a.muet(), true);
  assert.strictEqual(L.basculer(a.muet).actif, true);
  assert.strictEqual(ls._m.get(L.CLE), '0');
  assert.strictEqual(faire(ls).muet(), false); // nouveau lancement
  assert.strictEqual(L.basculer(a.muet).actif, false);
  assert.strictEqual(faire(ls).muet(), true);
});
test('la clé est celle du socle (synchronisation avec le reste des eggs)', () => {
  assert.strictEqual(L.CLE, faire(stockage()).PREFIXE + 'muet');
});
test('index.html charge le bouton après le socle', () => {
  const h = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  assert.ok(h.indexOf('eggs/son-bouton.js') > h.indexOf('egg-core.js'));
  assert.ok(h.includes('eggs/son-bouton-logique.js'));
  assert.ok(h.includes('.btn-egg-son:focus-visible'));
});
