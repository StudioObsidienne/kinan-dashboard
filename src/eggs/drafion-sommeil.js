// Drafion s'endort et fond s'il ne fait rien : dès 10 min son propre avatar (window.Avatars) s'affaisse et s'étale sur le bureau,
// respiration lente, ronflements discrets calés sur l'inspiration et l'expiration dès 20 min, bulle de nez qui suit le souffle dès 30 min.
// Réveil brutal (reprise d'une tâche ou coup de fouet) : il se reconstitue d'un coup, rebondit, panique, s'ébroue, puis reprend sa pose.
// Dessin seulement (KinanEquipe.corpsDe + api.dessin) : l'état de la scène et des agents n'est jamais modifié.
// L'inactivité vient de l'horloge (KinanEgg.horloge), jamais d'un champ de l'état métier. Le fouet appelle le réveil par l'évènement
// 'kinan-egg-fouet' ({ cle, pris }) : ce module met pris à vrai s'il s'en charge.
(function () {
  'use strict';
  if (!window.KinanEgg || !window.SommeilLogique) return;
  const L = window.SommeilLogique;

  window.KinanEgg.module('drafion-sommeil', (api) => {
    const eq = window.KinanEquipe, AV = window.Avatars;
    const CLE = 'drafion';
    // Le siège « drafion » n'est à Drafion que si l'équipe configurée l'y a laissé.
    const siege = eq.agents().find((a) => a.cle === CLE);
    if (!siege || (eq.ID_DE && eq.ID_DE[CLE] !== CLE)) return;
    if (!AV || !AV.corps || !eq.corpsDe) throw new Error('avatars ou corpsDe absents');

    const persiste = api.vitesse() === 1; // en mode accéléré, rien n'est lu ni écrit (horloge de test)
    const maintenant = api.horloge();
    const etatInitial = (api.etats()[CLE] || { etat: 'repos' }).etat;
    let suivi = L.creerSuivi(etatInitial, maintenant, persiste ? api.stock.get('dernier', 0) : 0);
    if (persiste) api.stock.set('dernier', suivi.dernier);
    let dernierRonflement = 0;           // inactivité mesurée au dernier ronflement
    let brutal = null;                   // réveil en cours : { debut (ms image, null = prochaine image), f0, n0, eveil }
    let eveilleJusqua = 0;               // après un coup de fouet : yeux ouverts jusqu'à cet instant (ms image)
    let ronfleDebut = 0, ronfleFin = 0;  // série de ronflements (ms image) : bouche ouverte à l'inspiration
    const SEUIL = 10 * L.MIN;
    const fondu = (t) => suivi.etat === 'repos' && L.inactivite(suivi, t) >= SEUIL;

    // retard (ms) : le coup de fouet claque un peu après le clic, le réveil part à l'impact.
    function reveiller(eveil, retard) {
      const inactif = L.inactivite(suivi, api.horloge()), r = Math.max(0, Number(retard) || 0);
      brutal = { debut: null, des: performance.now() + r, f0: L.fonte(inactif), n0: L.nez(inactif), eveil };
      dernierRonflement = 0; ronfleFin = 0;
      couperSons(); renifler(r / 1000);
      api.salir();
    }

    api.surChangement((cle, avant, apres, t) => {
      if (cle !== CLE) return;
      if (apres !== 'repos' && fondu(t) && !brutal) reveiller(false); // reprend une tâche : réveil brutal
      suivi = L.observer(suivi, apres, t);
      if (persiste) api.stock.set('dernier', suivi.dernier);
      if (apres !== 'repos') { dernierRonflement = 0; eveilleJusqua = 0; }
      api.salir();
    });

    // Coup de fouet pendant la fonte : réveil brutal ; le compteur de fonte (propre à ce module) repart de zéro.
    api.ecouter('kinan-egg-fouet', (d) => {
      if (!d || d.cle !== CLE) return;
      if (brutal) { d.pris = true; return; }
      if (!fondu(api.horloge())) return;
      d.pris = true;
      reveiller(true, d.retard);
      suivi = L.creerSuivi('repos', api.horloge(), api.horloge());
      if (persiste) api.stock.set('dernier', suivi.dernier);
    });

    // ---- sons (Web Audio local au module ; muet par défaut via api.muet(), rien si la fenêtre est masquée) ----
    let ac = null, tampon = null, serie = null;
    function audio() {
      if (api.muet() || document.hidden) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        if (!ac) ac = new AC();
        if (ac.state === 'suspended' && ac.resume) ac.resume().catch(() => {});
        if (!tampon) { // bruit brun (souffle) de 2 s
          const n = ac.sampleRate * 2; tampon = ac.createBuffer(1, n, ac.sampleRate);
          const d = tampon.getChannelData(0); let b = 0;
          for (let i = 0; i < n; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 5; }
        }
        if (!serie) { serie = ac.createGain(); serie.gain.value = 1; serie.connect(ac.destination); }
        return ac;
      } catch { return null; }
    }
    function couperSons() {
      if (!ac || !serie) return;
      try { serie.gain.setTargetAtTime(0.0001, ac.currentTime, 0.02); } catch { /* ignoré */ }
      serie = null;
    }
    function enveloppe(t0, att, d, vol) {
      const e = ac.createGain();
      e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(vol, t0 + att); e.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      e.connect(serie); return e;
    }
    // Inspiration ronflée : souffle filtré + voile du palais qui vibre (modulation ~26 Hz) + fondamentale grave.
    function inspiration(t0, d, vol) {
      const env = enveloppe(t0, d * 0.6, d, vol), vib = ac.createGain(); vib.gain.value = 0.55; vib.connect(env);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.type = 'triangle';
      lfo.frequency.setValueAtTime(23, t0); lfo.frequency.linearRampToValueAtTime(29, t0 + d); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(vib.gain);
      const src = ac.createBufferSource(), bp = ac.createBiquadFilter(); src.buffer = tampon; src.loop = true;
      bp.type = 'bandpass'; bp.Q.value = 1.3; bp.frequency.setValueAtTime(240, t0); bp.frequency.linearRampToValueAtTime(360, t0 + d); src.connect(bp); bp.connect(vib);
      const o = ac.createOscillator(), lp = ac.createBiquadFilter(), og = ac.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(58, t0); o.frequency.linearRampToValueAtTime(70, t0 + d * 0.7); lp.type = 'lowpass'; lp.frequency.value = 300; og.gain.value = 0.35;
      o.connect(lp); lp.connect(og); og.connect(vib);
      for (const n of [lfo, src, o]) { n.start(t0); n.stop(t0 + d + 0.05); }
    }
    // Expiration : petit « pfff » doux entre les lèvres.
    function expiration(t0, d, vol) {
      const env = enveloppe(t0, 0.18, d, vol), src = ac.createBufferSource(), bp = ac.createBiquadFilter();
      src.buffer = tampon; src.loop = true; bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(950, t0); bp.frequency.exponentialRampToValueAtTime(520, t0 + d);
      src.connect(bp); bp.connect(env); src.start(t0); src.stop(t0 + d + 0.05);
    }
    // Série de trois respirations ronflées, calée sur le sinus de respiration (même horloge que le dessin).
    function ronfler() {
      const now = performance.now(), t0 = L.prochaineInspiration(now);
      ronfleDebut = t0; ronfleFin = t0 + 3 * 4000;
      if (!audio()) return;
      try {
        for (let k = 0; k < 3; k++) {
          const ti = t0 + k * 4000, base = ac.currentTime + (ti - now) / 1000;
          inspiration(base, 1.75, 0.045 - k * 0.006);
          expiration(base + 2, 1.5, 0.02);
        }
      } catch { /* son facultatif */ }
    }
    // Ronflement coupé net au réveil (« hrnk ! »).
    function renifler(retard) {
      if (!audio()) return;
      try { inspiration(ac.currentTime + 0.01 + (retard || 0), 0.2, 0.05); } catch { /* son facultatif */ }
    }
    api.minuteur(() => {
      if (suivi.etat !== 'repos' || brutal) return;
      const inactif = L.inactivite(suivi, api.horloge());
      if (L.ronflementDu(inactif, dernierRonflement)) { dernierRonflement = inactif; ronfler(); }
    }, 500);
    api.visible((vis) => { if (!vis) { couperSons(); ronfleFin = 0; } });

    // ---- situation de l'image courante (calculée une fois par image) ----
    let cache = { t: -1, s: null };
    function situation(t) {
      if (cache.t === t) return cache.s;
      const calme = api.calme();
      let s = null;
      if (brutal && t < brutal.des) { // en attendant l'impact : encore fondu
        s = { mode: 'fonte', f: brutal.f0, n: brutal.n0, pal: 3, souffle: L.respiration(t, calme), calme, ronfle: false };
      } else if (brutal) {
        if (brutal.debut === null) brutal.debut = t;
        const pose = L.reveilBrutal(t - brutal.debut, brutal.f0, calme);
        if (!pose.fini) s = { mode: 'reveil', pose, calme, dt: t - brutal.debut };
        else { if (brutal.eveil && !calme) eveilleJusqua = t + 4000; brutal = null; }
      }
      if (!s && eveilleJusqua > t && suivi.etat === 'repos') s = { mode: 'eveil', calme };
      if (!s && suivi.etat === 'repos') {
        const inactif = L.inactivite(suivi, api.horloge()), f = L.fonte(inactif);
        if (f > 0.002) s = { mode: 'fonte', f, n: L.nez(inactif), pal: L.palier(inactif), souffle: L.respiration(t, calme), calme,
          ronfle: !calme && t >= ronfleDebut && t < ronfleFin && L.inspire(t) };
      }
      cache = { t, s };
      return s;
    }

    // ---- dessin : l'avatar existant rendu hors écran puis redessiné ligne à ligne (tassement, étalement, ondulation) ----
    const K = '#1d1729';
    const SW = 56, SH = 48, SX = 28, SY = 31;
    const spr = document.createElement('canvas'); spr.width = SW; spr.height = SH;
    const sc = spr.getContext('2d');
    const rect = (c, x, y, w, h, col) => { if (w <= 0 || h <= 0) return; c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    function disque(c, cx, cy, r, col) {
      for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy + 0.5)); rect(c, cx - w, cy + dy, 2 * w + 1, 1, col); }
    }
    let geo = null; // géométrie du corps de l'image (pour la flaque et la bulle de nez)
    function corpsDeforme(c, a, cx, bas, def, souffle, ex, t, ondule) {
      sc.clearRect(0, 0, SW, SH);
      AV.corps(sc, a, SX, SY, ex);
      const haut0 = SY - a.ry - 8, H0 = 2 * a.ry + 9;
      const pr = L.profil(def, souffle, H0), Hd = Math.max(3, Math.round(pr.H));
      c.save(); c.imageSmoothingEnabled = false;
      for (let i = 0; i < Hd; i++) {
        const q = (i + 0.5) / Hd;
        const s = L.ligneSource(q, pr.p), sr = haut0 + Math.min(H0 - 1, Math.floor(s * H0));
        const w = pr.w0 * L.largeur(s, pr.p);
        const vague = ondule ? Math.round(Math.sin(t / 620 + i * 0.6) * ondule * q) : 0;
        c.drawImage(spr, 0, sr, SW, 1, Math.round(cx - SX * w) + vague, bas - Hd + i, Math.max(1, Math.round(SW * w)), 1);
      }
      c.restore();
      const ligne = (y) => L.ligneSource(Math.min(1, Math.max(0, (y - (bas - Hd) + 0.5) / Hd)), pr.p);
      const demi = (y) => Math.round((a.rx + 1) * pr.w0 * L.largeur(ligne(y), pr.p));
      geo = { pr, Hd, haut0, H0, bas, cx, demi, ligneY: (src) => bas - Hd + L.ligneDest((src - haut0) / H0, pr.p) * Hd };
      return geo;
    }

    function bulleNez(c, a, f0, n, souffle) {
      if (!geo || n <= 0.001) return;
      // gonfle à l'expiration (souffle qui descend), se vide à l'inspiration : même sinus que le corps
      const r = Math.max(1, Math.round((1 + 4 * (1 - souffle)) * n));
      const sens = siege.s < 0 ? -1 : 1, ay = Math.round(geo.ligneY(SY + 2)), w = geo.demi(ay) / (a.rx + 1);
      const ax = geo.cx + Math.round(4 * w) * sens, bx = ax + r * sens, by = ay - Math.floor(r / 2);
      c.save(); c.globalAlpha = 0.9 * n;
      disque(c, bx, by, r, '#7fb8e8');
      if (r > 1) disque(c, bx, by, r - 1, '#d4ecff');
      rect(c, bx - Math.floor(r / 2), by - Math.floor(r / 2), 1, 1, '#ffffff');
      c.restore();
    }

    // Flaque sur le plateau (déborde de la largeur du corps) et coulures sur la face avant du bureau.
    function flaque(c, a, cx, f, t, calme, alpha) {
      if (f <= 0.01 || !geo) return;
      const y = a.haut - 1, hl = geo.demi(a.haut - 2) + Math.round(1.5 * f), ep = 1 + Math.round(1.6 * f);
      c.save(); c.globalAlpha = Math.min(1, f * 6) * alpha;
      // flaque en ménisque : épaisse sous le corps, amincie vers les bords ; surface claire, dessous ombré
      const bas = [];
      for (let dx = -hl; dx <= hl; dx++) {
        const u = Math.abs(dx) / (hl + 0.5), ep2 = Math.max(1, Math.round(ep * (1 - u * u) + 0.4));
        rect(c, cx + dx, y, 1, 1, u > 0.92 ? a.ombre : a.coul);
        if (ep2 > 1) rect(c, cx + dx, y + 1, 1, ep2 - 1, a.ombre);
        bas.push(y + ep2);
      }
      rect(c, cx - Math.round(hl * 0.55), y, Math.max(2, Math.round(hl / 3)), 1, a.clair);
      // deux ou trois coulures irrégulières sur la face avant ; une goutte grossit au bout puis tombe
      [[-0.55, 1, 0.2], [0.68, 0.7, 0.5]].forEach(([rx, rel, seuil], i) => {
        if (f < seuil) return;
        const dx = Math.round(rx * hl), x = cx + dx, y0 = bas[dx + hl] || y + 1, long = Math.max(1, Math.round((1 + 3 * f) * rel));
        rect(c, x, y0, 1, long, a.coul); rect(c, x + 1, y0, 1, Math.max(1, long - 2), a.ombre);
        const ph = calme ? 0.4 : ((t + i * 900) % 2600) / 2600;
        if (ph < 0.6) { rect(c, x - (ph > 0.3 ? 1 : 0), y0 + long, 2 + (ph > 0.3 ? 1 : 0), 2, a.coul); rect(c, x, y0 + long + 1, 1, 1, a.clair); } // la goutte se forme
        else { // elle se détache et tombe
          c.globalAlpha = Math.min(1, f * 6) * alpha * (1 - (ph - 0.6) / 0.4);
          rect(c, x, y0 + long + Math.round((ph - 0.6) * 22), 1, 2, a.coul);
          c.globalAlpha = Math.min(1, f * 6) * alpha;
        }
      });
      c.restore();
    }

    // Petite bulle « ! » rouge dans le style des bulles de la scène.
    function bulleExcl(c, x, y) {
      const w = 8, h = 11;
      rect(c, x + 1, y, w - 2, 1, K); rect(c, x + 1, y + h - 1, w - 2, 1, K); rect(c, x, y + 1, 1, h - 2, K); rect(c, x + w - 1, y + 1, 1, h - 2, K);
      rect(c, x + 1, y + 1, w - 2, h - 2, '#ff5a64');
      rect(c, x + 2, y + h - 1, 3, 1, '#ff5a64'); rect(c, x + 1, y + h - 1, 1, 1, K); rect(c, x + 5, y + h - 1, 1, 1, K);
      rect(c, x + 2, y + h, 1, 1, K); rect(c, x + 3, y + h, 1, 1, '#ff5a64'); rect(c, x + 4, y + h, 1, 1, K); rect(c, x + 3, y + h + 1, 1, 1, K);
      rect(c, x + 3, y + 2, 2, 5, '#ffffff'); rect(c, x + 3, y + 8, 2, 1, '#ffffff');
    }

    function reveilDevant(c, a, s, t) {
      const pose = s.pose, cx = a.cx + pose.dx, base = a.haut - a.ry + 2, tete = base - a.ry - Math.round(pose.saut);
      // la flaque se résorbe, les gouttes remontent dans le corps
      if (brutal) {
        flaque(c, a, a.cx, brutal.f0 * (1 - pose.retour), t, false, 1);
        if (pose.retour < 1 && brutal.f0 > 0.05) {
          const e = Math.pow(pose.retour, 1.4);
          for (let i = 0; i < 7; i++) {
            const sx = a.cx + (i - 3) * (4 + 3 * brutal.f0), sy = a.haut + 2 + (i % 3) * 3;
            const x = sx + (cx - sx) * e, y = sy + (base - sy) * e - Math.sin(Math.PI * e) * (5 + (i % 2) * 3);
            rect(c, x + 1, y + 1, 2, 2, K); rect(c, x, y, 2, 2, a.coul);
          }
        }
      }
      c.save();
      if (pose.choc > 0) { // traits de surprise autour de la tête
        c.globalAlpha = pose.choc;
        for (const ang of [-2.6, -1.95, -1.2, -0.55]) {
          for (let k = 0; k < 3; k++) rect(c, cx + Math.cos(ang) * (a.rx + 4 + k), tete + a.ry + Math.sin(ang) * (a.ry + 4 + k), 1, 1, '#ffffff');
        }
        c.globalAlpha = 1;
      }
      if (pose.sueur) { // goutte de panique qui saute de la tête
        const ph = ((s.dt - 380) % 380) / 380, gx = cx - a.rx - 1 - Math.round(ph * 4), gy = tete + 3 + Math.round(ph * ph * 8);
        c.globalAlpha = 1 - ph * 0.5; rect(c, gx, gy, 1, 1, '#ffffff'); rect(c, gx - 1, gy + 1, 3, 2, '#8fd3ff'); rect(c, gx, gy + 3, 1, 1, '#5aa8ff');
        c.globalAlpha = 1;
      }
      if (pose.excl) bulleExcl(c, a.cx + 4 + (s.dt < 300 && Math.floor(s.dt / 60) % 2 ? 1 : 0), tete - 13);
      c.restore();
    }

    eq.corpsDe(CLE, {
      corps(c, a, cx, cy, p, t) {
        const s = situation(t);
        if (!s) return false;
        const base = a.haut - a.ry + 2;
        if (s.mode === 'eveil') { // réveillé par le fouet : yeux ouverts, regarde autour, plus de « zzz »
          p.yeux = Math.floor(t / 1700) % 6 === 0 && t % 1700 < 130 ? 'cligne' : 'ouvert';
          p.bouche = 'plat'; p.lx = [0, 1, 0, -1][Math.floor(t / 700) % 4]; p.ly = 0; p.bulle = null; p.dort = false;
          return false;
        }
        p.bulle = s.mode === 'fonte' ? p.bulle : null;
        if (s.mode === 'reveil') {
          const q = s.pose;
          corpsDeforme(c, a, a.cx + q.dx, base + a.ry + 1 - Math.round(q.saut) - Math.min(4, Math.round(Math.max(0, q.def) * 12)), q.def, 0.5, { yeux: q.yeux, bouche: q.bouche, lx: q.lx, ly: q.ly }, t, 0);
          if (brutal) bulleNez(c, a, brutal.f0, brutal.n0 * (1 - q.retour), 0.5);
          return true;
        }
        const ex = { yeux: p.yeux, bouche: s.ronfle ? 'o' : p.bouche, lx: p.lx, ly: (p.ly || 0) + (s.pal >= 3 ? 1 : 0), sourcil: p.sourcil };
        // le bas du corps (caché derrière le plateau) remonte jusqu'au bord du bureau : le visage reste visible, la masse s'étale dessus
        corpsDeforme(c, a, a.cx, base + a.ry + 1 - Math.min(4, Math.round(s.f * 12)), s.f, s.souffle, ex, t, s.calme ? 0 : 1.2 * s.f);
        bulleNez(c, a, s.f, s.n, s.souffle);
        return true;
      },
      devant(c, a, t) {
        const s = situation(t);
        if (!s) return;
        if (s.mode === 'fonte') flaque(c, a, a.cx, s.f, t, s.calme, 1);
        else if (s.mode === 'reveil') reveilDevant(c, a, s, t);
      }
    });
    // L'API publique du module (pour un test ou une autre mission) : KinanEgg.reveillerDrafion() déclenche le même réveil que le fouet.
    window.KinanEgg.reveillerDrafion = () => { const d = { cle: CLE, pris: false }; api.emettre('kinan-egg-fouet', d); return d.pris; };
  });
})();
