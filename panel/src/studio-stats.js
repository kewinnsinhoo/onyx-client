// Estadísticas de un studio: cuánta gente juega, cuándo, cuánto tiempo, cuántos vuelven y quién más juega.
// Todo sale de la tabla plays (una fila por partida). Los días y las horas van en la hora del que mira
// (tz = minutos de diferencia con UTC, como Date.getTimezoneOffset()).
import { json, now } from './util.js';

const DAY = 864e5, HOUR = 36e5;
const MAX_SESSION = 24 * HOUR; // una partida «abierta» de más de un día es un error: se corta
const RANGES = [7, 30, 90];

// Parte una partida en trozos por hora local → minutos en cada (día de la semana, hora)
function addHours(heat, start, end, tzMs) {
  let t = start;
  while (t < end) {
    const local = t - tzMs;
    const nextHour = Math.floor(local / HOUR) * HOUR + HOUR + tzMs;
    const stop = Math.min(end, nextHour);
    const wd = (Math.floor(local / DAY) + 4) % 7; // 0 = domingo (el 1/1/1970 fue jueves)
    const h = Math.floor((local % DAY + DAY) % DAY / HOUR);
    heat[wd][h] += stop - t;
    t = stop;
  }
}

export function computeStats(rows, firstSeen, { days, nowMs, tz, names }) {
  const tzMs = tz * 60e3;
  const todayStart = Math.floor((nowMs - tzMs) / DAY) * DAY + tzMs; // medianoche local de hoy
  const from = todayStart - (days - 1) * DAY, to = nowMs;
  const pFrom = from - days * DAY; // el periodo anterior, del mismo largo, para comparar
  const S = rows.map(r => {
    const start = r.started_at, end = Math.min(Math.max(r.end_at, start), start + MAX_SESSION, nowMs);
    return { inst: r.instance_id, key: r.player_key, name: r.player_name, start, end };
  });
  const overlap = (s, a, b) => Math.max(0, Math.min(s.end, b) - Math.max(s.start, a));

  function period(a, b) {
    const inP = S.filter(s => overlap(s, a, b) > 0 || (s.start >= a && s.start < b));
    const started = S.filter(s => s.start >= a && s.start < b);
    const players = new Set(inP.map(s => s.key));
    const ms = inP.reduce((n, s) => n + overlap(s, a, b), 0);
    const fresh = [...players].filter(k => firstSeen[k] >= a && firstSeen[k] < b);
    return { players, plays: started.length, hours: ms / HOUR, avgMin: started.length ? started.reduce((n, s) => n + (s.end - s.start), 0) / started.length / 60e3 : 0, fresh: fresh.length };
  }
  const cur = period(from, to), prev = period(pFrom, from);
  // De los que jugaron el periodo anterior, cuántos han vuelto en este
  const back = [...prev.players].filter(k => cur.players.has(k)).length;
  const returning = prev.players.size ? Math.round(back / prev.players.size * 100) : null;

  // Día a día
  const daily = [];
  for (let i = 0; i < days; i++) {
    const a = from + i * DAY, b = Math.min(a + DAY, to);
    const list = S.filter(s => overlap(s, a, b) > 0);
    const keys = new Set(list.map(s => s.key));
    daily.push({
      day: a, players: keys.size,
      fresh: [...keys].filter(k => firstSeen[k] >= a && firstSeen[k] < a + DAY).length,
      hours: Math.round(list.reduce((n, s) => n + overlap(s, a, b), 0) / HOUR * 10) / 10
    });
  }

  // Mapa de calor: jugadores a la vez de media en cada hora de cada día de la semana
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const s of S) { const a = Math.max(s.start, from), b = Math.min(s.end, to); if (b > a) addHours(heat, a, b, tzMs); }
  const seen = Array.from({ length: 7 }, () => new Array(24).fill(0)); // cuántas veces hubo esa hora en el periodo
  for (let t = from; t < to; t += HOUR) { const l = t - tzMs; seen[(Math.floor(l / DAY) + 4) % 7][Math.floor((l % DAY + DAY) % DAY / HOUR)]++; }
  const heatAvg = heat.map((row, wd) => row.map((ms, h) => seen[wd][h] ? Math.round(ms / HOUR / seen[wd][h] * 10) / 10 : 0));
  let best = { wd: 0, h: 0, v: 0 };
  heatAvg.forEach((row, wd) => row.forEach((v, h) => { if (v > best.v) best = { wd, h, v }; }));

  // Quién juega más
  const per = new Map();
  for (const s of S) {
    const ms = overlap(s, from, to);
    if (!ms && !(s.start >= from && s.start < to)) continue;
    const p = per.get(s.key) || { name: s.name, ms: 0, plays: 0, last: 0, days: new Set() };
    p.ms += ms; if (s.start >= from) p.plays++; p.last = Math.max(p.last, s.end); p.name = s.name;
    p.days.add(Math.floor((s.start - tzMs) / DAY));
    per.set(s.key, p);
  }
  const top = [...per.values()].sort((a, b) => b.ms - a.ms).slice(0, 10)
    .map(p => ({ name: p.name, hours: Math.round(p.ms / HOUR * 10) / 10, plays: p.plays, days: p.days.size, last: p.last }));

  // Por instancia
  const byI = new Map();
  for (const s of S) {
    const ms = overlap(s, from, to);
    if (!ms) continue;
    const x = byI.get(s.inst) || { id: s.inst, name: names[s.inst] || s.inst, ms: 0, players: new Set(), plays: 0 };
    x.ms += ms; x.players.add(s.key); if (s.start >= from) x.plays++;
    byI.set(s.inst, x);
  }
  const instances = [...byI.values()].sort((a, b) => b.ms - a.ms)
    .map(x => ({ id: x.id, name: x.name, hours: Math.round(x.ms / HOUR * 10) / 10, players: x.players.size, plays: x.plays }));

  const k = (p) => ({ players: p.players.size, plays: p.plays, hours: Math.round(p.hours * 10) / 10, avgMin: Math.round(p.avgMin), fresh: p.fresh });
  return { days, from, to, now: k(cur), prev: k(prev), returning, back, prevPlayers: prev.players.size, daily, heat: heatAvg, best: best.v ? best : null, top, instances };
}

