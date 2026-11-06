// Avatars des agents (pixel art dessiné en code). Partagé par le bureau (scene.js) et la fenêtre de détail (agent.js).
// Aucune image, aucun réseau. Expose window.Avatars.
(() => {
  'use strict';
  const K = '#1d1729';          // contour
  const OEIL = '#21182b';
  const OR = '#ffd24a', OR_O = '#d99a22', OR_C = '#fff1a8';
  let g = null;                // contexte courant (fixé par corps())

  // --- primitives ---
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const px = (x, y, c) => r(x, y, 1, 1, c);
  function ovale(cx, cy, rx, ry, c, j0, j1) {
    g.fillStyle = c;
    const a = j0 === undefined ? -ry : Math.max(-ry, j0), b = j1 === undefined ? ry : Math.min(ry, j1);
    for (let j = a; j < b; j++) {
      const v = (j + 0.5) / ry;
      const d = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
      if (d > 0) g.fillRect(Math.round(cx - d), Math.round(cy + j), d * 2, 1);
    }
  }
  function blocs(liste, c, contour = K) {
    for (const [x, y, w, h] of liste) r(x - 1, y - 1, w + 2, h + 2, contour);
    for (const [x, y, w, h] of liste) r(x, y, w, h, c);
  }

  // --- apparence de chaque agent ---
  const PROFILS = {
    drafion: { rx: 9, ry: 9, coul: '#ffd04d', ombre: '#ee9c2e', clair: '#fff4b8', joue: '#ff8f5a' },
    kinan: { rx: 11, ry: 11, coul: '#f7cba3', ombre: '#dc9c74', clair: '#fff0dc', joue: '#f08b8b' },
    skyze: { rx: 10, ry: 10, coul: '#62adff', ombre: '#3a74dc', clair: '#cfe8ff', joue: '#ff8fb0' },
    johms: { rx: 11, ry: 11, coul: '#a874ff', ombre: '#7445d8', clair: '#e6d4ff', joue: '#ff8fc8' },
    quatre: { rx: 10, ry: 10, coul: '#55d39c', ombre: '#2f9f74', clair: '#cbf8e4', joue: '#ff9a9a' },
    cinq: { rx: 11, ry: 11, coul: '#f5f3fa', ombre: '#c8c1d8', clair: '#ffffff', joue: '#ffa3ad', visageY: -1 }
  };

  function visage(a, cx, cy, ex) {
    const o = a.rx >= 11 ? 3 : 2;
    const lx = ex.lx || 0, ly = ex.ly || 0;
    cy += a.visageY || 0;
    const xg = cx - o - 2 + lx, xd = cx + o + lx, y = cy - 2 + ly;
    const oeil = (x, type, droit) => {
      if (type === 'ouvert') { r(x, y, 2, 3, OEIL); px(x, y, '#ffffff'); }
      else if (type === 'grand') { r(x, y - 1, 2, 4, OEIL); px(x, y - 1, '#ffffff'); px(x + 1, y + 1, '#ffffff'); }
      else if (type === 'cligne') r(x, y + 2, 2, 1, OEIL);
      else if (type === 'dort') { px(x - 1, y + 1, OEIL); r(x, y + 2, 2, 1, OEIL); px(x + 2, y + 1, OEIL); }
      else if (type === 'erreur') {
        if (!droit) { px(x, y, OEIL); px(x + 1, y + 1, OEIL); px(x, y + 2, OEIL); }
        else { px(x + 1, y, OEIL); px(x, y + 1, OEIL); px(x + 1, y + 2, OEIL); }
      }
    };
    oeil(xg, ex.yeux, false); oeil(xd, ex.yeux, true);
    if (ex.sourcil) { r(xg - 1, y - 3, 3, 1, OEIL); px(xd + 2, y - 1, OEIL); r(xd, y - 2, 2, 1, OEIL); }
    // joues
    r(cx - o - 4, cy + 1, 2, 1, a.joue); r(cx + o + 2, cy + 1, 2, 1, a.joue);
    // bouche
    const mx = cx - 2 + lx, my = cy + 2;
    const b = ex.bouche;
    if (b === 'sourire') { px(mx, my, OEIL); px(mx + 3, my, OEIL); r(mx + 1, my + 1, 2, 1, OEIL); }
    else if (b === 'o') { r(mx + 1, my, 2, 2, OEIL); px(mx + 1, my + 1, '#e86a7a'); }
    else if (b === 'vague') { px(mx, my + 1, OEIL); px(mx + 1, my, OEIL); px(mx + 2, my + 1, OEIL); px(mx + 3, my, OEIL); }
    else if (b === 'doute') { r(mx, my + 1, 2, 1, OEIL); r(mx + 2, my, 2, 1, OEIL); }
    else if (b === 'dort') r(mx + 1, my + 1, 2, 1, '#7a5a6a');
    else r(mx + 1, my + 1, 2, 1, OEIL);
  }

  const DEVANT = {
    kinan(a, cx, cy) { // robe noire et jabot
      ovale(cx, cy, a.rx, a.ry, '#2b2638', 5, a.ry);
      ovale(cx, cy, a.rx, a.ry, '#38324a', 5, 6);
      r(cx - 3, cy + 5, 6, 1, '#ffffff'); r(cx - 2, cy + 6, 4, 2, '#ffffff'); r(cx - 1, cy + 8, 2, 1, '#ffffff');
      px(cx - 3, cy + 5, '#d8d2e2'); px(cx + 2, cy + 5, '#d8d2e2'); px(cx, cy + 7, '#d8d2e2');
    },
    cinq(a, cx, cy) { // col et cravate rouge
      ovale(cx, cy, a.rx, a.ry, '#e2dcec', 4, a.ry); ovale(cx, cy, a.rx, a.ry, '#bdb5cf', 4, 5);
      px(cx - 4, cy + 4, '#8f86a6'); px(cx - 3, cy + 5, '#8f86a6'); px(cx - 2, cy + 6, '#8f86a6');
      px(cx + 3, cy + 4, '#8f86a6'); px(cx + 2, cy + 5, '#8f86a6'); px(cx + 1, cy + 6, '#8f86a6');
      r(cx - 1, cy + 6, 2, 1, '#a8232f'); r(cx - 1, cy + 7, 2, 1, '#e5484d'); r(cx - 2, cy + 8, 4, 1, '#e5484d'); px(cx, cy + 7, '#ff8a8f');
    }
  };

  const TETE = {
    drafion(a, cx, cy) {
      const top = cy - a.ry - 1;
      blocs([[cx - 3, top - 1, 2, 2], [cx - 1, top - 3, 2, 4], [cx + 1, top - 5, 2, 3], [cx + 3, top - 6, 1, 2]], '#ff8a3d');
      px(cx - 1, top - 3, '#ffc07a'); px(cx + 1, top - 5, '#ffc07a');
    },
    skyze(a, cx, cy) {
      const top = cy - a.ry - 1;
      blocs([[cx - 7, top - 1, 13, 3], [cx + 3, top + 1, 5, 2], [cx - 2, top - 3, 2, 2]], '#2f4f99');
      r(cx - 6, top - 1, 10, 1, '#4b6fc4'); px(cx - 2, top - 3, '#4b6fc4');
      px(cx + 6, top + 2, '#ff8fb0'); // tache de peinture
    },
    johms(a, cx, cy) {
      const top = cy - a.ry - 1;
      blocs([[cx - 5, top - 2, 10, 3], [cx - 5, top - 4, 2, 2], [cx - 1, top - 5, 2, 3], [cx + 3, top - 4, 2, 2]], OR, '#5a3a10');
      r(cx - 5, top, 10, 1, OR_O); px(cx - 5, top - 4, OR_C); px(cx - 1, top - 5, OR_C); px(cx + 3, top - 4, OR_C);
      r(cx - 1, top - 1, 2, 1, '#ff5d7a'); px(cx - 4, top - 1, '#7ad7ff'); px(cx + 3, top - 1, '#7ad7ff');
    },
    quatre(a, cx, cy) {
      const R = a.rx + 1;
      for (let x = -R + 1; x < R - 1; x++) {
        const v = (x + 0.5) / (R + 0.5);
        const y = Math.round(cy - (a.ry + 1) * Math.sqrt(1 - v * v)) - 1;
        px(cx + x, y - 1, K); px(cx + x, y, '#4a4563');
      }
      blocs([[cx - a.rx - 3, cy - 3, 3, 6], [cx + a.rx, cy - 3, 3, 6]], '#4a4563');
      r(cx - a.rx - 3, cy - 3, 1, 6, '#6c6690'); r(cx + a.rx + 2, cy - 3, 1, 6, '#6c6690');
      px(cx + a.rx - 1, cy + 3, '#4a4563'); px(cx + a.rx - 2, cy + 4, '#4a4563'); r(cx + 3, cy + 5, a.rx - 5, 1, '#4a4563');
      r(cx + 2, cy + 4, 2, 2, '#2a2638');
    },
    kinan(a, cx, cy) {
      const ry = a.ry;
      const boucles = [[-7, -ry + 2, 3, 2], [-3, -ry, 3, 2], [2, -ry, 3, 2], [6, -ry + 2, 3, 2],
        [-a.rx, -5, 3, 2], [-a.rx - 1, -1, 3, 2], [-a.rx - 1, 3, 3, 2], [a.rx, -5, 3, 2], [a.rx + 1, -1, 3, 2], [a.rx + 1, 3, 3, 2],
        [-a.rx + 2, -ry + 4, 3, 2], [a.rx - 2, -ry + 4, 3, 2]];
      boucles.forEach(([dx, dy, bx, by]) => ovale(cx + dx, cy + dy, bx + 1, by + 1, K));
      ovale(cx, cy - ry + 3, a.rx - 2, 3, '#f7f4ee');
      boucles.forEach(([dx, dy, bx, by]) => ovale(cx + dx, cy + dy, bx, by, '#f7f4ee'));
      boucles.forEach(([dx, dy]) => { px(cx + dx, cy + dy + 1, '#cfc8bb'); px(cx + dx - 1, cy + dy + 1, '#e2dcd0'); });
      ovale(cx, cy - ry + 5, a.rx - 4, 1, '#f7f4ee');
    },
    cinq(a, cx, cy) {
      const ry = a.ry;
      ovale(cx, cy, a.rx, ry, '#2b2633', -ry, -ry + 3);
      ovale(cx, cy, a.rx, ry, '#2b2633', -ry + 3, -ry + 4);
      r(cx + 1, cy - ry + 3, 7, 1, '#2b2633');
      r(cx - 6, cy - ry, 5, 1, '#4d465c'); px(cx, cy - ry + 1, '#f5f3fa');
    }
  };

  function corps(a, cx, cy, ex) {
    const { rx, ry } = a;
    ovale(cx, cy, rx + 1, ry + 1, K);
    ovale(cx, cy, rx, ry, a.ombre);
    ovale(cx - 1, cy - 1, rx - 1, ry - 1, a.coul);
    const hx = cx - Math.round(rx * 0.55), hy = cy - Math.round(ry * 0.62);
    r(hx - 1, hy, 3, 1, a.clair); px(hx - 2, hy + 1, a.clair); px(hx - 2, hy + 2, a.clair);
    if (DEVANT[a.cle]) DEVANT[a.cle](a, cx, cy);
    visage(a, cx, cy, ex);
    if (TETE[a.cle]) TETE[a.cle](a, cx, cy, ex);
  }

  // Dessine le corps complet d'un agent sur le contexte ctx (a : profil avec .cle, rx, ry, couleurs).
  function corpsSur(ctx, a, cx, cy, ex) { g = ctx; corps(a, cx, cy, ex); }

  // Portrait 24x24 : cle de l'agent, état 'repos' | 'travail' | 'erreur' | 'doute'.
  function dessinerAvatar(canvas, cle, etat) {
    const p = PROFILS[cle];
    if (!p) return;
    const a = { cle, ...p };
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    const ex = { yeux: 'ouvert', bouche: 'sourire', lx: 0, ly: 0 };
    if (etat === 'erreur') { ex.yeux = 'erreur'; ex.bouche = 'vague'; }
    else if (etat === 'doute') { ex.bouche = 'doute'; ex.sourcil = true; ex.ly = -1; }
    else if (etat === 'repos') { ex.yeux = 'dort'; ex.bouche = 'dort'; }
    else ex.bouche = 'plat';
    const cy = 12 + a.ry - 9 + (cle === 'johms' ? 2 : 0) + (cle === 'drafion' ? 2 : 0);
    corpsSur(c, a, 12, cy + 1, ex);
  }

  window.Avatars = { PROFILS, corps: corpsSur, dessinerAvatar };
})();
