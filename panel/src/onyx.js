// Herramientas del Creador (dueño de Kopi) y piezas compartidas:
// registro de actividad, avisos del launcher, ajustes globales, límites y espacio de los studios.
import { json, fail, now, str, int, url as cleanUrl, readJson, randomToken, NAME_RE, playerKey } from './util.js';
import { peaksByDay } from './stats.js';

const ACTIVE_MS = 90e3;
const DAY = 864e5;
export const NOTICE_KINDS = ['info', 'success', 'warn', 'event'];

// ---------------------------------------------------------------- registro de actividad
export async function audit(env, user, studioId, action, target = null, detail = null) {
  try {
    await env.DB.prepare('INSERT INTO audit (at, user_id, user_name, studio_id, action, target, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(now(), user ? user.id : null, user ? user.name : null, studioId || null, action, target, detail ? JSON.stringify(detail) : null).run();
  } catch (e) { console.error('audit', e); }
}

export async function auditList(env, { studio = null, q = '', before = null, limit = 60 } = {}) {
  const where = [], args = [];
  if (studio) { where.push('a.studio_id = ?'); args.push(studio); }
  if (before) { where.push('a.id < ?'); args.push(before); }
  if (q) { where.push('(a.user_name LIKE ? OR a.target LIKE ? OR a.detail LIKE ? OR a.action LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l); }
  const rows = (await env.DB.prepare(`SELECT a.*, s.name AS studio_name FROM audit a LEFT JOIN studios s ON s.id = a.studio_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`).bind(...args, limit + 1).all()).results;
  const more = rows.length > limit;
  return {
    items: rows.slice(0, limit).map(r => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })),
    next: more ? rows[limit - 1].id : null
  };
}

// ---------------------------------------------------------------- ajustes globales
export async function getSetting(env, key, def = null) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!r) return def;
  try { return JSON.parse(r.value); } catch { return def; }
}
export async function setSetting(env, key, value) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run();
}
export const maintenance = (env) => getSetting(env, 'maintenance', { on: false, message: '' });

// ---------------------------------------------------------------- espacio y límites de un studio
export async function storageUsed(env, sid) {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS b, COUNT(*) AS n FROM media WHERE studio_id = ?').bind(sid).first();
  return { bytes: r.b || 0, files: r.n || 0 };
}

export async function usage(env, studio) {
  const st = await storageUsed(env, studio.id);
  const inst = await env.DB.prepare('SELECT COUNT(*) AS n FROM instances WHERE studio_id = ? AND deleted_at IS NULL').bind(studio.id).first();
  return {
    storage: st.bytes, files: st.files, instances: inst.n || 0,
    maxStorageMb: studio.max_storage_mb || null, maxInstances: studio.max_instances || null
  };
}

export async function checkInstanceLimit(env, studio) {
  if (!studio.max_instances) return;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM instances WHERE studio_id = ? AND deleted_at IS NULL').bind(studio.id).first();
  if ((r.n || 0) >= studio.max_instances) fail(403, 'limit', `Este studio tiene un límite de ${studio.max_instances} instancias`);
}

export async function checkStorageLimit(env, studio, extra) {
  if (!studio.max_storage_mb) return;
  const { bytes } = await storageUsed(env, studio.id);
  if (bytes + extra > studio.max_storage_mb * 1048576) fail(413, 'quota', `Se ha llenado el espacio del studio (${studio.max_storage_mb} MB). Borra archivos que no uses o usa enlaces de Modrinth.`);
}

