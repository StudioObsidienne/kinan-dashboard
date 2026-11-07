'use strict';
const test = require('node:test');
const assert = require('node:assert');
const r = require('../raccourci-demarrage');

test('raccourci : rien hors Windows', () => {
  assert.strictEqual(r.commande('linux', '/x'), null);
  assert.strictEqual(r.lancer('darwin', '/x', () => assert.fail('ne doit pas lancer')), false);
});
test('raccourci : lance le script sur Windows, erreurs ignorées', () => {
  let vu = null;
  assert.strictEqual(r.lancer('win32', 'C:\app', (exe, args) => { vu = { exe, args }; return { on() {}, unref() {} }; }), true);
  assert.ok(vu.args.some((a) => /raccourci\.ps1$/.test(a)));
  assert.strictEqual(r.lancer('win32', 'C:\app', () => { throw new Error('boom'); }), false);
});
