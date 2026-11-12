// Descarga automática del Java oficial que usa Minecraft (runtimes de Mojang).
const fs = require('fs');
const path = require('path');
const { fetchJson, downloadAll } = require('./download');

const RUNTIMES_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

function platformKey(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : arch === 'ia32' ? 'windows-x86' : 'windows-x64';
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return arch === 'ia32' ? 'linux-i386' : 'linux';
}

function javaBinary(dir, platform = process.platform) {
  if (platform === 'win32') return path.join(dir, 'bin', 'javaw.exe');
  if (platform === 'darwin') return path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(dir, 'bin', 'java');
}

async function ensureJava(root, component = 'jre-legacy', { concurrency = 8, onProgress } = {}) {
  const dir = path.join(root, 'runtime', component);
  const marker = path.join(dir, '.onyx-ok');
  const bin = javaBinary(dir);
  if (fs.existsSync(marker) && fs.existsSync(bin)) return bin;

  const all = await fetchJson(RUNTIMES_URL);
  const plat = all[platformKey()] || {};
  let list = plat[component];
  if (!list || !list.length) {
    // Algunas plataformas no tienen todos los componentes: usar el más nuevo disponible.
    const fallback = ['java-runtime-delta', 'java-runtime-gamma', 'java-runtime-beta', 'java-runtime-alpha', 'jre-legacy']
      .find(c => plat[c] && plat[c].length);
    if (!fallback) throw new Error(`No hay Java oficial para ${platformKey()}. Elige una ruta de Java en Ajustes > Juego.`);
    list = plat[fallback];
  }
  const manifest = await fetchJson(list[0].manifest.url);
  const tasks = [];
  const links = [];
  for (const [rel, f] of Object.entries(manifest.files)) {
    const target = path.join(dir, rel);
    if (f.type === 'directory') fs.mkdirSync(target, { recursive: true });
    else if (f.type === 'file' && f.downloads && f.downloads.raw) {
      tasks.push({ url: f.downloads.raw.url, dest: target, sha1: f.downloads.raw.sha1, size: f.downloads.raw.size, executable: !!f.executable });
    } else if (f.type === 'link') links.push({ target, to: f.target });
  }
  await downloadAll(tasks, { concurrency, onProgress });
  if (process.platform !== 'win32') {
    for (const l of links) {
      try { fs.mkdirSync(path.dirname(l.target), { recursive: true }); if (!fs.existsSync(l.target)) fs.symlinkSync(l.to, l.target); } catch { /* nada */ }
    }
    try { fs.chmodSync(bin, 0o755); } catch { /* nada */ }
  }
  fs.writeFileSync(marker, list[0].version ? list[0].version.name : 'ok');
  return bin;
}

module.exports = { ensureJava, platformKey, javaBinary };
