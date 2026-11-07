# Changelog

Format : Keep a Changelog. Le numéro de version n'est pas modifié ici : il sera fixé à la publication.

## [0.4.1] — 2026-11-07
- **Panneau des mises à jour** : si la version installée est plus récente que celle publiée en cache, l'appli revérifie tout de suite (au plus une fois toutes les 2 min) et ne dit plus « Tout est à jour » ; bouton « Revérifier maintenant ».

## [0.4.0] — 2026-11-07
- **Allègement** : l'état n'est relu que si son fichier a changé (cache), et le minuteur d'une seconde se met en pause fenêtre masquée ou réduite.
- **Plusieurs conversations** (plugin 0.3.0) : une pastille par conversation Claude Code ouverte, affichée à partir de 2. « Récente » (par défaut) suit la plus récente comme avant ; « Toutes » fusionne les agents (erreur > doute > travail > repos) ; une pastille montre les agents d'une seule conversation. Flèches gauche/droite, Entrée, double-clic pour renommer, « +n » au-delà de 5. Conversation fermée : retour à « Récente », annoncé aux lecteurs d'écran.
- Détail d'agent : historique et tâches de la conversation choisie. Le son et la fenêtre question suivent toutes les conversations ; la question indique le nom de sa conversation.
- Le rendu ne reçoit plus aucun chemin (dossier, journal de conversation) : seulement nom, état et nombre d'agents au travail par conversation.
- Plugin 0.2.2 : rien ne change (lecture de `state.json`, barre masquée).

## [0.3.1] — 2026-11-07
- **Bouton son** visible en permanence dans l'en-tête (haut-parleur, muet par défaut, mémorisé) : coupe ou active les sons du fouet, des ronflements de Drafion, des objets et de Jean.
- **Erreur de Kinan** : affichée 20 s puis retour au repos, calculé à chaque lecture de l'état (plus de rouge qui reste), transition douce.
- **Relance** : un second lancement ne restaure plus une fenêtre déjà ouverte.
- Jean suit en direct le bouton son ; le raccourci Bureau / menu Démarrer est aussi recréé au démarrage de l'appli (Windows, silencieux), plus seulement via `lancer-kinan-os.cmd`.

## [0.3.0] — 2026-11-07 — Drafion's Awakening

### Corrigé (finitions)
- **Sonnet par défaut** : le juge Kinan n'est plus codé en dur sur Opus (`agent-ipc.js`) ; repli `sonnet` au lieu de `inherit` ; modèle lu sans tenir compte de la casse. Les anciennes configurations migrent à la lecture, sans réécriture : un choix explicite de l'utilisateur est conservé, les autres préférences sont intactes.
- Objets : fenêtre et tasse (décalage fantôme, rideaux), carré noir au clic (contour limité au focus clavier).
- Doubles des agents : nouveau placement sur emplacements libres (`placement-logique.js`), sans traverser les objets.
- Glisser-déposer du décor mural, choix des agents et objets affichés dans « Paramètres du royaume », particules du panneau refaites.
- Drafion : fonte et réveil brutal refaits sur le modèle d'avatar existant ; fouet avec vrai claquement ; Jean refait (sans auréole, chœur de voix douces).
- Ouverture : fenêtre affichée à `ready-to-show`, en-tête sans saut ; icône du raccourci corrigée à chaque lancement ; le raccourci (Bureau et menu Démarrer) porte l'identifiant d'application `kinan-os.dashboard` : la fenêtre se regroupe sous « Kinan Orchestre » (plus « Electron ») et s'épingle correctement à la barre des tâches.

Mise à jour humoristique et interactive du bureau des agents. Tout est local : aucun appel réseau, aucun appel IA, aucun jeton, aucune modification de l'état réel des agents. Son muet par défaut ; `prefers-reduced-motion` respecté.

### Ajouté
- **Drafion qui fond** : après 10 min d'inactivité réelle il s'affaisse, ronfle dès 20 min (puis toutes les 10 min), bulle de nez synchronisée à sa respiration dès 30 min, réveil fluide. Test accéléré : `?egg-vitesse=60`.
- **Le fouet** : un objet caché au mur ; mode fouet avec curseur dédié, réactions humoristiques selon l'état visuel de l'agent (endormi, erreur, au travail, au repos). Purement visuel.
- **Micro-interactions** : plante, fenêtre, lampe, ordinateurs, tasse, horloge, tableau, panneau de liège, étagère, avec bulles de dialogue aléatoires.
- **La chasse au trésor** : énigmes locales, progression conservée après rafraîchissement, bouton secret à la clé.
- **Jean, l'être suprême** : apparition, descente, monologue en machine à écrire, boule d'énergie, envol vers l'astre de la fenêtre. Personnage décoratif, jamais intégré aux agents. Rejouable : `?egg-jean=1`.
- **Paramètres du royaume** : panneau de personnalisation du décor (variantes, thèmes, ambiances, glisser-déposer, effets), sauvegardé en local, avec réinitialisation.
- **Flash rouge et blanc** sur l'animation token out (version fixe en mouvement réduit).
- **Bulle de limite progressive** : visible en bas du panneau, du neutre à un rouge intense à l'approche de la limite 5 h ou hebdomadaire. Démo : `?demo=1&limite=90`.

### Technique
- Socle `src/egg-core.js` (`window.KinanEgg`) et modules indépendants dans `src/eggs/`, chacun protégé par try/catch.
- Clés de stockage préfixées `kinan-os.egg.`.
- Tests : `npm test` ; contrôle réseau : `npm run verifier`.
