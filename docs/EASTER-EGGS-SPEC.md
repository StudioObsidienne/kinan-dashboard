# Easter eggs du bureau : spécification

Statut : spec, rien n'est codé. Périmètre : `kinan-dashboard/src`. Le bureau est le canvas 2D `#toile` (400x270) dessiné par `scene.js` (IIFE fermé).

## 0. Règles absolues

- Zéro réseau : aucun `fetch`, `XMLHttpRequest`, `WebSocket`, `<img src=http…>`, police ou son distant. Sons synthétisés en Web Audio.
- Aucune écriture dans `state.json` ni aucun appel IPC d'écriture (`window.kinan.*` sauf `surEtat` en lecture).
- Aucune modification de l'état d'un agent : les modules lisent une copie gelée (`Object.freeze`), jamais l'objet `etats` de la scène.
- Stockage : uniquement `localStorage`, clés préfixées `kinan-os.egg.` (ne jamais toucher `kinan-os.eco-vu` ni les autres clés).
- `prefers-reduced-motion` (ou `?calme=1`) : pas de tremblement, pas de calque animé ; les effets deviennent un état fixe (ex. Drafion endormi = yeux fermés + « Z » immobile).
- Un module qui lève une erreur est désactivé seul (try/catch) ; la scène continue.
- Pas de coût hors visibilité : tout minuteur s'arrête quand `document.hidden`.

## 1. Lignes minimales à ajouter dans `scene.js`

Trois ajouts, rien d'autre.

1. Exposition (à côté de `window.KinanEquipe`, l.115) : compléter l'objet existant sans casser `boutons.js`.
   ```js
   window.KinanEquipe = { SIEGE_DE, ID_DE,
     agents: () => CLES.map((k) => ({ cle: k, cx: AGENTS[k].cx, haut: AGENTS[k].haut, s: AGENTS[k].s })),
     etat: (k) => (etats[k] ? { ...etats[k] } : null),
     calme: () => calme,
     objets: { horloge: [x, y, w, h], plante: [130, 152, w, h], lampadaire: [260, 97, 18, 11],
               tasse: [...], enseigne: [...] }, // boîtes en pixels canvas, relevées dans chaque fonction de dessin
     surDessin: (fn) => { superposes.push(fn); } };
   ```
   Les boîtes des objets (horloge l.358, plante l.382, lampadaire l.407, moniteur l.485 par agent, tasse l.528, enseigne l.838) sont des constantes relevées à la main dans le code de dessin ; le moniteur se déduit de `a.cx + a.s * 25, a.haut`.
2. Hook de dessin superposé : `const superposes = [];` en tête, puis à la fin de `dessiner(t)` (l.874) :
   ```js
   for (const fn of superposes) { try { fn(ctx, t); } catch (e) { superposes.splice(superposes.indexOf(fn), 1); } }
   ```
   Le hook dessine dans le même contexte, après la scène, donc profite déjà de la pause `visibilitychange` (l.1200) et de la cadence 30 i/s ou 1 i/s en mode calme.
3. Repaint à la demande : `KinanEquipe.salir = () => { sale = true; }` pour qu'un module force une image.

## 2. Socle `src/egg-core.js`

Chargé dans `index.html` juste après `<script src="scene.js">` ; chaque module `src/eggs/<nom>.js` après lui. Expose `window.KinanEgg`.

