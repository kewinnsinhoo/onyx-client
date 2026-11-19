// Skins de Kopi en el juego: pone solo el mod CustomSkinLoader (de Modrinth) en las instancias con
// Fabric, Quilt, Forge o NeoForge, en la versión que toca, y lo configura así:
//   1) Mojang  → la skin real de los premium (se pide desde el PC del jugador)
//   2) Kopi    → la skin que cada jugador no premium eligió en Kopi Client (panel /csl/)
// Así todos ven las skins en cualquier servidor, también en modo offline, sin instalar nada en el servidor.
// El mod se guarda como mods/kopi-skins-*.jar: la sincronización de archivos del studio no lo borra.
const fs = require('fs');
const path = require('path');
const log = require('./logger');

const PROJECT = 'idMHQ4n2'; // CustomSkinLoader en Modrinth
const PREFIX = 'kopi-skins-';
const LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];
const DAY = 864e5;

let cacheFile = null;
function init(root) { cacheFile = path.join(root, 'cache', 'kopi-skins.json'); }

function readCache() { try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { return {}; } }
function writeCache(c) { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(c, null, 2)); } catch { /* nada */ } }

// La versión del mod para esta versión de Minecraft y este loader (se recuerda un día)
async function resolve(mc, loader, fetchJson) {
  const key = `${mc}|${loader}`;
  const cache = readCache();
  const hit = cache[key];
  if (hit && Date.now() - hit.at < DAY) return hit.file;
  const tryLoader = async (l) => {
    const url = `https://api.modrinth.com/v2/project/${PROJECT}/version?loaders=${encodeURIComponent(JSON.stringify([l]))}&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`;
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

// Configura CustomSkinLoader: Mojang primero y luego Kopi; respeta el resto de ajustes del jugador
function writeConfig(gameDir, panelBase) {
  const file = path.join(gameDir, 'CustomSkinLoader', 'CustomSkinLoader.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { cfg = {}; }
  const others = (Array.isArray(cfg.loadlist) ? cfg.loadlist : [])
    .filter(x => x && !['mojang', 'kopi'].includes(String(x.name || '').toLowerCase()));
  cfg.enable = true;
  cfg.loadlist = [
    { name: 'Mojang', type: 'MojangAPI' },
    { name: 'Kopi', type: 'CustomSkinAPI', root: `${panelBase}/csl/` },
    ...others
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

function ours(dir) {
  try { return fs.readdirSync(dir).filter(f => f.startsWith(PREFIX) && f.endsWith('.jar')); } catch { return []; }
}

/**
 * Deja el mod listo (o lo quita si la instancia no lo quiere). Nunca impide jugar: si algo falla, se avisa en el registro.
 * opts: { mc, loader, enabled, panelBase }   deps: { fetchJson, downloadFile } (para las pruebas)
 */
async function ensure(gameDir, { mc, loader, enabled = true, panelBase }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const type = loader && loader.type ? loader.type : 'vanilla';
  const remove = (keep) => { for (const f of ours(modsDir)) if (f !== keep) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  try {
    if (!enabled || !LOADERS.includes(type) || !panelBase) { remove(null); return { status: 'off' }; }
    let jars = [];
    try { jars = fs.readdirSync(modsDir); } catch { /* sin carpeta mods */ }
    // El studio ya lo incluye en sus mods: solo se configura (dos copias harían fallar el juego)
    if (jars.some(f => /customskinloader/i.test(f) && !f.startsWith(PREFIX))) {
      remove(null);
      writeConfig(gameDir, panelBase);
      return { status: 'studio' };
    }
    const file = await resolve(mc, type, deps.fetchJson);
    if (!file) { remove(null); log.info(`[skins] CustomSkinLoader no está disponible para ${type} ${mc}`); return { status: 'unsupported' }; }
    const name = `${PREFIX}customskinloader-${String(file.version).replace(/[^A-Za-z0-9._+-]/g, '_')}.jar`;
    await deps.downloadFile({ url: file.url, dest: path.join(modsDir, name), sha1: file.sha1, size: file.size, verify: !!file.sha1 });
    remove(name);
    writeConfig(gameDir, panelBase);
    return { status: 'ok', file: name };
  } catch (e) {
    log.warn('[skins] No se pudo preparar el mod de skins:', e.message);
    return { status: 'error', error: e.message };
  }
}

module.exports = { init, ensure, writeConfig, PREFIX };
