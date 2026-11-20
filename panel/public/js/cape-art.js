// Capas de Kopi: el DIBUJO de cada capa (pixel art 10×16, animado). Lo usan:
//  - el servidor del panel (src/capes.js), que fabrica la imagen que se ve dentro del juego;
//  - la página «Capas de Kopi» del panel (miniaturas animadas).
// Es una copia exacta de los dibujos del launcher (src/renderer/js/capes.js). Una prueba comprueba
// que las dos copias pintan lo mismo: si cambias una capa, cámbiala en los dos sitios.
(function () {
  const W = 10, H = 16, TAU = Math.PI * 2;

  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); k = Math.max(0, Math.min(1, k)); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  const vgrad = (top, bottom) => (y) => mix(top, bottom, y / (H - 1));

  // ---------------------------------------------------------------- las capas
  const CAPES = [
    {
      id: 'kopi', name: 'Kopi', rarity: 'legendary', frames: 8, fps: 6,
      draw(px, f) {
        const bg = vgrad('#2a0f3d', '#11061d');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        // destellos
        [[1, 1, 0], [8, 9, 3], [0, 13, 5], [9, 15, 1]].forEach(([x, y, p]) => {
          const k = (f + p) % 8;
          if (k < 2) px(x, y, k ? '#c084fc' : '#fde7ff');
        });
        // cabeza del pulpo
        const head = ['..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX'];
        head.forEach((row, r) => [...row].forEach((c, x) => {
          if (c !== 'X') return;
          const edge = x === 0 || x === 9 || r === 6 || row[x - 1] === '.' || row[x + 1] === '.';
          px(x, r + 1, edge ? '#d9479c' : '#ff6fbf');
        }));
        px(3, 2, '#ffc6e6'); px(4, 2, '#ffc6e6'); px(2, 3, '#ffc6e6');
        const blink = f === 5;
        [2, 7].forEach(x => {
          if (blink) { px(x, 5, '#3b0a2c'); return; }
          px(x, 4, '#ffffff'); px(x, 5, '#1a0b26');
        });
        px(4, 6, '#a8337a'); px(5, 6, '#a8337a');
        // tentáculos que ondulan
        [0, 2, 4, 6, 8].forEach((base, i) => {
          const len = 5 + (i % 3);
          for (let r = 0; r < len; r++) {
            const y = 8 + r;
            const sway = Math.round(Math.sin(f / 8 * TAU + r * 0.75 + i * 1.3) * Math.min(1, r / 2));
            const x = Math.max(0, Math.min(9, base + (i < 2 ? 0 : 1) + sway));
            px(x, y, r === len - 1 ? '#c23f8c' : r % 2 && i % 2 ? '#ffc2e3' : '#ff6fbf');
          }
        });
      }
    },
    {
      id: 'void', name: 'Vacío', rarity: 'legendary', frames: 16, fps: 8,
      draw(px, f) {
        const t = f / 16 * TAU;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const dx = x - 4.5, dy = (y - 7.5) * 0.72;
          const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          const band = (Math.sin(d * 1.7 - t * 2 + a) + 1) / 2;
          const fade = Math.max(0, 1 - d / 7.2);
          let c = mix('#07020f', '#6d28d9', band * fade);
          if (d < 1.4) c = mix('#e9d5ff', '#ffffff', (Math.sin(t * 2) + 1) / 2);
          else if (d < 2.4) c = mix(c, '#c084fc', 0.6);
          px(x, y, c);
        }
        // partículas que giran alrededor
        for (let k = 0; k < 3; k++) {
          const ang = t + k * TAU / 3;
          px(Math.round(4.5 + Math.cos(ang) * 3.6), Math.round(7.5 + Math.sin(ang) * 5), '#f5d0fe');
        }
      }
    },
    {
      id: 'ink', name: 'Tinta', rarity: 'epic', frames: 16, fps: 8,
      draw(px, f) {
        const bg = vgrad('#140f26', '#08060f');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        // tinta arriba, con borde ondulado
        for (let x = 0; x < W; x++) {
          const edge = 2 + Math.round((Math.sin(x * 1.3 + f / 16 * TAU) + 1) / 2);
          for (let y = 0; y <= edge; y++) px(x, y, y === edge ? '#5b21b6' : y === 0 ? '#a78bfa' : '#7c3aed');
        }
        // gotas que caen
        [[1, 0], [4, 6], [6, 11], [8, 3]].forEach(([x, ph]) => {
          const y = 3 + ((f + ph) % 16);
          [['#c4b5fd', 0], ['#8b5cf6', 1], ['#5b21b6', 2]].forEach(([c, k]) => { if (y - k > 3 && y - k < 15) px(x, y - k, c); });
        });
        for (let x = 0; x < W; x++) px(x, 15, (x + Math.floor(f / 2)) % 4 ? '#4c1d95' : '#6d28d9');
      }
    },
    {
      id: 'aurora', name: 'Aurora', rarity: 'epic', frames: 16, fps: 8,
      draw(px, f) {
        const t = f / 16 * TAU, bg = vgrad('#050b1a', '#0b1630');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const I = Math.max(0, Math.sin(x * 0.7 + y * 0.35 + t)) * (1 - y / 16 * 0.55);
          const col = mix('#22d3a6', '#f472b6', (Math.sin(y * 0.4 + t + x * 0.2) + 1) / 2);
          px(x, y, mix(bg(y), col, I * 0.92));
        }
        [[1, 13], [7, 14], [4, 11], [9, 12]].forEach(([x, y], i) => { if ((f + i * 4) % 16 < 12) px(x, y, '#e0f2fe'); });
      }
    },
    {
      id: 'fire', name: 'Fuego', rarity: 'epic', frames: 12, fps: 10,
      draw(px, f) {
        const t = f / 12 * TAU;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const h = y / 15 + 0.22 * Math.sin(x * 1.7 + t) + 0.16 * Math.sin(x * 0.9 - t * 2 + y * 0.8);
          const c = h > 1.05 ? '#fff3b0' : h > 0.9 ? '#fde047' : h > 0.76 ? '#fb923c' : h > 0.62 ? '#ef4444' : h > 0.48 ? '#7f1d1d' : mix('#1a0505', '#2b0909', y / 15);
          px(x, y, c);
        }
        // chispas que suben
        [[2, 0], [7, 5], [5, 9]].forEach(([x, ph]) => { const y = 9 - ((f + ph) % 12); if (y >= 0) px(x, y, '#fdba74'); });
      }
    },
    {
      id: 'bubbles', name: 'Burbujas', rarity: 'rare', frames: 16, fps: 6,
      draw(px, f) {
        const bg = vgrad('#0e7490', '#082f49');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        // rayos de luz
        for (let y = 0; y < 6; y++) { px(2 + Math.floor(y / 2), y, mix(bg(y), '#67e8f9', 0.25)); px(6 + Math.floor(y / 3), y, mix(bg(y), '#67e8f9', 0.18)); }
        // algas
        [[1, 4], [8, 3]].forEach(([x, len], i) => {
          for (let r = 0; r < len; r++) px(x + Math.round(Math.sin(f / 16 * TAU + r + i)), 15 - r, r === len - 1 ? '#4ade80' : '#16a34a');
        });
        // burbujas
        [[2, 0], [5, 5], [7, 10], [4, 13], [8, 7]].forEach(([x, ph], i) => {
          const y = 15 - ((f + ph) % 16);
          const bx = x + Math.round(Math.sin((f + ph) * 0.8));
          px(bx, y, i % 2 ? '#a5f3fc' : '#ecfeff');
        });
      }
    },
    {
      id: 'stars', name: 'Noche estrellada', rarity: 'rare', frames: 24, fps: 6,
      draw(px, f) {
        const bg = vgrad('#070b24', '#1e1b4b');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        // luna
        px(7, 1, '#fef3c7'); px(8, 1, '#fde68a'); px(7, 2, '#fde68a'); px(8, 2, '#fef9c3'); px(9, 2, '#fde68a'); px(8, 3, '#fcd34d');
        // estrellas que parpadean
        [[1, 2, 0], [4, 1, 7], [2, 6, 3], [6, 5, 11], [8, 8, 5], [1, 10, 9], [5, 9, 15], [3, 13, 2], [8, 13, 19], [6, 15, 13]].forEach(([x, y, ph]) => {
          const b = (Math.sin((f + ph) / 24 * TAU * 2) + 1) / 2;
          if (b > 0.25) px(x, y, b > 0.75 ? '#ffffff' : '#93c5fd');
        });
        // estrella fugaz
        if (f >= 10 && f < 16) {
          const k = f - 10;
          px(k + 1, 4 + k, '#ffffff');
          if (k > 0) px(k, 3 + k, '#bfdbfe');
          if (k > 1) px(k - 1, 2 + k, '#60a5fa');
        }
      }
    },
    {
      id: 'neon', name: 'Neón', rarity: 'rare', frames: 24, fps: 10,
      draw(px, f) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, '#0a0612');
        // borde con una luz que da vueltas
        const ring = [];
        for (let x = 0; x < W; x++) ring.push([x, 0]);
        for (let y = 1; y < H; y++) ring.push([W - 1, y]);
        for (let x = W - 2; x >= 0; x--) ring.push([x, H - 1]);
        for (let y = H - 2; y > 0; y--) ring.push([0, y]);
        const head = Math.floor(f / 24 * ring.length);
        ring.forEach(([x, y], i) => {
          const d = (head - i + ring.length) % ring.length;
          px(x, y, d < 7 ? mix('#f0abfc', '#22d3ee', d / 6) : '#3b0a3b');
        });
        // la K, latiendo
        const glow = mix('#db2777', '#fbcfe8', (Math.sin(f / 24 * TAU * 2) + 1) / 2);
        ['X..X', 'X.X.', 'XX..', 'X.X.', 'X..X'].forEach((row, r) => [...row].forEach((c, x) => { if (c === 'X') px(3 + x, 5 + r, glow); }));
      }
    },
    {
      id: 'pink', name: 'Kopi Rosa', rarity: 'common', frames: 1, fps: 1,
      draw(px) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, (x + y) % 4 < 2 ? '#f472b6' : '#c026d3');
        for (let x = 0; x < W; x++) px(x, 0, '#fbcfe8');
      }
    }
  ];

  const RARITY = {
    legendary: { label: 'Legendaria', color: '#fbbf24' },
    epic: { label: 'Épica', color: '#e879f9' },
    rare: { label: 'Rara', color: '#60a5fa' },
    common: { label: 'Común', color: '#a1a1aa' }
  };

  // Un fotograma de la capa como matriz de colores (10×16, '#rrggbb')
  function pixels(cape, f) {
    const out = Array.from({ length: H }, () => new Array(W).fill('#000000'));
    cape.draw((x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) out[y][x] = c; }, ((f % cape.frames) + cape.frames) % cape.frames);
    return out;
  }

  globalThis.KopiCapeArt = { W, H, CAPES, RARITY, mix, rgb, pixels, get: (id) => CAPES.find(c => c.id === id) || null };
})();
