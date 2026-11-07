// Placement des doubles des agents : emplacements libres, aucun chevauchement, trajets sans obstacle, stabilité, repli sans place.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../src/placement-logique.js');

// Dispositions réelles de scene.js (COLS 70/200/330, HAUTS 138/204, banc de Kinan en 200/130).
const kinan = { cle: 'kinan', cx: 200, haut: 130, banc: true };
const SIX = [
  { cle: 'drafion', cx: 70, haut: 138 }, kinan, { cle: 'skyze', cx: 330, haut: 138 },
  { cle: 'johms', cx: 70, haut: 204 }, { cle: 'quatre', cx: 200, haut: 204 }, { cle: 'cinq', cx: 330, haut: 204 }
];
const TROIS = [kinan, { cle: 'drafion', cx: 70, haut: 204 }, { cle: 'skyze', cx: 200, haut: 204 }, { cle: 'johms', cx: 330, haut: 204 }];
const OBJETS = { horloge: [190, 22, 20, 20], plante: [121, 130, 18, 26], lampadaire: [258, 96, 22, 14], enseigne: [118, 62, 164, 36], fenetre: [21, 9, 86, 52], tableau: [129, 15, 40, 32], panneau: [231, 15, 48, 34], etagere: [289, 14, 96, 48] };
const avecN = (agents, n) => agents.map((a) => ({ ...a, n: n[a.cle] || 0 }));
const dessous = (pos) => Object.values(pos).flat();

function verifier(agents, entree, n, precedent) {
  const interdits = P.obstacles({ agents, objets: OBJETS, ...entree });
  const r = P.placer({ agents: avecN(agents, n), interdits, precedent });
  const boites = [];
  for (const [cle, liste] of Object.entries(r.positions)) {
    liste.forEach((p, i) => {
      const b = P.boiteDouble(p[0], p[1]);
      assert.ok(P.boiteLibre(b, interdits, boites.slice()), cle + '#' + i + ' : emplacement libre');
      boites.push(b);
    });
  }
  for (let i = 0; i < boites.length; i++) for (let j = i + 1; j < boites.length; j++) assert.ok(!P.secoupent(boites[i], boites[j]), 'deux doubles ne se chevauchent pas');
  return { r, interdits };
}

test('doubles : jamais dans la plante, la lampe, un bureau, un écran ni hors de la scène', () => {
  for (const agents of [SIX, TROIS]) {
    const { r, interdits } = verifier(agents, {}, { drafion: 3, kinan: 3, skyze: 3, johms: 3, quatre: 3, cinq: 3 });
    const tous = dessous(r.positions);
    assert.ok(tous.length >= 6, 'plusieurs doubles posés');
    for (const [x, y] of tous) {
      const b = P.boiteDouble(x, y);
      assert.ok(b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= P.SCENE.W && b[1] + b[3] <= P.SCENE.H - P.SCENE.DY, 'dans la scène');
      for (const nom of ['plante', 'lampadaire']) {
        const o = interdits.find((i) => i.id === nom).boite;
        assert.ok(!P.secoupent(b, o), 'pas dans ' + nom);
      }
      for (const a of agents) {
        assert.ok(!P.secoupent(b, P.rectBureau(a)), 'pas dans le bureau de ' + a.cle);
        // moniteur : [cx + s*25 - 12, haut - 18, 24, 16], toujours inclus dans le bureau
        const s = a.cx > 300 ? -1 : 1, mon = [a.cx + s * 25 - 12, a.haut - 18, 24, 16];
        assert.ok(!P.secoupent(b, mon), 'pas sur l\'écran de ' + a.cle);
      }
    }
  }
});

test('doubles : le cas qui posait problème (Drafion x2 et Johms x3 en disposition à trois) ne se superpose plus', () => {
  const { r } = verifier(TROIS, {}, { drafion: 2, johms: 3 });
  assert.strictEqual(r.positions.drafion.length, 2);
  assert.strictEqual(r.positions.johms.length, 3);
  assert.deepStrictEqual(r.manques, { kinan: 0, drafion: 0, skyze: 0, johms: 0 });
});

