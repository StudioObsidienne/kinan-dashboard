// Kinan Orchestre : mini-rapport « coche verte » sur les 3 dernières heures (fenêtre glissante). 0 jeton, 0 réseau.
// Sources : journaux ~/.claude/projects/**/*.jsonl (usage par message, dédoublonné par message.id),
// ~/.kinan-os/taches.json (statut « fait », heure de fin exacte « fin » écrite par hooks/etat.js) ; pour les anciennes
// tâches sans « fin » : historique.jsonl (fin estimée = passage de l'agent au repos), comptées à part (« estimees »).
// Tarifs et calcul en euros RÉUTILISÉS depuis gestion-ipc.js (lireTarifs, coutEuros, agentDuJournal) : rien n'est dupliqué.
// Lecture : cache par chemin + taille + mtime ; un fichier déjà vu n'est lu qu'à partir de la fin connue ;
// un fichier nouveau n'est lu que par la fin (blocs croissants jusqu'à dépasser le début de la fenêtre).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lireTarifs, coutEuros, agentDuJournal } = require('./gestion-ipc');

const RACINE = path.join(os.homedir(), '.claude', 'projects');
const config = require('./config');
const DOSSIER = config.DOSSIER;
// Agent de lecture configuré (base « lecture ») : nommé dans certains conseils ; à défaut, « un agent de lecture ».
const lecteur = () => config.charger().agents.find((a) => a.base === 'lecture') || null;
const nomLecteur = () => (lecteur() ? lecteur().nom : 'un agent de lecture');
const FENETRE_MS = 3 * 3600 * 1000;
const BLOC = 1024 * 1024;
const FAMILLES = ['haiku', 'sonnet', 'opus', 'autre'];
const famille = (m) => (/haiku/i.test(m) ? 'haiku' : /sonnet/i.test(m) ? 'sonnet' : /opus/i.test(m) ? 'opus' : 'autre');
const vide = () => ({ entree: 0, sortie: 0, cacheLu: 0, cacheCree: 0 });

const cache = new Map(); // chemin -> { taille, mtime, lu, reste, recs: Map(cle -> rec), agent, sousAgent }

function lister(dir, depuis, sortie = []) {
  let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return sortie; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) lister(p, depuis, sortie);
    else if (e.name.endsWith('.jsonl')) { try { const s = fs.statSync(p); if (s.mtimeMs >= depuis) sortie.push({ f: p, taille: s.size, mtime: s.mtimeMs }); } catch { /* ignoré */ } }
  }
  return sortie;
}

async function lirePlage(fh, debut, fin) {
  const b = Buffer.alloc(fin - debut);
  const { bytesRead } = await fh.read(b, 0, b.length, debut);
  return b.slice(0, bytesRead).toString('utf8');
}

function analyserLigne(l, c, n) {
  if (l.indexOf('"usage"') < 0) return;
  try {
    const o = JSON.parse(l), m = o.message;
    if (!m || !m.usage || m.role !== 'assistant' || m.model === '<synthetic>') return;
    const t = Date.parse(o.timestamp); if (!t) return;
    const u = m.usage;
    const cle = m.id ? 'id|' + m.id : 'ligne|' + n + '|' + t;
    // Un message (même message.id) s'écrit sur plusieurs lignes, une par bloc de contenu. Constaté sur les journaux du
    // 06/11/2026 : usage identique sur toutes ses lignes. Par prudence : usage de la ligne à la plus grande sortie,
    // horodatage de sa 1re ligne (c'est lui qui décide de l'entrée dans la fenêtre de 3 h).
    const rec = { t, f: famille(String(m.model || '')), i: u.input_tokens | 0, o: u.output_tokens | 0, r: u.cache_read_input_tokens | 0,
      c: u.cache_creation_input_tokens | 0, delegue: c.sousAgent || !!o.isSidechain };
    const deja = c.recs.get(cle);
    if (deja) { if (rec.o >= deja.o) { rec.t = Math.min(deja.t, t); c.recs.set(cle, rec); } else deja.t = Math.min(deja.t, t); }
    else c.recs.set(cle, rec);
  } catch { /* ligne coupée ou invalide */ }
}
const premierHorodatage = (lignes) => {
  for (const l of lignes.slice(0, 50)) { const m = l.match(/"timestamp":"([^"]+)"/); if (m) { const t = Date.parse(m[1]); if (t) return t; } }
  return null;
};

