// Pruebas del servidor del panel con D1/KV simulados. Ejecutar: node test/run.js
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { peaksByDay } from '../src/worker.js';
import { sanitize, defaults, gate, toManifest } from '../src/model.js';
import { normalizeCode, randomCode, CODE_RE } from '../src/util.js';
import { cmpVersion, neoPrefix } from '../src/meta.js';
import { makeD1, makeKV } from '../dev/shim.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://panel.onyxclient.site';
const env = {
  DB: makeD1(':memory:'),
  MEDIA: makeKV(),
  DISCORD_CLIENT_ID: '1570540697461989376',
  DISCORD_CLIENT_SECRET: 'secreto',
  CREATOR_DISCORD_IDS: '111',
  PUBLIC_URL: ORIGIN
};

// Discord y Mojang falsos
let discordUser = null;
const joined = new Map(); // serverId -> name
globalThis.fetch = async (u, opts = {}) => {
  const s = String(u);
  if (s.startsWith('https://discord.com/api/oauth2/token')) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
  if (s.startsWith('https://discord.com/api/users/@me')) return new Response(JSON.stringify(discordUser), { status: 200 });
  if (s.startsWith('https://sessionserver.mojang.com/session/minecraft/hasJoined')) {
    const q = new URL(s).searchParams;
    if (joined.get(q.get('serverId')) === q.get('username')) return new Response(JSON.stringify({ id: 'abcdef0123456789abcdef0123456789', name: q.get('username') }), { status: 200 });
    return new Response(null, { status: 204 });
  }
  if (s.startsWith('https://api.mojang.com/users/profiles/minecraft/')) {
    const n = decodeURIComponent(s.split('/').pop());
    return n.toLowerCase() === 'technoblade' ? new Response(JSON.stringify({ id: 'b876ec32e396476ba1158438d83c67d4', name: 'Technoblade' }), { status: 200 }) : new Response(null, { status: 404 });
  }
  // Mojang bloquea esta búsqueda desde Cloudflare (403): el panel tiene que probar otros caminos
  if (s.startsWith('https://api.minecraftservices.com/minecraft/profile/lookup/name/')) return new Response('<html>403</html>', { status: 403 });
  if (s.startsWith('https://api.ashcon.app/mojang/v2/user/')) {
    const n = decodeURIComponent(s.split('/').pop()).toLowerCase();
    if (n === 'dream' || n === 'dddddddddddddddddddddddddddddddd') return new Response(JSON.stringify({ uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', username: 'Dream', textures: { raw: { value: 'ZHJlYW0=', signature: 'firma-ashcon' } } }), { status: 200 });
    return new Response('{}', { status: 404 });
  }
  if (s.startsWith('https://sessionserver.mojang.com/session/minecraft/profile/')) {
    const id = s.split('/').pop().split('?')[0];
    if (id === 'dddddddddddddddddddddddddddddddd') return new Response('', { status: 403 });
    if (id === 'abcdef0123456789abcdef0123456789') return new Response(JSON.stringify({ id, name: 'Steve', properties: [{ name: 'textures', value: 'c3RldmU=', signature: 'firma-steve' }] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'b876ec32e396476ba1158438d83c67d4', name: 'Technoblade', properties: [{ name: 'textures', value: 'cHJlbWl1bQ==', signature: 'firma-mojang' }] }), { status: 200 });
  }
  if (s === 'https://api.mineskin.org/v2/generate') {
    mineskinCalls++;
    const f = opts.body;
    if (!(f instanceof FormData) || !f.get('file') || !['classic', 'slim'].includes(f.get('variant'))) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({ success: true, skin: { texture: { data: { value: 'a29waS0' + mineskinCalls, signature: 'firma-mineskin' } } } }), { status: 200 });
  }
  throw new Error('fetch inesperado: ' + s);
};
let mineskinCalls = 0;

async function call(method, p, { body, cookie, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (method !== 'GET' && !('Origin' in h)) h.Origin = ORIGIN;
  let b;
  if (raw) b = raw; else if (body !== undefined) { b = JSON.stringify(body); h['Content-Type'] = h['Content-Type'] || 'application/json'; }
  const res = await worker.fetch(new Request(ORIGIN + p, { method, headers: h, body: b }), env, {});
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function login(id, name) {
  discordUser = { id, username: name, global_name: name, avatar: null };
  const l = await worker.fetch(new Request(ORIGIN + '/auth/login?next=/%23/instances'), env, {});
  assert.strictEqual(l.status, 302);
  const oauth = l.headers.get('Set-Cookie').split(';')[0];
  const state = new URL(l.headers.get('Location')).searchParams.get('state');
  const cb = await worker.fetch(new Request(`${ORIGIN}/auth/callback?code=x&state=${state}`, { headers: { Cookie: oauth } }), env, {});
  assert.strictEqual(cb.status, 302);
  assert.strictEqual(cb.headers.get('Location'), '/#/instances');
  const sess = cb.headers.getSetCookie().find(c => c.startsWith('onyx_s=')).split(';')[0];
  return sess;
}

async function player(name, premium) {
  let serverId;
  if (premium) { serverId = (await call('GET', '/api/l/challenge')).data.serverId; joined.set(serverId, name); }
  const r = await call('POST', '/api/l/auth', { body: { name, serverId } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  return { Authorization: 'Bearer ' + r.data.token, verified: r.data.verified };
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}

console.log('Kopi Panel — pruebas');
let creator, other, iid, code1;

await test('utilidades y modelo', async () => {
  assert.strictEqual(normalizeCode('abcd-efgh-2345'), 'ABCD-EFGH-2345');
  assert.strictEqual(normalizeCode('abcdefgh2345'), 'ABCD-EFGH-2345');
  assert.strictEqual(normalizeCode('abc'), null);
  assert.ok(CODE_RE.test(randomCode()));
  const d = sanitize({ name: '  Mi evento  ', look: { backgroundAnimated: 'https://x.y/a.webm', accent: '#FF00aa', playColor: 'rojo' }, loader: { type: 'fabric', version: '0.16.5' },
    files: [{ path: '../x.jar', url: 'https://a/b' }, { path: 'mods/a.jar', url: 'https://a/a.jar', sha1: 'A'.repeat(40) }, { path: 'mods/a.jar', url: 'https://a/dup.jar' }],
    access: { staff: ['Kewinn', 'mal nombre', 'Kewinn'], maxPlayers: '30' } }, defaults());
  assert.strictEqual(d.name, 'Mi evento');
  assert.strictEqual(d.look.backgroundAnimated, null, 'animado sin fijo se quita');
  assert.strictEqual(d.look.accent, '#ff00aa');
  assert.strictEqual(d.look.playColor, '#5b67e8');
  assert.deepStrictEqual(d.files.map(f => f.path), ['mods/a.jar']);
  assert.strictEqual(d.files[0].sha1, 'a'.repeat(40));
  assert.deepStrictEqual(d.access.staff, ['Kewinn']);
  assert.strictEqual(d.access.maxPlayers, 30);
  assert.strictEqual(sanitize({ loader: { type: 'vanilla', version: '1' } }).loader.version, 'latest');
  // Explorador de archivos: carpetas vacías, fecha y proyecto de Modrinth
  const fm = sanitize({ files: [{ path: 'mods/a.jar', url: 'https://cdn.modrinth.com/data/AANobbMI/x/a.jar', at: 123, mr: 'AANobbMI' }, { path: '../malo', url: 'https://x' }], dirs: ['shaderpacks', 'shaderpacks', '../fuera', 'config/vacía'] });
  assert.deepStrictEqual(fm.files.map(f => [f.path, f.at, f.mr]), [['mods/a.jar', 123, 'AANobbMI']]);
  assert.deepStrictEqual(fm.dirs, ['shaderpacks', 'config/vacía']);
  assert.deepStrictEqual(toManifest({ id: 'x', data: JSON.stringify(fm), state: 'open', updated_at: 1 }, { name: 'S' }, 'https://p').dirs, ['shaderpacks', 'config/vacía']);
  assert.ok(cmpVersion('21.1.77', '21.1.9') > 0);
  assert.strictEqual(neoPrefix('1.21.1'), '21.1.');
  const D = 864e5, base = 10 * D;
  const days = peaksByDay([{ started_at: base + 1000, end_at: base + 5000 }, { started_at: base + 2000, end_at: base + 3000 }, { started_at: base + D + 10, end_at: base + D + 20 }], base, base + D + 100);
  assert.deepStrictEqual(days.map(x => x.peak), [2, 1]);
});

await test('login con Discord: el Creador recibe su studio', async () => {
  creator = await login('111', 'kew');
  const me = await call('GET', '/api/me', { cookie: creator });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.data.user.role, 'creator');
  assert.strictEqual(me.data.studios[0].id, 'onyx-studios');
  assert.strictEqual(me.data.studios[0].role, 'owner');
  assert.strictEqual(me.data.studios[0].name, 'Kopi Studio');
  // Onyx pasó a llamarse Kopi: el nombre antiguo se cambia solo al entrar
  await env.DB.prepare("UPDATE studios SET name = 'Onyx Studios' WHERE id = 'onyx-studios'").run();
  await login('111', 'kew');
  assert.strictEqual((await call('GET', '/api/me', { cookie: creator })).data.studios[0].name, 'Kopi Studio');
});

await test('sin sesión o sin invitación no se entra', async () => {
  assert.strictEqual((await call('GET', '/api/me')).status, 401);
  other = await login('222', 'otro');
  const me = await call('GET', '/api/me', { cookie: other });
  assert.strictEqual(me.data.studios.length, 0);
  assert.strictEqual(me.data.user.role, 'user');
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/instances', { cookie: other })).status, 403);
  assert.strictEqual((await call('GET', '/api/studios', { cookie: other })).status, 403);
});

await test('crear instancia (asistente) con código y lista de nombres', async () => {
  const bad = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, headers: { Origin: 'https://malo.com' }, body: {} });
  assert.strictEqual(bad.status, 403, 'bloquea peticiones de otra web');
  const r = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: {
    data: { name: 'Dedsafio', category: 'Serie', minecraft: '1.21.1', loader: { type: 'fabric' }, access: { codes: true, list: true, maxPlayers: 2 } },
    names: ['Kewinn', 'x!'] } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  iid = r.data.id;
  code1 = r.data.code;
  assert.ok(/^dedsafio-[0-9a-f]{4}$/.test(iid));
  assert.ok(CODE_RE.test(code1));
  const acc = await call('GET', `/api/s/onyx-studios/instances/${iid}/access`, { cookie: creator });
  assert.deepStrictEqual(acc.data.players.map(p => p.player_name), ['Kewinn']);
  const list = await call('GET', '/api/s/onyx-studios/instances', { cookie: creator });
  assert.strictEqual(list.data.instances[0].data.name, 'Dedsafio');
});

await test('editar instancia y códigos (cantidad, usos, duplicados)', async () => {
  const p = await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { data: { look: { accent: '#ec4899' } } } });
  assert.strictEqual(p.data.data.look.accent, '#ec4899');
  const c = await call('POST', `/api/s/onyx-studios/instances/${iid}/codes`, { cookie: creator, body: { quantity: 3, maxUses: 1 } });
  assert.strictEqual(c.data.codes.length, 3);
  const own = await call('POST', `/api/s/onyx-studios/instances/${iid}/codes`, { cookie: creator, body: { code: 'fest-2026-abcd', maxUses: 1 } });
  assert.deepStrictEqual(own.data.codes, ['FEST-2026-ABCD']);
  const dup = await call('POST', `/api/s/onyx-studios/instances/${iid}/codes`, { cookie: creator, body: { code: 'FEST2026ABCD' } });
  assert.strictEqual(dup.status, 409);
  const all = await call('GET', `/api/s/onyx-studios/instances/${iid}/codes`, { cookie: creator });
  assert.strictEqual(all.data.codes.length, 5);
});

await test('launcher: verificación premium y offline', async () => {
  const prem = await player('Steve', true);
  assert.strictEqual(prem.verified, true);
  const off = await player('Alex', false);
  assert.strictEqual(off.verified, false);
  const sid = (await call('GET', '/api/l/challenge')).data.serverId;
  const fake = await call('POST', '/api/l/auth', { body: { name: 'Notch', serverId: sid } });
  assert.strictEqual(fake.status, 401, 'sin join en Mojang no se verifica');
  const again = await call('POST', '/api/l/auth', { body: { name: 'Notch', serverId: sid } });
  assert.strictEqual(again.status, 400, 'un reto solo sirve una vez');
  assert.strictEqual((await call('GET', '/api/l/instances')).status, 401);
});

await test('launcher: canjear códigos con usos limitados', async () => {
  const a = await player('Ana', false), b = await player('Beto', false);
  const one = (await call('GET', `/api/s/onyx-studios/instances/${iid}/codes`, { cookie: creator })).data.codes.find(x => x.code === 'FEST-2026-ABCD');
  const r1 = await call('POST', '/api/l/redeem', { headers: a, body: { code: 'fest-2026-abcd' } });
  assert.strictEqual(r1.status, 200, JSON.stringify(r1.data));
  assert.strictEqual(r1.data.instance.name, 'Dedsafio');
  assert.strictEqual(r1.data.instance.loader.type, 'fabric');
  const r2 = await call('POST', '/api/l/redeem', { headers: b, body: { code: one.code } });
  assert.strictEqual(r2.status, 410, 'sin usos');
  const r3 = await call('POST', '/api/l/redeem', { headers: a, body: { code: one.code } });
  assert.strictEqual(r3.data.already, true, 'el mismo jugador no gasta otro uso');
  assert.strictEqual((await call('POST', '/api/l/redeem', { headers: a, body: { code: 'ZZZZ-ZZZZ-ZZZZ' } })).status, 404);
  const mine = await call('GET', '/api/l/instances', { headers: a });
  assert.deepStrictEqual(mine.data.instances.map(i => i.id), [iid]);
  assert.strictEqual((await call('GET', '/api/l/instances', { headers: b })).data.instances.length, 0);
  assert.strictEqual((await call('GET', `/api/l/instance/${iid}`, { headers: b })).status, 403);
});

await test('launcher: puerta de juego (lleno, bloqueada, staff, premium, latidos)', async () => {
  const a = await player('Ana', false);
  const k = await player('Kewinn', true); // está en la lista de nombres
  const s = await player('Staffer', false);
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { data: { access: { staff: ['Staffer'], maxPlayers: 1 } } } });
  const p1 = await call('POST', '/api/l/play', { headers: a, body: { instance: iid } });
  assert.strictEqual(p1.status, 200, JSON.stringify(p1.data));
  const p2 = await call('POST', '/api/l/play', { headers: k, body: { instance: iid } });
  assert.strictEqual(p2.data.reason, 'full');
  const seen = await call('GET', '/api/l/instances', { headers: s });
  assert.ok(seen.data.instances.some(i => i.id === iid), 'al staff le aparece la instancia sin código');
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { hidden: true } });
  assert.ok((await call('GET', '/api/l/instances', { headers: s })).data.instances.some(i => i.id === iid), 'el staff ve también las ocultas');
  assert.ok(!(await call('GET', '/api/l/instances', { headers: k })).data.instances.some(i => i.id === iid), 'oculta para el resto');
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { hidden: false } });
  const ps = await call('POST', '/api/l/play', { headers: s, body: { instance: iid } });
  assert.strictEqual(ps.data.ok, true, 'el staff entra aunque esté lleno');
  assert.strictEqual(ps.data.staff, true);
  // bloquear + sacar al cerrar
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'locked', data: { lockedMessage: 'Volvemos a las 18:00', schedule: { kickOnClose: true }, access: { maxPlayers: null } } } });
  const beat = await call('POST', '/api/l/beat', { headers: a, body: { play: p1.data.play } });
  assert.strictEqual(beat.data.kick, true);
  const beatStaff = await call('POST', '/api/l/beat', { headers: s, body: { play: ps.data.play } });
  assert.strictEqual(beatStaff.data.kick, false);
  const locked = await call('POST', '/api/l/play', { headers: k, body: { instance: iid } });
  assert.strictEqual(locked.data.reason, 'locked');
  assert.strictEqual(locked.data.message, 'Volvemos a las 18:00');
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'open', data: { access: { premiumOnly: true } } } });
  assert.strictEqual((await call('POST', '/api/l/play', { headers: a, body: { instance: iid } })).data.reason, 'premium');
  assert.strictEqual((await call('POST', '/api/l/play', { headers: k, body: { instance: iid } })).data.ok, true);
  await call('POST', '/api/l/end', { headers: a, body: { play: p1.data.play } });
  const ov = await call('GET', '/api/s/onyx-studios/overview', { cookie: creator });
  assert.strictEqual(ov.data.instances, 1);
  assert.ok(ov.data.plays >= 3);
  assert.ok(ov.data.playingNow >= 1);
  assert.ok(ov.data.chart.length >= 30);
});

