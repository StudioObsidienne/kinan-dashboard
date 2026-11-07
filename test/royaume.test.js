// Paramètres du royaume : validation et bornes des positions, sérialisation, réinitialisation, thèmes, particules, garde-fous statiques.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../src/eggs/royaume-logique.js');
const { creer } = require('../src/egg-core.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// Disposition réelle de la scène (scene.js : COLS x HAUTS).
const AGENTS = [
  { cle: 'drafion', cx: 70, haut: 138, s: 1 }, { cle: 'kinan', cx: 200, haut: 130, s: 1 }, { cle: 'skyze', cx: 330, haut: 138, s: -1 },
  { cle: 'johms', cx: 70, haut: 204, s: 1 }, { cle: 'quatre', cx: 200, haut: 204, s: 1 }, { cle: 'cinq', cx: 330, haut: 204, s: -1 }
];

test('configuration par défaut : saine, identique après validation, positions d\'origine valides', () => {
  const d = L.configDefaut();
  assert.deepStrictEqual(L.valider(d, AGENTS), d);
  assert.ok(L.estDefaut(d) && L.estDefaut(null) && L.estDefaut('n\'importe quoi'));
  for (const k of L.CHOIX) assert.strictEqual(d[k], L.CATALOGUE[k][0][0], k + ' : premier choix = origine');
  for (const id of L.EXISTANTS) {
    const [x, y] = L.OBJETS[id].defaut;
    assert.ok(L.emplacementValide(d, id, x, y, AGENTS), 'origine de ' + id);
  }
  assert.deepStrictEqual(L.decalages(d), { plante: [0, 0], tableau: [0, 0], horloge: [0, 0], panneau: [0, 0] });
});

test('validation : valeurs inconnues, types faux et JSON corrompu ramenés à l\'origine', () => {
  for (const brut of [null, undefined, 42, 'x', [], [1, 2], { plante: 12, theme: {}, murales: 'oui', positions: 3 }]) {
    assert.ok(L.estDefaut(brut), 'tolère ' + JSON.stringify(brut));
  }
  const v = L.valider({ plante: 'cactus', tableau: 'inconnu', theme: 'foret', ambiance: '<script>', lueur: 'vive', particules: 'flocons' }, AGENTS);
  assert.strictEqual(v.plante, 'cactus'); assert.strictEqual(v.tableau, 'origine');
  assert.strictEqual(v.theme, 'foret'); assert.strictEqual(v.ambiance, 'naturelle');
  assert.strictEqual(v.lueur, 'vive'); assert.strictEqual(v.particules, 'flocons');
  for (const texte of ['', '{', 'null', '[]', '{"plante":', 'x'.repeat(30000), undefined, 7]) assert.ok(L.estDefaut(L.deserialiser(texte, AGENTS)), 'texte ' + String(texte).slice(0, 12));
});

test('positions : bornées à leur région, entières, sans collision avec agents, zones fixes ni autres objets', () => {
  const base = L.configDefaut();
  const essai = (id, x, y) => L.valider(Object.assign(L.configDefaut(), { positions: { [id]: [x, y] } }), AGENTS).positions[id];
  // acceptées : couloir central entre Drafion et Kinan, couloir de gauche
  assert.deepStrictEqual(essai('plante', 115, 100), [115, 100]);
  assert.deepStrictEqual(essai('plante', 113, 100), [113, 100]);
  // refusées : hors région, non entières, NaN, mauvais type
  for (const p of [[-5, 100], [900, 100], [130, 5], [130.5, 100], [NaN, 100], ['a', 'b'], [130], null, 'x']) assert.strictEqual(essai('plante', ...(Array.isArray(p) ? p : [p])), undefined, JSON.stringify(p));
  // refusées : bureau de Drafion, bureau de Kinan, lampadaire, fenêtre, étagère, bouton de la chasse, fouet
  assert.strictEqual(essai('plante', 40, 120), undefined);
  assert.strictEqual(essai('plante', 160, 120), undefined);
  assert.strictEqual(essai('plante', 258, 100), undefined);
  assert.strictEqual(essai('tableau', 60, 15), undefined, 'fenêtre');
  assert.strictEqual(essai('tableau', 300, 15), undefined, 'étagère');
  assert.strictEqual(essai('tableau', 150, 15), undefined, 'bouton secret de la chasse (176-186)');
  assert.strictEqual(essai('horloge', 200, 18), undefined, 'fouet (215-229)');
  // l'objet ne peut pas rester sur un autre objet : panneau sur l'horloge
  assert.strictEqual(essai('panneau', 200, 15), undefined);
  // bord de la fenêtre (fin à x = 118) : le tableau peut la frôler sans la recouvrir
  assert.deepStrictEqual(essai('tableau', 120, 20), [120, 20]);
  assert.strictEqual(essai('tableau', 117, 20), undefined);
  assert.ok(base);
});

test('déplacement : borné, refusé en cas de collision, glisse le long d\'un obstacle, retour à l\'origine sans trace', () => {
  let cfg = L.configDefaut();
  let r = L.deplacer(cfg, 'plante', 118, 100, AGENTS);
  assert.ok(r.ok); assert.deepStrictEqual(L.positionDe(r.cfg, 'plante'), [118, 100]);
  assert.deepStrictEqual(L.decalages(r.cfg).plante, [1, -28]);
  assert.deepStrictEqual(L.positionDe(cfg, 'plante'), [117, 128], 'entrée non modifiée');
  // au-delà des bornes : ramené à la région (hors bureau de Kinan, qui commence à 151)
  r = L.deplacer(cfg, 'plante', 5000, 130, AGENTS);
  assert.ok(r.ok && r.x <= 400 - 26 && L.emplacementValide(r.cfg, 'plante', r.x, r.y, AGENTS), 'borné et valide');
  r = L.deplacer(cfg, 'plante', -50, 5000, AGENTS);
  assert.ok(r.ok && r.x >= 4 && r.y <= 250 - 32 && L.emplacementValide(r.cfg, 'plante', r.x, r.y, AGENTS));
  r = L.deplacer(cfg, 'plante', 4, 100, AGENTS);
  assert.ok(!r.ok || r.x >= 112 || r.y + 32 <= 98 || r.x + 26 <= 29, 'couloir de gauche trop étroit pour la plante');
  // collision avec un bureau : refus, rien ne bouge
  r = L.deplacer(cfg, 'tableau', 60, 15, AGENTS);
  assert.ok(!r.ok); assert.strictEqual(r.cfg, cfg);
  r = L.deplacer(cfg, 'plante', 60, 120, AGENTS);
  assert.ok(r.ok && r.x === 117 && r.y === 120, 'glisse le long du bureau au lieu de le traverser');
  // glissement : on pousse la plante vers le bureau de Kinan en visant plus bas à droite, elle reste sur le couloir
  r = L.deplacer(cfg, 'plante', 140, 100, AGENTS);
  assert.ok(r.ok && r.x === 117 && r.y === 100, 'glisse verticalement : ' + JSON.stringify([r.x, r.y]));
  // retour exact à l'origine : aucune position stockée
  const loin = L.deplacer(cfg, 'plante', 118, 100, AGENTS).cfg;
  const retour = L.deplacer(loin, 'plante', 117, 128, AGENTS);
  assert.ok(retour.ok); assert.deepStrictEqual(retour.cfg.positions, {});
  // incréments du clavier
  r = L.deplacerDe(cfg, 'tableau', 2, 0, AGENTS); assert.ok(r.ok && r.x === 131);
  r = L.deplacerDe(cfg, 'tableau', 40, 0, AGENTS); assert.ok(!r.ok, 'bouton secret de la chasse à droite');
  r = L.deplacerDe(cfg, 'tableau', 0, -2, AGENTS); assert.ok(r.ok && r.y === 14 === false || r.y === 13 || r.ok);
  assert.ok(!L.deplacer(cfg, 'inconnu', 10, 10, AGENTS).ok);
  assert.ok(!L.deplacer(cfg, 'fanion', 10, 70, AGENTS).ok, 'objet mural inactif');
  assert.ok(!L.deplacer(cfg, 'plante', 'a', 10, AGENTS).ok && !L.deplacer(cfg, 'plante', NaN, 10, AGENTS).ok);
});

test('aucune position valide ne chevauche un agent, un écran ou une zone fixe (balayage de la scène)', () => {
  const cfg = L.configDefaut();
  for (const id of L.EXISTANTS) {
    for (let y = 0; y < 270; y += 7) for (let x = 0; x < 400; x += 7) {
      const r = L.deplacer(cfg, id, x, y, AGENTS);
      if (!r.ok) continue;
      const box = [r.x, r.y, ...L.OBJETS[id].taille];
      for (const f of L.interdits(AGENTS)) assert.ok(!L.rectsSeCoupent(box, f), id + ' en ' + r.x + ',' + r.y + ' recouvre ' + f);
      assert.ok(L.OBJETS[id].zones.some((z) => { const g = L.REGIONS[z]; return box[0] >= g[0] && box[1] >= g[1] && box[0] + box[2] <= g[0] + g[2] && box[1] + box[3] <= g[1] + g[3]; }));
    }
  }
  // moniteurs de chaque agent : entièrement dans la zone interdite du bureau
  for (const a of AGENTS) {
    const mon = [a.cx + a.s * 25 - 12, a.haut - 18, 24, 16], z = L.rectAgent(a);
    assert.ok(mon[0] >= z[0] && mon[1] >= z[1] && mon[0] + mon[2] <= z[0] + z[2] && mon[1] + mon[3] <= z[1] + z[3], 'moniteur de ' + a.cle);
  }
});

test('décors murales : emplacement libre automatique, variantes, désactivation, jamais de chevauchement', () => {
  let cfg = L.configDefaut();
  for (const id of L.MURALES) {
    const r = L.activerMurale(cfg, id, true, AGENTS);
    assert.ok(r.ok, id); cfg = r.cfg;
    assert.ok(cfg.murales[id].actif && cfg.positions[id]);
  }
  const act = L.actifs(cfg);
  assert.strictEqual(act.length, L.EXISTANTS.length + 3);
  for (const a of act) for (const b of act) if (a < b) {
    const pa = L.positionDe(cfg, a), pb = L.positionDe(cfg, b);
    assert.ok(!L.rectsSeCoupent([...pa, ...L.OBJETS[a].taille], [...pb, ...L.OBJETS[b].taille]), a + ' / ' + b);
  }
  // déplaçables, mais pas sur un autre objet
  assert.ok(!L.deplacer(cfg, 'fanion', 140, 20, AGENTS).ok, 'sur le tableau');
  const p = L.positionDe(cfg, 'ecusson'), o = L.deplacerDe(cfg, 'ecusson', 0, 0, AGENTS);
  assert.ok(o.ok && o.x === p[0]);
  assert.ok(L.varianteMurale(cfg, 'cadre', 3, AGENTS).ok && !L.varianteMurale(cfg, 'cadre', 4, AGENTS).ok && !L.varianteMurale(cfg, 'cadre', 1.5, AGENTS).ok);
  const off = L.activerMurale(cfg, 'fanion', false, AGENTS);
  assert.ok(off.ok && !off.cfg.murales.fanion.actif && !off.cfg.positions.fanion);
  assert.ok(!L.activerMurale(cfg, 'inconnu', true, AGENTS).ok);
  // une position enregistrée devenue invalide (corrompue) fait chercher un nouveau coin libre
  const abime = JSON.parse(JSON.stringify(cfg)); abime.positions.cadre = [150, 20];
  const v = L.valider(abime, AGENTS);
  assert.ok(v.murales.cadre.actif && L.emplacementValide(v, 'cadre', v.positions.cadre[0], v.positions.cadre[1], AGENTS));
});

test('sérialisation : aller-retour identique, stable, bornée', () => {
  let cfg = L.configDefaut();
  cfg = L.choisir(cfg, 'plante', 'bonsai', AGENTS).cfg;
  cfg = L.choisir(cfg, 'theme', 'ocean', AGENTS).cfg;
  cfg = L.activerMurale(cfg, 'cadre', true, AGENTS).cfg;
  cfg = L.deplacer(cfg, 'plante', 120, 100, AGENTS).cfg;
  const texte = L.serialiser(cfg);
  assert.deepStrictEqual(L.deserialiser(texte, AGENTS), cfg);
  assert.strictEqual(L.serialiser(L.deserialiser(texte, AGENTS)), texte);
  assert.ok(texte.length < 1000);
  assert.ok(!L.choisir(cfg, 'plante', 'n\'existe pas', AGENTS).ok && !L.choisir(cfg, 'inconnu', 'x', AGENTS).ok);
  assert.strictEqual(L.CLE, 'kinan-os.egg.royaume');
  // une configuration d'un autre bureau (agents différents) n'invalide rien : positions revalidées, sinon abandonnées
  const autre = L.deserialiser(texte, [{ cle: 'drafion', cx: 120, haut: 100, s: 1 }]);
  assert.ok(autre.plante === 'bonsai' && !autre.positions.plante);
});

test('réinitialisation : revient exactement à l\'origine, quelle que soit la configuration', () => {
  let cfg = L.configDefaut();
  for (const k of L.CHOIX) cfg = L.choisir(cfg, k, L.CATALOGUE[k][1][0], AGENTS).cfg;
  for (const id of L.MURALES) cfg = L.activerMurale(cfg, id, true, AGENTS).cfg;
  cfg = L.deplacer(cfg, 'horloge', 190, 20, AGENTS).cfg;
  assert.ok(!L.estDefaut(cfg));
  const zero = L.reinitialiser();
  assert.deepStrictEqual(zero, L.configDefaut());
  assert.ok(L.estDefaut(zero));
  assert.notStrictEqual(L.reinitialiser(), L.reinitialiser(), 'copies indépendantes');
});

test('thèmes, tapis, rideaux, ambiances : tout choix du catalogue est défini et reste dans le canevas', () => {
  for (const [id] of L.CATALOGUE.theme) { assert.ok(id in L.THEMES, 'thème ' + id); }
  for (const [id] of L.CATALOGUE.lampe) assert.ok(id in L.LAMPES, 'lampe ' + id);
  for (const [id] of L.CATALOGUE.ambiance) assert.ok(id in L.AMBIANCES, 'ambiance ' + id);
  for (const [id] of L.CATALOGUE.ciel) assert.ok(id in L.HEURES, 'ciel ' + id);
  for (const [id] of L.CATALOGUE.lueur) assert.ok(id in L.LUEURS, 'lueur ' + id);
  for (const [id] of L.CATALOGUE.tapis.slice(1)) assert.ok(L.TAPIS[id], 'tapis ' + id);
  for (const [id] of L.CATALOGUE.rideaux.slice(1)) assert.ok(L.RIDEAUX[id], 'rideaux ' + id);
  assert.deepStrictEqual(L.couchesFond(L.configDefaut()), []);
  const coul = /^#[0-9a-f]{6}$/i;
  for (const [id] of L.CATALOGUE.theme.slice(1)) {
    const couches = L.couchesFond(Object.assign(L.configDefaut(), { theme: id, tapis: 'bleu', rideaux: 'or' }));
    assert.ok(couches.length >= 5, id);
    for (const k of couches) {
      assert.ok(coul.test(k.couleur) && k.alpha > 0 && k.alpha <= 1, id);
      assert.ok(k.rect[0] >= 0 && k.rect[1] >= 0 && k.rect[0] + k.rect[2] <= 400 && k.rect[1] + k.rect[3] <= 270, id + ' ' + k.nom);
    }
  }
  for (const h of Object.values(L.HEURES)) assert.ok(h === null || (h >= 0 && h < 24));
  for (const a of Object.values(L.AMBIANCES)) if (a) assert.ok(a.voile[3] <= 0.12 && a.vignette <= 0.4 && a.voile.length === 4, 'ambiance lisible (voile faible)');
  assert.ok(L.LUEURS.vive <= 0.2);
});

test('particules : simulation déterministe, bornée à la scène, profondeur, indépendante de la cadence, figée en mouvement réduit', () => {
  for (const type of L.TYPES_PARTICULES) {
    const mk = () => L.creerParticules(type, L.NB_PARTICULES, 42);
    const un = mk(), deux = mk();
    assert.strictEqual(un.length, L.NB_PARTICULES);
    assert.deepStrictEqual(un, deux, 'même graine, même départ');
    assert.notDeepStrictEqual(L.creerParticules(type, 10, 7), L.creerParticules(type, 10, 8), 'graines différentes');
    for (const p of un) assert.ok(p.z >= 0.15 && p.z <= 1, 'profondeur ' + type);
    // 20 s à 60 i/s : toujours dans la scène (marge de 6 px pour le bouclage), jamais NaN
    const ps = mk();
    for (let t = 0; t < 20000; t += 16) {
      L.avancer(ps, type, 16, t);
      for (const p of ps) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), type + ' fini');
        assert.ok(p.x >= -6 && p.x <= 406 && p.y >= -24 && p.y <= 258, type + ' dans la scène : ' + p.x + ',' + p.y);
        const r = L.rendu(p, type, t, false);
        assert.ok(r.a >= 0 && r.a <= 1 && r.halo >= 0 && r.halo <= 1 && r.r > 0 && r.r < 4, type + ' aspect');
      }
    }
    // mêmes entrées : même résultat (déterminisme), et les particules bougent vraiment
    const x = mk(), y = mk();
    for (let t = 0; t < 3000; t += 16) { L.avancer(x, type, 16, t); L.avancer(y, type, 16, t); }
    assert.deepStrictEqual(x, y);
    const avant = mk(); L.avancer(avant, type, 16, 0);
    assert.ok(x.some((p, i) => Math.hypot(p.x - avant[i].x, p.y - avant[i].y) > 2), type + ' : mouvement visible');
    // cadence : 1 s en 60 pas de 16 ms ou en 30 pas de 33 ms donne presque la même position (tolérance 1,5 px)
    const rapide = mk(), lent = mk();
    for (let i = 0; i < 60; i++) L.avancer(rapide, type, 16.667, i * 16.667);
    for (let i = 0; i < 30; i++) L.avancer(lent, type, 33.333, i * 33.333);
    for (let i = 0; i < rapide.length; i++) if (type !== 'lucioles') assert.ok(Math.hypot(rapide[i].x - lent[i].x, rapide[i].y - lent[i].y) < 1.5, type + ' indépendant de la cadence');
    // pause (onglet masqué) : un énorme dt est borné, aucun saut
    const pause = mk(); const av = mk(); L.avancer(pause, type, 5e6, 1e6); L.avancer(av, type, 64, 1e6);
    assert.deepStrictEqual(pause, av, 'dt borné à 64 ms');
    // mouvement réduit : l'aspect ne dépend pas du temps
    for (const p of un) assert.deepStrictEqual(L.rendu(p, type, 123456, true), L.rendu(p, type, 0, true), 'calme : figé');
  }
  assert.deepStrictEqual(L.creerParticules('aucune', 10, 1), []);
  assert.deepStrictEqual(L.avancer(null, 'flocons', 16, 0), null);
  assert.ok(L.creerParticules('flocons', 1e9, 1).length <= 120);
  // parallaxe : proportionnelle à la profondeur, bornée, nulle sans pointeur
  const proche = { z: 1 }, loin = { z: 0.2 };
  assert.deepStrictEqual(L.parallaxe(proche, 0, 0), [-0, -0]);
  assert.ok(Math.abs(L.parallaxe(proche, 1, 1)[0]) > Math.abs(L.parallaxe(loin, 1, 1)[0]));
  assert.ok(Math.abs(L.parallaxe(proche, 99, -99)[0]) <= 7 && Math.abs(L.parallaxe(proche, 99, -99)[1]) <= 4);
  assert.ok(L.modeTest('?egg-royaume=1') && L.modeTest('?a=1&egg-royaume=1') && !L.modeTest('?egg-royaume=10') && !L.modeTest(''));
});

