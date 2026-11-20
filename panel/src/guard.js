// KopiGuard: el anticheat de las instancias (se activa en cada instancia → Protección).
//
// Mientras se juega, el launcher vigila y avisa aquí (POST /api/l/guard):
//   mod      → un mod añadido a mods/
//   pack     → un paquete de texturas o de shaders añadido
//   file     → un archivo del studio cambiado, o uno nuevo en config/
//   program  → un programa de trampas abierto (autoclicker, inyector…). El launcher solo manda los que
//              coinciden con la lista de abajo: nunca la lista completa de programas del jugador.
// El studio lo ve en su página KopiGuard: revisar, descartar, sancionar (banear en esa instancia) o
// expulsar (el launcher cierra el juego en el siguiente latido). Opcional: aviso a un canal de Discord.
import { json, fail, now, str, int, randomToken, NAME_RE, readJson } from './util.js';
import { audit } from './onyx.js';

export const TYPES = ['mod', 'pack', 'file', 'program'];
export const SEVERITIES = ['high', 'medium', 'low'];
export const STATUSES = ['new', 'reviewed', 'dismissed', 'sanctioned'];
const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const MAX_PER_PLAY = 60;      // detecciones como mucho por partida (que nadie llene la lista)
const SAME_WAIT = 10 * 60e3;  // la misma detección en la misma partida, como mucho cada 10 min
const PAGE = 50;
const MEDIA_PER_PLAY = 6;     // detecciones con foto y vídeo por partida
const MEDIA_TTL = 30 * 864e5; // las fotos y vídeos se borran solos a los 30 días
const SHOT_MAX = 1.5 * 1024 * 1024, VIDEO_MAX = 8 * 1024 * 1024, FRAME_MAX = 600 * 1024;
const LIVE_MS = 90e3;         // una partida cuenta como «jugando» si latió en los últimos 90 s
const WATCH_MS = 30e3;        // alguien tiene abierta la página de cámaras
const FOCUS_MS = 15e3;        // alguien mira a un jugador en grande

// Programas de trampas que el launcher busca (nombre del programa o título de la ventana, en minúsculas).
// Se mandan al launcher con la instancia: se puede ampliar aquí sin sacar otra versión del launcher.
export const PROGRAMS = [
  { m: 'autoclicker', n: 'Autoclicker' }, { m: 'auto clicker', n: 'Autoclicker' }, { m: 'autoclick', n: 'Autoclicker' },
  { m: 'auto-clicker', n: 'Autoclicker' }, { m: 'opautoclicker', n: 'Autoclicker' }, { m: 'gs auto clicker', n: 'Autoclicker' },
  { m: 'speed autoclicker', n: 'Autoclicker' }, { m: 'free mouse clicker', n: 'Autoclicker' }, { m: 'mouse clicker', n: 'Autoclicker' },
  { m: 'clickermann', n: 'Autoclicker' }, { m: 'fastclicker', n: 'Autoclicker' }, { m: 'jitbit macro', n: 'Grabador de macros' },
  { m: 'macro recorder', n: 'Grabador de macros' }, { m: 'tinytask', n: 'Grabador de macros' }, { m: 'pulover', n: 'Grabador de macros' },
  { m: 'cheat engine', n: 'Cheat Engine' }, { m: 'cheatengine', n: 'Cheat Engine' }, { m: 'extreme injector', n: 'Inyector' },
  { m: 'xenos', n: 'Inyector' }, { m: 'process hacker', n: 'Editor de procesos', s: 'medium' }, { m: 'systeminformer', n: 'Editor de procesos', s: 'medium' },
  { m: 'recaf', n: 'Editor de mods', s: 'medium' }, { m: 'bytecode viewer', n: 'Editor de mods', s: 'medium' },
  { m: 'x-ray', n: 'X-Ray' }, { m: 'xray', n: 'X-Ray' }
];

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const cleanList = (a, n, len) => (Array.isArray(a) ? a : []).slice(0, n).map(x => clip(x, len)).filter(Boolean);

