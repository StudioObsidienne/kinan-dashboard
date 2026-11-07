// Micro-interactions du décor : logique pure (messages, enveloppes, plante, lampe, tailles de zones) et garde-fous.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../src/eggs/objets-logique.js');

test('messages : plusieurs variantes courtes par objet, imposés présents', () => {
  for (const [k, liste] of Object.entries(L.MESSAGES)) {
    assert.ok(liste.length >= 3, k + ' : au moins 3 messages');
    for (const m of liste) assert.ok(m.length <= 46, 'bulle courte : ' + m);
  }
  assert.ok(L.MESSAGES.plante.includes('J\'suis tombée sous ton charme.'));
  assert.ok(L.MESSAGES.ordinateur.includes('Je fais semblant de travailler.'));
});

test('choisir : aléatoire borné, jamais deux fois le même d\'affilée', () => {
  const l = L.MESSAGES.tasse;
  for (const r of [0, 0.34, 0.67, 0.9999]) {
    const a = L.choisir(l, () => r, undefined), b = L.choisir(l, () => r, a.index);
    assert.ok(a.index >= 0 && a.index < l.length);
    assert.notStrictEqual(b.index, a.index);
  }
  assert.strictEqual(L.choisir([], () => 0, 0).texte, '');
});

test('horloge : heure réelle formatée ou phrase du lot', () => {
  assert.strictEqual(L.messageHorloge(new Date(2026, 0, 5, 9, 7), () => 0.1).texte, 'Il est 09h07.');
  assert.ok(L.MESSAGES.horloge.includes(L.messageHorloge(new Date(2026, 0, 5, 9, 7), () => 0.9).texte));
  assert.ok(L.MESSAGES.horloge.includes(L.messageHorloge(new Date(NaN), () => 0.1).texte));
});

test('enveloppe et vibration : bornées, nulles hors durée, fixes en mode calme', () => {
  for (let dt = -100; dt < 3000; dt += 50) {
    const e = L.enveloppe(dt, 1000, false), v = L.vibration(dt, 1000, false);
    assert.ok(e >= 0 && e <= 1 && v >= 0 && v <= 1);
  }
  assert.strictEqual(L.enveloppe(-1, 1000, false), 0);
  assert.strictEqual(L.enveloppe(1000, 1000, false), 0);
  assert.strictEqual(L.enveloppe(500, 1000, true), 1);
  for (let dt = 0; dt < 1000; dt += 50) assert.strictEqual(L.vibration(dt, 1000, true), 0, 'calme : aucun tremblement');
  assert.ok(L.vibration(100, 1000, false) > L.vibration(900, 1000, false), 'décroît');
  assert.strictEqual(L.enveloppe(NaN, 1000, false), 0);
});

test('plante : se fane, laisse tomber des feuilles puis revient', () => {
  const D = L.DUREE.plante;
  assert.deepStrictEqual(L.etatPlante(0, false), { fane: 0, chute: 0 });
  assert.strictEqual(L.etatPlante(800, false).fane, 1);
  assert.ok(L.etatPlante(1500, false).chute > 0);
  assert.ok(L.etatPlante(D - 900, false).fane < 1 && L.etatPlante(D - 900, false).fane > 0, 'retour progressif');
  assert.deepStrictEqual(L.etatPlante(D, false), { fane: 0, chute: 0 }, 'revient après quelques secondes');
  assert.ok(D >= 3000 && D <= 10000);
  for (let dt = 0; dt < D; dt += 100) assert.strictEqual(L.etatPlante(dt, true).chute, 0, 'calme : pas de feuilles qui tombent');
  assert.deepStrictEqual(L.etatPlante(-5, false), { fane: 0, chute: 0 });
});

test('lampe : machine on/off, lueur seulement après allumage, aucune en mode calme', () => {
  let l = L.creerLampe();
  assert.strictEqual(l.allumee, true);
  l = L.basculerLampe(l, 1000);
  assert.strictEqual(l.allumee, false);
  assert.strictEqual(L.lueurLampe(l, 1100, false), 0, 'éteinte : pas de lueur');
  l = L.basculerLampe(l, 2000);
  assert.strictEqual(l.allumee, true);
  assert.ok(L.lueurLampe(l, 2100, false) > 0.8);
  assert.strictEqual(L.lueurLampe(l, 2000 + L.DUREE.lampe, false), 0);
  assert.strictEqual(L.lueurLampe(l, 2100, true), 0);
  assert.ok(Object.isFrozen(l));
});

test('zones : taille effective d\'au moins 24 px, boîtes des objets présentes', () => {
  assert.strictEqual(L.MIN_CLIC_PX, 24);
  assert.deepStrictEqual(L.tailleEffective(8, 10, 1, 24), { w: 24, h: 24 });
  assert.deepStrictEqual(L.tailleEffective(86, 52, 2, 24), { w: 172, h: 104 });
  assert.deepStrictEqual(L.tailleEffective(8, 10, 0, 24), { w: 24, h: 24 }, 'échelle invalide ramenée à 1');
  for (const id of ['plante', 'horloge', 'lampadaire', 'fenetre', 'tableau', 'panneau', 'etagere']) assert.strictEqual(L.BOITES[id].length, 4, id);
  const a = { cx: 200, haut: 138, s: 1 };
  assert.deepStrictEqual(L.boiteMoniteur(a), [213, 120, 24, 16]);
  assert.deepStrictEqual(L.boiteMoniteur({ ...a, s: -1 }), [163, 120, 24, 16]);
  assert.deepStrictEqual(L.boiteTasse(a), [165, 124, 10, 14]);
});