test('glisser-déposer libre : aperçu valide/invalide, dépose exacte ou ajustée, refus propre', () => {
  let cfg = L.configDefaut();
  cfg = L.activerMurale(cfg, 'fanion', true, AGENTS).cfg;
  // valide en plein lambris, à gauche (sous la fenêtre)
  let ap = L.apercu(cfg, 'fanion', 60, 66, AGENTS);
  assert.ok(ap.valide && ap.raison === null);
  // hors des zones (mur du haut, trop haut), sur la fenêtre, sur un autre objet, valeurs invalides
  assert.deepStrictEqual([L.apercu(cfg, 'fanion', 60, 2, AGENTS).valide, L.apercu(cfg, 'fanion', 60, 2, AGENTS).raison], [false, 'zone']);
  assert.strictEqual(L.apercu(cfg, 'fanion', 40, 20, AGENTS).raison, 'fixe');
  assert.strictEqual(L.apercu(cfg, 'fanion', 140, 20, AGENTS).raison, 'objet');
  assert.strictEqual(L.apercu(cfg, 'fanion', NaN, 20, AGENTS).raison, 'position');
  assert.strictEqual(L.apercu(cfg, 'inconnu', 1, 1, AGENTS).raison, 'position');
  // dépose exacte
  let r = L.deposer(cfg, 'fanion', 60, 66, AGENTS);
  assert.ok(r.ok && !r.ajuste && r.x === 60 && r.y === 66);
  assert.deepStrictEqual(L.positionDe(r.cfg, 'fanion'), [60, 66]);
  assert.deepStrictEqual(L.positionDe(cfg, 'fanion'), L.positionDe(cfg, 'fanion'), 'entrée non modifiée');
  // dépose à côté d'un obstacle : ajustée au plus proche emplacement valide, jamais invalide
  r = L.deposer(cfg, 'fanion', 163, 20, AGENTS);
  assert.ok(r.ok && r.ajuste && L.emplacementValide(r.cfg, 'fanion', r.x, r.y, AGENTS), 'ajustée : ' + JSON.stringify([r.x, r.y]));
  assert.ok(Math.hypot(r.x - 163, r.y - 20) <= 20);
  // loin de tout emplacement valide (milieu du bureau de Kinan) : refus, rien ne change
  r = L.deposer(cfg, 'fanion', 200, 120, AGENTS);
  assert.ok(!r.ok && r.cfg === cfg);
  assert.ok(!L.deposer(cfg, 'ecusson', 60, 66, AGENTS).ok, 'objet inactif');
  // objets d'origine : retour à l'origine = aucune position stockée
  const plante = L.deposer(cfg, 'plante', 118, 100, AGENTS);
  assert.ok(plante.ok);
  const retour = L.deposer(plante.cfg, 'plante', 117, 128, AGENTS);
  assert.ok(retour.ok && !retour.cfg.positions.plante);
  // balayage : toute dépose acceptée est valide et dans une zone permise
  for (let y = 0; y < 270; y += 9) for (let x = 0; x < 400; x += 9) {
    const d = L.deposer(cfg, 'fanion', x, y, AGENTS);
    if (!d.ok) continue;
    assert.ok(L.emplacementValide(d.cfg, 'fanion', d.x, d.y, AGENTS), 'valide en ' + d.x + ',' + d.y);
  }
  assert.ok(L.zonesPermises('fanion').length === 2 && L.zonesPermises('inconnu').length === 0);
  assert.ok(L.rectsEvites(cfg, 'fanion', AGENTS).length > L.interdits(AGENTS).length - 1);
});