// ---------------------------------------------------------------- datos de la instancia
export function guardDefaults() {
  return { enabled: false, autoKick: false, packsOk: false, webhook: '' };
}
export function sanitizeGuard(p, cur = guardDefaults()) {
  const g = { ...guardDefaults(), ...cur };
  if (!p || typeof p !== 'object') return g;
  if ('enabled' in p) g.enabled = !!p.enabled;
  if ('autoKick' in p) g.autoKick = !!p.autoKick;
  if ('packsOk' in p) g.packsOk = !!p.packsOk;
  if ('webhook' in p) { const w = String(p.webhook || '').trim(); g.webhook = WEBHOOK_RE.test(w) ? w : ''; }
  return g;
}
// Lo que recibe el launcher (sin el webhook: ese no sale nunca del panel)
export const guardManifest = (g) => (g && g.enabled ? { enabled: true, packsOk: !!g.packsOk, programs: PROGRAMS } : null);

// ---------------------------------------------------------------- launcher → panel
function cleanEvent(e) {
  if (!e || !TYPES.includes(e.type)) return null;
  const detail = clip(e.detail, 300).trim();
  if (!detail) return null;
  const data = {
    items: cleanList(e.items, 30, 300),
    mods: cleanList(e.mods, 300, 120),
    process: e.process && typeof e.process === 'object' ? { name: clip(e.process.name, 120), path: clip(e.process.path, 400), hash: clip(e.process.hash, 80) } : null
  };
  return { type: e.type, severity: SEVERITIES.includes(e.severity) ? e.severity : 'medium', detail, data };
}

export async function guardReport(env, ctx, P, b) {
  const play = await env.DB.prepare('SELECT * FROM plays WHERE id = ? AND player_key = ?').bind(String(b.play || ''), P.key).first();
  if (!play) fail(404, 'play', 'Partida no encontrada');
  const row = await env.DB.prepare('SELECT * FROM instances WHERE id = ?').bind(play.instance_id).first();
  const data = row ? JSON.parse(row.data) : null;
  const g = data && data.guard;
  if (!g || !g.enabled) return json({ ok: true, ignored: true });
  const events = (Array.isArray(b.events) ? b.events : []).slice(0, 10).map(cleanEvent).filter(Boolean);
  const t = now();
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM guard_events WHERE play_id = ?').bind(play.id).first();
  let room = MAX_PER_PLAY - (count.n || 0), kick = !!play.kick_reason;
  const saved = [], ids = [];
  const withMedia = await env.DB.prepare('SELECT COUNT(*) AS n FROM guard_events WHERE play_id = ? AND media IS NOT NULL').bind(play.id).first();
  let mediaRoom = MEDIA_PER_PLAY - (withMedia.n || 0);
  for (const e of events) {
    ids.push(null);
    if (room <= 0) continue;
    const same = await env.DB.prepare('SELECT 1 FROM guard_events WHERE play_id = ? AND type = ? AND detail = ? AND created_at > ?').bind(play.id, e.type, e.detail, t - SAME_WAIT).first();
    if (same) continue;
    const autoKick = g.autoKick && e.type === 'program' && e.severity === 'high';
    const id = randomToken(12);
    // foto y vídeo: solo las detecciones que importan y unas pocas por partida
    const media = e.severity !== 'low' && mediaRoom > 0 ? '{}' : null;
    if (media) mediaRoom--;
    await env.DB.prepare(`INSERT INTO guard_events (id, studio_id, instance_id, play_id, player_key, player_name, type, severity, detail, data, status, kicked, media, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`)
      .bind(id, play.studio_id, play.instance_id, play.id, P.key, P.name, e.type, e.severity, e.detail, JSON.stringify(e.data), autoKick ? 1 : 0, media, t).run();
    ids[ids.length - 1] = { id, media: !!media };
    if (autoKick && !kick) {
      kick = true;
      await env.DB.prepare("UPDATE plays SET kick_reason = 'guard' WHERE id = ?").bind(play.id).run();
    }
    saved.push({ ...e, autoKick });
    room--;
  }
  if (saved.length && g.webhook) {
    const send = discord(g.webhook, data.name, P.name, saved).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(send); else await send;
  }
  return json({ ok: true, saved: saved.length, kick, ids });
}