await test('baneos por nombre e IP', async () => {
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { data: { access: { premiumOnly: false } } } });
  const a = await player('Ana', false);
  const ban = await call('POST', `/api/s/onyx-studios/instances/${iid}/bans`, { cookie: creator, body: { kind: 'name', value: 'Ana' } });
  assert.strictEqual(ban.status, 200);
  assert.strictEqual((await call('POST', '/api/l/play', { headers: a, body: { instance: iid } })).data.reason, 'banned');
  const acc = await call('GET', `/api/s/onyx-studios/instances/${iid}/access`, { cookie: creator });
  assert.ok(!acc.data.players.some(p => p.player_key === 'ana'), 'banear quita el acceso');
  // IP del studio
  const z = await player('Zoe', false);
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { data: { access: { public: true } } } });
  await call('POST', '/api/s/onyx-studios/bans', { cookie: creator, body: { kind: 'ip', value: '9.9.9.9' } });
  const fromIp = await worker.fetch(new Request(ORIGIN + '/api/l/play', { method: 'POST', headers: { ...z, 'CF-Connecting-IP': '9.9.9.9', 'Content-Type': 'application/json' }, body: JSON.stringify({ instance: iid }) }), env, {});
  assert.strictEqual((await fromIp.json()).reason, 'banned');
  const ok = await call('POST', '/api/l/play', { headers: z, body: { instance: iid } });
  assert.strictEqual(ok.data.ok, true, 'pública: entra sin código desde otra IP');
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/instances/${iid}/bans`, { cookie: creator, body: { kind: 'ip', value: 'hola' } })).status, 400);
});

await test('studios, invitaciones y roles', async () => {
  const st = await call('POST', '/api/studios', { cookie: creator, body: { name: 'Nova Estudios' } });
  assert.strictEqual(st.status, 201);
  const info = await call('GET', `/api/invites/${st.data.invite}`);
  assert.strictEqual(info.data.studio, 'Nova Estudios');
  const acc = await call('POST', `/api/invites/${st.data.invite}/accept`, { cookie: other });
  assert.strictEqual(acc.status, 200);
  assert.strictEqual((await call('POST', `/api/invites/${st.data.invite}/accept`, { cookie: other })).status, 404, 'una invitación solo vale una vez');
  const me = await call('GET', '/api/me', { cookie: other });
  assert.deepStrictEqual(me.data.studios.map(s => [s.id, s.role]), [[st.data.studio.id, 'owner']]);
  // invitar a un editor y a un lector
  const sid = st.data.studio.id;
  const invV = await call('POST', `/api/s/${sid}/invites`, { cookie: other, body: { role: 'viewer' } });
  const viewer = await login('333', 'lector');
  await call('POST', `/api/invites/${invV.data.token}/accept`, { cookie: viewer });
  assert.strictEqual((await call('GET', `/api/s/${sid}/instances`, { cookie: viewer })).status, 200);
  assert.strictEqual((await call('POST', `/api/s/${sid}/instances`, { cookie: viewer, body: { data: { name: 'x' } } })).status, 403, 'el lector no crea');
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/instances`, { cookie: viewer })).status, 403, 'no ve otros studios');
  const mem = await call('GET', `/api/s/${sid}/members`, { cookie: other });
  assert.strictEqual(mem.data.members.length, 2);
  assert.strictEqual((await call('DELETE', `/api/s/${sid}/members/222`, { cookie: other })).status, 400, 'no se queda sin dueño');
  assert.strictEqual((await call('PATCH', `/api/s/${sid}/members/333`, { cookie: other, body: { role: 'editor' } })).status, 200);
});

