// Consulta el estado de un servidor de Minecraft (jugadores conectados) con el protocolo oficial "Server List Ping".
const net = require('net');
const dns = require('dns').promises;

function varInt(n) {
  const out = [];
  do { let b = n & 0x7f; n >>>= 7; if (n !== 0) b |= 0x80; out.push(b); } while (n !== 0);
  return Buffer.from(out);
}
function readVarInt(buf, off) {
  let num = 0, shift = 0, b;
  do {
    if (off >= buf.length) return null;
    b = buf[off++]; num |= (b & 0x7f) << shift; shift += 7;
    if (shift > 35) throw new Error('VarInt demasiado largo');
  } while (b & 0x80);
  return { value: num, offset: off };
}
function packet(id, payload) {
  const body = Buffer.concat([varInt(id), payload]);
  return Buffer.concat([varInt(body.length), body]);
}

async function resolve(host, port) {
  if (port && port !== 25565) return { host, port };
  try {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv && srv[0]) return { host: srv[0].name, port: srv[0].port };
  } catch { /* sin registro SRV */ }
  return { host, port: port || 25565 };
}

async function ping(address, port = 25565, timeout = 4000) {
  const target = await resolve(address, port);
  return new Promise((resolveP, reject) => {
    const sock = net.createConnection(target.port, target.host);
    let data = Buffer.alloc(0);
    const done = (err, val) => { clearTimeout(timer); sock.destroy(); err ? reject(err) : resolveP(val); };
    const timer = setTimeout(() => done(new Error('El servidor no responde')), timeout);
    sock.on('connect', () => {
      const host = Buffer.from(address, 'utf8');
      const p = Buffer.alloc(2); p.writeUInt16BE(port);
      sock.write(packet(0x00, Buffer.concat([varInt(767), varInt(host.length), host, p, varInt(1)])));
      sock.write(packet(0x00, Buffer.alloc(0)));
    });
    sock.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      try {
        const len = readVarInt(data, 0); if (!len) return;
        if (data.length < len.offset + len.value) return;
        const id = readVarInt(data, len.offset);
        const strLen = readVarInt(data, id.offset);
        const json = JSON.parse(data.toString('utf8', strLen.offset, strLen.offset + strLen.value));
        done(null, {
          online: json.players ? json.players.online : 0,
          max: json.players ? json.players.max : 0,
          version: json.version ? json.version.name : null
        });
      } catch (e) { done(e); }
    });
    sock.on('error', (e) => done(e));
  });
}

module.exports = { ping, varInt, readVarInt, packet };
