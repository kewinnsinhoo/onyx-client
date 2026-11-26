// Capas de Kopi: capas exclusivas del cliente, dibujadas en pixel art (10×16, como en Minecraft) y animadas.
// Cada capa es una función que pinta un fotograma. De aquí sale:
//  - la miniatura animada de la tienda de capas (canvas pequeño escalado con píxeles nítidos);
//  - la textura completa 64×32 para probarla en el visor 3D (y, más adelante, en el juego).
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
      // TACHAMANIKA: capa RGB. El borde y la franja de arriba recorren el arcoíris; la carita parpadea
      id: 'tachamanika', name: 'TACHAMANIKA', rarity: 'legendary', frames: 24, fps: 12,
      draw(px, f) {
        const hue = (h) => {
          h = ((h % 1) + 1) % 1;
          const v = (n) => { const k = (n + h * 6) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); };
          return mix('#' + [v(5), v(3), v(1)].map(c => c.toString(16).padStart(2, '0')).join(''), '#ffffff', 0.08);
        };
        const t = f / 24;
        // posición de cada píxel del borde (dando la vuelta) → su color
        const ring = (x, y) => {
          if (y === 0) return x;
          if (x === W - 1) return W - 1 + y;
          if (y === H - 1) return W - 1 + H - 1 + (W - 1 - x);
          return 2 * (W - 1) + H - 1 + (H - 1 - y);
        };
        const LEN = 2 * (W + H) - 4;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
          if (border) { px(x, y, hue(ring(x, y) / LEN + t)); continue; }
          if (y === 2) { px(x, y, hue(x / W + t + 0.5)); continue; } // franja de arriba
          // el negro de dentro, con un brillo suave del color del borde que tiene al lado
          const near = x === 1 || x === W - 2 || y === 1 || y === 3 || y === H - 2;
          const nb = x === 1 ? [0, y] : x === W - 2 ? [W - 1, y] : y === H - 2 ? [x, H - 1] : [x, 0];
          px(x, y, near ? mix('#1d1d21', hue(ring(nb[0], nb[1]) / LEN + t), 0.16) : '#1d1d21');
        }
        // la carita (como en el dibujo original)
        const blink = f === 18 || f === 19;
        if (blink) { px(2, 4, '#2c3034'); px(7, 4, '#2c3034'); } else { px(2, 4, '#474f52'); px(7, 4, '#474f52'); }
        [3, 4, 5, 6].forEach(x => px(x, 5, '#9d9d97'));
        px(4, 6, '#9d9d97'); px(5, 6, '#474f52'); px(6, 6, '#474f52');
      }
    },
    {
      // NickooVXS: la capa de NickooVXS (no sale en la ruleta). Sus 32 fotogramas salen de su paquete de
      // texturas (CreateTextures): un ojo que se enciende y se apaga. Un carácter por píxel = color de «pal».
      id: 'nickoovxs', name: 'NickooVXS', rarity: 'legendary', frames: 32, fps: 10,
      pal: ['#3a329b', '#3ea4c6', '#7a3a0c', '#a41004', '#4ebee2', '#8e0d03', '#000000', '#5a1a06', '#322380', '#770a02', '#9a8f86', '#4241b6', '#bb1205', '#2e89a9', '#1a1a1a', '#5fd8ff', '#874d1c', '#6a270a', '#a49a90', '#030303', '#4a50d0', '#955f2b', '#7b350e', '#aea59b', '#060607', '#af844a', '#d21506', '#d82309', '#c42008', '#9c5016', '#c2bcb0', '#0c0c0d', '#bc975a', '#ac5d1a', '#ccc7ba', '#0e0e10', '#caaa6a', '#bd6a1e', '#d7d2c4', '#111114', '#b11e07', '#e4cf89', '#eb250a', '#e81707', '#de8526', '#ebe9d9', '#17171a', '#f2e198', '#ee932a', '#f5f4e4', '#1a1a1e', '#fff4a8', '#ffa02e', '#ffffee', '#1d1d21', '#9d1c06'],
      px: '01023333330405666665405677766589672a27698967a6a76989672a2769896677769699666669695555555655554440646631110611163b1166661133b6116666cc666dd6eec6eee666ee6eeeeeeeee' +
        '01023333330103666663405677766505672a27658967a6a76989672a276989667776969966666969555555565555444064663111061116301166661133b611666633666116eec6eee666ee6eeeeeeeee' +
        'b1b23333330103666663103677766305672a27658967a6a76989672a2769896677769699666669699999999699554440646654440644463011666611330611666633666116eec6eee666ee6eeeeeeeee' +
        'b1b2333333b1b3666663103677766305672a27650567a6a76589672a276989667776969966666969999999969999fff86f6654440644465044666644330611666633666116ee36eee666ee6eeeeeeeee' +
        'b1bgccccccb1bc66666c1036hhh663036hgigh63056hijih65056hgigh658566hhh6565566666565555555565555fff86f6654440644465044666644330611666633666116eec6eee666ee6eeeeeeeee' +
        'kdkgccccccb1bc66666c1bc6hhh66c036hgigh63056hijih65056hgigh658566hhh6565566666565555555565555fff86f665fff86fff65044666644550644666633666116eec6eee666ee6eeeeeeeee' +
        'kdklcccccckdkc66666c1bc6mmm66c036mlnlm63036mnonm63036mlnlm630366mmm6365566666565555555565555fff86f665fff86fff658ff6666ff330644666633666116ee36eee666ee6eeeeeeeee' +
        'kdkpqqqqqqkdkr66666q1bs6ttt66cbc6tpupt6c0c6tuvut6c0c6tpupt6c0366ttt6363366666363555555565555fff86f665fff86fff658ff6666ff330644666633666446eec6eee666ee6eeeeeeeee' +
        'kdkwqqqqqqkdkr66666qdkr6xxx66qbq6xwywx6qbq6xyzyx6q0c6xwywx6c0366xxx6363366666363333333363333fff86f663fff86fff638ff6666ff3386ff666633666446ee36eee666ee6eeeeeeeee' +
        'kdkArrqqqqkdkr66666qdkr6BBB66qbq6BACAB6qbr6BCDCB6q0c6BACAB6c0c66BBB6s63366666E63333333363333fff86f663fff86fff638ff6666ff3386ff666633666446ee36eee666ee6eeeeeeeee' +
        'kdkFGGGHHHkdkG66666HdkG6III66HkG6IFJFI6Gbr6IJKJI6rbr6IFJFI6q0q66III6r6qq66666r6qcccccsc6cc33fff86f663fff86fff638ff6666ff3386ff666633666ff6eec6eee666ee6eeeeeeeee' +
        'kdkLGGGHHHkdkG66666HdkG6MMM66HkG6MLNLM6GkG6MNONM6Gbr6MLNLM6rbq66MMM6r6qq66666r6qccccssc6cccc44406466cfff86fff6c8ff6666ffcc86ff6666cc666ff6eec6eee666ee6eeeeeeeee' +
        'b1bLrrrqqqkdkG66666HdkG6MMM66HkG6MLNLM6GkG6MNONM6Gbr6MLNLM6rbq66MMM6r6qq66666r6qqqqqrrq6qqcc44406466c444064446c8ff6666ffcc86ff6666cc666ff6eec6eee666ee6eeeeeeeee' +
        'b1bPGGGGHHkdkG66666HdkG6QQQ66HkG6QPRPQ6GkG6QRSRQ6GkG6QPRPQ6GbH66QQQ6G6HH66666G6Hqqqqrrr6qqcc44406466c444064446c8ff6666ffcc86ff6666cc666ff6eec6eee666ee6eeeeeeeee' +
        'b1bPGGGGHHb1bG66666HdkG6QQQ66HkG6QPRPQ6GkG6QRSRQ6GkG6QPRPQ6GkH66QQQ6G6HH66666G6Hqqqqrrr6qqqq11106166c444064446c044666644cc86ff6666cc666ff6eec6eee666ee6eeeeeeeee' +
        '010Prrrrqqb1bG66666H1bG6QQQ66HkG6QPRPQ6GkG6QRSRQ6GkG6QPRPQ6GkH66QQQ6G6HH66666G6HHHHHGGG6HHqq11106166q111061116c044666644cc06446666cc666ff6eec6eee666ee6eeeeeeeee' +
        '010Prrrrqqb1bG66666H1bG6QQQ66HkG6QPRPQ6GkG6QRSRQ6GkG6QPRPQ6GkH66QQQ6G6HH66666G6HHHHHGGG6HHHH111b6166q111061116c044666644cc06446666cc666ff6eec6eee666ee6eeeeeeeee' +
        '010Prrrrqq010r66666q1bG6QQQ66HbG6QPRPQ6GkG6QRSRQ6GkG6QPRPQ6GkH66QQQ6G6HH66666G6HHHHHGGG6HHHH111b6166q111061116q011666611cc06446666cc666446eec6eee666ee6eeeeeeeee' +
        '040Psssscc010r66666q10r6QQQ66qbG6QPRPQ6GkG6QRSRQ6GkG6QPRPQ6GkH66QQQ6G6HH66666G6HHHHHGGG6HHHH111b6166H111b61116q011666611qq06116666cc666446eec6eee666ee6eeeeeeeee' +
        '040Psssscc040s66666c10r6QQQ66qbG6QPRPQ6GbG6QRSRQ6GkG6QPRPQ6GkH66QQQ6G6HH66666G6HHHHHGGG6HHHHdddk6d66H111b61116Hb11666611qq06116666cc666446eec6eee666ee6eeeeeeeee' +
        '040Lsssccc040s66666c10r6MMM66q0r6MLNLM6rbr6MNONM6rbr6MLNLM6rkH66MMM6G6HH66666G6HHHHHGGH6HHHHdddk6d66q111b61116qb11666611qq06116666qq666116eec6eee666ee6eeeeeeeee' +
        '8f8Lsssccc040s66666c40s6MMM66c0r6MLNLM6rbr6MNONM6rbr6MLNLM6rkH66MMM6G6HH66666G6HHHHHGGH6HHHHdddk6d66Hdddk6ddd6qb11666611qqb6116666qq666116eec6eee666ee6eeeeeeeee' +
        '8f8FEEE3338f8E66666340s6III66c0r6IFJFI6r0r6IJKJI6rbr6IFJFI6qbq66III6r6HH66666G6HHHHHHGH6HHHHdddk6d66Hdddk6ddd6Hkdd6666ddqqb6116666qq666116eeq6eee666ee6eeeeeeeee' +
        '8f8AEE33338f8E66666340E6BBB663036BACAB630s6BCDCB6c0c6BACAB6cbq66BBB6r6qq66666r6qqqqqqqq6qqqqdddk6d66qdddk6ddd6qkdd6666ddqqb6116666qq666116eec6eee666ee6eeeeeeeee' +
        '8f8w3333338f8E666663f8E6xxx663036xwywx63036xyzyx630c6xwywx6cbq66xxx6q6qq66666q6qqqqqqqq6qqqqdddk6d66qdddk6ddd6qkdd6666ddqqk6dd6666qq666116eeq6eee666ee6eeeeeeeee' +
        '8f8p5555558f8T666665f8T6ttt665036tpupt63036tuvut630c6tpupt6c0c66ttt6c6cc66666c6cccccccc6ccqqdddk6d66qdddk6ddd6qkdd6666ddqqk6dd6666cc666116eec6eee666ee6eeeeeeeee' +
        '8f8l5555558f85666665f856mmm665856mlnlm65036mnonm63036mlnlm630366mmm6363366666363ccccccc6ccccdddk6d66cdddk6ddd6ckdd6666ddcck6dd6666cc666dd6eec6eee666ee6eeeeeeeee' +
        '8f8g5555558f85666665f856hhh665856hgigh65856hijih65056hgigh650566hhh6563366666363ccccccc6cccc111b6166cdddk6ddd6ckdd6666ddcck6dd6666cc666dd6eec6eee666ee6eeeeeeeee' +
        '040g5555558f85666665f856hhh665856hgigh65856hijih65056hgigh650566hhh65633666663633333333633cc111b6166c111b61116ckdd6666ddcck6dd6666cc666dd6eec6eee666ee6eeeeeeeee' +
        '04025555558f89666669f89677766989672a27698967a6a76989672a276905667776565566666565333333363333111b61663111b61116ckdd6666ddcck6dd6666cc666dd6eec6eee666ee6eeeeeeeee' +
        '04025555550405666665f89677766989672a27698967a6a76989672a276989667776965566666565333333363333111061663111b611163b11666611cck6dd6666cc666dd6eec6eee666ee6eeeeeeeee' +
        '01023333330405666665405677766589672a27698967a6a76989672a2769896677769655666665655555555655331110616631110611163b1166661133b6116666cc666dd6eec6eee666ee6eeeeeeeee',
      draw(px, f) {
        const C = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', o = f * 160;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, this.pal[C.indexOf(this.px[o + y * 10 + x])]);
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
      // Galaxia: brazos en espiral que giran alrededor de un núcleo brillante
      id: 'galaxy', name: 'Galaxia', rarity: 'legendary', frames: 20, fps: 10,
      draw(px, f) {
        const t = f / 20 * TAU;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const dx = x - 4.5, dy = (y - 7.5) * 0.62;
          const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          const arm = Math.max(0, Math.sin(a * 2 - d * 1.25 + t));
          const fade = Math.max(0, 1 - d / 6.2);
          let c = mix('#05020f', mix('#7c3aed', '#22d3ee', Math.min(1, d / 4.5)), arm * fade * 1.15);
          if (d < 1.1) c = '#fff7ed'; else if (d < 1.9) c = mix(c, '#fbcfe8', 0.75);
          px(x, y, c);
        }
        [[0, 1, 0], [9, 3, 7], [1, 14, 3], [8, 13, 11], [0, 8, 15], [9, 9, 5]].forEach(([x, y, p]) => {
          const k = (f + p) % 20;
          if (k < 3) px(x, y, k === 1 ? '#ffffff' : '#a5b4fc');
        });
      }
    },
    {
      // Tormenta: nubes que pasan, lluvia y un rayo que ilumina todo
      id: 'storm', name: 'Tormenta', rarity: 'legendary', frames: 20, fps: 10,
      draw(px, f) {
        const flash = f === 12 || f === 14;
        const bg = vgrad(flash ? '#475569' : '#1e293b', flash ? '#1e293b' : '#070b16');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        // nubes
        for (let x = 0; x < W; x++) {
          const h = 2 + Math.round((Math.sin((x + f * 0.5) * 0.9) + Math.sin((x - f * 0.25) * 1.7)) * 0.7);
          for (let y = 0; y <= h; y++) px(x, y, y === h ? (flash ? '#94a3b8' : '#475569') : y === 0 ? '#1f2937' : (flash ? '#64748b' : '#334155'));
        }
        // lluvia en diagonal
        [[1, 0], [3, 7], [5, 3], [7, 11], [9, 5], [2, 15], [6, 9], [8, 17]].forEach(([x, ph]) => {
          const y = 4 + ((f * 2 + ph) % 14);
          const rx = (x - Math.floor((f * 2 + ph) % 14 / 4) + W) % W;
          if (y < H) px(rx, y, '#7dd3fc');
          if (y - 1 >= 4) px(rx, y - 1, '#38bdf8');
        });
        // el rayo
        if (f >= 11 && f <= 14 && f !== 13) {
          [[6, 4], [5, 5], [5, 6], [4, 7], [5, 8], [4, 9], [3, 10], [4, 11], [3, 12], [2, 13], [3, 14], [2, 15]].forEach(([x, y], i) => {
            px(x, y, i % 3 ? '#fef9c3' : '#ffffff');
            if (f === 12) px(x + 1, y, '#fde047');
          });
        }
      }
    },
    {
      // Corona real: corona de oro con joyas sobre terciopelo; un brillo la recorre
      id: 'crown', name: 'Corona real', rarity: 'legendary', frames: 20, fps: 10,
      draw(px, f) {
        const bg = vgrad('#4c0519', '#1c0310');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, (x === 0 || x === 9) && y > 0 ? '#a16207' : bg(y));
        for (let x = 0; x < W; x++) { px(x, 0, '#ca8a04'); px(x, 15, '#ca8a04'); }
        const crown = ['X..XX..X', 'XX.XX.XX', 'XXXXXXXX', 'XRXXBXRX', 'XXXXXXXX', 'DDDDDDDD'];
        crown.forEach((row, r) => [...row].forEach((c, i) => {
          if (c === '.') return;
          const x = 1 + i, y = 4 + r;
          const shine = (x + y + 20 - f) % 20;
          const gold = c === 'D' ? '#b45309' : r === 0 ? '#fef08a' : '#fbbf24';
          px(x, y, c === 'R' ? '#ef4444' : c === 'B' ? '#3b82f6' : shine < 2 ? '#fffbeb' : gold);
        }));
        // joyitas en las puntas que brillan
        [[1, 3, 0], [4, 3, 7], [5, 3, 7], [8, 3, 14]].forEach(([x, y, p]) => { if ((f + p) % 20 < 4) px(x, y, '#fef9c3'); });
        // destellos sueltos
        [[2, 12, 3], [7, 13, 10], [5, 11, 16]].forEach(([x, y, p]) => { const k = (f + p) % 20; if (k < 2) px(x, y, k ? '#fde68a' : '#ffffff'); });
      }
    },
    {
      // Ojo de dragón: escamas al rojo vivo y un ojo que mira, se dilata y parpadea
      id: 'dragon', name: 'Ojo de dragón', rarity: 'legendary', frames: 20, fps: 10,
      draw(px, f) {
        const t = f / 20 * TAU;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const scale = (x + (y % 2 ? 1 : 0)) % 2 ? '#450a0a' : '#7f1d1d';
          const heat = (Math.sin(y * 0.6 - t) + 1) / 2;
          px(x, y, mix(scale, '#b91c1c', heat * 0.45));
        }
        const eye = [[5, 3, 6], [6, 2, 7], [7, 1, 8], [8, 1, 8], [9, 2, 7], [10, 3, 6]];
        const closed = f === 16 || f === 17;
        const wide = f >= 6 && f < 11;
        eye.forEach(([y, a, b]) => {
          for (let x = a; x <= b; x++) {
            if (closed) { px(x, y, y === 7 || y === 8 ? '#1c0505' : '#991b1b'); continue; }
            const edge = x === a || x === b;
            let c = edge ? '#ea580c' : mix('#fde047', '#f97316', Math.abs(x - 4.5) / 3.5);
            if (x === 4 || x === 5 || (wide && (x === 3 || x === 6) && y > 5 && y < 10)) c = '#0a0a0a';
            px(x, y, c);
          }
        });
        if (!closed) px(3, 6, '#fffbeb');
        // brasas que suben
        [[1, 0], [8, 9], [6, 14]].forEach(([x, ph]) => { const y = 15 - ((f + ph) % 20); if (y >= 0 && y < 16 && (y < 4 || y > 11)) px(x, y, '#fdba74'); });
      }
    },
    {
      // Fénix: un pájaro de fuego que bate las alas, con la cola en llamas
      id: 'phoenix', name: 'Fénix', rarity: 'legendary', frames: 12, fps: 10,
      draw(px, f) {
        const t = f / 12 * TAU;
        const bg = vgrad('#1c0a00', '#450a0a');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        const fire = (k) => (k < 0.25 ? '#fef08a' : k < 0.5 ? '#fde047' : k < 0.75 ? '#f97316' : '#dc2626');
        // alas: triángulos de fuego que suben y bajan
        const tip = 6 + Math.round(Math.sin(t) * 4);
        for (let i = 0; i < 4; i++) {
          const top = Math.round(tip + (i / 3) * (6 - tip));
          const bottom = top + 1 + Math.round(i * 0.9);
          for (let y = top; y <= bottom; y++) {
            const c = fire(1 - i / 3 + (y - top) * 0.08);
            px(i, y, c); px(9 - i, y, c);
          }
        }
        // cuerpo
        for (let y = 5; y <= 11; y++) { px(4, y, y < 8 ? '#fde047' : '#f59e0b'); px(5, y, y < 8 ? '#fef08a' : '#fbbf24'); }
        // cabeza con pico y ojo
        px(4, 3, '#fde047'); px(5, 3, '#fef08a'); px(4, 4, '#fbbf24'); px(5, 4, '#fde047');
        px(5, 3, '#1c0a00'); px(6, 4, '#f97316');
        px(4, 2, f % 4 < 2 ? '#f97316' : '#dc2626'); px(3, 2, f % 4 < 2 ? '#dc2626' : '#f97316');
        // cola de fuego
        for (let y = 12; y < H; y++) {
          const w = y - 11;
          for (let dx = -w; dx <= w; dx++) {
            const flick = Math.sin(t * 2 + y + dx) > 0.2;
            if (Math.abs(dx) === w && !flick) continue;
            px(Math.max(0, Math.min(9, 4 + dx + (dx > 0 ? 1 : 0))), y, fire(0.25 + Math.abs(dx) / (w + 0.5) * 0.75));
          }
        }
        [[1, 1], [8, 6]].forEach(([x, ph]) => { const y = 3 - ((f + ph) % 6); if (y >= 0) px(x, y, '#fdba74'); });
      }
    },
    {
      // Diamante: una gema que brilla con destellos alrededor
      id: 'diamond', name: 'Diamante', rarity: 'epic', frames: 20, fps: 10,
      draw(px, f) {
        const bg = vgrad('#082f49', '#020617');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        const rows = [[3, 3, 6], [4, 2, 7], [5, 1, 8], [6, 1, 8], [7, 2, 7], [8, 2, 7], [9, 3, 6], [10, 3, 6], [11, 4, 5], [12, 4, 5]];
        const faces = ['#a5f3fc', '#67e8f9', '#22d3ee', '#0891b2'];
        rows.forEach(([y, a, b]) => {
          for (let x = a; x <= b; x++) {
            let c = y < 5 ? faces[(x + 1) % 2] : faces[(x < 5 ? 1 : 2) + (y % 2)];
            if (y === 5) c = '#ecfeff';
            const shine = (x - y + 40 - f * 2) % 20;
            if (shine === 0 || shine === 1) c = '#ffffff';
            px(x, y, c);
          }
        });
        [[1, 2, 0], [8, 1, 6], [0, 11, 12], [9, 12, 3], [2, 14, 15]].forEach(([x, y, p]) => {
          const k = (f + p) % 20;
          if (k < 3) { px(x, y, '#ffffff'); if (k === 1) { px(x - 1, y, '#67e8f9'); px(x + 1, y, '#67e8f9'); px(x, y - 1, '#67e8f9'); px(x, y + 1, '#67e8f9'); } }
        });
      }
    },
    {
      // Lava: roca fundida que fluye hacia abajo
      id: 'lava', name: 'Lava', rarity: 'epic', frames: 16, fps: 8,
      draw(px, f) {
        const t = f / 16 * TAU;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const v = Math.sin(x * 0.9 + (y - f) * 0.55) + Math.sin(x * 0.45 - y * 0.8 + t) + 0.35 * Math.sin(x * 2.1 + y * 1.3 - t);
          px(x, y, v > 1.3 ? '#fef08a' : v > 0.7 ? '#fb923c' : v > 0.1 ? '#ea580c' : v > -0.6 ? '#7c2d12' : '#1c1917');
        }
      }
    },
    {
      // Oleaje: olas que van y vienen bajo un sol
      id: 'ocean', name: 'Oleaje', rarity: 'epic', frames: 16, fps: 8,
      draw(px, f) {
        const t = f / 16 * TAU;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, y < 6 ? mix('#fb923c', '#fde68a', y / 5) : mix('#0ea5e9', '#082f49', (y - 6) / 9));
        px(6, 2, '#fffbeb'); px(7, 2, '#fff7ed'); px(6, 3, '#fff7ed'); px(7, 3, '#fef3c7');
        for (let x = 0; x < W; x++) {
          const wy = 6 + Math.round(Math.sin(x * 0.8 + t) * 1.2);
          px(x, wy, '#f0f9ff'); px(x, wy + 1, '#7dd3fc');
          for (let y = wy + 2; y < 8; y++) px(x, y, '#38bdf8');
          const w2 = 11 + Math.round(Math.sin(x * 0.7 - t + 1.5));
          px(x, w2, '#38bdf8');
          if ((x + f) % 5 === 0) px(x, w2 - 1, '#bae6fd');
        }
      }
    },
    {
      // Código: columnas de letras verdes que caen sin parar
      id: 'code', name: 'Código', rarity: 'epic', frames: 20, fps: 10,
      draw(px, f) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, (x * 7 + y * 3) % 11 === 0 ? '#06140b' : '#020a05');
        [[0, 3, 1], [1, 11, 2], [2, 7, 1], [3, 16, 2], [4, 1, 1], [5, 9, 2], [6, 14, 1], [7, 5, 2], [8, 18, 1], [9, 12, 2]].forEach(([x, ph, sp]) => {
          const head = ((f * sp + ph) % 20) - 2;
          const trail = ['#dcfce7', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#14532d'];
          trail.forEach((c, k) => { const y = head - k; if (y >= 0 && y < H) px(x, y, (x + y + f) % 4 === 0 && k > 1 ? '#0f3d22' : c); });
        });
      }
    },
    {
      // Arcoíris: franjas de colores que se deslizan, con destellos
      id: 'rainbow', name: 'Arcoíris', rarity: 'epic', frames: 20, fps: 10,
      draw(px, f) {
        const cols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const k = Math.floor(((x + y) / 2.5 + f * 0.4) % cols.length);
          px(x, y, cols[k]);
        }
        [[2, 3, 0], [7, 6, 7], [4, 11, 13], [8, 14, 4]].forEach(([x, y, p]) => { if ((f + p) % 20 < 3) px(x, y, '#ffffff'); });
      }
    },
    {
      // Tóxico: baba verde que burbujea y gotea
      id: 'toxic', name: 'Tóxico', rarity: 'epic', frames: 16, fps: 8,
      draw(px, f) {
        const t = f / 16 * TAU;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, mix('#0c1a0c', '#1a2e05', y / 15));
        for (let x = 0; x < W; x++) {
          const lvl = 8 + Math.round(Math.sin(x * 0.9 + t) * 1.1);
          for (let y = lvl; y < H; y++) px(x, y, y === lvl ? '#bef264' : (x + y) % 3 ? '#65a30d' : '#4d7c0f');
        }
        // burbujas que suben y explotan
        [[2, 0], [6, 5], [8, 10], [4, 13]].forEach(([x, ph]) => {
          const k = (f + ph) % 16;
          const y = 15 - k;
          if (y > 8) px(x, y, '#d9f99d'); else if (y === 8) { px(x - 1, 7, '#ecfccb'); px(x + 1, 7, '#ecfccb'); }
        });
        // gotas desde arriba
        for (let x = 0; x < W; x++) px(x, 0, '#84cc16');
        [[1, 0], [5, 6], [8, 11]].forEach(([x, ph]) => {
          const y = (f + ph) % 16;
          const len = Math.min(y, 3);
          for (let k = 0; k <= len; k++) if (y - k < 7) px(x, y - k, k === 0 ? '#d9f99d' : '#84cc16');
        });
      }
    },
    {
      // Sakura: una rama de cerezo en flor y pétalos que caen
      id: 'sakura', name: 'Sakura', rarity: 'rare', frames: 20, fps: 10,
      draw(px, f) {
        const bg = vgrad('#fff1f2', '#fbcfe8');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        [[0, 2], [1, 2], [2, 3], [3, 3], [4, 4], [5, 4], [6, 5], [3, 4], [2, 5], [7, 5], [8, 6]].forEach(([x, y]) => px(x, y, '#57352a'));
        [[1, 1], [3, 2], [5, 3], [7, 4], [2, 6], [9, 5], [4, 5], [0, 3]].forEach(([x, y], i) => {
          px(x, y, (f + i * 3) % 20 < 15 ? '#f472b6' : '#f9a8d4');
          if (i % 2 === 0) px(x + 1, y, '#fbcfe8');
        });
        [[1, 0], [4, 7], [7, 13], [9, 4], [5, 16]].forEach(([x, ph], i) => {
          const y = 5 + ((f + ph) % 20) * 11 / 20;
          const sx = Math.round(x + Math.sin((f + ph) * 0.6) * 1.2);
          px(Math.max(0, Math.min(9, sx)), Math.round(y), i % 2 ? '#ec4899' : '#f9a8d4');
        });
      }
    },
    {
      // Navidad: un árbol con luces de colores, estrella y nieve
      id: 'xmas', name: 'Navidad', rarity: 'rare', frames: 20, fps: 10,
      draw(px, f) {
        const bg = vgrad('#0c1a3a', '#1e3a8a');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        for (let x = 0; x < W; x++) { px(x, 15, '#f8fafc'); if (x % 3) px(x, 14, '#e2e8f0'); }
        const tree = [[3, 4, 5], [4, 4, 5], [5, 3, 6], [6, 3, 6], [7, 2, 7], [8, 2, 7], [9, 1, 8], [10, 1, 8], [11, 2, 7]];
        tree.forEach(([y, a, b]) => { for (let x = a; x <= b; x++) px(x, y, (x + y) % 3 ? '#15803d' : '#166534'); });
        px(4, 12, '#78350f'); px(5, 12, '#78350f'); px(4, 13, '#713f12'); px(5, 13, '#713f12');
        px(4, 2, '#fde047'); px(5, 2, '#fde047'); if (f % 10 < 5) { px(4, 1, '#fef9c3'); px(5, 1, '#fef9c3'); }
        const lights = [[4, 5], [5, 7], [3, 7], [6, 9], [2, 9], [4, 9], [7, 10], [1, 10], [5, 11], [3, 11]];
        const cols = ['#ef4444', '#facc15', '#3b82f6', '#ec4899'];
        lights.forEach(([x, y], i) => px(x, y, cols[(i + Math.floor(f / 5)) % cols.length]));
        [[0, 0], [2, 9], [7, 4], [9, 14], [8, 18]].forEach(([x, ph]) => {
          const y = ((f + ph) % 20) * 14 / 20;
          const ry = Math.round(y);
          const sx = x + (Math.floor((f + ph) / 4) % 2);
          if (ry < 14 && !(sx >= 1 && sx <= 8 && ry >= 2 && ry <= 13)) px(Math.min(9, sx), ry, '#ffffff');
        });
      }
    },
    {
      // Corazón: late dos veces y descansa
      id: 'heart', name: 'Corazón', rarity: 'rare', frames: 12, fps: 10,
      draw(px, f) {
        const bg = vgrad('#4a044e', '#1f0322');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, bg(y));
        const big = f === 0 || f === 3;
        const small = ['.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'];
        const large = ['.XXX..XXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...', '....XX....'];
        const shape = big ? large : small, ox = big ? 0 : 1, oy = big ? 4 : 5;
        shape.forEach((row, r) => [...row].forEach((c, i) => { if (c === 'X') px(ox + i, oy + r, r === shape.length - 1 || row[i + 1] !== 'X' ? '#be123c' : '#f43f5e'); }));
        px(ox + 1, oy + 1, '#fecdd3'); px(ox + 2, oy + 1, '#fda4af');
        if (big) [[0, 2], [9, 3], [1, 14], [8, 13]].forEach(([x, y]) => px(x, y, '#fb7185'));
      }
    },
    {
      // Hielo: hielo profundo con grietas que brillan y un copo de nieve que gira
      id: 'ice', name: 'Hielo', rarity: 'rare', frames: 16, fps: 8,
      draw(px, f) {
        const bg = vgrad('#0c4a6e', '#082f49');
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let c = bg(y);
          if ((x * 2 + y) % 7 === 0 || (x + y * 3) % 11 === 0) c = '#0e7490';
          const shine = (x + y + 32 - f * 2) % 16;
          if (shine < 2) c = mix(c, '#a5f3fc', 0.55);
          px(x, y, c);
        }
        const diag = Math.floor(f / 4) % 2;
        const arms = diag ? [[1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const cx = 4.5, cy = 7.5;
        px(4, 7, '#ffffff'); px(5, 7, '#ffffff'); px(4, 8, '#ffffff'); px(5, 8, '#ffffff');
        arms.forEach(([dx, dy]) => {
          for (let k = 1; k <= 3; k++) {
            px(Math.round(cx + dx * k - (dx < 0 ? 1 : 0)), Math.round(cy + dy * k - (dy < 0 ? 1 : 0)), k === 3 ? '#67e8f9' : '#ffffff');
          }
        });
        [[1, 1, 0], [8, 2, 5], [1, 14, 10], [8, 13, 3]].forEach(([x, y, p]) => { if ((f + p) % 16 < 3) px(x, y, '#ecfeff'); });
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

  // ---------------------------------------------------------------- dibujar
  function paint(ctx, cape, f, ox = 0, oy = 0, tint = null) {
    cape.draw((x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      ctx.fillStyle = tint ? mix(c, tint[0], tint[1]) : c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }, f % cape.frames);
  }

  // Textura 64×32 de Minecraft: delante (1,1), detrás (12,1), lados y bordes
  function texture(cape, f = 0) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 32;
    const ctx = cv.getContext('2d');
    paint(ctx, cape, f, 1, 1);
    paint(ctx, cape, f, 12, 1, ['#000000', 0.45]);
    const edge = ctx.getImageData(1, 1, 1, 1).data;
    ctx.fillStyle = `rgb(${edge[0] * 0.6 | 0},${edge[1] * 0.6 | 0},${edge[2] * 0.6 | 0})`;
    ctx.fillRect(0, 1, 1, 16); ctx.fillRect(11, 1, 1, 16); ctx.fillRect(1, 0, 20, 1);
    return cv;
  }

  // Miniaturas animadas: un solo reloj para todas; se paran solas al salir de la pantalla
  const live = new Set();
  let timer = 0, tick = 0;
  function loop() {
    tick++;
    for (const it of live) {
      if (!it.cv.isConnected) { live.delete(it); continue; }
      const step = Math.floor(tick * it.cape.fps / 24);
      if (step === it.last) continue;
      it.last = step;
      paint(it.ctx, it.cape, step);
    }
    if (!live.size) { clearInterval(timer); timer = 0; }
  }
  function mount(cv, cape) {
    cv.width = W; cv.height = H;
    const it = { cv, cape, ctx: cv.getContext('2d'), last: -1 };
    paint(it.ctx, cape, 0);
    if (cape.frames > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      live.add(it);
      if (!timer) timer = setInterval(loop, 1000 / 24);
    }
  }

  window.KopiCapes = { list: CAPES, RARITY, mount, texture, get: (id) => CAPES.find(c => c.id === id) };
})();
