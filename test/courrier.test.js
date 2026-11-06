// Tests du courrier (node --test test/). Aucun réseau : faux IMAP, faux SMTP et faux « claude » injectés.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const F = require('../fournisseurs');
const { creerCourrier, chiffrerLignes, validerGrille, totalDevis, lignesRecap } = require('../courrier');

const SECRET = 'Mdp-Secret-123';
const faux = () => ({ isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('X' + s), decryptString: (b) => b.toString().slice(1) });
const GRILLE = { devise: 'EUR', tauxTva: 0.2, mentions: ['Mention de test'], lignes: [{ id: 'exemple-a', libelle: 'Prestation A', unite: 'pièce', prixUnitaire: 100 }, { id: 'exemple-heure', libelle: 'Temps', unite: 'heure', prixUnitaire: 50 }] };

function banc(extra = {}) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'kinan-courrier-'));
  const echange = path.join(racine, 'echange');
  const envois = [], configs = { imap: [], smtp: [] };
  let sortieClaude = '';
  const spawn = (bin, args, o) => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.args = args; c.cwd = o.cwd;
    c.kill = () => {};
    c.stdin = { on() {}, end: (prompt) => { c.prompt = prompt; setImmediate(() => { c.stdout.emit('data', sortieClaude); c.emit('close', 0); }); } };
    banc.dernier = c; return c;
  };
  const m = creerCourrier({ racine, dossierEtat: path.join(racine, 'etat'), safeStorage: faux(), spawn,
    imapFabrique: (c) => { configs.imap.push(c); return extra.imap ? extra.imap(c) : { connect: async () => {}, logout: async () => {} }; },
    smtpFabrique: (c) => { configs.smtp.push(c); return { verify: async () => true, sendMail: async (msg) => { envois.push(msg); return { ok: true }; } }; },
    simpleParser: extra.simpleParser });
  const ecrire = (rel, o) => { const f = path.join(echange, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
  const lire = (rel) => JSON.parse(fs.readFileSync(path.join(echange, rel), 'utf8'));
  return { m, racine, echange, envois, configs, ecrire, lire, reponse: (s) => { sortieClaude = s; } };
}
const attendre = async (m) => { for (let i = 0; i < 200 && m.recapEtat().etat === 'en cours'; i++) await new Promise((r) => setTimeout(r, 5)); };
const mail = (id, de, extra = {}) => ({ id, uid: 1, de, nom: '', repondreA: '', objet: 'Demande', date: new Date().toISOString(), texte: 'Bonjour', piecesJointes: [], statut: 'nouveau', ...extra });

test('table des fournisseurs : chaque fournisseur prédéfini a des serveurs valides et chiffrés', () => {
  for (const id of ['zoho-eu', 'zoho-com', 'gmail', 'outlook', 'ovh', 'icloud', 'autre']) assert.ok(F.IDS.includes(id), id);
  for (const id of F.IDS.filter((x) => x !== 'autre')) {
    const r = F.resoudre(id);
    assert.ok(r.ok, id);
    for (const s of [r.imap, r.smtp]) { assert.strictEqual(F.hoteValide(s.hote), s.hote); assert.ok(F.portValide(s.port)); assert.ok(F.SECURITES.includes(s.securite)); }
    assert.ok(F.FOURNISSEURS[id].motDePasse && F.FOURNISSEURS[id].activer);
  }
  assert.strictEqual(F.resoudre('gmail').imap.hote, 'imap.gmail.com');
  assert.strictEqual(F.resoudre('zoho-com').smtp.hote, 'smtp.zoho.com');
  assert.strictEqual(F.resoudre('inconnu').ok, false);
  assert.throws(() => { F.FOURNISSEURS.gmail.imap = null; }); // table figée
});

test('validation hôte / port / sécurité pour « Autre »', () => {
  assert.strictEqual(F.hoteValide(' Mail.Exemple.FR. '), 'mail.exemple.fr');
  for (const h of ['127.0.0.1', 'localhost', 'https://mail.exemple.fr', 'mail', 'a..b.fr', 'mail.exemple.fr:993', 'mail exemple.fr', '-a.exemple.fr', 'serveur.local', '', null, 42])
    assert.strictEqual(F.hoteValide(h), null, String(h));
  assert.strictEqual(F.portValide('993'), 993);
  for (const p of [0, 70000, '99a', 1.5, '', null, -1]) assert.strictEqual(F.portValide(p), null, String(p));
  assert.strictEqual(F.serveurValide({ hote: 'imap.exemple.fr', port: 143, securite: 'aucune' }, 'IMAP').ok, false);
  const r = F.resoudre('autre', { imap: { hote: 'imap.exemple.fr', port: '993', securite: 'ssl' }, smtp: { hote: 'smtp.exemple.fr', port: 587, securite: 'ssl' } });
  assert.ok(r.ok); assert.strictEqual(r.imap.port, 993); assert.strictEqual(r.avertissements.length, 1);
  assert.strictEqual(F.resoudre('autre', { imap: { hote: 'localhost', port: 993, securite: 'ssl' }, smtp: {} }).ok, false);
});

test('identifiants : jamais renvoyés ni dans les messages d\'erreur ; serveurs du fournisseur et TLS vérifié', async () => {
  const b = banc({ imap: () => ({ connect: async () => { const e = new Error(`Invalid login: 535 ${SECRET} ${Buffer.from(SECRET).toString('base64')}`); e.authenticationFailed = true; throw e; }, logout: async () => {} }) });
  assert.strictEqual(b.m.definirIdentifiants({ fournisseur: 'gmail', adresse: 'moi@exemple.fr', mdp: 'abcd efgh ijkl mnop' }).ok, true);
  assert.strictEqual(b.m.definirIdentifiants({ fournisseur: 'gmail', adresse: 'pas-une-adresse', mdp: SECRET }).ok, false);
  assert.ok(b.m.definirIdentifiants({ fournisseur: 'gmail', adresse: 'moi@exemple.fr', mdp: SECRET }).ok);
  const s = b.m.statut();
  assert.ok(!JSON.stringify(s).includes(SECRET));
  assert.strictEqual(s.configure, true); assert.strictEqual(s.serveurs.imap.hote, 'imap.gmail.com');
  const r = await b.m.tester();
  assert.strictEqual(r.ok, false);
  assert.ok(!r.erreur.includes(SECRET) && !r.erreur.includes(Buffer.from(SECRET).toString('base64')), r.erreur);
  assert.match(r.erreur, /mot de passe d'application/i);
  const c = b.configs.imap[0];
  assert.strictEqual(c.host, 'imap.gmail.com'); assert.strictEqual(c.port, 993); assert.strictEqual(c.secure, true); assert.strictEqual(c.tls.rejectUnauthorized, true);
  const fichiers = fs.readdirSync(path.join(b.racine, 'etat')).map((f) => fs.readFileSync(path.join(b.racine, 'etat', f), 'utf8'));
  assert.ok(fichiers.every((t) => !t.includes(SECRET) || t.startsWith('X')), 'mot de passe en clair hors du fichier chiffré');
  // STARTTLS (Outlook) : TLS exigé, jamais de connexion en clair
  b.m.definirIdentifiants({ fournisseur: 'outlook', adresse: 'moi@exemple.fr', mdp: SECRET });
  await b.m.tester();
  assert.strictEqual(b.configs.imap.at(-1).host, 'outlook.office365.com');
});

test('relève en lecture seule : boîte ouverte en readOnly, mails écrits au statut « nouveau »', async () => {
  let lecture = null;
  const imap = () => ({ mailbox: { uidValidity: 7 }, connect: async () => {}, logout: async () => {},
    getMailboxLock: async (_b, o) => { lecture = o; return { release() {} }; }, search: async () => [5, 6], fetchOne: async (uid) => ({ source: Buffer.from('m' + uid) }) });
  const b = banc({ imap, simpleParser: async (src) => ({ from: { value: [{ address: 'Client@Exemple.fr', name: 'Client' }] }, subject: 'S ' + src, text: 'Corps', attachments: [] }) });
  b.m.definirIdentifiants({ fournisseur: 'ovh', adresse: 'moi@exemple.fr', mdp: SECRET });
  const r = await b.m.relever();
  assert.deepStrictEqual(r, { ok: true, nouveaux: 2, ignores: 0 });
  assert.deepStrictEqual(lecture, { readOnly: true });
  assert.strictEqual(b.lire('mails/uid-5.json').statut, 'nouveau');
  assert.strictEqual(b.lire('mails/uid-5.json').de, 'client@exemple.fr');
});

test('« traité » seulement si le mail apparaît dans la réponse de l\'agent et n\'est pas déclaré illisible', async () => {
  const b = banc();
  for (const id of ['uid-1', 'uid-2', 'uid-3', 'uid-4']) b.ecrire(`mails/${id}.json`, mail(id, 'client@exemple.fr'));
  b.reponse('<<<JSON\n' + JSON.stringify({ recap: ['2 mails lus', 'uid-2 illisible'], non_lus: ['uid-2', 'uid-4'],
    brouillons: [{ mailId: 'uid-1', objet: 'Re', corps: 'Merci' }, { mailId: 'uid-4', objet: 'Re', corps: 'x' }, { mailId: 'uid-99', objet: 'Re', corps: 'x' }] }) + '\nJSON>>>');
  assert.ok(b.m.lancerRecap('mails').ok);
  await attendre(b.m);
  assert.strictEqual(b.m.recapEtat().etat, 'termine');
  assert.strictEqual(b.lire('mails/uid-1.json').statut, 'traité');
  for (const id of ['uid-2', 'uid-3', 'uid-4']) assert.strictEqual(b.lire(`mails/${id}.json`).statut, 'nouveau', id);
  assert.ok(!fs.existsSync(path.join(b.echange, 'a-valider', 'reponse-uid-4.json')));
  assert.strictEqual(fs.readFileSync(path.join(b.echange, 'recap-mails.md'), 'utf8'), '2 mails lus\nuid-2 illisible\n');
  // Le prompt donne le chemin du dossier d'échange ; les outils restent Read, Glob, Grep limités à ce dossier.
  assert.ok(banc.dernier.prompt.includes(b.echange));
  assert.ok(banc.dernier.args.includes('Read,Glob,Grep') && banc.dernier.args.includes('Read(./echange/**)') && banc.dernier.args.includes('kinan-orchestre:courrier'));
});

test('lecture refusée (aucun mail cité) : rien ne passe à « traité »', async () => {
  const b = banc();
  b.ecrire('mails/uid-1.json', mail('uid-1', 'client@exemple.fr'));
  b.reponse("Je n'ai pas l'autorisation de lire ce fichier.");
  b.m.lancerRecap('mails'); await attendre(b.m);
  assert.strictEqual(b.m.recapEtat().etat, 'erreur');
  assert.strictEqual(b.lire('mails/uid-1.json').statut, 'nouveau');
  b.reponse('<<<JSON\n{"recap":"rien","brouillons":[],"non_lus":["uid-1"]}\nJSON>>>');
  b.m.lancerRecap('mails'); await attendre(b.m);
  assert.strictEqual(b.m.recapEtat().etat, 'erreur');
  assert.strictEqual(b.lire('mails/uid-1.json').statut, 'nouveau');
});

test('destinataire recalculé depuis le mail d\'origine ; adresse modifiée = envoi refusé', async () => {
  const b = banc();
  b.m.definirIdentifiants({ fournisseur: 'icloud', adresse: 'moi@exemple.fr', mdp: SECRET });
  b.ecrire('mails/uid-1.json', mail('uid-1', 'client@exemple.fr', { repondreA: 'reponse@exemple.fr' }));
  b.ecrire('mails/uid-2.json', mail('uid-2', 'autre@exemple.fr'));
  b.reponse('<<<JSON\n' + JSON.stringify({ recap: 'ok', brouillons: [{ mailId: 'uid-1', a: 'pirate@mechant.com', objet: 'Re', corps: 'Merci' }, { mailId: 'uid-2', objet: 'Re', corps: 'Bonjour' }] }) + '\nJSON>>>');
  b.m.lancerRecap('mails'); await attendre(b.m);
  assert.strictEqual(b.lire('a-valider/reponse-uid-1.json').a, 'reponse@exemple.fr');
  assert.ok(b.m.decider('reponse-uid-1.json', 'valider', null).ok);
  assert.ok(b.m.decider('reponse-uid-2.json', 'valider', null).ok);
  const v = b.lire('valides/reponse-uid-2.json'); v.a = 'pirate@mechant.com'; b.ecrire('valides/reponse-uid-2.json', v);
  const r = await b.m.envoyer(['reponse-uid-1.json', 'reponse-uid-2.json'], { confirme: true });
  assert.strictEqual(r.envoyes, 1); assert.strictEqual(r.suspects, 1);
  assert.strictEqual(b.envois.length, 1);
  assert.strictEqual(b.envois[0].to, 'reponse@exemple.fr'); assert.deepStrictEqual(b.envois[0].envelope.to, ['reponse@exemple.fr']);
  assert.strictEqual(b.configs.smtp[0].host, 'smtp.mail.me.com'); assert.strictEqual(b.configs.smtp[0].requireTLS, true);
  // Pas de renvoi d'un mail déjà parti.
  assert.strictEqual((await b.m.envoyer(['reponse-uid-1.json'], { confirme: true })).envoyes, 0);
  assert.strictEqual(b.envois.length, 1);
});

test('envoi refusé sans confirmation explicite ou sans liste', async () => {
  const b = banc();
  b.m.definirIdentifiants({ fournisseur: 'zoho-eu', adresse: 'moi@exemple.fr', mdp: SECRET });
  b.ecrire('mails/uid-1.json', mail('uid-1', 'client@exemple.fr'));
  b.ecrire('valides/reponse-uid-1.json', { type: 'reponse', mailId: 'uid-1', objet: 'Re', corps: 'Merci', statut: 'validé, à envoyer' });
  for (const opt of [undefined, {}, { confirme: 'oui' }, { confirme: 1 }]) assert.strictEqual((await b.m.envoyer(['reponse-uid-1.json'], opt)).ok, false);
  assert.strictEqual((await b.m.envoyer([], { confirme: true })).ok, false);
  assert.strictEqual((await b.m.envoyer(null, { confirme: true })).ok, false);
  assert.strictEqual(b.envois.length, 0);
  // Un brouillon non validé (encore dans a-valider) n'est jamais envoyé.
  b.ecrire('a-valider/reponse-uid-1.json', { type: 'reponse', mailId: 'uid-1', objet: 'Re', corps: 'x' });
  assert.strictEqual((await b.m.envoyer(['reponse-uid-1.json'], { confirme: true })).envoyes, 1); // celui de valides/
  assert.ok(fs.existsSync(path.join(b.echange, 'a-valider', 'reponse-uid-1.json')));
});

test('devis : prix calculés depuis la grille, jamais repris de l\'agent ; incomplet tant qu\'une ligne n\'a pas de prix', async () => {
  const g = validerGrille(GRILLE).grille;
  const l = chiffrerLignes(g, [{ id: 'exemple-a', quantite: 2, prix: 1 }, { id: 'exemple-heure', quantite: '3,5' }, { id: 'inconnu', quantite: 1 }], ['Prestation sur mesure']);
  assert.deepStrictEqual(l.map((x) => x.prix), [200, 175, null, null]);
  assert.strictEqual(totalDevis(l), null);
  assert.strictEqual(totalDevis(l.slice(0, 2)), 375);
  assert.strictEqual(validerGrille({ lignes: [{ id: 'a', prixUnitaire: -1 }] }).ok, false);
  assert.deepStrictEqual(lignesRecap('- a\n\n* b'), ['a', 'b']);

  const b = banc();
  b.m.definirIdentifiants({ fournisseur: 'gmail', adresse: 'moi@exemple.fr', mdp: SECRET });
  b.ecrire('mails/uid-1.json', mail('uid-1', 'client@exemple.fr', { statut: 'traité' }));
  b.ecrire('a-valider/reponse-uid-1.json', { type: 'reponse', mailId: 'uid-1', a: 'client@exemple.fr', objet: 'Re', corps: 'Bien reçu', devis: true });
  assert.strictEqual(b.m.lancerRecap('devis').ok, false); // pas de grille
  b.ecrire('grille-prix.json', GRILLE);
  b.reponse('<<<JSON\n' + JSON.stringify({ recap: ['1 devis'], devis: [{ mailId: 'uid-1', client: 'Client', total: 1, lignes: [{ id: 'exemple-a', quantite: 1, prix: 5 }], a_chiffrer: ['Option'], mail: { objet: 'Devis', corps: 'Voici' } }] }) + '\nJSON>>>');
  assert.ok(b.m.lancerRecap('devis').ok); await attendre(b.m);
  const d = b.lire('a-valider/devis-uid-1.json');
  assert.strictEqual(d.lignes[0].prix, 100); assert.strictEqual(d.total, null); assert.strictEqual(d.incomplet, true); assert.strictEqual(d.mail.a, 'client@exemple.fr');
  assert.strictEqual(b.m.decider('devis-uid-1.json', 'valider', null).ok, false);
  assert.ok(b.m.decider('devis-uid-1.json', 'valider', { prix: [9999, '50'] }).ok); // le prix de la grille ne peut pas être changé
  const v = b.lire('valides/devis-uid-1.json');
  assert.deepStrictEqual(v.lignes.map((x) => x.prix), [100, 50]); assert.strictEqual(v.total, 150);
  const r = await b.m.envoyer(['devis-uid-1.json'], { confirme: true });
  assert.strictEqual(r.envoyes, 1);
  assert.strictEqual(b.envois[0].attachments[0].filename, 'devis.pdf');
  assert.ok(b.envois[0].attachments[0].content.toString('latin1').includes('Total TTC'));
});
