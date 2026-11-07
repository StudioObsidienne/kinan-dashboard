// Chasse au trésor du royaume Kinan : machine d'états (de zéro au bouton débloqué), normalisation des réponses, persistance, garde-fous.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../src/eggs/chasse-logique.js');
const { creer } = require('../src/egg-core.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function fauxStockage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] || null, get length() { return m.size; }, _m: m };
}
const objet = (id) => ({ type: 'objet', id });
const eggAvec = (ls, search) => creer({ localStorage: ls, location: { search: search || '' }, console: { warn() {} } });

test('chasse : de zéro au bouton débloqué, étape par étape', () => {
  let s = L.etatInitial();
  assert.strictEqual(s.etape, L.ETAPE.DEPART);
  // 1) trois clics d'affilée sur la plante : les deux premiers ne donnent rien
  for (let i = 1; i <= 2; i++) { const r = L.evoluer(s, objet('plante')); s = r.etat; assert.strictEqual(r.effets.length, 0); assert.strictEqual(s.plante, i); }
  let r = L.evoluer(s, objet('plante')); s = r.etat;
  assert.deepStrictEqual(r.effets, [{ type: 'indice', numero: 1 }]);
  assert.strictEqual(s.etape, L.ETAPE.INDICE1);
  // 2) la fenêtre livre le message caché
  r = L.evoluer(s, objet('fenetre')); s = r.etat;
  assert.deepStrictEqual(r.effets, [{ type: 'indice', numero: 2 }]);
  assert.strictEqual(s.etape, L.ETAPE.INDICE2);
  // 3) mauvaise réponse puis bonne
  r = L.evoluer(s, { type: 'reponse', texte: 'Skyze' }); s = r.etat;
  assert.strictEqual(r.effets[0].type, 'rate'); assert.strictEqual(s.essais, 1); assert.strictEqual(s.etape, L.ETAPE.INDICE2);
  r = L.evoluer(s, { type: 'reponse', texte: '  JOHMS ! ' }); s = r.etat;
  assert.deepStrictEqual(r.effets, [{ type: 'debloque' }]);
  assert.strictEqual(s.etape, L.ETAPE.DEBLOQUE);
  // 4) le bouton secret émet l'évènement pour la cinématique
  r = L.evoluer(s, { type: 'bouton' });
  assert.deepStrictEqual(r.effets, [{ type: 'jean' }]);
  assert.strictEqual(r.etat.etape, L.ETAPE.DEBLOQUE);
});

test('chasse : l\'ordinateur remplace la fenêtre pour le message caché', () => {
  let s = L.evoluer(L.evoluer(L.evoluer(L.etatInitial(), objet('plante')).etat, objet('plante')).etat, objet('plante')).etat;
  assert.strictEqual(s.etape, L.ETAPE.INDICE1);
  s = L.evoluer(s, objet('ordinateur')).etat;
  assert.strictEqual(s.etape, L.ETAPE.INDICE2);
});

test('chasse : l\'ordre est imposé, rien ne se débloque en sautant des étapes', () => {
  const init = L.etatInitial();
  assert.strictEqual(L.evoluer(init, objet('fenetre')).etat.etape, 0);
  assert.strictEqual(L.evoluer(init, objet('ordinateur')).etat.etape, 0);
  assert.strictEqual(L.evoluer(init, { type: 'reponse', texte: 'johms' }).etat.etape, 0);
  assert.strictEqual(L.evoluer(init, { type: 'bouton' }).effets.length, 0);
  const un = L.restaurer({ v: 1, etape: 1, essais: 0 });
  assert.strictEqual(L.evoluer(un, { type: 'reponse', texte: 'johms' }).etat.etape, 1);
  assert.strictEqual(L.evoluer(un, { type: 'bouton' }).effets.length, 0);
  const deux = L.restaurer({ v: 1, etape: 2, essais: 0 });
  assert.strictEqual(L.evoluer(deux, { type: 'bouton' }).effets.length, 0);
  // clics sur la plante non consécutifs : le compteur retombe à zéro
  let s = L.evoluer(init, objet('plante')).etat;
  s = L.evoluer(s, objet('plante')).etat;
  s = L.evoluer(s, objet('autre')).etat;
  assert.strictEqual(s.plante, 0);
  s = L.evoluer(s, objet('plante')).etat;
  assert.strictEqual(s.etape, 0);
  // entrées invalides
  for (const evt of [null, undefined, 42, {}, { type: 'inconnu' }]) assert.strictEqual(L.evoluer(init, evt).change, false);
  assert.strictEqual(L.evoluer(null, objet('plante')).etat.plante, 1);
});

