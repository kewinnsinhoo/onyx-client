// Proceso principal de Kopi Client.
const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { config, gameRoot, isPlaceholder } = require('./config');
const { JsonStore, DEFAULT_SETTINGS } = require('./store');
const log = require('./logger');
const accounts = require('./accounts');
const skins = require('./skins');
const discord = require('./discord');
const presence = require('./presence');
const data = require('./data');
const instances = require('./instances');
const panel = require('./panel');
const referrals = require('./referrals');
const report = require('./report');

// Un launcher de marca tiene su propia carpeta de ajustes y cuentas
if (config.brand) app.setPath('userData', path.join(app.getPath('appData'), config.appName || `onyx-${config.brand.id}`));
// Kopi Client (antes Onyx Client) sigue usando la carpeta de siempre: así nadie pierde cuentas ni ajustes
else app.setPath('userData', path.join(app.getPath('appData'), 'Onyx Client'));
const userData = app.getPath('userData');
const ROOT = gameRoot();
log.init(path.join(userData, 'logs'));
const settingsStore = new JsonStore(path.join(userData, 'settings.json'), DEFAULT_SETTINGS);

// Aceleración por hardware (se aplica al reiniciar)
if (settingsStore.get().hardwareAcceleration === false) app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let gameLogBuffer = [];
let lastPlayed = null; // última instancia lanzada (para los informes)

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1120,
    height: 680,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: isMac ? 'hidden' : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    backgroundColor: '#000000',
    title: config.appName || 'Kopi Client',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  // Los enlaces externos se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId(config.brand ? `site.onyxclient.brand.${config.brand.id}` : 'com.onyxstudios.client');
  accounts.init(userData);
  skins.init(userData);
  data.init(userData);
  panel.init(userData);
  instances.init(ROOT);
  log.info(`${config.appName || 'Kopi Client'} ${app.getVersion()} en ${os.type()} ${os.release()} ${process.arch}${config.brand ? ` (marca ${config.brand.id})` : ''}`);
  // Un launcher de marca apoya a su studio desde el principio (referido)
  if (config.brand && config.brand.studio && !settingsStore.get().referral) {
    settingsStore.set({ referral: { code: config.brand.studio.toUpperCase(), name: config.brand.studioName || config.appName, studio: config.brand.studio, linkedAt: Date.now(), sent: false, auto: true } });
  }
  createWindow();
  // Lo que cambie en el panel (lista manual, staff, instancias públicas...) aparece solo:
  // cada minuto y cada vez que vuelves a la ventana del launcher
  setInterval(() => kickPanelSync(), 60e3);
  win.on('focus', () => kickPanelSync());
  const st = settingsStore.get();
  presence.init({
    clientId: isPlaceholder(config.discordClientId) ? null : config.discordClientId,
    version: app.getVersion(),
    githubRepo: isPlaceholder(config.githubRepo) ? null : config.githubRepo,
    discordInvite: isPlaceholder(config.discordInvite) ? null : config.discordInvite,
    lang: st.language,
    enabled: st.discordPresence !== false,
    log
  });
});

app.on('before-quit', () => presence.shutdown());

app.on('window-all-closed', () => { app.quit(); });

// Cuenta activa para hablar con el panel (el token de Minecraft se pide solo si hace falta)
function panelAccount() {
  const a = accounts.active();
  if (!a) return null;
  return { id: a.id, type: a.type, name: a.name, uuid: a.uuid, getToken: () => accounts.ensureFresh(a.id).then(x => x.accessToken) };
}

// Kopi Skins: la skin de una cuenta no premium se sube al panel para verse en los servidores
function syncOfflineSkin(id) {
  const raw = id ? accounts.getRaw(id) : null;
  if (!raw || raw.type === 'msa') return Promise.resolve();
  const ls = raw.localSkin && raw.localSkin.data;
  const skin = ls ? { png: ls.replace(/^data:image\/png;base64,/, ''), variant: raw.localSkin.variant === 'slim' ? 'slim' : 'classic' } : null;
  return panel.syncSkin({ id: raw.id, type: raw.type, name: raw.name }, accounts.skinKeyOf(raw.id), skin)
    .catch(e => log.warn('[skins] No se pudo subir la skin al panel:', e.message));
}

