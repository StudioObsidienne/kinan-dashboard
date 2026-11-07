// Logique pure du sommeil de Drafion (src/eggs/sommeil-logique.js), sans DOM.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/eggs/sommeil-logique.js');
const MIN = 60000;

test('palier : seuils 10, 20, 30 min', () => {
  assert.strictEqual(L.palier(0), 0);
  assert.strictEqual(L.palier(9 * MIN + 59000), 0);
  assert.strictEqual(L.palier(10 * MIN), 1);
  assert.strictEqual(L.palier(19 * MIN + 59000), 1);
  assert.strictEqual(L.palier(20 * MIN), 2);
  assert.strictEqual(L.palier(29 * MIN + 59000), 2);
  assert.strictEqual(L.palier(30 * MIN), 3);
  assert.strictEqual(L.palier(5 * 60 * MIN), 3);
});

test('palier : inactivité négative ou invalide traitée comme 0', () => {
  assert.strictEqual(L.palier(-5 * MIN), 0);
  assert.strictEqual(L.palier(NaN), 0);
  assert.strictEqual(L.palier(undefined), 0);
});

test('inactivité : travail puis repos repart de la sortie, repos successifs ne remettent rien à zéro', () => {
  let s = L.creerSuivi('travail', 1000);
  assert.strictEqual(L.inactivite(s, 1000 + 50 * MIN), 0, 'actif : jamais inactif');
  s = L.observer(s, 'repos', 5000);
  assert.strictEqual(s.dernier, 5000);
  assert.strictEqual(L.inactivite(s, 5000 + 12 * MIN), 12 * MIN);
  const s2 = L.observer(s, 'repos', 5000 + 8 * MIN);
  assert.strictEqual(s2.dernier, 5000, 'repos successifs : horodatage inchangé');
  assert.strictEqual(L.inactivite(s2, 5000 + 12 * MIN), 12 * MIN);
  const s3 = L.observer(s2, 'doute', 9000);
  assert.strictEqual(L.inactivite(s3, 9000 + MIN), 0);
});

test('inactivité : horloge reculée = 0, horodatage stocké futur ou absent = pas de sommeil instantané', () => {
  const s = { etat: 'repos', dernier: 10000 };
  assert.strictEqual(L.inactivite(s, 5000), 0);
  assert.strictEqual(L.creerSuivi('repos', 50000, undefined).dernier, 50000);
  assert.strictEqual(L.creerSuivi('repos', 50000, 90000).dernier, 50000);
  assert.strictEqual(L.creerSuivi('repos', 50000, 20000).dernier, 20000);
  assert.strictEqual(L.creerSuivi('travail', 50000, 20000).dernier, 50000);
});

test('ronflementDu : faux avant 20 min, vrai une fois à 20, 30, 40 min', () => {
  assert.strictEqual(L.ronflementDu(19 * MIN + 59000, 0), false);
  let dernier = 0, n = 0;
  for (let t = 0; t <= 45 * MIN; t += 1000) {
    if (L.ronflementDu(t, dernier)) { n++; dernier = t; assert.ok([20, 30, 40].includes(t / MIN), 'instant ' + t / MIN); }
  }
  assert.strictEqual(n, 3);
  assert.strictEqual(L.ronflementDu(20 * MIN, 20 * MIN), false, 'jamais deux fois pour le même multiple');
  assert.strictEqual(L.ronflementDu(25 * MIN, 20 * MIN + 500), false);
});

test('respiration : période 4 s dans [0, 1], constante en mode calme', () => {
  for (let t = 0; t < 8000; t += 50) {
    const v = L.respiration(t, false);
    assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(v - L.respiration(t + 4000, false)) < 1e-9);
  }
  assert.ok(Math.abs(L.respiration(1000, false) - 1) < 1e-9);
  assert.ok(Math.abs(L.respiration(3000, false)) < 1e-9);
  assert.strictEqual(L.respiration(1234, true), 0.5);
  assert.strictEqual(L.respiration(4321, true), 0.5);
});

test('reveil : 0 à 0 ms, 1 à 600 ms, monotone, instantané en mode calme', () => {
  assert.strictEqual(L.reveil(0), 0);
  assert.strictEqual(L.reveil(600), 1);
  assert.strictEqual(L.reveil(5000), 1);
  let prec = -1;
  for (let t = 0; t <= 700; t += 10) { const v = L.reveil(t); assert.ok(v >= prec); prec = v; }
  assert.strictEqual(L.reveil(0, true), 1);
});

test('fonte : 0 avant 10 min, 1 à 30 min, croissante entre les deux ; nez : 0 avant 30 min', () => {
  assert.strictEqual(L.fonte(9 * MIN), 0);
  assert.strictEqual(L.fonte(30 * MIN), 1);
  assert.strictEqual(L.fonte(90 * MIN), 1);
  let prec = -1;
  for (let m = 0; m <= 31; m += 0.5) { const v = L.fonte(m * MIN); assert.ok(v >= prec); prec = v; }
  assert.ok(L.fonte(20 * MIN) > 0.4 && L.fonte(20 * MIN) < 0.6);
  assert.strictEqual(L.nez(29 * MIN), 0);
  assert.strictEqual(L.nez(32 * MIN), 1);
});

