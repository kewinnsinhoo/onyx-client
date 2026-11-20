// Skins en los servidores (plugin/mod «Kopi Skins»).
//
// Los servidores en modo offline no hablan con Mojang, así que todos salen con Steve/Alex.
// El plugin del servidor pregunta aquí por cada jugador que entra:
//   GET /api/public/skin/<nombre>  →  { value, signature }  (la propiedad «textures» firmada)
// - Si el nombre es de una cuenta premium: su skin real, pedida a Mojang (ya viene firmada).
// - Si no: la skin que el jugador eligió en Kopi Client. El launcher la sube con
//   POST /api/l/skin y aquí se convierte una sola vez con MineSkin (Minecraft solo enseña
//   skins guardadas y firmadas por Mojang).
// Una cuenta no premium solo puede cambiar su skin desde el launcher que la subió la primera vez
// (cada cuenta tiene una clave secreta que solo conoce ese launcher).
import { json, fail, now, sha256, playerKey } from './util.js';
import { cslCapeHash, cslCapeTexture } from './capes.js';

const NAME_RE = /^[A-Za-z0-9_]{2,16}$/;
const PREMIUM_TTL = 3 * 3600e3;      // cuánto se guarda la skin de un premium antes de volver a pedirla
const NOT_PREMIUM_TTL = 6 * 3600e3;  // cuánto se recuerda que un nombre NO es premium
const MAX_PNG = 48 * 1024;
const CORS = { 'Access-Control-Allow-Origin': '*' };
const UA = { 'User-Agent': 'KopiPanel/1.0 (+https://panel.onyxclient.site)' };

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const hex = (bytes) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
async function sha256Bytes(bytes) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); }

// PNG de skin válido: firma PNG y 64×64 o 64×32
export function skinSize(bytes) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || sig.some((v, i) => bytes[i] !== v)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20);
  return w === 64 && (h === 64 || h === 32) ? { w, h } : null;
}

// ---------------------------------------------------------------- premium (Mojang)
// Mojang suele bloquear o limitar las peticiones que salen de Cloudflare, así que se prueba por varios caminos:
//  1) el UUID verificado del jugador si alguna vez entró con Kopi (tabla player_tokens)
//  2) las búsquedas de Mojang por nombre (api.minecraftservices.com y api.mojang.com)
//  3) Ashcon (servicio público que guarda los perfiles de Mojang), como último recurso
// La skin firmada se pide a sessionserver con el UUID; si falla, también a Ashcon.
async function getJson(f, url, trace, step) {
  try {
    const r = await f(url, { headers: UA });
    trace.push([step, r.status]);
    if (r.status === 200) return { status: 200, body: await r.json() };
    return { status: r.status };
  } catch (e) {
    trace.push([step, 'error: ' + e.message]);
    return { status: 0 };
  }
}
const cleanUuid = (u) => String(u || '').replace(/-/g, '').toLowerCase();

async function lookupPremium(env, name, trace) {
  const f = env.MOJANG_FETCH || fetch;
  let uuid = null, realName = name, notFound = 0, ashcon = null;
  // 1) ¿Entró alguna vez con Kopi como premium verificado?
  const known = await env.DB.prepare('SELECT uuid, player_name FROM player_tokens WHERE player_key = ? AND verified = 1 AND uuid IS NOT NULL ORDER BY created_at DESC LIMIT 1').bind(playerKey(name)).first();
  if (known) { uuid = cleanUuid(known.uuid); realName = known.player_name; trace.push(['kopi', 'uuid']); }
  // 2) Mojang por nombre
  if (!uuid) {
    for (const [step, url] of [['minecraftservices', `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`], ['mojang', `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`]]) {
      const r = await getJson(f, url, trace, step);
      if (r.status === 200 && r.body && r.body.id) { uuid = cleanUuid(r.body.id); realName = r.body.name || name; break; }
      if (r.status === 404 || r.status === 204) notFound++;
    }
  }
  // 3) Ashcon
  if (!uuid) {
    const r = await getJson(f, `https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(name)}`, trace, 'ashcon');
    if (r.status === 200 && r.body && r.body.uuid) { ashcon = r.body; uuid = cleanUuid(r.body.uuid); realName = r.body.username || name; }
    else if (r.status === 404) notFound++;
  }
  if (!uuid) return { notPremium: notFound > 0 }; // alguien respondió «no existe»
  // La skin firmada
  const s = await getJson(f, `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}?unsigned=false`, trace, 'sessionserver');
  let tex = s.status === 200 ? (s.body.properties || []).find(p => p.name === 'textures' && p.signature) : null;
  if (s.status === 200 && s.body.name) realName = s.body.name;
  if (!tex) {
    if (!ashcon) { const r = await getJson(f, `https://api.ashcon.app/mojang/v2/user/${uuid}`, trace, 'ashcon-uuid'); if (r.status === 200) ashcon = r.body; }
    const raw = ashcon && ashcon.textures && ashcon.textures.raw;
    if (raw && raw.value && raw.signature) tex = { value: raw.value, signature: raw.signature };
  }
  if (!tex) return { error: true };
  return { uuid, name: realName, value: tex.value, signature: tex.signature };
}

