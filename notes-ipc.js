// Bloc-notes (onglet Notes de Gestion) : ponts IPC. 100 % local : aucun réseau, aucune IA, rien n'est envoyé.
// L'état vit ici (processus principal) ; le rendu n'envoie que des opérations, validées par notes-logique.js.
'use strict';
const { ipcMain, BrowserWindow, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const logique = require('./notes-logique');
const stockage = require('./notes-stockage');
const importation = require('./notes-import');

const F_NOTES = path.join(config.DOSSIER, 'notes.json');
let etat = null;
let avis = null; // message affiché une fois si notes.json était illisible
const genId = () => crypto.randomBytes(8).toString('hex');

function charger() {
  if (etat) return etat;
  const r = stockage.lire(F_NOTES);
  etat = logique.purger(r.etat, Date.now());
  if (r.source !== 'fichier' && r.corrompu) avis = r.source === 'sauvegarde' ? 'notes.json était illisible : la sauvegarde notes.json.bak a été reprise (copie du fichier abîmé conservée).' : 'notes.json était illisible et sans sauvegarde : copie du fichier abîmé conservée dans le dossier d\'état.';
  return etat;
}

function enregistrer() {
  try { charger(); } catch { etat = logique.vide(); }
  ipcMain.handle('notes:lire', () => { const v = logique.vue(charger()); v.avis = avis; avis = null; return v; });
  ipcMain.handle('notes:note', (_e, id) => {
    const n = charger().notes.find((x) => x.id === id && !x.supprime);
    return n ? { id: n.id, texte: n.texte, projet: n.projet, dossier: n.dossier, epinglee: n.epinglee, cree: n.cree, modif: n.modif } : null;
  });
  ipcMain.handle('notes:chercher', (_e, q) => logique.rechercher(charger(), typeof q === 'string' ? q : ''));
  ipcMain.handle('notes:op', (_e, op) => {
    const r = logique.appliquer(charger(), op, { now: Date.now(), genId });
    if (!r.ok || r.inchange) return { ok: r.ok, erreur: r.erreur || null, id: r.id || null };
    try { stockage.ecrire(F_NOTES, r.etat); } catch (err) { return { ok: false, erreur: 'Enregistrement impossible : ' + String(err.message).slice(0, 120) }; }
    etat = r.etat;
    return { ok: true, id: r.id || null };
  });
  // Import de fichiers texte (.txt, .md) : une note par fichier, dans le lieu demandé. Tout est validé ici ; les fichiers ne sont que lus.
  const lieuValide = (l) => (l && typeof l === 'object' ? { projet: typeof l.projet === 'string' ? l.projet : null, dossier: typeof l.dossier === 'string' ? l.dossier : null } : {});
  function terminerImport(entrees, lieu) {
    const r = importation.importer(charger(), entrees, lieuValide(lieu), { now: Date.now(), genId });
    if (r.importees) {
      try { stockage.ecrire(F_NOTES, r.etat); } catch (err) { return { ok: false, erreur: 'Enregistrement impossible : ' + String(err.message).slice(0, 120) }; }
      etat = r.etat;
    }
    return { ok: true, importees: r.importees, ignorees: r.ignorees.length, message: r.message, ids: r.ids };
  }
  ipcMain.handle('notes:importer', async (e, lieu) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Importer des fichiers texte', defaultPath: app.getPath('documents'), properties: ['openFile', 'multiSelections'], filters: [{ name: 'Fichiers texte (.txt, .md)', extensions: ['txt', 'md'] }] });
    if (r.canceled || !Array.isArray(r.filePaths) || !r.filePaths.length) return { ok: false, annule: true };
    return terminerImport(importation.lireFichiers(r.filePaths), lieu);
  });
  ipcMain.handle('notes:importerContenus', (_e, lieu, fichiers) => {
    if (!Array.isArray(fichiers) || !fichiers.length) return { ok: false, erreur: 'Aucun fichier reçu.' };
    return terminerImport(fichiers.slice(0, importation.IMPORT.fichiers + 1).map(importation.entreeRendu), lieu);
  });
  // Export Markdown : dossier choisi par une boîte de dialogue du système ; un fichier existant n'est jamais écrasé (suffixe -2, -3…).
  ipcMain.handle('notes:exporter', async (e, cible) => {
    const c = cible && typeof cible === 'object' ? { type: ['boite', 'projet', 'dossier'].includes(cible.type) ? cible.type : 'boite', id: cible.id } : { type: 'boite' };
    const md = logique.versMarkdown(charger(), c);
    if (!md) return { ok: false, erreur: 'Rien à exporter.' };
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Exporter en Markdown : choisir un dossier', defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, annule: true };
    const base = md.nomFichier.replace(/\.md$/, '');
    for (let i = 1; i < 100; i++) {
      const f = path.join(r.filePaths[0], base + (i > 1 ? '-' + i : '') + '.md');
      try { fs.writeFileSync(f, md.contenu, { encoding: 'utf8', flag: 'wx' }); return { ok: true, fichier: f, nb: md.nb }; } catch (err) {
        if (err.code !== 'EEXIST') return { ok: false, erreur: 'Écriture impossible : ' + String(err.message).slice(0, 120) };
      }
    }
    return { ok: false, erreur: 'Trop de fichiers du même nom dans ce dossier.' };
  });
}

module.exports = { enregistrer };
