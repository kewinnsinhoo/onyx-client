// Forge y NeoForge: elegir versión, leer su instalador y ejecutar sus "procesadores".
// Hace lo mismo que el instalador oficial (modo cliente), sin ventanas.
//  - Forge 1.6 → 1.12.2: instalador antiguo (install_profile.json con "versionInfo").
//  - Forge 1.13+ y NeoForge: instalador moderno (version.json + procesadores que parchean Minecraft).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { fetchRetry, downloadAll, sha1File } = require('./download');
const { readEntries, entryData } = require('./zip');

const FORGE_MAVEN = 'https://maven.minecraftforge.net/';
const NEO_MAVEN = 'https://maven.neoforged.net/releases/';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const NEO_API = 'https://maven.neoforged.net/api/maven/versions/releases/';

const isForgeLike = (type) => type === 'forge' || type === 'neoforge';

// "g:a:v[:c][@ext]" -> ruta maven (copia local para no depender de versions.js)
function mavenPath(name) {
  let ext = 'jar';
  let n = name;
  const at = n.indexOf('@');
  if (at >= 0) { ext = n.slice(at + 1); n = n.slice(0, at); }
  const [group, artifact, version, classifier] = n.split(':');
  return [...group.split('.'), artifact, version, `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`].join('/');
}

// Compara versiones tipo 47.3.10 / 21.1.77-beta (números primero, "beta" detrás de la estable)
function cmpVersion(a, b) {
  const pa = String(a).split(/[.\-+]/), pb = String(b).split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i];
    if (x === undefined) return y && /^\d+$/.test(y) ? -1 : 1;
    if (y === undefined) return /^\d+$/.test(x) ? 1 : -1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { const d = Number(x) - Number(y); if (d) return d; }
    else if (nx !== ny) return nx ? 1 : -1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// Prefijo de versión de NeoForge para una versión de Minecraft:
// 1.21.1 → "21.1."  ·  1.21 → "21.0."  ·  26.1 → "26.1.0."  ·  26.1.2 → "26.1.2."
function neoPrefix(mc) {
  const p = String(mc).split('.');
  if (p[0] === '1') return `${p[1]}.${p[2] || 0}.`;
  return `${p[0]}.${p[1] || 0}.${p[2] || 0}.`;
}

const isStable = (v) => !/(alpha|beta|rc|pre|snapshot)/i.test(v);

// Elige la versión de NeoForge. Devuelve { artifact, version } (artifact = 'neoforge' o 'forge' en 1.20.1)
function pickNeoForge(mc, wanted, available) {
  const legacy = mc === '1.20.1';
  let list;
  if (legacy) list = available.filter(v => v.startsWith('1.20.1-')).map(v => v.slice('1.20.1-'.length));
  else list = available.filter(v => v.startsWith(neoPrefix(mc)));
  if (wanted && wanted !== 'latest' && wanted !== 'recommended') {
    const w = legacy ? wanted.replace(/^1\.20\.1-/, '') : wanted;
    return { artifact: legacy ? 'forge' : 'neoforge', version: legacy ? `1.20.1-${w}` : w };
  }
  if (!list.length) throw new Error(`NeoForge no tiene versiones para Minecraft ${mc}`);
  list.sort(cmpVersion);
  const stable = list.filter(isStable);
  const v = (stable.length ? stable : list)[(stable.length ? stable : list).length - 1];
  return { artifact: legacy ? 'forge' : 'neoforge', version: legacy ? `1.20.1-${v}` : v };
}

// Elige la versión de Forge (nombre completo del maven, p. ej. "1.20.1-47.3.0" o "1.7.10-10.13.4.1614-1.7.10")
function pickForge(mc, wanted, promos, mavenVersions) {
  const forMc = (mavenVersions || []).filter(v => v.startsWith(mc + '-'));
  const full = (fv) => {
    if (fv.startsWith(mc + '-')) fv = fv.slice(mc.length + 1);
    const exact = forMc.find(v => v === `${mc}-${fv}`) || forMc.find(v => v.startsWith(`${mc}-${fv}-`));
    return exact || `${mc}-${fv}`;
  };
  if (wanted && wanted !== 'latest' && wanted !== 'recommended') return full(wanted);
  const p = (promos && promos.promos) || {};
  const promo = (wanted === 'recommended' ? (p[`${mc}-recommended`] || p[`${mc}-latest`]) : (p[`${mc}-latest`] || p[`${mc}-recommended`]));
  if (promo) return full(promo);
  if (!forMc.length) throw new Error(`Forge no tiene versiones para Minecraft ${mc}`);
  return forMc.sort((a, b) => cmpVersion(a.slice(mc.length + 1), b.slice(mc.length + 1)))[forMc.length - 1];
}

