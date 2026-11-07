// Bulle « limite » en bas du panneau : fenêtre la plus critique (5 h ou hebdomadaire), % restant, couleur en dégradé continu
// (voir limite-logique.js). Données déjà fournies par kinanUI.limitesLire / surLimites. 0 jeton, 0 réseau.
// Captures sans l'appli : ?limite=90 (% consommé de la fenêtre 5 h), option &hebdo=40 (% consommé de la fenêtre hebdomadaire).
(() => {
  'use strict';
  const L = window.LimiteLogique, bulle = document.getElementById('bulle-limite'), txt = document.getElementById('bl-txt');
  if (!L || !bulle || !txt) return;
  const api = window.kinanUI;
  const hhmm = (ms) => new Date(ms).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  let limites = { fenetres: [] };

  function rendre() {
    const d = L.decrire(limites.fenetres, Date.now(), hhmm);
    if (!d) { bulle.hidden = true; return; }
    const c = d.couleurs, s = bulle.style;
    s.setProperty('--bl-fond', c.fond); s.setProperty('--bl-bord', c.bord); s.setProperty('--bl-texte', c.texte);
    s.setProperty('--bl-halo', String(c.halo)); s.setProperty('--bl-pct', String(Math.round(d.utilise)));
    bulle.dataset.niveau = d.niveau;
    if (txt.textContent !== d.texte) txt.textContent = d.texte; // texte inchangé : pas de nouvelle annonce au lecteur d'écran
    if (bulle.title !== d.titre) bulle.title = d.titre;
    bulle.hidden = false;
  }

  const m = /[?&]limite=(\d+(?:[.,]\d+)?)/.exec(location.search);
  if (m && !(api && api.limitesLire)) {
    const h = /[?&]hebdo=(\d+(?:[.,]\d+)?)/.exec(location.search), pct = (x) => Number(x.replace(',', '.'));
    limites = { fenetres: [{ id: 'five_hour', libelle: '5 h', restant: 100 - pct(m[1]), reprise: Date.now() + 95 * 60000 }] };
    if (h) limites.fenetres.push({ id: 'seven_day', libelle: 'semaine', restant: 100 - pct(h[1]), reprise: Date.now() + 3 * 86400000 });
    rendre();
  } else if (api && api.limitesLire) {
    api.limitesLire().then((l) => { limites = l || limites; rendre(); }).catch(() => {});
    if (api.surLimites) api.surLimites((l) => { limites = l || limites; rendre(); });
  }
  setInterval(rendre, 30000);
})();
