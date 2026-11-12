// Prepara (descarga todo) y lanza Minecraft.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const V = require('./versions');
const { downloadAll, fetchRetry } = require('./download');
const { ensureJava } = require('./java');
const { extract } = require('./zip');
const Forge = require('./forge');

const LAUNCHER_NAME = 'onyx-client';

function substitute(str, vars) {
  return str.replace(/\$\{([^}]+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

function expandArgs(list, vars, features, env) {
  const out = [];
  for (const a of list || []) {
    if (typeof a === 'string') { out.push(substitute(a, vars)); continue; }
    if (!V.ruleAllows(a.rules, features, env)) continue;
    const vals = Array.isArray(a.value) ? a.value : [a.value];
    for (const v of vals) out.push(substitute(v, vars));
  }
  return out;
}

// Construye la línea de comandos completa (función pura, probada en test/).
function buildArguments(version, o, env = {}) {
  const platform = env.platform || process.platform;
  const features = {
    has_custom_resolution: !!(o.width && o.height),
    is_demo_user: false
  };
  const vars = {
    auth_player_name: o.username,
    version_name: version.id,
    game_directory: o.gameDir,
    assets_root: o.assetsDir,
    game_assets: o.gameAssets || o.assetsDir,
    assets_index_name: version.assetIndex ? version.assetIndex.id : (version.assets || 'legacy'),
    auth_uuid: o.uuid.replace(/-/g, ''),
    auth_access_token: o.accessToken || '0',
    auth_session: o.accessToken ? `token:${o.accessToken}:${o.uuid.replace(/-/g, '')}` : '0',
    auth_xuid: o.xuid || '0',
    clientid: o.clientId || '0',
    user_type: o.userType || 'msa',
    user_properties: '{}',
    version_type: o.versionType || 'Onyx Client',
    natives_directory: o.nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: o.launcherVersion || '1.0.0',
    classpath: o.classpath.join(o.separator || path.delimiter),
    classpath_separator: o.separator || path.delimiter,
    library_directory: o.librariesDir,
    resolution_width: o.width || '',
    resolution_height: o.height || ''
  };

  const jvm = [`-Xmx${o.memoryMb}M`, `-Xms${Math.min(o.memoryMb, 1024)}M`];
  if (o.extraJvm) jvm.push(...o.extraJvm.split(/\s+/).filter(Boolean));
  if (o.loggingArg) jvm.push(o.loggingArg);

  let game;
  if (version.arguments) {
    jvm.push(...expandArgs(version.arguments.jvm, vars, features, env));
    game = expandArgs(version.arguments.game, vars, features, env);
  } else {
    if (platform === 'darwin') jvm.push('-XstartOnFirstThread');
    if (platform === 'win32') jvm.push('-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump');
    jvm.push(`-Djava.library.path=${vars.natives_directory}`, '-cp', vars.classpath);
    game = substitute(version.minecraftArguments || '', vars).split(' ').filter(Boolean);
    if (features.has_custom_resolution) game.push('--width', String(o.width), '--height', String(o.height));
  }
  // Algunos perfiles no traen -cp en jvm: asegurarlo.
  if (!jvm.includes('-cp') && !jvm.includes('-classpath')) jvm.push('-cp', vars.classpath);

  if (o.fullscreen) game.push('--fullscreen');
  if (o.server && o.server.address) {
    const supportsQuickPlay = JSON.stringify(version.arguments || {}).includes('quickPlayMultiplayer');
    const port = o.server.port || 25565;
    if (supportsQuickPlay) game.push('--quickPlayMultiplayer', `${o.server.address}:${port}`);
    else game.push('--server', o.server.address, '--port', String(port));
  }
  return [...jvm, version.mainClass, ...game];
}

// Descarga todo lo necesario para una instancia. progress({stage, done, total})
// Java que puede pedir el studio desde el panel → componente de Mojang
const JAVA_COMPONENTS = { '8': 'jre-legacy', '17': 'java-runtime-gamma', '21': 'java-runtime-delta', '25': 'java-runtime-epsilon' };

async function prepare(root, { mc, loader, java: javaWanted }, { concurrency, progress, verify = false, javaPath = '', onLog }) {
  const step = (stage, done = 0, total = 1) => progress && progress({ stage, done, total });

  step('version');
  const versionId = await V.ensureLoaderProfile(root, mc, loader);
  const version = V.loadResolved(root, versionId);

  // Jar del cliente
  const jarTasks = [];
  const client = version.downloads && version.downloads.client;
  if (client) jarTasks.push({ url: client.url, dest: V.clientJarPath(root, version), sha1: client.sha1, size: client.size, verify: true });

  // Librerías (+ las que necesita el instalador de Forge/NeoForge la primera vez)
  const libs = V.collectLibraries(root, version);
  const extra = Forge.processorLibraries(root, versionId).filter(t => !libs.downloads.some(d => d.dest === t.dest));
  step('libraries', 0, libs.downloads.length + jarTasks.length + extra.length);
  await downloadAll([...jarTasks, ...libs.downloads.map(t => ({ ...t, verify })), ...extra], {
    concurrency, onProgress: (d, t) => step('libraries', d, t)
  });

  // Assets
  const { tasks: assetTasks, index } = await V.collectAssets(root, version);
  step('assets', 0, assetTasks.length);
  await downloadAll(assetTasks, { concurrency: concurrency * 2, onProgress: (d, t) => step('assets', d, t) });

  // Configuración de logs (log4j parcheado de Mojang)
  let loggingArg = null;
  const lc = version.logging && version.logging.client;
  if (lc && lc.file) {
    const dest = path.join(root, 'assets', 'log_configs', lc.file.id);
    await downloadAll([{ url: lc.file.url, dest, sha1: lc.file.sha1, size: lc.file.size }], { concurrency: 1 });
    loggingArg = lc.argument.replace('${path}', dest);
  }

  // Java
  step('java');
  let java = javaPath && fs.existsSync(javaPath) ? javaPath : null;
  if (!java) {
    const auto = (version.javaVersion && version.javaVersion.component) || 'jre-legacy';
    const forced = JAVA_COMPONENTS[String(javaWanted || '')];
    const opts = { concurrency, onProgress: (d, t) => step('java', d, t) };
    if (forced && forced !== auto) {
      try { java = await ensureJava(root, forced, opts); }
      catch (e) { if (onLog) onLog(`[Onyx] No se pudo preparar Java ${javaWanted} (${e.message}); se usa el automático.\n`); }
    }
    if (!java) java = await ensureJava(root, auto, opts);
  }

  // Forge / NeoForge: parchear Minecraft la primera vez y usar el jar con el nombre de la versión
  if (version.onyxCopyJar) {
    const vanillaJar = V.clientJarPath(root, version);
    await Forge.runProcessors(root, versionId, { mc, java, minecraftJar: vanillaJar, progress, onLog });
    Forge.copyClientJar(root, version, vanillaJar);
    version.jarId = version.id;
  }
  return { version, libs, index, loggingArg, java };
}

async function launch(root, opts) {
  const { instance, account, settings, progress, onLog, onExit, launcherVersion } = opts;
  const concurrency = settings.fastDownload ? 16 : 4;

  const prep = await prepare(root, { mc: instance.minecraft, loader: instance.loader, java: instance.java }, {
    concurrency, progress, javaPath: settings.javaPath, onLog
  });
  const { version, libs, index, loggingArg, java } = prep;

  // Carpeta de la instancia + natives
  const gameDir = path.join(root, 'instances', instance.id);
  fs.mkdirSync(gameDir, { recursive: true });
  const nativesDir = path.join(root, 'natives', version.id);
  fs.mkdirSync(nativesDir, { recursive: true });
  const nativeExt = /\.(dll|so|dylib|jnilib)$/i;
  for (const n of libs.natives) {
    try { extract(n.file, nativesDir, { exclude: n.exclude, filter: name => nativeExt.test(name) }); } catch (e) { /* algunas no tienen natives */ }
  }

  const gameAssets = V.materializeLegacyAssets(root, version, index, gameDir);

  const classpath = [...libs.classpath, V.clientJarPath(root, version)];

  const args = buildArguments(version, {
    username: account.name,
    uuid: account.uuid,
    accessToken: account.type === 'msa' ? account.accessToken : null,
    userType: account.type === 'msa' ? 'msa' : 'legacy',
    xuid: account.xuid,
    gameDir,
    assetsDir: path.join(root, 'assets'),
    gameAssets,
    nativesDir,
    librariesDir: path.join(root, 'libraries'),
    classpath,
    memoryMb: instance.memoryMb || settings.memoryMb || 4096,
    extraJvm: settings.jvmArgs,
    loggingArg,
    width: settings.windowWidth ? Number(settings.windowWidth) : null,
    height: settings.windowHeight ? Number(settings.windowHeight) : null,
    fullscreen: settings.fullscreen,
    server: instance.server && instance.server.autoJoin ? instance.server : null,
    launcherVersion
  });

  progress && progress({ stage: 'launching' });

  const logFile = path.join(gameDir, 'logs', 'onyx-launch.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logStream = fs.createWriteStream(logFile);
  const safeArgs = args.map(a => (account.accessToken && a === account.accessToken ? '••••••' : a));
  logStream.write(`> ${java} ${safeArgs.join(' ')}\n\n`);

  const child = spawn(java, args, { cwd: gameDir });
  const pipe = (data) => {
    const text = data.toString();
    logStream.write(text);
    onLog && onLog(text);
  };
  child.stdout.on('data', pipe);
  child.stderr.on('data', pipe);
  child.on('error', (e) => { pipe(`\n[Onyx] Error al iniciar Java: ${e.message}\n`); });
  child.on('close', (code) => { logStream.end(); onExit && onExit(code); });
  return child;
}

module.exports = { buildArguments, prepare, launch, substitute, expandArgs, fetchRetry };