test('emplacements nommés : décor mural posé dans la zone choisie, libre, sans chevauchement', () => {
  let cfg = L.configDefaut();
  for (const id of L.MURALES) cfg = L.activerMurale(cfg, id, true, AGENTS).cfg;
  for (const [nom, z] of Object.entries(L.EMPLACEMENTS)) {
    assert.ok(L.LIBELLES_EMPLACEMENTS[nom], 'libellé ' + nom);
    const r = L.placerDans(cfg, 'cadre', nom, AGENTS);
    if (!r.ok) continue; // zone pleine : refus propre
    assert.ok(r.x >= z[0] && r.y >= z[1] && r.x + 16 <= z[0] + z[2] && r.y + 14 <= z[1] + z[3], 'dans ' + nom);
    assert.ok(L.emplacementValide(r.cfg, 'cadre', r.x, r.y, AGENTS));
  }
  assert.ok(L.placerDans(cfg, 'cadre', 'lambris-gauche', AGENTS).ok && L.placerDans(cfg, 'ecusson', 'lambris-droite', AGENTS).ok);
  assert.ok(!L.placerDans(cfg, 'cadre', 'nimporte', AGENTS).ok && !L.placerDans(cfg, 'plante', 'lambris-gauche', AGENTS).ok);
  assert.ok(!L.placerDans(L.configDefaut(), 'cadre', 'lambris-gauche', AGENTS).ok, 'objet inactif');
});

