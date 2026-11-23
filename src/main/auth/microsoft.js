// Inicio de sesión con Microsoft -> Xbox Live -> XSTS -> Minecraft (cuentas premium).
const crypto = require('crypto');

const AUTH_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient';
const SCOPE = 'XboxLive.signin offline_access';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

class AuthError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* nada */ }
  return { ok: res.ok, status: res.status, data };
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError('ms_token', data.error_description || data.error || `Microsoft respondió ${res.status}`);
  return data;
}

// Abre la ventana de Microsoft y devuelve el "code" de autorización.
function interactiveLogin(BrowserWindow, parent, clientId) {
  const { verifier, challenge } = pkce();
  const url = `${AUTH_URL}?` + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    prompt: 'select_account',
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 500, height: 650, parent, modal: !!parent, show: false,
      title: 'Iniciar sesión con Microsoft', autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { partition: `msauth-${Date.now()}`, contextIsolation: true, nodeIntegration: false }
    });
    let finished = false;
    const finish = (err, val) => {
      if (finished) return;
      finished = true;
      if (!win.isDestroyed()) win.close();
      err ? reject(err) : resolve(val);
    };
    const check = (event, target) => {
      if (!target || !target.startsWith(REDIRECT_URI)) return;
      if (event && event.preventDefault) event.preventDefault();
      const u = new URL(target);
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      if (code) finish(null, { code, verifier });
      else finish(new AuthError(error === 'access_denied' ? 'cancelled' : 'ms_auth', u.searchParams.get('error_description') || error || 'Inicio de sesión cancelado'));
    };
    win.webContents.on('will-redirect', (e, u) => check(e, u));
    win.webContents.on('will-navigate', (e, u) => check(e, u));
    win.webContents.on('did-redirect-navigation', (e, u) => check(null, u));
    win.webContents.on('did-navigate', (e, u) => check(null, u));
    win.on('closed', () => finish(new AuthError('cancelled', 'Inicio de sesión cancelado')));
    win.once('ready-to-show', () => win.show());
    win.loadURL(url).catch(() => { /* la redirección final aborta la carga: es normal */ });
  });
}

// ---------- Inicio de sesión en el navegador del sistema ----------
// El launcher abre un mini servidor en este PC (http://localhost:PUERTO) y abre el navegador.
// Microsoft devuelve al jugador a ese servidor con el "code" y el launcher lo recoge.
// En Azure hay que tener registrada la URI "http://localhost" (cliente público / escritorio).
const http = require('http');