// Archivos subidos que ya no usa nada (instancias, papelera, eventos, logo, avisos)
export async function orphanMedia(env, sid) {
  const media = (await env.DB.prepare('SELECT id, name, size, created_at FROM media WHERE studio_id = ?').bind(sid).all()).results;
  if (!media.length) return [];
  const texts = [];
  for (const r of (await env.DB.prepare('SELECT data FROM instances WHERE studio_id = ?').bind(sid).all()).results) texts.push(r.data);
  for (const r of (await env.DB.prepare('SELECT image, description FROM events WHERE studio_id = ?').bind(sid).all()).results) texts.push(r.image || '', r.description || '');
  for (const r of (await env.DB.prepare('SELECT url, body FROM notices WHERE studio_id = ?').bind(sid).all()).results) texts.push(r.url || '', r.body || '');
  const st = await env.DB.prepare('SELECT logo FROM studios WHERE id = ?').bind(sid).first();
  texts.push((st && st.logo) || '');
  const all = texts.join('\n');
  const fresh = now() - 3600e3; // lo subido en la última hora puede estar a medio guardar
  return media.filter(m => m.created_at < fresh && !all.includes(`/m/${m.id}`));
}

export async function cleanOrphans(env, sid) {
  const list = await orphanMedia(env, sid);
  for (const m of list) {
    if (env.MEDIA) await env.MEDIA.delete(`m:${m.id}`);
    await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(m.id).run();
  }
  return { files: list.length, bytes: list.reduce((a, m) => a + (m.size || 0), 0) };
}

