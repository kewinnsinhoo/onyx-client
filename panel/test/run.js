// Pruebas del servidor del panel con D1/KV simulados. Ejecutar: node test/run.js
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { peaksByDay } from '../src/worker.js';
import { sanitize, defaults, gate, toManifest } from '../src/model.js';
import { normalizeCode, randomCode, CODE_RE } from '../src/util.js';
import { cmpVersion, neoPrefix } from '../src/meta.js';
import { makeD1, makeKV } from '../dev/shim.js';
import { spriteFrameCount, spriteFrameAt, CAPE_IDS } from '../src/capes.js';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

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
    if (n.toLowerCase() === 'pixelpro') return new Response(JSON.stringify({ id: '11111111111111111111111111111111', name: 'PixelPro' }), { status: 200 });
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
    if (id === '11111111111111111111111111111111') return new Response(JSON.stringify({ id, name: 'PixelPro', properties: [{ name: 'textures', signature: 'firma-pixel', value: btoa(JSON.stringify({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/pixelpro', metadata: { model: 'slim' } } } })) }] }), { status: 200 });
    if (id === 'abcdef0123456789abcdef0123456789') return new Response(JSON.stringify({ id, name: 'Steve', properties: [{ name: 'textures', value: 'c3RldmU=', signature: 'firma-steve' }] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'b876ec32e396476ba1158438d83c67d4', name: 'Technoblade', properties: [{ name: 'textures', value: 'cHJlbWl1bQ==', signature: 'firma-mojang' }] }), { status: 200 });
  }
  if (s === 'https://api.mineskin.org/v2/generate') {
    mineskinCalls++;
    const f = opts.body;
    if (!(f instanceof FormData) || !f.get('file') || !['classic', 'slim'].includes(f.get('variant'))) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({ success: true, skin: { texture: { data: { value: 'a29waS0' + mineskinCalls, signature: 'firma-mineskin' } } } }), { status: 200 });
  }
  // Directos falsos: «ana» en directo en Twitch, «leo» en Kick; TikTok no responde (se usa lo marcado a mano)
  if (s.startsWith('https://decapi.me/twitch/')) {
    streamCalls++;
    const [, kind, h] = s.split('/twitch/')[1].match(/^(\w+)\/(.+)$/) || [];
    if (h !== 'ana') return new Response(`${h} is offline`, { status: 200 });
    return new Response(kind === 'uptime' ? '1 hour, 3 minutes' : kind === 'title' ? 'Día 3 de IGNITE' : '1234', { status: 200 });
  }
  if (s.startsWith('https://kick.com/api/v2/channels/')) {
    streamCalls++;
    const h = s.split('/').pop();
    return new Response(JSON.stringify({ slug: h, livestream: h === 'leo' ? { session_title: 'Kick en directo', viewer_count: 77, thumbnail: { url: 'https://img/kick.jpg' }, created_at: '2026-11-20T10:00:00Z' } : null }), { status: 200 });
  }
  if (s === 'https://textures.minecraft.net/texture/pixelpro') return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } });
  if (s.startsWith('https://www.tiktok.com/api-live/')) { streamCalls++; return new Response('<html>bloqueado</html>', { status: 403 }); }
  throw new Error('fetch inesperado: ' + s);
};
let streamCalls = 0;
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
  // el launcher sabe quién es staff: a él le enseña «Jugar» aunque esté bloqueada; a los demás, no
  const forStaff = (await call('GET', '/api/l/instances', { headers: s })).data.instances.find(i => i.id === iid);
  assert.deepStrictEqual([forStaff.state, forStaff.staff], ['locked', true]);
  assert.strictEqual((await call('GET', `/api/l/instance/${iid}`, { headers: s })).data.instance.staff, true);
  assert.strictEqual((await call('GET', `/api/l/instance/${iid}`, { headers: k })).data.instance.staff, false);
  const staffLocked = await call('POST', '/api/l/play', { headers: s, body: { instance: iid } });
  assert.strictEqual(staffLocked.data.ok, true, 'el staff entra aunque esté bloqueada');
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

await test('archivos grandes: subida en trozos', async () => {
  env.UPLOAD_CHUNK = '1000';
  const big = new Uint8Array(2500).map((_, i) => (i * 7) % 256);
  const base = '/api/s/onyx-studios/media/upload';
  const st = await call('POST', base, { cookie: creator, body: { name: 'pack grande.zip', type: 'application/zip', size: big.length } });
  assert.strictEqual(st.status, 201, JSON.stringify(st.data));
  assert.deepStrictEqual([st.data.chunk, st.data.parts], [1000, 3]);
  const id = st.data.id;
  const part = (n) => big.slice(n * 1000, (n + 1) * 1000);
  // un trozo incompleto no vale; otro usuario sin permiso tampoco puede subir
  assert.strictEqual((await call('PUT', `${base}/${id}/0`, { cookie: creator, raw: big.slice(0, 10), headers: { 'Content-Type': 'application/octet-stream' } })).status, 400);
  assert.strictEqual((await call('PUT', `${base}/${id}/0`, { cookie: other, raw: part(0), headers: { 'Content-Type': 'application/octet-stream' } })).status, 403);
  for (const n of [2, 0]) assert.strictEqual((await call('PUT', `${base}/${id}/${n}`, { cookie: creator, raw: part(n), headers: { 'Content-Type': 'application/octet-stream' } })).status, 200);
  assert.strictEqual((await call('POST', `${base}/${id}/done`, { cookie: creator })).status, 400, 'falta un trozo');
  await call('PUT', `${base}/${id}/1`, { cookie: creator, raw: part(1), headers: { 'Content-Type': 'application/octet-stream' } });
  const done = await call('POST', `${base}/${id}/done`, { cookie: creator });
  assert.strictEqual(done.status, 201, JSON.stringify(done.data));
  const crypto = await import('node:crypto');
  assert.strictEqual(done.data.sha1, crypto.createHash('sha1').update(big).digest('hex'), 'huella del archivo entero');
  assert.strictEqual(done.data.size, 2500);
  // se descarga entero (el launcher no nota la diferencia)
  const get = await worker.fetch(new Request(ORIGIN + done.data.url), env, {});
  assert.strictEqual(get.headers.get('Content-Length'), '2500');
  assert.deepStrictEqual(new Uint8Array(await get.arrayBuffer()), big);
  assert.ok((await call('GET', '/api/s/onyx-studios/media', { cookie: creator })).data.media.some(m => m.id === id && m.size === 2500));
  // la subida ya no sirve otra vez; demasiado grande no; borrar quita todos los trozos
  assert.strictEqual((await call('POST', `${base}/${id}/done`, { cookie: creator })).status, 404);
  assert.strictEqual((await call('POST', base, { cookie: creator, body: { name: 'x.zip', type: 'application/zip', size: 600 * 1048576 } })).status, 413);
  assert.strictEqual((await call('DELETE', `/api/s/onyx-studios/media/${id}`, { cookie: creator })).status, 200);
  assert.ok(![...env.MEDIA._map.keys()].some(k => k.startsWith(`m:${id}`)), 'sin trozos sueltos');
  assert.strictEqual((await worker.fetch(new Request(ORIGIN + done.data.url), env, {})).status, 404);
  delete env.UPLOAD_CHUNK;
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
  // aplicación de Discord propia (solo números)
  await call('PUT', `/api/s/${nova.id}/brand`, { cookie: other, body: { discordClientId: '1234567890123456789' } });
  assert.strictEqual((await call('GET', `/api/public/brands/${id}`)).data.brand.discordClientId, '1234567890123456789');
  await call('PUT', `/api/s/${nova.id}/brand`, { cookie: other, body: { discordClientId: 'no-vale' } });
  assert.strictEqual((await call('GET', `/api/public/brands/${id}`)).data.brand.discordClientId, null);
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

await test('Launcher de marca: el creador de Kopi compila en su studio (sin permiso previo) y GitHub puede fabricarlo', async () => {
  const studios = (await call('GET', '/api/onyx/studios', { cookie: creator })).data.studios;
  const kopi = studios.find(x => x.name === 'Kopi Studio') || studios.find(x => !x.brandAllowed);
  await call('PATCH', `/api/onyx/studios/${kopi.id}`, { cookie: creator, body: { brandAllowed: false } });
  assert.strictEqual((await call('GET', `/api/s/${kopi.id}/brand`, { cookie: creator })).data.allowed, true, 'el creador siempre puede');
  const sv = await call('PUT', `/api/s/${kopi.id}/brand`, { cookie: creator, body: { name: 'Kopi Prueba Marca' } });
  assert.ok(sv.status === 201 || sv.status === 200 || sv.status === 400, JSON.stringify(sv.data));
  let id = sv.data.id;
  if (sv.status === 400) { const r2 = await call('PUT', `/api/s/${kopi.id}/brand`, { cookie: creator, body: { name: 'Lince Launcher' } }); id = r2.data.id; }
  const icon = await call('POST', `/api/s/${kopi.id}/media?name=icon.png`, { cookie: creator, raw: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), headers: { 'Content-Type': 'image/png' } });
  await call('PUT', `/api/s/${kopi.id}/brand`, { cookie: creator, body: { icon: icon.data.url } });
  assert.strictEqual((await call('GET', `/api/public/brands/${id}/build`)).status, 403, 'antes de compilar: sin permiso');
  env.GITHUB_TOKEN = 'tok';
  env.GITHUB_FETCH = async (u) => (u.endsWith('/dispatches') ? new Response(null, { status: 204 }) : u.includes('/runs') ? new Response('{"workflow_runs":[]}', { status: 200 }) : new Response('{}', { status: 404 }));
  const b = await call('POST', `/api/s/${kopi.id}/brand/build`, { cookie: creator });
  assert.strictEqual(b.status, 200, JSON.stringify(b.data));
  const pub = await call('GET', `/api/public/brands/${id}/build`);
  assert.strictEqual(pub.status, 200, 'GitHub ya puede leer la marca para fabricarla');
  assert.strictEqual((await call('GET', '/api/onyx/studios', { cookie: creator })).data.studios.find(x => x.id === kopi.id).brandAllowed, true);
  delete env.GITHUB_TOKEN; delete env.GITHUB_FETCH;
});

await test('Launcher de marca: el Creador lo mueve a otro studio (conserva enlace y se recompila)', async () => {
  const list = (await call('GET', '/api/onyx/brands', { cookie: creator })).data.brands;
  const br = list.find(b => b.id === 'nova-launcher');
  await call('POST', '/api/onyx/studios', { cookie: creator, body: { name: 'Nova Studios Prueba' } });
  const studios = (await call('GET', '/api/onyx/studios', { cookie: creator })).data.studios;
  const withBrand = new Set(list.map(b => b.studio));
  const free = studios.find(x => x.name === 'Nova Studios Prueba');
  assert.ok(br && free, 'hay un launcher y un studio libre');
  assert.strictEqual((await call('POST', `/api/onyx/brands/${br.id}/move`, { cookie: other, body: { studio: free.id } })).status, 403, 'solo el Creador');
  const busyTo = list.find(b => b.id !== br.id);
  if (busyTo) assert.strictEqual((await call('POST', `/api/onyx/brands/${br.id}/move`, { cookie: creator, body: { studio: busyTo.studio } })).status, 409, 'un studio, un launcher');
  let dispatched = 0;
  env.GITHUB_TOKEN = 'tok';
  env.GITHUB_FETCH = async (u) => (u.endsWith('/dispatches') ? (dispatched++, new Response(null, { status: 204 })) : new Response('{"workflow_runs":[]}', { status: 200 }));
  const r = await call('POST', `/api/onyx/brands/${br.id}/move`, { cookie: creator, body: { studio: free.id } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.deepStrictEqual([r.data.studio.id, r.data.rebuilt, dispatched], [free.id, true, 1]);
  const after = (await call('GET', '/api/onyx/brands', { cookie: creator })).data.brands.find(b => b.id === br.id);
  assert.strictEqual(after.studio, free.id, 'mismo id (mismo enlace), studio nuevo');
  assert.strictEqual((await call('GET', `/api/public/brands/${br.id}/build`)).status, 200, 'GitHub puede fabricarlo en el studio nuevo');
  delete env.GITHUB_TOKEN; delete env.GITHUB_FETCH;
});

await test('Kopi Skins: skins en los servidores (premium y no premium)', async () => {
  // opción de la instancia (activada por defecto; las instancias antiguas sin el campo también)
  assert.strictEqual(defaults().kopiSkins, true);
  assert.strictEqual(sanitize({ kopiSkins: false }).kopiSkins, false);
  const old = defaults(); delete old.kopiSkins;
  assert.strictEqual(toManifest({ id: 'x', data: JSON.stringify(old), state: 'open' }, null, ORIGIN).kopiSkins, true);
  assert.strictEqual(toManifest({ id: 'x', data: JSON.stringify(sanitize({ kopiSkins: false })), state: 'open' }, null, ORIGIN).kopiSkins, false);
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
  // el mod del launcher (CustomSkinLoader) la pide por nombre y luego la imagen
  const csl = await call('GET', '/csl/pepeoff.json');
  assert.strictEqual(csl.status, 200);
  assert.strictEqual(csl.data.username, 'PepeOff');
  const hash = csl.data.skins.slim;
  assert.match(hash, /^[0-9a-f]{64}$/);
  const img = await worker.fetch(new Request(`${ORIGIN}/csl/textures/${hash}`), env, {});
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.headers.get('Content-Type'), 'image/png');
  assert.strictEqual(Buffer.from(await img.arrayBuffer()).toString('base64'), png(64, 64));
  assert.strictEqual((await call('GET', '/csl/nadie.json')).status, 404);
  assert.strictEqual((await call('GET', '/csl/../../x')).status, 404);
  // si MineSkin falla, la skin se guarda igual para el mod (y no para los plugins)
  env.MINESKIN_FETCH = async () => new Response('{}', { status: 500 });
  const lu = await player('LuOff', false);
  const r = await call('POST', '/api/l/skin', { headers: lu, body: { key: 'l'.repeat(32), png: png(64, 64, 2), variant: 'classic' } });
  assert.deepStrictEqual([r.status, r.data.server], [200, false]);
  assert.ok((await call('GET', '/csl/LuOff.json')).data.skins.default);
  assert.strictEqual((await call('GET', '/api/public/skin/LuOff')).status, 404);
  delete env.MINESKIN_FETCH;
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
  assert.strictEqual((await call('GET', '/csl/PepeOff.json')).status, 404);
});

await test('informes del launcher → canal de Discord', async () => {
  const yo = await player('Reportero', false);
  const body = { message: 'No arranca @everyone', status: { version: '1.4.6', os: 'Windows 10', ramGb: 16, instances: 2 }, logs: 'linea 1\nlinea 2', screenshot: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64') };
  // sin webhook configurado: el launcher lo guarda en una carpeta
  assert.strictEqual((await call('POST', '/api/l/report', { headers: yo, body })).data.error, 'no_webhook');
  env.DISCORD_REPORT_WEBHOOK = 'https://discord.com/api/webhooks/123/abc-DEF_9';
  const sent = [];
  env.DISCORD_FETCH = async (u, o) => { sent.push({ u, form: o.body }); return new Response(null, { status: 204 }); };
  const r = await call('POST', '/api/l/report', { headers: yo, body });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].u, env.DISCORD_REPORT_WEBHOOK);
  const p = JSON.parse(sent[0].form.get('payload_json'));
  assert.deepStrictEqual(p.allowed_mentions, { parse: [] });
  assert.strictEqual(p.embeds[0].description, 'No arranca @everyone');
  assert.ok(p.embeds[0].fields[0].value.startsWith('Reportero'));
  assert.strictEqual(p.embeds[0].image.url, 'attachment://captura.jpg');
  assert.strictEqual(sent[0].form.get('files[0]').type, 'image/jpeg');
  assert.strictEqual(await sent[0].form.get('files[1]').text(), 'linea 1\nlinea 2');
  // uno por minuto
  const again = await call('POST', '/api/l/report', { headers: yo, body });
  assert.deepStrictEqual([again.status, again.data.error], [429, 'slow']);
  assert.strictEqual(sent.length, 1);
  // si Discord falla, se puede reintentar enseguida
  const otro = await player('Reportero2', false);
  env.DISCORD_FETCH = async () => new Response('x', { status: 500 });
  assert.strictEqual((await call('POST', '/api/l/report', { headers: otro, body })).data.error, 'discord');
  env.DISCORD_FETCH = async (u, o) => { sent.push({ u, form: o.body }); return new Response(null, { status: 204 }); };
  assert.strictEqual((await call('POST', '/api/l/report', { headers: otro, body: { message: 'x' } })).status, 200);
  // sin sesión del launcher, nada
  assert.strictEqual((await call('POST', '/api/l/report', { body })).status, 401);
  // un webhook que no es de Discord no se usa
  env.DISCORD_REPORT_WEBHOOK = 'https://malo.example/x';
  assert.strictEqual((await call('POST', '/api/l/report', { headers: await player('Reportero3', false), body })).data.error, 'no_webhook');
  delete env.DISCORD_REPORT_WEBHOOK; delete env.DISCORD_FETCH;
});

// Lee un PNG fabricado por el panel (RGBA, sin filtros) → { w, h, px(x, y) }
function readPng(buf) {
  const b = Buffer.from(buf);
  assert.deepStrictEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let o = 8, w = 0, h = 0; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    assert.strictEqual(b.readUInt32BE(o + 8 + len), zlib.crc32(b.subarray(o + 4, o + 8 + len)), 'CRC de ' + type);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.deepStrictEqual([...data.subarray(8)], [8, 6, 0, 0, 0]); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert.strictEqual(raw.length, h * (w * 4 + 1));
  return { w, h, px: (x, y) => { const i = y * (w * 4 + 1) + 1 + x * 4; return '#' + [...raw.subarray(i, i + 3)].map(v => v.toString(16).padStart(2, '0')).join('') + (raw[i + 3] === 255 ? '' : '/' + raw[i + 3]); } };
}

await test('Capas de Kopi: el dibujo del panel es el mismo que el del launcher', async () => {
  const sb = { window: {}, document: {}, matchMedia: () => ({ matches: true }) };
  vm.runInNewContext(fs.readFileSync(path.join(here, '..', '..', 'src', 'renderer', 'js', 'capes.js'), 'utf8'), sb);
  const L = sb.window.KopiCapes, A = globalThis.KopiCapeArt;
  const info = (list) => JSON.stringify(list.map(c => [c.id, c.name, c.rarity, c.frames, c.fps]));
  assert.strictEqual(info(L.list), info(A.CAPES));
  for (const c of L.list) for (let f = 0; f < c.frames; f++) {
    const grid = Array.from({ length: 16 }, () => new Array(10).fill('#000000'));
    c.draw((x, y, col) => { if (x >= 0 && y >= 0 && x < 10 && y < 16) grid[y][x] = col; }, f);
    assert.deepStrictEqual(grid, A.pixels(A.get(c.id), f), `la capa «${c.id}» (fotograma ${f}) no coincide: cámbiala en los dos sitios`);
  }
  // la animación del juego (10 fotogramas por segundo) vuelve justo al principio y va a la misma velocidad
  for (const c of A.CAPES) {
    const n = spriteFrameCount(c);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 120, c.id + ': ' + n);
    if (c.frames > 1) {
      assert.strictEqual(n * c.fps % 10, 0, c.id);
      assert.strictEqual(Math.floor(n * c.fps / 10) % c.frames, 0, c.id + ' termina donde empieza');
      assert.ok(Math.abs(n / 10 * c.fps - Math.round(n / 10 * c.fps)) < 1e-9);
    }
  }
  assert.deepStrictEqual(['kopi', 'bubbles', 'fire', 'pink'].map(id => spriteFrameCount(A.get(id))), [40, 80, 12, 1]);
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map(i => spriteFrameAt(A.get('kopi'), i)), [0, 0, 1, 1, 2, 3]);
});

await test('Capas de Kopi: regalar, ponérsela y verla en el juego', async () => {
  const A = globalThis.KopiCapeArt;
  // solo el Creador
  assert.strictEqual((await call('GET', '/api/onyx/capes', { cookie: other })).status, 403);
  const list = await call('GET', '/api/onyx/capes', { cookie: creator });
  assert.deepStrictEqual(list.data.capes.map(c => c.id), CAPE_IDS);
  assert.ok(list.data.capes.every(c => c.owners === 0));
  // regalar (varios a la vez, sin repetir)
  assert.strictEqual((await call('POST', '/api/onyx/capes/kopi', { cookie: creator, body: { name: 'no válido!' } })).status, 400);
  assert.strictEqual((await call('POST', '/api/onyx/capes/nada', { cookie: creator, body: { name: 'Ana' } })).status, 404);
  assert.strictEqual((await call('POST', '/api/onyx/capes/kopi', { cookie: other, body: { name: 'Ana' } })).status, 403);
  const g = await call('POST', '/api/onyx/capes/kopi', { cookie: creator, body: { name: 'CapaOff, Steve CapaOff' } });
  assert.deepStrictEqual([g.status, g.data.added], [200, 2], JSON.stringify(g.data));
  assert.strictEqual((await call('POST', '/api/onyx/capes/kopi', { cookie: creator, body: { names: ['capaoff'] } })).data.already, 1);
  await call('POST', '/api/onyx/capes/fire', { cookie: creator, body: { name: 'CapaOff' } });
  const owners = await call('GET', '/api/onyx/capes/kopi', { cookie: creator });
  assert.deepStrictEqual(owners.data.owners.map(o => o.name).sort(), ['CapaOff', 'Steve']);
  assert.strictEqual(owners.data.owners[0].by, 'kew');
  const audits = (await call('GET', '/api/onyx/audit?q=cape', { cookie: creator })).data;
  assert.ok(JSON.stringify(audits).includes('cape.give'));

  // el launcher: qué tiene y ponérsela
  const off = await player('CapaOff', false);
  const key = 'c'.repeat(32);
  assert.deepStrictEqual((await call('GET', '/api/l/capes', { headers: off })).data, { owned: ['kopi', 'fire'], worn: null });
  assert.strictEqual((await call('GET', '/capes/CapaOff.png')).status, 404, 'sin capa puesta');
  assert.strictEqual((await call('POST', '/api/l/cape', { headers: off, body: { id: 'void', key } })).status, 403, 'no la tiene');
  assert.strictEqual((await call('POST', '/api/l/cape', { headers: off, body: { id: 'kopi' } })).status, 400, 'falta la clave');
  assert.strictEqual((await call('POST', '/api/l/cape', { headers: off, body: { id: 'kopi', key } })).data.worn, 'kopi');
  assert.strictEqual((await call('GET', '/api/l/capes', { headers: off })).data.worn, 'kopi');
  // otro launcher con el mismo nombre no puede cambiarla
  const thief = await player('CapaOff', false);
  assert.strictEqual((await call('POST', '/api/l/cape', { headers: thief, body: { id: 'fire', key: 'z'.repeat(32) } })).status, 403);
  assert.strictEqual((await call('POST', '/api/l/cape', { headers: thief, body: { id: null, key: 'z'.repeat(32) } })).status, 403);
  // un nombre premium solo desde una sesión premium (Steve ya entró como premium en otra prueba)
  const fakeSteve = await player('Steve', false);
  assert.strictEqual((await call('POST', '/api/l/cape', { headers: fakeSteve, body: { id: 'kopi', key } })).data.error, 'premium_cape');
  const steve = await player('Steve', true);
  assert.strictEqual((await call('POST', '/api/l/cape', { headers: steve, body: { id: 'kopi' } })).data.worn, 'kopi');

  // Cape Provider: la capa ANIMADA (fotogramas de 64×32, uno debajo de otro)
  const res = await worker.fetch(new Request(`${ORIGIN}/capes/capaoff.png`), env, {});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('Content-Type'), 'image/png');
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
  const sp = readPng(await res.arrayBuffer());
  assert.deepStrictEqual([sp.w, sp.h], [64, 32 * 40]);
  const kopi = A.get('kopi');
  for (const i of [0, 7, 39]) {
    const f = spriteFrameAt(kopi, i), grid = A.pixels(kopi, f);
    for (const [x, y] of [[0, 0], [4, 1], [2, 5], [9, 15], [5, 11]]) assert.strictEqual(sp.px(1 + x, 32 * i + 1 + y), grid[y][x], `fotograma ${i} píxel ${x},${y}`);
    assert.strictEqual(sp.px(24 + 3, 32 * i + 2 + 19), grid[15][3], 'élitros: la última fila se alarga');
  }
  assert.strictEqual(sp.px(63, 31), '#000000/0', 'lo que no es capa queda transparente');
  assert.strictEqual(sp.px(12, 1), A.mix(A.pixels(kopi, 0)[0][0], '#000000', 0.45), 'la cara de dentro, más oscura');
  assert.strictEqual((await call('GET', '/capes/Steve.png')).status, 200);
  assert.strictEqual((await call('GET', '/capes/../x.png')).status, 404);
  assert.strictEqual((await call('GET', '/capes/a.png')).status, 404);

  // CustomSkinLoader: la capa QUIETA en el perfil (aunque no tenga skin de Kopi)
  const csl = await call('GET', '/csl/CapaOff.json');
  assert.deepStrictEqual([csl.status, csl.data.username, csl.data.skins], [200, 'CapaOff', undefined]);
  assert.match(csl.data.cape, /^[0-9a-f]{64}$/);
  const still = readPng(await (await worker.fetch(new Request(`${ORIGIN}/csl/textures/${csl.data.cape}`), env, {})).arrayBuffer());
  assert.deepStrictEqual([still.w, still.h], [64, 32]);
  assert.strictEqual(still.px(1, 1), A.pixels(kopi, 0)[0][0]);
  assert.strictEqual((await call('GET', '/csl/textures/' + 'ab'.repeat(32))).status, 404);

  // cambiar a otra, quitársela
  await call('POST', '/api/l/cape', { headers: off, body: { id: 'fire', key } });
  assert.deepStrictEqual(readPng(await (await worker.fetch(new Request(`${ORIGIN}/capes/CapaOff.png`), env, {})).arrayBuffer()).h, 32 * 12);
  assert.strictEqual((await call('GET', '/api/onyx/capes', { cookie: creator })).data.capes.find(c => c.id === 'fire').wearing, 1);
  await call('POST', '/api/l/cape', { headers: off, body: { id: null, key } });
  assert.strictEqual((await call('GET', '/capes/CapaOff.png')).status, 404);
  assert.strictEqual((await call('GET', '/csl/CapaOff.json')).status, 404);
  // el Creador se la quita a Steve: deja de verse
  assert.strictEqual((await call('DELETE', '/api/onyx/capes/kopi/Steve', { cookie: creator })).status, 200);
  assert.strictEqual((await call('GET', '/capes/Steve.png')).status, 404);
  assert.strictEqual((await call('DELETE', '/api/onyx/capes/kopi/Steve', { cookie: creator })).status, 404);
  assert.deepStrictEqual((await call('GET', '/api/l/capes', { headers: steve })).data, { owned: [], worn: null });
  // todos los textos de la página de capas y del servidor están en los 4 idiomas
  const sb = { localStorage: { getItem: () => null }, document: { documentElement: {} }, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  sb.window = sb;
  vm.runInNewContext(fs.readFileSync(path.join(here, '..', 'public', 'js', 'i18n.js'), 'utf8'), sb);
  const view = fs.readFileSync(path.join(here, '..', 'public', 'views', 'capes.js'), 'utf8');
  const server = fs.readFileSync(path.join(here, '..', 'src', 'capes.js'), 'utf8').split('// ---------------------------------------------------------------- Creador')[1];
  const keys = [...view.matchAll(/(?<![\w.$])t\('((?:[^'\\]|\\.)+)'/g), ...server.matchAll(/fail\(\d+, '\w+', '((?:[^'\\]|\\.)+)'\)/g)].map(x => x[1]);
  keys.push(...A.CAPES.map(c => c.name).filter(n => n !== 'Kopi'), ...Object.values(A.RARITY).map(r => r.label), 'Capas de Kopi');
  assert.ok(keys.length > 30, 'textos: ' + keys.length);
  for (const k of keys) assert.ok(sb.I18N.has(k), 'falta traducir: ' + k);
});

await test('KopiGuard: avisos del launcher, Discord, expulsar y sancionar', async () => {
  // una instancia nueva para no mezclar con las otras pruebas
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Guardia' } });
  const gid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${gid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true } } } });
  const p = await player('Tramposo', false);
  // apagado: el launcher no recibe nada y los avisos se ignoran
  let man = (await call('GET', `/api/l/instance/${gid}`, { headers: p })).data.instance;
  assert.strictEqual(man.guard, null);
  let play = (await call('POST', '/api/l/play', { headers: p, body: { instance: gid } })).data;
  assert.strictEqual(play.beatEvery, 60);
  assert.strictEqual((await call('POST', '/api/l/guard', { headers: p, body: { play: play.play, events: [{ type: 'mod', detail: 'x' }] } })).data.ignored, true);
  // encender KopiGuard (con expulsión automática y aviso a Discord)
  const hook = 'https://discord.com/api/webhooks/123/abc_DEF';
  let r = await call('PATCH', `/api/s/onyx-studios/instances/${gid}`, { cookie: creator, body: { data: { guard: { enabled: true, autoKick: true, webhook: hook } } } });
  assert.deepStrictEqual(r.data.data.guard, { enabled: true, autoKick: true, packsOk: false, webhook: hook });
  r = await call('PATCH', `/api/s/onyx-studios/instances/${gid}`, { cookie: creator, body: { data: { guard: { webhook: 'https://evil.example/x' } } } });
  assert.strictEqual(r.data.data.guard.webhook, '', 'solo webhooks de Discord');
  await call('PATCH', `/api/s/onyx-studios/instances/${gid}`, { cookie: creator, body: { data: { guard: { webhook: hook } } } });
  man = (await call('GET', `/api/l/instance/${gid}`, { headers: p })).data.instance;
  assert.strictEqual(man.guard.enabled, true);
  assert.ok(man.guard.programs.some(x => x.m === 'autoclicker'));
  assert.ok(!JSON.stringify(man).includes('webhooks'), 'el webhook no sale nunca hacia el launcher');
  play = (await call('POST', '/api/l/play', { headers: p, body: { instance: gid } })).data;
  assert.strictEqual(play.beatEvery, 20, 'latidos más seguidos con KopiGuard');
  // el launcher avisa: un mod añadido (Discord recibe el aviso)
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => { if (String(url).startsWith('https://discord.com/')) { sent.push(JSON.parse(o.body)); return new Response('', { status: 204 }); } return realFetch(url, o); };
  try {
    r = await call('POST', '/api/l/guard', { headers: p, body: { play: play.play, events: [{ type: 'mod', severity: 'high', detail: 'Mod añadido: mods/xray.jar', items: ['mods/xray.jar', 'mods/otro.jar'], mods: ['sodium.jar'] }] } });
    assert.deepStrictEqual([r.data.saved, r.data.kick], [1, false]);
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].embeds[0].title, /KopiGuard · Mod/);
    assert.strictEqual(sent[0].allowed_mentions.parse.length, 0);
    // la misma detección otra vez (en 10 min): no se repite
    r = await call('POST', '/api/l/guard', { headers: p, body: { play: play.play, events: [{ type: 'mod', severity: 'high', detail: 'Mod añadido: mods/xray.jar' }] } });
    assert.strictEqual(r.data.saved, 0);
    // tipos raros o sin texto: fuera
    r = await call('POST', '/api/l/guard', { headers: p, body: { play: play.play, events: [{ type: 'otro', detail: 'x' }, { type: 'file', detail: '' }] } });
    assert.strictEqual(r.data.saved, 0);
    // un autoclicker con expulsión automática: el siguiente latido le saca
    r = await call('POST', '/api/l/guard', { headers: p, body: { play: play.play, events: [{ type: 'program', severity: 'high', detail: 'Autoclicker', process: { name: 'GT Auto Clicker.exe', path: 'C:\\x\\GT Auto Clicker.exe', hash: 'ff04406b7a33cfa2' } }] } });
    assert.deepStrictEqual([r.data.saved, r.data.kick], [1, true]);
    assert.match(sent[1].embeds[0].title, /expulsado/);
  } finally { globalThis.fetch = realFetch; }
  assert.strictEqual((await call('POST', '/api/l/beat', { headers: p, body: { play: play.play } })).data.kick, true);
  // otro jugador no puede avisar con una partida ajena
  const q = await player('Honrado', false);
  assert.strictEqual((await call('POST', '/api/l/guard', { headers: q, body: { play: play.play, events: [{ type: 'mod', detail: 'x' }] } })).status, 404);

  // la página del studio: lista, filtros, números
  let list = (await call('GET', '/api/s/onyx-studios/guard', { cookie: creator })).data;
  assert.strictEqual(list.events.length, 2);
  assert.deepStrictEqual(list.types, { mod: 1, program: 1 });
  assert.deepStrictEqual([list.stats.guarded, list.stats.total, list.stats.kicks24h], [1, 2, 1]);
  assert.strictEqual(list.events.find(e => e.type === 'mod').extra, 1, '«y 1 más»');
  assert.ok(list.instances.some(i => i.id === gid && i.guarded));
  list = (await call('GET', '/api/s/onyx-studios/guard?type=program', { cookie: creator })).data;
  assert.deepStrictEqual([list.events.length, list.events[0].kicked], [1, true]);
  assert.deepStrictEqual(list.types, { mod: 1, program: 1 }, 'las pestañas cuentan sin el filtro de tipo');
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/guard?q=xray', { cookie: creator })).data.events.length, 1);
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/guard?q=nadie', { cookie: creator })).data.events.length, 0);
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/guard?from=${Date.now() + 864e5}`, { cookie: creator })).data.events.length, 0);
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/guard', { cookie: other })).status, 403);
  // detalle: datos técnicos y mods cargados
  const progId = list.events[0].id;
  const det = (await call('GET', `/api/s/onyx-studios/guard/${progId}`, { cookie: creator })).data.event;
  assert.strictEqual(det.data.process.name, 'GT Auto Clicker.exe');
  assert.strictEqual(det.others, 1);
  const modId = (await call('GET', '/api/s/onyx-studios/guard?type=mod', { cookie: creator })).data.events[0].id;
  assert.deepStrictEqual((await call('GET', `/api/s/onyx-studios/guard/${modId}`, { cookie: creator })).data.event.data.mods, ['sodium.jar']);
  // revisar y descartar
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/guard/${modId}`, { cookie: creator, body: { action: 'reviewed' } })).data.status, 'reviewed');
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/guard?status=reviewed', { cookie: creator })).data.events.length, 1);
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/guard/${modId}`, { cookie: creator, body: { action: 'dismissed' } })).data.status, 'dismissed');
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/guard/${modId}`, { cookie: creator, body: { action: 'otra' } })).status, 400);
  // expulsar a mano: solo si está jugando
  await call('POST', '/api/l/end', { headers: p, body: { play: play.play } });
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/guard/${modId}`, { cookie: creator, body: { action: 'kick' } })).data.error, 'not_playing');
  const play2 = (await call('POST', '/api/l/play', { headers: p, body: { instance: gid } })).data;
  assert.strictEqual((await call('POST', '/api/l/beat', { headers: p, body: { play: play2.play } })).data.kick, false, 'una partida nueva empieza limpia');
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/guard/${modId}`, { cookie: creator, body: { action: 'kick' } })).data.kicked, true);
  assert.strictEqual((await call('POST', '/api/l/beat', { headers: p, body: { play: play2.play } })).data.kick, true);
  // sancionar: baneado en esa instancia (ya no puede entrar)
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/guard/${progId}`, { cookie: creator, body: { action: 'sanction' } })).data.status, 'sanctioned');
  const banned = await call('POST', '/api/l/play', { headers: p, body: { instance: gid } });
  assert.deepStrictEqual([banned.status, banned.data.reason || banned.data.error], [403, 'banned']);
  assert.ok((await call('GET', `/api/s/onyx-studios/instances/${gid}/bans`, { cookie: creator })).data.bans.some(b => b.value === 'tramposo'));
  assert.ok(JSON.stringify((await call('GET', '/api/s/onyx-studios/activity', { cookie: creator })).data).includes('guard.sanction'));
});

await test('KopiGuard: foto, vídeo y cámaras en directo', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Cámaras' } });
  const gid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${gid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true }, guard: { enabled: true, webhook: 'https://discord.com/api/webhooks/123/abc_DEF' } } } });
  // lo que llega a Discord (texto, foto y vídeo)
  const toDiscord = [];
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    if (String(url).startsWith('https://discord.com/api/webhooks/')) { toDiscord.push(o.body instanceof FormData ? { form: o.body } : { json: JSON.parse(o.body) }); return new Response('', { status: 204 }); }
    return realFetch2(url, o);
  };
  const p = await player('Mirado', false);
  const play = (await call('POST', '/api/l/play', { headers: p, body: { instance: gid } })).data;
  // detecciones: las importantes llevan foto y vídeo; las leves no
  let r = await call('POST', '/api/l/guard', { headers: p, body: { play: play.play, events: [{ type: 'mod', severity: 'high', detail: 'Mod añadido: mods/a.jar' }, { type: 'file', severity: 'low', detail: 'Archivo nuevo en config: config/x' }] } });
  assert.strictEqual(r.data.ids.length, 2);
  assert.strictEqual(r.data.ids[0].media, true);
  assert.strictEqual(r.data.ids[1].media, false);
  const evId = r.data.ids[0].id;
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 9]);
  const up = (kind, raw, ev = evId, who = p) => call('POST', `/api/l/guard/media?play=${play.play}&event=${ev}&kind=${kind}`, { headers: { ...who, 'Content-Type': 'application/octet-stream' }, raw });
  assert.strictEqual((await up('shot', WEBM)).status, 400, 'una foto tiene que ser JPEG');
  assert.strictEqual((await up('shot', JPEG)).status, 200);
  assert.strictEqual((await up('shot', JPEG)).status, 409, 'una sola vez');
  assert.strictEqual((await up('video', WEBM)).status, 200);
  assert.strictEqual((await up('shot', JPEG, r.data.ids[1].id)).status, 403, 'la leve no lleva foto');
  await new Promise(res => setTimeout(res, 20));
  const files = toDiscord.filter(x => x.form);
  assert.strictEqual(files.length, 2, 'foto y vídeo a Discord');
  const shotMsg = JSON.parse(files[0].form.get('payload_json')), shotFile = files[0].form.get('files[0]');
  assert.strictEqual(shotFile.name, 'deteccion.jpg'); assert.strictEqual(shotFile.size, JPEG.length);
  assert.strictEqual(shotMsg.embeds[0].image.url, 'attachment://deteccion.jpg');
  assert.ok(/foto/.test(shotMsg.embeds[0].title) && shotMsg.embeds[0].fields[0].value === 'Mirado');
  assert.strictEqual(files[1].form.get('files[0]').name, 'deteccion.webm');
  assert.ok(toDiscord.some(x => x.json), 'y el aviso de texto de siempre');
  globalThis.fetch = realFetch2;
  const stranger = await player('Otro', false);
  assert.strictEqual((await up('shot', JPEG, evId, stranger)).status, 404, 'solo el jugador de esa partida');
  const det = (await call('GET', `/api/s/onyx-studios/guard/${evId}`, { cookie: creator })).data.event;
  assert.deepStrictEqual([det.media.shot, det.media.video], [true, true]);
  let f = await call('GET', `/api/s/onyx-studios/guard/${evId}/shot`, { cookie: creator });
  assert.deepStrictEqual([f.status, f.headers.get('Content-Type')], [200, 'image/jpeg']);
  f = await call('GET', `/api/s/onyx-studios/guard/${evId}/video`, { cookie: creator });
  assert.deepStrictEqual([f.status, f.headers.get('Content-Type')], [200, 'video/webm']);
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/guard/${evId}/shot`, { cookie: other })).status, 403, 'solo el studio');
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/guard/live', { cookie: other })).status, 403);

  // cámaras: nadie mira → el launcher no manda nada
  assert.strictEqual((await call('POST', '/api/l/beat', { headers: p, body: { play: play.play } })).data.cam, null);
  assert.strictEqual((await call('POST', '/api/l/guard/frame', { headers: p, body: { play: play.play, frame: '/9j/AAAA' } })).data.cam, null);
  // se abre la página de cámaras → imágenes pequeñas de vez en cuando
  let cams = (await call('GET', '/api/s/onyx-studios/guard/live', { cookie: creator })).data;
  const me = cams.players.find(x => x.play === play.play);
  assert.ok(me, JSON.stringify(cams)); assert.strictEqual(me.frameAt, null); assert.ok(me.instanceName && me.instance === gid);
  assert.strictEqual((await call('POST', '/api/l/beat', { headers: p, body: { play: play.play } })).data.cam, 'grid');
  const b64 = Buffer.from(JPEG).toString('base64');
  assert.strictEqual((await call('POST', '/api/l/guard/frame', { headers: p, body: { play: play.play, frame: b64 } })).data.cam, 'grid');
  assert.strictEqual((await call('POST', '/api/l/guard/frame', { headers: p, body: { play: play.play, frame: 'AAAA' } })).status, 400, 'solo JPEG');
  cams = (await call('GET', '/api/s/onyx-studios/guard/live', { cookie: creator })).data;
  assert.ok(cams.players.find(x => x.play === play.play).frameAt > 0);
  f = await call('GET', `/api/s/onyx-studios/guard/live/${play.play}/img`, { cookie: creator });
  assert.deepStrictEqual([f.status, f.headers.get('Content-Type')], [200, 'image/jpeg']);
  // mirarle en grande → imágenes seguidas
  const one = (await call('GET', `/api/s/onyx-studios/guard/live/${play.play}`, { cookie: creator })).data;
  assert.deepStrictEqual([one.playing, one.player], [true, 'Mirado']);
  assert.strictEqual((await call('POST', '/api/l/guard/frame', { headers: p, body: { play: play.play, frame: null, hd: true } })).data.cam, 'live');
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/guard/live/${play.play}`, { cookie: creator })).data.hidden, true, 'ventana minimizada');
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/guard/live/${play.play}/img`, { cookie: creator })).status, 200, 'se queda la última imagen');
  // expulsar desde la cámara
  assert.strictEqual((await call('POST', `/api/s/onyx-studios/guard/live/${play.play}`, { cookie: creator, body: { action: 'kick' } })).data.kicked, true);
  assert.strictEqual((await call('POST', '/api/l/beat', { headers: p, body: { play: play.play } })).data.kick, true);
  // al acabar la partida, su imagen se borra
  await call('POST', '/api/l/end', { headers: p, body: { play: play.play } });
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/guard/live/${play.play}/img`, { cookie: creator })).status, 404);
  assert.ok(!(await call('GET', '/api/s/onyx-studios/guard/live', { cookie: creator })).data.players.some(x => x.play === play.play));
});

await test('Estadísticas del studio: jugadores, horas, nuevos, vuelven, mapa de calor', async () => {
  const { computeStats } = await import('../src/studio-stats.js');
  const H = 36e5, D = 864e5;
  const nowMs = Date.UTC(2026, 10, 20, 18, 0); // viernes 20/11/2026 18:00 UTC
  const tz = 300;                               // Bogotá: 13:00 local
  const at = (d, h) => Date.UTC(2026, 10, d, h + 5); // d de noviembre a las h (hora de Bogotá)
  const rows = [
    // este periodo (7 días: 14 al 20)
    { instance_id: 'a', player_key: 'ana', player_name: 'Ana', started_at: at(20, 9), end_at: at(20, 11) },     // 2 h, hoy
    { instance_id: 'a', player_key: 'ana', player_name: 'Ana', started_at: at(18, 20), end_at: at(18, 21) },    // 1 h
    { instance_id: 'b', player_key: 'bob', player_name: 'Bob', started_at: at(19, 20), end_at: at(19, 20) + 30 * 60e3 }, // 30 min
    { instance_id: 'a', player_key: 'cris', player_name: 'Cris', started_at: at(18, 20), end_at: at(18, 22) },  // 2 h, nuevo
    // periodo anterior (7 al 13)
    { instance_id: 'a', player_key: 'ana', player_name: 'Ana', started_at: at(10, 20), end_at: at(10, 21) },
    { instance_id: 'a', player_key: 'dani', player_name: 'Dani', started_at: at(11, 20), end_at: at(11, 21) }
  ];
  const first = { ana: at(1, 10), bob: at(5, 10), cris: at(18, 20), dani: at(11, 20) };
  const r = computeStats(rows, first, { days: 7, nowMs, tz, names: { a: 'Survival', b: 'Torneo' } });
  assert.strictEqual(r.daily.length, 7);
  assert.strictEqual(r.daily[6].day, at(20, 0), 'el último día es hoy a medianoche de Bogotá');
  assert.deepStrictEqual([r.now.players, r.now.plays, r.now.hours, r.now.fresh], [3, 4, 5.5, 1]);
  assert.deepStrictEqual([r.prev.players, r.prev.plays], [2, 2]);
  assert.strictEqual(r.returning, 50, 'de Ana y Dani, volvió Ana');
  assert.strictEqual(r.now.avgMin, Math.round((120 + 60 + 30 + 120) / 4));
  const d18 = r.daily.find(x => x.day === at(18, 0));
  assert.deepStrictEqual([d18.players, d18.fresh, d18.hours], [2, 1, 3]);
  // miércoles 18 a las 20: Ana y Cris a la vez → 2 de media (solo hubo un miércoles en 7 días)
  assert.strictEqual(r.heat[3][20], 2);
  assert.deepStrictEqual([r.best.wd, r.best.h, r.best.v], [3, 20, 2]);
  assert.deepStrictEqual(r.top.map(p => [p.name, p.hours, p.days]), [['Ana', 3, 2], ['Cris', 2, 1], ['Bob', 0.5, 1]]);
  assert.deepStrictEqual(r.instances.map(i => [i.name, i.hours, i.players]), [['Survival', 5, 2], ['Torneo', 0.5, 1]]);

  // por la API (y solo para miembros del studio)
  let res = await call('GET', '/api/s/onyx-studios/stats?days=30&tz=300', { cookie: creator });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.days, 30);
  assert.strictEqual(res.data.daily.length, 30);
  assert.ok(res.data.list.length >= 1 && Array.isArray(res.data.heat) && res.data.heat.length === 7);
  res = await call('GET', '/api/s/onyx-studios/stats?days=999', { cookie: creator });
  assert.strictEqual(res.data.days, 30, 'rango raro → 30 días');
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/stats', { cookie: other })).status, 403);
});

await test('KopiGuard: plugin del servidor (clave, avisos, foto del launcher)', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Servidor' } });
  const gid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${gid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true }, guard: { enabled: false } } } });
  // la clave: solo admins; la misma hasta que se pide otra
  let k = await call('GET', `/api/s/onyx-studios/guard/key/${gid}`, { cookie: creator });
  assert.ok(/^kg_[0-9a-f]{64}$/.test(k.data.key));
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/guard/key/${gid}`, { cookie: creator })).data.key, k.data.key);
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/guard/key/${gid}`, { cookie: other })).status, 403);
  const send = (body) => call('POST', '/api/srv/guard', { body: { key: k.data.key, ...body } });
  assert.strictEqual((await call('POST', '/api/srv/guard', { body: { key: 'kg_' + 'x'.repeat(30), check: 'fly', player: 'A' } })).status, 401);
  // con KopiGuard apagado no se guarda nada
  assert.strictEqual((await send({ check: 'fly', player: 'Volador', detail: 'Vuela' })).data.ignored, 'off');
  await call('PATCH', `/api/s/onyx-studios/instances/${gid}`, { cookie: creator, body: { data: { guard: { enabled: true } } } });
  assert.strictEqual((await send({ ping: true })).data.instance.length > 0, true, '/kopiguard test');
  // un jugador sin Kopi Client: se guarda sin partida
  let r = await send({ check: 'speed', player: 'Rapido', detail: 'Va demasiado rápido: 14,2 bloques/s (máx. 9,5)', severity: 'medium', data: { vl: 12, ping: 40, tps: 20, world: 'world', x: 1, y: 64, z: 2 } });
  assert.deepStrictEqual([r.data.saved, r.data.kopi], [1, false]);
  assert.strictEqual((await send({ check: 'speed', player: 'Rapido', detail: 'Va demasiado rápido: 14,2 bloques/s (máx. 9,5)' })).data.ignored, 'same');
  assert.strictEqual((await send({ check: 'nada', player: 'Rapido', detail: 'x' })).status, 400);
  // un jugador con Kopi Client: la detección es de su partida y el launcher manda foto y vídeo
  const p = await player('Volador', false);
  const play = (await call('POST', '/api/l/play', { headers: p, body: { instance: gid } })).data;
  r = await send({ check: 'fly', player: 'Volador', detail: 'Vuela sin élitros ni permiso', severity: 'high', data: { vl: 30 } });
  assert.deepStrictEqual([r.data.saved, r.data.kopi], [1, true]);
  const list = (await call('GET', `/api/s/onyx-studios/guard?instance=${gid}`, { cookie: creator })).data;
  const ev = list.events.find(e => e.player === 'Volador');
  assert.deepStrictEqual([ev.type, ev.severity, !!ev.media], ['move', 'high', true]);
  assert.strictEqual(list.types.move, 2);
  let beat = (await call('POST', '/api/l/beat', { headers: p, body: { play: play.play } })).data;
  assert.strictEqual(beat.snap, ev.id, 'el latido pide la foto de esa detección');
  assert.strictEqual((await call('POST', '/api/l/beat', { headers: p, body: { play: play.play } })).data.snap, null, 'una sola vez');
  const up = await call('POST', `/api/l/guard/media?play=${play.play}&event=${ev.id}&kind=shot`, { headers: { ...p, 'Content-Type': 'application/octet-stream' }, raw: new Uint8Array([0xff, 0xd8, 0xff, 1]) });
  assert.strictEqual(up.status, 200);
  const det = (await call('GET', `/api/s/onyx-studios/guard/${ev.id}`, { cookie: creator })).data.event;
  assert.strictEqual(det.data.server.vl, 30);
  assert.strictEqual(det.media.shot, true);
  // otra clave: la vieja deja de valer
  const k2 = await call('POST', `/api/s/onyx-studios/guard/key/${gid}`, { cookie: creator, body: {} });
  assert.notStrictEqual(k2.data.key, k.data.key);
  assert.strictEqual((await send({ ping: true })).status, 401);
});

await test('Novedades: lo que escribe el studio y los mods que cambian', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Novedades' } });
  const gid = made.data.id;
  const base = `/api/s/onyx-studios/instances/${gid}`;
  const F = (path, sha) => ({ path, url: 'https://cdn.example.com/' + path, sha1: sha.repeat(40) });
  // la primera subida no es una novedad
  let r = await call('PATCH', base, { cookie: creator, body: { state: 'open', data: { access: { public: true }, files: [F('mods/sodium-0.5.8.jar', 'a'), F('mods/lithium-0.12.jar', 'b'), F('config/x.json', 'c')] } } });
  assert.deepStrictEqual(r.data.data.news, []);
  // cambian los mods → apunte automático
  r = await call('PATCH', base, { cookie: creator, body: { data: { files: [F('mods/sodium-0.6.0.jar', 'd'), F('mods/create-0.5.1.jar', 'e'), F('config/x.json', 'f')] } } });
  let n = r.data.data.news;
  assert.strictEqual(n.length, 1);
  assert.deepStrictEqual([n[0].auto.added, n[0].auto.removed, n[0].auto.updated, n[0].auto.config], [['create-0.5.1'], ['lithium-0.12'], ['sodium-0.6.0'], 1]);
  // otro cambio enseguida: se junta con el anterior
  r = await call('PATCH', base, { cookie: creator, body: { data: { files: [F('mods/sodium-0.6.0.jar', 'd'), F('mods/create-0.5.1.jar', 'e'), F('mods/iris-1.8.jar', '1'), F('config/x.json', 'f')] } } });
  n = r.data.data.news;
  assert.strictEqual(n.length, 1);
  assert.deepStrictEqual(n[0].auto.added, ['create-0.5.1', 'iris-1.8']);
  // el studio escribe una novedad
  const mine = { id: 'abc123def', at: Date.now() + 1000, text: '¡Nueva temporada! Mapa nuevo y Create.' };
  r = await call('PATCH', base, { cookie: creator, body: { data: { news: [...n, mine] } } });
  assert.strictEqual(r.data.data.news.length, 2);
  // el launcher las recibe (la más nueva primero)
  const p = await player('Lector', false);
  const list = (await call('GET', '/api/l/instances', { headers: p })).data;
  const inst = (list.instances || list).find(i => i.id === gid);
  assert.ok(inst, 'la instancia pública llega al launcher');
  assert.strictEqual(inst.news[0].text, mine.text);
  assert.ok(inst.news[1].auto.added.includes('iris-1.8'));
  // borrar una
  r = await call('PATCH', base, { cookie: creator, body: { data: { news: [mine] } } });
  assert.deepStrictEqual(r.data.data.news.map(x => x.id), ['abc123def']);
});

await test('Uso del launcher: instalaciones, activos y países (anónimo)', async () => {
  const id = (n) => n.toString(16).padStart(32, '0');
  const hi = (n, country, extra = {}) => call('POST', '/api/hello', { headers: { 'cf-ipcountry': country }, body: { install: id(n), version: '1.7.6', platform: 'win32', lang: 'es', ...extra } });
  assert.strictEqual((await call('POST', '/api/hello', { body: { install: 'hola' } })).status, 400);
  await hi(1, 'CO'); await hi(2, 'CO'); await hi(3, 'ES', { platform: 'darwin', lang: 'ca' }); await hi(4, 'MX', { platform: 'linux', version: '1.7.5' });
  await hi(1, 'CO'); // el mismo día otra vez: no cuenta doble
  let r = await call('GET', '/api/onyx/launcher?days=7', { cookie: creator });
  assert.strictEqual(r.status, 200);
  const d = r.data;
  assert.deepStrictEqual([d.total, d.activeToday, d.newToday], [4, 4, 4]);
  assert.strictEqual(d.daily.length, 7);
  assert.deepStrictEqual([d.daily[6].active, d.daily[6].fresh], [4, 4]);
  assert.deepStrictEqual(d.countries[0], { c: 'CO', n: 2, active: 2 });
  assert.ok(d.platforms.some(p => p.p === 'darwin' && p.n === 1));
  assert.ok(d.versions.some(v => v.v === '1.7.5'));
  assert.strictEqual((await call('GET', '/api/onyx/launcher', { cookie: other })).status, 403, 'solo el Creador');
});

await test('Directos: canales del jugador, oficiales y «En directo ahora»', async () => {
  const { cleanHandle } = await import('../src/streams.js');
  assert.strictEqual(cleanHandle('twitch', 'https://www.twitch.tv/Ana_GG?x=1'), 'ana_gg');
  assert.strictEqual(cleanHandle('tiktok', 'https://www.tiktok.com/@leo.mc/live'), 'leo.mc');
  assert.strictEqual(cleanHandle('kick', '@Leo'), 'leo');
  assert.strictEqual(cleanHandle('twitch', 'a b'), null);
  assert.strictEqual(cleanHandle('kick', ''), '');
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Directos' } });
  const sid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${sid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true } } } });
  const ana = await player('AnaStream', false), leo = await player('LeoKick', false), sin = await player('SinCanal', false);
  // los canales del jugador
  let r = await call('POST', '/api/l/channels', { headers: ana, body: { twitch: 'twitch.tv/ana', tiktok: '@ana.tt' } });
  assert.deepStrictEqual(r.data.channels, { twitch: 'ana', tiktok: 'ana.tt', kick: '' });
  assert.strictEqual((await call('POST', '/api/l/channels', { headers: ana, body: { kick: 'no vale!' } })).status, 400);
  await call('POST', '/api/l/channels', { headers: leo, body: { kick: 'https://kick.com/leo', twitch: 'leo' } });
  assert.strictEqual((await call('POST', '/api/l/channels/live', { headers: sin, body: { platform: 'tiktok', on: true } })).status, 400, 'sin canal no se marca');
  // nadie juega: no sale nadie
  r = await call('GET', `/api/l/live/${sid}`, { headers: sin });
  assert.deepStrictEqual(r.data.live, []);
  // juegan: Ana (Twitch en directo) y Leo (Kick en directo, Twitch apagado)
  for (const h of [ana, leo, sin]) assert.strictEqual((await call('POST', '/api/l/play', { headers: h, body: { instance: sid } })).status, 200);
  r = await call('GET', `/api/l/live/${sid}`, { headers: sin });
  const live = r.data.live;
  assert.deepStrictEqual(live.map(x => `${x.platform}:${x.handle}:${x.name}`).sort(), ['kick:leo:LeoKick', 'twitch:ana:AnaStream']);
  const tw = live.find(x => x.platform === 'twitch');
  assert.deepStrictEqual([tw.title, tw.viewers, tw.url], ['Día 3 de IGNITE', 1234, 'https://www.twitch.tv/ana']);
  assert.ok(tw.thumb.includes('live_user_ana'));
  assert.strictEqual(live[0].viewers, 1234, 'los que más gente tienen, primero');
  // otra vez enseguida: no se vuelve a preguntar (vale 3 minutos)
  const before = streamCalls;
  await call('GET', `/api/l/live/${sid}`, { headers: sin });
  assert.strictEqual(streamCalls, before);
  // TikTok no se sabe: el jugador lo marca a mano
  r = await call('POST', '/api/l/channels/live', { headers: ana, body: { platform: 'tiktok', on: true } });
  assert.deepStrictEqual(r.data.manual, ['tiktok']);
  r = await call('GET', `/api/l/live/${sid}`, { headers: sin });
  assert.ok(r.data.live.some(x => x.platform === 'tiktok' && x.handle === 'ana.tt' && x.manual && x.url === 'https://www.tiktok.com/@ana.tt/live'));
  // el studio: canales oficiales y quién está en directo
  r = await call('POST', `/api/s/onyx-studios/streams/${sid}`, { cookie: creator, body: { channels: { kick: 'leo', twitch: 'https://twitch.tv/ana' } } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.channels, { twitch: 'ana', tiktok: '', kick: 'leo' });
  assert.strictEqual(r.data.withChannel, 2);
  assert.ok(r.data.live[0].official, 'los oficiales primero');
  assert.strictEqual(r.data.live.filter(x => x.platform === 'twitch' && x.handle === 'ana').length, 1, 'sin repetir');
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/streams/${sid}`, { cookie: other })).status, 403);
  // deja de jugar: ya no sale (salvo el canal oficial)
  const plays = (await env.DB.prepare('SELECT id, player_key FROM plays WHERE instance_id = ? AND ended_at IS NULL').bind(sid).all()).results;
  await env.DB.prepare('UPDATE plays SET ended_at = ? WHERE instance_id = ?').bind(Date.now(), sid).run();
  r = await call('GET', `/api/l/live/${sid}`, { headers: sin });
  assert.ok(r.data.live.every(x => x.official), JSON.stringify(r.data.live));
  assert.ok(plays.length === 3);
  // el cron: quita el «en directo» a mano de quien ya no juega
  await worker.scheduled({}, env, { waitUntil: () => {} });
  const { refreshDue } = await import('../src/streams.js');
  await refreshDue(env);
  r = await call('GET', '/api/l/channels', { headers: ana });
  assert.deepStrictEqual(r.data.manual, []);
});

