// Bloc-notes : logique pure (aucun fs, aucun réseau). Hiérarchie Projet > Dossier > Note ; note sans projet = Boîte de réception.
// Toute valeur venant du rendu passe par appliquer(), qui valide et borne. Suppression douce (corbeille 30 jours).
'use strict';

const LIMITES = { texte: 100000, notes: 5000, nom: 80, titre: 80, projets: 200, dossiers: 1000, recherche: 200, resultats: 200 };
const CORBEILLE_MS = 30 * 86400000;
const RE_ID = /^[a-z0-9]{4,40}$/;

const vide = () => ({ version: 1, projets: [], dossiers: [], notes: [] });
const estId = (x) => typeof x === 'string' && RE_ID.test(x);
const date = (x) => (typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : null);
const nomPropre = (x) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITES.nom) : '');

// Titre : première ligne non vide, sans « # » de tête, 80 caractères au plus.
function titreDe(texte) {
  const l = String(texte || '').split(/\r?\n/).map((x) => x.replace(/^\s*#+\s*/, '').trim()).find(Boolean);
  return l ? l.slice(0, LIMITES.titre) : 'Sans titre';
}

// Lecture tolérante : toute entrée invalide est écartée, jamais d'exception.
function normaliser(brut) {
  const e = vide();
  if (!brut || typeof brut !== 'object') return e;
  const ids = new Set();
  const neuf = (id) => estId(id) && !ids.has(id) && ids.add(id);
  for (const p of Array.isArray(brut.projets) ? brut.projets.slice(0, LIMITES.projets) : []) {
    if (!p || !neuf(p.id) || !nomPropre(p.nom)) continue;
    e.projets.push({ id: p.id, nom: nomPropre(p.nom), cree: date(p.cree) || new Date(0).toISOString(), supprime: date(p.supprime) });
  }
  const projets = new Set(e.projets.map((p) => p.id));
  for (const d of Array.isArray(brut.dossiers) ? brut.dossiers.slice(0, LIMITES.dossiers) : []) {
    if (!d || !projets.has(d.projet) || !neuf(d.id) || !nomPropre(d.nom)) continue;
    e.dossiers.push({ id: d.id, projet: d.projet, nom: nomPropre(d.nom), cree: date(d.cree) || new Date(0).toISOString(), supprime: date(d.supprime) });
  }
  const dossiers = new Map(e.dossiers.map((d) => [d.id, d]));
  for (const n of Array.isArray(brut.notes) ? brut.notes.slice(0, LIMITES.notes) : []) {
    if (!n || !neuf(n.id) || typeof n.texte !== 'string') continue;
    let projet = projets.has(n.projet) ? n.projet : null;
    let dossier = dossiers.has(n.dossier) ? n.dossier : null;
    if (dossier) projet = dossiers.get(dossier).projet;
    if (!projet) dossier = null;
    const texte = n.texte.slice(0, LIMITES.texte);
    const cree = date(n.cree) || new Date(0).toISOString();
    e.notes.push({ id: n.id, projet, dossier, titre: titreDe(texte), texte, cree, modif: date(n.modif) || cree, epinglee: n.epinglee === true, supprime: date(n.supprime) });
  }
  return e;
}

// Corbeille : tout élément supprimé depuis plus de 30 jours disparaît, avec les notes et dossiers qui en dépendent.
function purger(etat, now) {
  const vieux = (x) => x.supprime && now - Date.parse(x.supprime) > CORBEILLE_MS;
  const projets = etat.projets.filter((p) => !vieux(p));
  const pIds = new Set(projets.map((p) => p.id));
  const dossiers = etat.dossiers.filter((d) => !vieux(d) && pIds.has(d.projet));
  const dIds = new Set(dossiers.map((d) => d.id));
  const notes = etat.notes.filter((n) => !vieux(n) && (!n.projet || pIds.has(n.projet)) && (!n.dossier || dIds.has(n.dossier)));
  return { ...etat, projets, dossiers, notes };
}

const vivant = (x) => !x.supprime;
const resume = (n) => ({ id: n.id, projet: n.projet, dossier: n.dossier, titre: n.titre, extrait: n.texte.replace(/\s+/g, ' ').trim().slice(0, 140), cree: n.cree, modif: n.modif, epinglee: n.epinglee });
const ordre = (a, b) => (b.epinglee - a.epinglee) || (b.modif < a.modif ? -1 : b.modif > a.modif ? 1 : 0);

// Vue envoyée au rendu : éléments vivants (sans le texte complet des notes) et contenu de la corbeille.
function vue(etat) {
  const pMort = new Set(etat.projets.filter((p) => p.supprime).map((p) => p.id));
  const dMort = new Set(etat.dossiers.filter((d) => d.supprime).map((d) => d.id));
  const corbeille = [
    ...etat.projets.filter((p) => p.supprime).map((p) => ({ type: 'projet', id: p.id, nom: p.nom, supprime: p.supprime })),
    ...etat.dossiers.filter((d) => d.supprime && !pMort.has(d.projet)).map((d) => ({ type: 'dossier', id: d.id, nom: d.nom, supprime: d.supprime })),
    ...etat.notes.filter((n) => n.supprime && !pMort.has(n.projet) && !dMort.has(n.dossier)).map((n) => ({ type: 'note', id: n.id, nom: n.titre, supprime: n.supprime }))
  ].sort((a, b) => (a.supprime < b.supprime ? 1 : -1));
  return {
    projets: etat.projets.filter(vivant).map(({ id, nom }) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    dossiers: etat.dossiers.filter(vivant).map(({ id, projet, nom }) => ({ id, projet, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    notes: etat.notes.filter(vivant).map(resume).sort(ordre),
    corbeille, limites: { texte: LIMITES.texte, notes: LIMITES.notes }
  };
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Recherche plein texte (titre + texte), insensible à la casse et aux accents ; tous les mots doivent figurer.
function rechercher(etat, q) {
  const mots = norm(typeof q === 'string' ? q.slice(0, LIMITES.recherche) : '').split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  return etat.notes.filter(vivant).filter((n) => { const t = norm(n.titre + '\n' + n.texte); return mots.every((m) => t.includes(m)); })
    .sort(ordre).slice(0, LIMITES.resultats).map(resume);
}

// Emplacement demandé par le rendu : { projet, dossier } validé contre l'état (null, null = Boîte de réception).
function emplacement(etat, a) {
  const d = a && estId(a.dossier) ? etat.dossiers.find((x) => x.id === a.dossier && vivant(x)) : null;
  if (a && a.dossier != null && !d) return null;
  if (d) return { projet: d.projet, dossier: d.id };
  const p = a && estId(a.projet) ? etat.projets.find((x) => x.id === a.projet && vivant(x)) : null;
  if (a && a.projet != null && !p) return null;
  return { projet: p ? p.id : null, dossier: null };
}

const err = (etat, erreur) => ({ etat, ok: false, erreur });
const ok = (etat, extra) => ({ etat, ok: true, ...extra });
const trouver = (liste, id, vivantSeul = true) => (estId(id) ? liste.find((x) => x.id === id && (!vivantSeul || vivant(x))) : null);

// Applique une opération du rendu. Ne modifie jamais `etat` (copie) ; renvoie { etat, ok, erreur?, id? }.
function appliquer(etatIn, op, { now = Date.now(), genId } = {}) {
  if (!op || typeof op !== 'object' || typeof op.type !== 'string') return err(etatIn, 'Opération invalide.');
  const etat = { ...etatIn, projets: etatIn.projets.map((x) => ({ ...x })), dossiers: etatIn.dossiers.map((x) => ({ ...x })), notes: etatIn.notes.map((x) => ({ ...x })) };
  const t = new Date(now).toISOString();
  const nouvelId = () => { let id; do id = genId(); while (etat.projets.some((x) => x.id === id) || etat.dossiers.some((x) => x.id === id) || etat.notes.some((x) => x.id === id)); return id; };
  switch (op.type) {
    case 'creerNote': {
      if (etat.notes.length >= LIMITES.notes) return err(etatIn, `Limite de ${LIMITES.notes} notes atteinte (corbeille comprise).`);
      const lieu = emplacement(etat, op);
      if (!lieu) return err(etatIn, 'Projet ou dossier introuvable.');
      const texte = typeof op.texte === 'string' ? op.texte : '';
      if (texte.length > LIMITES.texte) return err(etatIn, `Texte trop long (${LIMITES.texte} caractères au plus).`);
      const id = nouvelId();
      etat.notes.push({ id, ...lieu, titre: titreDe(texte), texte, cree: t, modif: t, epinglee: false, supprime: null });
      return ok(etat, { id });
    }
    case 'modifierNote': {
      const n = trouver(etat.notes, op.id);
      if (!n) return err(etatIn, 'Note introuvable.');
      if (typeof op.texte !== 'string') return err(etatIn, 'Texte invalide.');
      if (op.texte.length > LIMITES.texte) return err(etatIn, `Texte trop long (${LIMITES.texte} caractères au plus) : non enregistré.`);
      if (n.texte === op.texte) return ok(etatIn, { id: n.id, inchange: true });
      Object.assign(n, { texte: op.texte, titre: titreDe(op.texte), modif: t });
      return ok(etat, { id: n.id });
    }
    case 'epinglerNote': {
      const n = trouver(etat.notes, op.id);
      if (!n) return err(etatIn, 'Note introuvable.');
      n.epinglee = op.valeur === true;
      return ok(etat, { id: n.id });
    }
    case 'deplacerNote': {
      const n = trouver(etat.notes, op.id);
      if (!n) return err(etatIn, 'Note introuvable.');
      const lieu = emplacement(etat, op);
      if (!lieu) return err(etatIn, 'Destination introuvable.');
      Object.assign(n, lieu);
      return ok(etat, { id: n.id });
    }
    case 'supprimerNote': {
      const n = trouver(etat.notes, op.id);
      if (!n) return err(etatIn, 'Note introuvable.');
      n.supprime = t;
      return ok(etat, { id: n.id });
    }
    case 'creerProjet': case 'creerDossier': {
      const nom = nomPropre(op.nom);
      if (!nom) return err(etatIn, 'Nom vide.');
      if (op.type === 'creerProjet') {
        if (etat.projets.length >= LIMITES.projets) return err(etatIn, `Limite de ${LIMITES.projets} projets atteinte.`);
        const id = nouvelId(); etat.projets.push({ id, nom, cree: t, supprime: null }); return ok(etat, { id });
      }
      if (etat.dossiers.length >= LIMITES.dossiers) return err(etatIn, `Limite de ${LIMITES.dossiers} dossiers atteinte.`);
      const p = trouver(etat.projets, op.projet);
      if (!p) return err(etatIn, 'Projet introuvable.');
      const id = nouvelId(); etat.dossiers.push({ id, projet: p.id, nom, cree: t, supprime: null }); return ok(etat, { id });
    }
    case 'renommerProjet': case 'renommerDossier': {
      const x = trouver(op.type === 'renommerProjet' ? etat.projets : etat.dossiers, op.id);
      const nom = nomPropre(op.nom);
      if (!x) return err(etatIn, 'Élément introuvable.');
      if (!nom) return err(etatIn, 'Nom vide.');
      x.nom = nom; return ok(etat, { id: x.id });
    }
    // Supprimer un dossier ou un projet met aussi ses notes (et dossiers) vivants à la corbeille, avec la même date : la restauration les ramène ensemble.
    case 'supprimerDossier': {
      const d = trouver(etat.dossiers, op.id);
      if (!d) return err(etatIn, 'Dossier introuvable.');
      d.supprime = t;
      for (const n of etat.notes) if (n.dossier === d.id && vivant(n)) n.supprime = t;
      return ok(etat, { id: d.id });
    }
    case 'supprimerProjet': {
      const p = trouver(etat.projets, op.id);
      if (!p) return err(etatIn, 'Projet introuvable.');
      p.supprime = t;
      for (const d of etat.dossiers) if (d.projet === p.id && vivant(d)) d.supprime = t;
      for (const n of etat.notes) if (n.projet === p.id && vivant(n)) n.supprime = t;
      return ok(etat, { id: p.id });
    }
    case 'restaurer': {
      const liste = { note: etat.notes, dossier: etat.dossiers, projet: etat.projets }[op.cible];
      const x = liste && estId(op.id) ? liste.find((y) => y.id === op.id && y.supprime) : null;
      if (!x) return err(etatIn, 'Rien à restaurer.');
      const quand = x.supprime;
      if (op.cible === 'note') {
        const p = x.projet && etat.projets.find((y) => y.id === x.projet);
        const d = x.dossier && etat.dossiers.find((y) => y.id === x.dossier);
        if ((p && p.supprime) || (d && d.supprime)) { x.projet = null; x.dossier = null; } // parent à la corbeille : retour en Boîte de réception
        x.supprime = null;
      } else if (op.cible === 'dossier') {
        const p = etat.projets.find((y) => y.id === x.projet);
        if (p && p.supprime) p.supprime = null;
        x.supprime = null;
        for (const n of etat.notes) if (n.dossier === x.id && n.supprime === quand) n.supprime = null;
      } else {
        x.supprime = null;
        for (const d of etat.dossiers) if (d.projet === x.id && d.supprime === quand) d.supprime = null;
        for (const n of etat.notes) if (n.projet === x.id && n.supprime === quand) n.supprime = null;
      }
      return ok(etat, { id: x.id });
    }
    default: return err(etatIn, 'Opération inconnue.');
  }
}

// Export Markdown d'un projet, d'un dossier ou de la Boîte de réception : { nomFichier, contenu } ou null.
function versMarkdown(etat, cible) {
  const notesDe = (f) => etat.notes.filter((n) => vivant(n) && f(n)).sort(ordre);
  const bloc = (n, niv) => `${'#'.repeat(niv)} ${n.titre}${n.epinglee ? ' (épinglée)' : ''}\n\n_Créée le ${n.cree.slice(0, 10)}, modifiée le ${n.modif.slice(0, 10)}_\n\n${n.texte.trim()}\n`;
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'notes';
  if (!cible || cible.type === 'boite') {
    const l = notesDe((n) => !n.projet);
    return { nomFichier: 'notes-boite-de-reception.md', contenu: `# Boîte de réception\n\n${l.map((n) => bloc(n, 2)).join('\n')}`, nb: l.length };
  }
  if (cible.type === 'dossier') {
    const d = trouver(etat.dossiers, cible.id); if (!d) return null;
    const p = etat.projets.find((x) => x.id === d.projet);
    const l = notesDe((n) => n.dossier === d.id);
    return { nomFichier: `notes-${slug(p.nom)}-${slug(d.nom)}.md`, contenu: `# ${p.nom} / ${d.nom}\n\n${l.map((n) => bloc(n, 2)).join('\n')}`, nb: l.length };
  }
  if (cible.type === 'projet') {
    const p = trouver(etat.projets, cible.id); if (!p) return null;
    const racine = notesDe((n) => n.projet === p.id && !n.dossier);
    const parties = [`# ${p.nom}\n`, ...racine.map((n) => bloc(n, 2))];
    let nb = racine.length;
    for (const d of etat.dossiers.filter((x) => x.projet === p.id && vivant(x)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
      const l = notesDe((n) => n.dossier === d.id); nb += l.length;
      parties.push(`## ${d.nom}\n`, ...l.map((n) => bloc(n, 3)));
    }
    return { nomFichier: `notes-${slug(p.nom)}.md`, contenu: parties.join('\n'), nb };
  }
  return null;
}

module.exports = { LIMITES, CORBEILLE_MS, vide, normaliser, purger, vue, rechercher, appliquer, versMarkdown, titreDe };
