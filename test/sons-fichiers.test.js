// Sons enregistrés : logique pure (choix d'extrait, volumes bornés, fondus) et cohérence des fichiers/CSP.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S = require('../src/eggs/sons-fichiers-logique.js');
const RACINE = path.join(__dirname, '..');

test('volumes : discrets et bornés', () => {
  assert.ok(S.VOLUME_RONFLEMENT > 0 && S.VOLUME_RONFLEMENT <= 0.3);
  assert.ok(S.VOLUME_FOUET > 0 && S.VOLUME_FOUET <= 0.6 && S.VOLUME_FOUET <= S.VOLUME_MAX);
  assert.strictEqual(S.borneVolume(5), S.VOLUME_MAX);
  assert.strictEqual(S.borneVolume(-1), 0);
  assert.strictEqual(S.borneVolume(NaN), 0);
  assert.strictEqual(S.borneVolume('x'), 0);
  assert.strictEqual(S.borneVolume(0.2), 0.2);
});

test('choisirDecalage : l\'extrait tient dans le fichier, pas deux fois le même', () => {
  for (const d of S.DECALAGES_RONFLEMENT) assert.ok(d + S.EXTRAIT_RONFLEMENT <= S.DUREE_RONFLEMENT);
  for (let i = 0; i < 50; i++) {
    const a = S.choisirDecalage(S.DECALAGES_RONFLEMENT, S.DUREE_RONFLEMENT, S.EXTRAIT_RONFLEMENT, Math.random, 11);
    assert.ok(S.DECALAGES_RONFLEMENT.includes(a) && a !== 11);
  }
  assert.strictEqual(S.choisirDecalage([2, 49], 50, 6, () => 0.99, null), 2, 'décalage trop tardif écarté');
  assert.strictEqual(S.choisirDecalage([2, 11], 50, 6, () => 0, 2), 11);
  assert.strictEqual(S.choisirDecalage([5], 50, 6, () => 0.5, 5), 5, 'un seul choix possible');
  assert.strictEqual(S.choisirDecalage([], 50, 6, Math.random), 0);
  assert.strictEqual(S.choisirDecalage(null, 50, 6, null), 0);
  assert.strictEqual(S.choisirDecalage([1, 2, 3], 50, 6, () => 5, null), 1, 'aléa hors [0,1[ ramené au début');
});

test('gainFondu : montée, plateau, descente, hors durée', () => {
  assert.strictEqual(S.gainFondu(0, 6, 0.4), 0);
  assert.ok(Math.abs(S.gainFondu(0.2, 6, 0.4) - 0.5) < 1e-9);
  assert.strictEqual(S.gainFondu(3, 6, 0.4), 1);
  assert.ok(Math.abs(S.gainFondu(5.8, 6, 0.4) - 0.5) < 1e-9);
  assert.strictEqual(S.gainFondu(6, 6, 0.4), 0);
  assert.strictEqual(S.gainFondu(-1, 6, 0.4), 0);
  assert.strictEqual(S.gainFondu(1, 6, 0), 1);
  assert.ok(S.gainFondu(0.25, 0.5, 5) <= 1, 'fondu plus long que la durée : borné');
  assert.strictEqual(S.gainFondu(1, NaN, 0.4), 0);
});

test('volumeA : jamais au-dessus du plafond', () => {
  for (let t = 0; t <= 6; t += 0.1) assert.ok(S.volumeA(t, 6, 0.4, 9) <= S.VOLUME_MAX);
  assert.strictEqual(S.volumeA(3, 6, 0.4, S.VOLUME_RONFLEMENT), S.VOLUME_RONFLEMENT);
});

test('fouet : attaque sèche, fondu d entrée quasi nul', () => {
  assert.ok(S.FONDU_ENTREE_FOUET <= 0.02 && S.FONDU_FOUET <= 0.3 && S.COUPE_FOUET <= 1.2);
  assert.ok(S.VITESSE_FOUET >= 1 && S.VITESSE_FOUET <= 1.15 && S.VOLUME_MAX <= 0.8);
  assert.strictEqual(S.gainFondu(0.02, 1, 0.25, S.FONDU_ENTREE_FOUET), 1);
  assert.ok(Math.abs(S.gainFondu(0.9, 1, 0.25, 0.01) - 0.4) < 1e-9);
});
test('fouet : coupé à COUPE_FOUET, calé sur l\'impact', () => {
  assert.strictEqual(S.dureeFouet(), Math.min(S.COUPE_FOUET, S.DUREE_FOUET));
  assert.strictEqual(S.dureeFouet(3), S.COUPE_FOUET);
  assert.strictEqual(S.dureeFouet(0.8), 0.8);
  assert.strictEqual(S.dureeFouet(-2), Math.min(S.COUPE_FOUET, S.DUREE_FOUET));
  assert.ok(Math.abs(S.retardFouet(120) - (0.12 - S.ATTAQUE_FOUET / S.VITESSE_FOUET)) < 1e-9);
  assert.strictEqual(S.retardFouet(0), 0, 'mouvement réduit : immédiat');
  assert.strictEqual(S.retardFouet(NaN), 0);
});

test('fichiers, licence et CSP', () => {
  for (const f of [S.FICHIER_RONFLEMENT, S.FICHIER_FOUET]) assert.ok(fs.existsSync(path.join(RACINE, 'src', f)), f);
  const lic = fs.readFileSync(path.join(RACINE, 'assets', 'sons', 'LICENCE.md'), 'utf8');
  assert.ok(/s0170/.test(lic) && /s2950/.test(lic) && /CC0/.test(lic));
  const html = fs.readFileSync(path.join(RACINE, 'src', 'index.html'), 'utf8');
  assert.ok(/media-src 'self';/.test(html));
  assert.ok(html.indexOf('sons-fichiers-logique.js') < html.indexOf('eggs/drafion-sommeil.js'));
  assert.ok(!/AudioContext/.test(fs.readFileSync(path.join(RACINE, 'src', 'eggs', 'fouet.js'), 'utf8')));
  assert.ok(!/AudioContext/.test(fs.readFileSync(path.join(RACINE, 'src', 'eggs', 'drafion-sommeil.js'), 'utf8')));
});
