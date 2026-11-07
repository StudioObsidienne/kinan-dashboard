// Boutons de l'en-tête : Gestion, Sons, Tester le son. 0 jeton.
(() => {
  const api = window.kinanUI;
  if (!api) return;
  const gestion = document.getElementById('btn-gestion');
  const son = document.getElementById('btn-son');
  const test = document.getElementById('btn-test');

  gestion.addEventListener('click', () => api.ouvrirGestion());
  const legende = document.getElementById('btn-legende');
  if (legende) legende.addEventListener('click', () => api.ouvrirLegende());
  test.addEventListener('click', () => api.testerSon());

  const afficher = (actif) => {
    son.textContent = 'Sons : ' + (actif ? 'oui' : 'non');
    son.setAttribute('aria-pressed', String(actif));
  };
  let actif = true;
  api.sonActif().then((v) => { actif = v !== false; afficher(actif); }).catch(() => afficher(true));
  son.addEventListener('click', () => { actif = !actif; api.reglerSon(actif); afficher(actif); });
})();

// TOKEN OUT : enseigne quand la limite d'utilisation Claude est atteinte (détectée par le processus principal). 0 jeton.
(() => {
  const bandeau = document.getElementById('tokenout'), sous = document.getElementById('tk-sous');
  const pastille = document.getElementById('pastille-tokenout'), masquer = document.getElementById('tk-masquer');
  if (!bandeau) return;
  const api = window.kinanUI;
  const demo = /[?&]tokenout=1/.test(location.search); // ?demo=1&tokenout=1 : force l'affichage (captures)
  let etat = { actif: false }, masque = false, cleMasque = null;
  // L'enseigne est dessinée par scene.js (accrochée dans la scène) : on lui signale seulement si elle doit être visible.
  const signaler = (v, flash) => document.dispatchEvent(new CustomEvent('kinan-tokenout', { detail: { visible: v, flash: !!flash } })); // flash : nouvel épisode, un seul flash d'impact
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const jourP = (ms) => new Date(ms).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const quand = (e) => (jourP(e.reprise) === jourP(Date.now()) ? hhmm(e.reprise)
    : new Date(e.reprise).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) + ' ' + hhmm(e.reprise));
  const duree = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min'; };
  const typeTxt = (t) => (t === '5 h' ? 'Limite 5 h atteinte' : t === 'semaine' ? 'Limite hebdomadaire atteinte' : "Limite d'utilisation atteinte");
  function rendre() {
    const actif = etat.actif && etat.reprise > Date.now();
    if (!actif) { bandeau.hidden = true; pastille.hidden = true; signaler(false); return; }
    const cle = String(etat.depuis);
    const neuf = cle !== cleMasque;
    if (neuf) { cleMasque = cle; masque = false; }
    const retour = etat.repriseInconnue ? 'reprise inconnue' : 'retour à ' + quand(etat);
    sous.replaceChildren(document.createTextNode(typeTxt(etat.type) + ' · ' + retour));
    if (!etat.repriseInconnue) { sous.append(document.createTextNode(' · dans '), Object.assign(document.createElement('b'), { textContent: duree(etat.reprise - Date.now()) })); }
    bandeau.hidden = masque;
    signaler(!masque, neuf);
    pastille.hidden = !masque;
    pastille.textContent = 'TOKEN OUT' + (etat.repriseInconnue ? '' : ' · ' + hhmm(etat.reprise));
  }
  const appliquer = (e) => { etat = e || { actif: false }; rendre(); };
  masquer.addEventListener('click', () => { masque = true; rendre(); });
  pastille.addEventListener('click', () => { masque = false; rendre(); });
  if (demo) appliquer({ actif: true, type: '5 h', reprise: Date.now() + 72 * 60000, depuis: 1 });
  else if (api && api.tokenOutLire) { api.tokenOutLire().then(appliquer).catch(() => {}); if (api.surTokenOut) api.surTokenOut(appliquer); }
  setInterval(rendre, 15000);
})();

