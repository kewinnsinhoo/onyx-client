// Cliente mínimo de Discord Rich Presence (el "Jugando a ..." del perfil de Discord).
// Habla con la app de Discord del PC por su tubería local (IPC), sin librerías externas.
// Formato de cada mensaje: [op int32 LE][longitud int32 LE][JSON]
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

// Rutas donde Discord abre su tubería (discord-ipc-0 … discord-ipc-9)
function socketPaths(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  }
  const bases = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, '/tmp'].filter(Boolean);
  // Discord instalado con Flatpak o Snap guarda la tubería en subcarpetas
  const subs = ['', 'app/com.discordapp.Discord', 'app/com.discordapp.DiscordCanary', '.flatpak/com.discordapp.Discord/xdg-run', 'snap.discord', 'snap.discord-canary'];
  const out = [];
  for (const base of [...new Set(bases)]) {
    for (const sub of subs) {
      for (let i = 0; i < 10; i++) out.push(path.join(base, sub, `discord-ipc-${i}`));
    }
  }
  return out;
}

function encode(op, payload) {
  const json = Buffer.from(JSON.stringify(payload));
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

// Separa los mensajes que llegan pegados o a trozos
function decoder(onMessage) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const op = buf.readInt32LE(0);
      const len = buf.readInt32LE(4);
      if (buf.length < 8 + len) break;
      let data = null;
      try { data = JSON.parse(buf.subarray(8, 8 + len).toString('utf8')); } catch { /* ignorar */ }
      buf = buf.subarray(8 + len);
      onMessage(op, data);
    }
  };
}

function tryConnect(p, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = net.createConnection(p);
    const t = setTimeout(() => { sock.destroy(); resolve(null); }, timeoutMs);
    sock.once('connect', () => { clearTimeout(t); resolve(sock); });
    sock.once('error', () => { clearTimeout(t); resolve(null); });
  });
}

class DiscordRPC {
  constructor(clientId, { log = null, paths = null, retryMs = 20000 } = {}) {
    this.clientId = clientId;
    this.log = log;
    this.paths = paths;
    this.retryMs = retryMs;
    this.sock = null;
    this.ready = false;
    this.user = null;
    this.activity = undefined; // última actividad pedida (null = borrar)
    this.timer = null;
    this.connecting = false;
    this.stopped = false;
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  async _connect() {
    if (this.connecting || this.sock || this.stopped) return;
    this.connecting = true;
    let sock = null;
    for (const p of (this.paths || socketPaths())) {
      sock = await tryConnect(p);
      if (sock) break;
      if (this.stopped) return;
    }
    this.connecting = false;
    if (!sock) return this._retry();
    if (this.stopped) { sock.destroy(); return; }
    this.sock = sock;
    sock.on('data', decoder((op, data) => this._onMessage(op, data)));
    sock.on('error', () => {});
    sock.on('close', () => {
      const was = this.ready;
      this.sock = null; this.ready = false;
      if (was && this.log) this.log.info('[discord] Desconectado de Discord');
      this._retry();
    });
    sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: String(this.clientId) }));
  }

  _retry() {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this._connect(); }, this.retryMs);
    if (this.timer.unref) this.timer.unref();
  }

  _onMessage(op, data) {
    if (op === OP.PING) { this.sock && this.sock.write(encode(OP.PONG, data)); return; }
    if (op === OP.CLOSE) { if (this.log) this.log.warn('[discord] Discord cerró la conexión:', data && data.message); this.sock && this.sock.destroy(); return; }
    if (op !== OP.FRAME || !data) return;
    if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
      this.ready = true;
      this.user = data.data && data.data.user;
      if (this.log) this.log.info('[discord] Conectado a Discord' + (this.user ? ` como ${this.user.username}` : ''));
      if (this.activity !== undefined) this._send(this.activity);
    } else if (data.evt === 'ERROR' && this.log) {
      this.log.warn('[discord] Error de Discord:', data.data && data.data.message);
    }
  }

  _send(activity) {
    if (!this.sock || !this.ready) return;
    this.sock.write(encode(OP.FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: activity || undefined },
      nonce: crypto.randomUUID()
    }));
  }

  setActivity(activity) { this.activity = activity; this._send(activity); }
  clearActivity() { this.setActivity(null); }

  stop() {
    this.stopped = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.sock) {
      const s = this.sock;
      try { this._send(null); s.end(encode(OP.CLOSE, {})); } catch { /* nada */ }
      const t = setTimeout(() => s.destroy(), 500);
      if (t.unref) t.unref();
      this.sock = null;
    }
    this.ready = false;
  }
}

module.exports = { DiscordRPC, socketPaths, encode, decoder, OP };
