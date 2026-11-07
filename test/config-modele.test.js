// Modèle du juge et des agents (config.js, agent-ipc.js, lancement de claude par le courrier). Aucun réseau, aucun jeton.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const temp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kinan-modele-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
// Modules rechargés : config.js fixe le dossier d'état au chargement. Rend config.charger() et le détail du juge (agent-ipc).
function lire(dossier) {
  const ancien = process.env.KINAN_OS_DOSSIER;
  process.env.KINAN_OS_DOSSIER = dossier;
  try {
    for (const m of ['config.js', 'agent-ipc.js']) delete require.cache[require.resolve(path.join(RACINE, m))];
    const c = require('../config').charger();
    const a = require('../agent-ipc').donnees('kinan', () => ({}), dossier);
    return JSON.parse(JSON.stringify({ c, kinan: a.modele }));
  } finally {
    if (ancien === undefined) delete process.env.KINAN_OS_DOSSIER; else process.env.KINAN_OS_DOSSIER = ancien;
  }
}

// Ancienne kinan.config.json (format antérieur, sans « version ») : agents personnalisés sans « modele », juge.modele hérité.
const ANCIENNE = {
  miseAJour: { verifier: true },
  juge: { couleur: '#112233', modele: 'opus' },
  agents: {
    drafion: { nom: 'Drafion', base: 'lecture', modele: 'haiku' },
    johms: { nom: 'Johms', base: 'expert', modele: 'opus', couleur: '#445566' },
    lucas: { nom: 'Lucas', base: 'lucas', role: 'Mails et maintenance' },
    julius: { nom: 'Julius Malanus', base: 'julius-malanus', modele: 'Sonnet' },
    herite: { nom: 'Hérité', base: 'perso', modele: 'inherit' }
  },
  relais: { minutes: 90, jetons: 400000 },
  titreBureau: 'Mon bureau',
  sons: { actif: false }
};

test('juge : Sonnet dans la config et dans la fenêtre de détail (plus de « opus » en dur)', (t) => {
  const r = lire(temp(t));
  assert.strictEqual(r.c.juge.modele, 'sonnet');
  assert.strictEqual(r.kinan, 'sonnet');
});

test('juge : même modèle que agents/kinan.md du plugin (si le plugin est à côté)', (t) => {
  const f = path.join(RACINE, '..', 'kinan-plugin', 'agents', 'kinan.md');
  if (!fs.existsSync(f)) return t.skip('plugin absent');
  const m = /^model:\s*(\S+)/m.exec(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(require('../config').MODELE_JUGE, m && m[1]);
});

test('mise à jour depuis une ancienne config : défauts -> Sonnet, choix explicites et préférences conservés, fichier intact', (t) => {
  const d = temp(t);
  const f = path.join(d, 'kinan.config.json');
  fs.writeFileSync(f, JSON.stringify(ANCIENNE, null, 2));
  const avant = fs.readFileSync(f, 'utf8');
  const r = lire(d);
  const m = Object.fromEntries(r.c.agents.map((a) => [a.id, a.modele]));
  assert.strictEqual(r.kinan, 'sonnet');
  assert.deepStrictEqual(m, { drafion: 'haiku', johms: 'opus', lucas: 'sonnet', julius: 'sonnet', herite: 'inherit' });
  assert.deepStrictEqual(r.c.relais, { minutes: 90, jetons: 400000 });
  assert.strictEqual(r.c.titreBureau, 'Mon bureau');
  assert.strictEqual(r.c.juge.couleur, '#112233');
  assert.strictEqual(r.c.agents.find((a) => a.id === 'johms').couleur, '#445566');
  assert.strictEqual(r.c.sons.actif, false);
  assert.strictEqual(r.c.miseAJour.verifier, true);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), avant);
  assert.deepStrictEqual(lire(d), r); // idempotent
});

test('fichier absent, illisible, clés manquantes : aucun repli vers Opus hors base expert', (t) => {
  for (const contenu of [null, '{ cassé', '{}', '{"agents":{"x":{}}}', '{"agents":null,"juge":null,"relais":null}']) {
    const d = temp(t);
    if (contenu !== null) fs.writeFileSync(path.join(d, 'kinan.config.json'), contenu);
    const r = lire(d);
    assert.strictEqual(r.kinan, 'sonnet', String(contenu));
    for (const a of r.c.agents) if (a.base !== 'expert') assert.notStrictEqual(a.modele, 'opus', `${contenu} ${a.id}`);
    if (contenu === '{"agents":{"x":{}}}') assert.strictEqual(r.c.agents[0].modele, 'sonnet');
  }
});

test('courrier : claude lancé avec --agent du plugin, sans --model (le modèle de l\'agent fait foi)', (t) => {
  const racine = temp(t);
  const { creerCourrier } = require('../courrier');
  const m = creerCourrier({ racine, dossierEtat: path.join(racine, 'etat'), safeStorage: { isEncryptionAvailable: () => false }, spawn: () => { throw new Error('non lancé'); } });
  for (const [type, agent] of [['mails', 'kinan-orchestre:courrier'], ['devis', 'kinan-orchestre:devis']]) {
    const a = m.argsRecap(type);
    assert.strictEqual(a[a.indexOf('--agent') + 1], agent);
    assert.ok(!a.includes('--model') && !a.some((x) => /opus/i.test(x)), a.join(' '));
  }
  const dir = path.join(RACINE, '..', 'kinan-plugin', 'agents');
  if (fs.existsSync(dir)) {
    assert.match(fs.readFileSync(path.join(dir, 'courrier.md'), 'utf8'), /^model: haiku$/m);
    assert.match(fs.readFileSync(path.join(dir, 'devis.md'), 'utf8'), /^model: sonnet$/m);
  }
});
