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
