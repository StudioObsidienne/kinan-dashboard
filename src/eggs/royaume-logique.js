// Paramètres du royaume : logique pure (aucun DOM, aucun réseau, aucune écriture d'état agents).
// Ne concerne que la présentation du bureau : décoration, emplacement des objets décoratifs, thèmes, ambiances, effets.
// UMD : module.exports en Node, window.RoyaumeLogique dans la page. Persistance : une seule clé de stockage (CLE), gérée par royaume.js.
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.RoyaumeLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CLE = 'kinan-os.egg.royaume';
  const VERSION = 2;
  const SCENE = Object.freeze({ W: 400, H: 270, DY: 18 });

  // ---- catalogue des choix : [identifiant, libellé]. Le premier est toujours la valeur d'origine. ----
  const CATALOGUE = Object.freeze({
    plante: Object.freeze([['origine', 'Plante d\'origine'], ['cactus', 'Cactus fleuri'], ['fleurs', 'Tulipes'], ['bonsai', 'Bonsaï'], ['palmier', 'Palmier nain']]),
    tableau: Object.freeze([['origine', 'Logo ou paysage d\'origine'], ['montagne', 'Montagne au soleil'], ['mer', 'Mer et voilier'], ['nuit', 'Ciel étoilé'], ['abstrait', 'Formes colorées'], ['portrait', 'Silhouette']]),
    lampe: Object.freeze([['origine', 'Dorée'], ['rose', 'Rose'], ['bleu', 'Bleue'], ['vert', 'Verte'], ['blanc', 'Blanche']]),
    rideaux: Object.freeze([['origine', 'Rose d\'origine'], ['bleu', 'Bleu nuit'], ['vert', 'Vert sauge'], ['or', 'Or'], ['creme', 'Crème'], ['violet', 'Violet']]),
    ciel: Object.freeze([['auto', 'Selon l\'heure'], ['aube', 'Aube'], ['jour', 'Plein jour'], ['soir', 'Soir'], ['nuit', 'Nuit étoilée']]),
    bureau: Object.freeze([['aucun', 'Aucun'], ['cactus', 'Mini-cactus'], ['hibou', 'Hibou'], ['sablier', 'Sablier'], ['trophee', 'Trophée'], ['assortis', 'Assortis']]),
    tapis: Object.freeze([['origine', 'Violet d\'origine'], ['bordeaux', 'Bordeaux'], ['bleu', 'Bleu'], ['vert', 'Vert'], ['gris', 'Gris']]),
    theme: Object.freeze([['origine', 'Aubergine d\'origine'], ['foret', 'Forêt'], ['ocean', 'Océan'], ['braise', 'Braise'], ['sable', 'Sable'], ['minuit', 'Minuit']]),
    ambiance: Object.freeze([['naturelle', 'Naturelle'], ['chaude', 'Chaude'], ['froide', 'Froide'], ['doree', 'Heure dorée'], ['tamisee', 'Tamisée'], ['neon', 'Néon']]),
    particules: Object.freeze([['aucune', 'Aucune'], ['poussiere', 'Poussière dans la lumière'], ['lucioles', 'Lucioles'], ['flocons', 'Flocons']]),
    lueur: Object.freeze([['aucune', 'Aucune'], ['douce', 'Douce'], ['vive', 'Vive']])
  });
  const CHOIX = Object.freeze(Object.keys(CATALOGUE));
  const ids = (cle) => CATALOGUE[cle].map((c) => c[0]);
  const IDS_BUREAU_PAR = CATALOGUE.bureau.map((c) => c[0]).concat(['defaut']); // choix par agent : « defaut » = le choix général

  // Décors murales ajoutables ; 4 variantes de couleurs chacune.
  const MURALES = Object.freeze(['fanion', 'ecusson', 'cadre']);
  const NB_VARIANTES = 4;
  const LIBELLES = Object.freeze({
    plante: 'Plante', tableau: 'Tableau', horloge: 'Horloge', panneau: 'Panneau de liège',
    fanion: 'Fanion', ecusson: 'Écusson', cadre: 'Petit cadre'
  });
  // Noms des zones cliquables créées par objets.js (egg-core : deplacerZone).
  const ZONE_DE = Object.freeze({ plante: 'Plante', tableau: 'Tableau', horloge: 'Horloge', panneau: 'Panneau de liège' });

  // ---- objets déplaçables : taille visuelle [largeur, hauteur], boîte d'origine, régions autorisées ----
  // Régions (pixels de scène) : le mur au-dessus de la plinthe (sous la guirlande), le lambris, le sol.
  const REGIONS = Object.freeze({
    mur: Object.freeze([4, 14, 392, 46]),
    lambris: Object.freeze([4, 63, 392, 21]),
    sol: Object.freeze([4, 88, 392, 162])
  });
  const OBJETS = Object.freeze({
    plante: Object.freeze({ taille: [26, 32], defaut: [117, 128], zones: ['sol'], existant: true }),
    tableau: Object.freeze({ taille: [40, 32], defaut: [129, 15], zones: ['mur'], existant: true }),
    horloge: Object.freeze({ taille: [28, 28], defaut: [186, 18], zones: ['mur'], existant: true }),
    panneau: Object.freeze({ taille: [48, 34], defaut: [231, 15], zones: ['mur'], existant: true }),
    fanion: Object.freeze({ taille: [16, 12], defaut: null, zones: ['lambris', 'mur'], existant: false }),
    ecusson: Object.freeze({ taille: [12, 14], defaut: null, zones: ['lambris', 'mur'], existant: false }),
    cadre: Object.freeze({ taille: [16, 14], defaut: null, zones: ['lambris', 'mur'], existant: false })
  });
  const EXISTANTS = Object.freeze(Object.keys(OBJETS).filter((k) => OBJETS[k].existant));

  // Zones fixes à ne jamais recouvrir : fenêtre et rideaux, étagère, lampadaire, enseigne TOKEN OUT, boutons cachés des autres modules.
  const FIXES = Object.freeze([
    [10, 5, 108, 58],     // fenêtre, rideaux, bouton « Paramètres du royaume »
    [286, 10, 102, 54],   // étagère, livres, liane
    [256, 94, 26, 70],    // lampadaire
    [116, 60, 168, 40],   // enseigne TOKEN OUT (quand elle tombe)
    [176, 32, 10, 10],    // bouton secret de la chasse
    [214, 17, 16, 32]     // fouet caché
  ].map(Object.freeze));

  const entier = (v) => typeof v === 'number' && Number.isFinite(v);
  const cleAgentValide = (k) => typeof k === 'string' && /^[a-z0-9_-]{1,24}$/i.test(k);
  const arrondi = (v) => Math.round(v);

  // ---- géométrie ----
  function rectsSeCoupent(a, b, marge) {
    const m = marge || 0;
    return a[0] < b[0] + b[2] + m && b[0] < a[0] + a[2] + m && a[1] < b[1] + b[3] + m && b[1] < a[1] + a[3] + m;
  }
  // Bureau d'un agent (tête, plateau, chaise), même repère que les zones cliquables de scene.js ; moniteurs inclus.
  function rectAgent(a) {
    const banc = a.cle === 'kinan';
    const demi = (banc ? 47 : 39) + 2, haut0 = a.haut - (banc ? 46 : 40), bas0 = a.haut + (banc ? 31 : 24);
    return [a.cx - demi, haut0, demi * 2, bas0 - haut0];
  }
  function interdits(agents) {
    const liste = FIXES.slice();
    if (Array.isArray(agents)) for (const a of agents) if (a && entier(a.cx) && entier(a.haut)) liste.push(rectAgent(a));
    return liste;
  }
  const taille = (id) => OBJETS[id].taille;
  const rectDe = (id, x, y) => [x, y, taille(id)[0], taille(id)[1]];
  function dansUneRegion(id, x, y) {
    const [w, h] = taille(id);
    return OBJETS[id].zones.some((z) => { const r = REGIONS[z]; return x >= r[0] && y >= r[1] && x + w <= r[0] + r[2] && y + h <= r[1] + r[3]; });
  }

  // Positions effectives (coin haut gauche) des objets actifs : défaut de l'objet, ou position enregistrée.
  function positionDe(cfg, id) {
    const p = cfg && cfg.positions ? cfg.positions[id] : null;
    if (Array.isArray(p) && entier(p[0]) && entier(p[1])) return [p[0], p[1]];
    return OBJETS[id].defaut ? OBJETS[id].defaut.slice() : null;
  }
  const murActif = (cfg, id) => !!(cfg && cfg.murales && cfg.murales[id] && cfg.murales[id].actif);
  function actifs(cfg) { return EXISTANTS.concat(MURALES.filter((id) => murActif(cfg, id))); }

  // L'emplacement (x, y) est-il valable pour l'objet id ? Tient compte des zones fixes, des agents et des autres objets actifs.
  function emplacementValide(cfg, id, x, y, agents, marge) {
    if (!OBJETS[id] || !entier(x) || !entier(y)) return false;
    if (!dansUneRegion(id, x, y)) return false;
    const r = rectDe(id, x, y);
    if (interdits(agents).some((f) => rectsSeCoupent(r, f))) return false;
    for (const autre of actifs(cfg)) {
      if (autre === id) continue;
      const p = positionDe(cfg, autre);
      if (p && rectsSeCoupent(r, rectDe(autre, p[0], p[1]), marge || 0)) return false;
    }
    return true;
  }
  // Ramène (x, y) dans la région autorisée la plus proche (entiers). Ne vérifie pas les collisions.
  function borner(id, x, y) {
    if (!OBJETS[id]) return null;
    const [w, h] = taille(id);
    let meilleur = null;
    for (const z of OBJETS[id].zones) {
      const r = REGIONS[z];
      const cx = Math.min(Math.max(arrondi(entier(x) ? x : r[0]), r[0]), r[0] + r[2] - w);
      const cy = Math.min(Math.max(arrondi(entier(y) ? y : r[1]), r[1]), r[1] + r[3] - h);
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (!meilleur || d < meilleur.d) meilleur = { x: cx, y: cy, d };
    }
    return meilleur ? [meilleur.x, meilleur.y] : null;
  }
  // Premier emplacement libre (balayage de haut en bas dans l'ordre des zones de l'objet), avec une marge entre objets.
  function chercherLibre(cfg, id, agents) {
    if (!OBJETS[id]) return null;
    const [w, h] = taille(id);
    for (const z of OBJETS[id].zones) {
      const r = REGIONS[z];
      for (let y = r[1]; y + h <= r[1] + r[3]; y += 2) for (let x = r[0]; x + w <= r[0] + r[2]; x += 2) {
        if (emplacementValide(cfg, id, x, y, agents, 4)) return [x, y];
      }
    }
    return null;
  }

  // ---- configuration ----
  function configDefaut() {
    const c = { v: VERSION, positions: {}, murales: {}, masques: [], bureauPar: {} };
    for (const k of CHOIX) c[k] = CATALOGUE[k][0][0];
    for (const m of MURALES) c.murales[m] = { actif: false, variante: 0 };
    return c;
  }
  const estDefaut = (cfg) => JSON.stringify(valider(cfg)) === JSON.stringify(configDefaut());

  // Nettoie n'importe quelle valeur lue (JSON corrompu, ancienne version, valeurs hors catalogue) : renvoie toujours une configuration saine.
  function valider(brut, agents) {
    const b = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
    const cfg = configDefaut();
    for (const k of CHOIX) if (typeof b[k] === 'string' && ids(k).includes(b[k])) cfg[k] = b[k];
    const bm = b.murales && typeof b.murales === 'object' ? b.murales : {};
    for (const m of MURALES) {
      const e = bm[m];
      if (e && typeof e === 'object') {
        cfg.murales[m].actif = e.actif === true;
        if (Number.isInteger(e.variante) && e.variante >= 0 && e.variante < NB_VARIANTES) cfg.murales[m].variante = Math.floor(e.variante);
      }
    }
    // Agents masqués (affichage seulement) : identifiants simples, sans doublon, jamais le juge, 12 au plus.
    if (Array.isArray(b.masques)) for (const k of b.masques) if (cleAgentValide(k) && k !== 'kinan' && !cfg.masques.includes(k) && cfg.masques.length < 12) cfg.masques.push(k);
    // Objet de bureau par agent : « defaut » = le choix général, sinon un objet du catalogue.
    const bp0 = b.bureauPar && typeof b.bureauPar === 'object' && !Array.isArray(b.bureauPar) ? b.bureauPar : {};
    for (const k of Object.keys(bp0).slice(0, 12)) if (cleAgentValide(k) && typeof bp0[k] === 'string' && bp0[k] !== 'defaut' && IDS_BUREAU_PAR.includes(bp0[k])) cfg.bureauPar[k] = bp0[k];
    // Positions : acceptées une à une, seulement entières, dans leur région, sans collision avec ce qui est déjà accepté.
    const bp = b.positions && typeof b.positions === 'object' ? b.positions : {};
    const ordre = EXISTANTS.concat(MURALES.filter((m) => cfg.murales[m].actif));
    for (const id of ordre) {
      const p = bp[id];
      if (!Array.isArray(p) || p.length !== 2 || !entier(p[0]) || !entier(p[1]) || p[0] !== arrondi(p[0]) || p[1] !== arrondi(p[1])) continue;
      if (OBJETS[id].defaut && p[0] === OBJETS[id].defaut[0] && p[1] === OBJETS[id].defaut[1]) continue; // identique à l'origine : inutile
      if (emplacementValide(cfg, id, p[0], p[1], agents)) cfg.positions[id] = [p[0], p[1]];
    }
    // Décors murales actives sans emplacement valable : on cherche un coin libre, sinon on les désactive.
    for (const m of MURALES) {
      if (!cfg.murales[m].actif) continue;
      const p = cfg.positions[m];
      if (p && emplacementValide(cfg, m, p[0], p[1], agents)) continue;
      delete cfg.positions[m];
      const libre = chercherLibre(cfg, m, agents);
      if (libre) cfg.positions[m] = libre; else cfg.murales[m].actif = false;
    }
    return cfg;
  }
  function serialiser(cfg) { return JSON.stringify(valider(cfg)); }
  function deserialiser(texte, agents) {
    if (typeof texte !== 'string' || texte.length === 0 || texte.length > 20000) return valider(null, agents);
    try { return valider(JSON.parse(texte), agents); } catch { return valider(null, agents); }
  }
  const reinitialiser = configDefaut;
  const copie = (cfg) => JSON.parse(JSON.stringify(cfg));

  // ---- changements purs : renvoient { cfg, ok } sans modifier l'entrée ----
  function choisir(cfg, cle, valeur, agents) {
    if (!CHOIX.includes(cle) || !ids(cle).includes(valeur)) return { cfg, ok: false };
    const n = copie(cfg); n[cle] = valeur;
    return { cfg: valider(n, agents), ok: true };
  }
  function activerMurale(cfg, id, actif, agents) {
    if (!MURALES.includes(id)) return { cfg, ok: false };
    const n = copie(cfg); n.murales[id].actif = !!actif;
    if (!actif) delete n.positions[id];
    const v = valider(n, agents);
    return { cfg: v, ok: v.murales[id].actif === !!actif }; // refus si aucun emplacement libre
  }
  function varianteMurale(cfg, id, variante, agents) {
    if (!MURALES.includes(id) || !Number.isInteger(variante) || variante < 0 || variante >= NB_VARIANTES) return { cfg, ok: false };
    const n = copie(cfg); n.murales[id].variante = Math.floor(variante);
    return { cfg: valider(n, agents), ok: true };
  }
  // Déplace l'objet vers (x, y) : borné à sa région, refusé si collision. Mode « glissant » : en cas de collision, essaie
  // de ne bouger que sur un axe, pour longer un obstacle pendant un glisser-déposer.
  function deplacer(cfg, id, x, y, agents) {
    if (!OBJETS[id] || !actifs(cfg).includes(id) || !entier(x) || !entier(y)) return { cfg, ok: false, x: null, y: null };
    const cible = borner(id, x, y);
    const cur = positionDe(cfg, id);
    const essais = [cible];
    if (cur) { const bx = borner(id, x, cur[1]), by = borner(id, cur[0], y); if (bx) essais.push(bx); if (by) essais.push(by); }
    for (const e of essais) {
      if (!e) continue;
      if (cur && e[0] === cur[0] && e[1] === cur[1] && !(cible && cible[0] === cur[0] && cible[1] === cur[1])) continue; // aucun mouvement réel : refus
      if (emplacementValide(cfg, id, e[0], e[1], agents)) {
        const n = copie(cfg);
        if (OBJETS[id].defaut && e[0] === OBJETS[id].defaut[0] && e[1] === OBJETS[id].defaut[1]) delete n.positions[id]; else n.positions[id] = [e[0], e[1]];
        return { cfg: n, ok: true, x: e[0], y: e[1] };
      }
    }
    return { cfg, ok: false, x: cur ? cur[0] : null, y: cur ? cur[1] : null };
  }
  function deplacerDe(cfg, id, dx, dy, agents) {
    const cur = OBJETS[id] ? positionDe(cfg, id) : null;
    if (!cur || !entier(dx) || !entier(dy)) return { cfg, ok: false, x: null, y: null };
    return deplacer(cfg, id, cur[0] + dx, cur[1] + dy, agents);
  }
  // Décalages (par rapport à l'origine) des objets d'origine : ce que scene.js et les zones cliquables doivent appliquer.
  function decalages(cfg) {
    const d = {};
    for (const id of EXISTANTS) {
      const p = positionDe(cfg, id), o = OBJETS[id].defaut;
      d[id] = [p[0] - o[0], p[1] - o[1]];
    }
    return d;
  }

  // ---- glisser-déposer libre : aperçu, dépose, emplacements nommés ----
  // Aperçu d'une position visée (x, y) : { valide, x, y (ramenés à la zone), raison } ; raison : « zone » (hors des zones permises),
  // « fixe » (fenêtre, étagère, lampadaire, bureau, bouton caché…), « objet » (un autre objet), « position » (valeur invalide).
  function apercu(cfg, id, x, y, agents) {
    if (!OBJETS[id] || !entier(x) || !entier(y)) return { valide: false, x: null, y: null, raison: 'position' };
    const b = borner(id, x, y), ex = b[0], ey = b[1];
    let raison = null;
    if (ex !== arrondi(x) || ey !== arrondi(y)) raison = 'zone';
    const r = rectDe(id, ex, ey);
    if (!raison && interdits(agents).some((f) => rectsSeCoupent(r, f))) raison = 'fixe';
    if (!raison) for (const autre of actifs(cfg)) {
      if (autre === id) continue;
      const p = positionDe(cfg, autre);
      if (p && rectsSeCoupent(r, rectDe(autre, p[0], p[1]))) { raison = 'objet'; break; }
    }
    if (!raison && !dansUneRegion(id, ex, ey)) raison = 'zone';
    return { valide: !raison, x: ex, y: ey, raison };
  }
  // Emplacement valide le plus proche de (x, y) dans un rayon (pixels de scène) ; null si rien.
  function plusProche(cfg, id, x, y, agents, rayon) {
    if (!OBJETS[id] || !entier(x) || !entier(y)) return null;
    const max = Number.isFinite(rayon) ? Math.min(60, Math.max(0, rayon)) : 16;
    const b0 = borner(id, x, y);
    let meilleur = null;
    for (let dy = -max; dy <= max; dy++) for (let dx = -max; dx <= max; dx++) {
      const d = dx * dx + dy * dy;
      if (d > max * max || (meilleur && d >= meilleur.d)) continue;
      const cx = b0[0] + dx, cy = b0[1] + dy;
      if (emplacementValide(cfg, id, cx, cy, agents, 0)) meilleur = { x: cx, y: cy, d };
    }
    return meilleur ? [meilleur.x, meilleur.y] : null;
  }
  // Dépose à (x, y) : exacte si valide, sinon sur l'emplacement valide le plus proche (rayon 14), sinon refus. Aucune position stockée si c'est l'origine.
  function deposer(cfg, id, x, y, agents) {
    if (!OBJETS[id] || !actifs(cfg).includes(id) || !entier(x) || !entier(y)) return { cfg, ok: false, x: null, y: null, raison: 'position' };
    const ap = apercu(cfg, id, x, y, agents);
    const cible = ap.valide ? [ap.x, ap.y] : plusProche(cfg, id, x, y, agents, 14);
    if (!cible) return { cfg, ok: false, x: ap.x, y: ap.y, raison: ap.raison };
    const n = copie(cfg);
    if (OBJETS[id].defaut && cible[0] === OBJETS[id].defaut[0] && cible[1] === OBJETS[id].defaut[1]) delete n.positions[id]; else n.positions[id] = [cible[0], cible[1]];
    return { cfg: n, ok: true, x: cible[0], y: cible[1], raison: null, ajuste: !ap.valide };
  }
  // Zones où l'objet peut se poser (régions), et rectangles à éviter (pour l'aperçu à l'écran).
  const zonesPermises = (id) => (OBJETS[id] ? OBJETS[id].zones.map((z) => REGIONS[z].slice()) : []);
  function rectsEvites(cfg, id, agents) {
    const l = interdits(agents).map((r) => r.slice());
    for (const autre of actifs(cfg)) { if (autre === id) continue; const p = positionDe(cfg, autre); if (p) l.push(rectDe(autre, p[0], p[1])); }
    return l;
  }
  // Emplacements nommés pour les décors murales (liste déroulante) : rectangles de recherche.
  const EMPLACEMENTS = Object.freeze({
    'lambris-gauche': Object.freeze([4, 63, 112, 21]), 'lambris-centre': Object.freeze([116, 63, 168, 21]), 'lambris-droite': Object.freeze([284, 63, 112, 21]),
    'mur-centre': Object.freeze([118, 14, 168, 46])
  });
  const LIBELLES_EMPLACEMENTS = Object.freeze({ 'lambris-gauche': 'Lambris, à gauche', 'lambris-centre': 'Lambris, au centre', 'lambris-droite': 'Lambris, à droite', 'mur-centre': 'Mur, entre les cadres' });
  function placerDans(cfg, id, nomZone, agents) {
    const z = EMPLACEMENTS[nomZone];
    if (!z || !MURALES.includes(id) || !murActif(cfg, id)) return { cfg, ok: false };
    const [w, h] = taille(id);
    for (const marge of [4, 0]) for (let y = z[1]; y + h <= z[1] + z[3]; y += 2) for (let x = z[0]; x + w <= z[0] + z[2]; x += 2) {
      if (emplacementValide(cfg, id, x, y, agents, marge)) { const n = copie(cfg); n.positions[id] = [x, y]; return { cfg: n, ok: true, x, y }; }
    }
    return { cfg, ok: false };
  }
  // ---- agents au bureau (affichage seulement) et objets de bureau par écran ----
  const SERIE = Object.freeze(['cactus', 'hibou', 'sablier', 'trophee']);
  function agentVisible(cfg, cle) { return !(cfg && Array.isArray(cfg.masques) && cfg.masques.includes(cle)); }
  function masquerAgent(cfg, cle, masque, agents) {
    if (!cleAgentValide(cle) || cle === 'kinan') return { cfg, ok: false };
    const n = copie(cfg);
    n.masques = (n.masques || []).filter((k) => k !== cle);
    if (masque) n.masques.push(cle);
    return { cfg: valider(n, agents), ok: true };
  }
  // Objet de bureau effectif d'un agent (rang : sa place dans la liste, pour « assortis »).
  function bureauDe(cfg, cle, rang) {
    const c = cfg || configDefaut(), p = c.bureauPar && c.bureauPar[cle];
    const nom = p && p !== 'defaut' ? p : c.bureau;
    return nom === 'assortis' ? SERIE[(((rang | 0) % SERIE.length) + SERIE.length) % SERIE.length] : nom;
  }
  function choisirBureau(cfg, cle, valeur, agents) {
    if (!cleAgentValide(cle) || !IDS_BUREAU_PAR.includes(valeur)) return { cfg, ok: false };
    const n = copie(cfg); n.bureauPar = n.bureauPar || {};
    if (valeur === 'defaut') delete n.bureauPar[cle]; else n.bureauPar[cle] = valeur;
    return { cfg: valider(n, agents), ok: true };
  }

  // ---- ciel, lampe, rideaux, tapis, thèmes (données de rendu) ----
  const HEURES = Object.freeze({ auto: null, aube: 7, jour: 12, soir: 19, nuit: 23 });
  const LAMPES = Object.freeze({
    origine: null,
    rose: Object.freeze({ a: '#f2a0b8', b: '#ffd0de', c: '#c9708c', lueur: '#ff9fbd' }),
    bleu: Object.freeze({ a: '#8fb4f0', b: '#d0e2ff', c: '#5f86c4', lueur: '#8fb8ff' }),
    vert: Object.freeze({ a: '#8fd0a0', b: '#d0f2d8', c: '#5fa275', lueur: '#9fe8b4' }),
    blanc: Object.freeze({ a: '#ece8f2', b: '#ffffff', c: '#b8b2c8', lueur: '#f4f0ff' })
  });
  const RIDEAUX = Object.freeze({ bleu: '#34508f', vert: '#5f8a64', or: '#d4a437', creme: '#e8dcc0', violet: '#7a4fb0' });
  const TAPIS = Object.freeze({ bordeaux: '#8a2f45', bleu: '#2f4f8a', vert: '#2f7a52', gris: '#6b6b78' });
  // Teintes appliquées au décor fixe en mode « color » (la luminosité du dessin est conservée) : [couleur, opacité].
  const THEMES = Object.freeze({
    origine: null,
    foret: Object.freeze({ mur: ['#3f8f5a', 0.42], sol: ['#6a8a3c', 0.3], tapis: ['#2f7a5a', 0.55] }),
    ocean: Object.freeze({ mur: ['#3a78c0', 0.42], sol: ['#4a7a9a', 0.28], tapis: ['#2f5f9a', 0.55] }),
    braise: Object.freeze({ mur: ['#c8502e', 0.4], sol: ['#b8602e', 0.3], tapis: ['#a8342e', 0.55] }),
    sable: Object.freeze({ mur: ['#d0a860', 0.45], sol: ['#c8a060', 0.3], tapis: ['#b8884c', 0.55] }),
    minuit: Object.freeze({ mur: ['#2a2f8a', 0.5], sol: ['#2a3070', 0.35], tapis: ['#3a3a9a', 0.55] })
  });
  const RECT_MUR = Object.freeze([0, 0, SCENE.W, 86 + SCENE.DY]);                       // mur, lambris et plinthe (pixels du canevas, DY inclus)
  const RECT_SOL = Object.freeze([0, 86 + SCENE.DY, SCENE.W, SCENE.H - 86 - SCENE.DY]);
  const RECT_TAPIS = Object.freeze([26, 166 + SCENE.DY, 348, 70]);
  // Calques de couleur à poser sur le décor fixe, dans l'ordre : thème, tapis, rideaux (pixels du canevas).
  function couchesFond(cfg) {
    const l = [], c = cfg || configDefaut();
    const th = THEMES[c.theme];
    if (th) {
      l.push({ nom: 'mur', rect: RECT_MUR.slice(), couleur: th.mur[0], alpha: th.mur[1] });
      l.push({ nom: 'sol', rect: RECT_SOL.slice(), couleur: th.sol[0], alpha: th.sol[1] });
      l.push({ nom: 'tapis', rect: RECT_TAPIS.slice(), couleur: th.tapis[0], alpha: th.tapis[1] });
    }
    if (TAPIS[c.tapis]) l.push({ nom: 'tapis', rect: RECT_TAPIS.slice(), couleur: TAPIS[c.tapis], alpha: 0.85 });
    if (RIDEAUX[c.rideaux]) for (const x0 of [12, 104]) {
      l.push({ nom: 'rideau', rect: [x0, 7 + SCENE.DY, 12, 56], couleur: RIDEAUX[c.rideaux], alpha: 1, embrasse: [x0 + 2, 34 + SCENE.DY, 8, 2] });
    }
    return l;
  }
  // Ambiances lumineuses : voile de couleur [r, g, b, alpha], vignette (assombrissement des bords), halos latéraux (néon).
  const AMBIANCES = Object.freeze({
    naturelle: null,
    chaude: Object.freeze({ voile: [255, 160, 70, 0.09], vignette: 0.16 }),
    froide: Object.freeze({ voile: [90, 140, 255, 0.1], vignette: 0.14 }),
    doree: Object.freeze({ voile: [255, 205, 100, 0.1], vignette: 0.1 }),
    tamisee: Object.freeze({ voile: [10, 8, 28, 0.1], vignette: 0.34 }),
    neon: Object.freeze({ voile: [20, 10, 40, 0.05], vignette: 0.14, halos: Object.freeze([[255, 60, 190, 0.14], [60, 220, 255, 0.14]]) })
  });
  const LUEURS = Object.freeze({ aucune: 0, douce: 0.07, vive: 0.14 });

  // ---- particules : petite simulation déterministe (graine), indépendante de la cadence ----
  // Repère : pixels de scène (x de 0 à W, y de -DY à H - DY, comme KinanEquipe). z : profondeur (0 loin, 1 près) ;
  // elle règle la taille, la vitesse, la transparence et l'amplitude de la parallaxe. La vue (royaume.js) ne fait que dessiner.
  const NB_PARTICULES = 44;
  const TYPES_PARTICULES = Object.freeze(['poussiere', 'lucioles', 'flocons']);
  const BORNES = Object.freeze({ x0: 0, x1: SCENE.W, y0: -SCENE.DY, y1: SCENE.H - SCENE.DY });
  const bornee = (v, a, b) => Math.min(b, Math.max(a, v));
  function prng(graine) { // mulberry32
    let a = (graine | 0) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Zone de départ selon le type : la poussière suit le faisceau de la fenêtre, les lucioles flânent au sol, les flocons tombent partout.
  function creerParticules(type, n, graine) {
    if (!TYPES_PARTICULES.includes(type)) return [];
    const nb = Math.max(0, Math.min(120, Math.floor(Number.isFinite(n) ? n : NB_PARTICULES)));
    const rnd = prng(graine === undefined ? 20261107 : graine), l = [];
    for (let i = 0; i < nb; i++) {
      const z = 0.15 + 0.85 * rnd(), p = { x: 0, y: 0, z, ph: rnd() * 6.2832, ang: rnd() * 6.2832, bx: 0, by: 0, f: 0.7 + rnd() * 0.6 };
      if (type === 'poussiere') {
        if (rnd() < 0.7) { const k = rnd(), s = (rnd() - 0.5) * (22 + k * 30); p.x = 62 + k * 110 + s * 0.6; p.y = 30 + k * 100 - s * 0.8; } else { p.x = 20 + rnd() * 250; p.y = 6 + rnd() * 140; }
        p.bx = 1.5 + rnd() * 3.5; p.by = -0.6 + rnd() * 1.6;
      } else if (type === 'lucioles') {
        p.x = 12 + rnd() * (SCENE.W - 24); p.y = 92 + rnd() * 150; p.bx = 7 + rnd() * 9;
      } else { // flocons
        p.x = rnd() * SCENE.W; p.y = BORNES.y0 + rnd() * (BORNES.y1 - BORNES.y0); p.by = 9 + rnd() * 17; p.bx = (rnd() - 0.5) * 4;
      }
      p.x = bornee(p.x, BORNES.x0, BORNES.x1); p.y = bornee(p.y, BORNES.y0, BORNES.y1);
      l.push(p);
    }
    return l;
  }
  // Avance toutes les particules de dtMs (borné à 64 ms : après une pause, pas de saut). t : horloge en ms. Modifie la liste et la retourne.
  function avancer(ps, type, dtMs, tMs) {
    const dt = bornee(Number.isFinite(dtMs) ? dtMs : 0, 0, 64) / 1000, t = Number.isFinite(tMs) ? tMs : 0;
    if (!Array.isArray(ps) || !TYPES_PARTICULES.includes(type)) return ps;
    for (const p of ps) {
      const v = 0.45 + 0.75 * p.z; // les plus proches vont plus vite
      if (type === 'poussiere') {
        p.x += (p.bx + Math.sin(t / 2300 + p.ph) * 2.4) * v * dt;
        p.y += (p.by + Math.cos(t / 3100 + p.ph * 1.3) * 1.8) * v * dt;
        if (p.x > 290) p.x = 10; if (p.x < 6) p.x = 286;
        if (p.y > 150) p.y = 10; if (p.y < 6) p.y = 146;
      } else if (type === 'lucioles') {
        p.ang += Math.sin(t / 1400 + p.ph * 2) * 1.6 * dt + Math.cos(t / 3700 + p.ph) * 0.6 * dt;
        p.x += Math.cos(p.ang) * p.bx * v * dt; p.y += Math.sin(p.ang) * p.bx * 0.55 * v * dt;
        if (p.x < 8 || p.x > SCENE.W - 8) { p.ang = Math.PI - p.ang; p.x = bornee(p.x, 8, SCENE.W - 8); }
        if (p.y < 92 || p.y > 242) { p.ang = -p.ang; p.y = bornee(p.y, 92, 242); }
      } else {
        p.y += p.by * v * dt;
        p.x += (p.bx + Math.sin(t / 1700 + p.ph) * 5) * v * dt;
        if (p.y > BORNES.y1 + 3) { p.y = BORNES.y0 - 3; p.x = bornee(p.x, 0, SCENE.W); }
        if (p.x > SCENE.W + 3) p.x = -3; if (p.x < -3) p.x = SCENE.W + 3;
      }
    }
    return ps;
  }
  // Aspect d'une particule : { x, y, r (rayon de scène), a (opacité 0..1), halo (0..1 : intensité de la lueur) }. calme : figé (aucun scintillement).
  function rendu(p, type, tMs, calme) {
    const t = calme || !Number.isFinite(tMs) ? 0 : tMs;
    let r, a, halo;
    if (type === 'poussiere') { r = 0.5 + 0.9 * p.z; a = (0.18 + 0.5 * p.z) * (calme ? 0.85 : 0.65 + 0.35 * Math.sin(t / 1300 + p.ph)); halo = 0.35 * p.z; }
    else if (type === 'lucioles') { const pulse = calme ? 0.7 : Math.pow(Math.max(0, Math.sin(t / 900 * p.f + p.ph * 2.3)), 2); r = 0.7 + 0.8 * p.z; a = 0.12 + 0.88 * pulse * (0.5 + 0.5 * p.z); halo = 0.9 * pulse * p.z; }
    else { r = 0.6 + 1.5 * p.z; a = 0.3 + 0.6 * p.z; halo = 0.25 * p.z; }
    return { x: p.x, y: p.y, r, a: bornee(a, 0, 1), halo: bornee(halo, 0, 1) };
  }
  // Décalage de parallaxe (pixels de scène) pour un pointeur normalisé (px, py dans [-1, 1]) : proportionnel à la profondeur.
  function parallaxe(p, px, py) {
    const ax = bornee(Number.isFinite(px) ? px : 0, -1, 1), ay = bornee(Number.isFinite(py) ? py : 0, -1, 1);
    return [-ax * 7 * p.z, -ay * 4 * p.z];
  }

  // Mode test (?egg-royaume=1) : ouvre le panneau au chargement, sans rien écrire.
  const modeTest = (search) => /[?&]egg-royaume=1(&|$)/.test(search || '');

  return {
    CLE, VERSION, SCENE, CATALOGUE, CHOIX, MURALES, NB_VARIANTES, LIBELLES, ZONE_DE, REGIONS, OBJETS, EXISTANTS, FIXES,
    HEURES, LAMPES, RIDEAUX, TAPIS, THEMES, AMBIANCES, LUEURS, NB_PARTICULES, TYPES_PARTICULES, EMPLACEMENTS, LIBELLES_EMPLACEMENTS, SERIE,
    rectsSeCoupent, rectAgent, interdits, positionDe, actifs, emplacementValide, borner, chercherLibre,
    configDefaut, estDefaut, valider, serialiser, deserialiser, reinitialiser,
    choisir, activerMurale, varianteMurale, deplacer, deplacerDe, decalages, couchesFond, modeTest,
    apercu, plusProche, deposer, zonesPermises, rectsEvites, placerDans, agentVisible, masquerAgent, bureauDe, choisirBureau,
    creerParticules, avancer, rendu, parallaxe, prng
  };
});
