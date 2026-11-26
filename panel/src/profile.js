// Perfil público en la web (onyxclient.site/u/<nombre>): la tarjeta del jugador con su skin, sus insignias,
// sus horas y sus directos, para ponerla en la bio de Twitch o TikTok.
// Solo si el jugador lo activa en el launcher (Mi perfil → Perfil público). Si no, la página dice que no existe.
import { json, now, readJson, playerKey, NAME_RE } from './util.js';
import { badgesOf } from './badges.js';
import { publicSkin } from './skins.js';
import { cslCapeHash } from './capes.js';
import { wornLook } from './looks.js';
import { urlOf } from './streams.js';
import '../public/js/cape-art.js';

const ART = globalThis.KopiCapeArt;
const CORS = { 'Access-Control-Allow-Origin': '*' };
const webUrl = (env, name) => `${(env.WEB_URL || 'https://onyxclient.site').replace(/\/$/, '')}/u/${encodeURIComponent(name)}`;

// ---------------------------------------------------------------- launcher: /api/l/public
export async function launcherPublic(env, P, m, req) {
  if (m === 'POST') {
    const b = await readJson(req);
    await env.DB.prepare(`INSERT INTO player_public (player_key, player_name, public, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(player_key) DO UPDATE SET player_name = excluded.player_name, public = excluded.public, updated_at = excluded.updated_at`)
      .bind(P.key, P.name, b.on ? 1 : 0, now()).run();
  }
  const row = await env.DB.prepare('SELECT public FROM player_public WHERE player_key = ?').bind(P.key).first();
  return json({ public: !!(row && row.public), url: webUrl(env, P.name) });
}

// La textura de la skin (premium o de Kopi) → { url, slim } para pedirla después a /skin.png
function skinFrom(r) {
  if (!r || r.error) return null;
  try {
    const tex = JSON.parse(atob(r.value)).textures || {};
    if (!tex.SKIN || !tex.SKIN.url) return null;
    return { url: String(tex.SKIN.url).replace(/^http:/, 'https:'), slim: !!(tex.SKIN.metadata && tex.SKIN.metadata.model === 'slim'), premium: r.source === 'premium' };
  } catch { return null; }
}
async function skinOf(env, name) {
  try { const res = await publicSkin(env, name); return res.ok ? skinFrom(await res.json()) : null; } catch { return null; }
}

// ---------------------------------------------------------------- web: /api/public/player/<nombre>[/skin.png]
export async function publicPlayer(env, u, parts) {
  const name = String(parts[1] || '');
  if (!NAME_RE.test(name)) return json({ error: 'not_found' }, 404, CORS);
  const key = playerKey(name);
  const pub = await env.DB.prepare('SELECT player_name, public FROM player_public WHERE player_key = ?').bind(key).first();
  if (!pub || !pub.public) return json({ error: 'private' }, 404, { ...CORS, 'Cache-Control': 'public, max-age=30' });

  // La imagen de la skin, pasada por aquí: así la web la puede pintar en 3D sin problemas de permisos (CORS)
  if (parts[2] === 'skin.png') {
    const s = await skinOf(env, pub.player_name);
    if (!s || !/^https:\/\/(textures\.minecraft\.net|[a-z0-9.-]*mineskin\.org)\//.test(s.url)) return new Response('Not found', { status: 404, headers: CORS });
    const r = await fetch(s.url, { cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!r.ok) return new Response('Not found', { status: 404, headers: CORS });
    return new Response(r.body, { headers: { ...CORS, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600' } });
  }

  const t = now();
  const [b, first, s, worn, chans] = await Promise.all([
    badgesOf(env, key, { tz: 0 }),
    env.DB.prepare('SELECT MIN(started_at) AS first, MAX(COALESCE(ended_at, last_seen)) AS last FROM plays WHERE player_key = ?').bind(key).first(),
    skinOf(env, pub.player_name),
    env.DB.prepare('SELECT cape_id FROM cape_worn WHERE player_key = ?').bind(key).first(),
    env.DB.prepare('SELECT platform, handle, live, manual_until, title, viewers FROM channels WHERE owner = ?').bind(key).all()
  ]);
  const look = await wornLook(env, key).catch(() => ({ frame: null, bg: null })); // marco y fondo de perfil
  const cape = worn && ART.get(worn.cape_id);
  const capeHash = cape ? await cslCapeHash(env, key).catch(() => null) : null;
  const R = ['common', 'rare', 'epic', 'legendary', 'mythic'];
  const earned = b.badges.filter(x => x.earned)
    .map(x => ({ id: x.id, cat: x.cat, icon: x.icon, rarity: x.rarity, color: x.color || null, name: x.name, desc: x.desc, studio: x.studio || null, custom: !!x.custom, at: x.at }))
    .sort((a, c) => (R.indexOf(c.rarity) - R.indexOf(a.rarity)) || (c.at || 0) - (a.at || 0));
  const origin = env.PUBLIC_URL || u.origin;
  const playingNow = first && first.last && first.last > t - 90e3;
  return json({
    name: pub.player_name,
    url: webUrl(env, pub.player_name),
    premium: !!(s && s.premium),
    skin: s ? { url: `${origin}/api/public/player/${encodeURIComponent(pub.player_name)}/skin.png`, slim: s.slim } : null,
    cape: cape ? { id: cape.id, name: cape.name, rarity: cape.rarity, texture: capeHash ? `${origin}/csl/textures/${capeHash.hash}` : null } : null,
    look,
    stats: { hours: b.facts.hours, streak: b.facts.streak, instances: b.facts.instances, since: (first && first.first) || null, online: !!playingNow },
    badges: earned,
    total: b.badges.filter(x => !x.secret || x.earned).length,
    showcase: b.showcase.map(id => earned.find(x => x.id === id)).filter(Boolean),
    channels: chans.results.map(c => ({ platform: c.platform, handle: c.handle, url: urlOf(c.platform, c.handle),
      live: !!(c.live || (c.manual_until && c.manual_until > t)) && !!playingNow, title: c.title || '', viewers: c.viewers ?? null }))
  }, 200, { ...CORS, 'Cache-Control': 'public, max-age=60' });
}