| API | Rôle |
|---|---|
| `KinanEgg.module(nom, init)` | Enregistre un module ; `init(api)` est appelé dans un try/catch ; une exception désactive ce module et l'inscrit dans `console.warn`. |
| `api.etats()` | Copie gelée `{ cle: { etat, depuis } }` (etat ∈ `repos`/`travail`/`erreur`/`doute`). |
| `api.surChangement(fn)` | Appelé à chaque `surEtat` (le socle s'abonne une fois à `window.kinan.surEtat` et diffuse) avec `(cle, avant, apres, maintenant)`. |
| `api.zone(nom, boite, {clic, survol})` | Zone cliquable en pixels canvas ; le socle convertit les coordonnées souris (`getBoundingClientRect`, échelle CSS) ; curseur `pointer` au survol ; doublée d'un bouton invisible focalisable (Tab + Entrée) pour l'accessibilité. |
| `api.stock.get(k, defaut)` / `set(k, v)` | JSON dans `localStorage['kinan-os.egg.' + nom + '.' + k]`, try/catch, valeur par défaut si indisponible. |
| `api.son(recette)` | Web Audio (oscillateur + enveloppe), `AudioContext` créé au premier geste utilisateur ; mute global `kinan-os.egg.muet` (défaut : muet) ; refusé si `document.hidden`. |
| `api.bulle(cle, texte, ms)` | Bulle de dialogue au-dessus d'un agent, dessinée via `surDessin` dans le style de `bulle()` (l.696) ; texte aussi poussé dans une région `aria-live="polite"` cachée. |
| `api.calque()` | `<canvas>` plein écran `pointer-events:none`, créé à la demande, retiré après l'effet ; jamais en mode calme. |
| `api.dessin(fn)` | Raccourci vers `KinanEquipe.surDessin`. |
| `api.horloge()` | `Date.now()` multiplié par la vitesse de test (section 4). Tous les modules l'utilisent, jamais `Date.now()` direct. |
| `api.visible(fn)` | Rappel sur `visibilitychange` ; le socle suspend tous les `setInterval` enregistrés via `api.minuteur(fn, ms)`. |

## 3. Modules

### 3.1 `drafion-sommeil` (détaillé)

Logique pure dans `src/eggs/sommeil-logique.js` (UMD : `module.exports` en Node, `window.SommeilLogique` en navigateur), sans DOM.

- Inactivité de Drafion = `maintenant - dernierNonRepos`, où `dernierNonRepos` est l'horodatage `Date.now()` du dernier état ≠ `repos` vu pour Drafion. Calculée à part, sans toucher l'état de la scène.
- Mise à jour : à chaque `surChangement` de `drafion` vers ou depuis un état non-repos, `dernierNonRepos = maintenant` ; persistée dans `kinan-os.egg.drafion-sommeil.dernier` pour survivre à un rechargement. Absente au démarrage : `dernierNonRepos = maintenant` (pas de sommeil instantané).
- Paliers (`palier(inactifMs)`) : `< 10 min` éveillé (0) ; `10–20` somnole (1, paupières mi-closes) ; `20–30` dort (2, yeux fermés, bulle « z ») ; `≥ 30` sommeil profond (3, tête basse, bulle « Zzz »).
- Ronflement : au palier ≥ 2, un son toutes les 10 min d'inactivité (`ronflementDu(inactifMs, dernierRonflementMs)` renvoie vrai si un multiple de 10 min a été franchi depuis le dernier) ; jamais si muet ou masqué.
- Respiration : `respiration(tMs)` = sinus de période 4 s (0..1) ; pilote à la fois le décalage vertical de 1 px du torse et l'échelle de la bulle, donc synchrones. Mode calme : valeur fixe 0,5.
- Réveil : dès un état non-repos, palier 0 ; transition `reveil(dtMs)` sur 600 ms (yeux qui s'ouvrent, bulle qui s'efface, lissage identique à `lisse()`) ; mode calme : instantané.
- Dessin : uniquement via `api.dessin`, par-dessus Drafion (coordonnées de `KinanEquipe.agents()`).

### 3.2 `fouet`
Responsabilité : clic sur un agent en `travail` donne un claquement visuel et sonore ; l'agent montre un petit sursaut (dessin superposé seulement). Interface : `api.zone` par agent, `api.son`, `api.bulle`. Limite : 1 par 5 s par agent. Aucun effet sur l'état réel.

### 3.3 `objets`
Responsabilité : réactions locales aux clics sur horloge, plante, lampadaire, moniteur, tasse, enseigne (ex. la plante pousse d'un pixel par jour de clic, compteur stocké). Interface : `api.zone(nom, KinanEquipe.objets[nom])`, `api.stock`, `api.dessin`.

### 3.4 `chasse`
Responsabilité : collection d'objets cachés débloqués par les autres modules ; inventaire persistant, aucune récompense en dehors du bureau. Interface : `KinanEgg.trouver(id)` appelé par les modules, `api.stock` (`kinan-os.egg.chasse.trouves`), panneau d'inventaire ouvert au clavier.

### 3.5 `jean`
Responsabilité : petits clins d'œil liés à Jean (salut à l'ouverture selon l'heure, anniversaire de l'installation) ; textes fixes écrits dans le module, aucun témoignage ni chiffre inventé. Interface : `api.bulle('kinan', …)`, `api.stock` (date de première ouverture), `api.horloge`.

### 3.6 `personnalisation`
Responsabilité : réglages des eggs (mute global, désactivation par module, réinitialisation des clés `kinan-os.egg.*`). Interface : lit et écrit `kinan-os.egg.muet` et `kinan-os.egg.<nom>.actif` ; le socle consulte `actif` avant `init`.

## 4. Mode de test accéléré

- `?egg-vitesse=60` : `api.horloge()` renvoie `t0 + (Date.now() - t0) * 60`, donc 10 min réelles d'inactivité = 10 s. Plage acceptée 1..600, sinon 1.
- `?egg-vitesse=60&egg-reset=1` : efface `kinan-os.egg.*` au chargement pour repartir éveillé.
- En mode accéléré, une étiquette discrète « egg x60 » s'affiche en coin (dessinée via `api.dessin`), pour ne jamais confondre avec le mode normal.
- Vérification manuelle attendue : Drafion au repos, palier 1 à 10 s, 2 à 20 s (premier ronflement), 3 à 30 s, ronflement suivant à 40 s ; passer Drafion en `travail` le réveille en 600 ms.

## 5. Tests `node --test` (dans `test/`, lancés par `npm test`)

`test/sommeil.test.js`, sur `src/eggs/sommeil-logique.js`, sans DOM :
- `palier` : 0 à 9 min 59 s, 1 à 10 min, 2 à 20 min, 3 à 30 min et au-delà ; inactivité négative (horloge reculée) traitée comme 0.
- Inactivité : un passage `travail` puis `repos` remet le compteur à l'heure de sortie du dernier non-repos ; plusieurs `repos` successifs ne le remettent pas.
- `ronflementDu` : faux avant 20 min ; vrai une fois à 20, 30, 40 min ; jamais deux fois pour le même multiple.
- `respiration` : période 4 s, valeurs dans [0, 1] ; mode calme constant.
- `reveil` : 0 à 0 ms, 1 à 600 ms, monotone.
- Vitesse : `horlogeAcceleree(t0, maintenant, 60)` multiplie bien l'écart ; vitesse invalide ramenée à 1.

`test/egg-core.test.js` (avec faux `localStorage` minimal) : préfixe `kinan-os.egg.` appliqué, `get` renvoie le défaut si la clé est corrompue ou si `localStorage` lève ; un module qui lève dans `init` n'empêche pas les suivants.

Contrôle statique dans le même fichier : aucun fichier `src/egg-core.js` / `src/eggs/*.js` ne contient `fetch(`, `XMLHttpRequest`, `WebSocket`, `state.json`, `http://`, `https://`.

## 6. Critères de réussite

- `npm test` vert ; aucune requête réseau nouvelle (onglet Réseau vide après chargement).
- Supprimer `egg-core.js` et les modules laisse le bureau identique à aujourd'hui.
- Avec `?calme=1`, aucun mouvement ajouté ; tout reste utilisable au clavier.
