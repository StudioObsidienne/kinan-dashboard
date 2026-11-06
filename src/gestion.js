// Fenêtre Gestion. Tout le texte venant de fichiers est inséré avec textContent (jamais en HTML).
'use strict';
// Équipe : le juge puis les agents de kinan.config.json (validés par le processus principal) ; sinon l'équipe par défaut.
const CFG = (window.kinan && window.kinan.config) || null;
const EQUIPE = CFG && Array.isArray(CFG.agents) ? CFG.agents
  : [{ id: 'drafion', nom: 'Drafion', base: 'lecture' }, { id: 'skyze', nom: 'Skyze', base: 'production' }, { id: 'johms', nom: 'Johms', base: 'expert' }];
const AGENTS = ['kinan', ...EQUIPE.map((a) => a.id)];
const NOM = Object.fromEntries([['kinan', 'Kinan'], ...EQUIPE.map((a) => [a.id, a.nom])]);
const nomAgent = (id) => NOM[id] || id;
const deBase = (b) => EQUIPE.filter((a) => a.base === b).map((a) => a.id);
// Niveaux de coût : si l'agent voulu est occupé, on propose un agent libre du même niveau (même base).
const NIVEAUX = [deBase('expert'), deBase('production'), deBase('lecture'), ...EQUIPE.filter((a) => !['expert', 'production', 'lecture'].includes(a.base)).map((a) => [a.id])];

const $ = (id) => document.getElementById(id);
function el(tag, props, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') n.className = v; else if (k === 'texte') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const e of enfants) if (e != null) n.append(e);
  return n;
}
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ----- Recherche : filtre en direct, compteur, Échap pour effacer -----
function brancherRecherche(id, redessiner) {
  const champ = $(id);
  champ.addEventListener('input', redessiner);
  champ.addEventListener('keydown', (e) => { if (e.key === 'Escape' && champ.value) { champ.value = ''; redessiner(); e.stopPropagation(); } });
}
const compteur = (id, n, q) => { $(id).textContent = q ? n + ' résultat' + (n > 1 ? 's' : '') : ''; };

// ----- Règle de mots-clés (0 jeton) -----
// Mots-clés -> base d'agent ; l'agent proposé est le premier agent configuré de cette base.
const REGLES = [
  ['expert', ['shader', 'animation', 'webgl', 'bug difficile', 'conception', 'architecture']],
  ['production', ['css', 'page', 'texte', 'seo', 'design', 'harmonis', 'doc']],
  ['lecture', ['verifier', 'lire', 'chercher', 'lighthouse', 'en ligne', 'controle', 'mesure']]
];
function proposerAgent(titre) {
  const t = norm(titre);
  for (const [base, mots] of REGLES) if (mots.some((m) => t.includes(m)) && deBase(base).length) return deBase(base)[0];
  return deBase('production')[0] || EQUIPE.length && EQUIPE[0].id || 'kinan';
}

// ----- Onglets -----
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  for (const s of ['taches', 'histo', 'jetons', 'courrier']) $(s).hidden = s !== b.dataset.onglet;
  if (b.dataset.onglet === 'histo') chargerHisto();
  if (b.dataset.onglet === 'taches') rafraichirTaches();
  if (b.dataset.onglet === 'jetons') chargerJetons();
  if (b.dataset.onglet === 'courrier') chargerCourrier();
}));

// ----- Onglet 1 : tâches -----
let etat = { agents: {} };
let taches = [];
const libre = (a) => ((etat.agents || {})[a] || { etat: 'repos' }).etat === 'repos';

function suivantLibre(agent) {
  const niveau = NIVEAUX.find((n) => n.includes(agent)) || [];
  return niveau.find((a) => a !== agent && libre(a)) || null;
}

