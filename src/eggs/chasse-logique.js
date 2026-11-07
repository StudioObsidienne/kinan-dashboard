// Chasse au trésor du royaume Kinan : logique pure (aucun DOM, aucun réseau, aucune IA, aucune écriture d'état agents).
// UMD : module.exports en Node, window.ChasseLogique dans la page. Seule persistance : le stock { get, set } fourni par KinanEgg (kinan-os.egg.chasse.*).
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.ChasseLogique = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Étapes : 0 rien trouvé, 1 parchemin de la plante, 2 message caché (énigme ouverte), 3 énigme résolue (bouton secret débloqué).
  const ETAPE = Object.freeze({ DEPART: 0, INDICE1: 1, INDICE2: 2, DEBLOQUE: 3 });
  const CLICS_PLANTE = 3; // clics d'affilée sur la plante (sans toucher un autre objet) pour trouver le parchemin
  const BOUTON_BOITE = [177, 33, 8, 8]; // pixels de scène : mur nu entre le tableau et l'horloge
  const MAX_REPONSE = 80;

  const TEXTES = Object.freeze({
    titre: 'Le royaume Kinan',
    indices: Object.freeze({
      1: 'Sous une feuille de la plante, un parchemin roulé : « Au royaume Kinan, le roi a enfermé son sceau dans un coffre. Trois gardiens veillent sur lui. Pour apprendre leur secret, regarde ce que la fenêtre ou un écran cache à qui s\'y attarde. »',
      2: 'Un message caché apparaît : « Le coffre ne s\'ouvre qu\'au nom du plus grand des trois gardiens. Drafion n\'est pas le plus grand. Johms est plus grand que Skyze. Skyze est plus grand que Drafion. Quel nom faut-il prononcer ? »'
    }),
    resolu: 'Le coffre s\'ouvre dans un déclic. Un petit bouton doré vient d\'apparaître sur le mur, tout près du temps qui passe.',
    invite: 'Ta réponse',
    valider: 'Valider',
    fermer: 'Fermer',
    carnet: 'Parchemin'
  });
  const BULLES = Object.freeze({
    indice1: 'Un parchemin sous une feuille !',
    indice2: 'Un message caché apparaît...',
    debloque: 'Un déclic... regarde le mur.',
    jean: 'Bientôt.'
  });
  const RATES = Object.freeze(['Ce n\'est pas le bon nom.', 'Le coffre reste fermé.', 'Relis l\'énigme, calmement.']);

  // ---- réponses ----
  // Minuscules, sans accents ni ponctuation, espaces réduits.
  function normaliser(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const MOTS_VIDES = new Set(['c', 'cest', 'est', 'le', 'la', 'les', 'l', 'un', 'gardien', 'reponse', 'nom', 'du']);
  const ACCEPTEES = Object.freeze(['johms', 'opus', 'johms opus', 'opus johms']);
  function verifierReponse(texte) {
    if (typeof texte !== 'string' || texte.length > MAX_REPONSE) return false;
    const restant = normaliser(texte).split(' ').filter((m) => m && !MOTS_VIDES.has(m)).join(' ');
    return ACCEPTEES.includes(restant);
  }

  // ---- objets du décor ----
  function idDepuisLabel(label) {
    const n = normaliser(label);
    if (n === 'plante') return 'plante';
    if (n === 'fenetre') return 'fenetre';
    if (n.startsWith('ordinateur')) return 'ordinateur';
    return 'autre';
  }

  // ---- machine d'états (pure) ----
  function etatInitial() { return Object.freeze({ etape: ETAPE.DEPART, essais: 0, plante: 0 }); }
  const faire = (etape, essais, plante) => Object.freeze({ etape, essais, plante });

  // evt : { type: 'objet', id } | { type: 'reponse', texte } | { type: 'bouton' }. Retourne { etat, effets, change }.
  // effets : { type: 'indice', numero } | 'rate' | 'debloque' | 'jean' | 'ignore'.
  function evoluer(etat, evt) {
    const e = etat || etatInitial();
    const rien = { etat: e, effets: [], change: false };
    if (!evt || typeof evt !== 'object') return rien;
    if (evt.type === 'objet') {
      const id = evt.id;
      if (e.etape === ETAPE.DEPART) {
        if (id === 'plante') {
          const n = e.plante + 1;
          if (n >= CLICS_PLANTE) return { etat: faire(ETAPE.INDICE1, e.essais, 0), effets: [{ type: 'indice', numero: 1 }], change: true };
          return { etat: faire(e.etape, e.essais, n), effets: [], change: false };
        }
        return e.plante ? { etat: faire(e.etape, e.essais, 0), effets: [], change: false } : rien;
      }
      if (e.etape === ETAPE.INDICE1 && (id === 'fenetre' || id === 'ordinateur')) {
        return { etat: faire(ETAPE.INDICE2, e.essais, 0), effets: [{ type: 'indice', numero: 2 }], change: true };
      }
      return rien;
    }
    if (evt.type === 'reponse') {
      if (e.etape !== ETAPE.INDICE2) return { etat: e, effets: [{ type: 'ignore' }], change: false };
      if (verifierReponse(evt.texte)) return { etat: faire(ETAPE.DEBLOQUE, e.essais, 0), effets: [{ type: 'debloque' }], change: true };
      return { etat: faire(e.etape, e.essais + 1, 0), effets: [{ type: 'rate', essais: e.essais + 1 }], change: true };
    }
    if (evt.type === 'bouton') {
      return e.etape === ETAPE.DEBLOQUE ? { etat: e, effets: [{ type: 'jean' }], change: false } : rien;
    }
    return rien;
  }

  // ---- persistance (le compteur de clics sur la plante n'est jamais mémorisé) ----
  function serialiser(etat) { return { v: 1, etape: etat.etape, essais: etat.essais }; }
  function restaurer(brut) {
    try {
      if (!brut || typeof brut !== 'object' || brut.v !== 1) return etatInitial();
      const etape = brut.etape, essais = brut.essais;
      if (!Number.isInteger(etape) || etape < 0 || etape > ETAPE.DEBLOQUE) return etatInitial();
      return faire(etape, Number.isInteger(essais) && essais >= 0 && essais < 1e6 ? essais : 0, 0);
    } catch { return etatInitial(); }
  }
  // Session : charge (ou remet à zéro), applique les évènements, sauvegarde quand l'avancement change.
  function creerSession(stock, opts) {
    const cle = 'etat';
    const lire = () => { try { return restaurer(stock.get(cle, null)); } catch { return etatInitial(); } };
    const ecrire = (e) => { try { stock.set(cle, serialiser(e)); } catch { /* stockage indisponible : la chasse reste jouable pour la session */ } };
    let etat;
    if (opts && opts.reset) { etat = etatInitial(); ecrire(etat); } else etat = lire();
    return {
      etat: () => etat,
      envoyer(evt) {
        const r = evoluer(etat, evt);
        etat = r.etat;
        if (r.change) ecrire(etat);
        return r.effets;
      },
      remiseAZero() { etat = etatInitial(); ecrire(etat); return etat; }
    };
  }
  const resetDemande = (search) => /[?&]egg-reset=1(&|$)/.test(search || '');

  return { ETAPE, CLICS_PLANTE, BOUTON_BOITE, MAX_REPONSE, TEXTES, BULLES, RATES, normaliser, verifierReponse, idDepuisLabel,
    etatInitial, evoluer, serialiser, restaurer, creerSession, resetDemande };
});
