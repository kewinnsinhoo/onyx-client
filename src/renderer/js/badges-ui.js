// Medallas de las insignias: la misma forma en el launcher y en el panel (este archivo se copia tal cual a
// panel/public/js/badges-ui.js; una prueba comprueba que son iguales).
// Badge.medal(b, size) → SVG. b = { icon, rarity, color, earned }
(function () {
  const P = {
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z"/>',
    crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    flame: '<path d="M12 21c-4 0-7-3-7-7 0-4 4-6 4-10 3 2 5 4 5 7 1-1 1.6-2 1.8-3.3C18 9.4 19 11.8 19 14c0 4-3 7-7 7z"/><path d="M12 21c-1.7 0-3-1.3-3-3 0-1.8 1.6-2.6 2-4.5 1.5 1 3 2.5 3 4.5 0 1.7-.6 3-2 3z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
    sword: '<path d="M14.5 3H21v6.5L10 20.5 3.5 14zM7 13.5 3 17.5 6.5 21l4-4M13 7l4 4"/>',
    gem: '<path d="M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l3 5 3-5M12 9v11"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 12a12 12 0 0 1 11-9c0 4-2 8.5-9 11l-2-2zM9 12H5l2-4h5M12 15v4l4-2v-5"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    gamepad: '<path d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3.2a2.6 2.6 0 0 1-4.6 1L15 15H9l-1.7 2.2a2.6 2.6 0 0 1-4.6-1L2.1 13A5 5 0 0 1 7 7z"/><path d="M8 10v3M6.5 11.5h3M15 11h.01M17.5 12.5h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z"/>',
    skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 4.6 3 5.6V20h10v-3.4c1.6-1 3-2.8 3-5.6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><path d="M10.5 20v-2.5M13.5 20v-2.5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    cake: '<path d="M4 21h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM4 16c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0 2.5-1 4 0M12 12V8M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5z"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/><path d="M16 4.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/>',
    sunrise: '<path d="M4 18h16M6.5 18a5.5 5.5 0 0 1 11 0M12 6V3M5 11 3.5 9.5M19 11l1.5-1.5M8.5 7.5 7.5 5.5M15.5 7.5l1-2M3 21h18"/>',
    badge: '<path d="M12 3l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9-2.4-1.8 1-2.8-1-2.8 2.4-1.8.9-2.9 3 .2z"/><path d="m9 12 2 2 4-4"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01"/>'
  };
  // Colores por rareza: [claro, oscuro, brillo]
  const R = {
    common: ['#c3cad8', '#6b7488', '#e8edf6'],
    rare: ['#6cb6ff', '#2b5fd9', '#bfe0ff'],
    epic: ['#d38bff', '#7a2ff0', '#f0d4ff'],
    legendary: ['#ffd96b', '#ff7a2f', '#fff3c4'],
    mythic: ['#fff1a8', '#b8860b', '#fffbe6']
  };
  const RARITIES = ['common', 'rare', 'epic', 'legendary'];
  let seq = 0;

  // Mezcla un color con blanco (k>0) o con negro (k<0)
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function colors(b) {
    if (b.color && /^#[0-9a-f]{6}$/i.test(b.color)) return [shade(b.color, 0.25), shade(b.color, -0.35), shade(b.color, 0.7)];
    return R[b.rarity] || R.common;
  }

  // Mítica (solo «Creador»): obsidiana con marco de oro que destella, corona de oro, estrellas que parpadean y un aura
  function mythic(b, size, id) {
    const ico = P[b.icon] || P.crown;
    const star = (x, y, r, d) => `<path d="M${x} ${y - r}l${r * 0.28} ${r * 0.72} ${r * 0.72} ${r * 0.28}-${r * 0.72} ${r * 0.28}-${r * 0.28} ${r * 0.72}-${r * 0.28}-${r * 0.72}-${r * 0.72}-${r * 0.28} ${r * 0.72}-${r * 0.28}z" fill="#fffbe6"><animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${d}s" repeatCount="indefinite"/></path>`;
    return `<svg class="bdg-medal on r-mythic" width="${size}" height="${Math.round(size * 1.125)}" style="width:${size}px;height:${Math.round(size * 1.125)}px;overflow:visible" viewBox="0 0 64 72" aria-hidden="true">
      <defs>
        <radialGradient id="${id}h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd76a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff6c2"><animate attributeName="stop-color" values="#fff6c2;#ffc94d;#fff6c2" dur="3s" repeatCount="indefinite"/></stop>
          <stop offset=".45" stop-color="#e6a817"/><stop offset=".7" stop-color="#fff0a0"><animate attributeName="offset" values=".55;.85;.55" dur="3s" repeatCount="indefinite"/></stop>
          <stop offset="1" stop-color="#9a6a06"/></linearGradient>
        <linearGradient id="${id}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2233"/><stop offset="1" stop-color="#0c0a10"/></linearGradient>
        <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#ffd24a"/><stop offset="1" stop-color="#c88a0c"/></linearGradient>
        <clipPath id="${id}k"><path d="M32 3 59 18.5v35L32 69 5 53.5v-35z"/></clipPath></defs>
      <circle cx="32" cy="36" r="34" fill="url(#${id}h)"><animate attributeName="r" values="30;35;30" dur="3s" repeatCount="indefinite"/></circle>
      <path d="M32 3 59 18.5v35L32 69 5 53.5v-35z" fill="url(#${id}g)"/>
      <path d="M32 8.5 54.5 21.5v29L32 63.5 9.5 50.5v-29z" fill="url(#${id}o)" stroke="#ffe48a" stroke-opacity=".7" stroke-width="1"/>
      <g clip-path="url(#${id}k)"><rect class="bdg-shine" x="-40" y="-10" width="14" height="100" fill="#fff" opacity=".5" transform="rotate(20)"/></g>
      <g transform="translate(15 20) scale(1.42)"><path d="${(ico.match(/d="([^"]+)"/) || [])[1] || 'm3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z'}" fill="url(#${id}c)" stroke="#fff3c0" stroke-width=".9" stroke-linejoin="round"/>
        <circle cx="12" cy="5" r="1.3" fill="#ff5ad1"/><circle cx="3" cy="8" r="1.1" fill="#7cd4ff"/><circle cx="21" cy="8" r="1.1" fill="#7cd4ff"/></g>
      ${star(12, 14, 3.2, 0)}${star(53, 26, 2.6, 0.8)}${star(50, 58, 2.2, 1.6)}${star(14, 52, 2, 1.2)}
    </svg>`;
  }

  // La medalla: hexágono con el color de la rareza, un aro interior y el icono en blanco
  function medal(b, size = 56) {
    const id = 'bdg' + (++seq);
    if (b.earned && b.rarity === 'mythic') return mythic(b, size, id);
    const locked = !b.earned;
    const [a, d, g] = locked ? ['#3a3a4a', '#1c1c26', '#5a5a6e'] : colors(b);
    const ico = P[locked && b.secret ? 'question' : b.icon] || P.star;
    const leg = !locked && b.rarity === 'legendary';
    return `<svg class="bdg-medal ${locked ? 'locked' : 'on'} r-${b.rarity || 'common'}" width="${size}" height="${Math.round(size * 1.125)}" style="width:${size}px;height:${Math.round(size * 1.125)}px" viewBox="0 0 64 72" aria-hidden="true">
      <defs><linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${d}"/></linearGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${d}"/><stop offset="1" stop-color="${shade(d, -0.45)}"/></linearGradient>
        <clipPath id="${id}c"><path d="M32 3 59 18.5v35L32 69 5 53.5v-35z"/></clipPath></defs>
      <path d="M32 3 59 18.5v35L32 69 5 53.5v-35z" fill="url(#${id}a)"/>
      <path d="M32 9.5 53.5 22v28L32 62.5 10.5 50V22z" fill="url(#${id}b)" stroke="${g}" stroke-opacity="${locked ? '.25' : '.55'}" stroke-width="1.2"/>
      <path d="M5 18.5 32 3l27 15.5v6L32 9 5 24.5z" fill="#fff" opacity="${locked ? '.04' : '.16'}"/>
      ${leg ? `<g clip-path="url(#${id}c)"><rect class="bdg-shine" x="-40" y="-10" width="16" height="100" fill="#fff" opacity=".35" transform="rotate(20)"/></g>` : ''}
      <g transform="translate(18 22)" fill="none" stroke="${locked ? '#8a8aa0' : '#fff'}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <svg width="28" height="28" style="width:28px;height:28px" viewBox="0 0 24 24">${ico}</svg></g>
      ${locked && !b.secret ? `<g transform="translate(40 50)"><circle cx="7" cy="7" r="8" fill="#15151d" stroke="#3a3a4a"/><g transform="translate(2 2) scale(.42)" fill="none" stroke="#9a9ab0" stroke-width="2.4" stroke-linecap="round"><svg width="24" height="24" style="width:24px;height:24px" viewBox="0 0 24 24">${P.lock}</svg></g></g>` : ''}
    </svg>`;
  }

  const rarityName = { common: 'Común', rare: 'Rara', epic: 'Épica', legendary: 'Legendaria', mythic: 'Mítica' };
  window.Badge = { medal, path: (i) => P[i] || '', icons: Object.keys(P), RARITIES, rarityName, colors };
})();
