# Spec : bloc-notes intégré (onglet Notes de Gestion, dashboard [À venir])

Besoin : noter une idée sans ouvrir le Bloc-notes de Windows, et ranger les pense-bêtes par projet et par dossier. 100 % local : aucun réseau, aucune IA, rien n'est envoyé.

## 1. Données (`~/.kinan-os/notes.json`, ou `KINAN_OS_DOSSIER`)
- `{ version: 1, projets: [{ id, nom, cree, supprime }], dossiers: [{ id, projet, nom, cree, supprime }], notes: [{ id, projet, dossier, titre, texte, cree, modif, epinglee, supprime }] }`.
- Hiérarchie Projet > Dossier > Note. Note sans projet = « Sans dossier » (ex-« Boîte de réception »). Une note peut aussi être à la racine d'un projet.
- `titre` = première ligne non vide (sans `#` de tête, 80 caractères), « Sans titre » sinon ; recalculé à chaque modification.
- `supprime` (date ISO ou null) : corbeille. Purge au chargement des éléments supprimés depuis plus de 30 jours.
- Limites : texte ≤ 100 000 caractères (refusé au-delà, jamais tronqué en silence), ≤ 5000 notes (corbeille comprise), 200 projets, 1000 dossiers, noms ≤ 80 caractères. Identifiants `[a-z0-9]{4,40}` (aléatoires, `crypto`).

## 2. Écriture et lecture (`notes-stockage.js`)
- Écriture atomique : fichier `.tmp` puis renommage (3 essais sur EPERM/EBUSY/EACCES, comme `gestion-ipc.js`).
- Avant chaque écriture, la version en place est copiée en `notes.json.bak`, seulement si elle est valide (un fichier abîmé n'écrase jamais la sauvegarde).
- Lecture tolérante : `notes.json`, sinon `notes.json.bak`, sinon état vide. Fichier illisible copié en `notes.json.corrompu-<date>` ; un avis s'affiche une fois dans l'onglet.
- `normaliser()` écarte toute entrée invalide (id, doublon, parent inconnu, types).

## 3. Processus principal
- `notes-logique.js` (pur) : `appliquer(etat, op)` valide et applique ; `vue`, `rechercher`, `purger`, `versMarkdown`, `normaliser`.
- `notes-ipc.js` : état en mémoire, chargé au démarrage. IPC `notes:lire` (vue sans texte complet), `notes:note(id)`, `notes:chercher(q)`, `notes:op(op)`, `notes:exporter(cible)`.
- Opérations : `creerNote`, `modifierNote`, `epinglerNote`, `deplacerNote`, `supprimerNote`, `creerProjet`, `renommerProjet`, `supprimerProjet`, `creerDossier`, `renommerDossier`, `supprimerDossier`, `restaurer`. La page n'envoie jamais l'état entier.
- Supprimer un projet ou un dossier met son contenu vivant à la corbeille avec la même date ; « restaurer » le ramène ensemble. Note restaurée dont le parent est à la corbeille : Boîte de réception.
- Import `.txt` / `.md` (`notes-import.js`) : `notes:importer(lieu)` (boîte de dialogue, sélection multiple) et `notes:importerContenus(lieu, fichiers)` (glisser-déposer : le rendu lit les octets, le main revalide tout). Une note par fichier, titre = nom sans extension (ajouté en tête du texte s'il n'y figure pas déjà). UTF-8 (BOM retiré) sinon Windows-1252. Refus signalés, jamais de coupe : plus de 1 Mo (taille vérifiée avant lecture), plus de 100 000 caractères (titre compris), vide, binaire/UTF-16, autre extension, plus de 5000 notes, plus de 100 fichiers par lot. Un seul enregistrement par lot ; fichiers sources en lecture seule. Résumé « N importées, M ignorées (raison : fichiers) ».
- Export `.md` (Boîte, projet ou dossier) : dossier choisi par `dialog.showOpenDialog` ; fichier existant jamais écrasé (suffixe `-2`, `-3`…).

## 4. Interface (`src/gestion.html`, `src/notes.js`, `src/gestion.css`)
- Onglet « Notes » après « Courrier ». Deux colonnes : à gauche « + Nouvelle note », recherche, sélecteur « Dossier » (Toutes les notes par défaut, Sans dossier, projets, dossiers, Corbeille), menu « Organiser » replié (nouveau projet, nouveau dossier, renommer, exporter, supprimer), liste (titre, début, date ; la plus récente en haut, épinglées d'abord), « Importer des fichiers texte… » ; à droite la zone de texte, toujours visible.
- À l'ouverture de l'onglet ou d'un dossier : la note la plus récente s'ouvre ; sans note, la première frappe crée la note dans le dossier choisi. Ctrl+N : nouvelle note (si une note vide est déjà ouverte, simple focus). Enregistrement automatique 400 ms après la dernière frappe, et à la sortie du champ.
- « Déplacer vers… » (liste déroulante), Épingler (`aria-pressed`), Supprimer avec « Annuler » visible 15 s, corbeille avec « Restaurer ».
- Glisser-déposer de .txt / .md n'importe où dans l'onglet (File API, aucun réseau) ; le bouton fait la même chose. Les notes importées vont dans le dossier choisi.
- Renommer / nouveau dossier : champ en ligne, Entrée valide, Échap annule. Recherche plein texte (tous les mots, sans casse ni accents).
- Accessibilité : boutons natifs, `details` natif pour « Organiser », `aria-current` sur la note ouverte, `role="status"` pour l'état et les annonces. Aucune animation. Thème : variables existantes. CSP inchangée.

## 5. Tests
- `test/notes.test.js` : titre, hiérarchie, déplacement validé, refus (type, nom vide, texte trop long, 5000 notes), corbeille et purge, épinglage, export, normalisation, écriture atomique, `.bak`, corruption avec et sans sauvegarde.
- `test/notes-import.test.js` : UTF-8, BOM, Windows-1252, trop gros, trop long, vide, binaire, mauvais format, maximum de notes, lot de 100, lieu inconnu, lecture seule sur disque, début de note.
- `test/demarrage.test.js` : `notes.json` corrompu au démarrage ; `KINAN_TEST_ONGLET=notes` ouvre Gestion sur Notes, Ctrl+N + saisie, vérifie `notes.json` et `.bak`.
