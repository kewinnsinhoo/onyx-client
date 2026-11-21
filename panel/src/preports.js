// Reportes de jugadores: un jugador denuncia a otro desde el launcher (con una captura, si quiere)
// y el staff del studio lo ve y lo resuelve en el panel (Jugadores → Reportes).
//   Launcher: GET /api/l/online/<instancia> · POST /api/l/preport · POST /api/l/preport/<id>/shot (JPEG tal cual)
//   Panel:    GET /reports[?status=] · GET /reports/<id>/shot · PATCH /reports/<id> { status, note }
import { json, fail, now, str, readJson, randomToken, playerKey, NAME_RE } from './util.js';
import { audit } from './onyx.js';

export const REASONS = ['cheats', 'abuse', 'grief', 'exploit', 'other'];
const STATUS = ['new', 'reviewed', 'dismissed', 'actioned'];
const SHOT_MAX = 1.5 * 1024 * 1024;
const TTL_S = 60 * 864e2;          // las capturas se guardan 60 días
const RECENT_MS = 24 * 3600e3;     // solo se puede denunciar en una instancia que has jugado hoy
const ACTIVE_MS = 90e3;

async function recentPlay(env, instanceId, key) {
  return env.DB.prepare('SELECT id, studio_id, ended_at, last_seen FROM plays WHERE instance_id = ? AND player_key = ? AND last_seen > ? ORDER BY last_seen DESC LIMIT 1')
    .bind(instanceId, key, now() - RECENT_MS).first();
}

// ---------------------------------------------------------------- launcher
export async function launcherReports(env, P, parts, m, req) {
  // Quién está jugando ahora en esta instancia (para elegir a quién denunciar)
  if (parts[0] === 'online' && parts[1] && m === 'GET') {
    const iid = str(parts[1], 60);
    if (!(await recentPlay(env, iid, P.key))) return json({ players: [] });
    const rows = (await env.DB.prepare('SELECT DISTINCT player_name FROM plays WHERE instance_id = ? AND ended_at IS NULL AND last_seen > ? AND player_key != ? ORDER BY player_name COLLATE NOCASE LIMIT 200')
      .bind(iid, now() - ACTIVE_MS, P.key).all()).results;
    return json({ players: rows.map(r => r.player_name) });
  }
  if (parts[0] !== 'preport') return null;

  if (!parts[1] && m === 'POST') {
    const b = await readJson(req);
    const iid = str(b.instance, 60);
    const target = String(b.target || '').trim();
    if (!NAME_RE.test(target)) fail(400, 'target', 'Escribe el nombre de Minecraft del jugador');
    if (playerKey(target) === P.key) fail(400, 'self', 'No puedes denunciarte a ti mismo');
    const reason = REASONS.includes(b.reason) ? b.reason : null;
    if (!reason) fail(400, 'reason', 'Elige el motivo');
    const text = str(b.text, 500).trim();
    const play = await recentPlay(env, iid, P.key);
    if (!play) fail(403, 'not_played', 'Solo puedes denunciar en una instancia que has jugado hoy');
    const t = now();
    const lastHour = await env.DB.prepare('SELECT COUNT(*) AS n FROM player_reports WHERE reporter_key = ? AND created_at > ?').bind(P.key, t - 3600e3).first();
    if (lastHour.n >= 10) fail(429, 'too_many', 'Has enviado muchos reportes. Espera un rato.');
    const dup = await env.DB.prepare('SELECT id FROM player_reports WHERE reporter_key = ? AND target_key = ? AND instance_id = ? AND created_at > ?').bind(P.key, playerKey(target), iid, t - 10 * 60e3).first();
    if (dup) fail(409, 'duplicate', 'Ya denunciaste a este jugador hace poco');
    const id = randomToken(10);
    await env.DB.prepare(`INSERT INTO player_reports (id, studio_id, instance_id, play_id, reporter_key, reporter_name, target_key, target_name, reason, text, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`).bind(id, play.studio_id, iid, play.id, P.key, P.name, playerKey(target), target, reason, text, t).run();
    return json({ ok: true, id });
  }
  // La captura: JPEG tal cual (una por reporte)
  if (parts[1] && parts[2] === 'shot' && m === 'POST') {
    const r = await env.DB.prepare('SELECT id, shot FROM player_reports WHERE id = ? AND reporter_key = ?').bind(str(parts[1], 40), P.key).first();
    if (!r) fail(404, 'report', 'Reporte no encontrado');
    if (r.shot) fail(409, 'exists', 'Ya está subida');
    if (Number(req.headers.get('content-length') || 0) > SHOT_MAX) fail(413, 'data', 'La imagen es demasiado grande');
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8) || bytes.length > SHOT_MAX) fail(400, 'data', 'Imagen no válida');
    await env.MEDIA.put(`preport:${r.id}`, bytes, { expirationTtl: TTL_S, metadata: { type: 'image/jpeg' } });
    await env.DB.prepare('UPDATE player_reports SET shot = ? WHERE id = ?').bind(bytes.length, r.id).run();
    return json({ ok: true });
  }
  return null;
}

