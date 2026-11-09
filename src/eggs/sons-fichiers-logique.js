// Réglages et logique pure des sons enregistrés (ronflement de Drafion, claquement du fouet). Aucun DOM, aucun réseau. UMD : module.exports en Node, window.SonsFichiers dans la page.
// Fichiers : assets/sons/*.mp3 (licences : assets/sons/LICENCE.md). Tout se règle ici.
(function (racine, fabrique) {
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SonsFichiers = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ---- réglages (secondes ; volume de 0 à 1) ----
  const VOLUME_RONFLEMENT = 0.25;      // pas fort
  const VOLUME_FOUET = 0.3;            // pas fort
  const VOLUME_MAX = 0.5;              // plafond absolu, quoi qu'on règle
  const FICHIER_RONFLEMENT = '../assets/sons/ronflement.mp3'; // relatif à src/index.html (fonctionne en file://)
  const FICHIER_FOUET = '../assets/sons/fouet.mp3';
  const DUREE_RONFLEMENT = 50;         // durée du fichier (≈ 50 s)
  const EXTRAIT_RONFLEMENT = 6;        // durée jouée à chaque ronflement
  const FONDU_RONFLEMENT = 0.4;        // fondu d'entrée et de sortie
  const DECALAGES_RONFLEMENT = [2, 11, 19, 27, 35, 42]; // débuts possibles dans le fichier
  const EXTRAIT_RENIFLE = 0.6, FONDU_RENIFLE = 0.12;    // « hrnk ! » du réveil brutal
  const DUREE_FOUET = 3;               // durée annoncée du fichier
  const COUPE_FOUET = 1.5;             // lecture coupée ici si le fichier est plus long
  const FONDU_FOUET = 0.3;             // fondu de sortie à la coupe
  const ATTAQUE_FOUET = 0.05;          // position du claquement dans le fichier : il part ce délai avant l'impact (à ajuster à l'oreille)

  const nombre = (v, repli) => (typeof v === 'number' && Number.isFinite(v) ? v : repli);
  const borneVolume = (v, max) => Math.min(Math.max(0, nombre(max, VOLUME_MAX)), Math.max(0, nombre(v, 0)));

  // Début d'extrait : un décalage fixe qui laisse la place à l'extrait entier, différent du dernier si possible. alea : () => [0,1[.
  function choisirDecalage(decalages, duree, extrait, alea, dernier) {
    const ok = (Array.isArray(decalages) ? decalages : []).filter((d) => typeof d === 'number' && d >= 0 && d + extrait <= duree);
    if (!ok.length) return 0;
    const pool = ok.length > 1 ? ok.filter((d) => d !== dernier) : ok;
    const r = typeof alea === 'function' ? alea() : 0;
    return pool[Math.min(pool.length - 1, Math.max(0, Math.floor((r >= 0 && r < 1 ? r : 0) * pool.length)))];
  }
  // Gain 0..1 à l'instant t d'une lecture de durée `duree` : montée puis descente linéaires de `fondu`.
  function gainFondu(t, duree, fondu) {
    if (!(duree > 0) || !(t >= 0) || t >= duree) return 0;
    const f = Math.min(Math.max(0, nombre(fondu, 0)), duree / 2);
    if (f === 0) return 1;
    return Math.min(1, t / f, (duree - t) / f);
  }
  const volumeA = (t, duree, fondu, volume) => borneVolume(volume * gainFondu(t, duree, fondu));
  // Lecture du fouet : durée jouée (coupée à COUPE_FOUET) et retard de départ pour que le claquement tombe sur l'impact (ms -> s).
  const dureeFouet = (dureeFichier) => { const d = nombre(dureeFichier, DUREE_FOUET); return Math.min(COUPE_FOUET, d > 0 ? d : DUREE_FOUET); };
  const retardFouet = (impactMs) => Math.max(0, nombre(impactMs, 0) / 1000 - ATTAQUE_FOUET);

  return { VOLUME_RONFLEMENT, VOLUME_FOUET, VOLUME_MAX, FICHIER_RONFLEMENT, FICHIER_FOUET, DUREE_RONFLEMENT, EXTRAIT_RONFLEMENT, FONDU_RONFLEMENT,
    DECALAGES_RONFLEMENT, EXTRAIT_RENIFLE, FONDU_RENIFLE, DUREE_FOUET, COUPE_FOUET, FONDU_FOUET, ATTAQUE_FOUET,
    borneVolume, choisirDecalage, gainFondu, volumeA, dureeFouet, retardFouet };
});
