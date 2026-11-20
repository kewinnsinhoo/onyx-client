// Skins de Kopi en el juego: pone solo el mod CustomSkinLoader (de Modrinth) en las instancias con
// Fabric, Quilt, Forge o NeoForge, en la versión que toca, y lo configura así:
//   1) Mojang  → la skin real de los premium (se pide desde el PC del jugador)
//   2) Kopi    → la skin que cada jugador no premium eligió en Kopi Client (panel /csl/)
// Así todos ven las skins en cualquier servidor, también en modo offline, sin instalar nada en el servidor.
// Capas de Kopi: CustomSkinLoader enseña la capa quieta. En Fabric, si existe para esa versión, se pone
// también el mod Cape Provider (y Fabric API si falta), que la enseña ANIMADA (panel /capes/<nombre>.png).
// Los mods se guardan como mods/kopi-skins-*.jar: la sincronización de archivos del studio no los borra.
const fs = require('fs');
const path = require('path');
const log = require('./logger');

const PROJECT = 'idMHQ4n2'; // CustomSkinLoader en Modrinth
const PREFIX = 'kopi-skins-';
const CSL = PREFIX + 'customskinloader-';
const CAPES = PREFIX + 'cape-provider-';   // Cape Provider (capas animadas, solo Fabric)
const FAPI = PREFIX + 'fabric-api-';       // Fabric API, solo si la instancia no la trae (Cape Provider la necesita)
// Mods que no pueden ir junto a Cape Provider (el juego no arrancaría)
const CAPE_CONFLICTS = /^(capes|minecraftcapes|capemod|cicada|bettercapes)[-_ .]/i;
const LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];
const DAY = 864e5;

let cacheFile = null;
function init(root) { cacheFile = path.join(root, 'cache', 'kopi-skins.json'); }

function readCache() { try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { return {}; } }
function writeCache(c) { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(c, null, 2)); } catch { /* nada */ } }

// La versión de un mod de Modrinth para esta versión de Minecraft y este loader (se recuerda un día)
async function resolve(mc, loader, fetchJson, project = PROJECT) {
  const key = project === PROJECT ? `${mc}|${loader}` : `${project}|${mc}|${loader}`;
  const cache = readCache();
  const hit = cache[key];
  if (hit && Date.now() - hit.at < DAY) return hit.file;
  const tryLoader = async (l) => {
    const url = `https://api.modrinth.com/v2/project/${project}/version?loaders=${encodeURIComponent(JSON.stringify([l]))}&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`;
    const list = await fetchJson(url);
    if (!Array.isArray(list) || !list.length) return null;
    const v = list.find(x => x.version_type === 'release') || list[0];
    const f = (v.files || []).find(x => x.primary) || (v.files || [])[0];
    return f ? { url: f.url, sha1: f.hashes && f.hashes.sha1, size: f.size, version: v.version_number } : null;
  };
  try {
    // Quilt usa los mods de Fabric si no hay uno propio
    const file = (await tryLoader(loader)) || (loader === 'quilt' ? await tryLoader('fabric') : null);
    cache[key] = { at: Date.now(), file };
    writeCache(cache);
    return file;
  } catch (e) {
    if (hit) return hit.file; // sin conexión con Modrinth: lo que se sabía
    throw e;
  }
}