// Trae del panel las instancias nuevas sin hacer esperar a la interfaz
let panelSyncing = null;
function kickPanelSync(force = false) {
  if (panelSyncing || !panel.enabled()) return;
  const acc = panelAccount();
  if (!acc) return;
  const prev = instances.list();
  const before = JSON.stringify(prev.map(i => [i.id, i.name, i.state, i.banner, i.icon]));
  panelSyncing = instances.syncPanel(acc, { force })
    .then((list) => {
      if (JSON.stringify(list.map(i => [i.id, i.name, i.state, i.banner, i.icon])) !== before) {
        const removed = prev.filter(p => !list.some(i => i.id === p.id)).map(p => p.name);
        send('instances:changed', { list, removed });
      }
      return sendPendingReferral(acc);
    })
    .catch((e) => log.warn('[panel]', e.message))
    .finally(() => { panelSyncing = null; });
}

// El referido elegido antes de tener cuenta se envía al panel en cuanto la hay
async function sendPendingReferral(acc) {
  const r = settingsStore.get().referral;
  if (!r || r.sent || !r.studio || !acc || !panel.enabled()) return;
  try { await panel.referral(acc, r.studio); settingsStore.set({ referral: { ...r, sent: true } }); }
  catch (e) { if (e.code !== 'offline') settingsStore.set({ referral: { ...r, sent: true } }); }
}

// Launcher de marca: lo que viene dentro del programa + lo último que el studio cambió en el panel
// (colores, logo, fondo y enlaces se actualizan sin tener que reinstalar)
let brandLive = null;
async function brandInfo() {
  const b = config.brand;
  const file = path.join(userData, 'brand-live.json');
  if (!brandLive) { try { brandLive = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { brandLive = {}; } }
  if (panel.enabled() && !brandLive._fresh) {
    const r = await Promise.race([panel.publicGet(`brands/${b.id}`), new Promise(res => setTimeout(() => res(null), 4000))]);
    if (r && r.brand) { brandLive = { ...r.brand, _fresh: true }; try { fs.writeFileSync(file, JSON.stringify(r.brand)); } catch { /* nada */ } }
  }
  const L = brandLive || {};
  const pick = (k) => (L[k] !== undefined && L[k] !== null && L[k] !== '' ? L[k] : b[k]);
  return {
    id: b.id, name: config.appName, studio: b.studio || null, studioName: pick('studioName'),
    accent: pick('accent'), accent2: pick('accent2'), tagline: pick('tagline') || '',
    logo: (/^https:/.test(L.logo || '') ? L.logo : b.logo) || null,
    background: (/^https:/.test(L.background || '') ? L.background : b.background) || null,
    discord: pick('discord'), web: pick('web'), store: pick('store'),
    onlyStudio: b.onlyStudio !== false
  };
}

// ---------- utilidades IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      log.error(`[${channel}]`, e);
      return { ok: false, error: e.message || String(e), code: e.code, vars: e.vars, removed: !!e.removed };
    }
  });
}

