// Fenêtre « question ». Texte reçu inséré en textContent uniquement.
'use strict';

// Portrait pixel art de Kinan : perruque blanche, robe noire.
const PIXELS = [
  '....WWWWWWWW....',
  '..WWWWWWWWWWWW..',
  '.WWGWWWWWWWWGWW.',
  '.WWWWSSSSSSWWWW.',
  '.WGWSSSSSSSSWGW.',
  '.WWWSESSSSESWWW.',
  '.GWWSSSSSSSSWWG.',
  '.WWWSSSMMSSSWWW.',
  '..GWWSSSSSSWWG..',
  '...WWKKKKKKWW...',
  '..KKKKWWWWKKKK..',
  '.KKKKKKWWKKKKKK.',
  'KKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKK'
];
const COULEURS = { W: '#f4f1fa', G: '#c9c4da', S: '#f1c9a5', E: '#1b1626', M: '#b5686a', K: '#262233' };
const ctx = document.getElementById('portrait').getContext('2d');
PIXELS.forEach((ligne, y) => [...ligne].forEach((c, x) => {
  if (COULEURS[c]) { ctx.fillStyle = COULEURS[c]; ctx.fillRect(x, y, 1, 1); }
}));

document.getElementById('fermer').addEventListener('click', () => window.question.fermer());
const son = document.getElementById('son');
son.addEventListener('change', () => window.question.reglerSon(son.checked));

window.question.surDonnees((d) => {
  document.getElementById('texte').textContent = d.texte || '';
  document.querySelector('.qui').textContent = 'Kinan a une question' + (d.session ? ' · ' + d.session : '');
  document.getElementById('options').replaceChildren(...(d.options || []).map((o) => {
    const s = document.createElement('span'); s.className = 'pastille'; s.textContent = o; return s;
  }));
  son.checked = d.son !== false;
});