await test('archivos subidos y papelera', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const up = await call('POST', '/api/s/onyx-studios/media?name=fondo.png', { cookie: creator, headers: { 'Content-Type': 'image/png' }, raw: png });
  assert.strictEqual(up.status, 201, JSON.stringify(up.data));
  assert.strictEqual(up.data.sha1.length, 40);
  const get = await worker.fetch(new Request(ORIGIN + up.data.url), env, {});
  assert.strictEqual(get.headers.get('Content-Type'), 'image/png');
  assert.deepStrictEqual(new Uint8Array(await get.arrayBuffer()), png);
  assert.strictEqual((await call('POST', '/api/s/onyx-studios/media?name=x.exe', { cookie: creator, headers: { 'Content-Type': 'application/x-msdownload' }, raw: png })).status, 415);
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { data: { look: { background: up.data.url } } } });
  const man = (await call('GET', `/api/l/instance/${iid}`, { headers: await player('Zoe', false) })).data.instance;
  assert.strictEqual(man.banner, ORIGIN + up.data.url, 'el manifiesto lleva la dirección completa');
  await call('DELETE', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator });
  const trash = await call('GET', '/api/s/onyx-studios/trash', { cookie: creator });
  assert.deepStrictEqual(trash.data.items.map(i => i.id), [iid]);
  assert.strictEqual((await call('GET', `/api/l/instance/${iid}`, { headers: await player('Zoe', false) })).status, 404);
  await call('POST', `/api/s/onyx-studios/instances/${iid}/restore`, { cookie: creator });
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/trash', { cookie: creator })).data.items.length, 0);
});

