// Placement des « doubles » des agents (exemplaires simultanés) : logique pure (aucun DOM, aucun réseau, aucune écriture d'état).
// UMD : module.exports en Node, window.PlacementLogique dans la page. Repère : pixels de scène (même repère que KinanEquipe.agents).
// Principe : une grille d'emplacements valides sur le sol, privée de tout ce qui est occupé (bureaux, écrans, objets du décor, lampadaire,
// plante déplacée par le panneau Royaume, bornes de la scène) ; chaque double prend l'emplacement libre le plus proche de son agent, sans
// jamais en chevaucher un autre ; le trajet depuis le bureau est un chemin (grille) qui contourne tous les obstacles.
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.PlacementLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCENE = Object.freeze({ W: 400, H: 270, DY: 18 });
  // Sol utilisable [x, y, largeur, hauteur] : sous la plinthe et l'enseigne TOKEN OUT, au-dessus du bas de l'image, 2 px de bord.
  const SOL = Object.freeze([2, 100, 396, 150]);
  // Un double est dessiné dans un sprite de 32 x 36 posé en (x - 16, y - 21) ; sa partie visible (tête + mini-bureau) fait 24 x 31.
  const DOUBLE = Object.freeze({ dx: -12, dy: -18, w: 24, h: 31 });
  // Silhouette qui marche (tête et corps seulement) : 12 x 20, pieds en (x, y).
  const MARCHEUR = Object.freeze({ dx: -6, dy: -12, w: 12, h: 20 });
  const MAX_PAR_AGENT = 3;
  const MARGE_DOUBLES = 2;   // espace libre entre deux doubles
  const MARGE_OBSTACLE = 1;  // espace libre autour d'un obstacle
  const PAS_X = 1, PAS_Y = 2;
  const PAS_CHEMIN = 3;

  const fini = (v) => typeof v === 'number' && Number.isFinite(v);
  const boiteDouble = (x, y) => [x + DOUBLE.dx, y + DOUBLE.dy, DOUBLE.w, DOUBLE.h];
  const boiteMarcheur = (x, y) => [x + MARCHEUR.dx, y + MARCHEUR.dy, MARCHEUR.w, MARCHEUR.h];

  function secoupent(a, b, marge) {
    const m = marge || 0;
    return a[0] < b[0] + b[2] + m && b[0] < a[0] + a[2] + m && a[1] < b[1] + b[3] + m && b[1] < a[1] + a[3] + m;
  }
  const dedans = (b, z) => b[0] >= z[0] && b[1] >= z[1] && b[0] + b[2] <= z[0] + z[2] && b[1] + b[3] <= z[1] + z[3];

  // Bureau d'un agent (tête, plateau, chaise, moniteur, tasse) : même emprise que la zone cliquable de scene.js.
  function rectBureau(a) {
    const banc = !!a.banc || a.cle === 'kinan';
    const demi = (banc ? 47 : 39) + 2, haut0 = a.haut - (banc ? 46 : 40), bas0 = a.haut + (banc ? 31 : 24);
    return [a.cx - demi, haut0, demi * 2, bas0 - haut0];
  }

  // Obstacles posés au sol. entree : { agents: [{ cle, cx, haut, banc }], objets: { id: [x, y, w, h] }, decalages: { id: [dx, dy] },
  //   planteRemplacee: bool, supplement: [[x, y, w, h]] (zones à éviter en plus : boîtes d'autres modules) }.
  // Retourne [{ id, boite }] ; id = « bureau:<cle> » pour les bureaux.
  function obstacles(entree) {
    const e = entree || {}, liste = [];
    for (const a of e.agents || []) if (a && fini(a.cx) && fini(a.haut)) liste.push({ id: 'bureau:' + a.cle, boite: rectBureau(a) });
    const objets = e.objets || {}, dec = e.decalages || {};
    const d = (id) => { const v = dec[id]; return Array.isArray(v) && fini(v[0]) && fini(v[1]) ? v : [0, 0]; };
    // Lampadaire : abat-jour, pied et socle ; plante : pot et feuillage (plus large une fois remplacée par une autre plante).
    const specifiques = {
      lampadaire: [256, 94, 26, 70],
      plante: e.planteRemplacee ? [116, 126, 28, 38] : [117, 128, 26, 32]
    };
    for (const id of Object.keys(objets)) {
      if (id === 'enseigne') continue; // suspendue au-dessus des agents : hors du sol utilisable
      const b = specifiques[id] || objets[id];
      if (!Array.isArray(b) || b.length < 4) continue;
      const [dx, dy] = d(id);
      liste.push({ id, boite: [b[0] + dx, b[1] + dy, b[2], b[3]] });
    }
    for (const id of Object.keys(specifiques)) if (!objets[id]) { const [dx, dy] = d(id), b = specifiques[id]; liste.push({ id, boite: [b[0] + dx, b[1] + dy, b[2], b[3]] }); }
    (e.supplement || []).forEach((b, i) => { if (Array.isArray(b) && b.length >= 4 && b.every(fini)) liste.push({ id: 'supp:' + i, boite: b.slice(0, 4) }); });
    return liste;
  }

  // Une boîte est-elle libre ? (dans le sol, hors obstacles, hors autres boîtes déjà posées)
  function boiteLibre(boite, interdits, posees, sol) {
    if (!dedans(boite, sol || SOL)) return false;
    for (const o of interdits) if (secoupent(boite, o.boite, MARGE_OBSTACLE)) return false;
    for (const p of posees || []) if (secoupent(boite, p, MARGE_DOUBLES)) return false;
    return true;
  }
  const centre = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];

  // Meilleur emplacement libre pour un double de l'agent a : le plus proche de son bureau (même rangée de préférence).
  function meilleur(a, interdits, posees, sol, acces) {
    const z = sol || SOL, [cx, cy] = centre(rectBureau(a));
    let best = null;
    for (let y = z[1] - DOUBLE.dy; y + DOUBLE.dy + DOUBLE.h <= z[1] + z[3]; y += PAS_Y) {
      for (let x = z[0] - DOUBLE.dx; x + DOUBLE.dx + DOUBLE.w <= z[0] + z[2]; x += PAS_X) {
        const b = boiteDouble(x, y);
        if (!boiteLibre(b, interdits, posees, z)) continue;
        if (acces && !accessible(acces, [x, y], z)) continue;
        const [bx, by] = centre(b);
        const cout = Math.abs(bx - cx) + 2.2 * Math.abs(by - cy);
        if (!best || cout < best.cout) best = { x, y, cout };
      }
    }
    return best ? [best.x, best.y] : null;
  }

  // Place les doubles. demande : { agents: [{ cle, cx, haut, banc, n }] (n : nombre de doubles à montrer), interdits, precedent: { cle: [[x, y], ...] } }.
  // Tour de rôle : chaque agent reçoit son premier double avant que quiconque reçoive le deuxième.
  // Un emplacement déjà attribué reste (aucun saut) tant qu'il est encore valide. Retourne { positions: { cle: [[x, y], ...] }, manques: { cle: nombre } }.
  function placer(demande) {
    const d = demande || {}, interdits = d.interdits || [], agents = (d.agents || []).filter((a) => a && fini(a.cx) && fini(a.haut));
    const prec = d.precedent || {}, positions = {}, manques = {}, posees = [], acces = {};
    for (const a of agents) { positions[a.cle] = []; manques[a.cle] = 0; }
    const voulu = (a) => Math.max(0, Math.min(MAX_PAR_AGENT, Math.floor(a.n) || 0));
    // 1) conserver ce qui est encore valide (dans l'ordre, sans trou : un emplacement perdu fait redistribuer les suivants)
    for (const a of agents) {
      const anciens = Array.isArray(prec[a.cle]) ? prec[a.cle] : [];
      for (let i = 0; i < voulu(a) && i < anciens.length; i++) {
        const p = anciens[i];
        if (!Array.isArray(p) || !fini(p[0]) || !fini(p[1])) break;
        const b = boiteDouble(p[0], p[1]);
        if (!boiteLibre(b, interdits, posees)) break;
        positions[a.cle].push([p[0], p[1]]); posees.push(b);
      }
    }
    // 2) compléter au tour de rôle
    for (let rang = 0; rang < MAX_PAR_AGENT; rang++) {
      for (const a of agents) {
        if (positions[a.cle].length > rang || voulu(a) <= rang) continue;
        if (!acces[a.cle]) acces[a.cle] = zoneAccessible(depart(a), interdits, ['bureau:' + a.cle]);
        const p = meilleur(a, interdits, posees, null, acces[a.cle]);
        if (!p) { manques[a.cle] += voulu(a) - positions[a.cle].length; continue; }
        positions[a.cle].push(p); posees.push(boiteDouble(p[0], p[1]));
      }
    }
    for (const a of agents) manques[a.cle] = Math.max(0, voulu(a) - positions[a.cle].length);
    return { positions, manques };
  }

  // ---- trajets ----
  // Cellule la plus proche (grille de PAS_CHEMIN) ; la grille est ancrée sur le coin du sol.
  function versCellule(p, z) { return [Math.round((p[0] - z[0]) / PAS_CHEMIN), Math.round((p[1] - z[1]) / PAS_CHEMIN)]; }
  function depuisCellule(c, z) { return [z[0] + c[0] * PAS_CHEMIN, z[1] + c[1] * PAS_CHEMIN]; }
  const marcheLibre = (x, y, interdits, ignore, z) => {
    const b = boiteMarcheur(x, y);
    if (!dedans(b, z)) return false;
    for (const o of interdits) { if (ignore && ignore.indexOf(o.id) >= 0) continue; if (secoupent(b, o.boite, 0)) return false; }
    return true;
  };
  function segmentLibre(p, q, interdits, ignore, z) {
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2));
    for (let i = 0; i <= n; i++) if (!marcheLibre(p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n, interdits, ignore, z)) return false;
    return true;
  }
  const VOISINS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  // Parcours en largeur de la grille depuis depart (obstacles : interdits, sauf ceux de ignore). but : cellule d'arrêt facultative.
  function explorer(depart, interdits, ignore, z, but) {
    const cols = Math.floor(z[2] / PAS_CHEMIN) + 1, lignes = Math.floor(z[3] / PAS_CHEMIN) + 1;
    const liste = interdits || [];
    const libre = (c) => c[0] >= 0 && c[1] >= 0 && c[0] < cols && c[1] < lignes && (() => { const p = depuisCellule(c, z); return marcheLibre(p[0], p[1], liste, ignore, z); })();
    const cle = (c) => c[1] * cols + c[0];
    const dep = versCellule(depart, z);
    const precedent = new Map([[cle(dep), null]]);
    const file = [dep];
    let trouve = false;
    for (let i = 0; i < file.length && !trouve; i++) {
      const c = file[i];
      for (const [dx, dy] of VOISINS) {
        const n = [c[0] + dx, c[1] + dy], k = cle(n);
        if (precedent.has(k) || !libre(n)) continue;
        if (dx && dy && (!libre([c[0] + dx, c[1]]) || !libre([c[0], c[1] + dy]))) continue; // pas de passage en diagonale entre deux obstacles
        precedent.set(k, c); file.push(n);
        if (but && n[0] === but[0] && n[1] === but[1]) { trouve = true; break; }
      }
    }
    return { precedent, cle, dep, cols, trouve };
  }
  // Cellules atteignables à pied depuis depart (le bureau de départ est traversable) ; sert à ne poser un double que là où il peut aller.
  function zoneAccessible(depart, interdits, ignore, sol) {
    const z = sol || SOL;
    const r = explorer(depart, interdits, ignore, z, null);
    return { cles: new Set(r.precedent.keys()), cle: r.cle };
  }
  // Un emplacement est accessible si une cellule voisine de son ancre l'est.
  function accessible(acces, p, z) {
    const c = versCellule(p, z);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (acces.cles.has(acces.cle([c[0] + dx, c[1] + dy]))) return true;
    return false;
  }
  // Point de départ d'un double : sur le siège de son agent.
  const depart = (a) => [a.cx, a.haut + 10];
  // Chemin (liste de points) de depart à arrivee, sans traverser d'obstacle. ignore : identifiants d'obstacles traversables (le bureau de départ).
  // Si aucun trajet n'existe : null (l'appelant fait alors apparaître le double sur place).
  function chemin(dep0, arrivee, interdits, ignore, sol) {
    const z = sol || SOL;
    if (!Array.isArray(dep0) || !Array.isArray(arrivee) || !dep0.every(fini) || !arrivee.every(fini)) return null;
    const liste = interdits || [];
    const arr = versCellule(arrivee, z);
    const r = explorer(dep0, liste, ignore, z, arr);
    if (!r.trouve && !(r.dep[0] === arr[0] && r.dep[1] === arr[1])) return null;
    const cellules = [];
    for (let c = arr; c; c = r.precedent.get(r.cle(c))) cellules.push(c);
    cellules.reverse();
    const pts = [dep0.slice(0, 2)].concat(cellules.slice(1, -1).map((c) => depuisCellule(c, z)), [arrivee.slice(0, 2)]);
    // Simplification : on saute les points intermédiaires tant que la ligne droite reste libre.
    const sortie = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !segmentLibre(pts[i], pts[j], liste, ignore, z)) j--;
      sortie.push(pts[j]); i = j;
    }
    return sortie;
  }
  function longueur(ch) {
    let l = 0;
    for (let i = 1; i < (ch || []).length; i++) l += Math.hypot(ch[i][0] - ch[i - 1][0], ch[i][1] - ch[i - 1][1]);
    return l;
  }
  // Point à la distance d le long du chemin (borné aux extrémités) ; retourne [x, y, sens] (sens : -1 gauche, 1 droite).
  function pointSur(ch, d) {
    if (!ch || !ch.length) return null;
    if (ch.length === 1 || !(d > 0)) return [ch[0][0], ch[0][1], 1];
    let reste = d;
    for (let i = 1; i < ch.length; i++) {
      const l = Math.hypot(ch[i][0] - ch[i - 1][0], ch[i][1] - ch[i - 1][1]);
      if (reste <= l || i === ch.length - 1) {
        const k = l > 0 ? Math.min(1, reste / l) : 1;
        return [ch[i - 1][0] + (ch[i][0] - ch[i - 1][0]) * k, ch[i - 1][1] + (ch[i][1] - ch[i - 1][1]) * k, ch[i][0] >= ch[i - 1][0] ? 1 : -1];
      }
      reste -= l;
    }
    const f = ch[ch.length - 1];
    return [f[0], f[1], 1];
  }

  return { SCENE, SOL, DOUBLE, MARCHEUR, MAX_PAR_AGENT, boiteDouble, boiteMarcheur, secoupent, rectBureau, obstacles, boiteLibre, meilleur, placer, zoneAccessible, depart, marcheLibre, chemin, longueur, pointSur };
});
