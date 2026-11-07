// Logique pure du sommeil de Drafion (aucun DOM, aucun réseau, aucune écriture). UMD : module.exports en Node, window.SommeilLogique dans la page.
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SommeilLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const MIN = 60000;
  const SEUIL_SOMNOLE = 10 * MIN, SEUIL_SOMMEIL = 20 * MIN, SEUIL_PROFOND = 30 * MIN;
  const PERIODE_SOUFFLE = 4000, DUREE_REVEIL = 600, PAS_RONFLEMENT = 10 * MIN;

  const borne = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lisse = (x) => x * x * (3 - 2 * x);
  const positif = (ms) => (Number.isFinite(ms) && ms > 0 ? ms : 0);

  // 0 éveillé, 1 somnole, 2 dort, 3 sommeil profond. Inactivité négative ou invalide : 0.
  function palier(inactifMs) {
    const m = positif(inactifMs);
    return m >= SEUIL_PROFOND ? 3 : m >= SEUIL_SOMMEIL ? 2 : m >= SEUIL_SOMNOLE ? 1 : 0;
  }

  // Suivi de l'inactivité : { etat, dernier }. dernier = horodatage du dernier moment non-repos (ou de la sortie d'un état non-repos).
  function creerSuivi(etat, maintenant, dernierStocke) {
    if (etat !== 'repos') return { etat, dernier: maintenant };
    const ok = Number.isFinite(dernierStocke) && dernierStocke > 0 && dernierStocke <= maintenant;
    return { etat, dernier: ok ? dernierStocke : maintenant };
  }
  function observer(suivi, etat, maintenant) {
    if (etat !== 'repos') return { etat, dernier: maintenant };       // travail, erreur, doute : l'agent est actif
    if (suivi.etat !== 'repos') return { etat, dernier: maintenant }; // sortie d'un état actif : le compteur part de là
    return suivi;                                                     // repos successifs : rien ne bouge
  }
  function inactivite(suivi, maintenant) {
    if (!suivi || suivi.etat !== 'repos') return 0;
    return positif(maintenant - suivi.dernier);
  }

  // Vrai une seule fois pour chaque multiple de 10 min d'inactivité à partir de 20 min.
  // dernierRonflementMs : inactivité mesurée lors du dernier ronflement (0 si aucun).
  function ronflementDu(inactifMs, dernierRonflementMs) {
    const n = Math.floor(positif(inactifMs) / PAS_RONFLEMENT), m = Math.floor(positif(dernierRonflementMs) / PAS_RONFLEMENT);
    return n >= 2 && n > m;
  }

  // Respiration : sinus de période 4 s, valeur dans [0, 1] ; mode calme : constante 0,5.
  function respiration(tMs, calme) {
    if (calme) return 0.5;
    return 0.5 + 0.5 * Math.sin((positif(tMs) / PERIODE_SOUFFLE) * Math.PI * 2);
  }

  // Réveil : 0 au début, 1 au bout de 600 ms, lissé comme lisse() de la scène. Mode calme : instantané.
  function reveil(dtMs, calme) {
    if (calme) return 1;
    return lisse(borne(positif(dtMs) / DUREE_REVEIL));
  }

  // Fonte progressive : 0 avant 10 min, 1 à 30 min, lissée entre les deux.
  function fonte(inactifMs) {
    return lisse(borne((positif(inactifMs) - SEUIL_SOMNOLE) / (SEUIL_PROFOND - SEUIL_SOMNOLE)));
  }
  // Apparition de la bulle de nez : 0 avant 30 min, 1 deux minutes plus tard.
  function nez(inactifMs) {
    return borne((positif(inactifMs) - SEUIL_PROFOND) / (2 * MIN));
  }

  // Horloge de test : t0 + (maintenant - t0) * vitesse ; vitesse hors de 1..600 ramenée à 1.
  function vitesseValide(v) { return Number.isFinite(v) && v >= 1 && v <= 600 ? v : 1; }
  function horlogeAcceleree(t0, maintenant, vitesse) {
    return t0 + (maintenant - t0) * vitesseValide(vitesse);
  }

  // ---- cycle respiratoire (même sinus que respiration) : inspiration quand la valeur monte (phase 3000 -> 5000 ms), expiration quand elle descend ----
  const DEBUT_INSPIRATION = 3000, DEBUT_EXPIRATION = 1000;
  function inspire(tMs) { const ph = ((positif(tMs) % PERIODE_SOUFFLE) + PERIODE_SOUFFLE) % PERIODE_SOUFFLE; return ph >= DEBUT_INSPIRATION || ph < DEBUT_EXPIRATION; }
  // Prochain instant (ms, même repère que tMs) où commence une inspiration ou une expiration.
  function prochain(tMs, debut) {
    const t = positif(tMs), ph = t % PERIODE_SOUFFLE;
    return t + ((debut - ph) % PERIODE_SOUFFLE + PERIODE_SOUFFLE) % PERIODE_SOUFFLE;
  }
  const prochaineInspiration = (tMs) => prochain(tMs, DEBUT_INSPIRATION);
  const prochaineExpiration = (tMs) => prochain(tMs, DEBUT_EXPIRATION);

  // ---- déformation du corps (avatar existant redessiné ligne à ligne) ----
  // def > 0 : écrasé (fonte, la tête garde sa taille et le bas s'étale) ; def < 0 : étiré (rebond du réveil).
  // souffle (0..1) : l'inspiration soulève et resserre un peu le corps fondu, l'expiration le tasse et l'élargit.
  // Renvoie { H : hauteur en pixels, p : exposant de tassement (1 = aucun), w0 : largeur de base }.
  function profil(def, souffle, H0) {
    const h0 = Number.isFinite(H0) && H0 > 0 ? H0 : 27;
    const d = Number.isFinite(def) ? Math.max(-1, Math.min(1, def)) : 0;
    const s = Number.isFinite(souffle) ? borne(souffle) - 0.5 : 0;
    if (d >= 0) {
      const H = h0 * (1 - 0.42 * d) + s * 2 * (0.6 + 0.9 * d) * Math.min(1, d * 8);
      return { H, p: Math.max(1, Math.pow(h0 / Math.max(1, H), 0.8)), w0: 1 - 0.05 * d * s * 2 };
    }
    const k = 1 + 0.6 * -d;
    return { H: h0 * k, p: 1, w0: 1 / Math.pow(k, 0.7) };
  }
  // Ligne de destination q (0 en haut, 1 en bas) -> ligne source (0..1) : identité si p = 1, bas tassé sinon.
  const ligneSource = (q, p) => 1 - Math.pow(1 - borne(q), 1 / Math.max(1, p || 1));
  // Inverse : ligne source s -> ligne de destination.
  const ligneDest = (s, p) => 1 - Math.pow(1 - borne(s), Math.max(1, p || 1));
  // Largeur relative selon la ligne source s (0 haut, 1 bas) : la flamme et le visage gardent leur largeur, le bas du corps s'étale
  // d'autant plus que le corps est tassé (lissé à partir de la bouche).
  const largeur = (s, p) => { const k = borne((borne(s) - 0.62) / 0.38); return 1 + (Math.max(1, p || 1) - 1) * 1.5 * lisse(k); };

  // ---- réveil brutal (quelqu'un de complètement liquéfié qu'on réveille) ----
  // Ressort amorti : la forme revient très vite depuis la fonte, dépasse (étirée, sursaut), retombe écrasée, puis petite panique
  // (yeux écarquillés, « ! », regards affolés), s'ébroue pour se remettre en forme et reprend sa pose normale. Mode calme : instantané.
  const DUREE_BRUTAL = 1500;
  function reveilBrutal(dtMs, fonte0, calme) {
    const f0 = borne(Number.isFinite(fonte0) ? fonte0 : 0), t = positif(dtMs);
    if (calme || t >= DUREE_BRUTAL) return { fini: true, def: 0, saut: 0, dx: 0, yeux: 'ouvert', bouche: 'sourire', lx: 0, ly: 0, excl: false, sueur: false, choc: 0, retour: 1 };
    const ressort = Math.exp(-t / 210) * Math.cos((2 * Math.PI / 380) * t);
    let def = ressort > 0 ? (t < 95 ? f0 : 0.6) * ressort : (0.5 + 0.3 * f0) * ressort;
    const saut = t < 380 ? 5 * Math.sin(Math.PI * t / 380) : 0;
    const p = { fini: false, def, saut, dx: 0, yeux: 'grand', bouche: 'o', lx: 0, ly: -1, excl: t >= 40 && t < 900, sueur: t >= 380 && t < 1150, choc: borne(1 - t / 260), retour: lisse(borne(t / 220)) };
    if (t >= 380 && t < 1000) { // panique : regards à gauche, à droite
      p.lx = Math.floor((t - 380) / 140) % 2 ? 1 : -1; p.ly = 0; p.bouche = t < 640 ? 'o' : 'vague';
      if (t < 640) p.dx = Math.floor(t / 60) % 2 ? 1 : -1;
    } else if (t >= 1000 && t < 1250) { // s'ébroue : petites secousses écrasé / étiré
      const k = Math.floor((t - 1000) / 45) % 2 ? 1 : -1;
      p.def += 0.12 * k * (1 - (t - 1000) / 250); p.dx = k; p.yeux = 'cligne'; p.bouche = 'plat'; p.ly = 0;
    } else if (t >= 1250) { // remis en forme, un peu gêné
      p.yeux = t < 1330 ? 'cligne' : 'ouvert'; p.bouche = 'sourire'; p.ly = 0;
      p.def *= 1 - (t - 1250) / 250;
    }
    return p;
  }

  return { MIN, DUREE_BRUTAL, palier, creerSuivi, observer, inactivite, ronflementDu, respiration, reveil, fonte, nez, vitesseValide, horlogeAcceleree,
    inspire, prochaineInspiration, prochaineExpiration, profil, ligneSource, ligneDest, largeur, reveilBrutal };
});