await test('cerrar sesión', async () => {
  const r = await call('POST', '/auth/logout', { cookie: other });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await call('GET', '/api/me', { cookie: other })).status, 401);
});

await test('eventos y calendario público', async () => {
  const day = 864e5, t0 = Date.now() + 2 * day;
  const bad = await call('POST', '/api/s/onyx-studios/events', { cookie: creator, body: { title: '', starts_at: t0 } });
  assert.strictEqual(bad.status, 400);
  const e = await call('POST', '/api/s/onyx-studios/events', { cookie: creator, body: { title: 'Dedsafio 4', category: 'Torneo', color: '#ef4444', starts_at: t0, ends_at: t0 + day, instance_id: iid, description: 'Final' } });
  assert.strictEqual(e.status, 201, JSON.stringify(e.data));
  await call('POST', '/api/s/onyx-studios/events', { cookie: creator, body: { title: 'Privado', starts_at: t0, public: false } });
  const mine = await call('GET', '/api/s/onyx-studios/events', { cookie: creator });
  assert.strictEqual(mine.data.events.length, 2);
  assert.strictEqual(mine.data.events.find(x => x.title === 'Dedsafio 4').instance_name, 'Dedsafio');
  const pub = await call('GET', '/api/public/events');
  assert.deepStrictEqual(pub.data.events.map(x => x.title), ['Dedsafio 4'], 'solo los públicos');
  assert.strictEqual(pub.data.events[0].studio, 'Kopi Studio');
  assert.strictEqual(pub.headers.get('Access-Control-Allow-Origin'), '*');
  const upd = await call('PATCH', `/api/s/onyx-studios/events/${e.data.id}`, { cookie: creator, body: { title: 'Dedsafio 4: Final' } });
  assert.strictEqual(upd.status, 200);
  const ov = await call('GET', '/api/s/onyx-studios/overview', { cookie: creator });
  assert.strictEqual(ov.data.events, 2);
  await call('DELETE', `/api/s/onyx-studios/events/${e.data.id}`, { cookie: creator });
  assert.strictEqual((await call('GET', '/api/public/events')).data.events.length, 0);
});

