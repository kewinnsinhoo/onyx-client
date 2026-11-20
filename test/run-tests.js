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
const { CODE_RE, fabricAddModsOk } = require('../src/main/instances');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('Kopi Client — pruebas');

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
    server: { address: 'play.onyx.gg', port: 25565 },
    jvmProps: ['-Dfabric.addMods=C:\\Users\\Juan Perez\\AppData\\Local\\Temp\\a1b2c3d4e5f6a7b8']
  }, { os: 'windows', platform: 'win32', arch: 'x64' });
  assert.strictEqual(args[0], '-Xmx6144M');
  // la carpeta temporal de los mods (Fabric) va entera aunque la ruta tenga espacios, antes de la clase principal
  const am = args.indexOf('-Dfabric.addMods=C:\\Users\\Juan Perez\\AppData\\Local\\Temp\\a1b2c3d4e5f6a7b8');
  assert.ok(am > 0 && am < args.indexOf(fabric.mainClass));
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

test('mods escondidos solo con Fabric Loader 0.14 o más nuevo', () => {
  assert.strictEqual(fabricAddModsOk({ type: 'fabric', version: '0.16.5' }), true);
  assert.strictEqual(fabricAddModsOk({ type: 'fabric', version: '0.14.0' }), true);
  assert.strictEqual(fabricAddModsOk({ type: 'fabric', version: '0.11.7' }), false);
  // el panel guarda «latest» cuando el studio no elige versión (es el Fabric más nuevo)
  assert.strictEqual(fabricAddModsOk({ type: 'fabric', version: 'latest' }), true);
  assert.strictEqual(fabricAddModsOk({ type: 'fabric' }), true);
  assert.strictEqual(fabricAddModsOk({ type: 'fabric', version: 'rara' }), false);
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
  assert.strictEqual(menu.state, 'Kopi Client · v1.1.2');
  assert.strictEqual(menu.timestamps.start, 1000);
  assert.strictEqual(menu.assets.large_image, P.LOGO_URL);
  assert.strictEqual(menu.buttons.length, 2);
  assert.ok(menu.buttons.every(b => b.label.length <= 32 && /^https:/.test(b.url)));
  assert.strictEqual(P.buildActivity({ kind: 'menu', section: 'skins' }, { ...ctx, lang: 'en' }).details, 'Changing skin');
  assert.strictEqual(P.buildActivity({ kind: 'menu', section: 'instance', name: 'Survival' }, { ...ctx, lang: 'fr' }).details, 'Regarde Survival');
  assert.strictEqual(P.buildActivity({ kind: 'menu', section: 'console' }, ctx).details, 'En el menú');
  const inst = { id: 'sv', name: 'Survival Kopi', minecraft: '1.21.1', loader: { type: 'fabric' }, icon: 'https://x.y/i.png' };
  const play = P.buildActivity({ kind: 'playing', instance: inst, startedAt: 5000 }, ctx);
  assert.strictEqual(play.details, 'Survival Kopi');
  assert.strictEqual(play.state, 'Minecraft 1.21.1 · Fabric');
  assert.strictEqual(play.assets.large_image, 'https://x.y/i.png');
  assert.strictEqual(play.assets.small_image, P.LOGO_URL);
  assert.strictEqual(play.timestamps.start, 5000);
  const noIcon = P.buildActivity({ kind: 'launching', instance: { ...inst, icon: 'img/local.png', loader: { type: 'vanilla' } } }, { lang: 'ca' });
  assert.strictEqual(noIcon.details, 'Iniciant Survival Kopi');
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
    rpc.setActivity({ details: 'Survival Kopi' });
    while (got.filter(g => g.op === OP.FRAME).length < 2 && Date.now() < until) await new Promise(r => setTimeout(r, 20));
    const hs = got.find(g => g.op === OP.HANDSHAKE);
    assert.ok(hs && hs.d.client_id === '123456789' && hs.d.v === 1, 'handshake');
    assert.ok(got.some(g => g.op === OP.PONG && g.d.n === 1), 'responde al ping');
    const frames = got.filter(g => g.op === OP.FRAME).map(g => g.d);
    assert.strictEqual(frames[0].cmd, 'SET_ACTIVITY');
    assert.strictEqual(frames[0].args.activity.details, 'En el menú');
    assert.strictEqual(frames[1].args.activity.details, 'Survival Kopi');
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
  // El panel local usa la base de datos SQLite que trae Node 22.5+; con un Node más viejo se salta
  try { require('node:sqlite'); } catch { console.log('  - launcher ↔ panel: se salta (este Node no trae SQLite)'); return; }
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

    // Kopi Skins: la skin de la cuenta no premium se sube una vez y el servidor la puede pedir
    const png = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'assets', 'default-skin.png')).toString('base64');
    const key = 'clave-secreta-de-prueba-1234567890';
    assert.ok((await panel.syncSkin(acc, key, { png, variant: 'slim' })).ok);
    assert.ok((await panel.syncSkin(acc, key, { png, variant: 'slim' })).unchanged, 'no se vuelve a subir si no cambió');
    const pub = await (await fetch(`http://localhost:${port}/api/public/skin/Probador`)).json();
    assert.deepStrictEqual([pub.source, pub.variant, pub.signature], ['kopi', 'slim', 'firma-dev']);
    assert.ok((await panel.syncSkin({ ...acc, type: 'msa' }, key, { png, variant: 'slim' })).skipped, 'las premium no suben nada');

    // Capas de Kopi: el Creador la regala en el panel; el launcher la ve, se la pone y el juego la pide
    const login = await fetch(`http://localhost:${port}/auth/dev?id=111&name=kew`, { redirect: 'manual' });
    const cookie = login.headers.getSetCookie().find(c => c.startsWith('onyx_s=')).split(';')[0];
    const gift = await fetch(`http://localhost:${port}/api/onyx/capes/kopi`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Probador' }) });
    assert.strictEqual(gift.status, 200);
    assert.deepStrictEqual(await panel.kopiCapes(acc), { owned: ['kopi'], worn: null });
    assert.strictEqual((await panel.wearKopiCape(acc, key, 'kopi')).worn, 'kopi');
    const capeImg = await fetch(`http://localhost:${port}/capes/Probador.png`);
    assert.deepStrictEqual([capeImg.status, capeImg.headers.get('content-type')], [200, 'image/png']);
    const notMine = await panel.wearKopiCape(acc, key, 'void').catch(e => e);
    assert.deepStrictEqual([notMine.code, notMine.message], ['not_owned', 'Todavía no tienes esta capa']);
    const other = await panel.wearKopiCape(acc, 'otra-clave-de-otro-launcher-123456', null).catch(e => e);
    assert.deepStrictEqual([other.code, other.message], ['taken', 'Este nombre lo usa otro jugador']);
    assert.strictEqual((await panel.wearKopiCape(acc, key, null)).worn, null);
    assert.strictEqual((await fetch(`http://localhost:${port}/capes/Probador.png`)).status, 404);

    // Si el studio te quita el acceso, desaparece sola de la lista (y al intentar jugar)
    const raw = JSON.parse(fs.readFileSync(path.join(tmp, 'instances.json'), 'utf8'));
    raw.instances.push({ id: 'ya-no-es-mia', manifest: { id: 'ya-no-es-mia', source: 'panel', name: 'Vieja' }, addedAt: 1 });
    raw.instances.push({ id: 'de-github', manifest: { name: 'Antigua' }, addedAt: 1 });
    instances.init(tmp); fs.writeFileSync(path.join(tmp, 'instances.json'), JSON.stringify(raw)); instances.init(tmp);
    await instances.syncPanel(acc, { force: true });
    assert.ok(!instances.list().some(i => i.id === 'ya-no-es-mia'), 'la del panel sin acceso se quita');
    assert.ok(instances.list().some(i => i.id === 'de-github'), 'las antiguas de GitHub no se tocan');
    assert.ok(instances.list().some(i => i.id === 'ignite-extremo-3'));

    // Quitar a mano una instancia del panel: no vuelve sola
    instances.remove('ignite-extremo-3', true);
    await instances.syncPanel(acc, { force: true });
    assert.ok(!instances.list().some(i => i.id === 'ignite-extremo-3'));

    // Enviar informe: el panel lo reenvía a Discord; uno por minuto
    const report = require('../src/main/report');
    const rdir = path.join(tmp, 'reports');
    const toPanel = (d) => panel.sendReport(acc, d);
    const st0 = { version: '1.4.6', os: 'Test', ramGb: 8, instances: 1, instance: 'Ignite' };
    const sent = await report.send({ message: 'no carga', screenshot: Buffer.from([0xff, 0xd8, 0xff, 1]), status: st0, gameLog: 'log', toPanel }, rdir);
    assert.deepStrictEqual(sent, { sent: true });
    const slow = await report.send({ message: 'otra', status: st0, toPanel }, rdir).catch(e => e);
    assert.strictEqual(slow.code, 'slow');
    // si el panel no responde: se guarda en una carpeta
    const saved = await report.send({ message: 'sin panel', status: st0, toPanel: async () => { throw new panel.PanelError('x', 'offline'); } }, rdir);
    assert.ok(!saved.sent && fs.existsSync(path.join(saved.dir, 'mensaje.txt')));

    // Referidos con el código del studio
    const st = await referrals.studios();
    assert.ok(st.some(x => x.code === 'ONYX-STUDIOS'));
    const ref = await referrals.link('onyx-studios', acc);
    assert.ok(ref.sent && ref.studio === 'onyx-studios');
    const rank = await referrals.ranking('all');
    assert.ok(rank[0].code === 'ONYX-STUDIOS' && rank[0].players >= 5);
    passed++; console.log('  ✓ launcher ↔ panel (códigos, jugar, latido, informes, referidos, skins, capas)');
  } catch (e) { console.error('  ✗ launcher ↔ panel\n    ' + (e.stack || e.message)); process.exitCode = 1; }
  finally { srv.kill(); }
})();

