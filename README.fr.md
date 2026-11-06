> **Mise à jour :** lance `git pull` dans ce dossier, puis relance `lancer-kinan-os.cmd`. Le plugin se met à jour séparément (`/plugin`) : la pastille peut donc rester sur « mise à jour du plugin disponible » tant que ce n'est pas fait. Le tableau de bord peut vérifier seul les nouvelles versions (désactivé par défaut, voir `config.js`).

# Tableau de bord Kinan

[English](README.md) · [Site web](https://kinan-orchestre-site.vercel.app/)

Tableau de bord Electron hors ligne pour le plugin Claude Code **kinan-orchestre**. Dans un petit bureau en pixel art, il montre ce que font le juge (Kinan) et les agents configurés, quelles conversations Claude Code sont actives, quand arrive le prochain relais, et quelques statistiques locales. Par défaut, il lit uniquement des fichiers locaux, n'ouvre aucune connexion réseau et n'appelle aucun modèle : il ne consomme aucun jeton. Deux options changent cela, seulement une fois activées : la vérification des mises à jour et l'onglet Courrier (votre propre boîte en IMAP/SMTP, récaps et devis préparés par Claude Code). Voir « Réseau ».

Le plugin écrit les fichiers d'état ; ce tableau de bord se contente de les afficher. Sans les hooks du plugin, il reste au repos.

## État

- Testé sous Windows uniquement. macOS et Linux n'ont pas été testés.
- Interface en français.
- Version 0.2.5. Electron 45. Déjà utilisé par des testeurs sur leur propre ordinateur (premiers retours intégrés : fluidité des animations, icône de la barre des tâches, mise à jour). Une prochaine version est en cours.
- Le tableau de bord affiche ce que le plugin écrit. Pour que le juge fonctionne comme prévu, utilisez **Sonnet 5.5** avec un effort **moyen** dans le chat Claude principal.

## Installation

Prérequis : Node.js 20 ou plus récent, et npm.

```
npm install
npm start
```

Sous Windows, `lancer-kinan-os.cmd` enchaîne ces deux étapes.

Si `npm start` signale qu'Electron n'est pas installé (certaines versions de npm n'exécutent pas les scripts d'installation), lancer une fois `node node_modules/electron/install.js`, puis de nouveau `npm start`.

`npm install` installe aussi les trois bibliothèques de messagerie de l'onglet Courrier optionnel (`imapflow`, `nodemailer`, `mailparser`, versions figées). Elles ne sont chargées qu'après activation de cet onglet.

Contrôler les règles réseau de façon statique : `npm run verifier` (voir « Réseau »). Lancer les tests : `npm test`.

## Fonctions et limites

| Fonction | Limite |
|---|---|
| Bureau en pixel art : le juge et jusqu'à cinq agents, quatre états (repos, travail, erreur, attente de réponse) | La scène compte cinq sièges. Au-delà de cinq agents configurés, les suivants apparaissent dans Gestion mais ne sont pas dessinés. Un agent « au travail » sans événement depuis 15 minutes est affiché au repos. |
| Clones : plusieurs exemplaires du même agent en même temps, badge ×N | Dépend des événements reçus par les hooks du plugin. |
| Suivi en temps réel de plusieurs conversations (boîte d'état et bulles) | Une conversation n'apparaît qu'au premier événement qu'elle envoie. Les bulles montrent les conversations au travail ou en attente ; celles au repos sont masquées. |
| Prochain relais (temps et jetons de contexte restants) et bandeau « refaire la conversation » | Estimation fondée sur la fin du journal local Claude Code de la conversation suivie. Seuils : section `relais` de la configuration. |
| Alerte TOKEN OUT quand une limite d'utilisation est atteinte, avec l'heure de reprise : une enseigne pixel tombe du plafond de la scène et reste accrochée par deux chaînes au-dessus des agents (« × » la réduit en pastille dans l'en-tête) | Lit la fin des journaux Claude Code récents toutes les 30 secondes. Leur format n'est pas une interface documentée : si le texte n'est pas lisible, l'heure de reprise est indiquée comme inconnue. Mouvement réduit : ni chute ni clignotement. |
| Bulle rouge « limite » quand il reste 10 % ou moins de la limite 5 h ou hebdomadaire de Claude Code | Nécessite la status line fournie (`node outils/installer-statusline.js`), qui écrit `limites.json` à partir du champ officiel `rate_limits` de Claude Code. Ce champ n'existe que pour les abonnements Claude.ai Pro et Max, après la première réponse d'une session. Sans lui, pas de bulle. |
| Version affichée à côté du titre, coche verte quand elle est à jour, pastille « mise à jour disponible » avec les étapes | Désactivée tant que vous n'avez pas accepté : au premier lancement, une seule question demande s'il faut vérifier les nouvelles versions (une requête vers raw.githubusercontent.com toutes les 30 min). Sans « Oui », seule la version installée est affichée, sans coche ; au survol : « vérification désactivée ». Voir `miseAJour.verifier`. |
| Coche verte : rapport des 3 dernières heures (jetons par modèle, part déléguée, économie estimée) | Estimation au tarif public de l'API, pas une facture. Un abonnement n'est pas facturé ainsi. |
| Journal des événements, fenêtre Gestion (onglets Tâches, Historique, Jetons, Courrier) | Tâches enregistrées localement ; l'onglet Jetons est une estimation tirée des journaux locaux. |
| Sons (synthèse Web Audio, aucun fichier audio) | Désactivables par le bouton Sons ou `sons.actif: false`. |
| Thème (couleurs, polices) | Les polices doivent être installées sur l'ordinateur : rien n'est téléchargé. `theme.logo` (une URL) n'est jamais téléchargé (édition hors ligne) : pour afficher votre logo dans le tableau au mur, copiez-le dans `~/.kinan-os/logo.png` (ou `logo.jpg`, `logo.webp` ; 2 Mo au plus). Il est redessiné en pixel art 32 × 24 (12 couleurs au plus, contour d'un pixel si le fond du logo est transparent). Fichier absent ou illisible : un paysage neutre est affiché. `source` n'est pas utilisé. |
| Onglet Courrier (Gestion, optionnel, désactivé par défaut) : relève de votre boîte en lecture seule, récap et brouillons de réponse par l'agent `courrier` du plugin, devis par son agent `devis` à partir de votre grille de prix, validation, puis envoi après une confirmation du système | Nécessite le plugin kinan-orchestre (agents) et la commande `claude`. Authentification par mot de passe uniquement : OAuth n'est pas géré, certains comptes Microsoft sont donc refusés. Boîte de réception seulement ; première relève : 30 derniers jours, 50 mails au plus. Voir « Courrier ». |

## Configuration

Le tableau de bord lit `kinan.config.json` dans le dossier d'état : `~/.kinan-os/`, ou le dossier indiqué par la variable d'environnement `KINAN_OS_DOSSIER`. Il ne lit jamais de fichier de configuration dans le projet ouvert. Le format est celui du plugin (voir son README) ; le tableau de bord utilise ces clés :

| Clé | Effet | Validation |
|---|---|---|
| `agents.<id>.nom`, `.couleur`, `.role`, `.modele`, `.base`, `.actif` | Noms, couleurs et rôles affichés dans la scène, les cartes, Gestion et les notifications | Mêmes règles que le plugin : identifiant `^[a-z][a-z0-9-]{0,23}$`, 8 agents au plus, couleur `#rrggbb`, nom de 24 caractères au plus |
| `juge.couleur` | Couleur du juge | `#rrggbb`. Le nom du juge (« Kinan ») et son rôle sont verrouillés. |
| `theme.fond`, `.surface`, `.texte`, `.accent`, `.accentSecondaire` | Couleurs de l'interface | `#rgb` ou `#rrggbb` uniquement. Contraste minimal vérifié : texte 4,5:1 sur le fond et la surface, accents 3:1 sur le fond. Si un contrôle échoue, tout le thème est ignoré. |
| `theme.policeTitre`, `.policeTexte` | Polices des titres et du texte | Lettres, chiffres, espaces et tirets, 40 caractères au plus |
| `titreBureau` | Sous-titre sous le titre | Texte de 60 caractères au plus. Par défaut : « Bureau des agents » sur un système en français, « Agents desk » sinon. |
| `dossierTravail` | Quand la conversation suivie tourne dans ce chemin absolu, le sous-titre affiche `titreBureau` ; ailleurs, « Agent · nom de la conversation ». Sans cette clé, le nom d'une conversation connue est toujours affiché. | Chemin absolu de 260 caractères au plus |
| `relais.minutes`, `relais.jetons` | Seuils de relais | 10 à 1 440 minutes ; 50 000 à 2 000 000 jetons |
| `sons.actif` | Sons activés ou non par défaut | Booléen. Le réglage du bouton Sons est prioritaire. |
| `miseAJour.verifier` | `true` : lit la dernière version publiée (`package.json` de kinan-dashboard et `plugin.json` de kinan-orchestre, branche main, sur raw.githubusercontent.com) au démarrage si la dernière vérification a plus de 30 min, puis toutes les 30 min. Échec réseau : rien n'est affiché. Si le dossier du tableau de bord est un dépôt git propre qui suit une branche distante, un bouton « Mettre à jour » lance `git pull --ff-only` après confirmation (jamais de force, refusé s'il y a des modifications locales), puis propose de relancer. Sinon, les étapes sont seulement affichées. Le plugin n'est jamais mis à jour automatiquement. Nouvelle version du tableau de bord ou du plugin détectée : un petit pop-up « Nouvelle mise à jour » (version installée → nouvelle version, boutons « Mettre à jour » et « Plus tard ») s'affiche une seule fois par version, en plus de la notification système ; « Mettre à jour » reprend le flux git ci-dessus pour le tableau de bord et affiche les étapes `/plugin` pour le plugin. | Booléen ; absent = une seule question au premier lancement (« Non » par défaut), réponse écrite dans `miseAJour.verifier` de `kinan.config.json` (autres clés intactes) ; `false` = zéro réseau |

Toute valeur invalide est ignorée et remplacée par la valeur par défaut. Le texte venant des fichiers est toujours inséré comme texte, jamais comme HTML.

## Courrier

L'onglet Courrier (fenêtre Gestion) est une option, désactivée par défaut.

1. Installez le plugin kinan-orchestre : il fournit les agents `courrier` et `devis` que l'onglet lance avec `claude -p --agent kinan-orchestre:courrier` (ou `:devis`). Si `claude` n'est pas dans le PATH, indiquez son chemin complet dans la variable d'environnement `CLAUDE_BIN`.
2. Ouvrez Gestion, onglet **Courrier**, cliquez sur **Activer le courrier** et confirmez la boîte de dialogue du système.
3. Choisissez votre fournisseur, saisissez l'adresse et un mot de passe d'application, cliquez sur **Enregistrer** puis **Tester la connexion**. Le test ouvre une connexion IMAP et une connexion SMTP ; rien n'est lu ni envoyé.
4. **Relever** lit la boîte de réception en lecture seule : rien n'est marqué comme lu, supprimé ni déplacé. Une fois la connexion vérifiée, le tableau de bord relève aussi toutes les 30 minutes tant qu'il est ouvert.
5. **Récap mails** lance l'agent `courrier` : un récap (une ligne par point) et des brouillons de réponse. **Préparer les devis** lance l'agent `devis` sur les mails repérés comme demandes de devis.
6. Validez, modifiez ou refusez chaque brouillon. **Envoyer** ouvre une boîte de dialogue du système qui liste les destinataires ; rien ne part sans elle.

| Fournisseur | Mot de passe à utiliser | Avant de connecter |
|---|---|---|
| Zoho Mail (zoho.eu ou zoho.com) | Un mot de passe d'application (compte Zoho, Sécurité, Mots de passe d'application) | Activez IMAP (paramètres de Zoho Mail, Mail, Accès IMAP) et choisissez la région de votre compte. |
| Gmail / Google Workspace | Un mot de passe d'application (compte Google, Sécurité ; validation en deux étapes obligatoire). Le mot de passe habituel est refusé. | Vérifiez qu'IMAP est activé (Paramètres, Voir tous les paramètres, Transfert et POP/IMAP). Un administrateur Workspace peut bloquer IMAP ou les mots de passe d'application. |
| Outlook.com / Microsoft 365 | Un mot de passe d'application, si votre compte en propose | Microsoft exige de plus en plus l'authentification moderne (OAuth), que cette version ne gère pas : la connexion peut être refusée. Sur Microsoft 365, l'administrateur doit autoriser IMAP et l'envoi SMTP authentifié (SMTP AUTH). |
| OVHcloud (MX Plan) | Le mot de passe de l'adresse, défini dans l'espace client OVHcloud | IMAP est actif par défaut. Pour Email Pro ou Exchange, choisissez « Autre » avec les serveurs indiqués dans votre espace client. |
| iCloud Mail | Un mot de passe pour app (compte Apple, Connexion et sécurité ; double authentification obligatoire) | Si la connexion échoue, mettez dans « Identifiant » la partie de l'adresse avant le @. |
| Autre | Celui que votre fournisseur indique pour IMAP et SMTP | Saisissez serveur, port et sécurité (SSL/TLS ou STARTTLS) pour IMAP et SMTP. Un nom de serveur est exigé (ni adresse IP, ni localhost, ni préfixe de protocole) ; la connexion non chiffrée n'est pas proposée. |