await test('histórico y referidos', async () => {
  const h = await call('GET', '/api/s/onyx-studios/history', { cookie: creator });
  assert.strictEqual(h.status, 200);
  assert.ok(h.data.plays >= 3);
  assert.strictEqual(h.data.records[0].instance, 'Dedsafio');
  assert.ok(h.data.topDays[0].peak >= 1);
  const p = await player('Nuevo', false);
  assert.strictEqual((await call('POST', '/api/l/referral', { headers: p, body: { studio: 'onyx-studios' } })).status, 200);
  await call('POST', '/api/l/referral', { headers: p, body: { studio: 'onyx-studios' } });
  assert.strictEqual((await call('POST', '/api/l/referral', { headers: p, body: { studio: 'no-existe' } })).status, 404);
  const r = await call('GET', '/api/s/onyx-studios/referrals', { cookie: creator });
  assert.strictEqual(r.data.total, 1, 'un jugador cuenta una sola vez');
  assert.strictEqual(r.data.last[0].player_name, 'Nuevo');
});

await test('estado de los servicios (comprobación automática)', async () => {
  const { runChecks } = await import('../src/extra.js');
  let calls = 0;
  await runChecks(env, async (u) => { calls++; return new Response('', { status: u.includes('github') ? 503 : 200 }); });
  assert.strictEqual(calls, 2);
  const st = await call('GET', '/api/public/status');
  const by = Object.fromEntries(st.data.services.map(s => [s.id, s]));
  assert.strictEqual(by.web.up, true);
  assert.strictEqual(by.launcher.up, false);
  assert.strictEqual(by.panel.up, true);
  assert.strictEqual(st.data.allUp, false);
  assert.strictEqual(by.web.days.length, 90);
  assert.strictEqual(by.launcher.uptime, 0);
});