// ---------- ventana / app ----------
handle('win:minimize', () => win.minimize());
handle('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
handle('win:close', () => win.close());
handle('app:quit', () => app.quit());
handle('app:info', async () => ({
  name: config.appName || 'Kopi Client',
  studio: config.studioName || 'Kopi Studio',
  brand: config.brand ? await brandInfo() : null,
  version: app.getVersion(),
  core: '1.0.0',
  build: new Date().getFullYear(),
  platform: process.platform,
  arch: process.arch,
  totalMemMb: Math.floor(os.totalmem() / 1048576),
  discordInvite: isPlaceholder(config.discordInvite) ? null : config.discordInvite,
  githubRepo: isPlaceholder(config.githubRepo) ? null : config.githubRepo,
  dataConnected: !!data.baseUrl(),
  msConfigured: !isPlaceholder(config.microsoftClientId),
  discordConfigured: !isPlaceholder(config.discordClientId),
  gameDir: ROOT,
  packaged: app.isPackaged
}));
handle('app:openExternal', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
handle('app:openPath', (kind, id) => {
  const map = {
    game: ROOT,
    logs: path.join(userData, 'logs'),
    instance: id ? instances.dir(id) : ROOT,
    screenshots: id ? path.join(instances.dir(id), 'screenshots') : ROOT
  };
  const p = map[kind] || ROOT;
  fs.mkdirSync(p, { recursive: true });
  return shell.openPath(p);
});
handle('app:showItem', (p) => shell.showItemInFolder(p));
handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
handle('app:clearCache', async () => {
  await win.webContents.session.clearCache();
  fs.rmSync(path.join(userData, 'cache'), { recursive: true, force: true });
  return true;
});

// ---------- ajustes ----------
handle('settings:get', () => settingsStore.get());
handle('settings:set', (patch) => {
  const s = settingsStore.set(patch);
  presence.configure({ lang: s.language, enabled: s.discordPresence !== false });
  return s;
});

// ---------- actualizaciones ----------
const updater = require('./updater');
handle('updater:check', () => updater.check({ channel: settingsStore.get().updateChannel, send, log }));
handle('updater:install', () => updater.install());

// ---------- cuentas ----------
handle('accounts:list', () => accounts.list());
handle('accounts:loginMicrosoft', (mode) => accounts.loginMicrosoft(BrowserWindow, win, {
  mode: mode === 'window' ? 'window' : 'browser',
  openExternal: (url) => shell.openExternal(url),
  lang: settingsStore.get().language,
  // Al volver del navegador, traer el launcher al frente
  onCode: () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } }
}).then((r) => { setTimeout(() => kickPanelSync(true), 300); return r; }));
handle('accounts:cancelLogin', () => require('./auth/microsoft').cancelBrowserLogin());
handle('accounts:reopenLogin', () => require('./auth/microsoft').reopenBrowserLogin());
handle('accounts:addOffline', async (name) => { const r = await accounts.addOffline(name); setTimeout(() => kickPanelSync(true), 300); return r; });
handle('accounts:setActive', async (id) => { const r = await accounts.setActive(id); setTimeout(() => kickPanelSync(true), 300); return r; });
handle('accounts:remove', (id) => accounts.remove(id));
handle('accounts:refresh', (id) => accounts.refreshProfile(id));

// ---------- discord ----------
handle('discord:link', async () => {
  const d = await discord.link(BrowserWindow, win);
  settingsStore.set({ discord: d });
  return d;
});
handle('discord:unlink', () => { settingsStore.set({ discord: null }); return true; });
// La interfaz avisa de la sección en la que estás (para el estado de Discord)
handle('discord:presence', (section, id) => {
  const inst = id ? instances.get(id) : null;
  presence.menu(String(section || 'home'), inst ? inst.name : undefined);
});

