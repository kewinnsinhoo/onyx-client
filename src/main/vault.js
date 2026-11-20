// Mods bajo llave: mientras NO se juega, los mods de cada instancia se guardan cifrados (AES-256-GCM) en
// <datos>/vault/<instancia>/, con nombres al azar y un índice también cifrado. En la carpeta mods/ no queda nada.
//   - Jugar:  open()  → se descifran en mods/ (con su fecha original, para que la sincronización no los
//             vuelva a descargar) → sincronizar → jugar.
//   - Cerrar: seal()  → lo que hay en mods/ se cifra (solo lo nuevo o cambiado) y se borra de mods/.
//   - Al abrir el launcher se cierra lo que se quedó abierto (apagón, el launcher se cerró con el juego…).
// La llave es una por ordenador, protegida por el sistema (Windows/macOS) si se puede: copiar la carpeta
// vault/ a otro PC no sirve de nada. Si la llave se pierde, los mods se vuelven a descargar al jugar.
// Los mods que pone Kopi (kopi-skins-*, kopi-perf-*) son públicos y no hace falta guardarlos.
// Ojo: mientras el juego está abierto los mods tienen que estar sin cifrar (Minecraft los necesita).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const log = require('./logger');

const MAGIC = Buffer.from('KOPV1');
const HEAD = MAGIC.length + 12, TAG = 16;
const PUBLIC = /^kopi-(skins|perf)-/;

let base = null, protector = null, cachedKey = null;

/** root: carpeta de datos del juego. opts.protector: { protect(buf)→buf, unprotect(buf)→buf } (llave del sistema) */
function init(root, opts = {}) {
  base = path.join(root, 'vault');
  protector = opts.protector || null;
  cachedKey = null;
}
function setProtector(p) { protector = p; cachedKey = null; }

// ---------------------------------------------------------------- llave
function key() {
  if (cachedKey) return cachedKey;
  const file = path.join(base, 'key');
  let k = null;
  try {
    const raw = fs.readFileSync(file);
    k = protector ? protector.unprotect(raw) : raw;
  } catch { k = null; }
  if (!k || k.length !== 32) {
    // llave nueva: lo cifrado con la anterior ya no se puede abrir (se descargará otra vez)
    k = crypto.randomBytes(32);
    fs.mkdirSync(base, { recursive: true });
    for (const d of safeList(base)) if (d !== 'key') { try { fs.rmSync(path.join(base, d), { recursive: true, force: true }); } catch { /* nada */ } }
    fs.writeFileSync(file, protector ? protector.protect(k) : k);
  }
  cachedKey = k;
  return k;
}

// ---------------------------------------------------------------- cifrar / descifrar
function sealBuffer(buf, k) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  return Buffer.concat([MAGIC, iv, c.update(buf), c.final(), c.getAuthTag()]);
}
function openBuffer(buf, k) {
  if (buf.length < HEAD + TAG || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('No es un archivo de Kopi');
  const d = crypto.createDecipheriv('aes-256-gcm', k, buf.subarray(MAGIC.length, HEAD));
  d.setAuthTag(buf.subarray(buf.length - TAG));
  return Buffer.concat([d.update(buf.subarray(HEAD, buf.length - TAG)), d.final()]);
}
async function sealFile(src, dst, k) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const tmp = dst + '.tmp';
  try {
    const out = fs.createWriteStream(tmp);
    out.write(Buffer.concat([MAGIC, iv]));
    await pipeline(fs.createReadStream(src), c, out);
    fs.appendFileSync(tmp, c.getAuthTag());
    fs.renameSync(tmp, dst);
  } catch (e) { try { fs.unlinkSync(tmp); } catch { /* nada */ } throw e; }
}
async function openFile(src, dst, k) {
  const size = fs.statSync(src).size;
  if (size < HEAD + TAG) throw new Error('Archivo dañado');
  const fd = fs.openSync(src, 'r');
  const head = Buffer.alloc(HEAD), tag = Buffer.alloc(TAG);
  try { fs.readSync(fd, head, 0, HEAD, 0); fs.readSync(fd, tag, 0, TAG, size - TAG); } finally { fs.closeSync(fd); }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('No es un archivo de Kopi');
  const d = crypto.createDecipheriv('aes-256-gcm', k, head.subarray(MAGIC.length));
  d.setAuthTag(tag);
  const tmp = dst + '.kopi-tmp';
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    await pipeline(size - TAG > HEAD ? fs.createReadStream(src, { start: HEAD, end: size - TAG - 1 }) : require('stream').Readable.from([]), d, fs.createWriteStream(tmp));
    fs.renameSync(tmp, dst);
  } catch (e) { try { fs.unlinkSync(tmp); } catch { /* nada */ } throw e; }
}

// ---------------------------------------------------------------- índice de una instancia
const safeId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');
const dirOf = (id) => path.join(base, safeId(id));
function safeList(d) { try { return fs.readdirSync(d); } catch { return []; } }
function readIndex(id) {
  try { return JSON.parse(openBuffer(fs.readFileSync(path.join(dirOf(id), 'index.kv')), key()).toString('utf8')); }
  catch { return { files: {} }; }
}
function writeIndex(id, idx) {
  fs.mkdirSync(dirOf(id), { recursive: true });
  const f = path.join(dirOf(id), 'index.kv');
  fs.writeFileSync(f + '.tmp', sealBuffer(Buffer.from(JSON.stringify(idx)), key()));
  fs.renameSync(f + '.tmp', f);
}