await test('Creador: resumen, studios, límites, suspender, usuarios, jugadores', async () => {
  other = await login('222', 'otro');
  // solo el Creador
  assert.strictEqual((await call('GET', '/api/onyx/overview', { cookie: other })).status, 403);
  const ov = await call('GET', '/api/onyx/overview', { cookie: creator });
  assert.strictEqual(ov.status, 200, JSON.stringify(ov.data));
  assert.ok(ov.data.studios >= 2 && ov.data.instances >= 1 && ov.data.chart.length >= 30);
  assert.ok(ov.data.activity.length > 0, 'hay actividad registrada');
  const list = (await call('GET', '/api/onyx/studios', { cookie: creator })).data.studios;
  const nova = list.find(x => x.name === 'Nova Estudios');
  assert.ok(nova && nova.owners.length === 1);
  // límite de instancias
  await call('PATCH', `/api/onyx/studios/${nova.id}`, { cookie: creator, body: { maxInstances: 1, maxStorageMb: 10 } });
  const mk = (n) => call('POST', `/api/s/${nova.id}/instances`, { cookie: other, body: { data: { name: n, minecraft: '1.21.1' } } });
  assert.strictEqual((await mk('Primera')).status, 201);
  const second = await mk('Segunda');
  assert.strictEqual(second.status, 403);
  assert.strictEqual(second.data.error, 'limit');
  // espacio
  const big = await call('POST', `/api/s/${nova.id}/media?name=x.bin`, { cookie: other, raw: new Uint8Array(11 * 1024 * 1024), headers: { 'Content-Type': 'application/octet-stream' } });
  assert.strictEqual(big.status, 413);
  assert.strictEqual(big.data.error, 'quota');
  const use = await call('GET', `/api/s/${nova.id}/usage`, { cookie: other });
  assert.strictEqual(use.data.maxInstances, 1);
  // suspender: solo lectura para el studio y no se juega
  await call('PATCH', `/api/onyx/studios/${nova.id}`, { cookie: creator, body: { suspended: true, reason: 'Pruebas' } });
  const me = (await call('GET', '/api/me', { cookie: other })).data;
  assert.strictEqual(me.studios.find(x => x.id === nova.id).suspended, true);
  const blockedEdit = await call('POST', `/api/s/${nova.id}/invites`, { cookie: other, body: { role: 'editor' } });
  assert.strictEqual(blockedEdit.status, 423);
  assert.strictEqual((await call('GET', `/api/s/${nova.id}/instances`, { cookie: other })).status, 200, 'puede ver');
  assert.strictEqual((await call('PATCH', `/api/onyx/studios/onyx-studios`, { cookie: creator, body: { suspended: true } })).status, 400);
  await call('PATCH', `/api/onyx/studios/${nova.id}`, { cookie: creator, body: { suspended: false, maxInstances: null } });
  assert.strictEqual((await mk('Segunda')).status, 201, 'sin límite ya se puede');
  // usuarios: bloquear cierra la sesión y no deja volver a entrar
  const users = (await call('GET', '/api/onyx/users?q=otro', { cookie: creator })).data.users;
  const u2 = users.find(x => x.id === '222');
  assert.ok(u2 && u2.studios.length >= 1);
  assert.strictEqual((await call('PATCH', '/api/onyx/users/111', { cookie: creator, body: { blocked: true } })).status, 400, 'no se bloquea al Creador');
  await call('PATCH', '/api/onyx/users/222', { cookie: creator, body: { blocked: true } });
  assert.strictEqual((await call('GET', '/api/me', { cookie: other })).status, 401);
  discordUser = { id: '222', username: 'otro', global_name: 'otro', avatar: null };
  const l = await worker.fetch(new Request(ORIGIN + '/auth/login'), env, {});
  const state = new URL(l.headers.get('Location')).searchParams.get('state');
  const cb = await worker.fetch(new Request(`${ORIGIN}/auth/callback?code=x&state=${state}`, { headers: { Cookie: l.headers.get('Set-Cookie').split(';')[0] } }), env, {});
  assert.strictEqual(cb.headers.get('Location'), '/#/login?error=blocked');
  await call('PATCH', '/api/onyx/users/222', { cookie: creator, body: { blocked: false } });
  other = await login('222', 'otro');
  // buscar jugador en todo Kopi
  const pl = (await call('GET', '/api/onyx/players?q=ana', { cookie: creator })).data.players;
  assert.ok(pl.some(x => x.key === 'ana'));
  // actividad del studio (solo admins) y global
  const act = (await call('GET', `/api/s/${nova.id}/activity`, { cookie: other })).data.items.map(x => x.action);
  assert.ok(act.includes('studio.suspend') && act.includes('instance.create') && act.includes('studio.limits'), act.join(','));
  const glob = (await call('GET', '/api/onyx/audit?q=Segunda', { cookie: creator })).data.items;
  assert.ok(glob.length >= 1);
});