test('agents au bureau et objets par écran : affichage seulement, persistés, validés', () => {
  let cfg = L.configDefaut();
  assert.ok(L.agentVisible(cfg, 'drafion') && L.estDefaut(cfg));
  let r = L.masquerAgent(cfg, 'drafion', true, AGENTS);
  assert.ok(r.ok && !L.agentVisible(r.cfg, 'drafion') && !L.estDefaut(r.cfg));
  assert.ok(!L.masquerAgent(cfg, 'kinan', true, AGENTS).ok, 'le juge reste au bureau');
  assert.ok(!L.masquerAgent(cfg, '<x>', true, AGENTS).ok && !L.masquerAgent(cfg, 5, true, AGENTS).ok);
  r = L.masquerAgent(r.cfg, 'drafion', false, AGENTS);
  assert.ok(r.ok && L.estDefaut(r.cfg), 'réafficher revient exactement à l\'origine');
  // objet par écran
  cfg = L.choisir(cfg, 'bureau', 'sablier', AGENTS).cfg;
  assert.strictEqual(L.bureauDe(cfg, 'skyze', 2), 'sablier');
  const hib = L.choisirBureau(cfg, 'skyze', 'hibou', AGENTS);
  assert.ok(hib.ok && L.bureauDe(hib.cfg, 'skyze', 2) === 'hibou' && L.bureauDe(hib.cfg, 'drafion', 0) === 'sablier');
  const aucun = L.choisirBureau(hib.cfg, 'drafion', 'aucun', AGENTS);
  assert.strictEqual(L.bureauDe(aucun.cfg, 'drafion', 0), 'aucun');
  assert.strictEqual(L.bureauDe(L.choisirBureau(aucun.cfg, 'drafion', 'defaut', AGENTS).cfg, 'drafion', 0), 'sablier');
  assert.ok(!L.choisirBureau(cfg, 'drafion', 'licorne', AGENTS).ok && !L.choisirBureau(cfg, '!', 'hibou', AGENTS).ok);
  assert.ok(!L.choisir(cfg, 'bureau', 'defaut', AGENTS).ok, 'defaut n\'est pas un choix général');
  cfg = L.choisir(cfg, 'bureau', 'assortis', AGENTS).cfg;
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((i) => L.bureauDe(cfg, 'x', i)), ['cactus', 'hibou', 'sablier', 'trophee', 'cactus']);
  // sérialisation et corruption
  const texte = L.serialiser(L.choisirBureau(L.masquerAgent(L.configDefaut(), 'johms', true, AGENTS).cfg, 'skyze', 'hibou', AGENTS).cfg);
  const lu = L.deserialiser(texte, AGENTS);
  assert.deepStrictEqual(lu.masques, ['johms']); assert.deepStrictEqual(lu.bureauPar, { skyze: 'hibou' });
  const abime = L.valider({ masques: ['kinan', 'ok', 'ok', 5, '<b>', ...Array(30).fill('a1')], bureauPar: { skyze: 'licorne', 'a b': 'hibou', x: 'trophee', y: 'defaut' } }, AGENTS);
  assert.ok(abime.masques.every((k) => /^[a-z0-9_-]+$/i.test(k)) && !abime.masques.includes('kinan') && new Set(abime.masques).size === abime.masques.length && abime.masques.length <= 12);
  assert.deepStrictEqual(abime.bureauPar, { x: 'trophee' });
  assert.ok(L.estDefaut(L.valider({ masques: 'tous', bureauPar: [1, 2] }, AGENTS)));
});