export async function statsApi(c) {
  const { env, studio, u } = c;
  const q = u.searchParams;
  const days = RANGES.includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const tz = Math.max(-840, Math.min(840, Math.round(Number(q.get('tz')) || 0)));
  const inst = String(q.get('instance') || '').slice(0, 60);
  const t = now();
  const since = t - (days * 2 + 1) * DAY - MAX_SESSION;
  const names = {};
  for (const r of (await env.DB.prepare('SELECT id, data FROM instances WHERE studio_id = ? AND deleted_at IS NULL').bind(studio.id).all()).results) {
    try { names[r.id] = JSON.parse(r.data).name; } catch { names[r.id] = r.id; }
  }
  const where = inst ? 'studio_id = ? AND instance_id = ?' : 'studio_id = ?';
  const args = inst ? [studio.id, inst] : [studio.id];
  const rows = (await env.DB.prepare(`SELECT instance_id, player_key, player_name, started_at, COALESCE(ended_at, last_seen) AS end_at FROM plays WHERE ${where} AND started_at > ? ORDER BY started_at LIMIT 100000`)
    .bind(...args, since).all()).results;
  // Cuándo jugó cada uno por primera vez (para saber quién es nuevo)
  const firstSeen = {};
  for (const r of (await env.DB.prepare(`SELECT player_key, MIN(started_at) AS f FROM plays WHERE ${where} GROUP BY player_key`).bind(...args).all()).results) firstSeen[r.player_key] = r.f;
  const out = computeStats(rows, firstSeen, { days, nowMs: t, tz, names });
  return json({ ...out, instance: inst || null, list: Object.entries(names).map(([id, name]) => ({ id, name })) });
}
