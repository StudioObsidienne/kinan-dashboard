// Bouton « son » permanent des easter eggs (logique : son-bouton-logique.js). Active/coupe tous les sons des eggs ; muet par défaut.
// Même clé que le reste des eggs (kinan-os.egg.muet via api.muet()), donc synchronisé et persistant. Ne touche pas aux volumes.
(function () {
  'use strict';
  if (!window.KinanEgg || !window.SonBoutonLogique) return;
  const L = window.SonBoutonLogique;
  window.KinanEgg.module('son-bouton', (api) => {
    const doc = document;
    const zone = doc.querySelector('.boutons');
    if (!zone) throw new Error('zone des boutons absente');
    const b = doc.createElement('button');
    b.type = 'button'; b.id = 'btn-egg-son'; b.className = 'bouton btn-egg-son';
    b.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path class="hp" d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path class="on" d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.7a6 6 0 0 1 0 8.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path class="off" d="M11 5.5l4 5M15 5.5l-4 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    zone.appendChild(b);
    function maj() {
      const e = L.etat(api.muet());
      b.setAttribute('aria-pressed', e.pressed); b.setAttribute('aria-label', e.label); b.title = e.label;
      b.querySelector('.on').style.display = e.actif ? '' : 'none';
      b.querySelector('.off').style.display = e.actif ? 'none' : '';
    }
    b.addEventListener('click', () => { L.basculer(api.muet); maj(); api.emettre(L.EVENEMENT, { muet: api.muet() }); });
    maj();
  });
})();