Serveurs prédéfinis : `imap.zoho.eu`/`smtp.zoho.eu`, `imap.zoho.com`/`smtp.zoho.com`, `imap.gmail.com`/`smtp.gmail.com`, `outlook.office365.com`/`smtp.office365.com` (STARTTLS, port 587), `ssl0.ovh.net`, `imap.mail.me.com`/`smtp.mail.me.com` (STARTTLS, port 587). Les certificats TLS sont toujours vérifiés (TLS 1.2 au minimum).

Règles de sécurité, appliquées par le code (et couvertes par `npm test`) :

- Le mot de passe est chiffré par `safeStorage` d'Electron (refusé si le système n'offre pas de vrai chiffrement). Il n'est jamais renvoyé à la page ni journalisé, et il est masqué dans les messages d'erreur.
- Le destinataire est recalculé depuis le mail d'origine (`Reply-To`, sinon `From`) ; un brouillon qui indique une autre adresse est bloqué comme suspect.
- Les agents n'ont que Read, Glob et Grep, limités au dossier `echange` ; ils répondent par un bloc JSON, que le tableau de bord contrôle avant d'écrire lui-même les brouillons. Le contenu des mails est une donnée, jamais une instruction.
- Un mail ne passe à « traité » que si l'agent l'a cité dans sa réponse sans le déclarer illisible. Si la lecture a été refusée, les mails restent « nouveau ».
- Les montants des devis sont calculés par le tableau de bord à partir de votre grille (prix unitaire × quantité, TVA de la grille), jamais repris du modèle. Une ligne sans prix bloque la validation tant que vous n'en saisissez pas un.
- L'envoi exige votre validation, puis la confirmation du système ; un mail déjà parti, ou dont l'envoi est incertain, n'est jamais renvoyé automatiquement.

