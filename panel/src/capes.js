// Capas de Kopi dentro del juego.
//
// Qué capas tiene cada jugador (cape_owned) y cuál lleva puesta (cape_worn). De momento solo el Creador
// las regala desde el panel; el jugador elige cuál ponerse desde el launcher.
//
// Dos formas de verlas en el juego (las pone el launcher):
//  - Cape Provider (Fabric): GET /capes/<nombre>.png → la capa ANIMADA, con todos los fotogramas uno
//    debajo de otro (64×32 cada uno, 10 por segundo). 404 si no lleva ninguna.
//  - CustomSkinLoader (resto de loaders): el perfil de /csl/ incluye «cape», una imagen QUIETA.
//
// El dibujo de las capas está en public/js/cape-art.js (el mismo que usa la página del panel).
import '../public/js/cape-art.js';
import { json, fail, now, sha256, playerKey, NAME_RE, readJson, str } from './util.js';
import { encodePng } from './png.js';
import { audit } from './onyx.js';

const ART = globalThis.KopiCapeArt;
export const CAPE_IDS = ART.CAPES.map(c => c.id);
const TEX_W = 64, TEX_H = 32;
const SPRITE_FPS = 10; // Cape Provider pasa un fotograma cada 100 ms
const CORS = { 'Access-Control-Allow-Origin': '*' };

