// Kinan Orchestre : limites d'utilisation Claude Code (session 5 h et hebdomadaire), lues dans <dossier d'état>/limites.json.
// Ce fichier est écrit par la status line de Claude Code (outils/statusline-limites.js), à partir du champ officiel « rate_limits ».
// 0 jeton, 0 réseau. Une fenêtre dont l'heure de reprise est passée est ignorée. Ne lève jamais d'exception.
'use strict';
const fs = require('fs');
const path = require('path');

const FENETRES = [['five_hour', '5 h'], ['seven_day', 'semaine']];

function lire(dossierEtat, maintenant = Date.now()) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(dossierEtat, 'limites.json'), 'utf8')); } catch { return { fenetres: [] }; }
  const fenetres = [];
  if (d && typeof d === 'object') {
    for (const [id, libelle] of FENETRES) {
      const w = d[id];
      if (!w || typeof w !== 'object') continue;
      const utilise = Number(w.used_percentage);
      if (!Number.isFinite(utilise)) continue;
      const reprise = Number.isFinite(Number(w.resets_at)) && w.resets_at !== null ? Number(w.resets_at) * 1000 : null;
      if (reprise !== null && reprise <= maintenant) continue; // fenêtre écoulée : la limite est revenue
      fenetres.push({ id, libelle, restant: Math.max(0, Math.min(100, Math.round((100 - utilise) * 10) / 10)), reprise });
    }
  }
  return { fenetres, maj: d && Number.isFinite(d.maj) ? d.maj : null };
}

// IPC « limites:lire » et événement « limites:maj » (relevé toutes les 10 s, envoyé seulement si changé).
function enregistrer({ ipcMain, BrowserWindow, dossierEtat }) {
  let dernier = '';
  ipcMain.handle('limites:lire', () => lire(dossierEtat));
  setInterval(() => {
    try {
      const n = lire(dossierEtat), brut = JSON.stringify(n.fenetres);
      if (brut === dernier) return;
      dernier = brut;
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('limites:maj', n);
    } catch { /* ne jamais planter */ }
  }, 10000);
}

module.exports = { lire, enregistrer };
