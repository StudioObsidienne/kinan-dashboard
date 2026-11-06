// Fournisseurs de messagerie prédéfinis, validation des serveurs saisis (« Autre ») et messages d'erreur adaptés.
// Fichier pur : aucun accès réseau, aucun fichier. Les hôtes ci-dessous sont les seuls utilisés, avec ceux que l'utilisateur saisit lui-même.
'use strict';

const SECURITES = ['ssl', 'starttls']; // ssl = TLS dès la connexion ; starttls = passage en TLS obligatoire. Jamais de connexion en clair.
const s = (hote, port, securite) => Object.freeze({ hote, port, securite });

const FOURNISSEURS = Object.freeze({
  'zoho-eu': {
    nom: 'Zoho Mail (Europe, zoho.eu)', imap: s('imap.zoho.eu', 993, 'ssl'), smtp: s('smtp.zoho.eu', 465, 'ssl'),
    motDePasse: "Zoho : crée un mot de passe d'application (compte Zoho, Sécurité, Mots de passe d'application) ; ton mot de passe habituel est refusé si la validation en deux étapes est active.",
    activer: "Zoho : active IMAP dans Zoho Mail (Paramètres, Mail, Accès IMAP). Vérifie aussi la région du compte (.eu ou .com)."
  },
  'zoho-com': {
    nom: 'Zoho Mail (zoho.com)', imap: s('imap.zoho.com', 993, 'ssl'), smtp: s('smtp.zoho.com', 465, 'ssl'),
    motDePasse: "Zoho : crée un mot de passe d'application (compte Zoho, Sécurité, Mots de passe d'application) ; ton mot de passe habituel est refusé si la validation en deux étapes est active.",
    activer: "Zoho : active IMAP dans Zoho Mail (Paramètres, Mail, Accès IMAP). Vérifie aussi la région du compte (.eu ou .com)."
  },
  gmail: {
    nom: 'Gmail / Google Workspace', imap: s('imap.gmail.com', 993, 'ssl'), smtp: s('smtp.gmail.com', 465, 'ssl'),
    motDePasse: "Gmail : ton mot de passe Google habituel est refusé. Active la validation en deux étapes du compte Google, puis crée un mot de passe d'application (Compte Google, Sécurité, Mots de passe des applications) et colle ses 16 caractères ici.",
    activer: "Gmail : vérifie que l'accès IMAP est activé (Paramètres, Voir tous les paramètres, Transfert et POP/IMAP). Sur Google Workspace, l'administrateur peut avoir bloqué IMAP ou les mots de passe d'application."
  },
  outlook: {
    nom: 'Outlook.com / Microsoft 365', imap: s('outlook.office365.com', 993, 'ssl'), smtp: s('smtp.office365.com', 587, 'starttls'),
    motDePasse: "Microsoft exige de plus en plus l'authentification moderne (OAuth), que cette version ne gère pas : selon ton compte ou ton administrateur, la connexion par mot de passe (même d'application) peut être refusée. Essaie un mot de passe d'application (compte Microsoft, Sécurité, validation en deux étapes active).",
    activer: "Microsoft 365 : l'administrateur doit autoriser IMAP et l'envoi SMTP authentifié (« SMTP AUTH ») pour ta boîte. Outlook.com : vérifie que l'accès IMAP est autorisé dans les paramètres de synchronisation."
  },
  ovh: {
    nom: 'OVHcloud (MX Plan)', imap: s('ssl0.ovh.net', 993, 'ssl'), smtp: s('ssl0.ovh.net', 465, 'ssl'),
    motDePasse: "OVHcloud : utilise le mot de passe de l'adresse mail (défini dans l'espace client, rubrique Emails). Pour Email Pro ou Exchange, choisis « Autre » avec les serveurs indiqués dans ton espace client.",
    activer: "OVHcloud : IMAP est actif par défaut sur MX Plan ; pour Email Pro ou Exchange, choisis « Autre » avec les serveurs de ton offre."
  },
  icloud: {
    nom: 'iCloud Mail', imap: s('imap.mail.me.com', 993, 'ssl'), smtp: s('smtp.mail.me.com', 587, 'starttls'),
    motDePasse: "iCloud : ton mot de passe Apple est refusé. Active la double authentification, puis crée un mot de passe pour app (compte Apple, Connexion et sécurité, Mots de passe pour app). Si la connexion échoue, mets dans « Identifiant » la partie de l'adresse avant le @.",
    activer: "iCloud : vérifie qu'iCloud Mail est activé pour ton compte Apple (Réglages iCloud)."
  },
  autre: {
    nom: 'Autre (serveurs saisis)', imap: null, smtp: null,
    motDePasse: "Utilise le mot de passe (ou mot de passe d'application) que ton fournisseur indique pour IMAP et SMTP.",
    activer: "Vérifie que ton fournisseur autorise IMAP et l'envoi SMTP authentifié, et que les serveurs, ports et types de sécurité saisis sont ceux de sa documentation."
  }
});
for (const f of Object.values(FOURNISSEURS)) Object.freeze(f);
const IDS = Object.keys(FOURNISSEURS);
const DEFAUT = 'autre';

