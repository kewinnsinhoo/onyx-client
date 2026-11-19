// Guardado de ajustes y cuentas en disco. Los tokens van cifrados con safeStorage.
const fs = require('fs');
const path = require('path');

let safeStorage = null;
try { ({ safeStorage } = require('electron')); } catch { /* fuera de Electron (tests) */ }

class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = null;
  }
  load() {
    if (this.data) return this.data;
    try {
      this.data = { ...structuredClone(this.defaults), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      this.data = structuredClone(this.defaults);
    }
    return this.data;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
  get() { return this.load(); }
  set(patch) {
    this.load();
    this.data = deepMerge(this.data, patch);
    this.save();
    return this.data;
  }
  replace(data) { this.data = data; this.save(); }
}

function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(out[k], v) : v;
  }
  return out;
}

function encrypt(text) {
  if (text == null) return null;
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(String(text)).toString('base64');
    }
  } catch { /* sin llavero disponible */ }
  return 'raw:' + Buffer.from(String(text)).toString('base64');
}

function decrypt(value) {
  if (!value) return null;
  try {
    if (value.startsWith('enc:') && safeStorage) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    }
    if (value.startsWith('raw:')) return Buffer.from(value.slice(4), 'base64').toString();
  } catch { /* token corrupto */ }
  return null;
}

const DEFAULT_SETTINGS = {
  language: 'es',
  theme: 'oled',
  hardwareAcceleration: true,
  reduceMotion: false,
  afterLaunch: 'minimize', // keep | minimize | hide | close
  memoryMb: 4096,
  windowWidth: '',
  windowHeight: '',
  fullscreen: false,
  fastDownload: true,
  javaPath: '',
  jvmArgs: '',
  updateChannel: 'stable',
  referral: null,
  discord: null,
  discordPresence: true, // mostrar "Jugando a Kopi Client" en Discord
  activeAccount: null,
  termsAccepted: false
};

module.exports = { JsonStore, encrypt, decrypt, DEFAULT_SETTINGS, deepMerge };
