// Carga onyx.config.json y define las carpetas del launcher.
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');

let config = {};
try {
  const raw = fs.readFileSync(path.join(ROOT, 'onyx.config.json'), 'utf8');
  config = JSON.parse(raw);
} catch (e) {
  console.error('[config] No se pudo leer onyx.config.json', e);
}

function isPlaceholder(v) {
  return !v || /PON-AQUI|TU-USUARIO|TU-INVITACION/.test(v);
}

// Carpeta de datos del juego (versiones, librerías, instancias...)
function gameRoot() {
  if (process.env.ONYX_GAME_DIR) return process.env.ONYX_GAME_DIR;
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '.onyxclient');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'onyxclient');
  }
  return path.join(home, '.onyxclient');
}

module.exports = { config, isPlaceholder, gameRoot, ROOT };
