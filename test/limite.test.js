// Logique pure de la bulle « limite » (src/limite-logique.js), sans DOM, et garde-fous du flash TOKEN OUT.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../src/limite-logique.js');
const MAINT = 1_700_000_000_000;
const F = (id, libelle, utilise, reprise) => ({ id, libelle, restant: 100 - utilise, reprise });
const rvb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test('critique : la fenêtre la plus consommée gagne, 5 h ou hebdomadaire', () => {
  const cinq = F('five_hour', '5 h', 40, MAINT + 3600e3), sem = F('seven_day', 'semaine', 80, MAINT + 86400e3);
  assert.strictEqual(L.critique([cinq, sem], MAINT), sem);
  assert.strictEqual(L.critique([F('five_hour', '5 h', 97, MAINT + 3600e3), sem], MAINT).id, 'five_hour');
});

test('critique : à égalité, la reprise la plus proche ; fenêtre écoulée ou donnée invalide ignorée', () => {
  const a = F('five_hour', '5 h', 60, MAINT + 7200e3), b = F('seven_day', 'semaine', 60, MAINT + 3600e3);
  assert.strictEqual(L.critique([a, b], MAINT), b);
  assert.strictEqual(L.critique([F('five_hour', '5 h', 99, MAINT - 1), b], MAINT), b);
  assert.strictEqual(L.critique([{ id: 'x', restant: 'abc' }, null, undefined, { libelle: 'y' }], MAINT), null);
  assert.strictEqual(L.critique(undefined, MAINT), null);
  assert.strictEqual(L.critique([], MAINT), null);
});

test('critique : reprise inconnue (null) acceptée', () => {
  assert.strictEqual(L.critique([F('five_hour', '5 h', 30, null)], MAINT).id, 'five_hour');
});

test('niveau : discret jusqu\'à 50 % consommé, puis normal, ambre, rouge, critique', () => {
  assert.strictEqual(L.niveau(0), 'discret');
  assert.strictEqual(L.niveau(50), 'discret');
  assert.strictEqual(L.niveau(50.1), 'normal');
  assert.strictEqual(L.niveau(74.9), 'normal');
  assert.strictEqual(L.niveau(75), 'ambre');
  assert.strictEqual(L.niveau(89.9), 'ambre');
  assert.strictEqual(L.niveau(90), 'rouge');
  assert.strictEqual(L.niveau(96.9), 'rouge');
  assert.strictEqual(L.niveau(97), 'critique');
  assert.strictEqual(L.niveau(NaN), 'discret');
});

test('couleurs : sans halo tant que la bulle est discrète, halo croissant ensuite', () => {
  assert.strictEqual(L.couleurs(0).halo, 0);
  assert.strictEqual(L.couleurs(50).halo, 0);
  let prec = 0;
  for (let u = 51; u <= 100; u++) { const h = L.couleurs(u).halo; assert.ok(h >= prec, 'halo croissant à ' + u); prec = h; }
  assert.strictEqual(L.couleurs(100).halo, 0.6);
});

test('couleurs : dégradé continu (pas de saut de plus de 8 niveaux par pour-cent) et de plus en plus rouge', () => {
  let prec = rvb(L.couleurs(0).fond);
  for (let u = 1; u <= 100; u++) {
    const c = rvb(L.couleurs(u).fond);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(c[i] - prec[i]) <= 8, 'saut à ' + u + ' % (canal ' + i + ')');
    prec = c;
  }
  // l'écart rouge - vert du fond ne diminue pas au-delà de l'ambre (75 -> 100) : la bulle vire au rouge franc
  const rouge = (u) => { const [r, g, b] = rvb(L.couleurs(u).fond); return r - (g + b) / 2; };
  for (let u = 76; u <= 100; u++) assert.ok(rouge(u) >= rouge(u - 1), 'rougeur croissante à ' + u);
  assert.ok(rouge(100) > rouge(0) + 100);
  // repères : neutre loin de la limite, ambre vers 75 %, rouge vers 100 %
  assert.strictEqual(L.couleurs(0).fond, '#1e1a30');
  assert.strictEqual(L.couleurs(75).bord, '#ffb020');
  assert.strictEqual(L.couleurs(100).fond, '#c4182a');
});

test('couleurs : contraste texte/fond d\'au moins 4,5 sur toute la plage (WCAG AA)', () => {
  for (let u = 0; u <= 100; u += 0.5) {
    const c = L.couleurs(u);
    assert.ok(L.contraste(c.texte, c.fond) >= 4.5, 'contraste insuffisant à ' + u + ' % : ' + L.contraste(c.texte, c.fond).toFixed(2));
  }
  assert.ok(L.contraste('#ffffff', '#000000') > 20.9);
});

test('couleurs : entrées invalides ramenées dans 0..100', () => {
  assert.deepStrictEqual(L.couleurs(-30), L.couleurs(0));
  assert.deepStrictEqual(L.couleurs(250), L.couleurs(100));
  assert.deepStrictEqual(L.couleurs(NaN), L.couleurs(0));
});