Grille de prix pour les devis : copiez `exemples/grille-prix.exemple.json` (fictive) vers `echange/grille-prix.json` et remplacez ses lignes par vos prestations et vos prix. Format : `devise` (code ISO, `EUR` par défaut), `tauxTva` (0 à 0,5), `lignes` (`id`, `libelle`, `unite`, `prixUnitaire`), `mentions` facultatives (6 lignes au plus, imprimées en bas du PDF).

## Réseau

Par défaut, le tableau de bord n'ouvre aucune connexion réseau :

- chaque page porte une Content-Security-Policy avec `default-src 'none'` et `connect-src 'none'` ;
- le processus principal annule toute requête `http`, `https`, `ws` et `wss` au niveau de la session, refuse l'ouverture de nouvelles fenêtres, la navigation hors des fichiers locaux et les demandes d'autorisation ;
- en dehors des exceptions déclarées ci-dessous, aucun module tel que `http`, `https`, `net`, `tls`, `dns` ou `child_process` n'est chargé, ni aucune bibliothèque de messagerie.

Trois exceptions déclarées, contrôlées par le vérificateur :

- `mise-a-jour.js` (vérification des mises à jour et `git pull --ff-only`) n'est chargé que si `miseAJour.verifier` vaut `true` ; une seule origine, `raw.githubusercontent.com`, sans redirection suivie ;
- `courrier.js` (onglet Courrier) n'est chargé que par `courrier-ipc.js`, et seulement après activation (`courrier-option.json` avec `"actif": true`, écrit par le bouton « Activer le courrier » après une confirmation du système). Il se connecte alors uniquement aux serveurs IMAP et SMTP du fournisseur choisi, ou à ceux saisis pour « Autre », quand vous cliquez sur Tester, Relever ou Envoyer, et toutes les 30 minutes pour la relève une fois la connexion vérifiée. Il lance aussi `claude -p` pour les récaps et les devis : cette session Claude Code communique avec Anthropic et utilise votre compte et vos jetons Claude, comme toute session Claude Code. « Désactiver le courrier » arrête tout cela ;
- `outils/statusline-limites.js` est lancé par Claude Code (status line), jamais par le tableau de bord. Il n'utilise pas le réseau ; il ne lance un processus que pour relancer une status line déjà installée avant lui.

