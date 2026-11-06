// Vérification statique « zéro réseau » du tableau de bord. Node seul, sans dépendance. Usage : node outils/verifier-hors-ligne.js
// Échoue (code 1) si un module réseau, une API réseau, une ressource distante ou une page sans CSP stricte est trouvé.
// Affiche ensuite la liste des accès aux fichiers (lectures et écritures) relevés dans le code, avec leur chemin.
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const IGNORER = new Set(['node_modules', '.git', 'out', 'dist']);
const MOI = path.resolve(__filename);

function fichiers(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (IGNORER.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) fichiers(p, acc);
    else if (/\.(js|cjs|mjs|html|css|json|cmd|ps1)$/i.test(e.name) && path.resolve(p) !== MOI && e.name !== 'package-lock.json') acc.push(p);
  }
  return acc;
}

// Motifs interdits (code et pages).
const INTERDITS = [
  [/require\(\s*['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|cluster|inspector)['"]\s*\)/, 'module réseau'],
  [/require\(\s*['"](?:node:)?child_process['"]\s*\)/, 'processus externe'],
  [/\bfrom\s+['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process)['"]/, 'import réseau'],
  [/\bimport\s*\(/, 'import dynamique'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bnet\.request\b|\bnet\.fetch\b|\brequire\(['"]electron['"]\)\.net\b|\{[^}]*\bnet\b[^}]*\}\s*=\s*require\(['"]electron['"]\)/, 'module net d\'Electron'],
  [/\bopenExternal\b/, 'ouverture d\'URL externe'],
  [/\bRTCPeerConnection\b/, 'WebRTC'],
  [/<(?:script|link|img|iframe|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i, 'ressource distante dans une page'],
  [/url\(\s*["']?(?:https?:)?\/\//i, 'ressource distante dans une feuille de style'],
  [/@import\b/, '@import CSS']
];

// Exceptions déclarées : chaque fichier n'a droit qu'aux motifs listés, avec des contrôles supplémentaires (plus bas).
// - mise-a-jour.js : vérification des mises à jour (raw.githubusercontent.com) et « git pull --ff-only » ; DÉSACTIVÉE par défaut,
//   chargée par main.js seulement si kinan.config.json contient « miseAJour.verifier: true ».
// - outils/statusline-limites.js : lancé par Claude Code (status line), jamais par l'appli ; processus seulement pour chaîner une status line existante.
const EXCEPTIONS = {
  'mise-a-jour.js': ['module réseau', 'processus externe'],
  'outils/statusline-limites.js': ['processus externe']
};
const erreurs = [];
const acces = [];
const liste = fichiers(RACINE);
for (const f of liste) {
  const rel = path.relative(RACINE, f).replace(/\\/g, '/');
  const texte = fs.readFileSync(f, 'utf8');
  const lignes = texte.split(/\r?\n/);
  lignes.forEach((l, i) => {
    for (const [re, quoi] of INTERDITS) if (re.test(l) && !(EXCEPTIONS[rel] || []).includes(quoi)) erreurs.push(`${rel}:${i + 1} : ${quoi}`);
    const re = /\bfs\.(readFileSync|writeFileSync|appendFileSync|renameSync|unlinkSync|readdirSync|mkdirSync|openSync|statSync|existsSync)\s*\(([^)]{0,110})/g;
    for (let m; (m = re.exec(l));) {
      const ecrit = /^(write|append|rename|unlink|mkdir)/.test(m[1]) || (m[1] === 'openSync' && !/,\s*'r'\s*$/.test(m[2]));
      acces.push(`${ecrit ? 'ÉCRIT' : 'lit  '}  ${rel}:${i + 1}  ${m[1]}(${m[2].trim()})`);
    }
  });
  // Chaque page HTML doit porter une CSP qui interdit toute connexion et toute ressource par défaut.
  if (/\.html$/i.test(f)) {
    const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(texte);
    if (!csp) erreurs.push(`${rel} : CSP absente`);
    else {
      const c = csp[1];
      if (!/default-src 'none'/.test(c)) erreurs.push(`${rel} : CSP sans default-src 'none'`);
      if (!/connect-src 'none'/.test(c)) erreurs.push(`${rel} : CSP sans connect-src 'none'`);
      if (/https?:|\*|wss?:/.test(c)) erreurs.push(`${rel} : CSP qui autorise une origine distante`);
    }
  }
}
// Le processus principal doit bloquer les requêtes http(s)/ws(s) au niveau de la session.
const main = fs.readFileSync(path.join(RACINE, 'main.js'), 'utf8');
if (!/onBeforeRequest\(\s*\{\s*urls:\s*\[[^\]]*'https:\/\/\*\/\*'[^\]]*\]/.test(main)) erreurs.push('main.js : blocage des requêtes réseau absent');
// Contrôles des exceptions : une seule origine réseau, aucune URL en dur, chargement conditionnel, désactivé par défaut.
try {
  const maj = fs.readFileSync(path.join(RACINE, 'mise-a-jour.js'), 'utf8');
  if (!/const HOTE = 'raw\.githubusercontent\.com';/.test(maj)) erreurs.push('mise-a-jour.js : origine réseau autre que raw.githubusercontent.com');
  if (/:\/\//.test(maj)) erreurs.push('mise-a-jour.js : URL en dur inattendue');
  if ((maj.match(/hostname:/g) || []).length !== 1 || !/hostname: HOTE\b/.test(maj)) erreurs.push('mise-a-jour.js : requête vers un autre hôte que HOTE');
  if (/['"](?:--force|reset|push)['"]/.test(maj)) erreurs.push('mise-a-jour.js : commande git interdite (force, reset, push)');
} catch { /* fichier absent : rien à contrôler */ }
for (const l of main.split(/\r?\n/)) {
  if (/require\(\s*['"]\.\/mise-a-jour['"]\s*\)/.test(l) && !/miseAJour\.verifier === true/.test(l)) erreurs.push('main.js : mise-a-jour.js chargé sans la condition « miseAJour.verifier === true »');
}
if (!/u\.miseAJour\.verifier === true/.test(fs.readFileSync(path.join(RACINE, 'config.js'), 'utf8'))) erreurs.push('config.js : la vérification des mises à jour doit être désactivée par défaut');
// Dépendances : aucune dépendance d'exécution (seul Electron, en développement).
const pkg = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
const dep = Object.keys(pkg.dependencies || {});
if (dep.length) erreurs.push('package.json : dépendances d\'exécution inattendues : ' + dep.join(', '));

console.log(`${liste.length} fichiers analysés.`);
console.log('\nAccès aux fichiers relevés dans le code (chemins résolus : voir README, section « Fichiers lus et écrits ») :');
for (const a of acces) console.log('  ' + a);
if (erreurs.length) {
  console.error('\nÉCHEC : ' + erreurs.length + ' problème(s) :');
  for (const e of erreurs) console.error('  ' + e);
  process.exit(1);
}
console.log('\nExceptions déclarées : mise-a-jour.js (vérification des mises à jour, désactivée par défaut, raw.githubusercontent.com seulement) ; outils/statusline-limites.js (lancé par Claude Code, pas par l\'appli).');
console.log('OK : aucun appel réseau par défaut, aucune ressource distante, CSP stricte dans chaque page, blocage réseau actif dans main.js.');
