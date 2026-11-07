// Mode fouet : logique pure (catégories, machine d'états du mode, curseur, réactions) et garde-fous « aucun écrit d'état ».
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../src/eggs/fouet-logique.js');

test('catégorie : état visuel de l\'agent', () => {
  assert.strictEqual(L.categorie('erreur', 1, 100000, 0), 'erreur');
  assert.strictEqual(L.categorie('travail', 1, 100000, 0), 'travail');
  assert.strictEqual(L.categorie('doute', 1, 100000, 0), 'doute');
  assert.strictEqual(L.categorie('repos', 100000 - 4000, 100000, 0), 'endormi');
  assert.strictEqual(L.categorie('repos', 100000 - 1000, 100000, 0), 'repos');
  assert.strictEqual(L.categorie('repos', 0, 100000, 0), 'endormi', 'jamais mis à jour : endormi comme dans la scène');
  assert.strictEqual(L.categorie('repos', 200000, 100000, 0), 'endormi', 'horloge reculée : pas de plantage');
  assert.strictEqual(L.categorie('repos', 1, 100000, 100500), 'repos', 'fenêtre d\'éveil après un réveil');
  assert.strictEqual(L.categorie('repos', 1, 100000, 90000), 'endormi', 'éveil expiré');
});

test('machine du mode : bascule, arrêt, immuable', () => {
  const m0 = L.creerMode();
  assert.strictEqual(m0.actif, false);
  const m1 = L.basculer(m0);
  assert.strictEqual(m1.actif, true);
  assert.strictEqual(m0.actif, false, 'l\'ancien état n\'est pas modifié');
  assert.strictEqual(L.basculer(m1).actif, false);
  assert.strictEqual(L.arreter(m1).actif, false);
  assert.strictEqual(L.arreter(m0).actif, false);
  assert.ok(Object.isFrozen(m1));
  assert.throws(() => { m1.actif = false; });
});

test('curseur : agent, zone vide, sortie du bureau, désactivation', () => {
  const on = L.basculer(L.creerMode()), off = L.creerMode();
  assert.strictEqual(L.curseur(on, false, true), 'fouet');
  assert.strictEqual(L.curseur(on, true, true), 'fouet-cible');
  assert.strictEqual(L.curseur(on, true, false), 'defaut', 'sorti du bureau');
  assert.strictEqual(L.curseur(off, true, true), 'defaut', 'mode désactivé');
  assert.strictEqual(L.curseur(undefined, false, true), 'defaut');
});

