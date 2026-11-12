// Versiones de Minecraft: manifiesto de Mojang, herencia (Fabric/Quilt), reglas, librerías y assets.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchJson } = require('./download');
const Forge = require('./forge');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const LIBRARIES_URL = 'https://libraries.minecraft.net/';
const RESOURCES_URL = 'https://resources.download.minecraft.net/';
// Servidores de reserva para librerías antiguas de loaders (Forge 1.7/1.12 usa varias de Maven Central)
const MIRRORS = [LIBRARIES_URL, 'https://maven.minecraftforge.net/', 'https://maven.neoforged.net/releases/', 'https://repo1.maven.org/maven2/'];

function osName(platform = process.platform) {
  return platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux';
}
function osArch(arch = process.arch) {
  return arch === 'ia32' ? 'x86' : arch;
}

// Evalúa las reglas "rules" de Mojang.
function ruleAllows(rules, features = {}, env = {}) {
  if (!rules || !rules.length) return true;
  const name = env.os || osName();
  const arch = env.arch || osArch();
  const release = env.release || os.release();
  let allow = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== name) match = false;
      if (r.os.arch && r.os.arch !== arch) match = false;
      if (r.os.version) { try { if (!new RegExp(r.os.version).test(release)) match = false; } catch { match = false; } }
    }
    if (r.features) {
      for (const [k, v] of Object.entries(r.features)) if (!!features[k] !== v) match = false;
    }
    if (match) allow = r.action === 'allow';
  }
  return allow;
}

// "grupo:artefacto:versión[:clasificador][@ext]" -> ruta maven
function mavenPath(name) {
  let ext = 'jar';
  let n = name;
  const at = n.indexOf('@');
  if (at >= 0) { ext = n.slice(at + 1); n = n.slice(0, at); }
  const [group, artifact, version, classifier] = n.split(':');
  const file = `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`;
  return [...group.split('.'), artifact, version, file].join('/');
}

function libKey(name) {
  const p = name.split('@')[0].split(':');
  return p.length >= 4 ? `${p[0]}:${p[1]}:${p[3]}` : `${p[0]}:${p[1]}`;
}

let manifestCache = null;
async function getManifest() {
  if (manifestCache && Date.now() - manifestCache.t < 10 * 60e3) return manifestCache.data;
  const data = await fetchJson(MANIFEST_URL);
  manifestCache = { t: Date.now(), data };
  return data;
}

function versionJsonPath(root, id) {
  return path.join(root, 'versions', id, `${id}.json`);
}