// ---------------------------------------------------------------- dibujar la textura de Minecraft
// Plantilla de capa de Minecraft (64×32):
//   capa:   lados (0,1) y (11,1) · delante (1,1) 10×16 · detrás (12,1) 10×16 · arriba/abajo (1,0) 20×1
//   élitros: lados (22,2) y (34,2) · delante (24,2) 10×20 · detrás (36,2) 10×20 · arriba/abajo (24,0) 20×2
// Igual que en el visor 3D del launcher: la cara interior, un 45 % más oscura; los bordes, del color
// de la esquina un 40 % más oscuros. En los élitros la última fila de la capa se alarga hasta 20.
function textureRGBA(cape, f) {
  const px = new Uint8Array(TEX_W * TEX_H * 4);
  const set = (x, y, [r, g, b]) => { const i = (y * TEX_W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  const grid = ART.pixels(cape, f).map(row => row.map(ART.rgb));
  const inner = (c) => c.map(v => Math.round(v * 0.55));
  const edge = grid[0][0].map(v => Math.trunc(v * 0.6));
  // capa
  for (let y = 0; y < ART.H; y++) for (let x = 0; x < ART.W; x++) { set(1 + x, 1 + y, grid[y][x]); set(12 + x, 1 + y, inner(grid[y][x])); }
  for (let y = 1; y <= 16; y++) { set(0, y, edge); set(11, y, edge); }
  for (let x = 1; x <= 20; x++) set(x, 0, edge);
  // élitros
  for (let y = 0; y < 20; y++) for (let x = 0; x < ART.W; x++) {
    const c = grid[Math.min(y, ART.H - 1)][x];
    set(24 + x, 2 + y, c); set(36 + x, 2 + y, inner(c));
  }
  for (let y = 2; y < 22; y++) for (const x of [22, 23, 34, 35]) set(x, y, edge);
  for (let y = 0; y < 2; y++) for (let x = 24; x < 44; x++) set(x, y, edge);
  return px;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// Cuántos fotogramas de 100 ms hacen falta para que la animación vuelva justo al principio
export function spriteFrameCount(cape) {
  if (cape.frames <= 1) return 1;
  const n = SPRITE_FPS * cape.frames;
  return n / gcd(n, cape.fps);
}
// Qué fotograma de la capa toca en cada paso de 100 ms (misma velocidad que en el launcher)
export const spriteFrameAt = (cape, i) => Math.floor(i * cape.fps / SPRITE_FPS) % cape.frames;

const built = new Map(); // id → { sprite, still, stillHash }
async function build(cape) {
  if (built.has(cape.id)) return built.get(cape.id);
  const n = spriteFrameCount(cape);
  const sheet = new Uint8Array(TEX_W * TEX_H * 4 * n);
  for (let i = 0; i < n; i++) sheet.set(textureRGBA(cape, spriteFrameAt(cape, i)), i * TEX_W * TEX_H * 4);
  const stillRGBA = textureRGBA(cape, cape.still || 0);
  const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', stillRGBA))].map(b => b.toString(16).padStart(2, '0')).join('');
  const out = { sprite: await encodePng(TEX_W, TEX_H * n, sheet), still: await encodePng(TEX_W, TEX_H, stillRGBA), stillHash: hex, frames: n };
  built.set(cape.id, out);
  return out;
}
export const capeImages = (id) => build(ART.get(id));

const png = (bytes, cache) => new Response(bytes, { headers: { ...CORS, 'Content-Type': 'image/png', 'Cache-Control': cache } });

// ---------------------------------------------------------------- consultas
const wornRow = (env, key) => env.DB.prepare('SELECT w.cape_id, w.player_name FROM cape_worn w JOIN cape_owned o ON o.player_key = w.player_key AND o.cape_id = w.cape_id WHERE w.player_key = ?').bind(key).first();

// /capes/<nombre>.png → la capa animada que lleva puesta (para Cape Provider)
export async function capesPublic(env, path) {
  const m = path.match(/^([A-Za-z0-9_]{2,16})\.png$/);
  if (!m) return new Response('Not found', { status: 404, headers: CORS });
  const row = await wornRow(env, playerKey(m[1]));
  if (!row || !ART.get(row.cape_id)) return new Response('Not found', { status: 404, headers: { ...CORS, 'Cache-Control': 'public, max-age=60' } });
  return png((await capeImages(row.cape_id)).sprite, 'public, max-age=60');
}

// Para CustomSkinLoader: el «hash» de la capa quieta que lleva el jugador (o null)
export async function cslCapeHash(env, key) {
  const row = await wornRow(env, key);
  return row && ART.get(row.cape_id) ? { name: row.player_name, hash: (await capeImages(row.cape_id)).stillHash } : null;
}
// …y la imagen de ese hash (null si no es de una capa)
export async function cslCapeTexture(hash) {
  for (const id of CAPE_IDS) {
    const b = await capeImages(id);
    if (b.stillHash === hash) return png(b.still, 'public, max-age=31536000, immutable');
  }
  return null;
}

// ---------------------------------------------------------------- launcher
// Una cuenta no premium se protege con la misma clave secreta que su skin (solo la conoce su launcher).
// Un nombre que alguna vez entró como premium solo se puede cambiar desde una sesión premium.
async function checkOwner(env, P, key) {
  if (P.verified) return null;
  const prem = await env.DB.prepare('SELECT 1 FROM player_tokens WHERE player_key = ? AND verified = 1 LIMIT 1').bind(P.key).first();
  if (prem) fail(403, 'premium_cape', 'Esta cuenta es premium: inicia sesión con Microsoft para cambiar la capa');
  const secret = String(key || '');
  if (secret.length < 24 || secret.length > 128) fail(400, 'key', 'Falta la clave de la cuenta');
  const owner = await sha256('kopi-skin:' + secret);
  const skin = await env.DB.prepare('SELECT owner_hash FROM skins WHERE name_key = ?').bind(P.key).first();
  const worn = await env.DB.prepare('SELECT owner_hash FROM cape_worn WHERE player_key = ?').bind(P.key).first();
  if ((skin && skin.owner_hash !== owner) || (worn && worn.owner_hash && worn.owner_hash !== owner)) fail(403, 'taken', 'Este nombre lo usa otro jugador');
  return owner;
}

export async function launcherCapes(env, P, parts, m, req) {
  if (parts[0] === 'capes' && m === 'GET') {
    const owned = (await env.DB.prepare('SELECT cape_id FROM cape_owned WHERE player_key = ? ORDER BY created_at, rowid').bind(P.key).all()).results
      .map(r => r.cape_id).filter(id => CAPE_IDS.includes(id));
    const worn = await wornRow(env, P.key);
    return json({ owned, worn: worn ? worn.cape_id : null });
  }
  if (parts[0] === 'cape' && m === 'POST') {
    const b = await readJson(req);
    const owner = await checkOwner(env, P, b.key);
    if (b.id == null || b.id === '') {
      await env.DB.prepare('DELETE FROM cape_worn WHERE player_key = ?').bind(P.key).run();
      return json({ ok: true, worn: null });
    }
    const id = String(b.id);
    if (!CAPE_IDS.includes(id)) fail(404, 'cape', 'Esa capa no existe');
    const has = await env.DB.prepare('SELECT 1 FROM cape_owned WHERE player_key = ? AND cape_id = ?').bind(P.key, id).first();
    if (!has) fail(403, 'not_owned', 'Todavía no tienes esta capa');
    await env.DB.prepare(`INSERT INTO cape_worn (player_key, player_name, cape_id, owner_hash, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_key) DO UPDATE SET player_name = excluded.player_name, cape_id = excluded.cape_id,
      owner_hash = COALESCE(excluded.owner_hash, cape_worn.owner_hash), updated_at = excluded.updated_at`)
      .bind(P.key, P.name, id, owner, now()).run();
    return json({ ok: true, worn: id });
  }
  return null;
}

// ---------------------------------------------------------------- Creador: regalar y quitar capas
export async function creatorCapes(c, id, name, m) {
  const { env, user } = c;
  if (!id && m === 'GET') {
    const counts = Object.fromEntries((await env.DB.prepare('SELECT cape_id, COUNT(*) AS n FROM cape_owned GROUP BY cape_id').all()).results.map(r => [r.cape_id, r.n]));
    const worn = Object.fromEntries((await env.DB.prepare('SELECT w.cape_id, COUNT(*) AS n FROM cape_worn w JOIN cape_owned o ON o.player_key = w.player_key AND o.cape_id = w.cape_id GROUP BY w.cape_id').all()).results.map(r => [r.cape_id, r.n]));
    return json({ capes: CAPE_IDS.map(i => ({ id: i, owners: counts[i] || 0, wearing: worn[i] || 0 })) });
  }
  if (!CAPE_IDS.includes(id)) fail(404, 'cape', 'Esa capa no existe');
  if (!name && m === 'GET') {
    const rows = (await env.DB.prepare(`SELECT o.player_name AS name, o.created_at, o.granted_by_name AS by_name, (w.cape_id IS NOT NULL) AS wearing
      FROM cape_owned o LEFT JOIN cape_worn w ON w.player_key = o.player_key AND w.cape_id = o.cape_id
      WHERE o.cape_id = ? ORDER BY o.created_at DESC, o.rowid DESC`).bind(id).all()).results;
    return json({ owners: rows.map(r => ({ name: r.name, at: r.created_at, by: r.by_name || null, wearing: !!r.wearing })) });
  }
  if (!name && m === 'POST') {
    const b = await readJson(c.req);
    const names = [...new Set((Array.isArray(b.names) ? b.names : String(b.name || '').split(/[\s,;]+/)).map(s => str(s, 32).trim()).filter(Boolean))];
    if (!names.length) fail(400, 'name', 'Escribe el nombre de un jugador');
    if (names.length > 50) fail(400, 'name', 'Como mucho 50 jugadores a la vez');
    if (names.some(n => !NAME_RE.test(n))) fail(400, 'name', 'Ese nombre de Minecraft no es válido');
    const t = now();
    const res = await env.DB.batch(names.map(n => env.DB.prepare(`INSERT INTO cape_owned (player_key, cape_id, player_name, source, granted_by, granted_by_name, created_at)
      VALUES (?, ?, ?, 'gift', ?, ?, ?) ON CONFLICT(player_key, cape_id) DO NOTHING`).bind(playerKey(n), id, n, user.id, user.name, t)));
    const added = names.filter((n, i) => res[i] && res[i].meta && res[i].meta.changes);
    if (added.length) await audit(env, user, null, 'cape.give', ART.get(id).name, { names: added.slice(0, 10), n: added.length, cape: id });
    return json({ ok: true, added: added.length, already: names.length - added.length });
  }
  if (name && m === 'DELETE') {
    const key = playerKey(name);
    const r = await env.DB.prepare('DELETE FROM cape_owned WHERE player_key = ? AND cape_id = ? RETURNING player_name').bind(key, id).first();
    if (!r) fail(404, 'owner', 'Ese jugador no tiene esta capa');
    await env.DB.prepare('DELETE FROM cape_worn WHERE player_key = ? AND cape_id = ?').bind(key, id).run();
    await audit(env, user, null, 'cape.take', ART.get(id).name, { name: r.player_name, cape: id });
    return json({ ok: true });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}
