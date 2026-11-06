# Tableau de bord Kinan

[English](README.md)

Tableau de bord Electron hors ligne pour le plugin Claude Code **kinan-orchestre**. Dans un petit bureau en pixel art, il montre ce que font le juge (Kinan) et les agents configurés, quelles conversations Claude Code sont actives, quand arrive le prochain relais, et quelques statistiques locales. Il lit uniquement des fichiers locaux. Il n'ouvre aucune connexion réseau et n'appelle aucun modèle : il ne consomme aucun jeton.

Le plugin écrit les fichiers d'état ; ce tableau de bord se contente de les afficher. Sans les hooks du plugin, il reste au repos.

## État

- Testé sous Windows uniquement. macOS et Linux n'ont pas été testés.
- Interface en français.
- Version 0.1.0. Electron 45.

## Installation

Prérequis : Node.js 20 ou plus récent, et npm.

```
npm install
npm start
```

Sous Windows, `lancer-kinan-os.cmd` enchaîne ces deux étapes.

Si `npm start` signale qu'Electron n'est pas installé (certaines versions de npm n'exécutent pas les scripts d'installation), lancer une fois `node node_modules/electron/install.js`, puis de nouveau `npm start`.

Vérifier que le code ne contient aucun appel réseau : `npm run verifier` (voir « Réseau »).

## Fonctions et limites

| Fonction | Limite |
|---|---|
| Bureau en pixel art : le juge et jusqu'à cinq agents, quatre états (repos, travail, erreur, attente de réponse) | La scène compte cinq sièges. Au-delà de cinq agents configurés, les suivants apparaissent dans Gestion mais ne sont pas dessinés. Un agent « au travail » sans événement depuis 15 minutes est affiché au repos. |
| Clones : plusieurs exemplaires du même agent en même temps, badge ×N | Dépend des événements reçus par les hooks du plugin. |
| Suivi en temps réel de plusieurs conversations (boîte d'état et bulles) | Une conversation n'apparaît qu'au premier événement qu'elle envoie. Les bulles montrent les conversations au travail ou en attente ; celles au repos sont masquées. |
| Prochain relais (temps et jetons de contexte restants) et bandeau « refaire la conversation » | Estimation fondée sur la fin du journal local Claude Code de la conversation suivie. Seuils : section `relais` de la configuration. |
| Alerte TOKEN OUT quand une limite d'utilisation est atteinte, avec l'heure de reprise | Lit la fin des journaux Claude Code récents toutes les 30 secondes. Leur format n'est pas une interface documentée : si le texte n'est pas lisible, l'heure de reprise est indiquée comme inconnue. |
| Coche verte : rapport des 3 dernières heures (jetons par modèle, part déléguée, économie estimée) | Estimation au tarif public de l'API, pas une facture. Un abonnement n'est pas facturé ainsi. |
| Journal des événements, fenêtre Gestion (onglets Tâches, Historique, Jetons) | Tâches enregistrées localement ; l'onglet Jetons est une estimation tirée des journaux locaux. |
| Sons (synthèse Web Audio, aucun fichier audio) | Désactivables par le bouton Sons ou `sons.actif: false`. |
| Thème (couleurs, polices) | Les polices doivent être installées sur l'ordinateur : rien n'est téléchargé. `logo` et `source` sont validés mais pas utilisés par cette édition hors ligne. |

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

Toute valeur invalide est ignorée et remplacée par la valeur par défaut. Le texte venant des fichiers est toujours inséré comme texte, jamais comme HTML.

## Réseau

Le tableau de bord n'ouvre aucune connexion réseau :

- chaque page porte une Content-Security-Policy avec `default-src 'none'` et `connect-src 'none'` ;
- le processus principal annule toute requête `http`, `https`, `ws` et `wss` au niveau de la session, refuse l'ouverture de nouvelles fenêtres, la navigation hors des fichiers locaux et les demandes d'autorisation ;
- aucun module tel que `http`, `https`, `net`, `tls`, `dns` ou `child_process` n'est chargé, et il n'y a aucune dépendance d'exécution.

`node outils/verifier-hors-ligne.js` (ou `npm run verifier`) contrôle ces points de façon statique et échoue s'il trouve un appel réseau, une ressource distante ou une page sans CSP stricte. Il liste aussi chaque accès aux fichiers relevé dans le code.

`npm install` télécharge Electron ; cela a lieu une fois, avant toute utilisation du tableau de bord.

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

Journaux Claude Code, en lecture seule : `~/.claude/projects/**/*.jsonl` et les fichiers `.meta.json` des sous-agents (relais, TOKEN OUT, jetons, rapport de 3 heures). Seule la fin des fichiers récents est lue.

Le tableau de bord n'écrit rien d'autre et n'envoie rien nulle part.

## Développement

- `?demo=1` sur `src/index.html` (ouvert dans un navigateur, par exemple via un petit serveur statique local) affiche des données simulées. Autres paramètres : `relais=1`, `tokenout=1`, `economies=1`, `ouvert=1`, `sieges=1..5`, `clones=skyze:2`, `calme=1` (mouvement réduit).
- `node outils/faire-logo.js` régénère `assets/icon.png` et `assets/icon.ico`.
- L'interface respecte `prefers-reduced-motion`.

## Licence

Apache-2.0. Voir [LICENSE](LICENSE) et [NOTICE](NOTICE).