// REFAIRE CONVERSATION : bandeau ambre quand la conversation Claude la plus récente est trop longue. TOKEN OUT prioritaire. 0 jeton.
(() => {
  const bandeau = document.getElementById('relais'), info = document.getElementById('rl-info');
  const copier = document.getElementById('rl-copier'), reporter = document.getElementById('rl-reporter');
  if (!bandeau) return;
  const api = window.kinanUI;
  const demo = /[?&]relais=1/.test(location.search); // ?demo=1&relais=1 : force l'affichage (captures)
  let etat = { actif: false }, reporte = 0;
  const texte = (e) => { const h = Math.floor(e.minutes / 60), m = String(e.minutes % 60).padStart(2, '0');
    return 'ouverte depuis ' + h + ' h ' + m + ' · contexte ' + Math.round(e.ctx / 1000) + ' k jetons'; };
  function rendre() {
    const tk = document.getElementById('tokenout'), pt = document.getElementById('pastille-tokenout');
    const visible = etat.actif && Date.now() >= Math.max(reporte, etat.reporteJusqua || 0) && !(tk && !tk.hidden) && !(pt && !pt.hidden);
    if (visible) info.textContent = texte(etat);
    bandeau.hidden = !visible;
  }
  const box = document.getElementById('conv-box'), cvt = document.getElementById('cv-texte');
  function boite() {
    if (!box || !etat.titre) { if (box) box.hidden = true; return; }
    const h = Math.floor((etat.minutes || 0) / 60), m = String((etat.minutes || 0) % 60).padStart(2, '0');
    cvt.textContent = etat.titre + ' · ' + h + ' h ' + m + ' · ' + Math.round((etat.ctx || 0) / 1000) + ' k' + (etat.inactive ? ' · inactive' : '');
    box.classList.toggle('vieille', !!etat.inactive); box.hidden = false;
    const pr = document.getElementById('cv-prochain'), prt = document.getElementById('cv-prochain-t');
    if (pr) {
      const sMin = etat.seuilMin || 120, sK = Math.round((etat.seuilCtx || 300000) / 1000);
      const reste = sMin - (etat.minutes || 0), maintenant = etat.actif || reste <= 0;
      const restK = Math.max(0, Math.round(sK - (etat.ctx || 0) / 1000));
      prt.textContent = maintenant ? 'Prochain relais : maintenant' : 'Prochain relais : ' + reste + ' min ou ' + restK + ' k jetons';
      pr.classList.toggle('urgent', maintenant || reste <= 15); pr.hidden = !!etat.inactive;
    }
  }
  // Sous-titre : « titreBureau » (configuration) dans le dossier de travail ; ailleurs, « Agent · nom de la conversation ».
  const sousTitre = document.getElementById('sous-titre');
  const cfg = window.kinan && window.kinan.config;
  if (sousTitre) sousTitre.textContent = (cfg && cfg.titreBureau) || (/^fr/i.test(navigator.language || '') ? 'Bureau des agents' : 'Agents desk');
  const parDefaut = sousTitre ? sousTitre.textContent : '';
  function titreFenetre() {
    if (!sousTitre) return;
    const hors = etat.hors && etat.titre;
    sousTitre.textContent = hors ? 'Agent · ' + etat.titre : parDefaut;
  }
  const appliquer = (e) => { etat = e || { actif: false }; rendre(); boite(); titreFenetre(); };
  reporter.addEventListener('click', () => { reporte = Date.now() + 20 * 60000; rendre(); if (api && api.relaisReporter) api.relaisReporter().catch(() => {}); });
  copier.addEventListener('click', () => {
    const ok = () => { copier.textContent = 'Copié'; setTimeout(() => { copier.textContent = 'Copier /relais'; }, 1500); };
    if (api && api.relaisCopier) api.relaisCopier().then(ok).catch(() => {});
  });
  if (demo) appliquer({ actif: true, titre: 'Reprends', minutes: 130, ctx: 340000, hors: true });
  else if (api && api.relaisLire) { api.relaisLire().then(appliquer).catch(() => {}); if (api.surRelais) api.surRelais(appliquer); }
  setInterval(rendre, 5000);
})();