async function majFichier(s, debut) {
  let c = cache.get(s.f);
  if (c && c.taille === s.taille && c.mtime === s.mtime) return c;
  const sousAgent = /[\\/]subagents[\\/]/.test(s.f);
  if (!c || s.taille < c.lu) c = { taille: 0, mtime: 0, lu: 0, reste: '', recs: new Map(), agent: agentDuJournal(s.f), sousAgent, n: 0 };
  let fh;
  try {
    fh = await fs.promises.open(s.f, 'r');
    let texte, depart = c.lu;
    if (c.lu > 0) texte = c.reste + await lirePlage(fh, c.lu, s.taille);
    else {
      // Première lecture : seulement la fin, agrandie tant que son 1er horodatage est encore dans la fenêtre.
      for (let n = BLOC; ; n *= 4) {
        depart = Math.max(0, s.taille - n);
        texte = await lirePlage(fh, depart, s.taille);
        if (depart > 0) texte = texte.slice(texte.indexOf('\n') + 1);
        const t0 = premierHorodatage(texte.split('\n'));
        if (depart === 0 || (t0 && t0 < debut)) break;
      }
    }
    const lignes = texte.split('\n');
    c.reste = lignes.pop(); // fragment sans fin de ligne : complété à la prochaine lecture
    for (const l of lignes) analyserLigne(l, c, ++c.n);
    c.lu = s.taille; c.taille = s.taille; c.mtime = s.mtime;
  } catch { /* fichier illisible : ignoré */ } finally { if (fh) await fh.close().catch(() => {}); }
  cache.set(s.f, c);
  return c;
}

// Heures de fin des missions d'après historique.jsonl : une tâche ouverte (travail + titre) se ferme au repos suivant de l'agent.
function finsDeMission(fHisto) {
  let lignes = []; try { lignes = fs.readFileSync(fHisto, 'utf8').split('\n'); } catch { return []; }
  const ouvertes = {}, fins = [];
  for (const l of lignes) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (!e || !e.agent || !Number.isFinite(e.t)) continue;
    if (e.etat === 'travail' && e.tache) (ouvertes[e.agent] = ouvertes[e.agent] || new Set()).add(String(e.tache));
    else if (e.etat === 'repos' && ouvertes[e.agent]) { for (const t of ouvertes[e.agent]) fins.push({ agent: e.agent, titre: t, t: e.t }); delete ouvertes[e.agent]; }
  }
  return fins;
}
// Titre tel que l'historique le note (hooks/etat.js : 48 caractères pour une mission, 60 pour un SendMessage).
const court = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
// Tâche « fait » comptée si sa fin est dans la fenêtre. Fin exacte : champ « fin » (ms) écrit par le hook.
// Ancienne tâche sans « fin » : fin ESTIMÉE = passage au repos de l'agent dans l'historique (compte à part : « estimees »).
function tachesFaites(fTaches, fHisto, debut, fin) {
  let d = {}; try { d = JSON.parse(fs.readFileSync(fTaches, 'utf8')); } catch { /* absent */ }
  const parAgent = {}; let total = 0, estimees = 0;
  const compter = (agent) => { parAgent[agent] = (parAgent[agent] || 0) + 1; total++; };
  const exactes = [], groupes = new Map();
  for (const t of Array.isArray(d.taches) ? d.taches : []) {
    if (t.statut !== 'fait') continue;
    if (Number.isFinite(t.fin)) { exactes.push(t); if (t.fin >= debut && t.fin <= fin) compter(t.agent); continue; }
    const k = t.agent + '\u0000' + t.titre; groupes.set(k, (groupes.get(k) || 0) + 1);
  }
  // Les passages au repos qui correspondent à une fin exacte (même agent, moins de 5 s d'écart) ne servent pas deux fois.
  const fins = finsDeMission(fHisto).filter((x) => !exactes.some((t) => t.agent === x.agent && Math.abs(t.fin - x.t) < 5000)).sort((a, b) => b.t - a.t);
  for (const [k, n] of groupes) {
    const [agent, titre] = k.split('\u0000');
    const titres = new Set([titre, court(titre, 48), court(titre, 60)]);
    // n tâches « fait » au même titre : on prend les n fins les plus récentes de ce titre pour cet agent.
    const f = fins.filter((x) => x.agent === agent && titres.has(x.titre)).slice(0, n).filter((x) => x.t >= debut && x.t <= fin);
    for (let i = 0; i < f.length; i++) { compter(agent); estimees++; }
  }
  return { total, parAgent, estimees };
}

