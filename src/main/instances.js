// Instancias: se añaden con un código de acceso, se sincronizan desde el panel de Kopi
// (o desde GitHub para las antiguas) y se lanzan.
const fs = require('fs');
const path = require('path');
const { JsonStore } = require('./store');
const data = require('./data');
const panel = require('./panel');
const Sync = require('./sync');
const { downloadAll } = require('./game/download');
const game = require('./game/launch');
const log = require('./logger');

let store, root;
const running = new Map();

function init(gameRoot) {
  root = gameRoot;
  store = new JsonStore(path.join(root, 'instances.json'), { instances: [], dismissed: [] });
}

const isPanel = (i) => !!(i && i.manifest && i.manifest.source === 'panel');
// En un launcher de marca solo salen las instancias de su studio
const { config: CFG } = require('./config');
const BRAND_STUDIO = CFG.brand && CFG.brand.onlyStudio !== false ? CFG.brand.studio || null : null;
const ofBrand = (m) => !BRAND_STUDIO || !!(m && m.studio && m.studio.id === BRAND_STUDIO);

function view(i) {
  const m = i.manifest || {};
  const look = m.look || {};
  return {
    id: i.id,
    source: m.source || 'github',
    name: m.name || i.id,
    category: m.category || null,
    description: m.description || '',
    icon: m.icon || null,
    iconAnimated: m.iconAnimated || null,
    banner: m.banner || null,
    bannerAnimated: m.bannerAnimated || null,
    logo: m.logo || null,
    logoAnimated: m.logoAnimated || null,
    look: {
      accent: look.accent || null, playColor: look.playColor || null, vignette: look.vignette !== false,
      hideTitle: !!look.hideTitle, hideTech: !!look.hideTech, hideAuthor: !!look.hideAuthor, snow: !!look.snow,
      music: look.music || null, sponsor: look.sponsor || null
    },
    minecraft: m.minecraft,
    loader: m.loader || { type: 'vanilla' },
    studio: m.studio || null,
    about: m.about || null,
    premium: !!m.premium,
    maxPlayers: m.maxPlayers || null,
    server: m.server || null,
    state: m.state || 'open',
    schedule: m.schedule ? { opensAt: m.schedule.opensAt || null, closesAt: m.schedule.closesAt || null, predownload: !!m.schedule.predownload } : null,
    lockedMessage: typeof m.maintenance === 'string' ? m.maintenance : null,
    addedAt: i.addedAt,
    lastPlayed: i.lastPlayed || null,
    playTime: i.playTime || 0,
    memoryMb: i.memoryMb || null,
    running: running.has(i.id)
  };
}

function list() {
  return store.get().instances.filter(i => ofBrand(i.manifest)).map(view).sort((a, b) => (b.lastPlayed || b.addedAt) - (a.lastPlayed || a.addedAt));
}

function get(id) {
  const i = store.get().instances.find(x => x.id === id);
  return i ? view(i) : null;
}

const CODE_RE = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;

function addOrUpdate(id, manifest) {
  const d = store.get();
  d.dismissed = (d.dismissed || []).filter(x => x !== id);
  const existing = d.instances.find(x => x.id === id);
  if (existing) { existing.manifest = manifest; store.replace(d); return { instance: view(existing), already: true }; }
  const inst = { id, manifest, addedAt: Date.now(), managedFiles: [] };
  d.instances.push(inst);
  store.replace(d);
  log.info('Instancia añadida', id);
  return { instance: view(inst), already: false };
}

// Códigos antiguos publicados en el repo onyx-data de GitHub
async function redeemGithub(code) {
  const codes = await data.getJson('codes.json', { maxAge: 5e3, fallback: {} });
  const id = codes[data.hashCode(code)];
  if (!id) return null;
  const manifest = await data.getJson(`instances/${id}.json`, { maxAge: 5e3 });
  if (!manifest) throw new Error('La instancia de este código ya no existe');
  return addOrUpdate(id, manifest);
}

async function redeem(code, account) {
  const raw = String(code || '').trim();
  if (!CODE_RE.test(raw)) throw new Error('El código debe tener el formato XXXX-XXXX-XXXX');
  code = raw.toUpperCase();
  let panelError = null;
  if (panel.enabled()) {
    if (!account) throw new Error('Inicia sesión para canjear códigos');
    try {
      const r = await panel.redeem(account, code);
      if (!ofBrand(r.instance)) {
        const other = new Error('Este código es de otro studio. Úsalo en Kopi Client.');
        other.code = 'other_studio';
        throw other;
      }
      const res = addOrUpdate(r.instance.id, r.instance);
      res.already = res.already || !!r.already;
      return res;
    } catch (e) {
      // Si el panel no conoce el código (o no responde), se prueba con los códigos antiguos de GitHub
      if (!['code', 'offline'].includes(e.code)) throw e; // (other_studio también se lanza tal cual)
      panelError = e;
    }
  }
  if (data.baseUrl()) {
    try { const r = (await redeemGithub(raw)) || (raw !== code ? await redeemGithub(code) : null); if (r) return r; }
    catch (e) { if (!panelError) throw e; }
  }
  if (panelError) throw panelError;
  if (!data.baseUrl()) throw new Error('El launcher aún no está conectado al repositorio de datos (onyx.config.json → dataUrl).');
  throw new Error('Código no válido o caducado');
}