test('pctTexte : entier au-delà de 10 %, une décimale sous 10 %, virgule française', () => {
  assert.strictEqual(L.pctTexte(80), '80');
  assert.strictEqual(L.pctTexte(79.6), '80');
  assert.strictEqual(L.pctTexte(9.54), '9,5');
  assert.strictEqual(L.pctTexte(3), '3');
  assert.strictEqual(L.pctTexte(0), '0');
});

test('decrire : texte, fenêtre, niveau et infobulle avec l\'heure de reprise', () => {
  const heure = (ms) => 'à ' + (ms - MAINT) / 3600e3 + ' h';
  const d = L.decrire([F('five_hour', '5 h', 90, MAINT + 2 * 3600e3), F('seven_day', 'semaine', 30, MAINT + 48 * 3600e3)], MAINT, heure);
  assert.strictEqual(d.texte, 'Limite 5 h · 10 % restant');
  assert.strictEqual(d.niveau, 'rouge');
  assert.strictEqual(d.discret, false);
  assert.strictEqual(d.titre, 'Limite 5 h : 10 % restant · reprise à 2 h\nLimite hebdo : 70 % restant · reprise à 48 h');
  const h = L.decrire([F('seven_day', 'semaine', 97, MAINT + 3600e3)], MAINT, heure);
  assert.strictEqual(h.texte, 'Limite hebdo · 3 % restant');
  assert.strictEqual(h.niveau, 'critique');
});

test('decrire : 20 %, 60 %, 90 %, 97 % consommés (cas d\'usage)', () => {
  const at = (u) => L.decrire([F('five_hour', '5 h', u, MAINT + 3600e3)], MAINT);
  assert.strictEqual(at(20).niveau, 'discret'); assert.strictEqual(at(20).discret, true); assert.strictEqual(at(20).texte, 'Limite 5 h · 80 % restant');
  assert.strictEqual(at(60).niveau, 'normal'); assert.strictEqual(at(60).discret, false);
  assert.strictEqual(at(90).niveau, 'rouge');
  assert.strictEqual(at(97).niveau, 'critique'); assert.strictEqual(at(97).texte, 'Limite 5 h · 3 % restant');
});

test('decrire : rien à montrer sans donnée, ou si toutes les reprises sont passées', () => {
  assert.strictEqual(L.decrire([], MAINT), null);
  assert.strictEqual(L.decrire([F('five_hour', '5 h', 99, MAINT - 5)], MAINT), null);
  assert.strictEqual(L.decrire(null, MAINT), null);
});

test('decrire : sans fonction d\'heure, pas de « reprise » dans l\'infobulle ; reprise inconnue sans erreur', () => {
  assert.strictEqual(L.decrire([F('five_hour', '5 h', 50, MAINT + 1000)], MAINT).titre, 'Limite 5 h : 50 % restant');
  assert.strictEqual(L.decrire([F('five_hour', '5 h', 50, null)], MAINT, () => 'x').titre, 'Limite 5 h : 50 % restant');
});

test('zéro réseau : la logique et le script de la bulle n\'utilisent aucun mot réseau', () => {
  const mots = ['fe' + 'tch', 'XMLHttp' + 'Request', 'Web' + 'Socket', 'send' + 'Beacon', 'Event' + 'Source', 'require(\'ht' + 'tp', 'require(\'ht' + 'tps'];
  for (const f of ['src/limite-logique.js', 'src/bulle-limite.js']) {
    const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of mots) assert.ok(!t.includes(m), f + ' contient ' + m);
  }
});

test('flash TOKEN OUT : un seul évènement CSS court, liseré fixe en mouvement réduit, pas de boucle', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src/index.html'), 'utf8');
  assert.ok(/\.tk-flash\.on::before \{ animation: tk-fl-rouge \.22s linear both; \}/.test(html), 'durée 220 ms');
  assert.ok(!/animation:[^;]*infinite/.test(html.slice(html.indexOf('.tk-flash {'), html.indexOf('.tk-flash.calme'))), 'pas de boucle');
  assert.ok(/prefers-reduced-motion: reduce\) \{[^\n]*\.tk-flash\.on::before, \.tk-flash\.on::after \{ animation: none/.test(html), 'mouvement réduit sans animation');
  assert.ok(/\.tk-flash\.calme::before \{[^}]*box-shadow: inset/.test(html), 'liseré fixe');
  const scene = fs.readFileSync(path.join(__dirname, '..', 'src/scene.js'), 'utf8');
  assert.ok(/e\.detail\.flash\) flashImpact\(\)/.test(scene), 'flash seulement pour un nouvel épisode');
  assert.ok(/flashEl\.classList\.add\(calme \? 'calme' : 'on'\)/.test(scene), 'mode calme respecté');
});
