// Rendimiento: lo que el launcher puede medir de una partida sin meter nada en el juego.
// Minecraft no le dice al launcher sus FPS, así que se mide lo que sí se ve desde fuera:
//   - cuánto tarda en cargar (desde Jugar hasta que suena el juego)
//   - cuánta memoria del PC usa Java (el pico), comparada con la asignada y con la del PC
//   - qué PC tiene el jugador (RAM, procesador, núcleos y, si el registro lo dice, la gráfica)
//   - cuántos mods lleva la carpeta
// Al cerrar se manda un resumen al panel para que el studio sepa si la instancia pesa demasiado.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Minecraft escribe esto cuando ya ha cargado y está en el menú (1.13+ y versiones antiguas)
const READY_RE = /Sound engine started|SoundSystem Starting|Created: \d+x\d+(x\d+)? (minecraft:)?textures[-/]atlas/;
// La gráfica: la escriben Sodium, Iris, Forge, OptiFine o el informe de error
const GPU_RES = [
  /OpenGL Renderer: ?([^\r\n]+)/i,
  /GL_RENDERER: ?([^\r\n]+)/i,
  /Backend library: [^\r\n]*\r?\n[^\r\n]*?GL info: ([^\r\n]+?) GL version/i,
  /OpenGL: ([^\r\n]+?) GL version/i,
  /Graphics card #0 name: ([^\r\n]+)/i,
  /\bRenderer: ([^\r\n]*(NVIDIA|GeForce|Radeon|AMD|Intel|Apple|Iris|UHD|Arc)[^\r\n]*)/i
];

const cleanGpu = (s) => String(s || '').replace(/\/PCIe\/SSE2|\(TM\)|\(R\)|Microsoft Corporation - /gi, '').replace(/\s+/g, ' ').trim().slice(0, 80);

function gpuIn(text) {
  for (const re of GPU_RES) { const m = re.exec(text); if (m) { const g = cleanGpu(m[1]); if (g && !/^(null|unknown)$/i.test(g)) return g; } }
  return null;
}

// Memoria de un proceso en MB (Windows: tasklist; Mac y Linux: ps)
function rssOf(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve(null);
    const done = (err, out) => {
      if (err || !out) return resolve(null);
      let kb;
      if (process.platform === 'win32') {
        const cols = String(out).trim().split('","');
        kb = Number(String(cols[cols.length - 1] || '').replace(/[^\d]/g, ''));
      } else kb = Number(String(out).trim());
      resolve(Number.isFinite(kb) && kb > 0 ? Math.round(kb / 1024) : null);
    };
    try {
      if (process.platform === 'win32') execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 8000 }, done);
      else execFile('ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 8000 }, done);
    } catch { resolve(null); }
  });
}

function countMods(gameDir) {
  try { return fs.readdirSync(path.join(gameDir, 'mods')).filter(f => /\.jar$/i.test(f)).length; } catch { return 0; }
}

function pc() {
  const cpus = os.cpus() || [];
  return {
    ramMb: Math.round(os.totalmem() / 1048576),
    cpu: String((cpus[0] && cpus[0].model) || '').replace(/\(TM\)|\(R\)|CPU|@.*$|\s\d+-Core Processor/gi, '').replace(/\s+/g, ' ').trim().slice(0, 80),
    cores: cpus.length,
    os: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
  };
}

// Empieza a medir una partida. Devuelve { log(text), finish({ crash }) → resumen }
function track({ pid, startedAt, memoryMb, gameDir, perfMode, every = 20000, firstDelay = 5000, sample = rssOf }) {
  const t0 = startedAt || Date.now();
  let loadMs = null, gpu = null, peak = 0, samples = 0, sum = 0, buf = '', lines = 0;
  const tick = async () => {
    const mb = await sample(pid);
    if (mb) { peak = Math.max(peak, mb); samples++; sum += mb; }
  };
  const first = setTimeout(tick, firstDelay);
  const iv = setInterval(tick, every);
  if (iv.unref) iv.unref();
  if (first.unref) first.unref();
  return {
    log(text) {
      if ((loadMs !== null && gpu) || ++lines > 5000) return; // ya está todo (o el registro no lo dice)
      buf = (buf + text).slice(-8000);
      if (loadMs === null && READY_RE.test(text)) loadMs = Date.now() - t0;
      if (!gpu) gpu = gpuIn(buf);
    },
    finish({ crash } = {}) {
      clearInterval(iv); clearTimeout(first);
      const minutes = Math.round((Date.now() - t0) / 60000);
      return {
        loadMs, minutes,
        memPeakMb: peak || null, memAvgMb: samples ? Math.round(sum / samples) : null, memAllocMb: memoryMb || null,
        mods: countMods(gameDir), perfMode: !!perfMode,
        ...pc(), gpu,
        crash: crash ? { kind: crash.kind, mod: (crash.vars && (crash.vars.mod || crash.vars.vendor)) || null } : null
      };
    }
  };
}

module.exports = { track, gpuIn, rssOf, pc, READY_RE };
