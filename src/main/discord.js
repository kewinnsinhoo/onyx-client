// Vincular la cuenta de Discord (OAuth2, solo para mostrar tu usuario de Discord).
const { config, isPlaceholder } = require('./config');

function link(BrowserWindow, parent) {
  if (isPlaceholder(config.discordClientId)) {
    return Promise.reject(new Error('Falta el Client ID de Discord en onyx.config.json (GUIA.md, paso 4).'));
  }
  const redirect = config.discordRedirect || 'http://127.0.0.1:53682/discord';
  const url = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: config.discordClientId,
    response_type: 'token',
    redirect_uri: redirect,
    scope: 'identify',
    prompt: 'consent'
  }).toString();

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520, height: 780, parent, modal: !!parent, show: false, autoHideMenuBar: true,
      title: 'Vincular Discord', backgroundColor: '#313338',
      webPreferences: { partition: `discord-${Date.now()}`, contextIsolation: true }
    });
    let done = false;
    const finish = (err, val) => {
      if (done) return; done = true;
      if (!win.isDestroyed()) win.close();
      err ? reject(err) : resolve(val);
    };
    const check = async (e, target) => {
      if (!target || !target.startsWith(redirect)) return;
      if (e && e.preventDefault) e.preventDefault();
      const u = new URL(target);
      const params = new URLSearchParams(u.hash.replace(/^#/, '') || u.search);
      const token = params.get('access_token');
      if (!token) return finish(new Error(params.get('error_description') || 'Vinculación cancelada'));
      try {
        const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Discord no devolvió tu perfil');
        const me = await res.json();
        finish(null, {
          id: me.id,
          username: me.username,
          globalName: me.global_name || me.username,
          avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null,
          linkedAt: Date.now()
        });
      } catch (err) { finish(err); }
    };
    win.webContents.on('will-redirect', check);
    win.webContents.on('will-navigate', check);
    win.webContents.on('did-navigate', (e, u) => check(null, u));
    win.on('closed', () => finish(new Error('Vinculación cancelada')));
    win.once('ready-to-show', () => win.show());
    win.loadURL(url).catch(() => {});
  });
}

module.exports = { link };
