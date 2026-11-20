// Uso del launcher en todo Kopi (solo para el Creador): cuántas instalaciones hay, cuántas se abren cada día,
// cuántas nuevas, desde qué países, con qué sistema y qué versión.
// El launcher manda al abrirse un aviso anónimo: un número al azar de esa instalación (no dice quién es),
// la versión, el sistema y el idioma. El país lo da Cloudflare; la IP no se guarda.
import { json, now } from './util.js';

const DAY = 864e5;
const day = (t) => Math.floor(t / DAY);
const ID_RE = /^[a-f0-9]{32}$/;
const PLATFORMS = ['win32', 'darwin', 'linux'];

// POST /api/hello { install, version, platform, lang, brand }
export async function hello(env, req, b) {
  const id = String(b.install || '');
  if (!ID_RE.test(id)) return json({ ok: false }, 400);
  const t = now();
  const country = String((req.cf && req.cf.country) || req.headers.get('cf-ipcountry') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || null;
  const version = String(b.version || '').slice(0, 24).replace(/[^\w.+-]/g, '') || null;
  const platform = PLATFORMS.includes(b.platform) ? b.platform : 'other';
  const lang = /^[a-z]{2}$/.test(String(b.lang || '')) ? b.lang : null;
  const brand = /^[a-z][a-z0-9-]{1,31}$/.test(String(b.brand || '')) ? b.brand : null;
  const row = await env.DB.prepare('SELECT last_at, version FROM installs WHERE id = ?').bind(id).first();
  // Una escritura al día por instalación (y si cambia de versión)
  if (!row) {
    await env.DB.prepare('INSERT INTO installs (id, first_at, last_at, country, version, platform, lang, brand, opens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
      .bind(id, t, t, country, version, platform, lang, brand).run();
  } else if (day(row.last_at) !== day(t) || row.version !== version) {
    await env.DB.prepare('UPDATE installs SET last_at = ?, country = COALESCE(?, country), version = ?, platform = ?, lang = COALESCE(?, lang), brand = ?, opens = opens + 1 WHERE id = ?')
      .bind(t, country, version, platform, lang, brand, id).run();
  }
  await env.DB.prepare('INSERT OR IGNORE INTO install_days (day, id) VALUES (?, ?)').bind(day(t), id).run();
  return json({ ok: true });
}

// GET /api/onyx/launcher?days=30
export async function launcherStats(env, q) {
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const t = now(), today = day(t), from = today - days + 1;
  const one = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
  const all = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
  const [total, act1, act7, act30, newToday, accounts] = await Promise.all([
    one('SELECT COUNT(*) AS n FROM installs'),
    one('SELECT COUNT(*) AS n FROM install_days WHERE day = ?', today),
    one('SELECT COUNT(DISTINCT id) AS n FROM install_days WHERE day > ?', today - 7),
    one('SELECT COUNT(DISTINCT id) AS n FROM install_days WHERE day > ?', today - 30),
    one('SELECT COUNT(*) AS n FROM installs WHERE first_at >= ?', today * DAY),
    one('SELECT COUNT(DISTINCT player_key) AS n FROM player_tokens')
  ]);
  const active = await all('SELECT day, COUNT(*) AS n FROM install_days WHERE day >= ? GROUP BY day', from);
  const fresh = await all('SELECT CAST(first_at / ? AS INTEGER) AS day, COUNT(*) AS n FROM installs WHERE first_at >= ? GROUP BY 1', DAY, from * DAY);
  const A = new Map(active.map(r => [r.day, r.n])), N = new Map(fresh.map(r => [r.day, r.n]));
  const daily = [];
  for (let d = from; d <= today; d++) daily.push({ day: d * DAY, active: A.get(d) || 0, fresh: N.get(d) || 0 });
  const prevNew = await one('SELECT COUNT(*) AS n FROM installs WHERE first_at >= ? AND first_at < ?', (from - days) * DAY, from * DAY);
  const countries = await all(`SELECT COALESCE(country, '??') AS c, COUNT(*) AS n, SUM(CASE WHEN last_at > ? THEN 1 ELSE 0 END) AS active
    FROM installs GROUP BY 1 ORDER BY n DESC LIMIT 60`, t - 30 * DAY);
  const platforms = await all('SELECT platform AS p, COUNT(*) AS n FROM installs WHERE last_at > ? GROUP BY 1 ORDER BY n DESC', t - 30 * DAY);
  const versions = await all('SELECT version AS v, COUNT(*) AS n FROM installs WHERE last_at > ? GROUP BY 1 ORDER BY n DESC LIMIT 12', t - 7 * DAY);
  const langs = await all('SELECT COALESCE(lang, \'?\') AS l, COUNT(*) AS n FROM installs WHERE last_at > ? GROUP BY 1 ORDER BY n DESC', t - 30 * DAY);
  const brands = await all('SELECT brand AS b, COUNT(*) AS n FROM installs WHERE brand IS NOT NULL AND last_at > ? GROUP BY 1 ORDER BY n DESC LIMIT 10', t - 30 * DAY);
  const newInRange = daily.reduce((n, d) => n + d.fresh, 0);
  return json({
    days, total: total.n || 0, activeToday: act1.n || 0, active7: act7.n || 0, active30: act30.n || 0, newToday: newToday.n || 0,
    newInRange, newPrev: prevNew.n || 0, accounts: accounts.n || 0,
    daily, countries, platforms, versions, langs, brands
  });
}