await test('Insignias: cálculo puro (horas, rachas, madrugada, eventos, reglas)', async () => {
  const B = await import('../src/badges.js');
  const H = 3600e3, D = 864e5, base = Date.UTC(2026, 10, 1, 12);
  // 5 días seguidos (2 h al día), un hueco, y 2 días más; una partida de 3:30 a 4:30 en Bogotá (UTC-5 → 8:30 UTC)
  const plays = [0, 1, 2, 3, 4, 6, 7].map(d => ({ instance_id: d < 3 ? 'a' : 'b', start: base + d * D, end: base + d * D + 2 * H }));
  plays.push({ instance_id: 'c', start: Date.UTC(2026, 10, 10, 8, 30), end: Date.UTC(2026, 10, 10, 9, 30) });
  const f = B.playerFacts(plays, { tz: -300, guarded: new Set(['b']), at: base + 400 * D });
  assert.strictEqual(f.hours, 15);
  assert.strictEqual(f.fairHours, 8);
  assert.strictEqual(f.streak, 5);
  assert.strictEqual(f.instances, 3);
  assert.ok(f.night && !f.early, 'de 3:30 a 4:30 hora local: noctámbulo');
  assert.ok(!B.playerFacts(plays, { tz: 0 }).night, 'en UTC eran las 8:30: no');
  const st = Object.fromEntries(B.builtinState(f, { supporter: true }).map(x => [x.id, x]));
  assert.ok(st['hours-10'].earned && !st['hours-100'].earned);
  assert.strictEqual(st['hours-100'].cur, 15);
  assert.ok(!st['streak-7'].earned && st['streak-7'].cur === 5);
  assert.ok(st.pioneer.earned && st.anniversary.earned && st.supporter.earned && st['night-owl'].earned);
  assert.ok(!st['kopi-team'].earned && !st['studio-staff'].earned);
  assert.ok(!B.builtinState({ ...f, fairHours: 60 }, { sanctioned: true }).find(x => x.id === 'fair-50').earned, 'con sanción no hay juego limpio');
  // una partida colgada (sin final) no cuenta más de 24 h
  assert.strictEqual(B.playerFacts([{ instance_id: 'x', start: 0, end: 30 * D }]).hours, 24);
  // reglas del studio y eventos
  assert.deepStrictEqual(B.ruleState({ type: 'hours', instance: 'b', hours: 10 }, plays), { earned: false, cur: 8, max: 10 });
  assert.ok(B.ruleState({ type: 'played', instance: 'c' }, plays).earned);
  assert.strictEqual(B.ruleState({ type: 'manual' }, plays), null);
  assert.ok(B.playedEvent({ instance_id: 'a', starts_at: base + H, ends_at: null }, plays));
  assert.ok(!B.playedEvent({ instance_id: 'a', starts_at: base + 3 * H, ends_at: base + 5 * H }, plays));
});