await test('Creador: avisos del launcher, mantenimiento y baneo global', async () => {
  const n = await call('POST', '/api/onyx/notices', { cookie: creator, body: { title: 'Nueva versión 1.3', body: 'Trae cosas', kind: 'success', url: 'https://onyxclient.site' } });
  assert.strictEqual(n.status, 201, JSON.stringify(n.data));
  const nova = (await call('GET', '/api/onyx/studios', { cookie: creator })).data.studios.find(x => x.name === 'Nova Estudios');
  await call('POST', `/api/s/${nova.id}/notices`, { cookie: other, body: { title: 'Evento el sábado', kind: 'event' } });
  assert.strictEqual((await call('POST', '/api/onyx/notices', { cookie: creator, body: { title: 'x', url: 'http://inseguro' } })).status, 400);
  const pubAll = (await call('GET', '/api/public/notices')).data.notices;
  assert.deepStrictEqual(pubAll.map(x => x.title), ['Nueva versión 1.3'], 'sin studios solo los de todo Kopi');
  const pubNova = (await call('GET', `/api/public/notices?studios=${nova.id}`)).data.notices;
  assert.strictEqual(pubNova.length, 2);
  assert.strictEqual(pubNova.find(x => x.kind === 'event').author, 'Nova Estudios');
  // mantenimiento: nadie juega salvo el staff
  await call('PATCH', '/api/onyx/settings', { cookie: creator, body: { maintenance: { on: true, message: 'Volvemos en 10 minutos' } } });
  assert.strictEqual((await call('GET', '/api/public/notices')).data.notices[0].id, 'maintenance');
  const z = await player('Zoe', false);
  const pm = await call('POST', '/api/l/play', { headers: z, body: { instance: iid } });
  assert.strictEqual(pm.data.reason, 'maintenance');
  assert.strictEqual(pm.data.message, 'Volvemos en 10 minutos');
  await call('PATCH', '/api/onyx/settings', { cookie: creator, body: { maintenance: { on: false } } });
  assert.strictEqual((await call('POST', '/api/l/play', { headers: z, body: { instance: iid } })).data.ok, true);
  // baneo en todo Kopi
  await call('POST', '/api/onyx/bans', { cookie: creator, body: { kind: 'name', value: 'Zoe' } });
  assert.strictEqual((await call('POST', '/api/l/play', { headers: z, body: { instance: iid } })).data.reason, 'banned');
  assert.ok(!(await call('GET', '/api/l/instances', { headers: z })).data.instances.length);
  await call('DELETE', '/api/onyx/bans/zoe?kind=name', { cookie: creator });
  assert.strictEqual((await call('POST', '/api/l/play', { headers: z, body: { instance: iid } })).data.ok, true);
  assert.strictEqual((await call('GET', '/api/onyx/bans', { cookie: other })).status, 403);
});

