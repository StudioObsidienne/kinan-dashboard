// Tests du pop-up « Nouvelle mise à jour » (node --test test/) : une seule annonce par version. Aucun réseau, aucun git.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aAnnoncer, marquerAnnonce, cachePerime, doitRevérifier, GARDE_FORCEE } = require('../mise-a-jour');

test('cache périmé : installée strictement supérieure à la distante', () => {
  const e = (al, ad, pl, pd) => ({ appli: { locale: al, distante: ad }, plugin: { locale: pl, distante: pd } });
  assert.deepStrictEqual(cachePerime(e('0.4.0', '0.3.1', null, null)), ['appli']);
  assert.deepStrictEqual(cachePerime(e('0.4.0', '0.4.0', '1.2.0', '1.1.9')), ['plugin']);
  assert.deepStrictEqual(cachePerime(e('0.4.0', '0.4.0', '1.0.0', '1.0.1')), []);
  assert.deepStrictEqual(cachePerime(e('1.0.0', '1.0.0-beta', null, null)), ['appli']);
  assert.deepStrictEqual(cachePerime(e('0.4.0', null, '1.0.0', null)), []);
  assert.deepStrictEqual(cachePerime(null), []);
});

test('revérification forcée : garde-fou de 2 min', () => {
  const perime = { appli: { locale: '0.4.0', distante: '0.3.1' }, plugin: { locale: null, distante: null } };
  const sain = { appli: { locale: '0.3.1', distante: '0.3.1' }, plugin: { locale: null, distante: null } };
  assert.strictEqual(doitRevérifier(perime, null, 1000), true);
  assert.strictEqual(doitRevérifier(perime, 1000, 1000 + GARDE_FORCEE - 1), false);
  assert.strictEqual(doitRevérifier(perime, 1000, 1000 + GARDE_FORCEE), true);
  assert.strictEqual(doitRevérifier(sain, null, 1000), false);
});

const etat = (appli, plugin) => ({
  appli: { locale: '0.1.0', distante: appli, nouvelle: !!appli },
  plugin: { locale: '1.0.0', distante: plugin, nouvelle: !!plugin }
});

test('nouvelle version jamais annoncée : pop-up', () => {
  assert.deepStrictEqual(aAnnoncer(etat('0.2.0', null), {}), ['appli']);
  assert.deepStrictEqual(aAnnoncer(etat('0.2.0', '1.1.0'), undefined), ['appli', 'plugin']);
});

test('une seule fois par version : après marquage, plus de pop-up pour cette version', () => {
  const e = etat('0.2.0', '1.1.0');
  const deja = marquerAnnonce(e, {});
  assert.deepStrictEqual(deja, { appli: '0.2.0', plugin: '1.1.0' });
  assert.deepStrictEqual(aAnnoncer(e, deja), []);
  assert.deepStrictEqual(marquerAnnonce(e, deja), deja); // marquer de nouveau ne change rien
});

test('version suivante publiée : nouveau pop-up, seulement pour ce qui a changé', () => {
  const deja = { appli: '0.2.0', plugin: '1.1.0' };
  assert.deepStrictEqual(aAnnoncer(etat('0.3.0', '1.1.0'), deja), ['appli']);
});

test('rien de nouveau ou état invalide : pas de pop-up', () => {
  assert.deepStrictEqual(aAnnoncer(etat(null, null), {}), []);
  assert.deepStrictEqual(aAnnoncer(null, {}), []);
  assert.deepStrictEqual(aAnnoncer({ appli: { nouvelle: true, distante: null } }, {}), []);
});