test('curseur CSS : data-URI local avec repli crosshair, sans adresse', () => {
  for (const cible of [false, true]) {
    const css = L.curseurCss(cible);
    assert.ok(css.startsWith('url("data:image/svg+xml,'));
    assert.ok(css.endsWith(', crosshair'));
    assert.ok(!/https?:\/\//.test(css));
  }
  assert.notStrictEqual(L.curseurCss(true), L.curseurCss(false));
});

test('agentSous : trouve l\'agent, ignore le vide, départage', () => {
  const ag = [{ cle: 'drafion', cx: 70, haut: 204, s: 1 }, { cle: 'kinan', cx: 200, haut: 138, s: 1 }];
  assert.strictEqual(L.agentSous(70, 190, ag).cle, 'drafion');
  assert.strictEqual(L.agentSous(200, 120, ag).cle, 'kinan');
  assert.strictEqual(L.agentSous(135, 150, ag), null);
  assert.strictEqual(L.agentSous(0, 0, ag), null);
  assert.strictEqual(L.agentSous(1, 1, []), null);
  const proches = [{ cle: 'a', cx: 100, haut: 150, s: 1 }, { cle: 'b', cx: 130, haut: 150, s: 1 }];
  assert.strictEqual(L.agentSous(125, 140, proches).cle, 'b');
});

test('regard : direction vers le curseur', () => {
  assert.deepStrictEqual(L.regard(100, 100, 150, 100), { lx: 1, ly: 0 });
  assert.deepStrictEqual(L.regard(100, 100, 50, 60), { lx: -1, ly: -1 });
  assert.deepStrictEqual(L.regard(100, 100, 102, 103), { lx: 0, ly: 0 });
});

test('cadence : un coup toutes les 1,2 s par agent', () => {
  const d = {};
  assert.strictEqual(L.peutFouetter(d, 'a', 1000), true);
  d.a = 1000;
  assert.strictEqual(L.peutFouetter(d, 'a', 1500), false);
  assert.strictEqual(L.peutFouetter(d, 'b', 1500), true);
  assert.strictEqual(L.peutFouetter(d, 'a', 2300), true);
});

test('choisir : borné, sans répétition immédiate', () => {
  const liste = ['a', 'b', 'c'];
  assert.strictEqual(L.choisir(liste, () => 0, undefined).texte, 'a');
  assert.strictEqual(L.choisir(liste, () => 0.999, undefined).texte, 'c');
  assert.strictEqual(L.choisir(liste, () => 0, 0).texte, 'b');
  assert.strictEqual(L.choisir(['seul'], () => 0, 0).texte, 'seul');
  assert.strictEqual(L.choisir([], () => 0, 0).index, -1);
});

test('messages imposés présents', () => {
  assert.ok(L.MESSAGES.erreur.includes('Aïe ! C\'était pas dans le contrat !'));
  assert.ok(L.MESSAGES.travail.includes('Hé ! Je travaille, moi !'));
  for (const k of ['endormi', 'erreur', 'travail', 'repos', 'doute']) {
    assert.ok(L.MESSAGES[k].length >= 3, k);
    for (const m of L.MESSAGES[k]) assert.ok(m.length <= 40, 'bulle courte : ' + m);
  }
});

test('réaction : chaque catégorie se termine, tremble sauf en mode calme', () => {
  for (const cat of Object.keys(L.DUREE)) {
    assert.strictEqual(L.reaction(cat, L.DUREE[cat], false, 1).fini, true, cat);
    assert.strictEqual(L.reaction(cat, 0, false, 1).fini, false, cat);
    for (let dt = 0; dt < L.DUREE[cat]; dt += 25) {
      const p = L.reaction(cat, dt, true, 1);
      assert.strictEqual(p.dx, 0, cat + ' calme dx'); assert.strictEqual(p.dy, 0, cat + ' calme dy');
    }
  }
  const xs = new Set(); for (let dt = 0; dt < 600; dt += 55) xs.add(L.reaction('erreur', dt, false, 1).dx);
  assert.ok(xs.has(1) && xs.has(-1), 'erreur : tremble des deux côtés');
  assert.strictEqual(L.reaction('erreur', 1200, false, 1).dx, 0, 'fin du tremblement');
});

test('réaction : endormi sursaute, ouvre les yeux, se rendort', () => {
  assert.strictEqual(L.reaction('endormi', 50, false, 1).yeux, 'grand');
  assert.ok(L.reaction('endormi', 50, false, 1).dy < 0, 'sursaut vers le haut');
  assert.strictEqual(L.reaction('endormi', 600, false, 1).yeux, 'ouvert');
  assert.strictEqual(L.reaction('endormi', 600, false, 1).suitCurseur, true);
  assert.strictEqual(L.reaction('endormi', 2000, false, 1).yeux, 'cligne');
  assert.strictEqual(L.reaction('endormi', 2500, false, 1).yeux, 'dort');
  assert.strictEqual(L.reaction('endormi', 2500, false, 1).bouche, 'dort');
});

test('réaction : travail recule à l\'opposé du curseur, repos regarde le curseur', () => {
  assert.ok(L.reaction('travail', 50, false, 1).dx < 0);
  assert.ok(L.reaction('travail', 50, false, -1).dx > 0);
  assert.strictEqual(L.reaction('travail', 900, false, 1).sourcil, true);
  assert.strictEqual(L.reaction('repos', 800, false, 1).suitCurseur, true);
  assert.strictEqual(L.reaction('doute', 300, false, 1).bouche, 'doute');
  assert.strictEqual(L.reaction('inconnue', 10, false, 1).fini, true);
  assert.strictEqual(L.reaction('erreur', NaN, false, 1).fini, true);
});

test('garde-fous : fouet.js et sa logique n\'écrivent aucun état et n\'appellent aucun IPC', () => {
  const dossier = path.join(__dirname, '..', 'src', 'eggs');
  for (const f of ['fouet.js', 'fouet-logique.js']) {
    const src = fs.readFileSync(path.join(dossier, f), 'utf8');
    assert.ok(!/\bkinan\b\s*\./.test(src.replace(/KinanEgg|KinanEquipe/g, '')), f + ' touche window.kinan');
    assert.ok(!/ipc/i.test(src), f + ' mentionne ipc');
    assert.ok(!/\.etat\s*=[^=]/.test(src), f + ' écrit un champ etat');
    assert.ok(!/\bmaj\s*=[^=]/.test(src), f + ' écrit maj');
    assert.ok(!/stock\.set|localStorage|sessionStorage/.test(src), f + ' écrit dans un stockage');
    assert.ok(!/api\.surChangement|\.send\(|postMessage/.test(src), f + ' envoie ou écoute des messages');
  }
  const src = fs.readFileSync(path.join(dossier, 'fouet.js'), 'utf8');
  assert.ok(/api\.etats\(\)/.test(src), 'les états passent par la copie gelée api.etats()');
});

test('copie gelée : api.etats() ne laisse pas modifier un état', () => {
  const { creer } = require('../src/egg-core.js');
  const eq = { agents: () => [{ cle: 'a', cx: 1, haut: 1, s: 1 }], etat: () => ({ etat: 'repos', maj: 5 }), calme: () => false, surDessin() {}, dim: { W: 400, H: 270, DY: 18 } };
  const K = creer({ localStorage: null, location: { search: '' }, document: null, KinanEquipe: eq, console: { warn() {} }, maintenant: () => 1 });
  let etats;
  K.module('t', (api) => { etats = api.etats(); });
  assert.ok(Object.isFrozen(etats) && Object.isFrozen(etats.a));
  assert.throws(() => { etats.a.etat = 'travail'; });
});

test('lanière : déroulé, claquement à l\'impact, retrait, fin ; mode calme sans mouvement', () => {
  const avant = L.lanierPose(L.IMPACT - 1, false);
  assert.ok(!avant.fini && avant.flash === 0 && avant.longueur > 0.9, 'presque déroulée, pas encore claquée');
  assert.ok(L.lanierPose(0, false).longueur === 0);
  const imp = L.lanierPose(L.IMPACT, false);
  assert.ok(imp.flash === 1 && imp.eclair === 1 && imp.onde === 0 && imp.longueur === 1);
  assert.ok(L.lanierPose(L.IMPACT + 150, false).onde > 0.5 && L.lanierPose(L.IMPACT + 150, false).flash === 0);
  assert.strictEqual(L.lanierPose(L.DUREE_LANIERE, false).fini, true);
  for (let t = 0; t < 1000; t += 40) { const p = L.lanierPose(t, true); assert.ok(p.longueur === 0 && p.onde === 0 && p.eclair === 0); }
  assert.strictEqual(L.lanierPose(1000, true).fini, true);
  const a = { cx: 70, haut: 138 }, k = L.lanier({ x: 90, y: 100 }, a, 1, 12);
  assert.deepStrictEqual([k.tx, k.ty], [76, 122]);
  assert.ok(Math.hypot(k.sx - k.tx, k.sy - k.ty) >= 14);
  const k2 = L.lanier({ x: 76, y: 122 }, a, 1, 0.1);
  assert.ok(Math.hypot(k2.sx - k2.tx, k2.sy - k2.ty) >= 13.9, 'manche jamais collé à la tête');
  const pts = L.courbe(k, L.lanierPose(L.IMPACT, false));
  assert.deepStrictEqual(pts[0], [Math.round(k.sx), Math.round(k.sy)]);
  assert.deepStrictEqual(pts[pts.length - 1], [k.tx, k.ty], 'le bout claque sur la tête');
  for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i][0] - pts[i - 1][0]) <= 2 && Math.abs(pts[i][1] - pts[i - 1][1]) <= 2, 'lanière continue');
  const ec = L.eclair(k);
  assert.ok(ec.length > 6 && ec.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y)));
});
