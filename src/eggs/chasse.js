// Chasse au trésor du royaume Kinan (voir chasse-logique.js) : parchemin sous la plante, message caché à la fenêtre ou à un ordinateur,
// énigme à réponse saisie, puis bouton secret dans le décor. Locale, sans IA, sans réseau. Progression : kinan-os.egg.chasse.etat. ?egg-reset=1 remet à zéro.
// Le bouton secret n'émet que 'kinan-egg-jean' (la cinématique est dans jean.js).
(function () {
  'use strict';
  if (!window.KinanEgg || !window.ChasseLogique) return;
  const L = window.ChasseLogique;

  window.KinanEgg.module('chasse', (api) => {
    const doc = document;
    const session = L.creerSession(api.stock, { reset: L.resetDemande(window.location && window.location.search) });
    let ouvert = false, zoneBouton = null, rates = 0;
    const attendre = (fn, ms) => window.setTimeout(() => { try { fn(); } catch (e) { /* indice facultatif */ } }, ms);

    // ---- carnet (bouton + panneau), construit par createElement ----
    const FOND = '#1d1729', OR = '#ffd04d', TEXTE = '#f4f1ea';
    const el = (tag, css, texte) => { const n = doc.createElement(tag); if (css) n.style.cssText = css; if (texte) n.textContent = texte; return n; };
    const bouton = el('button', 'position:fixed;right:8px;bottom:8px;z-index:60;min-height:32px;padding:4px 12px;font:600 13px/1.2 system-ui,sans-serif;'
      + 'color:' + OR + ';background:' + FOND + ';border:2px solid ' + OR + ';border-radius:4px;cursor:pointer', L.TEXTES.carnet);
    bouton.type = 'button'; bouton.hidden = true;
    bouton.setAttribute('aria-expanded', 'false'); bouton.setAttribute('aria-controls', 'chasse-carnet');
    const panneau = el('section', 'position:fixed;right:8px;bottom:48px;z-index:60;box-sizing:border-box;width:min(380px,calc(100vw - 16px));max-height:60vh;overflow:auto;'
      + 'padding:12px 14px;font:14px/1.5 system-ui,sans-serif;color:' + TEXTE + ';background:' + FOND + ';border:2px solid ' + OR + ';border-radius:6px');
    panneau.id = 'chasse-carnet'; panneau.hidden = true; panneau.setAttribute('role', 'region'); panneau.setAttribute('aria-label', L.TEXTES.titre);
    const titre = el('h2', 'margin:0 0 8px;font:700 15px/1.3 system-ui,sans-serif;color:' + OR, L.TEXTES.titre);
    const liste = el('div');
    const formulaire = el('form', 'margin-top:10px'); formulaire.hidden = true; formulaire.autocomplete = 'off';
    const etiquette = el('label', 'display:block;margin-bottom:4px', L.TEXTES.invite); etiquette.htmlFor = 'chasse-reponse';
    const champ = el('input', 'box-sizing:border-box;width:100%;padding:6px 8px;font:14px system-ui,sans-serif;color:#1d1729;background:#fff;border:2px solid ' + OR + ';border-radius:4px');
    champ.id = 'chasse-reponse'; champ.type = 'text'; champ.maxLength = L.MAX_REPONSE; champ.setAttribute('autocapitalize', 'off'); champ.setAttribute('spellcheck', 'false');
    const valider = el('button', 'margin-top:6px;min-height:32px;padding:4px 14px;font:600 13px system-ui,sans-serif;color:' + FOND + ';background:' + OR + ';border:0;border-radius:4px;cursor:pointer', L.TEXTES.valider);
    valider.type = 'submit';
    const retour = el('p', 'margin:8px 0 0;min-height:1.5em;color:#ffb3b3'); retour.setAttribute('role', 'status'); retour.setAttribute('aria-live', 'polite');
    const fermer = el('button', 'margin-top:8px;min-height:32px;padding:4px 14px;font:13px system-ui,sans-serif;color:' + TEXTE + ';background:transparent;border:1px solid ' + TEXTE + ';border-radius:4px;cursor:pointer', L.TEXTES.fermer);
    fermer.type = 'button';
    formulaire.append(etiquette, champ, valider, retour);
    panneau.append(titre, liste, formulaire, fermer);
    doc.body.append(bouton, panneau);

    function rendre() {
      const e = session.etat();
      liste.textContent = '';
      for (let n = 1; n <= Math.min(e.etape, 2); n++) liste.appendChild(el('p', 'margin:0 0 8px', L.TEXTES.indices[n]));
      if (e.etape >= L.ETAPE.DEBLOQUE) liste.appendChild(el('p', 'margin:0 0 8px;color:' + OR, L.TEXTES.resolu));
      formulaire.hidden = e.etape !== L.ETAPE.INDICE2;
      bouton.hidden = e.etape < L.ETAPE.INDICE1;
    }
    function ouvrir(v, focaliser) {
      ouvert = !!v && session.etat().etape >= L.ETAPE.INDICE1;
      panneau.hidden = !ouvert;
      bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      if (ouvert && focaliser) { (formulaire.hidden ? fermer : champ).focus(); }
    }
    bouton.addEventListener('click', () => ouvrir(!ouvert, true));
    fermer.addEventListener('click', () => { ouvrir(false); bouton.focus(); });
    panneau.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ouvrir(false); bouton.focus(); } });
    formulaire.addEventListener('submit', (ev) => {
      ev.preventDefault();
      try { appliquer(session.envoyer({ type: 'reponse', texte: champ.value })); } catch (e) { /* ignoré */ }
    });

    // ---- bouton secret dans le décor ----
    function poserBouton() {
      if (zoneBouton || session.etat().etape < L.ETAPE.DEBLOQUE) return;
      zoneBouton = api.zone('Bouton secret du royaume', L.BOUTON_BOITE, {
        min: 24, z: 3,
        clic: () => appliquer(session.envoyer({ type: 'bouton' }))
      }) || true; // true : zone indisponible (pas de scène), on n'essaie pas deux fois
    }
    api.dessin((c, t) => {
      if (session.etat().etape < L.ETAPE.DEBLOQUE) return;
      const [x, y] = L.BOUTON_BOITE;
      c.fillStyle = '#6b4a12'; c.fillRect(x, y + 1, 8, 6); c.fillRect(x + 1, y, 6, 8);
      c.fillStyle = '#d9a82e'; c.fillRect(x + 1, y + 1, 6, 6);
      c.fillStyle = '#fff3b0'; c.fillRect(x + 2, y + 2, 2, 1);
      if (api.calme() || (t % 3200) < 260) { c.fillStyle = '#ffffff'; c.fillRect(x + 5, y + 1, 1, 1); }
      if (!api.calme()) api.salir();
    });

    // ---- effets ----
    function parler(texte, delai) { attendre(() => api.bulle('kinan', texte, 4200), delai || 0); }
    function appliquer(effets) {
      for (const f of effets) {
        if (f.type === 'indice') {
          rendre();
          parler(f.numero === 1 ? L.BULLES.indice1 : L.BULLES.indice2, 2800); // après la bulle de l'objet
          ouvrir(true);
          api.son({ type: 'triangle', f0: 520, f1: 780, duree: 0.3, volume: 0.04 });
        } else if (f.type === 'rate') {
          retour.textContent = L.RATES[rates++ % L.RATES.length];
        } else if (f.type === 'debloque') {
          retour.textContent = ''; champ.value = '';
          rendre(); poserBouton(); ouvrir(true);
          parler(L.BULLES.debloque, 0);
          api.son({ type: 'sine', f0: 440, f1: 880, duree: 0.5, volume: 0.05 });
        } else if (f.type === 'jean') {
          api.emettre('kinan-egg-jean', { source: 'chasse' }); // la cinématique de jean.js écoute cet évènement
        }
      }
    }

    api.ecouter('kinan-egg-objet', (d) => {
      const effets = session.envoyer({ type: 'objet', id: L.idDepuisLabel(d && d.label) });
      if (effets.length) appliquer(effets);
    });

    rendre(); poserBouton();
  });
})();
