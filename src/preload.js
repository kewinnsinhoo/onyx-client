// Puente seguro entre la interfaz y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) { const e = new Error(r.error); e.code = r.code; e.vars = r.vars; e.removed = r.removed; throw e; }
  return r.data;
}
function on(channel, cb) {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

contextBridge.exposeInMainWorld('onyx', {
  platform: process.platform,
  win: {
    minimize: () => call('win:minimize'),
    maximize: () => call('win:maximize'),
    close: () => call('win:close'),
    onState: (cb) => on('window:state', cb)
  },
  app: {
    info: () => call('app:info'),
    quit: () => call('app:quit'),
    openExternal: (url) => call('app:openExternal', url),
    openPath: (kind) => call('app:openPath', kind),
    showItem: (p) => call('app:showItem', p),
    relaunch: () => call('app:relaunch'),
    clearCache: () => call('app:clearCache')
  },
  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', patch)
  },
  updater: {
    check: () => call('updater:check'),
    install: () => call('updater:install'),
    page: () => call('updater:page'),
    onEvent: (cb) => on('updater:event', cb)
  },
  accounts: {
    list: () => call('accounts:list'),
    loginMicrosoft: (mode) => call('accounts:loginMicrosoft', mode),
    cancelLogin: () => call('accounts:cancelLogin'),
    reopenLogin: () => call('accounts:reopenLogin'),
    addOffline: (name) => call('accounts:addOffline', name),
    setActive: (id) => call('accounts:setActive', id),
    remove: (id) => call('accounts:remove', id),
    refresh: (id) => call('accounts:refresh', id)
  },
  discord: {
    link: () => call('discord:link'),
    unlink: () => call('discord:unlink'),
    presence: (section, id) => call('discord:presence', section, id)
  },
  skins: {
    library: () => call('skins:library'),
    libraryAdd: (e) => call('skins:libraryAdd', e),
    libraryRemove: (id) => call('skins:libraryRemove', id),
    lookup: (name) => call('skins:lookup', name),
    dataUrl: (url) => call('skins:dataUrl', url),
    pickFile: () => call('skins:pickFile'),
    validate: (d) => call('skins:validate', d),
    apply: (opts) => call('skins:apply', opts),
    setCape: (id) => call('skins:setCape', id),
    screenshot: (rect) => call('skins:screenshot', rect)
  },
  profile: {
    card: (rect, copy) => call('profile:card', rect, copy),
    getPublic: () => call('profile:public'),
    setPublic: (on) => call('profile:setPublic', on)
  },
  badges: {
    list: () => call('badges:list'),
    showcase: (ids) => call('badges:showcase', ids)
  },
  streams: {
    channels: () => call('streams:channels'),
    save: (ch) => call('streams:save', ch),
    markLive: (platform, on) => call('streams:markLive', platform, on),
    live: (id) => call('streams:live', id)
  },
  capes: {
    kopi: () => call('capes:kopi'),
    kopiWear: (id) => call('capes:kopiWear', id)
  },
  looks: {
    get: () => call('looks:get'),
    wear: (look) => call('looks:wear', look)
  },
  data: {
    get: (name) => call('data:get', name),
    terms: (lang) => call('data:terms', lang)
  },
  instances: {
    list: () => call('instances:list'),
    get: (id) => call('instances:get', id),
    redeem: (code) => call('instances:redeem', code),
    remove: (id, del) => call('instances:remove', id, del),
    setMemory: (id, mb) => call('instances:setMemory', id, mb),
    seenNews: (id) => call('instances:seenNews', id),
    onBackground: (cb) => on('instances:bg', cb),
    setPerfMode: (id, on) => call('instances:setPerfMode', id, on),
    setFriendsMode: (id, on) => call('instances:setFriendsMode', id, on),
    onFriends: (cb) => on('instances:friends', cb),
    play: (id, opts) => call('instances:play', id, opts),
    stop: (id) => call('instances:stop', id),
    status: (id) => call('instances:status', id),
    wipe: (id) => call('instances:wipe', id),
    update: (id) => call('instances:update', id),
    importPack: (id) => call('instances:importPack', id),
    sync: () => call('instances:sync'),
    onProgress: (cb) => on('instances:progress', cb),
    onChanged: (cb) => on('instances:changed', cb)
  },
  crash: { fix: (id, f) => call('crash:fix', id, f) },
  game: {
    log: () => call('game:log'),
    onLog: (cb) => on('game:log', cb)
  },
  preport: {
    shots: (id) => call('preport:shots', id),
    online: (id) => call('preport:online', id),
    send: (r) => call('preport:send', r)
  },
  gallery: {
    list: () => call('gallery:list'),
    remove: (p) => call('gallery:delete', p),
    open: (p) => call('gallery:open', p),
    copy: (p) => call('gallery:copy', p)
  },
  referrals: {
    ranking: (period) => call('referrals:ranking', period),
    link: (code) => call('referrals:link', code)
  },
  report: {
    send: (message) => call('report:send', message)
  }
});
