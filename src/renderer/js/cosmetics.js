// Marcos y fondos de perfil de Kopi: el DIBUJO de cada uno (SVG animado, sin CSS propio).
//  - Marco: va alrededor de la cara del jugador (avatar cuadrado). KopiCosmetics.wrap(htmlDeLaCara, id, px)
//  - Fondo: va detrás de la tarjeta del perfil. KopiCosmetics.bgLayer(id) → primer hijo de la tarjeta
//    (la tarjeta necesita position: relative; isolation: isolate; overflow: hidden).
// Hay tres copias IGUALES: src/renderer/js/cosmetics.js (launcher), panel/public/js/cosmetics.js (panel y
// servidor) y web/assets/kopi-cosmetics.js (perfil web). Una prueba comprueba que son iguales.
(function () {
  let seq = 0;
  const uid = () => 'kc' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
  const RARITY = {
    mythic: { label: 'Mítica', color: '#ffd76a' },
    legendary: { label: 'Legendaria', color: '#fbbf24' },
    epic: { label: 'Épica', color: '#e879f9' },
    rare: { label: 'Rara', color: '#60a5fa' },
    common: { label: 'Común', color: '#a1a1aa' }
  };
  // De dónde sale cada uno: free = todos lo tienen · badge = lo tiene quien tenga esa insignia · si no, regalo (o ruleta)
  // ---------------------------------------------------------------- marcos (avatar de 0 a 100; el SVG va de -20 a 120)
  const ring = (stroke, w = 7, extra = '') => `<rect x="-5" y="-5" width="110" height="110" rx="26" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
  const rot = (dur, cx = 0.5, cy = 0.5) => `<animateTransform attributeName="gradientTransform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${dur}s" repeatCount="indefinite"/>`;
  const glow = (id, sd = 2.4) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const twinkle = (x, y, r, color, dur, begin) => `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28} ${x + r} ${y} ${x + r * 0.28} ${y + r * 0.28} ${x} ${y + r} ${x - r * 0.28} ${y + r * 0.28} ${x - r} ${y} ${x - r * 0.28} ${y - r * 0.28}z" fill="${color}" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></path>`;
  const RECT_PATH = 'M21,-5 H79 A26,26 0 0 1 105,21 V79 A26,26 0 0 1 79,105 H21 A26,26 0 0 1 -5,79 V21 A26,26 0 0 1 21,-5 Z';
  const orbit = (color, r, dur, begin) => `<circle r="${r}" fill="${color}"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${RECT_PATH}"/></circle>`;
  const CROWN = 'M30 -14 L36 -30 L44 -18 L50 -34 L56 -18 L64 -30 L70 -14 Z';

  const FRAMES = [
    { id: 'none', name: 'Sin marco', rarity: 'common', free: true, draw: () => '' },
    {
      id: 'silver', name: 'Plata', rarity: 'common', free: true,
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f5"/><stop offset=".5" stop-color="#9ca3af"/><stop offset="1" stop-color="#e5e7eb"/></linearGradient></defs>${ring(`url(#${u}g)`, 6)}`
    },
    {
      id: 'neon', name: 'Neón', rarity: 'rare',
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f472b6"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#f472b6"/>${rot(4)}</linearGradient>${glow(u + 'f', 2.6)}</defs>
        <g filter="url(#${u}f)">${ring(`url(#${u}g)`, 6)}</g>`
    },
    {
      id: 'frost', name: 'Escarcha', rarity: 'rare',
      draw: (u) => {
        const flake = (x, y, d) => `<g transform="translate(${x} ${y})"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${d}s" repeatCount="indefinite"/>
          ${[0, 60, 120].map(a => `<rect x="-1.2" y="-9" width="2.4" height="18" rx="1.2" fill="#e0f2fe" transform="rotate(${a})"/>`).join('')}<circle r="2.6" fill="#7dd3fc"/></g></g>`;
        return `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>${glow(u + 'f', 1.8)}</defs>
          <g filter="url(#${u}f)">${ring(`url(#${u}g)`, 6)}</g>${flake(-4, -4, 9)}${flake(104, 104, 11)}${flake(104, -4, 13)}${twinkle(-6, 60, 4, '#ffffff', 2.2, 0.4)}${twinkle(106, 40, 4, '#ffffff', 2.6, 1.2)}`;
      }
    },
    {
      id: 'xmas', name: 'Navidad', rarity: 'rare',
      draw: () => `${ring('#f8fafc', 8)}<rect x="-5" y="-5" width="110" height="110" rx="26" fill="none" stroke="#ef4444" stroke-width="8" stroke-dasharray="10 10"><animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.6s" repeatCount="indefinite"/></rect>
        <g transform="translate(96 -2)"><ellipse cx="-7" cy="0" rx="9" ry="5" fill="#16a34a" transform="rotate(-30 -7 0)"/><ellipse cx="7" cy="0" rx="9" ry="5" fill="#15803d" transform="rotate(30 7 0)"/>
          <circle cx="-2" cy="4" r="3.6" fill="#dc2626"/><circle cx="3" cy="5" r="3.6" fill="#ef4444"/></g>`
    },
    {
      id: 'fire', name: 'Llamas', rarity: 'epic',
      draw: (u) => {
        const flame = (x, y, s, d, b, rotDeg = 0) => `<g transform="translate(${x} ${y}) rotate(${rotDeg}) scale(${s})"><path d="M0 0 C-7 -6 -4 -14 0 -22 C4 -14 7 -6 0 0Z" fill="url(#${u}fl)">
          <animateTransform attributeName="transform" type="scale" values="1 1;1.1 0.8;0.95 1.15;1 1" dur="${d}s" begin="${b}s" repeatCount="indefinite"/></path></g>`;
        return `<defs><linearGradient id="${u}g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fde047"/><stop offset=".45" stop-color="#f97316"/><stop offset="1" stop-color="#b91c1c"/></linearGradient>
          <linearGradient id="${u}fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fde047"/><stop offset=".6" stop-color="#f97316"/><stop offset="1" stop-color="#dc2626" stop-opacity=".2"/></linearGradient>${glow(u + 'f', 2.2)}</defs>
          <g filter="url(#${u}f)">${ring(`url(#${u}g)`, 7)}</g>
          ${flame(20, 108, 0.9, 0.7, 0)}${flame(40, 110, 1.15, 0.6, 0.2)}${flame(60, 110, 1.25, 0.65, 0.1)}${flame(80, 108, 0.95, 0.55, 0.3)}
          ${flame(-6, 70, 0.8, 0.6, 0.15, -90)}${flame(106, 64, 0.85, 0.7, 0.05, 90)}${flame(-6, 36, 0.6, 0.5, 0.25, -90)}${flame(106, 32, 0.65, 0.6, 0.35, 90)}`;
      }
    },
    {
      id: 'galaxy', name: 'Galaxia', rarity: 'epic',
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#7c3aed"/>${rot(8)}</linearGradient>${glow(u + 'f', 2.2)}</defs>
        <g filter="url(#${u}f)">${ring(`url(#${u}g)`, 6)}${orbit('#ffffff', 2.6, 5, 0)}${orbit('#f0abfc', 2, 5, -1.7)}${orbit('#a5f3fc', 2, 5, -3.4)}</g>
        ${twinkle(-12, 10, 4, '#e9d5ff', 2.4, 0)}${twinkle(112, 88, 4, '#bae6fd', 2.8, 1)}${twinkle(110, 4, 3, '#ffffff', 2, 1.6)}`
    },
    {
      id: 'gold', name: 'Oro', rarity: 'epic',
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef3c7"/><stop offset=".3" stop-color="#f59e0b"/>
          <stop offset=".5" stop-color="#fffbeb"><animate attributeName="offset" values="-.2;1.2" dur="2.6s" repeatCount="indefinite"/></stop><stop offset=".7" stop-color="#d97706"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs>
        ${ring(`url(#${u}g)`, 8)}<rect x="-11" y="-11" width="122" height="122" rx="31" fill="none" stroke="#b45309" stroke-width="1.6" opacity=".9"/>
        ${twinkle(110, -6, 5, '#fffbeb', 2.4, 0)}${twinkle(-8, 106, 4, '#fde68a', 2.8, 1.3)}`
    },
    {
      id: 'rgb', name: 'RGB', rarity: 'legendary',
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1">${['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#ef4444'].map((c, i) => `<stop offset="${i / 8}" stop-color="${c}"/>`).join('')}${rot(3)}</linearGradient>${glow(u + 'f', 3.2)}</defs>
        <g filter="url(#${u}f)">${ring(`url(#${u}g)`, 7)}</g>`
    },
    {
      id: 'crown', name: 'Corona', rarity: 'legendary',
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#fde68a"/>${rot(6)}</linearGradient>
          <linearGradient id="${u}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbeb"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></linearGradient>${glow(u + 'f', 2)}</defs>
        ${ring(`url(#${u}g)`, 7)}
        <g filter="url(#${u}f)"><path d="${CROWN}" fill="url(#${u}c)" stroke="#fff3c0" stroke-width="1.2" stroke-linejoin="round">
          <animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="2.4s" repeatCount="indefinite"/></path></g>
        <circle cx="50" cy="-22" r="2.6" fill="#ef4444"/><circle cx="38" cy="-19" r="1.8" fill="#3b82f6"/><circle cx="62" cy="-19" r="1.8" fill="#3b82f6"/>
        ${twinkle(24, -26, 4, '#fffbeb', 2.2, 0)}${twinkle(78, -28, 4, '#fffbeb', 2.6, 1.1)}`
    },
    {
      id: 'team', name: 'Equipo Kopi', rarity: 'legendary', badge: 'kopi-team',
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fbf"/><stop offset=".5" stop-color="#a855f7"/><stop offset="1" stop-color="#ff6fbf"/>${rot(5)}</linearGradient>${glow(u + 'f', 2.6)}</defs>
        <g filter="url(#${u}f)">${ring(`url(#${u}g)`, 7)}${orbit('#ffe4f3', 2.4, 6, 0)}${orbit('#f0abfc', 2.4, 6, -3)}</g>
        ${twinkle(-10, -8, 5, '#ffc6e6', 2.2, 0)}${twinkle(110, 108, 5, '#e9d5ff', 2.6, 1)}`
    },
    {
      id: 'creator', name: 'Creador', rarity: 'mythic', badge: 'kopi-creator',
      draw: (u) => `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".25" stop-color="#e6a817"/>
          <stop offset=".5" stop-color="#fffbe6"><animate attributeName="offset" values="-.2;1.2" dur="2.2s" repeatCount="indefinite"/></stop><stop offset=".75" stop-color="#b8860b"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>
          <linearGradient id="${u}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#ffd24a"/><stop offset="1" stop-color="#c88a0c"/></linearGradient>
          <radialGradient id="${u}a"><stop offset=".72" stop-color="#ffd76a" stop-opacity="0"/><stop offset=".82" stop-color="#ffd76a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>${glow(u + 'f', 2.4)}</defs>
        <circle cx="50" cy="50" r="72" fill="url(#${u}a)"><animate attributeName="r" values="64;74;64" dur="3s" repeatCount="indefinite"/></circle>
        <g filter="url(#${u}f)">${ring(`url(#${u}g)`, 8)}${orbit('#fffbe6', 2.8, 4, 0)}${orbit('#ffd76a', 2.2, 4, -1)}${orbit('#fffbe6', 2.8, 4, -2)}${orbit('#ffd76a', 2.2, 4, -3)}</g>
        <g filter="url(#${u}f)"><path d="M26 -12 L33 -34 L42 -20 L50 -40 L58 -20 L67 -34 L74 -12 Z" fill="url(#${u}c)" stroke="#fff3c0" stroke-width="1.4" stroke-linejoin="round">
          <animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="2.4s" repeatCount="indefinite"/></path></g>
        <circle cx="50" cy="-26" r="3.2" fill="#ff5ad1"/><circle cx="35" cy="-22" r="2.2" fill="#7cd4ff"/><circle cx="65" cy="-22" r="2.2" fill="#7cd4ff"/>
        ${twinkle(16, -30, 5, '#fffbe6', 2, 0)}${twinkle(86, -32, 5, '#fffbe6', 2.4, 0.8)}${twinkle(-14, 60, 4, '#ffd76a', 2.2, 1.4)}${twinkle(114, 50, 4, '#ffd76a', 2.6, 0.4)}`
    }
  ];

  // ---------------------------------------------------------------- fondos (SVG 400×200, recortado para llenar)
  const rnd = (n) => { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
  const stars = (n, seed, colors = ['#ffffff'], maxR = 1.6) => {
    const r = rnd(seed);
    return Array.from({ length: n }, (_, i) => `<circle cx="${(r() * 400).toFixed(1)}" cy="${(r() * 200).toFixed(1)}" r="${(0.5 + r() * maxR).toFixed(2)}" fill="${colors[i % colors.length]}">
      <animate attributeName="opacity" values="1;.15;1" dur="${(1.8 + r() * 3).toFixed(1)}s" begin="${(r() * 3).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('');
  };
  // partículas que cruzan de un lado a otro (dy > 0 caen, dy < 0 suben)
  const drift = (n, seed, shape, dy, dur, sway = 10) => {
    const r = rnd(seed);
    return Array.from({ length: n }, () => {
      const x = (r() * 420 - 10).toFixed(1), d = (dur * (0.7 + r() * 0.6)).toFixed(1), b = (-r() * dur).toFixed(1), s = (0.6 + r() * 0.8).toFixed(2);
      const y0 = dy > 0 ? -20 : 220, y1 = dy > 0 ? 220 : -20;
      return `<g transform="translate(${x} 0)"><g><animateTransform attributeName="transform" type="translate" values="0 ${y0};${sway} ${(y0 + y1) / 2};0 ${y1}" dur="${d}s" begin="${b}s" repeatCount="indefinite"/><g transform="scale(${s})">${shape}</g></g></g>`;
    }).join('');
  };
  const BGS = [
    { id: 'none', name: 'Por defecto', rarity: 'common', free: true, css: '', draw: () => '' },
    {
      id: 'night', name: 'Noche estrellada', rarity: 'common', free: true, css: 'linear-gradient(160deg, #0b1026, #1e1b4b 70%, #312e81)',
      draw: () => `${stars(46, 3, ['#ffffff', '#c7d2fe', '#fde68a'])}<path d="M330 34a16 16 0 1 0 14 24a12 12 0 1 1 -14 -24z" fill="#fef3c7" opacity=".9"/>`
    },
    {
      id: 'sunset', name: 'Atardecer', rarity: 'rare', css: 'linear-gradient(180deg, #4c1d95 0%, #db2777 55%, #f97316 100%)',
      draw: (u) => `<defs><radialGradient id="${u}s"><stop offset="0" stop-color="#fef3c7"/><stop offset=".5" stop-color="#fdba74" stop-opacity=".8"/><stop offset="1" stop-color="#fb923c" stop-opacity="0"/></radialGradient></defs>
        <circle cx="300" cy="190" r="70" fill="url(#${u}s)"><animate attributeName="r" values="64;74;64" dur="5s" repeatCount="indefinite"/></circle>
        <path d="M0 200 L60 150 L110 178 L170 128 L240 176 L300 150 L360 172 L400 140 V200Z" fill="#3b0764" opacity=".85"/>
        ${[[50, 14, 0], [70, 18, -5], [36, 22, -9]].map(([y, d, b]) => `<path d="M-6 0 Q-3 -4 0 0 Q3 -4 6 0" stroke="#3b0764" stroke-width="1.6" fill="none">
          <animateTransform attributeName="transform" type="translate" values="-30 ${y};215 ${y - 14};440 ${y + 6}" dur="${d}s" begin="${b}s" repeatCount="indefinite"/></path>`).join('')}`
    },
    {
      id: 'ocean', name: 'Océano', rarity: 'rare', css: 'linear-gradient(180deg, #0369a1, #0c4a6e 55%, #082f49)',
      draw: () => [0, 1, 2].map(i => `<path d="M-400 ${130 + i * 24} Q-350 ${118 + i * 24} -300 ${130 + i * 24} T-200 ${130 + i * 24} T-100 ${130 + i * 24} T0 ${130 + i * 24} T100 ${130 + i * 24} T200 ${130 + i * 24} T300 ${130 + i * 24} T400 ${130 + i * 24} T500 ${130 + i * 24} V220 H-400Z" fill="${['#38bdf8', '#0ea5e9', '#0369a1'][i]}" opacity="${[0.35, 0.45, 0.6][i]}">
          <animateTransform attributeName="transform" type="translate" from="0 0" to="${i % 2 ? -200 : 200} 0" dur="${8 + i * 3}s" repeatCount="indefinite"/></path>`).join('') +
        drift(10, 5, '<circle r="2.4" fill="none" stroke="#bae6fd" stroke-width="1"/>', -1, 9, 8)
    },
    {
      id: 'sakura', name: 'Sakura', rarity: 'rare', css: 'linear-gradient(160deg, #500724, #831843 60%, #be185d)',
      draw: () => drift(22, 11, '<path d="M0 -5 C4 -5 6 0 0 5 C-6 0 -4 -5 0 -5Z" fill="#fbcfe8"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite"/></path>', 1, 12, 30)
    },
    {
      id: 'snow', name: 'Nevada', rarity: 'rare', css: 'linear-gradient(180deg, #0f172a, #1e3a8a 80%, #1e40af)',
      draw: () => `${drift(34, 21, '<circle r="2.2" fill="#ffffff" opacity=".9"/>', 1, 10, 14)}<path d="M0 200 Q100 176 200 190 T400 182 V200Z" fill="#f8fafc" opacity=".9"/>`
    },
    {
      id: 'aurora', name: 'Aurora', rarity: 'epic', css: 'linear-gradient(180deg, #020617, #042f2e 70%, #022c22)',
      draw: (u) => `<defs><filter id="${u}b"><feGaussianBlur stdDeviation="18"/></filter></defs><g filter="url(#${u}b)">
        <ellipse cx="120" cy="70" rx="140" ry="26" fill="#22d3a6" opacity=".7"><animate attributeName="cx" values="80;300;80" dur="14s" repeatCount="indefinite"/><animate attributeName="ry" values="22;36;22" dur="7s" repeatCount="indefinite"/></ellipse>
        <ellipse cx="300" cy="96" rx="120" ry="22" fill="#f472b6" opacity=".55"><animate attributeName="cx" values="320;100;320" dur="17s" repeatCount="indefinite"/></ellipse>
        <ellipse cx="200" cy="50" rx="110" ry="18" fill="#818cf8" opacity=".5"><animate attributeName="cx" values="160;260;160" dur="11s" repeatCount="indefinite"/></ellipse></g>${stars(26, 7, ['#ffffff', '#ccfbf1'], 1.1)}`
    },
    {
      id: 'lava', name: 'Volcán', rarity: 'epic', css: 'linear-gradient(180deg, #0c0a09, #1c0505 50%, #450a0a)',
      draw: (u) => `<defs><radialGradient id="${u}h" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="#f97316" stop-opacity=".75"/><stop offset=".5" stop-color="#b91c1c" stop-opacity=".35"/><stop offset="1" stop-color="#450a0a" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="200" fill="url(#${u}h)"><animate attributeName="opacity" values=".75;1;.75" dur="3s" repeatCount="indefinite"/></rect>
        ${drift(26, 13, '<circle r="1.8" fill="#fdba74"><animate attributeName="fill" values="#fde047;#f97316;#7f1d1d" dur="3s" repeatCount="indefinite"/></circle>', -1, 7, 18)}`
    },
    {
      id: 'code', name: 'Código', rarity: 'epic', css: 'linear-gradient(180deg, #020a05, #03140a)',
      draw: (u) => {
        const r = rnd(17);
        return `<defs><linearGradient id="${u}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity="0"/><stop offset=".85" stop-color="#22c55e"/><stop offset="1" stop-color="#dcfce7"/></linearGradient></defs>` +
          Array.from({ length: 30 }, (_, i) => { const x = (i * 13.5 + r() * 6).toFixed(1), h = 30 + r() * 60, d = (2.5 + r() * 3).toFixed(1), b = (-r() * 5).toFixed(1);
            return `<rect x="${x}" width="3" height="${h.toFixed(0)}" fill="url(#${u}t)" opacity="${(0.4 + r() * 0.6).toFixed(2)}"><animate attributeName="y" values="${(-h).toFixed(0)};210" dur="${d}s" begin="${b}s" repeatCount="indefinite"/></rect>`; }).join('');
      }
    },
    {
      id: 'galaxy', name: 'Galaxia', rarity: 'legendary', css: 'radial-gradient(ellipse at 30% 40%, #4c1d95 0%, transparent 55%), radial-gradient(ellipse at 75% 65%, #0e7490 0%, transparent 50%), #05020f',
      draw: (u) => `<defs><filter id="${u}b"><feGaussianBlur stdDeviation="14"/></filter></defs>
        <g filter="url(#${u}b)"><ellipse cx="130" cy="80" rx="90" ry="40" fill="#a855f7" opacity=".45"><animate attributeName="opacity" values=".3;.6;.3" dur="6s" repeatCount="indefinite"/></ellipse>
          <ellipse cx="290" cy="130" rx="80" ry="34" fill="#22d3ee" opacity=".35"><animate attributeName="opacity" values=".45;.2;.45" dur="7s" repeatCount="indefinite"/></ellipse></g>
        <g><animateTransform attributeName="transform" type="rotate" from="0 200 100" to="360 200 100" dur="160s" repeatCount="indefinite"/>${stars(70, 31, ['#ffffff', '#e9d5ff', '#a5f3fc'], 1.4)}</g>
        <path d="M-20 40 L60 70" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.85;.9;1" dur="6s" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="translate" values="0 0;0 0;160 60" keyTimes="0;.85;1" dur="6s" repeatCount="indefinite"/></path>`
    },
    {
      id: 'gold', name: 'Lujo', rarity: 'legendary', css: 'linear-gradient(135deg, #0a0806, #1c1408 55%, #0a0806)',
      draw: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fde68a" stop-opacity="0"/><stop offset=".5" stop-color="#fde68a" stop-opacity=".35"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></linearGradient>
          <pattern id="${u}p" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V24" stroke="#ca8a04" stroke-width="1" opacity=".35"/></pattern></defs>
        <rect width="400" height="200" fill="url(#${u}p)"/>
        <rect x="-120" y="-40" width="90" height="280" fill="url(#${u}s)" transform="rotate(20)"><animate attributeName="x" values="-160;520" dur="4.5s" repeatCount="indefinite"/></rect>${stars(14, 41, ['#fde68a', '#fffbeb'], 1.2)}`
    },
    {
      id: 'throne', name: 'Trono', rarity: 'mythic', badge: 'kopi-creator', css: 'radial-gradient(ellipse at 50% 120%, #7c2d12 0%, transparent 60%), linear-gradient(180deg, #120a1f, #1f0f2e)',
      draw: (u) => `<defs><radialGradient id="${u}r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd76a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient></defs>
        <g transform="translate(200 100)"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="40s" repeatCount="indefinite"/>
          ${Array.from({ length: 18 }, (_, i) => `<path d="M0 0 L-14 -260 L14 -260Z" fill="#ffd76a" opacity="${i % 2 ? 0.08 : 0.16}" transform="rotate(${i * 20})"/>`).join('')}</g>
          <circle r="90" fill="url(#${u}r)"><animate attributeName="r" values="80;100;80" dur="4s" repeatCount="indefinite"/></circle></g>
        ${drift(18, 51, '<path d="M0 -4 L1.2 -1.2 4 0 1.2 1.2 0 4 -1.2 1.2 -4 0 -1.2 -1.2Z" fill="#fffbe6"/>', -1, 9, 16)}`
    }
  ];

  const getF = (id) => FRAMES.find(f => f.id === id) || null;
  const getB = (id) => BGS.find(b => b.id === id) || null;

  // El SVG del marco, para poner encima de una cara de 0..size px (sobresale un 20 % por cada lado)
  function frameSvg(id) {
    const f = getF(id);
    if (!f || f.id === 'none') return '';
    return `<svg viewBox="-20 -20 140 140" aria-hidden="true" style="position:absolute;left:-20%;top:-20%;width:140%;height:140%;overflow:visible;pointer-events:none">${f.draw(uid())}</svg>`;
  }
  // La cara con su marco: <span> del tamaño de la cara
  function wrap(inner, id, size) {
    const s = size ? `width:${size}px;height:${size}px;` : '';
    return `<span class="kc-frame kc-f-${id || 'none'}" style="position:relative;display:inline-block;${s}flex:none">${inner}${frameSvg(id)}</span>`;
  }
  // El fondo: una capa que llena la tarjeta por detrás (z-index -1 dentro de una tarjeta con isolation: isolate)
  function bgLayer(id) {
    const b = getB(id);
    if (!b || b.id === 'none') return '';
    return `<div class="kc-bg kc-b-${b.id}" aria-hidden="true" style="position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;overflow:hidden;background:${b.css}">
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">${b.draw(uid())}</svg></div>`;
  }

  globalThis.KopiCosmetics = { FRAMES, BGS, RARITY, getFrame: getF, getBg: getB, frameSvg, wrap, bgLayer,
    FRAME_IDS: FRAMES.map(f => f.id), BG_IDS: BGS.map(b => b.id) };
})();
