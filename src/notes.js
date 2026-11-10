// Onglet Notes (fenêtre Gestion) : bloc-notes 100 % local. Utilise $, el et brancherRecherche de gestion.js (chargé avant).
// Liste à gauche (la plus récente en haut), grande zone de texte à droite, enregistrement automatique. Le rangement par projet / dossier reste optionnel.
// La page n'écrit rien elle-même : chaque changement est une opération validée par le processus principal (notes-ipc.js).
'use strict';
(() => {
  const N = window.notes;
  if (!N) return;
  const OCTETS_MAX = 1024 * 1024;
  let V = { projets: [], dossiers: [], notes: [], corbeille: [] };
  let sel = { type: 'toutes' };   // toutes | boite (sans dossier) | projet | dossier | corbeille
  let courante = null;      // id de la note ouverte
  let enAttente = false;    // texte modifié, pas encore envoyé
  let minuterie = null;
  let creation = null;      // création en cours (première frappe sans note ouverte)
  let jeton = 0;            // la dernière ouverture demandée l'emporte
  let resultats = null;     // résultats de recherche (null = pas de recherche)
  let annulerDernier = null;
  let minuterieToast = null;

  const projet = (id) => V.projets.find((p) => p.id === id);
  const dossier = (id) => V.dossiers.find((d) => d.id === id);
  const heure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const quand = (iso) => {
    const d = new Date(iso), a = new Date();
    if (d.toDateString() === a.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('fr-FR', d.getFullYear() === a.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const lieuTexte = (n) => (n.dossier && dossier(n.dossier) ? projet(n.projet).nom + ' / ' + dossier(n.dossier).nom : n.projet && projet(n.projet) ? projet(n.projet).nom : 'Sans dossier');
  const etatMsg = (t, erreur) => { $('n-etat').textContent = t || ''; $('n-etat').className = 'petit ' + (erreur ? 'err-txt' : 'muet'); };
  const lieuCourant = () => (sel.type === 'projet' ? { projet: sel.id } : sel.type === 'dossier' ? { dossier: sel.id } : {});

  function toast(texte, annuler, duree) {
    $('n-toast-txt').textContent = texte;
    annulerDernier = annuler || null;
    $('n-annuler').hidden = !annuler;
    $('n-toast').hidden = false;
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => { $('n-toast').hidden = true; annulerDernier = null; }, duree || (annuler ? 15000 : 6000));
  }
  $('n-annuler').addEventListener('click', async () => {
    const f = annulerDernier; $('n-toast').hidden = true; annulerDernier = null;
    if (f) await f();
  });

  async function op(o) {
    const r = await N.op(o);
    if (!r || !r.ok) { toast((r && r.erreur) || 'Opération refusée.'); return null; }
    return r;
  }
  async function relire() {
    V = await N.lire();
    if (V.avis) { $('n-avis').textContent = V.avis; $('n-avis').hidden = false; }
    if (sel.type === 'projet' && !projet(sel.id)) sel = { type: 'toutes' };
    if (sel.type === 'dossier' && !dossier(sel.id)) sel = { type: 'toutes' };
    if (resultats !== null) resultats = await N.chercher($('n-recherche').value);
    dessiner();
  }

  // ----- Enregistrement automatique (anti-rebond 400 ms) -----
  // Sans note ouverte, la première frappe crée la note dans le lieu choisi ; avec une note ouverte, le texte la remplace.
  async function sauver() {
    clearTimeout(minuterie);
    if (creation) await creation;
    if (!enAttente) return;
    if (!courante) {
      const texte = $('n-texte').value;
      if (!texte.trim() || sel.type === 'corbeille') { enAttente = false; return; }
      enAttente = false;
      creation = (async () => {
        const r = await N.op({ type: 'creerNote', ...lieuCourant(), texte });
        if (!r || !r.ok) { enAttente = true; etatMsg((r && r.erreur) || 'Non enregistré.', true); return false; }
        courante = r.id;
        if ($('n-texte').value !== texte) { enAttente = true; clearTimeout(minuterie); minuterie = setTimeout(sauver, 400); }
        etatMsg('Enregistré à ' + heure());
        return true;
      })();
      let cree = false;
      try { cree = await creation; } finally { creation = null; }
      if (cree) await relire();
      return;
    }
    enAttente = false;
    const id = courante, texte = $('n-texte').value;
    const r = await N.op({ type: 'modifierNote', id, texte });
    if (!r || !r.ok) { enAttente = true; etatMsg((r && r.erreur) || 'Non enregistré.', true); return; }
    etatMsg('Enregistré à ' + heure());
    if (courante === id) await relire();
  }
  $('n-texte').addEventListener('input', () => { enAttente = true; etatMsg('Modification…'); clearTimeout(minuterie); minuterie = setTimeout(sauver, 400); });
  $('n-texte').addEventListener('blur', sauver);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sauver(); });
  window.addEventListener('beforeunload', () => {
    if (!enAttente) return;
    if (courante) N.op({ type: 'modifierNote', id: courante, texte: $('n-texte').value });
    else if ($('n-texte').value.trim()) N.op({ type: 'creerNote', ...lieuCourant(), texte: $('n-texte').value });
  });

  // ----- Sélecteur « Dossier » : Toutes les notes, Sans dossier, projets et dossiers, Corbeille -----
  const valeurSel = () => (sel.type === 'toutes' ? 't' : sel.type === 'boite' ? 'b' : sel.type === 'corbeille' ? 'c' : (sel.type === 'projet' ? 'p:' : 'd:') + sel.id);
  const selDepuis = (v) => (v === 'b' ? { type: 'boite' } : v === 'c' ? { type: 'corbeille' } : v.startsWith('p:') ? { type: 'projet', id: v.slice(2) } : v.startsWith('d:') ? { type: 'dossier', id: v.slice(2) } : { type: 'toutes' });
  function dessinerSelecteur() {
    const s = $('n-dossier'); s.textContent = '';
    const o = (value, texte) => s.append(el('option', { value, texte }));
    o('t', `Toutes les notes (${V.notes.length})`);
    o('b', `Sans dossier (${V.notes.filter((n) => !n.projet).length})`);
    for (const p of V.projets) {
      o('p:' + p.id, `${p.nom} (${V.notes.filter((n) => n.projet === p.id).length})`);
      for (const d of V.dossiers.filter((x) => x.projet === p.id)) o('d:' + d.id, `${p.nom} / ${d.nom} (${V.notes.filter((n) => n.dossier === d.id).length})`);
    }
    o('c', `Corbeille, 30 jours (${V.corbeille.length})`);
    s.value = valeurSel();
  }
  async function choisir(s) {
    await sauver();
    sel = s; resultats = null; $('n-recherche').value = '';
    fermer(); dessiner();
    await ouvrirPremiere(false);
  }
  $('n-dossier').addEventListener('change', (e) => choisir(selDepuis(e.target.value)));

  // Champ de saisie en ligne (créer un dossier, renommer) : Entrée valide, Échap annule.
  function saisie(etiquette, valeur, valider) {
    const bar = $('n-actions-lieu'); bar.textContent = ''; bar.hidden = false;
    const champ = el('input', { type: 'text', maxlength: '80', 'aria-label': etiquette, placeholder: etiquette, autocomplete: 'off' });
    champ.value = valeur || '';
    const fin = () => dessinerActions();
    const ok = async () => { const v = champ.value.trim(); if (!v) return champ.focus(); if (await valider(v)) await relire(); else fin(); };
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } if (e.key === 'Escape') { e.stopPropagation(); fin(); } });
    bar.append(champ, el('button', { type: 'button', class: 'primaire', texte: 'OK', onclick: ok }), el('button', { type: 'button', texte: 'Annuler', onclick: fin }));
    champ.focus(); champ.select();
  }
  async function exporter(cible) {
    await sauver();
    const r = await N.exporter(cible);
    if (r && r.ok) toast(`Exporté : ${r.nb} note(s) dans ${r.fichier}`);
    else if (r && !r.annule) toast(r.erreur || 'Export impossible.');
  }
  function supprimerConteneur(type, id, nom) {
    return async () => {
      await sauver();
      const ouverte = V.notes.find((n) => n.id === courante);
      if (!(await op({ type: type === 'projet' ? 'supprimerProjet' : 'supprimerDossier', id }))) return;
      if (ouverte && (type === 'projet' ? ouverte.projet === id : ouverte.dossier === id)) fermer();
      sel = { type: 'toutes' }; await relire();
      if (!courante) await ouvrirPremiere(false);
      toast(`« ${nom} » et ses notes sont dans la corbeille.`, async () => { if (await op({ type: 'restaurer', cible: type, id })) { sel = { type, id }; await relire(); } });
    };
  }
  const AIDES = {
    toutes: 'Pour renommer, exporter ou supprimer un projet ou un dossier, choisissez-le d\'abord dans la liste « Dossier ».',
    boite: 'Notes rangées dans aucun projet.',
    corbeille: 'Les éléments supprimés restent 30 jours, puis disparaissent.'
  };
  function dessinerActions() {
    const bar = $('n-actions-lieu'); bar.textContent = '';
    const b = (texte, f, classe) => el('button', { type: 'button', texte, onclick: f, class: classe || '' });
    if (sel.type === 'boite') bar.append(b('Exporter en .md', () => exporter({ type: 'boite' })));
    if (sel.type === 'projet') {
      const p = projet(sel.id);
      bar.append(b('Nouveau dossier', () => saisie('Nom du dossier', '', (nom) => op({ type: 'creerDossier', projet: p.id, nom }))),
        b('Renommer', () => saisie('Nouveau nom du projet', p.nom, (nom) => op({ type: 'renommerProjet', id: p.id, nom }))),
        b('Exporter en .md', () => exporter({ type: 'projet', id: p.id })), b('Supprimer le projet', supprimerConteneur('projet', p.id, p.nom), 'danger'));
    }
    if (sel.type === 'dossier') {
      const d = dossier(sel.id);
      bar.append(b('Renommer', () => saisie('Nouveau nom du dossier', d.nom, (nom) => op({ type: 'renommerDossier', id: d.id, nom }))),
        b('Exporter en .md', () => exporter({ type: 'dossier', id: d.id })), b('Supprimer le dossier', supprimerConteneur('dossier', d.id, d.nom), 'danger'));
    }
    bar.hidden = !bar.childNodes.length;
    $('n-aide-lieu').textContent = AIDES[sel.type] || '';
    $('n-aide-lieu').hidden = !AIDES[sel.type];
  }

  // ----- Liste des notes du lieu choisi (la plus récente en haut, épinglées d'abord), ou résultats de recherche -----
  const listeAffichee = () => (resultats !== null ? resultats : sel.type === 'toutes' ? V.notes
    : V.notes.filter((n) => (sel.type === 'boite' ? !n.projet : sel.type === 'projet' ? n.projet === sel.id : n.dossier === sel.id)));
  function dessinerListe() {
    const ul = $('n-liste'); ul.textContent = '';
    if (sel.type === 'corbeille' && resultats === null) {
      $('n-titre-lieu').textContent = 'Corbeille';
      for (const c of V.corbeille) {
        const restant = Math.max(0, 30 - Math.floor((Date.now() - Date.parse(c.supprime)) / 86400000));
        ul.append(el('li', { class: 'n-item' }, el('div', { class: 'n-item-corps' }, el('b', { texte: c.nom }),
          el('span', { class: 'muet petit', texte: `${{ note: 'Note', dossier: 'Dossier', projet: 'Projet' }[c.type]} · supprimé définitivement dans ${restant} j` })),
          el('button', { type: 'button', texte: 'Restaurer', 'aria-label': 'Restaurer ' + c.nom, onclick: async () => { if (await op({ type: 'restaurer', cible: c.type, id: c.id })) { await relire(); toast(`« ${c.nom} » restauré.`); } } })));
      }
      $('n-vide').textContent = 'La corbeille est vide.'; $('n-vide').hidden = V.corbeille.length > 0;
      return;
    }
    const liste = listeAffichee();
    let titre = 'Toutes les notes';
    if (resultats !== null) titre = `Recherche : ${liste.length} résultat${liste.length > 1 ? 's' : ''}`;
    else if (sel.type === 'boite') titre = 'Sans dossier';
    else if (sel.type === 'projet') titre = projet(sel.id).nom;
    else if (sel.type === 'dossier') titre = lieuTexte({ projet: dossier(sel.id).projet, dossier: sel.id });
    $('n-titre-lieu').textContent = resultats !== null ? titre : `${titre} · ${liste.length}`;
    const partout = resultats !== null || sel.type === 'toutes';
    for (const n of liste) {
      const lieu = n.projet && (partout || (sel.type === 'projet' && n.dossier)) ? lieuTexte(n) : '';
      ul.append(el('li', {}, el('button', { type: 'button', class: 'n-item n-ouvrir', 'aria-current': n.id === courante ? 'true' : 'false', onclick: () => ouvrir(n.id) },
        el('span', { class: 'n-item-corps' },
          el('span', { class: 'n-ligne' }, el('b', { texte: n.titre }, n.epinglee ? el('span', { class: 'etiquette n-epingle', texte: 'épinglée' }) : null), el('span', { class: 'muet petit', texte: quand(n.modif) })),
          n.debut ? el('span', { class: 'muet petit', texte: n.debut }) : null,
          lieu ? el('span', { class: 'muet petit', texte: lieu }) : null))));
    }
    $('n-vide').textContent = resultats !== null ? 'Aucune note ne contient ces mots.' : 'Aucune note ici : écrivez à droite, ou « + Nouvelle note » (Ctrl+N).';
    $('n-vide').hidden = liste.length > 0;
  }

  function remplirDeplacer(n) {
    const s = $('n-deplacer'); s.textContent = '';
    s.append(el('option', { value: 'b', texte: 'Sans dossier' }));
    for (const p of V.projets) {
      s.append(el('option', { value: 'p:' + p.id, texte: p.nom }));
      for (const d of V.dossiers.filter((x) => x.projet === p.id)) s.append(el('option', { value: 'd:' + d.id, texte: p.nom + ' / ' + d.nom }));
    }
    s.value = n.dossier ? 'd:' + n.dossier : n.projet ? 'p:' + n.projet : 'b';
  }
  function dessiner() {
    dessinerSelecteur(); dessinerActions(); dessinerListe();
    const n = courante && V.notes.find((x) => x.id === courante);
    if (n) { remplirDeplacer(n); $('n-epingler').setAttribute('aria-pressed', String(n.epinglee)); $('n-epingler').textContent = n.epinglee ? 'Désépingler' : 'Épingler'; }
    for (const id of ['n-epingler', 'n-deplacer', 'n-supprimer']) $(id).disabled = !n;
  }

  // ----- Éditeur : toujours visible, prêt à écrire -----
  function fermer() {
    courante = null; enAttente = false;
    const t = $('n-texte'); t.value = ''; t.disabled = sel.type === 'corbeille';
    t.placeholder = sel.type === 'corbeille' ? 'Restaurez une note depuis la liste pour la relire.' : 'Écrivez ici : la note se crée et s\'enregistre toute seule.';
    etatMsg('');
    $('n-deplacer').textContent = '';
    for (const id of ['n-epingler', 'n-deplacer', 'n-supprimer']) $(id).disabled = true;
  }
  const focusFin = () => { const t = $('n-texte'); if (t.disabled) return; t.focus(); t.setSelectionRange(t.value.length, t.value.length); };
  async function ouvrir(id, focus) {
    const mon = ++jeton;
    await sauver();
    $('n-texte').readOnly = true; // le temps de lire la note : aucune frappe perdue ni écrasée
    const n = await N.note(id);
    if (mon !== jeton) return;
    $('n-texte').readOnly = false;
    if (!n) { fermer(); return relire(); }
    courante = id; enAttente = false;
    $('n-texte').disabled = false; $('n-texte').placeholder = 'Écrivez ici…';
    $('n-texte').value = n.texte;
    etatMsg('Créée le ' + new Date(n.cree).toLocaleString('fr-FR') + ' · modifiée le ' + new Date(n.modif).toLocaleString('fr-FR') + ' · enregistrement automatique');
    dessiner();
    if (focus !== false) focusFin();
  }
  // À l'ouverture de l'onglet ou d'un dossier : la note la plus récente s'ouvre ; sans note, la zone de texte attend la première frappe.
  async function ouvrirPremiere(focus) {
    if (sel.type === 'corbeille' || resultats !== null || courante || creation) return;
    const l = listeAffichee();
    if (l.length) await ouvrir(l[0].id, focus); else if (!courante) { fermer(); if (focus) focusFin(); }
  }
  async function nouvelle() {
    await sauver();
    if (sel.type === 'corbeille') { sel = { type: 'toutes' }; fermer(); }
    if (courante && $('n-texte').value === '' && !enAttente) { focusFin(); return; } // une note vide est déjà ouverte
    const t = $('n-texte'); const mon = ++jeton; const avant = t.value;
    t.readOnly = true; // le temps de créer la note : aucune frappe n'est perdue
    let r;
    try { r = await op({ type: 'creerNote', ...lieuCourant(), texte: '' }); } finally { t.readOnly = false; }
    if (!r || mon !== jeton) return;
    resultats = null; $('n-recherche').value = '';
    const saisi = t.value !== avant ? t.value : ''; // texte posé pendant la création (collage, script) : gardé, jamais écrasé
    courante = r.id; t.disabled = false; t.value = saisi; t.placeholder = 'Écrivez ici…';
    enAttente = saisi !== ''; if (enAttente) { clearTimeout(minuterie); minuterie = setTimeout(sauver, 400); }
    etatMsg('Nouvelle note : enregistrement automatique.');
    focusFin();
    await relire();
  }
  $('n-nouvelle').addEventListener('click', nouvelle);
  document.addEventListener('keydown', (e) => {
    if ($('notes').hidden) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); nouvelle(); }
  });
  $('n-epingler').addEventListener('click', async () => {
    const n = V.notes.find((x) => x.id === courante); if (!n) return;
    await sauver(); if (await op({ type: 'epinglerNote', id: n.id, valeur: !n.epinglee })) await relire();
  });
  $('n-deplacer').addEventListener('change', async (e) => {
    const v = e.target.value; await sauver();
    const dest = v.startsWith('d:') ? { dossier: v.slice(2) } : v.startsWith('p:') ? { projet: v.slice(2) } : {};
    if (await op({ type: 'deplacerNote', id: courante, ...dest })) { await relire(); toast('Note déplacée vers ' + e.target.selectedOptions[0].textContent + '.'); }
  });
  $('n-supprimer').addEventListener('click', async () => {
    const id = courante; await sauver();
    const n = V.notes.find((x) => x.id === id);
    if (!(await op({ type: 'supprimerNote', id }))) return;
    fermer(); await relire(); $('n-nouvelle').focus(); await ouvrirPremiere(false);
    toast(`« ${n ? n.titre : 'Note'} » mise à la corbeille.`, async () => { if (await op({ type: 'restaurer', cible: 'note', id })) { await relire(); await ouvrir(id); } });
  });

  // ----- Projets et recherche -----
  $('n-form-projet').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nom = $('n-nom-projet').value.trim(); if (!nom) return;
    const r = await op({ type: 'creerProjet', nom });
    if (r) { $('n-nom-projet').value = ''; await relire(); await choisir({ type: 'projet', id: r.id }); }
  });
  let minuterieRech = null;
  brancherRecherche('n-recherche', () => {
    clearTimeout(minuterieRech);
    minuterieRech = setTimeout(async () => { const q = $('n-recherche').value.trim(); resultats = q ? await N.chercher(q) : null; dessinerListe(); }, 200);
  });

  // ----- Import de fichiers texte (.txt, .md) : bouton, ou glisser-déposer sur la colonne de gauche -----
  async function finImport(r) {
    if (!r || r.annule) return;
    if (!r.ok) { toast(r.erreur || 'Import impossible.', null, 12000); return; }
    toast(r.message, null, 15000);
    if (r.importees) { resultats = null; $('n-recherche').value = ''; if (sel.type === 'corbeille') { sel = { type: 'toutes' }; fermer(); } await relire(); }
  }
  $('n-importer').addEventListener('click', async () => { await sauver(); await finImport(await N.importer(lieuCourant())); });
  const zone = $('notes'), colonne = $('n-colonne');
  const avecFichiers = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
  let profondeur = 0;
  zone.addEventListener('dragenter', (e) => { if (!avecFichiers(e)) return; e.preventDefault(); profondeur++; colonne.classList.add('n-depot'); });
  zone.addEventListener('dragover', (e) => { if (!avecFichiers(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  zone.addEventListener('dragleave', (e) => { if (!avecFichiers(e)) return; profondeur = Math.max(0, profondeur - 1); if (!profondeur) colonne.classList.remove('n-depot'); });
  zone.addEventListener('drop', async (e) => {
    if (!avecFichiers(e)) return;
    e.preventDefault(); profondeur = 0; colonne.classList.remove('n-depot');
    const fichiers = Array.from(e.dataTransfer.files).slice(0, 101);
    await sauver();
    // Seuls les .txt / .md de 1 Mo au plus sont lus ; le processus principal revalide tout (taille, texte, limites) et signale chaque refus.
    const envoi = [];
    for (const f of fichiers) {
      const o = { nom: f.name, taille: f.size };
      if (f.size <= OCTETS_MAX && /\.(txt|md)$/i.test(f.name)) { try { o.octets = await f.arrayBuffer(); } catch { /* signalé comme illisible */ } }
      envoi.push(o);
    }
    await finImport(await N.importerContenus(lieuCourant(), envoi));
  });

  window.chargerNotes = async () => { await relire(); await ouvrirPremiere(true); if (document.activeElement !== $('n-texte')) focusFin(); };
  if (!$('notes').hidden) window.chargerNotes();
})();