async function rafraichirTaches() {
  etat = (await window.gestion.etat()) || { agents: {} };
  taches = ((await window.gestion.tachesLire()) || {}).taches || [];
  $('agents-etat').replaceChildren(...AGENTS.map((a) => {
    const ok = libre(a);
    return el('span', { class: 'badge' + (ok ? '' : ' occupe') }, el('i'), `${nomAgent(a)} : ${ok ? 'opérationnel' : 'occupé'}`);
  }));
  dessinerTaches();
}
function dessinerTaches() {
  const ul = $('liste-taches');
  const q = norm($('rech-taches').value.trim());
  const visibles = taches.filter((t) => !q || norm(`${t.titre} ${t.agent} ${t.statut}`).includes(q));
  compteur('cpt-taches', visibles.length, q);
  if (!taches.length) { ul.replaceChildren(el('li', { class: 'muet', texte: "Aucune tâche pour l'instant. Écris-en une dans le champ ci-dessus." })); return; }
  if (!visibles.length) { ul.replaceChildren(el('li', { class: 'muet', texte: 'Aucune tâche ne correspond à la recherche.' })); return; }
  ul.replaceChildren(...visibles.slice().reverse().map((t) => {
    const sel = el('select', { 'aria-label': 'Statut' }, ...['à faire', 'en cours', 'fait'].map((s) => {
      const o = el('option', { value: s, texte: s }); if (s === t.statut) o.selected = true; return o;
    }));
    sel.addEventListener('change', async () => { t.statut = sel.value; const ok = await window.gestion.tachesEcrire({ taches, modifies: [t.id] }); if (ok === false) alert('Les tâches sont occupées pour le moment : réessaie dans un instant.'); rafraichirTaches(); });
    const ok = libre(t.agent);
    return el('li', { class: t.statut === 'fait' ? 'fait' : '' },
      el('span', { class: 'titre', texte: t.titre }),
      el('span', { class: 'muet', texte: `${nomAgent(t.agent)} (${ok ? 'opérationnel' : 'occupé'})` }),
      el('span', { class: 'muet', texte: t.cree || '' }), sel);
  }));
}

brancherRecherche('rech-taches', () => dessinerTaches());
$('form-tache').addEventListener('submit', (e) => {
  e.preventDefault();
  const titre = $('nouvelle').value.trim();
  if (!titre) return;
  const agent = proposerAgent(titre);
  const enc = $('proposition');
  const ok = libre(agent);
  const alt = ok ? null : suivantLibre(agent);
  const actions = el('div', { class: 'actions' });
  const ajouter = async (a) => {
    const id = taches.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;
    taches.push({ id, titre, agent: a, statut: 'à faire', cree: new Date().toISOString().slice(0, 10) });
    if ((await window.gestion.tachesEcrire({ taches, modifies: [id] })) === false) { alert('Les tâches sont occupées pour le moment : réessaie dans un instant.'); return; }
    $('nouvelle').value = ''; enc.hidden = true; rafraichirTaches();
  };
  actions.append(el('button', { class: 'primaire', type: 'button', texte: `Confier à ${agent}`, onclick: () => ajouter(agent) }));
  if (alt) actions.append(el('button', { type: 'button', texte: `Confier à ${alt} (libre, même niveau)`, onclick: () => ajouter(alt) }));
  actions.append(el('select', { 'aria-label': 'Autre agent', onchange: (ev) => ev.target.value && ajouter(ev.target.value) },
    el('option', { value: '', texte: 'Autre agent…' }), ...AGENTS.map((a) => el('option', { value: a, texte: nomAgent(a) }))));
  actions.append(el('button', { type: 'button', texte: 'Annuler', onclick: () => { enc.hidden = true; } }));
  let msg = `Agent le plus économe : ${agent} (${ok ? 'opérationnel' : 'occupé'}).`;
  if (!ok) msg += alt ? ` ${alt} est libre au même niveau.` : ' Aucun agent libre au même niveau.';
  enc.replaceChildren(el('div', { texte: `« ${titre} »` }), el('div', { class: 'muet', texte: msg }), actions);
  enc.hidden = false;
});