test('normalisation : accents, casse, ponctuation, espaces', () => {
  assert.strictEqual(L.normaliser('  Éléphant,  ÇA va ?! '), 'elephant ca va');
  assert.strictEqual(L.normaliser("C'est l'œuvre"), 'c est l oeuvre');
  assert.strictEqual(L.normaliser(null), '');
  assert.strictEqual(L.normaliser(undefined), '');
  assert.strictEqual(L.normaliser(42), '42');
});

test('réponses acceptées : variantes de Johms, rien d\'autre', () => {
  const bonnes = ['johms', 'Johms', 'JOHMS', '  johms  ', 'Johms !', 'johms.', 'C\'est Johms', 'c est johms', 'cest johms', 'Le gardien Johms', 'la réponse est Johms',
    'le gardien johms', 'opus', 'Opus', 'Johms Opus', 'johms, opus'];
  for (const b of bonnes) assert.ok(L.verifierReponse(b), 'devrait passer : ' + b);
  const mauvaises = ['', ' ', 'skyze', 'drafion', 'kinan', 'le plus grand', 'ce n\'est pas johms', 'johmsx', 'jo hms', 'johms skyze', 'x'.repeat(200), 'johms'.padEnd(81, ' '), null, undefined, 42, {}];
  for (const m of mauvaises) assert.strictEqual(L.verifierReponse(m), false, 'devrait échouer : ' + String(m).slice(0, 20));
});

test('idDepuisLabel : correspond aux libellés des zones de objets.js', () => {
  assert.strictEqual(L.idDepuisLabel('Plante'), 'plante');
  assert.strictEqual(L.idDepuisLabel('Fenêtre'), 'fenetre');
  assert.strictEqual(L.idDepuisLabel('Ordinateur de Skyze'), 'ordinateur');
  assert.strictEqual(L.idDepuisLabel('Lampe'), 'autre');
  assert.strictEqual(L.idDepuisLabel(undefined), 'autre');
  const objets = lire('src/eggs/objets.js');
  for (const label of ["'Plante'", "'Fenêtre'", "'Ordinateur de '"]) assert.ok(objets.includes(label), 'libellé présent dans objets.js : ' + label);
});

test('persistance : sérialisation, restauration, valeurs corrompues', () => {
  const s = L.evoluer(L.restaurer({ v: 1, etape: 2, essais: 3 }), objet('fenetre')).etat;
  assert.deepStrictEqual(L.serialiser(s), { v: 1, etape: 2, essais: 3 });
  assert.deepStrictEqual(L.serialiser(L.etatInitial()), { v: 1, etape: 0, essais: 0 }); // le compteur de clics n'est jamais mémorisé
  assert.strictEqual(L.restaurer({ v: 1, etape: 3, essais: 2 }).etape, 3);
  for (const mauvais of [null, undefined, 'x', 12, [], {}, { v: 2, etape: 1 }, { v: 1, etape: 4 }, { v: 1, etape: -1 }, { v: 1, etape: 1.5 }, { v: 1, etape: '2' }]) {
    assert.deepStrictEqual(L.restaurer(mauvais), L.etatInitial());
  }
  assert.strictEqual(L.restaurer({ v: 1, etape: 2, essais: 'x' }).essais, 0);
});

test('persistance via KinanEgg : progression conservée après rafraîchissement, clé kinan-os.egg.chasse.etat', () => {
  const ls = fauxStockage();
  let egg = eggAvec(ls);
  let session = L.creerSession(egg.stock('chasse'), { reset: false });
  for (let i = 0; i < 3; i++) session.envoyer(objet('plante'));
  session.envoyer(objet('fenetre'));
  assert.strictEqual(session.etat().etape, 2);
  assert.deepStrictEqual(JSON.parse(ls.getItem('kinan-os.egg.chasse.etat')), { v: 1, etape: 2, essais: 0 });
  assert.ok([...ls._m.keys()].every((k) => k.startsWith('kinan-os.egg.')));
  // « rafraîchissement » : nouveau socle, nouvelle session, même stockage
  egg = eggAvec(ls);
  session = L.creerSession(egg.stock('chasse'), { reset: false });
  assert.strictEqual(session.etat().etape, 2);
  assert.strictEqual(session.etat().plante, 0);
  session.envoyer({ type: 'reponse', texte: 'Johms' });
  egg = eggAvec(ls);
  assert.strictEqual(L.creerSession(egg.stock('chasse'), {}).etat().etape, 3);
});

