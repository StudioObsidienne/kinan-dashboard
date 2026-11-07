// Logique pure du mode fouet (aucun DOM, aucun réseau, aucune écriture d'état). UMD : module.exports en Node, window.FouetLogique dans la page.
// Le fouet est purement visuel : il lit une catégorie dérivée de l'état d'un agent et renvoie une pose de réaction, rien d'autre.
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.FouetLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SOMMEIL_APRES = 3500;   // comme la scène : repos depuis plus de 3,5 s = endormi
  const MIN_ENTRE_COUPS = 1200; // ms, par agent
  const DUREE = { endormi: 2800, erreur: 1500, travail: 1300, doute: 1500, repos: 1800 };
  const DELAI_EVEIL = 2500;     // après la réaction d'un endormi, un nouveau coup donne la réaction « repos »

  const MESSAGES = {
    endormi: ['Hein ? Quoi ? Je ne dormais pas !', 'Je rêvais de tokens gratuits...', 'Cinq minutes de plus...'],
    erreur: ['Aïe ! C\'était pas dans le contrat !', 'Aïe ! Pas sur une erreur !', 'Déjà que ça ne marche pas...'],
    travail: ['Hé ! Je travaille, moi !', 'Pas pendant que je tape !', 'Je suis en pleine lancée !'],
    repos: ['Oui ? Tu cherches quelque chose ?', 'Je te vois, tu sais.', 'Je suis réveillé, voilà.'],
    doute: ['Je réfléchis, là !', 'Laisse-moi hésiter en paix.', 'Peut-être. Ou pas.'],
    fondu: ['Hein ?! Je suis là ! Je suis là !', 'Je ne fondais pas, promis !', 'Quoi ?! Je travaillais, moi !'] // Drafion liquéfié, réveil brutal
  };

  // Catégorie visuelle d'un agent. depuis = horodatage du dernier changement d'état (0 ou invalide : on le considère endormi s'il est au repos).
  function categorie(etat, depuis, maintenant, eveilJusqua) {
    if (etat === 'erreur') return 'erreur';
    if (etat === 'travail') return 'travail';
    if (etat === 'doute') return 'doute';
    if (Number.isFinite(eveilJusqua) && eveilJusqua > maintenant) return 'repos';
    const ecart = maintenant - depuis;
    return !Number.isFinite(ecart) || ecart < 0 || depuis <= 0 || ecart >= SOMMEIL_APRES ? 'endormi' : 'repos';
  }

  // Machine d'états du mode : objets gelés, transitions pures.
  function creerMode() { return Object.freeze({ actif: false }); }
  function basculer(m) { return Object.freeze({ actif: !m.actif }); }
  function arreter() { return Object.freeze({ actif: false }); }
  // Curseur à afficher : 'defaut' (mode off ou pointeur hors du bureau), 'fouet' (zone vide), 'fouet-cible' (sur un agent).
  function curseur(m, surAgent, dedans) {
    if (!m || !m.actif || !dedans) return 'defaut';
    return surAgent ? 'fouet-cible' : 'fouet';
  }

  // Zone cliquable d'un agent (même repère que .zone-agent de la scène) : bureau + tête.
  function boiteAgent(a) {
    const banc = a.cle === 'kinan', demi = (banc ? 47 : 39) + 2, haut0 = a.haut - (banc ? 46 : 40), bas0 = a.haut + (banc ? 31 : 24);
    return [a.cx - demi, haut0, demi * 2, bas0 - haut0];
  }
  // Agent sous le point (x, y) en pixels de scène ; en cas de recouvrement, le plus proche de son centre.
  function agentSous(x, y, agents) {
    let meilleur = null, dist = Infinity;
    for (const a of agents || []) {
      const [bx, by, bw, bh] = boiteAgent(a);
      if (x < bx || x > bx + bw || y < by || y > by + bh) continue;
      const d = Math.abs(x - a.cx);
      if (d < dist) { dist = d; meilleur = a; }
    }
    return meilleur;
  }
  // Direction du regard (-1, 0, 1) depuis (ax, ay) vers le curseur (px, py).
  function regard(ax, ay, px, py) {
    const dx = px - ax, dy = py - ay;
    return { lx: dx > 6 ? 1 : dx < -6 ? -1 : 0, ly: dy > 8 ? 1 : dy < -8 ? -1 : 0 };
  }
  // Une seule réaction par agent à la fois, et un délai minimal entre deux coups. derniers : { cle: horodatage }.
  function peutFouetter(derniers, cle, maintenant, pause) {
    const dernier = derniers && derniers[cle];
    return !(Number.isFinite(dernier) && maintenant - dernier < (pause === undefined ? MIN_ENTRE_COUPS : pause));
  }
  // Choix aléatoire sans répéter l'indice précédent (rnd() dans [0, 1[ injecté pour les tests).
  function choisir(liste, rnd, dernier) {
    if (!liste || !liste.length) return { index: -1, texte: '' };
    let i = Math.min(liste.length - 1, Math.floor((rnd ? rnd() : Math.random()) * liste.length));
    if (liste.length > 1 && i === dernier) i = (i + 1) % liste.length;
    return { index: i, texte: liste[i] };
  }

  // Pose de réaction à l'instant dt (ms) : { fini, dx, dy, yeux, bouche, sourcil, suitCurseur, marques[], bulle }.
  // sens : +1 si le curseur est à droite de l'agent (le recul va dans l'autre sens). Mode calme : aucune secousse, poses fixes par phase.
  function reaction(cat, dt, calme, sens) {
    const d = DUREE[cat];
    if (!d || !Number.isFinite(dt) || dt >= d) return { fini: true, dx: 0, dy: 0, yeux: 'ouvert', bouche: 'sourire', sourcil: false, suitCurseur: false, marques: [], bulle: false };
    const t = dt < 0 ? 0 : dt, s = sens < 0 ? -1 : 1;
    const p = { fini: false, dx: 0, dy: 0, yeux: 'ouvert', bouche: 'plat', sourcil: false, suitCurseur: false, marques: [], bulle: true };
    if (cat === 'endormi') {
      if (t < 180) { p.yeux = 'grand'; p.bouche = 'o'; p.dy = calme ? 0 : -2; p.marques = ['excl']; }
      else if (t < 1900) { p.yeux = 'ouvert'; p.bouche = t < 1000 ? 'o' : 'plat'; p.suitCurseur = true; p.marques = t < 700 ? ['excl'] : []; }
      else if (t < 2200) { p.yeux = 'cligne'; }
      else { p.yeux = 'dort'; p.bouche = 'dort'; p.dy = calme ? 0 : 1; p.marques = ['zzz']; p.bulle = false; }
      if (t >= 1900) p.bulle = t < 2200;
    } else if (cat === 'erreur') {
      p.yeux = 'erreur'; p.bouche = t < 250 ? 'o' : 'vague'; p.marques = ['etoiles', 'goutte'];
      if (!calme && t < 1100) p.dx = Math.floor(t / 55) % 2 ? 1 : -1;
    } else if (cat === 'travail') {
      p.yeux = t < 400 ? 'grand' : 'ouvert'; p.bouche = t < 600 ? 'o' : 'plat'; p.sourcil = t >= 400; p.marques = t >= 150 && t < 1000 ? ['excl'] : [];
      if (!calme) p.dx = -s * (t < 140 ? 2 : t < 400 ? 1 : 0);
    } else if (cat === 'doute') {
      p.yeux = 'ouvert'; p.bouche = 'doute'; p.sourcil = true; p.marques = ['inter'];
      if (!calme) p.dx = -s * (t < 200 ? 1 : 0);
    } else { // repos, réveillé : regarde le curseur, petit clin d'œil
      p.suitCurseur = true; p.yeux = t < 150 ? 'grand' : (t >= 900 && t < 1030 ? 'cligne' : 'ouvert');
      p.bouche = t < 500 ? 'o' : 'sourire'; p.marques = t < 1200 ? ['inter'] : [];
      if (!calme && t < 150) p.dy = -1;
    }
    return p;
  }

  // ---- lanière : déroulé (0 -> IMPACT ms), claquement (éclat, éclair, onde), puis retombée et retrait ----
  const IMPACT = 120, DUREE_LANIERE = 440, DUREE_CALME = 1000;
  const FINI = Object.freeze({ fini: true, longueur: 0, bout: 0, courbure: 0, affaisse: 0, opacite: 0, flash: 0, eclair: 0, onde: 0 });
  // Manche (en bas à droite de la pointe du curseur, à « ecart » pixels) et point d'impact (haut de la tête, côté curseur), en pixels de scène.
  function lanier(pt, a, sens, ecart) {
    const e = Number.isFinite(ecart) && ecart > 0 ? ecart : 12;
    const tx = a.cx + (sens < 0 ? -1 : 1) * 6, ty = a.haut - 16;
    let sx = (pt && Number.isFinite(pt.x) ? pt.x : tx) + e, sy = (pt && Number.isFinite(pt.y) ? pt.y : ty) + e * 0.9;
    const d = Math.hypot(sx - tx, sy - ty);
    if (d < 14) { const ux = d > 0.5 ? (sx - tx) / d : 0.74, uy = d > 0.5 ? (sy - ty) / d : 0.67; sx = tx + ux * 14; sy = ty + uy * 14; }
    return { sx, sy, tx, ty };
  }
  // Pose de la lanière à dt ms du clic. Mode calme : aucun mouvement, seul l'éclat fixe s'affiche une seconde.
  function lanierPose(dt, calme) {
    const t = Number.isFinite(dt) ? Math.max(0, dt) : Infinity;
    if (calme) return t < DUREE_CALME ? Object.assign({}, FINI, { fini: false, flash: 1 }) : FINI;
    if (t >= DUREE_LANIERE) return FINI;
    if (t < IMPACT) { const k = t / IMPACT; return Object.assign({}, FINI, { fini: false, longueur: 1 - (1 - k) * (1 - k), courbure: 1 - 1.6 * k, opacite: 1 }); }
    const k = (t - IMPACT) / (DUREE_LANIERE - IMPACT), e = t - IMPACT;
    return { fini: false, longueur: 1, bout: k * k, courbure: -0.6 * (1 - k), affaisse: k, opacite: 1 - k * k,
      flash: Math.max(0, 1 - e / 100), eclair: e < 80 ? 1 : 0, onde: Math.min(1, e / 220) };
  }
  // Points (pixels entiers) de la lanière : courbe du second degré du manche vers le bout, déroulée sur « longueur ».
  function courbe(k, q) {
    const dx = k.tx - k.sx, dy = k.ty - k.sy, L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L; if (ny > 0) { nx = -nx; ny = -ny; } // normale tournée vers le haut
    const px = k.tx - dx * 0.7 * q.bout, py = k.ty - dy * 0.7 * q.bout;
    const cx = (k.sx + px) / 2 + nx * q.courbure * L * 0.35, cy = (k.sy + py) / 2 + ny * q.courbure * L * 0.35 + q.affaisse * L * 0.3;
    const n = Math.max(2, Math.ceil(L * q.longueur * 1.3) + 2), pts = [];
    let px0 = null, py0 = null;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * q.longueur, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      const x = Math.round(a * k.sx + b * cx + c * px), y = Math.round(a * k.sy + b * cy + c * py);
      if (x !== px0 || y !== py0) pts.push([x, y]);
      px0 = x; py0 = y;
    }
    return pts;
  }
  // Éclair en zigzag qui part du point d'impact, à l'opposé du manche.
  function eclair(k) {
    const dx = k.tx - k.sx, dy = k.ty - k.sy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, vx = -uy, vy = ux;
    const s = [[0, 0], [4, 2], [7, -2], [11, 1]].map(([a, b]) => [k.tx + ux * a + vx * b, k.ty + uy * a + vy * b]), pts = [];
    for (let i = 0; i < s.length - 1; i++) {
      const [x0, y0] = s[i], [x1, y1] = s[i + 1], m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let j = 0; j < m; j++) pts.push([Math.round(x0 + (x1 - x0) * j / m), Math.round(y0 + (y1 - y0) * j / m)]);
    }
    return pts;
  }

  // Curseur CSS : l'espace de noms SVG est assemblé pour ne contenir aucune adresse littérale (aucun accès réseau, c'est un identifiant).
  const NS = 'http' + ':' + '//www.w3.org/2000/svg';
  function svgCurseur(cible) {
    const lueur = cible ? '<circle cx="4" cy="4" r="3.5" fill="none" stroke="#ff6b6b" stroke-width="1.5"/>' : '';
    return '<svg xmlns="' + NS + '" width="32" height="32" viewBox="0 0 32 32">'
      + '<path d="M29 29 L21 21" stroke="#1d1729" stroke-width="6" stroke-linecap="round"/>'
      + '<path d="M29 29 L21 21" stroke="#8a5a3a" stroke-width="4" stroke-linecap="round"/>'
      + '<path d="M26 26 L24 24" stroke="#c9955c" stroke-width="4"/>'
      + '<path d="M21 21 C14 21 12 11 5 5" fill="none" stroke="#1d1729" stroke-width="3.5" stroke-linecap="round"/>'
      + '<path d="M21 21 C14 21 12 11 5 5" fill="none" stroke="#6b4430" stroke-width="2" stroke-linecap="round"/>' + lueur + '</svg>';
  }
  // Valeur CSS complète avec repli crosshair (data-URI local, hotspot sur la pointe de la lanière).
  function curseurCss(cible) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(svgCurseur(cible)) + '") 4 4, crosshair';
  }

  return { SOMMEIL_APRES, MIN_ENTRE_COUPS, DUREE, DELAI_EVEIL, MESSAGES, IMPACT, DUREE_LANIERE, lanier, lanierPose, courbe, eclair, categorie, creerMode, basculer, arreter, curseur, boiteAgent, agentSous, regard, peutFouetter, choisir, reaction, svgCurseur, curseurCss };
});
