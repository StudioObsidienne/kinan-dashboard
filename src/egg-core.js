// Socle des easter eggs du bureau (voir docs/EASTER-EGGS-SPEC.md). Expose window.KinanEgg.
// Règles : zéro réseau, aucune écriture d'état, aucune modification d'un agent (copies gelées), stockage localStorage préfixé uniquement.
// Chargé après scene.js ; chaque module src/eggs/<nom>.js s'enregistre avec KinanEgg.module(nom, init). Supprimer ces fichiers ne change pas le bureau.
(function (racine, fabrique) {
  'use strict';
  const creer = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = { creer };
  else {
    try {
      racine.KinanEgg = creer({
        localStorage: (() => { try { return racine.localStorage; } catch { return null; } })(),
        location: racine.location, document: racine.document, KinanEquipe: racine.KinanEquipe, kinan: racine.kinan,
        AudioContext: racine.AudioContext || racine.webkitAudioContext, console: racine.console,
        maintenant: () => Date.now(), perf: () => (racine.performance ? racine.performance.now() : Date.now()),
        setInterval: racine.setInterval.bind(racine), clearInterval: racine.clearInterval.bind(racine), setTimeout: racine.setTimeout.bind(racine)
      });
    } catch (e) { if (racine.console) racine.console.warn('KinanEgg désactivé :', e && e.message); }
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PREFIXE = 'kinan-os.egg.';

  function vitesseDepuis(search) {
    const m = /[?&]egg-vitesse=([^&]*)/.exec(search || '');
    const v = m ? Number(m[1]) : 1;
    return Number.isFinite(v) && v >= 1 && v <= 600 ? v : 1;
  }
  function horlogeAcceleree(t0, maintenant, vitesse) {
    return t0 + (maintenant - t0) * (Number.isFinite(vitesse) && vitesse >= 1 && vitesse <= 600 ? vitesse : 1);
  }

  return function creer(env) {
    const search = (env.location && env.location.search) || '';
    const doc = env.document || null;
    const cons = env.console || { warn() {} };
    const eq = env.KinanEquipe || null;
    const vitesse = vitesseDepuis(search);
    const maintenantReel = env.maintenant || (() => Date.now());
    const t0 = maintenantReel();
    const horloge = () => horlogeAcceleree(t0, maintenantReel(), vitesse);
    const masque = () => !!(doc && doc.hidden);

    // ---- stockage (clés kinan-os.egg.*, rien d'autre n'est lu ni écrit sauf par reinitialiser) ----
    const ls = () => { try { return env.localStorage || null; } catch { return null; } };
    function lireBrut(cle) { try { const s = ls(); return s ? s.getItem(cle) : null; } catch { return null; } }
    function ecrireBrut(cle, v) { try { const s = ls(); if (!s) return false; s.setItem(cle, v); return true; } catch { return false; } }
    function stock(nom) {
      const base = PREFIXE + nom + '.';
      return {
        get(k, defaut) { try { const raw = lireBrut(base + k); return raw === null || raw === undefined ? defaut : JSON.parse(raw); } catch { return defaut; } },
        set(k, v) { try { return ecrireBrut(base + k, JSON.stringify(v)); } catch { return false; } }
      };
    }
    function reinitialiser() {
      try {
        const s = ls(); if (!s) return 0;
        const cles = [];
        for (let i = 0; i < s.length; i++) { const c = s.key(i); if (typeof c === 'string' && c.startsWith(PREFIXE)) cles.push(c); }
        cles.forEach((c) => s.removeItem(c));
        return cles.length;
      } catch { return 0; }
    }
    // egg-reset=1 n'agit qu'avec egg-vitesse (mode de test), jamais seul.
    if (vitesse > 1 && /[?&]egg-reset=1(&|$)/.test(search)) reinitialiser();

    // ---- mute global : muet par défaut ; ?egg-son=1 le lève pour la session seulement (test), sans rien écrire ----
    let sonSession = /[?&]egg-son=1(&|$)/.test(search);
    function muet(v) {
      if (v === undefined) {
        if (sonSession) return false;
        const raw = lireBrut(PREFIXE + 'muet');
        return !(raw === '0' || raw === 'false');
      }
      sonSession = false;
      ecrireBrut(PREFIXE + 'muet', v ? '1' : '0');
      return !!v;
    }
    const calme = () => { try { return eq && eq.calme ? !!eq.calme() : false; } catch { return false; } };

    // ---- Web Audio : contexte créé au premier geste utilisateur ----
    let ctxAudio = null;
    function armerAudio() {
      if (!doc || !env.AudioContext || !doc.addEventListener) return;
      const creerCtx = () => {
        try { if (!ctxAudio) ctxAudio = new env.AudioContext(); } catch { ctxAudio = null; }
        ['pointerdown', 'keydown'].forEach((e) => doc.removeEventListener(e, creerCtx, true));
      };
      ['pointerdown', 'keydown'].forEach((e) => doc.addEventListener(e, creerCtx, true));
    }
    // recette : { type, f0, f1, duree, attaque, volume, passeBas, retard } (secondes, Hz, volume borné à 0,2)
    function son(r) {
      try {
        if (!r || muet() || masque() || !ctxAudio) return false;
        if (ctxAudio.state === 'suspended' && ctxAudio.resume) ctxAudio.resume().catch(() => {});
        const t = ctxAudio.currentTime + (r.retard || 0), d = Math.max(0.05, r.duree || 0.5);
        const vol = Math.min(0.2, Math.max(0.0002, r.volume || 0.05));
        const o = ctxAudio.createOscillator(), gain = ctxAudio.createGain();
        o.type = r.type || 'sine';
        o.frequency.setValueAtTime(r.f0 || 220, t);
        o.frequency.linearRampToValueAtTime(r.f1 || r.f0 || 220, t + d);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + Math.min(d * 0.6, r.attaque || 0.05));
        gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
        let sortie = o;
        if (r.passeBas) { const f = ctxAudio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = r.passeBas; o.connect(f); sortie = f; }
        sortie.connect(gain); gain.connect(ctxAudio.destination);
        o.start(t); o.stop(t + d + 0.05);
        return true;
      } catch { return false; }
    }

    // ---- minuteurs suspendus quand la fenêtre est masquée ----
    const minuteurs = [], ecouteursVisible = [];
    function surVisibilite() {
      const vis = !masque();
      for (const m of minuteurs) {
        if (!vis && m.id !== null) { env.clearInterval(m.id); m.id = null; }
        else if (vis && m.id === null && !m.annule) m.id = env.setInterval(m.fn, m.ms);
      }
      ecouteursVisible.forEach((fn) => { try { fn(vis); } catch (e) { cons.warn('KinanEgg visible :', e && e.message); } });
    }
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', surVisibilite);
    function minuteur(fn, ms) {
      const m = { fn: () => { try { fn(); } catch (e) { cons.warn('KinanEgg minuteur :', e && e.message); } }, ms, id: null, annule: false };
      if (!masque() && env.setInterval) m.id = env.setInterval(m.fn, ms);
      minuteurs.push(m);
      return () => { m.annule = true; if (m.id !== null) env.clearInterval(m.id); m.id = null; };
    }

    // ---- états des agents (copies gelées) et changements ----
    const ecouteursEtat = [];
    let precedents = null;
    function lireEtats() {
      const sortie = {};
      if (eq && eq.agents && eq.etat) for (const a of eq.agents()) {
        const e = eq.etat(a.cle);
        if (e) sortie[a.cle] = Object.freeze({ etat: e.etat, depuis: Number(e.maj) || 0 });
      }
      return Object.freeze(sortie);
    }
    function verifier() {
      const now = lireEtats();
      if (precedents) for (const k of Object.keys(now)) {
        const av = precedents[k] ? precedents[k].etat : null;
        if (av !== null && av !== now[k].etat) {
          const t = horloge();
          for (const fn of ecouteursEtat.slice()) { try { fn(k, av, now[k].etat, t); } catch (e) { cons.warn('KinanEgg changement :', e && e.message); } }
        }
      }
      precedents = now;
    }
    let abonne = false;
    function abonnerEtats() {
      if (abonne) return; abonne = true;
      precedents = lireEtats();
      // Le socle s'abonne une fois à surEtat (lecture) ; la scène a déjà appliqué l'état quand ce rappel part.
      try { if (env.kinan && env.kinan.surEtat) env.kinan.surEtat(() => verifier()); } catch { /* sans écoute directe */ }
      // Repli (mode démonstration, ou image affichée avant l'événement) : comparaison à chaque image dessinée.
      if (eq && eq.surDessin) eq.surDessin(() => verifier());
    }

    // ---- dessin, bulle, calque, zones ----
    function dessin(fn) {
      if (!eq || !eq.surDessin) return;
      let mort = false;
      eq.surDessin((c, t) => { if (mort) return; try { fn(c, t); } catch (e) { mort = true; cons.warn('KinanEgg dessin :', e && e.message); } });
    }
    let regionLive = null;
    function annoncer(texte) {
      if (!doc || !doc.createElement) return;
      if (!regionLive) {
        regionLive = doc.createElement('div');
        regionLive.setAttribute('aria-live', 'polite');
        regionLive.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
        doc.body.appendChild(regionLive);
      }
      regionLive.textContent = texte;
    }
    const bulles = [];
    let bulleBranchee = false;
    function bulle(cle, texte, ms) {
      if (!eq) return;
      const fin = (env.perf ? env.perf() : Date.now()) + (ms || 3000);
      for (let i = bulles.length - 1; i >= 0; i--) if (bulles[i].cle === cle) bulles.splice(i, 1); // une seule bulle par agent : la nouvelle remplace l'ancienne
      bulles.push({ cle, texte: String(texte), fin });
      annoncer(String(texte));
      if (bulleBranchee) return; bulleBranchee = true;
      dessin((c, t) => {
        const maintenant = env.perf ? env.perf() : t;
        for (let i = bulles.length - 1; i >= 0; i--) if (bulles[i].fin < maintenant) bulles.splice(i, 1);
        for (const b of bulles) {
          const a = eq.agents().find((x) => x.cle === b.cle); if (!a) continue;
          c.save(); c.font = '7px monospace'; c.textBaseline = 'top';
          const w = Math.ceil(c.measureText(b.texte).width) + 6, h = 11, y = Math.round(a.haut - 44);
          const x = Math.max(2, Math.min(Math.round(a.cx + 3), ((eq.dim && eq.dim.W) || 400) - w - 2)); // reste dans la scène
          c.fillStyle = '#1d1729'; c.fillRect(x, y, w, h);
          c.fillStyle = '#ffffff'; c.fillRect(x + 1, y + 1, w - 2, h - 2);
          c.fillStyle = '#1d1729'; c.fillText(b.texte, x + 3, y + 2);
          c.restore();
        }
      });
    }
    function calque() {
      if (!doc || calme()) return null;
      const c = doc.createElement('canvas');
      c.width = (env.largeur && env.largeur()) || 800; c.height = (env.hauteur && env.hauteur()) || 600;
      c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
      c.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(c);
      return { canvas: c, ctx: c.getContext('2d'), retirer() { if (c.parentNode) c.parentNode.removeChild(c); } };
    }
    // Zone cliquable en pixels de la scène (même repère que KinanEquipe.agents) + bouton invisible focalisable.
    const zonesParNom = {};
    function zone(nom, boite, opts) {
      if (!doc || !eq || !eq.dim) return null;
      const toile = doc.getElementById('toile'); if (!toile || !toile.parentElement) return null;
      const { W, H, DY } = eq.dim, [x, y, w, h] = boite;
      const b = doc.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', nom);
      const o = opts || {};
      // opts.min (px écran) : taille minimale effective, zone centrée sur la boîte ; opts.z : empilement (au-dessus de .zone-agent = 2).
      const min = Number(o.min) > 0 ? Number(o.min) : 0;
      b.style.cssText = 'position:absolute;background:transparent;border:0;padding:0;margin:0;cursor:pointer;opacity:0.001;'
        + (min ? `transform:translate(-50%,-50%);min-width:${min}px;min-height:${min}px;` : '')
        + `width:${(w / W) * 100}%;height:${(h / H) * 100}%` + (o.z ? `;z-index:${Number(o.z) | 0}` : '');
      // Position (en % de la scène) pour un décalage (dx, dy) en pixels de scène par rapport à la boîte d'origine.
      const placer = (dx, dy) => {
        b.style.left = (min ? ((x + dx + w / 2) / W) * 100 : ((x + dx) / W) * 100) + '%';
        b.style.top = (min ? ((y + dy + h / 2 + DY) / H) * 100 : ((y + dy + DY) / H) * 100) + '%';
      };
      placer(0, 0);
      if (o.clic) b.addEventListener('click', (ev) => { try { o.clic(ev); } catch (e) { cons.warn('KinanEgg clic :', e && e.message); } });
      if (o.survol) b.addEventListener('mouseenter', (ev) => { try { o.survol(ev); } catch (e) { cons.warn('KinanEgg survol :', e && e.message); } });
      // Contour visible seulement au focus clavier (:focus-visible) : un clic de souris ne laisse aucun carré autour de l'objet.
      const clavier = () => { try { return b.matches(':focus-visible'); } catch { return false; } };
      b.style.outline = 'none';
      b.addEventListener('focus', () => { if (clavier()) { b.style.opacity = '1'; b.style.outline = '2px solid #ffd04d'; b.style.outlineOffset = '1px'; } });
      b.addEventListener('blur', () => { b.style.opacity = '0.001'; b.style.outline = 'none'; });
      b.addEventListener('pointerdown', () => { b.style.opacity = '0.001'; b.style.outline = 'none'; });
      toile.parentElement.appendChild(b);
      const z = { bouton: b, retirer() { if (b.parentNode) b.parentNode.removeChild(b); if (zonesParNom[nom] === z) delete zonesParNom[nom]; }, deplacer: placer };
      zonesParNom[nom] = z;
      return z;
    }
    // Décale une zone déjà créée (décalage absolu par rapport à sa boîte d'origine, en pixels de scène) : le décor personnalisé garde ses clics.
    function deplacerZone(nom, dx, dy) {
      const z = zonesParNom[nom];
      if (!z) return false;
      try { z.deplacer(Number(dx) || 0, Number(dy) || 0); return true; } catch { return false; }
    }

    // ---- étiquette du mode accéléré ----
    if (vitesse > 1 && eq && eq.surDessin) {
      const texte = 'egg x' + vitesse;
      eq.surDessin((c) => {
        c.save(); c.font = '7px monospace'; c.textBaseline = 'top';
        const w = Math.ceil(c.measureText(texte).width) + 4;
        c.globalAlpha = 0.85; c.fillStyle = '#1d1729'; c.fillRect(2, -16, w, 10);
        c.fillStyle = '#ffd04d'; c.fillText(texte, 4, -15);
        c.restore();
      });
    }

    // ---- évènements entre modules : rappels internes + CustomEvent sur le document (écoutable par une autre mission) ----
    const ecouteursEvt = {};
    function ecouter(nom, fn) { (ecouteursEvt[nom] = ecouteursEvt[nom] || []).push(fn); }
    function emettre(nom, detail) {
      for (const fn of (ecouteursEvt[nom] || []).slice()) { try { fn(detail); } catch (e) { cons.warn('KinanEgg évènement :', e && e.message); } }
      try { if (doc && doc.dispatchEvent && typeof CustomEvent === 'function') doc.dispatchEvent(new CustomEvent(nom, { detail })); } catch { /* sans DOM */ }
    }

    // ---- modules ----
    const enregistres = [], desactives = [];
    function api(nom) {
      const s = stock(nom);
      return {
        nom, stock: s, son, bulle, calque, dessin, zone, minuteur, horloge, calme, muet, ecouter, emettre,
        vitesse: () => vitesse,
        etats: lireEtats,
        surChangement(fn) { ecouteursEtat.push(fn); abonnerEtats(); },
        visible(fn) { ecouteursVisible.push(fn); },
        salir() { try { if (eq && eq.salir) eq.salir(); } catch { /* ignoré */ } }
      };
    }
    function module(nom, init) {
      try {
        if (!eq) throw new Error('scène absente');
        const actif = stock(nom).get('actif', true);
        if (actif === false || actif === 0 || actif === '0') { desactives.push(nom); return false; }
        init(api(nom));
        enregistres.push(nom);
        return true;
      } catch (e) {
        desactives.push(nom);
        try { cons.warn('KinanEgg : module « ' + nom + ' » désactivé :', e && e.message); } catch { /* ignoré */ }
        return false;
      }
    }

    armerAudio();
    return { PREFIXE, module, stock, muet, horloge, ecouter, emettre, deplacerZone, vitesse: () => vitesse, reinitialiser, modules: () => ({ actifs: enregistres.slice(), desactives: desactives.slice() }), _vitesseDepuis: vitesseDepuis, _horlogeAcceleree: horlogeAcceleree };
  };
});