// Skins de Kopi: el mod CustomSkinLoader se pone solo según la versión y el loader
(async () => {
  try {
    const skinmod = require('../src/main/skinmod');
    const Sync = require('../src/main/sync');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-skins-'));
    skinmod.init(tmp);
    let latest = '15.0.0', calls = [], offline = false;
    const fetchJson = async (url) => {
      if (offline) throw new Error('sin conexión');
      calls.push(url);
      const q = new URL(url).searchParams;
      const loader = JSON.parse(q.get('loaders'))[0], mc = JSON.parse(q.get('game_versions'))[0];
      if (mc === '1.0') return [];
      if (loader === 'quilt') return [];
      // Cape Provider solo existe (en esta prueba) para Fabric 1.21.1; Fabric API para todo Fabric
      if (url.includes('/project/cape-provider/')) return loader === 'fabric' && mc === '1.21.1' ? [{ version_number: '5.0.0.0-legacy+1.21.1', version_type: 'release', files: [{ primary: true, url: 'https://cdn.modrinth.com/cape-provider.jar', hashes: { sha1: 'c' }, size: 5 }] }] : [];
      if (url.includes('/project/fabric-api/')) return [{ version_number: '0.116.7+1.21.1', version_type: 'release', files: [{ primary: true, url: 'https://cdn.modrinth.com/fabric-api.jar', hashes: { sha1: 'f' }, size: 5 }] }];
      return [{ version_number: `${latest}-${loader}`, version_type: 'release', files: [{ primary: true, url: `https://cdn.modrinth.com/csl-${loader}-${latest}.jar`, hashes: { sha1: 'x' }, size: 10 }] }];
    };
    const got = [];
    const downloadFile = async (t) => { got.push(t.url); fs.mkdirSync(path.dirname(t.dest), { recursive: true }); fs.writeFileSync(t.dest, 'jar'); };
    const deps = { fetchJson, downloadFile };
    const panelBase = 'https://panel.onyxclient.site';
    const g = path.join(tmp, 'instances', 'evento');
    fs.mkdirSync(path.join(g, 'CustomSkinLoader'), { recursive: true });
    fs.writeFileSync(path.join(g, 'CustomSkinLoader', 'CustomSkinLoader.json'), JSON.stringify({ enable: false, enableCape: true, loadlist: [{ name: 'Mojang', type: 'MojangAPI' }, { name: 'ElyBy', type: 'ElyByAPI' }] }));
    const mods = () => fs.readdirSync(path.join(g, 'mods')).sort();

    // Fabric 1.21.1: se baja la versión que toca y se configura Mojang → Kopi → lo demás
    let r = await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, panelBase }, deps);
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.capes, 'ok');
    // + capas animadas: Cape Provider y Fabric API (la instancia no la traía)
    assert.deepStrictEqual(mods(), ['kopi-skins-cape-provider-5.0.0.0-legacy+1.21.1.jar', 'kopi-skins-customskinloader-15.0.0-fabric.jar', 'kopi-skins-fabric-api-0.116.7+1.21.1.jar']);
    assert.ok(calls[0].includes('/project/idMHQ4n2/version') && calls[0].includes('1.21.1'));
    const cfg = JSON.parse(fs.readFileSync(path.join(g, 'CustomSkinLoader', 'CustomSkinLoader.json'), 'utf8'));
    assert.strictEqual(cfg.enable, true);
    assert.strictEqual(cfg.enableCape, true, 'respeta los demás ajustes');
    assert.deepStrictEqual(cfg.loadlist.map(x => x.name), ['GameProfile', 'Kopi', 'Mojang', 'ElyBy']);
    assert.strictEqual(cfg.loadlist[1].type, 'CustomSkinAPI');
    assert.strictEqual(cfg.loadlist[1].root, 'https://panel.onyxclient.site/csl/');
    assert.strictEqual(cfg.loadlist[2].type, 'MojangAPI');
    assert.strictEqual(cfg.enableLocalProfileCache, true);
    assert.strictEqual(cfg.cacheExpiry, 120);
    assert.strictEqual(cfg.forceLoadAllTextures, true);
    // Cape Provider: la capa de Kopi primero, animada, también para jugadores no premium
    const capeCfg = () => JSON.parse(fs.readFileSync(path.join(g, 'config', 'cape-provider', 'config.json'), 'utf8'));
    let cc = capeCfg();
    assert.deepStrictEqual(cc.activeProviderIds, ['kopi', 'minecraftcapes']);
    assert.deepStrictEqual(cc.remoteCustomProviders[0], { id: 'kopi', name: 'Kopi Client', uriTemplate: 'https://panel.onyxclient.site/capes/$name.png', textureResolverId: 'sprite', homepage: 'https://onyxclient.site' });
    assert.deepStrictEqual([cc.validateProfile, cc.useDefaultProvider, cc.enableElytraTexture, cc.animatedCapesHandling], [false, true, true, 'ON']);
    // respeta lo que el jugador cambió en el mod
    fs.writeFileSync(path.join(g, 'config', 'cape-provider', 'config.json'), JSON.stringify({ ...cc, activeProviderIds: ['optifine', 'kopi'], remoteCustomProviders: [{ id: 'mio', name: 'Mío', uriTemplate: 'https://x/$id' }], animatedCapesHandling: 'FROZEN' }));
    // la segunda vez se recuerda la versión (sin preguntar a Modrinth)
    await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, panelBase }, deps);
    assert.strictEqual(calls.length, 3);
    cc = capeCfg();
    assert.deepStrictEqual(cc.activeProviderIds, ['kopi', 'optifine']);
    assert.deepStrictEqual(cc.remoteCustomProviders.map(x => x.id), ['kopi', 'mio']);
    assert.strictEqual(cc.animatedCapesHandling, 'FROZEN');
    // sin conexión con Modrinth: se usa lo que se sabía
    offline = true;
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, panelBase }, deps)).status, 'ok');
    offline = false;
    // versión nueva del mod: la vieja se quita
    fs.unlinkSync(path.join(tmp, 'cache', 'kopi-skins.json')); latest = '15.1.0';
    await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, panelBase }, deps);
    assert.deepStrictEqual(mods(), ['kopi-skins-cape-provider-5.0.0.0-legacy+1.21.1.jar', 'kopi-skins-customskinloader-15.1.0-fabric.jar', 'kopi-skins-fabric-api-0.116.7+1.21.1.jar']);
    // la sincronización del studio (modo reset) no los borra
    const p = Sync.plan({ files: [], sync: { mode: 'reset' }, local: [...mods().map(f => 'mods/' + f), 'mods/otro.jar', 'CustomSkinLoader/CustomSkinLoader.json'], state: {} });
    assert.deepStrictEqual(p.remove, ['mods/otro.jar']);
    // si el studio trae Fabric API, se usa la suya (dos copias harían fallar el juego)
    fs.writeFileSync(path.join(g, 'mods', 'fabric-api-0.110.0+1.21.1.jar'), 'jar');
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, panelBase }, deps)).capes, 'ok');
    assert.deepStrictEqual(mods(), ['fabric-api-0.110.0+1.21.1.jar', 'kopi-skins-cape-provider-5.0.0.0-legacy+1.21.1.jar', 'kopi-skins-customskinloader-15.1.0-fabric.jar']);
    // si trae otro mod de capas, no se pone Cape Provider (no pueden ir juntos)
    fs.writeFileSync(path.join(g, 'mods', 'minecraftcapes-12.0.jar'), 'jar');
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, panelBase }, deps)).capes, 'conflict');
    assert.deepStrictEqual(mods(), ['fabric-api-0.110.0+1.21.1.jar', 'kopi-skins-customskinloader-15.1.0-fabric.jar', 'minecraftcapes-12.0.jar']);
    fs.unlinkSync(path.join(g, 'mods', 'minecraftcapes-12.0.jar')); fs.unlinkSync(path.join(g, 'mods', 'fabric-api-0.110.0+1.21.1.jar'));
    // otra versión sin Cape Provider: solo la capa quieta (CustomSkinLoader)
    r = await skinmod.ensure(g, { mc: '1.20.1', loader: { type: 'fabric' }, panelBase }, deps);
    assert.deepStrictEqual([r.status, r.capes], ['ok', 'unsupported']);
    assert.deepStrictEqual(mods(), ['kopi-skins-customskinloader-15.1.0-fabric.jar']);
    // Quilt usa el de Fabric (sin capas animadas)
    r = await skinmod.ensure(g, { mc: '1.20.1', loader: { type: 'quilt' }, panelBase }, deps);
    assert.ok(r.file.endsWith('-fabric.jar'));
    assert.strictEqual(r.capes, 'off');
    // Vanilla, desactivado o sin versión del mod: se quita y se juega igual
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'vanilla' }, panelBase }, deps)).status, 'off');
    assert.deepStrictEqual(mods(), []);
    await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'forge' }, panelBase }, deps);
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'forge' }, enabled: false, panelBase }, deps)).status, 'off');
    assert.deepStrictEqual(mods(), []);
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.0', loader: { type: 'forge' }, panelBase }, deps)).status, 'unsupported');
    // si el studio ya trae CustomSkinLoader, no se pone otro (dos copias harían fallar el juego)
    fs.writeFileSync(path.join(g, 'mods', 'CustomSkinLoader_Universal-14.0.jar'), 'jar');
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'neoforge' }, panelBase }, deps)).status, 'studio');
    assert.deepStrictEqual(mods(), ['CustomSkinLoader_Universal-14.0.jar']);
    // un error nunca impide jugar
    fs.unlinkSync(path.join(g, 'mods', 'CustomSkinLoader_Universal-14.0.jar'));
    offline = true;
    assert.strictEqual((await skinmod.ensure(g, { mc: '1.19.2', loader: { type: 'forge' }, panelBase }, deps)).status, 'error');
    passed++; console.log('  ✓ skins de Kopi: el mod según versión y loader');
  } catch (e) { console.error('  ✗ skins de Kopi\n    ' + (e.stack || e.message)); process.exitCode = 1; }
})();

