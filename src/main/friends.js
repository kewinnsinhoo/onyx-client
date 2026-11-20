// Jugar con amigos (lo activa cada jugador en cada instancia): pone el mod e4all (o e4mc si no hay versión),
// que al pulsar «Abrir en LAN» abre tu mundo por internet y da una dirección (algo.e4mc.link) para tus amigos.
// Sin abrir puertos del router ni programas aparte. El launcher lee esa dirección del registro del juego,
// la copia y te la enseña. e4all deja entrar también a cuentas no premium (botón «Online Mode» al abrir en LAN).
// Se guarda como mods/kopi-friends-*.jar: la sincronización del studio no lo borra y KopiGuard no lo cuenta.
const fs = require('fs');
const path = require('path');
const log = require('./logger');
const perfmode = require('./perfmode');

const PREFIX = 'kopi-friends-';
const PROJECTS = ['e4all', 'e4mc'];
const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt'];
const SKIP = /^(e4mc|e4all|e4mc-retro|essential|world-host|playit|lan-?server|ngrok)[-_ .+]/i; // el studio ya trae algo parecido
// «Local game hosted on domain [abc.e4mc.link]» → abc.e4mc.link
const ADDRESS_RE = /\b((?:[a-z0-9-]+\.)+e4mc\.link)\b/i;

function ours(modsDir) { try { return fs.readdirSync(modsDir).filter(f => f.startsWith(PREFIX) && f.endsWith('.jar')); } catch { return []; } }

/** → { status: 'off'|'unsupported'|'ok', mod, needsFabricApi } — nunca impide jugar */
async function ensure(gameDir, { mc, loader, enabled }, deps) {
  const modsDir = path.join(gameDir, 'mods');
  const type = (loader && loader.type) || 'vanilla';
  const removeAll = (keep) => { for (const f of ours(modsDir)) if (f !== keep) { try { fs.unlinkSync(path.join(modsDir, f)); } catch { /* nada */ } } };
  if (!enabled || !LOADERS.includes(type)) { removeAll(null); return { status: 'off', mod: null, needsFabricApi: false }; }
  let studio = [];
  try { studio = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar') && !f.startsWith('kopi-')); } catch { /* nada */ }
  if (studio.some(f => SKIP.test(f))) { removeAll(null); return { status: 'ok', mod: 'studio', needsFabricApi: false }; }
  try {
    for (const project of PROJECTS) {
      const file = await perfmode.resolve(project, mc, type === 'quilt' ? 'fabric' : type, deps.fetchJson);
      if (!file || file.otherDeps) continue;
      const name = `${PREFIX}${project}-${String(file.version).replace(/[^A-Za-z0-9._+-]/g, '_')}.jar`;
      fs.mkdirSync(modsDir, { recursive: true });
      await deps.downloadFile({ url: file.url, dest: path.join(modsDir, name), sha1: file.sha1, size: file.size, verify: !!file.sha1 });
      removeAll(name);
      log.info(`[amigos] ${type} ${mc}: ${project} ${file.version}`);
      return { status: 'ok', mod: project, needsFabricApi: !!file.needsFabricApi && (type === 'fabric' || type === 'quilt') };
    }
  } catch (e) { log.warn('[amigos] No se pudo preparar:', e.message); }
  removeAll(null);
  return { status: 'unsupported', mod: null, needsFabricApi: false };
}

// Sin Fabric API no arrancaría: se quita
function drop(gameDir) { for (const f of ours(path.join(gameDir, 'mods'))) { try { fs.unlinkSync(path.join(gameDir, 'mods', f)); } catch { /* nada */ } } }

// La dirección para tus amigos en una línea del registro del juego (o null)
function addressIn(line) { const m = ADDRESS_RE.exec(String(line || '')); return m ? m[1].toLowerCase() : null; }

module.exports = { ensure, drop, addressIn, PREFIX, PROJECTS };
