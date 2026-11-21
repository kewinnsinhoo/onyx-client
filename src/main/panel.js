// Conexión con el panel de Kopi (panel.onyxclient.site): códigos, acceso, horarios y jugadores en vivo.
// El jugador se identifica igual que en un servidor de Minecraft:
//   1) el panel da un "serverId"  2) el launcher hace join en Mojang con la cuenta  3) el panel lo comprueba.
// Las cuentas offline entran solo con su nombre (sin verificar).
const path = require('path');
const { config, isPlaceholder } = require('./config');
const { JsonStore } = require('./store');
const log = require('./logger');

let store;
let fetchImpl = (...a) => fetch(...a);

function init(userData, opts = {}) {
  store = new JsonStore(path.join(userData, 'panel.json'), { tokens: {} });
  if (opts.fetch) fetchImpl = opts.fetch;
}

function base() {
  const u = config.panelUrl;
  return u && !isPlaceholder(u) ? String(u).replace(/\/$/, '') : null;
}
function enabled() { return !!base(); }

// Error con texto en español (la interfaz lo traduce) + datos para rellenar el texto
class PanelError extends Error {
  constructor(message, code, vars, status) { super(message); this.code = code; this.vars = vars; this.status = status; }
}

const MESSAGES = {
  banned: 'No puedes entrar a esta instancia',
  no_access: 'Ya no tienes acceso a esta instancia',
  premium: 'Esta instancia es Premium: inicia sesión con una cuenta de Microsoft que tenga Minecraft.',
  locked: 'La instancia está bloqueada por el studio',
  not_open: 'La instancia abre el {date}',
  closed: 'La instancia ya ha cerrado',
  full: 'La instancia está llena ({max} jugadores). Prueba en un rato.',
  code: 'Código no válido o caducado',
  code_used: 'Este código ya no tiene usos',
  codes_off: 'Esta instancia ya no acepta códigos',
  instance: 'La instancia de este código ya no existe',
  not_verified: 'Mojang no confirmó tu cuenta. Vuelve a iniciar sesión con Microsoft.',
  studio: 'Ese código de referido no existe',
  slow: 'Espera un minuto antes de enviar otro informe',
  premium_cape: 'Esta cuenta es premium: inicia sesión con Microsoft para cambiar la capa',
  not_owned: 'Todavía no tienes esta capa',
  taken: 'Este nombre lo usa otro jugador',
  cape: 'Esa capa no existe'
};

function fmtDate(ms) {
  try { return new Date(ms).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); }
  catch { return new Date(ms).toISOString(); }
}

// Convierte una respuesta de error del panel en un PanelError legible
function toError(body, status) {
  const code = (body && (body.reason || body.error)) || 'server';
  const vars = {};
  if (code === 'not_open' && body.opensAt) { vars.date = fmtDate(body.opensAt); vars.at = body.opensAt; }
  if (code === 'full' && body.max) vars.max = body.max;
  let msg = MESSAGES[code];
  if (code === 'locked' && body.message && typeof body.message === 'string') msg = body.message;
  if (!msg) msg = (body && body.message) || 'El panel de Kopi no respondió bien. Inténtalo más tarde.';
  const e = new PanelError(msg, code, vars, status);
  e.predownload = !!(body && body.predownload);
  return e;
}

// Al abrirse (y cada 12 h): aviso anónimo para contar instalaciones, activos y países (sin nombre ni cuenta)
async function hello({ install, version, platform, lang, brand }) {
  const b = base();
  if (!b) return false;
  try {
    const res = await fetchImpl(`${b}/api/hello`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ install, version, platform, lang, brand }), signal: AbortSignal.timeout(10000)
    });
    return res.ok;
  } catch { return false; }
}