test('garde-fous : objets.js n\'écrit aucun état, aucun IPC, aucun stockage, demande la taille minimale', () => {
  const dossier = path.join(__dirname, '..', 'src', 'eggs');
  for (const f of ['objets.js', 'objets-logique.js']) {
    const src = fs.readFileSync(path.join(dossier, f), 'utf8');
    assert.ok(!/\bkinan\b\s*\./.test(src.replace(/KinanEgg|KinanEquipe/g, '')), f + ' touche window.kinan');
    assert.ok(!/ipc/i.test(src), f + ' mentionne ipc');
    assert.ok(!/\.etat\s*=[^=]/.test(src), f + ' écrit un champ etat');
    assert.ok(!/stock\.set|localStorage|sessionStorage/.test(src), f + ' écrit dans un stockage');
  }
  const src = fs.readFileSync(path.join(dossier, 'objets.js'), 'utf8');
  assert.ok(/min:\s*L\.MIN_CLIC_PX/.test(src), 'les zones demandent le plancher de 24 px');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const ordre = ['egg-core.js', 'eggs/objets-logique.js', 'eggs/objets.js', 'eggs/fouet-logique.js', 'eggs/fouet.js'].map((s) => html.indexOf('src="' + s + '"'));
  assert.ok(ordre.every((i) => i > 0) && ordre.every((i, k) => k === 0 || i > ordre[k - 1]), 'scripts chargés dans l\'ordre après egg-core');
});

test('fil rouge : plante, fenêtre, tasse, lampe dans l\'ordre et dans les 12 s racontent une histoire, tout autre clic le coupe', () => {
  const ordre = L.LORE.chaine;
  assert.deepStrictEqual(ordre, ['plante', 'fenetre', 'tasse', 'lampe']);
  let e = L.creerLore(), t = 1000, textes = [], fini = false;
  for (const id of ordre) { const r = L.suiteLore(e, id, t); e = r.etat; if (r.texte) textes.push(r.texte); fini = r.fini; t += 3000; }
  assert.strictEqual(textes.length, 3);
  assert.ok(fini, 'dernier maillon : histoire terminée');
  assert.deepStrictEqual(e, L.creerLore(), 'remise à zéro après la fin');
  for (const x of textes) assert.ok(x.length <= 46, 'bulle courte : ' + x);
  // trop lent, mauvais ordre, objet étranger : retour à zéro (la plante relance le fil)
  let r = L.suiteLore(L.suiteLore(L.creerLore(), 'plante', 0).etat, 'fenetre', 13000);
  assert.strictEqual(r.texte, null); assert.strictEqual(r.etat.rang, 0);
  r = L.suiteLore(L.suiteLore(L.creerLore(), 'plante', 0).etat, 'lampe', 1000);
  assert.strictEqual(r.texte, null); assert.strictEqual(r.etat.rang, 0);
  r = L.suiteLore(L.suiteLore(L.creerLore(), 'plante', 0).etat, 'autre', 1000);
  assert.strictEqual(r.etat.rang, 0);
  r = L.suiteLore(L.suiteLore(L.creerLore(), 'plante', 0).etat, 'plante', 1000);
  assert.strictEqual(r.etat.rang, 1, 'la plante recommence le fil');
  assert.strictEqual(L.suiteLore(L.creerLore(), 'fenetre', 0).texte, null, 'la fenêtre seule ne raconte rien');
  assert.doesNotThrow(() => L.suiteLore(null, 'plante', NaN));
});

test('plante : un nouveau clic pendant l\'effet ne fait pas sauter l\'état (prolongation ou reprise continue)', () => {
  const D = L.DUREE.plante;
  // en plein palier : on prolonge, le brunissement reste à 1
  let r = L.relancerPlante(2000, D, false);
  assert.strictEqual(r.dt, 2000); assert.ok(r.duree > D - 1 && r.duree >= 2000 + 1800 + 1400);
  assert.strictEqual(L.etatPlante(r.dt, false, r.duree).fane, 1);
  // pendant le retour : repart du brunissement actuel, sans saut
  const dt0 = D - 900, fane0 = L.etatPlante(dt0, false, D).fane;
  r = L.relancerPlante(dt0, D, false);
  assert.ok(Math.abs(L.etatPlante(r.dt, false, r.duree).fane - fane0) < 0.01, 'continuité du brunissement');
  // hors effet : départ normal ; valeurs invalides ramenées au départ
  assert.deepStrictEqual(L.relancerPlante(D + 10, D, false), { dt: 0, duree: D });
  assert.deepStrictEqual(L.relancerPlante(NaN, D, false), { dt: 0, duree: D });
  // plafond : une rafale de clics n'allonge jamais l'effet sans fin (chaque clic prolonge d'au plus ~3,2 s au-delà de l'instant courant)
  let dt = 3000, duree = D;
  for (let i = 0; i < 50; i++) { const n = L.relancerPlante(dt, duree, false); duree = n.duree; }
  assert.ok(duree <= dt + 1800 + 1400 + 1);
});

test('sources : recopie décalée sans double décalage de la scène, rideaux copiés (jamais de couleur figée), zones sans carré noir au clic', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'eggs', 'objets.js'), 'utf8');
  assert.ok(/x \+ dx, y \+ dy, w, h\)/.test(src) && !/y \+ dy \+ DY/.test(src), 'destination en repère de scène');
  assert.ok(!/a8516a|c76b85|8a3e55/i.test(src), 'plus de rideau rose codé en dur');
  const noyau = fs.readFileSync(path.join(__dirname, '..', 'src', 'egg-core.js'), 'utf8');
  assert.ok(/:focus-visible/.test(noyau) && !/outline = '2px solid currentColor'/.test(noyau), 'contour seulement au focus clavier');
  assert.ok(/addEventListener\('pointerdown'/.test(noyau), 'clic souris : opacité et contour remis à zéro');
});
