// Prueba real de las conexiones del launcher dentro de Electron (la lanza .github/workflows/prueba-red.yml).
// Comprueba que se conecta como Chrome (net.fetch) con lo que usa el launcher: GET con User-Agent y tiempo límite,
// redirecciones de GitHub, POST con JSON, POST con datos binarios, y que un fallo da un error claro.
const { app } = require('electron');
const net = require('../src/main/net');

let chrome = 0;
net.install({ log: console, chromium: () => { const f = net.chromiumFetch(); return f && ((u, o) => { chrome++; return f(u, o); }); } });

const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push(['✓', name]); } catch (e) { checks.push(['✗', name + ' → ' + (e.stack || e.message)]); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

app.whenReady().then(async () => {
  await check('GET con User-Agent y tiempo límite (GitHub API)', async () => {
    const r = await fetch('https://api.github.com/repos/kewinnsinhoo/onyx-client', { headers: { 'User-Agent': 'KopiClient/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    assert(r.ok, 'HTTP ' + r.status); assert((await r.json()).name === 'onyx-client', 'json raro');
  });
  await check('Redirección de GitHub y texto (latest-mac.yml)', async () => {
    const r = await fetch('https://github.com/kewinnsinhoo/onyx-client/releases/latest/download/latest-mac.yml', { cache: 'no-store' });
    assert(r.ok, 'HTTP ' + r.status); assert(/^version:/m.test(await r.text()), 'no es latest-mac.yml');
  });
  await check('Descarga binaria con arrayBuffer (manifiesto de Mojang)', async () => {
    const r = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    assert(r.ok, 'HTTP ' + r.status); const b = Buffer.from(await r.arrayBuffer()); assert(b.length > 10000, 'muy pequeño');
  });
  await check('Leer la descarga a trozos (body.getReader)', async () => {
    const r = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const reader = r.body.getReader(); let n = 0; for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; } assert(n > 10000, 'vacío');
  });
  await check('POST con JSON (panel: hello)', async () => {
    const r = await fetch('https://panel.onyxclient.site/api/hello', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ install: 'prueba-red-ci', version: '0.0.0', platform: process.platform }), signal: AbortSignal.timeout(15000) });
    assert(r.status < 500, 'HTTP ' + r.status);
  });
  await check('POST con datos binarios y Authorization (panel)', async () => {
    const r = await fetch('https://panel.onyxclient.site/api/l/preport/x/shot', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer prueba' }, body: Buffer.from([1, 2, 3]) });
    assert(r.status >= 400 && r.status < 500, 'esperaba 4xx y fue ' + r.status);
  });
  await check('Web que no existe → error claro (sin «fetch failed»)', async () => {
    try { await fetch('https://no-existe.kopi-prueba.invalid/x'); throw new Error('no falló'); } catch (e) {
      assert(e.code === 'net' && e.vars && e.vars.host === 'no-existe.kopi-prueba.invalid', 'error: ' + e.message);
      assert(!/fetch failed/.test(e.message), 'sigue diciendo fetch failed');
      console.log('  (tipo: ' + e.kind + ')');
    }
  });
  await check('Certificado malo → error de certificado con el nombre de la web', async () => {
    for (const h of ['wrong.host.badssl.com', 'self-signed.badssl.com', 'expired.badssl.com']) {
      try { await fetch(`https://${h}/`); throw new Error('no falló: ' + h); } catch (e) {
        console.log(`  ${h}: tipo=${e.kind} vars=${JSON.stringify(e.vars)} · ${e.detail}`);
        assert(e.code === 'net' && e.kind === 'cert' && e.vars && e.vars.host === h, 'mal: ' + h + ' ' + e.message);
        // así viaja al panel/pantalla (IPC): los datos siguen ahí
        const back = require('v8').deserialize(require('v8').serialize({ error: e.message, code: e.code, vars: e.vars }));
        assert(back.vars.host === h, 'se pierde el nombre al viajar');
      }
    }
  });
  await check('DNS seguro', async () => {
    const on = await net.secureDns({ log: console });
    console.log('  DNS seguro activado:', on);
    const r = await fetch('https://api.github.com/zen', { headers: { 'User-Agent': 'KopiClient' } });
    assert(r.ok, 'con DNS seguro no conecta: HTTP ' + r.status);
  });
  await check('Se usó la conexión de Chrome', async () => assert(chrome >= 6, 'Chrome se usó ' + chrome + ' veces'));
  for (const [m, n] of checks) console.log(`${m} ${n}`);
  app.exit(checks.some(c => c[0] === '✗') ? 1 : 0);
});
