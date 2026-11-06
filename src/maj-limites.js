// Version de l'appli (coche verte quand elle est à jour), pastille « mise à jour disponible » avec ses étapes,
// et bulle rouge « limite » quand il reste 10 % ou moins de la limite 5 h ou hebdomadaire de Claude Code. 0 jeton.
(() => {
  'use strict';
  const api = window.kinanUI;
  if (!api || !api.majLire) return;
  const $ = (id) => document.getElementById(id);
  const ver = $('version'), verTxt = $('version-txt'), verPlugin = $('version-plugin'), pastille = $('pastille-maj');
  const carte = $('maj-carte'), corps = $('maj-corps'), msg = $('maj-msg'), go = $('maj-go'), fermer = $('maj-fermer');
  let etat = null;
  const el = (tag, txt, cls) => { const n = document.createElement(tag); if (txt) n.textContent = txt; if (cls) n.className = cls; return n; };
  const code = (t) => el('code', t);
  const dateCourte = (ms) => new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function rendre() {
    if (!etat || !ver) return;
    const nouv = ['appli', 'plugin'].filter((k) => etat[k] && etat[k].nouvelle);
    const relancer = !!(etat.appli && etat.appli.aRelancer);
    const aJour = etat.active && !!etat.verifie && !nouv.length;
    verTxt.textContent = 'v' + etat.appli.locale;
    verPlugin.hidden = !(etat.plugin && etat.plugin.locale);
    if (!verPlugin.hidden) verPlugin.textContent = 'v' + etat.plugin.locale + ' Plugin';
    ver.classList.toggle('a-jour', aJour);
    ver.title = !etat.active ? 'Version du tableau de bord · vérification désactivée (kinan.config.json : miseAJour.verifier)'
      : !etat.verifie ? 'Version installée. Pas encore vérifiée (hors ligne ?).'
        : (aJour ? 'À jour' : 'Mise à jour disponible') + ' (vérifié le ' + dateCourte(etat.verifie) + ')';
    ver.setAttribute('aria-label', 'Version ' + etat.appli.locale + (aJour ? ', à jour' : ''));
    ver.hidden = false;
    pastille.hidden = !nouv.length && !relancer;
    pastille.textContent = relancer && !nouv.length ? 'relance pour terminer la mise à jour'
      : nouv.length === 2 ? 'mises à jour : tableau de bord et plugin' : nouv[0] === 'plugin' ? 'mise à jour du plugin (dans Claude Code)' : 'mise à jour du tableau de bord';
    if (carte.open) remplir();
    annoncer();
  }

  // Pop-up « Nouvelle mise à jour » : seulement si la vérification est active et pour une version jamais annoncée
  // (le processus principal tient la liste « aAnnoncer » et mémorise l'annonce dès l'affichage : une seule fois par version).
  const popup = $('maj-popup'), popupCorps = $('maj-popup-corps'), popupGo = $('maj-popup-go'), popupTard = $('maj-popup-tard');
  function annoncer() {
    if (!popup || !etat.active || !Array.isArray(etat.aAnnoncer) || !etat.aAnnoncer.length || !popup.hidden) return;
    const lignes = etat.aAnnoncer.map((k) => el('p', (k === 'appli' ? 'Tableau de bord (cette appli)' : 'Plugin Claude Code (kinan-orchestre)') + ' : v' + etat[k].locale + ' → v' + etat[k].distante));
    if (etat.aAnnoncer.includes('plugin')) lignes.push(el('p', 'Le plugin se met à jour dans Claude Code, pas ici : clique « Voir comment ». Les deux numéros de version sont indépendants.'));
    popupCorps.replaceChildren(...lignes);
    popupGo.textContent = etat.appli.nouvelle && etat.git && etat.git.possible ? 'Mettre à jour' : 'Voir comment';
    popup.hidden = false;
    if (api.majVu) api.majVu().catch(() => {});
  }
  if (popup) {
    popupTard.addEventListener('click', () => { popup.hidden = true; });
    // « Mettre à jour » : appli -> flux git existant (confirmation, git pull --ff-only) ; plugin -> étapes /plugin dans la carte.
    popupGo.addEventListener('click', () => {
      popup.hidden = true;
      msg.textContent = ''; remplir(); carte.showModal();
      if (etat.appli.nouvelle && etat.git && etat.git.possible) go.click();
    });
  }

  function remplir() {
    corps.replaceChildren();
    const a = etat.appli, p = etat.plugin;
    corps.append(el('p', 'Tableau de bord (cette appli) : v' + a.locale + (a.distante ? ' installée, v' + a.distante + ' publiée.' : ' installée.')));
    if (p && p.locale) corps.append(el('p', 'Plugin Claude Code (kinan-orchestre) : v' + p.locale + (p.distante ? ' installé, v' + p.distante + ' publié.' : ' installé.')));
    if (p && p.locale) corps.append(el('p', 'Ce sont deux éléments distincts, avec chacun son numéro de version.'));
    if (!etat.active) corps.append(el('p', 'La vérification des mises à jour est désactivée (aucune connexion). Voir le README pour l\'activer.'));
    else if (!etat.verifie) corps.append(el('p', 'Pas encore vérifié : pas de réseau ou GitHub injoignable. Nouvel essai plus tard.'));
    else if (a.aRelancer) corps.append(el('p', 'Appli mise à jour : relance-la pour terminer.'));
    else if (!a.nouvelle && !(p && p.nouvelle)) corps.append(el('p', 'Tout est à jour (vérifié le ' + dateCourte(etat.verifie) + ').'));
    if (a.nouvelle) {
      const ol = el('ol');
      if (etat.git && etat.git.possible) {
        const li = el('li'); li.append('Clique « Mettre à jour » (', code('git pull --ff-only'), ', après confirmation).'); ol.append(li, el('li', 'Relance l\'appli.'));
      } else {
        const l2 = el('li'); l2.append('Dans le dossier de l\'appli : ', code('git pull'), ' (puis ', code('npm install'), ' si demandé).');
        ol.append(el('li', 'Ferme Kinan Orchestre.'), l2, el('li', 'Relance l\'appli.'));
      }
      corps.append(el('p', 'Mettre à jour le tableau de bord :'), ol);
      if (etat.git && !etat.git.possible && etat.git.raison) corps.append(el('p', 'Mise à jour automatique impossible : ' + etat.git.raison + '.'));
    }
    if (p && p.nouvelle) {
      const ol = el('ol');
      const l1 = el('li'); l1.append('Dans un terminal : ', code('claude plugin marketplace update kinan'));
      const l2 = el('li'); l2.append('Puis : ', code('claude plugin update kinan-orchestre@kinan'));
      ol.append(l1, l2, el('li', 'Redémarre Claude Code.'));
      corps.append(el('p', 'Mettre à jour le plugin (dans Claude Code, pas dans cette appli) :'), ol);
      corps.append(el('p', 'Si « Update » répond « latest version » alors que ce n\'est pas vrai, la première commande rafraîchit la liste. Plugin installé par git : git pull dans son dossier.'));
    }
    go.hidden = !(a.nouvelle && etat.git && etat.git.possible);
  }

  ver.addEventListener('click', () => { if (!etat) return; msg.textContent = ''; remplir(); carte.showModal(); });
  pastille.addEventListener('click', () => ver.click());
  fermer.addEventListener('click', () => carte.close());
  go.addEventListener('click', async () => {
    go.disabled = true; msg.textContent = 'Confirmation demandée…';
    try { const r = await api.majAppliquer(); msg.textContent = (r && r.message) || ''; } catch { msg.textContent = 'Échec de la mise à jour.'; }
    go.disabled = false;
  });

  const appliquer = (e) => { if (e && e.appli) { etat = e; rendre(); } };
  api.majLire().then(appliquer).catch(() => {});
  if (api.surMaj) api.surMaj(appliquer);

  // ---- Bulle rouge « limite » : 10 % ou moins restant sur la fenêtre 5 h ou hebdomadaire ----
  const bulle = $('bulle-limite');
  const SEUIL = 10;
  let limites = { fenetres: [] };
  const hhmm = (ms) => new Date(ms).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  function rendreLimites() {
    if (!bulle) return;
    const basses = (limites.fenetres || []).filter((f) => f.restant <= SEUIL && (!f.reprise || f.reprise > Date.now()));
    if (!basses.length) { bulle.hidden = true; return; }
    const fmt = (n) => String(n).replace('.', ',');
    bulle.textContent = 'Limite ' + basses.map((f) => f.libelle + ' : ' + fmt(f.restant) + ' % restant').join(' · ');
    bulle.title = basses.map((f) => 'Limite ' + f.libelle + (f.reprise ? ' : reprise ' + hhmm(f.reprise) : '')).join('\n');
    bulle.hidden = false;
  }
  if (api.limitesLire) { api.limitesLire().then((l) => { limites = l || limites; rendreLimites(); }).catch(() => {}); }
  if (api.surLimites) api.surLimites((l) => { limites = l || limites; rendreLimites(); });
  setInterval(rendreLimites, 30000);
})();