const fmtJ = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M' : n >= 1e3 ? Math.round(n / 1e3).toLocaleString('fr-FR') + ' k' : String(n));
const fmtE = (x) => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const pct = (x) => Math.round(x * 100) + ' %';

// Phrases sans chiffre : choisies selon la situation, stables pendant une fenêtre de 3 h.
const MOTS = {
  calme: ['Calme plat au bureau : les agents prennent un café (sans jetons).', 'Rien à signaler : le repos, c\'est aussi de la gestion.',
    'Le bureau respire. Les claviers aussi.'],
  econome: ['Le bon agent au bon endroit : la caisse respire.',
    'Petits modèles, grandes idées. Kinan approuve.', 'Dépense de jetons digne d\'un comptable zen.'],
  gourmand: ['Opus a beaucoup brillé : la prochaine fois, confie les lectures à {L}.', 'Belle puissance de feu. Un peu de Haiku la prochaine fois ?',
    'Le grand chef a tout cuisiné lui-même : pense aux commis.'],
  taches: ['Une coche de plus : le travail avance, une tâche à la fois.', 'Tâches bouclées, café mérité.'],
  lecteur: ['{L} a porté les cartons, Opus a gardé ses forces pour le dessert.'] // seulement si l'agent de lecture a vraiment travaillé
};

// Vocabulaire : « jetons nouveaux » = entrée + sortie + écriture de cache ; « relus du cache » = lecture de cache, facturée à part.
function textes(r, fin) {
  const tour = Math.floor(fin / FENETRE_MS);
  const choisir = (l) => l[tour % l.length];
  const nb = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');
  const tachesTxt = (n) => nb(n, 'tâche') + ' ' + (n > 1 ? 'terminées' : 'terminée') + (r.taches.estimees ? ' (dont ' + r.taches.estimees + ' à l\'heure de fin estimée)' : '');
  if (!r.total) return { realiste: 'Aucun jeton nouveau sur les 3 dernières heures' + (r.taches.total ? ', mais ' + tachesTxt(r.taches.total) + '.' : '.'), mot: choisir(MOTS.calme) };
  const ph = [];
  const partOpus = r.rendement.partOpus, partDel = r.delegue / r.total;
  ph.push(fmtJ(r.total) + ' jetons nouveaux sur 3 h (et ' + fmtJ(r.cacheLu) + ' relus du cache), dont ' + pct(partOpus) + ' sur Opus et ' + pct(partDel) + ' par des agents délégués.');
  if (r.euros.economie > 0.005) ph.push('Les modèles moins chers ont évité environ ' + fmtE(r.euros.economie) + ' par rapport à tout sur Opus (estimation au tarif API, pas ta facture).');
  else ph.push('Aucune économie sur la période : ' + (partOpus >= 0.99 ? 'presque tout a tourné sur Opus.' : 'le travail confié aux autres modèles n\'a rien fait gagner.'));
  if (!r.taches.total) ph.push('Aucune tâche terminée détectée : le coût par tâche n\'est pas calculable.');
  else if (partOpus > 0.5) ph.push('Point faible : Opus fait ' + pct(partOpus) + ' des jetons nouveaux pour ' + tachesTxt(r.taches.total) + ' ; lectures et vérifications devraient partir chez ' + nomLecteur() + '.');
  else ph.push(tachesTxt(r.taches.total) + ', soit ' + fmtJ(r.rendement.jetonsParTache) + ' jetons nouveaux et ' + fmtE(r.rendement.eurosParTache) + ' par tâche.');
  const lc = lecteur();
  const econome = MOTS.econome.concat(lc && (r.parAgent[lc.id] || 0) > 0 ? MOTS.lecteur : []);
  const mot = partOpus > 0.5 ? choisir(MOTS.gourmand) : r.taches.total ? choisir(MOTS.taches.concat(econome)) : choisir(econome);
  return { realiste: ph.join(' '), mot: mot.replace(/\{L\}/g, nomLecteur()) };
}
// Combien de fois la lecture de cache est moins chère que l'entrée normale, selon les tarifs utilisés (min et max des modèles).
function rapportCache(tarifs) {
  const r = Object.values(tarifs.modeles).filter((p) => p.cacheLecture > 0).map((p) => p.entree / p.cacheLecture);
  return r.length ? { min: Math.round(Math.min(...r)), max: Math.round(Math.max(...r)) } : null;
}

