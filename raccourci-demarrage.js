// Recrée le raccourci Bureau / menu Démarrer (outils/raccourci.ps1, AUMID kinan-os.dashboard) au démarrage de l'appli.
// Windows seulement, idempotent, silencieux, non bloquant, erreurs ignorées. Aucun réseau.
'use strict';
const path = require('path');

function commande(plateforme, dossier) {
  if (plateforme !== 'win32') return null;
  return { exe: 'powershell', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dossier, 'outils', 'raccourci.ps1')] };
}

function lancer(plateforme, dossier, spawn) {
  const c = commande(plateforme, dossier);
  if (!c) return false;
  try {
    const enfant = (spawn || require('child_process').spawn)(c.exe, c.args, { windowsHide: true, stdio: 'ignore', detached: true });
    if (enfant && enfant.on) enfant.on('error', () => {});
    if (enfant && enfant.unref) enfant.unref();
    return true;
  } catch { return false; }
}

module.exports = { commande, lancer };