// ---------------------------------------------------------------- panel del studio
const instName = (data, id) => { try { return JSON.parse(data).name || id; } catch { return id; } };

export async function studioReports(c, id, m, sub) {
  const { env, studio, user } = c;
  if (!id && m === 'GET') {
    const st = c.u.searchParams.get('status') || 'new';
    const where = STATUS.includes(st) ? 'AND r.status = ?' : '';
    const rows = (await env.DB.prepare(`SELECT r.*, i.data AS idata FROM player_reports r LEFT JOIN instances i ON i.id = r.instance_id
      WHERE r.studio_id = ? ${where} ORDER BY r.created_at DESC LIMIT 200`).bind(...[studio.id, ...(where ? [st] : [])]).all()).results;
    const counts = Object.fromEntries((await env.DB.prepare('SELECT status, COUNT(*) AS n FROM player_reports WHERE studio_id = ? GROUP BY status').bind(studio.id).all()).results.map(r => [r.status, r.n]));
    // ¿cuántas veces han denunciado a cada uno? (para ver a los reincidentes)
    const keys = [...new Set(rows.map(r => r.target_key))];
    const times = keys.length ? Object.fromEntries((await env.DB.prepare(`SELECT target_key, COUNT(*) AS n, COUNT(DISTINCT reporter_key) AS who FROM player_reports
      WHERE studio_id = ? AND target_key IN (${keys.map(() => '?').join(',')}) GROUP BY target_key`).bind(studio.id, ...keys).all()).results.map(r => [r.target_key, r])) : {};
    return json({
      reports: rows.map(r => ({ id: r.id, instance: instName(r.idata, r.instance_id), instanceId: r.instance_id, reporter: r.reporter_name, target: r.target_name,
        reason: r.reason, text: r.text || '', status: r.status, note: r.note || '', shot: !!r.shot, at: r.created_at, handledAt: r.handled_at,
        times: (times[r.target_key] || {}).n || 1, reporters: (times[r.target_key] || {}).who || 1 })),
      counts
    });
  }
  const r = await env.DB.prepare('SELECT * FROM player_reports WHERE id = ? AND studio_id = ?').bind(str(id, 40), studio.id).first();
  if (!r) fail(404, 'report', 'Reporte no encontrado');
  if (sub === 'shot' && m === 'GET') {
    const o = await env.MEDIA.get(`preport:${r.id}`, { type: 'arrayBuffer' });
    if (!o) fail(404, 'shot', 'La captura ya no está');
    return new Response(o, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
  }
  if (!sub && m === 'PATCH') {
    c.need('editor');
    const b = await readJson(c.req);
    const status = STATUS.includes(b.status) ? b.status : r.status;
    const note = 'note' in b ? str(b.note, 300).trim() : r.note;
    await env.DB.prepare('UPDATE player_reports SET status = ?, note = ?, handled_by = ?, handled_at = ? WHERE id = ?').bind(status, note, user.id, now(), r.id).run();
    if (status !== r.status) await audit(env, user, studio.id, 'report.' + status, r.target_name, { by: r.reporter_name });
    return json({ ok: true, status, note });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

// Para la ficha del jugador: cuántas veces le han denunciado y los últimos
export async function reportsAbout(env, studioId, key) {
  const rows = (await env.DB.prepare('SELECT id, reporter_name, reason, text, status, created_at, instance_id FROM player_reports WHERE studio_id = ? AND target_key = ? ORDER BY created_at DESC LIMIT 50').bind(studioId, key).all()).results;
  return { total: rows.length, reporters: new Set(rows.map(r => r.reporter_name.toLowerCase())).size, recent: rows.slice(0, 5).map(r => ({ id: r.id, by: r.reporter_name, reason: r.reason, text: r.text || '', status: r.status, at: r.created_at })) };
}
