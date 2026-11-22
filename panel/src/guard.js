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

export const TYPES = ['mod', 'pack', 'file', 'program', 'move', 'combat']; // move y combat: los manda el plugin del servidor
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
  const ev = await env.DB.prepare(`SELECT g.id, g.media, g.type, g.severity, g.detail, p.player_name, p.instance_id FROM guard_events g JOIN plays p ON p.id = g.play_id
      WHERE g.id = ? AND g.play_id = ? AND p.player_key = ?`)
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
  // También al canal de Discord del studio (si puso webhook): la foto se ve en grande y el vídeo se reproduce allí
  try {
    const row = await env.DB.prepare('SELECT data FROM instances WHERE id = ?').bind(ev.instance_id).first();
    const data = row ? JSON.parse(row.data || '{}') : {};
    const hook = data.guard && WEBHOOK_RE.test(String(data.guard.webhook || '')) ? data.guard.webhook : '';
    if (hook) await discordMedia(hook, data.name || ev.instance_id, ev, kind, bytes);
  } catch { /* Discord no es imprescindible */ }
  return json({ ok: true });
}

// Foto o vídeo de una detección al canal de Discord (como archivo adjunto)
async function discordMedia(hook, instance, ev, kind, bytes) {
  const file = kind === 'shot' ? 'deteccion.jpg' : 'deteccion.webm';
  const title = `KopiGuard · ${TYPE_NAME[ev.type] || 'Detección'} · ${kind === 'shot' ? 'foto' : 'vídeo'}`;
  const payload = {
    username: 'KopiGuard', allowed_mentions: { parse: [] },
    embeds: [{
      title, description: clip(ev.detail || '', 200), color: SEV_COLOR[ev.severity] || 0x60a5fa,
      fields: [{ name: 'Jugador', value: clip(ev.player_name || '?', 40), inline: true }, { name: 'Instancia', value: clip(instance, 60), inline: true }],
      ...(kind === 'shot' ? { image: { url: `attachment://${file}` } } : {}),
      timestamp: new Date().toISOString()
    }]
  };
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([bytes], { type: kind === 'shot' ? 'image/jpeg' : 'video/webm' }), file);
  await fetch(hook, { method: 'POST', body: form });
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

// ---------------------------------------------------------------- cámaras en vídeo (WebRTC)
// El navegador del staff propone (offer), el launcher contesta (answer) y el vídeo va directo entre los dos,
// a 30 imágenes por segundo. Si no se pueden conectar, siguen las imágenes de siempre.
const RTC_TTL = 60e3;          // una propuesta sin contestar caduca al minuto
const SDP_MAX = 20000;
const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

// Servidores para conectar. Con TURN de Cloudflare (TURN_KEY_ID y TURN_KEY_TOKEN) conecta incluso tras routers difíciles.
export async function iceServers(env) {
  if (env.TURN_KEY_ID && env.TURN_KEY_TOKEN) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 })
      });
      if (r.ok) { const j = await r.json(); const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : []; if (list.length) return [...STUN, ...list]; }
    } catch { /* solo STUN */ }
  }
  return STUN;
}

// Propuestas nuevas para esta partida (se marcan como recogidas). Las recoge el launcher en el latido o al mandar imagen.
export async function rtcPending(env, playId) {
  const rows = (await env.DB.prepare("SELECT id, offer FROM guard_rtc WHERE play_id = ? AND state = 'new' AND created_at > ? LIMIT 4").bind(playId, now() - RTC_TTL).all()).results;
  if (!rows.length) return null;
  await env.DB.prepare(`UPDATE guard_rtc SET state = 'taken', updated_at = ? WHERE id IN (${rows.map(() => '?').join(',')})`).bind(now(), ...rows.map(r => r.id)).run();
  const ice = await iceServers(env);
  return rows.map(r => ({ id: r.id, offer: r.offer, ice }));
}

