// Tests du pop-up « Nouvelle mise à jour » (node --test test/) : une seule annonce par version. Aucun réseau, aucun git.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aAnnoncer, marquerAnnonce } = require('../mise-a-jour');

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
