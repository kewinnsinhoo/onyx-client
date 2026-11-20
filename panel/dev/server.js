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
// En local no se habla con Mojang ni con MineSkin: respuestas de prueba (Kopi Skins)
env.MOJANG_FETCH = async (u, o) => (/api\.mojang\.com\/users|session\/minecraft\/profile\//.test(String(u)) ? new Response(null, { status: 404 }) : fetch(u, o));
env.MINESKIN_FETCH = async () => new Response(JSON.stringify({ skin: { texture: { data: { value: 'ZGV2', signature: 'firma-dev' } } } }), { status: 200 });
// Informes: un webhook de prueba que solo lo apunta en la consola
env.DISCORD_REPORT_WEBHOOK = 'https://discord.com/api/webhooks/1/dev';
env.DISCORD_FETCH = async (u, o) => { console.log('[informe] ' + JSON.parse(o.body.get('payload_json')).embeds[0].description); return new Response(null, { status: 204 }); };
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
  await run("INSERT INTO studios (id, name, created_by, created_at) VALUES ('onyx-studios', 'Kopi Studio', '111', ?)", t - 40 * DAY);
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
      { path: 'resourcepacks/Kopi-UI.zip', url: '/m/0123456789abcdef0129/onyx-ui.zip', size: 4200000, at: t - DAY },
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
  // Más partidas repartidas en 60 días (tardes y fines de semana con más gente) para las estadísticas
  {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nicks = ['Steve_Pro', 'Luna_MC', 'Dante', 'Pixel', 'Mia_2010', 'Kewinsinho', 'NoahCraft', 'Valen', 'Tomi_YT', 'Sofi', 'ElRayo', 'Gabo', 'Nico77', 'Alma', 'Bruno', 'Iker', 'Leo', 'Mateo', 'Vale', 'Zoe'];
    const insts = ['ignite-extremo-3', 'ignite-extremo-3', 'torneo-pvp'];
    let q = 0;
    for (let d = 60; d >= 0; d--) {
      const day = new Date(t - d * DAY); day.setHours(0, 0, 0, 0);
      const wd = day.getDay(), weekend = wd === 0 || wd === 6 || wd === 5;
      const people = Math.round((weekend ? 9 : 5) + rnd() * 5 + (60 - d) / 12); // va creciendo
      for (let k = 0; k < people; k++) {
        const who = nicks[Math.floor(Math.pow(rnd(), 1.6) * nicks.length)];
        const hour = rnd() < 0.7 ? 17 + Math.floor(rnd() * 6) : 10 + Math.floor(rnd() * 7);
        const st = day.getTime() + hour * 3600e3 + Math.floor(rnd() * 60) * 60e3;
        if (st > t - 30 * 60e3) continue;
        const len = (20 + Math.floor(rnd() * 150)) * 60e3;
        await run('INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'ps' + q++, insts[Math.floor(rnd() * insts.length)], 'onyx-studios', who.toLowerCase(), who, st, Math.min(st + len, t - 60e3), Math.min(st + len, t - 60e3));
      }
    }
  }
  // KopiGuard: activado en IGNITE con algunas detecciones de ejemplo
  {
    const row = await env.DB.prepare("SELECT data FROM instances WHERE id = 'ignite-extremo-3'").first();
    const d = JSON.parse(row.data); d.guard = { enabled: true, autoKick: true, packsOk: false, webhook: '' };
    await run("UPDATE instances SET data = ? WHERE id = 'ignite-extremo-3'", JSON.stringify(d));
    await run("INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen, ended_at) VALUES ('pg1', 'ignite-extremo-3', 'onyx-studios', 'steve_pro', 'Steve_Pro', ?, ?, NULL)", t - 40 * 60e3, t - 10e3);
    const mods = ['kopi-skins-csl.jar', 'sodium-fabric-0.6.jar', 'lithium-fabric-0.14.jar', 'fabric-api-0.116.jar', 'ignite-core-3.2.jar', 'voicechat-2.5.jar'];
    const G = [
      ['g1', 'steve_pro', 'Steve_Pro', 'program', 'high', 'Autoclicker abierto: OP Auto Clicker', { process: { name: 'OP AutoClicker.exe', path: 'C:\\Users\\steve\\Downloads\\OP AutoClicker.exe', hash: '9f2c41ab07de55c1' }, mods }, 'new', 1, 6],
      ['g2', 'steve_pro', 'Steve_Pro', 'mod', 'high', 'Mod añadido: mods/wurst-7.46.jar', { items: ['mods/wurst-7.46.jar', 'mods/xaeros-minimap.jar', 'mods/freecam.jar'], mods }, 'new', 0, 9],
      ['g3', 'luna_mc', 'Luna_MC', 'pack', 'medium', 'Paquete añadido: resourcepacks/xray-ultimate.zip', { items: ['resourcepacks/xray-ultimate.zip'], mods }, 'new', 0, 50],
      ['g4', 'dante', 'Dante', 'file', 'medium', 'Archivo cambiado: config/sodium-options.json', { items: ['config/sodium-options.json'], mods }, 'reviewed', 0, 180],
      ['g5', 'pixel', 'Pixel', 'program', 'medium', 'Programa abierto: Process Hacker', { process: { name: 'ProcessHacker.exe', path: 'C:\\Program Files\\Process Hacker 2\\ProcessHacker.exe', hash: '41c0a7e2f9b3d018' }, mods }, 'dismissed', 0, 400],
      ['g6', 'griefer99', 'griefer99', 'program', 'high', 'Cheat Engine abierto', { process: { name: 'cheatengine-x86_64.exe', path: 'C:\\Program Files\\Cheat Engine 7.5\\cheatengine-x86_64.exe', hash: 'c0ffee1234abcd99' }, mods }, 'sanctioned', 1, 1500],
      ['g7', 'mia_2010', 'Mia_2010', 'file', 'low', 'Archivo nuevo en config: config/journeymap/', { items: ['config/journeymap/journeymap.core.config'], mods }, 'new', 0, 2900]
    ];
    for (const [id, key, name, type, sev, detail, data, st, kicked, mins] of G)
      await run('INSERT INTO guard_events (id, studio_id, instance_id, play_id, player_key, player_name, type, severity, detail, data, status, kicked, handled_by, handled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, 'onyx-studios', 'ignite-extremo-3', key === 'steve_pro' ? 'pg1' : null, key, name, type, sev, detail, JSON.stringify(data), st, kicked, st === 'new' ? null : 'kew', st === 'new' ? null : t - (mins - 5) * 60e3, t - mins * 60e3);
    // Cámaras y capturas de ejemplo: imágenes de /tmp/kopi-cams/*.jpg si existen (solo para probar en local)
    const camDir = '/tmp/kopi-cams';
    const jpgs = fs.existsSync(camDir) ? fs.readdirSync(camDir).filter(f => f.endsWith('.jpg')).sort().map(f => fs.readFileSync(path.join(camDir, f))) : [];
    if (jpgs.length) {
      const who = [['pg1', 'Steve_Pro'], ['pg2', 'Luna_MC'], ['pg3', 'Dante'], ['pg4', 'Pixel'], ['pg5', 'Mia_2010']];
      for (const [i, [pid, nm]] of who.entries()) {
        if (pid !== 'pg1') await run("INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen, ended_at) VALUES (?, 'ignite-extremo-3', 'onyx-studios', ?, ?, ?, ?, NULL)", pid, nm.toLowerCase(), nm, t - (12 + i * 17) * 60e3, t - 5e3);
        if (i < 4) await run('INSERT INTO guard_live (play_id, studio_id, frame, hd, none, at) VALUES (?, ?, ?, 0, ?, ?)', pid, 'onyx-studios', jpgs[i % jpgs.length].toString('base64'), i === 3 ? 1 : 0, t - 3e3);
      }
      await env.MEDIA.put('guard:g1:shot', jpgs[0], { metadata: { type: 'image/jpeg' } });
      await run(`UPDATE guard_events SET media = '{"shot":{"size":1}}' WHERE id = 'g1'`);
      await run("UPDATE guard_events SET media = '{}' WHERE id = 'g2'");
      // la imagen de las cámaras se renueva sola, como si el launcher siguiera mandando
      setInterval(async () => { for (const [i, [pid]] of who.slice(0, 4).entries()) await env.DB.prepare('UPDATE guard_live SET at = ?, frame = ? WHERE play_id = ?').bind(Date.now(), jpgs[(i + Math.floor(Date.now() / 3000)) % jpgs.length].toString('base64'), pid).run(); await env.DB.prepare("UPDATE plays SET last_seen = ? WHERE id LIKE 'pg%'").bind(Date.now()).run(); }, 1500).unref();
    }
  }
  const ev = [['Final IGNITE', 'Serie', '#38bdf8', 2], ['Torneo PvP 1.8', 'Torneo', '#ef4444', 5], ['Squid Game Kopi', 'Squid Game', '#8b5cf6', 9], ['Directo de presentación', 'Directo', '#ec4899', 12]];
  for (const [i, [title, cat, color, days]] of ev.entries()) await run('INSERT INTO events (id, studio_id, instance_id, title, category, color, description, starts_at, ends_at, public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)', 'e' + i, 'onyx-studios', i === 0 ? 'ignite-extremo-3' : null, title, cat, color, 'Evento de ejemplo', t + days * DAY + 3600e3 * 4, i === 2 ? t + (days + 2) * DAY : null, t);
  for (const [i, nm] of ['Mia_2010', 'Pixel', 'Dante', 'Zoe'].entries()) await run('INSERT INTO referrals VALUES (?, ?, ?, ?)', nm.toLowerCase(), nm, 'onyx-studios', t - i * 5 * 3600e3);
  // Herramientas del Creador: límites, avisos y actividad de ejemplo
  await run("UPDATE studios SET max_instances = 5, max_storage_mb = 500, note = 'Studio de Luis. Acordado: 5 instancias.' WHERE id = 'nova-estudios'");
  await run("INSERT OR IGNORE INTO members (studio_id, user_id, role, added_at) VALUES ('nova-estudios', '222', 'owner', ?)", t - 19 * DAY);
  await run("INSERT INTO notices (id, studio_id, title, body, kind, url, starts_at, ends_at, created_by, created_at) VALUES ('n1', NULL, 'Kopi Client 1.3 ya está aquí', 'Avisos nuevos, carpetas en los archivos y más.', 'success', 'https://onyxclient.site', ?, NULL, '111', ?)", t - DAY, t - DAY);
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
  // Launcher de marca de ejemplo
  await run("UPDATE studios SET brand_allowed = 1 WHERE id = 'nova-estudios'");
  await run("INSERT INTO brands (id, studio_id, name, data, created_at, updated_at) VALUES ('nova-launcher', 'nova-estudios', 'Nova Launcher', ?, ?, ?)",
    JSON.stringify({ name: 'Nova Launcher', icon: '/m/0123456789abcdef0124/skin.webp', background: '/m/0123456789abcdef0123/fondo.webp', accent: '#f59e0b', accent2: '#ea580c', tagline: 'Los eventos de Nova, en un clic', discord: 'https://discord.gg/nova', web: 'https://nova.gg', onlyStudio: true }), t, t);
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
