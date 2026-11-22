// Conexiones a internet del launcher sin «fetch failed».
// install() envuelve el fetch de todo el launcher para:
//   - conectar primero como Chrome (certificados y proxy del sistema), y si no, con el de Node;
//   - reintentar las descargas (GET) tras una pausa;
//   - si aun así falla, decir con qué web no se pudo conectar y qué hacer (en el idioma del jugador).
const KINDS = {
  dns: ['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA'],
  blocked: ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CLOSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'ECONNABORTED'],
  timeout: ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'],
  cert: ['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT',
    'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT', 'CERT_UNTRUSTED']
};
// Los textos son claves de traducción (src/renderer/js/i18n.js); {host} es la web
const MESSAGES = {
  dns: 'No se pudo conectar con {host}: tu internet no encuentra esa web. Revisa el WiFi o el cable y vuelve a probar.',
  blocked: 'No se pudo conectar con {host}: la conexión se cortó. Puede ser el antivirus, una VPN o el firewall. Prueba a desactivarlos un momento.',
  timeout: 'No se pudo conectar con {host}: tarda demasiado en contestar. Puede que tu internet vaya lento; vuelve a probar en un rato.',
  cert: 'No se pudo conectar con {host} de forma segura. Suele ser la fecha y hora del PC mal puestas o un antivirus que revisa las webs.',
  other: 'No se pudo conectar con {host}. Revisa tu conexión a internet y vuelve a probar.'
};

function causeCode(e) {
  let c = e;
  for (let i = 0; c && i < 5; i++, c = c.cause) {
    if (c.code && typeof c.code === 'string') return c.code;
    if (c.errors && c.errors[0] && c.errors[0].code) return c.errors[0].code; // AggregateError (IPv4 + IPv6)
  }
  return '';
}

const CHROME = [
  ['dns', /ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_CHANGED/],
  ['timeout', /ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT/],
  ['cert', /ERR_CERT_|ERR_SSL_|ERR_BAD_SSL/],
  ['blocked', /ERR_CONNECTION_(RESET|REFUSED|CLOSED|ABORTED|FAILED)|ERR_EMPTY_RESPONSE|ERR_PROXY_|ERR_TUNNEL_CONNECTION_FAILED|ERR_BLOCKED/]
];
function kindOf(e) {
  if (e && (e.name === 'TimeoutError')) return 'timeout';
  const msg = String(e && e.message);
  if (/net::ERR_/.test(msg)) { for (const [k, re] of CHROME) if (re.test(msg)) return k; return 'other'; }
  const code = causeCode(e);
  for (const [k, list] of Object.entries(KINDS)) if (list.includes(code)) return k;
  if (/certificate|self.signed|CERT/i.test(String(e && e.cause && e.cause.message))) return 'cert';
  return 'other';
}

const isNetError = (e) => !!e && ((e instanceof TypeError && /fetch failed|terminated|net::ERR_/i.test(e.message)) || e.name === 'TimeoutError' || /^net::ERR_/.test(String(e.message)));

function hostOf(url) {
  try { return new URL(typeof url === 'string' ? url : url.url || String(url)).hostname; } catch { return 'internet'; }
}

// El error que ve el jugador
function netError(e, url) {
  const kind = kindOf(e);
  const err = new Error(MESSAGES[kind]);
  err.code = 'net';
  err.kind = kind;
  err.vars = { host: hostOf(url) };
  err.cause = e;
  err.detail = `${err.vars.host}: ${causeCode(e) || e.name} ${(e.cause && e.cause.message) || e.message}`; // para el registro
  return err;
}

// Chromium (el motor de Chrome) usa los certificados y el proxy de Windows y Mac: con antivirus que revisan
// las webs (Avast, Kaspersky, ESET…), VPN o proxies conecta donde el fetch de Node da «fetch failed».
// Solo existe dentro de la app y cuando ya está lista.
function chromiumFetch() {
  try {
    const { app, net } = require('electron');
    if (app && typeof app.isReady === 'function' && app.isReady() && net && typeof net.fetch === 'function') return (u, o) => net.fetch(u, o);
  } catch { /* fuera de Electron (pruebas) */ }
  return null;
}