async function request(method, rel, { body, raw, token, timeout = 15000 } = {}) {
  const b = base();
  if (!b) throw new PanelError('El launcher no está conectado al panel', 'no_panel');
  let res;
  try {
    res = await fetchImpl(`${b}/api/l/${rel}`, {
      method,
      headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: raw || (body ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(timeout)
    });
  } catch (e) {
    throw new PanelError('No se pudo conectar con el panel de Kopi. Revisa tu conexión.', 'offline');
  }
  let j = null;
  try { j = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw toError(j, res.status);
  return j;
}

// ---------------------------------------------------------------- sesión del jugador
const keyOf = (account) => `${account.type}:${String(account.name).toLowerCase()}`;

async function joinMojang(account, serverId) {
  const res = await fetchImpl('https://sessionserver.mojang.com/session/minecraft/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: account.accessToken, selectedProfile: String(account.uuid).replace(/-/g, ''), serverId }),
    signal: AbortSignal.timeout(15000)
  });
  if (res.status !== 204 && !res.ok) throw new Error('Mojang join ' + res.status);
}

async function login(account) {
  if (account.type === 'msa' && !account.accessToken && typeof account.getToken === 'function') {
    try { account = { ...account, accessToken: await account.getToken() }; }
    catch (e) { log.warn('[panel] No se pudo renovar la sesión de Microsoft:', e.message); }
  }
  if (account.type === 'msa' && account.accessToken) {
    try {
      const { serverId } = await request('GET', 'challenge');
      await joinMojang(account, serverId);
      return await request('POST', 'auth', { body: { name: account.name, serverId } });
    } catch (e) {
      if (e.code === 'offline') throw e;
      log.warn('[panel] No se pudo verificar con Mojang, se entra sin verificar:', e.message);
    }
  }
  return request('POST', 'auth', { body: { name: account.name } });
}

async function token(account, { fresh = false } = {}) {
  if (!account || !account.name) throw new PanelError('Inicia sesión para continuar', 'no_account');
  const d = store.get();
  const k = keyOf(account);
  const cur = d.tokens[k];
  // Una cuenta Premium sin verificar se vuelve a verificar (p. ej. Mojang falló la otra vez)
  const stale = cur && account.type === 'msa' && !cur.verified && Date.now() - (cur.at || 0) > 10 * 60e3;
  if (!fresh && cur && cur.expiresAt > Date.now() + 60e3 && !stale) return cur.token;
  const r = await login(account);
  d.tokens[k] = { token: r.token, verified: !!r.verified, expiresAt: r.expiresAt, at: Date.now() };
  store.replace(d);
  return r.token;
}

// Llamada autenticada: si el token caducó, se pide otro una vez
async function call(account, method, rel, body, opts = {}) {
  try { return await request(method, rel, { ...opts, body, token: await token(account) }); }
  catch (e) {
    if (e.status === 401 && e.code === 'player') return request(method, rel, { ...opts, body, token: await token(account, { fresh: true }) });
    throw e;
  }
}

// ---------------------------------------------------------------- funciones del launcher
const redeem = (account, code) => call(account, 'POST', 'redeem', { code });
const listInstances = (account) => call(account, 'GET', 'instances').then(r => r.instances || []);
const getInstance = (account, id) => call(account, 'GET', `instance/${encodeURIComponent(id)}`).then(r => r.instance);
const startPlay = (account, id) => call(account, 'POST', 'play', { instance: id });
const beat = (account, play) => call(account, 'POST', 'beat', { play });
const endPlay = (account, play) => call(account, 'POST', 'end', { play });
const referral = (account, studio) => call(account, 'POST', 'referral', { studio });
// KopiGuard: avisos de lo que se vio durante la partida → { saved, kick }
const guardReport = (account, play, events) => call(account, 'POST', 'guard', { play, events });
// La foto (JPEG) o el vídeo (WebM) de una detección, tal cual
const guardMedia = (account, play, event, kind, buf) =>
  call(account, 'POST', `guard/media?play=${encodeURIComponent(play)}&event=${encodeURIComponent(event)}&kind=${kind}`, undefined, { raw: buf, timeout: 120000 });
// Una imagen para las cámaras en directo (base64 JPEG, '' si el juego está minimizado) → { cam: 'live'|'grid'|null }
// frame null = este equipo no puede capturar (p. ej. macOS sin permiso de grabar pantalla)
const guardFrame = (account, play, frame, hd) => call(account, 'POST', 'guard/frame', { play, frame: frame || null, hd: !!hd, off: frame === null });

// Kopi Skins: sube la skin de una cuenta no premium para que se vea en los servidores con el plugin.
// Solo si cambió desde la última vez. skin = { png (base64), variant } o null para quitarla.
const crypto = require('crypto');
async function syncSkin(account, key, skin) {
  if (!enabled() || !account || account.type === 'msa' || !key) return { skipped: true };
  const d = store.get();
  d.skins = d.skins || {};
  const k = keyOf(account);
  // «v2»: desde que el panel guarda la imagen para el mod de skins, todas se suben una vez más
  const sum = skin ? 'v2:' + crypto.createHash('sha256').update(skin.variant + ':' + skin.png).digest('hex') : 'none';
  if (d.skins[k] === sum) return { unchanged: true };
  if (skin) await call(account, 'POST', 'skin', { key, png: skin.png, variant: skin.variant });
  else await call(account, 'DELETE', 'skin', { key });
  const fresh = store.get(); fresh.skins = fresh.skins || {}; fresh.skins[k] = sum; store.replace(fresh);
  return { ok: true };
}

// Capas de Kopi: las que tiene el jugador ({ owned: [ids], worn: id|null }) y ponerse una (id o null para quitarla).
// Las cuentas no premium se protegen con la misma clave secreta que su skin.
const kopiCapes = (account) => call(account, 'GET', 'capes');
const wearKopiCape = (account, key, id) => call(account, 'POST', 'cape', { key, id: id || null });

// Directos: tus canales ({ twitch, tiktok, kick }), «estoy en directo» a mano y quién emite una instancia
const streamChannels = (account) => call(account, 'GET', 'channels');
const saveChannels = (account, ch) => call(account, 'POST', 'channels', ch);
const markLive = (account, platform, on) => call(account, 'POST', 'channels/live', { platform, on: !!on });
const liveOf = (account, id) => call(account, 'GET', `live/${encodeURIComponent(id)}`).then(r => r.live || []);

// Reportes de jugadores: quién juega ahora, enviar el reporte y su captura (JPEG)
const onlineIn = (account, id) => call(account, 'GET', `online/${encodeURIComponent(id)}`).then(r => r.players || []);
const preport = (account, body) => call(account, 'POST', 'preport', body);
const preportShot = (account, id, buf) => call(account, 'POST', `preport/${encodeURIComponent(id)}/shot`, undefined, { raw: buf, timeout: 60000 });

// Perfil público en la web: { public, url }
const publicProfile = (account) => call(account, 'GET', 'public');
const setPublicProfile = (account, on) => call(account, 'POST', 'public', { on: !!on });

// Insignias: las del jugador (calculadas en el panel) y su vitrina (3 favoritas)
const badges = (account) => call(account, 'GET', `badges?tz=${-new Date().getTimezoneOffset()}`);
const setShowcase = (account, ids) => call(account, 'POST', `badges/showcase?tz=${-new Date().getTimezoneOffset()}`, { ids });

// «Enviar informe»: el panel lo reenvía al canal de Discord del equipo
// data = { message, status, logs, screenshot (Buffer JPEG/PNG) }
const sendReport = (account, data) => call(account, 'POST', 'report', {
  message: data.message || '', status: data.status || {}, logs: data.logs || '',
  screenshot: data.screenshot ? Buffer.from(data.screenshot).toString('base64') : null
}, { timeout: 60000 });

// Lista pública de studios (para el código de referido) y su ranking
async function publicGet(rel) {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetchImpl(`${b}/api/public/${rel}`, { signal: AbortSignal.timeout(10000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Mantiene viva la partida en el panel y avisa si el studio echa al jugador
function heartbeat(account, play, everySec, onKick, onBeat) {
  let ended = false;
  const iv = setInterval(async () => {
    if (ended) return;
    try {
      const r = await beat(account, play);
      if (r && r.kick && !ended) { clearInterval(iv); onKick(); }
      else if (r && !ended && onBeat) onBeat(r); // p. ej. KopiGuard: alguien quiere ver la cámara
    } catch (e) { log.warn('[panel] latido:', e.message); }
  }, Math.max(15, everySec || 60) * 1000);
  return () => {
    if (ended) return;
    ended = true; clearInterval(iv);
    endPlay(account, play).catch(() => {});
  };
}

module.exports = { init, enabled, base, onlineIn, preport, preportShot, publicProfile, setPublicProfile, badges, setShowcase, streamChannels, saveChannels, markLive, liveOf, redeem, listInstances, getInstance, startPlay, beat, endPlay, referral, syncSkin, kopiCapes, wearKopiCape, hello, sendReport, guardReport, guardMedia, guardFrame, heartbeat, publicGet, token, PanelError, MESSAGES, toError };
