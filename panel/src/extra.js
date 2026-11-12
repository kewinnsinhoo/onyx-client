// Eventos, histórico, referidos y estado de los servicios.
import { json, fail, now, randomToken, readJson, str, url as cleanUrl, color, int } from './util.js';
import { peaksByDay } from './stats.js';

export const EVENT_CATS = ['Evento', 'Torneo', 'Serie', 'Squid Game', 'Directo', 'Otro'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' };

// ---------------------------------------------------------------- eventos
function cleanEvent(b, cur = {}) {
  const e = { ...cur };
  if ('title' in b) e.title = str(b.title, 80).trim();
  if ('category' in b) e.category = str(b.category, 30).trim() || 'Evento';
  if ('color' in b) e.color = color(b.color, '#8e9bff');
  if ('description' in b) e.description = str(b.description, 1000);
  if ('image' in b) e.image = cleanUrl(b.image);
  if ('instance_id' in b) e.instance_id = b.instance_id ? str(b.instance_id, 80) : null;
  if ('starts_at' in b) e.starts_at = int(b.starts_at, 0, 4e12, null);
  if ('ends_at' in b) e.ends_at = int(b.ends_at, 0, 4e12, null);
  if ('public' in b) e.public = b.public ? 1 : 0;
  return e;
}

export async function eventsApi(c, eid, m) {
  const { env, studio, user } = c;
  if (m === 'GET' && !eid) {
    const from = int(c.u.searchParams.get('from'), 0, 4e12, now() - 40 * 864e5);
    const to = int(c.u.searchParams.get('to'), 0, 4e12, now() + 400 * 864e5);
    const rows = (await env.DB.prepare(`SELECT e.*, i.data AS idata FROM events e LEFT JOIN instances i ON i.id = e.instance_id
      WHERE e.studio_id = ? AND e.deleted_at IS NULL AND e.starts_at < ? AND COALESCE(e.ends_at, e.starts_at) >= ? ORDER BY e.starts_at`).bind(studio.id, to, from).all()).results;
    return json({ events: rows.map(r => ({ ...r, idata: undefined, instance_name: r.idata ? JSON.parse(r.idata).name : null })) });
  }
  c.need('editor');
  if (m === 'POST' && !eid) {
    const e = cleanEvent(await readJson(c.req), { category: 'Evento', color: '#8e9bff', public: 1 });
    if (!e.title) fail(400, 'title', 'Ponle un título al evento');
    if (!e.starts_at) fail(400, 'date', 'Elige cuándo empieza');
    if (e.ends_at && e.ends_at < e.starts_at) fail(400, 'date', 'El final no puede ser antes del inicio');
    if (e.instance_id && !(await env.DB.prepare('SELECT 1 FROM instances WHERE id = ? AND studio_id = ?').bind(e.instance_id, studio.id).first())) e.instance_id = null;
    const id = randomToken(8);
    await env.DB.prepare('INSERT INTO events (id, studio_id, instance_id, title, category, color, description, image, starts_at, ends_at, public, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, studio.id, e.instance_id || null, e.title, e.category, e.color, e.description || '', e.image || null, e.starts_at, e.ends_at || null, e.public, user.id, now()).run();
    return json({ id }, 201);
  }
  const row = await env.DB.prepare('SELECT * FROM events WHERE id = ? AND studio_id = ? AND deleted_at IS NULL').bind(eid, studio.id).first();
  if (!row) fail(404, 'event', 'Evento no encontrado');
  if (m === 'PATCH') {
    const e = cleanEvent(await readJson(c.req), row);
    if (!e.title || !e.starts_at) fail(400, 'event', 'Faltan el título o la fecha');
    if (e.ends_at && e.ends_at < e.starts_at) fail(400, 'date', 'El final no puede ser antes del inicio');
    await env.DB.prepare('UPDATE events SET instance_id = ?, title = ?, category = ?, color = ?, description = ?, image = ?, starts_at = ?, ends_at = ?, public = ? WHERE id = ?')
      .bind(e.instance_id || null, e.title, e.category, e.color, e.description || '', e.image || null, e.starts_at, e.ends_at || null, e.public, eid).run();
    return json({ ok: true });
  }
  if (m === 'DELETE') { await env.DB.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').bind(now(), eid).run(); return json({ ok: true }); }
  fail(405, 'method', 'Método no permitido');
}

// ---------------------------------------------------------------- histórico
export async function history(env, sid) {
  const t = now();
  const since = t - 90 * 864e5;
  const plays = (await env.DB.prepare('SELECT instance_id, player_key, started_at, COALESCE(ended_at, last_seen) AS end_at FROM plays WHERE studio_id = ? AND started_at > ? ORDER BY started_at LIMIT 50000').bind(sid, since).all()).results;
  const names = {};
  for (const r of (await env.DB.prepare('SELECT id, data FROM instances WHERE studio_id = ?').bind(sid).all()).results) names[r.id] = JSON.parse(r.data).name;
  const chart = peaksByDay(plays.filter(p => p.started_at > t - 30 * 864e5), t - 30 * 864e5, t);
  // Picos por día y por instancia
  const byInst = {};
  for (const p of plays) (byInst[p.instance_id] = byInst[p.instance_id] || []).push(p);
  const records = [];
  const bestInstOfDay = {}; // día -> instancia con más gente ese día
  for (const [iid, list] of Object.entries(byInst)) {
    const days = peaksByDayDetailed(list);
    for (const d of days) {
      const k = new Date(d.at).toDateString();
      if (!bestInstOfDay[k] || d.peak > bestInstOfDay[k].peak) bestInstOfDay[k] = { peak: d.peak, name: names[iid] || iid };
    }
    const best = days.reduce((a, b) => (b.peak > a.peak ? b : a), { peak: 0 });
    const activeDays = new Set(list.map(p => Math.floor(p.started_at / 864e5))).size;
    records.push({ instance: names[iid] || iid, peak: best.peak, at: best.at, plays: list.length, days: activeDays });
  }
  // Un día solo aparece una vez: pico de todo el studio
  const dayPeaks = peaksByDayDetailed(plays).map(d => ({ ...d, instance: bestInstOfDay[new Date(d.at).toDateString()]?.name || '' }));
  dayPeaks.sort((a, b) => b.peak - a.peak || b.at - a.at);
  records.sort((a, b) => b.peak - a.peak);
  const players = new Set(plays.map(p => p.player_key)).size;
  return { chart, topDays: dayPeaks.slice(0, 10), records, plays: plays.length, players };
}

// Pico de cada día con la hora en que ocurrió
export function peaksByDayDetailed(plays) {
  const ev = [];
  for (const p of plays) { ev.push([p.started_at, 1]); ev.push([Math.max(p.end_at, p.started_at), -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const days = new Map();
  let cur = 0;
  for (const [ts, d] of ev) {
    cur += d;
    const k = Math.floor(ts / 864e5);
    const best = days.get(k);
    if (d > 0 && (!best || cur > best.peak)) days.set(k, { day: k * 864e5, peak: cur, at: ts });
  }
  return [...days.values()];
}

// ---------------------------------------------------------------- referidos
export async function referrals(env, sid) {
  const t = now();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM referrals WHERE studio_id = ?').bind(sid).first();
  const month = await env.DB.prepare('SELECT COUNT(*) AS n FROM referrals WHERE studio_id = ? AND created_at > ?').bind(sid, t - 30 * 864e5).first();
  const last = (await env.DB.prepare('SELECT player_name, created_at FROM referrals WHERE studio_id = ? ORDER BY created_at DESC LIMIT 30').bind(sid).all()).results;
  const ranking = (await env.DB.prepare('SELECT s.id, s.name, COUNT(r.player_key) AS n FROM studios s LEFT JOIN referrals r ON r.studio_id = s.id WHERE s.deleted_at IS NULL GROUP BY s.id ORDER BY n DESC LIMIT 20').all()).results;
  return { total: total.n || 0, month: month.n || 0, last, ranking };
}

export async function addReferral(env, P, studioId) {
  const st = await env.DB.prepare('SELECT id, name FROM studios WHERE id = ? AND deleted_at IS NULL').bind(String(studioId || '').trim().toLowerCase()).first();
  if (!st) fail(404, 'studio', 'Studio no encontrado');
  await env.DB.prepare('INSERT OR IGNORE INTO referrals (player_key, player_name, studio_id, created_at) VALUES (?, ?, ?, ?)').bind(P.key, P.name, st.id, now()).run();
  const cur = await env.DB.prepare('SELECT studio_id FROM referrals WHERE player_key = ?').bind(P.key).first();
  return json({ ok: true, studio: cur ? cur.studio_id : st.id, name: st.name, already: !!cur && cur.studio_id !== st.id });
}

// ---------------------------------------------------------------- público (web y calendario)
export async function publicApi(req, env, u, parts, m) {
  if (m === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
  if (parts[0] === 'events') {
    const from = int(u.searchParams.get('from'), 0, 4e12, now() - 40 * 864e5);
    const to = int(u.searchParams.get('to'), 0, 4e12, now() + 400 * 864e5);
    const rows = (await env.DB.prepare(`SELECT e.id, e.title, e.category, e.color, e.description, e.image, e.starts_at, e.ends_at, s.id AS studio_id, s.name AS studio, s.logo AS studio_logo, i.data AS idata
      FROM events e JOIN studios s ON s.id = e.studio_id LEFT JOIN instances i ON i.id = e.instance_id AND i.deleted_at IS NULL
      WHERE e.deleted_at IS NULL AND e.public = 1 AND s.deleted_at IS NULL AND e.starts_at < ? AND COALESCE(e.ends_at, e.starts_at) >= ? ORDER BY e.starts_at LIMIT 500`).bind(to, from).all()).results;
    const origin = env.PUBLIC_URL || u.origin;
    const abs = (x) => (x && x.startsWith('/m/') ? origin + x : x);
    return json({ events: rows.map(r => ({ ...r, image: abs(r.image), studio_logo: abs(r.studio_logo), idata: undefined, instance: r.idata ? JSON.parse(r.idata).name : null })) }, 200, CORS);
  }
  if (parts[0] === 'studios') {
    const rows = (await env.DB.prepare('SELECT id, name, logo FROM studios WHERE deleted_at IS NULL ORDER BY name').all()).results;
    const origin = env.PUBLIC_URL || u.origin;
    return json({ studios: rows.map(r => ({ ...r, code: r.id.toUpperCase(), logo: r.logo && r.logo.startsWith('/m/') ? origin + r.logo : r.logo })) }, 200, CORS);
  }
  if (parts[0] === 'status') return json(await statusSummary(env), 200, CORS);
  if (parts[0] === 'referrals') {
    const since = u.searchParams.get('period') === 'month' ? now() - 30 * 864e5 : 0;
    const rows = (await env.DB.prepare(`SELECT s.id, s.name, s.logo, COUNT(r.player_key) AS players FROM studios s
      LEFT JOIN referrals r ON r.studio_id = s.id AND r.created_at > ? WHERE s.deleted_at IS NULL GROUP BY s.id ORDER BY players DESC, s.name LIMIT 100`).bind(since).all()).results;
    const origin = env.PUBLIC_URL || u.origin;
    return json({ studios: rows.map(r => ({ ...r, code: r.id.toUpperCase(), logo: r.logo && r.logo.startsWith('/m/') ? origin + r.logo : r.logo })) }, 200, CORS);
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

// ---------------------------------------------------------------- estado de los servicios
export const SERVICES = [
  { id: 'web', name: 'Página web', url: 'https://onyxclient.site/' },
  { id: 'panel', name: 'Panel y API', url: null },
  { id: 'launcher', name: 'Descargas del launcher', url: 'https://api.github.com/repos/kewinnsinhoo/onyx-client/releases/latest' },
  { id: 'calendar', name: 'Calendario', url: null }
];

export async function runChecks(env, fetcher = fetch) {
  const t = now();
  for (const s of SERVICES) {
    let ok = 1, ms = 0;
    if (s.url) {
      const t0 = Date.now();
      try {
        const r = await fetcher(s.url, { headers: { 'User-Agent': 'OnyxStatus/1.0' }, signal: AbortSignal.timeout(10000) });
        ok = r.ok ? 1 : 0;
      } catch { ok = 0; }
      ms = Date.now() - t0;
    } else {
      // El panel y el calendario son este mismo servidor: si la comprobación corre, funcionan (y la base de datos responde)
      try { await env.DB.prepare('SELECT 1').first(); } catch { ok = 0; }
    }
    await env.DB.prepare('INSERT INTO status_checks (service, at, ok, ms) VALUES (?, ?, ?, ?)').bind(s.id, t, ok, ms).run();
  }
  await env.DB.prepare('DELETE FROM status_checks WHERE at < ?').bind(t - 91 * 864e5).run();
}

export async function statusSummary(env) {
  const t = now();
  const since = t - 90 * 864e5;
  const rows = (await env.DB.prepare('SELECT service, at, ok FROM status_checks WHERE at > ? ORDER BY at').bind(since).all()).results;
  const DAY = 864e5;
  const start = Math.floor(since / DAY) * DAY;
  const services = SERVICES.map(s => {
    const mine = rows.filter(r => r.service === s.id);
    const days = [];
    for (let d = start; d <= t; d += DAY) days.push({ day: d, checks: 0, fails: 0 });
    for (const r of mine) { const i = Math.floor((r.at - start) / DAY); if (days[i]) { days[i].checks++; if (!r.ok) days[i].fails++; } }
    const total = mine.length, okN = mine.filter(r => r.ok).length;
    const last = mine[mine.length - 1];
    return { id: s.id, name: s.name, up: last ? !!last.ok : null, lastCheck: last ? last.at : null, uptime: total ? Math.round((okN / total) * 10000) / 100 : null, days: days.slice(-90) };
  });
  return { services, allUp: services.every(s => s.up !== false), checkedAt: t };
}
