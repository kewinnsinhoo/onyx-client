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
async function premiumSkin(env, name) {
  const key = playerKey(name);
  const cached = await env.DB.prepare('SELECT * FROM skin_premium WHERE name_key = ?').bind(key).first();
  const t = now();
  if (cached && t - cached.fetched_at < (cached.uuid ? PREMIUM_TTL : NOT_PREMIUM_TTL)) return cached.uuid ? cached : null;
  const f = env.MOJANG_FETCH || fetch;
  try {
    const r = await f(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, { headers: UA });
    let row = { name_key: key, uuid: null, name, value: null, signature: null, fetched_at: t };
    if (r.status === 200) {
      const prof = await r.json();
      const s = await f(`https://sessionserver.mojang.com/session/minecraft/profile/${prof.id}?unsigned=false`, { headers: UA });
      if (s.status !== 200) throw new Error('sessionserver ' + s.status);
      const full = await s.json();
      const tex = (full.properties || []).find(p => p.name === 'textures');
      if (!tex || !tex.signature) throw new Error('sin textures');
      row = { ...row, uuid: full.id, name: full.name, value: tex.value, signature: tex.signature };
    } else if (r.status !== 204 && r.status !== 404) {
      throw new Error('mojang ' + r.status); // Mojang falla o limita: usar lo guardado si hay
    }
    await env.DB.prepare(`INSERT INTO skin_premium (name_key, uuid, name, value, signature, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name_key) DO UPDATE SET uuid = excluded.uuid, name = excluded.name, value = excluded.value, signature = excluded.signature, fetched_at = excluded.fetched_at`)
      .bind(row.name_key, row.uuid, row.name, row.value, row.signature, row.fetched_at).run();
    return row.uuid ? row : null;
  } catch (e) {
    console.error('premiumSkin', name, e.message);
    return cached && cached.uuid ? cached : null;
  }
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
  if (row && row.png_hash === pngHash && row.variant === variant) return json({ ok: true, unchanged: true });
  if (row && now() - row.updated_at < 20e3) fail(429, 'slow', 'Espera unos segundos antes de cambiar otra vez la skin');

  const tex = await mineskin(env, bytes, variant, P.name);
  const t = now();
  await env.DB.prepare(`INSERT INTO skins (name_key, name, owner_hash, png_hash, variant, value, signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name_key) DO UPDATE SET name = excluded.name, png_hash = excluded.png_hash, variant = excluded.variant, value = excluded.value, signature = excluded.signature, updated_at = excluded.updated_at`)
    .bind(key, P.name, owner, pngHash, variant, tex.value, tex.signature, t, t).run();
  return json({ ok: true });
}

// La cuenta no premium vuelve a la skin por defecto
export async function deleteSkin(env, P, b) {
  const owner = await sha256('kopi-skin:' + String(b.key || ''));
  await env.DB.prepare('DELETE FROM skins WHERE name_key = ? AND owner_hash = ?').bind(P.key, owner).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- servidores: la skin de un jugador
export async function publicSkin(env, name) {
  if (!NAME_RE.test(String(name || ''))) return json({ error: 'name' }, 400, CORS);
  const prem = await premiumSkin(env, name);
  const cache = { ...CORS, 'Cache-Control': 'public, max-age=120' };
  if (prem) return json({ name: prem.name, source: 'premium', value: prem.value, signature: prem.signature }, 200, cache);
  const row = await env.DB.prepare('SELECT name, variant, value, signature, updated_at FROM skins WHERE name_key = ?').bind(playerKey(name)).first();
  if (row) return json({ name: row.name, source: 'kopi', variant: row.variant, value: row.value, signature: row.signature, updated: row.updated_at }, 200, cache);
  return json({ error: 'none' }, 404, cache);
}
