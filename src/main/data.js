// Lee el contenido publicado en el repo "onyx-data" de GitHub (con caché local por si no hay internet).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config, isPlaceholder } = require('./config');

let cacheDir;
const memory = new Map();

function init(userData) { cacheDir = path.join(userData, 'cache', 'data'); }

function baseUrl() {
  return isPlaceholder(config.dataUrl) ? null : config.dataUrl.replace(/\/$/, '');
}

// Obtiene un JSON (p. ej. "studios.json") del repo de datos.
async function getJson(rel, { maxAge = 60e3, fallback = null } = {}) {
  const hit = memory.get(rel);
  if (hit && Date.now() - hit.t < maxAge) return hit.v;
  const cacheFile = path.join(cacheDir, rel.replace(/[\\/]/g, '__'));
  const base = baseUrl();
  if (base) {
    try {
      const res = await fetch(`${base}/${rel}?t=${Math.floor(Date.now() / maxAge)}`, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const v = JSON.parse(text);
        memory.set(rel, { t: Date.now(), v });
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cacheFile, text);
        return v;
      }
      if (res.status === 404) return fallback;
    } catch { /* sin conexión: usar caché */ }
  }
  try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { return fallback; }
}

async function getText(rel, fallback = '') {
  const base = baseUrl();
  if (!base) return fallback;
  try {
    const res = await fetch(`${base}/${rel}?t=${Math.floor(Date.now() / 60e3)}`);
    if (res.ok) return await res.text();
  } catch { /* nada */ }
  return fallback;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

module.exports = { init, getJson, getText, hashCode, baseUrl };
