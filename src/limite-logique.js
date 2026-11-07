// Logique pure de la bulle « limite » (aucun DOM, aucun réseau, aucune écriture). UMD : module.exports en Node, window.LimiteLogique dans la page.
// Entrée : les fenêtres déjà fournies par limites.js ({ libelle, restant en %, reprise en ms }). Sortie : fenêtre la plus critique,
// couleurs en dégradé continu selon le % consommé (neutre loin de la limite, puis ambre, puis rouge intense près de 100 %).
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.LimiteLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SEUIL_DISCRET = 50; // jusqu'à 50 % consommé (restant > 50 %) : bulle discrète, sans halo

  // Paliers de couleur : [% consommé, fond, bord, texte]. Entre deux paliers, interpolation linéaire en RVB.
  const PALIERS = [
    [0, [30, 26, 48], [59, 52, 88], [185, 179, 209]],
    [50, [42, 35, 64], [74, 66, 104], [216, 210, 238]],
    [75, [77, 53, 7], [255, 176, 32], [255, 224, 138]],
    [90, [140, 28, 38], [255, 107, 120], [255, 255, 255]],
    [100, [196, 24, 42], [255, 138, 148], [255, 255, 255]]
  ];

  const nombre = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '') ? Number(x) : NaN);
  const borne = (x, a, b) => (x < a ? a : x > b ? b : x);
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  // % consommé d'une fenêtre (0..100), ou NaN si la donnée est inutilisable.
  function utilise(f) {
    const r = f && nombre(f.restant);
    return Number.isFinite(r) ? borne(100 - r, 0, 100) : NaN;
  }

  // Fenêtre encore en cours (reprise absente ou à venir) avec la plus forte consommation ; à égalité, la reprise la plus proche.
  function critique(fenetres, maintenant) {
    const t = Number.isFinite(maintenant) ? maintenant : Date.now();
    let meilleure = null, u = -1, repM = Infinity;
    for (const f of Array.isArray(fenetres) ? fenetres : []) {
      const x = utilise(f);
      if (!Number.isFinite(x)) continue;
      const r = f.reprise === null || f.reprise === undefined ? NaN : nombre(f.reprise);
      if (Number.isFinite(r) && r <= t) continue;
      const rep = Number.isFinite(r) ? r : Infinity;
      if (x > u || (x === u && rep < repM)) { meilleure = f; u = x; repM = rep; }
    }
    return meilleure;
  }

  // Couleurs (hex) pour un % consommé ; halo (0..0.6) nul tant que la bulle est discrète.
  function couleurs(pct) {
    const u = borne(Number.isFinite(pct) ? pct : 0, 0, 100);
    let i = 0;
    while (i < PALIERS.length - 2 && u > PALIERS[i + 1][0]) i++;
    const [u0, f0, b0, t0] = PALIERS[i], [u1, f1, b1, t1] = PALIERS[i + 1];
    const k = borne((u - u0) / (u1 - u0), 0, 1);
    return {
      fond: hex(mix(f0, f1, k)), bord: hex(mix(b0, b1, k)), texte: hex(mix(t0, t1, k)),
      halo: u <= SEUIL_DISCRET ? 0 : Math.round(((u - SEUIL_DISCRET) / (100 - SEUIL_DISCRET)) * 0.6 * 100) / 100
    };
  }

  // Palier lisible (tests, attribut de style) : discret (restant > 50 %), normal, ambre (≥ 75 %), rouge (≥ 90 %), critique (≥ 97 %).
  function niveau(pct) {
    const u = Number.isFinite(pct) ? pct : 0;
    return u >= 97 ? 'critique' : u >= 90 ? 'rouge' : u >= 75 ? 'ambre' : u > SEUIL_DISCRET ? 'normal' : 'discret';
  }

  // Contraste WCAG entre deux couleurs « #rrggbb ».
  function luminance(h) {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  const fmt = (n) => String(n).replace('.', ',');
  // 10 % et plus : entier ; moins de 10 % : une décimale si utile.
  const pctTexte = (restant) => fmt(restant < 10 ? Math.round(restant * 10) / 10 : Math.round(restant));
  const nomFenetre = (f) => (f && (f.id === 'seven_day' || /semaine|hebdo/i.test(String(f.libelle))) ? 'hebdo' : f && f.libelle ? String(f.libelle) : '');

  // Description complète pour l'affichage, ou null s'il n'y a rien à montrer.
  // titre : une ligne par fenêtre en cours, avec l'heure de reprise formatée par `heure` (fournie par la page).
  function decrire(fenetres, maintenant, heure) {
    const f = critique(fenetres, maintenant);
    if (!f) return null;
    const u = utilise(f), restant = Math.round((100 - u) * 10) / 10;
    const t = Number.isFinite(maintenant) ? maintenant : Date.now();
    const enCours = (Array.isArray(fenetres) ? fenetres : []).filter((x) => Number.isFinite(utilise(x)) && !(Number.isFinite(nombre(x.reprise)) && nombre(x.reprise) <= t));
    const ligne = (x) => 'Limite ' + nomFenetre(x) + ' : ' + pctTexte(Math.round((100 - utilise(x)) * 10) / 10) + ' % restant'
      + (Number.isFinite(nombre(x.reprise)) && typeof heure === 'function' ? ' · reprise ' + heure(nombre(x.reprise)) : '');
    return {
      fenetre: f, utilise: u, restant, niveau: niveau(u), discret: u <= SEUIL_DISCRET, couleurs: couleurs(u),
      texte: 'Limite ' + nomFenetre(f) + ' · ' + pctTexte(restant) + ' % restant',
      titre: enCours.map(ligne).join('\n')
    };
  }

  return { SEUIL_DISCRET, PALIERS, utilise, critique, couleurs, niveau, contraste, pctTexte, decrire };
});
