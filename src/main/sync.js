// Sincronización de archivos de una instancia según lo que el studio eligió en el panel.
//   Modos generales:
//     keep    → solo se ponen/actualizan los archivos del studio; nada del jugador se borra.
//     managed → dentro de las carpetas que envía el studio (mods/, config/...) se borra lo que sobra.
//     reset   → la carpeta queda exactamente como la envía el studio (salvo las rutas del jugador).
//   Rutas del jugador (playerPaths):
//     once    → se instala una vez y luego es del jugador.
//     player  → nunca se toca.
//     studio  → siempre se actualiza (lo normal).
const fs = require('fs');
const path = require('path');

// Carpetas que crea el propio launcher y no se borran nunca (también el mod de skins de Kopi y su configuración)
const ALWAYS_KEEP = ['logs', 'resources', 'CustomSkinLoader'];
const KEEP_PREFIX = ['mods/kopi-skins-'];

function norm(p) {
  const n = path.posix.normalize(String(p || '').replace(/\\/g, '/')).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!n || n === '.' || n.startsWith('../') || n === '..' || /^[a-z]:/i.test(n)) return null;
  return n;
}

const under = (rel, base) => rel === base || rel.startsWith(base + '/');

// Modo de una ruta: el de la regla más concreta que la contiene
function modeFor(rel, playerPaths) {
  let best = null;
  for (const p of playerPaths || []) {
    const base = norm(p && p.path);
    if (!base || !under(rel, base)) continue;
    if (!best || base.length > best.base.length) best = { base, mode: p.mode };
  }
  return best ? best.mode : 'studio';
}

// Calcula qué descargar y qué borrar. No toca el disco.
//  files: [{path,url,sha1,size}]   local: rutas relativas que hay ahora en la carpeta
//  state: { managed: [rel], once: [rel], urls: {rel:url} } de la sincronización anterior
function plan({ files, sync, local, state }) {
  sync = sync || {};
  state = state || {};
  const mode = ['keep', 'managed', 'reset'].includes(sync.mode) ? sync.mode : 'keep';
  const pp = Array.isArray(sync.playerPaths) ? sync.playerPaths : [];
  const once = new Set(state.once || []);
  const prevUrls = state.urls || {};
  const localSet = new Set(local || []);

  const wanted = new Map(); // rel -> file
  for (const f of files || []) {
    const rel = f && f.url ? norm(f.path) : null;
    if (rel) wanted.set(rel, f);
  }

  const download = [], replace = [], managed = [], urls = {};
  for (const [rel, f] of wanted) {
    const m = modeFor(rel, pp);
    if (m === 'player') continue;
    if (m === 'once') {
      if (!once.has(rel) && !localSet.has(rel)) download.push({ rel, file: f });
      once.add(rel);
      continue;
    }
    managed.push(rel);
    urls[rel] = f.url;
    // Si el studio cambió el enlace de un archivo sin sha1, hay que volver a bajarlo
    if (localSet.has(rel) && prevUrls[rel] && prevUrls[rel] !== f.url && !f.sha1) replace.push(rel);
    download.push({ rel, file: f });
  }

  const keepPath = (rel) => {
    if (wanted.has(rel) && modeFor(rel, pp) !== 'player') return true;
    if (ALWAYS_KEEP.some(b => under(rel, b)) || KEEP_PREFIX.some(x => rel.startsWith(x))) return true;
    const m = modeFor(rel, pp);
    return m === 'player' || m === 'once';
  };

  const remove = new Set();
  // Archivos que el studio puso antes y ya no están en la lista
  for (const rel of state.managed || []) {
    if (!wanted.has(rel) && localSet.has(rel) && modeFor(rel, pp) === 'studio') remove.add(rel);
  }
  if (mode === 'managed') {
    // Carpetas de primer nivel que envía el studio
    const roots = new Set(managed.filter(r => r.includes('/')).map(r => r.split('/')[0]));
    for (const rel of localSet) if (roots.has(rel.split('/')[0]) && !keepPath(rel)) remove.add(rel);
  } else if (mode === 'reset') {
    for (const rel of localSet) if (!keepPath(rel)) remove.add(rel);
  }
  return { mode, download, replace, remove: [...remove], state: { managed, once: [...once], urls } };
}

// Lista todos los archivos (rutas relativas con /) de una carpeta
function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    let ents;
    try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (!e.name.endsWith('.part')) out.push(r);
    }
  };
  walk(dir, '');
  return out;
}

// Borra carpetas que se hayan quedado vacías tras limpiar
function pruneEmpty(dir, keepTop = true) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) if (e.isDirectory()) pruneEmpty(path.join(dir, e.name), false);
  if (!keepTop) { try { if (!fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { /* nada */ } }
}

module.exports = { plan, listFiles, pruneEmpty, modeFor, norm };