// Configura CustomSkinLoader. Orden (el primero que tenga skin gana):
//  1) la skin que ya manda el servidor (servidores premium o con SkinsRestorer): no hace falta preguntar a nadie;
//  2) Kopi: la skin elegida en el launcher por jugadores no premium;
//  3) Mojang: la skin oficial de las cuentas premium.
// Si Mojang contesta "demasiadas peticiones" (429), se usa la última skin conocida del jugador (caché local).
// Respeta el resto de ajustes del jugador.
function writeConfig(gameDir, panelBase) {
  const file = path.join(gameDir, 'CustomSkinLoader', 'CustomSkinLoader.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { cfg = {}; }
  const others = (Array.isArray(cfg.loadlist) ? cfg.loadlist : [])
    .filter(x => x && !['gameprofile', 'mojang', 'kopi'].includes(String(x.name || '').toLowerCase()));
  cfg.enable = true;
  cfg.enableCape = true;
  cfg.forceLoadAllTextures = true; // seguir buscando aunque ya tenga skin: la capa de Kopi puede venir de otro sitio
  cfg.enableLocalProfileCache = true;
  if (!(Number(cfg.cacheExpiry) >= 120)) cfg.cacheExpiry = 120;
  cfg.loadlist = [
    { name: 'GameProfile', type: 'GameProfile' },
    { name: 'Kopi', type: 'CustomSkinAPI', root: `${panelBase}/csl/` },
    { name: 'Mojang', type: 'MojangAPI' },
    ...others
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

function ours(dir, prefix = PREFIX) {
  try { return fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.jar')); } catch { return []; }
}
const jarName = (prefix, version) => `${prefix}${String(version).replace(/[^A-Za-z0-9._+-]/g, '_')}.jar`;

// Configura Cape Provider: la capa de Kopi primero; respeta el resto de ajustes del jugador.
//  - validateProfile: false → también busca capas de jugadores no premium (servidores offline)
//  - textureResolverId 'sprite' → la imagen trae los fotogramas uno debajo de otro (animada)
function writeCapeConfig(gameDir, panelBase) {
  const file = path.join(gameDir, 'config', 'cape-provider', 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { cfg = {}; }
  const kopi = { id: 'kopi', name: 'Kopi Client', uriTemplate: `${panelBase}/capes/$name.png`, textureResolverId: 'sprite', homepage: 'https://onyxclient.site' };
  const others = (Array.isArray(cfg.remoteCustomProviders) ? cfg.remoteCustomProviders : []).filter(x => x && x.id !== 'kopi');
  cfg.remoteCustomProviders = [kopi, ...others];
  const active = Array.isArray(cfg.activeProviderIds) ? cfg.activeProviderIds.filter(x => x !== 'kopi') : ['minecraftcapes'];
  cfg.activeProviderIds = ['kopi', ...active];
  cfg.validateProfile = false;
  if (cfg.useDefaultProvider === undefined) cfg.useDefaultProvider = true;
  if (cfg.enableElytraTexture === undefined) cfg.enableElytraTexture = true;
  if (!cfg.animatedCapesHandling) cfg.animatedCapesHandling = 'ON';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

// Capas animadas (solo Fabric): Cape Provider + Fabric API si hace falta. Nunca impide jugar.
async function ensureCapes(gameDir, { mc, type, panelBase }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const clean = (prefix, keep) => { for (const f of ours(modsDir, prefix)) if (f !== keep) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  const off = (status) => { clean(CAPES, null); clean(FAPI, null); return { status }; };
  if (type !== 'fabric') return off('off');
  let jars = [];
  try { jars = fs.readdirSync(modsDir).filter(f => !f.startsWith(PREFIX)); } catch { /* sin carpeta mods */ }
  if (jars.some(f => CAPE_CONFLICTS.test(f))) return off('conflict'); // el studio ya trae otro mod de capas
  try {
    let status = 'ok', file = null;
    if (jars.some(f => /cape-provider/i.test(f))) { clean(CAPES, null); status = 'studio'; }
    else {
      file = await resolve(mc, 'fabric', deps.fetchJson, 'cape-provider');
      if (!file) return off('unsupported');
    }
    // Fabric API: la del studio si la trae; si no, la ponemos nosotros
    let fapi = null;
    if (jars.some(f => /fabric-api/i.test(f))) clean(FAPI, null);
    else {
      const fa = await resolve(mc, 'fabric', deps.fetchJson, 'fabric-api');
      if (!fa) return off('unsupported');
      fapi = jarName(FAPI, fa.version);
      await deps.downloadFile({ url: fa.url, dest: path.join(modsDir, fapi), sha1: fa.sha1, size: fa.size, verify: !!fa.sha1 });
      clean(FAPI, fapi);
    }
    if (file) {
      const name = jarName(CAPES, file.version);
      await deps.downloadFile({ url: file.url, dest: path.join(modsDir, name), sha1: file.sha1, size: file.size, verify: !!file.sha1 });
      clean(CAPES, name);
    }
    writeCapeConfig(gameDir, panelBase);
    return { status, fabricApi: fapi };
  } catch (e) {
    // Sin Cape Provider la capa se sigue viendo (quieta) con CustomSkinLoader
    log.warn('[capas] No se pudo preparar Cape Provider:', e.message);
    return off('error');
  }
}

/**
 * Deja el mod listo (o lo quita si la instancia no lo quiere). Nunca impide jugar: si algo falla, se avisa en el registro.
 * opts: { mc, loader, enabled, panelBase }   deps: { fetchJson, downloadFile } (para las pruebas)
 */
async function ensure(gameDir, { mc, loader, enabled = true, panelBase }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const type = loader && loader.type ? loader.type : 'vanilla';
  const remove = (keep) => { for (const f of ours(modsDir)) if (f !== keep) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  // Solo el de CustomSkinLoader (también los nombres antiguos); los de las capas los lleva ensureCapes
  const removeCsl = (keep) => { for (const f of ours(modsDir)) if (f !== keep && !f.startsWith(CAPES) && !f.startsWith(FAPI)) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  try {
    if (!enabled || !LOADERS.includes(type) || !panelBase) { remove(null); return { status: 'off' }; }
    const capes = () => ensureCapes(gameDir, { mc, type, panelBase }, deps);
    let jars = [];
    try { jars = fs.readdirSync(modsDir); } catch { /* sin carpeta mods */ }
    // El studio ya lo incluye en sus mods: solo se configura (dos copias harían fallar el juego)
    if (jars.some(f => /customskinloader/i.test(f) && !f.startsWith(PREFIX))) {
      removeCsl(null);
      writeConfig(gameDir, panelBase);
      return { status: 'studio', capes: (await capes()).status };
    }
    const file = await resolve(mc, type, deps.fetchJson);
    if (!file) { remove(null); log.info(`[skins] CustomSkinLoader no está disponible para ${type} ${mc}`); return { status: 'unsupported' }; }
    const name = jarName(CSL, file.version);
    await deps.downloadFile({ url: file.url, dest: path.join(modsDir, name), sha1: file.sha1, size: file.size, verify: !!file.sha1 });
    removeCsl(name);
    writeConfig(gameDir, panelBase);
    return { status: 'ok', file: name, capes: (await capes()).status };
  } catch (e) {
    log.warn('[skins] No se pudo preparar el mod de skins:', e.message);
    return { status: 'error', error: e.message };
  }
}

module.exports = { init, ensure, writeConfig, writeCapeConfig, PREFIX };
