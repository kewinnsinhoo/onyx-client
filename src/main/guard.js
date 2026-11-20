// KopiGuard: el vigilante del launcher mientras se juega (solo si el studio lo activó en la instancia).
//
// Avisa al panel de:
//   mod      → un mod que no es del studio (al empezar o añadido durante la partida)
//   pack     → un paquete de texturas o de shaders que no es del studio (si el studio no los permite)
//   file     → un archivo del studio cambiado durante la partida, o uno nuevo en config/
//   program  → un programa de trampas abierto (autoclicker, inyector…)
// De los programas abiertos solo se mandan los que coinciden con la lista del studio: nunca la lista completa.
// Lo que el propio juego escribe (opciones, servidores, registros, capturas, mundos…) no cuenta.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const Sync = require('./sync');

// Archivos y carpetas que Minecraft escribe solo: cambiarlos no es hacer trampas
const GAME_WRITES = /^(options\.txt|optionsof\.txt|optionsshaders\.txt|servers\.dat(_old)?|usercache\.json|usernamecache\.json|realms_persistence\.json|command_history\.txt|hotbar\.nbt|patchouli_data\.json|launcher_profiles\.json)$|^(logs|crash-reports|screenshots|saves|backups|debug|downloads|\.fabric|\.cache|\.mixin\.out|journeymap\/data|xaero|schematics)\//i;
const PACK_DIRS = ['resourcepacks', 'shaderpacks'];
// Programas que nunca cuentan aunque su ventana diga «auto clicker» (un vídeo en el navegador, un chat…)
const SAFE_APPS = /^(chrome|msedge|firefox|opera|opera_gx|brave|vivaldi|safari|arc|discord|discordptb|discordcanary|explorer|finder|code|notepad|notepad\+\+|obs|obs64|obs32|streamlabs|spotify|steam|steamwebhelper|telegram|whatsapp|slack|teams|zoom|javaw?|minecraft|kopi client|onyx client|electron)(\.exe)?$/i;

const squash = (v) => String(v || '').toLowerCase().replace(/[\s_.-]+/g, '');
const isJar = (rel) => /\.jar$/i.test(rel);
const isKopi = (rel) => /^kopi-(skins|perf)-/i.test(path.posix.basename(rel));
const under = (rel, base) => rel === base || rel.startsWith(base + '/');
const packOf = (rel) => { const [top, name] = rel.split('/'); return PACK_DIRS.includes(top) && name ? `${top}/${name}` : null; };

function statOf(abs) { try { const s = fs.statSync(abs); return s.isFile() ? `${s.size}:${Math.round(s.mtimeMs)}` : null; } catch { return null; } }
// Huella corta de un programa (para reconocerlo aunque le cambien el nombre). Solo archivos de menos de 150 MB.
function shortHash(abs) {
  try { const s = fs.statSync(abs); if (!s.isFile() || s.size > 150 * 1024 * 1024) return ''; return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16); }
  catch { return ''; }
}

// ---------------------------------------------------------------- archivos
// Lo que hay al empezar y no es del studio. managed = rutas que pone el studio (relativas, con «/»).
function foreign(gameDir, managed, { packsOk } = {}) {
  const own = new Set((managed || []).map(r => Sync.norm(r)).filter(Boolean).map(r => r.toLowerCase()));
  const files = Sync.listFiles(gameDir);
  const mods = files.filter(r => under(r, 'mods') && isJar(r) && !isKopi(r) && !own.has(r.toLowerCase()));
  const packs = packsOk ? [] : [...new Set(files.map(packOf).filter(Boolean))].filter(p => ![...own].some(o => o === p.toLowerCase() || o.startsWith(p.toLowerCase() + '/')));
  return { mods, packs };
}

// Foto de lo que se vigila: mods/, paquetes, config/ y los archivos del studio (tamaño y fecha; huella si cambia)
function snapshot(gameDir, managed) {
  const files = Sync.listFiles(gameDir);
  const own = new Set((managed || []).map(r => Sync.norm(r)).filter(Boolean));
  const snap = new Map();
  for (const rel of files) {
    if (GAME_WRITES.test(rel)) continue;
    const watched = under(rel, 'mods') || under(rel, 'config') || PACK_DIRS.some(d => under(rel, d)) || own.has(rel);
    if (watched) snap.set(rel, statOf(path.join(gameDir, rel)));
  }
  return snap;
}

// Qué cambió entre dos fotos → avisos
function compare(gameDir, before, after, managed, { packsOk } = {}) {
  const own = new Set((managed || []).map(r => Sync.norm(r)).filter(Boolean));
  const mods = [], packs = new Set(), changed = [], fresh = [];
  for (const [rel, st] of after) {
    const old = before.get(rel);
    if (old === undefined) {
      if (under(rel, 'mods')) { if (isJar(rel) && !isKopi(rel)) mods.push(rel); }
      else if (packOf(rel)) { if (!packsOk && !own.has(rel)) packs.add(packOf(rel)); }
      else if (under(rel, 'config') && !own.has(rel)) fresh.push(rel);
    } else if (old !== st && own.has(rel) && !under(rel, 'mods')) {
      changed.push(rel);
    }
  }
  return { mods, packs: [...packs], changed, fresh };
}