// La foto (JPEG) o el vídeo (WebM) de una detección: el archivo tal cual, con ?play=&event=&kind=shot|video
export async function guardMedia(env, P, req, q) {
  const b = { play: q.get('play'), event: q.get('event'), kind: q.get('kind') };
  const len = Number(req.headers.get('content-length') || 0);
  if (len > VIDEO_MAX) fail(413, 'data', 'Archivo demasiado grande');
  const ev = await env.DB.prepare('SELECT g.id, g.media FROM guard_events g JOIN plays p ON p.id = g.play_id WHERE g.id = ? AND g.play_id = ? AND p.player_key = ?')
    .bind(String(b.event || ''), String(b.play || ''), P.key).first();
  if (!ev) fail(404, 'guard', 'Esa detección no existe');
  if (ev.media == null) fail(403, 'no_media', 'Esta detección no lleva foto ni vídeo');
  const kind = b.kind === 'video' ? 'video' : 'shot';
  const bytes = new Uint8Array(await req.arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8, webm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (kind === 'shot' ? !jpeg || bytes.length > SHOT_MAX : !webm || bytes.length > VIDEO_MAX) fail(400, 'data', 'Archivo no válido');
  let m = {};
  try { m = JSON.parse(ev.media) || {}; } catch { /* nada */ }
  if (m[kind]) fail(409, 'exists', 'Ya está subido');
  await env.MEDIA.put(`guard:${ev.id}:${kind}`, bytes, { expirationTtl: MEDIA_TTL / 1000, metadata: { type: kind === 'shot' ? 'image/jpeg' : 'video/webm' } });
  m[kind] = { size: bytes.length, at: now() };
  await env.DB.prepare('UPDATE guard_events SET media = ? WHERE id = ?').bind(JSON.stringify(m), ev.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- cámaras en directo
// El panel no guarda vídeo de las cámaras: solo la última imagen de cada partida (se borra al acabar).
// ¿Quiere el panel imágenes de esta partida? 'live' (alguien la mira en grande), 'grid' (la página de cámaras abierta) o null
export async function camWanted(env, pl) {
  const t = now();
  const live = await env.DB.prepare('SELECT focus_at FROM guard_live WHERE play_id = ?').bind(pl.id).first();
  if (live && live.focus_at && live.focus_at > t - FOCUS_MS) return 'live';
  const w = await env.DB.prepare('SELECT at FROM guard_watch WHERE studio_id = ?').bind(pl.studio_id).first();
  if (!w || w.at < t - WATCH_MS) return null;
  const row = await env.DB.prepare('SELECT data FROM instances WHERE id = ?').bind(pl.instance_id).first();
  let d = {};
  try { d = JSON.parse(row ? row.data : '{}'); } catch { /* nada */ }
  return d.guard && d.guard.enabled ? 'grid' : null;
}

// El launcher manda una imagen del juego: { play, frame: base64 JPEG | null (no se ve la ventana), hd }
export async function guardFrame(env, P, b) {
  const pl = await env.DB.prepare('SELECT * FROM plays WHERE id = ? AND player_key = ? AND ended_at IS NULL').bind(String(b.play || ''), P.key).first();
  if (!pl) fail(404, 'play', 'Partida no encontrada');
  const cam = await camWanted(env, pl);
  if (!cam) return json({ ok: true, cam: null });
  const frame = b.frame ? String(b.frame) : null;
  if (frame && (frame.length > FRAME_MAX * 1.4 || !frame.startsWith('/9j/'))) fail(400, 'data', 'Imagen no válida'); // «/9j/» = JPEG en base64
  const t = now();
  await env.DB.prepare(`INSERT INTO guard_live (play_id, studio_id, frame, hd, none, at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(play_id) DO UPDATE SET frame = COALESCE(excluded.frame, guard_live.frame), hd = excluded.hd, none = excluded.none, at = excluded.at`)
    .bind(pl.id, pl.studio_id, frame, b.hd ? 1 : 0, frame ? 0 : b.off ? 2 : 1, t).run();
  return json({ ok: true, cam });
}

const TYPE_NAME = { mod: 'Mod', pack: 'Paquete', file: 'Archivo', program: 'Programa' };
const SEV_COLOR = { high: 0xef4444, medium: 0xf59e0b, low: 0x60a5fa };
async function discord(hook, instance, player, events) {
  const embeds = events.slice(0, 10).map(e => ({
    title: `KopiGuard · ${TYPE_NAME[e.type]}${e.autoKick ? ' · expulsado' : ''}`,
    description: clip(e.detail, 300) + (e.data.items.length > 1 ? `\n${e.data.items.slice(1, 6).map(x => '• ' + clip(x, 120)).join('\n')}` : ''),
    color: SEV_COLOR[e.severity],
    fields: [{ name: 'Jugador', value: clip(player, 40), inline: true }, { name: 'Instancia', value: clip(instance, 60), inline: true },
      ...(e.data.process ? [{ name: 'Programa', value: clip(e.data.process.name, 100), inline: true }] : [])],
    timestamp: new Date().toISOString()
  }));
  await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'KopiGuard', allowed_mentions: { parse: [] }, embeds }) });
}