await test('Insignias: launcher, vitrina, studio (a mano y solas) y especiales del Creador', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Insignias' } });
  const iid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true } } } });
  const h = await player('Medallas', false);
  // juega 3 horas (partida vieja ya acabada) y ahora otra
  const t = Date.now();
  await env.DB.prepare('INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('old-medallas', iid, 'onyx-studios', 'medallas', 'Medallas', t - 5 * 3600e3, t - 2 * 3600e3, t - 2 * 3600e3).run();
  assert.strictEqual((await call('POST', '/api/l/play', { headers: h, body: { instance: iid } })).status, 200);
  let r = await call('GET', '/api/l/badges?tz=-300', { headers: h });
  assert.strictEqual(r.status, 200);
  const by = Object.fromEntries(r.data.badges.map(b => [b.id, b]));
  assert.ok(by['hours-1'].earned && by['hours-1'].at, 'una hora: ganada y con fecha');
  assert.ok(!by['hours-10'].earned && by['hours-10'].progress.cur >= 3);
  assert.ok(by.pioneer.earned);
  assert.ok(by['night-owl'].secret);
  assert.ok(r.data.showcase.includes('pioneer'), 'sin elegir: las más raras');
  const firstAt = by['hours-1'].at;
  r = await call('GET', '/api/l/badges', { headers: h });
  assert.strictEqual(r.data.badges.find(b => b.id === 'hours-1').at, firstAt, 'la fecha no cambia');
  // vitrina
  assert.strictEqual((await call('POST', '/api/l/badges/showcase', { headers: h, body: { ids: ['hours-1000'] } })).status, 400, 'no la tiene');
  r = await call('POST', '/api/l/badges/showcase', { headers: h, body: { ids: ['hours-1', 'pioneer'] } });
  assert.deepStrictEqual(r.data.showcase, ['hours-1', 'pioneer']);
  assert.deepStrictEqual((await call('GET', '/api/l/badges', { headers: h })).data.showcase, ['hours-1', 'pioneer']);
  // el studio crea dos: una a mano y otra sola (2 horas en la instancia)
  assert.strictEqual((await call('POST', '/api/s/onyx-studios/badges', { cookie: creator, body: { name: '' } })).status, 400);
  assert.strictEqual((await call('POST', '/api/s/onyx-studios/badges', { cookie: creator, body: { name: 'X', rule: { type: 'hours', instance: 'otra' } } })).status, 400);
  const man = (await call('POST', '/api/s/onyx-studios/badges', { cookie: creator, body: { name: 'Ganador IGNITE', rarity: 'legendary', icon: 'trophy', color: '#FFAA00' } })).data;
  const auto = (await call('POST', '/api/s/onyx-studios/badges', { cookie: creator, body: { name: 'Superviviente', rule: { type: 'hours', instance: iid, hours: 2 }, icon: 'nope' } })).data;
  assert.strictEqual(man.color, '#ffaa00');
  assert.strictEqual(auto.icon, 'star', 'icono raro → estrella');
  r = await call('POST', `/api/s/onyx-studios/badges/${man.id}/grant`, { cookie: creator, body: { names: 'Medallas, mal-nombre!, Otro_1' } });
  assert.strictEqual(r.data.holders, 2);
  r = await call('GET', '/api/l/badges', { headers: h });
  const sb = r.data.badges.filter(b => b.custom).map(b => `${b.name}:${b.earned}:${b.studio}`).sort();
  assert.deepStrictEqual(sb, ['Ganador IGNITE:true:Kopi Studio', 'Superviviente:true:Kopi Studio']);
  r = await call('GET', '/api/s/onyx-studios/badges', { cookie: creator });
  assert.strictEqual(r.data.badges.find(b => b.id === auto.id).holders, 1, 'la automática ya la tiene 1');
  assert.strictEqual((await call('POST', '/api/s/onyx-studios/badges', { cookie: other, body: { name: 'Hack' } })).status, 403);
  // quitar a mano
  await call('DELETE', `/api/s/onyx-studios/badges/${man.id}/grant`, { cookie: creator, body: { names: 'Medallas' } });
  r = await call('GET', '/api/l/badges', { headers: h });
  assert.ok(!r.data.badges.some(b => b.id === 'sb:' + man.id), 'quitada');
  // especiales del Creador
  assert.strictEqual((await call('POST', '/api/onyx/badges', { cookie: other, body: { badge: 'kopi-team', names: 'Medallas' } })).status, 403);
  r = await call('POST', '/api/onyx/badges', { cookie: creator, body: { badge: 'kopi-team', names: 'Medallas' } });
  assert.strictEqual(r.data.special.find(s => s.id === 'kopi-team').players[0].name, 'Medallas');
  r = await call('GET', '/api/l/badges', { headers: h });
  assert.ok(r.data.badges.find(b => b.id === 'kopi-team').earned);
  // borrar la insignia del studio
  assert.strictEqual((await call('DELETE', `/api/s/onyx-studios/badges/${auto.id}`, { cookie: creator })).status, 200);
  r = await call('GET', '/api/l/badges', { headers: h });
  assert.ok(!r.data.badges.some(b => b.id === 'sb:' + auto.id));
});

