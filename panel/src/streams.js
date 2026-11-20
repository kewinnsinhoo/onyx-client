// Directos: Twitch, TikTok y Kick.
//   - El jugador pone sus canales en el launcher (Mi perfil). El studio pone los canales oficiales de cada instancia.
//   - Cada pocos minutos se mira quién está en directo. Solo los canales de quien está jugando ahora (y los oficiales):
//     así se hacen pocas consultas.
//   - El launcher enseña «En directo ahora» en la instancia, y el studio lo ve en el panel.
// Cómo se mira:
//   - Twitch: con TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (API oficial); si no, decapi.me (gratis, sin claves).
//   - Kick: con KICK_CLIENT_ID + KICK_CLIENT_SECRET (API oficial); si no, la API pública de la web.
//   - TikTok: no tiene API para esto; se intenta con la web y, si no se sabe, vale lo que marque el jugador
//     («Estoy en directo en TikTok», dura 6 horas o hasta que deje de jugar).
import { json, fail, now, str, readJson } from './util.js';
import { audit } from './onyx.js';

export const PLATFORMS = ['twitch', 'tiktok', 'kick'];
const HANDLE_RE = { twitch: /^[a-z0-9_]{3,25}$/, kick: /^[a-z0-9_-]{3,25}$/, tiktok: /^[a-z0-9_.]{2,24}$/ };
const ACTIVE_MS = 90e3;
const FRESH_MS = 3 * 60e3;       // un estado vale 3 minutos
const MANUAL_MS = 6 * 3600e3;    // «estoy en directo» a mano: 6 horas como mucho
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// «https://twitch.tv/Foo», «@foo», «kick.com/foo», «tiktok.com/@foo/live» → «foo» (o null si no vale)
export function cleanHandle(platform, v) {
  let s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/^(www\.|m\.)/, '')
    .replace(/^(twitch\.tv|kick\.com|tiktok\.com)\//, '')
    .replace(/^@/, '').split(/[/?#]/)[0].replace(/^@/, '');
  return HANDLE_RE[platform] && HANDLE_RE[platform].test(s) ? s : null;
}

export function urlOf(platform, handle) {
  if (platform === 'twitch') return `https://www.twitch.tv/${handle}`;
  if (platform === 'kick') return `https://kick.com/${handle}`;
  return `https://www.tiktok.com/@${handle}/live`;
}

const timed = (f, url, opts = {}, ms = 6000) => f(url, { ...opts, signal: AbortSignal.timeout(ms) });
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };
const OFF = { live: false };

// ---------------------------------------------------------------- comprobar
async function appToken(env, f, kvKey, url, body) {
  const hit = env.KV ? await env.KV.get(kvKey) : null;
  if (hit) return hit;
  const r = await timed(f, url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error('token');
  if (env.KV) await env.KV.put(kvKey, j.access_token, { expirationTtl: Math.max(300, Math.min(30 * 864e2, (j.expires_in || 3600) - 300)) });
  return j.access_token;
}

// → { handle: { live, title, viewers, thumb, since } | null (no se sabe) }
async function checkTwitch(env, handles, f) {
  const out = {};
  if (env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
    const tok = await appToken(env, f, 'streams:twitch-token', 'https://id.twitch.tv/oauth2/token',
      { client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' });
    const r = await timed(f, 'https://api.twitch.tv/helix/streams?first=100&' + handles.map(h => 'user_login=' + encodeURIComponent(h)).join('&'),
      { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error(`twitch ${r.status}`);
    const j = await r.json();
    for (const h of handles) out[h] = OFF;
    for (const s of j.data || []) {
      const h = String(s.user_login || '').toLowerCase();
      if (!(h in out)) continue;
      out[h] = { live: true, title: s.title || '', viewers: num(s.viewer_count), since: Date.parse(s.started_at) || null,
        thumb: String(s.thumbnail_url || '').replace('{width}', '440').replace('{height}', '248') || null };
    }
    return out;
  }
  // Sin claves: decapi.me (texto plano)
  await Promise.all(handles.map(async (h) => {
    try {
      const up = await (await timed(f, `https://decapi.me/twitch/uptime/${h}`)).text();
      if (/offline/i.test(up)) { out[h] = OFF; return; }
      if (/not found|error|no user/i.test(up) || !/\d/.test(up)) { out[h] = null; return; }
      const [title, viewers] = await Promise.all([
        timed(f, `https://decapi.me/twitch/title/${h}`).then(r => r.text()).catch(() => ''),
        timed(f, `https://decapi.me/twitch/viewercount/${h}`).then(r => r.text()).catch(() => '')
      ]);
      out[h] = { live: true, title: String(title).slice(0, 140), viewers: num(String(viewers).replace(/\D/g, '') || null),
        thumb: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${h}-440x248.jpg`, since: null };
    } catch { out[h] = null; }
  }));
  return out;
}

async function checkKick(env, handles, f) {
  const out = {};
  const pick = (h, ls) => {
    if (!ls) return OFF;
    const thumb = ls.thumbnail && (typeof ls.thumbnail === 'string' ? ls.thumbnail : ls.thumbnail.url || ls.thumbnail.src);
    return { live: true, title: String(ls.session_title || ls.title || ls.stream_title || '').slice(0, 140), viewers: num(ls.viewer_count ?? ls.viewers),
      thumb: thumb || null, since: Date.parse(ls.created_at || ls.start_time || '') || null };
  };
  if (env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET) {
    const tok = await appToken(env, f, 'streams:kick-token', 'https://id.kick.com/oauth/token',
      { client_id: env.KICK_CLIENT_ID, client_secret: env.KICK_CLIENT_SECRET, grant_type: 'client_credentials' });
    const r = await timed(f, 'https://api.kick.com/public/v1/channels?' + handles.map(h => 'slug=' + encodeURIComponent(h)).join('&'), { headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error(`kick ${r.status}`);
    const j = await r.json();
    for (const h of handles) out[h] = null;
    for (const ch of j.data || []) {
      const h = String(ch.slug || '').toLowerCase();
      if (!(h in out)) continue;
      const st = ch.stream || {};
      out[h] = st.is_live ? pick(h, { ...st, title: ch.stream_title }) : OFF;
    }
    return out;
  }
  await Promise.all(handles.map(async (h) => {
    try {
      const r = await timed(f, `https://kick.com/api/v2/channels/${h}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (r.status === 404) { out[h] = OFF; return; }
      if (!r.ok) { out[h] = null; return; }
      out[h] = pick(h, (await r.json()).livestream);
    } catch { out[h] = null; }
  }));
  return out;
}

async function checkTiktok(env, handles, f) {
  const out = {};
  await Promise.all(handles.map(async (h) => {
    try {
      const r = await timed(f, `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(h)}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!r.ok) { out[h] = null; return; }
      const j = await r.json();
      const d = j && j.data;
      if (!d || !d.user) { out[h] = null; return; }
      if (Number(d.user.status) !== 2) { out[h] = OFF; return; }
      const room = d.liveRoom || {};
      out[h] = { live: true, title: String(room.title || '').slice(0, 140), viewers: num(room.liveRoomStats && room.liveRoomStats.userCount),
        thumb: room.coverUrl || null, since: room.startTime ? room.startTime * 1000 : null };
    } catch { out[h] = null; }
  }));
  return out;
}

const CHECKS = { twitch: checkTwitch, kick: checkKick, tiktok: checkTiktok };

// Mira los canales y guarda lo que vio. rows: filas de channels
export async function refresh(env, rows, f = fetch) {
  const t = now();
  const byPlat = {};
  for (const r of rows) (byPlat[r.platform] = byPlat[r.platform] || new Set()).add(r.handle);
  const results = {};
  await Promise.all(Object.entries(byPlat).map(async ([pl, set]) => {
    try { results[pl] = await CHECKS[pl](env, [...set].slice(0, 100), f); }
    catch (e) { console.warn('[directos]', pl, e.message); results[pl] = {}; }
  }));
  const stmts = [];
  for (const r of rows) {
    const s = (results[r.platform] || {})[r.handle];
    if (s === undefined || s === null) { // no se sabe: se deja como estaba (y se reintenta luego)
      stmts.push(env.DB.prepare('UPDATE channels SET checked_at = ? WHERE owner = ? AND platform = ?').bind(t, r.owner, r.platform));
      continue;
    }
    const since = s.live ? (r.live ? r.live_since || s.since || t : s.since || t) : null;
    Object.assign(r, { live: s.live ? 1 : 0, title: s.title || null, viewers: s.viewers ?? null, thumb: s.thumb || null, live_since: since, checked_at: t });
    stmts.push(env.DB.prepare('UPDATE channels SET live = ?, title = ?, viewers = ?, thumb = ?, live_since = ?, checked_at = ? WHERE owner = ? AND platform = ?')
      .bind(r.live, r.title, r.viewers, r.thumb, r.live_since, t, r.owner, r.platform));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return rows;
}

// Cron: los canales de quien está jugando ahora y los oficiales, si hace rato que no se miran
export async function refreshDue(env, f = fetch) {
  const t = now();
  const rows = (await env.DB.prepare(`SELECT * FROM channels WHERE checked_at < ? AND (owner LIKE 'inst:%' OR owner IN
    (SELECT player_key FROM plays WHERE ended_at IS NULL AND last_seen > ?)) ORDER BY checked_at LIMIT 150`).bind(t - FRESH_MS, t - ACTIVE_MS).all()).results;
  if (rows.length) await refresh(env, rows, f);
  // quien dejó de jugar ya no sale «en directo» en ninguna instancia; el marcado a mano se apaga
  await env.DB.prepare(`UPDATE channels SET manual_until = NULL WHERE manual_until IS NOT NULL AND (manual_until < ? OR owner NOT IN
    (SELECT player_key FROM plays WHERE ended_at IS NULL AND last_seen > ?)) AND owner NOT LIKE 'inst:%'`).bind(t, t - 10 * 60e3).run();
  return rows.length;
}

const isLive = (r, t) => !!r.live || (r.manual_until && r.manual_until > t);
const out = (r, extra = {}) => ({
  platform: r.platform, handle: r.handle, url: urlOf(r.platform, r.handle), title: r.title || '', viewers: r.viewers ?? null,
  thumb: r.thumb || null, since: r.live_since || null, manual: !r.live, ...extra
});

// Quién está en directo en una instancia ahora: los canales oficiales y los jugadores que la están jugando
export async function liveFor(env, instanceId, f = fetch) {
  const t = now();
  const official = (await env.DB.prepare('SELECT * FROM channels WHERE owner = ?').bind('inst:' + instanceId).all()).results;
  const players = (await env.DB.prepare(`SELECT c.*, p.player_name FROM channels c JOIN plays p ON p.player_key = c.owner
    WHERE p.instance_id = ? AND p.ended_at IS NULL AND p.last_seen > ?`).bind(instanceId, t - ACTIVE_MS).all()).results;
  const stale = [...official, ...players].filter(r => r.checked_at < t - FRESH_MS).slice(0, 12);
  if (stale.length) { try { await refresh(env, stale, f); } catch { /* lo que se sabía */ } }
  const list = [
    ...official.filter(r => isLive(r, t)).map(r => out(r, { official: true, name: null })),
    ...players.filter(r => isLive(r, t)).map(r => out(r, { official: false, name: r.player_name }))
  ];
  const seen = new Set();
  return list.filter(x => { const k = x.platform + ':' + x.handle; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.official - a.official) || ((b.viewers || 0) - (a.viewers || 0)));
}

// Guardar los canales de alguien: { twitch, tiktok, kick } (vacío = quitar)
async function saveChannels(env, owner, body) {
  const stmts = [], saved = {};
  for (const pl of PLATFORMS) {
    if (!(pl in body)) continue;
    const h = cleanHandle(pl, body[pl]);
    if (h === null) fail(400, 'handle', `Ese canal de ${pl === 'tiktok' ? 'TikTok' : pl === 'kick' ? 'Kick' : 'Twitch'} no es válido`);
    if (!h) { stmts.push(env.DB.prepare('DELETE FROM channels WHERE owner = ? AND platform = ?').bind(owner, pl)); saved[pl] = ''; continue; }
    stmts.push(env.DB.prepare(`INSERT INTO channels (owner, platform, handle, checked_at) VALUES (?, ?, ?, 0)
      ON CONFLICT(owner, platform) DO UPDATE SET handle = excluded.handle, live = CASE WHEN channels.handle = excluded.handle THEN channels.live ELSE 0 END,
      checked_at = CASE WHEN channels.handle = excluded.handle THEN channels.checked_at ELSE 0 END`).bind(owner, pl, h));
    saved[pl] = h;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return saved;
}

async function channelsOf(env, owner) {
  const rows = (await env.DB.prepare('SELECT * FROM channels WHERE owner = ?').bind(owner).all()).results;
  const o = { twitch: '', tiktok: '', kick: '' };
  for (const r of rows) o[r.platform] = r.handle;
  const t = now();
  return { channels: o, manual: rows.filter(r => r.manual_until && r.manual_until > t).map(r => r.platform) };
}

// ---------------------------------------------------------------- launcher: /api/l/channels, /api/l/live/<instancia>
export async function launcherStreams(env, P, parts, m, req) {
  const owner = P.key;
  if (parts[0] === 'channels' && !parts[1] && m === 'GET') return json(await channelsOf(env, owner));
  if (parts[0] === 'channels' && !parts[1] && m === 'POST') {
    await saveChannels(env, owner, await readJson(req));
    return json(await channelsOf(env, owner));
  }
  if (parts[0] === 'channels' && parts[1] === 'live' && m === 'POST') { // «Estoy en directo» a mano (sobre todo TikTok)
    const b = await readJson(req);
    const pl = PLATFORMS.includes(b.platform) ? b.platform : 'tiktok';
    const r = await env.DB.prepare('UPDATE channels SET manual_until = ? WHERE owner = ? AND platform = ?').bind(b.on ? now() + MANUAL_MS : null, owner, pl).run();
    if (!r.meta || !r.meta.changes) fail(400, 'no_channel', 'Primero pon tu canal en Mi perfil');
    return json(await channelsOf(env, owner));
  }
  if (parts[0] === 'live' && parts[1] && m === 'GET') return json({ live: await liveFor(env, str(parts[1], 60)) });
  return null;
}

// ---------------------------------------------------------------- panel del studio: /streams/<instancia>
export async function studioStreams(c, instanceId, m) {
  const { env, studio, user } = c;
  const inst = await env.DB.prepare('SELECT id, data FROM instances WHERE id = ? AND studio_id = ? AND deleted_at IS NULL').bind(str(instanceId, 60), studio.id).first();
  if (!inst) fail(404, 'instance', 'Instancia no encontrada');
  const owner = 'inst:' + inst.id;
  if (m === 'POST') {
    c.need('editor');
    const b = await readJson(c.req);
    const saved = await saveChannels(env, owner, b.channels || {});
    await audit(env, user, studio.id, 'streams.channels', JSON.parse(inst.data).name, { instance: inst.id, ...saved });
  }
  const t = now();
  const live = await liveFor(env, inst.id);
  const players = (await env.DB.prepare(`SELECT COUNT(DISTINCT c.owner) AS n FROM channels c JOIN plays p ON p.player_key = c.owner
    WHERE p.instance_id = ? AND p.ended_at IS NULL AND p.last_seen > ?`).bind(inst.id, t - ACTIVE_MS).first());
  return json({ ...(await channelsOf(env, owner)), live, withChannel: (players && players.n) || 0,
    keys: { twitch: !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET), kick: !!(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET) } });
}
