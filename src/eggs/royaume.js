// Paramètres du royaume (logique : royaume-logique.js). Ouvert par l'évènement 'kinan-egg-royaume' (bouton de jean.js) ou ?egg-royaume=1 (test).
// Ne change que la présentation du bureau : agents affichés, objets par écran, décoration, glisser-déposer libre, thèmes, ambiances, particules.
// Jamais d'agents, d'états, de réseau ni d'IPC. Configuration enregistrée dans localStorage['kinan-os.egg.royaume'] et rechargée au démarrage.
// Le décor fixe passe par les crochets KinanEquipe.deco de scene.js ; les effets (ambiance, particules, lueur) par une couche de dessin superposée.
(function () {
  'use strict';
  if (!window.KinanEgg || !window.RoyaumeLogique) return;
  const L = window.RoyaumeLogique;

  window.KinanEgg.module('royaume', (api) => {
    const eq = window.KinanEquipe, doc = document;
    const D = eq && eq.deco;
    if (!D || !eq.dim) throw new Error('crochets de décor absents');
    const { W, H, DY } = eq.dim;
    const avertir = (quoi, e) => { try { console.warn('KinanEgg royaume ' + quoi + ' :', e && e.message); } catch { /* ignoré */ } };
    const agents = () => { try { return eq.agents(); } catch { return []; } };

    // ---- stockage : une seule clé, try/catch partout ----
    function lire() { try { return window.localStorage ? window.localStorage.getItem(L.CLE) : null; } catch { return null; } }
    function ecrire(v) { try { if (window.localStorage) window.localStorage.setItem(L.CLE, v); } catch { /* stockage indisponible : réglages valables pour la session */ } }
    function effacer() { try { if (window.localStorage) window.localStorage.removeItem(L.CLE); } catch { /* ignoré */ } }

    let cfg = L.deserialiser(lire(), agents());
    function sauver() { if (L.estDefaut(cfg)) effacer(); else ecrire(L.serialiser(cfg)); }

    // ---- primitives de dessin (pixels de scène) ----
    const K = '#1d1729';
    const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
    const bloc = (c, x, y, w, h, col, contour) => { rect(c, x - 1, y - 1, w + 2, h + 2, contour || K); rect(c, x, y, w, h, col); };
    function ovale(c, cx, cy, rx, ry, col) {
      c.fillStyle = col;
      for (let j = -ry; j < ry; j++) {
        const v = (j + 0.5) / ry, d = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
        if (d > 0) c.fillRect(Math.round(cx - d), Math.round(cy + j), d * 2, 1);
      }
    }
    const alea = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const hexRvb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

    // ---- A. plantes (boîte 26 x 32 autour de bx = 130, by = 152) ----
    function pot(c, bx, by) {
      bloc(c, bx - 7, by - 6, 14, 3, '#d9804f'); rect(c, bx - 6, by - 3, 12, 9, '#c4683f'); rect(c, bx - 6, by - 3, 12, 1, '#9c4e2e');
      rect(c, bx + 3, by - 2, 2, 7, '#a9573a'); rect(c, bx - 6, by + 6, 12, 1, '#7a3e26');
    }
    const PLANTES = {
      cactus(c, t, bx, by) {
        const G1 = '#4fae6e', G2 = '#3f9460', O = '#1f3a2c';
        bloc(c, bx - 8, by - 17, 3, 6, G2, O); bloc(c, bx - 8, by - 11, 6, 3, G2, O);
        bloc(c, bx + 5, by - 14, 3, 5, G2, O); bloc(c, bx + 2, by - 9, 6, 3, G2, O);
        bloc(c, bx - 3, by - 21, 6, 15, G1, O); rect(c, bx - 3, by - 21, 1, 15, '#86d496');
        for (const [dx, dy] of [[1, -18], [-1, -14], [1, -10], [-7, -15], [6, -12]]) rect(c, bx + dx, by + dy, 1, 1, '#d8f0c8');
        rect(c, bx - 1, by - 23, 3, 2, '#ff9fb2'); rect(c, bx, by - 24, 1, 1, '#ffe27a');
        pot(c, bx, by);
      },
      fleurs(c, t, bx, by) {
        const calme = api.calme();
        [[-4, 11, '#ff6b8a'], [0, 14, '#ffd166'], [4, 12, '#c9a2ff']].forEach(([dx, len, col], i) => {
          const off = calme ? 0 : Math.round(Math.sin(t / 1700 + i * 1.3));
          rect(c, bx + dx, by - 6 - len, 1, len, '#3d7a4e');
          rect(c, bx + dx - 2, by - 9 - (i % 2) * 2, 2, 1, '#4fae6e'); rect(c, bx + dx + 1, by - 11 + (i % 2), 2, 1, '#3f9460');
          ovale(c, bx + dx + off, by - 6 - len, 3, 3, col); rect(c, bx + dx + off - 1, by - 8 - len, 1, 1, '#ffffff66');
        });
        pot(c, bx, by);
      },
      bonsai(c, t, bx, by) {
        bloc(c, bx - 9, by - 2, 18, 4, '#4a5a78'); rect(c, bx - 9, by - 2, 18, 1, '#6a7aa0'); rect(c, bx - 6, by + 2, 3, 2, K); rect(c, bx + 3, by + 2, 3, 2, K);
        rect(c, bx - 1, by - 9, 3, 7, '#6b4a35'); rect(c, bx + 1, by - 12, 2, 4, '#6b4a35'); rect(c, bx - 3, by - 8, 2, 2, '#6b4a35');
        for (const [dx, dy, rx, ry] of [[-5, -13, 6, 4], [4, -16, 6, 4], [0, -10, 6, 3]]) ovale(c, bx + dx, by + dy, rx + 1, ry + 1, '#1f3a2c');
        [[-5, -13, 5, 3], [4, -16, 5, 3], [0, -10, 5, 2]].forEach(([dx, dy, rx, ry], i) => { ovale(c, bx + dx, by + dy, rx, ry, i === 1 ? '#4fae6e' : '#3f9460'); rect(c, bx + dx - rx + 2, by + dy - 1, rx - 1, 1, '#86d496'); });
        rect(c, bx + 6, by - 16, 1, 1, '#ff9fb2'); rect(c, bx - 8, by - 13, 1, 1, '#ff9fb2');
      },
      palmier(c, t, bx, by) {
        const calme = api.calme(), tx = bx, ty = by - 17;
        rect(c, bx - 1, by - 17, 3, 12, '#7a5a3a'); rect(c, bx - 1, by - 14, 3, 1, '#5a4028'); rect(c, bx - 1, by - 10, 3, 1, '#5a4028');
        [-2.7, -2.2, -1.57, -0.94, -0.44].forEach((a0, i) => {
          const a = a0 + (calme ? 0 : Math.sin(t / 1800 + i * 1.4) * 0.07);
          for (let s = 0; s < 10; s++) {
            const x = tx + Math.cos(a) * s * 1.2, y = ty + Math.sin(a) * s * 1.2 + s * s * 0.07;
            rect(c, x, y, 2, 1, s % 2 ? '#3f9460' : '#4fae6e'); if (s > 1 && s % 3 === 0) rect(c, x, y + 1, 1, 1, '#2f7a50');
          }
        });
        pot(c, bx, by);
      }
    };
    const dessinPlante = (c, t, bx, by) => { const f = PLANTES[cfg.plante]; if (f) f(c, t, bx, by); };

    // ---- A. tableaux (image de 32 x 24 posée dans le cadre d'origine) ----
    const TABLEAUX = {
      montagne(c, x, y) {
        rect(c, x, y, 32, 24, '#7ab8f0'); rect(c, x, y + 9, 32, 7, '#f2b88a'); ovale(c, x + 23, y + 8, 3, 3, '#fff1a8');
        for (let i = 0; i < 32; i++) {
          const h1 = Math.round(15 - Math.abs(i - 10) * 0.95), h2 = Math.round(11 - Math.abs(i - 24) * 0.8);
          if (h2 > 0) rect(c, x + i, y + 24 - h2, 1, h2, '#5a6a9a');
          if (h1 > 0) { rect(c, x + i, y + 24 - h1, 1, h1, '#3f4f7a'); if (h1 >= 12) rect(c, x + i, y + 24 - h1, 1, 2, '#ffffff'); }
        }
        rect(c, x, y + 20, 32, 4, '#2f5a46'); rect(c, x, y + 20, 32, 1, '#4f8a60');
      },
      mer(c, x, y) {
        rect(c, x, y, 32, 24, '#9fd8f5'); ovale(c, x + 6, y + 6, 3, 3, '#fff7c0'); rect(c, x, y + 12, 32, 12, '#2f78b8');
        for (let j = 0; j < 4; j++) rect(c, x, y + 14 + j * 3, 32, 1, j % 2 ? '#3a8ad0' : '#245f96');
        for (let i = 0; i < 6; i++) rect(c, x + 2 + i * 5 + (i % 2) * 2, y + 15 + (i % 3) * 3, 2, 1, '#cfeaff');
        rect(c, x + 16, y + 5, 1, 11, '#5a3a2a');
        for (let j = 0; j < 8; j++) rect(c, x + 17, y + 6 + j, 1 + Math.floor(j * 0.7), 1, '#ffffff');
        for (let j = 0; j < 6; j++) rect(c, x + 15 - Math.floor(j * 0.6), y + 8 + j, Math.floor(j * 0.6) + 1, 1, '#f4f1ea');
        rect(c, x + 11, y + 16, 10, 2, '#8a5a3a'); rect(c, x + 12, y + 18, 8, 1, '#5a3a2a');
      },
      nuit(c, x, y) {
        rect(c, x, y, 32, 24, '#0e1330'); rect(c, x, y + 8, 32, 8, '#16204a');
        for (let i = 0; i < 14; i++) rect(c, x + 1 + alea(i + 5) * 30, y + 1 + alea(i + 25) * 16, 1, 1, i % 4 ? '#fff6d8' : '#a8b4ff');
        ovale(c, x + 23, y + 7, 4, 4, '#fff3c4'); ovale(c, x + 25, y + 6, 3, 3, '#0e1330');
        for (let i = 0; i < 32; i++) { const h = 4 + Math.round(Math.sin(i / 4) * 2 + Math.sin(i / 2.1)); rect(c, x + i, y + 24 - h, 1, h, '#0a0d22'); }
        rect(c, x + 6, y + 16, 1, 1, '#ffd27a'); rect(c, x + 19, y + 17, 1, 1, '#ffd27a');
      },
      abstrait(c, x, y) {
        rect(c, x, y, 32, 24, '#f4f1ea'); rect(c, x, y, 12, 10, '#d6455d'); rect(c, x + 22, y + 11, 10, 13, '#4f7fd8'); rect(c, x + 13, y + 17, 8, 7, '#f2c14e');
        rect(c, x + 22, y, 10, 5, '#1d1729');
        rect(c, x + 12, y, 1, 24, K); rect(c, x, y + 10, 32, 1, K); rect(c, x + 21, y + 10, 1, 14, K); rect(c, x + 13, y + 16, 8, 1, K); rect(c, x + 21, y + 5, 11, 1, K);
      },
      portrait(c, x, y) {
        rect(c, x, y, 32, 24, '#5a7a8a'); rect(c, x, y + 16, 32, 8, '#486878');
        ovale(c, x + 16, y + 21, 11, 7, '#3a3552'); rect(c, x + 14, y + 14, 4, 3, '#d9a98b');
        ovale(c, x + 16, y + 9, 5, 6, '#d9a98b'); ovale(c, x + 16, y + 6, 6, 4, '#2a2236'); rect(c, x + 11, y + 6, 2, 6, '#2a2236'); rect(c, x + 19, y + 6, 2, 6, '#2a2236');
        rect(c, x + 14, y + 9, 1, 1, K); rect(c, x + 18, y + 9, 1, 1, K); rect(c, x + 15, y + 12, 3, 1, '#a05a4a');
        rect(c, x + 14, y + 17, 5, 2, '#f4f1ea');
      }
    };
    const dessinTableau = (c, x, y) => { const f = TABLEAUX[cfg.tableau]; if (!f) return false; f(c, x, y); return true; };

    // ---- A. décors murales ----
    const PALETTES = [['#d6455d', '#f2c14e', '#4f7fd8'], ['#5fae6b', '#f2c14e', '#e07a5f'], ['#a874ff', '#ff9fb2', '#8fd3ff'], ['#e8e2d4', '#4fc2c0', '#f2c14e']];
    const FIL = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 1, 1, 0];
    const MURALES = {
      fanion(c, x, y, p) {
        for (let i = 0; i < 16; i++) rect(c, x + i, y + FIL[i], 1, 1, '#3a2e4a');
        [0, 1, 2].forEach((k) => {
          const x0 = x + 1 + k * 5, y0 = y + FIL[1 + k * 5] + 1;
          [5, 5, 4, 3, 2, 1].forEach((w, j) => rect(c, x0 + (5 - w) / 2, y0 + j, w, 1, p[k]));
          rect(c, x0, y0, 5, 1, '#ffffff44');
        });
      },
      ecusson(c, x, y, p) {
        const larg = [12, 12, 12, 12, 12, 12, 12, 12, 12, 10, 8, 6, 4, 2];
        larg.forEach((w, j) => rect(c, x + (12 - w) / 2, y + j, w, 1, K));
        larg.forEach((w, j) => { if (j > 0 && w > 2) rect(c, x + (12 - w) / 2 + 1, y + j, w - 2, 1, p[0]); });
        rect(c, x + 5, y + 1, 2, 10, p[1]); rect(c, x + 2, y + 4, 8, 2, p[1]); rect(c, x + 5, y + 4, 2, 2, p[2]);
        rect(c, x + 2, y + 1, 8, 1, '#ffffff44');
      },
      cadre(c, x, y, p) {
        rect(c, x, y, 16, 14, K); rect(c, x + 1, y + 1, 14, 12, '#8a6446'); rect(c, x + 1, y + 1, 14, 1, '#b08060');
        rect(c, x + 3, y + 3, 10, 8, p[2] === '#f2c14e' ? '#8fd3ff' : '#cfeaff'); rect(c, x + 3, y + 8, 10, 3, p[1]); rect(c, x + 3, y + 9, 10, 2, p[0]);
        rect(c, x + 9, y + 4, 2, 2, '#fff1a8');
      }
    };
    // ---- A. objets de bureau (posés sur le moniteur de chaque agent, 10 px de large, base en y0) ----
    const BUREAU = {
      cactus(c, xc, y0) {
        bloc(c, xc - 3, y0 - 3, 6, 3, '#c4683f'); bloc(c, xc - 1, y0 - 8, 3, 5, '#4fae6e', '#1f3a2c'); rect(c, xc + 2, y0 - 6, 2, 1, '#4fae6e'); rect(c, xc + 3, y0 - 8, 1, 2, '#4fae6e');
        rect(c, xc, y0 - 9, 1, 1, '#ff9fb2');
      },
      hibou(c, xc, y0) {
        bloc(c, xc - 3, y0 - 8, 7, 8, '#8a6446'); rect(c, xc - 2, y0 - 4, 5, 4, '#d6a173'); rect(c, xc - 3, y0 - 9, 1, 1, K); rect(c, xc + 3, y0 - 9, 1, 1, K);
        rect(c, xc - 2, y0 - 7, 2, 2, '#ffffff'); rect(c, xc + 1, y0 - 7, 2, 2, '#ffffff'); rect(c, xc - 1, y0 - 6, 1, 1, K); rect(c, xc + 1, y0 - 6, 1, 1, K);
        rect(c, xc, y0 - 5, 1, 1, '#ffd166');
      },
      sablier(c, xc, y0) {
        rect(c, xc - 4, y0 - 10, 9, 1, '#8a6446'); rect(c, xc - 4, y0 - 1, 9, 1, '#8a6446');
        for (let j = 0; j < 4; j++) { rect(c, xc - 3 + j, y0 - 9 + j, 7 - 2 * j, 1, '#bfe4ff'); rect(c, xc - j, y0 - 5 + j - 1 + 1, 1 + 2 * j, 1, '#bfe4ff'); }
        rect(c, xc - 1, y0 - 8, 3, 1, '#f2c14e'); rect(c, xc - 2, y0 - 2, 5, 1, '#f2c14e'); rect(c, xc - 1, y0 - 3, 3, 1, '#f2c14e'); rect(c, xc, y0 - 5, 1, 2, '#f2c14e');
      },
      trophee(c, xc, y0) {
        bloc(c, xc - 3, y0 - 9, 7, 4, '#ffd24a', K); rect(c, xc - 2, y0 - 9, 2, 3, '#fff1a8'); rect(c, xc - 4, y0 - 8, 1, 2, '#d99a22'); rect(c, xc + 4, y0 - 8, 1, 2, '#d99a22');
        rect(c, xc, y0 - 5, 1, 2, '#d99a22'); bloc(c, xc - 2, y0 - 3, 5, 3, '#8a6446');
      }
    };
    function dessinBureau(c) {
      agents().forEach((a, i) => {
        if (a.visible === false) return; // agent masqué : pas d'objet sur son écran
        const nom = L.bureauDe(cfg, a.cle, i), f = BUREAU[nom];
        if (f) f(c, Math.round(a.cx + a.s * 25), a.haut - 19);
      });
    }
    function dessinMurales(c) {
      for (const id of L.MURALES) {
        if (!cfg.murales[id].actif) continue;
        const p = L.positionDe(cfg, id);
        if (p) MURALES[id](c, p[0], p[1], PALETTES[cfg.murales[id].variante] || PALETTES[0]);
      }
    }
    D.avantAgents((c) => { dessinMurales(c); dessinBureau(c); });

    // ---- C. teintes du décor fixe (thème, tapis, rideaux) : appelé par scene.js à chaque redessin du décor ----
    D.apresDecor((c) => {
      const couches = L.couchesFond(cfg);
      if (!couches.length) return;
      c.setTransform(1, 0, 0, 1, 0, 0);
      for (const k of couches) {
        c.globalCompositeOperation = 'color'; c.globalAlpha = k.alpha; c.fillStyle = k.couleur; c.fillRect(k.rect[0], k.rect[1], k.rect[2], k.rect[3]);
        if (k.embrasse) { c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillStyle = '#e3b25a'; c.fillRect(k.embrasse[0], k.embrasse[1], k.embrasse[2], k.embrasse[3]); }
      }
    });

    // ---- C. ambiance, lueur, particules (couche superposée, état fixe en mouvement réduit) ----
    const degrades = {};
    function dessinAmbiance(c) {
      const A = L.AMBIANCES[cfg.ambiance]; if (!A) return;
      c.save();
      c.fillStyle = 'rgba(' + A.voile[0] + ',' + A.voile[1] + ',' + A.voile[2] + ',' + A.voile[3] + ')'; c.fillRect(0, -DY, W, H);
      if (A.vignette) {
        const cle = 'v' + cfg.ambiance;
        if (!degrades[cle]) { const g = c.createRadialGradient(W / 2, H / 2 - DY, H * 0.3, W / 2, H / 2 - DY, W * 0.62); g.addColorStop(0, 'rgba(8,6,24,0)'); g.addColorStop(1, 'rgba(8,6,24,' + A.vignette + ')'); degrades[cle] = g; }
        c.fillStyle = degrades[cle]; c.fillRect(0, -DY, W, H);
      }
      if (A.halos) {
        c.globalCompositeOperation = 'lighter';
        A.halos.forEach((h, i) => {
          const cle = 'h' + i;
          if (!degrades[cle]) { const x0 = i ? W : 0, g = c.createLinearGradient(x0, 0, i ? W * 0.62 : W * 0.38, 0); g.addColorStop(0, 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',' + h[3] + ')'); g.addColorStop(1, 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',0)'); degrades[cle] = g; }
          c.fillStyle = degrades[cle]; c.fillRect(0, -DY, W, H);
        });
      }
      c.restore();
    }
    function halo(c, x, y, r, rvb, force) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + rvb.join(',') + ',' + Math.min(0.5, force).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + rvb.join(',') + ',0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function dessinLueur(c, t) {
      const k = L.LUEURS[cfg.lueur]; if (!k) return;
      const pouls = api.calme() ? 1 : 0.85 + 0.15 * Math.sin(t / 900);
      const lampe = L.LAMPES[cfg.lampe];
      c.save(); c.globalCompositeOperation = 'lighter';
      halo(c, 64, 35, 80, [255, 236, 190], k * pouls);
      halo(c, 269, 110, 46, hexRvb(lampe ? lampe.lueur : '#ffcf8a'), k * 1.3 * pouls);
      c.restore();
    }
    api.dessin((c, t) => { dessinAmbiance(c); dessinLueur(c, t); });

    // ---- B. particules : couche propre (canvas haute définition dans le cadre), une seule boucle d'animation ----
    // Mouvement fluide indépendant de la cadence, profondeur (taille, vitesse, transparence) et parallaxe liée au pointeur, lueurs douces.
    // La boucle s'arrête quand la fenêtre est masquée, quand le choix est « Aucune » et en mouvement réduit (une seule image fixe).
    const COUL_PART = { poussiere: [255, 236, 190], lucioles: [210, 255, 120], flocons: [235, 245, 255] };
    const part = { cvs: null, ctx: null, raf: 0, ps: [], type: 'aucune', dernier: 0, px: 0, py: 0, cx: 0, cy: 0, sprites: {}, ro: null, branche: false };
    function spritePart(type) {
      if (part.sprites[type]) return part.sprites[type];
      const t = 32, cv = doc.createElement('canvas'); cv.width = cv.height = t;
      const x = cv.getContext('2d'), col = COUL_PART[type] || [255, 255, 255];
      const g = x.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
      g.addColorStop(0, 'rgba(' + col.join(',') + ',1)'); g.addColorStop(0.25, 'rgba(' + col.join(',') + ',0.55)'); g.addColorStop(1, 'rgba(' + col.join(',') + ',0)');
      x.fillStyle = g; x.fillRect(0, 0, t, t);
      part.sprites[type] = cv; return cv;
    }
    function dimensionnerPart() {
      if (!part.cvs || !cadre) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, Math.round(cadre.clientWidth * dpr)), h = Math.max(1, Math.round(cadre.clientHeight * dpr));
      if (part.cvs.width !== w || part.cvs.height !== h) { part.cvs.width = w; part.cvs.height = h; }
    }
    function lueurFond(x, s, t) { // faisceau de la fenêtre (poussière) ou voile froid du haut (flocons) : très discret
      if (part.type === 'poussiere') {
        const g = x.createLinearGradient(60 * s, (20 + DY) * s, 150 * s, (125 + DY) * s);
        g.addColorStop(0, 'rgba(255,236,190,0.07)'); g.addColorStop(1, 'rgba(255,236,190,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(28 * s, (14 + DY) * s); x.lineTo(100 * s, (14 + DY) * s); x.lineTo(205 * s, (130 + DY) * s); x.lineTo(95 * s, (130 + DY) * s); x.closePath(); x.fill();
      } else if (part.type === 'flocons') {
        const g = x.createLinearGradient(0, 0, 0, 90 * s); g.addColorStop(0, 'rgba(190,215,255,0.07)'); g.addColorStop(1, 'rgba(190,215,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, W * s, 90 * s);
      }
    }
    function dessinerPart(now) {
      const x = part.ctx, cv = part.cvs; if (!x || !cv) return;
      const s = cv.width / W, calme = api.calme();
      x.clearRect(0, 0, cv.width, cv.height);
      x.globalCompositeOperation = 'lighter';
      lueurFond(x, s, now);
      const sp = spritePart(part.type);
      for (const p of part.ps) {
        const r = L.rendu(p, part.type, now, calme), o = L.parallaxe(p, part.px, part.py);
        const px = (r.x + o[0]) * s, py = (r.y + o[1] + DY) * s;
        if (r.halo > 0.02) { // lueur douce
          const R = (r.r * 5 + 4) * s * (0.6 + r.halo * 0.7);
          x.globalAlpha = Math.min(0.5, r.halo * 0.45 * r.a); x.drawImage(sp, px - R, py - R, R * 2, R * 2);
        }
        const c = Math.max(1.2, r.r * 2.2) * s; // cœur lumineux
        x.globalAlpha = r.a; x.drawImage(sp, px - c, py - c, c * 2, c * 2);
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    function boucleParticules(now) {
      part.raf = window.requestAnimationFrame(boucleParticules);
      const dt = part.dernier ? now - part.dernier : 16; part.dernier = now;
      L.avancer(part.ps, part.type, dt, now);
      // pointeur lissé (parallaxe) ; sans pointeur, la cible retombe doucement à zéro
      const k = 1 - Math.exp(-dt / 220); part.px += (part.cx - part.px) * k; part.py += (part.cy - part.py) * k;
      dessinerPart(now);
    }
    function demarrerPart() { if (!part.raf) { part.dernier = 0; part.raf = window.requestAnimationFrame(boucleParticules); } }
    function arreterPart() { if (part.raf) { window.cancelAnimationFrame(part.raf); part.raf = 0; } part.dernier = 0; }
    const surPointeur = (ev) => {
      const r = cadre.getBoundingClientRect(); if (!r.width || !r.height) return;
      part.cx = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width - 0.5) * 2)); part.cy = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height - 0.5) * 2));
    };
    const surSortie = () => { part.cx = 0; part.cy = 0; };
    function brancherPart() { if (part.branche || !cadre) return; part.branche = true; cadre.addEventListener('pointermove', surPointeur); cadre.addEventListener('pointerleave', surSortie); }
    function debrancherPart() { if (!part.branche || !cadre) return; part.branche = false; cadre.removeEventListener('pointermove', surPointeur); cadre.removeEventListener('pointerleave', surSortie); }
    function retirerPart() { arreterPart(); debrancherPart(); if (part.ro) { part.ro.disconnect(); part.ro = null; } if (part.cvs && part.cvs.parentNode) part.cvs.parentNode.removeChild(part.cvs); part.cvs = null; part.ctx = null; part.ps = []; part.type = 'aucune'; }
    // Point d'entrée unique : à appeler à chaque changement (choix, visibilité de la fenêtre, mouvement réduit).
    function majParticules() {
      try {
        const type = cfg.particules;
        if (!cadre || !L.TYPES_PARTICULES.includes(type)) { retirerPart(); return; }
        if (!part.cvs) {
          const cv = doc.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); cv.className = 'royaume-particules';
          cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
          cadre.insertBefore(cv, toile.nextSibling); part.cvs = cv; part.ctx = cv.getContext('2d');
          if (typeof window.ResizeObserver === 'function') { part.ro = new window.ResizeObserver(() => { dimensionnerPart(); if (!part.raf) dessinerPart(performance.now()); }); part.ro.observe(cadre); }
        }
        if (part.type !== type) { part.type = type; part.ps = L.creerParticules(type, L.NB_PARTICULES, 20261107); }
        dimensionnerPart(); brancherPart();
        if (api.calme()) { arreterPart(); dessinerPart(0); } // mouvement réduit : une image fixe, aucune boucle
        else if (doc.hidden) arreterPart(); // fenêtre masquée : aucune boucle (reprise au retour)
        else demarrerPart();
      } catch (e) { avertir('particules', e); retirerPart(); }
    }
    doc.addEventListener('visibilitychange', () => { if (part.cvs) majParticules(); });
    try { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); if (mq.addEventListener) mq.addEventListener('change', () => majParticules()); } catch { /* sans écoute */ }

    // ---- application de la configuration à la scène ----
    function appliquer() {
      const dec = L.decalages(cfg);
      for (const id of L.EXISTANTS) {
        D.decaler(id, dec[id][0], dec[id][1]);
        try { window.KinanEgg.deplacerZone(L.ZONE_DE[id], dec[id][0], dec[id][1]); } catch (e) { avertir('zone', e); }
      }
      D.remplacer('plante', cfg.plante === 'origine' ? null : dessinPlante);
      D.remplacer('tableau', cfg.tableau === 'origine' ? null : dessinTableau);
      D.lampe(L.LAMPES[cfg.lampe]);
      D.heure(L.HEURES[cfg.ciel]);
      // agents au bureau : affichage seulement (l'état réel des agents n'est jamais touché)
      if (eq.affichage) for (const a of agents()) { try { eq.affichage.masquer(a.cle, !L.agentVisible(cfg, a.cle)); } catch (e) { avertir('affichage', e); } }
      D.redessiner();
      majParticules();
      majPoignees();
      api.salir();
    }

    // ---- panneau ----
    const FOND = '#1d1729', OR = '#ffd04d', TEXTE = '#f4f1ea';
    const el = (tag, css, texte) => { const n = doc.createElement(tag); if (css) n.style.cssText = css; if (texte) n.textContent = texte; return n; };
    const style = el('style');
    style.textContent = '#royaume-panneau{position:fixed;top:56px;right:12px;z-index:70;box-sizing:border-box;width:min(372px,calc(100vw - 24px));max-height:calc(100vh - 72px);overflow:auto;'
      + 'padding:12px 14px;font:14px/1.45 system-ui,sans-serif;color:' + TEXTE + ';background:' + FOND + ';border:2px solid ' + OR + ';border-radius:6px}'
      + '#royaume-panneau[hidden]{display:none}'
      + '#royaume-panneau h2{margin:0 0 4px;font:700 16px/1.3 system-ui,sans-serif;color:' + OR + ';letter-spacing:.03em}'
      + '#royaume-panneau p{margin:0 0 8px;font-size:13px;color:#cfc8e0}'
      + '#royaume-panneau details{margin:0 0 8px;border:1px solid rgba(255,208,77,.4);border-radius:4px;background:rgba(255,255,255,.02)}'
      + '#royaume-panneau summary{padding:8px 10px;cursor:pointer;font:700 13px system-ui,sans-serif;color:' + OR + ';list-style:none;display:flex;align-items:center;gap:8px;min-height:36px}'
      + '#royaume-panneau summary::-webkit-details-marker{display:none}'
      + '#royaume-panneau summary::before{content:"▸";display:inline-block;transition:transform .15s}'
      + '#royaume-panneau details[open] > summary::before{transform:rotate(90deg)}'
      + '#royaume-panneau .rm-corps{padding:0 10px 10px}'
      + '#royaume-panneau .rm-aide{margin:6px 0 4px;font-size:12px;color:#b9b0d0}'
      + '#royaume-panneau label{display:block;margin:8px 0 2px;font-size:13px}'
      + '#royaume-panneau select{box-sizing:border-box;width:100%;min-height:32px;padding:3px 6px;font:13px system-ui,sans-serif;color:' + TEXTE + ';background:#2a2238;border:1px solid ' + OR + ';border-radius:4px}'
      + '#royaume-panneau button{min-height:32px;min-width:32px;padding:4px 12px;font:600 13px system-ui,sans-serif;color:' + OR + ';background:' + FOND + ';border:2px solid ' + OR + ';border-radius:4px;cursor:pointer}'
      + '#royaume-panneau button:hover{background:#2a2238}'
      + '#royaume-panneau input[type=checkbox]{width:18px;height:18px;margin:0 8px 0 0;vertical-align:middle;accent-color:' + OR + '}'
      + '#royaume-panneau .rm-ligne{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}'
      + '#royaume-panneau .rm-ligne label{margin:0;flex:1;min-width:120px}'
      + '#royaume-panneau .rm-ligne select{width:42%;min-width:110px}'
      + '#royaume-panneau .rm-fleches{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}'
      + '#royaume-panneau .rm-agent{display:flex;align-items:center;gap:8px;margin-top:6px}'
      + '#royaume-panneau .rm-pastille{flex:none;width:10px;height:10px;border-radius:50%;background:var(--c,#8f88a8)}'
      + '#royaume-panneau :focus-visible{outline:2px solid #fff;outline-offset:2px}'
      + '.royaume-poignee{position:absolute;z-index:6;box-sizing:border-box;cursor:grab;touch-action:none;border:1px dashed ' + OR + ';background:rgba(255,208,77,.1);transition:background-color .12s,border-color .12s}'
      + '.royaume-poignee[data-actif="1"]{border:2px solid #fff;background:rgba(255,208,77,.2)}'
      + '.royaume-poignee[data-glisse="1"]{cursor:grabbing;z-index:8;border:2px solid #6be39a;background:rgba(107,227,154,.32)}'
      + '.royaume-poignee[data-glisse="1"][data-refus="1"]{border-color:#ff6b6b;background:rgba(255,107,107,.38)}'
      + '.royaume-apercu{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;image-rendering:pixelated}'
      + '@media (prefers-reduced-motion: reduce){.royaume-poignee{transition:none}}';
    doc.head.appendChild(style);

    const panneau = el('section');
    panneau.id = 'royaume-panneau'; panneau.hidden = true; panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-modal', 'false'); panneau.setAttribute('aria-labelledby', 'royaume-titre');
    const titre = el('h2', '', 'Paramètres du royaume'); titre.id = 'royaume-titre'; titre.tabIndex = -1;
    const intro = el('p', '', 'Présentation du bureau seulement : rien ici ne touche au fonctionnement des agents. Tes choix sont gardés sur cet ordinateur.');
    const statut = el('p', 'min-height:1.4em;color:' + OR); statut.setAttribute('role', 'status'); statut.setAttribute('aria-live', 'polite');
    const selects = {};
    function champ(parent, cle, libelle) {
      const id = 'royaume-' + cle, lab = el('label', '', libelle); lab.htmlFor = id;
      const sel = el('select'); sel.id = id;
      for (const [v, nom] of L.CATALOGUE[cle]) { const o = el('option', '', nom); o.value = v; sel.appendChild(o); }
      sel.addEventListener('change', () => changer(L.choisir(cfg, cle, sel.value, agents()), null));
      selects[cle] = sel; parent.append(lab, sel);
    }
    function groupe(legende, ouvert) {
      const d = el('details'); if (ouvert) d.open = true;
      d.appendChild(el('summary', '', legende));
      const corps = el('div'); corps.className = 'rm-corps'; d.appendChild(corps);
      return { d, corps };
    }

    // 1. Agents au bureau et objet posé sur chaque écran
    const gAg = groupe('Agents et écrans', true), fAg = gAg.corps;
    const aide = (parent, texte) => { const p = el('p', '', texte); p.className = 'rm-aide'; parent.appendChild(p); return p; };
    aide(fAg, 'Choisis qui apparaît au bureau et quel objet se pose sur son écran. Affichage seulement : les agents travaillent comme avant.');
    const murCoches = {}, variantes = {}, empl = {}, bureauSel = {}, agentCoches = {};
    const listeAgents = agents();
    champ(fAg, 'bureau', 'Objet de bureau, par défaut pour tous');
    const grille = el('div'); fAg.appendChild(grille);
    for (const a of listeAgents) {
      const bloc = el('div'); bloc.className = 'rm-agent';
      const cb = el('input'); cb.type = 'checkbox'; cb.id = 'royaume-ag-' + a.cle; cb.checked = true;
      const lab = el('label', 'margin:0;flex:1;min-width:90px'); lab.htmlFor = cb.id;
      const nom = (a.nom || a.cle) + (a.cle === 'kinan' ? ' (toujours au bureau)' : '');
      lab.append(cb, doc.createTextNode(nom));
      if (a.cle === 'kinan') cb.disabled = true;
      cb.addEventListener('change', () => {
        const res = L.masquerAgent(cfg, a.cle, !cb.checked, agents());
        changer(res, 'Cet agent ne peut pas être masqué.');
      });
      const sel = el('select', 'width:44%;min-width:120px'); sel.setAttribute('aria-label', 'Objet sur l\'écran de ' + (a.nom || a.cle));
      const o0 = el('option', '', 'Comme les autres'); o0.value = 'defaut'; sel.appendChild(o0);
      for (const [v, n] of L.CATALOGUE.bureau) { const o = el('option', '', n); o.value = v; sel.appendChild(o); }
      sel.addEventListener('change', () => changer(L.choisirBureau(cfg, a.cle, sel.value, agents()), null));
      agentCoches[a.cle] = cb; bureauSel[a.cle] = sel;
      bloc.append(lab, sel); grille.appendChild(bloc);
    }
    // 2. Décoration
    const gDe = groupe('Décoration', false), fA = gDe.corps;
    champ(fA, 'plante', 'Plante'); champ(fA, 'tableau', 'Tableau'); champ(fA, 'lampe', 'Lampe'); champ(fA, 'rideaux', 'Rideaux de la fenêtre');
    champ(fA, 'ciel', 'Ciel derrière la fenêtre (soleil, lune)');
    // 3. Décor mural : activer, couleurs, emplacement
    const gMu = groupe('Décor mural', false), fM = gMu.corps;
    aide(fM, 'Active un décor, choisis son emplacement ou glisse-le sur le mur (voir « Organisation »).');
    for (const id of L.MURALES) {
      const ligne = el('div'); ligne.className = 'rm-ligne';
      const cb = el('input'); cb.type = 'checkbox'; cb.id = 'royaume-mur-' + id;
      const lab = el('label', '', L.LIBELLES[id]); lab.htmlFor = cb.id; lab.style.flex = '1';
      lab.prepend(cb);
      const sv = el('select'); sv.setAttribute('aria-label', L.LIBELLES[id] + ' : couleurs');
      for (let i = 0; i < L.NB_VARIANTES; i++) { const o = el('option', '', 'Couleurs ' + (i + 1)); o.value = String(i); sv.appendChild(o); }
      const se = el('select', 'width:100%'); se.setAttribute('aria-label', L.LIBELLES[id] + ' : emplacement');
      const oe = el('option', '', 'Emplacement : où il est'); oe.value = ''; se.appendChild(oe);
      for (const [nom, lib] of Object.entries(L.LIBELLES_EMPLACEMENTS)) { const o = el('option', '', lib); o.value = nom; se.appendChild(o); }
      cb.addEventListener('change', () => {
        const res = L.activerMurale(cfg, id, cb.checked, agents());
        changer(res, res.ok ? null : 'Plus de place libre sur les murs pour : ' + L.LIBELLES[id].toLowerCase() + '.');
      });
      sv.addEventListener('change', () => changer(L.varianteMurale(cfg, id, Number(sv.value), agents()), null));
      se.addEventListener('change', () => {
        if (!se.value) return;
        const res = L.placerDans(cfg, id, se.value, agents());
        se.value = '';
        changer(res, 'Pas de place libre à cet endroit : essaie un autre emplacement.');
      });
      murCoches[id] = cb; variantes[id] = sv; empl[id] = se;
      ligne.append(lab, sv); fM.append(ligne, se);
    }
    // 4. Organisation : glisser-déposer libre et clavier
    const gOr = groupe('Organisation', false), fB = gOr.corps;
    aide(fB, 'Glisse un objet sur le bureau : vert = emplacement permis, rouge = interdit (l\'objet revient). Au clavier : choisis-le ici puis déplace-le avec les flèches (Maj : 8 pixels).');
    const ligneSouris = el('div'); ligneSouris.className = 'rm-ligne';
    const cbSouris = el('input'); cbSouris.type = 'checkbox'; cbSouris.id = 'royaume-souris'; cbSouris.checked = true;
    const labSouris = el('label', '', 'Déplacer à la souris'); labSouris.htmlFor = cbSouris.id; labSouris.prepend(cbSouris);
    ligneSouris.appendChild(labSouris); fB.appendChild(ligneSouris);
    const labObjet = el('label', '', 'Objet à déplacer'); labObjet.htmlFor = 'royaume-objet';
    const selObjet = el('select'); selObjet.id = 'royaume-objet';
    const fleches = el('div'); fleches.className = 'rm-fleches'; fleches.setAttribute('role', 'group'); fleches.setAttribute('aria-label', 'Déplacer l\'objet choisi');
    function deplacerClavier(dx, dy, pas) {
      const id = selObjet.value; if (!id) return;
      const res = L.deplacerDe(cfg, id, dx * pas, dy * pas, agents());
      if (res.ok) { cfg = res.cfg; sauver(); appliquer(); api.son({ type: 'sine', f0: 330, f1: 260, duree: 0.06, volume: 0.025 }); statut.textContent = ''; }
      else statut.textContent = 'Emplacement interdit ou hors de la zone permise : l\'objet reste là.';
    }
    [['←', 'gauche', -1, 0], ['↑', 'haut', 0, -1], ['↓', 'bas', 0, 1], ['→', 'droite', 1, 0]].forEach(([sym, nom, dx, dy]) => {
      const b = el('button', '', sym); b.type = 'button';
      b.setAttribute('aria-label', 'Vers ' + (nom === 'gauche' ? 'la gauche' : nom === 'droite' ? 'la droite' : 'le ' + nom));
      b.addEventListener('click', (ev) => deplacerClavier(dx, dy, ev.shiftKey ? 8 : 2));
      fleches.appendChild(b);
    });
    fB.append(labObjet, selObjet, fleches);
    // 5. Thèmes et ambiance
    const gTh = groupe('Thèmes et ambiance', false), fC = gTh.corps;
    champ(fC, 'theme', 'Thème des murs et du sol'); champ(fC, 'tapis', 'Couleur du tapis'); champ(fC, 'ambiance', 'Ambiance lumineuse');
    champ(fC, 'particules', 'Particules'); champ(fC, 'lueur', 'Lueur de la fenêtre et de la lampe');
    // 6. Réinitialisation
    const gRe = groupe('Réinitialisation', false), fD = gRe.corps;
    const bReset = el('button', '', 'Réinitialiser la décoration'); bReset.type = 'button';
    const confirmation = el('div', 'margin-top:8px'); confirmation.hidden = true;
    const qConf = el('p', '', 'Tout remettre comme à l\'origine ?');
    const bOui = el('button', 'margin-right:8px', 'Oui, réinitialiser'); bOui.type = 'button';
    const bNon = el('button', '', 'Non, garder'); bNon.type = 'button';
    confirmation.append(qConf, bOui, bNon); fD.append(bReset, confirmation);

    const bFermer = el('button', 'width:100%', 'Fermer (Échap)'); bFermer.type = 'button';
    panneau.append(titre, intro, statut, gAg.d, gDe.d, gMu.d, gOr.d, gTh.d, gRe.d, bFermer);
    doc.body.appendChild(panneau);

    // ---- synchronisation panneau <- configuration ----
    function majListeObjets() {
      const courant = selObjet.value;
      selObjet.textContent = '';
      for (const id of L.actifs(cfg)) { const o = el('option', '', L.LIBELLES[id]); o.value = id; selObjet.appendChild(o); }
      if (L.actifs(cfg).includes(courant)) selObjet.value = courant;
    }
    function majUI() {
      for (const k of L.CHOIX) if (selects[k]) selects[k].value = cfg[k];
      for (const id of L.MURALES) { murCoches[id].checked = cfg.murales[id].actif; variantes[id].value = String(cfg.murales[id].variante); variantes[id].disabled = !cfg.murales[id].actif; empl[id].disabled = !cfg.murales[id].actif; }
      for (const a of listeAgents) { agentCoches[a.cle].checked = L.agentVisible(cfg, a.cle); bureauSel[a.cle].value = (cfg.bureauPar && cfg.bureauPar[a.cle]) || 'defaut'; }
      majListeObjets(); majPoignees();
    }
    function changer(res, refus) {
      if (!res.ok) { statut.textContent = refus || 'Choix indisponible.'; majUI(); return; }
      cfg = res.cfg; sauver(); appliquer(); majUI(); statut.textContent = '';
      api.son({ type: 'triangle', f0: 660, f1: 880, duree: 0.08, volume: 0.03 });
    }

    // ---- glisser-déposer libre : poignée fantôme + aperçu des zones permises (vert) et interdites (rouge) ----
    const toile = doc.getElementById('toile'), cadre = toile && toile.parentElement;
    const poignees = {};
    let ouvert = false, retour = null, apercuCvs = null, enGlisse = null;
    function retirerPoignees() { for (const id of Object.keys(poignees)) { const p = poignees[id]; if (p.parentNode) p.parentNode.removeChild(p); delete poignees[id]; } retirerApercu(); }
    function retirerApercu() { if (apercuCvs && apercuCvs.parentNode) apercuCvs.parentNode.removeChild(apercuCvs); apercuCvs = null; }
    function placerPoignee(p, id, pos) {
      const [w, h] = L.OBJETS[id].taille;
      p.style.left = (pos[0] / W) * 100 + '%'; p.style.top = ((pos[1] + DY) / H) * 100 + '%';
      p.style.width = (w / W) * 100 + '%'; p.style.height = (h / H) * 100 + '%';
    }
    // Zones permises (vert) et zones à éviter (rouge) de l'objet en cours de déplacement, sur un calque aux dimensions de la scène.
    function dessinerApercu(id) {
      if (!cadre) return;
      if (!id) { retirerApercu(); return; }
      if (!apercuCvs) { apercuCvs = el('canvas'); apercuCvs.width = W; apercuCvs.height = H; apercuCvs.className = 'royaume-apercu'; apercuCvs.setAttribute('aria-hidden', 'true'); cadre.appendChild(apercuCvs); }
      const x = apercuCvs.getContext('2d'); x.clearRect(0, 0, W, H);
      x.fillStyle = 'rgba(107,227,154,0.16)'; x.strokeStyle = 'rgba(107,227,154,0.8)'; x.lineWidth = 1; x.setLineDash([3, 2]);
      for (const z of L.zonesPermises(id)) { x.fillRect(z[0], z[1] + DY, z[2], z[3]); x.strokeRect(z[0] + 0.5, z[1] + DY + 0.5, z[2] - 1, z[3] - 1); }
      x.setLineDash([]); x.fillStyle = 'rgba(255,90,90,0.34)';
      for (const r of L.rectsEvites(cfg, id, agents())) x.fillRect(r[0], r[1] + DY, r[2], r[3]);
    }
    function majPoignees() {
      if (!cadre) return;
      const veut = ouvert && cbSouris.checked && gOr.d.open;
      if (!veut) { if (!enGlisse) retirerPoignees(); return; }
      const actifs = L.actifs(cfg);
      for (const id of Object.keys(poignees)) if (!actifs.includes(id)) { const p = poignees[id]; if (p.parentNode) p.parentNode.removeChild(p); delete poignees[id]; }
      for (const id of actifs) {
        let p = poignees[id];
        if (!p) { p = creerPoignee(id); poignees[id] = p; cadre.appendChild(p); }
        if (!(enGlisse && enGlisse.id === id)) placerPoignee(p, id, L.positionDe(cfg, id));
        p.dataset.actif = selObjet.value === id ? '1' : '0';
      }
      if (enGlisse) dessinerApercu(enGlisse.id); else if (apercuCvs) retirerApercu();
    }
    const messageRaison = { zone: 'Hors de la zone permise pour cet objet.', fixe: 'Emplacement occupé (fenêtre, bureau, lampe…).', objet: 'Un autre objet est déjà là.', position: 'Position invalide.' };
    function creerPoignee(id) {
      const p = el('div'); p.className = 'royaume-poignee'; p.setAttribute('aria-hidden', 'true'); p.title = L.LIBELLES[id] + ' : glisser pour déplacer';
      p.addEventListener('pointerdown', (ev) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        ev.preventDefault(); ev.stopPropagation();
        try { p.setPointerCapture(ev.pointerId); } catch { /* sans capture */ }
        selObjet.value = id;
        const r = toile.getBoundingClientRect(); if (!r.width || !r.height) return;
        const pos = L.positionDe(cfg, id);
        // le point saisi reste sous le curseur : on mémorise sa distance au coin de l'objet
        enGlisse = { id, pointeur: ev.pointerId, dx: ((ev.clientX - r.left) / r.width) * W - pos[0], dy: ((ev.clientY - r.top) / r.height) * H - DY - pos[1], x: pos[0], y: pos[1], valide: true };
        p.dataset.glisse = '1'; p.dataset.refus = '0'; majPoignees();
      });
      p.addEventListener('pointermove', (ev) => {
        if (!enGlisse || enGlisse.id !== id) return;
        const r = toile.getBoundingClientRect(); if (!r.width || !r.height) return;
        const x = Math.round(((ev.clientX - r.left) / r.width) * W - enGlisse.dx), y = Math.round(((ev.clientY - r.top) / r.height) * H - DY - enGlisse.dy);
        const [w, h] = L.OBJETS[id].taille;
        enGlisse.x = Math.max(-2, Math.min(W - w + 2, x)); enGlisse.y = Math.max(-2, Math.min(H - DY - h + 2, y)); // la poignée suit librement, jusqu'aux bords
        const ap = L.apercu(cfg, id, enGlisse.x, enGlisse.y, agents());
        enGlisse.valide = ap.valide; p.dataset.refus = ap.valide ? '0' : '1';
        placerPoignee(p, id, [enGlisse.x, enGlisse.y]);
        statut.textContent = ap.valide ? '' : (messageRaison[ap.raison] || '');
      });
      const fin = (annule) => {
        if (!enGlisse || enGlisse.id !== id) return;
        const g = enGlisse; enGlisse = null; p.dataset.glisse = '0'; p.dataset.refus = '0';
        if (!annule) {
          const res = L.deposer(cfg, id, g.x, g.y, agents());
          if (res.ok) { cfg = res.cfg; sauver(); appliquer(); api.son({ type: 'sine', f0: 300, f1: 240, duree: 0.07, volume: 0.03 }); statut.textContent = res.ajuste ? 'Posé sur l\'emplacement permis le plus proche.' : ''; }
          else { statut.textContent = (messageRaison[res.raison] || 'Emplacement interdit') + ' L\'objet est revenu.'; }
        }
        majPoignees();
      };
      p.addEventListener('pointerup', () => fin(false));
      p.addEventListener('pointercancel', () => fin(true));
      p.addEventListener('lostpointercapture', () => fin(true));
      return p;
    }
    cbSouris.addEventListener('change', majPoignees);
    selObjet.addEventListener('change', majPoignees);
    gOr.d.addEventListener('toggle', majPoignees); // poignées affichées seulement quand la section « Organisation » est ouverte

    // ---- ouverture, fermeture, clavier ----
    function ouvrir() {
      if (ouvert) { try { titre.focus(); } catch { /* ignoré */ } return; }
      retour = doc.activeElement; ouvert = true; panneau.hidden = false;
      majUI(); statut.textContent = '';
      try { titre.focus(); } catch { /* ignoré */ }
    }
    function fermer() {
      if (!ouvert) return;
      enGlisse = null; ouvert = false; panneau.hidden = true; confirmation.hidden = true; retirerPoignees();
      try { if (retour && retour.isConnected && retour.focus) retour.focus(); } catch { /* ignoré */ }
      retour = null;
    }
    bFermer.addEventListener('click', fermer);
    doc.addEventListener('keydown', (ev) => {
      if (!ouvert || ev.key !== 'Escape') return;
      ev.preventDefault();
      if (enGlisse) { const p = poignees[enGlisse.id]; enGlisse = null; if (p) { p.dataset.glisse = '0'; p.dataset.refus = '0'; } statut.textContent = 'Déplacement annulé.'; majPoignees(); return; }
      fermer();
    });

    bReset.addEventListener('click', () => { confirmation.hidden = false; try { bNon.focus(); } catch { /* ignoré */ } });
    bNon.addEventListener('click', () => { confirmation.hidden = true; try { bReset.focus(); } catch { /* ignoré */ } });
    bOui.addEventListener('click', () => {
      cfg = L.reinitialiser(); effacer(); appliquer(); majUI();
      confirmation.hidden = true; statut.textContent = 'Décoration remise comme à l\'origine.';
      try { bReset.focus(); } catch { /* ignoré */ }
    });

    api.ecouter('kinan-egg-royaume', () => ouvrir());

    // ---- démarrage : applique la configuration enregistrée ----
    majUI();
    if (!L.estDefaut(cfg)) appliquer();
    if (L.modeTest(window.location && window.location.search)) window.setTimeout(() => { try { ouvrir(); } catch (e) { avertir('test', e); } }, 600);
  });
})();
