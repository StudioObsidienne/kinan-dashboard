# Spec : suivi de plusieurs conversations (plugin 0.3.0, dashboard 0.4.0)

Besoin : une pastille cliquable par conversation Claude Code connectée ; cliquer met à jour les agents (travail, repos, doute, erreur, tâche) d'après CETTE conversation. Aujourd'hui `state.json` est unique et `etat.js` remet tous les agents au repos dès qu'un événement vient d'une autre `session_id` : deux conversations ouvertes s'écrasent.

## 1. Modèle de données (`~/.kinan-os`, ou `KINAN_OS_DOSSIER`)
- `sessions/<sid>.json` (nouveau) : état d'UNE conversation, même forme que `state.json` (`agents`, `instances`, `transcript`, `session`). `<sid>` = `session_id` filtré `[A-Za-z0-9-]{1,64}` ; sinon empreinte sha1 tronquée (jamais de `..` ni de `/`).
- `sessions.json` (existant, enrichi) : registre `{ sid: { projet, cwd, transcript, etat, tache, maj, debut, fin? } }`. `debut` ajouté au premier événement, `fin` posé par SessionEnd.
- `state.json` (conservé) : miroir de la dernière session active, écrit comme aujourd'hui (comportement 0.2.2 inchangé pour les anciens dashboards).
- `taches.json` : chaque tâche de mission reçoit `session: <sid>`. Anciennes tâches sans `session` : visibles seulement dans « Toutes ».
- `historique.jsonl` : champ facultatif `s` (sid) ; les lecteurs ignorent les champs inconnus.
- Libellé : `projet` (nom du dossier) ; doublon -> « projet · 2 ». Renommage manuel par Jean, stocké dans `reglages.json` (`libellesSessions[sid]`). Jamais le texte d'un prompt ni un résumé de transcript.
- Nettoyage : SessionEnd -> `fin` + suppression de `sessions/<sid>.json` ; sans événement depuis 24 h -> registre et fichier purgés (règle existante étendue aux fichiers orphelins) ; dashboard : pastille masquée si `fin` ou repos depuis plus de 15 min.