// ---------- skins ----------
handle('skins:library', () => skins.libraryList());
handle('skins:libraryAdd', (entry) => skins.libraryAdd(entry));
handle('skins:libraryRemove', (id) => skins.libraryRemove(id));
handle('skins:lookup', (name) => skins.lookupPlayer(name));
handle('skins:dataUrl', (url) => skins.toDataUrl(url));
handle('skins:pickFile', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Elige tu skin', filters: [{ name: 'PNG', extensions: ['png'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const buf = fs.readFileSync(r.filePaths[0]);
  skins.validateSkin(buf);
  return { name: path.basename(r.filePaths[0], '.png'), data: 'data:image/png;base64,' + buf.toString('base64') };
});
handle('skins:validate', (dataUrl) => {
  skins.validateSkin(Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
  return true;
});
// Aplica una skin: { data (data URL) | url, variant }
handle('skins:apply', async ({ data: dataUrl, url, variant }) => {
  const acc = await accounts.ensureFresh();
  if (acc.type !== 'msa') {
    // Cuentas offline: la skin solo se ve en el launcher.
    const local = dataUrl || (url ? await skins.toDataUrl(url) : null);
    const view = accounts.setLocalSkin(acc.id, local ? { data: local, variant } : null);
    syncOfflineSkin(acc.id); // y en los servidores con Kopi Skins
    return view;
  }
  if (dataUrl) await skins.uploadSkin(acc.accessToken, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'), variant);
  else if (url) await skins.setSkinFromUrl(acc.accessToken, url, variant);
  else {
    // Solo cambiar el modelo (clásico/slim) de la skin actual
    await skins.setSkinFromUrl(acc.accessToken, acc.skin, variant);
  }
  return accounts.refreshProfile(acc.id);
});
handle('skins:setCape', async (capeId) => {
  const acc = await accounts.ensureFresh();
  if (acc.type !== 'msa') throw new Error('Las capas necesitan una cuenta de Microsoft');
  await skins.setCape(acc.accessToken, capeId);
  return accounts.refreshProfile(acc.id);
});
// Capas de Kopi (regaladas desde el panel): cuáles tiene la cuenta activa y cuál lleva puesta
handle('capes:kopi', async () => {
  const acc = panelAccount();
  if (!acc || !panel.enabled()) return { owned: [], worn: null };
  return panel.kopiCapes(acc);
});
handle('capes:kopiWear', async (id) => {
  const acc = panelAccount();
  if (!acc) throw new Error('Inicia sesión para continuar');
  return panel.wearKopiCape(acc, accounts.skinKeyOf(acc.id), id);
});
// Perfil: la tarjeta como imagen (se guarda en Imágenes/Kopi Client y, si se pide, se copia)
handle('profile:card', async (rect, copy) => {
  const img = await win.webContents.capturePage({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
  if (copy) { clipboard.writeImage(img); return null; }
  const dir = path.join(app.getPath('pictures'), 'Kopi Client');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `perfil-${Date.now()}.png`);
  fs.writeFileSync(file, img.toPNG());
  shell.showItemInFolder(file);
  return file;
});
handle('skins:screenshot', async (rect) => {
  const img = await win.webContents.capturePage(rect ? {
    x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)
  } : undefined);
  const dir = path.join(app.getPath('pictures'), 'Kopi Client');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `skin-${Date.now()}.png`);
  fs.writeFileSync(file, img.toPNG());
  shell.showItemInFolder(file);
  return file;
});

// ---------- datos (repo de GitHub) ----------
handle('data:get', async (name) => {
  if (!/^[a-z0-9_-]+\.json$/i.test(name)) throw new Error('Nombre no válido');
  if (name === 'notifications.json') return notifications();
  return data.getJson(name, { fallback: null });
});

// Avisos de la campana: los del panel (de Kopi y de los studios de tus instancias) + los de onyx-data
async function notifications() {
  const base = await data.getJson('notifications.json', { fallback: [] }).catch(() => []);
  const list = Array.isArray(base) ? base : (base && base.items) || [];
  if (!panel.enabled()) return list;
  const studios = [...new Set(instances.list().map(i => i.studio && i.studio.id).filter(Boolean))];
  const r = await panel.publicGet('notices' + (studios.length ? '?studios=' + encodeURIComponent(studios.join(',')) : ''));
  const fromPanel = r && Array.isArray(r.notices) ? r.notices : [];
  return [...fromPanel, ...list];
}
handle('data:terms', async (lang) => {
  const local = (l) => { try { return fs.readFileSync(path.join(__dirname, '..', 'renderer', 'terms', `${l}.md`), 'utf8'); } catch { return null; } };
  const remote = await data.getText(`terms/${lang}.md`, '') || await data.getText('terms/es.md', '');
  return remote || local(lang) || local('es') || '';
});

// ---------- instancias ----------
handle('instances:list', () => { kickPanelSync(); return instances.list(); });
handle('instances:sync', () => { kickPanelSync(true); return true; });
handle('instances:get', (id) => instances.get(id));
handle('instances:redeem', (code) => instances.redeem(code, panelAccount()));
handle('instances:remove', (id, del) => instances.remove(id, del));
handle('instances:setMemory', (id, mb) => instances.setMemory(id, mb));
handle('instances:setPerfMode', (id, on) => instances.setPerfMode(id, on));
handle('instances:stop', (id) => instances.stop(id));
handle('instances:status', (id) => instances.serverStatus(id));
handle('instances:wipe', (id) => instances.wipe(id));
handle('instances:update', (id) => instances.update(id, {
  settings: settingsStore.get(),
  account: panelAccount(),
  progress: (p) => send('instances:progress', { id, ...p, updating: true })
}).finally(() => send('instances:progress', { id, stage: 'exited', updating: true })));
handle('instances:importPack', async (id) => {
  const r = await dialog.showOpenDialog(win, { title: 'Instalar desde .onyxpack', filters: [{ name: 'Kopi Pack', extensions: ['onyxpack', 'zip'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return instances.importPack(id, r.filePaths[0]);
});
handle('instances:play', async (id) => {
  const settings = settingsStore.get();
  const account = await accounts.ensureFresh();
  syncOfflineSkin(account.id); // la skin no premium, lista para los servidores con Kopi Skins
  gameLogBuffer = [];
  lastPlayed = id;
  presence.launching(instances.get(id));
  let v;
  try {
    v = await instances.play(id, {
      account, settings, launcherVersion: app.getVersion(),
      progress: (p) => send('instances:progress', { id, ...p }),
      onLog: (text) => {
        gameLogBuffer.push(text);
        if (gameLogBuffer.length > 2000) gameLogBuffer.splice(0, gameLogBuffer.length - 2000);
        send('game:log', text);
      },
      onStart: () => {
        send('instances:progress', { id, stage: 'running' });
        presence.playing(instances.get(id));
        const after = settings.afterLaunch;
        if (after === 'minimize') win.minimize();
        else if (after === 'hide') win.hide();
        else if (after === 'close') setTimeout(() => app.quit(), 1500);
      },
      onExit: (code, info) => {
        send('instances:progress', { id, stage: 'exited', code, kicked: !!(info && info.kicked) });
        presence.stopped();
        if (win && !win.isVisible()) win.show();
        log.info(`Instancia ${id} cerrada con código ${code}`);
      }
    });
  } catch (e) {
    presence.stopped();
    throw e;
  }
  return v;
});
handle('game:log', () => gameLogBuffer.join(''));

// ---------- galería ----------
handle('gallery:list', () => instances.screenshots().map(s => ({ ...s, url: 'file://' + s.path.replace(/\\/g, '/') })));
handle('gallery:delete', (p) => {
  const shots = instances.screenshots().map(s => s.path);
  if (!shots.includes(p)) throw new Error('Archivo no permitido');
  fs.unlinkSync(p);
  return true;
});
handle('gallery:open', (p) => shell.openPath(p));

// ---------- referidos ----------
handle('referrals:ranking', (period) => referrals.ranking(period));
handle('referrals:link', async (code) => {
  if (settingsStore.get().referral) throw new Error('Ya apoyas a un estudio');
  const acc = panelAccount();
  const r = await referrals.link(code, acc);
  settingsStore.set({ referral: r });
  return r;
});

// ---------- informes ----------
handle('report:send', async (message) => {
  let screenshot = null;
  // JPEG: pesa mucho menos que PNG y cabe de sobra en Discord
  try { screenshot = (await win.webContents.capturePage()).toJPEG(85); } catch { /* nada */ }
  const acc = accounts.active();
  const playing = lastPlayed ? (instances.get(lastPlayed) || {}).name : null;
  const status = report.statusInfo(app, acc, instances.list().length, playing);
  const pacc = panel.enabled() ? panelAccount() : null;
  const toPanel = pacc ? (data) => panel.sendReport(pacc, data) : null;
  return report.send({ message, screenshot, status, gameLog: gameLogBuffer.join('').slice(-20000), toPanel }, path.join(userData, 'reports'))
    .then((r) => { if (!r.sent && r.dir) shell.openPath(r.dir); return r; });
});

// Icono de la app para notificaciones (si existe)
try { nativeImage.createFromPath(path.join(__dirname, '..', 'renderer', 'assets', 'icon.png')); } catch { /* nada */ }