// Descarga (si hace falta) el JSON de una versión vanilla.
async function ensureVanillaJson(root, id) {
  const file = versionJsonPath(root, id);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const manifest = await getManifest();
  const entry = manifest.versions.find(v => v.id === id);
  if (!entry) throw new Error(`La versión ${id} de Minecraft no existe`);
  const json = await fetchJson(entry.url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

// Instala el perfil de un loader (Fabric/Quilt/Forge/NeoForge) y devuelve el id de versión resultante.
async function ensureLoaderProfile(root, mc, loader) {
  const type = (loader && loader.type) || 'vanilla';
  if (type === 'vanilla') { await ensureVanillaJson(root, mc); return mc; }
  if (Forge.isForgeLike(type)) {
    await ensureVanillaJson(root, mc);
    return Forge.ensureProfile(root, mc, loader);
  }

  const metas = {
    fabric: 'https://meta.fabricmc.net/v2/versions/loader',
    quilt: 'https://meta.quiltmc.org/v3/versions/loader'
  };
  const base = metas[type];
  if (!base) throw new Error(`El loader "${type}" no existe (usa vanilla, fabric, quilt, forge o neoforge)`);

  let lv = loader.version;
  if (!lv || lv === 'latest') {
    const list = await fetchJson(`${base}/${encodeURIComponent(mc)}`);
    if (!list.length) throw new Error(`${type} no tiene versiones para Minecraft ${mc}`);
    const stable = list.find(x => x.loader && x.loader.stable !== false) || list[0];
    lv = stable.loader.version;
  }
  const id = `${type}-loader-${lv}-${mc}`;
  const file = versionJsonPath(root, id);
  if (!fs.existsSync(file)) {
    const profile = await fetchJson(`${base}/${encodeURIComponent(mc)}/${encodeURIComponent(lv)}/profile/json`);
    profile.id = id;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(profile));
  }
  await ensureVanillaJson(root, mc);
  return id;
}

// Fusiona un JSON hijo con su padre (inheritsFrom).
function mergeVersion(parent, child) {
  const merged = { ...parent, ...child };
  // Las librerías del hijo (loader) reemplazan a las del padre con el mismo grupo:artefacto.
  const childKeys = new Set((child.libraries || []).filter(l => l.name).map(l => libKey(l.name)));
  merged.libraries = [
    ...(child.libraries || []),
    ...(parent.libraries || []).filter(l => !l.name || l.natives || !childKeys.has(libKey(l.name)))
  ];
  if (parent.arguments || child.arguments) {
    merged.arguments = {
      game: [...((parent.arguments && parent.arguments.game) || []), ...((child.arguments && child.arguments.game) || [])],
      jvm: [...((parent.arguments && parent.arguments.jvm) || []), ...((child.arguments && child.arguments.jvm) || [])]
    };
  }
  merged.minecraftArguments = child.minecraftArguments || parent.minecraftArguments;
  merged.mainClass = child.mainClass || parent.mainClass;
  merged.assetIndex = child.assetIndex || parent.assetIndex;
  merged.assets = child.assets || parent.assets;
  merged.downloads = child.downloads || parent.downloads;
  merged.javaVersion = child.javaVersion || parent.javaVersion;
  merged.logging = child.logging || parent.logging;
  merged.jarId = child.jar || parent.jarId || parent.jar || parent.id;
  merged.id = child.id;
  merged.vanillaId = parent.vanillaId || parent.id;
  delete merged.inheritsFrom;
  return merged;
}

function loadResolved(root, id, depth = 0) {
  if (depth > 5) throw new Error('Herencia de versiones demasiado profunda');
  const json = JSON.parse(fs.readFileSync(versionJsonPath(root, id), 'utf8'));
  if (!json.inheritsFrom) {
    json.jarId = json.jar || json.id;
    json.vanillaId = json.id;
    return json;
  }
  return mergeVersion(loadResolved(root, json.inheritsFrom, depth + 1), json);
}

// Lista de librerías a descargar + classpath + natives a extraer.
function collectLibraries(root, version, env = {}) {
  const libDir = path.join(root, 'libraries');
  const name = env.os || osName();
  const downloads = [];
  const classpath = [];
  const natives = [];
  for (const lib of version.libraries || []) {
    if (!ruleAllows(lib.rules, {}, env)) continue;
    const art = lib.downloads && lib.downloads.artifact;
    if (art && art.url) {
      const rel = art.path || mavenPath(lib.name);
      const dest = path.join(libDir, rel);
      downloads.push({ url: art.url, dest, sha1: art.sha1, size: art.size });
      classpath.push(dest);
      if (/:natives-/.test(lib.name || '')) natives.push({ file: dest, exclude: ['META-INF/'] });
    } else if (art && lib.name) {
      // Sin URL: lo crea el instalador del loader (p. ej. el jar parcheado de Forge). Solo va al classpath.
      classpath.push(path.join(libDir, art.path || mavenPath(lib.name)));
    } else if (!lib.downloads && lib.name) {
      // Formato antiguo (JSON de Forge viejo): sin "downloads", solo nombre maven + url opcional
      const base = (lib.url || LIBRARIES_URL).replace(/\/?$/, '/');
      if (lib.natives) {
        const cls = lib.natives[name] && lib.natives[name].replace('${arch}', (env.arch || osArch()) === 'x86' ? '32' : '64');
        if (cls) {
          const rel = mavenPath(`${lib.name}:${cls}`);
          const dest = path.join(libDir, rel);
          downloads.push({ url: base + rel, urls: MIRRORS.map(m => m + rel), dest });
          natives.push({ file: dest, exclude: (lib.extract && lib.extract.exclude) || ['META-INF/'] });
        }
      } else {
        const rel = mavenPath(lib.name);
        const dest = path.join(libDir, rel);
        const sha1 = lib.sha1 || (Array.isArray(lib.checksums) && lib.checksums.length === 1 ? lib.checksums[0] : undefined);
        downloads.push({ url: base + rel, urls: MIRRORS.map(m => m + rel), dest, sha1, size: lib.size });
        classpath.push(dest);
      }
    }
    if (lib.natives && lib.natives[name]) {
      const cls = lib.natives[name].replace('${arch}', (env.arch || osArch()) === 'x86' ? '32' : '64');
      const c = lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[cls];
      if (c && c.url) {
        const dest = path.join(libDir, c.path || mavenPath(`${lib.name}:${cls}`));
        downloads.push({ url: c.url, dest, sha1: c.sha1, size: c.size });
        natives.push({ file: dest, exclude: (lib.extract && lib.extract.exclude) || ['META-INF/'] });
      }
    }
  }
  // Sin duplicados (dos descargas del mismo archivo a la vez se pisarían)
  const seen = new Set();
  const unique = downloads.filter(d => (seen.has(d.dest) ? false : seen.add(d.dest)));
  const seenN = new Set();
  return { downloads: unique, classpath: [...new Set(classpath)], natives: natives.filter(n => (seenN.has(n.file) ? false : seenN.add(n.file))) };
}

function clientJarPath(root, version) {
  return path.join(root, 'versions', version.jarId, `${version.jarId}.jar`);
}

// Asegura el índice de assets y devuelve las tareas de descarga de objetos.
async function collectAssets(root, version) {
  const ai = version.assetIndex;
  if (!ai) return { tasks: [], index: null };
  const idxFile = path.join(root, 'assets', 'indexes', `${ai.id}.json`);
  let index;
  if (fs.existsSync(idxFile)) {
    index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  } else {
    index = await fetchJson(ai.url);
    fs.mkdirSync(path.dirname(idxFile), { recursive: true });
    fs.writeFileSync(idxFile, JSON.stringify(index));
  }
  const tasks = [];
  for (const [, obj] of Object.entries(index.objects || {})) {
    const h = obj.hash;
    tasks.push({
      url: `${RESOURCES_URL}${h.slice(0, 2)}/${h}`,
      dest: path.join(root, 'assets', 'objects', h.slice(0, 2), h),
      sha1: h,
      size: obj.size
    });
  }
  return { tasks, index };
}

// Versiones antiguas (pre-1.7) necesitan los assets "virtuales" copiados con su nombre real.
function materializeLegacyAssets(root, version, index, gameDir) {
  if (!index || !(index.virtual || index.map_to_resources)) return null;
  const target = index.map_to_resources
    ? path.join(gameDir, 'resources')
    : path.join(root, 'assets', 'virtual', version.assetIndex.id);
  for (const [name, obj] of Object.entries(index.objects)) {
    const src = path.join(root, 'assets', 'objects', obj.hash.slice(0, 2), obj.hash);
    const dst = path.join(target, name);
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
  return target;
}

module.exports = {
  osName, osArch, ruleAllows, mavenPath, libKey,
  getManifest, ensureVanillaJson, ensureLoaderProfile, mergeVersion, loadResolved,
  collectLibraries, clientJarPath, collectAssets, materializeLegacyAssets, versionJsonPath
};
