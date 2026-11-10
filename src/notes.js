// Onglet Notes (fenêtre Gestion) : bloc-notes 100 % local. Utilise $, el et brancherRecherche de gestion.js (chargé avant).
// La page n'écrit rien elle-même : chaque changement est une opération validée par le processus principal (notes-ipc.js).
'use strict';
(() => {
  const N = window.notes;
  if (!N) return;
  let V = { projets: [], dossiers: [], notes: [], corbeille: [] };
  let sel = { type: 'boite' };
  let courante = null;      // id de la note ouverte
  let enAttente = false;    // texte modifié, pas encore envoyé
  let minuterie = null;
  let resultats = null;     // résultats de recherche (null = pas de recherche)
  let annulerDernier = null;
  let minuterieToast = null;

  const projet = (id) => V.projets.find((p) => p.id === id);
  const dossier = (id) => V.dossiers.find((d) => d.id === id);
  const heure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const lieuTexte = (n) => (n.dossier && dossier(n.dossier) ? projet(n.projet).nom + ' / ' + dossier(n.dossier).nom : n.projet && projet(n.projet) ? projet(n.projet).nom : 'Boîte de réception');
  const etatMsg = (t, erreur) => { $('n-etat').textContent = t || ''; $('n-etat').className = 'petit ' + (erreur ? 'err-txt' : 'muet'); };

  function toast(texte, annuler) {
    $('n-toast-txt').textContent = texte;
    annulerDernier = annuler || null;
    $('n-annuler').hidden = !annuler;
    $('n-toast').hidden = false;
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => { $('n-toast').hidden = true; annulerDernier = null; }, annuler ? 15000 : 6000);
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
    if (sel.type === 'projet' && !projet(sel.id)) sel = { type: 'boite' };
    if (sel.type === 'dossier' && !dossier(sel.id)) sel = { type: 'boite' };
    if (resultats !== null) resultats = await N.chercher($('n-recherche').value);
    dessiner();
  }

  // ----- Enregistrement automatique (anti-rebond 600 ms) -----
  async function sauver() {
    clearTimeout(minuterie);
    if (!enAttente || !courante) return;
    enAttente = false;
    const id = courante, texte = $('n-texte').value;
    const r = await N.op({ type: 'modifierNote', id, texte });
    if (!r || !r.ok) { enAttente = true; etatMsg((r && r.erreur) || 'Non enregistré.', true); return; }
    etatMsg('Enregistré à ' + heure());
    if (courante === id) await relire();
  }
  $('n-texte').addEventListener('input', () => { enAttente = true; etatMsg('Modification…'); clearTimeout(minuterie); minuterie = setTimeout(sauver, 600); });
  $('n-texte').addEventListener('blur', sauver);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sauver(); });
  window.addEventListener('beforeunload', () => { if (enAttente && courante) N.op({ type: 'modifierNote', id: courante, texte: $('n-texte').value }); });

  // ----- Arbre : Boîte de réception, projets > dossiers, corbeille -----
  function entree(texte, nb, choisi, surClic, classe) {
    return el('li', { class: classe || '' }, el('button', { type: 'button', class: 'n-noeud', 'aria-current': choisi ? 'true' : 'false', onclick: surClic },
      el('span', { texte }), el('span', { class: 'muet', texte: String(nb), 'aria-label': nb + ' note' + (nb > 1 ? 's' : '') })));
  }
  const choisir = async (s) => { await sauver(); sel = s; resultats = null; $('n-recherche').value = ''; dessiner(); };
  function dessinerArbre() {
    const ul = $('n-arbre'); ul.textContent = '';
    ul.append(entree('Boîte de réception', V.notes.filter((n) => !n.projet).length, sel.type === 'boite', () => choisir({ type: 'boite' })));
    for (const p of V.projets) {
      const li = entree(p.nom, V.notes.filter((n) => n.projet === p.id).length, sel.type === 'projet' && sel.id === p.id, () => choisir({ type: 'projet', id: p.id }));
      const ds = V.dossiers.filter((d) => d.projet === p.id);
      if (ds.length) li.append(el('ul', { class: 'n-liste-arbre n-sous' }, ...ds.map((d) => entree(d.nom, V.notes.filter((n) => n.dossier === d.id).length, sel.type === 'dossier' && sel.id === d.id, () => choisir({ type: 'dossier', id: d.id })))));
      ul.append(li);
    }
    ul.append(entree('Corbeille (30 jours)', V.corbeille.length, sel.type === 'corbeille', () => choisir({ type: 'corbeille' }), 'n-corbeille'));
  }

  // Champ de saisie en ligne (créer un dossier, renommer) : Entrée valide, Échap annule.
  function saisie(etiquette, valeur, valider) {
    const bar = $('n-actions-lieu'); bar.textContent = '';
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
      sel = { type: 'boite' }; await relire();
      toast(`« ${nom} » et ses notes sont dans la corbeille.`, async () => { if (await op({ type: 'restaurer', cible: type, id })) { sel = { type, id }; await relire(); } });
    };
  }
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
  }

  // ----- Liste des notes du lieu choisi, ou résultats de recherche -----
  function dessinerListe() {
    const ul = $('n-liste'); ul.textContent = '';
    let liste, titre, vide;
    if (resultats !== null) { liste = resultats; titre = `Recherche : ${liste.length} résultat${liste.length > 1 ? 's' : ''}`; vide = 'Aucune note ne contient ces mots.'; }
    else if (sel.type === 'corbeille') {
      $('n-titre-lieu').textContent = 'Corbeille';
      for (const c of V.corbeille) {
        const restant = Math.max(0, 30 - Math.floor((Date.now() - Date.parse(c.supprime)) / 86400000));
        ul.append(el('li', { class: 'n-item' }, el('div', { class: 'n-item-corps' }, el('b', { texte: c.nom }),
          el('span', { class: 'muet petit', texte: `${{ note: 'Note', dossier: 'Dossier', projet: 'Projet' }[c.type]} · supprimé définitivement dans ${restant} j` })),
          el('button', { type: 'button', texte: 'Restaurer', 'aria-label': 'Restaurer ' + c.nom, onclick: async () => { if (await op({ type: 'restaurer', cible: c.type, id: c.id })) { await relire(); toast(`« ${c.nom} » restauré.`); } } })));
      }
      $('n-vide').textContent = 'La corbeille est vide.'; $('n-vide').hidden = V.corbeille.length > 0;
      return;
    } else {
      liste = V.notes.filter((n) => (sel.type === 'boite' ? !n.projet : sel.type === 'projet' ? n.projet === sel.id : n.dossier === sel.id));
      titre = sel.type === 'boite' ? 'Boîte de réception' : sel.type === 'projet' ? projet(sel.id).nom : lieuTexte({ projet: dossier(sel.id).projet, dossier: sel.id });
      vide = 'Aucune note ici. « Nouvelle note » ou Ctrl+N pour en créer une.';
    }
    $('n-titre-lieu').textContent = titre;
    for (const n of liste) {
      const sous = [jour(n.modif)];
      if (resultats !== null || (sel.type === 'projet' && n.dossier)) sous.push(lieuTexte(n));
      ul.append(el('li', {}, el('button', { type: 'button', class: 'n-item n-ouvrir', 'aria-current': n.id === courante ? 'true' : 'false', onclick: () => ouvrir(n.id) },
        el('span', { class: 'n-item-corps' }, el('b', { texte: n.titre }, n.epinglee ? el('span', { class: 'etiquette n-epingle', texte: 'épinglée' }) : null), el('span', { class: 'muet petit', texte: sous.join(' · ') + (n.extrait && n.extrait !== n.titre ? ' — ' + n.extrait.slice(0, 90) : '') })))));
    }
    $('n-vide').textContent = vide; $('n-vide').hidden = liste.length > 0;
  }

  function remplirDeplacer(n) {
    const s = $('n-deplacer'); s.textContent = '';
    s.append(el('option', { value: 'b', texte: 'Boîte de réception' }));
    for (const p of V.projets) {
      s.append(el('option', { value: 'p:' + p.id, texte: p.nom }));
      for (const d of V.dossiers.filter((x) => x.projet === p.id)) s.append(el('option', { value: 'd:' + d.id, texte: p.nom + ' / ' + d.nom }));
    }
    s.value = n.dossier ? 'd:' + n.dossier : n.projet ? 'p:' + n.projet : 'b';
  }
  function dessiner() {
    dessinerArbre(); dessinerActions(); dessinerListe();
    const n = courante && V.notes.find((x) => x.id === courante);
    if (n) { remplirDeplacer(n); $('n-epingler').setAttribute('aria-pressed', String(n.epinglee)); $('n-epingler').textContent = n.epinglee ? 'Désépingler' : 'Épingler'; }
  }

  // ----- Éditeur -----
  function fermer() { courante = null; enAttente = false; $('n-editeur').hidden = true; }
  async function ouvrir(id, focus) {
    await sauver();
    const n = await N.note(id);
    if (!n) { fermer(); return relire(); }
    courante = id; enAttente = false;
    $('n-texte').value = n.texte;
    $('n-editeur').hidden = false;
    etatMsg('Créée le ' + new Date(n.cree).toLocaleString('fr-FR') + ' · modifiée le ' + new Date(n.modif).toLocaleString('fr-FR'));
    dessiner();
    if (focus !== false) $('n-texte').focus();
  }
  async function nouvelle() {
    await sauver();
    const lieu = sel.type === 'projet' ? { projet: sel.id } : sel.type === 'dossier' ? { dossier: sel.id } : {};
    if (sel.type === 'corbeille') sel = { type: 'boite' };
    const r = await op({ type: 'creerNote', ...lieu, texte: '' });
    if (!r) return;
    resultats = null; $('n-recherche').value = '';
    await relire(); await ouvrir(r.id);
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
    fermer(); await relire(); $('n-nouvelle').focus();
    toast(`« ${n ? n.titre : 'Note'} » mise à la corbeille.`, async () => { if (await op({ type: 'restaurer', cible: 'note', id })) { await relire(); await ouvrir(id); } });
  });

  // ----- Projets et recherche -----
  $('n-form-projet').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nom = $('n-nom-projet').value.trim(); if (!nom) return;
    const r = await op({ type: 'creerProjet', nom });
    if (r) { $('n-nom-projet').value = ''; sel = { type: 'projet', id: r.id }; await relire(); }
  });
  let minuterieRech = null;
  brancherRecherche('n-recherche', () => {
    clearTimeout(minuterieRech);
    minuterieRech = setTimeout(async () => { const q = $('n-recherche').value.trim(); resultats = q ? await N.chercher(q) : null; dessinerListe(); }, 200);
  });

  window.chargerNotes = () => relire();
  if (!$('notes').hidden) relire();
})();
