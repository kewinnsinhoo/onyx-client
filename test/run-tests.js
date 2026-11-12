// Pruebas de la lógica del launcher que no necesitan internet ni Electron.
// Ejecutar con:  npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const V = require('../src/main/game/versions');
const { buildArguments } = require('../src/main/game/launch');
const { extract, readEntries } = require('../src/main/game/zip');
const { platformKey, javaBinary } = require('../src/main/game/java');
const { offlineUuid } = require('../src/main/accounts');
const { validateSkin, pngSize } = require('../src/main/skins');
const data = require('../src/main/data');
const { CODE_RE } = require('../src/main/instances');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('Onyx Client — pruebas');

test('reglas de Mojang (os / features)', () => {
  const win = { os: 'windows', arch: 'x64', release: '10.0' };
  const mac = { os: 'osx', arch: 'arm64', release: '23.0' };
  assert.strictEqual(V.ruleAllows(undefined, {}, win), true);
  assert.strictEqual(V.ruleAllows([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }], {}, mac), false);
  assert.strictEqual(V.ruleAllows([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }], {}, win), true);
  assert.strictEqual(V.ruleAllows([{ action: 'allow', os: { name: 'windows' } }], {}, mac), false);
  assert.strictEqual(V.ruleAllows([{ action: 'allow', features: { has_custom_resolution: true } }], { has_custom_resolution: true }, win), true);
  assert.strictEqual(V.ruleAllows([{ action: 'allow', features: { is_demo_user: true } }], {}, win), false);
  assert.strictEqual(V.ruleAllows([{ action: 'allow', os: { arch: 'x86' } }], {}, win), false);
});

