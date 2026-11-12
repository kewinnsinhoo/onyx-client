// Instancias: se añaden con un código de acceso, se sincronizan desde GitHub y se lanzan.
const fs = require('fs');
const path = require('path');
const { JsonStore } = require('./store');
const data = require('./data');
const { downloadAll } = require('./game/download');
const game = require('./game/launch');
const log = require('./logger');

let store, root;
const running = new Map();

function init(gameRoot) {
  root = gameRoot;
  store = new JsonStore(path.join(root, 'instances.json'), { instances: [] });
}

function view(i) {
  const m = i.manifest || {};
  return {
    id: i.id,
    name: m.name || i.id,
    description: m.description || '',
    icon: m.icon || null,
    banner: m.banner || null,
    minecraft: m.minecraft,
    loader: m.loader || { type: 'vanilla' },
    premium: !!m.premium,
    server: m.server || null,
    addedAt: i.addedAt,
    lastPlayed: i.lastPlayed || null,
    playTime: i.playTime || 0,
    memoryMb: i.memoryMb || null,
    running: running.has(i.id)
  };
}

function list() {
  return store.get().instances.map(view).sort((a, b) => (b.lastPlayed || b.addedAt) - (a.lastPlayed || a.addedAt));
}

function get(id) {
  const i = store.get().instances.find(x => x.id === id);
  return i ? view(i) : null;
}

const CODE_RE = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;

async function redeem(code) {
  code = String(code || '').trim();
  if (!CODE_RE.test(code)) throw new Error('El código debe tener el formato XXXX-XXXX-XXXX');
  if (!data.baseUrl()) throw new Error('El launcher aún no está conectado al repositorio de datos (onyx.config.json → dataUrl).');
  const codes = await data.getJson('codes.json', { maxAge: 5e3, fallback: {} });
  const id = codes[data.hashCode(code)];
  if (!id) throw new Error('Código no válido o caducado');
  const manifest = await data.getJson(`instances/${id}.json`, { maxAge: 5e3 });
  if (!manifest) throw new Error('La instancia de este código ya no existe');
  const d = store.get();
  const existing = d.instances.find(x => x.id === id);
  if (existing) { existing.manifest = manifest; store.replace(d); return { instance: view(existing), already: true }; }
  const inst = { id, manifest, addedAt: Date.now(), managedFiles: [] };
  d.instances.push(inst);
  store.replace(d);
  log.info('Instancia añadida', id);
  return { instance: view(inst), already: false };
}

async function refreshManifest(inst) {
  const m = await data.getJson(`instances/${inst.id}.json`, { maxAge: 30e3 });
  if (m) inst.manifest = m;
  return inst;
}

function safeRel(p) {
  const n = path.normalize(String(p)).replace(/^([/\\])+/, '');
  if (n.startsWith('..') || path.isAbsolute(n)) throw new Error('Ruta de archivo no permitida: ' + p);
  return n;
}

// Descarga mods/configs de la instancia y borra los que ya no están en la lista.
async function syncFiles(inst, gameDir, concurrency, progress) {
  const files = (inst.manifest.files || []).filter(f => f && f.url && f.path);
  const rels = files.map(f => safeRel(f.path));
  const tasks = files.map((f, i) => ({ url: f.url, dest: path.join(gameDir, rels[i]), sha1: f.sha1, size: f.size }));
  progress({ stage: 'files', done: 0, total: tasks.length });
  await downloadAll(tasks, { concurrency, onProgress: (d, t) => progress({ stage: 'files', done: d, total: t }) });
  for (const old of inst.managedFiles || []) {
    if (!rels.includes(old)) { try { fs.unlinkSync(path.join(gameDir, old)); } catch { /* nada */ } }
  }
  inst.managedFiles = rels;
}

async function play(id, { account, settings, launcherVersion, progress, onLog, onExit, onStart }) {
  if (running.has(id)) throw new Error('Esta instancia ya se está ejecutando');
  const d = store.get();
  const inst = d.instances.find(x => x.id === id);
  if (!inst) throw new Error('Instancia no encontrada');
  await refreshManifest(inst).catch(() => {});
  const m = inst.manifest;
  if (m.premium && account.type !== 'msa') {
    throw new Error('Esta instancia es Premium: inicia sesión con una cuenta de Microsoft que tenga Minecraft.');
  }
  if (m.maintenance) throw new Error(m.maintenance === true ? 'La instancia está en mantenimiento' : String(m.maintenance));

  const gameDir = path.join(root, 'instances', id);
  fs.mkdirSync(gameDir, { recursive: true });
  await syncFiles(inst, gameDir, settings.fastDownload ? 16 : 4, progress);
  store.replace(d);

  const started = Date.now();
  const child = await game.launch(root, {
    instance: { id, minecraft: m.minecraft, loader: m.loader || { type: 'vanilla' }, server: m.server, memoryMb: inst.memoryMb || null },
    account, settings, progress, onLog, launcherVersion,
    onExit: (code) => {
      running.delete(id);
      const d2 = store.get();
      const i2 = d2.instances.find(x => x.id === id);
      if (i2) { i2.playTime = (i2.playTime || 0) + (Date.now() - started); store.replace(d2); }
      onExit && onExit(code);
    }
  });
  running.set(id, child);
  inst.lastPlayed = Date.now();
  store.replace(d);
  onStart && onStart();
  return view(inst);
}

function stop(id) {
  const c = running.get(id);
  if (c) { try { c.kill(); } catch { /* nada */ } }
  return true;
}

function remove(id, deleteFiles) {
  stop(id);
  const d = store.get();
  d.instances = d.instances.filter(x => x.id !== id);
  store.replace(d);
  if (deleteFiles) {
    try { fs.rmSync(path.join(root, 'instances', id), { recursive: true, force: true }); } catch { /* nada */ }
  }
  return list();
}

function setMemory(id, mb) {
  const d = store.get();
  const i = d.instances.find(x => x.id === id);
  if (i) { i.memoryMb = mb ? Number(mb) : null; store.replace(d); }
  return i ? view(i) : null;
}

function dir(id) { return path.join(root, 'instances', id); }

// Galería: capturas (F2) de todas las instancias.
function screenshots() {
  const out = [];
  for (const i of store.get().instances) {
    const sdir = path.join(root, 'instances', i.id, 'screenshots');
    let files = [];
    try { files = fs.readdirSync(sdir); } catch { continue; }
    for (const f of files) {
      if (!/\.(png|jpe?g)$/i.test(f)) continue;
      const full = path.join(sdir, f);
      try {
        const st = fs.statSync(full);
        out.push({ path: full, name: f, instance: (i.manifest && i.manifest.name) || i.id, time: st.mtimeMs, size: st.size });
      } catch { /* nada */ }
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

function isRunning() { return running.size > 0; }

module.exports = { init, list, get, redeem, play, stop, remove, setMemory, dir, screenshots, isRunning, CODE_RE };