// Los mods que se guardan bajo llave: todos los .jar de mods/ (también en subcarpetas) menos los públicos de Kopi
function plainMods(gameDir) {
  const out = [];
  const walk = (rel) => {
    for (const e of (() => { try { return fs.readdirSync(path.join(gameDir, rel), { withFileTypes: true }); } catch { return []; } })()) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && /\.jar$/i.test(e.name) && !PUBLIC.test(e.name)) out.push(r);
    }
  };
  walk('mods');
  return out;
}

/** Descifra los mods guardados en mods/. → cuántos se abrieron */
async function open(id, gameDir) {
  if (!base) return 0;
  key(); // antes de nada (si la llave es nueva, se vacía lo guardado con la anterior)
  const idx = readIndex(id);
  // marca de «abierto»: al cerrar, un mod que ya no esté en mods/ es que el studio lo quitó
  fs.mkdirSync(dirOf(id), { recursive: true });
  fs.writeFileSync(path.join(dirOf(id), 'open'), String(Date.now()));
  let n = 0;
  for (const [rel, f] of Object.entries(idx.files || {})) {
    const dst = path.join(gameDir, rel);
    try {
      const st = fs.statSync(dst);
      if (st.size === f.size) continue; // ya estaba abierto (p. ej. el juego se cerró de golpe)
    } catch { /* no está: se abre */ }
    try {
      await openFile(path.join(dirOf(id), f.blob), dst, key());
      const t = new Date(f.mtimeMs);
      fs.utimesSync(dst, t, t);
      n++;
    } catch (e) {
      log.warn(`[mods bajo llave] No se pudo abrir ${rel}:`, e.message); // la sincronización lo descargará otra vez
    }
  }
  return n;
}

/** Cifra lo que hay en mods/ (solo lo nuevo o cambiado) y lo borra de mods/. → { sealed, removed, busy } */
async function seal(id, gameDir) {
  if (!base) return { sealed: 0, removed: 0, busy: 0 };
  key(); // antes de nada (si la llave es nueva, se vacía lo guardado con la anterior)
  const idx = readIndex(id);
  const files = idx.files || {};
  const now = plainMods(gameDir);
  if (!now.length && !Object.keys(files).length) return { sealed: 0, removed: 0, busy: 0 };
  fs.mkdirSync(dirOf(id), { recursive: true });
  const wasOpen = fs.existsSync(path.join(dirOf(id), 'open'));
  const next = {};
  let sealed = 0, removed = 0, busy = 0;
  // Sin abrir (al arrancar el launcher, o la primera vez): lo guardado que no está en mods/ sigue guardado
  if (!wasOpen) for (const [rel, f] of Object.entries(files)) if (!now.includes(rel)) next[rel] = f;
  for (const rel of now) {
    const src = path.join(gameDir, rel);
    let st;
    try { st = fs.statSync(src); } catch { continue; }
    const prev = files[rel];
    if (prev && prev.size === st.size && Math.abs(prev.mtimeMs - st.mtimeMs) < 2 && fs.existsSync(path.join(dirOf(id), prev.blob))) {
      next[rel] = prev; // igual que lo guardado: no hace falta cifrarlo otra vez
    } else {
      const blob = crypto.randomBytes(16).toString('hex') + '.kv';
      try {
        await sealFile(src, path.join(dirOf(id), blob), key());
        next[rel] = { blob, size: st.size, mtimeMs: st.mtimeMs };
        sealed++;
      } catch (e) {
        log.warn(`[mods bajo llave] No se pudo guardar ${rel}:`, e.message);
        continue; // se queda sin cifrar hasta la próxima vez
      }
    }
  }
  writeIndex(id, { files: next });
  // los cifrados que ya no se usan (el studio quitó ese mod o se cifró una versión nueva)
  const used = new Set(Object.values(next).map(f => f.blob));
  for (const b of safeList(dirOf(id))) if (b.endsWith('.kv') && b !== 'index.kv' && !used.has(b)) { try { fs.unlinkSync(path.join(dirOf(id), b)); } catch { /* nada */ } }
  // y fuera de mods/ los que ya están a salvo
  for (const rel of now) {
    if (!next[rel]) continue;
    try { fs.unlinkSync(path.join(gameDir, rel)); removed++; } catch { busy++; } // en uso (el juego sigue abierto): la próxima vez
  }
  if (!busy) { try { fs.unlinkSync(path.join(dirOf(id), 'open')); } catch { /* nada */ } }
  if (sealed || removed) log.info(`[mods bajo llave] ${id}: ${sealed} cifrado(s), ${removed} fuera de mods/`);
  return { sealed, removed, busy };
}

/** Al abrir el launcher: cierra todo lo que se quedó abierto (y guarda los mods de antes de esta versión) */
async function sealAll(entries) {
  for (const { id, gameDir } of entries) {
    try { await seal(id, gameDir); } catch (e) { log.warn(`[mods bajo llave] ${id}:`, e.message); }
  }
}

/** Borra lo guardado de una instancia (al borrar sus archivos o salir de ella) */
function drop(id) { if (base) { try { fs.rmSync(dirOf(id), { recursive: true, force: true }); } catch { /* nada */ } } }

module.exports = { init, setProtector, open, seal, sealAll, drop, plainMods, _sealBuffer: sealBuffer, _openBuffer: openBuffer };