`node outils/verifier-hors-ligne.js` (ou `npm run verifier`) contrôle ces points de façon statique et échoue s'il trouve un appel réseau, une ressource distante ou une page sans CSP stricte hors des exceptions. Pour l'option courrier, il vérifie aussi que `courrier.js` n'est chargé que sous la condition d'activation, ne prend ses hôtes que dans les serveurs validés, garde la vérification des certificats TLS, ne lance aucun autre processus que `claude` (sans shell), refuse d'envoyer sans confirmation explicite, et que les seules dépendances d'exécution sont les trois bibliothèques de messagerie, en versions figées. Il liste chaque accès aux fichiers relevé dans le code et les serveurs de messagerie prédéfinis.

`npm install` télécharge Electron et les bibliothèques de messagerie ; cela a lieu une fois, avant toute utilisation du tableau de bord.

## Fichiers lus et écrits

Dossier d'état (`~/.kinan-os/` ou `KINAN_OS_DOSSIER`) :

| Fichier | Lu | Écrit |
|---|---|---|
| `kinan.config.json` | oui | jamais |
| `state.json` (états des agents, écrit par le plugin) | oui | créé avec des états au repos s'il manque |
| `sessions.json` (conversations, écrit par le plugin) | oui | jamais |
| `historique.jsonl` (journal, écrit par le plugin) | oui | jamais |
| `taches.json` (tâches) | oui | oui, depuis l'onglet Tâches (avec le verrou `state.lock` du plugin) |
| `reglages.json` (position de la fenêtre, sons, tarifs, taille du contexte) | oui | oui |
| `son.log` (diagnostic audio) | non | complété en cas d'erreur audio |
| `limites.json` (limites 5 h et hebdomadaire, écrit par la status line) | oui, toutes les 10 s | jamais par le tableau de bord |
| `mise-a-jour.json` (cache de la vérification des mises à jour) | oui, si activée | oui, si activée |
| `courrier-option.json` (onglet Courrier activé ou non) | oui | oui, par les boutons Activer / Désactiver |
| `courrier.json` (fournisseur, adresse, identifiant, serveurs, dernière relève ; aucun mot de passe) | oui, si activé | oui, si activé |
| `courrier.bin` (adresse, identifiant et mot de passe, chiffrés par `safeStorage`) | oui, si activé | oui à l'enregistrement ; supprimé par « Oublier les identifiants » |
| `envois.jsonl` (journal d'envoi : fichier, destinataire, résultat ; aucun identifiant) | oui, si activé | complété, si activé |

Dossier d'échange du courrier : `echange/` dans le dossier du tableau de bord (ignoré par git). Utilisé seulement quand l'onglet Courrier est activé :

| Chemin | Contenu | Écrit par |
|---|---|---|
| `echange/mails/<id>.json` | Mails relevés (texte brut tronqué à 6 000 caractères, noms des pièces jointes seulement) | le tableau de bord |
| `echange/a-valider/`, `valides/`, `refuses/`, `envoyes/` | Brouillons de réponse et de devis à chaque étape | le tableau de bord (jamais les agents) |
| `echange/recap-mails.md`, `recap-devis.md` | Derniers récaps | le tableau de bord, à partir de la réponse de l'agent |
| `echange/grille-prix.json` | Votre grille de prix | vous |

Les agents lisent `echange/mails/`, `echange/a-valider/` et `echange/grille-prix.json`, rien d'autre.

Journaux Claude Code, en lecture seule : `~/.claude/projects/**/*.jsonl` et les fichiers `.meta.json` des sous-agents (relais, TOKEN OUT, jetons, rapport de 3 heures). Seule la fin des fichiers récents est lue.

Status line : `node outils/installer-statusline.js` ajoute la clé `statusLine` à `~/.claude/settings.json` (copie de sauvegarde `settings.json.bak-kinan`, aucune autre clé modifiée). Une status line déjà présente n'est pas écrasée : elle est relancée par la nouvelle et sa sortie reste affichée. `--retirer` remet la précédente.

Le tableau de bord n'écrit rien d'autre et n'envoie rien nulle part, sauf par les options que vous activez : la vérification des mises à jour, et l'onglet Courrier (connexions à vos serveurs de messagerie, mails que vous confirmez, sessions Claude Code qu'il lance). Les récaps peuvent aussi être copiés dans le presse-papiers ou enregistrés dans un fichier `.txt` que vous choisissez.

## Développement

- `?demo=1` sur `src/index.html` (ouvert dans un navigateur, par exemple via un petit serveur statique local) affiche des données simulées. Autres paramètres : `relais=1`, `tokenout=1`, `economies=1`, `ouvert=1`, `sieges=1..5`, `clones=skyze:2`, `calme=1` (mouvement réduit).
- `node outils/faire-logo.js` régénère `assets/icon.png` (256 px) et `assets/icon.ico` (16, 24, 32, 48, 64, 128 et 256 px, fond transparent, chaque taille dessinée depuis la grille 16 × 16 pour une icône nette dans la barre des tâches). Sous Windows, les fenêtres utilisent `icon.ico`.
- L'interface respecte `prefers-reduced-motion`. Scène : environ 30 images par seconde avec une tolérance de gigue (cadence régulière sur les écrans 60 Hz), arrêtée quand la fenêtre est masquée ou réduite. En mouvement réduit (sous Windows : « Effets d'animation » désactivés, ou « Ajuster afin d'obtenir les meilleures performances »), la scène est redessinée une fois par seconde et reste immobile, volontairement.
- `npm test` vérifie aussi que le pop-up « Nouvelle mise à jour » ne s'affiche qu'une fois par version (`test/mise-a-jour.test.js`).
- `npm test` lance les tests du courrier (`test/courrier.test.js`) avec de faux IMAP, SMTP et `claude` : table des fournisseurs, validation des serveurs et ports, relève en lecture seule, « traité » seulement si l'agent a cité le mail, destinataire recalculé, aucun envoi sans confirmation, montants des devis tirés de la grille. Aucune vraie boîte n'est contactée.

## Antivirus (Windows)
Windows Defender met parfois en quarantaine le `ffmpeg.dll` d'Electron (nom de détection « Posilod.EB!cl » ; le suffixe « !cl » désigne une détection par le nuage ou par heuristique). C'est un faux positif : le fichier vient tel quel du paquet officiel d'Electron installé par `npm install`. Marche à suivre, dans l'ordre :
1. `lancer-kinan-os.cmd` détecte le fichier manquant et réinstalle Electron automatiquement.
2. S'il est de nouveau retiré : Sécurité Windows > Protection contre les virus et menaces > Historique de protection, choisissez l'élément `ffmpeg.dll`, puis Actions > Restaurer.
3. Signalez le faux positif à Microsoft : https://www.microsoft.com/wdsi/filesubmission (« Détecté à tort », joignez `node_modules\electron\dist\ffmpeg.dll`). Une fois les définitions corrigées par Microsoft, la détection disparaît pour tout le monde.
4. En dernier recours, et sur votre seule décision : ajoutez une exclusion pour le seul dossier du tableau de bord (Sécurité Windows > Paramètres de protection contre les virus et menaces > Exclusions). Attention : Defender n'analysera plus rien dans ce dossier, y compris les fichiers que vous y téléchargerez plus tard. N'excluez jamais un disque entier, et retirez l'exclusion une fois la détection corrigée.

Le projet ne désactive jamais Defender et n'ajoute jamais d'exclusion lui-même. Contrôle du 6 novembre 2026 avec les définitions Defender 1.463.137.0 : une analyse locale ne détecte pas le `ffmpeg.dll` d'Electron 45.2.3 ; changer de version d'Electron ne peut donc pas être montré comme utile, la détection dépendant des définitions et de la protection dans le nuage de chaque PC.

## Licence

Apache-2.0. Voir [LICENSE](LICENSE) et [NOTICE](NOTICE).