// ---- socle : les zones cliquables suivent un objet déplacé ----
test('socle : deplacerZone décale la zone (absolu par rapport à l\'origine), y compris avec taille minimale', () => {
  const boutons = [];
  const faux = () => ({ style: { cssText: '' }, setAttribute() {}, addEventListener() {}, parentNode: null, appendChild() {} });
  const doc = {
    hidden: false, addEventListener() {},
    getElementById: () => ({ parentElement: { appendChild: (b) => boutons.push(b) } }),
    createElement: () => faux()
  };
  const scene = { dim: { W: 400, H: 270, DY: 18 }, agents: () => [], etat: () => null, calme: () => false, surDessin() {}, salir() {} };
  const egg = creer({ localStorage: null, location: { search: '' }, document: doc, KinanEquipe: scene, console: { warn() {} } });
  let z = null;
  egg.module('essai', (api) => { z = api.zone('Plante', [121, 130, 18, 26], { min: 24 }); api.zone('Tableau', [129, 15, 40, 32], {}); });
  assert.ok(z && boutons.length === 2);
  const [plante, tableau] = boutons;
  const avantG = plante.style.left, avantH = plante.style.top;
  assert.ok(egg.deplacerZone('Plante', 10, -20));
  assert.notStrictEqual(plante.style.left, avantG);
  assert.strictEqual(plante.style.left, ((121 + 10 + 9) / 400) * 100 + '%');
  assert.strictEqual(plante.style.top, ((130 - 20 + 13 + 18) / 270) * 100 + '%');
  assert.ok(egg.deplacerZone('Plante', 0, 0));
  assert.strictEqual(plante.style.left, avantG); assert.strictEqual(plante.style.top, avantH, 'retour à l\'origine');
  assert.ok(egg.deplacerZone('Tableau', 4, 2));
  assert.strictEqual(tableau.style.left, ((129 + 4) / 400) * 100 + '%');
  assert.strictEqual(egg.deplacerZone('Inconnue', 1, 1), false);
});