await test('Perfil público en la web: solo si el jugador lo activa', async () => {
  const h = await player('PixelPro', false);
  // por defecto, privado
  let r = await call('GET', '/api/l/public', { headers: h });
  assert.deepStrictEqual(r.data, { public: false, url: 'https://onyxclient.site/u/PixelPro' });
  assert.strictEqual((await call('GET', '/api/public/player/PixelPro')).status, 404);
  assert.strictEqual((await call('GET', '/api/public/player/nadie_aqui')).status, 404);
  assert.strictEqual((await call('GET', '/api/public/player/mal nombre')).status, 404);
  // juega un rato, pone su canal y lo activa
  const t = Date.now();
  await env.DB.prepare('INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('pp-1', 'ignite-extremo-3', 'onyx-studios', 'pixelpro', 'PixelPro', t - 4 * 3600e3, t - 3600e3, t - 3600e3).run();
  await call('POST', '/api/l/channels', { headers: h, body: { twitch: 'pixelpro' } });
  await call('POST', '/api/l/badges/showcase', { headers: h, body: { ids: ['hours-1'] } });
  r = await call('POST', '/api/l/public', { headers: h, body: { on: true } });
  assert.strictEqual(r.data.public, true);
  r = await call('GET', '/api/public/player/pixelpro');
  assert.strictEqual(r.status, 200);
  const p = r.data;
  assert.strictEqual(p.name, 'PixelPro');
  assert.strictEqual(p.url, 'https://onyxclient.site/u/PixelPro');
  assert.ok(p.premium);
  assert.deepStrictEqual([p.skin.slim, p.skin.url.endsWith('/api/public/player/PixelPro/skin.png')], [true, true]);
  assert.strictEqual(p.stats.hours, 3);
  assert.ok(p.stats.since && !p.stats.online);
  assert.ok(p.badges.some(b => b.id === 'hours-1'));
  assert.ok(p.badges.every(b => b.at), 'con fecha');
  assert.ok(p.total > p.badges.length);
  assert.deepStrictEqual(p.showcase.map(b => b.id), ['hours-1']);
  assert.deepStrictEqual(p.channels, [{ platform: 'twitch', handle: 'pixelpro', url: 'https://www.twitch.tv/pixelpro', live: false, title: '', viewers: null }]);
  assert.strictEqual(p.cape, null);
  assert.ok(!('key' in p) && !JSON.stringify(p).includes('owner'), 'nada interno');
  // la skin pasa por el panel (con permiso para pintarla en la web)
  const sk = await worker.fetch(new Request('http://localhost/api/public/player/PixelPro/skin.png'), env, { waitUntil() {} });
  assert.strictEqual(sk.status, 200);
  assert.strictEqual(sk.headers.get('Access-Control-Allow-Origin'), '*');
  // lo desactiva: vuelve a ser privado
  await call('POST', '/api/l/public', { headers: h, body: { on: false } });
  assert.strictEqual((await call('GET', '/api/public/player/PixelPro')).status, 404);
  assert.strictEqual((await worker.fetch(new Request('http://localhost/api/public/player/PixelPro/skin.png'), env, { waitUntil() {} })).status, 404);
});

await test('Cuenta atrás: opciones del studio y próximo evento en el launcher', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Cuenta atrás' } });
  const iid = made.data.id;
  const opens = Date.now() + 3 * 864e5;
  let r = await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true }, schedule: { opensAt: opens, predownload: true, countdownText: '  IGNITE 4 empieza en  ' + 'x'.repeat(80) } } } });
  assert.strictEqual(r.status, 200);
  const h = await player('Cuentista', false);
  // un evento pasado, uno privado y dos futuros: sale el más cercano que sea público
  for (const [title, at, pub] of [['Pasado', Date.now() - 864e5, true], ['Privado', Date.now() + 864e5, false], ['Final', Date.now() + 2 * 864e5, true], ['Luego', Date.now() + 5 * 864e5, true]]) {
    const e = await call('POST', '/api/s/onyx-studios/events', { cookie: creator, body: { title, category: 'event', color: '#ff5ec4', starts_at: at, instance_id: iid, public: pub } });
    assert.strictEqual(e.status, 201, JSON.stringify(e.data));
  }
  r = await call('GET', '/api/l/instances', { headers: h });
  const inst = r.data.instances.find(i => i.id === iid);
  assert.ok(inst, 'la instancia pública sale');
  assert.strictEqual(inst.schedule.opensAt, opens);
  assert.strictEqual(inst.schedule.countdown, true, 'encendida por defecto');
  assert.ok(inst.schedule.countdownText.length <= 60, 'texto recortado');
  assert.ok(inst.schedule.countdownText.startsWith('IGNITE 4 empieza en'));
  assert.strictEqual(inst.nextEvent.title, 'Final');
  assert.strictEqual(inst.nextEvent.color, '#ff5ec4');
  // el studio la apaga
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { data: { schedule: { countdown: false } } } });
  r = await call('GET', '/api/l/instances', { headers: h });
  assert.strictEqual(r.data.instances.find(i => i.id === iid).schedule.countdown, false);
});

