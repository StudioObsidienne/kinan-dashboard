// Lecteur d'un extrait de fichier son local (élément audio, aucun réseau, CSP « media-src 'self' »). Fondus par le volume de l'élément.
// Échec de chargement ou de lecture : silence, jamais d'erreur. Fenêtre masquée ou son coupé (actif() faux) : la lecture s'arrête.
// window.SonFichier.jouer({ src, debut, duree, fondu, fonduEntree, vitesse, volume, retard, actif }) -> { couper() }   (secondes ; volume borné par SonsFichiers)
(function () {
  'use strict';
  const S = window.SonsFichiers;
  if (!S) return;
  const PAS = 25, COUPE_MS = 60;

  function jouer(o) {
    const nul = { couper() {} };
    try {
      if (!o || !o.src || document.hidden || (o.actif && !o.actif())) return nul;
      const a = new Audio();
      let timer = null, att = null, fini = false, debutLecture = 0, coupeDepuis = null, v0 = 0;
      const volume = S.borneVolume(o.volume), duree = o.duree, fondu = o.fondu, fonduEntree = o.fonduEntree;
      const fin = () => {
        if (fini) return; fini = true;
        if (timer) clearInterval(timer); if (att) clearTimeout(att);
        try { a.pause(); a.removeAttribute('src'); a.load(); } catch { /* ignoré */ }
      };
      const tic = () => {
        if (fini) return;
        if (document.hidden || (o.actif && !o.actif())) return fin();
        const t = (performance.now() - debutLecture) / 1000;
        if (coupeDepuis !== null) {
          const k = 1 - (performance.now() - coupeDepuis) / COUPE_MS;
          if (k <= 0) return fin();
          a.volume = S.borneVolume(v0 * k); return;
        }
        if (t >= duree) return fin();
        a.volume = S.volumeA(t, duree, fondu, volume, fonduEntree);
      };
      const demarrer = () => {
        if (fini) return;
        try {
          a.volume = 0; if (o.vitesse > 0) a.playbackRate = o.vitesse; a.currentTime = Math.max(0, o.debut || 0);
          const p = a.play();
          if (p && p.catch) p.catch(fin);
          debutLecture = performance.now();
          timer = setInterval(tic, PAS);
        } catch { fin(); }
      };
      a.preload = 'auto';
      a.addEventListener('error', fin);
      a.src = o.src;
      att = setTimeout(demarrer, Math.max(0, (o.retard || 0) * 1000));
      return { couper() { if (!fini && coupeDepuis === null) { if (!timer) return fin(); v0 = a.volume; coupeDepuis = performance.now(); } } };
    } catch { return nul; }
  }
  window.SonFichier = { jouer };
})();