// Trae del panel las instancias a las que el jugador tiene acceso (lista manual, públicas...)
let lastPanelSync = 0;
async function syncPanel(account, { force = false } = {}) {
  if (!panel.enabled() || !account) return list();
  if (!force && Date.now() - lastPanelSync < 15e3) return list();
  lastPanelSync = Date.now();
  try {
    const remote = await panel.listInstances(account);
    const d = store.get();
    const dismissed = new Set(d.dismissed || []);
    for (const m of remote) {
      if (!ofBrand(m)) continue;
      const ex = d.instances.find(x => x.id === m.id);
      if (ex) ex.manifest = m;
      else if (!dismissed.has(m.id)) d.instances.push({ id: m.id, manifest: m, addedAt: Date.now(), managedFiles: [] });
    }
    // Si el studio te quitó el acceso (o borró/ocultó la instancia), desaparece de la lista.
    // Los archivos se quedan en el equipo por si te vuelven a dar acceso.
    const ids = new Set(remote.map(m => m.id));
    d.instances = d.instances.filter(i => !isPanel(i) || ids.has(i.id) || running.has(i.id));
    store.replace(d);
  } catch (e) { lastPanelSync = 0; log.warn('[panel] No se pudo sincronizar la lista:', e.message); }
  return list();
}

// Errores del panel que significan "esta instancia ya no es tuya"
const GONE = ['no_access', 'banned', 'instance'];
function forget(id) {
  const d = store.get();
  d.instances = d.instances.filter(x => x.id !== id);
  store.replace(d);
}

async function refreshManifest(inst, account) {
  if (isPanel(inst)) {
    if (!account) return inst;
    let m;
    try { m = await panel.getInstance(account, inst.id); }
    catch (e) { if (GONE.includes(e.code)) { forget(inst.id); e.removed = true; } throw e; }
    if (m) inst.manifest = m;
    return inst;
  }
  const m = await data.getJson(`instances/${inst.id}.json`, { maxAge: 30e3 });
  if (m) inst.manifest = m;
  return inst;
}

function safeRel(p) {
  const n = path.normalize(String(p)).replace(/^([/\\])+/, '');
  if (n.startsWith('..') || path.isAbsolute(n)) throw new Error('Ruta de archivo no permitida: ' + p);
  return n;
}

// Descarga mods/configs de la instancia y limpia según el modo de sincronización del studio.
async function syncFiles(inst, gameDir, concurrency, progress) {
  const m = inst.manifest || {};
  const files = (m.files || []).filter(f => f && f.url && f.path);
  for (const f of files) safeRel(f.path); // rutas peligrosas → error
  const prev = inst.syncState || { managed: inst.managedFiles || [], once: [], urls: {} };
  const p = Sync.plan({ files, sync: m.sync, local: Sync.listFiles(gameDir), state: prev });
  for (const rel of p.replace) { try { fs.unlinkSync(path.join(gameDir, rel)); } catch { /* nada */ } }
  const tasks = p.download.map(({ rel, file }) => ({ url: file.url, dest: path.join(gameDir, rel), sha1: file.sha1, size: file.size, verify: !!file.sha1 }));
  progress({ stage: 'files', done: 0, total: tasks.length });
  await downloadAll(tasks, { concurrency, onProgress: (d, t) => progress({ stage: 'files', done: d, total: t }) });
  for (const rel of p.remove) { try { fs.unlinkSync(path.join(gameDir, rel)); } catch { /* nada */ } }
  if (p.remove.length) { Sync.pruneEmpty(gameDir); log.info(`[sync] ${inst.id}: ${p.remove.length} archivo(s) quitados (modo ${p.mode})`); }
  // Carpetas vacías que el studio creó en el panel (p. ej. shaderpacks)
  for (const dir of Array.isArray(m.dirs) ? m.dirs : []) {
    const rel = Sync.norm(dir);
    if (rel) fs.mkdirSync(path.join(gameDir, rel), { recursive: true });
  }
  inst.syncState = p.state;
  inst.managedFiles = p.state.managed;
}

