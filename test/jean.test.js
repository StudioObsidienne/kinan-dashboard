// Cinématique de Jean (être de lumière) : texte exact, machine à écrire, chronologie, course vivante, envol en spirale, astre, musique, persistance et garde-fous (logique pure, sans DOM).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../src/eggs/jean-logique.js');
const { creer } = require('../src/egg-core.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function fauxStockage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] || null, get length() { return m.size; }, _m: m };
}
const eggAvec = (ls) => creer({ localStorage: ls, location: { search: '' }, console: { warn() {} } });

test('jean : texte exact et fiche', () => {
  assert.deepStrictEqual([...L.TEXTES.lignes], ['Ouais, je suis le roi du monde.', 'Bien joué, tu m\'as trouvé, tu m\'as libéré.', 'Maintenant, à toi la créativité.']);
  assert.strictEqual(L.TEXTES.titre, 'JEAN — L\'ÊTRE SUPRÊME');
  assert.strictEqual(L.ficheTexte(), 'JEAN — Architecte de l\'univers — Créateur du royaume Kinan. « Celui qui orchestre les orchestrateurs. »');
  assert.strictEqual(L.TEXTES.royaume, 'PARAMÈTRES DU ROYAUME');
  assert.ok(Object.isFrozen(L.TEXTES) && Object.isFrozen(L.TEXTES.lignes));
});

test('jean : machine à écrire (ordre, fin, pauses comiques)', () => {
  const plan = L.planMachine(L.TEXTES.lignes);
  const tout = L.TEXTES.lignes.join('\n');
  assert.strictEqual(plan.total, Array.from(tout).length);
  assert.strictEqual(L.visibles(plan, 0), 0);
  assert.strictEqual(L.visibles(plan, plan.duree), plan.total);
  assert.strictEqual(L.texteVisible(L.TEXTES.lignes, plan.total), tout);
  assert.strictEqual(L.texteVisible(L.TEXTES.lignes, 5), 'Ouais');
  let avant = 0;
  for (let ms = 0; ms <= plan.duree; ms += 37) { const n = L.visibles(plan, ms); assert.ok(n >= avant); avant = n; }
  for (let i = 1; i < plan.temps.length; i++) assert.ok(plan.temps[i] > plan.temps[i - 1]);
  // « Ouais, » est suivi d'une pause plus longue qu'une virgule ordinaire (« monde » n'a pas de virgule : on compare à « joué, »)
  const ecart = (frag, l) => { const s = L.TEXTES.lignes.slice(0, l).join('\n'); const k = Array.from(s ? s + '\n' : '').length + Array.from(L.TEXTES.lignes[l].slice(0, L.TEXTES.lignes[l].indexOf(frag) + frag.length)).length - 1; return plan.temps[k + 1] - plan.temps[k]; };
  assert.ok(ecart('Ouais,', 0) > ecart('joué,', 1) + 500);
  assert.ok(ecart('trouvé,', 1) > ecart('joué,', 1));
  assert.strictEqual(L.caractere(L.TEXTES.lignes, 0), 'O');
  // garde-fous
  assert.strictEqual(L.visibles(plan, -10), 0);
  assert.strictEqual(L.visibles(plan, NaN), 0);
  assert.strictEqual(L.visibles(null, 1000), 0);
  assert.strictEqual(L.texteVisible(L.TEXTES.lignes, 1e9), tout);
  assert.strictEqual(L.texteVisible(L.TEXTES.lignes, -3), '');
});