const PAGE_TXT = {
  es: ['Sesión iniciada', 'Ya puedes cerrar esta pestaña y volver a Kopi Client.', 'No se pudo iniciar sesión', 'Vuelve a Kopi Client e inténtalo otra vez.'],
  en: ['Signed in', 'You can close this tab and go back to Kopi Client.', 'Could not sign in', 'Go back to Kopi Client and try again.'],
  ca: ['Sessió iniciada', 'Ja pots tancar aquesta pestanya i tornar a Kopi Client.', 'No s’ha pogut iniciar la sessió', 'Torna a Kopi Client i torna-ho a provar.'],
  fr: ['Connecté', 'Tu peux fermer cet onglet et revenir sur Kopi Client.', 'Connexion impossible', 'Reviens sur Kopi Client et réessaie.']
};
const escHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// En un launcher de marca, la página dice su nombre y usa su color
function brandLook() {
  let b = null;
  try { b = require('../config').brand; } catch { /* pruebas */ }
  const ok = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  if (!b) return { name: 'Kopi Client', grad: 'linear-gradient(135deg,#ffa6ea,#e055c9 55%,#9b3fe0)', ink: '#fff', tag: '#ffb0ec' };
  const a = ok(b.accent) ? b.accent : '#ffffff';
  const n = parseInt(a.slice(1), 16), lum = (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
  return { name: b.name || 'Launcher', grad: a, ink: lum > 0.55 ? '#15111b' : '#fff', tag: a };
}

function resultPage(ok, lang, detail) {
  const L = brandLook();
  const T = (PAGE_TXT[lang] || PAGE_TXT.es).map(x => x.replace(/Kopi Client/g, L.name));
  const title = ok ? T[0] : T[2];
  const text = ok ? T[1] : T[3];
  const mark = ok
    ? '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>';
  return `<!DOCTYPE html><html lang="${escHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)} · ${escHtml(L.name)}</title><style>
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fbeefb;
background-color:#0a0710;background-image:radial-gradient(900px 520px at 20% -10%,rgba(193, 63, 214,.35),transparent 60%),radial-gradient(700px 500px at 110% 110%,rgba(245, 142, 224,.14),transparent 60%);background-repeat:no-repeat;color-scheme:dark}
.card{width:min(420px,92vw);padding:40px 34px 34px;border-radius:24px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(240, 170, 235,.14);
box-shadow:0 30px 80px -20px rgba(0,0,0,.8);backdrop-filter:blur(14px);animation:in .5s cubic-bezier(.2,.8,.2,1)}
.brand{font-weight:800;letter-spacing:.14em;font-size:13px;color:${L.tag};margin-bottom:26px;text-transform:uppercase}
.ico{width:68px;height:68px;margin:0 auto 20px;border-radius:22px;display:flex;align-items:center;justify-content:center;
color:${ok ? L.ink : '#ff7a8a'};background:${ok ? L.grad : 'rgba(255,122,138,.12)'};
box-shadow:${ok ? '0 14px 34px -10px rgba(193, 63, 214,.8)' : 'none'}}
.ico svg{width:34px;height:34px}h1{margin:0 0 10px;font-size:24px}p{margin:0;color:#e0c9e0;line-height:1.5;font-size:15px}
small{display:block;margin-top:16px;color:#a58aa6;font-size:12.5px;word-break:break-word}
@keyframes in{from{opacity:0;transform:translateY(12px) scale(.98)}}
</style></head><body><div class="card"><div class="brand">${escHtml(L.name)}</div>
<div class="ico"><svg viewBox="0 0 24 24">${mark}</svg></div><h1>${escHtml(title)}</h1><p>${escHtml(text)}</p>
${!ok && detail ? `<small>${escHtml(detail)}</small>` : ''}</div>
<script>${ok ? 'setTimeout(function(){try{window.close()}catch(e){}},2500)' : ''}</script></body></html>`;
}

function listenLoopback(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      // El navegador puede ir a localhost por IPv6 (::1): escuchar también ahí, si se puede.
      const v6 = http.createServer(handler);
      v6.on('error', () => {});
      try { v6.listen(port, '::1'); } catch { /* sin IPv6 */ }
      resolve({ port, close: () => { try { server.close(); } catch { /* nada */ } try { v6.close(); } catch { /* nada */ } } });
    });
  });
}

let pendingBrowser = null;

