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

async function exchangeCode(clientId, code, verifier) {
  return postForm(TOKEN_URL, {
    client_id: clientId, scope: SCOPE, code, redirect_uri: REDIRECT_URI,
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

module.exports = { interactiveLogin, exchangeCode, refreshMs, minecraftFromMs, getProfile, AuthError, REDIRECT_URI };