// ---------------------------------------------------------------- avisos del launcher
function cleanNotice(b, cur = {}) {
  const title = 'title' in b ? str(b.title, 90).trim() : cur.title;
  if (!title || title.length < 2) fail(400, 'title', 'Escribe un título para el aviso');
  const kind = NOTICE_KINDS.includes(b.kind) ? b.kind : (cur.kind || 'info');
  const link = 'url' in b ? (b.url ? cleanUrl(b.url) : null) : cur.url || null;
  if ('url' in b && b.url && (!link || !/^https:\/\//.test(link))) fail(400, 'url', 'El enlace debe empezar por https://');
  const starts = 'startsAt' in b ? int(b.startsAt, 0, 9e15, now()) : (cur.starts_at || now());
  const ends = 'endsAt' in b ? int(b.endsAt, 0, 9e15, null) : (cur.ends_at || null);
  if (ends && ends <= starts) fail(400, 'dates', 'La fecha de fin debe ser después del inicio');
  return { title, body: 'body' in b ? str(b.body, 500).trim() : (cur.body || ''), kind, url: link, starts_at: starts, ends_at: ends };
}

// scope: null = todo Kopi (solo Creador) · 'id' = un studio
export async function noticesApi({ env, user, isCreator, req }, studioId, id, m, { allowAudience = false } = {}) {
  const sel = 'SELECT n.*, s.name AS studio_name, u.name AS by_name FROM notices n LEFT JOIN studios s ON s.id = n.studio_id LEFT JOIN users u ON u.id = n.created_by';
  if (m === 'GET' && !id) {
    const rows = studioId === undefined
      ? (await env.DB.prepare(`${sel} WHERE n.deleted_at IS NULL ORDER BY n.starts_at DESC LIMIT 200`).all()).results
      : (await env.DB.prepare(`${sel} WHERE n.deleted_at IS NULL AND n.studio_id = ? ORDER BY n.starts_at DESC LIMIT 200`).bind(studioId).all()).results;
    return json({ notices: rows });
  }
  const body = m === 'DELETE' ? {} : await readJson(req);
  // El Creador puede elegir a quién va: a todos (null) o a los jugadores de un studio
  let target = studioId;
  if (allowAudience && 'audience' in body) {
    target = body.audience && body.audience !== 'all' ? String(body.audience) : null;
    if (target && !(await env.DB.prepare('SELECT 1 FROM studios WHERE id = ? AND deleted_at IS NULL').bind(target).first())) fail(400, 'audience', 'Ese studio no existe');
  }
  if (m === 'POST' && !id) {
    const n = cleanNotice(body);
    const nid = randomToken(8);
    await env.DB.prepare('INSERT INTO notices (id, studio_id, title, body, kind, url, starts_at, ends_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(nid, target || null, n.title, n.body, n.kind, n.url, n.starts_at, n.ends_at, user.id, now()).run();
    await audit(env, user, target || null, 'notice.create', n.title, { audience: target || 'all' });
    return json({ id: nid }, 201);
  }
  const cur = id && await env.DB.prepare('SELECT * FROM notices WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!cur || (studioId !== undefined && cur.studio_id !== studioId)) fail(404, 'notice', 'Aviso no encontrado');
  if (m === 'PATCH') {
    const n = cleanNotice(body, cur);
    const aud = allowAudience && 'audience' in body ? target : cur.studio_id;
    await env.DB.prepare('UPDATE notices SET studio_id = ?, title = ?, body = ?, kind = ?, url = ?, starts_at = ?, ends_at = ? WHERE id = ?')
      .bind(aud || null, n.title, n.body, n.kind, n.url, n.starts_at, n.ends_at, id).run();
    await audit(env, user, aud || null, 'notice.update', n.title);
    return json({ ok: true });
  }
  if (m === 'DELETE') {
    await env.DB.prepare('UPDATE notices SET deleted_at = ? WHERE id = ?').bind(now(), id).run();
    await audit(env, user, cur.studio_id, 'notice.delete', cur.title);
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

// Lo que ve el launcher: avisos de todo Kopi + los de los studios de sus instancias
export async function publicNotices(env, studios, origin) {
  const t = now();
  const ids = studios.filter(s => /^[a-z0-9-]{1,60}$/.test(s)).slice(0, 50);
  const rows = (await env.DB.prepare(`SELECT n.*, s.name AS studio_name FROM notices n LEFT JOIN studios s ON s.id = n.studio_id
    WHERE n.deleted_at IS NULL AND n.starts_at <= ? AND (n.ends_at IS NULL OR n.ends_at > ?)
    AND (n.studio_id IS NULL ${ids.length ? `OR n.studio_id IN (${ids.map(() => '?').join(',')})` : ''}) ORDER BY n.starts_at DESC LIMIT 30`)
    .bind(t, t, ...ids).all()).results;
  const abs = (u) => (u && u.startsWith('/m/') ? origin + u : u);
  const out = rows.map(r => ({ id: r.id, title: r.title, body: r.body || '', kind: r.kind, url: abs(r.url), author: r.studio_name || 'Kopi', studio: r.studio_id, date: new Date(r.starts_at).toISOString(), until: r.ends_at }));
  const mt = await maintenance(env);
  if (mt.on) out.unshift({ id: 'maintenance', title: mt.message || 'Kopi está en mantenimiento', body: '', kind: 'warn', author: 'Kopi', date: new Date(mt.since || t).toISOString(), pinned: true });
  return out;
}

// ---------------------------------------------------------------- API del Creador (/api/onyx/...)
export async function creatorApi(c, parts, m) {
  const { env, user } = c;
  const [a, b, sub] = parts;
  if (a === 'overview' && m === 'GET') return json(await overview(env));
  if (a === 'studios') return studiosAdmin(c, b, sub, m);
  if (a === 'users') return usersAdmin(c, b, m);
  if (a === 'players' && m === 'GET') return json(await findPlayer(env, c.u.searchParams.get('q') || ''));
  if (a === 'notices') return noticesApi(c, undefined, b, m, { allowAudience: true });
  if (a === 'audit' && m === 'GET') {
    const q = c.u.searchParams;
    return json(await auditList(env, { studio: q.get('studio') || null, q: str(q.get('q'), 60), before: int(q.get('before'), 1, 9e15, null) }));
  }
  if (a === 'bans') return globalBans(c, b, m);
  if (a === 'settings') {
    if (m === 'GET') return json({ maintenance: await maintenance(env) });
    if (m === 'PATCH') {
      const body = await readJson(c.req);
      if (body.maintenance) {
        const cur = await maintenance(env);
        const on = !!body.maintenance.on;
        const next = { on, message: str(body.maintenance.message, 200).trim(), since: on ? (cur.on ? cur.since : now()) : null };
        await setSetting(env, 'maintenance', next);
        if (on !== cur.on) await audit(env, user, null, on ? 'maintenance.on' : 'maintenance.off', next.message || null);
      }
      return json({ ok: true, maintenance: await maintenance(env) });
    }
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

async function studioStats(env) {
  const t = now(), since = t - 30 * DAY;
  const map = (rows, k = 'n') => Object.fromEntries(rows.map(r => [r.studio_id, r[k] || 0]));
  const [players, playing, storage, inst, members, owners, plays] = await Promise.all([
    env.DB.prepare('SELECT studio_id, COUNT(DISTINCT player_key) AS n FROM plays WHERE started_at > ? GROUP BY studio_id').bind(since).all(),
    env.DB.prepare('SELECT studio_id, COUNT(*) AS n FROM plays WHERE ended_at IS NULL AND last_seen > ? GROUP BY studio_id').bind(t - ACTIVE_MS).all(),
    env.DB.prepare('SELECT studio_id, SUM(size) AS n FROM media GROUP BY studio_id').all(),
    env.DB.prepare('SELECT studio_id, COUNT(*) AS n FROM instances WHERE deleted_at IS NULL GROUP BY studio_id').all(),
    env.DB.prepare('SELECT studio_id, COUNT(*) AS n FROM members GROUP BY studio_id').all(),
    env.DB.prepare("SELECT m.studio_id, u.name FROM members m JOIN users u ON u.id = m.user_id WHERE m.role = 'owner' ORDER BY m.added_at").all(),
    env.DB.prepare('SELECT studio_id, COUNT(*) AS n FROM plays WHERE started_at > ? GROUP BY studio_id').bind(since).all()
  ]);
  const own = {};
  for (const r of owners.results) (own[r.studio_id] = own[r.studio_id] || []).push(r.name);
  return { players: map(players.results), playing: map(playing.results), storage: map(storage.results), instances: map(inst.results), members: map(members.results), plays: map(plays.results), owners: own };
}

export async function allStudiosFull(env) {
  const rows = (await env.DB.prepare('SELECT * FROM studios WHERE deleted_at IS NULL ORDER BY created_at').all()).results;
  const s = await studioStats(env);
  return rows.map(r => ({
    id: r.id, name: r.name, logo: r.logo, created_at: r.created_at, note: r.note || '',
    suspended: !!r.suspended_at, suspendedAt: r.suspended_at, suspendReason: r.suspend_reason || '', brandAllowed: !!r.brand_allowed,
    maxInstances: r.max_instances || null, maxStorageMb: r.max_storage_mb || null,
    instances: s.instances[r.id] || 0, members: s.members[r.id] || 0, owners: s.owners[r.id] || [],
    players30: s.players[r.id] || 0, plays30: s.plays[r.id] || 0, playingNow: s.playing[r.id] || 0, storage: s.storage[r.id] || 0
  }));
}

async function overview(env) {
  const t = now(), since = t - 30 * DAY;
  const one = (sql, ...args) => env.DB.prepare(sql).bind(...args).first();
  const [studios, users, inst, access, uniq, playing, today, storage, codes] = await Promise.all([
    one('SELECT COUNT(*) AS n, SUM(CASE WHEN suspended_at IS NOT NULL THEN 1 ELSE 0 END) AS susp FROM studios WHERE deleted_at IS NULL'),
    one('SELECT COUNT(*) AS n, SUM(CASE WHEN blocked_at IS NOT NULL THEN 1 ELSE 0 END) AS blocked, SUM(CASE WHEN last_login > ? THEN 1 ELSE 0 END) AS active FROM users', since),
    one("SELECT COUNT(*) AS n, SUM(CASE WHEN state = 'open' AND hidden = 0 THEN 1 ELSE 0 END) AS open FROM instances WHERE deleted_at IS NULL"),
    one('SELECT COUNT(DISTINCT player_key) AS n FROM access'),
    one('SELECT COUNT(DISTINCT player_key) AS n FROM plays WHERE started_at > ?', since),
    one('SELECT COUNT(*) AS n FROM plays WHERE ended_at IS NULL AND last_seen > ?', t - ACTIVE_MS),
    one('SELECT COUNT(*) AS n FROM plays WHERE started_at > ?', t - DAY),
    one('SELECT COALESCE(SUM(size), 0) AS n, COUNT(*) AS files FROM media'),
    one('SELECT COUNT(*) AS n, COALESCE(SUM(uses), 0) AS uses FROM codes')
  ]);
  const plays = (await env.DB.prepare('SELECT started_at, COALESCE(ended_at, last_seen) AS end_at FROM plays WHERE started_at > ? ORDER BY started_at LIMIT 50000').bind(since).all()).results;
  const chart = peaksByDay(plays, since, t);
  const list = await allStudiosFull(env);
  return {
    studios: studios.n || 0, suspended: studios.susp || 0,
    users: users.n || 0, blockedUsers: users.blocked || 0, activeUsers: users.active || 0,
    instances: inst.n || 0, openInstances: inst.open || 0,
    playersWithAccess: access.n || 0, players30: uniq.n || 0, playingNow: playing.n || 0, plays24h: today.n || 0,
    storage: storage.n || 0, files: storage.files || 0, codes: codes.n || 0, redeemed: codes.uses || 0,
    chart, peak: chart.reduce((best, d) => (d.peak > best.peak ? d : best), { peak: 0, day: null }),
    top: list.slice().sort((x, y) => y.players30 - x.players30 || y.playingNow - x.playingNow).slice(0, 6),
    activity: (await auditList(env, { limit: 10 })).items,
    maintenance: await maintenance(env)
  };
}

async function studiosAdmin(c, sid, sub, m) {
  const { env, user } = c;
  if (!sid) {
    if (m === 'GET') return json({ studios: await allStudiosFull(env) });
    return null; // POST lo resuelve createStudio en worker.js
  }
  const st = await env.DB.prepare('SELECT * FROM studios WHERE id = ? AND deleted_at IS NULL').bind(sid).first();
  if (!st) fail(404, 'studio', 'Studio no encontrado');
  if (!sub && m === 'GET') {
    const mem = (await env.DB.prepare('SELECT m.user_id, m.role, u.name, u.avatar FROM members m JOIN users u ON u.id = m.user_id WHERE m.studio_id = ? ORDER BY m.added_at').bind(sid).all()).results;
    return json({ studio: (await allStudiosFull(env)).find(x => x.id === sid), members: mem, usage: await usage(env, st), orphans: (await orphanMedia(env, sid)).length });
  }
  if (!sub && m === 'PATCH') {
    const b = await readJson(c.req);
    const name = 'name' in b ? str(b.name, 50).trim() || st.name : st.name;
    const note = 'note' in b ? str(b.note, 1000) : st.note;
    const maxI = 'maxInstances' in b ? int(b.maxInstances, 1, 10000, null) : st.max_instances;
    const maxS = 'maxStorageMb' in b ? int(b.maxStorageMb, 10, 1000000, null) : st.max_storage_mb;
    let susp = st.suspended_at, reason = st.suspend_reason;
    if ('brandAllowed' in b) {
      await env.DB.prepare('UPDATE studios SET brand_allowed = ? WHERE id = ?').bind(b.brandAllowed ? 1 : 0, sid).run();
      if (!!b.brandAllowed !== !!st.brand_allowed) await audit(env, user, sid, b.brandAllowed ? 'brand.allow' : 'brand.deny', st.name);
    }
    if ('suspended' in b) {
      if (b.suspended && sid === 'onyx-studios') fail(400, 'main', 'No puedes suspender tu propio studio principal');
      susp = b.suspended ? (st.suspended_at || now()) : null;
      reason = b.suspended ? str(b.reason, 200).trim() : null;
    }
    await env.DB.prepare('UPDATE studios SET name = ?, note = ?, max_instances = ?, max_storage_mb = ?, suspended_at = ?, suspend_reason = ? WHERE id = ?')
      .bind(name, note, maxI, maxS, susp, reason, sid).run();
    if ('suspended' in b && !!susp !== !!st.suspended_at) await audit(env, user, sid, susp ? 'studio.suspend' : 'studio.unsuspend', st.name, reason ? { reason } : null);
    if (('maxInstances' in b && maxI !== st.max_instances) || ('maxStorageMb' in b && maxS !== st.max_storage_mb)) await audit(env, user, sid, 'studio.limits', st.name, { maxInstances: maxI, maxStorageMb: maxS });
    if (name !== st.name) await audit(env, user, sid, 'studio.rename', name, { from: st.name });
    return json({ ok: true });
  }
  if (!sub && m === 'DELETE') {
    if (sid === 'onyx-studios') fail(400, 'main', 'No puedes borrar tu propio studio principal');
    const t = now();
    await env.DB.batch([
      env.DB.prepare('UPDATE studios SET deleted_at = ? WHERE id = ?').bind(t, sid),
      env.DB.prepare('UPDATE instances SET deleted_at = COALESCE(deleted_at, ?) WHERE studio_id = ?').bind(t, sid)
    ]);
    await audit(env, user, sid, 'studio.delete', st.name);
    return json({ ok: true });
  }
  if (sub === 'invite' && m === 'POST') { // otro enlace de dueño (si el primero caducó o cambia de manos)
    const tk = randomToken(16), t = now();
    await env.DB.prepare('INSERT INTO invites (token, studio_id, studio_name, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(tk, sid, st.name, 'owner', user.id, t, t + 14 * DAY).run();
    await audit(env, user, sid, 'invite.create', st.name, { role: 'owner' });
    return json({ token: tk }, 201);
  }
  if (sub === 'clean' && m === 'POST') {
    const r = await cleanOrphans(env, sid);
    await audit(env, user, sid, 'storage.clean', st.name, r);
    return json(r);
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

async function usersAdmin(c, uid, m) {
  const { env, user } = c;
  if (!uid && m === 'GET') {
    const q = str(c.u.searchParams.get('q'), 60).trim();
    const rows = (await env.DB.prepare(`SELECT u.id, u.name, u.avatar, u.global_role, u.created_at, u.last_login, u.blocked_at,
      (SELECT GROUP_CONCAT(s.name || '|' || m.role, ';;') FROM members m JOIN studios s ON s.id = m.studio_id AND s.deleted_at IS NULL WHERE m.user_id = u.id) AS studios
      FROM users u ${q ? 'WHERE u.name LIKE ? OR u.id = ?' : ''} ORDER BY u.last_login DESC LIMIT 300`).bind(...(q ? [`%${q}%`, q] : [])).all()).results;
    return json({ users: rows.map(r => ({ ...r, studios: r.studios ? r.studios.split(';;').map(x => { const [name, role] = x.split('|'); return { name, role }; }) : [] })) });
  }
  const target = uid && await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
  if (!target) fail(404, 'user', 'Usuario no encontrado');
  if (m === 'PATCH') {
    const b = await readJson(c.req);
    if ('blocked' in b) {
      if (target.global_role === 'creator' || target.id === user.id) fail(400, 'self', 'No puedes bloquear al Creador');
      await env.DB.prepare('UPDATE users SET blocked_at = ? WHERE id = ?').bind(b.blocked ? now() : null, uid).run();
      if (b.blocked) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();
      await audit(env, user, null, b.blocked ? 'user.block' : 'user.unblock', target.name);
    }
    return json({ ok: true });
  }
  if (m === 'DELETE') { // cerrar todas sus sesiones
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();
    await audit(env, user, null, 'user.logout', target.name);
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}

// Busca un jugador de Minecraft en todo Kopi
async function findPlayer(env, q) {
  q = String(q || '').trim();
  if (q.length < 2) return { players: [] };
  const like = `%${q.toLowerCase()}%`;
  const names = (await env.DB.prepare(`SELECT player_key, MAX(player_name) AS name FROM (
      SELECT player_key, player_name FROM access WHERE player_key LIKE ?
      UNION ALL SELECT player_key, player_name FROM plays WHERE player_key LIKE ?
      UNION ALL SELECT player_key, player_name FROM player_tokens WHERE player_key LIKE ?)
    GROUP BY player_key ORDER BY (player_key = ?) DESC, player_key LIMIT 12`).bind(like, like, like, q.toLowerCase()).all()).results;
  const out = [];
  for (const n of names) {
    const k = n.player_key;
    const [acc, plays, tok, bans, ref] = await Promise.all([
      env.DB.prepare(`SELECT a.instance_id, a.via, a.code, a.last_ip, a.created_at, i.data, i.studio_id, s.name AS studio FROM access a
        JOIN instances i ON i.id = a.instance_id JOIN studios s ON s.id = i.studio_id WHERE a.player_key = ? AND i.deleted_at IS NULL ORDER BY a.created_at DESC`).bind(k).all(),
      env.DB.prepare('SELECT COUNT(*) AS n, MAX(last_seen) AS last, SUM(COALESCE(ended_at, last_seen) - started_at) AS ms FROM plays WHERE player_key = ?').bind(k).first(),
      env.DB.prepare('SELECT uuid, verified, created_at FROM player_tokens WHERE player_key = ? ORDER BY created_at DESC LIMIT 1').bind(k).first(),
      env.DB.prepare("SELECT scope, kind, value, created_at FROM bans WHERE kind = 'name' AND value = ?").bind(k).all(),
      env.DB.prepare('SELECT r.studio_id, s.name FROM referrals r LEFT JOIN studios s ON s.id = r.studio_id WHERE r.player_key = ?').bind(k).first()
    ]);
    out.push({
      key: k, name: n.name, uuid: tok && tok.uuid, verified: !!(tok && tok.verified), seen: tok && tok.created_at,
      plays: plays.n || 0, lastPlay: plays.last || null, playTime: plays.ms || 0,
      instances: acc.results.map(r => ({ id: r.instance_id, name: JSON.parse(r.data).name, studio: r.studio, studioId: r.studio_id, via: r.via, code: r.code, ip: r.last_ip, at: r.created_at })),
      bans: bans.results, referral: ref ? ref.name : null
    });
  }
  return { players: out };
}

async function globalBans({ env, user, req, u }, value, m) {
  if (m === 'GET') {
    const rows = (await env.DB.prepare("SELECT b.kind, b.value, b.created_at, u.name AS by_name FROM bans b LEFT JOIN users u ON u.id = b.created_by WHERE b.scope = 'global' ORDER BY b.created_at DESC").all()).results;
    return json({ bans: rows });
  }
  if (m === 'POST') {
    const b = await readJson(req);
    const kind = b.kind === 'ip' ? 'ip' : 'name';
    const v = kind === 'ip' ? String(b.value || '').trim() : playerKey(b.value);
    if (kind === 'ip' ? !/^[0-9a-fA-F:.]{3,45}$/.test(v) : !NAME_RE.test(v)) fail(400, 'value', kind === 'ip' ? 'Dirección IP no válida' : 'Nombre de jugador no válido');
    await env.DB.prepare("INSERT OR IGNORE INTO bans (scope, kind, value, created_by, created_at) VALUES ('global', ?, ?, ?, ?)").bind(kind, v, user.id, now()).run();
    await audit(env, user, null, 'ban.global', v, { kind });
    return json({ ok: true });
  }
  if (m === 'DELETE' && value) {
    const kind = u.searchParams.get('kind') === 'ip' ? 'ip' : 'name';
    await env.DB.prepare("DELETE FROM bans WHERE scope = 'global' AND kind = ? AND value = ?").bind(kind, value).run();
    await audit(env, user, null, 'unban.global', value, { kind });
    return json({ ok: true });
  }
  fail(405, 'method', 'Método no permitido');
}
