// Synthèse des sons : sinus avec enveloppe douce, volumes bas.
'use strict';
const NOTES = { kinan: 523.25, drafion: 659.25, skyze: 783.99, johms: 440, quatre: 587.33, cinq: 493.88 };
let ac = null;
function note(freq, debut, duree, volume) {
  const t = ac.currentTime + debut;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + duree + 0.05);
}
window.son.surJouer(({ type, agent }) => {
  try {
    ac = ac || new AudioContext();
    if (ac.state === 'suspended') ac.resume();
    console.log('son ' + type + ' etat=' + ac.state);
    if (type === 'clone') { note(988, 0, 0.12, 0.06); note(1319, 0.1, 0.16, 0.06); }       // clone déployé : deux courtes notes, volume bas
    else if (type === 'question') { note(784, 0, 0.35, 0.15); note(1175, 0.14, 0.5, 0.15); }  // deux notes montantes (sol, ré)
    else {                                                                               // fin : petite mélodie douce de 3 notes montantes (accord majeur), hauteur propre à l'agent
      // Agent hors des sièges par défaut : note stable tirée de son identifiant.
      const AUTRES = [587.33, 493.88, 698.46, 554.37, 622.25];
      const f = NOTES[agent] || AUTRES[[...String(agent || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AUTRES.length];
      [[1, 0, 0.35], [1.2599, 0.16, 0.35], [1.4983, 0.32, 0.7]].forEach(([r, d, l]) => {
        note(f * r, d, l, 0.09);          // note principale
        note(f * r * 2, d, l * 0.6, 0.02); // harmonique légère, effet « clochette »
      });
    }
  } catch (e) { console.error('son erreur : ' + (e && e.message)); }
});
