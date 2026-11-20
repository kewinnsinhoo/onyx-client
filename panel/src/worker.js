// Kopi Panel: servidor (Cloudflare Worker). Sirve la API del panel, la del launcher y los archivos subidos.
import {
  json, HttpError, fail, now, randomCode, randomToken, sha256, sha1Bytes, CODE_RE, normalizeCode, NAME_RE,
  playerKey, slugify, readJson, parseCookies, cookie, clientIp, str, url as cleanUrl, int
} from './util.js';
import { defaults, sanitize, toManifest, gate } from './model.js';
import { versions as metaVersions, loaderVersions } from './meta.js';
import { ensureSchema } from './schema.js';
import { peaksByDay } from './stats.js';
import { eventsApi, history, referrals, addReferral, publicApi, runChecks } from './extra.js';
import { studioBrandApi, creatorBrandsApi } from './brands.js';
import { uploadSkin, deleteSkin, cslApi } from './skins.js';
import { capesPublic, launcherCapes, creatorCapes } from './capes.js';
import { statsApi } from './studio-stats.js';
import { hello, launcherStats } from './kopistats.js';
import { guardReport, guardApi, guardMedia, guardFrame, camWanted, serverReport } from './guard.js';
import { sendReport } from './reports.js';
import { launcherStreams, studioStreams, refreshDue } from './streams.js';
import { launcherBadges, studioBadges, creatorBadges } from './badges.js';
import { deleteMediaKeys } from './media.js';
import { audit, auditList, creatorApi, allStudiosFull, noticesApi, usage, orphanMedia, cleanOrphans, checkInstanceLimit, checkStorageLimit, maintenance } from './onyx.js';
export { peaksByDay };

const SESSION_DAYS = 30;
const LEVEL = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const ROLES = Object.keys(LEVEL);
const ACTIVE_MS = 90e3; // una partida cuenta como "jugando" si dio señales en los últimos 90 s
const MAX_UPLOAD = 25 * 1024 * 1024;     // subida de una vez (KV guarda como mucho 25 MB por valor)
const CHUNK = 20 * 1024 * 1024;          // los archivos grandes se suben y se guardan en trozos de 20 MB
const MAX_FILE = 500 * 1024 * 1024;      // tamaño máximo de un archivo subido en trozos
const UPLOAD_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(webm|mp4)|audio\/(mpeg|ogg|wav|webm)|application\/(java-archive|zip|x-zip-compressed|json|octet-stream|x-java-archive)|text\/plain)$/;

export default {
  async fetch(req, env, ctx) {
    try {
      const p = new URL(req.url).pathname;
      if (p.startsWith('/api/') || p.startsWith('/auth/') || p.startsWith('/m/')) await ensureSchema(env.DB);
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: 'server', message: 'Error interno del servidor' }, 500);
    }
  },
  // Cada 5 minutos: comprobar que todo funciona (página de estado)
  async scheduled(event, env, ctx) {
    await ensureSchema(env.DB);
    ctx.waitUntil(runChecks(env));
    ctx.waitUntil(env.DB.prepare('DELETE FROM audit WHERE at < ?').bind(now() - 180 * 864e5).run());
    ctx.waitUntil(env.DB.prepare('DELETE FROM guard_live WHERE at IS NULL OR at < ?').bind(now() - 10 * 60e3).run()); // cámaras viejas
    ctx.waitUntil(refreshDue(env).catch(e => console.warn('[directos]', e.message))); // quién está en directo
  }
};

// ---------------------------------------------------------------- rutas
async function route(req, env, ctx) {
  const u = new URL(req.url);
  const p = u.pathname;
  const m = req.method;

  if (p.startsWith('/m/')) return serveMedia(p, env);
  if (p.startsWith('/csl/')) { await ensureSchema(env.DB); return cslApi(env, p.slice(5)); }
  // Capas de Kopi animadas dentro del juego (mod Cape Provider): /capes/<nombre>.png
  if (p.startsWith('/capes/') && (m === 'GET' || m === 'HEAD')) { await ensureSchema(env.DB); return capesPublic(env, p.slice(7)); }
  // Página pública de descarga de un launcher de marca: panel.onyxclient.site/l/<id>
  if (/^\/l\/[a-z][a-z0-9-]{1,31}\/?$/.test(p) && env.ASSETS) return env.ASSETS.fetch(new Request(new URL('/l.html', u), req));
  if (p === '/auth/login') return authLogin(req, env, u);
  if (p === '/auth/callback') return authCallback(req, env, u);
  if (p === '/auth/logout' && m === 'POST') return authLogout(req, env);
  if (p === '/auth/dev' && env.DEV_LOGIN === '1') return authDev(req, env, u);

  if (p.startsWith('/api/l/')) return launcherApi(req, env, u, p.slice(7), m, ctx);
  // El launcher al abrirse (anónimo): para contar instalaciones, activos y países
  if (p === '/api/hello' && m === 'POST') return hello(env, req, await readJson(req, 4096));
  // El plugin KopiGuard del servidor (se identifica con la clave de su instancia)
  if (p === '/api/srv/guard' && m === 'POST') return serverReport(env, ctx, await readJson(req, 16 * 1024));
  if (p.startsWith('/api/public/')) return publicApi(req, env, u, p.slice(12).split('/').filter(Boolean), m);
  if (p.startsWith('/api/')) {
    if (m !== 'GET' && m !== 'HEAD') checkOrigin(req, u);
    return panelApi(req, env, u, p.slice(5), m, ctx);
  }
  return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
}

function checkOrigin(req, u) {
  const o = req.headers.get('Origin');
  if (o && o !== u.origin) fail(403, 'origin', 'Origen no permitido');
}

// ---------------------------------------------------------------- login con Discord
function redirectUri(env, u) { return (env.PUBLIC_URL || u.origin) + '/auth/callback'; }

async function authLogin(req, env, u) {
  if (!env.DISCORD_CLIENT_ID) fail(500, 'config', 'Falta DISCORD_CLIENT_ID');
  const state = randomToken(16);
  const next = (u.searchParams.get('next') || '/').startsWith('/') ? u.searchParams.get('next') || '/' : '/';
  const target = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(env, u),
    scope: 'identify', state, prompt: 'none'
  });
  return new Response(null, { status: 302, headers: [
    ['Location', target],
    ['Set-Cookie', cookie('onyx_oauth', JSON.stringify({ state, next }), { maxAge: 600 })]
  ] });
}

async function authCallback(req, env, u) {
  const c = parseCookies(req);
  let saved = {};
  try { saved = JSON.parse(c.onyx_oauth || '{}'); } catch { /* nada */ }
  const back = (msg) => new Response(null, { status: 302, headers: [['Location', '/#/login?error=' + encodeURIComponent(msg)], ['Set-Cookie', cookie('onyx_oauth', '', { maxAge: 0 })]] });
  if (u.searchParams.get('error')) return back('cancelled');
  if (!saved.state || saved.state !== u.searchParams.get('state')) return back('state');
  const tokRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET || '',
      grant_type: 'authorization_code', code: u.searchParams.get('code') || '', redirect_uri: redirectUri(env, u)
    })
  });
  if (!tokRes.ok) return back('discord');
  const tok = await tokRes.json();
  const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!meRes.ok) return back('discord');
  const me = await meRes.json();
  const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null;
  return startSession(env, { id: me.id, name: me.global_name || me.username, avatar }, saved.next || '/');
}