// El launcher contesta: { play, id, answer (SDP) | null }
export async function guardRtcAnswer(env, P, b) {
  const pl = await env.DB.prepare('SELECT id FROM plays WHERE id = ? AND player_key = ? AND ended_at IS NULL').bind(str(b.play, 40), P.key).first();
  if (!pl) fail(404, 'play', 'Partida no encontrada');
  const answer = b.answer ? String(b.answer) : null;
  if (answer && (answer.length > SDP_MAX || !answer.startsWith('v=0'))) fail(400, 'data', 'Respuesta no válida');
  const r = await env.DB.prepare("UPDATE guard_rtc SET answer = ?, state = ?, updated_at = ? WHERE id = ? AND play_id = ? AND state IN ('new', 'taken')")
    .bind(answer, answer ? 'answered' : 'failed', now(), str(b.id, 40), pl.id).run();
  if (!r.meta || !r.meta.changes) fail(404, 'rtc', 'Esa conexión ya no existe');
  return json({ ok: true });
}

// El launcher manda una imagen del juego: { play, frame: base64 JPEG | null (no se ve la ventana), hd }
export async function guardFrame(env, P, b) {
  const pl = await env.DB.prepare('SELECT * FROM plays WHERE id = ? AND player_key = ? AND ended_at IS NULL').bind(String(b.play || ''), P.key).first();
  if (!pl) fail(404, 'play', 'Partida no encontrada');
  const cam = await camWanted(env, pl);
  if (!cam) return json({ ok: true, cam: null });
  const rtc = await rtcPending(env, pl.id);
  const frame = b.frame ? String(b.frame) : null;
  if (frame && (frame.length > FRAME_MAX * 1.4 || !frame.startsWith('/9j/'))) fail(400, 'data', 'Imagen no válida'); // «/9j/» = JPEG en base64
  const t = now();
  // Ahorro de escrituras: en la cuadrícula basta una imagen cada 12 s; mirando en grande (si el vídeo no conecta), 1 por segundo
  await env.DB.prepare(`INSERT INTO guard_live (play_id, studio_id, frame, hd, none, at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(play_id) DO UPDATE SET frame = COALESCE(excluded.frame, guard_live.frame), hd = excluded.hd, none = excluded.none, at = excluded.at
    WHERE guard_live.at IS NULL OR guard_live.at < ? OR guard_live.none IS NOT excluded.none`) // minimizar o volver se guarda al momento
    .bind(pl.id, pl.studio_id, frame, b.hd ? 1 : 0, frame ? 0 : b.off ? 2 : 1, t, t - (cam === 'live' ? 900 : 12e3)).run();
  return json({ ok: true, cam, ...(rtc ? { rtc } : {}) });
}

const TYPE_NAME = { mod: 'Mod', pack: 'Paquete', file: 'Archivo', program: 'Programa', move: 'Movimiento', combat: 'Combate' };
const SEV_COLOR = { high: 0xef4444, medium: 0xf59e0b, low: 0x60a5fa };
async function discord(hook, instance, player, events) {
  const embeds = events.slice(0, 10).map(e => ({
    title: `KopiGuard · ${TYPE_NAME[e.type]}${e.autoKick ? ' · expulsado' : ''}`,
    description: clip(e.detail, 300) + ((e.data.items || []).length > 1 ? `\n${e.data.items.slice(1, 6).map(x => '• ' + clip(x, 120)).join('\n')}` : ''),
    color: SEV_COLOR[e.severity],
    fields: [{ name: 'Jugador', value: clip(player, 40), inline: true }, { name: 'Instancia', value: clip(instance, 60), inline: true },
      ...(e.data.process ? [{ name: 'Programa', value: clip(e.data.process.name, 100), inline: true }] : [])],
    timestamp: new Date().toISOString()
  }));
  await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'KopiGuard', allowed_mentions: { parse: [] }, embeds }) });
}