await test('Launchers de marca: permiso, ficha, compilar y descargas', async () => {
  other = await login('222', 'otro');
  const nova = (await call('GET', '/api/onyx/studios', { cookie: creator })).data.studios.find(x => x.name === 'Nova Estudios');
  // sin permiso del Creador no se puede
  assert.strictEqual((await call('GET', `/api/s/${nova.id}/brand`, { cookie: other })).data.allowed, false);
  assert.strictEqual((await call('PUT', `/api/s/${nova.id}/brand`, { cookie: other, body: { name: 'Nova Launcher' } })).status, 403);
  await call('PATCH', `/api/onyx/studios/${nova.id}`, { cookie: creator, body: { brandAllowed: true } });
  assert.strictEqual((await call('PUT', `/api/s/${nova.id}/brand`, { cookie: other, body: { name: 'Kopi Fake' } })).status, 400, 'no puede llamarse Kopi');
  const sv = await call('PUT', `/api/s/${nova.id}/brand`, { cookie: other, body: { name: 'Nova Launcher', accent: '#F59E0B', discord: 'http://inseguro', web: 'https://nova.gg' } });
  assert.strictEqual(sv.status, 201, JSON.stringify(sv.data));
  const id = sv.data.id;
  assert.strictEqual(id, 'nova-launcher');
  // compilar: sin icono no; con icono avisa a GitHub
  assert.strictEqual((await call('POST', `/api/s/${nova.id}/brand/build`, { cookie: other })).data.error, 'icon');
  const icon = await call('POST', `/api/s/${nova.id}/media?name=icon.png`, { cookie: other, raw: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), headers: { 'Content-Type': 'image/png' } });
  await call('PUT', `/api/s/${nova.id}/brand`, { cookie: other, body: { icon: icon.data.url } });
  const sent = [];
  let dispatched = false;
  env.GITHUB_TOKEN = 'tok';
  env.GITHUB_FETCH = async (u, init = {}) => {
    sent.push([init.method || 'GET', u, init.body]);
    if (u.endsWith('/dispatches')) { dispatched = true; return new Response(null, { status: 204 }); }
    if (u.includes('/runs')) return new Response(JSON.stringify({ workflow_runs: !dispatched ? [] : [{ display_title: `Marca ${id}`, status: 'in_progress', conclusion: null, html_url: 'https://github.com/x', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] }), { status: 200 });
    if (u.includes('/releases/tags/brand-')) return new Response(JSON.stringify({ assets: [
      { name: 'Nova-Launcher-Setup-1.3.0.exe', browser_download_url: 'https://g/x.exe', size: 90e6, updated_at: new Date().toISOString() },
      { name: 'Nova-Launcher-1.3.0-arm64.dmg', browser_download_url: 'https://g/a.dmg', size: 95e6, updated_at: new Date().toISOString() },
      { name: 'latest.yml', browser_download_url: 'https://g/l.yml', size: 300, updated_at: new Date().toISOString() }] }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const b = await call('POST', `/api/s/${nova.id}/brand/build`, { cookie: other });
  assert.strictEqual(b.status, 200, JSON.stringify(b.data));
  assert.ok(sent.some(([m, u, body]) => m === 'POST' && u.endsWith('/repos/kewinnsinhoo/onyx-client/actions/workflows/build-brand.yml/dispatches') && JSON.parse(body).inputs.brand === id));
  assert.strictEqual((await call('POST', `/api/s/${nova.id}/brand/build`, { cookie: other })).status, 409, 'no dos a la vez');
  const st = (await call('GET', `/api/s/${nova.id}/brand`, { cookie: other })).data;
  assert.strictEqual(st.run.status, 'in_progress');
  assert.deepStrictEqual(st.downloads.files.map(f => f.os), ['windows', 'mac-arm']);
  assert.strictEqual(st.downloads.version, '1.3.0');
  assert.strictEqual(st.brand.discord, null, 'solo enlaces https');
  // ficha pública para GitHub y el launcher (imágenes con dirección completa)
  const pub = (await call('GET', `/api/public/brands/${id}/build`)).data.brand;
  assert.strictEqual(pub.name, 'Nova Launcher');
  assert.strictEqual(pub.accent, '#f59e0b');
  assert.ok(pub.icon.startsWith('https://panel.onyxclient.site/m/'));
  assert.ok((await call('GET', '/api/public/brands')).data.brands.some(x => x.id === id), 'ya compilado: sale en la lista para recompilar');
  // página de descarga
  assert.strictEqual((await call('GET', `/api/public/brands/${id}/downloads`)).data.files.length, 2);
  // el Creador ve todas y puede recompilar
  const all = (await call('GET', '/api/onyx/brands', { cookie: creator })).data;
  assert.strictEqual(all.brands[0].id, id);
  await call('PATCH', `/api/onyx/studios/${nova.id}`, { cookie: creator, body: { brandAllowed: false } });
  assert.strictEqual((await call('GET', `/api/public/brands/${id}/build`)).status, 403, 'sin permiso GitHub no puede fabricarlo');
  delete env.GITHUB_TOKEN; delete env.GITHUB_FETCH;
});

await test('Kopi Skins: skins en los servidores (premium y no premium)', async () => {
  // PNG mínimo de 64×64 (solo cabecera: el panel comprueba firma y tamaño)
  const png = (w, h, extra = 0) => { const b = new Uint8Array(33 + extra); b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); const dv = new DataView(b.buffer); dv.setUint32(16, w); dv.setUint32(20, h); return Buffer.from(b).toString('base64'); };
  const pepe = await player('PepeOff', false);
  const key = 'k'.repeat(32);
  const up = await call('POST', '/api/l/skin', { headers: pepe, body: { key, png: png(64, 64), variant: 'slim' } });
  assert.strictEqual(up.status, 200, JSON.stringify(up.data));
  assert.strictEqual(mineskinCalls, 1);
  const same = await call('POST', '/api/l/skin', { headers: pepe, body: { key, png: png(64, 64), variant: 'slim' } });
  assert.strictEqual(same.data.unchanged, true, 'la misma skin no se vuelve a convertir');
  assert.strictEqual(mineskinCalls, 1);
  // otro launcher con el mismo nombre no puede cambiarla
  const thief = await player('PepeOff', false);
  assert.strictEqual((await call('POST', '/api/l/skin', { headers: thief, body: { key: 'x'.repeat(32), png: png(64, 64, 1) } })).status, 403);
  assert.strictEqual((await call('POST', '/api/l/skin', { headers: pepe, body: { key, png: png(32, 32) } })).status, 400, 'tamaño no válido');
  assert.strictEqual((await call('POST', '/api/l/skin', { headers: pepe, body: { key: 'corta', png: png(64, 64) } })).status, 400, 'clave obligatoria');
  // el servidor la pide por nombre
  const pub = await call('GET', '/api/public/skin/pepeoff');
  assert.strictEqual(pub.status, 200);
  assert.deepStrictEqual([pub.data.source, pub.data.variant, pub.data.signature], ['kopi', 'slim', 'firma-mineskin']);
  assert.strictEqual(pub.headers.get('Access-Control-Allow-Origin'), '*');
  // premium: su skin real de Mojang, sin subir nada
  const tech = await call('GET', '/api/public/skin/Technoblade');
  assert.deepStrictEqual([tech.data.source, tech.data.value, tech.data.signature], ['premium', 'cHJlbWl1bQ==', 'firma-mojang']);
  // Mojang bloquea la búsqueda por nombre y sessionserver: se usa Ashcon
  const dream = await call('GET', '/api/public/skin/Dream');
  assert.deepStrictEqual([dream.data.source, dream.data.name, dream.data.signature], ['premium', 'Dream', 'firma-ashcon']);
  // premium que entró con Kopi: su UUID verificado, sin buscar por nombre
  const steve = await call('GET', '/api/public/skin/steve?debug=1');
  assert.strictEqual(steve.data.premium, true, JSON.stringify(steve.data));
  assert.deepStrictEqual(steve.data.trace[0], ['kopi', 'uuid']);
  assert.strictEqual((await call('GET', '/api/public/skin/Steve')).data.signature, 'firma-steve');
  assert.strictEqual((await call('GET', '/api/public/skin/NadieAqui')).status, 404);
  assert.strictEqual((await call('GET', '/api/public/skin/NadieAqui?debug=1')).data.trace[0][0], 'cache', 'el «no es premium» se recuerda');
  assert.strictEqual((await call('GET', '/api/public/skin/no-valido!')).status, 400);
  // una cuenta premium no sube nada (usa la oficial)
  const prem = await player('Steve', true);
  assert.strictEqual((await call('POST', '/api/l/skin', { headers: prem, body: { key, png: png(64, 64) } })).data.premium, true);
  // quitar la skin
  await call('DELETE', '/api/l/skin', { headers: pepe, body: { key } });
  assert.strictEqual((await call('GET', '/api/public/skin/PepeOff')).status, 404);
});

console.log(`\n${passed} pruebas superadas${process.exitCode ? ' (con fallos)' : ''}`);
