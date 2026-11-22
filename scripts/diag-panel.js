// Diagnóstico (solo lectura) del panel: qué contesta cada parte que usa el launcher.
const P = 'https://panel.onyxclient.site';
(async () => {
  const show = async (name, url, opts) => { const t = Date.now(); try { const r = await fetch(url, opts); const txt = await r.text(); console.log(`${r.status >= 500 ? 'MAL' : 'ok '} ${r.status} ${name} (${Date.now() - t} ms) ${txt.slice(0, process.env.FULL === name ? 20000 : 220).replace(/\s+/g, ' ')}`); return txt; } catch (e) { console.log(`ERR ${name}: ${e.message}`); } };
  await show('status', `${P}/api/public/status`);
  await show('neterrs', `${P}/api/public/neterrs?h=48`);
  await show('hello', `${P}/api/hello`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ install: 'diag', version: '1.8.6', platform: 'linux' }) });
  const a = JSON.parse(await show('auth', `${P}/api/l/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'KopiDiagnostico' }) }) || '{}');
  const H = { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' };
  for (const r of ['instances', 'me', 'public', 'badges', 'streams', 'news', 'notifications', 'friends', 'skins', 'events']) await show('GET ' + r, `${P}/api/l/${r}`, { headers: H });
  await show('POST neterr', `${P}/api/l/neterr`, { method: 'POST', headers: H, body: JSON.stringify({ host: 'diag.example', kind: 'other', os: 'linux' }) });
  for (let i = 0; i < 4; i++) await show('POST neterr sin cuenta ' + i, `${P}/api/l/neterr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'diag' + i + '.example', kind: 'cert', chrome: 'x', node: 'y', version: '1.8.6', os: 'win32' }) });
  await show('POST play falso', `${P}/api/l/play`, { method: 'POST', headers: H, body: JSON.stringify({ instance: 'no-existe' }) });
  await show('POST beat falso', `${P}/api/l/beat`, { method: 'POST', headers: H, body: JSON.stringify({ play: 'no-existe' }) });
  await show('POST guard/frame falso', `${P}/api/l/guard/frame`, { method: 'POST', headers: H, body: JSON.stringify({ play: 'no-existe', frame: null }) });
  await show('POST perf (sin partida)', `${P}/api/l/perf`, { method: 'POST', headers: H, body: JSON.stringify({ play: 'x' }) });
})();
