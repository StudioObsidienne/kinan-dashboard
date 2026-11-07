// Mode fouet : un fouet caché sur le mur (à côté de l'horloge) active un curseur fouet ; cliquer un agent fait claquer la lanière
// (déroulé, claquement, éclair et onde, petit bruit synthétisé) et l'agent réagit selon son état visuel.
// Purement visuel : dessin superposé, bulles, son. Aucune écriture d'état, aucun envoi à un agent, aucun appel vers le processus principal.
// Drafion fondu : l'évènement 'kinan-egg-fouet' ({ cle, cat, pris }) laisse drafion-sommeil.js jouer son réveil brutal.
// Échap ou un nouveau clic sur le crochet désactive.
(function () {
  'use strict';
  if (!window.KinanEgg || !window.FouetLogique) return;
  const L = window.FouetLogique;

  window.KinanEgg.module('fouet', (api) => {
    const eq = window.KinanEquipe, doc = document;
    const toile = doc.getElementById('toile'), cadre = toile && toile.parentElement;
    if (!cadre || !eq.dim) throw new Error('bureau absent');
    const { W, H, DY } = eq.dim;

    let mode = L.creerMode();
    let surAgent = false, dedans = false, survolFouet = false;
    let pointeur = { x: W / 2, y: H / 2 }, ecartManche = 12;
    const reactions = {}, derniers = {}, eveil = {}, dernierMsg = {};
    const coups = []; // lanières en vol : { debut, sx, sy, tx, ty }

    // ---- curseur et indicateur (feuille de style locale, data-URI local) ----
    const style = doc.createElement('style');
    style.textContent = '.egg-fouet-on, .egg-fouet-on * { cursor: ' + L.curseurCss(false) + ' !important; }'
      + '.egg-fouet-on.egg-fouet-cible, .egg-fouet-on.egg-fouet-cible * { cursor: ' + L.curseurCss(true) + ' !important; }'
      + '.egg-fouet-badge { position:absolute; top:4px; left:4px; z-index:6; pointer-events:none; font:10px/1.4 monospace; color:#ffd04d;'
      + ' background:rgba(29,23,41,.78); border:1px solid rgba(255,208,77,.35); border-radius:3px; padding:0 5px; opacity:.85; }'
      + '.egg-fouet-badge[hidden] { display:none; }';
    doc.head.appendChild(style);
    const badge = doc.createElement('div');
    badge.className = 'egg-fouet-badge'; badge.setAttribute('role', 'status'); badge.hidden = true;
    badge.textContent = 'Mode fouet · Échap pour quitter';
    cadre.appendChild(badge);

    function appliquerCurseur() {
      const c = L.curseur(mode, surAgent, dedans);
      cadre.classList.toggle('egg-fouet-on', c !== 'defaut');
      cadre.classList.toggle('egg-fouet-cible', c === 'fouet-cible');
    }
    function definirMode(m) {
      mode = m;
      badge.hidden = !mode.actif;
      if (bouton) bouton.setAttribute('aria-pressed', mode.actif ? 'true' : 'false');
      if (!mode.actif) surAgent = false;
      appliquerCurseur(); api.salir();
    }

    // ---- bouton caché : un fouet accroché au mur, entre l'horloge et le panneau de liège ----
    const BOITE = [215, 18, 14, 30];
    const z = api.zone('Fouet accroché au mur (mode fouet)', BOITE, { clic: () => { definirMode(L.basculer(mode)); api.son({ type: 'triangle', f0: 520, f1: 260, duree: 0.12, volume: 0.04 }); }, min: 24, z: 3 });
    const bouton = z && z.bouton;
    if (bouton) {
      bouton.setAttribute('aria-pressed', 'false');
      const sur = () => { survolFouet = true; api.salir(); }, hors = () => { survolFouet = false; api.salir(); };
      bouton.addEventListener('mouseenter', sur); bouton.addEventListener('focus', sur);
      bouton.addEventListener('mouseleave', hors); bouton.addEventListener('blur', hors);
    }

    // ---- pointeur et clics ----
    const enScene = (ev) => {
      const r = toile.getBoundingClientRect();
      ecartManche = r.width > 0 ? Math.max(6, Math.min(20, (22 * W) / r.width)) : 12; // le manche du curseur est ~22 px CSS en bas à droite de la pointe
      return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H - DY };
    };
    cadre.addEventListener('pointerenter', () => { dedans = true; appliquerCurseur(); });
    cadre.addEventListener('pointerleave', () => { dedans = false; surAgent = false; appliquerCurseur(); });
    cadre.addEventListener('pointermove', (ev) => {
      dedans = true; pointeur = enScene(ev);
      if (!mode.actif) return;
      const cible = !!L.agentSous(pointeur.x, pointeur.y, eq.agents());
      if (cible !== surAgent) { surAgent = cible; appliquerCurseur(); }
    });
    doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && mode.actif) definirMode(L.arreter()); });
    // Capture : un coup de fouet sur un agent ne déclenche ni le détail de l'agent ni les micro-interactions du décor.
    cadre.addEventListener('click', (ev) => {
      if (!mode.actif || !ev.detail) return; // detail 0 : clic clavier ou programmatique, on laisse faire
      if (bouton && bouton.contains(ev.target)) return;
      pointeur = enScene(ev);
      const a = L.agentSous(pointeur.x, pointeur.y, eq.agents());
      if (!a) return;
      ev.stopPropagation(); ev.preventDefault();
      fouetter(a);
    }, true);

    function fouetter(a) {
      const now = api.horloge();
      if (!L.peutFouetter(derniers, a.cle, now) || reactions[a.cle]) return;
      const e = api.etats()[a.cle]; if (!e) return;
      derniers[a.cle] = now;
      const cat = L.categorie(e.etat, e.depuis, now, eveil[a.cle] || 0);
      // lanière : du manche (en bas à droite de la pointe du curseur) vers le haut de la tête, côté curseur
      const sens = pointeur.x >= a.cx ? 1 : -1, l = L.lanier(pointeur, a, sens, ecartManche);
      const debut = performance.now();
      coups.push({ debut, sx: l.sx, sy: l.sy, tx: l.tx, ty: l.ty });
      // un module peut prendre la réaction à son compte (Drafion fondu : réveil brutal de drafion-sommeil.js)
      const d = { cle: a.cle, cat, pris: false, retard: api.calme() ? 0 : L.IMPACT };
      api.emettre('kinan-egg-fouet', d);
      const cm = d.pris ? 'fondu' : cat, m = L.choisir(L.MESSAGES[cm], Math.random, dernierMsg[a.cle + cm]);
      dernierMsg[a.cle + cm] = m.index;
      if (cat === 'endormi') eveil[a.cle] = now + L.DUREE.endormi + L.DELAI_EVEIL;
      if (!d.pris) reactions[a.cle] = { debut: debut + L.IMPACT, cat, sens };
      window.setTimeout(() => api.bulle(a.cle, m.texte, Math.min(2400, L.DUREE[cat] || 1800)), api.calme() ? 0 : L.IMPACT);
      claquer();
      api.salir();
    }

    // ---- son : sifflement de la lanière puis claquement bref (bruit filtré), calé sur l'impact ; muet par défaut ----
    let ac = null, bruit = null;
    function claquer() {
      if (api.muet() || doc.hidden) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        if (!ac) ac = new AC();
        if (ac.state === 'suspended' && ac.resume) ac.resume().catch(() => {});
        if (!bruit) { const n = Math.floor(ac.sampleRate * 0.5); bruit = ac.createBuffer(1, n, ac.sampleRate); const d = bruit.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
        const t0 = ac.currentTime + 0.005, tc = t0 + (api.calme() ? 0 : L.IMPACT / 1000);
        const voie = (t, att, fin, vol, filtres) => {
          const s = ac.createBufferSource(), e = ac.createGain(); s.buffer = bruit;
          let n = s; for (const [type, f, q, f2] of filtres) { const b = ac.createBiquadFilter(); b.type = type; b.Q.value = q; b.frequency.setValueAtTime(f, t); if (f2) b.frequency.exponentialRampToValueAtTime(f2, fin); n.connect(b); n = b; }
          e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + att); e.gain.exponentialRampToValueAtTime(0.0001, fin);
          n.connect(e); e.connect(ac.destination); s.start(t); s.stop(fin + 0.02);
        };
        if (tc > t0 + 0.03) voie(t0, tc - t0 - 0.01, tc + 0.015, 0.018, [['bandpass', 500, 1.1, 2600]]); // sifflement
        voie(tc, 0.0015, tc + 0.05, 0.12, [['highpass', 1700, 0.7]]);                                   // claquement
        voie(tc + 0.004, 0.003, tc + 0.11, 0.035, [['bandpass', 3400, 2.5]]);                         // petite queue
      } catch { /* son facultatif */ }
    }

    // ---- dessin ----
    const K = '#1d1729';
    const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
    const motif = (c, m, x, y, col, ombre) => {
      for (const [dx, dy, coul] of ombre ? [[1, 1, K], [0, 0, col]] : [[0, 0, col]]) {
        c.fillStyle = coul;
        for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) if (m[j][i] === '#') c.fillRect(Math.round(x) + i + dx, Math.round(y) + j + dy, 1, 1);
      }
    };
    const MOTIFS = {
      excl: ['##', '##', '##', '..', '##'],
      inter: ['.###.', '##.##', '...##', '..##.', '.....', '..##.'],
      etoile: ['.#.', '###', '.#.'],
      goutte: ['.#.', '###', '###', '.#.'],
      z: ['###', '.#.', '###']
    };

    function dessinFouetMural(c, t) {
      // crochet
      rect(c, 220, 20, 4, 2, '#9aa0b4'); rect(c, 221, 22, 2, 2, '#6b7088');
      if (mode.actif) { // le fouet est dans la main : on ne voit que sa silhouette fantôme
        c.save(); c.globalAlpha = 0.18; rect(c, 219, 24, 6, 10, '#7a4a2e'); c.restore();
      } else {
        const bal = api.calme() ? 0 : Math.round(Math.sin(t / 700) * (survolFouet ? 1.5 : 0.4));
        c.save();
        c.globalAlpha = survolFouet ? 1 : 0.8;
        // poignée : contour, cuir, anneaux de cuir clair
        rect(c, 219, 23, 6, 12, K); rect(c, 220, 24, 4, 10, '#7a4a2e'); rect(c, 220, 24, 1, 10, '#a8703f');
        rect(c, 220, 27, 4, 1, '#c9955c'); rect(c, 220, 31, 4, 1, '#c9955c');
        // lanière enroulée sous la poignée, bout qui pend
        rect(c, 217, 35, 10, 7, K); rect(c, 218, 36, 8, 5, '#4a2f1e'); rect(c, 219, 37, 6, 3, '#6b4430'); rect(c, 220, 38, 4, 1, '#4a2f1e');
        rect(c, 224 + bal, 42, 2, 4, K); rect(c, 224 + bal, 42, 1, 4, '#4a2f1e');
        if (survolFouet) { c.globalAlpha = 0.9; c.strokeStyle = '#ffd04d'; c.lineWidth = 1; c.strokeRect(216.5, 22.5, 11, 24); }
        c.restore();
      }
    }

    // Lanière : courbe déroulée puis claquée (L.lanierPose), dessinée en pixels avec un contour sombre ; éclair, onde et étincelles à l'impact.
    function dessinCoup(c, k, dt, calme) {
      const q = L.lanierPose(dt, calme);
      if (q.fini) return false;
      c.save();
      if (q.longueur > 0) {
        const pts = L.courbe(k, q), n = pts.length;
        c.globalAlpha = q.opacite;
        for (let i = 0; i < n; i++) { const [x, y] = pts[i], w = i < n * 0.35 ? 2 : 1; rect(c, x, y + 1, w, w, K); }
        for (let i = 0; i < n; i++) { const [x, y] = pts[i], w = i < n * 0.35 ? 2 : 1; rect(c, x, y, w, w, i > n * 0.85 ? '#c9955c' : '#7a4a2e'); }
      }
      if (q.flash > 0) { // éclat de l'impact
        c.globalAlpha = q.flash; const s = Math.round(2 + 3 * q.flash);
        rect(c, k.tx - s, k.ty, 2 * s + 1, 1, '#ffd04d'); rect(c, k.tx, k.ty - s, 1, 2 * s + 1, '#ffd04d');
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rect(c, k.tx + dx * (s - 1), k.ty + dy * (s - 1), 1, 1, '#ffffff');
        rect(c, k.tx - 1, k.ty - 1, 3, 3, '#ffffff');
      }
      if (q.eclair > 0) { // petit éclair qui part à l'opposé du manche
        c.globalAlpha = q.eclair;
        for (const [x, y] of L.eclair(k)) { rect(c, x + 1, y + 1, 1, 1, K); rect(c, x, y, 1, 1, '#fff1a8'); }
      }
      if (q.onde > 0 && q.onde < 1) { // onde de choc
        const r = 2 + 12 * q.onde, m = Math.max(8, Math.round(r * 4));
        c.globalAlpha = 1 - q.onde;
        for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2; rect(c, k.tx + Math.cos(a) * r, k.ty + Math.sin(a) * r * 0.7, 1, 1, '#fff1a8'); }
        for (let i = 0; i < 6; i++) { // étincelles
          const a = i * 1.047 + 0.4, d = 3 + 14 * q.onde;
          rect(c, k.tx + Math.cos(a) * d, k.ty + Math.sin(a) * d + 6 * q.onde * q.onde, 1, 1, i % 2 ? '#ffffff' : '#ffd04d');
        }
      }
      c.restore();
      return true;
    }

    const exprDe = (a, pose) => {
      const g = pose.suitCurseur ? L.regard(a.cx, a.haut - (a.ry || 9), pointeur.x, pointeur.y) : { lx: 0, ly: pose.yeux === 'grand' ? -1 : 0 };
      return { yeux: pose.yeux, bouche: pose.bouche, lx: g.lx, ly: g.ly, sourcil: pose.sourcil };
    };
    // Pose de réaction à l'instant t (ms image) ; null avant l'impact de la lanière ou sans réaction.
    const poseDe = (cle, t) => { const r = reactions[cle]; return r && t >= r.debut ? Object.assign(L.reaction(r.cat, t - r.debut, api.calme(), r.sens), { t: t - r.debut }) : null; };

    // Corps de l'agent fouetté : redessiné à sa place dans la scène (derrière le bureau, couleurs de l'agent) ; repli superposé sinon.
    const avecScene = typeof eq.corpsDe === 'function';
    if (avecScene) {
      for (const ag of eq.agents()) eq.corpsDe(ag.cle, {
        corps(c, a, cx, cy, p, t) {
          const pose = poseDe(a.cle, t);
          if (!pose || pose.fini || !window.Avatars) return false;
          window.Avatars.corps(c, a, a.cx + pose.dx, a.haut - a.ry + 2 + pose.dy, exprDe(a, pose));
          p.bulle = null; // la bulle de la scène laisse place à celle du fouet
          return true;
        }
      });
    }
    function dessinTete(c, a, pose) {
      const av = window.Avatars, prof0 = av && av.PROFILS && av.PROFILS[a.cle];
      if (!prof0 || !av.corps) return;
      const prof = Object.assign({ cle: a.cle }, prof0);
      const cx = a.cx + pose.dx, cy = a.haut - prof.ry + 2 + pose.dy;
      if (!avecScene) {
        c.save();
        c.beginPath(); c.rect(a.cx - prof.rx - 7, a.haut - 50, 2 * prof.rx + 14, 50); c.clip(); // jamais sous le plateau du bureau
        av.corps(c, prof, cx, cy, exprDe(Object.assign({}, a, { ry: prof.ry }), pose));
        c.restore();
      }
      // marques au-dessus de la tête
      const mx = a.cx + prof.rx + 2, my = cy - prof.ry - 8, calme = api.calme();
      c.save();
      for (const nom of pose.marques) {
        if (nom === 'excl') motif(c, MOTIFS.excl, mx, my, '#ff6b6b', true);
        else if (nom === 'inter') motif(c, MOTIFS.inter, mx, my, '#ffd166', true);
        else if (nom === 'etoiles') {
          const alt = calme || Math.floor(pose.t / 150) % 2;
          motif(c, MOTIFS.etoile, a.cx - prof.rx - 5, my + 3, '#ffd166', false);
          if (alt) motif(c, MOTIFS.etoile, mx, my, '#ffffff', false);
        } else if (nom === 'goutte') motif(c, MOTIFS.goutte, a.cx + prof.rx - 1, cy - prof.ry + 3, '#8fd3ff', false);
        else if (nom === 'zzz') { motif(c, MOTIFS.z, mx, my + 2, '#ffffff', true); }
      }
      c.restore();
    }

    api.dessin((c, t) => {
      dessinFouetMural(c, t);
      const agents = eq.agents(), calme = api.calme();
      for (const cle of Object.keys(reactions)) {
        const a = agents.find((x) => x.cle === cle), pose = poseDe(cle, t);
        if (!a || (pose && pose.fini)) { delete reactions[cle]; continue; }
        if (pose) dessinTete(c, a, pose);
      }
      for (let i = coups.length - 1; i >= 0; i--) if (!dessinCoup(c, coups[i], t - coups[i].debut, calme)) coups.splice(i, 1);
    });
    api.visible((vis) => { if (!vis) { surAgent = false; coups.length = 0; } });
  });
})();