function installerInfo(type, resolved) {
  if (type === 'forge') {
    const v = resolved;
    return { url: `${FORGE_MAVEN}net/minecraftforge/forge/${v}/forge-${v}-installer.jar`, file: `forge-${v}-installer.jar` };
  }
  const { artifact, version } = resolved;
  return {
    url: `${NEO_MAVEN}net/neoforged/${artifact}/${version}/${artifact}-${version}-installer.jar`,
    file: `neoforge-${artifact}-${version}-installer.jar`
  };
}

async function resolveVersion(type, mc, wanted) {
  if (type === 'forge') {
    let promos = null, versions = [];
    try { promos = await (await fetchRetry(FORGE_PROMOS)).json(); } catch { /* sin promociones */ }
    try {
      const xml = await (await fetchRetry(`${FORGE_MAVEN}net/minecraftforge/forge/maven-metadata.xml`)).text();
      versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
    } catch { /* se usará el nombre tal cual */ }
    return pickForge(mc, wanted, promos, versions);
  }
  const artifact = mc === '1.20.1' ? 'forge' : 'neoforge';
  let available = [];
  if (!wanted || wanted === 'latest' || wanted === 'recommended') {
    const data = await (await fetchRetry(`${NEO_API}net/neoforged/${artifact}`)).json();
    available = data.versions || [];
  }
  return pickNeoForge(mc, wanted, available);
}