// Solo para pruebas locales (DEV_LOGIN=1). Nunca activo en Cloudflare.
async function authDev(req, env, u) {
  return startSession(env, { id: u.searchParams.get('id') || '1', name: u.searchParams.get('name') || 'Dev', avatar: null }, u.searchParams.get('next') || '/');
}

function creatorIds(env) { return String(env.CREATOR_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean); }

async function startSession(env, user, next) {
  const t = now();
  const isCreator = creatorIds(env).includes(user.id);
  await env.DB.prepare(`INSERT INTO users (id, name, avatar, global_role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, last_login = excluded.last_login,
    global_role = CASE WHEN ? THEN 'creator' ELSE users.global_role END`)
    .bind(user.id, user.name, user.avatar, isCreator ? 'creator' : 'user', t, t, isCreator ? 1 : 0).run();
  if (isCreator) await ensureCreatorStudio(env, user.id);
  const blocked = await env.DB.prepare('SELECT blocked_at FROM users WHERE id = ?').bind(user.id).first();
  if (blocked && blocked.blocked_at && !isCreator) {
    return new Response(null, { status: 302, headers: [['Location', '/#/login?error=blocked'], ['Set-Cookie', cookie('onyx_oauth', '', { maxAge: 0 })]] });
  }
  const token = randomToken(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), user.id, t, t + SESSION_DAYS * 864e5).run();
  return new Response(null, { status: 302, headers: [
    ['Location', next && next.startsWith('/') ? next : '/'],
    ['Set-Cookie', cookie('onyx_s', token, { maxAge: SESSION_DAYS * 86400 })],
    ['Set-Cookie', cookie('onyx_oauth', '', { maxAge: 0 })]
  ] });
}

// El Creador siempre tiene el studio principal "Kopi Studio"
async function ensureCreatorStudio(env, userId) {
  const row = await env.DB.prepare("SELECT id FROM studios WHERE id = 'onyx-studios'").first();
  const t = now();
  if (!row) await env.DB.prepare("INSERT INTO studios (id, name, created_by, created_at) VALUES ('onyx-studios', 'Kopi Studio', ?, ?)").bind(userId, t).run();
  // Onyx pasó a llamarse Kopi: el studio principal se renombra solo (si nadie le puso otro nombre)
  else await env.DB.prepare("UPDATE studios SET name = 'Kopi Studio' WHERE id = 'onyx-studios' AND name = 'Onyx Studios'").run();
  await env.DB.prepare("INSERT OR IGNORE INTO members (studio_id, user_id, role, added_at) VALUES ('onyx-studios', ?, 'owner', ?)").bind(userId, t).run();
}

async function authLogout(req, env) {
  const token = parseCookies(req).onyx_s;
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('onyx_s', '', { maxAge: 0 }) });
}

