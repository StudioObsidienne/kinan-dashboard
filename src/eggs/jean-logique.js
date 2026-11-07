// Cinématique « Jean, l'être suprême » (personnage blanc et lumineux, céleste et mystérieux, sans scène religieuse) : logique pure (aucun DOM, aucun réseau, aucune écriture d'état agents).
// Personnage décoratif, hors du système d'agents. UMD : module.exports en Node, window.JeanLogique dans la page.
// Seule persistance : le stock { get, set } fourni par KinanEgg (clés kinan-os.egg.jean.*).
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.JeanLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const TEXTES = Object.freeze({
    lignes: Object.freeze(['Ouais, je suis le roi du monde.', 'Bien joué, tu m\'as trouvé, tu m\'as libéré.', 'Maintenant, à toi la créativité.']),
    titre: 'JEAN — L\'ÊTRE SUPRÊME',
    fiche: Object.freeze({ nom: 'JEAN', titre: 'Architecte de l\'univers', role: 'Créateur du royaume Kinan', devise: '« Celui qui orchestre les orchestrateurs. »' }),
    passer: 'Passer (Échap)',
    sonOui: 'Couper le son',
    sonNon: 'Activer le son',
    volume: 'Volume de la musique',
    indice: 'Clique sur Jean.',
    royaume: 'PARAMÈTRES DU ROYAUME',
    bientot: 'Bientôt.'
  });
  const ficheTexte = () => TEXTES.fiche.nom + ' — ' + TEXTES.fiche.titre + ' — ' + TEXTES.fiche.role + '. ' + TEXTES.fiche.devise;

  // Bouton « Paramètres du royaume » : pixels de scène, sur la vitre en bas à droite de la fenêtre (loin du bouton secret de la chasse).
  const BOUTON_BOITE = Object.freeze([96, 51, 6, 6]);
  const FENETRE_DEFAUT = Object.freeze([21, 9, 86, 52]);
  const CLE_ETAT = 'etat'; // => kinan-os.egg.jean.etat
  const VOLUME_DEFAUT = 0.5;

  const borne = (v, a, b) => Math.min(b, Math.max(a, v));
  const fini = (v) => typeof v === 'number' && Number.isFinite(v);

  // ---- machine à écrire : instant d'apparition de chaque caractère (lignes jointes par « \n ») ----
  const RYTHME = Object.freeze({ debut: 300, lettre: 55, virgule: 380, point: 650, ligne: 1000 });
  // Pauses comiques : délai ajouté juste après ces fragments.
  const PAUSES = Object.freeze([['Ouais,', 700], ['trouvé,', 450], ['Maintenant,', 550]]);
  function planMachine(lignes) {
    const ls = Array.isArray(lignes) ? lignes.map(String) : TEXTES.lignes.slice();
    const temps = [];
    let t = RYTHME.debut;
    ls.forEach((l, i) => {
      const cars = Array.from(l);
      const extra = {};
      for (const [frag, ms] of PAUSES) { const k = l.indexOf(frag); if (k >= 0) extra[Array.from(l.slice(0, k + frag.length)).length - 1] = ms; }
      cars.forEach((ch, j) => {
        temps.push(t);
        t += (ch === ',' ? RYTHME.virgule : ch === '.' ? RYTHME.point : RYTHME.lettre) + (extra[j] || 0);
      });
      if (i < ls.length - 1) { temps.push(t); t += RYTHME.ligne; }
    });
    return Object.freeze({ lignes: Object.freeze(ls), temps: Object.freeze(temps), duree: t, total: temps.length });
  }
  function visibles(plan, ms) {
    if (!plan || !fini(ms) || ms < 0) return 0;
    let n = 0; while (n < plan.temps.length && plan.temps[n] <= ms) n++;
    return n;
  }
  function texteVisible(lignes, n) {
    const tout = Array.from((lignes || TEXTES.lignes).join('\n'));
    return tout.slice(0, borne(Math.floor(fini(n) ? n : 0), 0, tout.length)).join('');
  }
  // Caractère n (0-based) du texte joint, pour le petit son de lettre.
  const caractere = (lignes, n) => Array.from((lignes || TEXTES.lignes).join('\n'))[n] || '';

  // ---- chronologie ----
  const INTRO = Object.freeze([['apparition', 2600], ['descente', 6000], ['parole', null], ['attente', Infinity]]);
  const FINALE = Object.freeze([['brille', 700], ['contraction', 800], ['course', 4200], ['envol', 1800], ['explosion', 1000], ['retour', 2000]]);
  const dureeFinale = (nom) => (FINALE.find((f) => f[0] === nom) || [nom, 1000])[1];
  // Mouvement réduit : version courte, sans mouvement (Jean déjà au centre, texte complet ; le clic termine aussitôt).
  function chronologie(type, opts) {
    const o = opts || {};
    let brut;
    if (o.calme) brut = type === 'intro' ? [['attente', Infinity]] : [];
    else if (type === 'intro') brut = INTRO.map(([n, d]) => [n, d === null ? (o.plan || planMachine()).duree : d]);
    else brut = FINALE.slice();
    let debut = 0;
    return Object.freeze(brut.map(([nom, duree]) => { const p = Object.freeze({ nom, debut, duree }); debut += duree; return p; }));
  }
  // Phase à l'instant ms : { nom, i, p (0..1), ecoule } ; au-delà de la fin : 'fin'. ms invalide ou négatif : début.
  function phase(chrono, ms) {
    const t = fini(ms) && ms > 0 ? ms : 0;
    for (let i = 0; i < chrono.length; i++) {
      const c = chrono[i];
      if (t < c.debut + c.duree) return { nom: c.nom, i, ecoule: t - c.debut, p: c.duree === Infinity || c.duree <= 0 ? 0 : (t - c.debut) / c.duree };
    }
    return { nom: 'fin', i: chrono.length, ecoule: 0, p: 1 };
  }

  // ---- course vivante de la boule d'énergie ----
  // Simulation déterministe (graine) : un ressort amorti poursuit des cibles d'un bord à l'autre. Raideur et amortissement
  // varient à chaque étape (accélérations, ralentis, petits dépassements), une force perpendiculaire à la vitesse courbe la
  // trajectoire (jamais de ligne droite), un bruit lissé la fait frémir, certaines étapes commencent par une hésitation.
  // Les bords sont des ressorts doux (rebond sans angle). Fin : un court élan où elle ralentit et frémit avant l'envol.
  const PAS_COURSE = 1 / 120; // s entre deux échantillons
  const ZONE = Object.freeze({ x0: 0.1, x1: 0.9, y0: 0.15, y1: 0.85 });
  function generateur(graine) { // mulberry32
    let s = (Math.floor(fini(graine) ? graine : 1) >>> 0) || 1;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  // Bruit de valeur lissé (1D, période 64), entre -1 et 1.
  function bruiteur(alea) {
    const tab = Array.from({ length: 64 }, () => alea() * 2 - 1);
    return (x) => { const i = Math.floor(x), f = x - i, k = f * f * f * (f * (f * 6 - 15) + 10), a = tab[((i % 64) + 64) % 64], b = tab[(((i + 1) % 64) + 64) % 64]; return a + (b - a) * k; };
  }
  function trajet(graine, n, duree) {
    const alea = generateur(graine);
    const nb = borne(Math.floor(fini(n) ? n : 6), 2, 16);
    const D = (fini(duree) && duree >= 500 ? duree : dureeFinale('course')) / 1000;
    const bx = bruiteur(alea), by = bruiteur(alea);
    const points = [{ x: 0.5, y: 0.5 }], etapes = [];
    let cote = alea() < 0.5 ? -1 : 1, somme = 0;
    for (let i = 0; i < nb; i++) {
      cote = -cote;
      const P = { x: 0.5 + cote * (0.15 + alea() * 0.24), y: 0.22 + alea() * 0.56 };
      points.push(P);
      const e = { poids: 0.45 + alea() * 1.55, raideur: 22 + alea() * 70, zeta: 0.32 + alea() * 0.4,
        courbe: (alea() < 0.5 ? -1 : 1) * (1.4 + alea() * 2.6), hesite: alea() < 0.5 ? 0.2 + alea() * 0.3 : 0 };
      somme += e.poids; etapes.push(e);
    }
    const ELAN = 0.13;
    let c = 0; for (const e of etapes) { e.debut = c; c += (e.poids / somme) * (1 - ELAN); e.fin = c; }
    const N = Math.max(2, Math.round(D / PAS_COURSE) + 1), SOUS = 4, h = PAS_COURSE / SOUS;
    const xs = [], ys = [], vxs = [], vys = [];
    let x = 0.5, y = 0.5, vx = 0, vy = 0, j = 0;
    // commandes lissées (cible, raideur, amortissement, courbure) : aucune force ne saute d'un coup, donc aucun angle net
    let cx = 0.5, cy = 0.5, ck = 16, cz = 0.7, cc = 0;
    const lisse = (tau) => 1 - Math.exp(-h / tau);
    const LC = lisse(0.09), LK = lisse(0.14);
    for (let i = 0; i < N; i++) {
      xs.push(x); ys.push(y); vxs.push(vx); vys.push(vy);
      if (i === N - 1) break;
      for (let s = 0; s < SOUS; s++) {
        const tt = (i * SOUS + s) * h, q = tt / D;
        while (j < etapes.length && q >= etapes[j].fin) j++;
        let tx, ty, k, z, cb, tremble;
        if (j >= etapes.length) { const P = points[points.length - 1]; tx = P.x; ty = P.y; k = 30; z = 1; cb = 0; tremble = 2.4; } // élan
        else {
          const e = etapes[j], A = points[j], B = points[j + 1], loc = (q - e.debut) / (e.fin - e.debut);
          if (loc < e.hesite) { tx = A.x + (B.x - A.x) * 0.12; ty = A.y + (B.y - A.y) * 0.12; k = 16; z = 0.7; cb = e.courbe * 0.4; tremble = 1.8; }
          else { tx = B.x; ty = B.y; k = e.raideur; z = e.zeta; cb = e.courbe; tremble = 1; }
        }
        cx += (tx - cx) * LC; cy += (ty - cy) * LC; ck += (k - ck) * LK; cz += (z - cz) * LK; cc += (cb - cc) * LK;
        // ressort légèrement « tourné » : la boule approche en spirale, ses dépassements font des boucles (pas d'aller-retour sec)
        const am = 2 * cz * Math.sqrt(ck), th = 0.12 * cc, co = Math.cos(th), si = Math.sin(th), dx = cx - x, dy = cy - y;
        let ax = ck * (dx * co - dy * si) - am * vx - cc * vy + 2.2 * tremble * bx(tt * 2.1);
        let ay = ck * (dx * si + dy * co) - am * vy + cc * vx + 2.2 * tremble * by(tt * 2.1 + 17);
        // bords : la boule est détournée (sa vitesse tourne vers l'intérieur, rebond arrondi), puis doucement repoussée
        const ox = x < ZONE.x0 ? ZONE.x0 - x : x > ZONE.x1 ? ZONE.x1 - x : 0, oy = y < ZONE.y0 ? ZONE.y0 - y : y > ZONE.y1 ? ZONE.y1 - y : 0;
        const pres = Math.min(1, Math.hypot(ox, oy) / 0.035);
        if (pres > 0) {
          const nx = ox / (Math.hypot(ox, oy) || 1), ny = oy / (Math.hypot(ox, oy) || 1), sort = -(vx * nx + vy * ny);
          if (sort > 0) { const tour = (vx * ny - vy * nx) >= 0 ? 1 : -1, w = 28 * pres; ax -= tour * w * vy; ay += tour * w * vx; }
          ax += 320 * ox; ay += 320 * oy;
        }
        // virages bornés : la part de force qui fait tourner est limitée selon la vitesse ; pour tourner court, la boule
        // doit d'abord ralentir (jamais d'angle net, ralentis naturels dans les virages)
        const v = Math.hypot(vx, vy);
        if (v > 1e-6) {
          const ux = vx / v, uy = vy / v, at = ax * ux + ay * uy, lim = (pres > 0 ? 34 : 12) * v + 1.2;
          let at2 = at, an = -ax * uy + ay * ux;
          // à basse vitesse, un freinage vers l'arrière devient une petite pirouette (boucle) plutôt qu'un demi-tour sec
          if (at2 < 0 && v < 0.4) { const f = 1 - v / 0.4, sg = an !== 0 ? Math.sign(an) : (cc >= 0 ? 1 : -1); an += sg * -at2 * f; at2 *= 1 - 0.7 * f; }
          if (an > lim) an = lim; else if (an < -lim) an = -lim;
          ax = at2 * ux - an * uy; ay = at2 * uy + an * ux;
        }
        vx += ax * h; vy += ay * h; x += vx * h; y += vy * h;
      }
    }
    const gel = (a) => Object.freeze(a);
    return Object.freeze({ points: gel(points.map(gel)), pas: PAS_COURSE, duree: D * 1000,
      x: gel(xs), y: gel(ys), vx: gel(vxs), vy: gel(vys), fin: gel({ x: xs[N - 1], y: ys[N - 1] }) });
  }
  // Position et vitesse (unités d'écran par seconde) à l'avancement p (0..1) de la course.
  function surTrajet(tr, p) {
    const q = borne(fini(p) ? p : 0, 0, 1), n = tr.x.length, f = q * (n - 1), i = Math.min(n - 2, Math.floor(f)), k = f - i;
    const m = (a) => a[i] + (a[i + 1] - a[i]) * k;
    return { x: m(tr.x), y: m(tr.y), vx: m(tr.vx), vy: m(tr.vy) };
  }
  // Envol en spirale : le centre file vers l'astre en accélérant, la boule tourne autour en boucles qui s'élargissent
  // puis se resserrent ; départ dans la continuité de la course (o.v0), arrivée exacte sur l'astre. Pixels d'écran.
  function spirale(depart, arrivee, p, opts) {
    const o = opts || {}, q = borne(fini(p) ? p : 0, 0, 1);
    const tours = fini(o.tours) ? o.tours : 2.2, sens = o.sens === -1 ? -1 : 1;
    const dx = arrivee.x - depart.x, dy = arrivee.y - depart.y, dist = Math.hypot(dx, dy);
    const R = Math.min(dist * 0.35, fini(o.rayon) && o.rayon > 0 ? o.rayon : dist * 0.25);
    const e = q * q, r = R * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.6)), 2);
    const a = Math.atan2(dy, dx) + Math.PI + sens * tours * 2 * Math.PI * Math.pow(q, 1.4);
    if (q >= 1) return { x: arrivee.x, y: arrivee.y };
    // élan hérité de la course (o.v0 en px/s, o.duree en ms) : la vitesse reste continue au départ, puis s'efface
    let ix = 0, iy = 0;
    if (o.v0 && fini(o.v0.x) && fini(o.v0.y) && fini(o.duree) && o.duree > 0) {
      const tau = 0.22, f = tau * (1 - Math.exp(-(q * o.duree) / 1000 / tau)) * (1 - q * q);
      ix = o.v0.x * f; iy = o.v0.y * f;
    }
    return { x: depart.x + dx * e + Math.cos(a) * r + ix, y: depart.y + dy * e + Math.sin(a) * r + iy };
  }
  // Étirement dans le sens du mouvement (squash and stretch, volume conservé) : long × large = 1.
  function etirement(vx, vy, ref) {
    const v = fini(vx) && fini(vy) ? Math.hypot(vx, vy) : 0, r = fini(ref) && ref > 0 ? ref : 1;
    const s = 1 + 0.75 * (1 - Math.exp(-v / r));
    return { angle: v > 0 ? Math.atan2(vy, vx) : 0, long: s, large: 1 / s };
  }
  // Pulsation irrégulière de la boule (deux battements qui se croisent), entre 0,89 et 1,11.
  const pulsation = (t) => (fini(t) ? 1 + 0.07 * Math.sin(t / 170) + 0.04 * Math.sin(t / 61 + 1.7) * Math.sin(t / 430) : 1);

  // ---- soleil ou lune vus par la fenêtre (même calcul que ciel() dans scene.js), en pixels de scène ----
  function heureDepuis(search, date) {
    const m = /heure=(\d+(?:\.\d+)?)/.exec(search || '');
    if (m) return parseFloat(m[1]);
    const d = date instanceof Date ? date : new Date();
    return d.getHours() + d.getMinutes() / 60;
  }
  function astre(h, fenetre) {
    const f = Array.isArray(fenetre) && fenetre.length === 4 && fenetre.every(fini) ? fenetre : FENETRE_DEFAUT;
    const X = f[0] + 4, Y = f[1] + 4, LW = f[2] - 8;
    let hh = fini(h) ? h : 12; hh = ((hh % 24) + 24) % 24;
    if (hh < 5.5 || hh >= 21) return { x: X + 60, y: Y + 9, nuit: true };
    const p = borne((hh - 6) / 15, 0, 1);
    return { x: X + 6 + p * (LW - 12), y: Y + 30 - Math.sin(p * Math.PI) * 24, nuit: false };
  }
  // Pixels de scène -> pixels CSS de la page (rect = getBoundingClientRect de #toile, dim = KinanEquipe.dim).
  function versEcran(pt, rect, dim) {
    if (!pt || !rect || !dim || !(rect.width > 0) || !(rect.height > 0) || !(dim.W > 0) || !(dim.H > 0)) return null;
    return { x: rect.left + (pt.x / dim.W) * rect.width, y: rect.top + ((pt.y + (dim.DY || 0)) / dim.H) * rect.height };
  }

  // ---- musique : petit chant angélique de voix douces (synthèse de formants « aah / ooh »), accords lents, cloches légères ;
  // voix basses (basse) et voix hautes (voix), voyelle de départ et d'arrivée (fondu de l'une à l'autre) ; temps en ms depuis le début de la phase.
  // L'intro suit la cinématique : un « ouh » à peine soufflé pendant l'apparition, l'accord s'ouvre pendant la descente, résolution à l'arrivée. ----
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Formants (Hz, gain relatif, largeur de bande Hz) de voix douces : « a » ouvert, « o » rond, « ou » fermé.
  const FORMANTS = Object.freeze({
    a: Object.freeze([[800, 1, 80], [1150, 0.5, 90], [2900, 0.025, 120]].map(Object.freeze)),
    o: Object.freeze([[450, 1, 70], [800, 0.28, 80], [2830, 0.018, 100]].map(Object.freeze)),
    u: Object.freeze([[325, 1, 50], [700, 0.16, 60], [2700, 0.012, 170]].map(Object.freeze))
  });
  const gelAccord = (a) => Object.freeze(Object.assign({}, a, { basse: Object.freeze(a.basse.slice()), voix: Object.freeze(a.voix.slice()),
    voyelles: Object.freeze(a.voyelles.slice()), arpege: a.arpege ? Object.freeze(a.arpege.slice()) : undefined }));
  const PARTITION = Object.freeze({
    intro: Object.freeze([
      { t: 0, d: 2600, v: 0.45, basse: [50], voix: [62, 69], voyelles: ['u', 'o'] },                                         // ré : un souffle qui naît
      { t: 2600, d: 2000, v: 0.6, basse: [43, 50], voix: [62, 67, 71], voyelles: ['o', 'a'], arpege: [79, 83, 86], pas: 330 },  // sol : la descente commence
      { t: 4600, d: 2000, v: 0.7, basse: [47], voix: [62, 66, 71, 74], voyelles: ['a', 'a'], arpege: [78, 83, 86], pas: 330 },  // si mineur
      { t: 6600, d: 2000, v: 0.8, basse: [45], voix: [61, 64, 69, 76], voyelles: ['a', 'o'], arpege: [76, 81, 85], pas: 330 },  // la : il approche
      { t: 8600, d: 3400, v: 0.9, basse: [45, 50], voix: [62, 66, 69, 74, 78], voyelles: ['o', 'a'], arpege: [74, 78, 81, 86], pas: 420 } // ré : il est là
    ].map(gelAccord)),
    finale: Object.freeze([
      { t: 0, d: 1500, v: 0.6, basse: [50], voix: [66, 69, 74], voyelles: ['a', 'a'] },                                       // il brille
      { t: 1500, d: 4200, v: 0.5, basse: [45], voix: [64, 69, 73], voyelles: ['o', 'u'], arpege: [76, 81, 85, 81], pas: 260 },  // la course
      { t: 5700, d: 1800, v: 0.65, basse: [47], voix: [66, 71, 74, 78], voyelles: ['u', 'a'] },                                // envol
      { t: 7500, d: 2400, v: 0.9, basse: [45, 50], voix: [62, 66, 69, 74, 78], voyelles: ['a', 'o'], arpege: [74, 78, 81, 86], pas: 200 } // éclat
    ].map(gelAccord))
  });
  // Arpèges : une note toutes les « pas » ms (une note sur deux un peu en retard), triés dans le temps.
  function planArpege(partition) {
    const out = [];
    for (const a of Array.isArray(partition) ? partition : []) {
      if (!a || !Array.isArray(a.arpege) || !a.arpege.length || !fini(a.t) || !fini(a.d)) continue;
      const pas = fini(a.pas) && a.pas >= 60 ? a.pas : 180;
      for (let k = 0; ; k++) {
        const t = a.t + k * pas + (k % 2 ? pas * 0.18 : 0);
        if (t > a.t + a.d - 60) break;
        out.push(Object.freeze({ t, m: a.arpege[k % a.arpege.length], v: a.v }));
      }
    }
    return Object.freeze(out.sort((p, q) => p.t - q.t));
  }
  // Petit son de lettre (base en Hz du « tic » de la machine à écrire), rien pour les espaces et la ponctuation.
  function hauteurLettre(ch) {
    const c = String(ch || '');
    if (!/^[a-zàâäéèêëîïôöùûüç]$/i.test(c)) return null;
    return 82 + ((c.toLowerCase().codePointAt(0) * 37) % 41);
  }
  const borneVolume = (v) => (fini(v) ? borne(v, 0, 1) : VOLUME_DEFAUT);

  // ---- persistance et garde-fous ----
  const modeTest = (search) => /[?&]egg-jean=1(&|$)/.test(search || '');
  function lireFait(stock) {
    try { const v = stock && stock.get ? stock.get(CLE_ETAT, null) : null; return !!(v && typeof v === 'object' && v.fait === true); } catch { return false; }
  }
  // Mode test (?egg-jean=1) : rien n'est écrit.
  function marquerFait(stock, opts) {
    if ((opts && opts.test) || !stock || !stock.set) return false;
    try { return stock.set(CLE_ETAT, { fait: true }) !== false; } catch { return false; }
  }

  return { TEXTES, BOUTON_BOITE, FENETRE_DEFAUT, CLE_ETAT, VOLUME_DEFAUT, RYTHME, PAUSES, INTRO, FINALE, PARTITION, FORMANTS, ZONE, PAS_COURSE,
    ficheTexte, planMachine, visibles, texteVisible, caractere, chronologie, phase, dureeFinale, trajet, surTrajet, spirale, etirement, pulsation,
    heureDepuis, astre, versEcran, midiHz, planArpege, hauteurLettre, borneVolume, modeTest, lireFait, marquerFait };
});