// Abre el navegador del sistema y espera el "code". openExternal(url) abre el navegador.
async function browserLogin(openExternal, clientId, { lang = 'es', timeoutMs = 10 * 60e3, onCode } = {}) {
  if (pendingBrowser) pendingBrowser.cancel();
  const { verifier, challenge } = pkce();
  const state = b64url(crypto.randomBytes(16));
  let finish;
  const done = new Promise((resolve, reject) => { finish = (err, val) => (err ? reject(err) : resolve(val)); });
  done.catch(() => {}); // evita avisos si se cancela antes de esperar

  const srv = await listenLoopback((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
    const code = u.searchParams.get('code');
    const error = u.searchParams.get('error');
    if (!code && !error) { res.writeHead(400); res.end(); return; }
    const okState = u.searchParams.get('state') === state;
    const ok = !!code && okState;
    const detail = !okState ? 'state' : (u.searchParams.get('error_description') || error || '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(resultPage(ok, lang, detail));
    if (ok) finish(null, code);
    else finish(new AuthError(error === 'access_denied' ? 'cancelled' : 'ms_auth', u.searchParams.get('error_description') || error || 'Inicio de sesión no válido'));
  });

  const redirectUri = `http://localhost:${srv.port}`;
  const url = `${AUTH_URL}?` + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPE,
    prompt: 'select_account',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();

  const timer = setTimeout(() => finish(new AuthError('timeout', 'Se acabó el tiempo para iniciar sesión. Inténtalo de nuevo.')), timeoutMs);
  const me = {
    cancel: () => finish(new AuthError('cancelled', 'Inicio de sesión cancelado')),
    reopen: () => openExternal(url)
  };
  pendingBrowser = me;
  try {
    await openExternal(url);
    const code = await done;
    if (onCode) onCode();
    return { code, verifier, redirectUri };
  } finally {
    clearTimeout(timer);
    if (pendingBrowser === me) pendingBrowser = null;
    setTimeout(() => srv.close(), 1500); // deja tiempo a que la página termine de cargar
  }
}

function cancelBrowserLogin() { if (pendingBrowser) pendingBrowser.cancel(); }
function reopenBrowserLogin() { if (pendingBrowser) pendingBrowser.reopen(); }

async function exchangeCode(clientId, code, verifier, redirectUri = REDIRECT_URI) {
  return postForm(TOKEN_URL, {
    client_id: clientId, scope: SCOPE, code, redirect_uri: redirectUri,
    grant_type: 'authorization_code', code_verifier: verifier
  });
}

async function refreshMs(clientId, refreshToken) {
  return postForm(TOKEN_URL, {
    client_id: clientId, scope: SCOPE, refresh_token: refreshToken, grant_type: 'refresh_token'
  });
}

const XSTS_ERRORS = {
  2148916233: 'Esta cuenta de Microsoft no tiene perfil de Xbox. Entra una vez en minecraft.net o xbox.com para crearlo.',
  2148916235: 'Xbox Live no está disponible en tu país.',
  2148916236: 'La cuenta necesita verificación de edad en xbox.com.',
  2148916237: 'La cuenta necesita verificación de edad en xbox.com.',
  2148916238: 'Es una cuenta de menor: un adulto debe añadirla a una familia de Microsoft.'
};

// Del token de Microsoft al perfil de Minecraft.
async function minecraftFromMs(msAccessToken) {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT'
  });
  if (!xbl.ok) throw new AuthError('xbl', 'No se pudo entrar a Xbox Live');
  const uhs = xbl.data.DisplayClaims.xui[0].uhs;

  const xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT'
  });
  if (!xsts.ok) {
    const msg = XSTS_ERRORS[xsts.data.XErr] || 'Xbox Live rechazó la cuenta';
    throw new AuthError('xsts', msg);
  }

  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.data.Token}`
  });
  if (!mc.ok) {
    if (mc.status === 403) throw new AuthError('not_approved', 'Mojang aún no ha aprobado el Client ID de Azure de este launcher.');
    throw new AuthError('mc_login', 'Minecraft no aceptó el inicio de sesión');
  }
  const accessToken = mc.data.access_token;
  const expiresAt = Date.now() + (mc.data.expires_in || 86400) * 1000;

  const profile = await getProfile(accessToken);
  return { accessToken, expiresAt, profile };
}

async function getProfile(accessToken) {
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 404) throw new AuthError('no_game', 'Esta cuenta de Microsoft no tiene Minecraft: Java Edition.');
  if (res.status === 401) throw new AuthError('expired', 'La sesión de Minecraft caducó');
  if (!res.ok) throw new AuthError('profile', `No se pudo leer el perfil (${res.status})`);
  return res.json();
}

module.exports = { interactiveLogin, browserLogin, cancelBrowserLogin, reopenBrowserLogin, resultPage, exchangeCode, refreshMs, minecraftFromMs, getProfile, AuthError, REDIRECT_URI };