async function currentUser(req, env) {
  const token = parseCookies(req).onyx_s;
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND (u.blocked_at IS NULL OR u.global_role = 'creator')`)
    .bind(await sha256(token), now()).first();
  return row || null;
}

// ---------------------------------------------------------------- API del panel
async function panelApi(req, env, u, path, m, ctx) {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  // Públicas (sin sesión)
  if (parts[0] === 'meta') {
    if (parts[1] === 'versions') return json(await metaVersions(ctx));
    if (parts[1] === 'loader') return json(await loaderVersions(u.searchParams.get('type'), u.searchParams.get('mc'), ctx));
  }
  if (parts[0] === 'invites' && parts[1] && m === 'GET') return inviteInfo(env, parts[1]);

  const user = await currentUser(req, env);
  if (!user) fail(401, 'login', 'Inicia sesión');
  const isCreator = user.global_role === 'creator';

  if (parts[0] === 'me' && m === 'GET') return json(await meInfo(env, user));
  if (parts[0] === 'invites' && parts[1] && parts[2] === 'accept' && m === 'POST') return inviteAccept(env, user, parts[1]);

  if (parts[0] === 'studios') {
    if (!isCreator) fail(403, 'forbidden', 'Solo el Creador puede gestionar studios');
    if (m === 'GET' && !parts[1]) return json({ studios: await allStudiosFull(env) });
    if (m === 'POST' && !parts[1]) return createStudio(req, env, user);
  }
  if (parts[0] === 'onyx') {
    if (!isCreator) fail(403, 'forbidden', 'Solo el Creador puede entrar aquí');
    if (parts[1] === 'studios' && !parts[2] && m === 'POST') return createStudio(req, env, user);
    if (parts[1] === 'launcher' && m === 'GET') return launcherStats(env, u.searchParams);
    if (parts[1] === 'brands') return creatorBrandsApi({ env, user, isCreator, req, u }, parts[2], m);
    if (parts[1] === 'badges') return creatorBadges(env, user, m, req);
    if (parts[1] === 'capes') return creatorCapes({ env, user, req }, parts[2], parts[3], m);
    return creatorApi({ env, user, isCreator, req, u }, parts.slice(1), m);
  }

  if (parts[0] === 's' && parts[1]) {
    const sid = parts[1];
    const studio = await env.DB.prepare('SELECT * FROM studios WHERE id = ? AND deleted_at IS NULL').bind(sid).first();
    if (!studio) fail(404, 'studio', 'Studio no encontrado');
    const role = isCreator ? 'owner' : (await env.DB.prepare('SELECT role FROM members WHERE studio_id = ? AND user_id = ?').bind(sid, user.id).first() || {}).role;
    if (!role) fail(403, 'forbidden', 'No perteneces a este studio');
    const need = (r) => { if (LEVEL[role] < LEVEL[r]) fail(403, 'forbidden', 'Tu rol no permite hacer esto'); };
    if (studio.suspended_at && !isCreator && m !== 'GET') fail(423, 'suspended', 'Este studio está suspendido. Solo puedes ver, no cambiar nada.');
    const ctxS = { env, user, studio, role, need, req, u, isCreator };
    return studioApi(ctxS, parts.slice(2), m);
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

async function meInfo(env, user) {
  const studios = user.global_role === 'creator'
    ? (await env.DB.prepare("SELECT s.id, s.name, s.logo, s.suspended_at, s.suspend_reason, COALESCE(m.role, 'owner') AS role FROM studios s LEFT JOIN members m ON m.studio_id = s.id AND m.user_id = ? WHERE s.deleted_at IS NULL ORDER BY (s.id = 'onyx-studios') DESC, s.name").bind(user.id).all()).results
    : (await env.DB.prepare('SELECT s.id, s.name, s.logo, s.suspended_at, s.suspend_reason, m.role FROM members m JOIN studios s ON s.id = m.studio_id WHERE m.user_id = ? AND s.deleted_at IS NULL ORDER BY s.name').bind(user.id).all()).results;
  return { user: { id: user.id, name: user.name, avatar: user.avatar, role: user.global_role },
    studios: studios.map(s => ({ id: s.id, name: s.name, logo: s.logo, role: s.role, suspended: !!s.suspended_at, suspendReason: s.suspend_reason || '' })) };
}

async function createStudio(req, env, user) {
  const b = await readJson(req);
  const name = str(b.name, 50).trim();
  if (name.length < 2) fail(400, 'name', 'Escribe un nombre de studio');
  let id = slugify(name);
  if (await env.DB.prepare('SELECT 1 FROM studios WHERE id = ?').bind(id).first()) id = `${id}-${randomToken(2)}`;
  const t = now();
  await env.DB.prepare('INSERT INTO studios (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').bind(id, name, user.id, t).run();
  const token = randomToken(16);
  await env.DB.prepare('INSERT INTO invites (token, studio_id, studio_name, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(token, id, name, 'owner', user.id, t, t + 14 * 864e5).run();
  await audit(env, user, id, 'studio.create', name);
  return json({ studio: { id, name }, invite: token }, 201);
}

// ---------------------------------------------------------------- invitaciones
async function inviteInfo(env, token) {
  const inv = await env.DB.prepare('SELECT i.*, s.name AS sname, u.name AS by_name FROM invites i LEFT JOIN studios s ON s.id = i.studio_id LEFT JOIN users u ON u.id = i.created_by WHERE i.token = ?').bind(token).first();
  if (!inv || inv.used_at || inv.expires_at < now()) fail(404, 'invite', 'Esta invitación no existe, ya se usó o caducó');
  return json({ studio: inv.sname || inv.studio_name, role: inv.role, by: inv.by_name });
}

async function inviteAccept(env, user, token) {
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first();
  if (!inv || inv.used_at || inv.expires_at < now()) fail(404, 'invite', 'Esta invitación no existe, ya se usó o caducó');
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO members (studio_id, user_id, role, added_at) VALUES (?, ?, ?, ?) ON CONFLICT(studio_id, user_id) DO UPDATE SET role = excluded.role').bind(inv.studio_id, user.id, inv.role, t),
    env.DB.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE token = ?').bind(user.id, t, token)
  ]);
  await audit(env, user, inv.studio_id, 'invite.accept', user.name, { role: inv.role });
  return json({ studio: inv.studio_id });
}

// ---------------------------------------------------------------- dentro de un studio
async function studioApi(c, parts, m) {
  const { env, studio } = c;
  const [a, b, sub, d] = parts;

  if (!a && m === 'PATCH') { // renombrar / logo
    c.need('admin');
    const body = await readJson(c.req);
    const name = 'name' in body ? str(body.name, 50).trim() : studio.name;
    const logo = 'logo' in body ? cleanUrl(body.logo) : studio.logo;
    await env.DB.prepare('UPDATE studios SET name = ?, logo = ? WHERE id = ?').bind(name || studio.name, logo, studio.id).run();
    await audit(env, c.user, studio.id, 'studio.update', name || studio.name);
    return json({ ok: true });
  }
  if (a === 'overview' && m === 'GET') return json(await overview(env, studio.id));
  if (a === 'trash' && m === 'GET') {
    const rows = (await env.DB.prepare('SELECT id, data, deleted_at FROM instances WHERE studio_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC').bind(studio.id).all()).results;
    return json({ items: rows.map(r => ({ id: r.id, name: JSON.parse(r.data).name, deletedAt: r.deleted_at })) });
  }
  if (a === 'members') return members(c, b, m);
  if (a === 'events') return eventsApi(c, b, m);
  if (a === 'history' && m === 'GET') return json(await history(env, studio.id));
  if (a === 'stats' && m === 'GET') return statsApi(c);
  if (a === 'referrals' && m === 'GET') return json(await referrals(env, studio.id));
  if (a === 'invites') return invites(c, b, m);
  if (a === 'media') return mediaApi(c, b, m, sub, d);
  if (a === 'bans') return bansApi(c, `studio:${studio.id}`, b, m);
  if (a === 'streams' && b) return studioStreams(c, b, m);
  if (a === 'badges') return studioBadges(c, b, m, sub);
  if (a === 'guard') return guardApi(c, b, m, (r) => c.need(r), sub, d);
  if (a === 'brand') return studioBrandApi(c, b, m);
  if (a === 'notices') { if (m !== 'GET') c.need('admin'); return noticesApi(c, studio.id, b, m); }
  if (a === 'activity' && m === 'GET') {
    c.need('admin');
    const q = c.u.searchParams;
    return json(await auditList(env, { studio: studio.id, q: str(q.get('q'), 60), before: int(q.get('before'), 1, 9e15, null) }));
  }
  if (a === 'usage' && m === 'GET') return json({ ...(await usage(env, studio)), orphans: (await orphanMedia(env, studio.id)).length });
  if (a === 'clean' && m === 'POST') {
    c.need('admin');
    const r = await cleanOrphans(env, studio.id);
    await audit(env, c.user, studio.id, 'storage.clean', studio.name, r);
    return json(r);
  }
  if (a === 'instances') {
    if (!b) {
      if (m === 'GET') return json({ instances: await listInstances(env, studio.id) });
      if (m === 'POST') return createInstance(c);
    }
    const row = await env.DB.prepare('SELECT * FROM instances WHERE id = ? AND studio_id = ?').bind(b, studio.id).first();
    if (!row) fail(404, 'instance', 'Instancia no encontrada');
    return instanceApi(c, row, sub, d, m);
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

async function overview(env, sid) {
  const t = now();
  const since = t - 30 * 864e5;
  const playing = await env.DB.prepare('SELECT COUNT(*) AS n FROM plays WHERE studio_id = ? AND ended_at IS NULL AND last_seen > ?').bind(sid, t - ACTIVE_MS).first();
  const inst = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN state = 'open' AND hidden = 0 THEN 1 ELSE 0 END) AS active FROM instances WHERE studio_id = ? AND deleted_at IS NULL").bind(sid).first();
  const withAccess = await env.DB.prepare('SELECT COUNT(DISTINCT a.player_key) AS n FROM access a JOIN instances i ON i.id = a.instance_id WHERE i.studio_id = ? AND i.deleted_at IS NULL').bind(sid).first();
  const plays = (await env.DB.prepare('SELECT started_at, COALESCE(ended_at, last_seen) AS end_at FROM plays WHERE studio_id = ? AND started_at > ? ORDER BY started_at LIMIT 20000').bind(sid, since).all()).results;
  const days = peaksByDay(plays, since, t);
  const peak = days.reduce((best, d) => (d.peak > best.peak ? d : best), { peak: 0, day: null });
  const list = (await listInstances(env, sid)).slice(0, 6);
  return {
    playingNow: playing.n || 0,
    instances: inst.n || 0, activeInstances: inst.active || 0,
    events: (await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE studio_id = ? AND deleted_at IS NULL AND COALESCE(ends_at, starts_at) >= ?').bind(sid, t).first()).n || 0,
    nextEvents: (await env.DB.prepare('SELECT id, title, color, category, starts_at, ends_at FROM events WHERE studio_id = ? AND deleted_at IS NULL AND COALESCE(ends_at, starts_at) >= ? ORDER BY starts_at LIMIT 5').bind(sid, t).all()).results,
    chart: days, peak, plays: plays.length, playersWithAccess: withAccess.n || 0,
    list
  };
}

async function listInstances(env, sid) {
  const t = now();
  const rows = (await env.DB.prepare(`SELECT i.*, (SELECT COUNT(*) FROM plays p WHERE p.instance_id = i.id AND p.ended_at IS NULL AND p.last_seen > ?) AS playing,
    (SELECT COUNT(*) FROM access a WHERE a.instance_id = i.id) AS players
    FROM instances i WHERE i.studio_id = ? AND i.deleted_at IS NULL ORDER BY i.updated_at DESC`).bind(t - ACTIVE_MS, sid).all()).results;
  return rows.map(r => instanceView(r));
}

function instanceView(r) {
  return { id: r.id, data: JSON.parse(r.data), state: r.state, hidden: !!r.hidden, createdAt: r.created_at, updatedAt: r.updated_at, playing: r.playing || 0, players: r.players || 0 };
}

async function createInstance(c) {
  c.need('editor');
  const { env, studio, user } = c;
  await checkInstanceLimit(env, studio);
  const body = await readJson(c.req);
  const data = sanitize(body.data || {}, defaults());
  const id = `${slugify(data.name)}-${randomToken(2)}`;
  const t = now();
  await env.DB.prepare('INSERT INTO instances (id, studio_id, data, state, hidden, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)')
    .bind(id, studio.id, JSON.stringify(data), 'open', user.id, t, t).run();
  const out = { id };
  // El asistente puede crear el primer código y la lista de nombres de una vez
  if (data.access.codes && body.firstCode !== false) {
    const code = randomCode();
    await env.DB.prepare('INSERT INTO codes (code, instance_id, max_uses, uses, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?)').bind(code, id, 100, user.id, t).run();
    out.code = code;
  }
  if (Array.isArray(body.names) && body.names.length) await addManual(env, id, body.names);
  await audit(env, user, studio.id, 'instance.create', data.name, { id });
  return json(out, 201);
}

async function instanceApi(c, row, sub, d, m) {
  const { env, user } = c;
  const iid = row.id;
  if (!sub) {
    if (m === 'GET') {
      const v = instanceView(row);
      const counts = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM codes WHERE instance_id = ?) AS codes, (SELECT COUNT(*) FROM access WHERE instance_id = ?) AS players, (SELECT COUNT(*) FROM plays WHERE instance_id = ?) AS plays, (SELECT COUNT(*) FROM plays WHERE instance_id = ? AND ended_at IS NULL AND last_seen > ?) AS playing')
        .bind(iid, iid, iid, iid, now() - ACTIVE_MS).first();
      return json({ ...v, deleted: !!row.deleted_at, stats: counts });
    }
    if (m === 'PATCH') {
      c.need('editor');
      const body = await readJson(c.req);
      const data = body.data ? sanitize(body.data, JSON.parse(row.data)) : JSON.parse(row.data);
      const state = body.state === 'locked' || body.state === 'open' ? body.state : row.state;
      const hidden = 'hidden' in body ? (body.hidden ? 1 : 0) : row.hidden;
      await env.DB.prepare('UPDATE instances SET data = ?, state = ?, hidden = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(data), state, hidden, now(), iid).run();
      const old = JSON.parse(row.data);
      const fields = Object.keys(data).filter(k => JSON.stringify(data[k]) !== JSON.stringify(old[k]));
      if (state !== row.state) await audit(env, user, row.studio_id, state === 'locked' ? 'instance.lock' : 'instance.unlock', data.name, { id: iid });
      if (hidden !== row.hidden) await audit(env, user, row.studio_id, hidden ? 'instance.hide' : 'instance.show', data.name, { id: iid });
      if (fields.length) await audit(env, user, row.studio_id, 'instance.update', data.name, { id: iid, fields });
      return json({ ok: true, data, state, hidden: !!hidden });
    }
    if (m === 'DELETE') {
      c.need('admin');
      await env.DB.prepare('UPDATE instances SET deleted_at = ? WHERE id = ?').bind(now(), iid).run();
      await audit(env, user, row.studio_id, 'instance.delete', JSON.parse(row.data).name, { id: iid });
      return json({ ok: true });
    }
  }
  const iname = JSON.parse(row.data).name;
  if (sub === 'restore' && m === 'POST') {
    c.need('admin');
    if (row.deleted_at) await checkInstanceLimit(env, c.studio);
    await env.DB.prepare('UPDATE instances SET deleted_at = NULL, updated_at = ? WHERE id = ?').bind(now(), iid).run();
    await audit(env, user, row.studio_id, 'instance.restore', iname, { id: iid });
    return json({ ok: true });
  }
  if (sub === 'purge' && m === 'DELETE') {
    c.need('admin');
    if (!row.deleted_at) fail(400, 'not_deleted', 'Primero envía la instancia a la papelera');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM instances WHERE id = ?').bind(iid),
      env.DB.prepare('DELETE FROM codes WHERE instance_id = ?').bind(iid),
      env.DB.prepare('DELETE FROM access WHERE instance_id = ?').bind(iid),
      env.DB.prepare('DELETE FROM bans WHERE scope = ?').bind(`instance:${iid}`)
    ]);
    await audit(env, user, row.studio_id, 'instance.purge', iname, { id: iid });
    return json({ ok: true });
  }
  if (sub === 'duplicate' && m === 'POST') {
    c.need('editor');
    await checkInstanceLimit(env, c.studio);
    const data = JSON.parse(row.data);
    data.name = `${data.name} (copia)`.slice(0, 60);
    const id = `${slugify(data.name)}-${randomToken(2)}`;
    const t = now();
    await env.DB.prepare('INSERT INTO instances (id, studio_id, data, state, hidden, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, row.studio_id, JSON.stringify(data), 'locked', 1, user.id, t, t).run();
    await audit(env, user, row.studio_id, 'instance.duplicate', data.name, { id, from: iname });
    return json({ id }, 201);
  }
  if (sub === 'codes') return codesApi(c, row, d, m);
  if (sub === 'access') return accessApi(c, row, d, m);
  if (sub === 'bans') return bansApi(c, `instance:${iid}`, d, m);
  if (sub === 'players' && m === 'GET') {
    const rows = (await env.DB.prepare('SELECT player_name, started_at, last_seen FROM plays WHERE instance_id = ? AND ended_at IS NULL AND last_seen > ? ORDER BY started_at').bind(iid, now() - ACTIVE_MS).all()).results;
    return json({ players: rows });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

// ---------------------------------------------------------------- códigos
async function codesApi(c, row, code, m) {
  const { env, user } = c;
  if (m === 'GET') {
    const rows = (await env.DB.prepare('SELECT code, max_uses, uses, created_at FROM codes WHERE instance_id = ? ORDER BY created_at DESC').bind(row.id).all()).results;
    return json({ codes: rows });
  }
  c.need('editor');
  if (m === 'POST') {
    const b = await readJson(c.req);
    const qty = int(b.quantity, 1, 200, 1);
    const maxUses = b.unlimited ? null : int(b.maxUses, 1, 1000000, 100);
    const created = [];
    const t = now();
    for (let i = 0; i < qty; i++) {
      let cd = i === 0 && b.code ? normalizeCode(b.code) : randomCode();
      if (!cd || !CODE_RE.test(cd)) fail(400, 'code', 'El código debe tener 12 letras o números');
      if (await env.DB.prepare('SELECT 1 FROM codes WHERE code = ?').bind(cd).first()) {
        if (i === 0 && b.code) fail(409, 'code_taken', 'Ese código ya existe');
        cd = randomCode();
      }
      await env.DB.prepare('INSERT INTO codes (code, instance_id, max_uses, uses, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?)').bind(cd, row.id, maxUses, user.id, t).run();
      created.push(cd);
    }
    await audit(env, user, row.studio_id, 'code.create', JSON.parse(row.data).name, { id: row.id, n: created.length, codes: created.slice(0, 5), unlimited: maxUses === null });
    return json({ codes: created }, 201);
  }
  if (m === 'DELETE' && code) {
    await env.DB.prepare('DELETE FROM codes WHERE code = ? AND instance_id = ?').bind(code, row.id).run();
    await audit(env, user, row.studio_id, 'code.delete', JSON.parse(row.data).name, { id: row.id, code });
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

// ---------------------------------------------------------------- acceso (whitelist manual + quién canjeó)
async function addManual(env, iid, list) {
  const t = now();
  const valid = [...new Set((Array.isArray(list) ? list : String(list).split(/[\s,]+/)).map(n => String(n).trim()).filter(n => NAME_RE.test(n)))].slice(0, 500);
  for (const n of valid) {
    await env.DB.prepare("INSERT INTO access (instance_id, player_key, player_name, via, created_at) VALUES (?, ?, ?, 'manual', ?) ON CONFLICT(instance_id, player_key) DO UPDATE SET via = 'manual'")
      .bind(iid, playerKey(n), n, t).run();
  }
  return valid;
}

async function accessApi(c, row, key, m) {
  const { env } = c;
  if (m === 'GET') {
    const rows = (await env.DB.prepare('SELECT player_key, player_name, uuid, via, code, created_at, last_ip FROM access WHERE instance_id = ? ORDER BY created_at DESC').bind(row.id).all()).results;
    const canSeeIp = LEVEL[c.role] >= LEVEL.admin;
    return json({ players: rows.map(r => ({ ...r, last_ip: canSeeIp ? r.last_ip : undefined })) });
  }
  c.need('editor');
  if (m === 'POST') {
    const b = await readJson(c.req);
    const added = await addManual(env, row.id, b.names || b.name || []);
    if (!added.length) fail(400, 'name', 'Escribe nombres de Minecraft válidos (3-16 letras, números o _)');
    await audit(env, c.user, row.studio_id, 'access.add', JSON.parse(row.data).name, { id: row.id, names: added.slice(0, 20), n: added.length });
    return json({ added });
  }
  if (m === 'DELETE' && key) {
    await env.DB.prepare('DELETE FROM access WHERE instance_id = ? AND player_key = ?').bind(row.id, playerKey(key)).run();
    await audit(env, c.user, row.studio_id, 'access.remove', JSON.parse(row.data).name, { id: row.id, name: key });
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

// ---------------------------------------------------------------- baneos
async function bansApi(c, scope, value, m) {
  const { env, user } = c;
  if (m === 'GET') {
    const rows = (await env.DB.prepare('SELECT kind, value, created_at FROM bans WHERE scope = ? ORDER BY created_at DESC').bind(scope).all()).results;
    return json({ bans: rows });
  }
  c.need('admin');
  if (m === 'POST') {
    const b = await readJson(c.req);
    const kind = b.kind === 'ip' ? 'ip' : 'name';
    const v = kind === 'ip' ? String(b.value || '').trim() : playerKey(b.value);
    if (kind === 'ip' ? !/^[0-9a-fA-F:.]{3,45}$/.test(v) : !NAME_RE.test(v)) fail(400, 'value', kind === 'ip' ? 'Dirección IP no válida' : 'Nombre de jugador no válido');
    await env.DB.prepare('INSERT OR IGNORE INTO bans (scope, kind, value, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(scope, kind, v, user.id, now()).run();
    if (kind === 'name' && scope.startsWith('instance:')) await env.DB.prepare('DELETE FROM access WHERE instance_id = ? AND player_key = ?').bind(scope.slice(9), v).run();
    await audit(env, user, c.studio.id, 'ban.add', v, { kind, scope });
    return json({ ok: true });
  }
  if (m === 'DELETE' && value) {
    const kind = c.u.searchParams.get('kind') === 'ip' ? 'ip' : 'name';
    await env.DB.prepare('DELETE FROM bans WHERE scope = ? AND kind = ? AND value = ?').bind(scope, kind, value).run();
    await audit(env, user, c.studio.id, 'ban.remove', value, { kind, scope });
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

// ---------------------------------------------------------------- equipo
async function members(c, uid, m) {
  const { env, studio, user } = c;
  if (m === 'GET') {
    const rows = (await env.DB.prepare('SELECT m.user_id, m.role, m.added_at, u.name, u.avatar, u.global_role FROM members m JOIN users u ON u.id = m.user_id WHERE m.studio_id = ? ORDER BY m.added_at').bind(studio.id).all()).results;
    return json({ members: rows });
  }
  c.need('admin');
  const target = await env.DB.prepare('SELECT m.role, u.name FROM members m JOIN users u ON u.id = m.user_id WHERE m.studio_id = ? AND m.user_id = ?').bind(studio.id, uid).first();
  if (!target) fail(404, 'member', 'Esa persona no está en el studio');
  if (target.role === 'owner' && c.role !== 'owner') fail(403, 'forbidden', 'Solo el dueño puede cambiar a otro dueño');
  if (m === 'PATCH') {
    const b = await readJson(c.req);
    if (!ROLES.includes(b.role)) fail(400, 'role', 'Rol no válido');
    if (b.role === 'owner' && c.role !== 'owner') fail(403, 'forbidden', 'Solo el dueño puede nombrar otro dueño');
    await env.DB.prepare('UPDATE members SET role = ? WHERE studio_id = ? AND user_id = ?').bind(b.role, studio.id, uid).run();
    await audit(env, user, studio.id, 'member.role', target.name, { role: b.role });
    return json({ ok: true });
  }
  if (m === 'DELETE') {
    if (uid === user.id && c.role === 'owner') {
      const owners = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE studio_id = ? AND role = 'owner'").bind(studio.id).first();
      if (owners.n <= 1) fail(400, 'last_owner', 'El studio necesita al menos un dueño');
    }
    await env.DB.prepare('DELETE FROM members WHERE studio_id = ? AND user_id = ?').bind(studio.id, uid).run();
    await audit(env, user, studio.id, 'member.remove', target.name);
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

async function invites(c, token, m) {
  const { env, studio, user } = c;
  c.need('admin');
  if (m === 'GET') {
    const rows = (await env.DB.prepare('SELECT token, role, created_at, expires_at FROM invites WHERE studio_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC').bind(studio.id, now()).all()).results;
    return json({ invites: rows });
  }
  if (m === 'POST') {
    const b = await readJson(c.req);
    const role = ROLES.includes(b.role) && b.role !== 'owner' ? b.role : 'editor';
    const tk = randomToken(16);
    const t = now();
    await env.DB.prepare('INSERT INTO invites (token, studio_id, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(tk, studio.id, role, user.id, t, t + 7 * 864e5).run();
    await audit(env, user, studio.id, 'invite.create', null, { role });
    return json({ token: tk, role }, 201);
  }
  if (m === 'DELETE' && token) {
    await env.DB.prepare('DELETE FROM invites WHERE token = ? AND studio_id = ?').bind(token, studio.id).run();
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

// ---------------------------------------------------------------- archivos subidos (KV)
async function mediaApi(c, mid, m, sub, step) {
  const { env, studio, user } = c;
  if (mid === 'upload') return chunkedUpload(c, m, sub, step);
  if (m === 'GET' && !mid) {
    const rows = (await env.DB.prepare('SELECT id, name, type, size, sha1, created_at FROM media WHERE studio_id = ? ORDER BY created_at DESC LIMIT 500').bind(studio.id).all()).results;
    return json({ media: rows.map(r => ({ ...r, url: `/m/${r.id}/${encodeURIComponent(r.name)}` })) });
  }
  c.need('editor');
  if (m === 'POST' && !mid) {
    if (!env.MEDIA) fail(500, 'config', 'Falta el almacén de archivos (KV MEDIA)');
    const type = (c.req.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim();
    if (!UPLOAD_TYPES.test(type)) fail(415, 'type', 'Tipo de archivo no permitido');
    const len = Number(c.req.headers.get('Content-Length') || 0);
    if (len > MAX_UPLOAD) fail(413, 'too_large', 'El archivo pasa de 25 MB');
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.length > MAX_UPLOAD) fail(413, 'too_large', 'El archivo pasa de 25 MB');
    if (!body.length) fail(400, 'empty', 'El archivo está vacío');
    await checkStorageLimit(env, studio, body.length);
    const name = str(c.u.searchParams.get('name') || 'archivo', 120).replace(/[^\w.\-() ]+/g, '_');
    const id = randomToken(10);
    const sha1 = await sha1Bytes(body);
    await env.MEDIA.put(`m:${id}`, body, { metadata: { type, name } });
    await env.DB.prepare('INSERT INTO media (id, studio_id, name, type, size, sha1, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, studio.id, name, type, body.length, sha1, user.id, now()).run();
    return json({ id, name, type, size: body.length, sha1, url: `/m/${id}/${encodeURIComponent(name)}` }, 201);
  }
  if (m === 'DELETE' && mid) {
    const row = await env.DB.prepare('SELECT id FROM media WHERE id = ? AND studio_id = ?').bind(mid, studio.id).first();
    if (!row) fail(404, 'media', 'Archivo no encontrado');
    if (env.MEDIA) await deleteMediaKeys(env, mid);
    await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(mid).run();
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

// Archivos grandes: 1) POST upload {name,type,size} → id  2) PUT upload/<id>/<n> cada trozo  3) POST upload/<id>/done
async function chunkedUpload(c, m, id, step) {
  const { env, studio, user } = c;
  c.need('editor');
  if (!env.MEDIA) fail(500, 'config', 'Falta el almacén de archivos (KV MEDIA)');
  if (m === 'POST' && !id) {
    const b = await readJson(c.req);
    const type = String(b.type || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
    if (!UPLOAD_TYPES.test(type)) fail(415, 'type', 'Tipo de archivo no permitido');
    const size = Number(b.size);
    if (!Number.isInteger(size) || size <= 0) fail(400, 'empty', 'El archivo está vacío');
    if (size > MAX_FILE) fail(413, 'too_large', `El archivo pasa de ${MAX_FILE / 1048576} MB`);
    await checkStorageLimit(env, studio, size);
    const name = str(b.name || 'archivo', 120).replace(/[^\w.\-() ]+/g, '_');
    const nid = randomToken(10);
    const chunk = Number(env.UPLOAD_CHUNK) || CHUNK; // (las pruebas usan trozos pequeños)
    const parts = Math.ceil(size / chunk);
    await env.MEDIA.put(`up:${nid}`, JSON.stringify({ studio: studio.id, user: user.id, name, type, size, parts, chunk }), { expirationTtl: 86400 });
    return json({ id: nid, chunk, parts }, 201);
  }
  if (!/^[0-9a-f]{20}$/.test(id || '')) fail(404, 'upload', 'Subida no encontrada');
  const raw = await env.MEDIA.get(`up:${id}`);
  const up = raw ? JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) : null;
  if (!up || up.studio !== studio.id) fail(404, 'upload', 'La subida caducó. Vuelve a intentarlo.');
  if (m === 'PUT' && /^\d+$/.test(step || '')) {
    const n = Number(step);
    if (n >= up.parts) fail(400, 'part', 'Trozo no válido');
    const want = n < up.parts - 1 ? up.chunk : up.size - up.chunk * (up.parts - 1);
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.length !== want) fail(400, 'part', 'El trozo no llegó completo');
    await env.MEDIA.put(`m:${id}:${n}`, body);
    return json({ ok: true, part: n });
  }
  if (m === 'POST' && step === 'done') {
    // Huella SHA-1 del archivo entero (el launcher la comprueba al descargar), trozo a trozo
    const hasher = typeof crypto.DigestStream === 'function' ? new crypto.DigestStream('SHA-1') : null;
    const writer = hasher ? hasher.getWriter() : null;
    const all = hasher ? null : [];
    for (let n = 0; n < up.parts; n++) {
      const part = await env.MEDIA.get(`m:${id}:${n}`, 'arrayBuffer');
      if (!part) fail(400, 'part', `Falta el trozo ${n + 1} de ${up.parts}`);
      if (writer) await writer.write(new Uint8Array(part)); else all.push(new Uint8Array(part));
    }
    let sha1;
    if (writer) { await writer.close(); sha1 = [...new Uint8Array(await hasher.digest)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    else { const buf = new Uint8Array(up.size); let o = 0; for (const a of all) { buf.set(a, o); o += a.length; } sha1 = await sha1Bytes(buf); }
    await env.MEDIA.put(`m:${id}:meta`, JSON.stringify({ type: up.type, name: up.name, size: up.size, parts: up.parts }));
    await env.DB.prepare('INSERT INTO media (id, studio_id, name, type, size, sha1, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, studio.id, up.name, up.type, up.size, sha1, user.id, now()).run();
    await env.MEDIA.delete(`up:${id}`);
    return json({ id, name: up.name, type: up.type, size: up.size, sha1, url: `/m/${id}/${encodeURIComponent(up.name)}` }, 201);
  }
  fail(405, 'method', 'Método no permitido');
}

async function serveMedia(p, env) {
  const id = p.split('/')[2];
  if (!/^[0-9a-f]{20}$/.test(id || '') || !env.MEDIA) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.MEDIA.getWithMetadata(`m:${id}`, { type: 'stream' });
  if (!value) {
    // Archivo grande guardado en trozos: se envía seguido, trozo a trozo
    const raw = await env.MEDIA.get(`m:${id}:meta`);
    if (!raw) return new Response('Not found', { status: 404 });
    const meta = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    let n = 0;
    const stream = new ReadableStream({
      async pull(ctrl) {
        if (n >= meta.parts) return ctrl.close();
        const part = await env.MEDIA.get(`m:${id}:${n++}`, 'arrayBuffer');
        if (!part) return ctrl.error(new Error('falta un trozo'));
        ctrl.enqueue(new Uint8Array(part));
      }
    });
    return new Response(stream, { headers: {
      'Content-Type': meta.type || 'application/octet-stream',
      'Content-Length': String(meta.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    } });
  }
  return new Response(value, { headers: {
    'Content-Type': (metadata && metadata.type) || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff'
  } });
}

// ---------------------------------------------------------------- API del launcher
async function launcherApi(req, env, u, path, m, ctx) {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const ip = clientIp(req);

  // 1) Verificación del jugador (igual que un servidor de Minecraft: join + hasJoined)
  if (parts[0] === 'challenge' && m === 'GET') {
    const id = randomToken(20);
    await env.DB.prepare('INSERT INTO challenges (id, created_at) VALUES (?, ?)').bind(id, now()).run();
    await env.DB.prepare('DELETE FROM challenges WHERE created_at < ?').bind(now() - 10 * 60e3).run();
    return json({ serverId: id });
  }
  if (parts[0] === 'auth' && m === 'POST') {
    const b = await readJson(req);
    const name = String(b.name || '').trim();
    if (!NAME_RE.test(name)) fail(400, 'name', 'Nombre de jugador no válido');
    let verified = 0, uuid = null, finalName = name;
    if (b.serverId) {
      const ch = await env.DB.prepare('DELETE FROM challenges WHERE id = ? RETURNING id').bind(String(b.serverId)).first();
      if (!ch) fail(400, 'challenge', 'Verificación caducada, inténtalo de nuevo');
      const r = await (env.MOJANG_FETCH || fetch)(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(String(b.serverId))}`);
      if (r.status !== 200) fail(401, 'not_verified', 'Mojang no confirmó tu cuenta');
      const prof = await r.json();
      verified = 1; uuid = prof.id; finalName = prof.name;
    }
    const token = randomToken(24);
    const t = now();
    await env.DB.prepare('INSERT INTO player_tokens (token_hash, player_key, player_name, uuid, verified, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(await sha256(token), playerKey(finalName), finalName, uuid, verified, t, t + 7 * 864e5).run();
    return json({ token, name: finalName, verified: !!verified, expiresAt: t + 7 * 864e5 });
  }

  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const player = auth ? await env.DB.prepare('SELECT * FROM player_tokens WHERE token_hash = ? AND expires_at > ?').bind(await sha256(auth), now()).first() : null;
  if (!player) fail(401, 'player', 'Sesión del launcher caducada');
  const P = { key: player.player_key, name: player.player_name, uuid: player.uuid, verified: !!player.verified };
  const origin = env.PUBLIC_URL || u.origin;

  const isBanned = async (row) => {
    const r = await env.DB.prepare(`SELECT 1 FROM bans WHERE scope IN (?, ?, 'global') AND ((kind = 'name' AND value = ?) OR (kind = 'ip' AND value = ?)) LIMIT 1`)
      .bind(`instance:${row.id}`, `studio:${row.studio_id}`, P.key, ip).first();
    return !!r;
  };
  const loadInst = async (id) => {
    const row = await env.DB.prepare('SELECT * FROM instances WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!row) fail(404, 'instance', 'Esta instancia ya no existe');
    return row;
  };
  const studioOf = (sid) => env.DB.prepare('SELECT id, name, logo, suspended_at FROM studios WHERE id = ?').bind(sid).first();
  const SUSPENDED = { ok: false, reason: 'suspended', message: 'El studio de esta instancia está suspendido' };

  if (parts[0] === 'referral' && m === 'POST') return addReferral(env, P, (await readJson(req)).studio);
  // Kopi Skins: la skin de la cuenta no premium, para verla en los servidores
  if (parts[0] === 'skin' && m === 'POST') return uploadSkin(env, P, await readJson(req, 128 * 1024));
  if (parts[0] === 'skin' && m === 'DELETE') return deleteSkin(env, P, await readJson(req));
  // Capas de Kopi: las que tiene el jugador y cuál lleva puesta
  if (parts[0] === 'capes' || parts[0] === 'cape') { const r = await launcherCapes(env, P, parts, m, req); if (r) return r; }
  // «Enviar informe» → canal de Discord del equipo (webhook guardado como secreto en Cloudflare)
  if (parts[0] === 'badges') { const r = await launcherBadges(env, P, parts, m, req, u.searchParams); if (r) return r; }
  if (parts[0] === 'channels' || parts[0] === 'live') { const r = await launcherStreams(env, P, parts, m, req); if (r) return r; }
  if (parts[0] === 'report' && m === 'POST') return sendReport(env, P, await readJson(req, 12 * 1024 * 1024));
  // KopiGuard: el launcher avisa de lo que ha visto mientras se juega
  if (parts[0] === 'guard' && parts[1] === 'media' && m === 'POST') return guardMedia(env, P, req, u.searchParams);
  if (parts[0] === 'guard' && parts[1] === 'frame' && m === 'POST') return guardFrame(env, P, await readJson(req, 1024 * 1024));
  if (parts[0] === 'guard' && m === 'POST') return guardReport(env, ctx, P, await readJson(req, 256 * 1024));

  if (parts[0] === 'redeem' && m === 'POST') {
    const b = await readJson(req);
    const code = normalizeCode(b.code);
    if (!code) fail(400, 'code', 'El código debe tener el formato XXXX-XXXX-XXXX');
    const cd = await env.DB.prepare('SELECT * FROM codes WHERE code = ?').bind(code).first();
    if (!cd) fail(404, 'code', 'Código no válido o caducado');
    const row = await loadInst(cd.instance_id);
    const data = JSON.parse(row.data);
    if (await isBanned(row)) fail(403, 'banned', 'No puedes entrar a esta instancia');
    if ((await studioOf(row.studio_id)).suspended_at) return json(SUSPENDED, 403);
    if (!data.access.codes) fail(403, 'codes_off', 'Esta instancia ya no acepta códigos');
    const already = await env.DB.prepare('SELECT 1 FROM access WHERE instance_id = ? AND player_key = ?').bind(row.id, P.key).first();
    if (!already) {
      // Gastar un uso de forma atómica (no se pasa del máximo aunque canjeen a la vez)
      const used = await env.DB.prepare('UPDATE codes SET uses = uses + 1 WHERE code = ? AND (max_uses IS NULL OR uses < max_uses) RETURNING uses').bind(code).first();
      if (!used) fail(410, 'code_used', 'Este código ya no tiene usos');
      await env.DB.prepare("INSERT INTO access (instance_id, player_key, player_name, uuid, via, code, last_ip, created_at) VALUES (?, ?, ?, ?, 'code', ?, ?, ?)")
        .bind(row.id, P.key, P.name, P.uuid, code, ip, now()).run();
    }
    return json({ instance: toManifest(row, await studioOf(row.studio_id), origin, P.key), already: !!already });
  }

  if (parts[0] === 'instances' && m === 'GET') {
    // Con acceso (código o lista manual), públicas, o donde es staff (el staff ve también las ocultas)
    const rows = (await env.DB.prepare(`SELECT i.* FROM instances i WHERE i.deleted_at IS NULL AND (
      (i.hidden = 0 AND (i.id IN (SELECT instance_id FROM access WHERE player_key = ?) OR json_extract(i.data, '$.access.public') = 1))
      OR EXISTS (SELECT 1 FROM json_each(i.data, '$.access.staff') s WHERE lower(s.value) = ?))`).bind(P.key, P.key).all()).results;
    const out = [];
    for (const r of rows) if (!(await isBanned(r))) out.push(toManifest(r, await studioOf(r.studio_id), origin, P.key));
    return json({ instances: out });
  }

  if (parts[0] === 'instance' && parts[1] && m === 'GET') {
    const row = await loadInst(parts[1]);
    const data = JSON.parse(row.data);
    const has = await env.DB.prepare('SELECT 1 FROM access WHERE instance_id = ? AND player_key = ?').bind(row.id, P.key).first();
    const staff = data.access.staff.some(n => n.toLowerCase() === P.key);
    if (!has && !data.access.public && !staff) fail(403, 'no_access', 'Ya no tienes acceso a esta instancia');
    if (await isBanned(row)) fail(403, 'banned', 'No puedes entrar a esta instancia');
    return json({ instance: toManifest(row, await studioOf(row.studio_id), origin, P.key) });
  }

  if (parts[0] === 'play' && m === 'POST') {
    const b = await readJson(req);
    const row = await loadInst(String(b.instance || ''));
    const data = JSON.parse(row.data);
    const t = now();
    const has = await env.DB.prepare('SELECT 1 FROM access WHERE instance_id = ? AND player_key = ?').bind(row.id, P.key).first();
    const active = await env.DB.prepare('SELECT COUNT(*) AS n FROM plays WHERE instance_id = ? AND ended_at IS NULL AND last_seen > ? AND player_key != ?').bind(row.id, t - ACTIVE_MS, P.key).first();
    const g = gate({ row, data, player: P, banned: await isBanned(row), hasAccess: !!has, activeOthers: active.n || 0, at: t });
    if (!g.ok) return json(g, 403);
    if ((await studioOf(row.studio_id)).suspended_at) return json(SUSPENDED, 403);
    const mt = await maintenance(env);
    if (mt.on && !g.staff) return json({ ok: false, reason: 'maintenance', message: mt.message || 'Kopi está en mantenimiento. Vuelve en un rato.' }, 403);
    await env.DB.prepare('UPDATE plays SET ended_at = ? WHERE instance_id = ? AND player_key = ? AND ended_at IS NULL').bind(t, row.id, P.key).run();
    const id = randomToken(12);
    await env.DB.prepare('INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, row.id, row.studio_id, P.key, P.name, t, t).run();
    if (has) await env.DB.prepare('UPDATE access SET last_ip = ? WHERE instance_id = ? AND player_key = ?').bind(ip, row.id, P.key).run();
    // con KopiGuard, latidos más seguidos: una expulsión se nota en menos de 20 s
    return json({ ok: true, play: id, staff: !!g.staff, beatEvery: data.guard && data.guard.enabled ? 20 : 60 });
  }

  if ((parts[0] === 'beat' || parts[0] === 'end') && m === 'POST') {
    const b = await readJson(req);
    const pl = await env.DB.prepare('SELECT * FROM plays WHERE id = ? AND player_key = ?').bind(String(b.play || ''), P.key).first();
    if (!pl) fail(404, 'play', 'Partida no encontrada');
    const t = now();
    if (parts[0] === 'end') {
      await env.DB.prepare('UPDATE plays SET ended_at = ?, last_seen = ? WHERE id = ?').bind(t, t, pl.id).run();
      await env.DB.prepare('DELETE FROM guard_live WHERE play_id = ?').bind(pl.id).run();
      return json({ ok: true });
    }
    await env.DB.prepare('UPDATE plays SET last_seen = ? WHERE id = ?').bind(t, pl.id).run();
    // ¿Hay que sacarle? (instancia cerrada con "sacar al cerrar", baneado o bloqueada sin ser staff)
    const row = await env.DB.prepare('SELECT * FROM instances WHERE id = ?').bind(pl.instance_id).first();
    let kick = !row || !!row.deleted_at;
    if (pl.kick_reason) kick = true; // expulsado desde KopiGuard (o sancionado)
    if (row && !kick) {
      const data = JSON.parse(row.data);
      const staff = data.access.staff.some(n => n.toLowerCase() === P.key);
      if (await isBanned(row)) kick = true;
      else if (!staff && data.schedule.kickOnClose && ((data.schedule.closesAt && t > data.schedule.closesAt) || row.state === 'locked')) kick = true;
    }
    // El plugin del servidor vio algo: el launcher manda foto y vídeo para esa detección
    if (pl.snap) await env.DB.prepare('UPDATE plays SET snap = NULL WHERE id = ?').bind(pl.id).run();
    return json({ ok: true, kick, cam: kick ? null : await camWanted(env, pl), snap: kick ? null : pl.snap || null });
  }

  fail(404, 'not_found', 'Ruta no encontrada');
}
