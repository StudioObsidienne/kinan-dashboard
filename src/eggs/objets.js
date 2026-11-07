// Micro-interactions du décor : clic (ou Tab + Entrée) sur la plante, la fenêtre, la lampe, les ordinateurs, les tasses, l'horloge,
// le tableau, le panneau de liège et l'étagère. Bulle courte au hasard + petit effet superposé. Aucune écriture d'état, rien n'est mémorisé.
// Pas de poubelle ni de porte dans la scène : non créées. Mode calme : pas de mouvement, effets en état fixe le temps de la bulle.
(function () {
  'use strict';
  if (!window.KinanEgg || !window.ObjetsLogique) return;
  const L = window.ObjetsLogique;

  window.KinanEgg.module('objets', (api) => {
    const eq = window.KinanEquipe;
    const objets = eq.objets || {};
    const boite = (id) => objets[id] || L.BOITES[id];
    const effets = [];          // { type, cle, debut, duree, aux }
    const dernier = {};         // dernier indice de message par clé
    let lampe = L.creerLampe();

    // ---- déclenchement ----
    function parler(cle, texte, ms) { api.bulle(cle, texte, ms || 2600); }
    function lancer(type, cle, aux) {
      const now = performance.now();
      let debut = now, duree = L.DUREE[type];
      for (let i = effets.length - 1; i >= 0; i--) if (effets[i].type === type && effets[i].cle === cle) {
        if (type === 'plante') { const r = L.relancerPlante(now - effets[i].debut, effets[i].duree, api.calme()); debut = now - r.dt; duree = r.duree; aux = effets[i].aux; }
        effets.splice(i, 1);
      }
      effets.push({ type, cle, debut, duree, aux: aux || {} });
      api.salir();
    }
    let lore = L.creerLore();
    // idLore : identité de l'objet dans le fil rouge (plante, fenêtre, tasse, lampe) ; la phrase d'histoire remplace alors la phrase au hasard.
    function dire(clePool, cleDernier, proprio, idLore) {
      if (idLore) {
        const r = L.suiteLore(lore, idLore, performance.now()); lore = r.etat;
        if (r.texte) { parler(proprio, r.texte, 3600); if (r.fini) api.son({ type: 'sine', f0: 523, f1: 784, duree: 0.35, volume: 0.04 }); return; }
      }
      const m = L.choisir(L.MESSAGES[clePool], Math.random, dernier[cleDernier]);
      dernier[cleDernier] = m.index;
      parler(proprio, m.texte);
    }
    const zonesCreees = [], parAgent = {};
    function zone(label, b, fn) {
      // Hook : après l'effet de l'objet, évènement 'kinan-egg-objet' { label } (écouté par chasse.js ; sans écouteur, aucun effet).
      const clic = () => { fn(); try { api.emettre('kinan-egg-objet', { label }); } catch { /* hook facultatif */ } };
      const z = api.zone(label, b, { clic, min: L.MIN_CLIC_PX, z: 2 });
      if (z) zonesCreees.push(z);
      return z;
    }

    // décor fixe (propriétaire de la bulle : le juge, toujours présent)
    zone('Plante', boite('plante'), () => { dire('plante', 'plante', 'kinan', 'plante'); lancer('plante', 'plante', { graine: Math.random() }); api.son({ type: 'triangle', f0: 330, f1: 180, duree: 0.25, volume: 0.04 }); });
    zone('Fenêtre', boite('fenetre'), () => { dire('fenetre', 'fenetre', 'kinan', 'fenetre'); lancer('fenetre', 'fenetre'); api.son({ type: 'square', f0: 110, f1: 90, duree: 0.2, volume: 0.03, passeBas: 400 }); });
    zone('Lampe', boite('lampadaire'), () => {
      lampe = L.basculerLampe(lampe, performance.now());
      dire(lampe.allumee ? 'lampeAllume' : 'lampeEteint', 'lampe', 'kinan', 'lampe');
      api.son({ type: 'square', f0: 900, f1: 600, duree: 0.05, volume: 0.04 });
      api.salir();
    });
    zone('Horloge', boite('horloge'), () => {
      const m = L.messageHorloge(new Date(api.horloge()), Math.random, dernier.horloge);
      if (m.index >= -1) dernier.horloge = m.index;
      lore = L.suiteLore(lore, 'autre', 0).etat; parler('kinan', m.texte); lancer('horloge', 'horloge');
      api.son({ type: 'triangle', f0: 1200, f1: 1100, duree: 0.06, volume: 0.04 });
    });
    zone('Tableau', boite('tableau'), () => { dire('tableau', 'tableau', 'kinan', 'autre'); lancer('tableau', 'tableau'); });
    zone('Panneau de liège', boite('panneau'), () => { dire('panneau', 'panneau', 'kinan', 'autre'); lancer('panneau', 'panneau', { note: Math.floor(Math.random() * 5) }); });
    zone('Étagère à livres', boite('etagere'), () => { dire('etagere', 'etagere', 'kinan', 'autre'); lancer('etagere', 'etagere', { graine: Math.random() * 100 }); });

    // par agent : ordinateur et tasse
    for (const a of eq.agents()) {
      const nom = (eq.ID_DE && eq.ID_DE[a.cle]) || a.cle;
      const zs = parAgent[a.cle] = parAgent[a.cle] || [];
      zs.push(zone('Ordinateur de ' + nom, L.boiteMoniteur(a), () => { dire('ordinateur', 'pc-' + a.cle, a.cle, 'autre'); lancer('ordinateur', a.cle); api.son({ type: 'square', f0: 700, f1: 700, duree: 0.04, volume: 0.03 }); }));
      if (L.SIEGES_TASSE.includes(a.cle)) zs.push(zone('Tasse de ' + nom, L.boiteTasse(a), () => { dire('tasse', 'tasse-' + a.cle, a.cle, 'tasse'); lancer('tasse', a.cle); api.son({ type: 'sine', f0: 640, f1: 520, duree: 0.15, volume: 0.04 }); }));
    }
    // Agent masqué par le panneau Royaume (affichage seulement) : ses zones cliquables disparaissent avec lui.
    document.addEventListener('kinan-affichage', (ev) => {
      const m = (ev && ev.detail && ev.detail.masques) || [];
      for (const k of Object.keys(parAgent)) for (const z of parAgent[k]) if (z && z.bouton) z.bouton.style.display = m.includes(k) ? 'none' : '';
    });

    // ---- dessin ----
    const K = '#1d1729';
    const alea = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
    // Recopie décalée d'une région déjà dessinée (flou de tremblement). La source se lit en pixels du canevas (y + DY),
    // la destination en repère de scène (la transformation de la scène ajoute déjà DY) : ne jamais rajouter DY à la destination.
    const DY = (eq.dim && eq.dim.DY) || 0;
    const copie = (c, x, y, w, h, dx, dy) => { try { c.drawImage(c.canvas, x, y + DY, w, h, x + dx, y + dy, w, h); } catch { /* repli : pas d'effet */ } };
    const melange = (c1, c2, k) => {
      const h = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      const a = h(c1), b = h(c2);
      return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
    };
    function ovale(c, cx, cy, rx, ry, col) {
      c.fillStyle = col;
      for (let j = -ry; j < ry; j++) {
        const v = (j + 0.5) / ry, d = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
        if (d > 0) c.fillRect(Math.round(cx - d), Math.round(cy + j), d * 2, 1);
      }
    }

    const FEUILLES = [[-6, -8, 5, 2], [6, -9, 5, 2], [-4, -14, 4, 2], [5, -15, 4, 2], [0, -20, 3, 3], [-8, -3, 4, 2], [8, -4, 4, 2]];
    const NOTES = [[237, 20, '#ffe27a'], [251, 22, '#8fd3ff'], [264, 20, '#ff9fb2'], [242, 33, '#b8f28a'], [257, 34, '#f4f1ea']];

    const dessins = {
      plante(c, t, e, dt, calme) {
        const { fane, chute } = L.etatPlante(dt, calme, e.duree);
        const bx = 130, by = 152;
        const off = (i, f) => (calme ? 0 : Math.round(Math.sin(t / 1600 + i * 0.9) * f));
        if (fane > 0.01) {
          c.save(); c.globalAlpha = Math.min(0.85, fane * 0.85);
          FEUILLES.forEach(([dx, dy, rx, ry], i) => ovale(c, bx + dx + off(i, -dy / 14), by + dy + Math.round(fane * 2), rx, ry, i % 2 ? '#b5a045' : '#8a7434'));
          c.restore();
        }
        if (calme || chute <= 0 || chute >= 1) return;
        c.save();
        FEUILLES.slice(0, 5).forEach(([dx, dy], i) => {
          const dep = (i * 0.12), k = Math.max(0, Math.min(1, (chute - dep) / (1 - dep)));
          if (k <= 0) return;
          const x = bx + dx + Math.sin(k * 6 + i) * 4, y = by + dy + k * (14 - dy);
          c.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
          rect(c, x, y, 3, 2, '#b5a045'); rect(c, x, y, 1, 1, '#d8c870');
        });
        c.restore();
      },
      fenetre(c, t, e, dt, calme) {
        const amp = L.vibration(dt, e.duree, calme);
        if (calme) { // état fixe : reflet sur la vitre le temps de la bulle
          c.save(); c.globalAlpha = 0.35; c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.strokeRect(26.5, 14.5, 76, 42); c.restore(); return;
        }
        const j = Math.round(Math.sin(dt / 35) * 2 * amp);
        // La vitre ne déborde jamais sur les rideaux : la recopie est rognée au cadre intérieur.
        if (j) { c.save(); c.beginPath(); c.rect(25, 13, 78, 44); c.clip(); copie(c, 25, 13, 78, 44, j, 0); c.restore(); }
        // Rideaux qui ondulent vers l'intérieur : recopie de ce qui est réellement dessiné (couleur du thème conservée), jamais de couleur figée.
        for (const [x0, sens] of [[12, 1], [104, -1]]) {
          const d = Math.round(Math.sin(dt / 110 + x0) * 2 * amp) + Math.round(1.5 * amp * sens);
          if (d) { c.save(); c.beginPath(); c.rect(x0 - 4, 7, 20, 56); c.clip(); copie(c, x0, 7, 12, 56, d, 0); c.restore(); }
        }
      },
      lampe() { /* état permanent, dessiné par dessinLampe */ },
      ordinateur(c, t, e, dt, calme) {
        const a = eq.agents().find((x) => x.cle === e.cle); if (!a) return;
        const [bx, by] = L.boiteMoniteur(a), env = L.enveloppe(dt, e.duree, calme);
        c.save(); c.beginPath(); c.rect(bx + 1, by + 1, 22, 14); c.clip();
        c.globalAlpha = 0.35 * env; for (let y = by + 1; y < by + 15; y += 2) rect(c, bx + 1, y, 22, 1, '#0a0819');
        if (!calme && dt < 160) { c.globalAlpha = 0.35 * (1 - dt / 160); rect(c, bx + 1, by + 1, 22, 14, '#ffffff'); }
        c.restore();
      },
      tasse(c, t, e, dt, calme) {
        const a = eq.agents().find((x) => x.cle === e.cle); if (!a) return;
        const [bx, by] = L.boiteTasse(a), amp = L.vibration(dt, e.duree, calme);
        if (!calme) { const j = Math.round(Math.sin(dt / 28) * 1.5 * amp); if (j) copie(c, bx, by + 4, 10, 9, j, 0); }
        const env = L.enveloppe(dt, e.duree, calme);
        c.save(); c.fillStyle = '#ffffff';
        for (let k = 0; k < 3; k++) {
          const ph = calme ? 0.3 + k * 0.2 : ((dt / 700) + k * 0.33) % 1;
          c.globalAlpha = 0.8 * env * (1 - ph);
          for (let i = 0; i < 4; i++) c.fillRect(Math.round(bx + 3 + k * 2 + (calme ? 0 : Math.sin(ph * 6 + i + k) * 1.2)), Math.round(by - 1 - ph * 10 - i), 1, 1);
        }
        c.restore();
      },
      horloge(c, t, e, dt, calme) {
        const env = L.enveloppe(dt, e.duree, calme);
        c.save(); c.fillStyle = '#ffd04d'; c.globalAlpha = 0.85 * env;
        for (let i = 0; i < 48; i++) { const an = (i / 48) * Math.PI * 2; c.fillRect(Math.round(199.5 + Math.sin(an) * 15.5), Math.round(32.5 - Math.cos(an) * 15.5), 1, 1); }
        c.restore();
      },
      tableau(c, t, e, dt, calme) {
        const env = L.enveloppe(dt, e.duree, calme);
        c.save(); c.beginPath(); c.rect(130, 16, 38, 30); c.clip();
        if (calme) { c.globalAlpha = 0.18; rect(c, 130, 16, 38, 30, '#ffffff'); }
        else {
          const x = 124 + (dt / e.duree) * 52; c.globalAlpha = 0.45 * env;
          c.fillStyle = '#ffffff'; for (let y = 16; y < 46; y++) c.fillRect(Math.round(x - (y - 16) * 0.5), y, 5, 1);
        }
        c.restore();
      },
      panneau(c, t, e, dt, calme) {
        const [x, y, col] = NOTES[(e.aux.note | 0) % NOTES.length], env = L.enveloppe(dt, e.duree, calme);
        const h = calme ? -1 : -1 - Math.round(env);
        rect(c, x + 2, y + 2 + h, 10, 9, 'rgba(0,0,0,.25)'); rect(c, x, y + h, 10, 9, col); rect(c, x + 2, y + 3 + h, 6, 1, '#00000026'); rect(c, x + 2, y + 5 + h, 4, 1, '#00000026'); rect(c, x + 4, y + h, 1, 1, '#d6455d');
      },
      etagere(c, t, e, dt, calme) {
        const env = L.enveloppe(dt, e.duree, calme);
        c.save(); c.fillStyle = '#e8e2d4';
        for (let i = 0; i < 14; i++) {
          const k = calme ? 0.4 : (dt / e.duree + alea(i + e.aux.graine) * 0.5) % 1;
          c.globalAlpha = 0.6 * env * (1 - k * 0.5);
          c.fillRect(Math.round(294 + alea(i + 3 + e.aux.graine) * 88 + (calme ? 0 : Math.sin(k * 7 + i) * 2)), Math.round(32 - k * 18 + alea(i + 9) * 8), 1, 1);
        }
        c.restore();
      }
    };

    // Lampe éteinte : abat-jour assombri et pièce un peu plus sombre ; lueur chaude juste après l'allumage.
    function dessinLampe(c, t) {
      const calme = api.calme(), maint = performance.now();
      if (!lampe.allumee) {
        c.save(); c.fillStyle = 'rgba(16,12,40,.55)'; c.fillRect(260, 97, 18, 12);
        c.fillStyle = 'rgba(16,12,40,.16)'; for (let r = 40; r > 8; r -= 8) { c.beginPath(); c.arc(269, 112, r, 0, Math.PI * 2); c.fill(); }
        c.restore();
      } else {
        const l = L.lueurLampe(lampe, maint, calme);
        if (l > 0) {
          c.save(); c.globalCompositeOperation = 'lighter';
          for (let r = 34; r > 6; r -= 7) { c.globalAlpha = 0.07 * l; c.fillStyle = '#ffcf8a'; c.beginPath(); c.arc(269, 112, r, 0, Math.PI * 2); c.fill(); }
          c.restore();
        } else if (calme && maint - lampe.depuis < 900) { c.save(); c.globalAlpha = 0.12; c.fillStyle = '#ffcf8a'; c.beginPath(); c.arc(269, 112, 22, 0, Math.PI * 2); c.fill(); c.restore(); }
      }
    }

    const DECALE = { plante: 'plante', horloge: 'horloge', tableau: 'tableau', panneau: 'panneau' };
    api.dessin((c, t) => {
      dessinLampe(c, t);
      const calme = api.calme();
      for (let i = effets.length - 1; i >= 0; i--) {
        const e = effets[i], dt = Math.max(0, t - e.debut);
        if (dt >= e.duree) { effets.splice(i, 1); continue; }
        const f = dessins[e.type];
        if (!f) continue;
        // Décor déplacé par royaume.js : l'effet suit l'objet (plante, horloge, tableau, panneau). Plante remplacée : pas de feuilles brunes.
        const d = DECALE[e.type] && eq.deco && eq.deco.decalage ? eq.deco.decalage(DECALE[e.type]) : null;
        if (e.type === 'plante' && eq.deco && eq.deco.remplace && eq.deco.remplace('plante')) continue;
        if (d && (d[0] || d[1])) { c.save(); c.translate(d[0], d[1]); try { f(c, t, e, dt, calme); } finally { c.restore(); } }
        else f(c, t, e, dt, calme);
      }
    });
  });
})();