test('doubles : la plante déplacée par le panneau Royaume est évitée (et la lampe, et un décalage de la plante)', () => {
  const interdits = P.obstacles({ agents: SIX, objets: OBJETS, decalages: { plante: [90, 40] } });
  const plante = interdits.find((i) => i.id === 'plante').boite;
  assert.deepStrictEqual(plante, [207, 168, 26, 32]);
  const r = P.placer({ agents: avecN(SIX, { kinan: 3, drafion: 3 }), interdits });
  for (const [x, y] of dessous(r.positions)) assert.ok(!P.secoupent(P.boiteDouble(x, y), plante));
  // plante remplacée : emprise plus large
  const large = P.obstacles({ agents: SIX, objets: OBJETS, planteRemplacee: true }).find((i) => i.id === 'plante').boite;
  assert.ok(large[2] > plante[2] && large[3] > plante[3]);
  // zone supplémentaire (autre module) respectée
  const supp = [20, 100, 40, 60];
  const r2 = verifier(TROIS, { supplement: [supp] }, { kinan: 3, skyze: 3 });
  for (const [x, y] of dessous(r2.r.positions)) assert.ok(!P.secoupent(P.boiteDouble(x, y), supp));
});

test('doubles : tour de rôle (chaque agent a son premier double avant le deuxième de quelqu\'un) et plafond de 3', () => {
  const { r } = verifier(SIX, {}, { drafion: 9, kinan: 9, skyze: 9, johms: 9, quatre: 9, cinq: 9 });
  for (const k of Object.keys(r.positions)) assert.ok(r.positions[k].length <= P.MAX_PAR_AGENT);
  const avecUn = Object.values(r.positions).filter((l) => l.length >= 1).length;
  assert.strictEqual(avecUn, SIX.length, 'tous les agents ont au moins un double si la place le permet');
});

test('doubles : sans place, pas de pose bancale (le manque est compté, rien ne déborde)', () => {
  const tout = [[0, 0, 400, 270]]; // tout le sol occupé
  const r = P.placer({ agents: avecN(TROIS, { drafion: 2 }), interdits: [{ id: 'bloc', boite: tout[0] }] });
  assert.deepStrictEqual(r.positions.drafion, []);
  assert.strictEqual(r.manques.drafion, 2);
});

test('doubles : stabilité, un emplacement valide est conservé quand le nombre change ou qu\'un autre agent arrive', () => {
  const a = verifier(TROIS, {}, { drafion: 2 });
  const b = verifier(TROIS, {}, { drafion: 3, johms: 2 }, a.r.positions);
  assert.deepStrictEqual(b.r.positions.drafion.slice(0, 2), a.r.positions.drafion, 'les deux premiers ne bougent pas');
  const c = verifier(TROIS, {}, { drafion: 1, johms: 2 }, b.r.positions);
  assert.deepStrictEqual(c.r.positions.drafion, [b.r.positions.drafion[0]]);
  // un emplacement devenu invalide (plante déplacée dessus) est recalculé
  const p0 = a.r.positions.drafion[0];
  const d = P.placer({ agents: avecN(TROIS, { drafion: 2 }), interdits: P.obstacles({ agents: TROIS, objets: OBJETS, supplement: [[p0[0] - 20, p0[1] - 20, 40, 40]] }), precedent: a.r.positions });
  assert.notDeepStrictEqual(d.positions.drafion[0], p0);
});

test('doubles : entrées invalides ignorées, jamais d\'exception', () => {
  assert.deepStrictEqual(P.placer(null).positions, {});
  assert.doesNotThrow(() => P.placer({ agents: [null, { cle: 'x' }, { cle: 'y', cx: NaN, haut: 1, n: 2 }], interdits: null, precedent: { x: 'nimportequoi' } }));
  assert.deepStrictEqual(P.obstacles(null), P.obstacles({}));
  assert.strictEqual(P.chemin(null, [1, 1], []), null);
  assert.strictEqual(P.pointSur([], 5), null);
});

test('trajets : le chemin d\'un double contourne tous les obstacles', () => {
  const agents = SIX, interdits = P.obstacles({ agents, objets: OBJETS });
  const r = P.placer({ agents: avecN(agents, { drafion: 3, kinan: 3, skyze: 3, johms: 3, quatre: 3, cinq: 3 }), interdits });
  let testes = 0;
  for (const a of agents) for (const [x, y] of r.positions[a.cle]) {
    const depart = [a.cx, a.haut + 10];
    const ch = P.chemin(depart, [x, y], interdits, ['bureau:' + a.cle]);
    assert.ok(ch && ch.length >= 2, 'chemin de ' + a.cle);
    assert.deepStrictEqual(ch[0], depart); assert.deepStrictEqual(ch[ch.length - 1], [x, y]);
    // aucun point du trajet (échantillonné tous les 2 px) ne touche un obstacle, hors le bureau de départ, sauf au tout début
    const L = P.longueur(ch);
    let sorti = false;
    for (let d = 0; d <= L; d += 2) {
      const [px, py] = P.pointSur(ch, d), b = P.boiteMarcheur(px, py);
      const touche = interdits.some((o) => o.id !== 'bureau:' + a.cle && P.secoupent(b, o.boite));
      assert.ok(!touche, 'trajet de ' + a.cle + ' libre à d=' + d);
      if (!interdits.find((o) => o.id === 'bureau:' + a.cle) || !P.secoupent(b, P.rectBureau(a))) sorti = true; else assert.ok(!sorti, 'ne rentre pas dans son bureau après en être sorti');
    }
    testes++;
  }
  assert.ok(testes >= 6);
});

