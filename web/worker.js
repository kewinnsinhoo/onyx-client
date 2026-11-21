// Web de Kopi Client: casi todo son archivos tal cual. Lo único que pasa por aquí es /u/<nombre>
// (perfil público de un jugador): se pide el perfil al panel y se mete en la página, con el título y la
// descripción para que el enlace se vea bonito al compartirlo (Discord, Twitter, WhatsApp…).
const API = 'https://panel.onyxclient.site';
const NAME = /^\/u\/([A-Za-z0-9_]{2,16})\/?$/;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mete los datos y las etiquetas para compartir en la página (u.html)
export function inject(html, name, data, origin) {
  let meta;
  if (data && data.name) {
    const n = data.name;
    const parts = [`${Math.round(data.stats && data.stats.hours || 0)} h jugadas`, `${(data.badges || []).length} insignias`];
    if (data.showcase && data.showcase.length) parts.push(data.showcase.map(b => b.name).join(' · '));
    const desc = parts.join(' · ');
    meta = `<title>${esc(n)} · Kopi Client</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(n)} en Kopi Client">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin + '/u/' + n)}">
<meta property="og:image" content="${esc(origin + '/img/og.png')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${esc(origin + '/u/' + n)}">`;
  } else {
    meta = `<title>Perfil no encontrado · Kopi Client</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="Kopi Client">
<meta property="og:image" content="${esc(origin + '/img/og.png')}">`;
  }
  // Los datos van dentro como JSON (sin «<» para que no se pueda cerrar la etiqueta)
  const json = JSON.stringify(data && data.name ? data : null).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  return html
    .replace(/<!--META-->[\s\S]*?<!--\/META-->/, meta)
    .replace('<!--DATA-->', `<script id="pdata" type="application/json">${json}</script>`);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = NAME.exec(url.pathname);
    if (!m) return env.ASSETS.fetch(req);
    const page = await env.ASSETS.fetch(new Request(new URL('/u', url), { headers: req.headers }));
    if (!page.ok) return env.ASSETS.fetch(req);
    let data = null, failed = false;
    try {
      const r = await fetch(`${API}/api/public/player/${m[1]}`, { signal: AbortSignal.timeout(4000), cf: { cacheTtl: 60, cacheEverything: true } });
      if (r.ok) data = await r.json();
      else if (r.status !== 404) failed = true;
    } catch { failed = true; }
    // Si el panel no respondió, la página lo vuelve a intentar sola (sin datos dentro)
    let html = await page.text();
    html = failed ? html.replace('<!--DATA-->', '') : inject(html, m[1], data, url.origin);
    return new Response(html, {
      status: data || failed ? 200 : 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }
    });
  }
};
