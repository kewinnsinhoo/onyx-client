// Skins y capas: cambiar skin en Minecraft, biblioteca local y buscar jugadores.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JsonStore } = require('./store');

let libStore, libDir;
function init(userData) {
  libDir = path.join(userData, 'skins');
  libStore = new JsonStore(path.join(libDir, 'index.json'), { skins: [] });
}

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function validateSkin(buf) {
  const s = pngSize(buf);
  if (!s) throw new Error('El archivo no es un PNG válido');
  if (!(s.width === 64 && (s.height === 64 || s.height === 32))) {
    throw new Error(`La skin debe medir 64×64 o 64×32 (la tuya mide ${s.width}×${s.height})`);
  }
  if (buf.length > 512 * 1024) throw new Error('La skin pesa más de 512 KB');
  return s;
}

const https = (u) => (u ? u.replace(/^http:\/\//, 'https://') : u);

async function mcApi(method, url, token, body, isForm) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  if (res.status === 429) throw new Error('Demasiados cambios seguidos. Espera un minuto.');
  if (res.status === 401) throw new Error('La sesión caducó: vuelve a iniciar sesión.');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Minecraft rechazó el cambio (${res.status}) ${t.slice(0, 120)}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function uploadSkin(token, pngBuffer, variant) {
  validateSkin(pngBuffer);
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'skin.png');
  return mcApi('POST', 'https://api.minecraftservices.com/minecraft/profile/skins', token, form, true);
}

async function setSkinFromUrl(token, url, variant) {
  return mcApi('POST', 'https://api.minecraftservices.com/minecraft/profile/skins', token,
    { variant: variant === 'slim' ? 'slim' : 'classic', url: https(url) });
}

async function setCape(token, capeId) {
  const url = 'https://api.minecraftservices.com/minecraft/profile/capes/active';
  if (!capeId) return mcApi('DELETE', url, token);
  return mcApi('PUT', url, token, { capeId });
}

// Busca un jugador premium por nombre y devuelve su skin.
async function lookupPlayer(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new Error('Nombre de jugador no válido');
  const r1 = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (r1.status === 204 || r1.status === 404) return null;
  if (!r1.ok) throw new Error('No se pudo buscar el jugador ahora mismo');
  const { id, name: realName } = await r1.json();
  const r2 = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`);
  if (!r2.ok) throw new Error('No se pudo leer la skin del jugador');
  const prof = await r2.json();
  const texProp = (prof.properties || []).find(p => p.name === 'textures');
  let skin = null, cape = null, variant = 'classic';
  if (texProp) {
    const tex = JSON.parse(Buffer.from(texProp.value, 'base64').toString('utf8')).textures || {};
    if (tex.SKIN) { skin = https(tex.SKIN.url); if (tex.SKIN.metadata && tex.SKIN.metadata.model === 'slim') variant = 'slim'; }
    if (tex.CAPE) cape = https(tex.CAPE.url);
  }
  return { name: realName, uuid: id, skin, cape, variant };
}

// Descarga una imagen y la devuelve como data URL (para mostrarla sin problemas de CORS).
async function toDataUrl(url) {
  const res = await fetch(https(url));
  if (!res.ok) throw new Error('No se pudo descargar la imagen');
  const buf = Buffer.from(await res.arrayBuffer());
  return 'data:image/png;base64,' + buf.toString('base64');
}

// ---------- Biblioteca local ----------
function libraryList() {
  const d = libStore.get();
  return d.skins
    .filter(s => fs.existsSync(path.join(libDir, s.file)))
    .map(s => ({ ...s, data: 'data:image/png;base64,' + fs.readFileSync(path.join(libDir, s.file)).toString('base64') }));
}

function libraryAdd({ name, data, variant }) {
  const buf = Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64');
  validateSkin(buf);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const d = libStore.get();
  const existing = d.skins.find(s => s.hash === hash);
  if (existing) return existing;
  fs.mkdirSync(libDir, { recursive: true });
  const file = `${hash}.png`;
  fs.writeFileSync(path.join(libDir, file), buf);
  const entry = { id: hash, hash, file, name: String(name || 'Skin').slice(0, 32), variant: variant === 'slim' ? 'slim' : 'classic', addedAt: Date.now() };
  d.skins.unshift(entry);
  libStore.replace(d);
  return entry;
}

function libraryRemove(id) {
  const d = libStore.get();
  const s = d.skins.find(x => x.id === id);
  if (s) { try { fs.unlinkSync(path.join(libDir, s.file)); } catch { /* nada */ } }
  d.skins = d.skins.filter(x => x.id !== id);
  libStore.replace(d);
  return true;
}

module.exports = { init, uploadSkin, setSkinFromUrl, setCape, lookupPlayer, toDataUrl, libraryList, libraryAdd, libraryRemove, validateSkin, pngSize };