## 2. Plugin (`kinan-plugin`)
- `hooks/etat.js` : `lire()`/`ecrire()` prennent un chemin ; l'événement lit et écrit `sessions/<sid>.json` (sans la remise au repos inter-sessions), puis recopie le résultat dans `state.json` (avec la remise au repos actuelle, pour le miroir). `ajouterTache` ajoute `session`. `majSessions` ajoute `debut`, gère `SessionEnd`, purge les fichiers orphelins.
- `hooks/lib/fichiers.js` : `nomSur(sid)` (filtrage + empreinte). Aucun autre changement.
- `hooks/hooks.json` : déclarer `SessionEnd` vers `etat.js`.
- `.claude-plugin/plugin.json` (et manifeste de marketplace s'il répète la version) : 0.3.0.

## 3. Dashboard (`kinan-dashboard`)
- `sessions-etat.js` (nouveau, fonctions pures) : `listerSessions(registre, libelles, now)` -> `[{ id, libelle, etat, actifs, maj }]` ; `etatSession(dossier, sid)` ; `fusionner(etats)` pour « Toutes » (par agent : erreur > doute > travail > repos ; tâche la plus récente ; instances concaténées).
- `main.js` : variable `sessionChoisie` (`'toutes'` par défaut) ; `lireEtat()` renvoie l'état de la session choisie, ou la fusion, ou `state.json` si `sessions/` est absent ; `appliquerDelais` avec une Map `erreursVues` par session ; la boucle 1 s reste la même. `lireSessions` n'envoie au rendu QUE `{ id, libelle, etat, actifs, maj }` (plus de `cwd` ni de `transcript` dans le rendu). IPC `session:choisir(id)` validé contre le registre. Relais : `transcript` de la session choisie (ou la plus récente si « Toutes »).
- `preload.js` : `sessionChoisir(id)`, `sessionCourante()`.
- `agent-ipc.js` : détail d'agent et tâches filtrés par `session` de la session choisie (tout si « Toutes »).
- Son et fenêtre question : restent sur la fusion (une question dans n'importe quelle conversation doit apparaître) ; la question indique le libellé de sa session.
- `src/boutons.js` + `src/index.html` : la zone `#sess-bulles` devient la barre de pastilles (section 4) ; l'ancien affichage « autres projets » disparaît.
- `package.json` : 0.4.0 ; README.md et README.fr.md : tableau des fichiers lus.

## 4. Interface
- Barre affichée seulement si au moins 2 sessions vivantes ; avec une seule, rien ne change à l'écran.
- `div role="radiogroup" aria-label="Conversations"` ; pastilles `button role="radio" aria-checked` : point coloré (état) + libellé + nombre d'agents au travail. Première pastille « Toutes ». Flèches gauche/droite, Entrée, focus visible.
- Session choisie qui disparaît -> repli automatique sur « Toutes » avec annonce `aria-live="polite"`.
- Au-delà de 5 sessions : pastille « +n » ouvrant la liste. Double-clic sur une pastille : renommer.
- Animation de la pastille au travail coupée sous `prefers-reduced-motion: reduce`. Contraste AA en thème clair et sombre.

## 5. Compatibilité
- Plugin 0.2.2 + dashboard 0.4.0 : pas de `sessions/` -> lecture de `state.json`, barre masquée, comportement 0.3.1.
- Plugin 0.3.0 + dashboard 0.3.1 : `state.json` miroir identique à aujourd'hui ; fichiers nouveaux ignorés.
- Anciens `taches.json` / `historique.jsonl` : lus sans erreur (champs absents tolérés).

## 6. Risques
- Verrou : on garde le seul `state.lock` (écritures courtes) ; deux conversations augmentent l'attente, pas les pertes. Le dashboard lit sans verrou (écritures atomiques) ; sous Windows, conserver la reprise sur EPERM de `ecrireAtomique`.
- Concurrence : une écriture de miroir peut afficher brièvement l'autre session dans un vieux dashboard (déjà le cas).
- Vie privée : le rendu ne reçoit que libellé, état, nombre d'agents, tâche courte d'agent (déjà affichée) ; ni chemin, ni transcript, ni prompt.
- Sécurité : `sid` vient de l'événement -> filtrage obligatoire avant tout chemin ; `session:choisir` refuse un id inconnu.

## 7. Tests
- Plugin `tests/sessions.test.js` : deux `session_id` entrelacés gardent chacun leurs agents ; miroir = dernière session ; SessionEnd supprime le fichier ; `../x` ne sort pas du dossier ; purge 24 h ; tâche porte `session` ; aucun fichier ne contient le texte du prompt de test. Étendre `tests/concurrence.test.js` à deux sessions simultanées.
- Dashboard `test/sessions-etat.test.js` : fusion (priorités, instances), libellés en doublon, repli sans `sessions/`, repli sur « Toutes », charge IPC limitée aux 5 clés.

## 8. Étapes pour Skyze
1. Plugin : `nomSur`, état par session, miroir, `session` dans les tâches, tests. 2. `SessionEnd`, purge, version 0.3.0.
3. `sessions-etat.js` + tests. 4. `main.js`, `preload.js`, `agent-ipc.js`, relais. 5. Pastilles (`boutons.js`, `index.html`), clavier, mouvement réduit. 6. README, version 0.4.0.

## 9. Vérification (Drafion)
- `node --test` vert dans `kinan-plugin` et `kinan-dashboard`.
- Deux conversations réelles : agent lancé dans A ; pastille B -> agent au repos ; « Toutes » -> agent au travail ; fermeture de A -> pastille disparue, repli sur « Toutes ».
- Grep dans `~/.kinan-os` : aucun texte de prompt ; aucun `cwd` ni `transcript` dans les messages IPC du rendu.
- Plugin 0.2.2 avec dashboard 0.4.0 : affichage identique à 0.3.1.