test('jean : chronologie intro et finale', () => {
  const plan = L.planMachine();
  const intro = L.chronologie('intro', { plan });
  assert.deepStrictEqual(intro.map((p) => p.nom), ['apparition', 'descente', 'parole', 'attente']);
  assert.strictEqual(intro[2].duree, plan.duree);
  assert.strictEqual(L.phase(intro, 0).nom, 'apparition');
  assert.strictEqual(L.phase(intro, 2600).nom, 'descente');
  assert.strictEqual(L.phase(intro, 2600 + 3000).p, 0.5);
  assert.strictEqual(L.phase(intro, 8600).nom, 'parole');
  assert.strictEqual(L.phase(intro, 8600 + plan.duree + 1e7).nom, 'attente'); // attend le clic, sans fin
  const finale = L.chronologie('finale', {});
  assert.deepStrictEqual(finale.map((p) => p.nom), ['brille', 'contraction', 'course', 'envol', 'explosion', 'retour']);
  const total = finale.reduce((a, p) => a + p.duree, 0);
  assert.ok(total <= 12000, 'finale courte');
  assert.strictEqual(L.phase(finale, total).nom, 'fin');
  for (let i = 1; i < finale.length; i++) assert.strictEqual(finale[i].debut, finale[i - 1].debut + finale[i - 1].duree);
  // explosion alignée sur le dernier accord de la partition finale, course et envol sur les leurs
  const pf = L.PARTITION.finale;
  assert.strictEqual(finale.find((p) => p.nom === 'explosion').debut, pf[pf.length - 1].t);
  assert.strictEqual(finale.find((p) => p.nom === 'course').debut, pf[1].t);
  assert.strictEqual(finale.find((p) => p.nom === 'envol').debut, pf[2].t);
  assert.strictEqual(L.dureeFinale('course'), finale.find((p) => p.nom === 'course').duree);
  // mouvement réduit : version courte, Jean déjà au centre, aucune phase de mouvement
  const ic = L.chronologie('intro', { calme: true }), fc = L.chronologie('finale', { calme: true });
  assert.deepStrictEqual(ic.map((p) => p.nom), ['attente']);
  assert.strictEqual(fc.length, 0);
  assert.strictEqual(L.phase(fc, 0).nom, 'fin');
  // garde-fous
  assert.strictEqual(L.phase(intro, -50).nom, 'apparition');
  assert.strictEqual(L.phase(intro, NaN).p, 0);
});

test('jean : course vivante, bornée et déterministe (graine)', () => {
  const a = L.trajet(42), b = L.trajet(42), c = L.trajet(43);
  assert.deepStrictEqual(a, b, 'même graine, même course');
  assert.notDeepStrictEqual(a.x, c.x);
  assert.strictEqual(a.duree, L.dureeFinale('course'));
  assert.strictEqual(a.x.length, Math.round(a.duree / 1000 / L.PAS_COURSE) + 1);
  assert.deepStrictEqual(L.surTrajet(a, 0), { x: 0.5, y: 0.5, vx: 0, vy: 0 }, 'part du centre, à l\'arrêt');
  const fin = L.surTrajet(a, 1);
  assert.ok(Math.abs(fin.x - a.fin.x) < 1e-12 && Math.abs(fin.y - a.fin.y) < 1e-12);
  assert.deepStrictEqual(L.surTrajet(a, -1), L.surTrajet(a, 0));
  assert.deepStrictEqual(L.surTrajet(a, NaN), L.surTrajet(a, 0));
  assert.ok(L.trajet(NaN).x.length > 100 && L.trajet(1, 99).points.length === 17 && L.trajet(1, 0).points.length === 3);
  // cibles : allers-retours d'un bord à l'autre
  for (let i = 2; i < a.points.length; i++) assert.ok(Math.sign(a.points[i].x - 0.5) === -Math.sign(a.points[i - 1].x - 0.5), 'allers-retours');
  for (let g = 1; g <= 60; g++) {
    const t = L.trajet(g * 7919 + 3), n = t.x.length, v = [];
    let pire = 0, minima = 0;
    for (let i = 0; i < n; i++) {
      assert.ok(t.x[i] >= 0.01 && t.x[i] <= 0.99 && t.y[i] >= 0.05 && t.y[i] <= 0.95, 'reste à l\'écran');
      v.push(Math.hypot(t.vx[i], t.vy[i]));
    }
    for (let i = 1; i < n - 1; i++) {
      // jamais d'angle net : dès qu'elle bouge, sa direction tourne peu entre deux échantillons (1/120 s)
      if (v[i] > 0.15) { let d = Math.abs(Math.atan2(t.vy[i + 1], t.vx[i + 1]) - Math.atan2(t.vy[i], t.vx[i])); if (d > Math.PI) d = 2 * Math.PI - d; pire = Math.max(pire, d); }
      if (v[i] < v[i - 1] && v[i] <= v[i + 1]) minima++;
      assert.ok(Math.hypot(t.x[i + 1] - t.x[i], t.y[i + 1] - t.y[i]) < 0.05, 'position continue');
    }
    assert.ok(pire < 0.6, 'virage trop sec : ' + pire);
    const tri = v.slice().sort((p, q) => p - q);
    assert.ok(tri[n - 1] > tri[n >> 1] * 1.6, 'vitesse irrégulière (accélérations et ralentis)');
    assert.ok(minima >= 4, 'hésitations et ralentis');
    // trajectoire courbe : la direction tourne dans les deux sens
    let gauche = 0, droite = 0;
    for (let i = 1; i < n; i++) { const cr = t.vx[i - 1] * t.vy[i] - t.vy[i - 1] * t.vx[i]; if (cr > 1e-4) gauche++; else if (cr < -1e-4) droite++; }
    assert.ok(gauche > 20 && droite > 20, 'courbes');
  }
});

