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
  for (const s of ['taches', 'histo', 'jetons']) $(s).hidden = s !== b.dataset.onglet;
  if (b.dataset.onglet === 'histo') chargerHisto();
  if (b.dataset.onglet === 'taches') rafraichirTaches();
  if (b.dataset.onglet === 'jetons') chargerJetons();
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

// Retour sur la fenêtre : on relit l'onglet affiché.
function rafraichirActif() {
  if (!$('taches').hidden) rafraichirTaches();
  else if (!$('histo').hidden) chargerHisto();
  else if (!$('jetons').hidden) chargerJetons();
}
window.addEventListener('focus', rafraichirActif);
document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichirActif(); });

if (window.gestion.surOnglet) window.gestion.surOnglet((o) => { const b = document.querySelector('[data-onglet="' + o + '"]'); if (b) b.click(); });
{ const o = new URLSearchParams(location.search).get('onglet'); const b = o && document.querySelector('[data-onglet="' + o + '"]'); if (b) b.click(); }
