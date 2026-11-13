// Servidor local para probar el panel sin Cloudflare: node dev/server.js [puerto]
// Entra en http://localhost:8790/auth/dev?id=111&name=kew  (DEV_LOGIN solo existe aquí)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { ensureSchema } from '../src/schema.js';
import { makeD1, makeKV } from './shim.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
const PORT = Number(process.argv[2] || 8790);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

const env = { DB: makeD1(':memory:'), MEDIA: makeKV(), DEV_LOGIN: '1', CREATOR_DISCORD_IDS: '111', DISCORD_CLIENT_ID: 'dev' };
env.ASSETS = {
  async fetch(req) {
    const u = new URL(req.url);
    let p = path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, '');
    let file = path.join(pub, p || 'index.html');
    if (p === 'img/demo-bg.webp') file = path.join(here, '..', '..', 'web', 'img', 'arte-3.webp'); // imagen de ejemplo (solo en local)
    if (fs.existsSync(file + '.html')) file += '.html';
    if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(pub, 'index.html');
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' } });
  }
};

// Versiones falsas (sin internet)
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u);
  if (s.includes('piston-meta.mojang.com')) {
    const rel = ['1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.9', '1.7.10'];
    return new Response(JSON.stringify({ latest: { release: '1.21.4', snapshot: '25w02a' }, versions: [{ id: '25w02a', type: 'snapshot', releaseTime: '' }, ...rel.map(id => ({ id, type: 'release', releaseTime: '' })), { id: 'b1.7.3', type: 'old_beta', releaseTime: '' }] }));
  }
  if (s.includes('meta.fabricmc.net') || s.includes('meta.quiltmc.org')) return new Response(JSON.stringify([{ loader: { version: '0.16.9', stable: true } }, { loader: { version: '0.16.8', stable: true } }, { loader: { version: '0.16.5', stable: true } }]));
  if (s.includes('maven-metadata.xml')) return new Response('<versions><version>1.20.1-47.3.0</version><version>1.20.1-47.3.12</version><version>1.21.1-52.0.40</version></versions>');
  if (s.includes('promotions_slim')) return new Response(JSON.stringify({ promos: { '1.20.1-recommended': '47.3.0', '1.21.1-latest': '52.0.40' } }));
  if (s.includes('maven.neoforged.net')) return new Response(JSON.stringify({ versions: ['21.1.77', '21.1.80', '21.4.10-beta', '20.4.237'] }));
  if (s.includes('api.github.com')) return new Response(JSON.stringify({ tag_name: 'v1.1.4', published_at: new Date().toISOString() }));
  return realFetch(u, o);
};