await test('Ficha del jugador: búsqueda, horas, instancias, KopiGuard y baneos (solo del studio)', async () => {
  const t = Date.now(), H = 3600e3;
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Ficha' } });
  const iid = made.data.id;
  const ins = (id, inst, studio, start, ms, ended = true) => env.DB.prepare('INSERT INTO plays (id, instance_id, studio_id, player_key, player_name, started_at, last_seen, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, inst, studio, 'fichado', 'Fichado', start, start + ms, ended ? start + ms : null).run();
  await ins('f1', iid, 'onyx-studios', t - 3 * 864e5, 2 * H);
  await ins('f2', iid, 'onyx-studios', t - 864e5, 1 * H);
  await ins('f3', 'otra-de-otro-studio', 'otro-studio', t - 864e5, 5 * H); // de otro studio: no cuenta
  await ins('f4', iid, 'onyx-studios', t - 10 * 60e3, 10 * 60e3, false);   // jugando ahora
  await env.DB.prepare("INSERT INTO guard_events (id, studio_id, instance_id, player_key, player_name, type, severity, detail, status, created_at) VALUES ('gf1', 'onyx-studios', ?, 'fichado', 'Fichado', 'mod', 'high', 'Mod de trampas', 'sanctioned', ?)").bind(iid, t - H).run();
  await env.DB.prepare("INSERT INTO guard_events (id, studio_id, instance_id, player_key, player_name, type, severity, detail, status, created_at) VALUES ('gf2', 'otro-studio', 'x', 'fichado', 'Fichado', 'mod', 'high', 'De otro studio', 'new', ?)").bind(t - H).run();
  // lista y búsqueda
  let r = await call('GET', '/api/s/onyx-studios/players?q=fich', { cookie: creator });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.players.map(p => [p.name, p.online, p.sessions]), [['Fichado', true, 3]]);
  r = await call('GET', '/api/s/onyx-studios/players', { cookie: creator });
  assert.strictEqual(r.data.players[0].name, 'Fichado', 'el que está jugando, primero');
  // la ficha
  r = await call('GET', '/api/s/onyx-studios/players/Fichado', { cookie: creator });
  assert.strictEqual(r.status, 200);
  const f = r.data;
  assert.strictEqual(f.name, 'Fichado');
  assert.strictEqual(f.stats.sessions, 3);
  assert.ok(Math.abs(f.stats.hours - 3.2) < 0.05, 'solo horas de este studio: ' + f.stats.hours);
  assert.strictEqual(f.online.instanceId, iid);
  assert.deepStrictEqual(f.instances.map(i => i.id), [iid], 'solo instancias del studio');
  assert.strictEqual(f.days.length, 30);
  assert.ok(Math.abs(f.days.reduce((a, d) => a + d.hours, 0) - 3.2) < 0.1);
  assert.strictEqual(f.guard.total, 1, 'las detecciones de otros studios no salen');
  assert.strictEqual(f.guard.byStatus.sanctioned, 1);
  assert.ok(f.badges.some(b => b.id === 'hours-1'));
  // baneo del studio: sale en la ficha
  assert.strictEqual((await call('POST', '/api/s/onyx-studios/bans', { cookie: creator, body: { kind: 'name', value: 'Fichado' } })).status, 200);
  r = await call('GET', '/api/s/onyx-studios/players/fichado', { cookie: creator });
  assert.deepStrictEqual(r.data.bans.map(b => b.scope), ['studio']);
  // nombres raros y jugadores que no existen
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/players/nadie_jamas', { cookie: creator })).status, 404);
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/players/mal%20nombre', { cookie: creator })).status, 400);
  // de otro studio no se puede mirar
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/players/Fichado', { cookie: other })).status, 403);
});

