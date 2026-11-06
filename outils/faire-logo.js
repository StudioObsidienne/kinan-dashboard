// Génère assets/icon.png (256x256) et assets/icon.ico : Kinan le juge, en pixel art. Node seul, sans dépendance.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 16, ECHELLE = 16;
const grille = Array.from({ length: N }, () => Array(N).fill(null));
const r = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grille[j][i] = c; };

r(0, 1, 16, 14, '#2a2540'); r(1, 0, 14, 16, '#2a2540');      // fond arrondi
r(4, 2, 8, 5, '#f4f1ea'); r(3, 4, 1, 5, '#f4f1ea'); r(12, 4, 1, 5, '#f4f1ea'); // perruque de juge
r(5, 4, 6, 5, '#d9a98b');                                     // visage
r(6, 6, 1, 1, '#1a1620'); r(9, 6, 1, 1, '#1a1620'); r(7, 8, 2, 1, '#a05a4a'); // yeux, bouche
r(3, 10, 10, 5, '#15151d'); r(7, 10, 2, 3, '#ffffff');        // robe et jabot
r(11, 11, 3, 2, '#ffd45e'); r(12, 13, 1, 2, '#8a5a2b');       // marteau

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const T = N * ECHELLE;
const brut = Buffer.alloc(T * (T * 4 + 1));
for (let y = 0; y < T; y++) {
  brut[y * (T * 4 + 1)] = 0;
  for (let x = 0; x < T; x++) {
    const c = grille[Math.floor(y / ECHELLE)][Math.floor(x / ECHELLE)];
    const o = y * (T * 4 + 1) + 1 + x * 4;
    if (c) { const [R, G, B] = hex(c); brut[o] = R; brut[o + 1] = G; brut[o + 2] = B; brut[o + 3] = 255; }
  }
}

const tableCrc = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tableCrc[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloc = (type, data) => {
  const t = Buffer.from(type), l = Buffer.alloc(4), k = Buffer.alloc(4);
  l.writeUInt32BE(data.length); k.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, k]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(T, 0); ihdr.writeUInt32BE(T, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);

const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); // une image
ico[6] = 0; ico[7] = 0; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); // 0 = 256 px
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);

const dossier = path.join(__dirname, '..', 'assets');
fs.mkdirSync(dossier, { recursive: true });
fs.writeFileSync(path.join(dossier, 'icon.png'), png);
fs.writeFileSync(path.join(dossier, 'icon.ico'), Buffer.concat([ico, png]));
console.log('Logo créé dans', dossier);
