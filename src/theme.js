// Thème de l'interface (section « theme » de kinan.config.json, déjà validée par le processus principal).
// Revalidé ici : couleurs #rgb ou #rrggbb, polices limitées à lettres, chiffres, espaces et tirets.
// Contraste minimal (WCAG) : texte 4,5:1 sur le fond et la surface, accents 3:1 ; sinon le thème entier est ignoré.
// Seules des variables CSS sont posées (CSSOM) : aucune feuille, aucune URL, aucune police distante. « logo » et « source » ne sont pas utilisés.
(() => {
  'use strict';
  const BASE = { fond: '#14121c', surface: '#1a1725', texte: '#ece8f5', accent: '#a78bfa', accentSecondaire: '#5fd3a0' };
  const COULEURS = Object.keys(BASE);
  const estCouleur = (v) => typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
  const estPolice = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/.test(v);
  const rvb = (h) => { const s = h.length === 4 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
  const lum = (h) => rvb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const melange = (a, b, p) => '#' + rvb(a).map((c, i) => Math.round(c * p + rvb(b)[i] * (1 - p)).toString(16).padStart(2, '0')).join('');

  function appliquer(t) {
    if (!t || typeof t !== 'object') return { applique: false, raison: 'aucun thème' };
    const c = { ...BASE };
    let perso = false;
    for (const k of COULEURS) {
      if (t[k] == null) continue;
      if (!estCouleur(t[k])) return { applique: false, raison: k + ' invalide' };
      c[k] = t[k].toLowerCase(); perso = true;
    }
    const tests = [['texte', 'fond', 4.5], ['texte', 'surface', 4.5], ['accent', 'fond', 3], ['accentSecondaire', 'fond', 3]];
    const echec = tests.find(([a, b, min]) => contraste(c[a], c[b]) < min);
    if (echec) return { applique: false, raison: 'contraste ' + echec[0] + '/' + echec[1] + ' insuffisant' };
    const polices = {};
    for (const k of ['policeTitre', 'policeTexte']) {
      if (t[k] == null) continue;
      if (!estPolice(t[k])) return { applique: false, raison: k + ' invalide' };
      polices[k] = t[k];
    }
    const st = document.documentElement.style;
    if (perso) {
      // Variables de la fenêtre principale (index.html) et de Gestion (gestion.css).
      const surface2 = melange(c.texte, c.surface, 0.05), ligne = melange(c.texte, c.surface, 0.16);
      const doux = melange(c.texte, c.fond, 0.68), pale = melange(c.texte, c.fond, 0.48);
      const principal = melange(c.accent, c.surface, 0.28);
      const v = { '--fond': c.fond, '--surface': c.surface, '--surface2': surface2, '--ligne': ligne, '--texte': c.texte,
        '--doux': contraste(doux, c.fond) >= 4.5 ? doux : c.texte, '--pale': pale, '--entete': melange(c.surface, c.fond, 0.5),
        '--accent': c.accent, '--accent2': c.accentSecondaire, '--accent-bord': c.accent,
        '--accent-fond': contraste(c.texte, principal) >= 4.5 ? principal : surface2,
        '--carte': c.surface, '--bord': ligne, '--muet': contraste(doux, c.surface) >= 4.5 ? doux : c.texte,
        '--sur-accent': contraste('#14121c', c.accent) >= 4.5 ? '#14121c' : '#ffffff' };
      for (const [k, x] of Object.entries(v)) st.setProperty(k, x);
    }
    if (polices.policeTexte) st.setProperty('--police-texte', '"' + polices.policeTexte + '", "Segoe UI", system-ui, sans-serif');
    if (polices.policeTitre) st.setProperty('--police-titre', '"' + polices.policeTitre + '", "Segoe UI", system-ui, sans-serif');
    return { applique: perso || !!(polices.policeTexte || polices.policeTitre) };
  }

  window.KinanTheme = { appliquer, contraste };
  const cfg = window.kinan && window.kinan.config;
  if (cfg && cfg.theme) window.KinanTheme.dernier = appliquer(cfg.theme);
})();
