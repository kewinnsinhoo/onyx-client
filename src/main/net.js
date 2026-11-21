// Errores de conexión claros. Node solo dice «fetch failed», que no ayuda a nadie.
// install() envuelve el fetch de todo el launcher para:
//   - reintentar una vez las descargas (GET) que fallan por la red;
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

function kindOf(e) {
  if (e && (e.name === 'TimeoutError')) return 'timeout';
  const code = causeCode(e);
  for (const [k, list] of Object.entries(KINDS)) if (list.includes(code)) return k;
  if (/certificate|self.signed|CERT/i.test(String(e && e.cause && e.cause.message))) return 'cert';
  return 'other';
}

const isNetError = (e) => !!e && ((e instanceof TypeError && /fetch failed|terminated/i.test(e.message)) || e.name === 'TimeoutError');

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

let installed = false;
function install({ log, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (installed || typeof fetchImpl !== 'function') return;
  installed = true;
  const orig = fetchImpl;
  globalThis.fetch = async function kopiFetch(url, opts = {}) {
    const method = String((opts && opts.method) || 'GET').toUpperCase();
    const tries = method === 'GET' || method === 'HEAD' ? 2 : 1;
    for (let i = 0; ; i++) {
      try { return await orig(url, opts); } catch (e) {
        if (!isNetError(e)) throw e;
        const aborted = opts && opts.signal && opts.signal.aborted;
        if (i + 1 < tries && !aborted) { await sleep(900); continue; }
        const err = netError(e, url);
        if (log) log.warn('[red] ' + err.detail);
        throw err;
      }
    }
  };
}

module.exports = { install, netError, kindOf, isNetError, hostOf, MESSAGES };
