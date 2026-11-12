// Lector ZIP mínimo (solo extraer), suficiente para las "natives" de Minecraft.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readEntries(buf) {
  // Buscar "End of central directory"
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP: directorio central dañado');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function entryData(buf, e) {
  const lo = e.localOff;
  if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('ZIP: cabecera local dañada');
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return zlib.inflateRawSync(raw);
  throw new Error('ZIP: compresión no soportada ' + e.method);
}

// Extrae un zip/jar a destDir. exclude = prefijos a ignorar (p.ej. META-INF/)
// filter(name) opcional para quedarse con algunos archivos.
function extract(zipFile, destDir, { exclude = [], filter, strip } = {}) {
  const buf = fs.readFileSync(zipFile);
  const root = path.resolve(destDir);
  for (const e of readEntries(buf)) {
    if (e.name.endsWith('/')) continue;
    if (exclude.some(p => e.name.startsWith(p))) continue;
    if (filter && !filter(e.name)) continue;
    let name = e.name;
    if (strip) { if (!name.startsWith(strip)) continue; name = name.slice(strip.length); if (!name) continue; }
    const out = path.resolve(root, name);
    if (!out.startsWith(root + path.sep)) continue; // protección contra rutas maliciosas
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, entryData(buf, e));
  }
}

// Lista los nombres de un zip
function list(zipFile) { return readEntries(fs.readFileSync(zipFile)).map(e => e.name); }

module.exports = { extract, readEntries, list };