// Modo rendimiento: mods de optimización según versión y loader, sin chocar con los del studio
(async () => {
  try {
    const perfmode = require('../src/main/perfmode');
    // copia propia de skinmod (la otra prueba de skins corre a la vez y usa su propia caché)
    delete require.cache[require.resolve('../src/main/skinmod')];
    const skinmod = require('../src/main/skinmod');
    const Sync = require('../src/main/sync');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-perf-'));
    perfmode.init(tmp); skinmod.init(tmp);
    const FAPI = 'P7dR8mSH';
    const ver = (v, deps = []) => [{ version_number: v, version_type: 'release', dependencies: deps, files: [{ primary: true, url: `https://cdn.modrinth.com/${v}.jar`, hashes: { sha1: 's' }, size: 3 }] }];
    const fetchJson = async (url) => {
      const q = new URL(url).searchParams;
      const loader = JSON.parse(q.get('loaders'))[0], mc = JSON.parse(q.get('game_versions'))[0];
      const project = url.split('/project/')[1].split('/')[0];
      if (mc === '1.0') return [];
      if (project === 'sodium') return loader === 'fabric' ? ver('sodium-0.6.13', [{ project_id: FAPI, dependency_type: 'required' }]) : [];
      if (project === 'embeddium') return loader === 'forge' ? ver('embeddium-0.3.31') : [];
      if (project === 'lithium') return loader === 'fabric' ? ver('lithium-0.15.0', [{ project_id: 'otro', dependency_type: 'optional' }]) : [];
      if (project === 'ferrite-core') return ver(`ferritecore-7.0.2-${loader}`);
      if (project === 'entityculling') return ver('entityculling-1.7.2', [{ project_id: 'Skyl1bs', dependency_type: 'required' }]); // necesita otra librería
      if (project === 'fabric-api') return loader === 'fabric' ? ver('fabric-api-0.116.7') : [];
      if (project === 'idMHQ4n2') return ver(`csl-15-${loader}`);
      return [];
    };
    const downloadFile = async (t) => { fs.mkdirSync(path.dirname(t.dest), { recursive: true }); fs.writeFileSync(t.dest, 'jar'); };
    const deps = { fetchJson, downloadFile };
    const g = path.join(tmp, 'instances', 'evento');
    const mods = () => { try { return fs.readdirSync(path.join(g, 'mods')).sort(); } catch { return []; } };

    // apagado: no pone nada
    let r = await perfmode.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: false }, deps);
    assert.deepStrictEqual([r.status, mods()], ['off', []]);
    // Fabric 1.21.1: Sodium, Lithium y FerriteCore; EntityCulling no (necesita otra librería)
    r = await perfmode.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: true }, deps);
    assert.deepStrictEqual(r.mods, ['Sodium', 'Lithium', 'FerriteCore']);
    assert.strictEqual(r.needsFabricApi, true);
    assert.deepStrictEqual(mods(), ['kopi-perf-ferrite-core-ferritecore-7.0.2-fabric.jar', 'kopi-perf-lithium-lithium-0.15.0.jar', 'kopi-perf-sodium-sodium-0.6.13.jar']);
    // Fabric API: una sola copia, la pone skinmod aunque las skins estén apagadas
    let s = await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: false, panelBase: 'https://p', needFabricApi: r.needsFabricApi }, deps);
    assert.strictEqual(s.fabricApi, 'kopi-skins-fabric-api-fabric-api-0.116.7.jar');
    assert.ok(mods().includes(s.fabricApi));
    // con skins y capas a la vez: sigue habiendo una sola Fabric API
    s = await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: true, panelBase: 'https://p', needFabricApi: true }, deps);
    assert.strictEqual(mods().filter(f => /fabric-api/.test(f)).length, 1);
    // la sincronización del studio no borra los mods de rendimiento
    const plan = Sync.plan({ files: [], sync: { mode: 'reset' }, local: [...mods().map(f => 'mods/' + f), 'mods/otro.jar'], state: {} });
    assert.deepStrictEqual(plan.remove, ['mods/otro.jar']);
    // el studio ya trae Sodium y OptiFine: no se pone otro motor de dibujo; trae FerriteCore: tampoco
    fs.writeFileSync(path.join(g, 'mods', 'sodium-fabric-0.6.5+mc1.21.1.jar'), 'jar');
    fs.writeFileSync(path.join(g, 'mods', 'ferritecore-7.0.0-fabric.jar'), 'jar');
    r = await perfmode.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: true }, deps);
    assert.deepStrictEqual(r.mods, ['Lithium']);
    assert.strictEqual(r.needsFabricApi, false);
    assert.ok(!mods().some(f => f.startsWith('kopi-perf-sodium') || f.startsWith('kopi-perf-ferrite')));
    fs.unlinkSync(path.join(g, 'mods', 'sodium-fabric-0.6.5+mc1.21.1.jar')); fs.unlinkSync(path.join(g, 'mods', 'ferritecore-7.0.0-fabric.jar'));
    fs.writeFileSync(path.join(g, 'mods', 'OptiFabric-1.14.3.jar'), 'jar');
    r = await perfmode.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: true }, deps);
    assert.deepStrictEqual(r.mods, ['Lithium', 'FerriteCore']);
    fs.unlinkSync(path.join(g, 'mods', 'OptiFabric-1.14.3.jar'));
    // si al final no hubiera Fabric API, se quitan los que la necesitan (Sodium) y se quedan los demás
    await perfmode.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: true }, deps);
    await perfmode.dropNeedingFabricApi(g, { mc: '1.21.1', loader: { type: 'fabric' } }, deps);
    assert.ok(!mods().some(f => f.startsWith('kopi-perf-sodium')));
    assert.ok(mods().some(f => f.startsWith('kopi-perf-lithium')));
    // apagarlo quita todos los suyos; y Fabric API se va si ya nadie la necesita
    await perfmode.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: false }, deps);
    assert.ok(!mods().some(f => f.startsWith('kopi-perf-')));
    s = await skinmod.ensure(g, { mc: '1.21.1', loader: { type: 'fabric' }, enabled: false, panelBase: 'https://p', needFabricApi: false }, deps);
    assert.strictEqual(s.fabricApi, null);
    assert.ok(!mods().some(f => /fabric-api/.test(f)));
    // Forge 1.20.1: Embeddium en vez de Sodium; vanilla: nada
    const gf = path.join(tmp, 'instances', 'forge');
    r = await perfmode.ensure(gf, { mc: '1.20.1', loader: { type: 'forge' }, enabled: true }, deps);
    assert.deepStrictEqual(r.mods, ['Embeddium', 'FerriteCore']);
    assert.strictEqual(r.needsFabricApi, false);
    r = await perfmode.ensure(gf, { mc: '1.20.1', loader: { type: 'vanilla' }, enabled: true }, deps);
    assert.strictEqual(r.status, 'off');
    assert.ok(!fs.readdirSync(path.join(gf, 'mods')).some(f => f.startsWith('kopi-perf-')));
    // sin conexión con Modrinth: se juega igual (sin esos mods)
    const gx = path.join(tmp, 'instances', 'sinred');
    r = await perfmode.ensure(gx, { mc: '1.0.1', loader: { type: 'fabric' }, enabled: true }, { fetchJson: async () => { throw new Error('sin conexión'); }, downloadFile });
    assert.deepStrictEqual([r.status, r.mods], ['unsupported', []]);
    passed++; console.log('  ✓ modo rendimiento: mods de optimización sin chocar con los del studio');
  } catch (e) { console.error('  ✗ modo rendimiento\n    ' + (e.stack || e.message)); process.exitCode = 1; }
})();