test('jean : envol en spirale vers l\'astre, étirement et pulsation de la boule', () => {
  const d = { x: 700, y: 500 }, a = { x: 160, y: 90 }, o = { tours: 2.2, sens: 1, rayon: 120 };
  assert.deepStrictEqual(L.spirale(d, a, 0, o), d);
  assert.deepStrictEqual(L.spirale(d, a, 1, o), a);
  assert.deepStrictEqual(L.spirale(d, a, NaN, o), d);
  assert.deepStrictEqual(L.spirale(d, a, 9, o), a);
  const pts = []; for (let i = 0; i <= 600; i++) pts.push(L.spirale(d, a, i / 600, o));
  let saut = 0, ecart = 0, tour = 0;
  const D = Math.hypot(a.x - d.x, a.y - d.y), ux = (a.x - d.x) / D, uy = (a.y - d.y) / D;
  for (let i = 1; i < pts.length; i++) {
    saut = Math.max(saut, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    ecart = Math.max(ecart, Math.abs((pts[i].x - d.x) * uy - (pts[i].y - d.y) * ux));
    if (i > 1) {
      const v0x = pts[i - 1].x - pts[i - 2].x, v0y = pts[i - 1].y - pts[i - 2].y, v1x = pts[i].x - pts[i - 1].x, v1y = pts[i].y - pts[i - 1].y;
      tour += Math.atan2(v0x * v1y - v0y * v1x, v0x * v1x + v0y * v1y);
    }
  }
  assert.ok(saut < 20, 'continue');
  assert.ok(ecart > 60, 'pas en ligne droite');
  assert.ok(Math.abs(tour) > 2 * Math.PI, 'au moins une boucle complète');
  assert.notDeepStrictEqual(L.spirale(d, a, 0.4, o), L.spirale(d, a, 0.4, { ...o, sens: -1 }));
  // départ dans la continuité de la course
  const v0 = { x: 400, y: -200 }, ov = { ...o, v0, duree: 1800 }, h = 1e-5, p1 = L.spirale(d, a, h, ov);
  assert.ok(Math.abs((p1.x - d.x) / (h * 1.8) - v0.x) < 60 && Math.abs((p1.y - d.y) / (h * 1.8) - v0.y) < 60);
  assert.deepStrictEqual(L.spirale(d, a, 1, ov), a);
  // squash and stretch : volume conservé, borné, dans l'axe du mouvement
  const repos = L.etirement(0, 0, 100);
  assert.deepStrictEqual(repos, { angle: 0, long: 1, large: 1 });
  let avant = 1;
  for (const v of [10, 100, 400, 2000, 1e6]) {
    const e = L.etirement(v, 0, 100);
    assert.ok(Math.abs(e.long * e.large - 1) < 1e-12 && e.long > avant && e.long <= 1.75);
    avant = e.long;
  }
  assert.ok(Math.abs(L.etirement(0, 50, 100).angle - Math.PI / 2) < 1e-12);
  assert.deepStrictEqual(L.etirement(NaN, 3, 100), repos);
  for (let t = 0; t < 20000; t += 7) { const p = L.pulsation(t); assert.ok(p >= 0.89 && p <= 1.11); }
  assert.strictEqual(L.pulsation(NaN), 1);
});

test('jean : soleil ou lune de la fenêtre, conversion vers l\'écran', () => {
  const fen = [21, 9, 86, 52];
  assert.deepStrictEqual(L.astre(23, fen), { x: 85, y: 22, nuit: true });
  assert.ok(L.astre(2, fen).nuit);
  const midi = L.astre(13.5, fen);
  assert.strictEqual(midi.nuit, false);
  assert.ok(Math.abs(midi.x - 64) < 1e-9 && Math.abs(midi.y - 19) < 1e-9);
  const p = L.astre(10, fen);
  assert.ok(p.x >= 25 && p.x <= 103 && p.y >= 13 && p.y <= 57, 'dans la vitre');
  assert.deepStrictEqual(L.astre(23, 'n\'importe quoi'), L.astre(23, L.FENETRE_DEFAUT));
  assert.strictEqual(L.astre(NaN, fen).nuit, false);
  assert.strictEqual(L.heureDepuis('?heure=22.5', new Date(2026, 0, 1, 9, 0)), 22.5);
  assert.strictEqual(L.heureDepuis('', new Date(2026, 0, 1, 9, 30)), 9.5);
  const e = L.versEcran({ x: 200, y: 117 }, { left: 10, top: 20, width: 800, height: 540 }, { W: 400, H: 270, DY: 18 });
  assert.deepStrictEqual(e, { x: 410, y: 290 });
  assert.strictEqual(L.versEcran({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 0 }, { W: 400, H: 270, DY: 18 }), null);
  assert.strictEqual(L.versEcran({ x: 1, y: 1 }, null, null), null);
});

test('jean : bouton du royaume dans la scène, hors du bouton secret de la chasse', () => {
  const [x, y, w, h] = L.BOUTON_BOITE;
  assert.ok(x >= 25 && x + w <= 103 && y >= 13 && y + h <= 59, 'sur la vitre');
  const C = require('../src/eggs/chasse-logique.js').BOUTON_BOITE;
  assert.ok(x + w < C[0] || C[0] + C[2] < x || y + h < C[1] || C[1] + C[3] < y);
});

test('jean : chant de voix douces (formants, voix basses et hautes, cloches), voix de lettre, volume', () => {
  for (const part of [L.PARTITION.intro, L.PARTITION.finale]) {
    for (let i = 0; i < part.length; i++) {
      const a = part[i];
      if (i) assert.ok(a.t >= part[i - 1].t);
      assert.ok(a.basse.length >= 1 && a.voix.length >= 1);
      assert.ok(a.basse.every((m) => m <= 57) && a.voix.every((m) => m >= 60));
      for (const m of [...a.basse, ...a.voix, ...(a.arpege || [])]) { const f = L.midiHz(m); assert.ok(f >= 40 && f <= 1300, 'fréquence audible et douce : ' + f); }
      assert.ok(a.v > 0 && a.v <= 0.9, 'volume raisonnable');
      assert.ok(a.voyelles.length === 2 && a.voyelles.every((v) => L.FORMANTS[v]), 'voyelles connues');
      assert.ok(Object.isFrozen(a) && Object.isFrozen(a.voix));
    }
    assert.ok(!part.some((a) => a.glisse || a.nappe), 'plus de synthé ni de glissade');
  }
  // formants : « a » plus ouvert que « o », lui-même plus ouvert que « ou » ; gains relatifs bornés
  assert.ok(L.FORMANTS.a[0][0] > L.FORMANTS.o[0][0] && L.FORMANTS.o[0][0] > L.FORMANTS.u[0][0]);
  for (const v of Object.values(L.FORMANTS)) for (const [f, g, bw] of v) assert.ok(f > 200 && f < 3500 && g > 0 && g <= 1 && bw > 0);
  // musique synchronisée sur la descente : un accord à l'arrivée (fin de la descente, début de la parole)
  const plan = L.planMachine(), intro = L.chronologie('intro', { plan });
  assert.ok(L.PARTITION.intro.some((a) => a.t === intro.find((p) => p.nom === 'descente').debut));
  assert.ok(L.PARTITION.intro.some((a) => a.t === intro.find((p) => p.nom === 'parole').debut));
  assert.strictEqual(L.midiHz(69), 440);
  const fi = L.PARTITION.intro[L.PARTITION.intro.length - 1];
  assert.ok(fi.t + fi.d <= 2600 + 6000 + 4000, 'musique courte');
  const arp = L.planArpege(L.PARTITION.intro);
  assert.ok(arp.length > 20);
  for (let i = 1; i < arp.length; i++) assert.ok(arp[i].t >= arp[i - 1].t);
  for (const n of arp) { const a = L.PARTITION.intro.find((x) => x.arpege && n.t >= x.t && n.t < x.t + x.d); assert.ok(a && a.arpege.includes(n.m)); }
  assert.deepStrictEqual(L.planArpege(null), []);
  assert.deepStrictEqual(L.planArpege([{ t: 0, d: 1000, v: 1, basse: [40], nappe: [60] }]), []);
  for (const ch of 'ouaisjeroimondébê') { const f = L.hauteurLettre(ch); assert.ok(f >= 82 && f <= 122); }
  for (const ch of [' ', ',', '.', '\n', '\'', '', 'ab']) assert.strictEqual(L.hauteurLettre(ch), null);
  assert.strictEqual(L.hauteurLettre('A'), L.hauteurLettre('a'));
  assert.strictEqual(L.borneVolume(2), 1);
  assert.strictEqual(L.borneVolume(-1), 0);
  assert.strictEqual(L.borneVolume('x'), L.VOLUME_DEFAUT);
});

test('jean : persistance (kinan-os.egg.jean.*), mode test sans écriture', () => {
  const ls = fauxStockage();
  const stock = eggAvec(ls).stock('jean');
  assert.strictEqual(L.lireFait(stock), false);
  assert.strictEqual(L.marquerFait(stock, { test: true }), false);
  assert.strictEqual(ls.length, 0, 'mode test : rien écrit');
  assert.strictEqual(L.marquerFait(stock), true);
  assert.deepStrictEqual([...ls._m.keys()], ['kinan-os.egg.jean.' + L.CLE_ETAT]);
  assert.strictEqual(L.lireFait(eggAvec(ls).stock('jean')), true, 'survit au rechargement');
  // corrompu, indisponible ou absent
  assert.strictEqual(L.lireFait(eggAvec(fauxStockage({ 'kinan-os.egg.jean.etat': '{oups' })).stock('jean')), false);
  assert.strictEqual(L.lireFait(eggAvec(fauxStockage({ 'kinan-os.egg.jean.etat': '{"fait":"oui"}' })).stock('jean')), false);
  const casse = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, key() { return null; }, length: 0 };
  assert.strictEqual(L.lireFait(eggAvec(casse).stock('jean')), false);
  assert.strictEqual(L.marquerFait(eggAvec(casse).stock('jean')), false);
  assert.strictEqual(L.lireFait(null), false);
  assert.strictEqual(L.marquerFait(null), false);
  assert.strictEqual(L.lireFait({ get() { throw new Error('x'); } }), false);
  assert.ok(L.modeTest('?egg-jean=1') && L.modeTest('?a=2&egg-jean=1&b'));
  assert.ok(!L.modeTest('?egg-jean=10') && !L.modeTest('') && !L.modeTest(undefined));
});

