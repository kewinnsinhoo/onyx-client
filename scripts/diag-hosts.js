// Diagnóstico (solo lectura): entra como un jugador no premium de prueba, mira las instancias y comprueba el
// certificado de cada web desde la que el launcher descarga algo. Lo lanza .github/workflows/diagnostico-webs.yml
const tls = require('tls');
const P = 'https://panel.onyxclient.site';
const NAME = process.argv[2] || 'colonizado';

function cert(host) {
  return new Promise((ok) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const c = s.getPeerCertificate();
      ok({ ok: s.authorized, err: s.authorizationError || null, until: c.valid_to, issuer: c.issuer && (c.issuer.O || c.issuer.CN), subject: c.subject && c.subject.CN });
      s.end();
    });
    s.on('error', (e) => ok({ ok: false, err: e.code || e.message }));
    s.on('timeout', () => { ok({ ok: false, err: 'timeout' }); s.destroy(); });
  });
}

(async () => {
  const a = await (await fetch(`${P}/api/l/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'KopiDiagnostico' }) })).json();
  const H = { Authorization: `Bearer ${a.token}` };
  const list = (await (await fetch(`${P}/api/l/instances`, { headers: H })).json()).instances || [];
  console.log('Instancias que ve un no premium:', list.map(i => `${i.name} (${i.id})`).join(' | '));
  const targets = list.filter(i => String(i.name).toLowerCase().includes(NAME));
  const hosts = new Map();
  for (const it of targets.length ? targets : list) {
    const r = await fetch(`${P}/api/l/instance/${encodeURIComponent(it.id)}`, { headers: H });
    const j = await r.json();
    const text = JSON.stringify(j);
    const urls = [...new Set(text.match(/https?:\/\/[^"\\\s]+/g) || [])];
    const files = (j.instance && j.instance.files) || [];
    console.log(`\n== ${it.name}: ${files.length} archivos, ${urls.length} direcciones · MC ${j.instance && j.instance.minecraft} ${j.instance && j.instance.loader && j.instance.loader.type}`);
    for (const u of urls) { try { const h = new URL(u).hostname; if (!hosts.has(h)) hosts.set(h, []); hosts.get(h).push(u); } catch { console.log('  dirección rara:', u); } }
    const rel = files.filter(f => !/^https?:/.test(f.url || '')); if (rel.length) console.log('  archivos sin dirección completa:', rel.slice(0, 5).map(f => f.path + ' → ' + f.url));
  }
  console.log('\n== Webs y certificados');
  for (const [h, us] of hosts) {
    const c = await cert(h);
    let get = '';
    try { const r = await fetch(us[0], { method: 'GET', signal: AbortSignal.timeout(15000) }); get = `HTTP ${r.status}`; await r.body?.cancel(); } catch (e) { get = 'ERROR ' + (e.cause && (e.cause.code || e.cause.message) || e.message); }
    console.log(`${c.ok ? 'OK ' : 'MAL'} ${h} · ${us.length} archivos · cert: ${c.err || 'válido'} (hasta ${c.until || '?'}, de ${c.issuer || '?'}) · descarga: ${get}`);
    if (!c.ok || !/HTTP 2/.test(get)) console.log('     ej.:', us.slice(0, 3).join('  '));
  }
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
