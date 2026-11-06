// Commandes des boutons de l'en-tête (Gestion, Légende, sons). Aucun accès fichier venant de la page.
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let fenetreLegende = null;
function ouvrirLegende() {
  if (fenetreLegende && !fenetreLegende.isDestroyed()) {
    if (fenetreLegende.isMinimized()) fenetreLegende.restore();
    fenetreLegende.focus();
    return;
  }
  fenetreLegende = new BrowserWindow({
    width: 420, height: 520, minWidth: 340, minHeight: 360, backgroundColor: '#14121c', title: 'Kinan Orchestre : légende',
    icon: path.join(__dirname, 'assets', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  fenetreLegende.loadFile(path.join(__dirname, 'src', 'legende.html'));
  fenetreLegende.on('closed', () => { fenetreLegende = null; });
}

function enregistrer({ gestion, son }) {
  ipcMain.on('ui:gestion', () => gestion.ouvrirGestion());
  ipcMain.on('ui:legende', () => ouvrirLegende());
  ipcMain.handle('ui:son-lire', () => son.actif());
  ipcMain.on('ui:son-regler', (_e, actif) => son.regler(!!actif));
  ipcMain.on('ui:son-test', () => {
    son.jouerReel('question', 'kinan');
    setTimeout(() => son.jouerReel('fin', 'skyze'), 1400);
  });
}

module.exports = { enregistrer, ouvrirLegende };