async function premiumSkin(env, name, trace = []) {
  const key = playerKey(name);
  const cached = await env.DB.prepare('SELECT * FROM skin_premium WHERE name_key = ?').bind(key).first();
  const t = now();
  if (cached && t - cached.fetched_at < (cached.uuid ? PREMIUM_TTL : NOT_PREMIUM_TTL)) { trace.push(['cache', cached.uuid ? 'premium' : 'no premium']); return cached.uuid ? cached : null; }
  const r = await lookupPremium(env, name, trace);
  if (r.error || (!r.uuid && !r.notPremium)) {
    console.error('premiumSkin', name, JSON.stringify(trace));
    return cached && cached.uuid ? cached : null; // Mojang no respondió: lo último que se sabía
  }
  const row = { name_key: key, uuid: r.uuid || null, name: r.name || name, value: r.value || null, signature: r.signature || null, fetched_at: t };
  await env.DB.prepare(`INSERT INTO skin_premium (name_key, uuid, name, value, signature, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(name_key) DO UPDATE SET uuid = excluded.uuid, name = excluded.name, value = excluded.value, signature = excluded.signature, fetched_at = excluded.fetched_at`)
    .bind(row.name_key, row.uuid, row.name, row.value, row.signature, row.fetched_at).run();
  return row.uuid ? row : null;
}

// ---------------------------------------------------------------- MineSkin
async function mineskin(env, bytes, variant, name) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'skin.png');
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('visibility', 'unlisted');
  form.append('name', `kopi-${name}`.slice(0, 20));
  const headers = { ...UA };
  if (env.MINESKIN_API_KEY) headers.Authorization = `Bearer ${env.MINESKIN_API_KEY}`;
  const r = await (env.MINESKIN_FETCH || fetch)('https://api.mineskin.org/v2/generate', { method: 'POST', headers, body: form });
  const body = await r.json().catch(() => ({}));
  const data = body && body.skin && body.skin.texture && body.skin.texture.data;
  if (!r.ok || !data || !data.value || !data.signature) {
    console.error('mineskin', r.status, JSON.stringify(body).slice(0, 300));
    fail(r.status === 429 ? 429 : 502, 'mineskin', r.status === 429 ? 'Demasiadas skins seguidas. Inténtalo en un minuto.' : 'No se pudo preparar la skin. Inténtalo más tarde.');
  }
  return { value: data.value, signature: data.signature };
}