// ----- Onglet 3 : historique -----
let histo = [];
function dessinerHisto() {
  const ag = $('filtre-agent').value, q = norm($('recherche').value.trim());
  const lignes = histo.filter((h) => (!ag || h.agent === ag) && (!q || norm(`${h.agent} ${h.etat} ${h.tache}`).includes(q)))
    .sort((a, b) => b.t - a.t).slice(0, 500);
  $('corps-histo').replaceChildren(...lignes.map((h) => el('tr', {},
    el('td', { texte: new Date(h.t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }),
    el('td', { texte: nomAgent(h.agent) }), el('td', { class: 'e-' + h.etat, texte: h.etat }), el('td', { texte: h.tache || '' }))));
  $('vide-histo').hidden = lignes.length > 0;
  compteur('cpt-histo', lignes.length, q || ag);
}
async function chargerHisto() { histo = await window.gestion.historique(); dessinerHisto(); }
AGENTS.forEach((a) => $('filtre-agent').append(el('option', { value: a, texte: nomAgent(a) })));
$('filtre-agent').addEventListener('change', dessinerHisto);
brancherRecherche('recherche', dessinerHisto);
$('rafraichir-histo').addEventListener('click', chargerHisto);

// ----- Onglet 4 : jetons (journaux locaux), version simple : jour / semaine / mois + estimation en euros -----
const nf = (n) => Number(n).toLocaleString('fr-FR');
// Format lisible : 1,2 M, 785 k, 1 284
function court(n) {
  n = Number(n);
  if (n >= 1e6) return (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: n >= 1e7 ? 0 : 1 }) + ' M';
  if (n >= 1e4) return Math.round(n / 1e3).toLocaleString('fr-FR') + ' k';
  return nf(n);
}
const eur = (v) => '≈ ' + (v >= 100 ? Math.round(v).toLocaleString('fr-FR') : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' €';
function carteJetons(z, id) {
  const t = z.total;
  $('j-' + id).textContent = court(t.entree + t.sortie + t.cacheCree);
  $('j-' + id).title = nf(t.entree + t.sortie + t.cacheCree) + ' jetons (entrée ' + nf(t.entree) + ' + sortie ' + nf(t.sortie) + ' + cache créé ' + nf(t.cacheCree) + ')';
  $('e-' + id).textContent = eur(z.euros);
  $('c-' + id).textContent = 'cache lu : ' + court(t.cacheLu);
  $('c-' + id).title = nf(t.cacheLu) + ' jetons lus dans le cache (quasi gratuits)';
}
const MODELES_TARIF = [['haiku', 'Haiku 5.5'], ['sonnet', 'Sonnet 5.5'], ['opus', 'Opus 5.5']];
const CHAMPS_TARIF = ['entree', 'sortie', 'cacheEcriture', 'cacheLecture'];
function remplirTarifs(t) {
  const aConf = MODELES_TARIF.filter(([f]) => t.modeles[f].aConfirmer).map(([, n]) => n);
  $('tarifs-info').textContent = `Tarifs au ${t.maj.split('-').reverse().join('/')} · 1 $ = ${String(t.usdEur).replace('.', ',')} €` + (aConf.length ? ` · à confirmer : ${aConf.join(', ')}` : '') + ' ·';
  if (!$('tarifs-edit').hidden) return; // pas d'écrasement pendant la saisie
  $('taux-eur').value = t.usdEur;
  $('tarifs-corps').replaceChildren(...MODELES_TARIF.map(([f, nom]) => el('tr', {}, el('th', { texte: nom + (t.modeles[f].aConfirmer ? ' (à confirmer)' : '') }),
    ...CHAMPS_TARIF.map((k) => el('td', {}, el('input', { type: 'number', step: '0.001', min: '0', 'data-f': f, 'data-k': k, value: t.modeles[f][k] }))))));
}
$('tarifs-lien').addEventListener('click', (ev) => { ev.preventDefault(); $('tarifs-edit').hidden = !$('tarifs-edit').hidden; });
$('tarifs-enreg').addEventListener('click', async () => {
  const t = { usdEur: $('taux-eur').value, modeles: {} };
  for (const i of $('tarifs-corps').querySelectorAll('input')) (t.modeles[i.dataset.f] = t.modeles[i.dataset.f] || {})[i.dataset.k] = i.value;
  const ok = await window.gestion.reglerTarifs(t);
  $('tarifs-msg').textContent = ok ? 'Enregistré.' : 'Valeurs invalides.';
  if (ok) { $('tarifs-edit').hidden = true; chargerJetons(); }
});
$('tarifs-defaut').addEventListener('click', async () => { await window.gestion.tarifsDefaut(); $('tarifs-edit').hidden = true; $('tarifs-msg').textContent = ''; chargerJetons(); });
let chargementJetons = false;
async function chargerJetons() {
  if (chargementJetons) return;
  chargementJetons = true;
  try {
    const d = await window.gestion.jetons();
    if (!d) { $('maj-jetons').textContent = 'Lecture impossible.'; return; }
    if (document.activeElement !== $('ctx-max')) $('ctx-max').value = d.contexteMax;
    const c = d.contexte;
    if (c) {
      const pct = (c.tokens / d.contexteMax) * 100;
      $('jauge-ctx').style.width = Math.min(100, pct) + '%';
      $('jauge-ctx').style.background = pct > 90 ? 'var(--err)' : pct > 70 ? 'var(--alerte)' : 'var(--ok)';
      $('txt-ctx').textContent = `${nf(c.tokens)} / ${nf(d.contexteMax)} jetons (${pct.toFixed(1).replace('.', ',')} %) · ${c.modele}`;
    } else { $('jauge-ctx').style.width = '0'; $('txt-ctx').textContent = 'Aucune session trouvée.'; }
    carteJetons(d.jour, 'jour'); carteJetons(d.semaine, 'semaine'); carteJetons(d.mois, 'mois');
    remplirTarifs(d.tarifs);
    $('maj-jetons').textContent = `Mis à jour à ${new Date().toLocaleTimeString('fr-FR')} · ${d.nbFichiers} journaux`;
  } catch { $('maj-jetons').textContent = 'Erreur de lecture.'; } finally { chargementJetons = false; }
}
$('rafraichir-jetons').addEventListener('click', chargerJetons);
$('ctx-max').addEventListener('change', async () => { await window.gestion.reglerContexte($('ctx-max').value); chargerJetons(); });
// Ligne « Limite atteinte » en tête de l'onglet (TOKEN OUT, détecté par le processus principal)
(() => {
  const api = window.kinanUI; if (!api || !api.tokenOutLire) return;
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const afficher = (e) => {
    const l = $('limite-atteinte');
    if (!e || !e.actif || !(e.reprise > Date.now())) { l.hidden = true; return; }
    const quand = new Date(e.reprise).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) === new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
      ? hhmm(e.reprise) : new Date(e.reprise).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) + ' à ' + hhmm(e.reprise);
    l.textContent = 'Limite atteinte (' + (e.type === '5 h' ? '5 h' : e.type === 'semaine' ? 'hebdomadaire' : 'utilisation') + ') · ' + (e.repriseInconnue ? 'reprise inconnue' : 'retour à ' + quand);
    l.hidden = false;
  };
  api.tokenOutLire().then(afficher).catch(() => {});
  if (api.surTokenOut) api.surTokenOut(afficher);
})();
// Ligne « Refaire conversation » en tête de l'onglet (conversation la plus récente trop longue)
(() => {
  const api = window.kinanUI; if (!api || !api.relaisLire) return;
  const afficher = (e) => {
    const l = $('refaire-conv');
    if (!e || !e.actif) { l.hidden = true; return; }
    l.textContent = 'REFAIRE CONVERSATION · ouverte depuis ' + Math.floor(e.minutes / 60) + ' h ' + String(e.minutes % 60).padStart(2, '0') + ' · contexte ' + Math.round(e.ctx / 1000) + ' k jetons · tape /relais dans Claude';
    l.hidden = false;
  };
  api.relaisLire().then(afficher).catch(() => {});
  if (api.surRelais) api.surRelais(afficher);
})();
setInterval(() => { if (!$('jetons').hidden && !document.hidden) chargerJetons(); }, 60000);

