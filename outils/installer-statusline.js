// Ajoute la status line de Kinan Orchestre (outils/statusline-limites.js) à ~/.claude/settings.json, sans rien écraser :
// une status line déjà présente est chaînée (relancée par la nôtre, sa sortie reste affichée). Sauvegarde settings.json.bak-kinan avant écriture.
// Ne modifie que la clé « statusLine ». Usage : node outils/installer-statusline.js        (installer)
//                                             node outils/installer-statusline.js --retirer (remettre la status line d'avant)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const F = path.join(BASE, 'settings.json');
const SCRIPT = path.join(__dirname, 'statusline-limites.js').replace(/\\/g, '/');
const NOTRE = `node "${SCRIPT}"`;

let s = {};
try { if (fs.existsSync(F)) s = JSON.parse(fs.readFileSync(F, 'utf8').replace(/^﻿/, '')); } catch (e) { console.error('settings.json illisible : rien n\'est modifié (' + e.message + ')'); process.exit(1); }
if (!s || typeof s !== 'object' || Array.isArray(s)) { console.error('settings.json inattendu : rien n\'est modifié'); process.exit(1); }
const actuelle = s.statusLine && typeof s.statusLine === 'object' ? s.statusLine : null;
const estNotre = actuelle && typeof actuelle.command === 'string' && actuelle.command.includes('statusline-limites.js');

function enregistrer() {
  fs.mkdirSync(BASE, { recursive: true });
  if (fs.existsSync(F)) fs.copyFileSync(F, F + '.bak-kinan');
  const tmp = F + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, F);
}

if (process.argv.includes('--retirer')) {
  if (!estNotre) { console.log('La status line de Kinan n\'est pas installée : rien à faire.'); process.exit(0); }
  const m = /--suite-b64\s+(\S+)/.exec(actuelle.command);
  if (m) { const { command: _c, ...reste } = actuelle; s.statusLine = { ...reste, command: Buffer.from(m[1], 'base64').toString('utf8') }; }
  else delete s.statusLine;
  enregistrer();
  console.log(m ? 'Status line précédente remise.' : 'Status line de Kinan retirée.');
  process.exit(0);
}
if (estNotre) { console.log('Déjà installée : rien à faire.'); process.exit(0); }
if (actuelle && typeof actuelle.command === 'string' && actuelle.command.trim()) {
  s.statusLine = { ...actuelle, type: 'command', command: `${NOTRE} --suite-b64 ${Buffer.from(actuelle.command, 'utf8').toString('base64')}` };
  console.log('Status line existante chaînée (sa sortie reste affichée).');
} else {
  s.statusLine = { type: 'command', command: NOTRE };
  console.log('Status line ajoutée.');
}
enregistrer();
console.log('settings.json mis à jour (sauvegarde : settings.json.bak-kinan). Seule la clé « statusLine » a changé.');
