// Cinématique « Jean, l'être suprême » (logique : jean-logique.js). Déclenchée par 'kinan-egg-jean' (bouton secret de la chasse) ou ?egg-jean=1 (test, rien n'est écrit).
// Jean a le même modèle que les agents (window.Avatars), entièrement blanc et lumineux, yeux couleur feu : apparence céleste et mystérieuse,
// descente lente, lumière douce, particules fluides, aura discrète. Aucune scène religieuse.
// Personnage décoratif, hors du système d'agents : aucune lecture ni écriture d'état d'agent. Zéro réseau ; chant de voix douces synthétisé (Web Audio).
// Fin ou « Passer » : une particule devient le bouton « Paramètres du royaume » (émet 'kinan-egg-royaume'), persistant via kinan-os.egg.jean.etat.
(function () {
  'use strict';
  if (!window.KinanEgg || !window.JeanLogique) return;
  const L = window.JeanLogique;
  const ARPEGES = { intro: L.planArpege(L.PARTITION.intro), finale: L.planArpege(L.PARTITION.finale) };

  window.KinanEgg.module('jean', (api) => {
    const doc = document, eq = window.KinanEquipe;
    const search = (window.location && window.location.search) || '';
    const test = L.modeTest(search);
    const avertir = (quoi, e) => { try { console.warn('KinanEgg jean ' + quoi + ' :', e && e.message); } catch { /* ignoré */ } };
    let courante = null, zoneRoyaume = null, royaume = false;

    // ---- bouton « Paramètres du royaume » (décor) ----
    function poserRoyaume() {
      royaume = true;
      if (zoneRoyaume) return;
      zoneRoyaume = api.zone(L.TEXTES.royaume, L.BOUTON_BOITE, {
        min: 24, z: 4,
        clic: () => { api.emettre('kinan-egg-royaume', { source: 'jean' }); } // ouvre le panneau (royaume.js)
      }) || true; // true : scène absente, on n'essaie pas deux fois
      if (zoneRoyaume !== true && zoneRoyaume.bouton) zoneRoyaume.bouton.title = L.TEXTES.royaume;
      api.salir();
    }
    api.dessin((c, t) => {
      if (!royaume) return;
      const [x, y] = L.BOUTON_BOITE, cx = x + 3, cy = y + 3;
      const pulse = api.calme() ? 0.6 : 0.5 + 0.5 * Math.sin(t / 420);
      c.save();
      c.globalAlpha = 0.25 + 0.35 * pulse; c.fillStyle = '#fff1a8';
      c.fillRect(cx - 3, cy - 1, 6, 2); c.fillRect(cx - 1, cy - 3, 2, 6);
      c.globalAlpha = 1; c.fillStyle = '#ffffff'; c.fillRect(cx - 1, cy - 1, 2, 2);
      c.restore();
    });

    // ---- cinématique ----
    function lancer() {
      if (courante) return;
      try { courante = creer(); } catch (e) { avertir('lancement', e); if (courante) courante.terminer('erreur'); courante = null; }
    }

    function creer() {
      const calme = api.calme();
      const plan = L.planMachine(L.TEXTES.lignes);
      const intro = L.chronologie('intro', { calme, plan });
      const finale = L.chronologie('finale', { calme });
      const debutParole = (intro.find((p) => p.nom === 'parole') || { debut: 0 }).debut;
      const graine = (api.horloge() % 100000) + 7;
      const tr = L.trajet(graine, 6, L.dureeFinale('course'));
      const SENS = graine % 2 ? 1 : -1, DUREE_ENVOL = L.dureeFinale('envol');
      const S = { mode: 'intro', t: 0, tf: 0, fini: false, raf: 0, dernier: 0, vus: 0, attente: false, fiche: false,
        son: !api.muet(), volume: L.borneVolume(api.stock.get('volume', L.VOLUME_DEFAUT)), eclats: null, depart: null, cible: null, bouton: null, v0: null };
      const avantFocus = doc.activeElement;
      const ecouteurs = [];
      const sur = (cible, type, fn, opt) => { cible.addEventListener(type, fn, opt); ecouteurs.push([cible, type, fn, opt]); };

      // ---- calque de dessin (calque animé du socle ; image fixe en mouvement réduit) ----
      let cv = calme ? null : api.calque();
      if (!cv) {
        const c = doc.createElement('canvas');
        c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
        c.setAttribute('aria-hidden', 'true'); doc.body.appendChild(c);
        cv = { canvas: c, ctx: c.getContext('2d'), retirer() { if (c.parentNode) c.parentNode.removeChild(c); } };
      }
      const g = cv.ctx;
      let LW = 1, LH = 1, u = 4;

      // ---- couche DOM : commandes, cible cliquable, bulle, fiche ----
      const OR = '#ffd04d', FOND = '#1d1729';
      const el = (tag, css, txt) => { const n = doc.createElement(tag); if (css) n.style.cssText = css; if (txt) n.textContent = txt; return n; };
      const couche = el('div', 'position:fixed;inset:0;z-index:10000;pointer-events:none;font:14px/1.45 system-ui,sans-serif;color:#f4f1ea');
      couche.setAttribute('role', 'region'); couche.setAttribute('aria-label', L.TEXTES.titre);
      const style = el('style');
      style.textContent = '.jean-bt{pointer-events:auto;min-height:32px;min-width:32px;padding:4px 12px;font:600 13px/1.2 system-ui,sans-serif;color:' + OR
        + ';background:' + FOND + ';border:2px solid ' + OR + ';border-radius:4px;cursor:pointer}.jean-bt:focus-visible,.jean-cible:focus-visible,.jean-vol:focus-visible{outline:2px solid #fff;outline-offset:3px}';
      const barre = el('div', 'position:absolute;top:10px;right:10px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;align-items:center;max-width:calc(100vw - 20px)');
      const bPasser = el('button', '', L.TEXTES.passer); bPasser.type = 'button'; bPasser.className = 'jean-bt';
      const bSon = el('button'); bSon.type = 'button'; bSon.className = 'jean-bt';
      const vol = el('input', 'pointer-events:auto;width:110px;min-height:24px;accent-color:' + OR); vol.className = 'jean-vol';
      vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.step = '5'; vol.value = String(Math.round(S.volume * 100)); vol.setAttribute('aria-label', L.TEXTES.volume);
      barre.append(bSon, vol, bPasser);
      const cible = el('button', 'position:absolute;pointer-events:auto;background:transparent;border:0;padding:0;margin:0;cursor:pointer;border-radius:12px');
      cible.type = 'button'; cible.className = 'jean-cible'; cible.hidden = true;
      cible.setAttribute('aria-label', L.TEXTES.titre); cible.setAttribute('aria-describedby', 'jean-fiche');
      const bulle = el('div', 'position:absolute;left:50%;transform:translateX(-50%);box-sizing:border-box;max-width:min(460px,calc(100vw - 32px));padding:10px 14px;'
        + 'font:600 15px/1.5 ui-monospace,Consolas,monospace;color:' + FOND + ';background:#fff;border:2px solid ' + FOND + ';border-radius:4px;white-space:pre-line;'
        + 'box-shadow:0 0 24px rgba(220,235,255,.45)');
      bulle.hidden = true; bulle.setAttribute('aria-hidden', 'true');
      const bulleTexte = el('span'), indice = el('span', 'display:block;margin-top:6px;font:13px/1.3 system-ui,sans-serif;color:#5a4a7a', L.TEXTES.indice);
      indice.style.display = 'none'; bulle.append(bulleTexte, indice);
      const lu = el('p', 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:0');
      lu.setAttribute('aria-live', 'polite');
      const fiche = el('div', 'position:absolute;box-sizing:border-box;width:min(260px,calc(100vw - 32px));padding:10px 12px;background:' + FOND + ';border:2px solid ' + OR + ';border-radius:6px');
      fiche.id = 'jean-fiche'; fiche.setAttribute('role', 'tooltip'); fiche.hidden = true;
      const F = L.TEXTES.fiche;
      fiche.append(el('strong', 'display:block;color:' + OR + ';font:700 15px/1.3 system-ui,sans-serif;letter-spacing:.04em', L.TEXTES.titre),
        el('span', 'display:block;margin-top:4px', F.titre), el('span', 'display:block', F.role), el('em', 'display:block;margin-top:4px;color:#fff1a8', F.devise));
      couche.append(style, barre, cible, bulle, fiche, lu);
      doc.body.appendChild(couche);

      // ---- audio : petit chant de voix douces (Web Audio : formants « aah / ooh », réverbération générée), créé au premier geste ou au clic qui lance la scène ----
      const A = { ctx: null, maitre: null, envoi: null, bruit: null, intro: false, finale: false };
      function audioPret() {
        if (A.ctx) return true;
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        try {
          const c = new AC(); A.ctx = c;
          const comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
          A.maitre = c.createGain(); A.maitre.gain.value = 0.0001;
          A.maitre.connect(comp); comp.connect(c.destination);
          // espace : réverbération à réponse générée (bruit stéréo assombri qui s'éteint en 3,4 s), aucun fichier
          const n = Math.floor(c.sampleRate * 3.4), ir = c.createBuffer(2, n, c.sampleRate);
          for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let b = 0; for (let i = 0; i < n; i++) { b = 0.55 * b + 0.45 * (Math.random() * 2 - 1); d[i] = b * Math.pow(1 - i / n, 2.6); } }
          const conv = c.createConvolver(); conv.buffer = ir;
          const humide = c.createGain(); humide.gain.value = 0.6;
          A.envoi = c.createGain(); A.envoi.gain.value = 1;
          A.envoi.connect(conv); conv.connect(humide); humide.connect(A.maitre);
          const nb = c.sampleRate; A.bruit = c.createBuffer(1, nb, c.sampleRate);
          const db = A.bruit.getChannelData(0); for (let i = 0; i < nb; i++) db[i] = Math.random() * 2 - 1;
          return true;
        } catch (e) { A.ctx = null; return false; }
      }
      function volumeAudio() {
        if (!A.ctx) return;
        const v = S.son && !doc.hidden ? 0.0001 + S.volume * 0.7 : 0.0001;
        A.maitre.gain.setTargetAtTime(v, A.ctx.currentTime, 0.08);
      }
      function sortie(noeud, envoi) {
        noeud.connect(A.maitre);
        if (envoi > 0) { const s = A.ctx.createGain(); s.gain.value = envoi; noeud.connect(s); s.connect(A.envoi); }
      }
      function enveloppe(t, att, fin, vol, rel) {
        const e = A.ctx.createGain(), v = Math.max(0.0002, vol);
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(v, t + att);
        e.gain.setValueAtTime(v, Math.max(t + att, fin - rel * 0.5));
        e.gain.exponentialRampToValueAtTime(0.0001, fin + rel);
        return e;
      }
      // Une voix : deux dents de scie à peine désaccordées (petit pupitre) et un souffle, vibrato lent qui arrive après l'attaque,
      // puis trois filtres de formants en parallèle qui passent d'une voyelle à l'autre (aah -> ooh...), panoramique selon la voix.
      function voix(m, t, d, vol, v0, v1, i) {
        const c = A.ctx, f = L.midiHz(m), fin = t + d, rel = 1.5, stop = fin + rel + 0.1;
        const env = enveloppe(t, Math.min(1.2, d * 0.45), fin, vol, rel);
        const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 4.6 + (i % 4) * 0.3;
        vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(10 + (i % 3) * 2, t + 1); vib.connect(vg);
        const melange = c.createGain(); melange.gain.value = 0.5;
        for (const det of [-4 - (i % 2) * 3, 5 + (i % 3) * 2]) {
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
          vg.connect(o.detune); o.connect(melange); o.start(t); o.stop(stop);
        }
        const sb = c.createBufferSource(), sg = c.createGain(); sb.buffer = A.bruit; sb.loop = true; sg.gain.value = 0.05;
        sb.connect(sg); sg.connect(melange); sb.start(t); sb.stop(stop);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.connect(env);
        const F0 = L.FORMANTS[v0] || L.FORMANTS.a, F1 = L.FORMANTS[v1] || F0;
        for (let k = 0; k < 3; k++) {
          const bp = c.createBiquadFilter(), gk = c.createGain(); bp.type = 'bandpass';
          bp.frequency.setValueAtTime(F0[k][0], t); bp.frequency.linearRampToValueAtTime(F1[k][0], fin);
          bp.Q.setValueAtTime(F0[k][0] / F0[k][2], t); bp.Q.linearRampToValueAtTime(F1[k][0] / F1[k][2], fin);
          gk.gain.setValueAtTime(F0[k][1] * 5, t); gk.gain.linearRampToValueAtTime(F1[k][1] * 5, fin);
          melange.connect(bp); bp.connect(gk); gk.connect(lp);
        }
        let s = env;
        if (c.createStereoPanner) { const pan = c.createStereoPanner(); pan.pan.value = ((i % 5) - 2) * 0.2; env.connect(pan); s = pan; }
        sortie(s, 0.75); vib.start(t); vib.stop(stop);
      }
      // Cloche légère (partiels un peu inharmoniques, longue extinction dans la réverbération).
      function cloche(m, t, vol) {
        const c = A.ctx, f = L.midiHz(m), e = c.createGain();
        e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        for (const [mul, g0] of [[1, 1], [2.76, 0.18], [5.4, 0.05]]) {
          const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = f * mul; og.gain.value = g0;
          o.connect(og); og.connect(e); o.start(t); o.stop(t + 2.3);
        }
        sortie(e, 1);
      }
      function jouer(partition, arpeges, ecoule) {
        if (!A.ctx) return;
        const base = A.ctx.currentTime + 0.05;
        partition.forEach((a, i) => {
          if (a.t + a.d <= ecoule) return;
          const debut = base + Math.max(0, a.t - ecoule) / 1000, duree = (a.d - Math.max(0, ecoule - a.t)) / 1000;
          if (duree < 0.2) return;
          const [v0, v1] = a.voyelles;
          a.basse.forEach((m, j) => voix(m, debut, duree, 0.16 * a.v, v0 === 'u' ? 'u' : 'o', v1 === 'u' ? 'u' : 'o', i * 7 + j));
          a.voix.forEach((m, j) => voix(m, debut, duree, 0.11 * a.v, v0, v1, i * 7 + j + 2));
        });
        for (const b of arpeges) if (b.t >= ecoule) cloche(b.m, base + (b.t - ecoule) / 1000, 0.05 * b.v);
      }
      function musique() {
        if (!S.son || !audioPret()) return;
        try {
          if (A.ctx.state === 'suspended' && A.ctx.resume) A.ctx.resume().catch(() => {});
          volumeAudio();
          if (S.mode === 'intro' && !A.intro) { A.intro = true; jouer(L.PARTITION.intro, ARPEGES.intro, S.t); }
          if (S.mode === 'finale' && !A.finale) { A.finale = true; jouer(L.PARTITION.finale, ARPEGES.finale, S.tf); }
        } catch (e) { avertir('audio', e); }
      }
      // Machine à écrire : petit « tic » de touche (bruit bref filtré + corps grave), clochette de fin de ligne.
      function lettre(ch) {
        if (!S.son || !A.ctx || doc.hidden) return;
        try {
          const c = A.ctx, t = c.currentTime + 0.005;
          if (ch === '\n') { cloche(91, t, 0.03); return; }
          const f = L.hauteurLettre(ch); if (!f) return;
          const s = c.createBufferSource(), bp = c.createBiquadFilter(), e = c.createGain(); s.buffer = A.bruit;
          bp.type = 'bandpass'; bp.frequency.value = 2300 + (f % 7) * 140; bp.Q.value = 1.4;
          e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.09, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
          s.connect(bp); bp.connect(e); sortie(e, 0.12); s.start(t, Math.random() * 0.5); s.stop(t + 0.04);
          const o = c.createOscillator(), oe = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.04);
          oe.gain.setValueAtTime(0.0001, t); oe.gain.exponentialRampToValueAtTime(0.06, t + 0.003); oe.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
          o.connect(oe); sortie(oe, 0); o.start(t); o.stop(t + 0.06);
        } catch (e) { /* son facultatif */ }
      }
      // Éclat final : souffle lumineux qui s'ouvre (bruit filtré qui monte) et trois cloches, sans choc.
      function boum() {
        if (!S.son || !A.ctx || doc.hidden) return;
        try {
          const c = A.ctx, t = c.currentTime + 0.01;
          const src = c.createBufferSource(), bp = c.createBiquadFilter(), e = c.createGain();
          src.buffer = A.bruit; src.loop = true; bp.type = 'bandpass'; bp.Q.value = 0.8;
          bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 1.2);
          e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.07, t + 0.25); e.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
          src.connect(bp); bp.connect(e); sortie(e, 0.9); src.start(t); src.stop(t + 1.7);
          [86, 90, 93].forEach((m, i) => cloche(m, t + 0.05 + i * 0.09, 0.025));
        } catch (e) { /* son facultatif */ }
      }
      function couperAudio() {
        if (!A.ctx) return;
        const c = A.ctx; A.ctx = null;
        try { A.maitre.gain.setTargetAtTime(0.0001, c.currentTime, 0.06); } catch { /* ignoré */ }
        window.setTimeout(() => { try { c.close(); } catch { /* ignoré */ } }, 400);
      }
      function majSon() { bSon.textContent = S.son ? L.TEXTES.sonOui : L.TEXTES.sonNon; }

      // ---- poussière de lumière (tableaux préalloués) : grains portés par un champ d'écoulement lisse, ils montent en volutes ----
      const N = 70, px = new Float32Array(N), py = new Float32Array(N), pv = new Float32Array(N), pt = new Float32Array(N), pf = new Float32Array(N);
      function semer() { for (let i = 0; i < N; i++) { px[i] = Math.random() * LW; py[i] = Math.random() * LH; pv[i] = 8 + Math.random() * 24; pt[i] = 1 + Math.random() * 2; pf[i] = Math.random() * 6.28; } }
      function poussiere(dt, t) {
        const s = dt / 1000;
        for (let i = 0; i < N; i++) {
          const fx = Math.sin(py[i] * 0.006 + t / 2300 + pf[i]) + 0.5 * Math.sin(py[i] * 0.017 - t / 1300 + pf[i] * 2);
          const fy = Math.cos(px[i] * 0.005 - t / 2700 + pf[i] * 0.5);
          px[i] += fx * pv[i] * 0.6 * s; py[i] += (fy * 0.35 - 1) * pv[i] * s;
          if (py[i] < -8 || px[i] < -8 || px[i] > LW + 8) { py[i] = LH + 6; px[i] = Math.random() * LW; }
        }
      }
      // grain lumineux pré-rendu (dégradé radial), réutilisé par toutes les particules
      const grain = doc.createElement('canvas'); grain.width = grain.height = 32;
      (() => {
        const c = grain.getContext('2d'), gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(240,246,255,0.65)'); gr.addColorStop(1, 'rgba(220,232,255,0)');
        c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
      })();
      const lueur = (x, y, s, a) => { if (a <= 0.004) return; g.globalAlpha = Math.min(1, a); g.drawImage(grain, x - s / 2, y - s / 2, s, s); };

      // ---- boule d'énergie : traînée (anneau), suiveurs à inertie, étincelles (tableaux préalloués) ----
      const B = { ok: false, x: 0, y: 0, vx: 0, vy: 0, k: 4 };
      const NT = 30, trX = new Float32Array(NT), trY = new Float32Array(NT);
      let trN = 0, trI = 0;
      const NS = 14, sx = new Float32Array(NS), sy = new Float32Array(NS), svx = new Float32Array(NS), svy = new Float32Array(NS), sk = new Float32Array(NS), sz = new Float32Array(NS), sph = new Float32Array(NS);
      for (let i = 0; i < NS; i++) { sk[i] = 16 + Math.random() * 64; sz[i] = 0.3 + Math.random() * 0.4; sph[i] = Math.random() * 6.28; }
      const NE = 72, ex = new Float32Array(NE), ey = new Float32Array(NE), evx = new Float32Array(NE), evy = new Float32Array(NE), ev = new Float32Array(NE), evm = new Float32Array(NE);
      let eI = 0;
      function preparerBoule(x, y) {
        B.ok = false; trN = 0; trI = 0; ev.fill(0);
        for (let i = 0; i < NS; i++) { sx[i] = x; sy[i] = y; svx[i] = 0; svy[i] = 0; }
      }
      function departEnvol() { return { x: tr.fin.x * LW, y: tr.fin.y * LH - 5 * u }; }
      function majBoule(ph, dt) {
        const n = ph.nom, s = Math.min(0.05, dt / 1000);
        let x = LW / 2, y = LH * 0.5 - 5 * u, vx = 0, vy = 0, k = u;
        if (n === 'course') {
          const q = L.surTrajet(tr, ph.p); x = q.x * LW; y = q.y * LH - 5 * u; vx = q.vx * LW; vy = q.vy * LH;
          S.v0 = { x: vx, y: vy };
        } else if (n === 'envol') {
          const a = S.depart || (S.depart = astreEcran()), d0 = departEnvol();
          const o = { tours: 2.2, sens: SENS, rayon: Math.min(LW, LH) * 0.14, v0: S.v0, duree: DUREE_ENVOL };
          const q = L.spirale(d0, a, ph.p, o), hp = 0.01, q2 = L.spirale(d0, a, Math.min(1, ph.p + hp), o), ds = (hp * DUREE_ENVOL) / 1000;
          x = q.x; y = q.y; vx = (q2.x - q.x) / ds; vy = (q2.y - q.y) / ds; k = u * lin(1, 0.45, ph.p);
        } else if (n !== 'contraction') { B.ok = false; return; }
        B.ok = true; B.x = x; B.y = y; B.vx = vx; B.vy = vy; B.k = k;
        trX[trI] = x; trY[trI] = y; trI = (trI + 1) % NT; if (trN < NT) trN++;
        // suiveurs : ressorts amortis de raideurs inégales, en orbite lâche (inertie, retards, petits dépassements)
        for (let i = 0; i < NS; i++) {
          const ang = sph[i] + S.tf / (260 + i * 37) * (i % 2 ? 1 : -1), r = k * (2.5 + (i % 4) * 1.2);
          const tx = x + Math.cos(ang) * r, ty = y + Math.sin(ang) * r * 0.8, kk = sk[i], am = 2 * sz[i] * Math.sqrt(kk);
          svx[i] += (kk * (tx - sx[i]) - am * svx[i]) * s; svy[i] += (kk * (ty - sy[i]) - am * svy[i]) * s;
          sx[i] += svx[i] * s; sy[i] += svy[i] * s;
        }
        // étincelles : plus elle file, plus elle en sème
        const v = Math.hypot(vx, vy), nb = n === 'contraction' ? 0 : Math.min(4, Math.floor(v / (70 * u))) + (Math.random() < 0.6 ? 1 : 0);
        for (let j = 0; j < nb; j++) {
          const i = eI; eI = (eI + 1) % NE;
          ex[i] = x; ey[i] = y; evx[i] = -vx * 0.12 + (Math.random() - 0.5) * 18 * u; evy[i] = -vy * 0.12 + (Math.random() - 0.5) * 18 * u;
          evm[i] = ev[i] = 0.35 + Math.random() * 0.7;
        }
        for (let i = 0; i < NE; i++) {
          if (ev[i] <= 0) continue;
          ev[i] -= s; ex[i] += evx[i] * s; ey[i] += evy[i] * s;
          evx[i] *= 1 - 2.2 * s; evy[i] = evy[i] * (1 - 2.2 * s) + 6 * u * s;
        }
      }

      // ---- géométrie ----
      const lin = (a, b, k) => a + (b - a) * k;
      const sinus = (q) => 0.5 - 0.5 * Math.cos(Math.PI * q);
      const accel = (q) => q * q * q;
      function dimensionner() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        LW = Math.max(1, window.innerWidth); LH = Math.max(1, window.innerHeight);
        cv.canvas.width = Math.round(LW * dpr); cv.canvas.height = Math.round(LH * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        u = Math.max(3, Math.min(9, Math.min(LW, LH) / 80));
        S.cible = null;
        if (calme) dessiner(0);
      }
      function versEcranScene(pt0) {
        const toile = doc.getElementById('toile');
        const r = toile && toile.getBoundingClientRect ? toile.getBoundingClientRect() : null;
        return L.versEcran(pt0, r, eq && eq.dim) || { x: LW * 0.15, y: LH * 0.12 };
      }
      function astreEcran() {
        let fen = null; try { fen = eq && eq.objets ? eq.objets.fenetre : null; } catch { fen = null; }
        return versEcranScene(L.astre(L.heureDepuis(search, new Date()), fen));
      }
      const boutonEcran = () => versEcranScene({ x: L.BOUTON_BOITE[0] + 3, y: L.BOUTON_BOITE[1] + 3 });

      // ---- dessin ----
      // Jean : le modèle des agents (Avatars.corps) avec un profil tout blanc, rendu une fois hors écran ; le contour sombre devient un
      // liseré bleuté très pâle. Yeux couleur feu dessinés par-dessus, petites mains qui flottent, lueur douce sous lui (il lévite).
      const PROFIL = { cle: 'jean', rx: 12, ry: 12, coul: '#ffffff', ombre: '#e3eafb', clair: '#ffffff', joue: '#ffe4d0' };
      const SPR = 40, SC = 20, YEUX = [15, 23], YEUX_Y = 18; // yeux du modèle (rx >= 11) : x = cx -/+ 5 et cx + 3, y = cy - 2, 2 x 3 pixels
      const modele = doc.createElement('canvas'); modele.width = modele.height = SPR;
      (() => {
        const c = modele.getContext('2d');
        if (window.Avatars && window.Avatars.corps) window.Avatars.corps(c, PROFIL, SC, SC, { yeux: 'aucun', bouche: 'sourire', lx: 0, ly: 0 });
        else { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(SC, SC, 12, 0, Math.PI * 2); c.fill(); }
        const im = c.getImageData(0, 0, SPR, SPR), d = im.data;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] + d[i + 1] + d[i + 2] < 240) { d[i] = 192; d[i + 1] = 210; d[i + 2] = 255; }
        c.putImageData(im, 0, 0);
      })();
      function mainJean(x, y, k) { // même dessin que les mains des agents (4 x 2 et liseré), en blanc
        g.fillStyle = '#c0d2ff';
        g.fillRect(x * k, (y - 1) * k, 4 * k, k); g.fillRect((x - 1) * k, y * k, 6 * k, 2 * k); g.fillRect(x * k, (y + 2) * k, 4 * k, k);
        g.fillStyle = '#ffffff'; g.fillRect(x * k, y * k, 4 * k, 2 * k);
      }
      function yeuxFeu(k, t) {
        const fl = calme ? 0.85 : 0.8 + 0.12 * Math.sin(t / 97) * Math.sin(t / 211 + 1) + 0.08 * Math.sin(t / 53);
        for (const ex of YEUX) { // braise : lueur orange-rouge autour de l'œil
          const x = (ex - SC + 1) * k, y = (YEUX_Y - SC + 1.5) * k, r = 3.4 * k;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(255,128,40,' + (0.7 * fl).toFixed(3) + ')'); gr.addColorStop(0.45, 'rgba(255,72,24,' + (0.28 * fl).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,60,20,0)');
          g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        for (const ex of YEUX) { // cœur de l'œil : pixels du modèle, rouge-orangé, point chaud doré, petite flamme qui lèche par instants
          const x0 = (ex - SC) * k, y0 = (YEUX_Y - SC) * k;
          g.fillStyle = '#ff3d14'; g.fillRect(x0, y0, 2 * k, 3 * k);
          g.fillStyle = '#ff8a24'; g.fillRect(x0, y0, 2 * k, 2 * k);
          g.fillStyle = '#ffe28a'; g.fillRect(x0, y0, k, k);
          if (!calme && Math.sin(t / 83 + ex) > 0.35) { g.globalAlpha *= 0.6; g.fillStyle = '#ff7424'; g.fillRect(x0 + (Math.sin(t / 140 + ex) > 0 ? k : 0), y0 - k, k, k); g.globalAlpha /= 0.6; }
        }
      }
      function jean(cx, cy, k, alpha, t, eclat, incl) {
        const vit = calme ? 0 : 1, flotte = Math.sin(t / 1300) * 0.8 * vit;
        g.save(); g.globalAlpha = alpha; g.translate(cx, cy - 6 * k + flotte * k); if (incl) g.rotate(incl);
        // lueur sous lui : il flotte (plus diffuse quand il monte)
        g.save(); g.scale(1, 0.32);
        const yl = (17 * k) / 0.32, lv = g.createRadialGradient(0, yl, 0, 0, yl, 11 * k);
        lv.addColorStop(0, 'rgba(225,236,255,' + (0.3 - 0.06 * flotte).toFixed(3) + ')'); lv.addColorStop(1, 'rgba(225,236,255,0)');
        g.fillStyle = lv; g.fillRect(-11 * k, yl - 11 * k, 22 * k, 22 * k); g.restore();
        // mains ouvertes de part et d'autre, en léger contretemps
        const m1 = calme ? 0 : Math.sin(t / 1100) * 1.2, m2 = calme ? 0 : Math.sin(t / 1100 + 2.1) * 1.2;
        g.shadowColor = 'rgba(225,236,255,0.9)'; g.shadowBlur = k * 3;
        mainJean(-19, 2 + m1, k); mainJean(15, 2 + m2, k);
        // corps : le modèle des agents, net (pixels) et rayonnant
        g.imageSmoothingEnabled = false;
        g.shadowBlur = k * (5 + 6 * eclat);
        g.drawImage(modele, -SC * k, -SC * k, SPR * k, SPR * k);
        g.shadowBlur = 0; g.imageSmoothingEnabled = true;
        yeuxFeu(k, t);
        g.restore();
      }
      // Aura discrète : clarté douce qui respire, ondes très légères, grains en orbite lente.
      function aura(cx, cy, k, force, ondes, t) {
        if (force <= 0 && ondes <= 0) return;
        g.save(); g.globalCompositeOperation = 'lighter';
        if (force > 0) {
          const r = k * (14 + 20 * force) * (calme ? 1 : 1 + 0.04 * Math.sin(t / 700));
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          gr.addColorStop(0, 'rgba(235,244,255,' + Math.min(1, 0.32 * force).toFixed(3) + ')');
          gr.addColorStop(0.5, 'rgba(200,220,255,' + Math.min(1, 0.1 * force).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(200,220,255,0)');
          g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        if (ondes > 0) {
          g.lineWidth = k * 0.4;
          for (let n = 0; n < 2; n++) {
            const q = calme ? (n + 0.5) / 2 : ((t / 3200 + n / 2) % 1), rr = k * (12 + 24 * q);
            g.strokeStyle = 'rgba(225,238,255,' + (0.1 * ondes * (1 - q) * Math.min(1, q * 4)).toFixed(3) + ')';
            g.beginPath(); g.ellipse(cx, cy, rr, rr * 1.1, 0, 0, Math.PI * 2); g.stroke();
          }
          for (let i = 0; i < 16; i++) {
            const a = i * 2.39996 + (calme ? 0 : t / (2000 + (i % 5) * 450)) * (i % 2 ? 1 : -1);
            const rr = k * (13 + ((i * 7) % 12)), yb = calme ? 0 : Math.sin(t / 900 + i) * k;
            const al = 0.3 + 0.3 * (calme ? 0.5 : 0.5 + 0.5 * Math.sin(t / 430 + i * 1.7));
            lueur(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.2 + yb, k * (1.6 + (i % 3) * 0.7), al * ondes);
          }
        }
        g.restore();
      }
      // Lumière douce venue d'en haut, qui suit sa descente.
      function lumiere(cx, cy, lum) {
        if (lum <= 0) return;
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(LW / 2, -LH * 0.05, 0, LW / 2, -LH * 0.05, LH * 0.6);
        gr.addColorStop(0, 'rgba(230,240,255,' + (0.22 * lum).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(230,240,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, LW, LH * 0.6);
        const lg = g.createLinearGradient(0, 0, 0, cy + 14 * u);
        lg.addColorStop(0, 'rgba(225,236,255,' + (0.08 * lum).toFixed(3) + ')'); lg.addColorStop(1, 'rgba(225,236,255,' + (0.015 * lum).toFixed(3) + ')');
        g.fillStyle = lg; g.beginPath();
        g.moveTo(LW / 2 - LW * 0.04, 0); g.lineTo(LW / 2 + LW * 0.04, 0); g.lineTo(cx + 18 * u, cy + 14 * u); g.lineTo(cx - 18 * u, cy + 14 * u); g.fill();
        g.restore();
      }
      function dessinPoussiere(lum, t) {
        if (lum <= 0) return;
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < N; i++) lueur(px[i], py[i], pt[i] * 3.4, (0.22 + 0.4 * (0.5 + 0.5 * Math.sin(t / 700 + pf[i] * 3))) * lum);
        g.restore();
      }
      // Apparition : des grains venus de tout l'écran tourbillonnent vers un point, qui devient une boule de lumière, puis Jean.
      function rassemblement(cx, cy, p, t) {
        g.save(); g.globalCompositeOperation = 'lighter';
        const R = Math.min(LW, LH), e = sinus(Math.min(1, p / 0.7)), fin = 1 - Math.max(0, (p - 0.62) / 0.38);
        for (let i = 0; i < 40; i++) {
          const r = R * (0.16 + (i % 7) * 0.05) * (1 - e), a = i * 2.39996 + 1.8 * e + (calme ? 0 : t / 4000);
          lueur(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, u * (1 + (i % 3) * 0.5), Math.min(1, p * 3) * fin * 0.8);
        }
        if (p > 0.3) {
          const q = sinus(Math.min(1, (p - 0.3) / 0.5)), rr = u * (2 + 7 * q) * (1 - 0.5 * Math.max(0, (p - 0.8) / 0.2));
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr * 2);
          gr.addColorStop(0, 'rgba(255,255,255,' + (0.9 * fin + 0.1).toFixed(3) + ')'); gr.addColorStop(0.4, 'rgba(235,244,255,0.4)'); gr.addColorStop(1, 'rgba(225,236,255,0)');
          g.fillStyle = gr; g.fillRect(cx - rr * 2, cy - rr * 2, rr * 4, rr * 4);
        }
        if (p > 0.55 && p < 0.95) { // anneau doux au moment où il prend forme
          const q = (p - 0.55) / 0.4;
          g.strokeStyle = 'rgba(235,244,255,' + (0.35 * (1 - q)).toFixed(3) + ')'; g.lineWidth = u * 0.6;
          g.beginPath(); g.ellipse(cx, cy, u * (6 + 22 * q), u * (6 + 22 * q) * 0.9, 0, 0, Math.PI * 2); g.stroke();
        }
        g.restore();
      }
      function boule(force, t) {
        if (!B.ok || force <= 0) return;
        const k = B.k;
        g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
        // traînée de lumière : trois passes superposées, de plus en plus courtes et vives (effilée, sans perles)
        for (const [lg, w, a] of [[NT, 4.4, 0.08], [18, 2.8, 0.14], [8, 1.5, 0.32]]) {
          const m = Math.min(lg, trN); if (m < 2) continue;
          g.strokeStyle = 'rgba(255,232,170,' + (a * force).toFixed(3) + ')'; g.lineWidth = k * w;
          g.beginPath();
          for (let j = 0; j < m; j++) { const i = (trI - m + j + NT) % NT; if (j) g.lineTo(trX[i], trY[i]); else g.moveTo(trX[i], trY[i]); }
          g.stroke();
        }
        for (let i = 0; i < NE; i++) {
          if (ev[i] <= 0) continue;
          const f = ev[i] / evm[i], s = 0.6 + k * 0.7 * f;
          g.fillStyle = 'rgba(255,226,150,' + (0.9 * f * force).toFixed(3) + ')';
          g.fillRect(ex[i] - s / 2, ey[i] - s / 2, s, s);
        }
        g.fillStyle = 'rgba(255,236,190,' + (0.75 * force).toFixed(3) + ')';
        for (let i = 0; i < NS; i++) { const s = k * (0.6 + (i % 3) * 0.25); g.fillRect(sx[i] - s / 2, sy[i] - s / 2, s, s); }
        // cœur : étiré dans le sens du mouvement (volume conservé), pulsation irrégulière
        const et = L.etirement(B.vx, B.vy, 90 * u), pu = calme ? 1 : L.pulsation(t);
        g.translate(B.x, B.y); g.rotate(et.angle); g.scale(et.long * pu, et.large * pu);
        const R = k * 7, gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
        gr.addColorStop(0, 'rgba(255,255,255,' + force.toFixed(3) + ')'); gr.addColorStop(0.22, 'rgba(255,246,210,' + (0.85 * force).toFixed(3) + ')');
        gr.addColorStop(0.5, 'rgba(255,214,120,' + (0.3 * force).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,214,120,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,' + force.toFixed(3) + ')'; g.beginPath(); g.arc(0, 0, k * 1.5, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      function voile(a) { if (a > 0) { g.fillStyle = 'rgba(6,4,18,' + a.toFixed(3) + ')'; g.fillRect(0, 0, LW, LH); } }

      function placerCible(cx, cy) {
        const cle = Math.round(cx) + ',' + Math.round(cy) + ',' + u;
        if (S.cible === cle) return; S.cible = cle;
        Object.assign(cible.style, { left: (cx - 20 * u) + 'px', top: (cy - 28 * u) + 'px', width: (40 * u) + 'px', height: (43 * u) + 'px' });
        bulle.style.top = (cy + 16 * u) + 'px';
        const droite = cx + 21 * u + 270 < LW;
        fiche.style.top = Math.max(8, cy - 24 * u) + 'px';
        fiche.style.left = droite ? (cx + 21 * u) + 'px' : Math.max(8, cx - 21 * u - 270) + 'px';
      }

      function dessiner(t) {
        g.clearRect(0, 0, LW, LH);
        const cx = LW / 2;
        if (S.mode === 'intro') {
          const ph = L.phase(intro, S.t);
          const n = ph.nom, p = ph.p;
          const noir = n === 'apparition' ? 0.86 * sinus(Math.min(1, p * 1.6)) : 0.86;
          const lum = n === 'apparition' ? p : 1;
          const cy = n === 'apparition' ? LH * 0.16 : n === 'descente' ? lin(LH * 0.16, LH * 0.5, sinus(p)) : LH * 0.5;
          // apparition : il prend forme dans la boule de lumière (léger dépassement d'échelle) ; descente : balancement lent qui s'apaise
          const q = n === 'apparition' ? Math.max(0, Math.min(1, (p - 0.55) / 0.45)) : 1;
          const alpha = n === 'apparition' ? sinus(q) : 1;
          const k = n === 'apparition' ? u * (0.4 + 0.6 * (1 + 2.2 * Math.pow(q - 1, 3) + 1.2 * Math.pow(q - 1, 2))) : u;
          const amorti = n === 'descente' ? 1 - sinus(p) : n === 'apparition' ? 1 : 0, vit = calme ? 0 : 1;
          const x = cx + Math.sin(t / 1500) * 1.4 * u * amorti * vit, incl = Math.sin(t / 1500 + 0.7) * 0.05 * amorti * vit;
          const force = n === 'apparition' ? 0.2 * q : n === 'descente' ? 0.2 + 0.4 * p : 0.6;
          const ondes = n === 'apparition' ? 0.3 * q : n === 'descente' ? 0.3 + 0.7 * p : 1;
          voile(noir); lumiere(x, cy, lum); dessinPoussiere(lum, t);
          if (n === 'apparition') rassemblement(cx, cy - 6 * u, p, t);
          aura(x, cy - 6 * u, u, force, ondes, t);
          if (alpha > 0) jean(x, cy, k, alpha, t, n === 'apparition' ? 1 - q : 0, incl);
          placerCible(cx, cy);
          return;
        }
        const ph = L.phase(finale, S.tf), n = ph.nom, p = ph.p;
        const cy = LH * 0.5;
        const noir = n === 'envol' ? lin(0.86, 0.5, p) : n === 'explosion' ? lin(0.5, 0.3, p) : n === 'retour' ? lin(0.3, 0, sinus(p)) : 0.86;
        const lum = n === 'brille' || n === 'contraction' ? 1 : n === 'course' ? lin(1, 0.3, p) : n === 'envol' ? lin(0.3, 0, p) : 0;
        voile(noir); lumiere(cx, cy, lum); dessinPoussiere(lum, t);
        if (n === 'brille') { aura(cx, cy - 6 * u, u, 0.8 + 0.4 * p, 1, t); jean(cx, cy, u, 1, t, p); return; }
        if (n === 'contraction') {
          const e = 1 - accel(p);
          aura(cx, cy - 6 * u, u, 1.2 * e, e, t);
          if (e > 0.02) jean(cx, cy - 5 * u * (1 - e), u * e, 1, t, 1);
          boule(p, t); return;
        }
        if (n === 'course' || n === 'envol') { boule(1, t); return; }
        const a = S.depart || (S.depart = astreEcran());
        if (n === 'explosion') {
          if (!S.eclats) { S.eclats = []; for (let i = 0; i < 48; i++) { const ang = Math.random() * 6.283, v = 60 + Math.random() * 220; S.eclats.push({ vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, s: 2 + Math.random() * 2 }); } boum(); }
          const s = ph.ecoule / 1000;
          g.save(); g.globalCompositeOperation = 'lighter';
          const r = 8 + 70 * p, gr = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
          gr.addColorStop(0, 'rgba(255,255,240,' + (1 - p).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,220,140,0)');
          g.fillStyle = gr; g.fillRect(a.x - r, a.y - r, r * 2, r * 2);
          g.fillStyle = 'rgba(255,230,160,' + (1 - p).toFixed(3) + ')';
          for (const e of S.eclats) g.fillRect(a.x + e.vx * s, a.y + e.vy * s + 40 * s * s, e.s, e.s);
          g.restore(); return;
        }
        if (n === 'retour') {
          // la dernière particule redescend vers le bouton en flottant (arc et petite ondulation qui s'amortit)
          const b = S.bouton || (S.bouton = boutonEcran()), q = sinus(Math.min(1, p * 1.3));
          const x = lin(a.x, b.x, q) + Math.sin(q * Math.PI * 3) * 10 * (1 - q), y = lin(a.y, b.y, q) - Math.sin(Math.PI * q) * 30;
          g.save(); g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(x, y, 0, x, y, 10);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
          g.fillStyle = gr; g.fillRect(x - 10, y - 10, 20, 20); g.restore();
        }
      }

      // ---- avance du temps ----
      function avancer(dt) {
        if (S.mode === 'intro') {
          S.t += dt; poussiere(dt, S.t);
          const ph = L.phase(intro, S.t);
          if (ph.nom === 'parole' || ph.nom === 'attente') ecrire(ph.nom === 'attente' ? plan.total : L.visibles(plan, S.t - debutParole));
          if (ph.nom === 'attente' && !S.attente) { S.attente = true; indice.style.display = 'block'; }
        } else {
          S.tf += dt; poussiere(dt, S.tf);
          const ph = L.phase(finale, S.tf);
          if (ph.nom === 'fin') { terminer('fin'); return; }
          majBoule(ph, dt);
        }
      }
      function ecrire(n) {
        if (bulle.hidden) { bulle.hidden = false; cible.hidden = false; lu.textContent = L.TEXTES.lignes.join(' '); }
        if (n <= S.vus) return;
        bulleTexte.textContent = L.texteVisible(L.TEXTES.lignes, n);
        if (!calme) lettre(L.caractere(L.TEXTES.lignes, n - 1));
        S.vus = n;
      }
      function image(ts) {
        S.raf = 0;
        if (S.fini || doc.hidden) return;
        try {
          const dt = S.dernier ? Math.min(50, Math.max(0, ts - S.dernier)) : 16; S.dernier = ts;
          avancer(dt);
          if (S.fini) return;
          dessiner(ts);
        } catch (e) { avertir('image', e); terminer('erreur'); return; }
        S.raf = window.requestAnimationFrame(image);
      }
      function relancer() { if (!calme && !S.fini && !S.raf && !doc.hidden) { S.dernier = 0; S.raf = window.requestAnimationFrame(image); } }

      // ---- interactions ----
      function montrerFiche(v) { fiche.hidden = !v; }
      function versFinale() {
        if (S.mode !== 'intro') return;
        S.mode = 'finale'; S.tf = 0; preparerBoule(LW / 2, LH * 0.5 - 5 * u);
        bulle.hidden = true; montrerFiche(false); cible.hidden = true;
        if (calme) { terminer('fin'); return; }
        musique();
      }
      function terminer(raison) {
        if (S.fini) return; S.fini = true;
        try { if (S.raf) window.cancelAnimationFrame(S.raf); } catch { /* ignoré */ }
        S.raf = 0;
        for (const [c, ty, fn, opt] of ecouteurs) { try { c.removeEventListener(ty, fn, opt); } catch { /* ignoré */ } }
        couperAudio();
        try { if (couche.parentNode) couche.parentNode.removeChild(couche); } catch { /* ignoré */ }
        try { cv.retirer(); } catch { /* ignoré */ }
        courante = null;
        if (raison !== 'erreur') { L.marquerFait(api.stock, { test }); poserRoyaume(); }
        try { if (avantFocus && avantFocus.isConnected && avantFocus.focus) avantFocus.focus(); } catch { /* ignoré */ }
      }

      sur(bPasser, 'click', () => terminer('passer'));
      sur(doc, 'keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); terminer('passer'); } }, true);
      sur(bSon, 'click', () => { S.son = !S.son; majSon(); if (S.son) musique(); else volumeAudio(); });
      // Suit en direct le bouton son permanent (évènement kinan-egg-muet) ; ne touche pas au volume.
      sur(doc, 'kinan-egg-muet', (ev) => { const m = ev && ev.detail && typeof ev.detail.muet === 'boolean' ? ev.detail.muet : api.muet(); if (S.son === !m) return; S.son = !m; majSon(); if (S.son) musique(); else volumeAudio(); });
      sur(vol, 'input', () => { S.volume = L.borneVolume(Number(vol.value) / 100); api.stock.set('volume', S.volume); volumeAudio(); });
      sur(cible, 'mouseenter', () => montrerFiche(true));
      sur(cible, 'mouseleave', () => { if (!S.fiche) montrerFiche(false); });
      sur(cible, 'focus', () => montrerFiche(true));
      sur(cible, 'blur', () => { S.fiche = false; montrerFiche(false); });
      sur(cible, 'click', () => {
        if (S.attente) { versFinale(); return; }
        // pendant la parole : le clic ouvre la fiche et termine la phrase
        S.fiche = !S.fiche; montrerFiche(S.fiche);
        const fin = intro.find((p) => p.nom === 'attente');
        if (fin && S.t < fin.debut) S.t = fin.debut;
      });
      sur(doc, 'visibilitychange', () => {
        if (doc.hidden) { if (S.raf) { window.cancelAnimationFrame(S.raf); S.raf = 0; } if (A.ctx && A.ctx.suspend) A.ctx.suspend().catch(() => {}); }
        else { if (A.ctx && A.ctx.resume && S.son) A.ctx.resume().catch(() => {}); volumeAudio(); relancer(); }
      });
      // déblocage audio : un geste utilisateur relance un contexte suspendu par la politique de lecture automatique
      const debloquer = () => { if (S.son && A.ctx && A.ctx.state === 'suspended' && A.ctx.resume) A.ctx.resume().catch(() => {}); };
      sur(doc, 'pointerdown', debloquer, true);
      sur(doc, 'keydown', debloquer, true);
      sur(window, 'resize', () => { try { dimensionner(); } catch (e) { avertir('taille', e); } });

      majSon();
      dimensionner(); semer();
      const objet = { terminer };
      if (calme) { S.t = 0; ecrire(plan.total); S.attente = true; indice.style.display = 'block'; dessiner(0); }
      musique();
      relancer();
      try { bPasser.focus(); } catch { /* ignoré */ }
      return objet;
    }

    api.ecouter('kinan-egg-jean', () => lancer());
    if (L.lireFait(api.stock)) poserRoyaume();
    if (test) window.setTimeout(() => { try { lancer(); } catch (e) { avertir('test', e); } }, 800);
  });
})();
