// Rendimiento por instancia: el launcher manda un resumen de cada partida (cuánto tardó en cargar, cuánta memoria
// usó, qué PC tiene el jugador y si se cerró con un error) y el panel lo junta para decir si la instancia pesa
// demasiado y qué hacer. Minecraft no da los FPS al launcher, así que no se piden.
//   Launcher: POST /api/l/perf { play, loadMs, minutes, memPeakMb, memAvgMb, memAllocMb, mods, perfMode, ramMb, cpu, cores, gpu, os, crash }
//   Panel:    GET /api/s/<studio>/instances/<id>/perf
import { json, fail, now, str, int, readJson } from './util.js';

const DAY = 864e5;
const WINDOW_MS = 30 * DAY;          // se mira el último mes
const PLAY_MAX_AGE = 3 * DAY;        // el resumen tiene que llegar poco después de jugar
const CRASH_KINDS = ['memory', 'heap', 'jvmargs', 'java', 'missing', 'incompatible', 'duplicate', 'corrupt', 'perf', 'mixin', 'driver', 'jvm', 'generic'];
const OS = ['windows', 'mac', 'linux'];

export async function launcherPerf(env, P, req) {
  const b = await readJson(req);
  const pl = await env.DB.prepare('SELECT id, instance_id, studio_id, started_at FROM plays WHERE id = ? AND player_key = ?').bind(str(b.play, 64), P.key).first();
  if (!pl) fail(404, 'play', 'Partida no encontrada');
  if (now() - pl.started_at > PLAY_MAX_AGE) fail(400, 'old', 'Esa partida es muy antigua');
  const crash = b.crash && typeof b.crash === 'object' && CRASH_KINDS.includes(b.crash.kind) ? b.crash : null;
  const row = {
    load_ms: int(b.loadMs, 1000, 30 * 60e3),
    minutes: int(b.minutes, 0, 24 * 60, 0),
    mem_peak: int(b.memPeakMb, 64, 262144),
    mem_avg: int(b.memAvgMb, 64, 262144),
    mem_alloc: int(b.memAllocMb, 256, 262144),
    mods: int(b.mods, 0, 5000, 0),
    perf_mode: b.perfMode ? 1 : 0,
    ram: int(b.ramMb, 256, 4194304),
    cpu: str(b.cpu, 80).trim() || null,
    cores: int(b.cores, 1, 1024),
    gpu: str(b.gpu, 80).trim() || null,
    os: OS.includes(b.os) ? b.os : null,
    crash_kind: crash ? crash.kind : null,
    crash_mod: crash && crash.mod ? str(crash.mod, 60).trim() : null
  };
  await env.DB.prepare(`INSERT OR REPLACE INTO play_perf (play_id, instance_id, studio_id, player_key, at, load_ms, minutes, mem_peak, mem_avg, mem_alloc,
      mods, perf_mode, ram, cpu, cores, gpu, os, crash_kind, crash_mod) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(pl.id, pl.instance_id, pl.studio_id, P.key, now(), row.load_ms, row.minutes, row.mem_peak, row.mem_avg, row.mem_alloc,
      row.mods, row.perf_mode, row.ram, row.cpu, row.cores, row.gpu, row.os, row.crash_kind, row.crash_mod).run();
  return json({ ok: true });
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export function vendor(gpu) {
  const g = String(gpu || '').toLowerCase();
  if (!g) return 'unknown';
  if (/nvidia|geforce|quadro|rtx|gtx/.test(g)) return 'nvidia';
  if (/amd|radeon|ati /.test(g)) return 'amd';
  if (/apple|m1|m2|m3|m4/.test(g)) return 'apple';
  if (/intel|uhd|iris|arc/.test(g)) return 'intel';
  return 'other';
}
export const ramBucket = (mb) => (!mb ? null : mb <= 4608 ? 'r4' : mb <= 8704 ? 'r8' : mb <= 16896 ? 'r16' : 'r32');

// Junta las partidas y decide qué decirle al studio. Se exporta para las pruebas.
export function summarize(rows, t = now()) {
  const n = rows.length;
  const byPlayer = new Map(); // el PC de cada jugador: su última partida
  for (const r of rows) { const p = byPlayer.get(r.player_key); if (!p || r.at > p.at) byPlayer.set(r.player_key, r); }
  const pcs = [...byPlayer.values()];
  const loads = rows.filter(r => r.load_ms).map(r => r.load_ms);
  const peaks = rows.filter(r => r.mem_peak).map(r => r.mem_peak);
  const allocs = rows.filter(r => r.mem_alloc).map(r => r.mem_alloc);
  const crashes = rows.filter(r => r.crash_kind);
  const kinds = {};
  for (const r of crashes) kinds[r.crash_kind] = (kinds[r.crash_kind] || 0) + 1;
  const modMap = new Map();
  for (const r of crashes) if (r.crash_mod && r.crash_kind !== 'driver') { const k = r.crash_mod.toLowerCase(); const e = modMap.get(k) || { mod: r.crash_mod, n: 0 }; e.n++; modMap.set(k, e); }
  const mods = [...modMap.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  const ram = { r4: 0, r8: 0, r16: 0, r32: 0 };
  for (const p of pcs) { const k = ramBucket(p.ram); if (k) ram[k]++; }
  const gpus = { nvidia: 0, amd: 0, intel: 0, apple: 0, other: 0, unknown: 0 };
  for (const p of pcs) gpus[vendor(p.gpu)]++;
  // carga según la RAM del PC: ¿los PCs modestos sufren?
  const loadByRam = {};
  for (const k of Object.keys(ram)) { const l = rows.filter(r => r.load_ms && ramBucket(r.ram) === k).map(r => r.load_ms); if (l.length) loadByRam[k] = { s: Math.round(median(l) / 1000), n: l.length }; }
  const full = rows.filter(r => r.mem_peak && r.ram && r.mem_peak > r.ram * 0.8).length;
  const withMem = rows.filter(r => r.mem_peak && r.ram).length;
  // los últimos 14 días
  const start = Math.floor(t / DAY) * DAY - 13 * DAY;
  const days = Array.from({ length: 14 }, (_, i) => ({ day: start + i * DAY, n: 0, crashes: 0, load: null, _l: [] }));
  for (const r of rows) { const i = Math.floor((r.at - start) / DAY); if (i >= 0 && i < 14) { days[i].n++; if (r.crash_kind) days[i].crashes++; if (r.load_ms) days[i]._l.push(r.load_ms); } }
  for (const d of days) { d.load = d._l.length ? Math.round(median(d._l) / 1000) : null; delete d._l; }

  const load = loads.length ? { median: Math.round(median(loads) / 1000), p90: Math.round(pct(loads, 0.9) / 1000), n: loads.length } : null;
  const mem = peaks.length ? { peak: median(peaks), max: Math.max(...peaks), alloc: median(allocs), n: peaks.length } : null;
  const crashPct = n ? Math.round(crashes.length * 100 / n) : 0;
  const lowPc = pcs.filter(p => p.ram && p.ram <= 8704).length;

  // Consejos: lo más grave primero
  const tips = [];
  const oom = (kinds.memory || 0) + (kinds.heap || 0);
  if (oom >= 2 && oom * 100 / n >= 5) tips.push({ code: 'oom', level: 'bad', vars: { n: oom } });
  if (mods[0] && mods[0].n >= 2) tips.push({ code: 'badmod', level: 'bad', vars: { mod: mods[0].mod, n: mods[0].n } });
  if (n >= 5 && crashPct >= 15) tips.push({ code: 'crashes', level: 'warn', vars: { pct: crashPct } });
  if (load && load.n >= 3 && load.median > 90) tips.push({ code: 'slowload', level: 'warn', vars: { s: load.median } });
  if (withMem >= 4 && full * 100 / withMem >= 25) tips.push({ code: 'pcfull', level: 'warn', vars: { pct: Math.round(full * 100 / withMem) } });
  if (pcs.length >= 3 && lowPc * 100 / pcs.length >= 30 && mem && mem.alloc >= 6144) tips.push({ code: 'lowram', level: 'warn', vars: { pct: Math.round(lowPc * 100 / pcs.length), mb: mem.alloc } });
  if ((kinds.driver || 0) >= 2) tips.push({ code: 'drivers', level: 'warn', vars: { n: kinds.driver } });
  if (!tips.length && n >= 5) tips.push({ code: 'ok', level: 'ok', vars: {} });

  return {
    sessions: n, players: pcs.length, load, mem,
    crashes: { n: crashes.length, pct: crashPct, kinds, mods },
    pcFull: withMem ? Math.round(full * 100 / withMem) : null,
    ram, gpus, loadByRam, days, tips,
    modsInFolder: median(rows.map(r => r.mods).filter(x => x > 0)),
    perfMode: n ? Math.round(rows.filter(r => r.perf_mode).length * 100 / n) : 0
  };
}

export async function instancePerf(env, iid) {
  const rows = (await env.DB.prepare(`SELECT player_key, at, load_ms, mem_peak, mem_alloc, mods, perf_mode, ram, gpu, crash_kind, crash_mod
      FROM play_perf WHERE instance_id = ? AND at > ? ORDER BY at DESC LIMIT 5000`).bind(iid, now() - WINDOW_MS).all()).results;
  return json(summarize(rows));
}
