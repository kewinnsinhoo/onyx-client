// Gestión de cuentas: Microsoft (premium) y offline.
const crypto = require('crypto');
const path = require('path');
const { JsonStore, encrypt, decrypt } = require('./store');
const MS = require('./auth/microsoft');
const { config, isPlaceholder } = require('./config');
const log = require('./logger');

let store;
function init(userData) {
  store = new JsonStore(path.join(userData, 'accounts.json'), { accounts: [], active: null });
}

// UUID offline estándar: md5("OfflinePlayer:" + nombre), versión 3
function offlineUuid(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function publicView(a) {
  if (!a) return null;
  return {
    id: a.id, type: a.type, name: a.name, uuid: a.uuid,
    skin: a.skin || null, skinVariant: a.skinVariant || 'classic',
    capes: a.capes || [], localSkin: a.localSkin || null
  };
}

function list() {
  const d = store.get();
  return { accounts: d.accounts.map(publicView), active: d.active };
}

function active() {
  const d = store.get();
  return d.accounts.find(a => a.id === d.active) || d.accounts[0] || null;
}

function upsert(acc) {
  const d = store.get();
  const i = d.accounts.findIndex(a => a.id === acc.id);
  if (i >= 0) d.accounts[i] = { ...d.accounts[i], ...acc }; else d.accounts.push(acc);
  d.active = acc.id;
  store.replace(d);
  return publicView(acc);
}

function applyProfile(acc, profile) {
  const skin = (profile.skins || []).find(s => s.state === 'ACTIVE') || (profile.skins || [])[0];
  acc.name = profile.name;
  acc.uuid = formatUuid(profile.id);
  acc.skin = skin ? skin.url : null;
  acc.skinVariant = skin && skin.variant ? skin.variant.toLowerCase() : 'classic';
  acc.capes = (profile.capes || []).map(c => ({ id: c.id, url: c.url, alias: c.alias, active: c.state === 'ACTIVE' }));
}

function formatUuid(id) {
  const x = id.replace(/-/g, '');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// mode 'browser' (por defecto): navegador del sistema. mode 'window': ventana dentro del launcher.
async function loginMicrosoft(BrowserWindow, parent, { mode = 'browser', openExternal, lang, onCode } = {}) {
  if (isPlaceholder(config.microsoftClientId)) {
    throw new MS.AuthError('no_client', 'Falta el Client ID de Azure en onyx.config.json (mira la GUIA.md, paso 3).');
  }
  const r = mode === 'browser' && openExternal
    ? await MS.browserLogin(openExternal, config.microsoftClientId, { lang, onCode })
    : await MS.interactiveLogin(BrowserWindow, parent, config.microsoftClientId);
  const ms = await MS.exchangeCode(config.microsoftClientId, r.code, r.verifier, r.redirectUri);
  const mc = await MS.minecraftFromMs(ms.access_token);
  const acc = {
    id: 'msa-' + mc.profile.id,
    type: 'msa',
    msRefresh: encrypt(ms.refresh_token),
    mcToken: encrypt(mc.accessToken),
    mcExpires: mc.expiresAt
  };
  applyProfile(acc, mc.profile);
  log.info('Cuenta Microsoft añadida', acc.name);
  return upsert(acc);
}

function addOffline(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new MS.AuthError('bad_name', 'El nombre debe tener 3-16 caracteres: letras, números o _');
  }
  const acc = { id: 'off-' + name.toLowerCase(), type: 'offline', name, uuid: offlineUuid(name) };
  return upsert(acc);
}

// Devuelve la cuenta con un token de Minecraft válido (renovándolo si hace falta).
async function ensureFresh(id) {
  const d = store.get();
  const acc = d.accounts.find(a => a.id === (id || d.active));
  if (!acc) throw new MS.AuthError('no_account', 'No hay ninguna cuenta activa');
  if (acc.type !== 'msa') return { ...acc };
  let token = decrypt(acc.mcToken);
  if (!token || !acc.mcExpires || acc.mcExpires - Date.now() < 10 * 60e3) {
    const refresh = decrypt(acc.msRefresh);
    if (!refresh) throw new MS.AuthError('relogin', 'Vuelve a iniciar sesión con Microsoft');
    const ms = await MS.refreshMs(config.microsoftClientId, refresh);
    const mc = await MS.minecraftFromMs(ms.access_token);
    acc.msRefresh = encrypt(ms.refresh_token || refresh);
    acc.mcToken = encrypt(mc.accessToken);
    acc.mcExpires = mc.expiresAt;
    applyProfile(acc, mc.profile);
    store.replace(d);
    token = mc.accessToken;
  }
  return { ...acc, accessToken: token };
}

async function refreshProfile(id) {
  const acc = await ensureFresh(id);
  if (acc.type !== 'msa') return publicView(acc);
  const profile = await MS.getProfile(acc.accessToken);
  const d = store.get();
  const real = d.accounts.find(a => a.id === acc.id);
  applyProfile(real, profile);
  store.replace(d);
  return publicView(real);
}

function setActive(id) {
  const d = store.get();
  if (d.accounts.find(a => a.id === id)) { d.active = id; store.replace(d); }
  return list();
}

function remove(id) {
  const d = store.get();
  d.accounts = d.accounts.filter(a => a.id !== id);
  if (d.active === id) d.active = d.accounts[0] ? d.accounts[0].id : null;
  store.replace(d);
  return list();
}

function setLocalSkin(id, localSkin) {
  const d = store.get();
  const acc = d.accounts.find(a => a.id === id);
  if (acc) { acc.localSkin = localSkin; store.replace(d); }
  return publicView(acc);
}

module.exports = { init, list, active, loginMicrosoft, addOffline, ensureFresh, refreshProfile, setActive, remove, setLocalSkin, offlineUuid, publicView };
