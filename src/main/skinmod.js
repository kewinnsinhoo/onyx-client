// Skins de Kopi en el juego: pone solo el mod CustomSkinLoader (de Modrinth) en las instancias con
// Fabric, Quilt, Forge o NeoForge, en la versión que toca, y lo configura así:
//   1) Mojang  → la skin real de los premium (se pide desde el PC del jugador)
//   2) Kopi    → la skin que cada jugador no premium eligió en Kopi Client (panel /csl/)
// Así todos ven las skins en cualquier servidor, también en modo offline, sin instalar nada en el servidor.
// Capas de Kopi: CustomSkinLoader enseña la capa quieta. En Fabric, si existe para esa versión, se pone
// también el mod Cape Provider, que la enseña ANIMADA (panel /capes/<nombre>.png).
// Fabric API: una sola copia para los mods de Kopi que la necesitan (capas y modo rendimiento), ver ensureFabricApi.
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

// Mods del studio (no nuestros): ni kopi-skins-* ni kopi-perf-*
const studioJars = (modsDir) => { try { return fs.readdirSync(modsDir).filter(f => f.endsWith('.jar') && !f.startsWith(PREFIX) && !f.startsWith('kopi-perf-')); } catch { return []; } };
const cleanOurs = (modsDir, prefix, keep) => { for (const f of ours(modsDir, prefix)) if (f !== keep) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };

// Capas animadas (solo Fabric): Cape Provider. Si necesita Fabric API y el studio no la trae, lo avisa
// (needFabricApi) y la pone ensure() al final. Nunca impide jugar.
async function ensureCapes(gameDir, { mc, type, panelBase }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const off = (status) => { cleanOurs(modsDir, CAPES, null); return { status }; };
  if (type !== 'fabric') return off('off');
  const jars = studioJars(modsDir);
  if (jars.some(f => CAPE_CONFLICTS.test(f))) return off('conflict'); // el studio ya trae otro mod de capas
  try {
    let status = 'ok', file = null;
    if (jars.some(f => /cape-provider/i.test(f))) { cleanOurs(modsDir, CAPES, null); status = 'studio'; }
    else {
      file = await resolve(mc, 'fabric', deps.fetchJson, 'cape-provider');
      if (!file) return off('unsupported');
    }
    if (file) {
      const name = jarName(CAPES, file.version);
      await deps.downloadFile({ url: file.url, dest: path.join(modsDir, name), sha1: file.sha1, size: file.size, verify: !!file.sha1 });
      cleanOurs(modsDir, CAPES, name);
    }
    writeCapeConfig(gameDir, panelBase);
    return { status, needFabricApi: true };
  } catch (e) {
    // Sin Cape Provider la capa se sigue viendo (quieta) con CustomSkinLoader
    log.warn('[capas] No se pudo preparar Cape Provider:', e.message);
    return off('error');
  }
}

// Fabric API: UNA sola copia para todos los mods de Kopi que la necesitan (capas y modo rendimiento).
// La del studio si la trae; si no, la nuestra (kopi-skins-fabric-api-*.jar) solo si alguien la necesita.
// → el nombre del archivo, 'studio' o null (no hay)
async function ensureFabricApi(gameDir, { mc, type }, need, deps) {
  const modsDir = path.join(gameDir, 'mods');
  if (type !== 'fabric') { cleanOurs(modsDir, FAPI, null); return null; }
  if (studioJars(modsDir).some(f => /fabric-api/i.test(f))) { cleanOurs(modsDir, FAPI, null); return 'studio'; }
  if (!need) { cleanOurs(modsDir, FAPI, null); return null; }
  try {
    const fa = await resolve(mc, 'fabric', deps.fetchJson, 'fabric-api');
    if (!fa) { cleanOurs(modsDir, FAPI, null); return null; }
    const name = jarName(FAPI, fa.version);
    fs.mkdirSync(modsDir, { recursive: true });
    await deps.downloadFile({ url: fa.url, dest: path.join(modsDir, name), sha1: fa.sha1, size: fa.size, verify: !!fa.sha1 });
    cleanOurs(modsDir, FAPI, name);
    return name;
  } catch (e) {
    log.warn('[fabric-api] No se pudo preparar Fabric API:', e.message);
    const have = ours(modsDir, FAPI);
    return have.length ? have[0] : null; // si ya estaba descargada, sirve
  }
}

/**
 * Deja el mod listo (o lo quita si la instancia no lo quiere). Nunca impide jugar: si algo falla, se avisa en el registro.
 * opts: { mc, loader, enabled, panelBase, needFabricApi }   deps: { fetchJson, downloadFile } (para las pruebas)
 * needFabricApi: otro mod de Kopi (modo rendimiento) también necesita Fabric API.
 * → { status, capes, fabricApi: nombre | 'studio' | null }
 */
async function ensure(gameDir, opts, deps) {
  const r = await ensureSkins(gameDir, opts, deps);
  const type = opts.loader && opts.loader.type ? opts.loader.type : 'vanilla';
  r.fabricApi = await ensureFabricApi(gameDir, { mc: opts.mc, type }, !!r.needFabricApi || !!opts.needFabricApi, deps);
  if (r.needFabricApi && !r.fabricApi) { cleanOurs(path.join(gameDir, 'mods'), CAPES, null); r.capes = 'unsupported'; }
  delete r.needFabricApi;
  return r;
}

async function ensureSkins(gameDir, { mc, loader, enabled = true, panelBase, capes = true }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const type = loader && loader.type ? loader.type : 'vanilla';
  // Fabric API no se toca aquí (la lleva ensureFabricApi)
  const remove = (keep) => { for (const f of ours(modsDir)) if (f !== keep && !f.startsWith(FAPI)) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  // Solo el de CustomSkinLoader (también los nombres antiguos); los de las capas los lleva ensureCapes
  const removeCsl = (keep) => { for (const f of ours(modsDir)) if (f !== keep && !f.startsWith(CAPES) && !f.startsWith(FAPI)) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  const withCapes = async (r) => {
    if (!capes) { cleanOurs(modsDir, CAPES, null); return { ...r, capes: 'off' }; }
    const c = await ensureCapes(gameDir, { mc, type, panelBase }, deps); return { ...r, capes: c.status, needFabricApi: !!c.needFabricApi };
  };
  try {
    if (!enabled || !LOADERS.includes(type) || !panelBase) { remove(null); return { status: 'off' }; }
    const jars = studioJars(modsDir);
    // El studio ya lo incluye en sus mods: solo se configura (dos copias harían fallar el juego)
    if (jars.some(f => /customskinloader/i.test(f))) {
      removeCsl(null);
      writeConfig(gameDir, panelBase);
      return withCapes({ status: 'studio' });
    }
    const file = await resolve(mc, type, deps.fetchJson);
    if (!file) { remove(null); log.info(`[skins] CustomSkinLoader no está disponible para ${type} ${mc}`); return { status: 'unsupported' }; }
    const name = jarName(CSL, file.version);
    await deps.downloadFile({ url: file.url, dest: path.join(modsDir, name), sha1: file.sha1, size: file.size, verify: !!file.sha1 });
    removeCsl(name);
    writeConfig(gameDir, panelBase);
    return withCapes({ status: 'ok', file: name });
  } catch (e) {
    log.warn('[skins] No se pudo preparar el mod de skins:', e.message);
    return { status: 'error', error: e.message };
  }
}

module.exports = { init, ensure, writeConfig, writeCapeConfig, PREFIX };
