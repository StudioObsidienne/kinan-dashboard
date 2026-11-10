// Test de démarrage réel (node --test test/) : lance Electron avec KINAN_TEST_DEMARRAGE=1 dans un dossier d'état temporaire,
// attend « DEMARRAGE OK » (page chargée, aucune erreur dans la console de la page ni dans le processus principal).
// Aucun réseau : la vérification des mises à jour est désactivée dans la configuration de test. Ignoré si Electron n'est pas installé.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let electron = null;
try { electron = require('electron'); } catch { /* npm install non fait */ }

// Windows (CI) : le binaire Electron peut être brièvement verrouillé (EBUSY) par l'antivirus ou un autre test ; on réessaie.
async function demarrer(dossier, extra) {
  for (let essai = 1; ; essai++) {
    try { return await demarrerUneFois(dossier, extra); }
    catch (e) { if (essai >= 6 || !/EBUSY|EPERM|EACCES/.test(String(e && e.code))) throw e; await new Promise((r) => setTimeout(r, 1500)); }
  }
}

function demarrerUneFois(dossier, extra) {
  return new Promise((ok, ko) => {
    const env = { ...process.env, KINAN_TEST_DEMARRAGE: '1', KINAN_OS_DOSSIER: dossier, ...(extra || {}) };
    delete env.ELECTRON_RUN_AS_NODE;
    let p;
    try { p = spawn(electron, ['.'], { cwd: path.join(__dirname, '..'), env }); } catch (e) { return ko(e); }
    p.on('error', ko);
    let sortie = '';
    p.stdout.on('data', (x) => (sortie += x));
    p.stderr.on('data', (x) => (sortie += x));
    const garde = setTimeout(() => p.kill(), 60000);
    p.on('close', (code) => { clearTimeout(garde); ok({ code, sortie }); });
  });
}

function dossierTest(t, fichiers) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kinan-demarrage-'));
  t.after(() => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignoré */ } });
  fs.writeFileSync(path.join(d, 'kinan.config.json'), JSON.stringify({ miseAJour: { verifier: false } }));
  for (const [nom, contenu] of Object.entries(fichiers || {})) fs.writeFileSync(path.join(d, nom), contenu);
  return d;
}

test('le tableau de bord démarre et charge sa page sans erreur', { skip: !electron && 'Electron absent (npm install)', timeout: 90000 }, async (t) => {
  const d = dossierTest(t);
  const r = await demarrer(d);
  assert.match(r.sortie, /DEMARRAGE OK/, r.sortie.slice(-2000));
  assert.strictEqual(r.code, 0, r.sortie.slice(-2000));
  assert.ok(fs.existsSync(path.join(d, 'state.json')), 'état initial créé');
});

test('fichiers d\'état corrompus : le tableau de bord démarre quand même', { skip: !electron && 'Electron absent (npm install)', timeout: 90000 }, async (t) => {
  const d = dossierTest(t, { 'state.json': 'null', 'sessions.json': 'null', 'taches.json': '{tronqué', 'historique.jsonl': 'pas du json\n', 'notes.json': '{tronqué' });
  const r = await demarrer(d);
  assert.match(r.sortie, /DEMARRAGE OK/, r.sortie.slice(-2000));
  assert.strictEqual(r.code, 0, r.sortie.slice(-2000));
});

test('onglet Notes : Ctrl+N ouvre une note, la saisie est enregistrée dans notes.json (sauvegarde .bak)', { skip: !electron && 'Electron absent (npm install)', timeout: 90000 }, async (t) => {
  const d = dossierTest(t);
  const r = await demarrer(d, { KINAN_TEST_ONGLET: 'notes' });
  assert.match(r.sortie, /DEMARRAGE OK/, r.sortie.slice(-2000));
  assert.strictEqual(r.code, 0, r.sortie.slice(-2000));
  const notes = JSON.parse(fs.readFileSync(path.join(d, 'notes.json'), 'utf8')).notes;
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].titre, 'Idée test démarrage');
  assert.strictEqual(notes[0].projet, null, 'Boîte de réception');
  assert.ok(fs.existsSync(path.join(d, 'notes.json.bak')), 'sauvegarde écrite');
});
