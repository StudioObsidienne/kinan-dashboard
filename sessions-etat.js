// Plusieurs conversations Claude Code (plugin 0.3.0) : registre sessions.json et fichiers sessions/<sid>.json.
// Fonctions pures, sauf etatSession (lecture d'un fichier). Testées dans test/sessions-etat.test.js.
'use strict';
const fs = require('fs');
const path = require('path');

const QUINZE_MIN = 15 * 60 * 1000;
const UN_JOUR = 24 * 3600 * 1000;
const SID_VALIDE = /^[A-Za-z0-9-]{1,64}$/; // même filtrage que le plugin (hooks/lib/fichiers.js, nomSur)
const PRIORITE = { erreur: 3, doute: 2, travail: 1, repos: 0 };
// Identifiant de conversation (les deux choix spéciaux « recente » et « toutes » n'en sont pas).
const estSession = (x) => typeof x === 'string' && x !== 'recente' && x !== 'toutes' && SID_VALIDE.test(x);
const objet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Nombre d'agents au travail (exemplaires compris), sans compter le juge.
function compterActifs(etat) {
  let n = 0;
  for (const [k, a] of Object.entries((objet(etat) && objet(etat.agents) && etat.agents) || {})) {
    if (k === 'kinan' || !objet(a) || a.etat !== 'travail') continue;
    n += Array.isArray(a.instances) && a.instances.length > 1 ? a.instances.length : 1;
  }
  return n;
}

// Conversations vivantes : ni terminées (fin), ni au repos depuis plus de 15 min, ni muettes depuis 24 h.
// Ordre stable (début, puis identifiant). Libellé : renommage de Jean, sinon nom du dossier ; doublon -> « projet · 2 ».
// Rend seulement { id, libelle, etat, actifs, maj } (jamais de chemin, de journal ni de texte de prompt).
function listerSessions(registre, libelles, now, etats = {}) {
  if (!objet(registre)) return [];
  const lib = objet(libelles) ? libelles : {};
  const vivantes = Object.entries(registre)
    .filter(([id, s]) => SID_VALIDE.test(id) && objet(s) && !s.fin)
    .filter(([, s]) => { const maj = Number(s.maj) || 0; return now - maj < UN_JOUR && !((s.etat || 'repos') === 'repos' && now - maj > QUINZE_MIN); })
    .sort(([ia, a], [ib, b]) => ((Number(a.debut) || Number(a.maj) || 0) - (Number(b.debut) || Number(b.maj) || 0)) || (ia < ib ? -1 : ia > ib ? 1 : 0));
  const vus = {};
  return vivantes.map(([id, s]) => {
    const perso = typeof lib[id] === 'string' && lib[id].trim() ? lib[id].trim().slice(0, 40) : '';
    let libelle = perso;
    if (!libelle) {
      const base = String(s.projet || 'projet').slice(0, 40);
      vus[base] = (vus[base] || 0) + 1;
      libelle = vus[base] > 1 ? base + ' · ' + vus[base] : base;
    }
    const actifs = compterActifs(etats[id]);
    const etat = PRIORITE[s.etat] !== undefined ? s.etat : 'repos';
    return { id, libelle, etat: etat === 'repos' && actifs ? 'travail' : etat, actifs, maj: Number(s.maj) || 0 };
  });
}

// État d'une conversation (sessions/<sid>.json), ou null si l'identifiant est invalide ou le fichier absent/illisible.
function etatSession(dossier, sid) {
  if (typeof sid !== 'string' || !SID_VALIDE.test(sid)) return null;
  try {
    const e = JSON.parse(fs.readFileSync(path.join(dossier, 'sessions', sid + '.json'), 'utf8').replace(/^﻿/, ''));
    if (!objet(e)) return null;
    if (!objet(e.agents)) e.agents = {};
    return e;
  } catch { return null; }
}

// « Toutes » : par agent, erreur > doute > travail > repos ; à égalité, la tâche la plus récente ; exemplaires concaténés.
// entrees : [{ libelle, etat }] (ou directement des états). La question du juge porte le libellé de sa conversation.
function fusionner(entrees) {
  const agents = {};
  for (const x of Array.isArray(entrees) ? entrees : []) {
    const etat = objet(x) && objet(x.etat) ? x.etat : x;
    const libelle = objet(x) && typeof x.libelle === 'string' ? x.libelle : '';
    if (!objet(etat) || !objet(etat.agents)) continue;
    for (const [k, a] of Object.entries(etat.agents)) {
      if (!objet(a)) continue;
      const p = PRIORITE[a.etat] !== undefined ? PRIORITE[a.etat] : 0;
      const cour = agents[k];
      const inst = Array.isArray(a.instances) ? a.instances : [];
      if (!cour) { agents[k] = { a, p, inst: [...inst], libelle }; continue; }
      cour.inst.push(...inst);
      if (p > cour.p || (p === cour.p && (Number(a.maj) || 0) > (Number(cour.a.maj) || 0))) Object.assign(cour, { a, p, libelle });
    }
  }
  const res = { agents: {} };
  for (const [k, { a, inst, libelle }] of Object.entries(agents)) {
    const r = { ...a };
    delete r.instances;
    if (inst.length) r.instances = inst;
    if (objet(r.question)) r.question = { ...r.question, ...(libelle ? { session: libelle } : {}) };
    res.agents[k] = r;
  }
  return res;
}

// Message envoyé au rendu : la conversation choisie et, pour chacune, les 5 clés { id, libelle, etat, actifs, maj }.
// Conversation choisie disparue : repli sur « recente » (la sélection par défaut), signalé par repli: true.
// Moins de 2 conversations : la barre est masquée et la vue revient à « recente » (affichage de 0.3.1).
function chargeRendu(liste, choisie) {
  const sessions = (Array.isArray(liste) ? liste : []).map(({ id, libelle, etat, actifs, maj }) => ({ id, libelle, etat, actifs, maj }));
  const repli = estSession(choisie) && !sessions.some((s) => s.id === choisie);
  const choix = repli || sessions.length < 2 || !(choisie === 'toutes' || estSession(choisie)) ? 'recente' : choisie;
  return { choisie: choix, repli, sessions };
}

// Choix accepté : « recente », « toutes » ou une conversation de la liste ; tout autre identifiant est refusé.
const choixValide = (id, liste) => id === 'recente' || id === 'toutes' || (estSession(id) && (liste || []).some((s) => s.id === id));

module.exports = { listerSessions, etatSession, fusionner, compterActifs, chargeRendu, choixValide, estSession, SID_VALIDE };