async function play(id, { account, settings, launcherVersion, progress, onLog, onExit, onStart }) {
  if (running.has(id)) throw new Error('Esta instancia ya se está ejecutando');
  const d = store.get();
  const inst = d.instances.find(x => x.id === id);
  if (!inst) throw new Error('Instancia no encontrada');
  const fromPanel = isPanel(inst);
  if (fromPanel) await refreshManifest(inst, account); // si ya no hay acceso, avisa aquí
  else await refreshManifest(inst).catch(() => {});
  const m = inst.manifest;
  if (m.premium && account.type !== 'msa') {
    throw new Error('Esta instancia es Premium: inicia sesión con una cuenta de Microsoft que tenga Minecraft.');
  }
  if (!fromPanel && m.maintenance) throw new Error(m.maintenance === true ? 'La instancia está en mantenimiento' : String(m.maintenance));

  const gameDir = path.join(root, 'instances', id);
  fs.mkdirSync(gameDir, { recursive: true });
  const concurrency = settings.fastDownload ? 16 : 4;
  const gameInfo = { id, minecraft: m.minecraft, loader: m.loader || { type: 'vanilla' }, java: m.java, server: m.server, memoryMb: inst.memoryMb || null };

  // El panel decide si puede entrar ahora (horario, bloqueo, plazas, baneos...)
  let session = null;
  if (fromPanel) {
    try { session = await panel.startPlay(account, id); }
    catch (e) {
      if (e.code === 'not_open' && e.predownload) {
        // Descarga anticipada: se deja todo listo para entrar al instante cuando abra
        await syncFiles(inst, gameDir, concurrency, progress);
        store.replace(d);
        await game.prepare(root, { mc: gameInfo.minecraft, loader: gameInfo.loader, java: gameInfo.java }, { concurrency, progress, javaPath: settings.javaPath, onLog });
        const ready = new Error('Todo descargado. La instancia abre el {date}');
        ready.code = 'predownloaded'; ready.vars = e.vars;
        throw ready;
      }
      throw e;
    }
  }

  let stopBeat = () => {};
  let kicked = false;
  try {
    await syncFiles(inst, gameDir, concurrency, progress);
    store.replace(d);
    const started = Date.now();
    const child = await game.launch(root, {
      instance: gameInfo,
      account, settings, progress, onLog, launcherVersion,
      onExit: (code) => {
        running.delete(id);
        stopBeat();
        const d2 = store.get();
        const i2 = d2.instances.find(x => x.id === id);
        if (i2) { i2.playTime = (i2.playTime || 0) + (Date.now() - started); store.replace(d2); }
        onExit && onExit(code, { kicked });
      }
    });
    running.set(id, child);
    if (session) {
      stopBeat = panel.heartbeat(account, session.play, session.beatEvery, () => {
        kicked = true;
        log.info(`[panel] El studio cerró ${id}: se cierra el juego`);
        stop(id);
      });
    }
  } catch (e) {
    if (session) panel.endPlay(account, session.play).catch(() => {});
    throw e;
  }
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
  const inst = d.instances.find(x => x.id === id);
  // Una instancia del panel quitada a mano no vuelve sola (solo con su código)
  if (isPanel(inst)) d.dismissed = [...new Set([...(d.dismissed || []), id])];
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

// Estado del servidor de la instancia (jugadores conectados)
async function serverStatus(id) {
  const i = store.get().instances.find(x => x.id === id);
  const srv = i && i.manifest && i.manifest.server;
  if (!srv || !srv.address) return null;
  try { return { ...(await require('./game/ping').ping(srv.address, srv.port || 25565)), address: srv.address }; }
  catch { return { offline: true, address: srv.address }; }
}

// "Actualizar": vuelve a leer la instancia de GitHub y sincroniza sus archivos
async function update(id, { settings, progress, account }) {
  if (running.has(id)) throw new Error('Cierra el juego antes de actualizar');
  const d = store.get();
  const inst = d.instances.find(x => x.id === id);
  if (!inst) throw new Error('Instancia no encontrada');
  await refreshManifest(inst, account);
  const gameDir = path.join(root, 'instances', id);
  fs.mkdirSync(gameDir, { recursive: true });
  await syncFiles(inst, gameDir, settings.fastDownload ? 16 : 4, progress);
  store.replace(d);
  return view(inst);
}

// "Borrar archivos": elimina los archivos descargados de la instancia (mundos incluidos) pero la deja en la lista
function wipe(id) {
  if (running.has(id)) throw new Error('Cierra el juego antes de borrar los archivos');
  const d = store.get();
  const inst = d.instances.find(x => x.id === id);
  if (!inst) throw new Error('Instancia no encontrada');
  fs.rmSync(path.join(root, 'instances', id), { recursive: true, force: true });
  inst.managedFiles = [];
  inst.syncState = null;
  store.replace(d);
  return view(inst);
}

// "Instalar desde .onyxpack": un .zip con una carpeta overrides/ (mods, config, resourcepacks...)
function importPack(id, file) {
  const { extract, list } = require('./game/zip');
  const names = list(file);
  if (!names.length) throw new Error('El archivo está vacío');
  const gameDir = path.join(root, 'instances', id);
  fs.mkdirSync(gameDir, { recursive: true });
  const strip = names.some(n => n.startsWith('overrides/')) ? 'overrides/' : null;
  extract(file, gameDir, { strip, exclude: ['META-INF/'] });
  return names.filter(n => !n.endsWith('/') && (!strip || n.startsWith(strip))).length;
}

module.exports = { init, list, get, redeem, syncPanel, play, stop, remove, setMemory, dir, screenshots, isRunning, serverStatus, update, wipe, importPack, CODE_RE };
