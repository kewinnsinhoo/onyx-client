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

// Launcher de marca: brand.json lo pone la fábrica de launchers (scripts/brand.js).
// Sin ese archivo, es el Kopi Client normal.
let brand = null;
try {
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand.json'), 'utf8'));
  if (b && /^[a-z][a-z0-9-]{1,31}$/.test(b.id || '')) {
    brand = b;
    config = { ...config, ...(b.config || {}) };
  }
} catch { /* sin marca */ }
config.brand = brand;

function isPlaceholder(v) {
  return !v || /PON-AQUI|TU-USUARIO|TU-INVITACION/.test(v);
}

// Carpeta de datos del juego (versiones, librerías, instancias...)
function gameRoot() {
  if (process.env.ONYX_GAME_DIR) return process.env.ONYX_GAME_DIR;
  const home = os.homedir();
  // Cada launcher de marca guarda sus instancias aparte
  const name = brand ? `onyx-${brand.id}` : 'onyxclient';
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '.' + name);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', name);
  }
  return path.join(home, '.' + name);
}

module.exports = { config, brand, isPlaceholder, gameRoot, ROOT };
