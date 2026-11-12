// Descargas con verificación SHA-1, reintentos y concurrencia.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = 'OnyxClient/1.0 (+https://github.com)';

async function fetchJson(url, opts = {}) {
  const res = await fetchRetry(url, opts);
  return res.json();
}

async function fetchRetry(url, opts = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} en ${url}`);
        err.status = res.status;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err;
        throw Object.assign(err, { retry: true });
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (e.status && !e.retry) throw e;
      await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// ¿El archivo ya está bien? (por tamaño rápido o sha1 si se pide verificación completa)
async function isValid(file, { sha1, size, verify }) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  if (size && st.size !== size) return false;
  if (verify && sha1) return (await sha1File(file)) === sha1.toLowerCase();
  if (!size && sha1 && st.size === 0) return false;
  return true;
}

async function downloadFile(task) {
  const { dest, sha1 } = task;
  if (await isValid(dest, task)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // task.urls = servidores de reserva (se prueban en orden si el primero no tiene el archivo)
  const urls = [task.url, ...(task.urls || [])].filter(Boolean);
  let res, lastErr;
  for (const u of [...new Set(urls)]) {
    try { res = await fetchRetry(u, {}, u === urls[urls.length - 1] ? 3 : 1); break; } catch (e) { lastErr = e; }
  }
  if (!res) throw lastErr || new Error(`Sin dirección para ${path.basename(dest)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha1) {
    const got = crypto.createHash('sha1').update(buf).digest('hex');
    if (got !== sha1.toLowerCase()) throw new Error(`Archivo corrupto (sha1) ${path.basename(dest)}`);
  }
  const tmp = dest + '.part';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  if (task.executable && process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  return true;
}

// Descarga una lista de tareas en paralelo. onProgress(done, total, bytes)
async function downloadAll(tasks, { concurrency = 8, onProgress } = {}) {
  let index = 0, done = 0;
  const total = tasks.length;
  const errors = [];
  async function worker() {
    while (index < tasks.length) {
      const t = tasks[index++];
      try { await downloadFile(t); } catch (e) { errors.push(e); }
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, tasks.length)) }, worker));
  if (errors.length) {
    const e = new Error(`${errors.length} archivo(s) no se pudieron descargar. ${errors[0].message}`);
    e.errors = errors;
    throw e;
  }
}

module.exports = { fetchJson, fetchRetry, downloadFile, downloadAll, sha1File, isValid, UA };