// ---------------------------------------------------------------- programas
// Programas abiertos: [{ name, path, title }]. Solo se usan aquí, para buscar coincidencias.
function listProcesses() {
  return new Promise((resolve) => {
    const done = (err, out) => resolve(err ? [] : parseProcesses(String(out || ''), process.platform));
    if (process.platform === 'win32') {
      const ps = "Get-Process | ForEach-Object { $_.ProcessName + '|' + $_.Path + '|' + $_.MainWindowTitle }";
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 }, done);
    } else {
      execFile('ps', ['-axo', 'comm='], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, done);
    }
  });
}
function parseProcesses(out, platform) {
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (platform === 'win32') {
      const [name, p, ...title] = line.split('|');
      rows.push({ name: (name || '').trim(), path: (p || '').trim(), title: title.join('|').trim() });
    } else {
      const p = line.trim();
      rows.push({ name: path.basename(p), path: p.startsWith('/') ? p : '', title: '' });
    }
  }
  return rows;
}
// Coincidencias con la lista del studio ({ m: texto en minúsculas, n: nombre que se ve, s: gravedad })
function matchPrograms(procs, programs) {
  const hits = [], seen = new Set();
  for (const p of procs) {
    const base = String(p.name || '').toLowerCase();
    const file = path.basename(String(p.path || '').replace(/\\/g, '/')).toLowerCase();
    const title = SAFE_APPS.test(base) || SAFE_APPS.test(file) ? '' : String(p.title || '').toLowerCase();
    // sin espacios ni guiones también («ProcessHacker» = «process hacker»)
    const hay = [base, file.replace(/\.(exe|app)$/, ''), title].filter(Boolean).flatMap(h => [h, squash(h)]);
    const rule = (programs || []).find(r => r && r.m && hay.some(h => h.includes(String(r.m).toLowerCase()) || h.includes(squash(r.m))));
    if (!rule) continue;
    const key = (p.path || base).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ rule, proc: p });
  }
  return hits;
}

// ---------------------------------------------------------------- vigilar una partida
// opts: { gameDir, manifest, managed, initial (lo de foreign() antes de esconder los mods), report(events) → Promise<{ kick }>, onKick(), timers?, list? }
function start(opts) {
  const g = (opts.manifest && opts.manifest.guard) || {};
  if (!g.enabled) return () => {};
  const { gameDir } = opts;
  const managed = opts.managed || [];
  const packsOk = !!g.packsOk;
  const T = { files: 15e3, programs: 30e3, grace: 60e3, flush: 3e3, ...(opts.timers || {}) };
  const list = opts.list || listProcesses;
  const mods = (opts.manifest.files || []).map(f => Sync.norm(f && f.path)).filter(r => r && under(r, 'mods') && isJar(r)).map(r => path.posix.basename(r)).slice(0, 300);
  const queue = [], sentKeys = new Set();
  const timers = [];
  let stopped = false, before = null, flushing = false;

  const push = (e) => {
    const key = `${e.type}:${e.detail}`;
    if (sentKeys.has(key)) return; // la misma cosa, una vez por partida
    sentKeys.add(key);
    queue.push({ ...e, mods });
  };
  async function flush() {
    if (stopped || flushing || !queue.length) return;
    flushing = true;
    const batch = queue.splice(0, 10);
    try {
      const r = await opts.report(batch);
      if (r && r.kick && !stopped) opts.onKick && opts.onKick();
    } catch { queue.unshift(...batch.filter(() => queue.length < 50)); }
    finally { flushing = false; }
  }
  const list3 = (a) => a.length > 1 ? { items: a } : {};

  // 1) al empezar: mods y paquetes que no son del studio
  const f = opts.initial || foreign(gameDir, managed, { packsOk });
  if (f.mods.length) push({ type: 'mod', severity: 'high', detail: `Mod que no es de la instancia: ${f.mods[0]}`, ...list3(f.mods) });
  if (f.packs.length) push({ type: 'pack', severity: 'medium', detail: `Paquete que no es de la instancia: ${f.packs[0]}`, ...list3(f.packs) });

  // 2) durante la partida: cambios en los archivos (tras un rato, cuando el juego ya escribió lo suyo)
  const watchFiles = () => {
    if (stopped) return;
    const now = snapshot(gameDir, managed);
    if (!before) { before = now; return; }
    const c = compare(gameDir, before, now, managed, { packsOk });
    if (c.mods.length) push({ type: 'mod', severity: 'high', detail: `Mod añadido: ${c.mods[0]}`, ...list3(c.mods) });
    if (c.packs.length) push({ type: 'pack', severity: 'medium', detail: `Paquete añadido: ${c.packs[0]}`, ...list3(c.packs) });
    for (const rel of c.changed) push({ type: 'file', severity: 'medium', detail: `Archivo cambiado: ${rel}` });
    if (c.fresh.length) push({ type: 'file', severity: 'low', detail: `Archivo nuevo en config: ${c.fresh[0]}`, ...list3(c.fresh) });
    // los cambios ya avisados pasan a ser lo normal (no se repiten)
    before = now;
  };
  timers.push(setTimeout(() => { watchFiles(); timers.push(setInterval(watchFiles, T.files)); }, T.grace));

  // 3) programas de trampas abiertos
  const watchPrograms = async () => {
    if (stopped) return;
    const procs = await list().catch(() => []);
    for (const { rule, proc } of matchPrograms(procs, g.programs)) {
      const shown = proc.path ? path.basename(proc.path.replace(/\\/g, '/')) : proc.name;
      push({
        type: 'program', severity: rule.s === 'medium' || rule.s === 'low' ? rule.s : 'high',
        detail: `${rule.n} abierto: ${shown}`,
        process: { name: shown, path: proc.path || '', hash: proc.path ? shortHash(proc.path) : '' }
      });
    }
  };
  watchPrograms();
  timers.push(setInterval(watchPrograms, T.programs));
  timers.push(setInterval(flush, T.flush));
  setTimeout(flush, 0);

  return () => {
    if (stopped) return;
    flush(); // lo último que quedó
    stopped = true;
    for (const t of timers) { clearTimeout(t); clearInterval(t); }
  };
}

module.exports = { start, foreign, snapshot, compare, matchPrograms, parseProcesses, listProcesses, GAME_WRITES };