await test('Grupos de jugadores: dar acceso a una instancia por grupo', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Solo VIP' } });
  const iid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'open' } });
  const vip = await player('ElVip', false), nope = await player('ElNoVip', false);
  const sees = async (h) => (await call('GET', '/api/l/instances', { headers: h })).data.instances.some(i => i.id === iid);
  assert.ok(!(await sees(vip)), 'sin grupo no la ve');
  // crear el grupo con un jugador
  assert.strictEqual((await call('POST', '/api/s/onyx-studios/groups', { cookie: creator, body: { name: '' } })).status, 400);
  let r = await call('POST', '/api/s/onyx-studios/groups', { cookie: creator, body: { name: 'VIP', color: '#fbbf24', names: 'ElVip, mal nombre!' } });
  assert.strictEqual(r.status, 201);
  const gid = r.data.id;
  assert.ok(/^[a-z0-9]{12}$/.test(gid));
  assert.strictEqual(r.data.members, 2, '«mal» y «ElVip»'); // «nombre!» no vale
  await call('DELETE', `/api/s/onyx-studios/groups/${gid}/members/mal`, { cookie: creator });
  // la instancia da acceso al grupo (y a un grupo que no existe: se ignora)
  r = await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { data: { access: { groups: [gid, 'NO VALE', 'zzzzzzzzzzzz'] } } } });
  assert.deepStrictEqual(r.data.data.access.groups, [gid, 'zzzzzzzzzzzz']);
  assert.ok(await sees(vip), 'en el grupo: la ve');
  assert.ok(!(await sees(nope)), 'fuera del grupo: no');
  assert.strictEqual((await call('POST', '/api/l/play', { headers: vip, body: { instance: iid } })).status, 200);
  assert.strictEqual((await call('POST', '/api/l/play', { headers: nope, body: { instance: iid } })).status, 403);
  assert.strictEqual((await call('GET', `/api/l/instance/${iid}`, { headers: vip })).status, 200);
  // la lista de grupos dice qué instancias lo usan; el detalle, quién está
  r = await call('GET', '/api/s/onyx-studios/groups', { cookie: creator });
  const g = r.data.groups.find(x => x.id === gid);
  assert.deepStrictEqual([g.members, g.instances.map(i => i.id)], [1, [iid]]);
  r = await call('GET', `/api/s/onyx-studios/groups/${gid}`, { cookie: creator });
  assert.deepStrictEqual(r.data.list.map(x => x.name), ['ElVip']);
  // en su ficha sale el grupo
  r = await call('GET', '/api/s/onyx-studios/players/ElVip', { cookie: creator });
  assert.deepStrictEqual(r.data.groups.map(x => x.name), ['VIP']);
  // otro studio no puede tocarlo
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/groups/${gid}`, { cookie: other })).status, 403);
  // fuera del grupo: deja de verla; y si se borra el grupo, igual
  await call('DELETE', `/api/s/onyx-studios/groups/${gid}/members/ElVip`, { cookie: creator });
  assert.ok(!(await sees(vip)));
  await call('POST', `/api/s/onyx-studios/groups/${gid}/members`, { cookie: creator, body: { names: ['ElVip'] } });
  assert.ok(await sees(vip));
  assert.strictEqual((await call('DELETE', `/api/s/onyx-studios/groups/${gid}`, { cookie: creator })).status, 200);
  assert.ok(!(await sees(vip)), 'grupo borrado: sin acceso');
});

await test('Reportes de jugadores: denunciar desde el launcher con captura y resolver en el panel', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Reportes' } });
  const iid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true } } } });
  const ana = await player('Denunciante', false), malo = await player('ElTramposo', false), fuera = await player('NoJugo', false);
  // sin haber jugado no se puede
  assert.strictEqual((await call('POST', '/api/l/preport', { headers: ana, body: { instance: iid, target: 'ElTramposo', reason: 'cheats' } })).status, 403);
  for (const h of [ana, malo]) assert.strictEqual((await call('POST', '/api/l/play', { headers: h, body: { instance: iid } })).status, 200);
  // quién está jugando (sin uno mismo); quien no ha jugado no ve a nadie
  assert.deepStrictEqual((await call('GET', `/api/l/online/${iid}`, { headers: ana })).data.players, ['ElTramposo']);
  assert.deepStrictEqual((await call('GET', `/api/l/online/${iid}`, { headers: fuera })).data.players, []);
  // datos que no valen
  assert.strictEqual((await call('POST', '/api/l/preport', { headers: ana, body: { instance: iid, target: 'Denunciante', reason: 'cheats' } })).status, 400, 'a sí mismo no');
  assert.strictEqual((await call('POST', '/api/l/preport', { headers: ana, body: { instance: iid, target: 'ElTramposo', reason: 'nada' } })).status, 400);
  assert.strictEqual((await call('POST', '/api/l/preport', { headers: ana, body: { instance: iid, target: 'mal nombre', reason: 'cheats' } })).status, 400);
  // el reporte, con captura
  let r = await call('POST', '/api/l/preport', { headers: ana, body: { instance: iid, target: 'ElTramposo', reason: 'cheats', text: 'Vuela por encima de la base' } });
  assert.strictEqual(r.status, 200);
  const rid = r.data.id;
  assert.strictEqual((await call('POST', '/api/l/preport', { headers: ana, body: { instance: iid, target: 'ElTramposo', reason: 'abuse' } })).status, 409, 'repetido enseguida');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const up = async (body) => worker.fetch(new Request(`http://localhost/api/l/preport/${rid}/shot`, { method: 'POST', headers: { ...ana, 'Content-Type': 'application/octet-stream' }, body }), env, { waitUntil() {} });
  assert.strictEqual((await up(new Uint8Array([1, 2, 3]))).status, 400, 'no es JPEG');
  assert.strictEqual((await up(jpeg)).status, 200);
  assert.strictEqual((await up(jpeg)).status, 409, 'solo una');
  // el panel: lo ve, con la captura, y lo resuelve
  r = await call('GET', '/api/s/onyx-studios/reports', { cookie: creator });
  const rep = r.data.reports.find(x => x.id === rid);
  assert.deepStrictEqual([rep.reporter, rep.target, rep.reason, rep.text, rep.shot, rep.status, rep.times], ['Denunciante', 'ElTramposo', 'cheats', 'Vuela por encima de la base', true, 'new', 1]);
  assert.strictEqual(r.data.counts.new >= 1, true);
  const img = await worker.fetch(new Request(`http://localhost/api/s/onyx-studios/reports/${rid}/shot`, { headers: { Cookie: creator } }), env, { waitUntil() {} });
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.headers.get('Content-Type'), 'image/jpeg');
  r = await call('PATCH', `/api/s/onyx-studios/reports/${rid}`, { cookie: creator, body: { status: 'actioned', note: 'Baneado 7 días' } });
  assert.deepStrictEqual([r.data.status, r.data.note], ['actioned', 'Baneado 7 días']);
  r = await call('GET', '/api/s/onyx-studios/reports?status=actioned', { cookie: creator });
  assert.ok(r.data.reports.some(x => x.id === rid && x.note === 'Baneado 7 días'));
  // en la ficha del denunciado sale
  r = await call('GET', '/api/s/onyx-studios/players/ElTramposo', { cookie: creator });
  assert.deepStrictEqual([r.data.reports.total, r.data.reports.recent[0].by], [1, 'Denunciante']);
  // otro studio no lo ve
  assert.strictEqual((await call('GET', '/api/s/onyx-studios/reports', { cookie: other })).status, 403);
});