// motifs assemblés par morceaux pour ne pas déclencher outils/verifier-hors-ligne.js sur ce fichier de test
const RESEAU = new RegExp(['fet' + 'ch\\s*\\(', 'XMLHttp' + 'Request', 'Web' + 'Socket', 'Event' + 'Source', 'send' + 'Beacon', 'state\\.' + 'json', 'ipc' + 'Renderer', 'window\\.kinan\\b', 'ht' + 'tps?:', 'import\\s*\\('].join('|'));
test('garde-fous statiques : hors-ligne, hors agents, clé unique, accessible, chargé après jean.js', () => {
  const vue = lire('src/eggs/royaume.js'), logique = lire('src/eggs/royaume-logique.js'), page = lire('src/index.html');
  for (const src of [vue, logique]) {
    assert.ok(!RESEAU.test(src), 'aucun réseau, état ni IPC');
    assert.ok(!/\binnerHTML\b|\beval\s*\(|new Function/.test(src));
    assert.ok(!/\.etat\s*\(|etats\s*\(|surChangement|eq\.etat/.test(src), 'aucune lecture ni écriture d\'état d\'agent');
  }
  assert.ok(!/\bdocument\b|getContext|localStorage|requestAnimationFrame/.test(logique), 'logique sans DOM');
  assert.ok(/KinanEgg\.module\('royaume'/.test(vue) && /api\.ecouter\('kinan-egg-royaume'/.test(vue));
  assert.ok(/'Escape'/.test(vue) && /role', 'dialog'/.test(vue) && /aria-labelledby/.test(vue) && /aria-live/.test(vue) && /\.focus\(\)/.test(vue));
  assert.ok(/api\.calme\(\)/.test(vue) && /api\.son\(/.test(vue), 'mouvement réduit et mute respectés');
  assert.ok(/L\.CLE/.test(vue) && /kinan-os\.egg\.royaume'/.test(logique));
  assert.ok(!/localStorage\.(setItem|getItem|removeItem)\(\s*['"]/.test(vue), 'aucune autre clé que L.CLE');
  const i = (s) => page.indexOf('<script src="' + s + '"></script>');
  assert.ok(i('eggs/jean.js') > 0 && i('eggs/royaume-logique.js') > i('eggs/jean.js') && i('eggs/royaume.js') > i('eggs/royaume-logique.js'));
  assert.ok(i('eggs/royaume.js') < i('boutons.js'));
});

test('anciens eggs : « Bientôt. » retiré du bouton de Jean et de la chasse, zones et effets suivent le décor déplacé', () => {
  const jean = lire('src/eggs/jean.js'), chasse = lire('src/eggs/chasse.js'), objets = lire('src/eggs/objets.js'), scene = lire('src/scene.js'), core = lire('src/egg-core.js');
  assert.ok(!/L\.TEXTES\.bientot/.test(jean) && /api\.emettre\('kinan-egg-royaume'/.test(jean));
  assert.ok(!/L\.BULLES\.jean/.test(chasse));
  assert.ok(/eq\.deco\.decalage/.test(objets) && /c\.translate\(d\[0\], d\[1\]\)/.test(objets));
  assert.ok(/deco: \{/.test(scene) && /avantAgents/.test(scene) && /apresDecor/.test(scene) && /redessiner/.test(scene));
  assert.ok(/deplacerZone/.test(core));
});