test('jean : garde-fous statiques (indépendant, hors agents, chargé après la chasse)', () => {
  const vue = lire('src/eggs/jean.js'), logique = lire('src/eggs/jean-logique.js'), page = lire('src/index.html');
  const interdits = ['fet' + 'ch(', 'XMLHttp' + 'Request', 'Web' + 'Socket', 'state' + '.json', 'ht' + 'tp://', 'ht' + 'tps://', 'Event' + 'Source', 'send' + 'Beacon'];
  for (const src of [vue, logique]) {
    for (const mot of interdits) assert.ok(!src.includes(mot), 'contient ' + mot);
    assert.ok(!/window\.kinan\b/.test(src), 'aucun IPC');
    assert.ok(!/\.etat\s*\(|etats\s*\(|surChangement/.test(src), 'aucune lecture d\'état d\'agent');
    assert.ok(!/new Audio\(|\.mp3|\.wav|\.ogg/.test(src), 'aucun fichier son');
  }
  assert.ok(!/\bdocument\b|getContext|requestAnimationFrame|AudioContext|localStorage/.test(logique), 'logique sans DOM');
  // aucune auréole ni halo, aucune référence à Jésus ni à la croix, aucune scène religieuse (textes, variables, commentaires) ;
  // « céleste » et « angélique » sont permis. Mots découpés pour que ce test reste lui-même neutre.
  const religieux = new RegExp(['ha' + 'lo', 'aur' + 'éole', 'aur' + 'eole', 'j[ée]' + 'sus', 'chr' + 'ist', 'cro' + 'ix', 'cru' + 'cif', 'sa' + 'cr', 'di' + 'vin', '\\bdi' + 'eu',
    '\\bsa' + 'int', 'pri' + 'ère', 'para' + 'dis', 'litu' + 'rg', 'mes' + 'sie', 'apô' + 'tre', 'bib' + 'le', 'égl' + 'ise'].join('|'), 'i');
  for (const src of [vue, logique]) assert.ok(!religieux.test(src), 'vocabulaire religieux : ' + (src.match(religieux) || [])[0]);
  assert.ok(/FORMANTS/.test(vue) && /createConvolver/.test(vue), 'chant à formants et réverbération synthétisés');
  assert.ok(/Avatars\.corps/.test(vue), 'même modèle de personnage que les agents');
  assert.ok(/KinanEgg\.module\('jean'/.test(vue));
  assert.ok(/api\.ecouter\('kinan-egg-jean'/.test(vue));
  assert.ok(/api\.emettre\('kinan-egg-royaume'/.test(vue));
  assert.ok(/prefers-reduced-motion|api\.calme\(\)/.test(vue));
  assert.ok(/visibilitychange/.test(vue) && /cancelAnimationFrame/.test(vue));
  assert.ok(/'Escape'/.test(vue) && /min: 24/.test(vue));
  assert.ok((vue.match(/requestAnimationFrame\(image\)/g) || []).length === 2, 'une seule boucle rAF');
  const i = (s) => page.indexOf('<script src="' + s + '"></script>');
  assert.ok(i('eggs/chasse.js') > 0 && i('eggs/jean-logique.js') > i('eggs/chasse.js') && i('eggs/jean.js') > i('eggs/jean-logique.js'));
});
