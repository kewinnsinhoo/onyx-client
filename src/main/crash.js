// Arreglo de cierres: cuando Minecraft se cierra con un error, se mira el registro del juego, el informe de
// error (crash-reports/) y el de Java (hs_err_pid*.log) para decir en palabras sencillas qué pasó y qué hacer.
// Devuelve { kind, vars, fixes, lines, file } o null si el juego se cerró bien.
//   kind:  memory, heap, jvmargs, java, missing, incompatible, duplicate, corrupt, perf, mixin, driver, jvm, generic
//   fixes: lo que el launcher puede hacer con un botón ({ type: 'ram', mb } | 'repair' | 'perf' | 'java' | 'jvmargs'
//          | { type: 'drivers', vendor, url } | 'report')
// Los textos para el jugador están en el renderer (4 idiomas); aquí solo se decide qué pasó.
const fs = require('fs');
const path = require('path');

const DRIVERS = {
  amd: { re: /atio6axx|atioglxx|atig6pxx|amdxx|amdvlk|ati[a-z0-9]*\.dll/i, name: 'AMD', url: 'https://www.amd.com/es/support/download/drivers.html' },
  intel: { re: /ig[0-9]+icd(32|64)|igxelpicd|igdumd|igd10|ig9icd|ig75icd|ig4icd/i, name: 'Intel', url: 'https://www.intel.la/content/www/xl/es/support/detect.html' },
  nvidia: { re: /nvoglv(32|64)|nvwgf2um|nvd3dum/i, name: 'NVIDIA', url: 'https://www.nvidia.com/es-la/geforce/drivers/' }
};
const PERF_MODS = /sodium|lithium|ferrite-?core|entityculling|embeddium/i;

