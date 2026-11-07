// Logique pure des micro-interactions du décor (aucun DOM, aucun réseau, aucune écriture d'état). UMD : module.exports en Node, window.ObjetsLogique dans la page.
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.ObjetsLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const MIN_CLIC_PX = 24; // taille minimale effective d'une zone cliquable, en pixels écran

  // Boîtes de repli (pixels de scène) si KinanEquipe.objets ne les fournit pas ; relevées dans scene.js (decor et fonctions de dessin).
  const BOITES = {
    plante: [121, 130, 18, 26], horloge: [190, 22, 20, 20], lampadaire: [258, 96, 22, 14], fenetre: [21, 9, 86, 52],
    tableau: [129, 15, 40, 32], panneau: [231, 15, 48, 34], etagere: [289, 14, 96, 48]
  };
  const SIEGES_TASSE = ['kinan', 'skyze', 'quatre'];
  // Moniteur de l'agent (scene.js, moniteur()) et tasse (tasse()), depuis { cx, haut, s }.
  const boiteMoniteur = (a) => [a.cx + a.s * 25 - 12, a.haut - 18, 24, 16];
  const boiteTasse = (a) => [a.cx - a.s * 33 - 2, a.haut - 14, 10, 14];

  // Durées des effets, en ms.
  const DUREE = { plante: 6200, fenetre: 1400, lampe: 900, ordinateur: 1200, tasse: 1500, horloge: 900, tableau: 900, panneau: 1200, etagere: 1800 };

  const MESSAGES = {
    plante: ['J\'suis tombée sous ton charme.', 'Mes feuilles te saluent. Celles qui restent.', 'Aïe, pas les feuilles !', 'Je reviens dans un instant, promis.'],
    fenetre: ['Il y a un courant d\'air.', 'Ça tremble, dehors ?', 'Ne t\'inquiète pas, ce sont les rideaux.'],
    lampeAllume: ['Que la lumière soit.', 'Voilà, c\'est mieux.', 'Clic ! Et la lumière fut.'],
    lampeEteint: ['Mode économie d\'énergie.', 'Clic. Plus rien.', 'On se croirait au cinéma.'],
    ordinateur: ['Je fais semblant de travailler.', 'Rien à voir ici, circulez.', 'Je compile... mentalement.', 'Cet écran est en pleine réflexion.'],
    tasse: ['Encore chaud !', 'Chut, je savoure ma crème.', 'Ce n\'est pas du café, c\'est du carburant.'],
    horloge: ['Tic. Tac. Tic.', 'Le temps passe, les tokens aussi.', 'Elle avance. Presque toujours.'],
    tableau: ['Un chef-d\'œuvre, ce tableau.', 'Il est bien droit, je vous le promets.', 'On dirait presque un vrai.'],
    panneau: ['Un post-it de plus, un !', 'Ça, c\'est pour demain. Sûrement.', 'Je ne l\'ai pas lu, je le promets.'],
    etagere: ['Atchoum ! Que de poussière.', 'Chaque livre a sa place. Enfin, presque.', 'Rien ne vaut un bon livre. Ou un bon café.']
  };

  function choisir(liste, rnd, dernier) {
    if (!liste || !liste.length) return { index: -1, texte: '' };
    let i = Math.min(liste.length - 1, Math.floor((rnd ? rnd() : Math.random()) * liste.length));
    if (liste.length > 1 && i === dernier) i = (i + 1) % liste.length;
    return { index: i, texte: liste[i] };
  }
  // Message de l'horloge : heure réelle, ou une phrase du lot (une fois sur deux).
  function messageHorloge(date, rnd, dernier) {
    const r = rnd ? rnd() : Math.random();
    if (r < 0.5 && date instanceof Date && Number.isFinite(date.getTime())) {
      const h = String(date.getHours()).padStart(2, '0'), m = String(date.getMinutes()).padStart(2, '0');
      return { index: -2, texte: 'Il est ' + h + 'h' + m + '.' };
    }
    return choisir(MESSAGES.horloge, rnd, dernier);
  }

  // Fil rouge du décor (plante, fenêtre, tasse, lampe) : cliquer les quatre dans l'ordre, chaque clic dans les 12 s du précédent,
  // fait raconter à l'objet suivant une petite histoire (la plante frissonne, la vitre ferme mal). Purement local, rien n'est mémorisé.
  const LORE = Object.freeze({
    chaine: Object.freeze(['plante', 'fenetre', 'tasse', 'lampe']), delai: 12000,
    textes: Object.freeze({ fenetre: 'Les feuilles tremblent. Un courant d\'air ?', tasse: 'Même le café frissonne. Ça vient de dehors.', lampe: 'Mystère résolu : la fenêtre ferme mal.' })
  });
  const creerLore = () => Object.freeze({ rang: 0, depuis: -1e9 });
  // Retourne { etat, texte (ou null), fini }. Clic hors chaîne : retour à zéro ; clic sur la plante : (re)départ.
  function suiteLore(etat, id, maintenant) {
    const e = etat || creerLore(), t = Number.isFinite(maintenant) ? maintenant : 0;
    const suivant = LORE.chaine[e.rang];
    if (e.rang > 0 && id === suivant && t - e.depuis >= 0 && t - e.depuis <= LORE.delai) {
      const rang = e.rang + 1, fini = rang >= LORE.chaine.length;
      return { etat: fini ? creerLore() : Object.freeze({ rang, depuis: t }), texte: LORE.textes[id] || null, fini };
    }
    if (id === LORE.chaine[0]) return { etat: Object.freeze({ rang: 1, depuis: t }), texte: null, fini: false };
    return { etat: creerLore(), texte: null, fini: false };
  }

  const borne = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  // Enveloppe 0 -> 1 -> 0 sur la durée (montée 15 %, descente 30 %). Mode calme : palier fixe à 1 pendant toute la durée.
  function enveloppe(dt, duree, calme) {
    if (!Number.isFinite(dt) || dt < 0 || dt >= duree) return 0;
    if (calme) return 1;
    const k = dt / duree;
    return k < 0.15 ? k / 0.15 : k > 0.7 ? borne((1 - k) / 0.3) : 1;
  }
  // Amplitude de vibration : enveloppe décroissante ; mode calme : toujours 0 (aucun tremblement).
  function vibration(dt, duree, calme) {
    if (calme || !Number.isFinite(dt) || dt < 0 || dt >= duree) return 0;
    return 1 - dt / duree;
  }
  // Plante : fane (0..1, brunissement), chute (0..1, avancement des feuilles qui tombent). Montée 700 ms, palier, retour sur 1,8 s.
  function etatPlante(dt, calme, duree) {
    const D = Number.isFinite(duree) && duree > 2500 ? duree : DUREE.plante;
    if (!Number.isFinite(dt) || dt < 0 || dt >= D) return { fane: 0, chute: 0 };
    if (calme) return { fane: dt < D - 1800 ? 0.7 : 0.35, chute: 0 };
    const fane = dt < 700 ? dt / 700 : dt < D - 1800 ? 1 : borne((D - dt) / 1800);
    return { fane, chute: borne(dt / 2600) };
  }
  // Reclic sur la plante pendant l'effet : pas de saut. En plein palier, la durée est prolongée ; pendant le retour, l'effet repart du brunissement actuel.
  function relancerPlante(dt, duree, calme) {
    const D = Number.isFinite(duree) ? duree : DUREE.plante;
    if (!Number.isFinite(dt) || dt < 0 || dt >= D) return { dt: 0, duree: DUREE.plante };
    if (calme || dt < D - 1800) return { dt, duree: Math.max(D, dt + 1800 + 1400) };
    return { dt: Math.round(etatPlante(dt, false, D).fane * 700), duree: DUREE.plante };
  }
  // Lampe : machine à deux états (allumée par défaut) ; lueur 0..1 juste après l'allumage (aucune en mode calme).
  function creerLampe() { return Object.freeze({ allumee: true, depuis: -1e9 }); }
  function basculerLampe(l, maintenant) { return Object.freeze({ allumee: !l.allumee, depuis: maintenant }); }
  function lueurLampe(l, maintenant, calme) {
    if (calme || !l.allumee) return 0;
    const dt = maintenant - l.depuis;
    return dt < 0 || dt >= DUREE.lampe ? 0 : 1 - dt / DUREE.lampe;
  }
  // Taille écran effective (px) d'une zone de largeur/hauteur de scène w, h à l'échelle donnée, avec plancher min.
  function tailleEffective(w, h, echelle, min) {
    const m = min === undefined ? MIN_CLIC_PX : min, e = Number.isFinite(echelle) && echelle > 0 ? echelle : 1;
    return { w: Math.max(w * e, m), h: Math.max(h * e, m) };
  }

  return { LORE, creerLore, suiteLore, MIN_CLIC_PX, BOITES, SIEGES_TASSE, boiteMoniteur, boiteTasse, DUREE, MESSAGES, choisir, messageHorloge, enveloppe, vibration, etatPlante, relancerPlante, creerLampe, basculerLampe, lueurLampe, tailleEffective };
});
