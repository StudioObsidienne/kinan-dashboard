'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { creer, MARGE_MS } = require('../lecture-cache');
const { appliquerDelais } = require('../etat-delai');

// Faux disque : compte les lectures réelles (readFileSync) et les stat.
function fauxDisque() {
  const f = new Map(); let lectures = 0, stats = 0;
  return {
    fs: {
      statSync: (p) => { stats++; if (!f.has(p)) throw new Error('ENOENT'); const x = f.get(p); return { mtimeMs: x.mtimeMs, size: x.texte.length }; },
      readFileSync: (p) => { lectures++; if (!f.has(p)) throw new Error('ENOENT'); return f.get(p).texte; }
    },
    ecrire: (p, texte, mtimeMs) => f.set(p, { texte, mtimeMs }),
    supprimer: (p) => f.delete(p),
    get lectures() { return lectures; }, get stats() { return stats; }
  };
}
const horloge = () => 1_000_000; // les fichiers de test datent de bien avant (mtime 1000)

test('relit seulement si mtime ou taille change', () => {
  const d = fauxDisque(); const c = creer({ fs: d.fs, maintenant: horloge });
  d.ecrire('s', '{"a":1}', 1000);
  assert.deepStrictEqual(c.lire('s', JSON.parse).valeur, { a: 1 });
  c.lire('s', JSON.parse); c.lire('s', JSON.parse);
  assert.strictEqual(d.lectures, 1);
  d.ecrire('s', '{"a":22}', 2000); // mtime et taille changent
  assert.deepStrictEqual(c.lire('s', JSON.parse).valeur, { a: 22 });
  d.ecrire('s', '{"a":33}', 3000); // seul mtime change
  assert.deepStrictEqual(c.lire('s', JSON.parse).valeur, { a: 33 });
  d.ecrire('s', '{"a":333}', 3000); // seule la taille change
  assert.deepStrictEqual(c.lire('s', JSON.parse).valeur, { a: 333 });
  assert.strictEqual(d.lectures, 4);
});

test('absent, illisible : null, et pas de mémorisation d\'un fichier disparu', () => {
  const d = fauxDisque(); const c = creer({ fs: d.fs, maintenant: horloge });
  assert.strictEqual(c.lire('x', JSON.parse), null);
  d.ecrire('x', '{pas du json', 1000);
  assert.strictEqual(c.lire('x', JSON.parse), null);
  c.lire('x', JSON.parse);
  assert.strictEqual(d.lectures, 1, 'un fichier invalide inchangé n\'est pas relu');
  d.supprimer('x');
  assert.strictEqual(c.lire('x', JSON.parse), null);
  d.ecrire('x', '{"ok":true}', 1000); // même mtime que l'ancien, mais fichier réapparu
  assert.deepStrictEqual(c.lire('x', JSON.parse).valeur, { ok: true });
});

test('fichier tout juste modifié : jamais mémorisé (mtime à résolution grossière)', () => {
  const d = fauxDisque(); const c = creer({ fs: d.fs, maintenant: () => 1000 + MARGE_MS - 1 });
  d.ecrire('r', '{"n":1}', 1000);
  c.lire('r', JSON.parse); c.lire('r', JSON.parse);
  assert.strictEqual(d.lectures, 2);
});

test('copie rendue : appliquerDelais ne contamine pas le cache et reste calculé à chaque lecture', () => {
  const d = fauxDisque(); const c = creer({ fs: d.fs, maintenant: horloge });
  d.ecrire('e', JSON.stringify({ agents: { skyze: { etat: 'travail', maj: 0 }, x: { etat: 'erreur', maj: 100000 } } }), 1000);
  const vus = new Map();
  const a = appliquerDelais(c.lire('e', JSON.parse).valeur, 100000 + 5000, vus); // erreur récente : encore affichée
  assert.strictEqual(a.agents.x.etat, 'erreur');
  const b = appliquerDelais(c.lire('e', JSON.parse).valeur, 100000 + 21000, vus); // 21 s : retour au repos (horloge)
  assert.strictEqual(b.agents.x.etat, 'repos');
  const e = c.lire('e', JSON.parse).valeur;
  assert.strictEqual(e.agents.x.etat, 'erreur', 'le cache garde la valeur brute');
  assert.strictEqual(d.lectures, 1);
});

test('mesure avant/après : lectures disque sur 10 s (state.json 1/s, sessions.json 1/2 s, 3 conversations)', () => {
  const d = fauxDisque();
  const fichiers = ['state.json', 'sessions.json', 's/a.json', 's/b.json', 's/c.json'];
  for (const f of fichiers) d.ecrire(f, '{"agents":{}}', 1000);
  // Avant : une lecture + analyse par appel. Par seconde : lireEtat 1x (state.json) ; relevé relais /5 s : lireEtat 2x + sessions.json 3x ;
  // diffusion /2 s : sessions.json + 3 fichiers de conversation.
  const tour = (lire, t) => {
    lire('state.json');
    if (t % 2 === 0) for (const f of ['sessions.json', 's/a.json', 's/b.json', 's/c.json']) lire(f);
    if (t % 5 === 0) { lire('state.json'); lire('state.json'); for (let i = 0; i < 3; i++) lire('sessions.json'); }
  };
  for (let t = 0; t < 10; t++) tour((f) => JSON.parse(d.fs.readFileSync(f)), t);
  const avant = d.lectures;
  const d2 = fauxDisque(); for (const f of fichiers) d2.ecrire(f, '{"agents":{}}', 1000);
  const c = creer({ fs: d2.fs, maintenant: horloge });
  for (let t = 0; t < 10; t++) tour((f) => c.lire(f, JSON.parse), t);
  console.log(`lectures disque sur 10 s : avant ${avant} (${avant / 10}/s), après ${d2.lectures} (${d2.lectures / 10}/s)`);
  assert.strictEqual(avant, 40);
  assert.strictEqual(d2.lectures, fichiers.length, 'une lecture par fichier, puis plus aucune tant qu\'il ne change pas');
});
