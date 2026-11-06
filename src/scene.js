// Kinan OS : bureau en pixel art dessiné en code (canvas) + panneau des agents.
// États : repos | travail | erreur | doute. Aucune image externe, aucun appel réseau.
(() => {
  'use strict';
  const W = 400, H = 270, DY = 18; // DY : hauteur de mur ajoutée au-dessus du décor
  const toile = document.getElementById('toile');
  const cadre = document.getElementById('cadre');
  const zone = document.getElementById('scene');
  const principal = toile.getContext('2d');
  let g = principal; // contexte courant (permet de dessiner aussi les avatars)

  const fond = document.createElement('canvas');
  fond.width = W; fond.height = H;

  // --- mouvement réduit ---
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let calme = mq.matches || /[?&]calme=1/.test(location.search); // calme=1 : test du mouvement réduit
  let sale = true;
  const surMq = (e) => { calme = e.matches; sale = true; };
  if (mq.addEventListener) mq.addEventListener('change', surMq); else mq.addListener(surMq);

  // --- palette ---
  const K = '#1d1729';          // contour
  const OEIL = '#21182b';
  const OR = '#ffd24a', OR_O = '#d99a22', OR_C = '#fff1a8';
  const ETATS = ['repos', 'travail', 'erreur', 'doute'];
  const LIBELLE = { repos: 'Au repos', travail: 'Au travail', erreur: 'Erreur', doute: 'Doute' };
  const COUL_ETAT = { repos: '#8f88a8', travail: '#5fd3a0', doute: '#ffd166', erreur: '#ff6b6b' };

  // --- primitives ---
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const px = (x, y, c) => r(x, y, 1, 1, c);
  // Ovale rempli ligne par ligne (centré entre deux pixels : cx-0.5, cy-0.5).
  function ovale(cx, cy, rx, ry, c, j0, j1) {
    g.fillStyle = c;
    const a = j0 === undefined ? -ry : Math.max(-ry, j0), b = j1 === undefined ? ry : Math.min(ry, j1);
    for (let j = a; j < b; j++) {
      const v = (j + 0.5) / ry;
      const d = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
      if (d > 0) g.fillRect(Math.round(cx - d), Math.round(cy + j), d * 2, 1);
    }
  }
  function glyphe(motif, x, y, c) {
    g.fillStyle = c;
    for (let j = 0; j < motif.length; j++)
      for (let i = 0; i < motif[j].length; i++)
        if (motif[j][i] === '#') g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
  }
  // Blocs avec contour commun : tous les contours d'abord, puis les remplissages.
  function blocs(liste, c, contour = K) {
    for (const [x, y, w, h] of liste) r(x - 1, y - 1, w + 2, h + 2, contour);
    for (const [x, y, w, h] of liste) r(x, y, w, h, c);
  }
  const G = {
    excl: ['##', '##', '##', '##', '..', '##'],
    inter: ['.###.', '##.##', '...##', '..##.', '.....', '..##.'],
    z4: ['####', '..#.', '.#..', '####'],
    z5: ['#####', '...#.', '..#..', '.#...', '#####'],
    z3: ['###', '.#.', '###']
  };
  const lisse = (x) => x * x * (3 - 2 * x);
  const borne = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rvb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const alea = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // --- agents ---
  const AGENTS = {
    drafion: { nom: 'Drafion', modele: 'Haiku', role: 'Lectures et vérifications', col: 0, rang: 0,
      ligne: '#ffd04d', vif: 1.7,
      ui: '#ffb84a', objet: 'loupe', tasse: false },
    kinan: { nom: 'Kinan', modele: 'Opus', role: 'Juge, chef d\'orchestre', col: 1, rang: 0,
      ligne: '#f7cba3', vif: 1,
      ui: '#efe6d6', objet: 'marteau', tasse: true, banc: true },
    skyze: { nom: 'Skyze', modele: 'Sonnet', role: 'Production courante', col: 2, rang: 0,
      ligne: '#8fd0ff', vif: 1.2,
      ui: '#62adff', objet: 'pinceaux', tasse: true },
    johms: { nom: 'Johms', modele: 'Opus', role: 'Difficultés réelles', col: 0, rang: 1,
      ligne: '#d2b0ff', vif: 1,
      ui: '#a874ff', objet: 'cristal', tasse: false, aura: true },
    quatre: { nom: 'Agent 4', modele: 'Haiku', role: 'Agent configuré', col: 1, rang: 1,
      ligne: '#9ff0c9', vif: 1.1,
      ui: '#55d39c', objet: 'enveloppe', tasse: true },
    cinq: { nom: 'Agent 5', modele: 'Sonnet', role: 'Agent configuré', col: 2, rang: 1,
      ligne: '#ff9aa2', vif: 0.9,
      ui: '#e5484d', objet: 'papiers', tasse: false }
  };
  // --- équipe configurée (kinan.config.json, validé par le processus principal) ---
  // Cinq sièges autour du juge. Un agent configuré prend d'abord le siège de même nom (drafion, skyze, johms), puis un siège libre.
  // Au-delà de cinq agents, les suivants ne sont pas dessinés dans la scène. Sièges inoccupés : retirés.
  const CFG = (window.kinan && window.kinan.config) || null;
  const SIEGES = ['drafion', 'skyze', 'johms', 'quatre', 'cinq'];
  const MODELE_AFF = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', inherit: 'Hérité' };
  const nSieges = Math.min(5, Math.max(1, +((location.search.match(/[?&]sieges=(\d)/) || [])[1]) || 3));
  const EQUIPE = CFG && Array.isArray(CFG.agents) ? CFG.agents
    : SIEGES.slice(0, nSieges).map((id) => ({ id, nom: AGENTS[id].nom, role: AGENTS[id].role, modele: AGENTS[id].modele.toLowerCase(), couleur: null }));
  const SIEGE_DE = {}, ID_DE = { kinan: 'kinan' };
  for (const a of EQUIPE) if (SIEGES.includes(a.id)) { SIEGE_DE[a.id] = a.id; ID_DE[a.id] = a.id; }
  for (const a of EQUIPE) {
    if (SIEGE_DE[a.id]) continue;
    const libre = SIEGES.find((k) => !ID_DE[k]);
    if (!libre) continue;
    SIEGE_DE[a.id] = libre; ID_DE[libre] = a.id;
  }
  const nuance = (h, f) => '#' + hex(h).map((c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f).toString(16).padStart(2, '0')).join('');
  const habiller = (siege, a) => {
    const s = AGENTS[siege];
    if (a.nom) s.nom = a.nom;
    if (a.role !== undefined) s.role = a.role || '';
    if (a.modele) s.modele = MODELE_AFF[a.modele] || a.modele;
    if (a.couleur) { s.ui = a.couleur; s.couleurPerso = a.couleur; }
  };
  for (const k of SIEGES) { if (!ID_DE[k]) delete AGENTS[k]; else habiller(k, EQUIPE.find((a) => a.id === ID_DE[k])); }
  if (CFG && CFG.juge && CFG.juge.couleur) { AGENTS.kinan.ui = CFG.juge.couleur; AGENTS.kinan.couleurPerso = CFG.juge.couleur; }
  window.KinanEquipe = { SIEGE_DE, ID_DE }; // lu par boutons.js (bulles) : identifiant configuré <-> siège
  const CLES = Object.keys(AGENTS);
  const ORDRE = ['drafion', 'kinan', 'skyze', 'johms', 'quatre', 'cinq'].filter((k) => AGENTS[k]); // arrière puis avant
  const COLS = [70, 200, 330], HAUTS = [138, 204];
  CLES.forEach((k, i) => {
    const a = AGENTS[k];
    a.cle = k;
    Object.assign(a, Avatars.PROFILS[k]); // rx, ry, couleurs : définis dans avatars.js
    if (a.couleurPerso) { a.coul = a.couleurPerso; a.ombre = nuance(a.couleurPerso, -0.35); a.clair = nuance(a.couleurPerso, 0.6); }
    a.cx = COLS[a.col];
    a.haut = a.banc ? 130 : HAUTS[a.rang];
    a.s = a.col === 2 ? -1 : 1;        // côté de l'écran
    a.phase = i * 1.37;
    a.ecran = hex('#141a2e');
    a.anim = { depuis: -1e9, prec: 'repos', regard: null, marteau: -1e9, vol: 0 };
  });

  const etats = {};
  CLES.forEach((k) => (etats[k] = { etat: 'repos', tache: '', maj: 0, derniere: '', instances: [] }));

  // ================= DÉCOR STATIQUE =================
  let heureForcee = null;
  const m = location.search.match(/heure=(\d+(?:\.\d+)?)/);
  if (m) heureForcee = parseFloat(m[1]);
  const heure = () => { if (heureForcee !== null) return heureForcee; const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  function moment(h) {
    if (h < 5.5 || h >= 21) return { nom: 'nuit', haut: '#0e1330', bas: '#2a2f66', voile: 0.34, colline: '#171a33', toit: '#1f2340' };
    if (h < 8) return { nom: 'aube', haut: '#5d6fba', bas: '#f6ad86', voile: 0.12, colline: '#3d4a6a', toit: '#4a4f73' };
    if (h < 17.5) return { nom: 'jour', haut: '#5cb2f2', bas: '#b5e2ff', voile: 0, colline: '#5d9a78', toit: '#7a6f8f' };
    return { nom: 'soir', haut: '#45408f', bas: '#f39067', voile: 0.16, colline: '#3a3560', toit: '#4b3f6b' };
  }
  let mom = moment(heure());

  function decor() {
    g = fond.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, DY);
    g.clearRect(0, -DY, W, H);
    // Mur
    r(0, -DY, W, 60 + DY, '#3c3253');
    for (let x = 4; x < W; x += 10) r(x, -DY, 1, 60 + DY, '#41375a');
    r(0, -DY, W, 5, '#2a2238'); r(0, -DY + 5, W, 1, '#55476e'); r(0, -DY + 6, W, 1, '#342b49');
    r(0, 60, W, 2, '#58496f');
    r(0, 62, W, 20, '#2e2741');
    for (let x = 0; x < W; x += 25) { r(x + 3, 65, 19, 14, '#332b48'); r(x + 3, 78, 19, 1, '#27203a'); }
    r(0, 82, W, 4, '#231d32');
    // Sol : parquet chaud
    for (let y = 86, n = 0; y < H - DY; y += 7, n++) {
      r(0, y, W, 7, n % 2 ? '#5f4538' : '#664b3e');
      r(0, y + 6, W, 1, '#4c362c');
      for (let x = (n * 17) % 46 - 46; x < W; x += 46) r(x, y, 1, 6, '#523b30');
    }
    r(0, 86, W, 2, '#3b2b25');
    // Lumière de la fenêtre sur le sol
    const lum = mom.nom === 'nuit' ? 'rgba(150,170,255,.05)' : mom.nom === 'jour' ? 'rgba(255,236,180,.09)' : 'rgba(255,190,140,.08)';
    for (let y = 88; y < 132; y++) {
      const k = y - 88;
      r(34 + k * 0.55, y, Math.round(66 + k * 0.2), 1, lum);
    }
    // Tapis sous la rangée avant
    r(26, 166, 348, 70, '#2a2236');
    r(27, 167, 346, 68, '#5a4778');
    r(30, 170, 340, 62, '#47375f');
    for (let y = 176; y < 230; y += 9)
      for (let x = 38 + ((y / 9) % 2) * 6; x < 364; x += 12) { r(x, y, 2, 1, '#54426f'); r(x - 1, y + 1, 4, 1, '#54426f'); r(x, y + 2, 2, 1, '#54426f'); }
    for (let x = 30; x < 370; x += 4) { px(x, 165, '#8a78a8'); px(x + 1, 236, '#8a78a8'); }
    // Fenêtre (le ciel est dessiné à chaque image)
    r(21, 9, 86, 52, K);
    r(22, 10, 84, 50, '#7a5640');
    r(23, 11, 82, 1, '#946b50');
    r(25, 13, 78, 44, '#4f3727');
    r(18, 59, 92, 3, '#94694a'); r(18, 59, 92, 1, '#b08060'); r(19, 62, 90, 1, '#231d32');
    // Rideaux
    r(10, 5, 108, 2, '#3a2b20');
    for (const x0 of [12, 104]) {
      r(x0, 7, 12, 56, '#a8516a');
      for (let i = 0; i < 12; i += 4) r(x0 + i + 1, 7, 1, 56, '#8a3e55');
      r(x0, 7, 12, 1, '#c76b85');
      r(x0 + 2, 34, 8, 2, '#e3b25a'); // embrasse
    }
    // Petit cactus sur le rebord
    blocs([[30, 52, 4, 7]], '#5fae6b', '#1f3a2c'); r(29, 54, 2, 2, '#5fae6b'); px(31, 53, '#a8e0a0');
    blocs([[28, 57, 8, 2]], '#c4683f'); px(32, 51, '#ff9fb2');
    // Tableau : gemme
    r(129, 15, 40, 32, K); r(130, 16, 38, 30, '#c9a46a'); r(131, 17, 36, 1, '#e3c58a');
    r(133, 19, 32, 24, '#251d38');
    const gem = [[4, 0], [10, 1], [14, 2], [16, 3], [14, 4], [12, 5], [10, 6], [8, 7], [6, 8], [4, 9], [2, 10]];
    gem.forEach(([w, j], i) => {
      const y = 24 + i * 1.5 | 0, x = 149 - w / 2;
      r(x, y, w, 2, '#4a3a7a'); r(x, y, Math.ceil(w / 3), 2, '#8e78d0'); r(x + w - Math.ceil(w / 4), y, Math.ceil(w / 4), 2, '#2b2150');
    });
    px(145, 25, '#e6dcff'); px(146, 26, '#e6dcff');
    // Horloge (cadran fixe, aiguilles dynamiques)
    ovale(200, 32, 14, 14, K); ovale(200, 32, 13, 13, '#8a6446'); ovale(200, 32, 11, 11, '#f6eedb');
    ovale(200, 33, 11, 11, '#f6eedb'); ovale(201, 33, 10, 10, '#f6eedb');
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      const c = h % 3 === 0 ? '#5a4a6a' : '#b8aa96';
      px(199.5 + Math.sin(a) * 9 - 0.5, 31.5 - Math.cos(a) * 9 - 0.5 + 0.5, c);
    }
    // Panneau de liège avec post-it
    r(231, 15, 48, 34, K); r(232, 16, 46, 32, '#8a6446'); r(234, 18, 42, 28, '#c9955c');
    for (let i = 0; i < 40; i++) px(234 + alea(i) * 42, 18 + alea(i + 50) * 28, '#b07c48');
    const notes = [[237, 20, '#ffe27a'], [251, 22, '#8fd3ff'], [264, 20, '#ff9fb2'], [242, 33, '#b8f28a'], [257, 34, '#f4f1ea']];
    notes.forEach(([x, y, c]) => { r(x + 1, y + 1, 10, 9, '#00000030'); r(x, y, 10, 9, c); r(x + 2, y + 3, 6, 1, '#00000026'); r(x + 2, y + 5, 4, 1, '#00000026'); px(x + 4, y, '#d6455d'); });
    // Étagère et livres
    for (const y of [30, 58]) { r(289, y, 96, 3, '#94694a'); r(289, y, 96, 1, '#b08060'); r(289, y + 3, 96, 1, '#231d32'); r(294, y + 3, 2, 3, '#6b4a35'); r(378, y + 3, 2, 3, '#6b4a35'); }
    const livres = ['#d6455d', '#4f7fd8', '#f2c14e', '#5fae6b', '#a874ff', '#e07a5f', '#4fc2c0'];
    let x = 294;
    for (let i = 0; i < 11; i++) {
      const w = 3 + (alea(i) * 3 | 0), h = 12 + (alea(i + 9) * 6 | 0), c = livres[i % livres.length];
      r(x, 30 - h, w, h, c); r(x, 30 - h, 1, h, '#ffffff22'); r(x, 33 - h, w, 1, '#00000030');
      x += w + (i === 6 ? 6 : 0);
    }
    // gemme trophée + livres couchés en bas
    blocs([[300, 53, 8, 5]], '#3a2e5a'); r(301, 49, 6, 4, '#7a63c0'); px(302, 50, '#e6dcff'); r(299, 57, 10, 1, OR);
    r(316, 52, 22, 3, '#4f7fd8'); r(318, 49, 18, 3, '#f2c14e'); r(317, 55, 20, 3, '#d6455d');
    x = 346;
    for (let i = 0; i < 6; i++) { const w = 3 + (alea(i + 30) * 2 | 0), h = 13 + (alea(i + 40) * 6 | 0); r(x, 58 - h, w, h, livres[(i + 3) % 7]); r(x, 58 - h, 1, h, '#ffffff22'); x += w; }
    // Lampadaire (structure)
    r(262, 158, 14, 3, K); r(263, 158, 12, 2, '#3a3550');
    r(268, 108, 2, 50, '#3a3550'); r(268, 108, 1, 50, '#55507a');
    // Ombres des bureaux
    for (const k of CLES) { const a = AGENTS[k], w = a.banc ? 90 : 74; r(a.cx - w / 2, (a.banc ? 160 : a.haut + 22), w, 3, 'rgba(0,0,0,.28)'); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g = principal;
  }

  // ================= DÉCOR ANIMÉ =================
  const COLLINES = Array.from({ length: 78 }, (_, i) => 5 + Math.round(Math.sin(i / 9) * 2 + Math.sin(i / 4.3) * 1.2));
  const TOITS = [[6, 9, 10], [20, 7, 13], [36, 11, 8], [50, 6, 15], [64, 9, 9]];
  function ciel(t) {
    const X = 25, Y = 13, LW = 78, LH = 44;
    const h0 = hex(mom.haut), h1 = hex(mom.bas);
    for (let b = 0; b < 6; b++) {
      const f = b / 5;
      r(X, Y + b * 7, LW, 8, rvb([h0[0] + (h1[0] - h0[0]) * f, h0[1] + (h1[1] - h0[1]) * f, h0[2] + (h1[2] - h0[2]) * f]));
    }
    const ts = calme ? 0 : t;
    if (mom.nom === 'nuit') {
      for (let i = 0; i < 16; i++) {
        const sx = X + 2 + alea(i) * (LW - 4), sy = Y + 2 + alea(i + 20) * 24;
        const on = calme || Math.sin(t / 600 + i * 2.1) > -0.4;
        px(sx, sy, on ? '#fff6d8' : '#8088c0');
      }
      ovale(X + 60, Y + 9, 5, 5, '#fff3c4'); ovale(X + 62, Y + 7, 4, 4, mom.haut === '#0e1330' ? '#16204a' : mom.haut);
    } else {
      const h = heure();
      const p = borne((h - 6) / 15);
      const sx = X + 6 + p * (LW - 12), sy = Y + 30 - Math.sin(p * Math.PI) * 24;
      ovale(sx, sy, 5, 5, mom.nom === 'jour' ? '#fff2a8' : '#ffc27a');
      ovale(sx, sy, 4, 4, mom.nom === 'jour' ? '#ffe066' : '#ffa25a');
      const nuages = mom.nom === 'jour' ? '#ffffff' : '#ffd1c4';
      for (let i = 0; i < 3; i++) {
        const cx = X - 14 + ((ts / (420 + i * 160) + i * 31) % (LW + 28));
        const cy = Y + 6 + i * 6;
        g.save(); g.beginPath(); g.rect(X, Y, LW, LH); g.clip();
        ovale(cx, cy, 6, 2, nuages); ovale(cx + 4, cy - 1, 4, 2, nuages); ovale(cx - 4, cy + 1, 4, 1, nuages);
        g.restore();
      }
    }
    // Ville au loin
    for (let i = 0; i < LW; i++) r(X + i, Y + LH - COLLINES[i] - 4, 1, COLLINES[i] + 4, mom.colline);
    for (const [x, w, h] of TOITS) {
      r(X + x, Y + LH - h, w, h, mom.toit);
      for (let j = 2; j < h - 2; j += 3) for (let i = 1; i < w - 1; i += 3)
        if (alea(x * 7 + j * 3 + i) > (mom.nom === 'nuit' ? 0.45 : 0.75)) px(X + x + i, Y + LH - h + j, mom.nom === 'nuit' ? '#ffd27a' : '#c9d8f0');
    }
    // Croisillons
    r(63, 13, 2, 44, '#7a5640'); r(25, 34, 78, 2, '#7a5640'); r(25, 13, 78, 1, '#00000040');
  }

  function aiguille(cx, cy, ang, long, c) {
    for (let i = 1; i <= long; i++) px(Math.round(cx + Math.sin(ang) * i), Math.round(cy - Math.cos(ang) * i), c);
  }
  function horloge() {
    const d = new Date();
    const s = d.getSeconds(), mi = d.getMinutes() + s / 60, h = (d.getHours() % 12) + mi / 60;
    ovale(200, 32, 10, 10, '#f6eedb');
    aiguille(199.5, 31.5, (h / 12) * Math.PI * 2, 5, '#3a2e4a');
    aiguille(199.5, 31.5, (mi / 60) * Math.PI * 2, 8, '#3a2e4a');
    if (!calme) aiguille(199.5, 31.5, (s / 60) * Math.PI * 2, 8, '#e5484d');
    r(199, 31, 2, 2, '#3a2e4a');
  }

  function guirlande(t, lueurs) {
    const coul = ['#ffd166', '#ff8fa3', '#8fd3ff', '#b8f28a'];
    for (let x = 0; x < W; x += 2) px(x, Math.round(3 + 5 * (1 - ((x - 200) / 200) ** 2) * 1.0 + Math.sin(x / 33) * 1.2), '#2a2236');
    for (let i = 0; i < 18; i++) {
      const x = 11 + i * 22;
      const y = Math.round(3 + 5 * (1 - ((x - 200) / 200) ** 2) + Math.sin(x / 33) * 1.2);
      const allume = calme || Math.sin(t / 900 + i * 1.9) > -0.5;
      const c = coul[i % 4];
      px(x, y + 1, '#2a2236');
      r(x - 1, y + 2, 2, 3, allume ? c : '#5a5070');
      if (allume) { px(x - 1, y + 2, '#ffffff'); if (lueurs) lueurs.push([x - 0.5, y + 3.5, 4, c, 0.22]); }
    }
  }

  function plante(t) {
    // Plante en pot entre Drafion et Kinan
    const bx = 130, by = 152;
    const feuilles = [[-6, -8, 5, 2], [6, -9, 5, 2], [-4, -14, 4, 2], [5, -15, 4, 2], [0, -20, 3, 3], [-8, -3, 4, 2], [8, -4, 4, 2]];
    const off = (i, f) => (calme ? 0 : Math.round(Math.sin(t / 1600 + i * 0.9) * f));
    r(bx - 1, by - 22, 2, 14, '#3d7a4e');
    feuilles.forEach(([dx, dy, rx, ry], i) => ovale(bx + dx + off(i, -dy / 14), by + dy, rx + 1, ry + 1, '#1f3a2c'));
    feuilles.forEach(([dx, dy, rx, ry], i) => {
      const x = bx + dx + off(i, -dy / 14);
      ovale(x, by + dy, rx, ry, i % 2 ? '#4fae6e' : '#3f9460');
      r(x - rx + 2, by + dy - 1, Math.max(1, rx - 2), 1, '#86d496');
    });
    blocs([[bx - 7, by - 6, 14, 3]], '#d9804f'); r(bx - 6, by - 3, 12, 9, '#c4683f'); r(bx - 6, by - 3, 12, 1, '#9c4e2e');
    r(bx + 3, by - 2, 2, 7, '#a9573a'); r(bx - 6, by + 6, 12, 1, '#7a3e26');
    // Liane qui pend de l'étagère
    for (let i = 0; i < 18; i++) {
      const x = 372 + (calme ? 0 : Math.round(Math.sin(t / 1900 + i * 0.25) * (i / 9)));
      const y = 31 + i * 1.5;
      px(x, y, '#3d7a4e');
      if (i % 3 === 1) { r(x - 2, y, 2, 2, '#4fae6e'); px(x - 2, y, '#86d496'); }
      if (i % 3 === 2) r(x + 1, y, 2, 2, '#3f9460');
    }
    blocs([[367, 24, 10, 6]], '#e07a5f'); r(368, 24, 8, 1, '#f29a7f');
  }

  function lampadaire(lueurs) {
    blocs([[260, 98, 18, 10]], '#f2c38a'); r(261, 98, 16, 2, '#ffe0b0'); r(260, 106, 18, 2, '#d79a5c');
    r(262, 97, 14, 1, '#f2c38a');
    if (mom.voile > 0) lueurs.push([269, 112, 26, '#ffcf8a', 0.16 + mom.voile * 0.25]);
  }

  // ================= PERSONNAGES =================
  // visage, DEVANT, TETE et corps vivent dans avatars.js (partagé avec la fenêtre de détail).
  const corps = (a, cx, cy, ex) => Avatars.corps(g, a, cx, cy, ex);

  function main(x, y, a) {
    r(x, y - 1, 4, 1, K); r(x - 1, y, 6, 2, K); r(x, y + 2, 4, 1, K);
    r(x, y, 4, 2, a.coul); px(x, y, a.clair);
  }

  // ---- calcul de l'expression et des mouvements d'un agent ----
  function pose(a, t) {
    const e = etats[a.cle], an = a.anim;
    const dt = t - an.depuis;
    const etat = e.etat;
    const p = {
      yeux: 'ouvert', bouche: 'sourire', lx: 0, ly: 0, dx: 0, dy: 0,
      tape: false, reflechit: false, dort: false, bulle: null, sourcil: false
    };
    // respiration
    const periode = etat === 'travail' ? 1500 / a.vif : 2800;
    const souffle = Math.sin((t / periode) * Math.PI * 2 + a.phase);
    p.dy = calme ? 0 : souffle > 0.25 ? 1 : 0;
    // petit saut lors d'un changement d'état
    if (!calme && dt < 360) p.dy -= Math.round(Math.sin((dt / 360) * Math.PI) * 3);
    // clignement
    const cyc = 3400 + a.phase * 500;
    const clign = !calme && ((t + a.phase * 977) % cyc) < 130;

    if (etat === 'travail') {
      const c = (dt + a.phase * 1300) % 7200;
      p.reflechit = dt > 900 && c > 5300;
      if (p.reflechit) { p.ly = -1; p.lx = a.s > 0 ? 0 : -1; p.bouche = 'plat'; p.bulle = 'points'; }
      else { p.tape = true; p.lx = a.s > 0 ? 1 : -1; p.bouche = (c % 2400) < 1600 ? 'plat' : 'sourire'; }
      if (clign) p.yeux = 'cligne';
    } else if (etat === 'erreur') {
      p.yeux = 'erreur'; p.bouche = 'vague'; p.bulle = 'excl';
      const sec = dt < 1100 || (dt % 2600) < 420;
      if (!calme && sec) p.dx = Math.floor(t / 60) % 2 ? 1 : -1;
    } else if (etat === 'doute') {
      p.bouche = 'doute'; p.ly = -1; p.sourcil = true; p.bulle = 'inter';
      p.lx = calme ? 0 : (Math.floor((t + a.phase * 800) / 1700) % 2 ? 1 : -1);
      if (!calme && (dt % 3000) < 900) p.dx = p.lx > 0 ? 1 : 0;
      if (clign) p.yeux = 'cligne';
    } else { // repos
      if (dt > 3500 || an.depuis < 0) { p.dort = true; p.yeux = 'dort'; p.bouche = 'dort'; p.bulle = 'zzz';
        const s2 = Math.sin((t / 3600) * Math.PI * 2 + a.phase); p.dy = calme ? 0 : s2 > 0 ? 1 : 0; }
      else {
        const sl = Math.floor((t + a.phase * 1000) / 2300);
        p.lx = calme ? 0 : [0, 1, 0, -1][sl % 4];
        if (clign) p.yeux = 'cligne';
      }
    }
    // réaction : quelqu'un vient de se mettre au travail
    const re = reaction;
    if (re && re.cle !== a.cle && t < re.fin && etat !== 'erreur') {
      const cible = AGENTS[re.cle];
      p.lx = cible.cx > a.cx + 4 ? 1 : cible.cx < a.cx - 4 ? -1 : 0;
      p.ly = cible.rang < a.rang ? -1 : 0;
      if (p.dort) { p.yeux = t - re.debut < 500 ? 'grand' : 'ouvert'; p.bouche = 'o'; p.bulle = null; }
      else if (etat === 'repos' && t - re.debut < 500) p.yeux = 'grand';
      p.tape = false;
    }
    return p;
  }

  function cibleEcran(a, e, p) {
    if (e.etat === 'travail') return '#16233a';
    if (e.etat === 'erreur') return '#5e1a26';
    if (e.etat === 'doute') return '#4a3d16';
    return p && p.dort ? '#0e1222' : '#141a2e';
  }

  function moniteur(a, t, e, p, lueurs) {
    const mx = a.cx + a.s * 25, y = a.haut;
    r(mx - 4, y, 8, 2, K); r(mx - 3, y, 6, 1, '#5a5578');
    r(mx - 1, y - 3, 2, 3, '#4a4563');
    r(mx - 12, y - 18, 24, 16, K); r(mx - 11, y - 17, 22, 14, '#4a4563'); r(mx - 11, y - 17, 22, 1, '#6c6690');
    const sx = mx - 10, sy = y - 16;
    // transition douce de la couleur d'écran
    const cib = hex(cibleEcran(a, e, p));
    const k = calme ? 1 : 0.12;
    for (let i = 0; i < 3; i++) a.ecran[i] += (cib[i] - a.ecran[i]) * k;
    r(sx, sy, 20, 12, rvb(a.ecran));
    if (e.etat === 'travail') {
      const pas = calme ? 0 : Math.floor(t / (p.reflechit ? 1e9 : 300 / a.vif));
      for (let l = 0; l < 5; l++) {
        const n = l + pas;
        const ind = (alea(n * 3.1 + a.phase) * 3 | 0) * 2;
        const lg = 4 + (alea(n * 7.7 + a.phase) * 10 | 0);
        r(sx + 2 + ind, sy + 1 + l * 2, lg, 1, l === 4 ? '#ffffff' : (n % 3 ? a.ligne : '#ffd166'));
      }
      if (calme || Math.floor(t / 400) % 2) r(sx + 17, sy + 9, 1, 2, '#ffffff');
      lueurs.push([mx - 0.5, y - 10, 18, a.ligne, 0.10]);
    } else if (e.etat === 'erreur') {
      const fort = calme || Math.floor(t / 450) % 2;
      glyphe(G.excl, sx + 9, sy + 3, fort ? '#ffffff' : '#ff9aa2');
      lueurs.push([mx - 0.5, y - 10, 18, '#ff4a5a', fort ? 0.16 : 0.08]);
    } else if (e.etat === 'doute') {
      glyphe(G.inter, sx + 7.5, sy + 3, '#ffd166');
      lueurs.push([mx - 0.5, y - 10, 16, '#ffd166', 0.09]);
    } else {
      // écran de veille : une petite gemme qui flotte
      const tri = (v) => Math.abs(((v % 2) + 2) % 2 - 1);
      const gx = sx + 1 + (calme ? 8 : tri(t / 4100 + a.phase) * 16), gy = sy + 1 + (calme ? 4 : tri(t / 2900 + a.phase) * 8);
      r(gx + 1, gy, 1, 1, '#6e5aa8'); r(gx, gy + 1, 3, 1, '#4a3a7a'); px(gx + 1, gy + 2, '#4a3a7a');
    }
    r(sx, sy, 20, 1, '#ffffff14');
  }

  function clavier(a, y) {
    const cx = a.cx;
    r(cx - 10, y + 1, 20, 4, K); r(cx - 9, y + 1, 18, 3, '#dcd6ea'); r(cx - 9, y + 3, 18, 1, '#b5aec8');
    for (let i = 0; i < 8; i++) px(cx - 8 + i * 2, y + 2, '#9d96b3');
  }

  function tasse(x, y, t) {
    r(x - 1, y - 6, 7, 7, K); r(x, y - 5, 5, 5, '#ece6f5'); r(x, y - 5, 5, 1, '#6b4226'); r(x, y - 1, 5, 1, '#cfc7de');
    r(x + 5, y - 4, 2, 3, K); px(x + 5, y - 3, '#ece6f5');
    for (let k = 0; k < 2; k++) {
      const ph = calme ? 0.35 + k * 0.2 : ((t / 1700) + k * 0.5) % 1;
      g.globalAlpha = calme ? 0.35 : 0.55 * (1 - ph);
      for (let i = 0; i < 3; i++) {
        const yy = y - 8 - ph * 9 - i;
        const xx = x + 1 + k * 2 + Math.round(Math.sin(ph * 6 + i * 0.8 + k) * 1);
        px(xx, yy, '#ffffff');
      }
      g.globalAlpha = 1;
    }
  }

  function objet(a, t, e, p, lueurs) {
    const ox = a.cx - a.s * 22, y = a.haut;
    const trav = e.etat === 'travail';
    if (a.objet === 'loupe') {
      r(ox - 6, y - 1, 9, 3, '#f4f1ea'); r(ox - 5, y, 6, 1, '#c9c4b8');
      const bx = ox + (trav && !calme ? Math.round(Math.sin(t / 380) * 3) : 0);
      r(bx + 2, y - 2, 4, 2, '#8a5a2b'); ovale(bx, y - 5, 4, 4, K); ovale(bx, y - 5, 3, 3, '#bfe4ff'); px(bx - 2, y - 7, '#ffffff');
      ovale(bx, y - 5, 2, 2, '#8fc8f0');
    } else if (a.objet === 'pinceaux') {
      r(ox - 4, y - 6, 8, 7, K); r(ox - 3, y - 5, 6, 6, '#e07a5f'); r(ox - 3, y - 5, 6, 1, '#f29a7f');
      const cs = ['#ff8fb0', '#ffd166', '#8fd3ff'];
      for (let i = 0; i < 3; i++) { r(ox - 2 + i * 2, y - 11 + (i % 2), 1, 6, '#8a6446'); r(ox - 2 + i * 2, y - 12 + (i % 2), 1, 2, cs[i]); }
    } else if (a.objet === 'cristal') {
      r(ox - 4, y - 1, 8, 3, K); r(ox - 3, y - 1, 6, 2, '#5a3d2b');
      ovale(ox, y - 6, 5, 5, K); ovale(ox, y - 6, 4, 4, trav ? '#c9a2ff' : '#9a7ad0');
      ovale(ox + 1, y - 5, 2, 2, trav ? '#f0e2ff' : '#b89ae0'); px(ox - 2, y - 8, '#ffffff');
      if (trav) lueurs.push([ox - 0.5, y - 6.5, 9, '#c9a2ff', 0.22 + (calme ? 0 : Math.sin(t / 300) * 0.08)]);
    } else if (a.objet === 'enveloppe') {
      const env = (x, yy) => { r(x - 1, yy - 1, 9, 7, K); r(x, yy, 7, 5, '#f6f1e6'); px(x + 1, yy + 1, '#cfc6b4'); px(x + 2, yy + 2, '#cfc6b4'); px(x + 4, yy + 2, '#cfc6b4'); px(x + 5, yy + 1, '#cfc6b4'); px(x + 3, yy + 3, '#e5484d'); };
      env(ox - 3, y - 5); env(ox - 4, y - 2);
      if (trav && !calme) { // une enveloppe s'envole régulièrement
        const ph = ((t - a.anim.depuis) % 3000) / 1500;
        if (ph < 1) {
          g.globalAlpha = 1 - ph * ph;
          const vx = ox - 3 - a.s * ph * 26, vy = y - 8 - ph * 34 + Math.sin(ph * 9) * 2;
          r(vx, vy, 5, 4, '#f6f1e6'); px(vx + 1, vy + 1, '#cfc6b4'); px(vx + 3, vy + 1, '#cfc6b4'); px(vx + 2, vy + 2, '#e5484d');
          g.globalAlpha = 1;
        }
      }
    } else if (a.objet === 'papiers') {
      r(ox - 6, y - 1, 12, 3, K); r(ox - 5, y - 1, 10, 2, '#e9e5dc');
      const dec = trav && !calme ? [0, 0, 2, 3, 2, 0][Math.floor(t / 260) % 6] : 0;
      r(ox - 5, y - 3, 10, 2, '#f6f3ec'); r(ox - 4 + dec, y - 5, 10, 2, '#ffffff'); r(ox - 4 + dec, y - 5, 10, 1, K);
      r(ox - 2 + dec, y - 4, 5, 1, '#9d96b3');
      r(ox + 4, y - 2, 6, 1, '#2f4f99'); px(ox + 10, y - 2, '#ffd166');
    } else if (a.objet === 'marteau') {
      const gx = ox - 4;
      r(gx - 6, y, 12, 2, K); r(gx - 5, y, 10, 1, '#5b3a22');
      const dm = t - a.anim.marteau;
      let poseM = 'repos';
      if (!calme && dm >= 0 && dm < 900) poseM = dm < 420 ? 'leve' : dm < 650 ? 'frappe' : 'repos';
      if (poseM === 'repos') {
        blocs([[gx - 4, y - 4, 6, 3]], '#9a6434'); r(gx + 2, y - 3, 7, 1, '#c99466'); px(gx - 3, y - 4, '#c88a52');
      } else if (poseM === 'leve') {
        blocs([[gx - 3, y - 13, 6, 3]], '#9a6434'); r(gx, y - 10, 1, 6, '#c99466');
      } else {
        blocs([[gx - 3, y - 4, 6, 3]], '#9a6434'); r(gx, y - 10, 1, 6, '#c99466');
        px(gx - 6, y - 5, '#ffffff'); px(gx - 7, y - 7, '#ffffff'); px(gx + 5, y - 5, '#ffffff'); px(gx + 6, y - 7, '#ffffff');
      }
      p.marteau = poseM === 'repos' ? null : [gx - 1, poseM === 'leve' ? y - 6 : y - 5];
    }
    if (a.tasse) tasse(a.cx - a.s * 33, y, t);
  }

  function bureau(a) {
    const { cx, haut: y } = a;
    if (a.banc) {
      r(cx - 47, y - 1, 94, 8, K);
      r(cx - 46, y, 92, 6, '#8a5236'); r(cx - 46, y, 92, 1, '#a86a48'); r(cx - 46, y + 5, 92, 1, '#6a3a26');
      r(cx - 45, y + 7, 90, 23, K); r(cx - 44, y + 7, 88, 23, '#6a3d29');
      r(cx - 44, y + 7, 88, 1, '#4a2a1c');
      for (const x0 of [cx - 40, cx + 14]) { r(x0, y + 10, 26, 16, '#5a3322'); r(x0, y + 10, 26, 1, '#7c4a32'); r(x0, y + 25, 26, 1, '#4a2a1c'); }
      // balance dorée
      r(cx - 6, y + 10, 12, 1, OR); r(cx - 1, y + 9, 2, 8, OR_O); r(cx - 3, y + 17, 6, 1, OR);
      px(cx - 6, y + 11, OR_O); px(cx + 5, y + 11, OR_O);
      r(cx - 8, y + 12, 5, 1, OR); r(cx + 3, y + 12, 5, 1, OR); px(cx - 1, y + 9, OR_C);
    } else {
      r(cx - 39, y - 1, 78, 8, K);
      r(cx - 38, y, 76, 6, '#b8855c'); r(cx - 38, y, 76, 1, '#d6a173'); r(cx - 38, y + 5, 76, 1, '#946444');
      r(cx - 37, y + 7, 74, 15, K); r(cx - 36, y + 7, 72, 15, '#97663f');
      r(cx - 36, y + 7, 72, 1, '#6e4a2f');
      r(cx - 13, y + 8, 1, 13, '#7d5536'); r(cx + 12, y + 8, 1, 13, '#7d5536');
      r(cx - 27, y + 12, 6, 1, '#d6a173'); r(cx + 21, y + 12, 6, 1, '#d6a173');
    }
  }

  function chaise(a, cy) {
    const { cx } = a;
    if (a.banc) {
      const top = cy - a.ry - 9;
      r(cx - 15, top + 2, 30, a.haut - top, K); r(cx - 13, top, 26, 3, K);
      r(cx - 14, top + 3, 28, a.haut - top, '#7a2e44'); r(cx - 12, top + 1, 24, 2, '#7a2e44');
      r(cx - 11, top + 4, 22, a.haut - top, '#8f3a52'); r(cx - 11, top + 2, 22, 1, '#a8526a');
      for (let i = 0; i < 6; i++) { px(cx - 14 + i * 5.4, top + 3, OR); }
    } else {
      const top = cy - 4;
      r(cx - a.rx - 4, top, (a.rx + 4) * 2, a.haut - top, K);
      r(cx - a.rx - 3, top + 1, (a.rx + 3) * 2, a.haut - top, '#4a4068');
      r(cx - a.rx - 3, top + 1, (a.rx + 3) * 2, 1, '#62588a');
    }
  }

  function aura(a, t, cy) {
    const puls = calme ? 0.5 : (Math.sin(t / 350) + 1) / 2;
    g.globalAlpha = 0.18 + puls * 0.12;
    ovale(a.cx, cy, a.rx + 6, a.ry + 5, '#b98cff');
    g.globalAlpha = 0.25 + puls * 0.1;
    ovale(a.cx, cy, a.rx + 3, a.ry + 3, '#c9a2ff');
    g.globalAlpha = 1;
  }
  function etincelles(a, t, cy) {
    for (let i = 0; i < 4; i++) {
      const an = (calme ? 0.6 : t / 900) + i * Math.PI / 2;
      const x = Math.round(a.cx - 0.5 + Math.cos(an) * (a.rx + 8)), y = Math.round(cy - 2 + Math.sin(an) * (a.ry + 2) * 0.7);
      const big = calme || Math.sin(t / 200 + i) > 0;
      px(x, y, '#ffffff');
      if (big) { px(x - 1, y, '#e2ccff'); px(x + 1, y, '#e2ccff'); px(x, y - 1, '#e2ccff'); px(x, y + 1, '#e2ccff'); }
    }
  }

  function agent(a, t, lueurs, bulles) {
    const e = etats[a.cle];
    const p = pose(a, t);
    const cx = a.cx + p.dx;
    const cy = a.haut - a.ry + 2 + p.dy;
    chaise(a, a.haut - a.ry + 2);
    if (a.aura && e.etat === 'travail') aura(a, t, cy);
    // lueur de l'écran sur le personnage
    corps(a, cx, cy, p);
    if (a.aura && e.etat === 'travail') etincelles(a, t, cy);
    if (e.etat === 'erreur' && !calme) { // goutte de sueur
      const ph = ((t - a.anim.depuis) % 1400) / 1400;
      const gx = cx + a.rx - 1, gy = cy - a.ry + 3 + Math.round(ph * 5);
      g.globalAlpha = 1 - ph * 0.6; px(gx, gy, '#ffffff'); r(gx - 1, gy + 1, 3, 2, '#8fd3ff'); px(gx, gy + 3, '#5aa8ff'); g.globalAlpha = 1;
    }
    bureau(a);
    moniteur(a, t, e, p, lueurs);
    clavier(a, a.haut);
    objet(a, t, e, p, lueurs);
    // mains
    const y = a.haut;
    let g1 = 0, g2 = 0;
    if (p.tape && !calme) {
      const k = Math.floor(t / (120 / a.vif));
      const h = alea(k + a.phase * 10);
      g1 = h < 0.45 ? -1 : 0; g2 = h > 0.55 ? -1 : 0;
    }
    if (p.marteau) main(p.marteau[0], p.marteau[1], a); else main(a.cx - 7, y + g1, a);
    main(a.cx + 3, y + g2, a);
    // bulles (dessinées plus tard, par-dessus tout)
    const sommet = cy - a.ry - (a.cle === 'johms' ? 6 : a.cle === 'drafion' ? 5 : a.cle === 'skyze' ? 4 : 2);
    if (p.bulle) bulles.push([a, p.bulle, sommet, t - a.anim.depuis]);
  }

  // ---- bulles ----
  function cadreBulle(x, y, w, h, fondC) {
    r(x + 1, y, w - 2, 1, K); r(x + 1, y + h - 1, w - 2, 1, K); r(x, y + 1, 1, h - 2, K); r(x + w - 1, y + 1, 1, h - 2, K);
    r(x + 1, y + 1, w - 2, h - 2, fondC);
    r(x + 1, y + h - 2, w - 2, 1, '#00000018');
    // pointe vers la tête
    r(x + 2, y + h - 1, 3, 1, fondC); px(x + 1, y + h - 1, K); px(x + 5, y + h - 1, K);
    px(x + 2, y + h, K); r(x + 3, y + h, 1, 1, fondC); px(x + 4, y + h, K); px(x + 3, y + h + 1, K);
  }
  function bulle([a, type, sommet, dt], t) {
    const apparition = calme ? 1 : lisse(borne(dt / 260));
    const x = a.cx + 3, montee = Math.round((1 - apparition) * 3);
    if (type === 'zzz') {
      for (let i = 0; i < 3; i++) {
        const ph = calme ? 0.15 + i * 0.3 : ((t / 2600) + i / 3) % 1;
        const zx = x + 3 + ph * 10 + (calme ? 0 : Math.sin(ph * 7) * 1.2), zy = sommet - 3 - ph * 16;
        g.globalAlpha = calme ? 0.85 : Math.min(1, (1 - ph) * 1.6) * apparition;
        const mo = ph < 0.33 ? G.z3 : ph < 0.66 ? G.z4 : G.z5;
        glyphe(mo, zx + 1, zy + 1, '#1d172980');
        glyphe(mo, zx, zy, '#dfe3ff');
        g.globalAlpha = 1;
      }
      return;
    }
    g.globalAlpha = apparition;
    if (type === 'points') {
      const w = 15, h = 8, bx = x, by = sommet - h - 3 + montee;
      cadreBulle(bx, by, w, h, '#ffffff');
      const n = calme ? 3 : Math.floor(t / 280) % 4;
      for (let i = 0; i < 3; i++) r(bx + 3 + i * 3, by + 3 + (!calme && n === i + 1 ? -1 : 0), 2, 2, i < n ? '#5a4a7a' : '#cfc8dd');
    } else if (type === 'excl') {
      const w = 8, h = 11, bx = x + 1, by = sommet - h - 3 + montee;
      cadreBulle(bx, by, w, h, '#ff5a64');
      glyphe(G.excl, bx + 3, by + 2, '#ffffff');
    } else if (type === 'inter') {
      const w = 11, h = 11, bx = x + 1, by = sommet - h - 3 + montee + (calme ? 0 : Math.round(Math.sin(t / 500)));
      cadreBulle(bx, by, w, h, '#ffd166');
      glyphe(G.inter, bx + 3, by + 2, '#3a2e10');
    }
    g.globalAlpha = 1;
  }

  // ---- lumière : voile du soir + lueurs additives ----
  function lumieres(lueurs) {
    if (mom.voile > 0) { g.fillStyle = `rgba(16,12,40,${mom.voile})`; g.fillRect(0, -DY, W, H); }
    g.globalCompositeOperation = 'lighter';
    const f = 0.6 + mom.voile * 1.4;
    for (const [x, y, rr, c, al] of lueurs) {
      for (let i = 0; i < 4; i++) {
        const k = 1 - i * 0.22;
        g.globalAlpha = al * f * 0.3;
        ovale(x + 0.5, y + 0.5, Math.max(1, Math.round(rr * k)), Math.max(1, Math.round(rr * 0.72 * k)), c);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  let reaction = null;

  // ---- clones : exemplaires multiples d'un même agent (petite réplique translucide avec son mini-bureau) ----
  // Emplacements (x, dans les zones libres du décor, à la hauteur du bureau de l'agent) : 3 par agent au maximum.
  // [x, décalage vertical] : aucun emplacement n'est partagé entre deux agents (bords et espaces entre les bureaux).
  const EMPL = {
    drafion: [[15, 0], [119, 0], [119, 26]], kinan: [[143, 0], [255, 0], [143, 26]], skyze: [[385, 0], [280, 0], [280, 26]],
    johms: [[15, 0], [121, 0], [15, 26]], quatre: [[149, 0], [251, 0], [149, 26]], cinq: [[385, 0], [279, 0], [385, 26]]
  };
  const MAX_CLONES = 3;
  const spritesClone = {}, comp = document.createElement('canvas');
  comp.width = 32; comp.height = 36;
  function spriteClone(k) {
    if (!spritesClone[k]) {
      const c = document.createElement('canvas'); c.width = c.height = 44;
      try { window.Avatars.corps(c.getContext('2d'), AGENTS[k], 22, 26, { yeux: 'ouvert', bouche: 'plat', lx: 0, ly: 0 }); } catch { /* sans clone */ }
      spritesClone[k] = c;
    }
    return spritesClone[k];
  }
  const nbClones = (k) => (etats[k].instances.length >= 2 ? etats[k].instances.length - 1 : 0);
  function clonesDessin(t) {
    for (const k of CLES) {
      const m = Math.min(nbClones(k), MAX_CLONES);
      if (!m) continue;
      const a = AGENTS[k], y = HAUTS[a.rang], actif = etats[k].etat === 'travail';
      for (let i = 0; i < m; i++) {
        const [x, dy] = EMPL[k][i];
        const haut = g; g = comp.getContext('2d');
        g.clearRect(0, 0, 32, 36);
        const bob = (!calme && actif && Math.floor(t / (300 / a.vif) + i) % 2) ? 1 : 0;
        g.imageSmoothingEnabled = false;
        g.drawImage(spriteClone(k), 0, 0, 44, 44, 5, 3 + bob, 22, 22);
        r(4, 22, 24, 8, K); r(5, 23, 22, 6, '#b8855c'); r(5, 23, 22, 1, '#d6a173'); r(6, 29, 20, 5, K); r(6, 29, 20, 4, '#97663f');
        r(20, 17, 7, 5, K); r(21, 18, 5, 3, actif && (calme || Math.floor(t / 400 + i) % 2) ? a.ui : '#4a4468');
        g = haut;
        g.globalAlpha = 0.78;
        g.drawImage(comp, x - 16, y + dy - 21);
        g.globalAlpha = 1;
      }
    }
  }

  function dessiner(t) {
    g = principal;
    g.setTransform(1, 0, 0, 1, 0, DY);
    g.drawImage(fond, 0, -DY);
    ciel(t);
    horloge();
    plante(t);
    const lueurs = [], bulles = [];
    lampadaire(lueurs);
    for (const k of ORDRE) agent(AGENTS[k], t, lueurs, bulles);
    clonesDessin(t);
    lumieres(lueurs);
    const lueursG = [];
    guirlande(t, lueursG);
    if (mom.voile > 0) { g.globalCompositeOperation = 'lighter'; for (const [x, y, rr, c, al] of lueursG) { g.globalAlpha = al * mom.voile * 1.6; ovale(x + 0.5, y + 0.5, rr, rr, c); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    for (const b of bulles) bulle(b, t);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ================= TAILLE NETTE =================
  const plaques = {}, zones = {}, pluses = {};
  CLES.forEach((k) => {
    const a = AGENTS[k];
    const d = document.createElement('div');
    d.className = 'plaque';
    const pNom = document.createElement('b'); pNom.className = 'p-nom'; pNom.textContent = a.nom;
    const pClone = document.createElement('i'); pClone.className = 'p-clone'; pNom.appendChild(pClone);
    const pTache = document.createElement('span'); pTache.className = 'p-tache';
    d.append(pNom, pTache); d._tache = pTache; d._clone = pClone; // 2e ligne : ce que l'agent est en train de faire
    d.style.left = (a.cx / W) * 100 + '%';
    d.style.top = ((a.rang === 0 ? 152 : 216) + DY) / H * 100 + '%';
    cadre.appendChild(d);
    plaques[k] = d;
    // Badge « +N » au-delà de 3 clones visibles
    const plus = document.createElement('div');
    plus.className = 'clone-plus'; plus.hidden = true;
    plus.style.left = (EMPL[k][MAX_CLONES - 1][0] / W) * 100 + '%';
    plus.style.top = ((HAUTS[a.rang] + EMPL[k][MAX_CLONES - 1][1] - 24) + DY) / H * 100 + '%';
    cadre.appendChild(plus); pluses[k] = plus;
    // Zone cliquable sur le personnage (et son bureau) : ouvre le détail de l'agent.
    const z = document.createElement('div');
    z.className = 'zone-agent';
    // Même repère que le dessin : bureau = demi-largeur 39 (47 pour le banc de Kinan), tête ~40 au-dessus du plateau, pieds du bureau ~22 en dessous.
    const demi = (a.banc ? 47 : 39) + 2, haut0 = a.haut - (a.banc ? 46 : 40), bas0 = a.haut + (a.banc ? 31 : 24);
    z.style.left = (a.cx / W) * 100 + '%';
    z.style.top = (haut0 + DY) / H * 100 + '%';
    z.style.width = (demi * 2 / W) * 100 + '%';
    z.style.height = ((bas0 - haut0) / H) * 100 + '%';
    z.title = 'Voir le détail de ' + a.nom;
    zones[k] = z;
    z.addEventListener('click', () => basculerDetail(k, true)); // détail dans le panneau, sans nouvelle fenêtre
    cadre.appendChild(z);
  });
  function ajuster() {
    const dpr = window.devicePixelRatio || 1;
    const lw = zone.clientWidth - 16, lh = zone.clientHeight - 16;
    if (lw <= 0 || lh <= 0) return;
    let s = Math.min((lw * dpr) / W, (lh * dpr) / H);
    if (s >= 2) s = Math.floor(s); // échelle entière en pixels physiques : pixels parfaitement carrés
    cadre.style.width = (W * s) / dpr + 'px';
    cadre.style.height = (H * s) / dpr + 'px';
    cadre.style.setProperty('--u', s / dpr + 'px'); // 1 unité de scène en pixels CSS : plaques et zones suivent l'échelle
    sale = true;
  }
  new ResizeObserver(ajuster).observe(zone);
  window.addEventListener('resize', ajuster);
  ajuster();

  // ================= PANNEAU =================
  const equipe = document.getElementById('equipe');
  const journalEl = document.getElementById('journal');
  const compteurs = document.getElementById('compteurs');
  const horlogeEl = document.getElementById('horloge');
  const cartes = {};
  const journal = [];

  function avatar(a, cvs) { Avatars.dessinerAvatar(cvs, a.cle, etats[a.cle].etat); }

  CLES.forEach((k) => {
    const a = AGENTS[k];
    const li = document.createElement('li');
    li.className = 'carte';
    li.innerHTML = `<canvas class="avatar" width="24" height="24" aria-hidden="true"></canvas>
      <div><div class="ligne1"><strong></strong><span class="modele mono"></span><span class="clone-badge" hidden></span><span class="etat"></span></div>
      <p class="tache"></p><div class="role"></div></div>`;
    li.querySelector('strong').textContent = a.nom;
    li.querySelector('.modele').textContent = a.modele;
    li.querySelector('.role').textContent = a.role;
    // Clic (ou Entrée) : le détail « Fait / En cours / À venir » se déplie sous la carte, dans la page principale.
    li.tabIndex = 0; li.style.cursor = 'pointer'; li.title = 'Voir le détail de ' + a.nom;
    const detail = document.createElement('div');
    detail.className = 'detail'; detail.hidden = true;
    ['Fait', 'En cours', 'À venir', 'Exemplaires'].forEach((titre) => {
      const ligne = document.createElement('div'); ligne.className = 'dl';
      const dt = document.createElement('span'); dt.className = 'dt'; dt.textContent = titre;
      const dd = document.createElement('span'); dd.className = 'dd';
      if (titre === 'Exemplaires') { ligne.hidden = true; dd.className = 'dd multi'; }
      ligne.append(dt, dd); detail.appendChild(ligne);
    });
    li.appendChild(detail);
    detail.addEventListener('click', (ev) => ev.stopPropagation()); // cliquer dans le détail ne le referme pas
    li.addEventListener('click', () => basculerDetail(k, false));
    li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') basculerDetail(k, false); });
    equipe.appendChild(li);
    cartes[k] = { badge: li.querySelector('.clone-badge'), li, detail, cvs: li.querySelector('canvas'), etat: li.querySelector('.etat'), tache: li.querySelector('.tache'), role: li.querySelector('.role') };
  });

  // Détail d'un agent : lu dans les fichiers locaux (0 jeton), rafraîchi toutes les 2 s tant qu'il est ouvert.
  let detailOuvert = null, minuteurDetail = null;
  async function remplirDetail(k) {
    if (!(window.kinan && window.kinan.detailAgent)) return;
    let d = null;
    try { d = await window.kinan.detailAgent(ID_DE[k] || k); } catch { /* silencieux */ }
    if (!d || detailOuvert !== k) return;
    const dd = cartes[k].detail.querySelectorAll('.dd');
    dd[0].textContent = d.faits.length ? d.faits.map((f) => f.tache).join(' · ') : 'Rien d\'enregistré';
    dd[1].textContent = d.etat === 'repos' ? 'Au repos' : (d.tache && d.tache !== 'Au travail…' ? d.tache : 'Au travail') + (d.depuis ? ' · ' + ilya(d.depuis) : '');
    const inst = Array.isArray(d.instances) ? d.instances : [];
    cartes[k].detail.querySelectorAll('.dl')[3].hidden = inst.length < 2;
    if (inst.length >= 2) dd[3].textContent = inst.map((x, i) => `n°${i + 1} : ${x.tache || 'Au travail'}${x.depuis ? ' · depuis ' + ilya(x.depuis).replace(/^il y a /, '') : ''}`).join('\n');
    dd[2].textContent = d.avenir.length ? d.avenir.map((t) => t.titre).join(' · ') : 'Rien de planifié';
  }
  function basculerDetail(k, ouvrirSeulement) {
    const dejaOuvert = detailOuvert === k;
    if (detailOuvert) { cartes[detailOuvert].detail.hidden = true; cartes[detailOuvert].li.classList.remove('ouvert'); clearInterval(minuteurDetail); detailOuvert = null; }
    if (dejaOuvert && !ouvrirSeulement) return; // second clic sur la carte : on referme
    detailOuvert = k;
    cartes[k].detail.hidden = false; cartes[k].li.classList.add('ouvert');
    cartes[k].li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    remplirDetail(k);
    minuteurDetail = setInterval(() => remplirDetail(k), 2000);
  }

  const hhmm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  function ilya(ms) {
    if (!ms) return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'à l\'instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }

  function majCarte(k) {
    const a = AGENTS[k], e = etats[k], c = cartes[k];
    c.li.dataset.etat = e.etat;
    c.etat.dataset.etat = e.etat;
    c.etat.textContent = LIBELLE[e.etat];
    plaques[k].dataset.etat = e.etat;
    const nExemp = e.instances.length >= 2 ? e.instances.length : 0;
    c.badge.hidden = !nExemp; c.badge.textContent = nExemp ? '×' + nExemp : ''; c.badge.title = nExemp ? nExemp + ' exemplaires de ' + a.nom + ' travaillent en même temps' : '';
    plaques[k]._clone.textContent = nExemp ? '×' + nExemp : ''; plaques[k].dataset.clone = nExemp ? '1' : '';
    const sup = nbClones(k) - MAX_CLONES; pluses[k].hidden = sup <= 0; pluses[k].textContent = sup > 0 ? '+' + sup : '';
    const tachePlaque = (e.etat !== 'repos' && e.tache && e.tache !== 'Au travail…') ? e.tache : '';
    plaques[k]._tache.textContent = tachePlaque; plaques[k].title = tachePlaque; zones[k].title = 'Voir le détail de ' + a.nom + (tachePlaque ? ' : ' + tachePlaque : ''); plaques[k].dataset.avecTache = tachePlaque ? '1' : '';
    if (e.etat !== 'repos' && e.tache) { c.tache.textContent = e.tache; c.tache.className = 'tache'; }
    else if (e.derniere) { c.tache.textContent = 'Dernière : ' + e.derniere; c.tache.className = 'tache passee'; }
    else { c.tache.textContent = e.etat === 'repos' ? 'Aucune tâche récente' : LIBELLE[e.etat]; c.tache.className = 'tache vide'; }
    c.tache.title = c.tache.textContent;
    const quand = ilya(e.maj);
    c.role.textContent = quand ? `${a.role} · ${quand}` : a.role;
    avatar(a, c.cvs);
  }

  function majCompteurs() {
    const n = { travail: 0, doute: 0, erreur: 0 };
    CLES.forEach((k) => { if (n[etats[k].etat] !== undefined) n[etats[k].etat]++; });
    const parts = [];
    parts.push(`<li style="--c:var(--travail)"><b>${n.travail}</b> au travail</li>`);
    if (n.doute) parts.push(`<li style="--c:var(--doute)"><b>${n.doute}</b> doute${n.doute > 1 ? 's' : ''}</li>`);
    if (n.erreur) parts.push(`<li style="--c:var(--erreur)"><b>${n.erreur}</b> erreur${n.erreur > 1 ? 's' : ''}</li>`);
    compteurs.innerHTML = parts.join('');
    toile.setAttribute('aria-label', 'Bureau des agents : ' + CLES.map((k) => `${AGENTS[k].nom} ${LIBELLE[etats[k].etat].toLowerCase()}`).join(', '));
  }

  function noter(k, texte, quand, etat) {
    journal.unshift({ k, texte, quand, etat, neuf: true });
    if (journal.length > 40) journal.length = 40;
  }
  function rendreJournal() {
    if (!journal.length) { journalEl.innerHTML = '<li class="rien">Aucune activité pour l\'instant.</li>'; return; }
    journalEl.innerHTML = '';
    for (const j of journal) {
      const li = document.createElement('li');
      if (j.neuf) { li.className = 'neuf'; j.neuf = false; }
      li.style.setProperty('--c', COUL_ETAT[j.etat]);
      const tm = document.createElement('time'); tm.className = 'mono'; tm.textContent = hhmm(j.quand);
      const sp = document.createElement('span');
      const b = document.createElement('b'); b.textContent = AGENTS[j.k].nom;
      sp.append(b, ' : ' + j.texte);
      sp.title = AGENTS[j.k].nom + ' : ' + j.texte;
      li.append(tm, document.createElement('i'), sp);
      journalEl.appendChild(li);
    }
  }

  // ================= DONNÉES =================
  let premier = true;
  function appliquer(etat) {
    // Les hooks indexent l'état par identifiant configuré : conversion vers les sièges de la scène.
    const brut = (etat && etat.agents) || {}, agents = {};
    for (const [id, v] of Object.entries(brut)) { const k = id === 'kinan' ? 'kinan' : (demo ? id : SIEGE_DE[id]); if (k) agents[k] = v; }
    const t = performance.now();
    let change = false;
    CLES.forEach((k) => {
      const v = agents[k] || {};
      const nouvel = ETATS.includes(v.etat) ? v.etat : 'repos';
      const tache = typeof v.tache === 'string' ? v.tache.trim() : '';
      const maj = Number(v.maj) || 0;
      const e = etats[k], a = AGENTS[k];
      const inst = (nouvel !== 'repos' && Array.isArray(v.instances)) ? v.instances.filter((i) => i && typeof i === 'object')
        .map((i) => ({ id: String(i.id || ''), tache: String(i.tache || '').trim(), depuis: Number(i.depuis) || 0 })) : [];
      if (inst.length !== e.instances.length) {
        change = true; sale = true;
        if (inst.length > e.instances.length && inst.length >= 2 && !premier) noter(k, `exemplaire n°${inst.length} déployé : ${inst[inst.length - 1].tache || 'au travail'}`, Date.now(), 'travail');
      }
      e.instances = inst;
      const ancien = e.etat;
      const quand = maj || Date.now();
      if (nouvel !== ancien || (tache && tache !== e.tache && nouvel !== 'repos')) {
        change = true;
        if (nouvel !== ancien) { a.anim.prec = ancien; a.anim.depuis = premier && nouvel === 'repos' ? -1e9 : t; }
        let texte = null;
        if (nouvel === 'travail') texte = tache || 'au travail';
        else if (nouvel === 'erreur') texte = tache ? 'erreur, ' + tache : 'erreur';
        else if (nouvel === 'doute') texte = tache ? 'doute, ' + tache : 'doute';
        else if (!premier) texte = ancien === 'travail' ? 'terminé' : 'au repos';
        if (texte) noter(k, texte, quand, nouvel);
        if (nouvel === 'travail' && ancien !== 'travail' && !premier) {
          reaction = { cle: k, debut: t, fin: t + 1700 };
          if (k !== 'kinan') AGENTS.kinan.anim.marteau = t + 150;
        }
      }
      if (tache) e.derniere = tache;
      e.etat = nouvel; e.tache = tache;
      e.maj = maj || (nouvel !== ancien ? Date.now() : e.maj);
    });
    if (premier) journal.sort((x, y) => y.quand - x.quand);
    premier = false;
    if (change || !journal.length) { CLES.forEach(majCarte); majCompteurs(); rendreJournal(); }
    sale = true;
  }

  const modeEl = document.getElementById('mode');
  const demo = !window.kinan || location.search.includes('demo');
  if (!demo) {
    modeEl.textContent = 'connecté';
    modeEl.classList.add('connecte');
    modeEl.title = 'Connecté au fichier d\'état local';
    window.kinan.surEtat(appliquer);
    appliquer(null);
  } else {
    modeEl.textContent = 'mode démonstration';
    const TACHES = {
      drafion: ['Lecture des fichiers du projet', 'Vérification des tests', 'Contrôle du rendu'],
      skyze: ['Rédaction de la documentation', 'Harmonisation des styles', 'Page de paramètres'],
      johms: ['Rendu complexe', 'Bug d\'animation au défilement'],
      quatre: ['Lecture des journaux', 'Résumé des changements', 'Contrôle hebdomadaire'],
      kinan: ['Répartition des tâches', 'Vérification d\'un rendu'],
      cinq: ['Brouillon de note technique', 'Relecture du plan']
    };
    const DOUTES = ['quelle version garder ?', 'faut-il demander confirmation ?'];
    const ERREURS = ['Lien cassé détecté', 'Échec de la capture'];
    const sim = { agents: {} };
    const instancesDemo = (k, n) => Array.from({ length: n }, (_, i) => ({ id: k + i, tache: i ? TACHES[k][i % TACHES[k].length] + ' (n°' + (i + 1) + ')' : sim.agents[k].tache, depuis: Date.now() - 60000 * (n - i) }));
    const tirer = (k) => {
      const x = Math.random();
      const l = TACHES[k];
      const v = x < 0.52 ? ['travail', l[Math.floor(Math.random() * l.length)]]
        : x < 0.8 ? ['repos', ''] : x < 0.9 ? ['doute', DOUTES[Math.floor(Math.random() * 2)]] : ['erreur', ERREURS[Math.floor(Math.random() * 2)]];
      sim.agents[k] = { etat: v[0], tache: v[1], maj: Date.now() };
      if (v[0] === 'travail' && Math.random() < 0.3) sim.agents[k].instances = instancesDemo(k, 2 + Math.floor(Math.random() * 2));
    };
    const depart = { drafion: ['travail', 'Lecture des fichiers du projet'], kinan: ['travail', 'Répartition des tâches'], skyze: ['doute', 'quelle version garder ?'],
      johms: ['travail', 'Rendu complexe'], quatre: ['repos', ''], cinq: ['erreur', 'Échec de la capture'] };
    CLES.forEach((k) => { sim.agents[k] = { etat: depart[k][0], tache: depart[k][1], maj: Date.now() - 60000 * (2 + CLES.indexOf(k)) }; });
    // Exemplaires multiples (clones) : par défaut Drafion ×2 et Johms ×3 ; ?clones=skyze:2,quatre:5 pour choisir.
    const plan = {}; const mc = decodeURIComponent(location.search).match(/clones=([\w:,]+)/);
    if (mc) mc[1].split(',').forEach((x) => { const [k, n] = x.split(':'); if (AGENTS[k]) plan[k] = +n || 1; }); else { plan.drafion = 2; plan.johms = 3; }
    Object.keys(plan).forEach((k) => { if (plan[k] >= 2) { sim.agents[k].etat = 'travail'; if (!sim.agents[k].tache) sim.agents[k].tache = TACHES[k][0]; sim.agents[k].instances = instancesDemo(k, plan[k]); } });
    appliquer(JSON.parse(JSON.stringify(sim)));
    CLES.forEach((k, i) => {
      const prochain = () => setTimeout(() => { tirer(k); appliquer(JSON.parse(JSON.stringify(sim))); prochain(); }, 6000 + Math.random() * 7000 + i * 300);
      setTimeout(prochain, i * 900);
    });
  }

  // Horloge d'en-tête, relatifs « il y a », moment de la journée
  function minute() {
    horlogeEl.textContent = hhmm(Date.now());
    horlogeEl.dateTime = new Date().toISOString();
    const nm = moment(heure());
    if (nm.nom !== mom.nom) { mom = nm; decor(); }
    CLES.forEach((k) => { const e = etats[k], c = cartes[k]; const q = ilya(e.maj); c.role.textContent = q ? `${AGENTS[k].role} · ${q}` : AGENTS[k].role; });
  }
  setInterval(minute, 15000);

  // Logo : petite gemme
  (() => {
    const c = document.getElementById('logo').getContext('2d');
    const ancien = g; g = c;
    const lignes = ['.....####.....', '...##hhh##....', '..#hhmmmdd#...', '.#hmmmmmddd#..', '#hmmmmmmdddd#.', '.#mmmmmmddd#..', '..#mmmmmdd#...', '...#mmmdd#....', '....#mmd#.....', '.....#d#......', '......#.......'];
    const col = { '#': K, h: '#c9b8ff', m: '#7a63c0', d: '#3a2e5a' };
    lignes.forEach((l, j) => { for (let i = 0; i < l.length; i++) if (col[l[i]]) px(i + 1, j + 2, col[l[i]]); });
    g = ancien;
  })();

  decor();
  minute();

  // ================= BOUCLE =================
  let derniere = -1e9;
  function boucle(t) {
    requestAnimationFrame(boucle);
    const pas = calme ? 1000 : 33; // ~30 i/s ; 1 i/s en mouvement réduit
    if (!sale && t - derniere < pas) return;
    derniere = t; sale = false;
    dessiner(t);
  }
  dessiner(performance.now());
  requestAnimationFrame(boucle);
})();