// ---------------------------------------------------------------- launcher: subir la skin (cuenta no premium)
export async function uploadSkin(env, P, b) {
  if (P.verified) return json({ ok: true, premium: true }); // las premium usan su skin oficial
  const secret = String(b.key || '');
  if (secret.length < 24 || secret.length > 128) fail(400, 'key', 'Falta la clave de la cuenta');
  const variant = b.variant === 'slim' ? 'slim' : 'classic';
  let bytes;
  try { bytes = b64ToBytes(String(b.png || '').replace(/^data:image\/png;base64,/, '')); } catch { fail(400, 'png', 'La skin no es un PNG válido'); }
  if (bytes.length > MAX_PNG || !skinSize(bytes)) fail(400, 'png', 'La skin tiene que ser un PNG de 64×64 o 64×32');

  const key = P.key;
  const owner = await sha256('kopi-skin:' + secret);
  const row = await env.DB.prepare('SELECT * FROM skins WHERE name_key = ?').bind(key).first();
  if (row && row.owner_hash !== owner) fail(403, 'taken', 'Ese nombre ya tiene una skin de otro jugador');
  const pngHash = await sha256Bytes(bytes);
  if (row && row.png_hash === pngHash && row.variant === variant) {
    if (!(await env.MEDIA.get('skinpng:' + pngHash, 'arrayBuffer'))) await env.MEDIA.put('skinpng:' + pngHash, bytes, { metadata: { type: 'image/png' } });
    return json({ ok: true, unchanged: true, server: !!row.value });
  }
  if (row && now() - row.updated_at < 20e3) fail(429, 'slow', 'Espera unos segundos antes de cambiar otra vez la skin');

  // La imagen se guarda para el mod de skins del launcher (CustomSkinLoader). MineSkin solo hace falta
  // para los plugins de servidor: si falla, la skin se sigue viendo con el mod.
  await env.MEDIA.put('skinpng:' + pngHash, bytes, { metadata: { type: 'image/png' } });
  let tex = { value: '', signature: '' };
  try { tex = await mineskin(env, bytes, variant, P.name); } catch (e) { console.error('mineskin opcional', e.message); }
  const t = now();
  await env.DB.prepare(`INSERT INTO skins (name_key, name, owner_hash, png_hash, variant, value, signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name_key) DO UPDATE SET name = excluded.name, png_hash = excluded.png_hash, variant = excluded.variant, value = excluded.value, signature = excluded.signature, updated_at = excluded.updated_at`)
    .bind(key, P.name, owner, pngHash, variant, tex.value, tex.signature, t, t).run();
  return json({ ok: true, server: !!tex.value });
}

// La cuenta no premium vuelve a la skin por defecto
export async function deleteSkin(env, P, b) {
  const owner = await sha256('kopi-skin:' + String(b.key || ''));
  await env.DB.prepare('DELETE FROM skins WHERE name_key = ? AND owner_hash = ?').bind(P.key, owner).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- servidores: la skin de un jugador
export async function publicSkin(env, name, debug = false) {
  if (!NAME_RE.test(String(name || ''))) return json({ error: 'name' }, 400, CORS);
  const trace = [];
  const prem = await premiumSkin(env, name, trace);
  const cache = { ...CORS, 'Cache-Control': debug ? 'no-store' : 'public, max-age=120' };
  if (debug) {
    const row = await env.DB.prepare('SELECT updated_at FROM skins WHERE name_key = ?').bind(playerKey(name)).first();
    return json({ name, premium: !!prem, kopi: !!row, trace }, 200, cache);
  }
  if (prem) return json({ name: prem.name, source: 'premium', value: prem.value, signature: prem.signature }, 200, cache);
  const row = await env.DB.prepare('SELECT name, variant, value, signature, updated_at FROM skins WHERE name_key = ?').bind(playerKey(name)).first();
  if (row && row.value) return json({ name: row.name, source: 'kopi', variant: row.variant, value: row.value, signature: row.signature, updated: row.updated_at }, 200, cache);
  return json({ error: 'none' }, 404, cache);
}

// ---------------------------------------------------------------- mod del launcher (CustomSkinLoader, «CustomSkinAPI»)
//   GET /csl/<nombre>.json      → { username, skins: { default|slim: <hash> }, cape: <hash> }
//                                  (404 si no tiene ni skin ni capa de Kopi)
//   GET /csl/textures/<hash>    → la imagen PNG (skin, o la capa de Kopi quieta)
// El mod pide primero a Mojang (premium) desde el PC del jugador y después aquí (skins de Kopi).
export async function cslApi(env, path) {
  const cache = { ...CORS, 'Cache-Control': 'public, max-age=60' };
  const tex = path.match(/^textures\/([0-9a-f]{64})$/);
  if (tex) {
    const png = await env.MEDIA.get('skinpng:' + tex[1], 'arrayBuffer');
    if (!png) return (await cslCapeTexture(tex[1])) || new Response('Not found', { status: 404, headers: CORS });
    return new Response(png, { headers: { ...CORS, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  const m = path.match(/^([A-Za-z0-9_]{2,16})\.json$/);
  if (!m) return json({ error: 'not_found' }, 404, cache);
  const key = playerKey(m[1]);
  const row = await env.DB.prepare('SELECT name, variant, png_hash FROM skins WHERE name_key = ?').bind(key).first();
  const cape = await cslCapeHash(env, key);
  if (!row && !cape) return json({ error: 'not_found' }, 404, cache);
  const out = { username: row ? row.name : cape.name };
  if (row) out.skins = { [row.variant === 'slim' ? 'slim' : 'default']: row.png_hash };
  if (cape) out.cape = cape.hash;
  return json(out, 200, cache);
}
