// Statut d'une version installée face à la version publiée (coche verte / croix rouge). Logique pure, aucun DOM, aucun réseau.
// UMD : module.exports en Node, window.StatutVersion dans la page.
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.StatutVersion = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const VALIDE = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:[-+][0-9A-Za-z.-]{1,40})?$/;
  const ok = (v) => (typeof v === 'string' && VALIDE.test(v) ? v : null);
  // > 0 si a plus récente que b ; une préversion est plus ancienne que la finale.
  function comparer(a, b) {
    const p = (s) => s.split(/[-+]/)[0].split('.').map(Number);
    const x = p(a), y = p(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    const pa = /-/.test(a.split('+')[0]), pb = /-/.test(b.split('+')[0]);
    return pa === pb ? 0 : pa ? -1 : 1;
  }
  // etat = état global { active, verifie, enCours } ; e = { locale, distante }.
  // Retour : { type: 'aucun'|'ok'|'ancienne'|'non-confirmee', symbole, libelle }. 'aucun' : ni coche ni croix.
  function statut(etat, e) {
    const aucun = { type: 'aucun', symbole: '', libelle: '' };
    if (!etat || !etat.active || !etat.verifie || etat.enCours || !e) return aucun;
    const l = ok(e.locale), d = ok(e.distante);
    if (!l || !d) return aucun;
    const c = comparer(l, d);
    if (c === 0) return { type: 'ok', symbole: '✓', libelle: 'à jour (v' + l + ')' };
    if (c < 0) return { type: 'ancienne', symbole: '✗', libelle: 'mise à jour disponible : v' + d };
    return { type: 'non-confirmee', symbole: '✗', libelle: 'non confirmée : plus récente que la version publiée (v' + d + ')' };
  }
  return { statut };
});