// ---------- lectura del instalador ----------
function openJar(file) {
  const buf = fs.readFileSync(file);
  const entries = readEntries(buf);
  const byName = new Map(entries.map(e => [e.name, e]));
  return {
    names: entries.map(e => e.name),
    has: (n) => byName.has(n.replace(/^\//, '')),
    read: (n) => { const e = byName.get(n.replace(/^\//, '')); if (!e) throw new Error(`El instalador no contiene ${n}`); return entryData(buf, e); },
    entries, buf
  };
}

// Corrige direcciones antiguas de los JSON de Forge
function fixUrl(u) {
  if (!u) return u;
  return u.replace(/^http:\/\//, 'https://')
    .replace('https://files.minecraftforge.net/maven/', FORGE_MAVEN)
    .replace(/^https:\/\/maven\.minecraftforge\.net\/?$/, FORGE_MAVEN);
}

// Instala el perfil (JSON de versión) del instalador. Devuelve el id de versión.
function installFromJar(root, mc, installerFile) {
  const jar = openJar(installerFile);
  const profile = JSON.parse(jar.read('install_profile.json').toString('utf8'));
  const libDir = path.join(root, 'libraries');

  let vjson;
  if (profile.install && profile.versionInfo) {
    // Instalador antiguo (Forge 1.6 → 1.12.2)
    vjson = profile.versionInfo;
    const dest = path.join(libDir, mavenPath(profile.install.path));
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, jar.read(profile.install.filePath));
    }
    for (const lib of vjson.libraries || []) {
      if (lib.url) lib.url = fixUrl(lib.url);
      // El jar de Forge viene dentro del instalador: no hay que descargarlo
      if (lib.name === profile.install.path) { delete lib.url; lib.onyxLocal = true; }
    }
  } else {
    // Instalador moderno (Forge 1.13+ / NeoForge)
    vjson = JSON.parse(jar.read(profile.json || 'version.json').toString('utf8'));
    // Archivos que trae el propio instalador en maven/
    for (const e of jar.entries) {
      if (!e.name.startsWith('maven/') || e.name.endsWith('/')) continue;
      const out = path.resolve(libDir, e.name.slice('maven/'.length));
      if (!out.startsWith(path.resolve(libDir) + path.sep)) continue;
      if (fs.existsSync(out)) continue;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, entryData(jar.buf, e));
    }
  }
  if (!vjson.inheritsFrom) { vjson.inheritsFrom = mc; vjson.jar = vjson.jar || mc; }
  for (const lib of vjson.libraries || []) {
    const a = lib.downloads && lib.downloads.artifact;
    if (a && a.url) a.url = fixUrl(a.url);
  }
  vjson.onyxCopyJar = true; // el jar de Minecraft va con el nombre de esta versión (lo exige Forge 1.17+)

  const id = vjson.id;
  const dir = path.join(root, 'versions', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(vjson));
  if (Array.isArray(profile.processors) && profile.processors.length) {
    profile.onyxInstaller = installerFile;
    fs.writeFileSync(path.join(dir, 'install_profile.json'), JSON.stringify(profile));
  }
  return id;
}

// Recordar qué versión se instaló para cada combinación (sirve sin internet)
function mapFile(root) { return path.join(root, 'versions', 'onyx-loaders.json'); }
function readMap(root) { try { return JSON.parse(fs.readFileSync(mapFile(root), 'utf8')); } catch { return {}; } }
function writeMap(root, key, id) {
  const m = readMap(root); m[key] = id;
  fs.mkdirSync(path.dirname(mapFile(root)), { recursive: true });
  fs.writeFileSync(mapFile(root), JSON.stringify(m, null, 2));
}

async function ensureProfile(root, mc, loader) {
  const type = loader.type;
  const wanted = loader.version || 'latest';
  const key = `${type}:${mc}:${wanted}`;
  const fixed = wanted !== 'latest' && wanted !== 'recommended';
  const known = readMap(root)[key];
  if (fixed && known && fs.existsSync(path.join(root, 'versions', known, `${known}.json`))) return known; // versión exacta ya instalada
  let resolved;
  try { resolved = await resolveVersion(type, mc, wanted); }
  catch (e) {
    const id = readMap(root)[key];
    if (id && fs.existsSync(path.join(root, 'versions', id, `${id}.json`))) return id; // sin internet: usar lo ya instalado
    throw e;
  }
  const { url, file } = installerInfo(type, resolved);
  const installer = path.join(root, 'cache', 'installers', file);
  if (!fs.existsSync(installer)) {
    let sha1 = null;
    try { sha1 = (await (await fetchRetry(url + '.sha1')).text()).trim().slice(0, 40); } catch { /* opcional */ }
    try { await downloadAll([{ url, dest: installer, sha1: /^[0-9a-f]{40}$/i.test(sha1 || '') ? sha1 : undefined }], { concurrency: 1 }); }
    catch (e) {
      const name = type === 'forge' ? 'Forge' : 'NeoForge';
      throw new Error(`No se pudo descargar ${name} ${typeof resolved === 'string' ? resolved : resolved.version} para Minecraft ${mc}. ¿Existe esa versión? (${e.message})`);
    }
  }
  const id = installFromJar(root, mc, installer);
  writeMap(root, key, id);
  return id;
}

// ---------- procesadores ----------
function profileFile(root, id) { return path.join(root, 'versions', id, 'install_profile.json'); }
function doneFile(root, id) { return path.join(root, 'versions', id, '.onyx-processed'); }

// Librerías que necesitan los procesadores (para descargarlas antes)
function processorLibraries(root, id) {
  const f = profileFile(root, id);
  if (!fs.existsSync(f) || fs.existsSync(doneFile(root, id))) return [];
  const profile = JSON.parse(fs.readFileSync(f, 'utf8'));
  const out = [];
  for (const lib of profile.libraries || []) {
    const a = lib.downloads && lib.downloads.artifact;
    if (!a) continue;
    const dest = path.join(root, 'libraries', a.path || mavenPath(lib.name));
    if (a.url) out.push({ url: fixUrl(a.url), dest, sha1: a.sha1, size: a.size });
  }
  return out;
}

function readManifestMain(jarFile) {
  const jar = openJar(jarFile);
  const mf = jar.read('META-INF/MANIFEST.MF').toString('utf8').replace(/\r?\n /g, '');
  const m = mf.match(/^Main-Class:\s*(.+)$/m);
  if (!m) throw new Error(`${path.basename(jarFile)} no tiene Main-Class`);
  return m[1].trim();
}

// Sustituye {CLAVE} y [maven:coords] (función pura, probada en test/)
function resolveArg(arg, data, libDir) {
  if (/^\[.+\]$/.test(arg)) return path.join(libDir, mavenPath(arg.slice(1, -1)));
  return arg.replace(/\{([A-Z0-9_]+)\}/g, (m, k) => (data[k] !== undefined ? data[k] : m));
}

function buildData(profile, ctx) {
  const libDir = path.join(ctx.root, 'libraries');
  const data = {
    SIDE: 'client',
    MINECRAFT_JAR: ctx.minecraftJar,
    MINECRAFT_VERSION: ctx.mc,
    ROOT: ctx.root,
    INSTALLER: ctx.installer,
    LIBRARY_DIR: libDir
  };
  for (const [k, v] of Object.entries(profile.data || {})) {
    let val = v && typeof v === 'object' ? v.client : v;
    if (val == null) continue;
    val = String(val);
    if (/^\[.+\]$/.test(val)) data[k] = path.join(libDir, mavenPath(val.slice(1, -1)));
    else if (/^'.*'$/.test(val)) data[k] = val.slice(1, -1);
    else if (val.startsWith('/') && ctx.extract) data[k] = ctx.extract(val);
    else data[k] = val;
  }
  return data;
}

function runJava(java, args, cwd, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(java, args, { cwd });
    let tail = '';
    const take = (d) => { const s = d.toString(); tail = (tail + s).slice(-4000); onLog && onLog(s); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`El instalador del loader falló (código ${code}).\n${tail.trim().split('\n').slice(-6).join('\n')}`))));
  });
}