// El informe de error o de Java más nuevo de esta partida (los anteriores no cuentan)
function newest(dir, re, since) {
  try {
    const files = fs.readdirSync(dir).filter(f => re.test(f)).map(f => {
      const p = path.join(dir, f);
      return { p, t: fs.statSync(p).mtimeMs };
    }).filter(x => x.t >= since - 5000).sort((a, b) => b.t - a.t);
    return files[0] ? files[0].p : null;
  } catch { return null; }
}
function readHead(p, max = 256 * 1024) {
  try {
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(Math.min(max, fs.fstatSync(fd).size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch { return ''; }
}

// Las líneas que importan (para «Ver detalles»), sin repetir y sin pasarse
function keyLines(text, patterns, max = 12) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.length > 400) continue;
    if (patterns.some(r => r.test(l)) && !out.includes(l)) out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * ctx: { code, log, gameDir, startedAt, memoryMb, totalMemMb, customJava, jvmArgs, perfMode, stopped, kicked }
 */
function diagnose(ctx) {
  if (ctx.kicked || ctx.stopped) return null; // lo cerró el studio o el propio jugador
  const since = ctx.startedAt || 0;
  const reportFile = ctx.gameDir ? newest(path.join(ctx.gameDir, 'crash-reports'), /^crash-.*\.txt$/i, since) : null;
  const hsFile = ctx.gameDir ? newest(ctx.gameDir, /^hs_err_pid\d+\.log$/i, since) : null;
  const report = reportFile ? readHead(reportFile) : '';
  const hs = hsFile ? readHead(hsFile, 96 * 1024) : '';
  const log = String(ctx.log || '').slice(-400 * 1024);
  const all = `${log}\n${report}\n${hs}`;
  if ((ctx.code === 0 || ctx.code == null) && !report && !hs) return null;

  const mem = Number(ctx.memoryMb) || 4096;
  const total = Number(ctx.totalMemMb) || 8192;
  const round = (mb) => Math.max(1024, Math.floor(mb / 512) * 512);
  const lines = (...extra) => keyLines(all, [/Exception|Error|error:|FATAL|Caused by|requires|missing|Duplicate|Description:|Problematic frame/i, ...extra]);
  const out = (kind, vars, fixes, ...extra) => ({ kind, vars: vars || {}, fixes: fixes || [], lines: lines(...extra), file: reportFile || hsFile || null, code: ctx.code });

  // --- Java no arranca
  if (/Could not reserve enough space for (object heap|\d+KB object heap)|Invalid maximum heap size|Initial heap size set to a larger value|There is insufficient memory for the Java Runtime/i.test(all)) {
    const mb = round(Math.min(mem - 1024, total * 0.5));
    return out('heap', { mb: String(mem), next: String(mb) }, mb < mem ? [{ type: 'ram', mb }] : [{ type: 'report' }]);
  }
  if (/Unrecognized VM option|Unrecognized option:|Error: Could not create the Java Virtual Machine/i.test(all) && String(ctx.jvmArgs || '').trim()) {
    return out('jvmargs', {}, [{ type: 'jvmargs' }]);
  }
  if (/UnsupportedClassVersionError|compiled by a more recent version of the Java Runtime|requires (at least )?Java \d+|Incompatible Java version/i.test(all)) {
    return out('java', {}, ctx.customJava ? [{ type: 'java' }] : [{ type: 'report' }]);
  }
  // --- Sin memoria
  if (/java\.lang\.OutOfMemoryError|Out of memory|GC overhead limit exceeded/i.test(all)) {
    const want = round(Math.min(total * 0.6, Math.max(mem + 2048, 4096)));
    return out('memory', { mb: String(mem), next: String(want) }, want > mem ? [{ type: 'ram', mb: want }] : [{ type: 'report' }]);
  }
  // --- Mods: falta uno, versión que no vale, repetidos
  // Fabric: «Mod 'Sodium Extra' (sodium-extra) 0.5.4 requires any version of fabric-api, which is missing!»
  //         «… requires any version of mod 'Fabric API' (fabric-api), which is missing!»
  let m = all.match(/Mod '([^']+)' \([^)]+\)[^\n]*? requires [^\n]*?of (?:mod )?(?:'([^']+)'(?: \([^)]+\))?|([a-z0-9_.-]+)), which is missing/i);
  if (m) return out('missing', { mod: m[1], dep: m[2] || m[3] }, [{ type: 'repair' }, { type: 'report' }]);
  // Forge/NeoForge: «Mod ID: 'geckolib', Requested by: 'mowziesmobs', … Actual version: '[MISSING]'»
  m = all.match(/Mod ID: '([^']+)', Requested by: '([^']+)'[^\n]*?\[MISSING\]/i);
  if (m) return out('missing', { mod: m[2], dep: m[1] }, [{ type: 'repair' }, { type: 'report' }]);
  // Versión que no vale: «Mod 'Iris' (iris) 1.7.0 requires version 0.5.x of mod 'Sodium' (sodium), but only the wrong version is present: 0.6.0!»
  m = all.match(/Mod '([^']+)' \([^)]+\)[^\n]*? (?:requires|is incompatible with) [^\n]*?of (?:mod )?(?:'([^']+)'|([a-z0-9_.-]+))[^\n]*?(?:wrong version|but it is present|is present)/i);
  if (m || /Incompatible mods found|incompatible mod set|Some of your mods are incompatible/i.test(all)) {
    return out('incompatible', { mod: m ? m[1] : '', dep: m ? (m[2] || m[3]) : '' }, [{ type: 'report' }]);
  }
  if (/Duplicate mods? found|duplicate mod ?id|DuplicateModsFoundException|Found duplicate mods/i.test(all)) {
    return out('duplicate', {}, [{ type: 'repair' }]);
  }
  // --- Archivos dañados
  if (/ZipException|invalid CEN header|zip END header not found|ZipError|error in opening zip file|Failed to read mod file|is not a valid mod file|truncated/i.test(all)) {
    return out('corrupt', {}, [{ type: 'repair' }]);
  }
  // --- Los mods de rendimiento de Kopi chocan con los del studio
  const stackPart = report || log.slice(-60 * 1024);
  if (ctx.perfMode && PERF_MODS.test(stackPart) && /Exception|Mixin|Error/i.test(stackPart)) {
    return out('perf', {}, [{ type: 'perf' }, { type: 'report' }]);
  }
  // --- Un mod choca con otro
  m = all.match(/Mixin apply (?:for mod ([\w-]+) )?failed ([\w.-]+\.json)?|Mixin transformation of [^\s]+ failed|InvalidMixinException[^\n]*?([\w.-]+\.mixins?\.json)/i);
  if (m) {
    const cfg = m[2] || m[3] || '';
    const mod = m[1] || (cfg ? cfg.replace(/\.mixins?\.json$|\.json$/i, '').replace(/[-_.]mixins?$/i, '') : '');
    return out('mixin', { mod }, ctx.perfMode && PERF_MODS.test(m[0] + mod) ? [{ type: 'perf' }, { type: 'report' }] : [{ type: 'report' }]);
  }
  // --- Tarjeta gráfica
  const gpuText = `${hs}\n${log.slice(-80 * 1024)}`;
  const vendor = Object.keys(DRIVERS).find(k => DRIVERS[k].re.test(gpuText));
  if (vendor && (hs || /EXCEPTION_ACCESS_VIOLATION|SIGSEGV/i.test(gpuText))) {
    return out('driver', { vendor: DRIVERS[vendor].name }, [{ type: 'drivers', vendor: DRIVERS[vendor].name, url: DRIVERS[vendor].url }]);
  }
  if (/GLFW error (65542|65543)|WGL: The driver does not appear to support OpenGL|Pixel format not accelerated|OpenGL 3\.\d+ is not supported|Couldn't set pixel format/i.test(all)) {
    return out('driver', { vendor: '' }, [{ type: 'drivers', vendor: '', url: '' }]);
  }
  if (hs) {
    const frame = (hs.match(/Problematic frame:\s*\n#\s*(.+)/) || [])[1] || '';
    return out('jvm', { frame: frame.trim().slice(0, 160) }, [{ type: 'report' }], /Problematic frame|^#\s+[A-Z]/);
  }
  // --- Lo demás: lo que dice el informe de Minecraft
  const desc = ((report.match(/^Description:\s*(.+)$/m) || [])[1] || '').trim();
  const exc = ((report || log).match(/^((?:[a-z]+\.)+[A-Z]\w*(?:Exception|Error))(?::\s*(.{0,160}))?$/m) || []);
  return out('generic', { desc: desc.slice(0, 160), error: (exc[1] || '').split('.').pop(), message: (exc[2] || '').trim() }, [{ type: 'report' }]);
}

module.exports = { diagnose, keyLines, DRIVERS };