test('vitesse : horlogeAcceleree multiplie l\'écart, vitesse invalide ramenée à 1', () => {
  assert.strictEqual(L.horlogeAcceleree(1000, 1000 + 10000, 60), 1000 + 600000);
  assert.strictEqual(L.horlogeAcceleree(1000, 6000, 1), 6000);
  for (const v of [0, -3, 601, NaN, undefined, 'abc']) assert.strictEqual(L.horlogeAcceleree(1000, 6000, v), 6000);
  assert.strictEqual(L.horlogeAcceleree(0, 10, 600), 6000);
});

test('cycle respiratoire : inspiration quand le souffle monte, prochaines inspiration et expiration', () => {
  for (let t = 0; t < 8000; t += 50) {
    const monte = L.respiration(t + 1, false) > L.respiration(t, false);
    if (Math.abs((t % 4000) - 1000) > 60 && Math.abs((t % 4000) - 3000) > 60) assert.strictEqual(L.inspire(t), monte, 'instant ' + t);
  }
  assert.strictEqual(L.prochaineInspiration(0), 3000);
  assert.strictEqual(L.prochaineInspiration(3000), 3000);
  assert.strictEqual(L.prochaineInspiration(3001), 7000);
  assert.strictEqual(L.prochaineExpiration(1500), 5000);
  assert.ok(Math.abs(L.respiration(L.prochaineInspiration(123456), false)) < 1e-9, 'inspiration : souffle au plus bas');
});

test('déformation : identité sans fonte, tassement et étalement progressifs, étirement à volume à peu près constant', () => {
  const p0 = L.profil(0, 0.9, 27);
  assert.deepStrictEqual(p0, { H: 27, p: 1, w0: 1 }, 'forme d\'origine, la respiration ne la touche pas');
  for (let q = 0; q <= 1; q += 0.05) { assert.ok(Math.abs(L.ligneSource(q, 1) - q) < 1e-12); assert.strictEqual(L.largeur(q, 1), 1); }
  let avant = 28;
  for (let f = 0; f <= 1; f += 0.1) { const p = L.profil(f, 0.5, 27); assert.ok(p.H <= avant && p.p >= 1); avant = p.H; }
  const fondu = L.profil(1, 0.5, 27);
  assert.ok(fondu.H > 12 && fondu.H < 17, 'affaissé de près de moitié');
  assert.ok(L.largeur(1, fondu.p) > 1.7 && L.largeur(0, fondu.p) === 1, 'la tête garde sa largeur, le bas s\'étale');
  for (let s = 0; s <= 1; s += 0.1) assert.ok(Math.abs(L.ligneSource(L.ligneDest(s, fondu.p), fondu.p) - s) < 1e-9, 'inverse');
  let prec = -1; for (let q = 0; q <= 1; q += 0.02) { const v = L.ligneSource(q, fondu.p); assert.ok(v >= prec); prec = v; }
  assert.ok(L.profil(1, 1, 27).H > L.profil(1, 0, 27).H, 'l\'inspiration soulève le corps fondu');
  assert.ok(L.profil(1, 0, 27).w0 > L.profil(1, 1, 27).w0, 'l\'expiration l\'élargit');
  const et = L.profil(-0.5, 0.5, 27);
  assert.ok(et.H > 27 && et.w0 < 1 && et.p === 1);
  assert.deepStrictEqual(L.profil(NaN, NaN, NaN), { H: 27, p: 1, w0: 1 });
});

test('réveil brutal : part de la fonte, se reconstitue vite en dépassant, sursaute, panique, puis reprend sa forme', () => {
  const f0 = 0.9;
  assert.ok(Math.abs(L.reveilBrutal(0, f0, false).def - f0) < 1e-9, 'aucun saut à l\'instant du réveil');
  assert.ok(L.reveilBrutal(100, f0, false).def < 0.1, 'forme retrouvée en 100 ms');
  let etire = 0, saut = 0, prec = L.reveilBrutal(0, f0, false).def;
  for (let t = 10; t < L.DUREE_BRUTAL; t += 10) {
    const p = L.reveilBrutal(t, f0, false);
    if (t < 1000) assert.ok(Math.abs(p.def - prec) < 0.25, 'continu à ' + t);
    etire = Math.min(etire, p.def); saut = Math.max(saut, p.saut); prec = p.def;
  }
  assert.ok(etire < -0.2, 'dépassement : étiré');
  assert.ok(saut >= 4, 'sursaut');
  assert.strictEqual(L.reveilBrutal(50, f0, false).yeux, 'grand');
  assert.strictEqual(L.reveilBrutal(200, f0, false).excl, true);
  const regards = new Set(); for (let t = 400; t < 1000; t += 70) regards.add(L.reveilBrutal(t, f0, false).lx);
  assert.ok(regards.has(1) && regards.has(-1), 'regards affolés');
  const fin = L.reveilBrutal(L.DUREE_BRUTAL - 1, f0, false);
  assert.ok(Math.abs(fin.def) < 0.01 && fin.saut === 0 && fin.yeux === 'ouvert');
  assert.strictEqual(L.reveilBrutal(L.DUREE_BRUTAL, f0, false).fini, true);
  assert.strictEqual(L.reveilBrutal(10, f0, true).fini, true, 'mode calme : instantané');
  assert.strictEqual(L.reveilBrutal(NaN, NaN, false).fini, false);
});
