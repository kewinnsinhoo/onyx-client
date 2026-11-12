// Actualizaciones automáticas desde GitHub Releases (electron-updater).
const { app } = require('electron');

let autoUpdater = null;
let checking = null;

function getUpdater() {
  if (autoUpdater) return autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { autoUpdater = null; }
  return autoUpdater;
}

// Busca y descarga la actualización. Resuelve con { status } cuando termina.
function check({ channel, send, log }) {
  if (checking) return checking;
  const up = getUpdater();
  if (!app.isPackaged || !up) return Promise.resolve({ status: 'dev' });

  checking = new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; checking = null; cleanup(); resolve(r); } };
    up.autoDownload = true;
    up.autoInstallOnAppQuit = true;
    up.allowPrerelease = channel === 'beta';
    up.logger = { info: (m) => log.info('[updater]', m), warn: (m) => log.warn('[updater]', m), error: (m) => log.error('[updater]', m), debug: () => {} };

    const on = {
      'checking-for-update': () => send('updater:event', { type: 'checking' }),
      'update-available': (i) => send('updater:event', { type: 'available', version: i.version }),
      'update-not-available': () => done({ status: 'latest' }),
      'download-progress': (p) => send('updater:event', { type: 'progress', percent: p.percent }),
      'update-downloaded': (i) => done({ status: 'downloaded', version: i.version }),
      error: (e) => { log.warn('[updater] ' + (e && e.message)); done({ status: 'error', error: e && e.message }); }
    };
    const cleanup = () => { for (const [k, fn] of Object.entries(on)) up.removeListener(k, fn); };
    for (const [k, fn] of Object.entries(on)) up.on(k, fn);
    // Si GitHub tarda demasiado, seguimos (el launcher no se queda bloqueado).
    setTimeout(() => done({ status: 'timeout' }), 20000);
    up.checkForUpdates().catch((e) => done({ status: 'error', error: e.message }));
  });
  return checking;
}

function install() {
  const up = getUpdater();
  if (up) setImmediate(() => up.quitAndInstall(true, true));
  return true;
}

module.exports = { check, install };
