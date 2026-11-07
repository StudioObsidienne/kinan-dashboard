// Délais d'état des agents (logique pure, testée dans test/etat-delai.test.js).
'use strict';
const DELAI_ERREUR_MS = 20 * 1000;        // une erreur reste affichée 20 s, puis retour au repos
const DELAI_ABANDON_MS = 15 * 60 * 1000;  // « au travail » sans nouvelle depuis 15 min = au repos (hook manqué)

// Modifie etat.agents en place. `vus` (Map) mémorise la première observation d'une erreur sans horodatage « maj »
// (sinon elle resterait affichée pour toujours). Le retour au repos ne dépend que de l'horloge : aucun évènement requis.
function appliquerDelais(etat, now, vus) {
  for (const [id, a] of Object.entries((etat && etat.agents) || {})) {
    if (!a || typeof a !== 'object') continue;
    if (a.etat !== 'erreur') { if (vus) vus.delete(id); }
    else {
      let depuis = Number(a.maj) || 0;
      if (!depuis && vus) {
        const cle = id + '|' + (a.tache || '');
        const v = vus.get(id);
        if (!v || v.cle !== cle) vus.set(id, { cle, depuis: now });
        depuis = vus.get(id).depuis;
      }
      if (depuis && now - depuis > DELAI_ERREUR_MS) { a.etat = 'repos'; a.tache = ''; continue; }
    }
    if (a.etat !== 'repos' && a.maj && now - a.maj > DELAI_ABANDON_MS) { a.etat = 'repos'; a.tache = ''; }
  }
  return etat;
}
module.exports = { DELAI_ERREUR_MS, DELAI_ABANDON_MS, appliquerDelais };
