// Fallos de conexión de los launchers: qué web y qué error (sin nombres, sin IP, sin datos del jugador).
// Sirve para ver de verdad qué pasa en los PCs de los jugadores (antivirus, compañías de internet que cambian
// direcciones, webs caídas…). El resumen público solo enseña cuentas por web, error, país y compañía de internet.
//   POST /api/l/neterr     { host, kind, chrome, node, version, os }
//   GET  /api/public/neterrs?h=24
import { json, fail, now, str, readJson } from './util.js';

const KINDS = ['dns', 'blocked', 'timeout', 'cert', 'other'];
const OS = ['win32', 'darwin', 'linux'];

export async function reportNetErr(env, req) {
  const b = await readJson(req, 4096);
  const host = str(b.host, 100).toLowerCase();
  if (!/^[a-z0-9.-]{3,100}$/.test(host)) fail(400, 'host', 'Web no válida');
  const cf = req.cf || {};
  // límite: 30 avisos por minuto en total (por si algo se vuelve loco)
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM net_errors WHERE at > ?').bind(now() - 60e3).first();
  if (recent && recent.n >= 30) return json({ ok: true, skipped: true });
  await env.DB.prepare('INSERT INTO net_errors (at, host, kind, chrome, node, version, os, country, isp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(now(), host, KINDS.includes(b.kind) ? b.kind : 'other', str(b.chrome, 120) || null, str(b.node, 120) || null,
      str(b.version, 20) || null, OS.includes(b.os) ? b.os : null, str(cf.country, 4) || null, str(cf.asOrganization, 80) || null).run();
  return json({ ok: true });
}

export async function publicNetErrs(env, u) {
  const h = Math.min(168, Math.max(1, Number(u.searchParams.get('h')) || 24));
  const rows = (await env.DB.prepare(`SELECT host, kind, chrome, node, country, isp, version, os, COUNT(*) AS n, MAX(at) AS last
      FROM net_errors WHERE at > ? GROUP BY host, kind, chrome, node, country, isp, version, os ORDER BY n DESC LIMIT 200`).bind(now() - h * 3600e3).all()).results;
  return json({ hours: h, errors: rows });
}