// Barre de pastilles : une pastille par conversation Claude Code (plugin 0.3.0). Cliquer affiche les agents de cette conversation.
// « Récente » (défaut) suit la conversation la plus récente, comme avant ; « Toutes » fusionne. Affichée seulement à partir de 2 conversations.
// Le rendu ne reçoit que { id, libelle, etat, actifs, maj } par conversation. 0 jeton.
(() => {
  const zone = document.getElementById('sess-bulles'), api = window.kinanUI;
  if (!zone) return;
  const MAX = 5; // au-delà : pastille « +n »
  const ORDRE = { erreur: 3, doute: 2, travail: 1, repos: 0 };
  const NOM_ETAT = { erreur: 'erreur', doute: 'en attente', travail: 'au travail', repos: 'au repos' };
  let donnees = { choisie: 'recente', sessions: [] }, deplie = false, edition = null, focusId = null;
  const groupe = document.createElement('div');
  groupe.className = 'sb-groupe'; groupe.setAttribute('role', 'radiogroup'); groupe.setAttribute('aria-label', 'Conversations');
  const plus = document.createElement('button');
  plus.type = 'button'; plus.className = 'sb-plus'; plus.setAttribute('aria-expanded', 'false'); plus.hidden = true;
  const annonce = document.createElement('span');
  annonce.className = 'sb-cache'; annonce.setAttribute('aria-live', 'polite');
  zone.append(groupe, plus);
  zone.after(annonce); // hors de la barre masquée : l'annonce de repli reste lue

  const pire = (liste) => liste.reduce((m, s) => (ORDRE[s.etat] > ORDRE[m] ? s.etat : m), 'repos');
  const cache = (t) => Object.assign(document.createElement('span'), { className: 'sb-cache', textContent: t });
  function pastille(id, libelle, etat, actifs, titre) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sb-pastille ' + (ORDRE[etat] !== undefined ? etat : 'repos'); b.dataset.id = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === donnees.choisie));
    if (titre) b.title = titre;
    const pt = document.createElement('i'); pt.className = 'pt'; pt.setAttribute('aria-hidden', 'true');
    const t = document.createElement('span'); t.className = 'lib'; t.textContent = libelle;
    b.append(pt, t, cache(', ' + (NOM_ETAT[etat] || NOM_ETAT.repos)));
    if (actifs > 0) {
      const n = document.createElement('span'); n.className = 'n'; n.setAttribute('aria-hidden', 'true'); n.textContent = String(actifs);
      b.append(n, cache(', ' + actifs + (actifs > 1 ? ' agents au travail' : ' agent au travail')));
    }
    return b;
  }
  function rendre() {
    if (edition) return; // renommage en cours : on ne redessine pas sous le curseur
    const sessions = donnees.sessions || [];
    zone.hidden = sessions.length < 2;
    if (zone.hidden) { groupe.textContent = ''; plus.hidden = true; return; }
    const recente = [...sessions].sort((a, b) => b.maj - a.maj)[0];
    const total = sessions.reduce((n, s) => n + (s.actifs || 0), 0);
    let visibles = deplie ? sessions : sessions.slice(0, MAX);
    const choisie = sessions.find((s) => s.id === donnees.choisie);
    if (choisie && !visibles.includes(choisie)) visibles = [...visibles.slice(0, MAX - 1), choisie];
    const items = [
      pastille('recente', 'Récente', recente.etat, recente.actifs, 'Suit la conversation la plus récente (' + recente.libelle + ')'),
      pastille('toutes', 'Toutes', pire(sessions), total, 'Agents de toutes les conversations'),
      ...visibles.map((s) => pastille(s.id, s.libelle, s.etat, s.actifs, 'Double-clic : renommer'))
    ];
    const actif = zone.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.id : null;
    groupe.replaceChildren(...items);
    // Tabulation : une seule pastille atteignable (celle qui a le focus, sinon la choisie) ; flèches pour les autres.
    const cible = items.find((b) => b.dataset.id === focusId) || items.find((b) => b.dataset.id === donnees.choisie) || items[0];
    for (const b of items) b.tabIndex = b === cible ? 0 : -1;
    if (actif) { const b = items.find((x) => x.dataset.id === actif); if (b) b.focus(); }
    const caches = sessions.length - visibles.length;
    plus.hidden = sessions.length <= MAX;
    plus.textContent = deplie ? 'Moins' : '+' + caches;
    plus.setAttribute('aria-expanded', String(deplie));
    plus.setAttribute('aria-label', deplie ? 'Réduire la liste des conversations' : caches + ' autres conversations');
  }
  const choisir = (id) => {
    if (!api || !api.sessionChoisir) return;
    focusId = id;
    api.sessionChoisir(id).then((r) => { if (r && r.ok) { donnees.choisie = r.choisie; rendre(); } }).catch(() => {});
  };
  groupe.addEventListener('click', (e) => { const b = e.target.closest('.sb-pastille'); if (b && !edition) choisir(b.dataset.id); });
  groupe.addEventListener('keydown', (e) => {
    if (edition || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const items = [...groupe.querySelectorAll('.sb-pastille')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    for (const b of items) b.tabIndex = -1;
    items[j].tabIndex = 0; items[j].focus(); focusId = items[j].dataset.id;
  });
  // Double-clic : renommer (Entrée valide, Échap annule ; vide : nom du dossier). Enregistré par le processus principal.
  groupe.addEventListener('dblclick', (e) => {
    const b = e.target.closest('.sb-pastille');
    if (!b || b.dataset.id === 'recente' || b.dataset.id === 'toutes' || !api || !api.sessionRenommer) return;
    const s = (donnees.sessions || []).find((x) => x.id === b.dataset.id);
    if (!s) return;
    edition = s.id;
    const champ = Object.assign(document.createElement('input'), { type: 'text', value: s.libelle, maxLength: 40, className: 'sb-champ' });
    champ.setAttribute('aria-label', 'Nom de la conversation');
    const finir = (garder) => {
      if (!edition) return;
      const id = edition; edition = null;
      if (garder && champ.value.trim() !== s.libelle) api.sessionRenommer(id, champ.value).catch(() => {});
      rendre();
      const nb = groupe.querySelector('[data-id="' + CSS.escape(id) + '"]'); if (nb) nb.focus();
    };
    champ.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') finir(true); else if (k.key === 'Escape') finir(false); });
    champ.addEventListener('blur', () => finir(true));
    champ.addEventListener('click', (k) => k.stopPropagation());
    b.replaceWith(champ); champ.focus(); champ.select();
  });
  plus.addEventListener('click', () => { deplie = !deplie; rendre(); });
  const appliquer = (d) => {
    if (!d || !Array.isArray(d.sessions)) d = { choisie: 'recente', sessions: [] }; // format inconnu ou illisible : barre masquée
    if (d.repli) annonce.textContent = 'Conversation fermée : retour à la plus récente.';
    donnees = d; rendre();
  };
  if (/[?&]relais=1/.test(location.search)) appliquer({ choisie: 'recente', sessions: [ // ?demo=1&relais=1 : affichage forcé (captures)
    { id: 'demo-a', libelle: 'site', etat: 'travail', actifs: 2, maj: Date.now() - 20000 },
    { id: 'demo-b', libelle: 'site · 2', etat: 'doute', actifs: 0, maj: Date.now() - 90000 },
    { id: 'demo-c', libelle: 'documentation', etat: 'repos', actifs: 0, maj: Date.now() - 300000 } ] });
  else if (api && api.sessionsLire) { api.sessionsLire().then(appliquer).catch(() => {}); if (api.surSessions) api.surSessions(appliquer); }
})();
