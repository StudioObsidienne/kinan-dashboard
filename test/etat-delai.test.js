'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { DELAI_ERREUR_MS, DELAI_ABANDON_MS, appliquerDelais } = require('../etat-delai.js');
const mk = (a) => ({ agents: { kinan: a } });

test('erreur affichée jusqu\'à 20 s, puis repos sans nouvel évènement', () => {
  const t0 = 1e6;
  assert.strictEqual(appliquerDelais(mk({ etat: 'erreur', tache: 'x', maj: t0 }), t0 + DELAI_ERREUR_MS).agents.kinan.etat, 'erreur');
  const r = appliquerDelais(mk({ etat: 'erreur', tache: 'x', maj: t0 }), t0 + DELAI_ERREUR_MS + 1).agents.kinan;
  assert.deepStrictEqual([r.etat, r.tache], ['repos', '']);
});
test('erreur sans horodatage : comptée depuis la première observation', () => {
  const vus = new Map(), t0 = 5e6;
  assert.strictEqual(appliquerDelais(mk({ etat: 'erreur', tache: 'x' }), t0, vus).agents.kinan.etat, 'erreur');
  assert.strictEqual(appliquerDelais(mk({ etat: 'erreur', tache: 'x' }), t0 + 10000, vus).agents.kinan.etat, 'erreur');
  assert.strictEqual(appliquerDelais(mk({ etat: 'erreur', tache: 'x' }), t0 + DELAI_ERREUR_MS + 1, vus).agents.kinan.etat, 'repos');
});
test('nouvelle erreur après retour au travail : délai repart', () => {
  const vus = new Map();
  appliquerDelais(mk({ etat: 'erreur', tache: 'a' }), 0, vus);
  appliquerDelais(mk({ etat: 'travail', tache: 'b' }), 10000, vus);
  assert.strictEqual(appliquerDelais(mk({ etat: 'erreur', tache: 'a' }), 30000, vus).agents.kinan.etat, 'erreur');
});
test('travail sans nouvelle depuis 15 min : repos ; travail récent : inchangé', () => {
  assert.strictEqual(appliquerDelais(mk({ etat: 'travail', maj: 0 + 1 }), DELAI_ABANDON_MS + 2).agents.kinan.etat, 'repos');
  assert.strictEqual(appliquerDelais(mk({ etat: 'travail', maj: 1000 }), 2000).agents.kinan.etat, 'travail');
});
