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
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const jourP = (ms) => new Date(ms).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const quand = (e) => (jourP(e.reprise) === jourP(Date.now()) ? hhmm(e.reprise)
    : new Date(e.reprise).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) + ' ' + hhmm(e.reprise));
  const duree = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min'; };
  const typeTxt = (t) => (t === '5 h' ? 'Limite 5 h atteinte' : t === 'semaine' ? 'Limite hebdomadaire atteinte' : "Limite d'utilisation atteinte");
  function rendre() {
    const actif = etat.actif && etat.reprise > Date.now();
    if (!actif) { bandeau.hidden = true; pastille.hidden = true; return; }
    const cle = String(etat.depuis);
    if (cle !== cleMasque) { cleMasque = cle; masque = false; }
    const retour = etat.repriseInconnue ? 'reprise inconnue' : 'retour à ' + quand(etat);
    sous.replaceChildren(document.createTextNode(typeTxt(etat.type) + ' · ' + retour));
    if (!etat.repriseInconnue) { sous.append(document.createTextNode(' · dans '), Object.assign(document.createElement('b'), { textContent: duree(etat.reprise - Date.now()) })); }
    bandeau.hidden = masque;
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

// Bulles « autres projets » : travail des autres conversations Claude en temps réel (sessions.json, mis à jour par les hooks).
(() => {
  const zone = document.getElementById('sess-bulles'), api = window.kinanUI;
  if (!zone) return;
  let sessions = {};
  function rendre() {
    const now = Date.now();
    const liste = Object.values(sessions).filter((s) => s && s.maj && now - s.maj < 15 * 60000).sort((a, b) => b.maj - a.maj);
    // La plus récente = la conversation en cours (déjà dans la boîte). Les autres : bulle seulement si elles travaillent encore
    // (une conversation au repos disparaît ; « travail » sans nouvelle depuis 5 min = abandonnée, on la masque).
    const autres = liste.slice(1).filter((s) => s.etat === 'doute' || s.etat === 'erreur' || (s.etat === 'travail' && now - s.maj < 5 * 60000));
    zone.textContent = '';
    for (const s of autres.slice(0, 4)) {
      const b = document.createElement('div'); b.className = 'sess-bulle ' + (s.etat || 'repos');
      const p = document.createElement('i'); p.className = 'pt';
      const t = document.createElement('span'); t.className = 't';
      const n = document.createElement('b'); n.textContent = String(s.titre || s.projet || 'Conversation');
      const sec = Math.round((now - s.maj) / 1000), ago = sec < 60 ? sec + ' s' : Math.round(sec / 60) + ' min';
      t.append(n, ' · ' + ((String(s.tache || '') || 'au travail') + ' · ' + ago));
      b.append(p, t); zone.append(b);
    }
  }
  const appliquer = (d) => { sessions = d || {}; rendre(); };
  if (/[?&]relais=1/.test(location.search)) appliquer({ a: { projet: 'ce-projet', etat: 'repos', maj: Date.now() }, b: { projet: 'x', titre: 'Documentation', etat: 'travail', tache: 'skyze : guide d\'installation', maj: Date.now() - 20000 }, c: { projet: 'x', titre: 'Revue de code', etat: 'doute', tache: "J'attends ton feu vert", maj: Date.now() - 90000 } });
  else if (api && api.sessionsLire) { api.sessionsLire().then(appliquer).catch(() => {}); if (api.surSessions) api.surSessions(appliquer); }
  setInterval(rendre, 5000);
})();