rafraichirTaches();
setInterval(() => { if (!$('taches').hidden) rafraichirTaches(); }, 5000);

// ----- Onglet Courrier (option désactivée par défaut) -----
const C = window.courrier || null;
let FOURN = [], optionActive = false, typeRecap = 'mails', remplissageFait = false;
const msg = (id, t, classe) => { $(id).textContent = t || ''; $(id).className = classe || 'muet'; };
const champTexte = (nom, valeur) => el('div', { class: 'champ' }, el('b', { texte: nom }), el('span', { texte: String(valeur ?? '') }));
const fmt = (n, devise) => { try { return Number(n).toLocaleString('fr-FR', { style: 'currency', currency: /^[A-Z]{3}$/.test(devise || '') ? devise : 'EUR' }); } catch { return String(n); } };
const libSec = (s) => (s === 'starttls' ? 'STARTTLS' : 'SSL/TLS');
const decrireServeur = (s) => (s ? `${s.hote}:${s.port} (${libSec(s.securite)})` : '');

function aideFournisseur() {
  const f = FOURN.find((x) => x.id === $('c-fournisseur').value) || FOURN[FOURN.length - 1];
  if (!f) return;
  $('c-perso').hidden = f.id !== 'autre';
  $('c-serveurs').textContent = f.imap ? `Serveurs utilisés : lecture ${decrireServeur(f.imap)}, envoi ${decrireServeur(f.smtp)}.` : 'Saisis les serveurs indiqués par ton fournisseur (connexion chiffrée obligatoire).';
  $('c-aide').replaceChildren(el('strong', { texte: 'Mot de passe : ' }), f.motDePasse, el('br'), el('strong', { texte: 'Accès : ' }), f.activer);
}
// Récap lisible : une ligne par point, la première en titre, les urgences en couleur. Texte inséré comme texte, jamais comme HTML.
function afficherRecap(texte) {
  let lignes = String(texte).split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
  if (lignes.length === 1) lignes = lignes[0].split(/(?<=[.!?])\s+(?=[A-ZÉÈÀÂÔÎ0-9])/).map((l) => l.trim()).filter(Boolean);
  $('recap-texte').replaceChildren(...lignes.map((l, i) => el('div', { class: 'rl' + (i === 0 ? ' rt' : '') + (i > 0 && /urgen|suspect|attention|à vérifier/i.test(l) ? ' ra' : ''), texte: l })));
}
async function chargerCourrier() {
  if (!C) return;
  try {
    const o = await C.option();
    optionActive = !!o.actif; FOURN = o.fournisseurs || [];
    $('c-off').hidden = optionActive; $('c-on').hidden = !optionActive;
    if (!optionActive) return;
    if (!$('c-fournisseur').options.length) { $('c-fournisseur').replaceChildren(...FOURN.map((f) => el('option', { value: f.id, texte: f.nom }))); }
    const s = await C.statut();
    if (s.ok === false) return;
    if (!remplissageFait) { // valeurs enregistrées (jamais le mot de passe)
      remplissageFait = true;
      if (s.fournisseur) $('c-fournisseur').value = s.fournisseur;
      $('c-adresse').value = s.adresse || ''; $('c-identifiant').value = s.identifiant || '';
      if (s.fournisseur === 'autre' && s.serveurs) {
        $('c-imap-hote').value = s.serveurs.imap.hote; $('c-imap-port').value = s.serveurs.imap.port; $('c-imap-sec').value = s.serveurs.imap.securite;
        $('c-smtp-hote').value = s.serveurs.smtp.hote; $('c-smtp-port').value = s.serveurs.smtp.port; $('c-smtp-sec').value = s.serveurs.smtp.securite;
      }
    }
    aideFournisseur();
    const conn = $('etat-conn');
    if (!s.chiffrementDisponible) conn.textContent = "Le chiffrement du système n'est pas disponible : impossible d'enregistrer des identifiants.";
    else if (!s.configure) conn.textContent = "Aucune boîte connectée. Choisis ton fournisseur, saisis l'adresse et un mot de passe d'application, puis Enregistrer et Tester.";
    else conn.textContent = `Identifiants enregistrés pour ${s.adresse} (chiffrés)` + (s.etatConnexion === 'ok' ? ' : connexion vérifiée.' : s.etatConnexion === 'erreur' ? ' : dernier test en échec.' : ' : pas encore testés.') + (s.avertissements.length ? ' ' + s.avertissements.join(' ') : '');
    $('c-tester').disabled = $('c-relever').disabled = $('c-oublier').disabled = !s.configure;
    $('boite-info').textContent = !s.configure ? "Rien à relever tant que la boîte n'est pas connectée." :
      (s.derniereReleve ? 'Dernière relève : ' + new Date(s.derniereReleve).toLocaleString('fr-FR') + ' · ' + s.nouveaux + ' nouveau(x) mail(s)' : "Aucune relève pour l'instant.") +
      (s.ignores ? ' · ' + s.ignores + ' mail(s) illisible(s) ignoré(s)' : '') + ' · ' + s.totalMails + ' mail(s) en local' + (s.etatConnexion === 'ok' ? ' · relève automatique toutes les 30 min.' : '.') + (s.erreurReleve ? ' Dernière erreur : ' + s.erreurReleve : '');
    $('grille-info').textContent = s.grille.ok ? `Grille de prix : ${s.grille.lignes} ligne(s).` : `Devis : ${s.grille.erreur}. Copie exemples/grille-prix.exemple.json dans ${s.dossierEchange} sous le nom grille-prix.json, puis remplace les lignes fictives par tes prestations et tes prix.`;
    const e = await C.recapEtat();
    const lib = { repos: 'Aucun récap lancé.', 'en cours': 'En cours… (Claude travaille en arrière-plan)', termine: 'Terminé : ' + e.message, erreur: 'Erreur : ' + e.message };
    msg('recap-etat', lib[e.etat] || '', e.etat === 'erreur' ? 'err-txt' : e.etat === 'termine' ? 'ok-txt' : 'muet');
    $('recap-mails').disabled = $('recap-devis').disabled = e.etat === 'en cours';
    $('recap-texte').hidden = !e.texte; afficherRecap(e.texte || '');
    $('recap-copier').hidden = $('recap-txt').hidden = !e.texte; typeRecap = e.type === 'devis' ? 'devis' : 'mails';
    chargerValider(); chargerEnvoi();
  } catch { /* on réessaiera */ }
}