// ---------------------------------------------------------------- studio
// ---------------------------------------------------------------- plugin del servidor → panel
// POST /api/srv/guard  { key, player, uuid, check, detail, severity, data: { vl, ping, tps, world, x, y, z } }
// El plugin (Paper/Purpur/Arclight) vigila movimiento y combate. Si el jugador juega con Kopi Client,
// la detección va a su partida y el launcher manda foto y vídeo del momento.
const SRV_CHECKS = { fly: 'move', speed: 'move', reach: 'combat', cps: 'combat', aura: 'combat' };
const SRV_PER_HOUR = 300;
export async function serverReport(env, ctx, b) {
  const key = String(b.key || '');
  const k = /^kg_[A-Za-z0-9_-]{20,64}$/.test(key) ? await env.DB.prepare('SELECT * FROM guard_keys WHERE key = ?').bind(key).first() : null;
  if (!k) fail(401, 'key', 'Clave del servidor no válida');
  const row = await env.DB.prepare('SELECT * FROM instances WHERE id = ? AND deleted_at IS NULL').bind(k.instance_id).first();
  const data = row ? JSON.parse(row.data) : null;
  const g = data && data.guard;
  const t = now();
  if (!k.used_at || k.used_at < t - 60e3) await env.DB.prepare('UPDATE guard_keys SET used_at = ? WHERE key = ?').bind(t, key).run();
  if (!g || !g.enabled) return json({ ok: true, ignored: 'off' });
  if (b.ping) return json({ ok: true, instance: data.name }); // /kopiguard test
  const type = SRV_CHECKS[b.check];
  const name = clip(b.player, 16).trim();
  if (!type || !/^[A-Za-z0-9_]{2,16}$/.test(name)) fail(400, 'data', 'Aviso no válido');
  const detail = clip(b.detail, 300).trim();
  if (!detail) fail(400, 'data', 'Aviso no válido');
  const severity = SEVERITIES.includes(b.severity) ? b.severity : 'medium';
  const pkey = name.toLowerCase();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM guard_events WHERE instance_id = ? AND created_at > ? AND type IN ('move', 'combat')").bind(k.instance_id, t - 3600e3).first();
  if ((recent.n || 0) >= SRV_PER_HOUR) return json({ ok: true, ignored: 'limit' });
  const same = await env.DB.prepare('SELECT 1 FROM guard_events WHERE instance_id = ? AND player_key = ? AND type = ? AND detail = ? AND created_at > ?').bind(k.instance_id, pkey, type, detail, t - 120e3).first();
  if (same) return json({ ok: true, ignored: 'same' });
  // ¿Está jugando con Kopi Client ahora mismo? Entonces la detección es de su partida
  const play = await env.DB.prepare('SELECT * FROM plays WHERE instance_id = ? AND player_key = ? AND ended_at IS NULL AND last_seen > ? ORDER BY started_at DESC LIMIT 1').bind(k.instance_id, pkey, t - 90e3).first();
  let media = null;
  if (play && severity !== 'low') {
    const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM guard_events WHERE play_id = ? AND media IS NOT NULL').bind(play.id).first();
    if ((used.n || 0) < 6) media = '{}';
  }
  const d = b.data && typeof b.data === 'object' ? b.data : {};
  const num = (v, dig = 2) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 10 ** dig) / 10 ** dig : null;
  const extra = { server: { check: String(b.check), vl: num(d.vl, 1), ping: num(d.ping, 0), tps: num(d.tps, 1), world: clip(d.world, 60), x: num(d.x, 1), y: num(d.y, 1), z: num(d.z, 1), info: clip(d.info, 200) }, kopi: !!play };
  const id = randomToken(12);
  await env.DB.prepare(`INSERT INTO guard_events (id, studio_id, instance_id, play_id, player_key, player_name, type, severity, detail, data, status, kicked, media, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 0, ?, ?)`)
    .bind(id, k.studio_id, k.instance_id, play ? play.id : null, pkey, play ? play.player_name : name, type, severity, detail, JSON.stringify(extra), media, t).run();
  if (media) await env.DB.prepare('UPDATE plays SET snap = ? WHERE id = ?').bind(id, play.id).run(); // el siguiente latido pide la foto
  if (g.webhook) {
    const send = discord(g.webhook, data.name, name, [{ type, severity, detail, data: { items: [] } }]).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(send); else await send;
  }
  return json({ ok: true, saved: 1, kopi: !!play });
}