// Datos de ejemplo
async function seed() {
  await ensureSchema(env.DB);
  const t = Date.now(), DAY = 864e5;
  const run = (sql, ...a) => env.DB.prepare(sql).bind(...a).run();
  await run("INSERT INTO users (id, name, avatar, global_role, created_at) VALUES ('111', 'kew', NULL, 'creator', ?)", t);
  await run("INSERT INTO users (id, name, avatar, global_role, created_at) VALUES ('222', 'Luis Enrique', NULL, 'user', ?)", t);
  await run("INSERT INTO studios (id, name, created_by, created_at) VALUES ('onyx-studios', 'Onyx Studios', '111', ?)", t - 40 * DAY);
  await run("INSERT INTO studios (id, name, created_by, created_at) VALUES ('nova-estudios', 'Nova Estudios', '111', ?)", t - 20 * DAY);
  await run("INSERT INTO members VALUES ('onyx-studios', '111', 'owner', ?)", t - 40 * DAY);
  await run("INSERT INTO members VALUES ('onyx-studios', '222', 'editor', ?)", t - 10 * DAY);
  const { defaults, sanitize } = await import('../src/model.js');
  // Imagen de ejemplo "subida" al almacén de archivos
  await env.MEDIA.put('m:0123456789abcdef0123', fs.readFileSync(path.join(here, '..', '..', 'web', 'img', 'arte-3.webp')), { metadata: { type: 'image/webp', name: 'fondo.webp' } });
  await env.MEDIA.put('m:0123456789abcdef0124', fs.readFileSync(path.join(here, '..', '..', 'web', 'img', 'arte-2.webp')), { metadata: { type: 'image/webp', name: 'skin.webp' } });
  const mk = async (id, patch, state = 'open', hidden = 0) => {
    const d = sanitize(patch, defaults());
    await run('INSERT INTO instances (id, studio_id, data, state, hidden, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, 'onyx-studios', JSON.stringify(d), state, hidden, '111', t - 30 * DAY, t - DAY);
  };
  await mk('ignite-extremo-3', { name: 'IGNITE EXTREMO 3', category: 'Serie', description: 'Supervivencia extrema con vidas limitadas', minecraft: '1.21.1', loader: { type: 'fabric', version: '0.16.5' },
    look: { background: '/m/0123456789abcdef0123/fondo.webp', icon: '/m/0123456789abcdef0124/skin.webp', accent: '#f59e0b', playColor: '#ea580c' }, access: { maxPlayers: 100, staff: ['kewinn'] },
    files: [
      { path: 'mods/sodium.jar', url: 'https://cdn.modrinth.com/data/AANobbMI/versions/x/sodium.jar', size: 1048000, at: t - 4 * DAY },
      { path: 'mods/voicechat.jar', url: '/m/0123456789abcdef0123/voicechat.jar', size: 3400000, sha1: 'a'.repeat(40), at: t - 4 * DAY },
      { path: 'mods/muertes-epicas-1.21.1-1.12.0.jar', url: '/m/0123456789abcdef0125/muertes.jar', size: 5800000, at: t - 2 * 3600e3 },
      { path: 'mods/iris.jar', url: 'https://cdn.modrinth.com/data/YL57xq9U/versions/y/iris.jar', size: 2900000, at: t - 4 * DAY },
      { path: 'config/sodium-options.json', url: '/m/0123456789abcdef0126/sodium-options.json', size: 1200, at: t - 3 * DAY },
      { path: 'config/voicechat/voicechat-client.properties', url: '/m/0123456789abcdef0127/vc.properties', size: 900, at: t - 3 * DAY },
      { path: 'config/voicechat/voicechat-server.properties', url: '/m/0123456789abcdef0128/vcs.properties', size: 1400, at: t - 3 * DAY },
      { path: 'resourcepacks/Onyx-UI.zip', url: '/m/0123456789abcdef0129/onyx-ui.zip', size: 4200000, at: t - DAY },
      { path: 'options.txt', url: '/m/012345678900abcdef12/options.txt', size: 5300, at: t - 5 * DAY }
    ], dirs: ['shaderpacks'],
    server: { address: 'play.onyx.gg', autoJoin: true } });
  await mk('torneo-pvp', { name: 'Torneo PvP', category: 'Torneo', minecraft: '1.8.9', loader: { type: 'vanilla' }, look: { background: '/m/0123456789abcdef0124/skin.webp', accent: '#ef4444', playColor: '#dc2626' }, access: { premiumOnly: true } }, 'locked');
  await mk('modpack-staff', { name: 'Modpack del staff', category: 'Survival', minecraft: '1.20.1', loader: { type: 'forge', version: '47.3.0' }, look: { accent: '#8b5cf6', playColor: '#7c3aed' } }, 'open', 1);
  for (const [c, u, m] of [['IGNT-2026-ABCD', 42, 100], ['FEST-RT4K-9QZ2', 100, 100], ['VIP7-MNPQ-K2L8', 3, null]]) await run('INSERT INTO codes (code, instance_id, max_uses, uses, created_at) VALUES (?, ?, ?, ?, ?)', c, 'ignite-extremo-3', m, u, t - 5 * DAY);
  const names = ['Kewinn', 'Steve', 'Alex', 'Notch_fan', 'LuisE', 'Mia_2010', 'ElRubius_', 'Zoe', 'Pixel', 'Dante'];
  for (const [i, n] of names.entries()) await run("INSERT INTO access (instance_id, player_key, player_name, uuid, via, code, last_ip, created_at) VALUES ('ignite-extremo-3', ?, ?, ?, ?, ?, ?, ?)", n.toLowerCase(), n, i % 2 ? 'abc' : null, i < 7 ? 'code' : 'manual', i < 7 ? 'IGNT-2026-ABCD' : null, `181.52.${i}.10`, t - i * 3600e3 * 7);
  await run("INSERT INTO bans (scope, kind, value, created_at) VALUES ('instance:ignite-extremo-3', 'name', 'griefer99', ?)", t);
  // partidas de 30 días con un pico
  let n = 0;
  for (let d = 30; d >= 0; d--) {
    const base = t - d * DAY;
    const count = d === 4 ? 79 : d === 3 ? 71 : 2 + ((d * 7) % 6);
    for (let k = 0; k < count; k++) {
      const st = base - 3 * 3600e3 + k * 60e3;
      const end = d === 0 && k < 3 ? null : st + 50 * 60e3;
      await run('INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'p' + n++, k % 3 ? 'ignite-extremo-3' : 'torneo-pvp', 'onyx-studios', 'p' + k, 'Jugador' + k, end ? st : t - 60e3, end || t - 20e3, end);
    }
  }
  const ev = [['Final IGNITE', 'Serie', '#38bdf8', 2], ['Torneo PvP 1.8', 'Torneo', '#ef4444', 5], ['Squid Game Onyx', 'Squid Game', '#8b5cf6', 9], ['Directo de presentación', 'Directo', '#ec4899', 12]];
  for (const [i, [title, cat, color, days]] of ev.entries()) await run('INSERT INTO events (id, studio_id, instance_id, title, category, color, description, starts_at, ends_at, public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)', 'e' + i, 'onyx-studios', i === 0 ? 'ignite-extremo-3' : null, title, cat, color, 'Evento de ejemplo', t + days * DAY + 3600e3 * 4, i === 2 ? t + (days + 2) * DAY : null, t);
  for (const [i, nm] of ['Mia_2010', 'Pixel', 'Dante', 'Zoe'].entries()) await run('INSERT INTO referrals VALUES (?, ?, ?, ?)', nm.toLowerCase(), nm, 'onyx-studios', t - i * 5 * 3600e3);
  // Herramientas del Creador: límites, avisos y actividad de ejemplo
  await run("UPDATE studios SET max_instances = 5, max_storage_mb = 500, note = 'Studio de Luis. Acordado: 5 instancias.' WHERE id = 'nova-estudios'");
  await run("INSERT OR IGNORE INTO members (studio_id, user_id, role, added_at) VALUES ('nova-estudios', '222', 'owner', ?)", t - 19 * DAY);
  await run("INSERT INTO notices (id, studio_id, title, body, kind, url, starts_at, ends_at, created_by, created_at) VALUES ('n1', NULL, 'Onyx Client 1.3 ya está aquí', 'Avisos nuevos, carpetas en los archivos y más.', 'success', 'https://onyxclient.site', ?, NULL, '111', ?)", t - DAY, t - DAY);
  await run("INSERT INTO notices (id, studio_id, title, body, kind, url, starts_at, ends_at, created_by, created_at) VALUES ('n2', 'onyx-studios', 'Final de IGNITE este sábado', 'A las 20:00. Entra 10 minutos antes.', 'event', NULL, ?, ?, '111', ?)", t - 3600e3, t + 5 * DAY, t);
  await run("INSERT INTO notices (id, studio_id, title, body, kind, url, starts_at, ends_at, created_by, created_at) VALUES ('n3', NULL, 'Mantenimiento el lunes', NULL, 'warn', NULL, ?, NULL, '111', ?)", t + 2 * DAY, t);
  const A = [
    [6, '111', 'kew', 'onyx-studios', 'instance.create', 'IGNITE EXTREMO 3', null],
    [5.5, '111', 'kew', 'onyx-studios', 'code.create', 'IGNITE EXTREMO 3', { n: 1 }],
    [5, '111', 'kew', null, 'studio.create', 'Nova Estudios', null],
    [4.8, '222', 'Luis Enrique', 'nova-estudios', 'invite.accept', 'Luis Enrique', { role: 'owner' }],
    [4, '111', 'kew', 'nova-estudios', 'studio.limits', 'Nova Estudios', { maxInstances: 5 }],
    [3, '111', 'kew', 'onyx-studios', 'instance.update', 'IGNITE EXTREMO 3', { fields: ['look', 'files'] }],
    [2, '111', 'kew', 'onyx-studios', 'access.add', 'IGNITE EXTREMO 3', { names: ['Pixel', 'Dante'], n: 2 }],
    [1, '111', 'kew', 'onyx-studios', 'instance.lock', 'Torneo PvP', null],
    [0.5, '111', 'kew', 'onyx-studios', 'notice.create', 'Final de IGNITE este sábado', null],
    [0.2, '111', 'kew', null, 'ban.global', 'griefer99', { kind: 'name' }]
  ];
  for (const [h, uid, un, sid, action, target, detail] of A) await run('INSERT INTO audit (at, user_id, user_name, studio_id, action, target, detail) VALUES (?, ?, ?, ?, ?, ?, ?)', t - h * 3600e3, uid, un, sid, action, target, detail ? JSON.stringify(detail) : null);
  await run("INSERT INTO bans (scope, kind, value, created_by, created_at) VALUES ('global', 'name', 'griefer99', '111', ?)", t - 0.2 * 3600e3);
  const { runChecks } = await import('../src/extra.js');
  for (let i = 0; i < 3; i++) await runChecks(env, async () => new Response('ok'));
}

await seed();
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const r = await worker.fetch(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env, { waitUntil() {} });
  const out = {};
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
  const cookies = r.headers.getSetCookie().map(c => c.replace('; Secure', ''));
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`Panel local en http://localhost:${PORT}/auth/dev?id=111&name=kew`));
