// Prueba real: Minecraft vanilla con la capa de skins (Fabric por debajo + CustomSkinLoader) y cuenta no premium.
// La lanza .github/workflows/prueba-juego.yml en Linux con pantalla virtual. Pasa si el juego llega al menú
// con Fabric y CustomSkinLoader cargados.
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const game = require('../src/main/game/launch');
const skinmod = require('../src/main/skinmod');
const { fetchJson, downloadFile } = require('../src/main/game/download');

const MC = process.argv[2] || '1.21.1';
const root = path.join(os.tmpdir(), 'kopi-prueba');
const layer = { type: 'fabric', version: 'latest', skinLayer: true };
const offlineUuid = (n) => { const h = crypto.createHash('md5').update('OfflinePlayer:' + n).digest(); h[6] = (h[6] & 0x0f) | 0x30; h[8] = (h[8] & 0x3f) | 0x80; const x = h.toString('hex'); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`; };

(async () => {
  fs.mkdirSync(root, { recursive: true });
  skinmod.init(root);
  const gameDir = path.join(root, 'instances', 'prueba');
  fs.mkdirSync(gameDir, { recursive: true });
  const r = await skinmod.ensure(gameDir, { mc: MC, loader: layer, enabled: true, panelBase: 'https://panel.onyxclient.site', capes: false }, { fetchJson, downloadFile });
  console.log('[prueba] mod de skins:', JSON.stringify(r), fs.readdirSync(path.join(gameDir, 'mods')));
  if (r.status !== 'ok') throw new Error('No se preparó el mod de skins');
  let log = '', done = false;
  const finish = (ok, why) => { if (done) return; done = true; console.log(`\n[prueba] ${ok ? 'BIEN' : 'MAL'}: ${why}`); try { child.kill('SIGKILL'); } catch { /* */ } setTimeout(() => process.exit(ok ? 0 : 1), 1500); };
  const child = await game.launch(root, {
    instance: { id: 'prueba', minecraft: MC, loader: layer, memoryMb: 2048 },
    account: { type: 'offline', name: 'KopiPrueba', uuid: offlineUuid('KopiPrueba') },
    settings: { fastDownload: true }, launcherVersion: 'prueba',
    progress: (p) => { if (p.stage !== 'assets') console.log('[prueba]', p.stage, p.done != null ? `${p.done}/${p.total}` : ''); },
    onLog: (t) => {
      log += t; process.stdout.write(t);
      const fabric = /Loading \d+ mods|Fabric Loader/i.test(log), csl = /customskinloader/i.test(log);
      if (/Sound engine started|Created: \d+x\d+x\d+ minecraft:textures\/atlas/.test(log) && fabric && csl) finish(true, 'el juego arrancó con Fabric y CustomSkinLoader');
      if (/Exception in thread "main"|Incompatible mods found|---- Minecraft Crash Report ----/.test(t)) finish(false, 'el juego se cerró con un error');
    },
    onExit: (code) => finish(false, 'el juego se cerró (código ' + code + ') antes de llegar al menú')
  });
  setTimeout(() => finish(/Loading \d+ mods/.test(log) && /customskinloader/i.test(log) && !/Crash Report/.test(log), 'tiempo agotado (se mira si al menos cargó Fabric y el mod)'), 300000);
})().catch((e) => { console.error('[prueba] Error:', e.stack || e.message); process.exit(1); });