let enCours = null;
async function calculerBrut({ racine = RACINE, maintenant = Date.now(), fTaches = path.join(DOSSIER, 'taches.json'), fHisto = path.join(DOSSIER, 'historique.jsonl'), tarifs = lireTarifs() } = {}) {
  const debut = maintenant - FENETRE_MS;
  const fichiers = lister(racine, debut);
  const presents = new Set(fichiers.map((s) => s.f));
  for (const k of cache.keys()) if (!presents.has(k)) cache.delete(k);
  const vus = new Map(); // cle -> { rec, agent } (dédoublonnage global ; un sous-agent prime sur la session principale)
  for (const s of fichiers) {
    const c = await majFichier(s, debut);
    for (const [k, r] of c.recs) {
      if (r.t < debut) { c.recs.delete(k); continue; } // la fenêtre ne fait qu'avancer : élagage sans risque
      if (r.t > maintenant) continue;
      const deja = vus.get(k);
      if (!deja || (r.delegue && !deja.rec.delegue) || (r.delegue === deja.rec.delegue && r.o > deja.rec.o)) vus.set(k, { rec: r, agent: r.delegue ? c.agent : 'kinan' });
    }
  }
  const modeles = {}, parAgent = {};
  for (const f of FAMILLES) modeles[f] = { ...vide(), total: 0, delegue: 0 };
  let total = 0, cacheLu = 0, delegue = 0;
  for (const { rec: r, agent } of vus.values()) {
    const m = modeles[r.f], n = r.i + r.o + r.c;
    m.entree += r.i; m.sortie += r.o; m.cacheCree += r.c; m.cacheLu += r.r; m.total += n;
    total += n; cacheLu += r.r;
    if (r.delegue) { m.delegue += n; delegue += n; }
    parAgent[agent] = (parAgent[agent] || 0) + n;
  }
  const tout = vide();
  for (const m of Object.values(modeles)) for (const k of Object.keys(tout)) tout[k] += m[k];
  const reel = coutEuros(modeles, tarifs), toutOpus = coutEuros({ opus: tout }, tarifs);
  const taches = tachesFaites(fTaches, fHisto, debut, maintenant);
  const r = {
    debut, fin: maintenant, total, cacheLu, delegue, modeles, parAgent, nbMessages: vus.size, nbFichiers: fichiers.length,
    euros: { reel, toutOpus, economie: toutOpus - reel },
    taches,
    rendement: {
      partOpus: total ? modeles.opus.total / total : 0,
      partMoinsCher: total ? (modeles.haiku.total + modeles.sonnet.total) / total : 0,
      jetonsParTache: taches.total ? Math.round(total / taches.total) : null,
      eurosParTache: taches.total ? reel / taches.total : null
    },
    tarifs: { maj: tarifs.maj, usdEur: tarifs.usdEur, haikuAConfirmer: !!(tarifs.modeles.haiku && tarifs.modeles.haiku.aConfirmer), rapportCache: rapportCache(tarifs) }
  };
  r.textes = textes(r, maintenant);
  return r;
}
// Un seul calcul à la fois (clics répétés : même promesse).
function calculer(opts) {
  if (!enCours) enCours = calculerBrut(opts).finally(() => { enCours = null; });
  return enCours;
}

function enregistrer(ipcMain) {
  ipcMain.handle('economies:lire', async () => { try { return await calculer(); } catch { return null; } });
}

module.exports = { calculer, enregistrer, finsDeMission, tachesFaites, FENETRE_MS };

// Test en ligne de commande : node economies.js
if (require.main === module) {
  const t0 = Date.now();
  calculer().then((r) => {
    const t1 = Date.now();
    return calculer().then(() => { console.log(JSON.stringify(r, null, 1)); console.log('1re lecture', t1 - t0, 'ms ; 2e (cache)', Date.now() - t1, 'ms'); });
  });
}
