// Modo rendimiento (opcional, lo activa cada jugador en cada instancia): pone mods de optimización
// muy usados y solo de cliente, en la versión que toca para la versión de Minecraft y el loader:
//   - Sodium (o Embeddium en Forge): dibuja el mundo mucho más rápido (más FPS)
//   - Lithium: la lógica del juego (mundo, mobs) gasta menos
//   - FerriteCore: usa menos memoria RAM
//   - EntityCulling: no dibuja los mobs y cofres que no se ven
// Reglas para no romper nada:
//   - si el studio ya trae ese mod (u otro que hace lo mismo o choca, como OptiFine), ese no se pone;
//   - si un mod necesita otro que no sea Fabric API, ese mod no se pone;
//   - Fabric API la gestiona skinmod.js (una sola copia para capas y rendimiento): aquí solo se avisa;
//   - si algo falla, se juega igual (sin ese mod).
// Los mods se guardan como mods/kopi-perf-*.jar: la sincronización de archivos del studio no los borra.
const fs = require('fs');
const path = require('path');
const log = require('./logger');

const PREFIX = 'kopi-perf-';
const FABRIC_API = 'P7dR8mSH'; // id de Fabric API en Modrinth
const LOADERS = ['fabric', 'forge', 'neoforge'];
const DAY = 864e5;
// Cada «hueco» usa el primer mod que exista para esa versión; «skip»: nombres de mods del studio que ya lo hacen o chocan
const MODS = [
  { key: 'render', projects: ['sodium', 'embeddium'], skip: /^(sodium|embeddium|rubidium|magnesium|xenon|optifine|optifabric|vulkanmod)[-_ .+]/i },
  { key: 'logic', projects: ['lithium'], skip: /^(lithium|canary|radium|roadrunner)[-_ .+]/i },
  { key: 'memory', projects: ['ferrite-core'], skip: /^ferrite-?core[-_ .+]/i },
  { key: 'culling', projects: ['entityculling'], skip: /^entity-?culling[-_ .+]/i }
];
const NAMES = { sodium: 'Sodium', embeddium: 'Embeddium', lithium: 'Lithium', 'ferrite-core': 'FerriteCore', entityculling: 'EntityCulling' };

let cacheFile = null;
function init(root) { cacheFile = path.join(root, 'cache', 'kopi-perf.json'); }
function readCache() { try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { return {}; } }
function writeCache(c) { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(c, null, 2)); } catch { /* nada */ } }

// La versión de un mod para esta versión de Minecraft y este loader, con lo que necesita (se recuerda un día)
async function resolve(project, mc, loader, fetchJson) {
  const key = `${project}|${mc}|${loader}`;
  const cache = cacheFile ? readCache() : {};
  const hit = cache[key];
  if (hit && Date.now() - hit.at < DAY) return hit.file;
  try {
    const url = `https://api.modrinth.com/v2/project/${project}/version?loaders=${encodeURIComponent(JSON.stringify([loader]))}&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`;
    const list = await fetchJson(url);
    let file = null;
    if (Array.isArray(list) && list.length) {
      const v = list.find(x => x.version_type === 'release') || list[0];
      const f = (v.files || []).find(x => x.primary) || (v.files || [])[0];
      const req = (v.dependencies || []).filter(d => d && d.dependency_type === 'required');
      if (f) file = {
        url: f.url, sha1: f.hashes && f.hashes.sha1, size: f.size, version: v.version_number,
        needsFabricApi: req.some(d => d.project_id === FABRIC_API),
        // necesita algo más que Fabric API (o algo que no se sabe qué es): mejor no ponerlo
        otherDeps: req.some(d => d.project_id !== FABRIC_API)
      };
    }
    if (cacheFile) { cache[key] = { at: Date.now(), file }; writeCache(cache); }
    return file;
  } catch (e) {
    if (hit) return hit.file; // sin conexión con Modrinth: lo que se sabía
    throw e;
  }
}

function ours(modsDir) {
  try { return fs.readdirSync(modsDir).filter(f => f.startsWith(PREFIX) && f.endsWith('.jar')); } catch { return []; }
}
const jarName = (project, version) => `${PREFIX}${project}-${String(version).replace(/[^A-Za-z0-9._+-]/g, '_')}.jar`;

/**
 * Pone o quita los mods del modo rendimiento. Nunca impide jugar.
 * opts: { mc, loader, enabled }  ·  deps: { fetchJson, downloadFile }
 * → { status: 'off'|'unsupported'|'ok', mods: ['Sodium', …], needsFabricApi }
 */
async function ensure(gameDir, { mc, loader, enabled }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const type = (loader && loader.type) || 'vanilla';
  const removeAll = (keep = []) => { for (const f of ours(modsDir)) if (!keep.includes(f)) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  if (!enabled || !LOADERS.includes(type)) { removeAll(); return { status: 'off', mods: [], needsFabricApi: false }; }
  let studio = [];
  try { studio = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar') && !f.startsWith(PREFIX)); } catch { /* sin carpeta mods */ }
  const keep = [], mods = [];
  let needsFabricApi = false;
  for (const slot of MODS) {
    if (studio.some(f => slot.skip.test(f))) continue; // el studio ya lo trae (o algo que choca)
    try {
      let file = null, project = null;
      for (const p of slot.projects) { file = await resolve(p, mc, type, deps.fetchJson); if (file) { project = p; break; } }
      if (!file || file.otherDeps) continue;
      const name = jarName(project, file.version);
      fs.mkdirSync(modsDir, { recursive: true });
      await deps.downloadFile({ url: file.url, dest: path.join(modsDir, name), sha1: file.sha1, size: file.size, verify: !!file.sha1 });
      keep.push(name); mods.push(NAMES[project] || project);
      if (file.needsFabricApi && type === 'fabric') needsFabricApi = true;
    } catch (e) {
      log.warn(`[rendimiento] No se pudo preparar ${slot.projects[0]}:`, e.message); // se juega sin él
    }
  }
  removeAll(keep);
  if (mods.length) log.info(`[rendimiento] ${type} ${mc}: ${mods.join(', ')}`);
  return { status: mods.length ? 'ok' : 'unsupported', mods, needsFabricApi };
}

// Si al final no hay Fabric API, se quitan los mods que la necesitan (si no, el juego no arrancaría)
async function dropNeedingFabricApi(gameDir, { mc, loader }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const type = (loader && loader.type) || 'vanilla';
  for (const f of ours(modsDir)) {
    const slot = MODS.find(s => s.projects.some(p => f.startsWith(PREFIX + p + '-')));
    const project = slot && slot.projects.find(p => f.startsWith(PREFIX + p + '-'));
    const file = project ? await resolve(project, mc, type, deps.fetchJson).catch(() => null) : null;
    if (!file || file.needsFabricApi) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } }
  }
}

module.exports = { init, ensure, dropNeedingFabricApi, resolve, PREFIX, MODS };
