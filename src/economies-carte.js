// Coche verte : mini-rapport des 3 dernières heures (jetons par modèle, économie estimée, tâches, rendement). 0 jeton.
// Les chiffres viennent du processus principal (economies.js). Pastille « nouveau » : 3 h depuis la dernière consultation.
(() => {
  const bouton = document.getElementById('btn-economies'), carte = document.getElementById('eco-carte');
  if (!bouton || !carte) return;
  const api = window.kinanUI;
  const corps = document.getElementById('eco-corps'), plage = document.getElementById('eco-plage');
  const nouveau = document.getElementById('pastille-eco'), fermer = document.getElementById('eco-fermer');
  const demo = /[?&]demo=1/.test(location.search) && /[?&]economies=1/.test(location.search); // ?demo=1&economies=1 : captures
  const TROIS_H = 3 * 3600 * 1000, CLE = 'kinan-os.eco-vu';
  let vuMemoire = null;
  const lireVu = () => { try { const v = Number(localStorage.getItem(CLE)); return v > 0 ? v : vuMemoire; } catch { return vuMemoire; } };
  const noterVu = (t) => { vuMemoire = t; try { localStorage.setItem(CLE, String(t)); } catch { /* stockage indisponible */ } };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const fmtJ = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M' : n >= 1e3 ? Math.round(n / 1e3).toLocaleString('fr-FR') + ' k' : String(n));
  const fmtE = (x) => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const pct = (x) => Math.round(x * 100) + ' %';
  const NOMS = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', autre: 'Autre' };
  const CFG = (window.kinan && window.kinan.config) || null;
  const AGENTS = Object.fromEntries([['kinan', 'Kinan'], ['autres', 'Autres'],
    ...((CFG && CFG.agents) || [{ id: 'drafion', nom: 'Drafion' }, { id: 'skyze', nom: 'Skyze' }, { id: 'johms', nom: 'Johms' }]).map((a) => [a.id, a.nom])]);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

  function majPastille() {
    const vu = lireVu();
    const neuf = !vu || Date.now() - vu >= TROIS_H;
    nouveau.hidden = !neuf;
    bouton.title = 'Rapport des 3 dernières heures' + (vu ? ' (vu à ' + hhmm(vu) + ')' : '') + (neuf ? ' : nouveau' : '');
  }

  function section(titre) { const s = el('section', 'eco-sec'); s.append(el('h3', '', titre)); corps.append(s); return s; }
  function rendre(r) {
    corps.textContent = '';
    if (!r) { corps.append(el('p', 'eco-vide', 'Calcul impossible : journaux illisibles.')); return; }
    plage.textContent = hhmm(r.debut) + ' → ' + hhmm(r.fin);
    if (r.demo) corps.append(el('p', 'eco-demo', 'Données de démonstration'));
    // 1. Jetons par modèle
    const sj = section('Jetons nouveaux');
    const lst = el('ul', 'eco-modeles');
    for (const f of ['haiku', 'sonnet', 'opus', 'autre']) {
      const m = r.modeles[f];
      if (!m || (!m.total && f === 'autre')) continue;
      const li = el('li', 'eco-mod ' + f);
      const part = r.total ? m.total / r.total : 0;
      li.append(el('i', 'pt'), el('span', 'nom', NOMS[f]), el('span', 'val mono', fmtJ(m.total)),
        el('span', 'del', m.delegue ? 'dont ' + fmtJ(m.delegue) + ' délégués' : ''));
      const barre = el('span', 'barre'); const rempli = el('span'); rempli.style.width = (part * 100).toFixed(1) + '%'; barre.append(rempli); li.append(barre);
      lst.append(li);
    }
    const rc = r.tarifs.rapportCache;
    sj.append(lst,
      el('p', 'eco-note', 'Jetons nouveaux ' + fmtJ(r.total) + ' (entrée + sortie + écriture de cache) · dont délégués ' + fmtJ(r.delegue)),
      el('p', 'eco-note', 'Relus du cache ' + fmtJ(r.cacheLu) + ' (comptés à part' + (rc ? ', ' + (rc.min === rc.max ? rc.min : rc.min + ' à ' + rc.max) + ' fois moins chers que l\'entrée' : '') + ')'));
    // 2. Économie
    const se = section('Économie estimée');
    const e = r.euros;
    if (e.economie > 0.005) se.append(el('p', 'eco-gros ok', '≈ ' + fmtE(e.economie)));
    else se.append(el('p', 'eco-gros nul', e.economie < -0.005 ? 'Négative (' + fmtE(e.economie) + ')' : 'Aucune économie'));
    se.append(el('p', 'eco-avert', 'estimation au tarif API, pas ta facture'),
      el('p', 'eco-note', 'Coût estimé ' + fmtE(e.reel) + ' · si tout avait tourné sur Opus ' + fmtE(e.toutOpus)));
    // 3. Tâches terminées
    const st = section('Tâches terminées');
    const ligne = el('p', 'eco-taches');
    ligne.append(el('span', 'eco-nb mono', String(r.taches.total)));
    for (const [a, n] of Object.entries(r.taches.parAgent).sort((x, y) => y[1] - x[1])) ligne.append(el('span', 'eco-pill', (AGENTS[a] || a) + ' ' + n));
    if (!r.taches.total) ligne.append(el('span', 'eco-note', 'aucune sur la période'));
    st.append(ligne);
    if (r.taches.estimees) st.append(el('p', 'eco-note', 'dont ' + r.taches.estimees + ' à l\'heure de fin estimée (ancienne tâche sans horodatage)'));
    // 4. Rendement
    const sr = section('Rendement');
    const rd = r.rendement, items = [];
    if (rd.jetonsParTache !== null) items.push(fmtJ(rd.jetonsParTache) + ' jetons nouveaux / tâche', fmtE(rd.eurosParTache) + ' / tâche');
    else items.push('par tâche : non calculable');
    items.push(pct(rd.partMoinsCher) + ' sur Haiku ou Sonnet');
    const rl = el('p', 'eco-rend'); for (const t of items) rl.append(el('span', 'eco-pill', t));
    sr.append(rl, el('p', 'eco-note', 'Rendement = ce que chaque tâche te coûte (jetons nouveaux et euros par tâche) et la part du travail faite par Haiku/Sonnet au lieu d\'Opus.'));
    // 5. Textes
    const sx = section('Rapport réaliste');
    sx.append(el('p', 'eco-texte', r.textes.realiste));
    corps.append(el('p', 'eco-mot', r.textes.mot));
    corps.append(el('p', 'eco-pied', 'Calculé à ' + hhmm(r.fin) + ' · fin de tâche : heure notée par le hook, sinon estimée · tarifs du ' + r.tarifs.maj.split('-').reverse().join('/')
      + (r.tarifs.haikuAConfirmer ? ' (Haiku à confirmer)' : '')));
  }

  const DEMO = () => { const fin = Date.now(); return { demo: true, debut: fin - TROIS_H, fin, total: 1804308, cacheLu: 38412000, delegue: 872792,
    modeles: { haiku: { total: 22718, delegue: 22718 }, sonnet: { total: 1537206, delegue: 718721 }, opus: { total: 244384, delegue: 131353 }, autre: { total: 0, delegue: 0 } },
    euros: { reel: 13.04, toutOpus: 18.11, economie: 5.07 }, taches: { total: 11, parAgent: { skyze: 8, drafion: 3 }, estimees: 2 },
    rendement: { partOpus: 0.135, partMoinsCher: 0.865, jetonsParTache: 164028, eurosParTache: 1.19 },
    tarifs: { maj: '2026-10-06', haikuAConfirmer: true, rapportCache: { min: 10, max: 20 } },
    textes: { realiste: '1,8 M jetons nouveaux sur 3 h (et 38,4 M relus du cache), dont 14 % sur Opus et 48 % par des agents délégués. Les modèles moins chers ont évité environ 5,07 € par rapport à tout sur Opus (estimation au tarif API, pas ta facture). 11 tâches terminées (dont 2 à l\'heure de fin estimée), soit 164 k jetons nouveaux et 1,19 € par tâche.',
      mot: 'Drafion a porté les cartons, Opus a gardé ses forces pour le dessert.' } }; };

  async function ouvrir() {
    noterVu(Date.now()); majPastille();
    corps.textContent = ''; corps.append(el('p', 'eco-vide', 'Calcul…'));
    if (!carte.open) carte.showModal();
    let r = null;
    if (demo && !(api && api.economiesLire)) r = DEMO();
    else if (api && api.economiesLire) { try { r = await api.economiesLire(); } catch { r = null; } }
    rendre(r);
  }
  bouton.addEventListener('click', ouvrir);
  fermer.addEventListener('click', () => carte.close());
  carte.addEventListener('click', (ev) => { if (ev.target === carte) carte.close(); }); // clic hors de la carte
  majPastille(); setInterval(majPastille, 60000);
  if (demo) { vuMemoire = null; try { localStorage.removeItem(CLE); } catch { /* ignoré */ } majPastille(); if (/[?&]ouvert=1/.test(location.search)) ouvrir(); }
})();