async function outputsOk(outputs, data, libDir) {
  const list = Object.entries(outputs || {});
  if (!list.length) return false;
  for (const [k, v] of list) {
    const file = resolveArg(k, data, libDir);
    const want = resolveArg(v, data, libDir).replace(/^'|'$/g, '');
    if (!fs.existsSync(file)) return false;
    if (/^[0-9a-f]{40}$/i.test(want) && (await sha1File(file)) !== want.toLowerCase()) return false;
  }
  return true;
}

// Ejecuta los procesadores del instalador moderno (solo la primera vez)
async function runProcessors(root, id, { mc, java, minecraftJar, progress, onLog }) {
  const f = profileFile(root, id);
  if (!fs.existsSync(f) || fs.existsSync(doneFile(root, id))) return false;
  const profile = JSON.parse(fs.readFileSync(f, 'utf8'));
  const installer = profile.onyxInstaller;
  if (!installer || !fs.existsSync(installer)) throw new Error('Falta el instalador del loader: vuelve a intentarlo.');
  const libDir = path.join(root, 'libraries');
  const tmp = path.join(root, 'cache', 'loader-data', id);
  const jar = openJar(installer);
  const data = buildData(profile, {
    root, mc, minecraftJar, installer,
    extract: (p) => {
      const out = path.join(tmp, p.replace(/^\//, ''));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, jar.read(p));
      return out;
    }
  });

  const procs = (profile.processors || []).filter(p => !p.sides || p.sides.includes('client'));
  let n = 0;
  for (const p of procs) {
    n++;
    progress && progress({ stage: 'loader', done: n - 1, total: procs.length });
    if (await outputsOk(p.outputs, data, libDir)) continue;
    const jarFile = path.join(libDir, mavenPath(p.jar));
    const cp = [jarFile, ...(p.classpath || []).map(c => path.join(libDir, mavenPath(c)))];
    const main = readManifestMain(jarFile);
    const args = (p.args || []).map(a => resolveArg(a, data, libDir));
    await runJava(java, ['-cp', cp.join(path.delimiter), main, ...args], root, onLog);
    if (p.outputs && !(await outputsOk(p.outputs, data, libDir))) {
      throw new Error('El loader se instaló, pero un archivo no coincide. Vuelve a intentarlo.');
    }
  }
  progress && progress({ stage: 'loader', done: procs.length, total: procs.length });
  fs.writeFileSync(doneFile(root, id), new Date().toISOString());
  fs.rmSync(tmp, { recursive: true, force: true });
  return true;
}

// Copia el jar de Minecraft con el nombre de la versión del loader (como el launcher oficial)
function copyClientJar(root, version, vanillaJar) {
  const dest = path.join(root, 'versions', version.id, `${version.id}.jar`);
  let same = false;
  try { same = fs.statSync(dest).size === fs.statSync(vanillaJar).size; } catch { /* no existe */ }
  if (!same) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(vanillaJar, dest); }
  return dest;
}

module.exports = {
  isForgeLike, ensureProfile, processorLibraries, runProcessors, copyClientJar,
  // para pruebas
  cmpVersion, neoPrefix, pickNeoForge, pickForge, installFromJar, buildData, resolveArg, mavenPath, fixUrl, readManifestMain
};