test('trajets : pointSur borné aux extrémités, longueur cohérente, trajet inexistant donne null', () => {
  const ch = [[0, 0], [30, 0], [30, 40]];
  assert.strictEqual(P.longueur(ch), 70);
  assert.deepStrictEqual(P.pointSur(ch, 0).slice(0, 2), [0, 0]);
  assert.deepStrictEqual(P.pointSur(ch, 15).slice(0, 2), [15, 0]);
  assert.deepStrictEqual(P.pointSur(ch, 50).slice(0, 2), [30, 20]);
  assert.deepStrictEqual(P.pointSur(ch, 9999).slice(0, 2), [30, 40]);
  // mur complet de haut en bas : aucun passage
  const mur = [{ id: 'mur', boite: [190, 90, 20, 170] }];
  assert.strictEqual(P.chemin([100, 160], [300, 160], mur, []), null);
  // un obstacle contourné : le chemin n'est pas une ligne droite
  const bloc = [{ id: 'bloc', boite: [190, 130, 20, 60] }];
  const c = P.chemin([100, 160], [300, 160], bloc, []);
  assert.ok(c && c.length >= 3 && P.longueur(c) > 200);
});

test('garde-fous : module sans réseau, sans DOM, sans écriture', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'placement-logique.js'), 'utf8');
  for (const interdit of ['fet' + 'ch(', 'XMLHttp' + 'Request', 'Web' + 'Socket', 'local' + 'Storage', 'docu' + 'ment.', 'ht' + 'tp://', 'ht' + 'tps://', 'state.' + 'json']) assert.ok(!src.includes(interdit), interdit);
});

test('intégration : la scène utilise le placement par emplacements libres (plus de positions figées), chargé avant scene.js', () => {
  const scene = fs.readFileSync(path.join(__dirname, '..', 'src', 'scene.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  assert.ok(!/\bEMPL\b/.test(scene), 'plus de table d\'emplacements figés');
  assert.ok(/PlacementLogique/.test(scene) && /PL\.placer\(/.test(scene) && /PL\.chemin\(/.test(scene) && /PL\.obstacles\(/.test(scene));
  assert.ok(/deco\.dec/.test(scene) && /planteRemplacee/.test(scene), 'plante déplacée ou remplacée prise en compte');
  assert.ok(page.indexOf('src="placement-logique.js"') > 0 && page.indexOf('src="placement-logique.js"') < page.indexOf('src="scene.js"'));
  assert.ok(/mouvement réduit : il apparaît directement|if \(!calme\) for \(const k of Object\.keys\(doubles\.places\)\)/.test(scene), 'pas de marche en mouvement réduit');
  assert.ok(/affichage: \{/.test(scene) && /masquer:/.test(scene), 'agents masqués : affichage seulement');
});

test('royaume : particules sur une seule boucle nettoyée, pause hors visibilité, image fixe en mouvement réduit', () => {
  const vue = fs.readFileSync(path.join(__dirname, '..', 'src', 'eggs', 'royaume.js'), 'utf8');
  assert.strictEqual((vue.match(/window\.requestAnimationFrame\(/g) || []).length, 2, 'une seule file de rappels (démarrage + boucle)');
  assert.ok(/cancelAnimationFrame/.test(vue) && /visibilitychange/.test(vue) && /prefers-reduced-motion/.test(vue) && /ro\.disconnect\(\)/.test(vue));
  assert.ok(/if \(api\.calme\(\)\) \{ arreterPart\(\); dessinerPart\(0\); \}/.test(vue), 'mouvement réduit : une image, aucune boucle');
  assert.ok(/L\.parallaxe\(/.test(vue) && /L\.avancer\(/.test(vue));
});
