// Légende des animations. Contenu statique, texte inséré en textContent.
'use strict';
// [icône, titre, explication]. Icône : { ex: [agent, état] } (petit portrait) ou { p: 'texte', c: 'classe de couleur' }.
const SECTIONS = [
  ['États', [
    [{ ex: ['skyze', 'repos'] }, 'Repos', 'Il respire doucement, cligne des yeux et fait des « zzz ».'],
    [{ ex: ['skyze', 'travail'] }, 'Travail', 'Il tape au clavier, l\'écran défile, et de temps en temps il réfléchit (bulle « … »).'],
    [{ p: '?', c: 'c-doute' }, 'Doute', 'Un « ? », un sourcil levé et une pastille jaune : il attend une réponse.'],
    [{ p: '!', c: 'c-erreur' }, 'Erreur', 'Il tremble, un « ! » et une goutte de sueur apparaissent. Le rouge disparaît après 20 secondes.']
  ]],
  ['Changements d\'état', [
    [{ p: '↑', c: 'c-travail' }, 'Petit saut', 'À chaque changement, l\'agent fait un petit saut et une bulle apparaît puis s\'efface.'],
    [{ p: '~', c: 'c-repos' }, 'Écran', 'La couleur de l\'écran change en douceur selon l\'état.']
  ]],
  ['Clones', [
    [{ p: '×2', c: 'c-violet' }, 'Clone / exemplaire multiple', 'Le même agent travaille sur plusieurs tâches à la fois : une petite réplique translucide avec son mini-bureau apparaît près de lui (3 au maximum, puis « +N »), et un badge ×2 (×3…) s\'affiche sur sa plaque et sa carte. Clic sur l\'agent : la liste des exemplaires.']
  ]],
  ['Réactions', [
    [{ p: '◔', c: 'c-or' }, 'On se regarde', 'Quand un agent se met au travail, les autres le regardent, même ceux qui dorment.'],
    [{ ex: ['kinan', 'travail'] }, 'Coup de marteau', 'Kinan donne un coup de marteau quand un agent se met au travail.']
  ]],
  ['Détails propres aux agents', [
    [{ ex: ['johms', 'travail'] }, 'Troisième siège', 'Une aura violette et des étincelles autour de lui.'],
    [{ ex: ['quatre', 'travail'] }, 'Quatrième siège', 'Des enveloppes s\'envolent quand il travaille.'],
    [{ ex: ['kinan', 'repos'] }, 'Kinan', 'Un marteau et une balance dorée sur son bureau.'],
    [{ ex: ['cinq', 'travail'] }, 'Cinquième siège', 'Des papiers s\'empilent quand il travaille.']
  ]],
  ['Décor', [
    [{ p: 'o', c: 'c-bleu' }, 'Ciel', 'Il suit l\'heure réelle : jour, soir, nuit.'],
    [{ p: '◷', c: 'c-gris' }, 'Horloge', 'Elle donne l\'heure de l\'ordinateur.'],
    [{ p: '*', c: 'c-or' }, 'Guirlande', 'Elle scintille doucement.'],
    [{ p: '~', c: 'c-gris' }, 'Tasses', 'Elles fument sur les bureaux.'],
    [{ p: 'Y', c: 'c-vert' }, 'Plante', 'Elle bouge très légèrement.']
  ]]
];

const racine = document.getElementById('contenu');
for (const [titre, lignes] of SECTIONS) {
  const h = document.createElement('h2'); h.textContent = titre; racine.append(h);
  for (const [icone, nom, texte] of lignes) {
    const ligne = document.createElement('div'); ligne.className = 'ligne';
    let ic;
    if (icone.ex) {
      ic = document.createElement('canvas'); ic.className = 'ex'; ic.width = 24; ic.height = 24;
      try { window.Avatars.dessinerAvatar(ic, icone.ex[0], icone.ex[1]); } catch { /* sans exemple */ }
    } else { ic = document.createElement('div'); ic.className = 'pastille ' + icone.c; ic.textContent = icone.p; }
    const t = document.createElement('div');
    const b = document.createElement('b'); b.textContent = nom;
    const s = document.createElement('span'); s.textContent = texte;
    t.append(b, s); ligne.append(ic, t); racine.append(ligne);
  }
}