// Mods bajo llave: cifrados mientras no se juega, iguales al abrirlos, nada útil en la carpeta
(async () => {
  try {
    const crypto = require('crypto');
    // copia propia (la prueba launcher ↔ panel corre a la vez y prepara su propia caja fuerte)
    delete require.cache[require.resolve('../src/main/vault')];
    const vault = require('../src/main/vault');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-vault-'));
    // «llave del sistema» de prueba (en el launcher la pone safeStorage de Windows/macOS)
    const prot = { protect: (k) => Buffer.from('P' + k.toString('hex')), unprotect: (b) => Buffer.from(b.toString().slice(1), 'hex') };
    vault.init(tmp, { protector: prot });
    const g = path.join(tmp, 'instances', 'evento');
    const put = (rel, buf) => { fs.mkdirSync(path.dirname(path.join(g, rel)), { recursive: true }); fs.writeFileSync(path.join(g, rel), buf); };
    const big = crypto.randomBytes(5 * 1024 * 1024 + 7); // un mod grande (5 MB)
    const small = Buffer.from('PK\u0003\u0004 mod secreto de Kopi Studio');
    put('mods/secreto.jar', big); put('mods/libs/otro.jar', small);
    put('mods/kopi-skins-customskinloader-15.jar', 'publico'); put('config/ajuste.txt', 'cfg');
    const old = new Date(Date.now() - 864e5); fs.utimesSync(path.join(g, 'mods/secreto.jar'), old, old);
    const mtime = fs.statSync(path.join(g, 'mods/secreto.jar')).mtimeMs;
    const exists = (rel) => fs.existsSync(path.join(g, rel));
    const vdir = path.join(tmp, 'vault', 'evento');

    // primera vez (mods de antes de esta versión): se guardan bajo llave y salen de mods/
    let r = await vault.seal('evento', g);
    assert.deepStrictEqual([r.sealed, r.removed], [2, 2]);
    assert.ok(!exists('mods/secreto.jar') && !exists('mods/libs/otro.jar'), 'sin mods en la carpeta');
    assert.ok(exists('mods/kopi-skins-customskinloader-15.jar') && exists('config/ajuste.txt'), 'lo público y las configs se quedan');
    // en la caja fuerte no hay nada útil: nombres al azar y contenido cifrado
    const blobs = fs.readdirSync(vdir).filter(f => f !== 'index.kv' && f.endsWith('.kv'));
    assert.strictEqual(blobs.length, 2);
    assert.ok(blobs.every(b => /^[0-9a-f]{32}\.kv$/.test(b)), 'nombres sin pistas');
    const all = Buffer.concat(fs.readdirSync(vdir).map(f => fs.readFileSync(path.join(vdir, f))));
    assert.ok(!all.includes(Buffer.from('mod secreto')) && !all.includes(Buffer.from('secreto.jar')) && !all.includes(big.subarray(1000, 1064)), 'ni el contenido ni los nombres se ven');
    const keyFile = fs.readFileSync(path.join(tmp, 'vault', 'key'));
    assert.ok(keyFile.toString().startsWith('P'), 'la llave la guarda el sistema');

    // al abrir el launcher (ya estaba todo guardado): no se pierde nada
    await vault.sealAll([{ id: 'evento', gameDir: g }]);
    // jugar: se abren iguales, con su fecha (así la sincronización no los descarga otra vez)
    assert.strictEqual(await vault.open('evento', g), 2);
    assert.ok(fs.readFileSync(path.join(g, 'mods/secreto.jar')).equals(big), 'el mod grande sale idéntico');
    assert.ok(fs.readFileSync(path.join(g, 'mods/libs/otro.jar')).equals(small));
    assert.ok(Math.abs(fs.statSync(path.join(g, 'mods/secreto.jar')).mtimeMs - mtime) < 2);
    // cerrar el juego sin cambios: no se cifra otra vez, solo se quitan de mods/
    r = await vault.seal('evento', g);
    assert.deepStrictEqual([r.sealed, r.removed], [0, 2]);
    // el studio quita un mod y cambia otro: se guarda lo nuevo y lo viejo desaparece
    await vault.open('evento', g);
    fs.unlinkSync(path.join(g, 'mods/secreto.jar'));
    put('mods/libs/otro.jar', Buffer.from('version 2'));
    put('mods/nuevo.jar', Buffer.from('nuevo'));
    r = await vault.seal('evento', g);
    assert.deepStrictEqual([r.sealed, r.removed], [2, 2]);
    assert.strictEqual(fs.readdirSync(vdir).filter(f => f !== 'index.kv' && f.endsWith('.kv')).length, 2, 'el cifrado viejo se borra');
    assert.strictEqual(await vault.open('evento', g), 2);
    assert.ok(!exists('mods/secreto.jar'));
    assert.strictEqual(fs.readFileSync(path.join(g, 'mods/libs/otro.jar'), 'utf8'), 'version 2');
    // el juego se cerró de golpe (apagón): al abrir el launcher vuelve bajo llave
    await vault.sealAll([{ id: 'evento', gameDir: g }]);
    assert.ok(!exists('mods/nuevo.jar') && !exists('mods/libs/otro.jar'));
    // alguien toca un archivo cifrado: no se abre (y la sincronización lo descargará otra vez), sin romper nada
    const one = fs.readdirSync(vdir).find(f => f !== 'index.kv' && f.endsWith('.kv'));
    const b = fs.readFileSync(path.join(vdir, one)); b[b.length - 20] ^= 1; fs.writeFileSync(path.join(vdir, one), b);
    assert.strictEqual(await vault.open('evento', g), 1);
    // copiar la caja fuerte a otro PC (otra llave del sistema): no sirve de nada
    await vault.seal('evento', g);
    vault.init(tmp, { protector: { protect: (k) => k, unprotect: () => { throw new Error('otra máquina'); } } });
    assert.strictEqual(await vault.open('evento', g), 0);
    assert.ok(!exists('mods/nuevo.jar'));
    // Fabric: mientras se juega, los mods están en una carpeta temporal con nombres al azar (mods/ vacía)
    vault.init(tmp, { protector: prot }); // otra vez la llave buena de este «PC»
    const g2 = path.join(tmp, 'instances', 'fabric');
    const put2 = (rel, buf) => { fs.mkdirSync(path.dirname(path.join(g2, rel)), { recursive: true }); fs.writeFileSync(path.join(g2, rel), buf); };
    put2('mods/sodium-fabric.jar', big); put2('mods/mi-mod-secreto.jar', small); put2('mods/1.21.1/viejo.jar', 'sub');
    put2('mods/kopi-skins-customskinloader-15.jar', 'publico');
    await vault.seal('fabric', g2);
    const live = await vault.stage('fabric');
    assert.ok(live && live.startsWith(os.tmpdir()) && /[0-9a-f]{16}$/.test(live), 'carpeta temporal con nombre al azar');
    const staged = fs.readdirSync(live);
    assert.strictEqual(staged.length, 2, 'solo los de la raíz de mods/ (Fabric no mira subcarpetas)');
    assert.ok(staged.every(f => /^[0-9a-f]{16}\.jar$/.test(f)), 'cada mod con nombre al azar');
    const contents = staged.map(f => fs.readFileSync(path.join(live, f)));
    assert.ok(contents.some(b => b.equals(big)) && contents.some(b => b.equals(small)), 'idénticos');
    assert.deepStrictEqual(fs.readdirSync(path.join(g2, 'mods')).filter(f => f.endsWith('.jar')), ['kopi-skins-customskinloader-15.jar'], 'en mods/ solo lo público');
    // cerrar el juego: la carpeta temporal desaparece y todo sigue guardado
    await vault.seal('fabric', g2);
    assert.ok(!fs.existsSync(live), 'la carpeta temporal se borra');
    assert.strictEqual(await vault.open('fabric', g2), 3);
    await vault.seal('fabric', g2);
    // apagón con el juego abierto: al abrir el launcher se borra la carpeta temporal
    const live2 = await vault.stage('fabric');
    assert.ok(fs.existsSync(live2));
    await vault.sealAll([{ id: 'fabric', gameDir: g2 }]);
    assert.ok(!fs.existsSync(live2));
    // si un mod no se puede abrir, no hay carpeta temporal (se juega a la manera normal)
    const vf = path.join(tmp, 'vault', 'fabric');
    for (const one2 of fs.readdirSync(vf).filter(f => f !== 'index.kv' && f.endsWith('.kv'))) {
      const b2 = fs.readFileSync(path.join(vf, one2)); b2[30] ^= 1; fs.writeFileSync(path.join(vf, one2), b2);
    }
    assert.strictEqual(await vault.stage('fabric'), null);
    assert.ok(!fs.readdirSync(os.tmpdir()).some(d => /^[0-9a-f]{16}$/.test(d) && fs.existsSync(path.join(os.tmpdir(), d)) && fs.readdirSync(path.join(os.tmpdir(), d)).some(f => f.endsWith('.kopi-tmp'))), 'sin restos');
    // borrar la instancia borra su caja fuerte (y su carpeta temporal)
    const live3 = await vault.stage('evento');
    vault.drop('fabric');
    assert.ok(!fs.existsSync(vf));
    vault.drop('evento');
    if (live3) assert.ok(!fs.existsSync(live3));
    assert.ok(!fs.existsSync(vdir));
    // los cifrados pequeños (índice) se abren solo con su llave
    const k = crypto.randomBytes(32);
    assert.strictEqual(vault._openBuffer(vault._sealBuffer(Buffer.from('hola'), k), k).toString(), 'hola');
    assert.throws(() => vault._openBuffer(vault._sealBuffer(Buffer.from('hola'), k), crypto.randomBytes(32)));
    passed++; console.log('  ✓ mods bajo llave: cifrados al no jugar, idénticos al abrir');
  } catch (e) { console.error('  ✗ mods bajo llave\n    ' + (e.stack || e.message)); process.exitCode = 1; }
})();
