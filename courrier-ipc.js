// Kinan Orchestre (édition publique) : ponts IPC du courrier, option DÉSACTIVÉE par défaut.
// Tant que l'option n'est pas activée (courrier-option.json, « actif: true », écrit seulement par le bouton « Activer » après confirmation),
// courrier.js n'est pas chargé : aucune bibliothèque de messagerie, aucune connexion, aucun processus. La page ne peut jamais lire les identifiants.
'use strict';
const { ipcMain, BrowserWindow, safeStorage, clipboard, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const fournisseurs = require('./fournisseurs');

const F_OPTION = path.join(config.DOSSIER, 'courrier-option.json');
const estActive = () => { try { return JSON.parse(fs.readFileSync(F_OPTION, 'utf8')).actif === true; } catch { return false; } };
const ecrireOption = (actif) => { fs.mkdirSync(config.DOSSIER, { recursive: true }); fs.writeFileSync(F_OPTION, JSON.stringify({ actif, maj: new Date().toISOString() }, null, 2)); };

let moteur = null;
// Seul point de chargement de courrier.js : jamais avant l'activation explicite.
const charger = () => { if (!moteur && estActive()) moteur = require('./courrier').creerCourrier({ safeStorage, dossierEtat: config.DOSSIER, racine: __dirname }); return estActive() ? moteur : null; };
const DESACTIVE = { ok: false, erreur: "Le courrier est désactivé : active-le d'abord dans l'onglet Courrier." };

function enregistrer() {
  const diffuser = () => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('courrier:maj'); };
  const texte = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
  const serveur = (o) => (o && typeof o === 'object' ? { hote: texte(o.hote, 260), port: texte(String(o.port == null ? '' : o.port), 6), securite: texte(o.securite, 10) } : null);
  const avec = (f) => (...a) => { const m = charger(); return m ? f(m, ...a) : DESACTIVE; };

  ipcMain.handle('courrier:option', () => ({ actif: estActive(), fournisseurs: fournisseurs.liste() }));
  ipcMain.handle('courrier:activer', async (e) => {
    const fen = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showMessageBox(fen, { type: 'question', buttons: ['Activer', 'Annuler'], defaultId: 1, cancelId: 1, title: 'Activer le courrier',
      message: 'Activer le courrier ?',
      detail: "Le tableau de bord pourra se connecter aux serveurs IMAP et SMTP de la boîte que tu choisis, mais seulement quand tu cliques sur Tester, Relever ou Envoyer, puis toutes les 30 minutes une fois la connexion vérifiée. Les récaps lancent Claude Code (tes jetons). Aucun mail ne part sans ta confirmation." });
    if (r.response !== 0) return { ok: false, annule: true };
    try { ecrireOption(true); } catch (err) { return { ok: false, erreur: 'Écriture impossible : ' + String(err.message).slice(0, 120) }; }
    diffuser(); return { ok: true };
  });
  ipcMain.handle('courrier:desactiver', () => { try { ecrireOption(false); } catch { return { ok: false, erreur: 'Écriture impossible.' }; } diffuser(); return { ok: true }; });
  ipcMain.handle('courrier:statut', avec((m) => ({ ...m.statut(), actif: true })));
  ipcMain.handle('courrier:enregistrer', avec((m, _e, d) => {
    d = d || {};
    const r = m.definirIdentifiants({ fournisseur: texte(d.fournisseur, 20), adresse: texte(d.adresse, 200), identifiant: texte(d.identifiant, 200), mdp: texte(d.mdp, 200),
      imap: serveur(d.imap), smtp: serveur(d.smtp) });
    diffuser(); return { ok: r.ok, erreur: r.erreur || null, avertissements: r.avertissements || [] };
  }));
  ipcMain.handle('courrier:oublier', avec((m) => { const r = m.oublierIdentifiants(); diffuser(); return r; }));
  ipcMain.handle('courrier:tester', avec(async (m) => { const r = await m.tester(); diffuser(); return r; }));
  ipcMain.handle('courrier:relever', avec(async (m) => { const r = await m.relever(); diffuser(); return r; }));
  ipcMain.handle('courrier:a-valider', avec((m) => m.listeAValider()));
  ipcMain.handle('courrier:decider', avec((m, _e, fichier, action, modifs) => {
    const r = m.decider(typeof fichier === 'string' ? fichier : '', action === 'valider' ? 'valider' : 'refuser', modifs && typeof modifs === 'object' ? modifs : null);
    diffuser(); return r;
  }));
  ipcMain.handle('courrier:valides', avec((m) => m.listeValides()));
  // Envoi : la confirmation est une boîte de dialogue du processus principal (la page ne peut pas la contourner), avec la liste des destinataires recalculés.
  ipcMain.handle('courrier:envoyer', avec(async (m, e, fichiers) => {
    const demandes = Array.isArray(fichiers) ? fichiers.filter((f) => typeof f === 'string').slice(0, 200) : [];
    const prets = m.listeValides().filter((x) => x.pret && demandes.includes(x.fichier));
    if (!prets.length) return { ok: false, envoyes: 0, erreur: "Rien de prêt à envoyer parmi la sélection : rien n'a été envoyé." };
    const fen = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showMessageBox(fen, { type: 'warning', buttons: ['Envoyer', 'Annuler'], defaultId: 1, cancelId: 1, title: 'Confirmer l\'envoi',
      message: `Envoyer réellement ${prets.length} mail(s) ?`,
      detail: prets.slice(0, 15).map((x) => `- ${x.destinataire} : ${x.objet || x.fichier}`).join('\n') + (prets.length > 15 ? `\n… et ${prets.length - 15} autre(s)` : '') + "\n\nDestinataires recalculés depuis les mails d'origine." });
    if (r.response !== 0) return { ok: false, annule: true, envoyes: 0 };
    const res = await m.envoyer(prets.map((x) => x.fichier), { confirme: true });
    diffuser(); return res;
  }));
  ipcMain.handle('courrier:classer', avec((m, _e, fichier, decision) => { const r = m.classer(typeof fichier === 'string' ? fichier : '', decision === 'envoye' ? 'envoye' : 'non-envoye'); diffuser(); return r; }));
  const typeRecap = (t) => (t === 'devis' ? 'devis' : 'mails');
  ipcMain.handle('courrier:copier-recap', avec(async (m, _e, type) => {
    const t = m.recapTextePour(typeRecap(type));
    if (!t) return { ok: false, erreur: 'Aucun récap à copier.' };
    try { clipboard.writeText(t); } catch { return { ok: false, erreur: 'Copie impossible.' }; }
    return { ok: true };
  }));
  ipcMain.handle('courrier:enregistrer-recap', avec(async (m, e, type) => {
    const t = typeRecap(type); const contenu = m.recapTextePour(t);
    if (!contenu) return { ok: false, erreur: 'Aucun récap à enregistrer.' };
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Enregistrer le récap', defaultPath: path.join(app.getPath('documents'), 'recap-' + t + '.txt'), filters: [{ name: 'Texte', extensions: ['txt'] }] });
    if (r.canceled || !r.filePath) return { ok: false, annule: true };
    try { fs.writeFileSync(r.filePath, contenu + '\n', 'utf8'); return { ok: true, fichier: r.filePath }; } catch (err) { return { ok: false, erreur: 'Écriture impossible : ' + String(err.message).slice(0, 120) }; }
  }));
  ipcMain.handle('courrier:recap-lancer', avec((m, _e, type) => { const r = m.lancerRecap(typeRecap(type)); diffuser(); return r; }));
  ipcMain.handle('courrier:recap-etat', avec((m) => m.recapEtat()));
  // Suivi : diffusion toutes les 3 s tant qu'un récap tourne ; relève automatique toutes les 30 min si l'option est active et la connexion vérifiée.
  setInterval(() => { if (moteur && estActive() && moteur.recapEtat().etat === 'en cours') diffuser(); }, 3000);
  setInterval(async () => { const m = charger(); if (m && m.estConnecte()) { await m.relever(); diffuser(); } }, 30 * 60000);
}

module.exports = { enregistrer, estActive };