// Nom d'hôte : nom DNS avec au moins un point et un domaine de premier niveau alphabétique.
// Refusés : adresse IP, « localhost », .local, préfixe de protocole, port collé, espaces, caractères hors [a-z0-9.-].
const RE_HOTE = /^(?=.{4,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;
function hoteValide(h) {
  if (typeof h !== 'string') return null;
  const v = h.trim().toLowerCase().replace(/\.$/, '');
  if (!RE_HOTE.test(v)) return null;
  if (v === 'localhost' || /\.(localhost|local|internal|invalid|test|example)$/.test(v)) return null;
  return v;
}
function portValide(p) {
  const n = typeof p === 'number' ? p : (typeof p === 'string' && /^\s*\d{1,5}\s*$/.test(p) ? Number(p) : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}
const securiteValide = (x) => (SECURITES.includes(x) ? x : null);

// Valide un serveur saisi : { hote, port, securite } -> { ok, serveur, avertissement } ou { ok:false, erreur }.
function serveurValide(o, quoi) {
  o = o && typeof o === 'object' ? o : {};
  const hote = hoteValide(o.hote), port = portValide(o.port), securite = securiteValide(o.securite);
  if (!hote) return { ok: false, erreur: `${quoi} : nom de serveur invalide (exemple : mail.exemple.fr ; ni adresse IP, ni « localhost », ni préfixe de protocole).` };
  if (!port) return { ok: false, erreur: `${quoi} : port invalide (nombre entier de 1 à 65535).` };
  if (!securite) return { ok: false, erreur: `${quoi} : type de sécurité invalide (SSL/TLS ou STARTTLS ; la connexion en clair n'est pas proposée).` };
  let avertissement = '';
  if (securite === 'ssl' && [143, 587, 25].includes(port)) avertissement = `${quoi} : le port ${port} s'utilise d'habitude avec STARTTLS, pas SSL/TLS.`;
  if (securite === 'starttls' && [993, 465].includes(port)) avertissement = `${quoi} : le port ${port} s'utilise d'habitude avec SSL/TLS, pas STARTTLS.`;
  return { ok: true, serveur: Object.freeze({ hote, port, securite }), avertissement };
}

// Serveurs effectifs d'une configuration : prédéfinis pour un fournisseur connu, saisis et validés pour « Autre ».
function resoudre(id, perso) {
  if (!IDS.includes(id)) return { ok: false, erreur: 'Fournisseur inconnu.' };
  const f = FOURNISSEURS[id];
  if (id !== 'autre') return { ok: true, id, imap: f.imap, smtp: f.smtp, avertissements: [] };
  perso = perso && typeof perso === 'object' ? perso : {};
  const i = serveurValide(perso.imap, 'Lecture (IMAP)'); if (!i.ok) return i;
  const m = serveurValide(perso.smtp, 'Envoi (SMTP)'); if (!m.ok) return m;
  return { ok: true, id, imap: i.serveur, smtp: m.serveur, avertissements: [i.avertissement, m.avertissement].filter(Boolean) };
}

// Liste transmise à la page : textes d'aide et serveurs publics, rien d'autre.
const liste = () => IDS.map((id) => ({ id, nom: FOURNISSEURS[id].nom, imap: FOURNISSEURS[id].imap, smtp: FOURNISSEURS[id].smtp,
  motDePasse: FOURNISSEURS[id].motDePasse, activer: FOURNISSEURS[id].activer }));

// Masque les secrets (mot de passe, et ses formes encodées en base64 lors d'une authentification) dans un texte.
function masquer(texte, secrets) {
  let m = String(texte);
  for (const x of [].concat(secrets || [])) if (x && typeof x === 'string' && x.length >= 3) m = m.split(x).join('***');
  return m;
}
function formesSecretes(login, mdp) {
  if (!mdp) return [];
  const b = (t) => Buffer.from(t, 'utf8').toString('base64');
  return [mdp, b(mdp), b(`\u0000${login}\u0000${mdp}`), b(`${login}\u0000${login}\u0000${mdp}`), encodeURIComponent(mdp)];
}

// Message d'erreur en français, adapté au fournisseur. Ne contient jamais le mot de passe.
function messageErreur(e, id, secrets) {
  const f = FOURNISSEURS[IDS.includes(id) ? id : DEFAUT];
  const brut = String((e && (e.responseText || e.response || e.message)) || e || 'erreur inconnue');
  const code = String((e && (e.code || e.responseCode || e.responseStatus)) || '');
  const t = `${code} ${brut} ${(e && e.serverResponseCode) || ''}`;
  let m;
  if (e && e.code === 'MODULE_NOT_FOUND') m = "Bibliothèques de messagerie absentes : lance « npm install » dans le dossier du tableau de bord, puis relance-le.";
  else if (/Application-specific password|app(lication)? password|WebLoginRequired|web browser|5\.7\.9\b/i.test(t)) m = 'Connexion refusée : mot de passe d\'application exigé. ' + f.motDePasse;
  else if (/SmtpClientAuthentication is disabled|5\.7\.139|IMAP (access )?(is )?disabled|not enabled for IMAP|IMAP.*not enabled|access.*disabled|enable IMAP/i.test(t)) m = 'Accès refusé par le fournisseur : ' + f.activer;
  else if ((e && e.authenticationFailed) || /AUTHENTICATIONFAILED|Invalid credentials|EAUTH|\b535\b|Username and Password not accepted|LOGIN failed|authentication failed|Invalid login/i.test(t))
    m = "Connexion refusée : adresse, identifiant ou mot de passe incorrect. " + f.motDePasse;
  else if ((e && e.tlsFailed) || /CERT_|certificate|self[- ]signed|SSL routines|wrong version number|EPROTO|ERR_SSL|TLS/i.test(t))
    m = 'Connexion chiffrée impossible : vérifie le port et le type de sécurité (SSL/TLS ou STARTTLS). Un certificat invalide est toujours refusé.';
  else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(t)) m = 'Serveur introuvable : vérifie le nom du serveur et ta connexion internet.';
  else if (/ECONNREFUSED|ETIMEDOUT|ENETUNREACH|ECONNRESET|EHOSTUNREACH|timeout|ESOCKET|ECONNECTION/i.test(t)) m = 'Serveur injoignable : vérifie le port, ton pare-feu et ta connexion internet, puis réessaie.';
  else m = 'Erreur du serveur : ' + brut.replace(/\s+/g, ' ').trim();
  return masquer(m, secrets).slice(0, 400);
}

module.exports = { FOURNISSEURS, IDS, SECURITES, hoteValide, portValide, securiteValide, serveurValide, resoudre, liste, messageErreur, masquer, formesSecretes };