// Brouillon à valider (réponse ou devis). Les prix viennent de la grille ; seules les lignes sans prix se saisissent ici.
function ficheBrouillon(item) {
  const d = item.contenu, devis = d.type === 'devis', mail = devis ? (d.mail || {}) : d;
  const cb = el('input', { type: 'checkbox', 'aria-label': 'Sélectionner', 'data-fichier': item.fichier });
  const f = el('div', { class: 'fiche' }, el('header', {}, cb,
    el('h2', { texte: devis ? `Devis : ${d.client || 'client ?'}` : `Réponse au mail ${d.mailId || ''}` }),
    el('span', { class: 'etiquette', texte: devis ? 'devis' : (d.categorie || 'mail') }), d.urgence ? el('span', { class: 'etiquette', texte: 'urgence ' + d.urgence }) : null));
  if (d.resume) f.append(el('div', { class: 'muet', texte: d.resume }));
  const champsPrix = []; let majTotal = () => {};
  const bValider = el('button', { class: 'primaire', texte: 'Valider' });
  if (devis) {
    const lignes = d.lignes || [];
    const prixOk = (v) => { const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*\d+([.,]\d{1,2})?\s*$/.test(v) ? parseFloat(v.replace(',', '.')) : NaN); return Number.isFinite(n) && n >= 1 && n <= 1000000 ? n : null; };
    const celTotal = el('td', { texte: '' }), celTva = el('td', { texte: '' }), celTtc = el('td', { texte: '' });
    const trs = lignes.map((l, i) => {
      const detail = l.quantite && l.prixUnitaire ? ` (${l.quantite}${l.unite ? ' ' + l.unite : ''} × ${fmt(l.prixUnitaire, d.devise)})` : '';
      if (prixOk(l.prix) !== null) { champsPrix[i] = null; return el('tr', {}, el('td', { texte: l.libelle + detail }), el('td', { texte: fmt(l.prix, d.devise) })); }
      const c = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Prix de la ligne ' + (i + 1), placeholder: 'prix à fixer' });
      c.addEventListener('input', () => majTotal()); champsPrix[i] = c;
      return el('tr', {}, el('td', { texte: l.libelle + detail }), el('td', { class: 'prix-manquant' }, c));
    });
    const taux = typeof d.tauxTva === 'number' && d.tauxTva > 0 && d.tauxTva <= 0.5 ? d.tauxTva : 0;
    majTotal = () => {
      let cts = 0, complet = lignes.length > 0;
      lignes.forEach((l, i) => { const v = champsPrix[i] ? prixOk(champsPrix[i].value) : prixOk(l.prix); if (v === null) complet = false; else cts += Math.round(v * 100); });
      celTotal.textContent = complet ? fmt(cts / 100, d.devise) : 'incomplet : prix à fixer';
      const tva = Math.round(cts * taux); celTva.textContent = complet ? fmt(tva / 100, d.devise) : ''; celTtc.textContent = complet ? fmt((cts + tva) / 100, d.devise) : '';
      bValider.disabled = !complet;
    };
    const pied = taux > 0 ? [el('tr', {}, el('th', { texte: 'Total HT' }), celTotal), el('tr', {}, el('th', { texte: `TVA ${Math.round(taux * 10000) / 100} %` }), celTva), el('tr', {}, el('th', { texte: 'Total TTC' }), celTtc)]
      : [el('tr', {}, el('th', { texte: 'Total' }), celTotal)];
    f.append(el('table', { class: 'devis' }, ...trs, ...pied), el('p', { class: 'muet petit', texte: 'Montants calculés par le tableau de bord depuis ta grille de prix (pas par Claude).' }));
    const pts = d.points_a_confirmer;
    if (pts && pts.length) f.append(el('div', { class: 'points' }, el('strong', { texte: "À confirmer avant d'envoyer" }), el('ul', {}, ...pts.map((p) => el('li', { texte: String(p) })))));
  }
  const zone = el('div', {});
  const montrer = () => zone.replaceChildren(champTexte('À', mail.a + " (adresse du mail d'origine)"), champTexte('Objet', mail.objet), el('div', { class: 'corps', texte: mail.corps || '' }));
  montrer(); f.append(zone);
  let objet, corps, edition = false;
  const bModif = el('button', { texte: 'Modifier' }), bRefus = el('button', { class: 'danger', texte: 'Refuser' });
  const modifs = () => {
    const m = edition ? { objet: objet.value, corps: corps.value } : {};
    if (champsPrix.some(Boolean)) m.prix = champsPrix.map((c) => (c ? c.value : undefined));
    return Object.keys(m).length ? m : null;
  };
  bModif.addEventListener('click', () => {
    edition = !edition;
    if (edition) {
      objet = el('input', { type: 'text', 'aria-label': 'Objet' }); objet.value = mail.objet || '';
      corps = el('textarea', { 'aria-label': 'Corps', rows: '8' }); corps.value = mail.corps || '';
      zone.replaceChildren(champTexte('À', mail.a), el('div', { class: 'champ' }, objet), el('div', { class: 'champ' }, corps));
      bModif.textContent = 'Annuler la modification';
    } else { montrer(); bModif.textContent = 'Modifier'; }
  });
  bValider.addEventListener('click', async () => { const r = await C.decider(item.fichier, 'valider', modifs()); if (!r.ok) alert(r.erreur); chargerCourrier(); });
  bRefus.addEventListener('click', async () => { await C.decider(item.fichier, 'refuser', null); chargerCourrier(); });
  majTotal();
  f.append(el('div', { class: 'pied' }, bValider, bModif, bRefus, el('span', { class: 'muet', texte: item.fichier })));
  return f;
}
async function chargerValider() {
  const liste = await C.aValider();
  if (!Array.isArray(liste)) return;
  $('cpt-valider').textContent = liste.length ? liste.length + ' brouillon(s)' : '';
  $('liste-valider').replaceChildren(...(liste.length ? liste.map(ficheBrouillon) : [el('p', { class: 'muet', texte: "Rien à valider pour l'instant." })]));
}
async function chargerEnvoi() {
  const liste = await C.valides();
  if (!Array.isArray(liste)) return;
  const zone = $('liste-envoi');
  $('envoyer-tout').disabled = !liste.some((x) => x.pret);
  if (!liste.length) { zone.replaceChildren(el('p', { class: 'muet', texte: "Rien n'attend d'être envoyé." })); return; }
  const classerBtn = (x, texte, decision, classe) => { const b = el('button', { class: classe || '', texte }); b.addEventListener('click', async () => { const r = await C.classer(x.fichier, decision); if (!r.ok) alert(r.erreur); chargerCourrier(); }); return b; };
  zone.replaceChildren(...liste.map((x) => {
    const l = el('div', { class: 'fiche' }, el('header', {}, el('h2', { texte: x.objet || x.fichier }), el('span', { class: 'etiquette', texte: x.type || '?' })));
    l.append(el('div', { class: 'champ', texte: x.destinataire ? 'Sera envoyé à : ' + x.destinataire + " (adresse du mail d'origine)" : 'Destinataire : non déterminé' }));
    if (x.bloque && x.statut === 'validé, à envoyer') l.append(el('div', { class: 'points' }, el('strong', { texte: x.suspect ? 'Attention : ' : 'Envoi impossible : ' }), x.bloque));
    if (x.erreurEnvoi && !x.suspect) l.append(el('div', { class: 'champ err-txt', texte: 'Dernier échec : ' + x.erreurEnvoi }));
    if (x.etatEnvoi === 'envoye') { l.append(el('div', { class: 'points' }, el('strong', { texte: 'Déjà envoyé : ' }), 'il ne sera pas renvoyé.'), el('div', { class: 'pied' }, classerBtn(x, 'Classer dans « envoyés »', 'envoye', 'primaire'))); return l; }
    if (x.etatEnvoi === 'incertain') {
      const b2 = el('button', { class: 'danger', texte: 'Pas parti : autoriser un nouvel envoi' });
      b2.addEventListener('click', async () => { if (!confirm("Tu as vérifié dans le dossier « Envoyés » de ta boîte que ce mail n'est PAS parti ?")) return; const r = await C.classer(x.fichier, 'non-envoye'); if (!r.ok) alert(r.erreur); chargerCourrier(); });
      l.append(el('div', { class: 'points' }, el('strong', { texte: 'Envoi incertain : ' }), 'vérifie le dossier « Envoyés » de ta boîte. Rien ne sera renvoyé automatiquement.'), el('div', { class: 'pied' }, classerBtn(x, "C'est bien parti : classer", 'envoye'), b2));
      return l;
    }
    const bt = el('button', { class: 'primaire', texte: 'Envoyer' }); bt.disabled = !x.pret;
    bt.addEventListener('click', async () => { bt.disabled = true; afficherResultatEnvoi(await C.envoyer([x.fichier])); chargerCourrier(); });
    l.append(el('div', { class: 'pied' }, bt));
    return l;
  }));
}
function afficherResultatEnvoi(r) {
  if (!r || r.annule) return;
  if (r.erreur) { alert(r.erreur); return; }
  alert(['Envoyés : ' + r.envoyes, ...(r.echecs || []).map((e) => 'Échec : ' + e.fichier + ' : ' + e.erreur)].join('\n'));
}
if (C) {
  $('c-fournisseur').addEventListener('change', aideFournisseur);
  $('c-activer').addEventListener('click', async () => { const r = await C.activer(); if (r.ok) { remplissageFait = false; chargerCourrier(); } else if (!r.annule) msg('c-activer-msg', r.erreur, 'err-txt'); });
  $('c-desactiver').addEventListener('click', async () => { if (!confirm('Désactiver le courrier ? Plus aucune connexion ni relève automatique. Tes identifiants et tes fichiers restent en place (« Oublier » efface les identifiants).')) return; await C.desactiver(); chargerCourrier(); });
  $('c-enregistrer').addEventListener('click', async () => {
    const perso = $('c-fournisseur').value === 'autre';
    const r = await C.enregistrer({ fournisseur: $('c-fournisseur').value, adresse: $('c-adresse').value, identifiant: $('c-identifiant').value, mdp: $('c-mdp').value,
      imap: perso ? { hote: $('c-imap-hote').value, port: $('c-imap-port').value, securite: $('c-imap-sec').value } : null,
      smtp: perso ? { hote: $('c-smtp-hote').value, port: $('c-smtp-port').value, securite: $('c-smtp-sec').value } : null });
    if (r.ok) $('c-mdp').value = '';
    msg('c-resultat', r.ok ? 'Enregistré (chiffré). Clique sur « Tester la connexion ».' + (r.avertissements.length ? ' ' + r.avertissements.join(' ') : '') : r.erreur, r.ok ? 'ok-txt' : 'err-txt');
    chargerCourrier();
  });
  $('c-tester').addEventListener('click', async () => { msg('c-resultat', 'Test en cours…'); const r = await C.tester(); msg('c-resultat', r.ok ? r.message : r.erreur, r.ok ? 'ok-txt' : 'err-txt'); chargerCourrier(); });
  $('c-oublier').addEventListener('click', async () => { if (!confirm('Effacer les identifiants enregistrés ?')) return; await C.oublier(); msg('c-resultat', 'Identifiants effacés.'); chargerCourrier(); });
  $('c-relever').addEventListener('click', async () => {
    $('c-relever').disabled = true; $('boite-info').textContent = 'Relève en cours…';
    const r = await C.relever();
    msg('c-resultat', r.ok ? `Relève terminée : ${r.nouveaux} nouveau(x) mail(s)` + (r.ignores ? `, ${r.ignores} illisible(s) ignoré(s)` : '') + '.' : r.erreur, r.ok ? 'ok-txt' : 'err-txt');
    chargerCourrier();
  });
  for (const [id, type] of [['recap-mails', 'mails'], ['recap-devis', 'devis']]) $(id).addEventListener('click', async () => { const r = await C.recapLancer(type); if (!r.ok) msg('recap-etat', r.erreur, 'err-txt'); else chargerCourrier(); });
  $('recap-copier').addEventListener('click', async () => { const r = await C.copierRecap(typeRecap); $('recap-retour').textContent = r.ok ? 'Copié dans le presse-papiers.' : r.erreur; });
  $('recap-txt').addEventListener('click', async () => { const r = await C.enregistrerRecap(typeRecap); if (!r.annule) $('recap-retour').textContent = r.ok ? 'Enregistré : ' + r.fichier : r.erreur; });
  $('rafraichir-valider').addEventListener('click', chargerCourrier);
  $('valider-selection').addEventListener('click', async () => {
    const noms = [...document.querySelectorAll('#liste-valider input[type=checkbox]:checked')].map((c) => c.dataset.fichier);
    if (!noms.length || !confirm(`Valider ${noms.length} brouillon(s) ? Ils seront rangés dans « valides » (rien n'est envoyé).`)) return;
    let refus = 0; for (const n of noms) if (!(await C.decider(n, 'valider', null)).ok) refus++;
    if (refus) alert(refus + ' brouillon(s) non validé(s) : devis incomplet (prix à fixer).');
    chargerCourrier();
  });
  $('envoyer-tout').addEventListener('click', async () => {
    const prets = (await C.valides()).filter((x) => x.pret);
    if (!prets.length) return;
    $('envoyer-tout').disabled = true; afficherResultatEnvoi(await C.envoyer(prets.map((x) => x.fichier))); chargerCourrier();
  });
  C.surMaj(() => { if (!$('courrier').hidden) chargerCourrier(); });
}

// Retour sur la fenêtre : on relit l'onglet affiché.
function rafraichirActif() {
  if (!$('taches').hidden) rafraichirTaches();
  else if (!$('histo').hidden) chargerHisto();
  else if (!$('jetons').hidden) chargerJetons();
  else if (!$('courrier').hidden) chargerCourrier();
}
window.addEventListener('focus', rafraichirActif);
document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichirActif(); });

if (window.gestion.surOnglet) window.gestion.surOnglet((o) => { const b = document.querySelector('[data-onglet="' + o + '"]'); if (b) b.click(); });
{ const o = new URLSearchParams(location.search).get('onglet'); const b = o && document.querySelector('[data-onglet="' + o + '"]'); if (b) b.click(); }