await test('Rendimiento: el launcher manda el resumen y el panel da consejos', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Pesada' } });
  const iid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true } } } });
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/instances/${iid}/perf`, { cookie: creator })).data.sessions, 0, 'sin datos');
  const pcs = [['PcLento', 8192, 'Intel UHD Graphics 620'], ['PcBueno', 32768, 'NVIDIA GeForce RTX 3070'], ['PcMedio', 16384, 'AMD Radeon RX 6600']];
  let sent = 0;
  for (const [name, ram, gpu] of pcs) {
    const h = await player(name, false);
    for (let i = 0; i < 2; i++) {
      const pl = await call('POST', '/api/l/play', { headers: h, body: { instance: iid } });
      const crash = name === 'PcLento' ? { kind: 'memory', mod: null } : (name === 'PcMedio' && i === 0 ? { kind: 'mixin', mod: 'iris' } : null);
      const r = await call('POST', '/api/l/perf', { headers: h, body: { play: pl.data.play, loadMs: ram <= 8192 ? 120000 : 95000, minutes: 30, memPeakMb: ram <= 8192 ? 7400 : 5200, memAllocMb: 6144, mods: 90, ramMb: ram, cores: 8, cpu: 'CPU', gpu, os: 'windows', crash } });
      assert.strictEqual(r.status, 200); sent++;
    }
    if (name === 'PcBueno') {
      assert.strictEqual((await call('POST', '/api/l/perf', { headers: h, body: { play: 'no-existe' } })).status, 404);
      const other = await player('Intruso', false);
      const pl = await call('POST', '/api/l/play', { headers: h, body: { instance: iid } });
      assert.strictEqual((await call('POST', '/api/l/perf', { headers: other, body: { play: pl.data.play } })).status, 404, 'la partida de otro no');
    }
  }
  const r = await call('GET', `/api/s/onyx-studios/instances/${iid}/perf`, { cookie: creator });
  assert.strictEqual(r.data.sessions, sent);
  assert.strictEqual(r.data.players, 3);
  assert.deepStrictEqual([r.data.load.median, r.data.crashes.n, r.data.crashes.kinds.memory], [95, 3, 2]);
  assert.deepStrictEqual(r.data.gpus.intel + r.data.gpus.nvidia + r.data.gpus.amd, 3);
  assert.deepStrictEqual(r.data.ram, { r4: 0, r8: 1, r16: 1, r32: 1 });
  const codes = r.data.tips.map(x => x.code);
  assert.ok(codes.includes('oom') && codes.includes('crashes') && codes.includes('slowload'), codes.join());
  assert.ok(!codes.includes('ok'));
  assert.strictEqual((await call('GET', `/api/s/onyx-studios/instances/${iid}/perf`, { cookie: other })).status, 403, 'otro studio no');
});

await test('Cámaras en vídeo: el navegador propone, el launcher contesta', async () => {
  const made = await call('POST', '/api/s/onyx-studios/instances', { cookie: creator, body: { name: 'Con cámara' } });
  const iid = made.data.id;
  await call('PATCH', `/api/s/onyx-studios/instances/${iid}`, { cookie: creator, body: { state: 'open', data: { access: { public: true }, guard: { enabled: true } } } });
  const h = await player('Camarita', false);
  const pl = await call('POST', '/api/l/play', { headers: h, body: { instance: iid } });
  const play = pl.data.play;
  const base = `/api/s/onyx-studios/guard/live/${play}/rtc`;
  const ice = await call('GET', base, { cookie: creator });
  assert.strictEqual(ice.status, 200); assert.ok(Array.isArray(ice.data.ice) && ice.data.ice.length, 'servidores para conectar');
  assert.strictEqual((await call('POST', base, { cookie: creator, body: { offer: 'hola' } })).status, 400, 'propuesta rara');
  const off = await call('POST', base, { cookie: creator, body: { offer: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' } });
  assert.strictEqual(off.status, 201); const id = off.data.id;
  assert.strictEqual((await call('GET', `${base}?id=${id}`, { cookie: creator })).data.state, 'new');
  // el launcher la recoge en el latido (una sola vez)
  const b1 = await call('POST', '/api/l/beat', { headers: h, body: { play } });
  assert.strictEqual(b1.data.cam, 'live'); assert.strictEqual(b1.data.rtc.length, 1); assert.strictEqual(b1.data.rtc[0].id, id);
  assert.ok(b1.data.rtc[0].offer.startsWith('v=0') && b1.data.rtc[0].ice.length);
  const b2 = await call('POST', '/api/l/beat', { headers: h, body: { play } });
  assert.ok(!b2.data.rtc, 'no se repite');
  // otro jugador no puede contestar por él
  const miron = await player('Miron', false);
  assert.strictEqual((await call('POST', '/api/l/guard/rtc', { headers: miron, body: { play, id, answer: 'v=0\r\n' } })).status, 404);
  assert.strictEqual((await call('POST', '/api/l/guard/rtc', { headers: h, body: { play, id, answer: 'v=0\r\nfin' } })).status, 200);
  const a = await call('GET', `${base}?id=${id}`, { cookie: creator });
  assert.deepStrictEqual([a.data.state, a.data.answer], ['answered', 'v=0\r\nfin']);
  assert.strictEqual((await call('POST', '/api/l/guard/rtc', { headers: h, body: { play, id, answer: 'v=0\r\notra' } })).status, 404, 'solo una respuesta');
  // cerrar
  assert.strictEqual((await call('POST', `${base}?id=${id}&close=1`, { cookie: creator, body: {} })).status, 200);
  assert.strictEqual((await call('GET', `${base}?id=${id}`, { cookie: creator })).data.state, 'closed');
  // también llega al mandar imagen; y otro studio no ve nada
  const off2 = await call('POST', base, { cookie: creator, body: { offer: 'v=0\r\nx' } });
  const fr = await call('POST', '/api/l/guard/frame', { headers: h, body: { play, frame: null, hd: true } });
  assert.strictEqual(fr.data.rtc[0].id, off2.data.id);
  assert.strictEqual((await call('GET', base, { cookie: other })).status, 403);
});

await test('Fallos de conexión: el launcher avisa y se ve el resumen (sin datos del jugador)', async () => {
  const r = await call('POST', '/api/l/neterr', { body: { host: 'panel.onyxclient.site', kind: 'cert', chrome: 'net::ERR_CERT_COMMON_NAME_INVALID', node: 'ERR_TLS_CERT_ALTNAME_INVALID', version: '1.8.6', os: 'win32' } });
  assert.strictEqual(r.status, 200);
  await call('POST', '/api/l/neterr', { body: { host: 'panel.onyxclient.site', kind: 'cert', chrome: 'net::ERR_CERT_COMMON_NAME_INVALID', node: 'ERR_TLS_CERT_ALTNAME_INVALID', version: '1.8.6', os: 'win32' } });
  assert.strictEqual((await call('POST', '/api/l/neterr', { body: { host: 'no vale/raro', kind: 'cert' } })).status, 400);
  const s = await call('GET', '/api/public/neterrs?h=1');
  assert.strictEqual(s.status, 200);
  const row = s.data.errors.find(x => x.host === 'panel.onyxclient.site');
  assert.ok(row && row.n === 2 && row.kind === 'cert' && /COMMON_NAME/.test(row.chrome));
  assert.ok(!('ip' in row) && !('player' in row));
});

console.log(`\n${passed} pruebas superadas${process.exitCode ? ' (con fallos)' : ''}`);