// DNS seguro (DoH): algunas compañías de internet o filtros de red cambian la dirección de ciertas webs (dominios
// nuevos como .site o .xyz) y la conexión falla con «certificado no válido» aunque el internet vaya bien.
// Con DNS seguro la conexión tipo Chrome pregunta la dirección a Cloudflare/Google por HTTPS y nadie la cambia.
// Solo se enciende si esos servidores responden en esta red; si no, todo sigue como siempre.
const DOH = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'];
async function secureDns({ log, nodeFetch = globalThis.fetch } = {}) {
  try {
    const { app } = require('electron');
    if (!app || typeof app.configureHostResolver !== 'function') return false;
    const ok = await Promise.any(DOH.map(u => nodeFetch(`${u}?name=panel.onyxclient.site&type=A`, { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) })
      .then(r => (r.ok ? true : Promise.reject(new Error('HTTP ' + r.status)))))).catch(() => false);
    if (!ok) { if (log) log.info('[red] DNS seguro no disponible en esta red: se usa el normal'); return false; }
    app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: DOH });
    if (log) log.info('[red] DNS seguro activado (Cloudflare/Google)');
    return true;
  } catch (e) { if (log) log.warn('[red] DNS seguro:', e.message); return false; }
}

// Cuando una conexión falla del todo, se avisa al panel de qué web y qué error (sin nombres ni datos del jugador),
// una vez por web y tipo cada hora. Así se ve qué está pasando de verdad en los PCs de los jugadores.
const reported = new Map();
let reporter = null; // (info) => Promise
function setReporter(fn) { reporter = typeof fn === 'function' ? fn : null; }
function report(err, chromeErr, nodeErr) {
  if (!reporter || !err || !err.vars) return;
  const key = err.vars.host + '|' + err.kind;
  if (reported.has(key) && Date.now() - reported.get(key) < 3600e3) return;
  reported.set(key, Date.now());
  const info = {
    host: err.vars.host, kind: err.kind,
    chrome: chromeErr ? String(chromeErr.message || '').slice(0, 120) : null,
    node: nodeErr ? (causeCode(nodeErr) || String(nodeErr.message || '')).slice(0, 120) : null
  };
  Promise.resolve().then(() => reporter(info)).catch(() => {});
}

const aborted = (e, opts) => !!((opts && opts.signal && opts.signal.aborted) || (e && e.name === 'AbortError'));

let installed = false;
function install({ log, fetchImpl = globalThis.fetch, chromium = chromiumFetch, sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (installed || typeof fetchImpl !== 'function') return;
  installed = true;
  const node = fetchImpl;
  globalThis.fetch = async function kopiFetch(url, opts = {}) {
    if (opts && opts.kopiNoReport) { const { kopiNoReport, ...rest } = opts; return node(url, rest); } // el propio aviso al panel
    const method = String((opts && opts.method) || 'GET').toUpperCase();
    // Orden: Chrome → Node → (descargas) otra vez Chrome tras una pausa
    const cf = chromium();
    const plan = cf ? [cf, node] : [node];
    if (method === 'GET' || method === 'HEAD') plan.push(cf || node);
    let first = null, last = null, nodeErr = null, chromeErr = null;
    for (let i = 0; i < plan.length; i++) {
      try { return await plan[i](url, opts); } catch (e) {
        const sig = opts && opts.signal;
        if ((e && e.name === 'TimeoutError') || (sig && sig.aborted && sig.reason && sig.reason.name === 'TimeoutError')) { // el tiempo se acabó: no se repite
          last = Object.assign(new Error('timeout'), { name: 'TimeoutError' }); break;
        }
        if (aborted(e, opts)) throw e; // lo cancelamos nosotros
        first = first || e; last = e;
        if (plan[i] === node) nodeErr = e; else chromeErr = chromeErr || e;
        if (i === plan.length - 2 && plan.length > 2) await sleep(1200);
      }
    }
    // El error más útil: el de Node si sabe qué pasó, si no el de Chrome
    const pick = last && last.name === 'TimeoutError' ? last : nodeErr && kindOf(nodeErr) !== 'other' ? nodeErr : last || first;
    if (!isNetError(pick) && !/^net::ERR_/.test(String(pick && pick.message))) throw pick;
    const err = netError(pick, url);
    if (log) log.warn('[red] ' + err.detail + (first && first !== last ? ` | también: ${first.message}` : ''));
    report(err, chromeErr, nodeErr);
    throw err;
  };
}

module.exports = { install, netError, kindOf, isNetError, hostOf, chromiumFetch, secureDns, setReporter, MESSAGES };
