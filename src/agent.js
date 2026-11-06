// Détail d'un agent. Tout le texte est inséré en textContent.
'use strict';
const $ = (id) => document.getElementById(id);

function duree(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.round(s / 60) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h ' + String(Math.round((s % 3600) / 60)).padStart(2, '0');
  return Math.floor(s / 86400) + ' j';
}
function lignes(zone, textes) {
  zone.replaceChildren(...textes.map((t) => { const d = document.createElement('div'); d.textContent = t; return d; }));
}
let cleAffichee = null, etatAffiche = null;
async function maj() {
  try {
    const d = await window.agent.donnees();
    if (!d) return;
    if (d.cle !== cleAffichee || d.etat !== etatAffiche) { cleAffichee = d.cle; etatAffiche = d.etat; window.Avatars.dessinerAvatar($('portrait'), d.cle, d.etat); }
    $('nom').textContent = d.nom;
    $('modele').textContent = d.modele;
    $('etat').textContent = d.etat;
    $('etat').className = 'etat ' + d.etat;
    document.title = 'Kinan Orchestre : ' + d.nom;
    lignes($('fait'), d.faits.length ? d.faits.map((f) => f.source === 'tache' ? `${f.tache} (terminée)` : `${f.tache} (il y a ${duree(d.maintenant - f.t)})`) : ["Rien d'enregistré"]);
    lignes($('encours'), d.etat !== 'repos' ? [`${d.tache || 'Au travail…'}${d.depuis ? ' (depuis ' + duree(d.maintenant - d.depuis) + ')' : ''}`] : ['Au repos']);
    lignes($('avenir'), d.avenir.length ? d.avenir.map((t) => `${t.titre} (${t.statut})`) : ['Rien de planifié']);
  } catch { /* on réessaiera */ }
}
window.agent.surCle(() => maj());
maj();
setInterval(maj, 1000);
