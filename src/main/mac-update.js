// Actualizaciones en Mac sin certificado de Apple.
// El sistema normal (Squirrel.Mac, que usa electron-updater) solo instala apps firmadas con un certificado de pago
// de Apple: con la firma ad-hoc gratis descarga la versión nueva pero no la instala nunca y el launcher se queda
// en «Instalando actualización…». Aquí se hace a mano:
//   1. Se lee latest-mac.yml del mismo sitio que usa electron-updater (app-update.yml dentro de la app).
//   2. Si hay versión nueva, se descarga el .zip de este Mac (Apple Silicon o Intel) y se comprueba su sha512.
//   3. Al instalar: se descomprime con ditto, se cierra el launcher y un pequeño script cambia la app vieja
//      por la nueva en el mismo sitio y la vuelve a abrir.
const electron = () => require('electron'); // solo dentro de la app (las pruebas no lo cargan)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const DEFAULT_FEED = 'https://github.com/kewinnsinhoo/onyx-client/releases/latest/download';
let pending = null; // { version, zip }

function feedUrl() {
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const m = /^url:\s*['"]?([^'"\r\n]+)/m.exec(yml);
    if (m) return m[1].trim().replace(/\/+$/, '');
  } catch { /* sin app-update.yml */ }
  return DEFAULT_FEED;
}

// Lee lo que hace falta de latest-mac.yml (versión y archivos .zip con su sha512)
function parseYml(text) {
  const version = (/^version:\s*['"]?([^'"\r\n]+)/m.exec(text) || [])[1];
  const files = [];
  const re = /-\s+url:\s*['"]?([^'"\r\n]+)['"]?\s*\r?\n\s+sha512:\s*['"]?([^'"\r\n]+)['"]?(?:\s*\r?\n\s+size:\s*(\d+))?/g;
  let m;
  while ((m = re.exec(text))) files.push({ url: m[1].trim(), sha512: m[2].trim(), size: Number(m[3]) || 0 });
  return { version: version && version.trim(), files };
}

// El .zip de este Mac: arm64 para Apple Silicon, el otro para Intel
function pickZip(files, arch = process.arch) {
  const zips = files.filter(f => /\.zip$/i.test(f.url));
  if (arch === 'arm64') return zips.find(f => /arm64/i.test(f.url)) || null;
  return zips.find(f => !/arm64/i.test(f.url)) || null;
}

// ¿a es más nueva que b? (1.8.1 > 1.8.0; 1.9.0 > 1.9.0-beta.2)
function newer(a, b) {
  const p = (v) => { const [main, pre] = String(v || '').replace(/^v/, '').split('-'); return { n: main.split('.').map(x => Number(x) || 0), pre: pre || null }; };
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x.n[i] || 0) !== (y.n[i] || 0)) return (x.n[i] || 0) > (y.n[i] || 0);
  if (x.pre && !y.pre) return false;
  if (!x.pre && y.pre) return true;
  return !!(x.pre && y.pre && x.pre.localeCompare(y.pre, undefined, { numeric: true }) > 0);
}

async function check({ send, log }) {
  const { app, net } = electron();
  const feed = feedUrl();
  const r = await net.fetch(`${feed}/latest-mac.yml?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`latest-mac.yml: HTTP ${r.status}`);
  const info = parseYml(await r.text());
  if (!info.version || !newer(info.version, app.getVersion())) return { status: 'latest' };
  const file = pickZip(info.files);
  if (!file) throw new Error('No hay .zip para este Mac en latest-mac.yml');
  log.info(`[updater mac] ${app.getVersion()} → ${info.version}: ${file.url}`);
  send('updater:event', { type: 'available', version: info.version });

  const zip = path.join(app.getPath('temp'), `kopi-update-${info.version}-${process.arch}.zip`);
  const res = await net.fetch(/^https?:/.test(file.url) ? file.url : `${feed}/${encodeURIComponent(file.url)}`);
  if (!res.ok || !res.body) throw new Error(`Descarga: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || file.size || 0;
  const hash = crypto.createHash('sha512');
  const out = fs.createWriteStream(zip);
  const reader = res.body.getReader();
  let got = 0, lastSent = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const buf = Buffer.from(value);
    hash.update(buf); got += buf.length;
    if (!out.write(buf)) await new Promise(ok => out.once('drain', ok));
    if (total && Date.now() - lastSent > 200) { lastSent = Date.now(); send('updater:event', { type: 'progress', percent: Math.min(100, got * 100 / total) }); }
  }
  await new Promise((ok, ko) => out.end(err => (err ? ko(err) : ok())));
  if (hash.digest('base64') !== file.sha512) { try { fs.unlinkSync(zip); } catch { /* */ } throw new Error('La descarga no coincide (sha512)'); }
  pending = { version: info.version, zip };
  return { status: 'downloaded', version: info.version };
}

const run = (cmd, args) => new Promise((ok, ko) => execFile(cmd, args, { timeout: 180000 }, (e, so, se) => (e ? ko(new Error(String(se || e.message).trim())) : ok())));

// Cambia la app vieja por la nueva. Devuelve { ok: false, reason } si no se puede (y el launcher sigue abierto).
async function install({ log }) {
  const { app } = electron();
  if (!pending) return { ok: false, reason: 'none' };
  // La app que está abierta: …/Kopi Client.app/Contents/MacOS/Kopi Client
  const appPath = path.resolve(process.execPath, '..', '..', '..');
  if (!/\.app$/i.test(appPath)) return { ok: false, reason: 'path' };
  if (appPath.startsWith('/Volumes/') || /AppTranslocation/.test(appPath)) return { ok: false, reason: 'dmg' }; // abierta desde el .dmg o desde Descargas sin mover
  try { fs.accessSync(path.dirname(appPath), fs.constants.W_OK); fs.accessSync(appPath, fs.constants.W_OK); } catch { return { ok: false, reason: 'perm' }; }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-update-'));
  try { await run('/usr/bin/ditto', ['-x', '-k', pending.zip, dir]); } catch (e) { log.warn('[updater mac] ditto: ' + e.message); return { ok: false, reason: 'unzip' }; }
  const newApp = fs.readdirSync(dir).find(f => /\.app$/i.test(f));
  if (!newApp) return { ok: false, reason: 'unzip' };

  const script = path.join(dir, 'install.sh');
  fs.writeFileSync(script, `#!/bin/bash
# Espera a que se cierre el launcher, cambia la app y la vuelve a abrir
PID="$1"; OLD="$2"; NEW="$3"; ZIP="$4"
for i in $(seq 1 100); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
if mv "$OLD" "$OLD.kopi-old" 2>/dev/null; then
  if mv "$NEW" "$OLD"; then rm -rf "$OLD.kopi-old"; rm -f "$ZIP"; else mv "$OLD.kopi-old" "$OLD"; fi
fi
xattr -dr com.apple.quarantine "$OLD" 2>/dev/null
open "$OLD"
`, { mode: 0o755 });
  log.info(`[updater mac] Instalando ${pending.version} en ${appPath}`);
  spawn('/bin/bash', [script, String(process.pid), appPath, path.join(dir, newApp), pending.zip], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.exit(0), 300);
  return { ok: true };
}

module.exports = { check, install, parseYml, pickZip, newer };
