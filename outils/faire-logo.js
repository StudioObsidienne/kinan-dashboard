// Génère assets/icon.png (256x256) et assets/icon.ico (16, 24, 32, 48, 64, 128, 256 px, fond transparent) :
// Kinan le juge, en pixel art. Node seul, sans dépendance.
// Chaque taille est dessinée directement depuis la grille 16x16 (jamais réduite par Windows, d'où une icône nette dans la barre des tâches).
// Taille non multiple de 16 (24 px) : largeurs de cellules 1 ou 2 px réparties symétriquement autour du centre (yeux identiques, pas de flou).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 16;
const grille = Array.from({ length: N }, () => Array(N).fill(null));
const r = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grille[j][i] = c; };

r(0, 1, 16, 14, '#2a2540'); r(1, 0, 14, 16, '#2a2540');      // fond arrondi
r(4, 2, 8, 5, '#f4f1ea'); r(3, 4, 1, 5, '#f4f1ea'); r(12, 4, 1, 5, '#f4f1ea'); // perruque de juge
r(5, 4, 6, 5, '#d9a98b');                                     // visage
r(6, 6, 1, 1, '#1a1620'); r(9, 6, 1, 1, '#1a1620'); r(7, 8, 2, 1, '#a05a4a'); // yeux, bouche
r(3, 10, 10, 5, '#15151d'); r(7, 10, 2, 3, '#ffffff');        // robe et jabot
r(11, 11, 3, 2, '#ffd45e'); r(12, 13, 1, 2, '#8a5a2b');       // marteau

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Bornes des cellules pour une taille S : multiple de 16 -> cellules égales ; sinon répartition symétrique (moitié gauche miroir de la droite).
function bornes(S) {
  if (S % N === 0) return Array.from({ length: N + 1 }, (_, i) => i * S / N);
  const demi = N / 2, larg = [];
  for (let i = 0; i < demi; i++) larg.push(Math.floor((i + 1) * S / N) - Math.floor(i * S / N));
  const toutes = [...larg, ...larg.slice().reverse()];
  const b = [0]; for (const w of toutes) b.push(b[b.length - 1] + w);
  return b;
}
function pixels(S) {
  const b = bornes(S), cellule = new Int16Array(S);
  for (let i = 0; i < N; i++) for (let p = b[i]; p < b[i + 1]; p++) cellule[p] = i;
  const brut = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    brut[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      const c = grille[cellule[y]][cellule[x]];
      const o = y * (S * 4 + 1) + 1 + x * 4;
      if (c) { const [R, G, B] = hex(c); brut[o] = R; brut[o + 1] = G; brut[o + 2] = B; brut[o + 3] = 255; }
    }
  }
  return brut;
}

const tableCrc = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tableCrc[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloc = (type, data) => {
  const t = Buffer.from(type), l = Buffer.alloc(4), k = Buffer.alloc(4);
  l.writeUInt32BE(data.length); k.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, k]);
};
function png(S) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; // RVBA 8 bits
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(pixels(S), { level: 9 })), bloc('IEND', Buffer.alloc(0))]);
}

// Image BMP d'icône (DIB 32 bits BGRA de bas en haut + masque ET 1 bit) : format le plus compatible pour les petites tailles.
function dib(S) {
  const brut = pixels(S), ligneMasque = Math.ceil(S / 32) * 4;
  const entete = Buffer.alloc(40);
  entete.writeUInt32LE(40, 0); entete.writeInt32LE(S, 4); entete.writeInt32LE(S * 2, 8); // hauteur doublée (couleur + masque)
  entete.writeUInt16LE(1, 12); entete.writeUInt16LE(32, 14); entete.writeUInt32LE(S * S * 4 + ligneMasque * S, 20);
  const coul = Buffer.alloc(S * S * 4), masque = Buffer.alloc(ligneMasque * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = y * (S * 4 + 1) + 1 + x * 4, d = ((S - 1 - y) * S + x) * 4;
    coul[d] = brut[o + 2]; coul[d + 1] = brut[o + 1]; coul[d + 2] = brut[o]; coul[d + 3] = brut[o + 3];
    if (!brut[o + 3]) masque[(S - 1 - y) * ligneMasque + (x >> 3)] |= 0x80 >> (x & 7); // pixel transparent
  }
  return Buffer.concat([entete, coul, masque]);
}

// ICO : en-tête (6 octets), un répertoire de 16 octets par image, puis les images (BMP jusqu'à 128 px, PNG pour 256 px).
const TAILLES = [16, 24, 32, 48, 64, 128, 256];
const images = TAILLES.map((S) => (S >= 256 ? png(S) : dib(S)));
const tete = Buffer.alloc(6 + 16 * TAILLES.length);
tete.writeUInt16LE(0, 0); tete.writeUInt16LE(1, 2); tete.writeUInt16LE(TAILLES.length, 4);
let decalage = tete.length;
TAILLES.forEach((S, i) => {
  const o = 6 + i * 16;
  tete[o] = S >= 256 ? 0 : S; tete[o + 1] = S >= 256 ? 0 : S; // 0 = 256 px
  tete[o + 2] = 0; tete[o + 3] = 0; tete.writeUInt16LE(1, o + 4); tete.writeUInt16LE(32, o + 6);
  tete.writeUInt32LE(images[i].length, o + 8); tete.writeUInt32LE(decalage, o + 12);
  decalage += images[i].length;
});

const dossier = path.join(__dirname, '..', 'assets');
fs.mkdirSync(dossier, { recursive: true });
fs.writeFileSync(path.join(dossier, 'icon.png'), png(256));
fs.writeFileSync(path.join(dossier, 'icon.ico'), Buffer.concat([tete, ...images]));
console.log('Icônes créées dans', dossier, ':', TAILLES.join(', '), 'px');
