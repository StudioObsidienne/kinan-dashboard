// Logique pure du bouton « son » des easter eggs (aucun DOM). UMD : module.exports en Node, window.SonBoutonLogique dans la page.
// Réglage partagé : clé de config « kinan-os.egg.muet » (api.muet() du socle), la même que celle lue par fouet, sommeil, objets, chasse et jean.
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SonBoutonLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CLE = 'kinan-os.egg.muet';
  const EVENEMENT = 'kinan-egg-muet';
  const TEXTES = Object.freeze({ actif: 'Sons des easter eggs : activés', coupe: 'Sons des easter eggs : coupés' });
  // aria-pressed = vrai quand le son est actif.
  const etat = (muet) => ({ actif: !muet, pressed: muet ? 'false' : 'true', label: muet ? TEXTES.coupe : TEXTES.actif });
  // Bascule via l'accès du socle (muet() lit, muet(v) écrit) ; renvoie l'état après bascule.
  function basculer(muetFn) { const nouveau = !muetFn(); muetFn(nouveau); return etat(muetFn()); }
  return { CLE, EVENEMENT, TEXTES, etat, basculer };
});