// ---------------------------------------------------------------- studio
const rowOut = (r, names) => ({
  id: r.id, at: r.created_at, instance: r.instance_id, instanceName: names[r.instance_id] || r.instance_id,
  type: r.type, severity: r.severity, player: r.player_name, detail: r.detail, status: r.status, kicked: !!r.kicked,
  extra: (() => { try { const d = JSON.parse(r.data || '{}'); return Math.max(0, (d.items || []).length - 1); } catch { return 0; } })(),
  media: (() => { try { const x = JSON.parse(r.media || 'null'); return x ? { shot: !!x.shot, video: !!x.video, waiting: true } : null; } catch { return null; } })()
});

async function instanceNames(env, studioId) {
  const rows = (await env.DB.prepare('SELECT id, data FROM instances WHERE studio_id = ?').bind(studioId).all()).results;
  const names = {}, guarded = [];
  for (const r of rows) {
    let d = {};
    try { d = JSON.parse(r.data); } catch { /* nada */ }
    names[r.id] = d.name || r.id;
    if (d.guard && d.guard.enabled) guarded.push(r.id);
  }
  return { names, guarded };
}

async function liveApi(c, play, m, need, sub) {
  const { env, studio, user } = c;
  need('editor'); // ver la pantalla de otros: solo quien modera
  const t = now();
  const { names, guarded } = await instanceNames(env, studio.id);
  if (!play) {
    // la página de cámaras: quién está jugando ahora en instancias con KopiGuard
    const w = await env.DB.prepare('SELECT at FROM guard_watch WHERE studio_id = ?').bind(studio.id).first();
    if (!w || w.at < t - 10e3) await env.DB.prepare('INSERT INTO guard_watch (studio_id, at) VALUES (?, ?) ON CONFLICT(studio_id) DO UPDATE SET at = excluded.at').bind(studio.id, t).run();
    const rows = guarded.length ? (await env.DB.prepare(`SELECT p.id, p.instance_id, p.player_name, p.started_at, l.at AS frame_at, l.none, l.hd FROM plays p LEFT JOIN guard_live l ON l.play_id = p.id
      WHERE p.studio_id = ? AND p.ended_at IS NULL AND p.last_seen > ? AND p.instance_id IN (${guarded.map(() => '?').join(',')}) ORDER BY p.started_at DESC LIMIT 200`)
      .bind(studio.id, t - LIVE_MS, ...guarded).all()).results : [];
    return json({
      players: rows.map(r => ({ play: r.id, player: r.player_name, instance: r.instance_id, instanceName: names[r.instance_id] || r.instance_id, startedAt: r.started_at, frameAt: r.frame_at || null, hidden: r.none === 1, off: r.none === 2 })),
      guarded: guarded.length
    });
  }
  const pl = await env.DB.prepare('SELECT * FROM plays WHERE id = ? AND studio_id = ?').bind(str(play, 40), studio.id).first();
  if (!pl) fail(404, 'play', 'Partida no encontrada');
  const live = await env.DB.prepare('SELECT at, none, hd, focus_at, frame FROM guard_live WHERE play_id = ?').bind(pl.id).first();
  if (m === 'GET' && sub === 'img') {
    if (!live || !live.frame) return new Response(null, { status: 404 });
    const bin = Uint8Array.from(atob(live.frame), ch => ch.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
  }
  if (m === 'GET') {
    const playing = !pl.ended_at && pl.last_seen > t - LIVE_MS;
    // mirar en grande: el launcher pasa a mandar imágenes seguidas y más nítidas
    if (playing && (!live || !live.focus_at || live.focus_at < t - 5e3)) {
      await env.DB.prepare('INSERT INTO guard_live (play_id, studio_id, focus_at) VALUES (?, ?, ?) ON CONFLICT(play_id) DO UPDATE SET focus_at = excluded.focus_at').bind(pl.id, studio.id, t).run();
    }
    return json({ play: pl.id, player: pl.player_name, instance: pl.instance_id, instanceName: names[pl.instance_id] || pl.instance_id, startedAt: pl.started_at,
      playing, frameAt: live ? live.at || null : null, hidden: !!(live && live.none === 1), off: !!(live && live.none === 2), hd: !!(live && live.hd) });
  }
  if (m === 'POST') {
    const b = await readJson(c.req);
    if (b.action !== 'kick') fail(400, 'action', 'Acción no válida');
    const r = await env.DB.prepare("UPDATE plays SET kick_reason = 'guard' WHERE id = ? AND ended_at IS NULL AND last_seen > ?").bind(pl.id, t - LIVE_MS).run();
    if (!r.meta || !r.meta.changes) fail(409, 'not_playing', 'Ese jugador no está jugando ahora');
    await audit(env, user, studio.id, 'guard.kick', pl.player_name, { instance: pl.instance_id, play: pl.id });
    return json({ ok: true, kicked: true });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

export async function guardApi(c, id, m, need, sub, extra) {
  const { env, studio, user } = c;
  if (id === 'live') return liveApi(c, sub, m, need, extra);
  if (!id && m === 'GET') {
    const q = c.u.searchParams;
    // filtros: [condición, valores]. El de tipo va aparte: las pestañas cuentan con todos los demás filtros
    const f = [['studio_id = ?', [studio.id]]];
    const type = q.get('type'), status = q.get('status'), sev = q.get('severity'), inst = q.get('instance');
    if (STATUSES.includes(status)) f.push(['status = ?', [status]]);
    if (SEVERITIES.includes(sev)) f.push(['severity = ?', [sev]]);
    if (inst) f.push(['instance_id = ?', [str(inst, 80)]]);
    const text = str(q.get('q'), 60).trim().toLowerCase();
    if (text) f.push(['(player_key LIKE ? OR LOWER(detail) LIKE ?)', [`%${text}%`, `%${text}%`]]);
    const from = int(q.get('from'), 1, 9e15, null), to = int(q.get('to'), 1, 9e15, null), before = int(q.get('before'), 1, 9e15, null);
    if (from) f.push(['created_at >= ?', [from]]);
    if (to) f.push(['created_at <= ?', [to]]);
    const sql = (list) => list.map(x => x[0]).join(' AND ');
    const vals = (list) => list.flatMap(x => x[1]);
    const types = Object.fromEntries((await env.DB.prepare(`SELECT type, COUNT(*) AS n FROM guard_events WHERE ${sql(f)} GROUP BY type`).bind(...vals(f)).all()).results.map(r => [r.type, r.n]));
    const list = [...f];
    if (TYPES.includes(type)) list.push(['type = ?', [type]]);
    if (before) list.push(['created_at < ?', [before]]);
    const rows = (await env.DB.prepare(`SELECT * FROM guard_events WHERE ${sql(list)} ORDER BY created_at DESC LIMIT ${PAGE + 1}`).bind(...vals(list)).all()).results;
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM guard_events WHERE studio_id = ?').bind(studio.id).first();
    const kicks = await env.DB.prepare('SELECT COUNT(*) AS n FROM guard_events WHERE studio_id = ? AND kicked = 1 AND created_at > ?').bind(studio.id, now() - 864e5).first();
    const { names, guarded } = await instanceNames(env, studio.id);
    return json({
      events: rows.slice(0, PAGE).map(r => rowOut(r, names)), more: rows.length > PAGE,
      types, stats: { guarded: guarded.length, total: total.n || 0, kicks24h: kicks.n || 0 },
      instances: Object.entries(names).map(([k, v]) => ({ id: k, name: v, guarded: guarded.includes(k) }))
    });
  }
  const ev = await env.DB.prepare('SELECT * FROM guard_events WHERE id = ? AND studio_id = ?').bind(str(id, 40), studio.id).first();
  if (!ev) fail(404, 'guard', 'Esa detección no existe');
  if (m === 'GET' && (sub === 'shot' || sub === 'video')) {
    const { value, metadata } = await env.MEDIA.getWithMetadata(`guard:${ev.id}:${sub}`, 'arrayBuffer');
    if (!value) fail(404, 'media', 'Ya no está (se borran a los 30 días)');
    return new Response(value, { headers: { 'Content-Type': (metadata && metadata.type) || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' } });
  }
  if (m === 'GET') {
    const { names } = await instanceNames(env, studio.id);
    const others = await env.DB.prepare('SELECT COUNT(*) AS n FROM guard_events WHERE instance_id = ? AND player_key = ? AND id != ?').bind(ev.instance_id, ev.player_key, ev.id).first();
    const live = await env.DB.prepare('SELECT id FROM plays WHERE instance_id = ? AND player_key = ? AND ended_at IS NULL AND last_seen > ?').bind(ev.instance_id, ev.player_key, now() - 90e3).first();
    let data = {};
    try { data = JSON.parse(ev.data || '{}'); } catch { /* nada */ }
    return json({ event: { ...rowOut(ev, names), data, handledBy: ev.handled_by || null, handledAt: ev.handled_at || null, others: others.n || 0, playing: !!live, livePlay: live ? live.id : null } });
  }
  if (m === 'POST') {
    need('editor');
    const b = await readJson(c.req);
    const action = String(b.action || '');
    const t = now();
    if (['reviewed', 'dismissed', 'new'].includes(action)) {
      await env.DB.prepare('UPDATE guard_events SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?').bind(action, user.name, t, ev.id).run();
      return json({ ok: true, status: action });
    }
    if (action === 'sanction') {
      // banear al jugador en esa instancia (y sacarle si está jugando)
      if (!NAME_RE.test(ev.player_name)) fail(400, 'name', 'Nombre de jugador no válido');
      // como un baneo normal: el nombre en minúsculas y fuera de la lista de acceso
      await env.DB.prepare('INSERT OR IGNORE INTO bans (scope, kind, value, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(`instance:${ev.instance_id}`, 'name', ev.player_key, user.id, t).run();
      await env.DB.prepare('DELETE FROM access WHERE instance_id = ? AND player_key = ?').bind(ev.instance_id, ev.player_key).run();
      await env.DB.prepare("UPDATE guard_events SET status = 'sanctioned', handled_by = ?, handled_at = ? WHERE instance_id = ? AND player_key = ? AND status = 'new'").bind(user.name, t, ev.instance_id, ev.player_key).run();
      await env.DB.prepare("UPDATE guard_events SET status = 'sanctioned', handled_by = ?, handled_at = ? WHERE id = ?").bind(user.name, t, ev.id).run();
      await env.DB.prepare("UPDATE plays SET kick_reason = 'ban' WHERE instance_id = ? AND player_key = ? AND ended_at IS NULL").bind(ev.instance_id, ev.player_key).run();
      await audit(env, user, studio.id, 'guard.sanction', ev.player_name, { instance: ev.instance_id, event: ev.id });
      return json({ ok: true, status: 'sanctioned' });
    }
    if (action === 'kick') {
      const r = await env.DB.prepare("UPDATE plays SET kick_reason = 'guard' WHERE instance_id = ? AND player_key = ? AND ended_at IS NULL AND last_seen > ?").bind(ev.instance_id, ev.player_key, t - 90e3).run();
      if (!r.meta || !r.meta.changes) fail(409, 'not_playing', 'Ese jugador no está jugando ahora');
      await env.DB.prepare('UPDATE guard_events SET kicked = 1, handled_by = ?, handled_at = ? WHERE id = ?').bind(user.name, t, ev.id).run();
      await audit(env, user, studio.id, 'guard.kick', ev.player_name, { instance: ev.instance_id, event: ev.id });
      return json({ ok: true, kicked: true });
    }
    fail(400, 'action', 'Acción no válida');
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}