// La clave del servidor de una instancia (la crea si no hay). POST = una nueva (la anterior deja de valer).
async function serverKey(c, instanceId, m, need) {
  need('admin');
  const { env, studio, user } = c;
  const inst = await env.DB.prepare('SELECT id, data FROM instances WHERE id = ? AND studio_id = ? AND deleted_at IS NULL').bind(str(instanceId, 60), studio.id).first();
  if (!inst) fail(404, 'instance', 'Instancia no encontrada');
  let k = await env.DB.prepare('SELECT * FROM guard_keys WHERE instance_id = ?').bind(inst.id).first();
  if (!k || m === 'POST') {
    const key = 'kg_' + randomToken(32);
    await env.DB.prepare('INSERT INTO guard_keys (key, instance_id, studio_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(instance_id) DO UPDATE SET key = excluded.key, created_at = excluded.created_at, used_at = NULL').bind(key, inst.id, studio.id, now()).run();
    if (m === 'POST') await audit(env, user, studio.id, 'guard.key', JSON.parse(inst.data).name, { instance: inst.id });
    k = { key, used_at: null };
  }
  return json({ key: k.key, usedAt: k.used_at || null });
}

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
  if (sub === 'rtc') {
    const playing = !pl.ended_at && pl.last_seen > t - LIVE_MS;
    if (m === 'POST' && c.u.searchParams.get('close')) {
      await env.DB.prepare("UPDATE guard_rtc SET state = 'closed', updated_at = ? WHERE id = ? AND play_id = ?").bind(t, str(c.u.searchParams.get('id'), 40), pl.id).run();
      return json({ ok: true });
    }
    if (m === 'POST') {
      if (!playing) fail(409, 'not_playing', 'Ese jugador no está jugando ahora');
      const b = await readJson(c.req, 64 * 1024);
      const offer = String(b.offer || '');
      if (!offer.startsWith('v=0') || offer.length > SDP_MAX) fail(400, 'data', 'Propuesta no válida');
      const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM guard_rtc WHERE play_id = ? AND state IN ('new', 'taken', 'answered') AND created_at > ?").bind(pl.id, t - 10 * 60e3).first();
      if (open && open.n >= 6) fail(429, 'busy', 'Demasiadas personas mirando a este jugador a la vez');
      const id = randomToken(10);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO guard_rtc (id, play_id, studio_id, user_id, offer, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, pl.id, studio.id, user.id, offer, t),
        // mirar en grande: el launcher se entera antes (pasa a modo «live»)
        env.DB.prepare('INSERT INTO guard_live (play_id, studio_id, focus_at) VALUES (?, ?, ?) ON CONFLICT(play_id) DO UPDATE SET focus_at = excluded.focus_at').bind(pl.id, studio.id, t)
      ]);
      return json({ id, ice: await iceServers(env) }, 201);
    }
    if (m === 'GET' && !c.u.searchParams.get('id')) return json({ ice: await iceServers(env), playing }); // con qué servidores conectar
    if (m === 'GET') {
      const r = await env.DB.prepare('SELECT state, answer FROM guard_rtc WHERE id = ? AND play_id = ?').bind(str(c.u.searchParams.get('id'), 40), pl.id).first();
      if (!r) fail(404, 'rtc', 'Esa conexión ya no existe');
      return json({ state: r.state, answer: r.answer || null, playing });
    }
  }
  if (m === 'GET' && sub === 'img') {
    if (!live || !live.frame) return new Response(null, { status: 404 });
    const bin = Uint8Array.from(atob(live.frame), ch => ch.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
  }
  if (m === 'GET') {
    const playing = !pl.ended_at && pl.last_seen > t - LIVE_MS;
    // mirar en grande: el launcher pasa a mandar imágenes seguidas y más nítidas
    if (playing && (!live || !live.focus_at || live.focus_at < t - 8e3)) { // como mucho cada 8 s (se mira en grande 15 s)
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
  if (id === 'key') return serverKey(c, sub, m, need);
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