test('?egg-reset=1 : remet la chasse à zéro, uniquement la chasse', () => {
  assert.strictEqual(L.resetDemande('?egg-reset=1'), true);
  assert.strictEqual(L.resetDemande('?a=1&egg-reset=1&b=2'), true);
  assert.strictEqual(L.resetDemande('?egg-reset=10'), false);
  assert.strictEqual(L.resetDemande(''), false);
  assert.strictEqual(L.resetDemande(undefined), false);
  const ls = fauxStockage({ 'kinan-os.egg.chasse.etat': JSON.stringify({ v: 1, etape: 3, essais: 1 }), 'kinan-os.egg.muet': '0' });
  const stock = eggAvec(ls).stock('chasse');
  const s = L.creerSession(stock, { reset: L.resetDemande('?egg-reset=1') });
  assert.strictEqual(s.etat().etape, 0);
  assert.deepStrictEqual(JSON.parse(ls.getItem('kinan-os.egg.chasse.etat')), { v: 1, etape: 0, essais: 0 });
  assert.strictEqual(ls.getItem('kinan-os.egg.muet'), '0'); // le reste n'est pas touché
  assert.strictEqual(L.creerSession(stock, { reset: false }).etat().etape, 0);
});

test('stockage indisponible ou en échec : la chasse reste jouable pour la session', () => {
  const casse = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } };
  const s = L.creerSession(eggAvec(casse).stock('chasse'), {});
  for (let i = 0; i < 3; i++) s.envoyer(objet('plante'));
  assert.strictEqual(s.etat().etape, 1);
  const sans = L.creerSession(eggAvec(null).stock('chasse'), {});
  assert.strictEqual(sans.etat().etape, 0);
});

test('KinanEgg : emettre / ecouter (évènements entre modules, ex. kinan-egg-jean)', () => {
  const recus = [], dom = [];
  const doc = { dispatchEvent: (e) => { dom.push(e); return true; } };
  global.CustomEvent = class { constructor(nom, o) { this.type = nom; this.detail = o && o.detail; } };
  try {
    const egg = creer({ document: doc, console: { warn() {} } });
    egg.ecouter('kinan-egg-jean', (d) => recus.push(d));
    egg.ecouter('kinan-egg-jean', () => { throw new Error('écouteur cassé'); });
    egg.emettre('kinan-egg-jean', { source: 'test' });
    assert.deepStrictEqual(recus, [{ source: 'test' }]);
    assert.strictEqual(dom.length, 1); assert.strictEqual(dom[0].type, 'kinan-egg-jean');
    assert.doesNotThrow(() => egg.emettre('sans-ecouteur'));
  } finally { delete global.CustomEvent; }
});

test('textes : indices lisibles, bulles courtes, énigme sans la réponse en clair', () => {
  for (const b of Object.values(L.BULLES).concat(L.RATES)) assert.ok(b.length <= 46, 'bulle courte : ' + b);
  assert.ok(L.BULLES.jean.toLowerCase().startsWith('bient'));
  assert.ok(L.TEXTES.indices[1].length > 40 && L.TEXTES.indices[2].length > 40);
  assert.ok(!/johms est la réponse/i.test(L.TEXTES.indices[2]));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(L.TEXTES)), 'pas d\'emoji');
  const [x, y, w, h] = L.BOUTON_BOITE;
  assert.ok(x >= 170 && x + w <= 190 && y >= 15 && y + h <= 47, 'bouton sur le mur nu entre le tableau (fin 169) et l\'horloge (début 190)');
});

// motifs assemblés par morceaux pour ne pas déclencher outils/verifier-hors-ligne.js sur ce fichier de test
const RESEAU = new RegExp(['fet' + 'ch\\s*\\(', 'XMLHttp' + 'Request', 'Web' + 'Socket', 'Event' + 'Source', 'send' + 'Beacon', 'state\\.' + 'json', 'require\\s*\\(', 'ipc' + 'Renderer', 'window\\.kinan\\b'].join('|'));
test('garde-fous : module indépendant, hors-ligne, branché après objets.js, accessible au clavier', () => {
  const chasse = lire('src/eggs/chasse.js'), logique = lire('src/eggs/chasse-logique.js'), html = lire('src/index.html'), objets = lire('src/eggs/objets.js');
  for (const src of [chasse, logique]) {
    assert.ok(!RESEAU.test(src), 'aucun réseau, état ni IPC');
    assert.ok(!/\binnerHTML\b|\beval\s*\(/.test(src));
  }
  assert.ok(html.indexOf('eggs/objets.js') < html.indexOf('eggs/chasse-logique.js'));
  assert.ok(html.indexOf('eggs/chasse-logique.js') < html.indexOf('eggs/chasse.js'));
  assert.ok(/KinanEgg\.module\('chasse'/.test(chasse));
  assert.ok(chasse.includes("'kinan-egg-jean'") && chasse.includes('api.emettre'));
  assert.ok(/aria-live/.test(chasse) && /aria-expanded/.test(chasse) && /Escape/.test(chasse) && /htmlFor/.test(chasse));
  // objets.js : seulement le hook, comportement d'origine conservé
  assert.ok(objets.includes("api.emettre('kinan-egg-objet'"));
});