test('ruta maven', () => {
  assert.strictEqual(V.mavenPath('net.fabricmc:fabric-loader:0.16.5'), 'net/fabricmc/fabric-loader/0.16.5/fabric-loader-0.16.5.jar');
  assert.strictEqual(V.mavenPath('org.lwjgl:lwjgl:3.3.3:natives-windows'), 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar');
  assert.strictEqual(V.mavenPath('a.b:c:1@zip'), 'a/b/c/1/c-1.zip');
});

// Versión de ejemplo con el formato real de Mojang (recortado)
const vanilla = {
  id: '1.21.1', mainClass: 'net.minecraft.client.main.Main', type: 'release',
  assetIndex: { id: '17', url: 'https://x/17.json' }, javaVersion: { component: 'java-runtime-delta', majorVersion: 21 },
  downloads: { client: { url: 'https://x/client.jar', sha1: 'abc', size: 10 } },
  arguments: {
    game: ['--username', '${auth_player_name}', '--version', '${version_name}', '--gameDir', '${game_directory}', '--assetsDir', '${assets_root}',
      '--assetIndex', '${assets_index_name}', '--uuid', '${auth_uuid}', '--accessToken', '${auth_access_token}', '--userType', '${user_type}',
      { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' },
      { rules: [{ action: 'allow', features: { has_custom_resolution: true } }], value: ['--width', '${resolution_width}', '--height', '${resolution_height}'] },
      { rules: [{ action: 'allow', features: { is_quick_play_multiplayer: true } }], value: ['--quickPlayMultiplayer', '${quickPlayMultiplayer}'] }],
    jvm: [{ rules: [{ action: 'allow', os: { name: 'osx' } }], value: ['-XstartOnFirstThread'] },
      '-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
  },
  libraries: [
    { name: 'org.ow2.asm:asm:9.3', downloads: { artifact: { path: 'org/ow2/asm/asm/9.3/asm-9.3.jar', url: 'https://l/asm-9.3.jar', sha1: 'a', size: 1 } } },
    { name: 'org.lwjgl:lwjgl:3.3.3', downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar', url: 'https://l/lwjgl.jar', sha1: 'b', size: 1 } } },
    { name: 'org.lwjgl:lwjgl:3.3.3:natives-windows', downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar', url: 'https://l/nw.jar', sha1: 'c', size: 1 } }, rules: [{ action: 'allow', os: { name: 'windows' } }] },
    { name: 'org.lwjgl:lwjgl:3.3.3:natives-macos', downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-macos.jar', url: 'https://l/nm.jar', sha1: 'd', size: 1 } }, rules: [{ action: 'allow', os: { name: 'osx' } }] }
  ]
};
const fabric = {
  id: 'fabric-loader-0.16.5-1.21.1', inheritsFrom: '1.21.1', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  arguments: { game: [], jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '] },
  libraries: [
    { name: 'org.ow2.asm:asm:9.7.1', url: 'https://maven.fabricmc.net/', sha1: 'e', size: 1 },
    { name: 'net.fabricmc:fabric-loader:0.16.5', url: 'https://maven.fabricmc.net/' }
  ]
};

test('herencia Fabric -> vanilla', () => {
  const m = V.mergeVersion({ ...vanilla, jarId: '1.21.1', vanillaId: '1.21.1' }, fabric);
  assert.strictEqual(m.mainClass, fabric.mainClass);
  assert.strictEqual(m.jarId, '1.21.1');
  assert.strictEqual(m.assetIndex.id, '17');
  assert.strictEqual(m.javaVersion.majorVersion, 21);
  const asm = m.libraries.filter(l => l.name.startsWith('org.ow2.asm:asm:'));
  assert.deepStrictEqual(asm.map(l => l.name), ['org.ow2.asm:asm:9.7.1'], 'el ASM del loader reemplaza al de vanilla');
  assert.ok(m.arguments.jvm.includes('-DFabricMcEmu= net.minecraft.client.main.Main '));
  assert.ok(m.libraries.find(l => l.name === 'org.lwjgl:lwjgl:3.3.3:natives-windows'), 'no se pierden natives con el mismo artefacto');
});

test('herencia sin perder librerías duplicadas por SO (1.18)', () => {
  const parent = { id: 'p', libraries: [
    { name: 'org.lwjgl:lwjgl:3.2.1', rules: [{ action: 'allow', os: { name: 'osx' } }] },
    { name: 'org.lwjgl:lwjgl:3.2.2', rules: [{ action: 'disallow', os: { name: 'osx' } }] }] };
  const m = V.mergeVersion(parent, { id: 'c', libraries: [] });
  assert.strictEqual(m.libraries.length, 2);
});

test('librerías y classpath en Windows', () => {
  const m = V.mergeVersion({ ...vanilla, jarId: '1.21.1' }, fabric);
  const r = V.collectLibraries('/g', m, { os: 'windows', arch: 'x64', release: '10' });
  const names = r.downloads.map(d => path.basename(d.dest));
  assert.ok(names.includes('lwjgl-3.3.3-natives-windows.jar'));
  assert.ok(!names.includes('lwjgl-3.3.3-natives-macos.jar'));
  assert.ok(names.includes('fabric-loader-0.16.5.jar'));
  const fl = r.downloads.find(d => d.dest.endsWith('fabric-loader-0.16.5.jar'));
  assert.strictEqual(fl.url, 'https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.16.5/fabric-loader-0.16.5.jar');
  assert.strictEqual(r.natives.length, 1);
});

test('natives antiguas (1.8, clasificadores)', () => {
  const old = { id: '1.8.9', libraries: [{
    name: 'org.lwjgl.lwjgl:lwjgl-platform:2.9.4', natives: { linux: 'natives-linux', windows: 'natives-windows', osx: 'natives-osx' },
    extract: { exclude: ['META-INF/'] },
    downloads: { classifiers: { 'natives-windows': { path: 'org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-windows.jar', url: 'https://l/w.jar', sha1: 'x', size: 1 } } }
  }] };
  const r = V.collectLibraries('/g', old, { os: 'windows', arch: 'x64' });
  assert.strictEqual(r.natives.length, 1);
  assert.strictEqual(r.classpath.length, 0, 'las natives antiguas no van al classpath');
});

test('argumentos de lanzamiento (moderno, cuenta premium)', () => {
  const m = V.mergeVersion({ ...vanilla, jarId: '1.21.1' }, fabric);
  const args = buildArguments(m, {
    username: 'Kewinsinho', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', accessToken: 'TOKEN', userType: 'msa',
    gameDir: '/g/instances/x', assetsDir: '/g/assets', nativesDir: '/g/natives', librariesDir: '/g/libraries',
    classpath: ['/a.jar', '/b.jar'], separator: ';', memoryMb: 6144, width: 1280, height: 720,
    server: { address: 'play.onyx.gg', port: 25565 }
  }, { os: 'windows', platform: 'win32', arch: 'x64' });
  assert.strictEqual(args[0], '-Xmx6144M');
  const mi = args.indexOf(fabric.mainClass);
  assert.ok(mi > 0);
  assert.strictEqual(args[args.indexOf('-cp') + 1], '/a.jar;/b.jar');
  assert.strictEqual(args[args.indexOf('--username') + 1], 'Kewinsinho');
  assert.strictEqual(args[args.indexOf('--uuid') + 1], '069a79f444e94726a5befca90e38aaf5');
  assert.strictEqual(args[args.indexOf('--accessToken') + 1], 'TOKEN');
  assert.strictEqual(args[args.indexOf('--width') + 1], '1280');
  assert.ok(!args.includes('--demo'));
  assert.ok(!args.includes('-XstartOnFirstThread'));
  assert.strictEqual(args[args.indexOf('--quickPlayMultiplayer') + 1], 'play.onyx.gg:25565');
  assert.ok(!args.some(a => a.includes('${')), 'sin variables sin reemplazar: ' + args.filter(a => a.includes('${')).join(' '));
});

test('argumentos de lanzamiento (antiguo, offline, mac)', () => {
  const old = { id: '1.8.9', mainClass: 'net.minecraft.client.main.Main', assetIndex: { id: '1.8' },
    minecraftArguments: '--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --userType ${user_type}' };
  const args = buildArguments(old, {
    username: 'Steve', uuid: offlineUuid('Steve'), accessToken: null, userType: 'legacy',
    gameDir: '/g', assetsDir: '/a', nativesDir: '/n', librariesDir: '/l', classpath: ['/c.jar'], separator: ':', memoryMb: 2048,
    server: { address: 'mc.example.com' }
  }, { os: 'osx', platform: 'darwin', arch: 'x64' });
  assert.ok(args.includes('-XstartOnFirstThread'));
  assert.strictEqual(args[args.indexOf('--accessToken') + 1], '0');
  assert.strictEqual(args[args.indexOf('--userProperties') + 1], '{}');
  assert.strictEqual(args[args.indexOf('--server') + 1], 'mc.example.com');
  assert.strictEqual(args[args.indexOf('--port') + 1], '25565');
  assert.ok(!args.some(a => a.includes('${')));
});

test('UUID offline estándar', () => {
  assert.strictEqual(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f');
});

test('Java: plataformas y binario', () => {
  assert.strictEqual(platformKey('win32', 'x64'), 'windows-x64');
  assert.strictEqual(platformKey('darwin', 'arm64'), 'mac-os-arm64');
  assert.strictEqual(platformKey('linux', 'x64'), 'linux');
  assert.ok(javaBinary('/r', 'darwin').endsWith(path.join('jre.bundle', 'Contents', 'Home', 'bin', 'java')));
  assert.ok(javaBinary('/r', 'win32').endsWith('javaw.exe'));
});

test('extraer natives de un .jar (zip)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-'));
  const jar = path.join(dir, 'n.jar');
  fs.writeFileSync(jar, makeZip({ 'lwjgl.dll': Buffer.from('DLL-DATA'.repeat(50)), 'META-INF/MANIFEST.MF': Buffer.from('x'), 'sub/liblwjgl.so': Buffer.from('SO'), '../evil.dll': Buffer.from('no') }));
  assert.strictEqual(readEntries(fs.readFileSync(jar)).length, 4);
  const out = path.join(dir, 'out');
  extract(jar, out, { exclude: ['META-INF/'], filter: n => /\.(dll|so)$/.test(n) });
  assert.strictEqual(fs.readFileSync(path.join(out, 'lwjgl.dll'), 'utf8'), 'DLL-DATA'.repeat(50));
  assert.ok(fs.existsSync(path.join(out, 'sub', 'liblwjgl.so')));
  assert.ok(!fs.existsSync(path.join(out, 'META-INF')));
  assert.ok(!fs.existsSync(path.join(dir, 'evil.dll')), 'no escribe fuera de la carpeta');
});

test('validación de skins PNG', () => {
  const png = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'assets', 'default-skin.png'));
  assert.deepStrictEqual(pngSize(png), { width: 64, height: 64 });
  validateSkin(png);
  assert.throws(() => validateSkin(fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.png'))), /64×64/);
  assert.throws(() => validateSkin(Buffer.from('hola')), /PNG/);
});

test('códigos de acceso (formato + hash)', () => {
  assert.ok(CODE_RE.test('AbC1-dEf2-GhI3'));
  assert.ok(!CODE_RE.test('ABC-DEF-GHI'));
  assert.strictEqual(data.hashCode('AbC1-dEf2-GhI3'), require('crypto').createHash('sha256').update('AbC1-dEf2-GhI3').digest('hex'));
  assert.notStrictEqual(data.hashCode('ABC1-DEF2-GHI3'), data.hashCode('abc1-def2-ghi3'), 'distingue mayúsculas');
});

// Crea un zip (deflate) para las pruebas
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const comp = zlib.deflateRawSync(content);
    const nameBuf = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(content.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(content.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('estado de Discord: textos y botones', () => {
  const P = require('../src/main/presence');
  const ctx = { lang: 'es', version: '1.1.2', githubRepo: 'kewinnsinhoo/onyx-client', discordInvite: 'https://discord.gg/abc', openedAt: 1000 };
  const menu = P.buildActivity({ kind: 'menu', section: 'home' }, ctx);
  assert.strictEqual(menu.details, 'En el menú');
  assert.strictEqual(menu.state, 'Onyx Client · v1.1.2');
  assert.strictEqual(menu.timestamps.start, 1000);
  assert.strictEqual(menu.assets.large_image, P.LOGO_URL);
  assert.strictEqual(menu.buttons.length, 2);
  assert.ok(menu.buttons.every(b => b.label.length <= 32 && /^https:/.test(b.url)));
  assert.strictEqual(P.buildActivity({ kind: 'menu', section: 'skins' }, { ...ctx, lang: 'en' }).details, 'Changing skin');
  assert.strictEqual(P.buildActivity({ kind: 'menu', section: 'instance', name: 'Survival' }, { ...ctx, lang: 'fr' }).details, 'Regarde Survival');
  assert.strictEqual(P.buildActivity({ kind: 'menu', section: 'console' }, ctx).details, 'En el menú');
  const inst = { id: 'sv', name: 'Survival Onyx', minecraft: '1.21.1', loader: { type: 'fabric' }, icon: 'https://x.y/i.png' };
  const play = P.buildActivity({ kind: 'playing', instance: inst, startedAt: 5000 }, ctx);
  assert.strictEqual(play.details, 'Survival Onyx');
  assert.strictEqual(play.state, 'Minecraft 1.21.1 · Fabric');
  assert.strictEqual(play.assets.large_image, 'https://x.y/i.png');
  assert.strictEqual(play.assets.small_image, P.LOGO_URL);
  assert.strictEqual(play.timestamps.start, 5000);
  const noIcon = P.buildActivity({ kind: 'launching', instance: { ...inst, icon: 'img/local.png', loader: { type: 'vanilla' } } }, { lang: 'ca' });
  assert.strictEqual(noIcon.details, 'Iniciant Survival Onyx');
  assert.strictEqual(noIcon.state, 'Minecraft 1.21.1');
  assert.strictEqual(noIcon.assets.large_image, P.LOGO_URL);
  assert.strictEqual(noIcon.buttons, undefined);
});

test('Forge/NeoForge: elegir versión', () => {
  const F = require('../src/main/game/forge');
  assert.ok(F.cmpVersion('47.3.10', '47.3.9') > 0);
  assert.ok(F.cmpVersion('21.1.77', '21.1.77-beta') > 0);
  assert.strictEqual(F.neoPrefix('1.21.1'), '21.1.');
  assert.strictEqual(F.neoPrefix('1.21'), '21.0.');
  assert.strictEqual(F.neoPrefix('26.1'), '26.1.0.');
  const neo = ['21.0.167', '21.1.5-beta', '21.1.9', '21.1.77', '21.1.100-beta', '21.10.3', '1.20.1-47.1.106'];
  assert.deepStrictEqual(F.pickNeoForge('1.21.1', 'latest', neo), { artifact: 'neoforge', version: '21.1.77' });
  assert.deepStrictEqual(F.pickNeoForge('1.21.1', '21.1.5-beta', neo), { artifact: 'neoforge', version: '21.1.5-beta' });
  assert.deepStrictEqual(F.pickNeoForge('1.20.1', '47.1.106', []), { artifact: 'forge', version: '1.20.1-47.1.106' });
  assert.throws(() => F.pickNeoForge('1.8.9', 'latest', neo), /no tiene versiones/);
  const maven = ['1.7.10-10.13.4.1614-1.7.10', '1.20.1-47.2.0', '1.20.1-47.3.0', '1.20.1-47.3.12'];
  const promos = { promos: { '1.20.1-recommended': '47.3.0', '1.20.1-latest': '47.3.12', '1.7.10-recommended': '10.13.4.1614' } };
  assert.strictEqual(F.pickForge('1.20.1', 'recommended', promos, maven), '1.20.1-47.3.0');
  assert.strictEqual(F.pickForge('1.20.1', 'latest', promos, maven), '1.20.1-47.3.12');
  assert.strictEqual(F.pickForge('1.7.10', 'recommended', promos, maven), '1.7.10-10.13.4.1614-1.7.10');
  assert.strictEqual(F.pickForge('1.20.1', '47.2.0', null, []), '1.20.1-47.2.0');
  assert.strictEqual(F.pickForge('1.20.1', 'latest', null, maven), '1.20.1-47.3.12');
  assert.strictEqual(F.fixUrl('http://files.minecraftforge.net/maven/'), 'https://maven.minecraftforge.net/');
  assert.strictEqual(F.resolveArg('{MINECRAFT_JAR}', { MINECRAFT_JAR: '/x/mc.jar' }, '/lib'), '/x/mc.jar');
  assert.strictEqual(F.resolveArg('[a.b:c:1:d@txt]', {}, '/lib'), path.join('/lib', 'a/b/c/1/c-1-d.txt'));
});

test('Forge antiguo (1.7.10): instalar perfil', () => {
  const F = require('../src/main/game/forge');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-forge-old-'));
  const universal = Buffer.from('jar-de-forge');
  const profile = {
    install: { path: 'net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10', filePath: 'forge-1.7.10-10.13.4.1614-1.7.10-universal.jar' },
    versionInfo: {
      id: '1.7.10-Forge10.13.4.1614-1.7.10', mainClass: 'net.minecraft.launchwrapper.Launch',
      minecraftArguments: '--username ${auth_player_name} --tweakClass cpw.mods.fml.common.launcher.FMLTweaker',
      libraries: [
        { name: 'net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10', url: 'http://files.minecraftforge.net/maven/' },
        { name: 'com.typesafe.akka:akka-actor_2.11:2.3.3', url: 'http://files.minecraftforge.net/maven/', checksums: ['a', 'b'], clientreq: true },
        { name: 'net.minecraft:launchwrapper:1.12' },
        { name: 'org.lwjgl.lwjgl:lwjgl-platform:2.9.1', natives: { windows: 'natives-windows', linux: 'natives-linux', osx: 'natives-osx' } }
      ]
    }
  };
  const inst = path.join(root, 'installer.jar');
  fs.writeFileSync(inst, makeZip({ 'install_profile.json': Buffer.from(JSON.stringify(profile)), [profile.install.filePath]: universal }));
  const id = F.installFromJar(root, '1.7.10', inst);
  assert.strictEqual(id, '1.7.10-Forge10.13.4.1614-1.7.10');
  const uni = path.join(root, 'libraries', 'net/minecraftforge/forge/1.7.10-10.13.4.1614-1.7.10/forge-1.7.10-10.13.4.1614-1.7.10.jar');
  assert.ok(fs.readFileSync(uni).equals(universal), 'jar de Forge extraído');
  const vj = JSON.parse(fs.readFileSync(path.join(root, 'versions', id, id + '.json'), 'utf8'));
  assert.strictEqual(vj.inheritsFrom, '1.7.10');
  assert.strictEqual(vj.jar, '1.7.10');
  assert.ok(vj.onyxCopyJar);
  assert.strictEqual(vj.libraries[1].url, 'https://maven.minecraftforge.net/');
  // Librerías: estilo antiguo, natives sin "downloads" y servidores de reserva
  const libs = V.collectLibraries(root, vj, { os: 'windows', arch: 'x64' });
  const akka = libs.downloads.find(d => d.dest.includes('akka-actor'));
  assert.ok(akka.url.startsWith('https://maven.minecraftforge.net/'));
  assert.ok(akka.urls.some(u => u.startsWith('https://repo1.maven.org/maven2/')));
  assert.ok(libs.natives.some(n => n.file.endsWith('lwjgl-platform-2.9.1-natives-windows.jar')));
  assert.ok(!libs.classpath.some(c => c.endsWith('lwjgl-platform-2.9.1.jar')), 'natives no van al classpath');
  assert.ok(libs.classpath.includes(uni));
  fs.rmSync(root, { recursive: true, force: true });
});

console.log(`\n${passed} pruebas superadas${process.exitCode ? ' (con fallos)' : ''}`);

// ---- Ping a un servidor de Minecraft falso (protocolo Server List Ping) ----
(async () => {
  const net = require('net');
  const { ping, varInt, readVarInt } = require('../src/main/game/ping');
  const server = net.createServer((sock) => {
    sock.once('data', () => {
      const json = Buffer.from(JSON.stringify({ version: { name: '1.21.1' }, players: { online: 7, max: 100 } }));
      const body = Buffer.concat([varInt(0), varInt(json.length), json]);
      sock.write(Buffer.concat([varInt(body.length), body]));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    assert.deepStrictEqual(readVarInt(varInt(25565), 0).value, 25565);
    const r = await ping('127.0.0.1', server.address().port);
    assert.strictEqual(r.online, 7); assert.strictEqual(r.max, 100);
    passed++; console.log('  ✓ ping de servidor (jugadores conectados)');
  } catch (e) { console.error('  ✗ ping de servidor\n    ' + e.message); process.exitCode = 1; }
  server.close();
})();

// ---- Discord falso: el launcher se conecta y envía el estado ----
(async () => {
  const net = require('net');
  const { DiscordRPC, encode, decoder, OP } = require('../src/main/discord-rpc');
  const sockPath = process.platform === 'win32' ? '\\\\?\\pipe\\onyx-test-ipc-' + process.pid : path.join(os.tmpdir(), `onyx-test-ipc-${process.pid}`);
  try { fs.unlinkSync(sockPath); } catch { /* nada */ }
  const got = [];
  const server = net.createServer((sock) => {
    sock.on('data', decoder((op, d) => {
      got.push({ op, d });
      if (op === OP.HANDSHAKE) {
        sock.write(encode(OP.FRAME, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1, user: { username: 'tester' } } }));
        sock.write(encode(OP.PING, { n: 1 }));
      }
    }));
  });
  await new Promise(r => server.listen(sockPath, r));
  const rpc = new DiscordRPC('123456789', { paths: ['/no/existe/discord-ipc-0', sockPath], retryMs: 50 });
  try {
    rpc.setActivity({ details: 'En el menú' }); // antes de conectar: se guarda y se envía al estar listo
    rpc.start();
    const until = Date.now() + 3000;
    while (got.filter(g => g.op === OP.FRAME).length < 1 && Date.now() < until) await new Promise(r => setTimeout(r, 20));
    rpc.setActivity({ details: 'Survival Onyx' });
    while (got.filter(g => g.op === OP.FRAME).length < 2 && Date.now() < until) await new Promise(r => setTimeout(r, 20));
    const hs = got.find(g => g.op === OP.HANDSHAKE);
    assert.ok(hs && hs.d.client_id === '123456789' && hs.d.v === 1, 'handshake');
    assert.ok(got.some(g => g.op === OP.PONG && g.d.n === 1), 'responde al ping');
    const frames = got.filter(g => g.op === OP.FRAME).map(g => g.d);
    assert.strictEqual(frames[0].cmd, 'SET_ACTIVITY');
    assert.strictEqual(frames[0].args.activity.details, 'En el menú');
    assert.strictEqual(frames[1].args.activity.details, 'Survival Onyx');
    assert.strictEqual(frames[0].args.pid, process.pid);
    assert.strictEqual(rpc.user.username, 'tester');
    passed++; console.log('  ✓ estado de Discord (conexión con Discord falso)');
  } catch (e) { console.error('  ✗ estado de Discord (conexión)\n    ' + e.message); process.exitCode = 1; }
  rpc.stop();
  server.close();
  try { fs.unlinkSync(sockPath); } catch { /* nada */ }
})();

// ---- Forge moderno / NeoForge: instalador de prueba con un procesador real en Java ----
(async () => {
  const { execFileSync } = require('child_process');
  const name = 'Forge moderno (procesadores con Java)';
  let java = null;
  try { execFileSync('javac', ['-version'], { stdio: 'ignore' }); execFileSync('jar', ['--version'], { stdio: 'ignore' }); java = 'java'; } catch { /* sin JDK */ }
  if (!java) { console.log(`  - ${name}: omitida (no hay JDK)`); return; }
  const F = require('../src/main/game/forge');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-forge-new-'));
  try {
    // Procesador: une el jar de Minecraft + el parche en el jar de salida
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-proc-'));
    fs.writeFileSync(path.join(src, 'Proc.java'), `import java.nio.file.*; import java.io.*;
public class Proc { public static void main(String[] a) throws Exception {
  String in = null, patch = null, out = null, lit = null;
  for (int i = 0; i < a.length; i++) { if (a[i].equals("--in")) in = a[++i]; else if (a[i].equals("--patch")) patch = a[++i]; else if (a[i].equals("--out")) out = a[++i]; else if (a[i].equals("--lit")) lit = a[++i]; }
  if (!"hola".equals(lit)) throw new RuntimeException("literal mal: " + lit);
  ByteArrayOutputStream b = new ByteArrayOutputStream(); b.write(Files.readAllBytes(Paths.get(in))); b.write(Files.readAllBytes(Paths.get(patch)));
  Path o = Paths.get(out); Files.createDirectories(o.getParent()); Files.write(o, b.toByteArray()); System.out.println("parcheado " + out); } }`);
    execFileSync('javac', ['--release', '8', '-d', src, path.join(src, 'Proc.java')], { stdio: 'ignore' });
    fs.writeFileSync(path.join(src, 'm.txt'), 'Main-Class: Proc\n');
    const procJar = path.join(src, 'proc.jar');
    execFileSync('jar', ['cfm', procJar, path.join(src, 'm.txt'), '-C', src, 'Proc.class'], { stdio: 'ignore' });

    const mcJar = path.join(root, 'versions', '1.20.1', '1.20.1.jar');
    fs.mkdirSync(path.dirname(mcJar), { recursive: true });
    fs.writeFileSync(mcJar, 'MC');
    const expected = require('crypto').createHash('sha1').update('MCPARCHE').digest('hex');
    const outCoord = 'net.minecraftforge:forge:1.20.1-47.3.0:client';
    const profile = {
      spec: 1, json: '/version.json', minecraft: '1.20.1',
      data: { BINPATCH: { client: '/data/client.lzma', server: '/data/server.lzma' }, LIT: { client: "'hola'", server: "'x'" }, PATCHED: { client: `[${outCoord}]`, server: '[x:y:1]' }, PATCHED_SHA: { client: `'${expected}'`, server: "''" } },
      processors: [
        { sides: ['server'], jar: 'com.example:proc:1.0', args: ['--nunca'] },
        { jar: 'com.example:proc:1.0', classpath: [], args: ['--in', '{MINECRAFT_JAR}', '--patch', '{BINPATCH}', '--lit', '{LIT}', '--out', '{PATCHED}'], outputs: { '{PATCHED}': '{PATCHED_SHA}' } }
      ],
      libraries: [{ name: 'com.example:proc:1.0', downloads: { artifact: { path: 'com/example/proc/1.0/proc-1.0.jar', url: '' } } }]
    };
    const vjson = { id: '1.20.1-forge-47.3.0', inheritsFrom: '1.20.1', mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
      arguments: { jvm: ['-DignoreList=bootstraplauncher,${version_name}.jar'], game: ['--launchTarget', 'forgeclient'] },
      libraries: [{ name: outCoord, downloads: { artifact: { path: 'net/minecraftforge/forge/1.20.1-47.3.0/forge-1.20.1-47.3.0-client.jar', url: '' } } }] };
    const inst = path.join(root, 'cache', 'installers', 'forge.jar');
    fs.mkdirSync(path.dirname(inst), { recursive: true });
    fs.writeFileSync(inst, makeZip({
      'install_profile.json': Buffer.from(JSON.stringify(profile)),
      'version.json': Buffer.from(JSON.stringify(vjson)),
      'data/client.lzma': Buffer.from('PARCHE'),
      'maven/com/example/proc/1.0/proc-1.0.jar': fs.readFileSync(procJar)
    }));

    const id = F.installFromJar(root, '1.20.1', inst);
    assert.strictEqual(id, '1.20.1-forge-47.3.0');
    assert.ok(fs.existsSync(path.join(root, 'libraries/com/example/proc/1.0/proc-1.0.jar')), 'maven/ extraído');
    assert.deepStrictEqual(F.processorLibraries(root, id), []); // el procesador venía dentro del instalador
    const logs = [];
    const ran = await F.runProcessors(root, id, { mc: '1.20.1', java, minecraftJar: mcJar, onLog: (t) => logs.push(t) });
    assert.strictEqual(ran, true);
    const out = path.join(root, 'libraries/net/minecraftforge/forge/1.20.1-47.3.0/forge-1.20.1-47.3.0-client.jar');
    assert.strictEqual(fs.readFileSync(out, 'utf8'), 'MCPARCHE');
    assert.ok(logs.join('').includes('parcheado'));
    assert.strictEqual(await F.runProcessors(root, id, { mc: '1.20.1', java, minecraftJar: mcJar }), false, 'la segunda vez no repite');

    // La versión resuelta pone el jar parcheado en el classpath y copia el de Minecraft con el nombre de la versión
    fs.writeFileSync(path.join(root, 'versions', '1.20.1', '1.20.1.json'), JSON.stringify({ id: '1.20.1', mainClass: 'net.minecraft.client.main.Main', libraries: [], arguments: { game: [], jvm: [] } }));
    const version = V.loadResolved(root, id);
    assert.ok(V.collectLibraries(root, version).classpath.includes(out));
    const copied = F.copyClientJar(root, version, mcJar);
    assert.strictEqual(path.basename(copied), '1.20.1-forge-47.3.0.jar');
    passed++; console.log('  ✓ ' + name);
  } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
  fs.rmSync(root, { recursive: true, force: true });
})();

// ---- Login de Microsoft en el navegador: el servidor local recibe el código ----
(async () => {
  const MS = require('../src/main/auth/microsoft');
  const http = require('http');
  const get = (url) => new Promise((resolve, reject) => http.get(url, (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject));
  try {
    let page = null;
    const r = await MS.browserLogin(async (url) => {
      const u = new URL(url);
      assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
      const back = new URL(u.searchParams.get('redirect_uri'));
      assert.strictEqual(back.hostname, 'localhost');
      back.hostname = '127.0.0.1';
      setTimeout(async () => {
        assert.strictEqual((await get(`${back.origin}/?code=MAL&state=otro`)).status, 200); // estado falso: se rechaza
      }, 10);
    }, 'cliente-prueba', { lang: 'es', timeoutMs: 3000 }).catch(e => e);
    assert.ok(r instanceof Error && r.code === 'ms_auth', 'rechaza un state que no es el suyo');

    const ok = await MS.browserLogin(async (url) => {
      const u = new URL(url);
      const back = new URL(u.searchParams.get('redirect_uri')); back.hostname = '127.0.0.1';
      setTimeout(async () => { page = await get(`${back.origin}/?code=CODIGO123&state=${u.searchParams.get('state')}`); }, 10);
    }, 'cliente-prueba', { lang: 'en', timeoutMs: 3000 });
    assert.strictEqual(ok.code, 'CODIGO123');
    assert.ok(/^http:\/\/localhost:\d+$/.test(ok.redirectUri));
    assert.ok(ok.verifier.length > 30);
    await new Promise(r2 => setTimeout(r2, 50));
    assert.ok(page && page.body.includes('Signed in'));

    const p = MS.browserLogin(async () => {}, 'cliente-prueba', { timeoutMs: 3000 });
    setTimeout(() => MS.cancelBrowserLogin(), 20);
    const c = await p.catch(e => e);
    assert.strictEqual(c.code, 'cancelled');
    passed++; console.log('  ✓ login de Microsoft en el navegador (servidor local)');
  } catch (e) { console.error('  ✗ login en el navegador\n    ' + (e.stack || e.message)); process.exitCode = 1; }
})();

// ---------------------------------------------------------------- sincronización de archivos (modos del panel)
test('sincronización: conservar / gestionada / reinicio y rutas del jugador', () => {
  const { plan, modeFor } = require('../src/main/sync');
  const files = [
    { path: 'mods/sodium.jar', url: 'https://x/sodium.jar' },
    { path: 'options.txt', url: 'https://x/options.txt' },
    { path: 'config/voicechat/a.json', url: 'https://x/a.json' },
    { path: 'saves/mapa/level.dat', url: 'https://x/level.dat' },
    { path: '../fuera.txt', url: 'https://x/mal' }
  ];
  const pp = [{ path: 'options.txt', mode: 'once' }, { path: 'saves', mode: 'player' }, { path: 'config/voicechat', mode: 'studio' }, { path: 'config', mode: 'once' }];
  assert.strictEqual(modeFor('config/voicechat/a.json', pp), 'studio'); // la regla más concreta gana
  assert.strictEqual(modeFor('config/otro.json', pp), 'once');
  const local = ['mods/sodium.jar', 'mods/mio.jar', 'options.txt', 'saves/mundo/level.dat', 'screenshots/a.png', 'logs/latest.log', 'resourcepacks/x.zip', 'config/otro.json'];
  const prev = { managed: ['mods/viejo.jar', 'mods/sodium.jar'], once: [], urls: {} };

  const keep = plan({ files, sync: { mode: 'keep', playerPaths: pp }, local: [...local, 'mods/viejo.jar'], state: prev });
  assert.deepStrictEqual(keep.download.map(d => d.rel).sort(), ['config/voicechat/a.json', 'mods/sodium.jar']); // options ya existe; saves es del jugador; ../ no
  assert.deepStrictEqual(keep.remove, ['mods/viejo.jar']); // lo que el studio quitó
  assert.ok(keep.state.once.includes('options.txt'));

  const man = plan({ files, sync: { mode: 'managed', playerPaths: pp }, local, state: prev });
  assert.ok(man.remove.includes('mods/mio.jar'), 'gestionada borra lo que sobra en mods/');
  assert.ok(!man.remove.includes('resourcepacks/x.zip') && !man.remove.includes('screenshots/a.png') && !man.remove.includes('config/otro.json'));

  const reset = plan({ files, sync: { mode: 'reset', playerPaths: pp }, local, state: prev });
  assert.deepStrictEqual(reset.remove.sort(), ['mods/mio.jar', 'resourcepacks/x.zip', 'screenshots/a.png']);
  // "once" ya instalado no se vuelve a bajar aunque el jugador lo borre
  const again = plan({ files, sync: { mode: 'keep', playerPaths: pp }, local: [], state: keep.state });
  assert.ok(!again.download.some(d => d.rel === 'options.txt'));
  // Enlace cambiado sin sha1 → se vuelve a bajar
  const changed = plan({ files: [{ path: 'mods/sodium.jar', url: 'https://x/sodium-2.jar' }], sync: {}, local: ['mods/sodium.jar'], state: { managed: ['mods/sodium.jar'], urls: { 'mods/sodium.jar': 'https://x/sodium.jar' } } });
  assert.deepStrictEqual(changed.replace, ['mods/sodium.jar']);
});

test('panel: errores legibles', () => {
  const panel = require('../src/main/panel');
  const e1 = panel.toError({ ok: false, reason: 'full', max: 30 }, 403);
  assert.strictEqual(e1.message, 'La instancia está llena ({max} jugadores). Prueba en un rato.');
  assert.strictEqual(e1.vars.max, 30);
  const e2 = panel.toError({ ok: false, reason: 'not_open', opensAt: Date.now() + 864e5, predownload: true }, 403);
  assert.ok(e2.predownload && e2.vars.at && e2.vars.date);
  assert.strictEqual(panel.toError({ ok: false, reason: 'locked', message: 'Volvemos a las 18:00' }, 403).message, 'Volvemos a las 18:00');
  assert.strictEqual(panel.toError(null, 500).code, 'server');
  // Todos los textos tienen traducción en la interfaz
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'i18n.js'), 'utf8');
  for (const m of Object.values(panel.MESSAGES)) assert.ok(src.includes(`['${m.replace(/'/g, "\\'")}'`), 'falta traducir: ' + m);
});

// El launcher contra el panel de verdad (servidor local con datos de ejemplo)
(async () => {
  const { spawn } = require('child_process');
  const port = 8797;
  const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'panel', 'dev', 'server.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('el panel local no arrancó')), 15000);
      srv.stdout.on('data', d => { if (String(d).includes('Panel local')) { clearTimeout(to); res(); } });
      srv.on('exit', c => rej(new Error('panel salió ' + c)));
    });
    const { config } = require('../src/main/config');
    config.panelUrl = `http://localhost:${port}`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-panel-'));
    const panel = require('../src/main/panel');
    const instances = require('../src/main/instances');
    const referrals = require('../src/main/referrals');
    panel.init(tmp);
    instances.init(tmp);
    const acc = { id: 'off-probador', type: 'offline', name: 'Probador', uuid: 'x' };

    // Canjear un código del panel
    const r = await instances.redeem('ignt-2026-abcd', acc);
    assert.strictEqual(r.instance.id, 'ignite-extremo-3');
    assert.strictEqual(r.instance.source, 'panel');
    assert.ok(r.instance.banner.startsWith(`http://localhost:${port}/m/`), 'imágenes con dirección completa');
    assert.strictEqual(r.instance.look.accent, '#f59e0b');
    const bad = await instances.redeem('ZZZZ-ZZZZ-ZZZZ', acc).catch(e => e);
    assert.strictEqual(bad.code, 'code');

    // Lista, jugar, latido y fin
    assert.ok((await panel.listInstances(acc)).some(i => i.id === 'ignite-extremo-3'));
    const s = await panel.startPlay(acc, 'ignite-extremo-3');
    assert.ok(s.ok && s.play && s.beatEvery === 60);
    assert.strictEqual((await panel.beat(acc, s.play)).kick, false);
    assert.ok((await panel.endPlay(acc, s.play)).ok);
    const locked = await panel.startPlay(acc, 'torneo-pvp').catch(e => e);
    assert.strictEqual(locked.code, 'no_access');
    assert.strictEqual(locked.message, 'Ya no tienes acceso a esta instancia');

    // Quitar a mano una instancia del panel: no vuelve sola
    instances.remove('ignite-extremo-3', true);
    await instances.syncPanel(acc, { force: true });
    assert.ok(!instances.list().some(i => i.id === 'ignite-extremo-3'));

    // Referidos con el código del studio
    const st = await referrals.studios();
    assert.ok(st.some(x => x.code === 'ONYX-STUDIOS'));
    const ref = await referrals.link('onyx-studios', acc);
    assert.ok(ref.sent && ref.studio === 'onyx-studios');
    const rank = await referrals.ranking('all');
    assert.ok(rank[0].code === 'ONYX-STUDIOS' && rank[0].players >= 5);
    passed++; console.log('  ✓ launcher ↔ panel (códigos, jugar, latido, referidos)');
  } catch (e) { console.error('  ✗ launcher ↔ panel\n    ' + (e.stack || e.message)); process.exitCode = 1; }
  finally { srv.kill(); }
})();
