// Ficha del jugador (panel del studio): buscas un nombre y ves todo junto, solo de las instancias de tu studio.
//   GET /players?q=…          → lista (los más recientes, o los que empiezan por «q»)
//   GET /players/<nombre>     → la ficha: horas, sesiones, instancias, actividad de 30 días, insignias,
//                               detecciones de KopiGuard, baneos, directos y si está jugando ahora.
import { json, fail, now, str, playerKey, NAME_RE } from './util.js';
import { badgesOf } from './badges.js';
import { urlOf } from './streams.js';

const ACTIVE_MS = 90e3, DAY = 864e5, H = 36e5;
// Una partida «colgada» (sin final) no cuenta más de 24 horas
const DUR = `MAX(0, MIN(COALESCE(ended_at, last_seen), started_at + ${24 * H}) - started_at)`;

const instName = (data, id) => { try { return JSON.parse(data).name || id; } catch { return id; } };

export async function studioPlayers(c, name, m) {
  const { env, studio } = c;
  if (m !== 'GET') fail(405, 'method', 'Método no permitido');
  const t = now();

  // ------------------------------------------------ lista
  if (!name) {
    const q = str(c.u.searchParams.get('q'), 16).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const rows = (await env.DB.prepare(`SELECT player_key AS k,
        (SELECT p2.player_name FROM plays p2 WHERE p2.player_key = plays.player_key AND p2.studio_id = plays.studio_id ORDER BY p2.started_at DESC LIMIT 1) AS name,
        SUM(${DUR}) AS ms, COUNT(*) AS sessions, COUNT(DISTINCT instance_id) AS instances, MAX(last_seen) AS last,
        MAX(CASE WHEN ended_at IS NULL AND last_seen > ? THEN 1 ELSE 0 END) AS online
      FROM plays WHERE studio_id = ? ${q ? 'AND player_key LIKE ?' : ''} GROUP BY player_key ORDER BY online DESC, last DESC LIMIT 60`)
      .bind(...[t - ACTIVE_MS, studio.id, ...(q ? [q + '%'] : [])]).all()).results;
    const total = await env.DB.prepare('SELECT COUNT(DISTINCT player_key) AS n FROM plays WHERE studio_id = ?').bind(studio.id).first();
    return json({ players: rows.map(r => ({ name: r.name || r.k, hours: Math.round(r.ms / H * 10) / 10, sessions: r.sessions, instances: r.instances, last: r.last, online: !!r.online })), total: total.n });
  }

  // ------------------------------------------------ ficha
  if (!NAME_RE.test(name)) fail(400, 'name', 'Nombre de jugador no válido');
  const key = playerKey(name);
  const plays = (await env.DB.prepare(`SELECT p.instance_id, p.player_name, p.started_at, p.last_seen, p.ended_at, p.kick_reason, ${DUR} AS ms
      FROM plays p WHERE p.player_key = ? AND p.studio_id = ? ORDER BY p.started_at DESC LIMIT 5000`).bind(key, studio.id).all()).results;
  const insts = (await env.DB.prepare('SELECT id, data, deleted_at FROM instances WHERE studio_id = ?').bind(studio.id).all()).results;
  const iname = Object.fromEntries(insts.map(r => [r.id, instName(r.data, r.id)]));
  const staffOf = insts.filter(r => { try { return !r.deleted_at && (JSON.parse(r.data).access?.staff || []).map(s => String(s).toLowerCase()).includes(key); } catch { return false; } }).map(r => iname[r.id]);

  const [guard, bans, chans, ref] = await Promise.all([
    env.DB.prepare(`SELECT id, instance_id, type, severity, detail, status, kicked, created_at, media FROM guard_events WHERE studio_id = ? AND player_key = ? ORDER BY created_at DESC LIMIT 200`).bind(studio.id, key).all(),
    env.DB.prepare(`SELECT scope, created_at FROM bans WHERE kind = 'name' AND value = ? AND (scope = ? OR scope IN (SELECT 'instance:' || id FROM instances WHERE studio_id = ?))`).bind(key, 'studio:' + studio.id, studio.id).all(),
    env.DB.prepare('SELECT platform, handle, live, manual_until, viewers FROM channels WHERE owner = ?').bind(key).all(),
    env.DB.prepare('SELECT 1 FROM referrals WHERE player_key = ? AND studio_id = ?').bind(key, studio.id).first()
  ]);
  if (!plays.length && !guard.results.length && !bans.results.length) fail(404, 'player', 'Este jugador no ha jugado nunca a vuestras instancias');

  const shown = (plays[0] && plays[0].player_name) || (guard.results[0] && guard.results[0].player_name) || name;
  const online = plays.find(p => !p.ended_at && p.last_seen > t - ACTIVE_MS);
  // por instancia
  const per = {};
  for (const p of plays) {
    const o = per[p.instance_id] || (per[p.instance_id] = { id: p.instance_id, name: iname[p.instance_id] || p.instance_id, ms: 0, sessions: 0, last: 0, first: Infinity });
    o.ms += p.ms; o.sessions++; o.last = Math.max(o.last, p.last_seen); o.first = Math.min(o.first, p.started_at);
  }
  // horas por día, últimos 30 días (UTC)
  const today = Math.floor(t / DAY);
  const days = Array.from({ length: 30 }, (_, i) => ({ day: (today - 29 + i) * DAY, ms: 0 }));
  for (const p of plays) {
    const s = p.started_at, e = s + p.ms;
    for (let d = Math.max(Math.floor(s / DAY), today - 29); d <= Math.min(Math.floor(e / DAY), today); d++) {
      days[d - (today - 29)].ms += Math.max(0, Math.min(e, (d + 1) * DAY) - Math.max(s, d * DAY));
    }
  }
  const totalMs = plays.reduce((a, p) => a + p.ms, 0);
  // insignias: las de Kopi y las de este studio (no las de otros studios)
  let badges = [];
  try {
    const b = await badgesOf(env, key, { tz: 0 });
    badges = b.badges.filter(x => x.earned && (!(x.custom || x.cat === 'event') || x.studio === studio.name))
      .map(x => ({ id: x.id, name: x.name, desc: x.desc, icon: x.icon, rarity: x.rarity, color: x.color || null, cat: x.cat, custom: !!x.custom, at: x.at, earned: true }));
  } catch { /* sin insignias */ }
  const g = guard.results;
  return json({
    name: shown, key,
    online: online ? { instance: iname[online.instance_id] || online.instance_id, instanceId: online.instance_id, since: online.started_at } : null,
    stats: {
      hours: Math.round(totalMs / H * 10) / 10, sessions: plays.length, avgMin: plays.length ? Math.round(totalMs / plays.length / 6e4) : 0,
      first: plays.length ? plays[plays.length - 1].started_at : null, last: plays.length ? Math.max(...plays.map(p => p.last_seen)) : null,
      kicks: plays.filter(p => p.kick_reason).length
    },
    instances: Object.values(per).map(o => ({ ...o, hours: Math.round(o.ms / H * 10) / 10 })).sort((a, b) => b.last - a.last),
    days: days.map(d => ({ day: d.day, hours: Math.round(d.ms / H * 10) / 10 })),
    guard: {
      total: g.length,
      byStatus: g.reduce((o, e) => (o[e.status] = (o[e.status] || 0) + 1, o), {}),
      high: g.filter(e => e.severity === 'high').length,
      recent: g.slice(0, 8).map(e => ({ id: e.id, instance: iname[e.instance_id] || e.instance_id, type: e.type, severity: e.severity, detail: e.detail, status: e.status, kicked: !!e.kicked, at: e.created_at, media: e.media ? JSON.parse(e.media) : null }))
    },
    bans: bans.results.map(b => ({ scope: b.scope.startsWith('studio:') ? 'studio' : 'instance', instance: b.scope.startsWith('instance:') ? iname[b.scope.slice(9)] || b.scope.slice(9) : null, at: b.created_at })),
    staff: staffOf,
    referral: !!ref,
    badges,
    channels: chans.results.map(ch => ({ platform: ch.platform, handle: ch.handle, url: urlOf(ch.platform, ch.handle), live: !!online && !!(ch.live || (ch.manual_until && ch.manual_until > t)), viewers: ch.viewers ?? null }))
  });
}
