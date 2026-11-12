// Registro simple del launcher (logs/launcher.log), con rotación al arrancar.
const fs = require('fs');
const path = require('path');

let file = null;

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'launcher.log');
  try {
    if (fs.existsSync(file)) fs.renameSync(file, path.join(dir, 'launcher.old.log'));
  } catch { /* nada */ }
}

function write(level, args) {
  const line = `[${new Date().toISOString()}] [${level}] ` + args.map(a =>
    a instanceof Error ? (a.stack || a.message) : (typeof a === 'object' ? safeJson(a) : String(a))
  ).join(' ');
  if (level === 'ERROR') console.error(line); else console.log(line);
  if (file) { try { fs.appendFileSync(file, line + '\n'); } catch { /* nada */ } }
}

function safeJson(o) { try { return JSON.stringify(o); } catch { return String(o); } }

function tail(maxLines = 300) {
  if (!file || !fs.existsSync(file)) return '';
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return lines.slice(-maxLines).join('\n');
}

module.exports = {
  init,
  tail,
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
  get file() { return file; }
};
